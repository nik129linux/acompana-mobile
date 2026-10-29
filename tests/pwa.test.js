'use strict';

// Installable app: the backend serves the frontend, the manifest and the
// service worker from one origin, so a phone on the same Wi-Fi (or through
// `adb reverse`) gets the real AI instead of the template.
// Run: node tests/pwa.test.js

const assert = require('assert');
const http = require('http');
const ai = require('../server/ai');
const srv = require('../server/server');
const { chromium } = require('playwright');

const DRAFT = { s: 'Paciente estable.', b: 'Turno sin novedad.', a: 'Pendiente ronda 13:00.', r: 'Continuar plan.' };
// Mocked Ollama: one gemma model, every generate returns DRAFT as JSON text.
const fakeClient = ai.createClient({
  baseUrl: 'http://mock',
  timeoutMs: 1000,
  fetchImpl: async (url) => {
    if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma-test' }] }) };
    return { ok: true, json: async () => ({ response: JSON.stringify(DRAFT) }) };
  }
});

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: String(res.headers['content-type'] || ''), body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

(async () => {
  const server = srv.createServer(fakeClient);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  try {
    assert.strictEqual(srv.HOST, process.env.HOST || '0.0.0.0', 'server must listen on all interfaces by default (HOST env overrides)');
    ok('HOST defaults to 0.0.0.0');

    const home = await get(port, '/');
    assert.strictEqual(home.status, 200);
    assert(home.type.startsWith('text/html'), 'index served as text/html, got ' + home.type);
    const html = home.body.toString('utf8');
    assert(/<link[^>]+rel="manifest"[^>]+href="manifest\.webmanifest"/.test(html), 'index links manifest.webmanifest');
    assert(/<link[^>]+rel="apple-touch-icon"/.test(html) || /<link[^>]+rel="icon"/.test(html), 'index links an icon');
    ok('GET / serves index with manifest link');

    const man = await get(port, '/manifest.webmanifest');
    assert.strictEqual(man.status, 200);
    assert(man.type.startsWith('application/manifest+json'), 'manifest content-type, got ' + man.type);
    const m = JSON.parse(man.body.toString('utf8'));
    for (const key of ['name', 'short_name', 'start_url', 'theme_color', 'background_color']) assert(m[key], 'manifest.' + key);
    assert.strictEqual(m.display, 'standalone');
    const sizes = (m.icons || []).map((i) => i.sizes);
    assert(sizes.includes('192x192') && sizes.includes('512x512'), 'icons 192 and 512');
    assert((m.icons || []).some((i) => /maskable/.test(i.purpose || '')), 'one maskable icon');
    for (const icon of m.icons) {
      const r = await get(port, '/' + icon.src.replace(/^\.?\//, ''));
      assert.strictEqual(r.status, 200, 'icon ' + icon.src);
      assert(r.type.startsWith('image/png'), 'icon is png: ' + icon.src);
      assert.strictEqual(r.body.slice(1, 4).toString('ascii'), 'PNG', 'icon has PNG signature: ' + icon.src);
      const w = r.body.readUInt32BE(16);
      assert.strictEqual(w + 'x' + w, icon.sizes, 'icon pixel size matches manifest: ' + icon.src);
    }
    ok('manifest valid and icons are real PNGs of the declared size');

    const sw = await get(port, '/sw.js');
    assert.strictEqual(sw.status, 200);
    assert(/javascript/.test(sw.type), 'sw.js served as javascript');
    ok('GET /sw.js');

    const types = { '/css/tokens.css': 'text/css', '/js/app.js': 'javascript', '/media/splash.mp4': 'video/mp4', '/media/splash.webm': 'video/webm', '/media/splash.jpg': 'image/jpeg' };
    for (const [p, t] of Object.entries(types)) {
      const r = await get(port, p);
      assert.strictEqual(r.status, 200, p);
      assert(r.type.includes(t), p + ' type ' + r.type);
    }
    ok('static assets with correct content types');

    for (const p of ['/server/ai.js', '/server/server.js', '/tests/pwa.test.js', '/.git/config', '/../server/ai.js', '/%2e%2e/server/ai.js', '/css/../server/ai.js', '/BRIEF.md', '/nope.html']) {
      const r = await get(port, p);
      assert.strictEqual(r.status, 404, p + ' must be 404, got ' + r.status);
    }
    ok('server code, tests, git, docs and traversal are not served');

    const health = await get(port, '/api/health');
    assert.strictEqual(health.status, 200);
    assert(health.type.startsWith('application/json'));
    ok('API still answers on the same origin');

    // Browser: the page served over http must call the API on its own origin
    // (never the hardcoded 127.0.0.1:8787) and register the service worker.
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const apiHosts = [];
      page.on('request', (req) => { if (req.url().includes('/api/')) apiHosts.push(new URL(req.url()).host); });
      const origin = 'http://127.0.0.1:' + port;
      await page.goto(origin + '/');
      const swReady = await page.evaluate(() => Promise.race([
        navigator.serviceWorker.ready.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 5000))
      ]));
      assert(swReady, 'service worker registered and active');
      if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
      await page.waitForTimeout(400);
      await page.locator('[data-handover-open]').first().click();
      await page.locator('[data-handover-generate]').click();
      await page.waitForTimeout(1500);
      assert(apiHosts.length > 0, 'tapping generate calls the API');
      assert(apiHosts.every((h) => h === '127.0.0.1:' + port), 'API called on page origin, got ' + apiHosts.join(','));
      ok('served page uses same-origin API and registers the service worker');

      // Offline: the shell must reopen from the service worker cache.
      await page.reload();
      await page.waitForTimeout(500);
      await page.context().setOffline(true);
      const offline = await page.reload().then(() => true, () => false);
      assert(offline, 'app shell reloads while offline');
      assert(await page.locator('#app, main, .phone').first().isVisible(), 'app renders offline');
      await page.context().setOffline(false);
      ok('app shell works offline');
    } finally {
      await browser.close();
    }

    console.log('pwa: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('pwa: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    server.close();
  }
})();
