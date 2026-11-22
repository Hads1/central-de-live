const { BrowserWindow, session } = require('electron');
const { starviosActivity } = require('./platform-activity');
// Runs the site's own authenticated client in a sandboxed first-party page.
// Session tokens remain in the isolated browser session and never reach the chat UI.
class StarviosAccount {
  constructor({ activity, report, save, channel, connected = () => {}, smoke }) { Object.assign(this, {activity, report, save, channel, connected, smoke}); this.status = 'Desconectada'; this.seen = new Set(); this.generation = 0; }
  snapshot() { return {account: this.account?.name || '', status: this.status}; }
  async open(visible = true) {
    if (this.smoke) return;
    if (this.window && !this.window.isDestroyed()) { if (visible) this.window.show(); return; }
    this.window = new BrowserWindow({width: 900, height: 740, show: visible, title: 'Conectar Starvios', webPreferences: {partition: 'persist:central-starvios', sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false}});
    const window = this.window;
    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== 'https://starvios.com') event.preventDefault(); });
    window.on('close', event => { if (this.account && !this.closing) { event.preventDefault(); window.hide(); } });
    window.on('closed', () => { if (this.window === window) { this.generation++; clearTimeout(this.timer); this.window = null; this.account = null; } });
    this.status = visible ? 'Entre na conta do canal na janela Starvios' : 'Restaurando conexão Starvios';
    await window.loadURL(visible ? 'https://starvios.com/auth' : 'https://starvios.com/popout/activity');
    this.save(true);
    void this.poll();
  }
  async run(body) {
    if (!this.window || this.window.isDestroyed() || new URL(this.window.webContents.getURL()).origin !== 'https://starvios.com') throw Error('Conecte a Starvios primeiro.');
    return this.window.webContents.executeJavaScript(`(async () => {
      const assets = [...document.querySelectorAll('link[href],script[src]')].map(el => el.getAttribute('href') || el.getAttribute('src'));
      const client = assets.find(path => /^\\/assets\\/client-[\\w-]+\\.js$/.test(path));
      if (!client) throw Error('Cliente Starvios mudou. Tente conectar novamente.');
      const module = await import(client);
      const api = Object.values(module).find(value => value && value.auth && typeof value.rpc === 'function');
      if (!api) throw Error('Cliente Starvios indisponível.');
      ${body}
    })()`);
  }
  async poll() {
    clearTimeout(this.timer);
    if (this.busy || !this.window || this.window.isDestroyed()) return;
    this.busy = true;
    const generation = this.generation;
    try {
      const result = await this.run(`const {data: auth} = await api.auth.getUser();
        if (!auth.user) return null;
        const {data: profile, error} = await api.from('profiles').select('id,username').eq('id', auth.user.id).single();
        if (error) throw Error(error.message);
        const {data: events, error: feedError} = await api.rpc('creator_activity_feed', {_hours: 1});
        if (feedError) throw Error(feedError.message);
        return {profile, events};`);
      if (generation !== this.generation) return;
      if (!result) { this.account = null; this.status = 'Entre na conta na janela Starvios'; return; }
      if (this.channel() && this.channel().toLowerCase() !== result.profile.username.toLowerCase()) { this.account = null; throw Error('Entre com a conta do canal Starvios configurado no Chat.'); }
      if (this.identity !== result.profile.id) { this.identity = result.profile.id; this.seen.clear(); this.baseline = false; }
      this.account = {id: result.profile.id, name: result.profile.username};
      if (!this.channel()) this.connected(this.account.name);
      for (const row of result.events || []) {
        if (!row.id || this.seen.has(row.id)) continue;
        this.seen.add(row.id);
        if (this.baseline && Date.parse(row.at) >= this.startedAt) {
          const event = starviosActivity(row, this.account.name);
          if (event) await this.activity(event);
        }
      }
      if (!this.baseline) { this.baseline = true; this.startedAt = Date.now(); this.window.hide(); }
      if (this.seen.size > 10000) this.seen = new Set([...this.seen].slice(-5000));
      this.status = '@' + this.account.name + ' · follows e inscrições ativos (consulta a cada 15 s)';
    } catch (error) { if (generation === this.generation) this.status = error.message; }
    finally { if (generation === this.generation) { this.busy = false; if (this.window && !this.window.isDestroyed()) this.timer = setTimeout(() => void this.poll(), 15000); } }
  }
  async send(text) {
    if (!this.account) throw Error('Conecte a conta Starvios na aba Alertas.');
    const channel = this.channel() || this.account.name;
    const value = String(text || '').trim();
    if (!value || value.length > 500) throw Error('Digite até 500 caracteres.');
    await this.run(`const {data: profile, error: profileError} = await api.from('profiles').select('id').eq('username', ${JSON.stringify(channel)}).single();
      if (profileError) throw Error(profileError.message);
      const {data: streams, error: streamError} = await api.from('live_streams').select('id').eq('channel_id', profile.id).order('started_at', {ascending: false}).limit(1);
      if (streamError || !streams?.[0]) throw Error('Canal sem transmissão para enviar mensagem.');
      const {error} = await api.rpc('send_live_message', {_stream_id: streams[0].id, _body: ${JSON.stringify(value)}, _coins: 0});
      if (error) throw Error(error.message);`);
  }
  async disconnect() { this.save(false); this.stop(); await session.fromPartition('persist:central-starvios').clearStorageData(); this.status = 'Desconectada'; }
  stop() { this.generation++; this.busy = false; clearTimeout(this.timer); this.closing = true; this.window?.destroy(); this.window = null; this.account = null; this.identity = null; this.baseline = false; this.closing = false; }
}
module.exports = { StarviosAccount };
