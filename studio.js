const { PlatformActivity } = require('./platform-activity');
const { KickEvents } = require('./kick-events');
const { StarviosAccount } = require('./starvios-account');
const templates = require('./message-templates');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { ipcMain, dialog, shell, safeStorage, clipboard, globalShortcut } = require('electron');
const { Twitch } = require('./twitch-live');
const { ViewerSecrets } = require('./viewer-secrets');
const { AutomationStore } = require('./automation-store');
const { StreamingAccount, providers } = require('./streaming-accounts');
const { KickRewards } = require('./kick-rewards');
const { ChatAutomation } = require('./chat-automation');

const { FORMATS, mediaKind } = require('./alert-overlay');

function emoteRanges(fragments) {
  let offset = 0;
  const ranges = [];
  for (const fragment of fragments || []) {
    const length = Array.from(fragment.text).length;
    if (fragment.emote && length) ranges.push(`${fragment.emote.id}:${offset}-${offset + length - 1}`);
    offset += length;
  }
  return ranges.join('/');
}

function importKaiaPreferences(app, target) {
  if (fs.existsSync(target)) return null;
  const legacy = path.join(app.getPath('appData'), 'Kaia Chat', 'settings.json');
  if (!fs.existsSync(legacy)) return null;
  const original = JSON.parse(fs.readFileSync(legacy, 'utf8'));
  const keys = ['language', 'twitch', 'kick', 'starvios', 'custom', 'background', 'fontSize',
    'sounds', 'appearance', 'blockedUsers', 'timing', 'widget', 'reader', 'sr', 'srShortcuts',
    'alertSources', 'viewers'];
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(original, key)).map((key) => [key, original[key]]));
}

