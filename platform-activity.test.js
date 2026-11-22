const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { PlatformActivity, starviosActivity } = require('./platform-activity');
const templates = require('./message-templates');
const { KickEvents, TYPES } = require('./kick-events');

test('mesmo modelo atende quatro plataformas, mantém origem e ignora históricos e duplicatas', async () => {
  const rows = templates.snapshot({}).map(row => ({...row, enabled: true}));
  rows.find(row => row.id === 'follow').text = '{usuario}, obrigado por seguir na {plataforma}!';
  const state = {messageTemplates: templates.validate(rows)};
  const sent = [];
  const activity = new PlatformActivity({text: (id, values) => templates.message(state, id, values), send: async (...args) => sent.push(args), report: assert.fail});
  for (const platform of ['twitch', 'kick', 'starvios', 'youtube']) {
    const event = {platform, kind: 'follow', id: '1', user: 'Ana', channel: 'canal'};
    await activity.receive({...event, historical: true});
    await activity.receive(event); await activity.receive(event);
  }
  assert.deepEqual(sent, [['twitch', 'Ana, obrigado por seguir na Twitch!'], ['kick', 'Ana, obrigado por seguir na Kick!'], ['starvios', 'Ana, obrigado por seguir na Starvios!'], ['youtube', 'Ana, obrigado por seguir na YouTube!']]);
  assert.equal(starviosActivity({id: 'sub1', type: 'gift_sub', meta: {recipient: 'Bia'}}, 'canal').user, 'Bia');
  assert.equal(starviosActivity({id: 'chat1', type: 'chat', body: 'seguiu o canal'}, 'canal'), null);
});

test('webhook Kick valida assinatura, canal e replay antes de disparar o modelo', async t => {
  const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const received = [];
  const kick = new KickEvents({account: {account: {id: 12, name: 'canal'}}, activity: async event => received.push(event), report: assert.fail, fetchKey: async () => publicKey});
  const server = http.createServer((req, res) => void kick.handle(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {server.closeAllConnections(); server.close();});
  async function post(id, event, valid = true, timestamp = new Date().toISOString()) {
    const body = JSON.stringify(event);
    const signature = crypto.sign('RSA-SHA256', Buffer.from(id + '.' + timestamp + '.' + body), privateKey).toString('base64');
    return fetch(`http://127.0.0.1:${server.address().port}`, {method: 'POST', headers: {'kick-event-message-id': id, 'kick-event-message-timestamp': timestamp, 'kick-event-signature': valid ? signature : 'invalid', 'kick-event-type': 'channel.followed'}, body});
  }
  const event = {broadcaster: {user_id: 12}, follower: {username: 'João'}};
  assert.equal((await post('one', event, false)).status, 401);
  assert.equal((await post('old', event, true, '2020-01-01T00:00:00Z')).status, 401);
  assert.equal((await post('wrong', {...event, broadcaster: {user_id: 99}})).status, 403);
  assert.equal((await post('one', event)).status, 204);
  assert.equal((await post('one', event)).status, 204);
  assert.deepEqual(received, [{platform: 'kick', id: 'one:0', kind: 'follow', channel: 'canal', user: 'João'}]);
});

test('inscrição Kick mantém assinaturas existentes e solicita apenas as ausentes', async () => {
  const calls = [];
  const kick = new KickEvents({account: {account: {id: 12}, api: async (route, body) => {
    calls.push([route, body]);
    return body ? {data: body.events} : {data: [{broadcaster_user_id: 12, event: TYPES[0], method: 'webhook', version: 1}]};
  }}});
  await kick.subscribe();
  assert.deepEqual(calls[1][1].events.map(event => event.name), TYPES.slice(1));
});

test('Starvios cria referência sem agradecer atividades antigas e entrega apenas eventos novos', async t => {
  const { StarviosAccount } = require('./starvios-account');
  const events = [];
  const account = new StarviosAccount({activity: async event => events.push(event), save() {}, channel: () => 'canal'});
  account.window = {isDestroyed: () => false, hide() {}, destroy() {}};
  t.after(() => account.stop());
  const initial = {id: 'old', type: 'follow', username: 'Antigo', at: new Date(0).toISOString()};
  let rows = [initial];
  account.run = async () => ({profile: {id: 'owner', username: 'canal'}, events: rows});
  await account.poll();
  assert.equal(events.length, 0);
  rows = [...rows, {id: 'new', type: 'sub', username: 'Nova', at: new Date(Date.now() + 1000).toISOString()}];
  await account.poll(); await account.poll();
  assert.deepEqual(events, [{platform: 'starvios', kind: 'subscription', id: 'new', user: 'Nova', channel: 'canal'}]);
  account.channel = () => 'outro-canal';
  await account.poll();
  assert.equal(account.account, null);
  assert.match(account.status, /conta do canal/);
});
