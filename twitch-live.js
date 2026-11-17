const WebSocket = require('ws');

const ID = 'https://id.twitch.tv/oauth2';
const HELIX = 'https://api.twitch.tv/helix';
const EVENTSUB = 'wss://eventsub.wss.twitch.tv/ws';
const SCOPES = ['user:read:chat', 'user:write:chat', 'channel:read:redemptions'];
const CREATE_SCOPE = 'channel:manage:redemptions';

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(Error(data.message || `Twitch HTTP ${response.status}`), { status: response.status });
  }
  return data;
}

function post(endpoint, fields) {
  return request(ID + endpoint, { method: 'POST', body: new URLSearchParams(fields) });
}

class Twitch {
  constructor({ store, update, chat, redemption }) {
    Object.assign(this, { store, update, chat, redemption });
    this.status = 'Desconectada';
    this.chatReady = false;
    this.generation = 0;
    this.seen = new Set();
    this.sockets = new Set();
  }

  snapshot() {
    return { account: this.user?.login || '', client: this.credentials?.client || '',
      status: this.status, code: this.pending?.user_code || '' };
  }

  report(status) {
    this.status = status;
    this.update(this.snapshot());
  }

  async begin(client, open) {
    if (!/^[a-z0-9]{15,64}$/i.test(client)) throw Error('Informe o Client ID do aplicativo público da Twitch.');
    if (this.credentials) throw Error('Desconecte a conta atual antes de conectar outra.');
    this.stop();
    const generation = this.generation;
    const scopes = [...SCOPES, CREATE_SCOPE].join(' ');
    const pending = await post('/device', { client_id: client, scopes });
    if (generation !== this.generation) return;
    const url = new URL(pending.verification_uri);
    if (url.origin !== 'https://www.twitch.tv' && url.origin !== 'https://twitch.tv') throw Error('Endereço de autorização inesperado.');
    this.pending = pending;
    this.report('Aguardando autorização na Twitch');
    const deadline = Date.now() + pending.expires_in * 1000;
    let interval = Math.max(5, pending.interval || 5);
    const poll = async () => {
      if (generation !== this.generation) return;
      if (Date.now() >= deadline) {
        this.pending = null;
        return this.report('Autorização expirada. Conecte novamente.');
      }
      try {
        const tokens = await post('/token', {
          client_id: client, scope: scopes, device_code: pending.device_code,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });
        if (generation !== this.generation) return;
        this.persist(client, tokens);
        this.pending = null;
        await this.resume();
      } catch (error) {
        if (generation !== this.generation) return;
        if (error.message === 'slow_down') interval += 5;
        if (['slow_down', 'authorization_pending'].includes(error.message) || !error.status || error.status >= 500) {
          this.poll = setTimeout(poll, interval * 1000);
          return;
        }
        this.pending = null;
        this.report(error.message);
      }
    };
    this.poll = setTimeout(poll, interval * 1000);
    await open(url.href);
  }

  persist(client, tokens) {
    const credentials = { client, access: tokens.access_token, refresh: tokens.refresh_token,
      expires: Date.now() + tokens.expires_in * 1000 };
    this.store.save(credentials);
    this.credentials = credentials;
  }

  async refresh() {
    if (!this.credentials?.refresh) throw Error('Conecte sua conta Twitch.');
    if (!this.refreshing) {
      const current = this.credentials;
      this.refreshing = post('/token', { client_id: current.client, grant_type: 'refresh_token',
        refresh_token: current.refresh }).then((tokens) => {
        if (this.credentials !== current) throw Error('A conta Twitch foi alterada.');
        this.persist(current.client, tokens);
      }).finally(() => { this.refreshing = null; });
    }
    await this.refreshing;
  }

  async authorized(url, options = {}, validation = false) {
    if (!this.credentials) throw Error('Conecte sua conta Twitch.');
    if (this.credentials.expires < Date.now() + 60000) await this.refresh();
    const send = () => request(url, { ...options, headers: {
      'Client-Id': this.credentials.client,
      Authorization: `${validation ? 'OAuth' : 'Bearer'} ${this.credentials.access}`,
      'Content-Type': 'application/json',
    } });
    const token = this.credentials.access;
    try {
      return await send();
    } catch (error) {
      if (error.status !== 401 || !this.credentials) throw error;
      if (token === this.credentials.access) await this.refresh();
      return send();
    }
  }

  async validate() {
    const user = await this.authorized(ID + '/validate', {}, true);
    if (!SCOPES.every((scope) => user.scopes?.includes(scope))) throw Error('Autorize todas as permissões solicitadas.');
    return user;
  }

  async resume() {
    const generation = this.generation;
    try {
      this.credentials ||= this.store.load();
      if (!this.credentials.access) {
        this.credentials = null;
        return;
      }
      const user = await this.validate();
      if (generation !== this.generation) return;
      this.user = user;
      this.report('Conectando ao chat e aos resgates…');
      this.connect();
      this.validation = setInterval(async () => {
        try {
          await this.validate();
        } catch (error) {
          if (generation === this.generation && [400, 401, 403].includes(error.status)) this.disconnect();
        }
      }, 3600000);
    } catch (error) {
      if (generation !== this.generation) return;
      this.report(`Falha na sessão Twitch. ${error.message}`);
    }
  }

