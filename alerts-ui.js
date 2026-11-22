(() => {
  const el = (id) => document.getElementById(id);
  const selectors = {
    streamlabs:
      '#alert-text, #alert-message, #alert-user-message, .alert-message',
    streamelements: '.alert-text, .alert-message, #alert-message',
    custom: '',
  };
  function row(value = {}) {
    const box = document.createElement('fieldset');
    box.dataset.id = value.id || '';
    const name = document.createElement('input');
    name.placeholder = 'Nome / plataforma (Twitch, Kick…)';
    name.value = value.name || '';
    name.setAttribute('aria-label', 'Nome da fonte');
    const provider = document.createElement('select');
    for (const [key, title] of Object.entries({
      streamlabs: 'Streamlabs',
      streamelements: 'StreamElements',
      custom: 'Personalizado / outro serviço',
    }))
      provider.add(new Option(title, key));
    provider.value = value.provider || 'streamlabs';
    provider.setAttribute('aria-label', 'Serviço de alertas');
    const url = document.createElement('input');
    url.type = 'password';
    url.autocomplete = 'off';
    url.placeholder = 'URL privado do widget de alertas';
    url.value = value.url || '';
    url.setAttribute('aria-label', 'URL do widget');
    const selector = document.createElement('input');
    selector.placeholder = 'Seletor CSS do texto';
    selector.value = value.selector || selectors[provider.value];
    selector.setAttribute('aria-label', 'Seletor do texto do alerta');
    provider.onchange = () => (selector.value = selectors[provider.value]);
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = value.enabled !== false;
    const duration = document.createElement('input');
    duration.type = 'number';
    duration.min = '0';
    duration.max = '300';
    duration.value = value.durationSeconds || 0;
    duration.setAttribute(
      'aria-label',
      'Duração do alerta em segundos; zero para detectar o fim automaticamente',
    );
    const durationLabel = document.createElement('label');
    durationLabel.textContent =
      'Duração do alerta (segundos). 0 = aguardar desaparecer e terminar o áudio; informe 5, 10… para duração fixa.';
    durationLabel.append(duration);
    const label = document.createElement('label');
    label.className = 'check-row';
    label.append(enabled, ' Monitorar esta fonte');
    const remove = document.createElement('button');
    remove.textContent = 'Remover fonte';
    remove.onclick = () => box.remove();
    const preview = document.createElement('button');
    preview.textContent = 'Abrir prévia desta fonte';
    preview.onclick = () =>
      window.kaia
        .previewAlert(box.dataset.id)
        .catch(
          (e) =>
            (el('alerts-status').textContent = e.message.replace(
              /^Error invoking remote method '[^']+': Error: /,
              '',
            )),
        );
    box.append(
      name,
      provider,
      url,
      selector,
      durationLabel,
      label,
      preview,
      remove,
    );
    box.read = () => ({
      id: box.dataset.id || undefined,
      name: name.value,
      provider: provider.value,
      url: url.value,
      selector: selector.value,
      enabled: enabled.checked,
      durationSeconds: Number(duration.value),
    });
    el('alert-sources').append(box);
  }
  function last(value) {
    if (!value) return;
    el('repeat-alert').disabled = false;
    const text =
      new Date(value.at).toLocaleTimeString() +
      ' · ' +
      value.source +
      ': ' +
      value.text;
    el('last-alert').textContent = text;
    el('chat-last-alert').textContent = 'Último alerta · ' + text;
  }
  const examples = {usuario: 'João', musica: 'Música de exemplo', recompensa: 'Hidrate', pontos: 500, comando: '!skip', votos: 2, necessarios: 3, erro: 'Nenhuma música na fila', plataforma: 'Twitch', canal: 'Seu canal'};
  function templateRows(rows) {
    el('message-templates').replaceChildren();
    for (const item of rows) {
      const box = document.createElement('fieldset');
      const label = document.createElement('label');
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = item.enabled;
      label.append(enabled, ' ' + item.label);
      const text = document.createElement('textarea'); text.value = item.text; text.maxLength = 500; text.setAttribute('aria-label', item.label);
      const variables = document.createElement('p'); variables.textContent = 'Variáveis: ' + item.variables.map(key => '{' + key + '}').join(', ');
      const preview = document.createElement('p');
      const update = () => preview.textContent = 'Prévia: ' + text.value.replace(/\{([a-z_]+)\}/gi, (token, key) => String(examples[key] ?? token));
      text.oninput = update; update();
      box.append(label, text, variables, preview);
      box.read = () => ({id: item.id, text: text.value, enabled: enabled.checked});
      el('message-templates').append(box);
    }
  }
  window.kaia.studio('messageTemplates').then(templateRows).catch(e => el('message-templates-status').textContent = e.message);
  el('save-message-templates').onclick = async () => {
    try {
      templateRows(await window.kaia.studio('saveMessageTemplates', {rows: Array.from(el('message-templates').children).map(box => box.read())}));
      el('message-templates-status').textContent = 'Mensagens salvas. As próximas ocorrências usarão estes textos.';
    } catch(e) { el('message-templates-status').textContent = e.message; }
  };
  el('tab-alerts').onclick = () => window.selectKaiaTab('alerts');
  el('add-alert-source').onclick = () => row();
  el('save-alerts').onclick = async () => {
    try {
      const values = Array.from(el('alert-sources').children).map((x) =>
        x.read(),
      );
      const saved = await window.kaia.saveAlerts(values);
      el('alert-sources').replaceChildren();
      saved.forEach(row);
      el('alerts-status').textContent =
        'Fontes salvas. Dispare um alerta de teste no painel do serviço.';
    } catch (e) {
      el('alerts-status').textContent = e.message;
    }
  };
  el('repeat-alert').disabled = true;
  el('repeat-alert').onclick = async () => {
    try {
      const result = await window.kaia.repeatAlert();
      if (typeof result === 'string') el('alerts-status').textContent = result;
    } catch (e) {
      el('alerts-status').textContent = e.message.replace(
        /^Error invoking remote method '[^']+': Error: /,
        '',
      );
    }
  };
  window.kaia.load().then((s) => {
    (s.alertSources || []).forEach(row);
    last(s.lastAlert);
  });
  window.kaia.on('alert-state', last);
  function voice(value) {
    if (!value) return;
    const label =
      {
        queued: 'Aviso na fila',
        preparing: 'Preparando/reproduzindo aviso',
        done: 'Aviso concluído',
        error: 'Falha no aviso',
      }[value.phase] || value.phase;
    for (const node of document.querySelectorAll('.announcement-status'))
      node.textContent = label + ': ' + (value.error || value.text);
  }
  window.kaia.on('announcement-state', voice);
  window.kaia.load().then((s) => voice(s.announcementState));
  for (const [id, kind] of [
    ['test-alert-voice', 'alert'],
    ['test-request-voice', 'sr'],
  ])
    el(id).onclick = () =>
      window.kaia.testAnnouncement(kind).catch((e) => {
        for (const node of document.querySelectorAll('.announcement-status'))
          node.textContent = e.message.replace(
            /^Error invoking remote method '[^']+': Error: /,
            '',
          );
      });
  el('repeat-request').onclick = async () => {
    try {
      const result = await window.kaia.repeatRequest();
      if (typeof result === 'string')
        for (const node of document.querySelectorAll('.announcement-status'))
          node.textContent = result;
    } catch (e) {
      for (const node of document.querySelectorAll('.announcement-status'))
        node.textContent = e.message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          '',
        );
    }
  };
})();
