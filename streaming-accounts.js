const http = require('node:http');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');

const YOUTUBE = 'https://www.googleapis.com/youtube/v3/';
const KICK = 'https://api.kick.com/public/v1/';

async function json(url, options) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || data.error_description || data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.reason = data.error?.errors?.[0]?.reason || data.error;
    throw error;
  }
  return data;
}

const providers = {
  kick: {
    label: 'Kick',
    authorize: 'https://id.kick.com/oauth/authorize',
    token: 'https://id.kick.com/oauth/token',
    portal: 'https://kick.com/settings/developer',
    base: KICK,
    scopes: 'channel:read chat:write user:read channel:rewards:read channel:rewards:write',
    host: 'localhost',
    port: 19350,
    callback: '/central/kick',
    async identify(api) {
      const channel = (await api('channels')).data?.[0];
      if (!channel?.slug || !Number.isSafeInteger(channel.broadcaster_user_id)) throw Error('Canal da conta Kick não encontrado.');
      return { id: channel.broadcaster_user_id, name: channel.slug };
    },
    async send(api, account, text) {
      const result = await api('chat', { broadcaster_user_id: account.id, content: text, type: 'user' });
      if (!result.data?.is_sent) throw Error('A Kick recusou a mensagem.');
    },
  },
  youtube: {
    label: 'YouTube',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    portal: 'https://console.cloud.google.com/apis/credentials',
    base: YOUTUBE,
    scopes: 'https://www.googleapis.com/auth/youtube.force-ssl',
    host: '127.0.0.1',
    port: 0,
    callback: '/central/youtube',
    extra: { access_type: 'offline', prompt: 'consent' },
    async identify(api) {
      const channel = (await api('channels?part=snippet&mine=true')).items?.[0];
      if (!channel?.id) throw Error('A conta Google selecionada não tem um canal YouTube.');
      return { id: channel.id, name: channel.snippet.title };
    },
    async send(api, account, text, chatId) {
      if (!chatId) throw Error('Aguardando uma live ativa com chat no YouTube.');
      await api('liveChat/messages?part=snippet', { snippet: {
        liveChatId: chatId, type: 'textMessageEvent', textMessageDetails: { messageText: text },
      } });
    },
  },
};

class StreamingAccount {
  constructor({ provider, store, open, update, message }) {
    this.provider = providers[provider];
    Object.assign(this, { store, open, update, message });
    this.status = 'Desconectado';
    this.generation = 0;
    this.saved = {};
  }

  snapshot() {
    const config = this.saved.config || {};
    return { account: this.account?.name || '', configured: Boolean(config.client && config.secret),
      client: config.client || '', status: this.status, pending: Boolean(this.server), active: Boolean(this.chatId),
      signedIn: Boolean(this.saved.tokens?.access) };
  }

  report(status) {
    this.status = status;
    this.update(this.snapshot());
  }

  configure(client, secret) {
    client = String(client || '').trim();
    secret = String(secret || '').trim() || (client === this.saved.config?.client ? this.saved.config?.secret : '');
    if (!/^[\w.-]{8,200}$/.test(client) || !secret || !/^[\w.-]{8,200}$/.test(secret)) {
      throw Error('Informe o Client ID e o Client Secret do aplicativo.');
    }
    if (this.saved.tokens || this.server) throw Error('Desconecte a conta antes de alterar a configuração.');
    this.persist({ config: { client, secret } });
    this.report('Aplicativo configurado. Clique em Conectar.');
  }

  persist(saved) {
    this.store.save(saved);
    this.saved = saved;
  }

  async resume() {
    const generation = this.generation;
    try {
      this.saved = this.store.load();
      if (!this.saved.tokens) return this.report(this.saved.config ? 'Pronto para conectar' : 'Configure o aplicativo uma vez');
      await this.identify(generation);
    } catch (error) {
      if (generation === this.generation) this.report(error.message);
    }
  }

