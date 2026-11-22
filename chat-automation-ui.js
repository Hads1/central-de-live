(() => {
  const el = (id) => document.getElementById('automation-' + id);
  const invoke = (action, data) => window.kaia.studio(action, data);
  const checked = (id) => [...el(id).querySelectorAll('input:checked')].map((input) => input.value);
  function select(id, values) {
    for (const input of el(id).querySelectorAll('input')) input.checked = values.includes(input.value);
  }
  async function perform(action) {
    try { await action(); } catch (error) {
      el('status').textContent = error.message.replace(/^Error invoking remote method 'studio': (?:Error: )?/, '');
    }
  }
  function button(text, action) {
    const item = document.createElement('button');
    item.textContent = text;
    item.onclick = () => perform(async () => {
      item.disabled = true;
      try { await action(); } finally { item.disabled = false; }
    });
    return item;
  }
  function fillMember(member) {
    el('member-platform').value = member.platform;
    el('member-login').value = member.login;
    el('member-role').value = member.role;
    select('member-permissions', member.permissions);
  }
  async function refresh() {
    const state = await invoke('chatAutomationState');
    el('vote-required').value = state.skipVoting.required;
    el('vote-seconds').value = state.skipVoting.seconds;
    el('promote-command').value = state.promoteCommand;
    el('responses').replaceChildren();
    for (const command of state.responses) {
      const row = document.createElement('li');
      row.textContent = command.trigger.join(', ') + ' · ' + command.actions[0].text +
        (command.enabled ? ' · ativo ' : ' · pausado ');
      row.append(button('Editar', () => {
        el('response-id').value = command.id;
        el('response-trigger').value = command.trigger[0];
        el('response-text').value = command.actions[0].text;
        el('response-enabled').checked = command.enabled;
      }), button('Excluir', async () => {
        await invoke('removeChatResponse', { id: command.id }); await refresh();
      }));
      el('responses').append(row);
    }
    el('timers').replaceChildren();
    for (const timer of state.timers) {
      const row = document.createElement('li');
      row.textContent = timer.name + ' · ' + timer.minutes + ' min · ' + timer.targets.join(', ') +
        (timer.enabled ? ' · ativo ' : ' · pausado ');
      row.append(button('Editar', () => {
        el('timer-id').value = timer.id;
        el('timer-name').value = timer.name;
        el('timer-message').value = timer.message;
        el('timer-minutes').value = timer.minutes;
        el('timer-enabled').checked = timer.enabled;
        select('timer-targets', timer.targets);
      }), button(timer.enabled ? 'Pausar' : 'Ativar', async () => {
        await invoke('saveMessageTimer', { ...timer, enabled: !timer.enabled }); await refresh();
      }), button('Enviar agora', () => invoke('testMessageTimer', { id: timer.id })),
      button('Excluir', async () => {
        await invoke('removeMessageTimer', { id: timer.id }); await refresh();
      }));
      el('timers').append(row);
    }
    el('members').replaceChildren();
    for (const member of state.members) {
      const row = document.createElement('li');
      row.textContent = member.platform + ' · ' + member.login + ' · ' + member.role + ' · ' +
        member.permissions.join(', ') + ' ';
      row.append(button('Editar', () => fillMember(member)), button('Revogar', async () => {
        await invoke('saveCommandMember', { ...member, permissions: [] }); await refresh();
      }));
      el('members').append(row);
    }
  }
  document.addEventListener('central-page-change', event => {
    if (['automation', 'permissions'].includes(event.detail)) void perform(refresh);
  });
  document.getElementById('tab-automation').onclick = () => {
    window.selectKaiaTab('automation');
    void perform(refresh);
  };
  el('timer-new').onclick = () => {
    for (const id of ['timer-id', 'timer-name', 'timer-message']) el(id).value = '';
    el('timer-minutes').value = 10;
    el('timer-enabled').checked = true;
    select('timer-targets', []);
  };
  el('response-new').onclick = () => {
    for (const id of ['response-id', 'response-trigger', 'response-text']) el(id).value = '';
    el('response-enabled').checked = true;
  };
  el('response-save').onclick = () => perform(async () => {
    await invoke('saveChatResponse', { id: el('response-id').value || undefined,
      trigger: el('response-trigger').value, text: el('response-text').value, enabled: el('response-enabled').checked });
    el('response-new').click();
    await refresh();
    el('status').textContent = 'Comando salvo. A resposta será enviada no canal em que ele for usado.';
  });
  el('timer-save').onclick = () => perform(async () => {
    await invoke('saveMessageTimer', { id: el('timer-id').value || undefined,
      name: el('timer-name').value, message: el('timer-message').value, minutes: el('timer-minutes').value,
      enabled: el('timer-enabled').checked, targets: checked('timer-targets') });
    el('timer-new').click();
    await refresh();
    el('status').textContent = 'Temporizador salvo. A contagem começa agora.';
  });
  el('member-save').onclick = () => perform(async () => {
    await invoke('saveCommandMember', { platform: el('member-platform').value,
      login: el('member-login').value, role: el('member-role').value, permissions: checked('member-permissions') });
    await refresh();
    el('status').textContent = 'Permissões locais salvas.';
  });
  el('vote-save').onclick = () => perform(async () => {
    await invoke('saveSkipVoting', { required: el('vote-required').value, seconds: el('vote-seconds').value });
    el('status').textContent = 'Votação salva. A rodada anterior foi reiniciada.';
  });
  el('promote-save').onclick = () => perform(async () => {
    await invoke('savePromoteCommand', { command: el('promote-command').value });
    el('status').textContent = 'Comando de promoção salvo.';
  });
  window.kaia.on('studio-chat-automation', (message) => { el('status').textContent = message; });
})();