function installStudio({ win, directory, transcriptReady, startChats, emit, getChats, widgetServer,
  getStarviosChannel = () => '', saveStarvios, automationAudio, automationOutputs, controlSR, getAlertOutput, setAlertOutput, refreshViewers = () => {}, smoke }) {
  const config = path.join(directory, 'mini-alerts.json');
  let rules = {};
  try {
    rules = JSON.parse(fs.readFileSync(config, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const picked = new Set();
  const audioFiles = new Map();
  const nativeAudio = new Set();
  const overlayClips = new Map();
  const overlayUrl = widgetServer.url.replace('/widget.html', '/alerts/index.html');
  const obsAudioUrl = widgetServer.url.replace('/widget.html', '/alert-audio/index.html');
  const clientFile = path.join(directory, 'twitch-client.json');
  const twitchStore = new ViewerSecrets(path.join(directory, 'twitch.secrets'), safeStorage);
  let twitchClient = process.env.CENTRAL_TWITCH_CLIENT_ID || '';
  if (!twitchClient && fs.existsSync(clientFile)) {
    try { twitchClient = JSON.parse(fs.readFileSync(clientFile, 'utf8')).client_id || ''; } catch {}
  }
  function saveTwitchClient(client) {
    fs.writeFileSync(clientFile + '.tmp', JSON.stringify({ client_id: client }));
    fs.renameSync(clientFile + '.tmp', clientFile);
    twitchClient = client;
  }
  const twitchState = (state) => ({ ...state, client: state.client || twitchClient });
  const automation = new AutomationStore(directory);
  const history = [];
  const seen = new Set();
  const notify = (type, data) => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(type, data);
  };
  function linkedAudio(id) {
    const commands = automation.state.commands.filter((command) =>
      command.reward === id && command.enabled && command.automatically);
    if (commands.length !== 1 || commands[0].actions.length !== 1) return '';
    const action = commands[0].actions[0];
    return action.type === 'media' && mediaKind(action.file) === 'audio' && fs.existsSync(action.file) ? action.file : '';
  }

  function rewardRule(key, id) {
    const rule = rules[key];
    if (!rule?.file) return rule;
    const kind = mediaKind(rule.file);
    return {
      visualFile: kind === 'image' || kind === 'video' ? rule.file : '',
      audioFile: kind === 'audio' ? rule.file : kind === 'image' ? linkedAudio(id) : '',
      volume: rule.volume,
      duration: rule.duration,
    };
  }

  function playback({ visualFile, audioFile, volume, duration }, title) {
    const kind = visualFile && mediaKind(visualFile);
    const visual = ['image', 'video'].includes(kind) && fs.existsSync(visualFile) ? visualFile : '';
    const externalAudio = audioFile && mediaKind(audioFile) === 'audio' && fs.existsSync(audioFile) ? audioFile : '';
    const audio = externalAudio || (!audioFile && visual && kind === 'video' ? visual : '');
    if (!visual && !audio) return null;
    const type = visual ? kind : 'audio';
    const overlayId = randomUUID();
    overlayClips.set(overlayId, { file: visual || audio, type, duration, title });
    if (overlayClips.size > 150) overlayClips.delete(overlayClips.keys().next().value);
    const audioId = audio ? randomUUID() : undefined;
    if (audioId) {
      audioFiles.set(audioId, { file: audio, volume: Math.round(volume * 100), duration, video: audio === visual });
      if (audioFiles.size > 150) audioFiles.delete(audioFiles.keys().next().value);
    }
    return { url: visual ? pathToFileURL(visual).href : '', type, audioId, overlayId, duration };
  }

  async function runCommand(command, context) {
    if (!command?.enabled || !command.actions.length || command.restricted ||
      command.actions.some((action) => action.type === 'unsupported')) throw Error('Comando indisponível nesta versão.');
    for (const action of command.actions) {
      if (action.type === 'media') {
        const media = playback({ audioFile: action.file, volume: action.volume, duration: 120 }, context.title || command.name);
        if (!media) throw Error('O arquivo de mídia do comando não foi encontrado.');
        notify('studio-alert', { ...context, media, test: true });
      } else {
        const variables = { username: context.user, args: context.args || '' };
        const message = action.text.replace(/\$([a-z0-9_]+)/gi, (token, name) => {
          const value = variables[name.toLowerCase()];
          if (value == null) throw Error(`Variável de automação sem valor: ${token}`);
          return value;
        });
        await twitch.send(message);
      }
    }
  }

  function reportAutomation(error) {
    notify('studio-automation-error', error.message);
  }

  function alert(event, test = false, platform = 'twitch') {
    const eventKey = platform + ':' + event.id;
    if (!test && seen.has(eventKey)) return;
    if (!test) {
      seen.add(eventKey);
      if (seen.size > 2048) seen.delete(seen.values().next().value);
    }
    const rule = rewardRule(ruleKey(platform, event.broadcaster_user_id, event.reward.id),
      platform === 'twitch' ? event.reward.id : '');
    const data = { title: event.reward.title, cost: event.reward.cost,
      user: event.user_name, test, at: Date.now(),
      media: rule ? playback(rule, event.reward.title) : null };
    if (test && !data.media) throw Error('A regra salva não tem mídia disponível.');
    const mediaStatus = !rule ? '' : !data.media ? 'Mídia indisponível' :
      rule.visualFile && data.media.type === 'audio' ? 'Visual indisponível · áudio' :
      rule.audioFile && !data.media.audioId ? 'Áudio indisponível · visual' :
      rule.audioFile && rule.visualFile ? 'Visual + áudio separado' :
      { image: 'Visual', audio: 'Áudio', video: 'Vídeo' }[data.media.type];
    if (!test) {
      history.unshift({ ...data, media: undefined, mediaStatus });
      if (history.length > 50) history.pop();
      if (templates.message(automation.state, 'redemption', {usuario: data.user, recompensa: data.title, pontos: data.cost, plataforma: platform})) emit('message', { platform, platformName: (platform === 'kick' ? 'Kick' : 'Twitch') + ' · Resgate',
        id: 'resgate:' + event.id, user: data.user, redemption: true,
        text: templates.message(automation.state, 'redemption', {usuario: data.user, recompensa: data.title, pontos: data.cost, plataforma: platform}) });
    }
    const linked = !test && !rule && platform === 'twitch' ? automation.state.commands.filter((command) =>
      command.enabled && command.automatically && command.reward === event.reward.id) : [];
    notify('studio-alert', { ...data, mediaStatus, historyOnly: linked.length > 0 });
    for (const command of linked) void runCommand(command, data).catch(reportAutomation);
  }

  let wasChatReady = false;
  let timerIndex = 0;
  let timerMessages = 0;
  let timerStart = Date.now();
  let checkingTimer = false;
  let emotesFor;
  const twitch = new Twitch({
    store: twitchStore,
    update: (s) => {
      if (!twitchClient && s.client) {
        twitchClient = s.client;
        try { saveTwitchClient(s.client); } catch {}
      }
      notify('studio-state', twitchState(s));
      refreshViewers();
      if (twitch.chatReady !== wasChatReady) {
        wasChatReady = twitch.chatReady;
        if (wasChatReady) {
          timerStart = Date.now();
          timerMessages = 0;
        }
        startChats();
      }
      if (s.account) emit('status', {
        platform: 'twitch', text: '@' + s.account + ' · ' + s.status,
        state: twitch.chatReady ? 'ok' : 'waiting',
      });
    },
    chat: (event) => {
      if (!transcriptReady()) return;
      const chats = getChats();
      if (emotesFor !== chats.generation) {
        emotesFor = chats.generation;
        chats.emotes('twitch', event.broadcaster_user_id, event.broadcaster_user_id, chats.generation).catch(() => {});
      }
      emit('message', { platform: 'twitch', id: event.message_id,
        user: event.chatter_user_name, login: event.chatter_user_login,
        color: event.color, text: event.message.text,
        emotes: emoteRanges(event.message.fragments), room: event.broadcaster_user_id });
      if (event.chatter_user_id === twitch.user?.user_id) return;
      timerMessages++;
    },
    redemption: alert,
    activity: (kind, event) => { void activity.receive({platform: 'twitch', kind, id: event.followed_at ? event.user_id + ':' + event.followed_at : event.id, channel: event.broadcaster_user_name || event.broadcaster_user_login, user: event.user_name || event.user_login}); },
  });
  const accounts = Object.fromEntries(Object.keys(providers).map((provider) => [provider, new StreamingAccount({
    provider,
    store: new ViewerSecrets(path.join(directory, provider + '-account.secrets'), safeStorage),
    open: (url) => shell.openExternal(url),
    update: (state) => {
      notify('studio-platform', { provider, ...state });
      refreshViewers();
      if (provider === 'kick' && state.account !== kickAccount) {
        kickAccount = state.account;
        if (accounts.kick.account) kickRewards.start(accounts.kick.account.id);
        else kickRewards.stop();
        startChats();
      }
    },
    activity: (event) => { void activity.receive(event); },
    message: (data) => {
      if (transcriptReady()) emit('message', { ...data, platform: 'youtube' });
    },
  })]));
  const kickRewards = new KickRewards(accounts.kick, (event) => alert(event, false, 'kick'),
    (message) => notify('studio-kick-rewards', message));
  const sendPlatform = (provider, text) => provider === 'twitch' ? twitch.send(text) : provider === 'starvios' ? starviosAccount.send(text) : providerAccount(provider).send(text);
  const activity = new PlatformActivity({text: (id, values) => templates.message(automation.state, id, values), send: sendPlatform, report: reportAutomation});
  const starviosAccount = new StarviosAccount({smoke, activity: event => activity.receive(event), report: reportAutomation, channel: getStarviosChannel, connected: saveStarvios,
    save: enabled => automation.save({...automation.state, starviosActivityEnabled: enabled})});
  const kickEvents = new KickEvents({account: accounts.kick, activity: event => activity.receive(event), report: reportAutomation});
  widgetServer.kickEvents = (req, res) => kickEvents.handle(req, res);
  let kickAccount = '';
  const chatAutomation = new ChatAutomation({
    templateMessage: (id, values) => templates.message(automation.state, id, values),
    store: automation,
    send: sendPlatform,
    control: (action, args) => controlSR(action, args),
    isOwner: (message) => message.platform === 'twitch'
      ? Boolean(twitch.user && message.login === twitch.user.login)
      : message.platform === 'kick' ? Boolean(accounts.kick.account && (message.login || message.user)?.toLowerCase() === accounts.kick.account.name.toLowerCase())
      : message.platform === 'starvios' ? Boolean(starviosAccount.account && (message.login || message.user)?.toLowerCase() === starviosAccount.account.name.toLowerCase())
      : Boolean(message.platform === 'youtube' && accounts.youtube.account && message.userId === accounts.youtube.account.id),
    report: (message) => notify('studio-chat-automation', message),
  });
  const chatTimer = setInterval(() => { if (!smoke) void chatAutomation.tick(); }, 1000);
  win.once('closed', () => clearInterval(chatTimer));
  function owner(provider) {
    return provider === 'kick' ? accounts.kick.account?.id : twitch.user?.user_id;
  }
  function ruleKey(provider, channel, reward) {
    return (provider === 'kick' ? 'kick:' : '') + channel + ':' + reward;
  }
  function keyFor(provider, id) {
    if (!['twitch', 'kick'].includes(provider) || !owner(provider) || typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) {
      throw Error('Selecione uma recompensa da conta conectada.');
    }
    return ruleKey(provider, owner(provider), id);
  }
  function providerAccount(provider) {
    if (!Object.hasOwn(accounts, provider)) throw Error('Plataforma inválida.');
    return accounts[provider];
  }
  function alertDraft({ provider = 'twitch', id, visualFile, audioFile, volume, duration, hotkey }) {
    const previous = owner(provider) && rewardRule(ruleKey(provider, owner(provider), id), provider === 'twitch' ? id : '');
    for (const [file, types, saved] of [
      [visualFile, ['image', 'video'], previous?.visualFile],
      [audioFile, ['audio'], previous?.audioFile],
    ]) {
      if (!file) continue;
      if (typeof file !== 'string' || !types.includes(mediaKind(file)) ||
        !(picked.has(file) || saved === file || (provider === 'twitch' && file === audioFile && linkedAudio(id) === file))) {
        throw Error('Escolha os arquivos pelos seletores de mídia.');
      }
      if (!fs.existsSync(file)) throw Error('Um dos arquivos escolhidos não está disponível.');
    }
    return { visualFile: visualFile || '', audioFile: audioFile || '', ...(hotkey?.trim() && { hotkey: hotkey.trim() }),
      volume: Math.min(1, Math.max(0, Number(volume) || 0)),
      duration: Math.min(120, Math.max(1, Number(duration) || 8)) };
  }
  const shortcuts = new Map();
  function configureHotkeys(next) {
    const wanted = new Map();
    for (const [key, rule] of Object.entries(next)) {
      if (!rule.hotkey) continue;
      const previous = wanted.get(rule.hotkey);
      if (previous && previous[1] !== key) throw Error('Este atalho já está em outra regra.');
      if (!previous) wanted.set(rule.hotkey, [key, rule.partner]);
    }
    const added = [];
    try {
      for (const hotkey of wanted.keys()) {
        if (shortcuts.has(hotkey)) continue;
        if (!globalShortcut.register(hotkey, () => {
          const rule = rules[shortcuts.get(hotkey)];
          const title = rule?.title || 'Alerta manual';
          const media = rule && playback(rule, title);
          if (media) notify('studio-alert', { title, user: 'Atalho', test: true, media });
        })) throw Error('Atalho indisponível no Windows.');
        added.push(hotkey);
      }
    } catch (error) {
      for (const hotkey of added) globalShortcut.unregister(hotkey);
      throw error;
    }
    for (const hotkey of shortcuts.keys()) if (!wanted.has(hotkey)) globalShortcut.unregister(hotkey);
    shortcuts.clear();
    for (const [hotkey, [key]] of wanted) shortcuts.set(hotkey, key);
  }
  function saveRules(next) {
    configureHotkeys(next);
    try {
      fs.writeFileSync(config + '.tmp', JSON.stringify(next, null, 2));
      fs.renameSync(config + '.tmp', config);
      rules = next;
    } catch (error) {
      configureHotkeys(rules);
      throw error;
    }
  }
  try { configureHotkeys(rules); } catch (error) { console.warn(error.message); }
  async function tickTimer() {
    const timer = automation.state.timer;
    if (checkingTimer || !twitch.chatReady || !timer?.enabled ||
      timerMessages < timer.minimumMessages || Date.now() - timerStart < timer.minutes * 60000) return;
    const commands = automation.state.commands.filter((command) => command.enabled && command.type === 'timer' && command.automatically);
    if (!commands.length) return;
    checkingTimer = true;
    try {
      const user = twitch.user;
      if (timer.onlyLive && !await twitch.isLive()) return;
      if (user !== twitch.user || !twitch.chatReady) return;
      timerStart = Date.now();
      timerMessages = 0;
      const command = commands[timerIndex++ % commands.length];
      await runCommand(command, { title: command.name, user: user.login });
    } catch (error) {
      timerStart = Date.now();
      reportAutomation(error);
    } finally {
      checkingTimer = false;
    }
  }
  const scheduler = setInterval(tickTimer, 15000);
  win.once('closed', () => clearInterval(scheduler));
  const actions = {
    activityState: () => ({starvios: starviosAccount.snapshot(), kick: accounts.kick.account ? kickEvents.status : 'Conecte a conta Kick', kickReceiver: new URL('/integrations/kick/events', widgetServer.url).href,
      twitch: twitch.snapshot().status, youtube: accounts.youtube.snapshot().status}),
    connectStarviosActivity: () => starviosAccount.open(true),
    disconnectStarviosActivity: () => starviosAccount.disconnect(),
    subscribeKickActivity: () => kickEvents.subscribe(),
    messageTemplates: () => templates.snapshot(automation.state),
    saveMessageTemplates: ({ rows }) => { automation.save({...automation.state, messageTemplates: templates.validate(rows)}); return templates.snapshot(automation.state); },
    chatAutomationState: () => chatAutomation.snapshot(),
    saveMessageTimer: (value) => chatAutomation.saveTimer(value),
    removeMessageTimer: ({ id }) => chatAutomation.removeTimer(id),
    testMessageTimer: async ({ id }) => {
      const timer = chatAutomation.snapshot().timers.find((item) => item.id === id);
      if (!timer) throw Error('Temporizador não encontrado.');
      await chatAutomation.dispatch(timer);
    },
    saveCommandMember: (value) => chatAutomation.saveMember(value),
    saveChatResponse: (value) => chatAutomation.saveResponse(value),
    removeChatResponse: ({ id }) => chatAutomation.removeResponse(id),
    saveSkipVoting: (value) => chatAutomation.saveVoting(value),
    savePromoteCommand: (value) => chatAutomation.savePromoteCommand(value),
    state: () => ({ twitch: twitchState(twitch.snapshot()), history, alertOutput: getAlertOutput(), overlayUrl, obsAudioUrl,
      platforms: Object.fromEntries(Object.entries(accounts).map(([key, account]) => [key, account.snapshot()])) }),
    configureTwitch: ({ client }) => {
      client = String(client || '').trim();
      if (!/^[a-z0-9]{15,64}$/i.test(client)) throw Error('Informe o Client ID do aplicativo público da Twitch.');
      if (twitch.credentials || twitch.pending) throw Error('Desconecte a conta antes de alterar o aplicativo.');
      saveTwitchClient(client);
      notify('studio-state', twitchState(twitch.snapshot()));
    },
    login: async () => {
      if (!twitchClient) throw Error('Configure a Central uma vez em Configuração do aplicativo.');
      await transcriptReady(true);
      return twitch.begin(twitchClient, (url) => shell.openExternal(url));
    },
    disconnect: () => twitch.disconnect(),
    platformConfig: ({ provider, client, secret }) => providerAccount(provider).configure(client, secret),
    importYouTubeClient: async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Selecione o JSON OAuth de aplicativo para computador',
        properties: ['openFile'], filters: [{ name: 'Configuração OAuth', extensions: ['json'] }] });
      if (result.canceled) return;
      const file = result.filePaths[0];
      if (fs.statSync(file).size > 100000) throw Error('O arquivo de configuração é grande demais.');
      const value = JSON.parse(fs.readFileSync(file, 'utf8')).installed;
      if (!value?.client_id || !value?.client_secret) throw Error('Selecione o JSON de um cliente OAuth para computador.');
      accounts.youtube.configure(value.client_id, value.client_secret);
    },
    platformLogin: async ({ provider }) => {
      const account = providerAccount(provider);
      await transcriptReady(true);
      return account.begin();
    },
    platformDisconnect: ({ provider }) => providerAccount(provider).disconnect(),
    portal: ({ provider }) => {
      if (provider === 'twitch') return shell.openExternal('https://dev.twitch.tv/console/apps');
      if (provider === 'starvios') return shell.openExternal('https://starvios.com/');
      return shell.openExternal(providerAccount(provider).provider.portal);
    },
    saveStarvios: async ({ channel }) => {
      await transcriptReady(true);
      return saveStarvios(channel);
    },
    send: async ({ message, targets }) => {
      const selected = Array.isArray(targets) ? [...new Set(targets)] : [];
      if (!selected.length || selected.some((name) => !['twitch', 'kick', 'youtube', 'starvios'].includes(name))) throw Error('Selecione os destinos da mensagem.');
      return Promise.all(selected.map(async (provider) => {
        try {
          await sendPlatform(provider, message);
          return { provider, sent: true };
        } catch (error) {
          return { provider, sent: false, message: error.message };
        }
      }));
    },
    audioOutputs: async () => (await automationOutputs()).map((output) => output.nome).filter(Boolean),
    saveAlertOutput: async ({ output }) => {
      if (output !== '' && output !== '@obs' && !(await actions.audioOutputs()).includes(output)) throw Error('Saída indisponível.');
      setAlertOutput(output);
    },
    playAlertAudio: async ({ id }) => {
      const clip = audioFiles.get(id);
      if (!clip) throw Error('Áudio indisponível.');
      audioFiles.delete(id);
      const output = getAlertOutput();
      if (output === '@obs') return widgetServer.alertAudio.play(id, clip);
      nativeAudio.add(id);
      try {
        return await automationAudio('automation-play', { ...clip, id, output });
      } finally {
        nativeAudio.delete(id);
      }
    },
    stopAlertAudio: ({ id }) => {
      if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) return;
      widgetServer.alertAudio.hide(id);
      if (nativeAudio.has(id)) return automationAudio('automation-stop', { id });
    },
    copyAlertOverlay: () => clipboard.writeText(overlayUrl),
    copyObsAlertAudio: () => clipboard.writeText(obsAudioUrl),
    testObsAlertAudio: () => widgetServer.alertAudio.play(randomUUID(), {
      file: path.join(__dirname, 'assets', 'Alert 1.wav'), duration: 8, volume: 40,
    }),
    showAlertOverlay: ({ id }) => {
      const clip = overlayClips.get(id);
      if (!clip) return;
      overlayClips.delete(id);
      widgetServer.alertOverlay.show(id, clip);
    },
    hideAlertOverlay: ({ id }) => widgetServer.alertOverlay.hide(id),
    rewards: async ({ provider = 'twitch' }) => {
      const rewards = provider === 'kick' ? await kickRewards.list() : await twitch.rewards();
      return rewards.map(({ id, title, cost, is_enabled }) => {
        const key = keyFor(provider, id);
        const rule = rewardRule(key, provider === 'twitch' ? id : '');
        return { id, title, cost, key, enabled: is_enabled, rule, linkedAudio: provider === 'twitch' ? linkedAudio(id) : '' };
      });
    },
    pick: async ({ kind }) => {
      const types = kind === 'audio' ? ['audio'] : ['image', 'video'];
      const result = await dialog.showOpenDialog(win, { properties: ['openFile'],
        filters: [{ name: kind === 'audio' ? 'Áudio' : 'Vídeo, GIF ou imagem',
          extensions: types.flatMap((type) => Object.keys(FORMATS[type])) }] });
      const file = result.filePaths[0];
      if (!result.canceled && file && types.includes(mediaKind(file))) {
        picked.add(file);
        return file;
      }
      return '';
    },
    rule: ({ provider = 'twitch', id, title, partner, remove, ...draft }) => {
      const key = keyFor(provider, id);
      const next = { ...rules };
      const other = next[key]?.partner;
      if (remove) {
        delete next[key];
        if (other && next[other]?.partner === key) delete next[other];
      }
      else {
        const rule = { ...alertDraft({ provider, id, ...draft }), title: String(title || '').slice(0, 100) };
        if (!rule.visualFile && !rule.audioFile) throw Error('Escolha pelo menos um arquivo.');
        next[key] = rule;
        if (other && next[other]?.partner === key) {
          const { partner: ignored, hotkey, ...rest } = next[other];
          next[other] = rest;
        }
        if (partner || (partner === null && other)) {
          const partnerKey = partner === null ? other : keyFor(provider === 'kick' ? 'twitch' : 'kick', partner);
          if (next[partnerKey]?.partner && next[partnerKey].partner !== key) throw Error('A recompensa escolhida já está vinculada a outra regra.');
          next[key] = { ...rule, partner: partnerKey };
          next[partnerKey] = { ...rule, partner: key };
        }
      }
      saveRules(next);
    },
    createRewards: async ({ title, cost, description, targets, ...draft }) => {
      title = String(title || '').trim();
      description = String(description || '').trim();
      cost = Number(cost);
      if (!title || title.length > 45 || description.length > 200 || !Number.isSafeInteger(cost) || cost < 1) throw Error('Preencha um nome de até 45 caracteres e um custo inteiro positivo.');
      if (!Array.isArray(targets) || !targets.length || targets.some((name) => !['twitch','kick'].includes(name) || !owner(name))) throw Error('Conecte as contas escolhidas antes de criar.');
      const { hotkey, ...rule } = alertDraft(draft);
      if (!rule.visualFile && !rule.audioFile) throw Error('Escolha a mídia do alerta.');
      const results = [];
      for (const provider of new Set(targets)) {
        try {
          const result = await (provider === 'kick' ? kickRewards.create(title, cost, description) : twitch.createReward(title, cost, description));
          if (!result?.id) throw Error('A plataforma não retornou o ID da recompensa.');
          const key = keyFor(provider, result.id);
          saveRules({ ...rules, [key]: { ...rule, title } });
          results.push({ provider, key, id: result.id });
        } catch (error) { results.push({ provider, message: error.message }); }
      }
      if (results.length === 2 && results.every((result) => result.key)) {
        const [left, right] = results;
        saveRules({ ...rules, [left.key]: { ...rules[left.key], partner: right.key },
          [right.key]: { ...rules[right.key], partner: left.key } });
      }
      return results.map(({ provider, id, message }) => ({ provider, id, message }));
    },
    test: ({ provider = 'twitch', id, title, cost }) => {
      keyFor(provider, id);
      alert({ broadcaster_user_id: owner(provider), reward: { id, title, cost }, user_name: 'Teste local' }, true, provider);
    },
    preview: (draft) => {
      const media = playback(alertDraft(draft), 'Teste de alerta');
      if (!media) throw Error('Arquivo indisponível.');
      notify('studio-alert', { title: 'Prévia de mídia', user: 'Teste local', test: true, media });
    },
    automationList: ({ collection, search }) => automation.list(collection, String(search || '').slice(0, 80)),
    automationRun: ({ id, args }) => {
      const command = automation.state.commands.find((item) => item.id === id);
      return runCommand(command, { title: command?.name, user: twitch.user?.login || 'Operador',
        args: String(args || '').slice(0, 500) });
    },
    createCommand: (value) => chatAutomation.saveResponse(value),
  };

  ipcMain.handle('studio', (event, action, args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error('Janela inválida.');
    if (!Object.hasOwn(actions, action)) throw Error('Ação inválida.');
    return actions[action](args || {});
  });

  return {
    templateMessage: (id, values) => templates.message(automation.state, id, values),
    announceSong: async (item, targets) => {
      const message = templates.message(automation.state, 'sr', {usuario: item.user || 'Operador', musica: item.titulo || 'Sem título'});
      if (!message) return;
      const selected = (targets || []).filter((provider) => provider === 'twitch'
        ? Boolean(twitch.user) : provider === 'starvios' ? Boolean(starviosAccount.account) : Boolean(accounts[provider]?.account));
      if (!selected.length) return;
      const results = await actions.send({ message, targets: selected });
      const failures = results.filter((result) => !result.sent);
      if (failures.length) throw Error(failures.map((result) => result.provider + ': ' + result.message).join(' | '));
    },
    receiveMessage: (message) => { void chatAutomation.receive(message); },
    resetSkipVotes: () => chatAutomation.resetVotes(),
    twitch,
    kickChannel: () => accounts.kick.account?.name || '',
    viewerSession(provider) {
      if (provider === 'twitch' && twitch.user) {
        const user = twitch.user;
        return { channel: user.login, read: async () => {
          const result = await twitch.authorized('https://api.twitch.tv/helix/streams?user_id=' + encodeURIComponent(user.user_id));
          const stream = result.data?.[0];
          return stream ? { state: 'live', count: stream.viewer_count } : { state: 'offline', count: 0 };
        } };
      }
      const account = accounts[provider];
      if (!account?.account) return null;
      return { channel: account.account.name, read: async () => {
        if (provider === 'kick') {
          const result = await account.api('channels');
          const stream = result.data?.[0]?.stream;
          if (typeof stream?.is_live !== 'boolean') throw Error('Estado da transmissão Kick indisponível.');
          return stream.is_live ? { state: 'live', count: stream.viewer_count } : { state: 'offline', count: 0 };
        }
        const live = await account.api('liveBroadcasts?part=snippet,status&broadcastType=all&broadcastStatus=active&maxResults=50');
        const ids = live.items?.filter((item) => item.status?.lifeCycleStatus === 'live' &&
          item.snippet?.channelId === account.account?.id).map((item) => item.id) || [];
        if (!ids.length) return { state: 'offline', count: 0 };
        const videos = await account.api('videos?' + new URLSearchParams({ part: 'liveStreamingDetails', id: ids.join(',') }));
        const counts = (videos.items || []).map((item) => item.liveStreamingDetails?.concurrentViewers);
        if (counts.length !== ids.length || counts.some((value) => !/^\d+$/.test(value))) throw Error('O YouTube ainda não informou a contagem.');
        return { state: 'live', count: counts.reduce((total, value) => total + Number(value), 0) };
      } };
    },
    resume: () => {
      if (!smoke) return Promise.allSettled([...(automation.state.starviosActivityEnabled ? [starviosAccount.open(false)] : []), twitch.resume(), ...Object.values(accounts).map((account) => account.resume())]);
    },
    stop: () => {
      clearInterval(chatTimer);
      twitch.stop();
      kickRewards.stop();
      starviosAccount.stop();
      for (const hotkey of shortcuts.keys()) globalShortcut.unregister(hotkey);
      for (const account of Object.values(accounts)) account.stop();
    },
  };
}

module.exports = { installStudio, importKaiaPreferences };
