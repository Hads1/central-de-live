const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'),
  pkg = require('../package.json');
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw Error('Gere esta distribuição em Windows x64.');
const name = `Central-de-Live-${pkg.version}-Windows-x64`,
  dist = path.join(root, 'dist'),
  stage = path.join(dist, name),
  zip = stage + '.zip';
if (fs.existsSync(stage) || fs.existsSync(zip))
  throw Error(
    'A versão já foi empacotada em dist. Use uma nova versão ou mova a distribuição anterior.',
  );
fs.mkdirSync(stage, { recursive: true });
fs.cpSync(path.join(root, 'node_modules/electron/dist'), stage, {
  recursive: true,
});
fs.renameSync(
  path.join(stage, 'electron.exe'),
  path.join(stage, 'Central de Live.exe'),
);
const appDir = path.join(stage, 'resources/app');
fs.mkdirSync(path.join(appDir, 'node_modules'), { recursive: true });
const source = [
  'chat-window.js',
  'layout-template.js',
  'socket-health.js',
  'connection-refresh.js',
  'i18n.js',
  'i18n-data.js',
  'i18n-ui.js',
  'voices.json',
  'voices-ui.js',
  'voice-catalog.js',
  'sr-shortcuts.js',
  'sr-settings-ui.js',
  'alerts.js',
  'alerts-preload.js',
  'alerts-ui.js',
  'connections-ui.js',
  'message-templates.js',
  'message-templates.test.js',
  'platform-activity.test.js',
  'platform-activity.js',
  'kick-events.js',
  'starvios-account.js',
  'media-cleanup.js',
  'reader.js',
  'player-ui.js',
  'youtube-session.js',
  'media.js',
  'media-backend.js',
  'media-ui.js',
  'spotify.js',
  'sr-assets.js',
  'backend',
  'vendor',
  '.runtime',
  'main.js',
  'studio.js',
  'chat-automation.js',
  'chat-automation-ui.js',
  'chat-automation.test.js',
  'studio-ui.js',
  'twitch-live.js',
  'streaming-accounts.js',
  'kick-rewards.js',
  'automation-store.js',
  'alert-overlay.js',
  'alert-overlay-ui.js',
  'alert-overlay.html',
  'alert-overlay.css',
  'CENTRAL-DE-LIVE.md',
  'viewers.js',
  'viewers.test.js',
  'viewer-secrets.js',
  'viewers-ui.js',
  'viewers-render.js',
  'viewers-widget.js',
  'viewers-widget.html',
  'viewers.css',
  'display-ui.js',
  'widget-server.js',
  'widget.html',
  'widget.js',
  'widget.css',
  'widget-ui.js',
  'preload.js',
  'renderer.js',
  'services.js',
  'starvios.js',
  'protocol.js',
  'appearance.js',
  'blocking.js',
  'blocked-ui.js',
  'timing.js',
  'timing-ui.js',
  'custom.js',
  'transcript.js',
  'custom-ui.js',
  'typography.js',
  'smoke.js',
  'live-test.js',
  'test.js',
  'index.html',
  'style.css',
  'package.json',
  'package-lock.json',
  'LICENSE',
  'CREDITOS.md',
  'README.md',
  'LEIA-ME.md',
  '.prettierrc.json',
  '.prettierignore',
  '.gitignore',
  '.gitattributes',
  'assets',
  'scripts',
  'docs',
];
for (const file of source)
  fs.cpSync(path.join(root, file), path.join(appDir, file), {
    recursive: true,
    filter: (source) =>
      !['aprendizado', 'tmp_sr', 'tmp_audio'].includes(path.basename(source)) &&
      !source.includes('__pycache__') &&
      !/\.(?:pyc|secrets|enc|log|db3|miu3)$/i.test(source) &&
      !/^(?:central_automacoes|kaia_(?:leitura|musica|tts))\.exe$/i.test(path.basename(source)) &&
      !(
        path.relative(root, source).startsWith('.runtime' + path.sep) &&
        path.relative(root, source).split(path.sep).includes('tests')
      ),
  });
for (const dep of Object.keys(pkg.dependencies))
  fs.cpSync(
    path.join(root, 'node_modules', dep),
    path.join(appDir, 'node_modules', dep),
    { recursive: true },
  );
for (const file of ['README.md', 'CENTRAL-DE-LIVE.md', 'CREDITOS.md'])
  fs.copyFileSync(path.join(root, file), path.join(stage, file));
fs.copyFileSync(
  path.join(root, 'LICENSE'),
  path.join(stage, 'LICENSE-KAIA-GPLv3.txt'),
);
fs.writeFileSync(
  path.join(stage, 'COMECE-AQUI.txt'),
  `CENTRAL DE LIVE ${pkg.version} — WINDOWS 10/11 x64\r\n\r\nExtraia o ZIP inteiro e abra Central de Live.exe.\r\nUse Conexões e resgates para vincular as contas e configurar mini alertas.\r\nO guia CENTRAL-DE-LIVE.md explica o login, o widget e as fontes de áudio para OBS.\r\nMantenha o executável junto aos demais arquivos da pasta.\r\nOs dados de uso ficam em %APPDATA%\\Central de Live.\r\nCódigo-fonte em resources/app. Licenças e créditos incluídos.\r\n`,
);
execFileSync(
  path.join(root, '.runtime', 'python', 'python.exe'),
  [path.join(root, 'scripts', 'create_zip.py'), stage, zip],
  { windowsHide: true, stdio: 'inherit' },
);
async function writeChecksum() {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(zip)) hash.update(chunk);
  fs.writeFileSync(zip + '.sha256.txt', `${hash.digest('hex')}  ${path.basename(zip)}\n`);
  console.log(`Distribuição criada: ${zip}`);
}
writeChecksum().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
