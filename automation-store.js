const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const initial = { commands: [], users: [], quotes: [], currency: [], inventory: [], counters: [],
  timer: { enabled: false, minutes: 30, minimumMessages: 10, onlyLive: true } };

class AutomationStore {
  constructor(directory) {
    this.file = path.join(directory, 'automations.json');
    this.state = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : structuredClone(initial);
  }

  save(state) {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(state));
    fs.renameSync(this.file + '.tmp', this.file);
    this.state = state;
  }

  list(collection, search = '') {
    if (!['commands', 'users', 'quotes', 'currency', 'inventory', 'counters'].includes(collection)) throw Error('Categoria inválida.');
    const matches = this.state[collection].filter((entry) => entry.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return { total: matches.length, records: matches.slice(0, 100).map(({ balances, inventory, ...entry }) => {
      if (collection !== 'commands') return entry;
      const supported = entry.actions.length && !entry.restricted && !entry.actions.some((action) => action.type === 'unsupported');
      const label = { reward: 'Pontos Twitch', timer: 'Temporizador', chat: 'Comando de chat', manual: 'Comando manual' };
      return { id: entry.id, name: entry.name, enabled: entry.enabled && Boolean(supported),
        detail: [label[entry.type], entry.trigger.join(', '), supported ? '' : 'Requer configuração'].filter(Boolean).join(' · ') };
    }) };
  }

  addChat(name, trigger, text) {
    if (!name || !/^![\w-]{1,40}$/.test(trigger) || !text || text.length > 500) throw Error('Informe nome, gatilho !comando e mensagem de até 500 caracteres.');
    if (this.state.commands.some((command) => command.trigger.includes(trigger))) throw Error('Já existe um comando com esse gatilho.');
    this.save({ ...this.state, commands: [...this.state.commands, {
      id: randomUUID(), name, type: 'chat', enabled: true,
      trigger: [trigger], actions: [{ type: 'chat', text }],
    }] });
  }
}

module.exports = { AutomationStore };
