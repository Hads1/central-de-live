const { randomUUID } = require('node:crypto');

const CONTROL_COMMANDS = {
  '!skip': 'skip', '!pular': 'skip', '!pausa': 'pause', '!pause': 'pause',
  '!play': 'play', '!continuar': 'play', '!stop': 'stop', '!parar': 'stop', '!anterior': 'prev',
};
const PERMISSIONS = ['skip', 'pause', 'play', 'stop', 'prev', 'promote'];
const PLATFORMS = ['twitch', 'kick', 'youtube', 'starvios'];

class ChatAutomation {
  constructor({ store, send, control, isOwner, report, now = Date.now, templateMessage = () => '' }) {
    Object.assign(this, { store, send, control, isOwner, report, now, templateMessage });
    this.deadlines = new Map();
    this.recent = new Set();
    this.cooldowns = new Map();
    this.running = new Set();
    this.votes = new Set();
    this.replySeen = new Set();
    this.replyCooldowns = new Map();
  }

  snapshot() {
    return { timers: this.store.state.messageTimers || [], members: this.store.state.commandMembers || [],
      skipVoting: this.store.state.skipVoting || { required: 3, seconds: 120 }, promoteCommand: this.store.state.promoteCommand || '!promote',
      responses: (this.store.state.commands || []).filter((command) => command.type === 'chat' &&
        command.actions?.length === 1 && command.actions[0].type === 'chat') };
  }

  saveResponse(value) {
    const commands = this.store.state.commands || [];
    const trigger = String(value.trigger || '').trim().toLowerCase();
    const text = String(value.text || '').trim();
    if (!/^![a-z0-9_-]{1,40}$/.test(trigger) || !text || text.length > 500 ||
      Object.hasOwn(CONTROL_COMMANDS, trigger) || ['!sr', '!songrequest', this.snapshot().promoteCommand].includes(trigger)) {
      throw Error('Informe um comando exclusivo com ! e uma resposta de até 500 caracteres.');
    }
    if (value.id && !this.snapshot().responses.some((item) => item.id === value.id)) throw Error('Comando não encontrado.');
    if (commands.some((item) => item.id !== value.id && item.trigger?.includes(trigger))) throw Error('Esse comando já existe.');
    const command = { id: value.id || randomUUID(), name: String(value.name || trigger).trim().slice(0, 80),
      type: 'chat', enabled: value.enabled !== false, trigger: [trigger], actions: [{ type: 'chat', text }] };
    this.store.save({ ...this.store.state, commands: [...commands.filter((item) => item.id !== command.id), command] });
  }

  removeResponse(id) {
    if (!this.snapshot().responses.some((item) => item.id === id)) throw Error('Comando não encontrado.');
    this.store.save({ ...this.store.state, commands: this.store.state.commands.filter((item) => item.id !== id) });
  }

  async reply(message, trigger, text) {
    if (!PLATFORMS.includes(message.platform) || !message.id) return;
    const command = this.snapshot().responses.find((item) => item.enabled && !item.restricted && item.trigger.includes(trigger));
    if (!command) return;
    const key = message.platform + ':' + message.id;
    if (this.replySeen.has(key)) return;
    this.replySeen.add(key);
    if (this.replySeen.size > 2000) this.replySeen.delete(this.replySeen.values().next().value);
    const cooldown = message.platform + ':' + command.id;
    if (this.now() - (this.replyCooldowns.get(cooldown) || 0) < 5000) return;
    this.replyCooldowns.set(cooldown, this.now());
    const variables = { username: message.user || message.login, args: text.slice(trigger.length).trim() };
    const response = command.actions[0].text.replace(/\$(username|args)\b/gi, (_, name) => String(variables[name.toLowerCase()] || '')).slice(0, 500);
    try { await this.send(message.platform, response); }
    catch (error) { this.report('Resposta ' + trigger + ' falhou: ' + error.message); }
  }

  savePromoteCommand(value) {
    const command = String(value.command || '').trim().toLowerCase();
    if (!/^![a-z0-9_-]{1,30}$/.test(command) || Object.hasOwn(CONTROL_COMMANDS, command) ||
      ['!sr', '!songrequest'].includes(command) ||
      (this.store.state.commands || []).some((item) => item.trigger?.includes(command))) throw Error('Escolha um comando exclusivo, como !promote.');
    this.store.save({ ...this.store.state, promoteCommand: command });
  }

  saveVoting(value) {
    const required = Number(value.required);
    const seconds = Number(value.seconds);
    if (!Number.isSafeInteger(required) || required < 1 || required > 10000 ||
      !Number.isSafeInteger(seconds) || seconds < 10 || seconds > 3600) {
      throw Error('Escolha de 1 a 10000 votos e uma janela de 10 a 3600 segundos.');
    }
    this.store.save({ ...this.store.state, skipVoting: { required, seconds } });
    this.resetVotes();
  }

  resetVotes() {
    this.votes.clear();
    this.voteDeadline = 0;
  }

