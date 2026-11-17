(() => {
  const $ = (id) => document.getElementById('studio-' + id);
  const invoke = (action, args) => window.kaia.studio(action, args);
  let rewards = [];
  let partners = [];
  let kickConnection;
  let account = '';
  let twitchClient = '';
  let history = [];
  const queue = [];
  let finishPlayback;

  function setStatus(target, message) {
    $(target).textContent = message;
  }

  function bind(id, fn) {
    $(id).addEventListener('click', async () => {
      $(id).disabled = true;
      setStatus('feedback', '');
      try {
        await fn();
      } catch (error) {
        setStatus('feedback', error.message.replace(/^Error invoking remote method 'studio': (?:Error: )?/, ''));
      } finally {
        $(id).disabled = false;
      }
    });
  }

  function options(records, selected = '') {
    rewards = records;
    $('rewards').replaceChildren(new Option('Selecione uma recompensa', ''));
    for (const reward of rewards) {
      const marker = reward.rule ? ' · alerta salvo' : '';
      const inactive = reward.enabled ? '' : ' · desativada';
      $('rewards').add(new Option(`${reward.title} · ${reward.cost} pts${marker}${inactive}`, reward.id));
    }
    $('rewards').value = selected;
    selectReward();
  }

  function selectReward() {
    const reward = rewards.find(({ id }) => id === $('rewards').value);
    $('visual-file').value = reward?.rule?.visualFile || '';
    $('audio-file').value = reward?.rule?.audioFile || '';
    $('use-linked-audio').hidden = !reward?.linkedAudio;
    $('volume').value = Math.round((reward?.rule?.volume ?? 0.75) * 100);
    $('duration').value = reward?.rule?.duration ?? 8;
    $('hotkey').value = reward?.rule?.hotkey || '';
    $('partner').value = partners.find((item) => item.key === reward?.rule?.partner)?.id || '';
  }

  async function loadRewards() {
    const provider = $('reward-provider').value;
    const other = provider === 'kick' ? 'twitch' : 'kick';
    const selected = $('rewards').value;
    const platform = provider === 'kick' ? 'Kick' : 'Twitch';
    setStatus('rewards-status', 'Consultando recompensas na ' + platform + '…');
    let records, otherRewards;
    try {
      [records, otherRewards] = await Promise.all([
        invoke('rewards', { provider }),
        invoke('rewards', { provider: other }).catch(() => null),
      ]);
    } catch (error) {
      if ($('reward-provider').value === provider) {
        setStatus('rewards-status', error.message.replace(/^Error invoking remote method 'studio': (?:Error: )?/, ''));
      }
      return;
    }
    if ($('reward-provider').value !== provider) return;
    partners = otherRewards || [];
    $('partner').replaceChildren(new Option('Sem vínculo', ''));
    $('partner').disabled = otherRewards === null;
    for (const item of partners) $('partner').add(new Option(`${item.title} · ${item.cost} pts`, item.id));
    options(records, selected);
    const owner = provider === 'kick' ? kickConnection?.account : account;
    const channel = owner ? ' @' + owner : '';
    setStatus('rewards-status', records.length
      ? `${platform}${channel} · ${records.length} recompensas carregadas.`
      : `${platform}${channel} · a API retornou uma lista vazia. Confira se é a conta que criou a recompensa.`);
  }

  function showTwitch(state) {
    twitchClient = state.client || '';
    setStatus('twitch', [state.account && '@' + state.account,
      state.client ? state.status : 'Configure o aplicativo uma vez',
      state.code && 'Código: ' + state.code].filter(Boolean).join(' · '));
    if (state.client && document.activeElement !== $('client')) $('client').value = state.client;
    $('client').readOnly = Boolean(state.account || state.code);
    if (state.account !== account) options([]);
    account = state.account;
  }

  function showPlatform(provider, state) {
    setStatus(provider + '-status', [state.account, state.status].filter(Boolean).join(' · '));
    const input = $(provider + '-client');
    if (state.client && document.activeElement !== input) input.value = state.client;
    if (provider === 'kick') {
      const justConnected = Boolean(state.account && state.account !== kickConnection?.account);
      kickConnection = state;
      showKickRewardLink();
      if (justConnected && $('reward-provider').value === 'kick') void loadRewards();
    }
  }
  function showKickRewardLink() {
    const kick = $('reward-provider').value === 'kick';
    $('connect-kick-rewards').hidden = !kick || Boolean(kickConnection?.account || kickConnection?.pending);
    if (kick && !kickConnection?.account) {
      setStatus('rewards-status', kickConnection?.pending
        ? 'Conclua a autorização no navegador.'
        : 'Autorize a conta Kick para carregar as recompensas deste canal.');
    }
  }

  function describe(event) {
    if (event.cost == null) return event.title || 'Automação local';
    const value = Number(event.cost).toLocaleString('pt-BR');
    return `${event.user} resgatou ${event.title} · ${value} pts`;
  }

  function showHistory() {
    $('history').replaceChildren(...history.map((event) => {
      const li = document.createElement('li');
      li.textContent = [new Date(event.at).toLocaleTimeString('pt-BR'), describe(event), event.mediaStatus]
        .filter(Boolean).join(' · ');
      return li;
    }));
  }

  function playNext() {
    if (finishPlayback || !queue.length) return;
    const event = queue.shift();
    $('playing').hidden = false;
    setStatus('playing-label', describe(event));
    const media = event.media;
    const player = media?.type === 'image' ? document.createElement('img') :
      media?.type === 'video' ? document.createElement('video') : null;
    let audioFinished = !media?.audioId;
    let videoFinished = media?.type !== 'video';
    const timer = setTimeout(() => done(), (media?.duration || 5) * 1000 + (media?.type === 'audio' ? 6000 : 0));
    const done = () => {
      if (finishPlayback !== done) return;
      clearTimeout(timer);
      finishPlayback = null;
      if (player instanceof HTMLMediaElement) player.pause();
      if (media?.audioId) void invoke('stopAlertAudio', { id: media.audioId }).catch(() => {});
      if (media?.overlayId) void invoke('hideAlertOverlay', { id: media.overlayId }).catch(() => {});
      $('preview').replaceChildren();
      $('playing').hidden = true;
      playNext();
    };
    finishPlayback = done;
    if (media?.overlayId) void invoke('showAlertOverlay', { id: media.overlayId }).catch(() => {});
    const failed = () => {
      if (finishPlayback !== done) return;
      setStatus('playing-label', describe(event) + ' · falha ao reproduzir o arquivo');
    };
    if (media?.audioId) {
      invoke('playAlertAudio', { id: media.audioId }).then(() => {
        audioFinished = true;
        if (media.type !== 'image' && videoFinished) done();
      }).catch((error) => {
        if (finishPlayback !== done) return;
        failed();
        setStatus('feedback', error.message);
        audioFinished = true;
        if (media.type === 'audio') setTimeout(done, 3000);
      });
    }
    if (!player) return;
    player.onerror = failed;
    player.src = media.url;
    $('preview').append(player);
    if (player instanceof HTMLMediaElement) {
      player.muted = true;
      player.onended = () => {
        videoFinished = true;
        if (audioFinished) done();
      };
      player.play().catch(failed);
    } else player.alt = event.title;
  }

  $('stop').onclick = () => {
    queue.length = 0;
    finishPlayback?.();
  };

  $('rewards').onchange = selectReward;
  $('reward-provider').onchange = () => {
    setStatus('rewards-status', '');
    partners = [];
    $('partner').replaceChildren(new Option('Carregue as recompensas', ''));
    $('partner').disabled = true;
    options([]);
    showKickRewardLink();
  };
  const destinations = [...$('output').querySelectorAll('input')];
  const platformName = { twitch: 'Twitch', kick: 'Kick', youtube: 'YouTube' };
  function updateDestinations() {
    const names = destinations.filter((input) => input.checked).map((input) => platformName[input.value]);
    $('output-label').textContent = names.length > 1 ? names.length + ' destinos' : names[0] || 'Destinos';
    $('output-label').title = names.join(', ');
  }
  for (const input of destinations) input.onchange = updateDestinations;
  $('composer').onsubmit = async (event) => {
    event.preventDefault();
    const message = $('message').value;
    $('send').disabled = true;
    setStatus('send-status', '');
    try {
      const targets = destinations.filter((input) => input.checked).map((input) => input.value);
      const results = await invoke('send', { message, targets });
      const failed = results.filter((result) => !result.sent);
      if (!failed.length && $('message').value === message) $('message').value = '';
      if (failed.length && failed.length < results.length) {
        for (const input of destinations) input.checked = failed.some((result) => result.provider === input.value);
        updateDestinations();
      }
      setStatus('send-status', results.map((item) => platformName[item.provider] + ' · ' +
        (item.sent ? 'enviado' : item.message)).join(' | '));
    } catch (error) {
      setStatus('send-status', error.message);
    } finally {
      $('send').disabled = false;
    }
  };

  document.getElementById('tab-studio').onclick = () => window.selectKaiaTab('studio');
  bind('login', async () => {
    if (!twitchClient) {
      $('twitch-config').open = true;
      const client = $('client').value.trim();
      if (!client) {
        setStatus('feedback', 'Abra o console da Twitch, cadastre a Central como aplicativo Público e cole o Client ID abaixo.');
        $('client').focus();
        return;
      }
      await invoke('configureTwitch', { client });
    }
    await invoke('login');
  });
  bind('disconnect', () => invoke('disconnect'));
  bind('twitch-save', async () => {
    await invoke('configureTwitch', { client: $('client').value });
    setStatus('feedback', 'Client ID salvo. Agora clique em Conectar Twitch.');
  });
  bind('twitch-portal', () => invoke('portal', { provider: 'twitch' }));
  for (const provider of ['kick', 'youtube']) {
    bind(provider + '-portal', () => invoke('portal', { provider }));
    bind(provider + '-login', async () => {
      if (!$(provider + '-client').value) $(provider + '-config').open = true;
      await invoke('platformLogin', { provider });
    });
    bind(provider + '-disconnect', () => invoke('platformDisconnect', { provider }));
    bind(provider + '-save', async () => {
      await invoke('platformConfig', { provider, client: $(provider + '-client').value,
        secret: $(provider + '-secret').value });
      $(provider + '-secret').value = '';
      $(provider + '-config').open = false;
    });
  }
  bind('youtube-import', () => invoke('importYouTubeClient'));
  bind('starvios-portal', () => invoke('portal', { provider: 'starvios' }));
  bind('starvios-save', async () => {
    const channel = await invoke('saveStarvios', { channel: $('starvios-channel').value });
    setStatus('starvios-status', 'Canal público configurado: @' + channel);
  });
  bind('alert-output-refresh', async () => {
    const current = $('alert-output').value;
    const outputs = await invoke('audioOutputs');
    $('alert-output').replaceChildren(new Option('Padrão do Windows', ''),
      new Option('OBS · Fonte Navegador de áudio', '@obs'));
    if (current && current !== '@obs' && !outputs.includes(current)) $('alert-output').add(new Option(current + ' (indisponível)', current));
    for (const output of outputs) $('alert-output').add(new Option(output, output));
    $('alert-output').value = current;
  });
  bind('alert-output-save', async () => {
    await invoke('saveAlertOutput', { output: $('alert-output').value });
    setStatus('feedback', 'Saída das automações salva.');
  });
  bind('reload', loadRewards);
  bind('connect-kick-rewards', async () => {
    if (!kickConnection?.configured || kickConnection?.signedIn) {
      $('kick-config').open = true;
      $('kick-status').scrollIntoView({ block: 'center' });
      return;
    }
    await invoke('platformLogin', { provider: 'kick' });
  });
  for (const kind of ['visual', 'audio']) {
    bind('pick-' + kind, async () => {
      const file = await invoke('pick', { kind });
      if (file) $(kind + '-file').value = file;
    });
    bind('clear-' + kind, () => { $(kind + '-file').value = ''; });
  }
  bind('use-linked-audio', () => {
    const reward = rewards.find(({ id }) => id === $('rewards').value);
    if (reward?.linkedAudio) $('audio-file').value = reward.linkedAudio;
  });
  const alertDraft = () => ({
    provider: $('reward-provider').value, id: $('rewards').value,
    title: rewards.find(({ id }) => id === $('rewards').value)?.title,
    partner: $('partner').disabled ? null : $('partner').value, hotkey: $('hotkey').value,
    visualFile: $('visual-file').value, audioFile: $('audio-file').value,
    volume: Number($('volume').value) / 100, duration: $('duration').value,
  });
  bind('save', async () => {
    await invoke('rule', alertDraft());
    await loadRewards();
    setStatus('feedback', 'Regra salva. Use Testar regra salva para reproduzir agora.');
  });
  bind('remove', async () => {
    await invoke('rule', { provider: $('reward-provider').value, id: $('rewards').value, remove: true });
    await loadRewards();
    setStatus('feedback', 'Regra removida.');
  });
  bind('test', async () => {
    const reward = rewards.find(({ id }) => id === $('rewards').value);
    if (!reward?.rule) throw Error('Salve uma regra para testar.');
    await invoke('test', { ...reward, provider: $('reward-provider').value });
  });
  bind('preview-file', () => invoke('preview', alertDraft()));
  bind('create-rewards', async () => {
    const targets = ['twitch', 'kick'].filter((name) => $('create-' + name).checked);
    const results = await invoke('createRewards', { ...alertDraft(), targets,
      title: $('reward-title').value, cost: $('reward-cost').value, description: $('reward-description').value });
    for (const item of results) if (item.id) $('create-' + item.provider).checked = false;
    await loadRewards().catch(() => {});
    setStatus('feedback', results.map((item) => platformName[item.provider] + ' · ' +
      (item.id ? 'recompensa criada' : item.message)).join(' | '));
  });
  bind('copy-alert-overlay', async () => {
    await invoke('copyAlertOverlay');
    setStatus('alert-overlay-status', 'URL copiada. Cole na fonte Navegador do OBS.');
  });
  bind('copy-obs-audio', async () => {
    await invoke('copyObsAlertAudio');
    setStatus('feedback', 'URL da fonte de áudio do OBS copiada.');
  });
  bind('test-obs-audio', async () => {
    await invoke('testObsAlertAudio');
    setStatus('feedback', 'Teste enviado à fonte de áudio do OBS.');
  });
  bind('command-create', async () => {
    await invoke('createCommand', {
      name: $('command-name').value, trigger: $('command-trigger').value, text: $('command-response').value,
    });
    for (const id of ['name', 'trigger', 'response']) $('command-' + id).value = '';
    $('collection').value = 'commands';
    $('search').value = '';
    await refreshAutomations();
    setStatus('feedback', 'Comando criado.');
  });

  let requestNumber = 0;
  async function refreshAutomations() {
    const request = ++requestNumber;
    const collection = $('collection').value;
    $('automation-list').replaceChildren();
    setStatus('automation-count', 'Carregando dados locais…');
    try {
      const { total, records } = await invoke('automationList', { collection, search: $('search').value });
      if (request !== requestNumber) return;
      setStatus('automation-count', `${records.length} de ${total} registros`);
      for (const record of records) {
        const item = document.createElement('li');
        item.textContent = record.name + (record.detail ? ' · ' + record.detail : '');
        if (collection === 'commands' && record.id) {
          const button = document.createElement('button');
          button.textContent = record.enabled === false ? 'Desativado' : 'Executar';
          button.disabled = record.enabled === false;
          button.onclick = async () => {
            button.disabled = true;
            try {
              await invoke('automationRun', { id: record.id, args: $('args').value });
              setStatus('automation-count', 'Comando executado.');
            } catch (error) {
              setStatus('automation-count', error.message);
            } finally {
              button.disabled = false;
            }
          };
          item.append(button);
        }
        $('automation-list').append(item);
      }
    } catch (error) {
      if (request === requestNumber) setStatus('automation-count', error.message);
    }
  }

  $('collection').onchange = refreshAutomations;
  $('search').oninput = refreshAutomations;
  bind('sync', refreshAutomations);
  void refreshAutomations();
  window.kaia.on('studio-state', showTwitch);
  window.kaia.on('studio-platform', ({ provider, ...state }) => showPlatform(provider, state));
  window.kaia.on('studio-kick-rewards', (message) => setStatus('kick-rewards-status', message));
  window.kaia.on('studio-automation-error', (message) => {
    setStatus('feedback', message);
    setStatus('send-status', message);
  });
  window.kaia.on('studio-alert', (event) => {
    if (!event.test) {
      history = [event, ...history].slice(0, 50);
      showHistory();
    }
    if (!event.historyOnly && queue.length < 50) queue.push(event);
    playNext();
  });
  invoke('state').then((state) => {
    showTwitch(state.twitch);
    $('alert-overlay-url').value = state.overlayUrl;
    $('obs-audio-url').value = state.obsAudioUrl;
    for (const [provider, status] of Object.entries(state.platforms)) showPlatform(provider, status);
    if (state.alertOutput) {
      if (state.alertOutput !== '@obs') $('alert-output').add(new Option(state.alertOutput, state.alertOutput));
      $('alert-output').value = state.alertOutput;
    }
    history = state.history;
    showHistory();
  }).catch((error) => setStatus('feedback', error.message));
})();
