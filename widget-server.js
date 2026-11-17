const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AlertOverlay } = require('./alert-overlay');

function normalizeWidget(value = {}) {
  return {
    layout: [
      'classic',
      'cards',
      'compact',
      'bubbles',
      'neon',
      'terminal',
      'broadcast',
    ].includes(value.layout)
      ? value.layout
      : 'classic',
    fontSize: Math.min(72, Math.max(12, Number(value.fontSize) || 24)),
    html: String(value.html || '').slice(0, 20000),
    gap: Math.min(60, Math.max(0, Number(value.gap ?? 10) || 0)),
    radius: Math.min(80, Math.max(0, Number(value.radius ?? 14) || 0)),
    accent: /^#[a-f0-9]{6}$/i.test(value.accent || '')
      ? value.accent
      : '#a78bfa',
    css: String(value.css || '').slice(0, 50000),
  };
}
class WidgetServer {
  constructor() {
    this.alertOverlay = new AlertOverlay();
    this.alertAudio = new AlertOverlay(true);
    this.clients = new Set();
    this.messages = [];
    this.emotes = {};
    this.token = crypto.randomBytes(24).toString('hex');
    this.config = {
      widget: normalizeWidget(),
      timing: { enabled: true, seconds: 120, fadeSeconds: 2 },
    };
  }
  async start(port = 19347, token) {
    if (/^[a-f0-9]{48}$/.test(token || '')) this.token = token;
    this.server = http.createServer((req, res) => this.request(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', resolve);
    }).catch(async (error) => {
      if (error.code !== 'EADDRINUSE' || !port) throw error;
      await new Promise((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(0, '127.0.0.1', resolve);
      });
    });
    this.url = `http://127.0.0.1:${this.server.address().port}/${this.token}/widget.html`;
    this.heartbeat = setInterval(() => {
      this.broadcast('heartbeat', Date.now());
      this.alertOverlay.heartbeat();
      this.alertAudio.heartbeat();
    }, 20000);
    this.heartbeat.unref();
    return this.url;
  }
  request(req, res) {
    const route = req.url?.split('?')[0];
    const prefix = `/${this.token}/`;
    const overlay = route?.startsWith(prefix + 'alerts/') ? this.alertOverlay :
      route?.startsWith(prefix + 'alert-audio/') ? this.alertAudio : null;
    if (overlay) {
      overlay.request(req, res, route.slice(route.indexOf('/', prefix.length) + 1)).catch(() => {
        if (res.destroyed) return;
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }
    if (route?.startsWith(prefix + 'sr/') && this.srRoute) {
      Promise.resolve(
        this.srRoute(req, res, route.slice((prefix + 'sr/').length)),
      ).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }
    if (req.method !== 'GET' || !route?.startsWith(prefix)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const file = route.slice(prefix.length);
    if (file === 'viewers-data') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          this.getViewers?.() || {
            rows: [],
            total: null,
            partial: true,
            enabled: false,
          },
        ),
      );
      return;
    }
    if (file === 'events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      });
      this.clients.add(res);
      this.send(res, 'snapshot', {
        config: this.config,
        messages: this.snapshot(),
        emotes: this.emotes,
      });
      req.on('close', () => this.clients.delete(res));
      return;
    }
    const types = {
      'viewers-widget.html': 'text/html',
      'viewers-widget.js': 'text/javascript',
      'viewers-render.js': 'text/javascript',
      'viewers.css': 'text/css',
      'assets/counters/twitch.svg': 'image/svg+xml',
      'assets/counters/kick.svg': 'image/svg+xml',
      'assets/counters/starvios.png': 'image/png',
      'widget.html': 'text/html',
      'widget.css': 'text/css',
      'widget.js': 'text/javascript',
      'layout-template.js': 'text/javascript',
    };
    if (!types[file]) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'self' file:; object-src 'none'; base-uri 'none'",
    );
    res.setHeader('Content-Type', types[file] + '; charset=utf-8');
    res.end(fs.readFileSync(path.join(__dirname, file)));
  }
  snapshot() {
    const t = this.config.timing;
    this.messages = this.messages.filter(
      (m) =>
        !t.enabled ||
        Date.now() - m.widgetTime < (t.seconds + t.fadeSeconds) * 1000,
    );
    return this.messages;
  }
  send(client, type, data) {
    client.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  }
  broadcast(type, data) {
    for (const client of this.clients) {
      if (client.writableLength > 1048576) {
        client.destroy();
        this.clients.delete(client);
      } else this.send(client, type, data);
    }
  }
  update(settings) {
    this.snapshot();
    this.config = {
      widget: normalizeWidget(settings.widget),
      timing: settings.timing,
      appearance: settings.appearance,
    };
    this.broadcast('config', this.config);
  }
  prune(predicate) {
    this.messages = this.messages.filter(predicate);
    this.broadcast('reset', this.snapshot());
  }
  event(type, data) {
    if (type === 'message') {
      if (
        data.id &&
        this.messages.some(
          (m) => m.platform === data.platform && m.id === data.id,
        )
      )
        return;
      data = { ...data, widgetTime: Date.now() };
      this.messages.push(data);
      this.messages = this.messages.slice(-300);
    } else if (type === 'emotes') this.emotes[data.platform] = data.items;
    else if (type === 'remove')
      this.messages = this.messages.filter(
        (m) => m.platform !== data.platform || m.id !== data.id,
      );
    else if (type === 'settings' && data.clear) {
      this.messages = [];
      this.broadcast('reset', []);
      return;
    } else return;
    this.broadcast(type, data);
  }
  close() {
    clearInterval(this.heartbeat);
    this.alertOverlay.close();
    this.alertAudio.close();
    for (const client of this.clients) client.end();
    this.server?.close();
  }
}
module.exports = { WidgetServer, normalizeWidget };