  saveTimer(value) {
    const current = this.snapshot().timers;
    const id = value.id || randomUUID();
    if (value.id && !current.some((item) => item.id === id)) throw Error('Temporizador não encontrado.');
    const message = String(value.message || '').trim();
    const name = String(value.name || '').trim().slice(0, 80);
    const minutes = Number(value.minutes);
    const targets = [...new Set(value.targets || [])];
    if (!name || !message || message.length > 500 || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440 ||
      !targets.length || targets.some((target) => !PLATFORMS.includes(target))) {
      throw Error('Informe nome, mensagem de até 500 caracteres, intervalo de 1 a 1440 minutos e os destinos.');
    }
    const timer = { id, name, message, minutes, targets, enabled: value.enabled === true };
    this.store.save({ ...this.store.state, messageTimers: [...current.filter((item) => item.id !== id), timer] });
    this.deadlines.set(id, this.now() + minutes * 60000);
  }

  removeTimer(id) {
    this.store.save({ ...this.store.state, messageTimers: this.snapshot().timers.filter((item) => item.id !== id) });
    this.deadlines.delete(id);
  }

  saveMember(value) {
    const platform = value.platform;
    const login = String(value.login || '').trim().replace(/^@/, '').toLowerCase();
    const permissions = [...new Set(value.permissions || [])];
    if (!PLATFORMS.includes(platform) || !/^[a-z0-9_.-]{1,100}$/.test(login) ||
      permissions.some((permission) => !PERMISSIONS.includes(permission))) {
      throw Error('Informe a plataforma, o nome de usuário e comandos válidos.');
    }
    const members = this.snapshot().members.filter((item) => item.platform !== platform || item.login !== login);
    if (permissions.length) members.push({ platform, login, role: String(value.role || 'Personalizado').slice(0, 60), permissions });
    this.store.save({ ...this.store.state, commandMembers: members });
  }

  async dispatch(timer) {
    const results = await Promise.all(timer.targets.map(async (platform) => {
      try { await this.send(platform, timer.message); return platform + ' enviado'; }
      catch (error) { return platform + ' falhou: ' + error.message; }
    }));
    this.report(timer.name + ' · ' + results.join(' | '));
  }

  async tick() {
    for (const timer of this.snapshot().timers) {
      if (!timer.enabled || this.running.has(timer.id)) continue;
      if (!this.deadlines.has(timer.id)) {
        this.deadlines.set(timer.id, this.now() + timer.minutes * 60000);
        continue;
      }
      if (this.now() < this.deadlines.get(timer.id)) continue;
      this.deadlines.set(timer.id, this.now() + timer.minutes * 60000);
      this.running.add(timer.id);
      try { await this.dispatch(timer); } finally { this.running.delete(timer.id); }
    }
  }

  async feedback(id, message, values) {
    const text = this.templateMessage(id, {usuario: message.user || message.login, ...values});
    if (text) { try { await this.send(message.platform, text); } catch (error) { this.report('Resposta SR falhou: ' + error.message); } }
  }

  async receive(message) {
    if (message.historical || message.redemption) return;
    const text = String(message.text || '').trim();
    const [trigger] = text.toLowerCase().split(/\s+/);
    await this.reply(message, trigger, text);
    const action = trigger === this.snapshot().promoteCommand ? 'promote' : CONTROL_COMMANDS[text.toLowerCase()];
    if (!action || this.controlling) return;
    const login = String(message.login || message.user || '').trim().toLowerCase();
    if (!login) return;
    const member = this.snapshot().members.find((item) => item.platform === message.platform && item.login === login);
    const privileged = this.isOwner(message) || member?.permissions.includes(action);
    if (!privileged && action !== 'skip') return;
    const key = message.platform + ':' + message.id;
    if (!message.id || this.recent.has(key)) return;
    this.recent.add(key);
    if (this.recent.size > 2000) this.recent.delete(this.recent.values().next().value);
    const userKey = message.platform + ':' + login;
    if (this.now() - (this.cooldowns.get(userKey) || 0) < 3000) return;
    this.cooldowns.set(userKey, this.now());
    if (!privileged) {
      const voting = this.snapshot().skipVoting;
      if (this.now() >= (this.voteDeadline || 0)) {
        this.resetVotes();
        this.voteDeadline = this.now() + voting.seconds * 1000;
      }
      if (this.votes.has(userKey)) return;
      this.votes.add(userKey);
      this.report('Votação para pular · ' + this.votes.size + '/' + voting.required);
      await this.feedback('srVote', message, {votos: this.votes.size, necessarios: voting.required});
      if (this.votes.size < voting.required) return;
    }
    if (action === 'skip' || action === 'prev' || action === 'stop') this.resetVotes();
    this.controlling = true;
    try {
      const args = action === 'promote' ? [text.slice(trigger.length).trim()] : [];
      if (action === 'promote' && !args[0]) throw Error('Informe o número ou o nome da música.');
      await this.control(action, args);
      this.report(login + ' · SR ' + action);
      await this.feedback('srControl', message, {comando: trigger});
    } catch (error) { this.report('Comando SR falhou: ' + error.message); await this.feedback('srError', message, {erro: error.message}); }
    finally { this.controlling = false; }
  }
}

module.exports = { ChatAutomation, CONTROL_COMMANDS };
