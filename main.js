const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  Tray,
  Menu,
  clipboard,
  screen,
  safeStorage,
} = require('electron');
app.disableHardwareAcceleration();
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { Chats } = require('./services');
const { channel } = require('./protocol');
const { normalizeAppearance } = require('./appearance');
const { normalizeBlockedUsers, isBlocked } = require('./blocking');
const { normalizeTiming } = require('./timing');
const { normalizeCustom } = require('./custom');
const { Transcript } = require('./transcript');
const { WidgetServer, normalizeWidget } = require('./widget-server');
const widgetServer = new WidgetServer();
const { ViewerMonitor, normalizeViewers } = require('./viewers');
const { ViewerSecrets } = require('./viewer-secrets');
let viewerMonitor,
  viewerSecrets,
  viewerCredentials = {};
const { installMedia } = require('./media');
const locale = require('./i18n');
const { voiceForLanguage } = require('./voice-catalog');
const { createChatWindow } = require('./chat-window');
const { installStudio, importKaiaPreferences } = require('./studio');
const t = (text) => locale.translate(text, settings.language);
let media;
let displayMode;
let widgetWindow,
  collapsed = false;
const { execFile } = require('child_process');
let availableFonts = [
  'Segoe UI',
  'Arial',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Consolas',
  'Trebuchet MS',
  'Times New Roman',
];
function refreshFonts() {
  const file = path.join(app.getPath('userData'), 'fonts-cache.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(cached.fonts))
      availableFonts = [
        ...new Set([...availableFonts, ...cached.fonts]),
      ].sort();
    if (Date.now() - Number(cached.at) < 86400000) return;
  } catch {}
  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Add-Type -AssemblyName System.Drawing; @((New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object Name | Sort-Object -Unique) | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 },
    (error, stdout) => {
      if (error) return;
      try {
        const found = JSON.parse(stdout);
        if (!Array.isArray(found)) return;
        availableFonts = [...new Set([...availableFonts, ...found])].sort();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(
          file,
          JSON.stringify({ at: Date.now(), fonts: availableFonts }),
        );
        emit('fonts', availableFonts);
      } catch {}
    },
  );
}
app.setName('Central de Live');
const smoke = process.argv.includes('--smoke-test');
if (!smoke && !app.requestSingleInstanceLock()) app.exit(0);
let win,
  chats,
  tray,
  locked = false,
  overlay = false;
