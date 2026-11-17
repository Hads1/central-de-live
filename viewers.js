const { channel } = require('./protocol');
const { discover } = require('./starvios');
const PLATFORMS = ['twitch', 'kick', 'youtube', 'starvios', 'custom'];
function safeURL(value, local = false) {
  if (!value) return '';
  const u = new URL(String(value));
  if (
    u.username ||
    u.password ||
    !(
      u.protocol === 'https:' ||
      (local &&
        u.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
    )
  )
    throw Error('Use HTTPS ou uma API HTTP local.');
  return u.href;
}
function normalizeViewers(v = {}) {
  const sources = {};
  for (const p of PLATFORMS) {
    const s = v.sources?.[p] || {};
    sources[p] = {
      enabled: s.enabled !== false,
      logo: safeURL(s.logo),
      clientId: String(s.clientId || '')
        .trim()
        .slice(0, 200),
    };
  }
  sources.custom.apiUrl = safeURL(v.sources?.custom?.apiUrl, true);
  sources.custom.countPath = String(
    v.sources?.custom?.countPath || 'viewers',
  ).slice(0, 100);
  sources.custom.livePath = String(v.sources?.custom?.livePath || 'live').slice(
    0,
    100,
  );
  return {
    enabled: v.enabled === true,
    showTotal: v.showTotal !== false,
    showChat: v.showChat !== false,
    showOverlay: v.showOverlay !== false,
    interval: Math.min(300, Math.max(30, Number(v.interval) || 30)),
    fontSize: Math.min(48, Math.max(12, Number(v.fontSize) || 18)),
    position: v.position === 'bottom' ? 'bottom' : 'top',
    color: /^#[a-f\d]{6}$/i.test(v.color || '') ? v.color : '#ffffff',
    sources,
  };
}
function count(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw Error('Contagem não disponível na resposta da plataforma.');
  return value;
}
function field(obj, path) {
  return path
    .split('.')
    .reduce(
      (o, k) =>
        o &&
        Object.hasOwn(o, k) &&
        !['__proto__', 'constructor', 'prototype'].includes(k)
          ? o[k]
          : undefined,
      obj,
    );
}
function totals(rows) {
  const known = rows.filter(
    (r) =>
      ['live', 'offline'].includes(r.state) && Number.isSafeInteger(r.count),
  );
  return {
    total: known.length ? known.reduce((n, r) => n + r.count, 0) : null,
    partial: known.length !== rows.length,
    known: known.length,
  };
}
class ViewerMonitor {
  constructor({
    emit = () => {},
    secrets = {},
    request = fetch,
    now = Date.now,
    sessionFor = () => null,
  } = {}) {
    Object.assign(this, { emit, secrets, request, now, sessionFor });
    this.tokens = {};
    this.rows = [];
    this.generation = 0;
  }
  configure(settings) {
    this.stop();
    this.settings = settings;
    this.options = normalizeViewers(settings.viewers);
    this.rows = PLATFORMS.filter((p) => this.options.sources[p].enabled &&
      (this.sessionFor(p)?.channel || (settings[p]?.enabled && settings[p]?.channel))).map((p) => ({
      platform: p,
      name:
        p === 'custom'
          ? settings.custom.name || 'Personalizado'
          : p === 'twitch'
            ? 'Twitch'
            : p === 'kick'
              ? 'Kick'
              : p === 'youtube' ? 'YouTube' : 'Starvios',
      channel: this.sessionFor(p)?.channel || settings[p].channel,
      logo: this.options.sources[p].logo,
      count: null,
      state: this.options.enabled ? 'loading' : 'disabled',
      updatedAt: 0,
      error: '',
    }));
    this.publish();
    if (this.options.enabled) void this.poll(this.generation);
  }
  snapshot() {
    const o = this.options || normalizeViewers();
    const rows = this.rows.map((r) =>
      ['live', 'offline'].includes(r.state) &&
      this.now() - r.updatedAt > o.interval * 2000 + 30000
        ? {
            ...r,
            state: 'unavailable',
            count: null,
            error: 'Contagem desatualizada.',
          }
        : { ...r },
    );
    return {
      rows,
      ...totals(rows),
      enabled: o.enabled,
      showTotal: o.showTotal,
      showChat: o.showChat,
      showOverlay: o.showOverlay,
      fontSize: o.fontSize,
      color: o.color,
      position: o.position,
      updatedAt: this.now(),
    };
  }
  publish() {
    this.emit(this.snapshot());
  }
  async json(url, options = {}, signal) {
    const r = await this.request(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.any([
        AbortSignal.timeout(12000),
        ...(signal ? [signal] : []),
      ]),
      headers: { Accept: 'application/json', ...options.headers },
    });
    if (!r.ok)
      throw Object.assign(
        Error(
          r.status === 401 || r.status === 403
            ? 'Autenticação recusada. Confira as credenciais do contador.'
            : r.status === 429
              ? 'Limite de consultas; aguardando próxima atualização.'
              : `Contador indisponível (HTTP ${r.status}).`,
        ),
        {
          status: r.status,
          retryAfter:
            r.status === 429
              ? Math.max(30, Number(r.headers?.get('retry-after')) || 60)
              : 0,
        },
      );
    return r.json();
  }
  async token(p, signal) {
    const cfg = this.options.sources[p],
      secret = this.secrets[p];
    if (!cfg.clientId || !secret)
      throw Error('Configure Client ID e Client Secret do contador.');
    const old = this.tokens[p];
    if (
      old &&
      old.id === cfg.clientId &&
      old.secret === secret &&
      old.until > this.now()
    )
      return old.value;
    const url =
      p === 'twitch'
        ? 'https://id.twitch.tv/oauth2/token'
        : 'https://id.kick.com/oauth/token';
    const d = await this.json(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: cfg.clientId,
          client_secret: secret,
        }).toString(),
      },
      signal,
    );
    if (!d.access_token) throw Error('A plataforma não forneceu um token.');
    this.tokens[p] = {
      id: cfg.clientId,
      secret,
      value: d.access_token,
      until:
        this.now() + Math.max(0, (Number(d.expires_in) || 3600) - 60) * 1000,
    };
    return d.access_token;
  }
  async read(row, signal, retried = false) {
    const p = row.platform;
    const session = this.sessionFor(p);
    if (session) {
      const result = await session.read();
      return { state: result.state, count: count(result.count) };
    }
    const name = p === 'custom' ? row.channel : channel(row.channel);
    if (p === 'twitch' || p === 'kick') {
      const token = await this.token(p, signal);
      const headers = { Authorization: 'Bearer ' + token };
      if (p === 'twitch')
        headers['Client-Id'] = this.options.sources[p].clientId;
      try {
        const d = await this.json(
          p === 'twitch'
            ? 'https://api.twitch.tv/helix/streams?user_login=' +
                encodeURIComponent(name)
            : 'https://api.kick.com/public/v1/channels?slug=' +
                encodeURIComponent(name),
          { headers },
          signal,
        );
        if (!Array.isArray(d.data))
          throw Error('Resposta inesperada da plataforma.');
        const item = d.data[0];
        if (p === 'twitch') {
          this.twitchUsers ||= new Map();
          if (item) {
            this.twitchUsers.set(name, this.now());
            return { state: 'live', count: count(item.viewer_count) };
          }
          if (
            !this.twitchUsers.has(name) ||
            this.now() - this.twitchUsers.get(name) > 3600000
          ) {
            const users = await this.json(
              'https://api.twitch.tv/helix/users?login=' +
                encodeURIComponent(name),
              { headers },
              signal,
            );
            if (!users.data?.length)
              throw Error('Canal Twitch não encontrado.');
            this.twitchUsers.set(name, this.now());
          }
          return { state: 'offline', count: 0 };
        }
        if (!item) throw Error('Canal Kick não encontrado.');
        if (item.stream?.is_live === false)
          return { state: 'offline', count: 0 };
        if (item.stream?.is_live !== true)
          throw Error('Estado da transmissão não disponível.');
        return { state: 'live', count: count(item.stream.viewer_count) };
      } catch (e) {
        if (e.status === 401) {
          delete this.tokens[p];
          if (!retried && !signal?.aborted) return this.read(row, signal, true);
        }
        throw e;
      }
    }
    if (p === 'starvios') {
      this.starvios ||= await discover();
      const { url, key } = this.starvios,
        headers = { apikey: key };
      const profiles = await this.json(
        url +
          '/rest/v1/profiles?select=id&username=eq.' +
          encodeURIComponent(name),
        { headers },
        signal,
      );
      if (!profiles[0]?.id) throw Error('Canal Starvios não encontrado.');
      const streams = await this.json(
        url +
          '/rest/v1/live_streams?select=id,status&channel_id=eq.' +
          profiles[0].id +
          '&status=eq.live&limit=1',
        { headers },
        signal,
      );
      if (!streams.length) return { state: 'offline', count: 0 };
      const d = await this.json(
        url + '/rest/v1/rpc/live_viewer_counts',
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ _stream_ids: [streams[0].id] }),
        },
        signal,
      );
      return {
        state: 'live',
        count: count(d.find((r) => r.stream_id === streams[0].id)?.viewers),
      };
    }
    const c = this.options.sources.custom;
    if (!c.apiUrl)
      throw Error('Configure a API JSON de espectadores desta plataforma.');
    const d = await this.json(c.apiUrl, {}, signal),
      live = field(d, c.livePath);
    if (live === false) return { state: 'offline', count: 0 };
    if (live !== true)
      throw Error('O campo de transmissão ao vivo precisa ser true ou false.');
    return { state: 'live', count: count(field(d, c.countPath)) };
  }
  async poll(generation) {
    const controller = new AbortController();
    this.controller = controller;
    await Promise.all(
      this.rows.map(async (row) => {
        if (row.retryAt > this.now()) return;
        let update;
        try {
          update = {
            ...(await this.read(row, controller.signal)),
            error: '',
            retryAt: 0,
            updatedAt: this.now(),
          };
        } catch (e) {
          update = {
            state: 'unavailable',
            count: null,
            retryAt: this.now() + (e.retryAfter || 0) * 1000,
            error:
              e.message?.startsWith('fetch') || e.name === 'TimeoutError'
                ? 'Sem resposta da plataforma.'
                : String(e.message || 'Contador indisponível').replace(
                    /https?:\/\/\S+/g,
                    '[endereço]',
                  ),
            updatedAt: this.now(),
          };
        }
        if (generation !== this.generation) return;
        Object.assign(row, update);
        this.publish();
      }),
    );
    if (generation === this.generation)
      this.timer = setTimeout(
        () => this.poll(generation),
        this.options.interval * 1000,
      );
  }
  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
  }
}
module.exports = { ViewerMonitor, normalizeViewers, totals, count };
