const test = require('node:test');
const assert = require('node:assert/strict');
const { ViewerMonitor, normalizeViewers, totals, count } = require('./viewers');
const reply = (d) => ({ ok: true, status: 200, json: async () => d });
test('contadores distinguem zero, offline, ausência e total parcial', () => {
  assert.deepEqual(
    totals([
      { state: 'live', count: 23 },
      { state: 'offline', count: 0 },
      { state: 'unavailable', count: null },
    ]),
    { total: 23, partial: true, known: 2 },
  );
  assert.equal(totals([{ state: 'unavailable', count: null }]).total, null);
  assert.equal(totals([{ state: 'live', count: 0 }]).partial, false);
  for (const invalid of [null, '9', -1, NaN, 1.5, true])
    assert.throws(() => count(invalid));
});
test('normalização impede URLs executáveis e limita frequência', () => {
  assert.equal(normalizeViewers({ interval: 1 }).interval, 30);
  assert.throws(() =>
    normalizeViewers({ sources: { twitch: { logo: 'javascript:alert(1)' } } }),
  );
  assert.throws(() =>
    normalizeViewers({
      sources: { custom: { apiUrl: 'http://external.test' } },
    }),
  );
  assert.ok(
    normalizeViewers({
      sources: { custom: { apiUrl: 'http://127.0.0.1:1234/count' } },
    }),
  );
});
test('Twitch usa token de app, renova antes de expirar e lê viewer_count', async () => {
  let now = 0,
    auth = 0;
  const m = new ViewerMonitor({
    secrets: { twitch: 'private-test' },
    now: () => now,
    request: async (url, opts) => {
      if (url.includes('/oauth2/token')) {
        auth++;
        assert.ok(opts.body.includes('client_secret=private-test'));
        return reply({ access_token: 'test-token', expires_in: 120 });
      }
      assert.equal(opts.headers.Authorization, 'Bearer test-token');
      assert.equal(opts.headers['Client-Id'], 'client');
      return reply({ data: [{ viewer_count: 42 }] });
    },
  });
  m.options = normalizeViewers({ sources: { twitch: { clientId: 'client' } } });
  assert.deepEqual(await m.read({ platform: 'twitch', channel: 'canalexemplo' }), {
    state: 'live',
    count: 42,
  });
  await m.read({ platform: 'twitch', channel: 'canalexemplo' });
  assert.equal(auth, 1);
  now = 61000;
  await m.read({ platform: 'twitch', channel: 'canalexemplo' });
  assert.equal(auth, 2);
  assert.ok(!JSON.stringify(m.snapshot()).includes('private-test'));
  m.stop();
});
test('Kick offline não é confundida com erro ou canal inexistente', async () => {
  let data = [{ stream: { is_live: false, viewer_count: 300 } }];
  const m = new ViewerMonitor({
    secrets: { kick: 's' },
    request: async (url) =>
      reply(
        url.includes('/oauth/')
          ? { access_token: 't', expires_in: 3600 }
          : { data },
      ),
  });
  m.options = normalizeViewers({ sources: { kick: { clientId: 'id' } } });
  assert.deepEqual(await m.read({ platform: 'kick', channel: 'canalexemplo' }), {
    state: 'offline',
    count: 0,
  });
  data = [];
  await assert.rejects(
    m.read({ platform: 'kick', channel: 'canalexemplo' }),
    /não encontrado/,
  );
  data = [{ stream: { is_live: true, viewer_count: 12 } }];
  assert.equal(
    (await m.read({ platform: 'kick', channel: 'canalexemplo' })).count,
    12,
  );
  m.stop();
});
test('API personalizada exige contagem e estado explícitos sem estimar pelo chat', async () => {
  const m = new ViewerMonitor({
    request: async () => reply({ metrics: { online: true, audience: 72 } }),
  });
  m.options = normalizeViewers({
    sources: {
      custom: {
        apiUrl: 'https://fixture.invalid/count',
        countPath: 'metrics.audience',
        livePath: 'metrics.online',
      },
    },
  });
  assert.equal(
    (await m.read({ platform: 'custom', channel: 'canal' })).count,
    72,
  );
  m.options.sources.custom.countPath = 'missing';
  await assert.rejects(m.read({ platform: 'custom', channel: 'canal' }));
  m.stop();
});
test('resultado de consulta anterior não repopula canal removido', async () => {
  let resolve;
  const m = new ViewerMonitor();
  m.read = () => new Promise((r) => (resolve = r));
  m.configure({
    viewers: { enabled: true },
    twitch: { enabled: true, channel: 'old' },
  });
  m.configure({ viewers: { enabled: false } });
  resolve({ state: 'live', count: 999 });
  await new Promise((r) => setImmediate(r));
  assert.equal(m.snapshot().rows.length, 0);
  assert.equal(m.snapshot().total, null);
  m.stop();
});
test('credenciais são cifradas no disco e não têm fallback em texto puro', () => {
  const fs = require('fs'),
    os = require('os'),
    path = require('path'),
    { ViewerSecrets } = require('./viewer-secrets');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaia-viewer-secret-'));
  try {
    const file = path.join(dir, 'viewers.secrets'),
      s = new ViewerSecrets(file, {
        isEncryptionAvailable: () => true,
        encryptString: (v) => Buffer.from(v).map((b) => b ^ 123),
        decryptString: (v) =>
          Buffer.from(v)
            .map((b) => b ^ 123)
            .toString(),
      });
    s.save({ twitch: 'private-secret' });
    assert.ok(!fs.readFileSync(file).toString().includes('private-secret'));
    assert.equal(s.load().twitch, 'private-secret');
    const unavailable = new ViewerSecrets(file, {
      isEncryptionAvailable: () => false,
    });
    assert.throws(() => unavailable.save({ kick: 'new-secret' }));
    assert.equal(s.load().twitch, 'private-secret');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('widgets expõem somente snapshot público, nunca configurações e segredos', async () => {
  const { WidgetServer } = require('./widget-server');
  const s = new WidgetServer();
  s.getViewers = () => ({
    rows: [{ platform: 'twitch', count: 4, state: 'live' }],
    total: 4,
    partial: false,
  });
  try {
    const u = await s.start(0);
    const r = await fetch(u.replace('widget.html', 'viewers-data'));
    assert.equal((await r.json()).total, 4);
    assert.equal(
      (await fetch(u.replace('widget.html', 'viewers.secrets'))).status,
      404,
    );
    assert.equal(
      (await fetch(u.replace('widget.html', 'viewers-widget.html'))).status,
      200,
    );
  } finally {
    s.close();
  }
});

test('dados antigos deixam de compor total e HTTP 429 respeita espera', async () => {
  const m = new ViewerMonitor({
    now: () => 200000,
    request: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => '180' },
    }),
  });
  m.options = normalizeViewers();
  m.rows = [{ state: 'live', count: 99, updatedAt: 1 }];
  assert.equal(m.snapshot().total, null);
  assert.equal(m.snapshot().partial, true);
  await assert.rejects(
    m.json('https://fixture.invalid'),
    (e) => e.status === 429 && e.retryAfter === 180,
  );
  m.stop();
});