  async begin() {
    if (!this.snapshot().configured) throw Error('Configure o aplicativo uma vez antes de conectar.');
    if (this.saved.tokens) throw Error('Desconecte a sessão atual antes de vincular outra conta.');
    this.stop();
    const generation = this.generation;
    const { authorize, host, port, callback, scopes, extra } = this.provider;
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    let redirect;
    let consumed = false;
    const server = http.createServer(async (req, res) => {
      let address;
      try { address = new URL(req.url, 'http://localhost'); } catch {}
      if (req.method !== 'GET' || !redirect || req.headers.host !== new URL(redirect).host || address?.pathname !== callback) {
        res.writeHead(404).end();
        return;
      }
      const received = Buffer.from(address.searchParams.get('state') || '');
      const expected = Buffer.from(state);
      if (consumed || received.length !== expected.length || !timingSafeEqual(received, expected)) {
        res.writeHead(400).end('Autorização inválida.');
        return;
      }
      consumed = true;
      clearTimeout(this.timeout);
      try {
        const code = address.searchParams.get('code');
        if (!code) throw Error('A autorização foi cancelada na plataforma.');
        const tokens = await this.exchange({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect });
        if (generation !== this.generation) throw Error('Autorização cancelada na Central de Live.');
        this.saveTokens(tokens);
        await this.identify(generation);
        if (generation !== this.generation) throw Error('Autorização cancelada na Central de Live.');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Conta vinculada. Você pode fechar esta página e voltar à Central de Live.');
      } catch (error) {
        if (generation === this.generation) this.report(error.message);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('A vinculação não terminou. Veja o estado na Central de Live.');
      } finally {
        if (generation === this.generation) this.finishCallback();
      }
    });
    this.server = server;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      if (generation !== this.generation) return server.close();
      redirect = `http://${host}:${server.address().port}${callback}`;
      const url = authorize + '?' + new URLSearchParams({ response_type: 'code', client_id: this.saved.config.client,
        redirect_uri: redirect, scope: scopes, state, code_challenge: challenge, code_challenge_method: 'S256', ...extra });
      this.timeout = setTimeout(() => {
        this.stop();
        this.report('Autorização expirada. Clique em Conectar novamente.');
      }, 5 * 60000);
      this.report('Aguardando autorização no navegador');
      await this.open(url);
    } catch (error) {
      this.finishCallback();
      this.report('Falha ao iniciar a autorização');
      throw error;
    }
  }

  finishCallback() {
    clearTimeout(this.timeout);
    this.server?.close();
    this.server = null;
    this.update(this.snapshot());
  }

  exchange(fields) {
    const { client, secret } = this.saved.config;
    return json(this.provider.token, { method: 'POST', body: new URLSearchParams({ client_id: client, client_secret: secret, ...fields }) });
  }

  saveTokens(tokens) {
    if (!tokens.access_token || !(tokens.refresh_token || this.saved.tokens?.refresh)) throw Error('A plataforma não concedeu uma sessão renovável.');
    const scopes = typeof tokens.scope === 'string' && tokens.scope.trim() ? tokens.scope.trim().split(/\s+/) :
      Array.isArray(tokens.scope) ? tokens.scope : this.saved.tokens?.scopes;
    this.persist({ ...this.saved, tokens: { access: tokens.access_token, refresh: tokens.refresh_token || this.saved.tokens.refresh, scopes,
      expires: Date.now() + Number(tokens.expires_in || 3600) * 1000 } });
  }

  async refresh() {
    if (!this.saved.tokens?.refresh) throw Error('Conecte a conta para continuar.');
    if (!this.refreshing) {
      const generation = this.generation;
      this.refreshing = this.exchange({ grant_type: 'refresh_token', refresh_token: this.saved.tokens.refresh }).then((tokens) => {
        if (generation !== this.generation) throw Error('A sessão foi encerrada.');
        this.saveTokens(tokens);
      }).finally(() => { this.refreshing = null; });
    }
    await this.refreshing;
  }

  async api(route, body) {
    const generation = this.generation;
    if (!this.saved.tokens) throw Error('Conecte a conta para continuar.');
    if (this.saved.tokens.expires <= Date.now() + 60000) await this.refresh();
    const call = () => {
      if (generation !== this.generation || !this.saved.tokens) throw Error('A conta foi desconectada.');
      return json(this.provider.base + route, { headers: { Authorization: 'Bearer ' + this.saved.tokens.access, 'Content-Type': 'application/json' },
        ...(body && { method: 'POST', body: JSON.stringify(body) }) });
    };
    const token = this.saved.tokens.access;
    try {
      return await call();
    } catch (error) {
      if (error.status !== 401 || generation !== this.generation) throw error;
      if (this.saved.tokens.access === token) await this.refresh();
      return call();
    }
  }

  async identify(generation) {
    const account = await this.provider.identify(this.api.bind(this));
    if (generation !== this.generation) return;
    this.account = account;
    this.report('Conta vinculada');
    if (this.provider === providers.youtube) void this.pollYouTube(generation);
  }

  async pollYouTube(generation) {
    let interval = 30000;
    try {
      if (!this.chatId) {
        const live = await this.api('liveBroadcasts?part=snippet,status&broadcastType=all&broadcastStatus=active&maxResults=50');
        if (generation !== this.generation) return;
        const chats = (live.items || []).filter((item) => item.snippet.channelId === this.account.id &&
          item.status?.lifeCycleStatus === 'live' && item.snippet.liveChatId);
        if (chats.length > 1) {
          this.report('Há várias lives ativas. Encerre as outras para selecionar o chat automaticamente.');
          return;
        }
        this.chatId = chats[0]?.snippet.liveChatId || '';
        if (!this.chatId) return this.report('Conta vinculada · aguardando live com chat');
        this.report('Chat da live conectado');
      }
      const query = new URLSearchParams({ liveChatId: this.chatId, part: 'id,snippet,authorDetails', maxResults: '200' });
      if (this.cursor) query.set('pageToken', this.cursor);
      const result = await this.api('liveChat/messages?' + query);
      if (generation !== this.generation) return;
      for (const item of result.items || []) {
        if (item.snippet?.type !== 'textMessageEvent') continue;
        if (this.seen?.has(item.id)) continue;
        this.seen ||= new Set();
        this.seen.add(item.id);
        if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
        this.message({ id: item.id, user: item.authorDetails?.displayName || 'YouTube',
          login: item.authorDetails?.displayName, text: item.snippet.displayMessage, historical: !this.cursor });
      }
      this.cursor = result.nextPageToken;
      interval = Math.max(5000, result.pollingIntervalMillis || 0);
      if (result.offlineAt) this.resetChat();
    } catch (error) {
      if (generation !== this.generation) return;
      if (['liveChatEnded', 'liveChatNotFound', 'liveChatDisabled'].includes(error.reason)) this.resetChat();
      if (error.reason === 'quotaExceeded') interval = 300000;
      if (error.reason === 'invalid_grant') {
        this.account = null;
        this.resetChat();
        return this.report('Sessão expirada. Desconecte e vincule a conta novamente.');
      }
      this.report(error.message);
    } finally {
      if (generation === this.generation && this.account) this.poll = setTimeout(() => this.pollYouTube(generation), interval);
    }
  }

  resetChat() {
    this.chatId = '';
    this.cursor = '';
    this.seen = null;
  }

  send(text) {
    if (!this.account) throw Error('Conecte a conta para enviar mensagens.');
    text = String(text || '').trim();
    if (!text || text.length > 500) throw Error('Digite uma mensagem de até 500 caracteres.');
    return this.provider.send(this.api.bind(this), this.account, text, this.chatId);
  }

  disconnect() {
    this.persist({ config: this.saved.config });
    this.stop();
    this.report('Desconectado');
  }

  stop() {
    this.generation++;
    clearTimeout(this.poll);
    this.finishCallback();
    this.account = null;
    this.resetChat();
  }
}

module.exports = { StreamingAccount, providers };
