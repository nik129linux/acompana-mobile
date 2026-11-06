'use strict';

// App key and per-IP daily AI cap for the public server (2026-11-05).
// Without APP_KEY the server behaves as before (dev, tests, file://).
// With APP_KEY every /api/* call except GET /api/health needs X-App-Key.
// Run: node tests/auth.test.js

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ai = require('../server/ai');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

function loadServer() {
  delete require.cache[require.resolve('../server/server.js')];
  return require('../server/server.js');
}

function mockClient() {
  return ai.createClient({
    baseUrl: 'http://mock',
    apiKey: '',
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) };
      return { ok: true, json: async () => ({ response: JSON.stringify({ text: 'La enfermera pasó a verle.' }) }) };
    }
  });
}

async function listen(srv) {
  const server = srv.createServer(mockClient());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function request(server, method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method, headers: headers || {} }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (_) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const TRANSLATE = { event: { kind: 'round', text: 'Ronda' }, reader: 'paciente' };

(async () => {
  // 1. No APP_KEY: open as before.
  delete process.env.APP_KEY;
  let server = await listen(loadServer());
  try {
    const res = await request(server, 'GET', '/api/sync?reader=paciente');
    assert.strictEqual(res.status, 200, 'no key configured keeps the API open');
    ok('without APP_KEY the API stays open');
  } finally { server.close(); }

  // 2. APP_KEY set: missing or wrong key is 401, right key passes, health stays open.
  process.env.APP_KEY = 'k-test-123';
  server = await listen(loadServer());
  try {
    for (const [method, url, body] of [
      ['GET', '/api/sync?reader=paciente'],
      ['GET', '/api/questions'],
      ['POST', '/api/events', { text: 'x' }],
      ['POST', '/api/translate', TRANSLATE]
    ]) {
      const none = await request(server, method, url, body);
      assert.strictEqual(none.status, 401, method + ' ' + url + ' without key, got ' + none.status);
      const wrong = await request(server, method, url, body, { 'X-App-Key': 'nope' });
      assert.strictEqual(wrong.status, 401, method + ' ' + url + ' with a wrong key');
    }
    ok('missing or wrong X-App-Key is 401 on every API route');

    const good = await request(server, 'GET', '/api/sync?reader=paciente', undefined, { 'X-App-Key': 'k-test-123' });
    assert.strictEqual(good.status, 200, 'right key passes');
    ok('the right X-App-Key passes');

    const health = await request(server, 'GET', '/api/health');
    assert.strictEqual(health.status, 200, 'health needs no key');
    ok('GET /api/health needs no key');

    const pre = await request(server, 'OPTIONS', '/api/sync', undefined, {
      Origin: 'capacitor://localhost',
      'Access-Control-Request-Headers': 'x-app-key'
    });
    assert.strictEqual(pre.status, 204, 'preflight passes without the key');
    assert.ok(/x-app-key/i.test(pre.headers['access-control-allow-headers'] || ''), 'preflight allows X-App-Key');
    ok('CORS preflight allows the X-App-Key header');

    const page = await request(server, 'GET', '/index.html');
    assert.strictEqual(page.status, 200, 'static files need no key');
    ok('static files need no key');
  } finally {
    server.close();
    delete process.env.APP_KEY;
  }

  // 3. One client IP cannot spend the whole shared AI budget.
  process.env.AI_DAILY_PER_IP = '2';
  process.env.AI_RATE_PER_MIN = '1000';
  server = await listen(loadServer());
  try {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await request(server, 'POST', '/api/translate', TRANSLATE)).status);
    }
    assert.deepStrictEqual(statuses, [200, 200, 429, 429], 'per-IP daily cap, got ' + statuses);
    ok('one IP gets AI_DAILY_PER_IP AI calls a day, then 429');
  } finally {
    server.close();
    delete process.env.AI_DAILY_PER_IP;
    delete process.env.AI_RATE_PER_MIN;
  }

  // 4. Deploy wiring: the instance reads the key from SSM and Caddy is not root.
  const userData = fs.readFileSync(path.join(ROOT, 'infra', 'user-data.sh'), 'utf8');
  assert.ok(/--name \$\{app_key_parameter\}/.test(userData), 'run.sh reads the app key parameter');
  assert.ok(/export APP_KEY=/.test(userData), 'run.sh exports APP_KEY');
  const caddyUnit = userData.split('caddy.service')[1] || '';
  assert.ok(/\nUser=caddy\n/.test(caddyUnit), 'caddy.service runs as the caddy user');
  assert.ok(/NoNewPrivileges=true/.test(caddyUnit), 'caddy.service sets NoNewPrivileges');
  const mainTf = fs.readFileSync(path.join(ROOT, 'infra', 'main.tf'), 'utf8');
  assert.ok(/app_key_parameter_arn/.test(mainTf), 'IAM policy covers the app key parameter');
  ok('deploy reads APP_KEY from SSM and runs Caddy as a non-root user');

  // 5. The app sends the key it was built with.
  const app = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  assert.ok(/X-App-Key/.test(app), 'app.js sends X-App-Key');
  const build = fs.readFileSync(path.join(ROOT, 'tools', 'build-www.js'), 'utf8');
  assert.ok(/ACOMPANA_APP_KEY/.test(build), 'build-www.js bakes ACOMPANA_APP_KEY');
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'android.yml'), 'utf8');
  assert.ok(/ACOMPANA_APP_KEY: \$\{\{ secrets\.ACOMPANA_APP_KEY \}\}/.test(workflow), 'CI builds the APK with the key secret');
  ok('the app build carries the key and sends it');

  console.log('\n' + passed + ' passed');
})().catch((error) => {
  console.error('not ok - ' + error.message);
  process.exit(1);
});
