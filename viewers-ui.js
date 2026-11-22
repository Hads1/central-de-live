(() => {
  const $ = (id) => document.getElementById(id),
    panel = $('viewers-panel');
  const names = {
    twitch: 'Twitch',
    kick: 'Kick',
    youtube: 'YouTube',
    starvios: 'Starvios',
    custom: 'Personalizado',
  };
  const fields = $('viewer-sources');
  for (const [p, name] of Object.entries(names)) {
    const group = document.createElement('fieldset'),
      legend = document.createElement('legend');
    legend.textContent = name;
    group.append(legend);
    const input = (key, label, type = 'text', target = group) => {
      const l = document.createElement('label');
      l.textContent = label;
      const e = document.createElement('input');
      e.type = type;
      e.id = 'viewer-' + p + '-' + key;
      e.autocomplete = 'off';
      l.append(e);
      target.append(l);
    };
    input(
      'enabled',
      'Incluir esta plataforma nos contadores e no total',
      'checkbox',
    );
    const diagnostic = document.createElement('p');
    diagnostic.id = 'viewer-' + p + '-diagnostic';
    diagnostic.setAttribute('role', 'status');
    group.append(diagnostic);
    input('logo', 'Logo do canal/plataforma — URL HTTPS opcional');
    if (['twitch', 'kick'].includes(p)) {
      const credentialsGroup = document.createElement('fieldset');
      const title = document.createElement('legend'); title.textContent = name;
      credentialsGroup.append(title);
      $('viewer-account-credentials').append(credentialsGroup);
      input('clientId', 'Client ID alternativo para uso sem conta vinculada', 'text', credentialsGroup);
      input('secret', 'Client Secret alternativo — vazio mantém o salvo', 'password', credentialsGroup);
      input('forget', 'Excluir credencial salva', 'checkbox', credentialsGroup);
      const status = document.createElement('p');
      status.id = 'viewer-' + p + '-auth';
      credentialsGroup.append(status);
    }
    if (p === 'custom') {
      input('apiUrl', 'API JSON do contador (HTTPS ou HTTP local)');
      input('countPath', 'Campo da contagem (ex.: viewers)');
      input('livePath', 'Campo ao vivo (true/false, ex.: live)');
    }
    fields.append(group);
  }
  let snapshot;
  function render(s) {
    snapshot = s;
    for (const [p, name] of Object.entries(names)) {
      const row = s.rows.find((r) => r.platform === p);
      const state = !s.enabled
        ? 'Contadores desativados.'
        : !row
          ? 'Não incluído. Confira a seleção e o canal nas configurações do chat.'
          : row.error ||
            (row.state === 'loading'
              ? 'Consultando a plataforma…'
              : row.state === 'offline'
                ? 'Canal offline: 0 espectadores.'
                : row.count !== null
                  ? `${row.count} espectadores. Última consulta: ${new Date(row.updatedAt).toLocaleTimeString()}`
                  : 'Aguardando dados.');
      $('viewer-' + p + '-diagnostic').textContent = name + ': ' + state;
    }
    const root = $('viewer-counter'),
      overlay = document.body.classList.contains('overlay');
    window.renderViewers(root, s);
    root.hidden =
      !s.enabled || !s.rows.length || !(overlay ? s.showOverlay : s.showChat);
    root.dataset.position = s.position;
    const feed = $('feed');
    if (s.position === 'bottom' && root.previousElementSibling !== feed) feed.after(root);
    if (s.position !== 'bottom' && root.nextElementSibling !== feed) feed.before(root);
    document.body.classList.toggle(
      'viewers-at-top',
      !root.hidden && s.position === 'top',
    );
    document.body.classList.toggle(
      'viewers-at-bottom',
      !root.hidden && s.position === 'bottom',
    );
  }
  window.kaia.on('viewers', render);
  new MutationObserver(() => {
    if (snapshot) render(snapshot);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  function populate(s) {
    const v = s.viewers;
    for (const key of ['enabled', 'showChat', 'showOverlay', 'showTotal'])
      $('viewer-' + key).checked = v[key];
    for (const key of ['interval', 'fontSize', 'color', 'position'])
      $('viewer-' + key).value = v[key];
    for (const p of Object.keys(names))
      for (const [key, val] of Object.entries(v.sources[p])) {
        const el = $('viewer-' + p + '-' + key);
        if (el) {
          if (el.type === 'checkbox') el.checked = val;
          else el.value = val;
        }
      }
    for (const p of ['twitch', 'kick']) {
      $('viewer-' + p + '-secret').value = '';
      $('viewer-' + p + '-forget').checked = false;
      $('viewer-' + p + '-auth').textContent = s.viewerCredentials[p]
        ? 'Credencial salva com proteção do Windows.'
        : 'A conta de Conexões e resgates tem prioridade.';
    }
    const urls = $('viewer-urls');
    urls.replaceChildren();
    for (const [kind, name] of Object.entries({
      all: 'Todos + total',
      total: 'Somente total',
      ...names,
    })) {
      const label = document.createElement('label');
      label.textContent = name;
      const input = document.createElement('input');
      input.readOnly = true;
      input.value = s.viewerUrl + '?platform=' + kind;
      input.onclick = () => input.select();
      const button = document.createElement('button');
      button.textContent = 'Copiar';
      button.onclick = () => window.kaia.copyViewers(kind);
      label.append(input, button);
      urls.append(label);
    }
    if (s.viewerSnapshot) render(s.viewerSnapshot);
  }
  window.kaia.load().then(populate);
  $('save-viewers').onclick = async () => {
    const v = { sources: {} },
      credentials = {};
    for (const k of ['enabled', 'showChat', 'showOverlay', 'showTotal'])
      v[k] = $('viewer-' + k).checked;
    for (const k of ['interval', 'fontSize', 'color', 'position'])
      v[k] = $('viewer-' + k).value;
    for (const p of Object.keys(names)) {
      v.sources[p] = {
        enabled: $('viewer-' + p + '-enabled').checked,
        logo: $('viewer-' + p + '-logo').value,
      };
      if (['twitch', 'kick'].includes(p)) {
        v.sources[p].clientId = $('viewer-' + p + '-clientId').value;
        credentials[p] = {
          secret: $('viewer-' + p + '-secret').value,
          forget: $('viewer-' + p + '-forget').checked,
        };
      }
    }
    for (const k of ['apiUrl', 'countPath', 'livePath'])
      v.sources.custom[k] = $('viewer-custom-' + k).value;
    try {
      populate(await window.kaia.saveViewers({ options: v, credentials }));
      $('viewer-status').textContent =
        'Contadores salvos. Atualização iniciada.';
    } catch (e) {
      $('viewer-status').textContent = e.message;
    }
  };
})();