let settings = {
  language: 'pt-BR',
  twitch: { channel: '', enabled: true, sound: 'Alert 1.wav', volume: 0.5 },
  kick: { channel: '', enabled: true, sound: 'Alert 2.wav', volume: 0.5 },
  starvios: { channel: '', enabled: false, sound: 'Alert 3.wav', volume: 0.5 },
  custom: { ...normalizeCustom(), sound: 'Alert 3 (Low).wav', volume: 0.5 },
  transcriptPath: '',
  background: 0.8,
  fontSize: 18,
  sounds: true,
};
if (smoke) {
  const testPath = path.join(
    app.getPath('temp'),
    'kaia-chat-smoke-' + process.pid,
  );
  fs.mkdirSync(testPath, { recursive: true });
  app.setPath('userData', testPath);
}
settings.appearance = normalizeAppearance();
settings.blockedUsers = normalizeBlockedUsers();
settings.timing = normalizeTiming();
settings.widget = normalizeWidget();
const config = () => path.join(app.getPath('userData'), 'settings.json');
let studio;
function startChats() {
  if (!transcript.file || transcript.failed) return;
  const twitch = studio?.twitch;
  const ownChannel = twitch?.chatReady && twitch.user.login === channel(settings.twitch.channel);
  const connectedKick = studio?.kickChannel();
  chats.start({
    ...settings,
    twitch: ownChannel ? { ...settings.twitch, enabled: false } : settings.twitch,
    kick: connectedKick ? { ...settings.kick, enabled: true, channel: connectedKick } : settings.kick,
  });
}
const assets = path.join(__dirname, 'assets');
const transcript = new Transcript((state) => {
  emit('transcript-status', state);
  if (state.state === 'error') {
    chats?.stop();
    for (const platform of ['twitch', 'kick', 'starvios', 'custom'])
      emit('status', {
        platform,
        state: 'error',
        text: 'Backup interrompido · escolha outro TXT e reconecte',
      });
  }
});
async function chooseTranscript() {
  const picked = await dialog.showSaveDialog(win, {
    title: t('Escolha onde salvar todo o chat em TXT'),
    defaultPath:
      settings.transcriptPath ||
      path.join(
        app.getPath('documents'),
        'KaiaChat-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt',
      ),
    filters: [{ name: t('Transcrição do chat'), extensions: ['txt'] }],
    buttonLabel: t('Usar este TXT'),
  });
  if (picked.canceled || !picked.filePath) return null;
  const file =
    path.extname(picked.filePath).toLowerCase() === '.txt'
      ? picked.filePath
      : picked.filePath + '.txt';
  await transcript.open(file);
  settings.transcriptPath = file;
  return file;
}
function decorated() {
  return {
    ...settings,
    viewers: normalizeViewers(settings.viewers),
    viewerCredentials: Object.fromEntries(
      ['twitch', 'kick'].map((p) => [p, !!viewerCredentials[p]]),
    ),
    viewerSnapshot: viewerMonitor?.snapshot(),
    viewerUrl: widgetServer.url?.replace('widget.html', 'viewers-widget.html'),
    ...media?.info(),
    widget: normalizeWidget(settings.widget),
    widgetUrl: widgetServer.url,

    displayState: displayMode?.state(),
    appearance: normalizeAppearance(settings.appearance),
    blockedUsers: normalizeBlockedUsers(settings.blockedUsers),
    timing: normalizeTiming(settings.timing),
    fonts: availableFonts,
    soundFiles: fs.readdirSync(assets).filter((n) => /\.wav$/i.test(n)),
    soundUrls: Object.fromEntries(
      ['twitch', 'kick', 'starvios', 'custom'].map((p) => [
        p,
        pathToFileURL(
          path.isAbsolute(settings[p].sound)
            ? settings[p].sound
            : path.join(assets, settings[p].sound),
        ).href,
      ]),
    ),
  };
}
function emit(type, data) {
  if (type === 'sr-state' && Object.hasOwn(data, 'current_track_key')) {
    const identity = data.current_track_key;
    if (identity !== emit.lastSong) { emit.lastSong = identity; studio?.resetSkipVotes(); }
  }
  if (type === 'settings' && 'overlay' in data && win && !win.isDestroyed()) {
    win.setOverlayMode(data.overlay);
    win.setTitleBarOverlay(
      data.overlay
        ? { color: '#00000000', symbolColor: '#00000000', height: 1 }
        : { color: '#0d1019', symbolColor: '#eeeeee', height: 47 },
    );
  }
  if (type === 'message') transcript.append(data);
  if (
    type === 'message' &&
    isBlocked(settings.blockedUsers, data.platform, data.login || data.user)
  )
    return;
  if (win && !win.isDestroyed()) win.webContents.send(type, data);
  widgetServer.event(type, data);
  if (type === 'message') studio?.receiveMessage(data);
  if (!data.redemption) media?.receive(type, data);
}
app.whenReady().then(async () => {
  refreshFonts();
  if (!smoke) {
    try {
      const imported = importKaiaPreferences(app, config());
      const s = imported || JSON.parse(fs.readFileSync(config(), 'utf8'));
      settings = {
        ...settings,
        ...s,
        twitch: { ...settings.twitch, ...s.twitch },
        kick: { ...settings.kick, ...s.kick },
        starvios: { ...settings.starvios, ...s.starvios },
        custom: { ...settings.custom, ...s.custom },
      };
    } catch {}
  }
  if (!smoke && !settings.transcriptPath) {
    settings.transcriptPath = path.join(app.getPath('userData'), 'chat.txt');
  }
  settings.widget = normalizeWidget(settings.widget);
  settings.viewers = normalizeViewers(settings.viewers);
  viewerSecrets = new ViewerSecrets(
    path.join(app.getPath('userData'), 'viewers.secrets'),
    safeStorage,
  );
  try {
    viewerCredentials = viewerSecrets.load();
  } catch {
    viewerCredentials = {};
  }
  viewerMonitor = new ViewerMonitor({
    secrets: viewerCredentials,
    sessionFor: (platform) => studio?.viewerSession(platform),
    emit: (s) => {
      widgetServer.viewerSnapshot = s;
      if (win && !win.isDestroyed()) win.webContents.send('viewers', s);
    },
  });
  widgetServer.getViewers = () => viewerMonitor.snapshot();
  settings.language = locale.normalize(settings.language);
  settings.timing = normalizeTiming(settings.timing);
  settings.appearance = normalizeAppearance(settings.appearance);
  await widgetServer.start(smoke ? 0 : 19349, settings.widgetToken);
  settings.widgetToken = widgetServer.token;
  fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
  widgetServer.update(settings);
  const syncWidget = () => {
    media?.prune();
    widgetServer.update(settings);
    widgetServer.prune(
      (m) => !isBlocked(settings.blockedUsers, m.platform, m.login || m.user),
    );
  };
  const workArea = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  win = createChatWindow({
    title: 'Central de Live',
    width: Math.min(510, workArea.width),
    height: Math.min(860, workArea.height),
    minWidth: Math.min(320, workArea.width),
    minHeight: Math.min(240, workArea.height),
    transparent: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d1019', symbolColor: '#eeeeee', height: 47 },
    resizable: true,
    maximizable: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.setAlwaysOnTop(true);
  media = installMedia({
    win,
    directory: path.join(app.getPath('userData'), 'media'),
    getSettings: () => settings,
    saveSettings: () =>
      fs.writeFileSync(config(), JSON.stringify(settings, null, 2)),
    emit,
    widgetServer,
    smoke,
    templateMessage: (id, values) => studio?.templateMessage(id, values),
    announceChat: (item, targets) => studio?.announceSong(item, targets),
  });
  win.setMaximizable(true);
  displayMode = {
    get active() {
      return win.isMaximized();
    },
    enter: () => win.maximize(),
    exit: () => {
      if (win.isMaximized()) win.unmaximize();
    },
    state: () => ({ active: win.isMaximized(), snapped: win.isSnapped() }),
  };
  for (const event of ['maximize', 'unmaximize', 'resize'])
    win.on(event, () =>
      setImmediate(() => {
        if (!win.isDestroyed()) emit('display-state', displayMode.state());
      }),
    );
  ipcMain.handle('display', (_, action) => {
    if (action === 'enter' || (action === 'toggle' && !displayMode.active))
      displayMode.enter();
    else if (action === 'exit' || action === 'toggle') displayMode.exit();
    emit('display-state', displayMode.state());
    return decorated();
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    if (input.key === 'F11') {
      event.preventDefault();
      if (displayMode.active) displayMode.exit();
      else displayMode.enter();
      emit('display-state', displayMode.state());
    } else if (input.key === 'Escape' && displayMode.active) {
      event.preventDefault();
      displayMode.exit();
      emit('display-state', displayMode.state());
    }
  });
  win.on('closed', () => app.quit());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  chats = new Chats(emit);
  let openingTranscript;
  let viewerConnections = '';
  studio = installStudio({
    win, directory: app.getPath('userData'), startChats, emit, smoke, widgetServer, getChats: () => chats,
    getAlertOutput: () => settings.automationAudioOutput || '',
    setAlertOutput: (output) => {
      settings.automationAudioOutput = output;
      fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    },
    automationOutputs: () => media.automationOutputs(),
    automationAudio: (action, data) => media.automationAudio(action, data),
    controlSR: (action, args) => media.controlSR(action, args),
    refreshViewers: () => {
      if (smoke || !studio) return;
      const channels = ['twitch', 'kick', 'youtube'].map((platform) => studio.viewerSession(platform)?.channel || '').join('|');
      if (channels === viewerConnections) return;
      viewerConnections = channels;
      viewerMonitor.configure(settings);
    },
    getStarviosChannel: () => settings.starvios?.channel || '',
    saveStarvios: (value) => {
      const name = channel(String(value || '').replace(
        /^https?:\/\/(?:www\.)?starvios\.com\/(?:popout\/chat\/)?/i, '',
      ));
      if (!name) throw Error('Informe o nome ou URL do canal Starvios.');
      settings.starvios = { ...settings.starvios, channel: name, enabled: true };
      fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
      startChats();
      emit('settings', decorated());
      return name;
    },
    transcriptReady: (create) => {
      if (!create) return Boolean(transcript.file && !transcript.failed);
      if (transcript.file && !transcript.failed) return;
      openingTranscript ||= transcript.open(settings.transcriptPath || path.join(app.getPath('userData'), 'chat.txt'))
        .then(() => startChats()).finally(() => { openingTranscript = null; });
      return openingTranscript;
    },
  });
  ipcMain.handle('load', () => decorated());
  ipcMain.handle('voices', () => require('./voices.json'));
  ipcMain.handle('save-language', (_, language) => {
    if (!locale.languages.some((item) => item.code === language))
      throw Error('Idioma inválido.');
    settings.language = language;
    settings.reader.voice = voiceForLanguage(language, settings.reader.voice);
    media?.languageChanged();
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    updateTray();
    emit('language', language);
    return language;
  });
  ipcMain.handle('save-widget', (_, value) => {
    settings.widget = normalizeWidget(value);
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    syncWidget();
    return decorated();
  });
  ipcMain.handle('save-viewers', (_, value) => {
    const options = normalizeViewers(value.options);
    const credentials = { ...viewerCredentials };
    for (const p of ['twitch', 'kick']) {
      const change = value.credentials?.[p];
      if (change?.forget) delete credentials[p];
      else if (change?.secret)
        credentials[p] = String(change.secret).trim().slice(0, 4000);
    }
    viewerSecrets.save(credentials);
    viewerCredentials = credentials;
    viewerMonitor.secrets = credentials;
    viewerMonitor.tokens = {};
    settings.viewers = options;
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    viewerMonitor.configure(settings);
    return decorated();
  });
  ipcMain.handle('copy-viewers', (_, kind) => {
    if (
      !['all', 'total', 'twitch', 'kick', 'youtube', 'starvios', 'custom'].includes(kind)
    )
      throw Error('Contador inválido.');
    clipboard.writeText(
      widgetServer.url.replace('widget.html', 'viewers-widget.html') +
        '?platform=' +
        kind,
    );
  });
  ipcMain.handle('copy-widget', () => clipboard.writeText(widgetServer.url));
  ipcMain.handle('popup-widget', async () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.show();
      return;
    }
    widgetWindow = new BrowserWindow({
      width: 500,
      height: 650,
      title: 'Kaia Chat — Widget',
      backgroundColor: '#181b24',
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    widgetWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    widgetWindow.webContents.on('will-navigate', (e) => e.preventDefault());
    await widgetWindow.loadURL(widgetServer.url);
  });
  ipcMain.handle('choose-transcript', async () => {
    const file = await chooseTranscript();
    if (!file) return null;
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save-timing', (_, value) => {
    settings.timing = normalizeTiming(value);
    syncWidget();
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save-blocked', (_, lists) => {
    settings.blockedUsers = normalizeBlockedUsers(lists);
    syncWidget();
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save-appearance', (_, s) => {
    settings.appearance = normalizeAppearance(s.appearance);
    settings.fontSize = Math.min(36, Math.max(12, Number(s.fontSize) || 18));
    settings.background = Math.min(1, Math.max(0, Number(s.background) || 0));
    syncWidget();
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    return decorated();
  });
  ipcMain.handle('save', async (_, s) => {
    const custom = normalizeCustom(s.custom ?? settings.custom);
    const blockedUsers = normalizeBlockedUsers(
      s.blockedUsers ?? settings.blockedUsers,
    );
    if (!transcript.file || transcript.failed) {
      if (!(await chooseTranscript()))
        throw Error(
          'Escolha um arquivo TXT antes de conectar para manter o backup do chat.',
        );
    }
    for (const p of ['twitch', 'kick', 'starvios', 'custom']) {
      const c = p === 'custom' ? custom.channel : channel(s[p]?.channel);
      const sound = String(s[p]?.sound || settings[p].sound);
      if (
        !path.isAbsolute(sound) &&
        !fs.existsSync(path.join(assets, path.basename(sound)))
      )
        throw Error('Som inválido');
      settings[p] = {
        ...settings[p],
        channel: c,
        enabled: !!s[p].enabled,
        sound: path.isAbsolute(sound) ? sound : path.basename(sound),
        volume: Math.min(1, Math.max(0, Number(s[p].volume) || 0)),
      };
    }
    settings.custom = { ...settings.custom, ...custom };
    settings.background = Math.min(1, Math.max(0, Number(s.background) || 0));
    settings.fontSize = Math.min(36, Math.max(12, Number(s.fontSize) || 18));
    settings.sounds = !!s.sounds;
    settings.appearance = normalizeAppearance(s.appearance);
    settings.blockedUsers = blockedUsers;
    settings.timing = normalizeTiming(s.timing ?? settings.timing);
    syncWidget();
    fs.writeFileSync(config(), JSON.stringify(settings, null, 2));
    startChats();
    viewerMonitor.configure(settings);
    return decorated();
  });
  ipcMain.handle('choose', async (_, p) => {
    if (!['kick', 'twitch', 'starvios', 'custom'].includes(p)) return;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: t('Áudio'), extensions: ['wav', 'mp3', 'ogg', 'm4a'] }],
    });
    if (!r.canceled)
      return { path: r.filePaths[0], url: pathToFileURL(r.filePaths[0]).href };
  });
  const lock = () => {
    locked = !locked;
    win.setIgnoreMouseEvents(locked, { forward: true });
    win.setFocusable(!locked);
    if (locked) {
      overlay = true;
      emit('settings', { overlay: true });
      win.blur();
    }
  };
  const restore = () => {
    displayMode.exit();
    emit('display-state', displayMode.state());
    locked = false;
    overlay = false;
    collapsed = false;
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    emit('settings', { overlay: false, collapsed: false, restore: true });
    win.show();
    win.focus();
  };
  ipcMain.on('window', (_, a) => {
    if (a === 'close') win.close();
    if (a === 'minimize') win.minimize();
    if (a === 'lock') lock();
    if (a === 'hide') {
      overlay = true;
      locked = true;
      emit('settings', { overlay: true });
      win.setIgnoreMouseEvents(true, { forward: true });
      win.blur();
      win.setFocusable(false);
      if (!win.isVisible()) win.showInactive();
    }
    if (a === 'restore') restore();
    if (a === 'settings') {
      collapsed = !collapsed;
      emit('settings', { collapsed });
    }
    if (a === 'overlay') {
      overlay = !overlay;
      locked = overlay;
      win.setIgnoreMouseEvents(locked, { forward: true });
      win.setFocusable(!locked);
      if (locked) win.blur();
      emit('settings', { overlay });
    }
    if (a === 'clear') emit('settings', { clear: true });
  });
  globalShortcut.register('CommandOrControl+Shift+F10', lock);
  globalShortcut.register('CommandOrControl+Shift+F9', restore);
  tray = new Tray(path.join(assets, 'icon.png'));
  function updateTray() {
    tray.setToolTip(t('Kaia Chat — Ctrl+Shift+F9 para configurar'));
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: t('Abrir configurações / liberar cliques'),
          click: restore,
        },
        { label: t('Sair'), click: () => app.quit() },
      ]),
    );
  }
  updateTray();
  viewerMonitor.configure(smoke ? { viewers: { enabled: false } } : settings);
  await win.loadFile('index.html');
  if (smoke) {
    settings.transcriptPath = path.join(
      app.getPath('userData'),
      'chat-test.txt',
    );
    await transcript.open(settings.transcriptPath);
    emit('message', {
      platform: 'kick',
      id: 'test-k',
      user: 'CanalExemplo',
      text: 'Kick conectada — teste de leitura 💚',
      color: '#53fc18',
    });
    emit('message', {
      platform: 'twitch',
      id: 'test-t',
      user: 'KaiaBot',
      text: 'Twitch e Kick no mesmo painel 💜',
      color: '#b59aff',
    });
    for (const p of ['kick', 'twitch', 'starvios'])
      emit('status', { platform: p, text: 'Teste visual', state: 'ok' });
    setTimeout(
      () => require('./smoke')(win, app, emit, config, transcript),
      1800,
    );
  } else if (settings.transcriptPath) {
    try {
      await transcript.open(settings.transcriptPath);
      startChats();
      viewerMonitor.configure(settings);
    } catch {
      emit('transcript-status', {
        state: 'error',
        text: 'Escolha outro TXT antes de conectar. O arquivo anterior não pôde ser aberto.',
      });
    }
  } else
    for (const platform of ['twitch', 'kick', 'starvios', 'custom'])
      emit('status', {
        platform,
        text: 'Escolha o TXT e conecte',
        state: 'off',
      });
  if (!smoke) void studio.resume();
});
app.on('window-all-closed', () => app.quit());
let finishedQuit = false;
app.on('before-quit', (event) => {
  if (finishedQuit) return;
  event.preventDefault();
  studio?.stop();
  chats?.stop();
  viewerMonitor?.stop();
  Promise.allSettled([transcript.flush(), media?.close()]).finally(() => {
    finishedQuit = true;
    app.quit();
  });
});
app.on('will-quit', () => {
  widgetServer.close();
  chats?.stop();
  globalShortcut.unregisterAll();
});
