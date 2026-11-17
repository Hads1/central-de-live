const fs = require('fs');
const { Chats } = require('./services');
const states = {},
  emotes = {},
  counts = { twitch: 0, kick: 0, starvios: 0 };
const clients = new Chats((type, data) => {
  if (type === 'status') {
    states[data.platform] = data;
    console.log(data.platform + ': ' + data.text);
  }
  if (type === 'emotes') {
    emotes[data.platform] = { count: data.count, failed: data.failed };
    console.log(data.platform + ': ' + data.count + ' emotes externos');
  }
  if (type === 'message') counts[data.platform]++;
});
const settings = Object.fromEntries(['twitch', 'kick', 'starvios'].map((platform) => {
  const channel = process.env['CENTRAL_TEST_' + platform.toUpperCase()] || '';
  return [platform, { channel, enabled: Boolean(channel) }];
}));
const enabled = Object.keys(settings).filter((platform) => settings[platform].enabled);
if (!enabled.length) {
  console.error('Informe CENTRAL_TEST_TWITCH, CENTRAL_TEST_KICK ou CENTRAL_TEST_STARVIOS.');
  process.exit(1);
}
clients.start(settings);
setTimeout(
  () => {
    clients.stop();
    const result = {
      at: new Date().toISOString(),
      states,
      emotes,
      messagesReceived: counts,
    };
    fs.writeFileSync('live-result.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    process.exit(
      enabled.every((p) => states[p]?.state === 'ok')
        ? 0
        : 1,
    );
  },
  process.argv.includes('--watch') ? 60000 : 20000,
);
