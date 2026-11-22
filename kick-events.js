const crypto = require('node:crypto');
const TYPES = ['channel.followed', 'channel.subscription.new', 'channel.subscription.renewal', 'channel.subscription.gifts'];
class KickEvents {
  constructor({ account, activity, report, fetchKey = async () => {
    const response = await fetch('https://api.kick.com/public/v1/public-key', {signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw Error('Chave pública Kick indisponível.');
    return (await response.json()).data?.public_key;
  }, now = Date.now }) { Object.assign(this, {account, activity, report, fetchKey, now}); this.seen = new Set(); this.status = 'Aguardando configuração do webhook Kick'; }
  async subscribe() {
    if (!this.account.account) throw Error('Conecte a Kick em Conexões e resgates primeiro.');
    const existing = await this.account.api('events/subscriptions');
    const missing = TYPES.filter(name => !(existing.data || []).some(row => row.event === name && row.version === 1 && row.method === 'webhook' && String(row.broadcaster_user_id) === String(this.account.account.id)));
    const result = missing.length ? await this.account.api('events/subscriptions', {method: 'webhook', events: missing.map(name => ({name, version: 1}))}) : {data: []};
    if (!Array.isArray(result.data)) throw Error('A Kick não confirmou as assinaturas de eventos.');
    const errors = result.data?.filter(x => x.error);
    if (errors?.length) throw Error(errors.map(x => x.name + ': ' + x.error).join(' | '));
    this.status = 'Eventos inscritos · aguardando recebimento no webhook público';
    return this.status;
  }
  async handle(req, res) {
    const finish = (code) => { res.writeHead(code); res.end(); };
    if (req.method !== 'POST') return finish(405);
    try {
      const id = req.headers['kick-event-message-id'], time = req.headers['kick-event-message-timestamp'];
      const signature = req.headers['kick-event-signature'], type = req.headers['kick-event-type'];
      if (!id || !signature || !time || !Number.isFinite(Date.parse(time)) || Math.abs(this.now() - Date.parse(time)) > 300000) return finish(401);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 262144) return finish(413); chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      const signed = Buffer.concat([Buffer.from(id + '.' + time + '.'), body]);
      if (!this.key || this.now() >= this.keyUntil) { this.key = await this.fetchKey(); this.keyUntil = this.now() + 3600000; }
      let valid = crypto.verify('RSA-SHA256', signed, this.key, Buffer.from(signature, 'base64'));
      if (!valid) { this.key = await this.fetchKey(); valid = crypto.verify('RSA-SHA256', signed, this.key, Buffer.from(signature, 'base64')); }
      if (!valid) return finish(401);
      const event = JSON.parse(body.toString('utf8'));
      if (!this.account.account || String(event.broadcaster?.user_id) !== String(this.account.account.id)) return finish(403);
      if (this.seen.has(id)) return finish(204);
      this.seen.add(id); if (this.seen.size > 4096) this.seen.delete(this.seen.values().next().value);
      if (TYPES.includes(type)) {
        const users = type === 'channel.followed' ? [event.follower] : type === 'channel.subscription.gifts' ? event.giftees || [] : [event.subscriber];
        for (const [index, user] of users.entries()) await this.activity({platform: 'kick', id: id + ':' + index, kind: type === 'channel.followed' ? 'follow' : 'subscription', channel: this.account.account.name, user: user?.username || 'Pessoa anônima'});
        this.status = 'Webhook Kick ativo · último evento: ' + new Date(this.now()).toLocaleTimeString('pt-BR');
      }
      finish(204);
    } catch (error) { this.report('Webhook Kick: ' + error.message); if (!res.headersSent) finish(503); }
  }
}
module.exports = { KickEvents, TYPES };