test('Twitch diferencia canal offline de canal inexistente', async () => {
  let valid = false;
  const m = new ViewerMonitor({
    secrets: { twitch: 'secret' },
    request: async (url) =>
      reply(
        url.includes('/oauth2/token')
          ? { access_token: 'token', expires_in: 3600 }
          : url.includes('/users?')
            ? { data: valid ? [{ id: '1' }] : [] }
            : { data: [] },
      ),
  });
  m.options = normalizeViewers({ sources: { twitch: { clientId: 'id' } } });
  await assert.rejects(
    m.read({ platform: 'twitch', channel: 'example' }),
    /não encontrado/,
  );
  valid = true;
  assert.deepEqual(await m.read({ platform: 'twitch', channel: 'example' }), {
    state: 'offline',
    count: 0,
  });
  m.stop();
});

test('contadores são opt-in e seleção não consulta plataforma excluída', async () => {
  assert.equal(normalizeViewers().enabled, false);
  const m = new ViewerMonitor();
  let queried = [];
  m.read = async (row) => {
    queried.push(row.platform);
    return { state: 'live', count: 5 };
  };
  const channels = {
    twitch: { enabled: true, channel: 'one' },
    kick: { enabled: true, channel: 'two' },
  };
  try {
    m.configure(channels);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(queried, []);
    m.configure({
      ...channels,
      viewers: {
        enabled: true,
        showTotal: false,
        sources: { kick: { enabled: false } },
      },
    });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(queried, ['twitch']);
    assert.deepEqual(
      m.snapshot().rows.map((r) => r.platform),
      ['twitch'],
    );
    assert.equal(m.snapshot().total, 5);
    assert.equal(m.snapshot().showTotal, false);
    assert.equal(channels.kick.enabled, true);
  } finally {
    m.stop();
  }
});

