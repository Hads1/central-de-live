const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const FORMATS = {
  audio: { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac' },
  video: { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' },
  image: { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' },
};

function extension(file) {
  return path.extname(file).slice(1).toLowerCase();
}

function mediaKind(file) {
  return Object.keys(FORMATS).find((type) => Object.hasOwn(FORMATS[type], extension(file)));
}

const ASSETS = {
  'index.html': ['alert-overlay.html', 'text/html'],
  'overlay.js': ['alert-overlay-ui.js', 'text/javascript'],
  'overlay.css': ['alert-overlay.css', 'text/css'],
};

class AlertOverlay {
  constructor(audioOnly = false) {
    this.clients = new Set();
    this.audioOnly = audioOnly;
  }

  show(id, clip) {
    if (this.active) this.hide(this.active.id);
    clearTimeout(this.expiry);
    const duration = Math.min(126, clip.duration + (clip.type === 'audio' ? 6 : 0)) * 1000;
    this.active = { id, clip, endsAt: Date.now() + duration };
    this.expiry = setTimeout(() => this.hide(id), duration);
    this.publish();
  }

  hide(id) {
    if (!this.active || this.active.id !== id) return;
    clearTimeout(this.expiry);
    this.active.resolve?.();
    this.active = null;
    this.publish();
  }

  play(id, clip) {
    if (!this.clients.size) throw Error('A fonte de áudio dos alertas está desconectada no OBS.');
    return new Promise((resolve, reject) => {
      this.show(id, { ...clip, type: mediaKind(clip.file) });
      Object.assign(this.active, { resolve, reject });
    });
  }

  send(res) {
    const active = this.active;
    const event = active ? { id: active.id, type: active.clip.type, title: active.clip.title,
      endsAt: active.endsAt, volume: active.clip.volume } : null;
    res.write('data: ' + JSON.stringify(event) + '\n\n');
  }

  publish() {
    for (const res of this.clients) {
      if (res.writableLength > 65536) res.destroy();
      else this.send(res);
    }
  }

  heartbeat() {
    for (const res of this.clients) {
      if (res.writableLength > 65536) res.destroy();
      else res.write(': heartbeat\n\n');
    }
  }

  async request(req, res, route) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (this.audioOnly && req.method === 'POST' && route.startsWith('finish/')) {
      if (req.headers.origin !== 'http://' + req.headers.host) return res.writeHead(403).end();
      const [, id, outcome] = route.split('/');
      if (this.active?.id === id) {
        if (outcome === 'error') this.active.reject(Error('O OBS não conseguiu reproduzir o áudio do alerta.'));
        this.hide(id);
      }
      return res.writeHead(204).end();
    }
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    if (route === 'events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      this.clients.add(res);
      res.once('close', () => this.clients.delete(res));
      this.send(res);
      return;
    }
    if (Object.hasOwn(ASSETS, route)) {
      const [file, mime] = ASSETS[route];
      res.setHeader('Content-Type', mime + '; charset=utf-8');
      res.setHeader('Content-Security-Policy',
        "default-src 'self'; connect-src 'self'; media-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'");
      return res.end(await fs.promises.readFile(path.join(__dirname, file)));
    }

    const active = this.active;
    if (!active || route !== 'media/' + active.id || (!this.audioOnly && active.clip.type === 'audio')) return res.writeHead(404).end();
    const { file, type } = active.clip;
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', FORMATS[type][extension(file)]);
    res.setHeader('Accept-Ranges', 'bytes');
    const size = stat.size;
    let start = 0;
    let end = size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (match?.[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      } else if (Number(match?.[2]) > 0) {
        start = Math.max(0, size - Number(match[2]));
      } else start = size;
      if (start >= size || start > end) {
        return res.writeHead(416, { 'Content-Range': 'bytes */' + size }).end();
      }
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.writeHead(req.headers.range ? 206 : 200, { 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD' || size === 0) return res.end();
    await pipeline(fs.createReadStream(file, { start, end }), res);
  }

  close() {
    if (this.active) this.hide(this.active.id);
    clearTimeout(this.expiry);
    for (const res of this.clients) res.end();
  }
}

module.exports = { AlertOverlay, FORMATS, mediaKind };