  async rewards() {
    if (!this.user) throw Error('Conecte a conta do canal na Twitch.');
    return (await this.authorized(HELIX + '/channel_points/custom_rewards?' + new URLSearchParams({
      broadcaster_id: this.user.user_id,
    }))).data;
  }

  async createReward(title, cost, prompt) {
    if (!this.user) throw Error('Conecte a Twitch.');
    if (!this.user.scopes?.includes(CREATE_SCOPE)) throw Error('Reconecte a Twitch para autorizar a criação de recompensas.');
    const query = new URLSearchParams({ broadcaster_id: this.user.user_id });
    const result = await this.authorized(HELIX + '/channel_points/custom_rewards?' + query, {
      method: 'POST', body: JSON.stringify({ title, cost, prompt }),
    });
    return result.data?.[0];
  }

  async isLive() {
    if (!this.user) return false;
    const response = await this.authorized(HELIX + '/streams?' + new URLSearchParams({ user_id: this.user.user_id }));
    return Boolean(response.data?.length);
  }

  async send(message) {
    if (!this.user) throw Error('Conecte sua conta Twitch.');
    message = String(message || '').trim();
    if (!message || message.length > 500) throw Error('Digite uma mensagem de até 500 caracteres.');
    const result = await this.authorized(HELIX + '/chat/messages', {
      method: 'POST', body: JSON.stringify({
        broadcaster_id: this.user.user_id, sender_id: this.user.user_id, message,
      }),
    });
    if (!result.data?.[0]?.is_sent) throw Error(result.data?.[0]?.drop_reason?.message || 'A Twitch recusou a mensagem.');
  }

  connect(url = EVENTSUB, previous) {
    const generation = this.generation;
    const user = this.user;
    if (!user) return;
    this.retry = null;
    const socket = new WebSocket(url, { handshakeTimeout: 10000 });
    this.sockets.add(socket);
    let timer;
    let keepalive = 15000;
    let replacing = false;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => socket.terminate(), keepalive);
    };
    arm();
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer);
      this.sockets.delete(socket);
      if (generation !== this.generation || this.sockets.size) return;
      if (replacing && this.retry) return;
      this.chatReady = false;
      this.report('Twitch reconectando…');
      this.retry = setTimeout(() => this.connect(), 5000);
    });
    socket.on('message', async (raw) => {
      if (generation !== this.generation) return;
      arm();
      try {
        const { metadata, payload } = JSON.parse(raw);
        if (metadata.message_type === 'session_welcome') {
          keepalive = 1000 * (payload.session.keepalive_timeout_seconds || 15) + 2000;
          arm();
          if (previous) {
            previous.close();
            return this.report(this.readyStatus);
          }
          const condition = { broadcaster_user_id: user.user_id };
          const subscriptions = [
            ['channel.chat.message', { ...condition, user_id: user.user_id }],
            ['channel.channel_points_custom_reward_redemption.add', condition],
          ];
          const results = await Promise.allSettled(subscriptions.map(([type, condition]) =>
            this.authorized(HELIX + '/eventsub/subscriptions', {
              method: 'POST', body: JSON.stringify({ type, version: '1', condition,
                transport: { method: 'websocket', session_id: payload.session.id },
              }),
            }),
          ));
          if (generation !== this.generation || !this.sockets.has(socket)) return;
          const [chat, rewards] = results;
          this.chatReady = chat.status === 'fulfilled';
          this.readyStatus = [
            chat.status === 'fulfilled' ? 'Chat ativo' : 'Chat indisponível: ' + chat.reason.message,
            rewards.status === 'fulfilled' ? 'Resgates ativos' : 'Resgates indisponíveis: ' + rewards.reason.message,
          ].join(' · ');
          this.report(this.readyStatus);
          if (results.every((result) => result.status === 'rejected')) {
            replacing = true;
            this.retry = setTimeout(() => this.connect(), 30000);
            socket.close();
          }
        } else if (metadata.message_type === 'session_reconnect') {
          if (replacing) return;
          const next = new URL(payload.session.reconnect_url);
          if (next.origin !== new URL(EVENTSUB).origin) return;
          replacing = true;
          this.connect(next.href, socket);
        } else if (metadata.message_type === 'revocation') {
          if (payload.subscription.type === 'channel.chat.message') this.chatReady = false;
          this.report(`Assinatura Twitch revogada: ${payload.subscription.status}`);
        } else if (metadata.message_type === 'notification') {
          if (this.seen.has(metadata.message_id)) return;
          this.seen.add(metadata.message_id);
          if (this.seen.size > 2048) this.seen.delete(this.seen.values().next().value);
          if (metadata.subscription_type === 'channel.chat.message') this.chat(payload.event);
          if (metadata.subscription_type === 'channel.channel_points_custom_reward_redemption.add') this.redemption(payload.event);
        }
      } catch {
        this.report('Falha ao processar evento da Twitch.');
      }
    });
  }

  disconnect() {
    this.store.save({});
    this.stop();
    this.credentials = null;
    this.user = null;
    this.report('Desconectada');
  }

  stop() {
    this.generation++;
    this.chatReady = false;
    clearTimeout(this.retry);
    this.retry = null;
    clearTimeout(this.poll);
    clearInterval(this.validation);
    this.pending = null;
    for (const socket of this.sockets) socket.terminate();
    this.sockets.clear();
  }
}

module.exports = { Twitch };