for (const platform of ['twitch', 'kick']) {
  test(`${platform}: HTTP 401 renova uma vez e recupera sem esperar próximo ciclo`, async () => {
    let tokens = 0,
      calls = 0,
      refuse = false;
    const m = new ViewerMonitor({
      secrets: { [platform]: 's' },
      request: async (url) => {
        if (url.includes('/oauth')) {
          tokens++;
          return reply({ access_token: 't' + tokens, expires_in: 3600 });
        }
        calls++;
        if (calls === 1 || refuse) return { ok: false, status: 401 };
        return reply({
          data: [
            { viewer_count: 42, stream: { is_live: true, viewer_count: 42 } },
          ],
        });
      },
    });
    m.options = normalizeViewers({
      sources: { [platform]: { clientId: 'id' } },
    });
    assert.equal((await m.read({ platform, channel: 'example' })).count, 42);
    assert.equal(tokens, 2);
    assert.equal(calls, 2);
    refuse = true;
    await assert.rejects(
      m.read({ platform, channel: 'example' }),
      /Autenticação recusada/,
    );
    assert.equal(calls, 4, 'sem loop infinito de renovação');
    m.stop();
  });
}

test('falta de credenciais é diagnosticada e falha de rede recupera no próximo ciclo', async () => {
  const m = new ViewerMonitor();
  try {
    m.options = normalizeViewers({ enabled: true });
    m.rows = [
      { platform: 'twitch', channel: 'example', count: null, state: 'loading' },
    ];
    await m.poll(m.generation);
    clearTimeout(m.timer);
    assert.match(m.snapshot().rows[0].error, /Client ID e Client Secret/);
    assert.equal(m.snapshot().total, null);
    let attempt = 0;
    m.read = async () => {
      if (attempt++ === 0) throw new TypeError('fetch failed');
      return { state: 'live', count: 37 };
    };
    await m.poll(m.generation);
    clearTimeout(m.timer);
    assert.equal(m.snapshot().rows[0].error, 'Sem resposta da plataforma.');
    await m.poll(m.generation);
    clearTimeout(m.timer);
    assert.equal(m.snapshot().total, 37);
    assert.equal(m.snapshot().rows[0].error, '');
  } finally {
    m.stop();
  }
});

test('transição offline, ao vivo e encerramento atualiza audiência', async () => {
  let live = false;
  const m = new ViewerMonitor({
    secrets: { kick: 's' },
    request: async (url) =>
      reply(
        url.includes('/oauth')
          ? { access_token: 't', expires_in: 3600 }
          : { data: [{ stream: { is_live: live, viewer_count: 17 } }] },
      ),
  });
  m.options = normalizeViewers({ sources: { kick: { clientId: 'id' } } });
  assert.equal(
    (await m.read({ platform: 'kick', channel: 'example' })).count,
    0,
  );
  live = true;
  assert.equal(
    (await m.read({ platform: 'kick', channel: 'example' })).count,
    17,
  );
  live = false;
  assert.equal(
    (await m.read({ platform: 'kick', channel: 'example' })).count,
    0,
  );
  m.stop();
});
