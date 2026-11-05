'use strict';

// Abuse protection for the public server (Nico, 2026-11-05): a daily cap on
// model calls, CORS limited to the app and its own web page, write limits and
// bounded memory, security headers, and the deploy settings that turn them on.
// Run: node tests/hardening.test.js

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const ai = require('../server/ai');

const ROOT = path.join(__dirname, '..');
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

// Fresh copy of the server module so env limits read at call time start clean.
function loadServer() {
  delete require.cache[require.resolve('../server/server.js')];
  return require('../server/server.js');
}

function mockClient(counter) {
  return ai.createClient({
    baseUrl: 'http://mock',
    apiKey: '',
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) };
      counter.calls += 1;
      return { ok: true, json: async () => ({ response: JSON.stringify({ text: 'La enfermera pasó a verle.' }) }) };
    }
  });
}

async function listen(srv, client) {
  const server = srv.createServer(client);
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
        resolve({ status: res.statusCode, headers: res.headers, json, text });
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

(async () => {
  // 1. Daily cap on real model calls; past it the app keeps working on rules.
  process.env.AI_DAILY_LIMIT = '3';
  let srv = loadServer();
  const counter = { calls: 0 };
  let server = await listen(srv, mockClient(counter));
  try {
    const sources = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await request(server, 'POST', '/api/translate', { event: { kind: 'round', text: 'Ronda ' + i }, reader: 'paciente' });
      assert.strictEqual(res.status, 200, 'still answers past the cap');
      sources.push(res.json.source);
    }
    assert.strictEqual(counter.calls, 3, 'exactly 3 model calls, got ' + counter.calls);
    assert.deepStrictEqual(sources.slice(3), ['rules', 'rules'], 'answers come from rules past the cap');
    const health = await request(server, 'GET', '/api/health');
    assert.deepStrictEqual(health.json.aiBudget, { used: 3, limit: 3 }, 'health reports the budget');
  } finally {
    server.close();
    delete process.env.AI_DAILY_LIMIT;
  }
  srv = loadServer();
  assert.strictEqual(srv.AI_DAILY_LIMIT_DEFAULT, 100, 'default cap is 100 per day');
  ok('budget: model calls capped per day, rules answer after');

  // 2. CORS: only the app and the page's own origin; tools without Origin still work.
  process.env.ALLOWED_ORIGINS = 'https://localhost,capacitor://localhost';
  srv = loadServer();
  server = await listen(srv, null);
  try {
    const host = '127.0.0.1:' + server.address().port;
    const evil = await request(server, 'POST', '/api/ask', { question: 'hola', facts: ['x'] }, { Origin: 'https://evil.example' });
    assert.strictEqual(evil.status, 403, 'foreign origin refused');
    assert.ok(!evil.headers['access-control-allow-origin'], 'no CORS grant for a foreign origin');
    const preflight = await request(server, 'OPTIONS', '/api/ask', undefined, { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' });
    assert.strictEqual(preflight.status, 403, 'foreign preflight refused');
    const nullOrigin = await request(server, 'GET', '/api/sync?reader=familia&since=0', undefined, { Origin: 'null' });
    assert.strictEqual(nullOrigin.status, 403, 'null origin refused when not listed');
    const app = await request(server, 'GET', '/api/sync?reader=familia&since=0', undefined, { Origin: 'https://localhost' });
    assert.strictEqual(app.status, 200);
    assert.strictEqual(app.headers['access-control-allow-origin'], 'https://localhost', 'the app origin is echoed, not *');
    assert.ok(/Origin/.test(app.headers.vary || ''), 'Vary: Origin');
    const same = await request(server, 'GET', '/api/sync?reader=familia&since=0', undefined, { Origin: 'http://' + host, Host: host });
    assert.strictEqual(same.status, 200, 'the page served by this server can call it');
    const tool = await request(server, 'GET', '/api/health');
    assert.strictEqual(tool.status, 200, 'requests without Origin still work');
    assert.ok(tool.headers['access-control-allow-origin'] !== '*', 'never a wildcard');
  } finally {
    server.close();
    delete process.env.ALLOWED_ORIGINS;
  }
  ok('cors: app and own page only, no wildcard');

  // 3. Writes are rate limited per IP and storage stays bounded.
  srv = loadServer();
  server = await listen(srv, null);
  try {
    const codes = [];
    for (let i = 0; i < 61; i += 1) codes.push((await request(server, 'POST', '/api/chat', { channel: 'familia', text: 'm' + i, author: 'Familia' })).status);
    assert.ok(codes.slice(0, 60).every((c) => c === 200), 'first 60 writes pass');
    assert.strictEqual(codes[60], 429, '61st write in a minute is limited');
    assert.strictEqual((await request(server, 'GET', '/api/sync?reader=familia&since=0')).status, 200, 'reads are not limited');
  } finally {
    server.close();
  }
  process.env.WRITE_RATE_PER_MIN = '5000';
  srv = loadServer();
  srv.resetShared();
  server = await listen(srv, null);
  try {
    for (let i = 0; i < 520; i += 1) await request(server, 'POST', '/api/chat', { channel: 'familia', text: 'msg ' + i, author: 'Familia' });
    for (let i = 0; i < 520; i += 1) await request(server, 'POST', '/api/events', { id: 'e' + i, patientId: 'mg', kind: 'round', text: 'x', time: '10:00' });
    const sync = await request(server, 'GET', '/api/sync?reader=enfermero&since=0');
    assert.strictEqual(sync.json.messages.length, 500, 'chat keeps the last 500');
    assert.strictEqual(sync.json.messages[499].text, 'msg 519', 'newest messages survive');
    assert.strictEqual(sync.json.events.length, 500, 'events keep the last 500');
    for (let i = 0; i < 230; i += 1) srv.addNurseQuestion('q' + i);
    assert.ok(srv.listNurseQuestions().length <= 200, 'nurse questions bounded');
  } finally {
    server.close();
    delete process.env.WRITE_RATE_PER_MIN;
  }
  ok('writes: 60 per minute per IP, last 500 kept');

  // 4. Security headers on pages and API, and the app still runs under the CSP.
  srv = loadServer();
  server = await listen(srv, null);
  try {
    for (const url of ['/', '/api/health']) {
      const res = await request(server, 'GET', url);
      assert.strictEqual(res.headers['x-content-type-options'], 'nosniff', url + ' nosniff');
      assert.strictEqual(res.headers['x-frame-options'], 'DENY', url + ' no framing');
      assert.ok(res.headers['referrer-policy'], url + ' referrer policy');
      assert.ok(/max-age=\d{7,}/.test(res.headers['strict-transport-security'] || ''), url + ' HSTS');
      const csp = res.headers['content-security-policy'] || '';
      ["default-src 'self'", "script-src 'self'", "frame-ancestors 'none'", "object-src 'none'"].forEach((rule) => {
        assert.ok(csp.includes(rule), url + ' CSP has ' + rule);
      });
      assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'no inline scripts allowed');
    }
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const violations = [];
      page.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text()); });
      page.on('pageerror', (e) => violations.push(e.message));
      await page.goto('http://127.0.0.1:' + server.address().port + '/');
      if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
      await page.waitForTimeout(800);
      await page.locator('.view.is-active [data-handover-open]').click();
      await page.waitForTimeout(500);
      assert.deepStrictEqual(violations, [], 'the app runs clean under the CSP');
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
  ok('headers: CSP, HSTS, nosniff, no framing; the app runs under them');

  // 5. Production turns it on: the instance sets the cap and origins, AWS watches spend.
  const boot = fs.readFileSync(path.join(ROOT, 'infra/user-data.sh'), 'utf8');
  assert.ok(/AI_DAILY_LIMIT=100\b/.test(boot), 'instance caps AI at 100 per day');
  assert.ok(/ALLOWED_ORIGINS="https:\/\/localhost,capacitor:\/\/localhost"/.test(boot), 'instance allows only the app origins');
  const tf = fs.readFileSync(path.join(ROOT, 'infra/main.tf'), 'utf8');
  assert.ok(/resource "aws_budgets_budget"/.test(tf), 'AWS budget defined');
  assert.ok(/budget_type\s*=\s*"COST"/.test(tf) && /limit_unit\s*=\s*"USD"/.test(tf), 'monthly cost budget in USD');
  assert.ok(/var\.alert_email/.test(tf), 'alerts go to a variable, not a hard-coded address');
  const vars = fs.readFileSync(path.join(ROOT, 'infra/variables.tf'), 'utf8');
  assert.ok(/variable "alert_email"/.test(vars) && /variable "monthly_budget_usd"/.test(vars), 'alert email and budget are variables');
  ok('deploy: production limits and the AWS budget alert are in the infrastructure');

  console.log('hardening: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + error.message);
  console.log('hardening: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
