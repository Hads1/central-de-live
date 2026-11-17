const POLL_INTERVAL = 8000;

class KickRewards {
  constructor(account, redeem, report) {
    Object.assign(this, { account, redeem, report });
    this.generation = 0;
  }

  async list() {
    const state = this.account.snapshot();
    if (!state.configured) throw Error('Configure o aplicativo Kick e clique em Conectar Kick.');
    if (!state.account) {
      if (state.pending) throw Error('Conclua a autorização da Kick no navegador e carregue as recompensas novamente.');
      throw Error(state.signedIn
        ? 'A Central não conseguiu identificar o canal da conta Kick. Confira a conexão da conta.'
        : 'A conta Kick precisa ser autorizada no navegador. Clique em Conectar Kick para abrir o login.');
    }
    const granted = this.account.saved.tokens?.scopes;
    if (Array.isArray(granted) && !granted.includes('channel:rewards:read')) {
      throw Error('A autorização da Kick não inclui leitura de recompensas. Desconecte e conecte a Kick novamente.');
    }
    let result;
    try {
      result = await this.account.api('channels/rewards');
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        throw Error('A Kick recusou o acesso às recompensas (HTTP ' + error.status +
          '). Desconecte e reconecte a conta do canal para autorizar os pontos.');
      }
      throw error;
    }
    if (!Array.isArray(result.data)) throw Error('A Kick retornou um formato inesperado para as recompensas.');
    return result.data;
  }

  async create(title, cost, description) {
    if (!this.account.account) throw Error('Conecte a Kick.');
    return (await this.account.api('channels/rewards', { title, cost, description,
      is_enabled: true, should_redemptions_skip_request_queue: true })).data;
  }

  start(channel) {
    this.stop();
    this.channel = channel;
    this.started = Date.now();
    this.names = new Map();
    this.seen = new Set();
    this.report('Consultando resgates da Kick…');
    void this.poll(this.generation);
  }

  stop() {
    this.generation++;
    clearTimeout(this.timer);
  }

  async recent(status) {
    const records = [];
    let cursor;
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({ status });
      if (cursor) query.set('cursor', cursor);
      const response = await this.account.api('channels/rewards/redemptions?' + query);
      for (const group of response.data || []) {
        for (const item of group.redemptions || []) {
          if (Date.parse(item.redeemed_at) >= this.started) records.push({ item, reward: group.reward });
        }
      }
      cursor = response.pagination?.next_cursor;
      if (!cursor) break;
    }
    return records;
  }

  async namesFor(ids) {
    const missing = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && !this.names.has(id));
    for (let offset = 0; offset < missing.length; offset += 50) {
      const query = new URLSearchParams(missing.slice(offset, offset + 50).map((id) => ['id', String(id)]));
      const result = await this.account.api('users?' + query);
      for (const user of result.data || []) this.names.set(user.user_id, user.name);
    }
  }

  async poll(generation) {
    let interval = POLL_INTERVAL;
    try {
      const results = (await Promise.all(['pending', 'accepted'].map((status) => this.recent(status))))
        .flat().sort((left, right) => Date.parse(left.item.redeemed_at) - Date.parse(right.item.redeemed_at));
      if (generation !== this.generation) return;
      const pending = results.filter(({ item, reward }) => item.id && reward?.id && !this.seen.has(item.id));
      if (pending.length) await this.namesFor(pending.map(({ item }) => item.redeemer?.user_id)).catch(() => {});
      if (generation !== this.generation) return;
      for (const { item, reward } of pending) {
        if (this.seen.has(item.id)) continue;
        this.seen.add(item.id);
        this.redeem({ id: item.id, broadcaster_user_id: this.channel,
          user_name: this.names.get(item.redeemer?.user_id) || (item.redeemer?.user_id
            ? 'Usuário Kick #' + item.redeemer.user_id : 'Usuário Kick'), reward });
      }
      this.report('Resgates Kick ativos · consulta a cada 8 s');
    } catch (error) {
      if (generation !== this.generation) return;
      interval = 30000;
      this.report([401, 403].includes(error.status)
        ? 'Reconecte a Kick para autorizar as recompensas e os resgates.' : 'Resgates Kick temporariamente indisponíveis.');
    } finally {
      if (generation === this.generation) this.timer = setTimeout(() => this.poll(generation), interval);
    }
  }
}

module.exports = { KickRewards };
