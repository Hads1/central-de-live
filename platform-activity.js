const LABELS = { twitch: 'Twitch', kick: 'Kick', starvios: 'Starvios', youtube: 'YouTube' };
class PlatformActivity {
  constructor({ text, send, report }) { Object.assign(this, { text, send, report }); this.seen = new Set(); }
  async receive(event) {
    if (!LABELS[event.platform] || !['follow', 'subscription'].includes(event.kind) || !event.id || event.historical) return;
    const key = `${event.platform}:${event.channel}:${event.kind}:${event.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 4096) this.seen.delete(this.seen.values().next().value);
    const message = this.text(event.kind, {usuario: event.user || 'Pessoa anônima', canal: event.channel || '', plataforma: LABELS[event.platform]});
    if (!message) return;
    try { await this.send(event.platform, message); }
    catch (error) { this.report(LABELS[event.platform] + ' · agradecimento não enviado: ' + error.message); }
  }
}
function starviosActivity(row, channel) {
  const kind = {follow: 'follow', sub: 'subscription', gift_sub: 'subscription'}[row?.type];
  if (!kind || !row.id) return null;
  return {platform: 'starvios', kind, id: String(row.id), channel,
    user: row.type === 'gift_sub' ? row.meta?.recipient || 'Pessoa anônima' : row.username || 'Pessoa anônima'};
}
module.exports = { PlatformActivity, starviosActivity };
