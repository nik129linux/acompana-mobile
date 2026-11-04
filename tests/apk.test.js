'use strict';

// The Android build: the same web app packaged by Capacitor, talking to a
// deployed server whose address is set at build time.
// Run: node tests/apk.test.js   (needs `npm run build:www` to work)

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
const API = 'https://api.acompana.test';
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

async function page(browser, init, arg) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (init) await ctx.addInitScript(init, arg);
  const calls = [];
  await ctx.route(API + '/**', async (route) => {
    calls.push(route.request().url());
    const url = route.request().url();
    if (url.includes('/api/sync')) return route.fulfill({ json: { seq: 0, events: [], messages: [], deleted: [] } });
    if (url.includes('/api/ask')) return route.fulfill({ json: { answer: 'De 3:00 a 5:00 p. m.', source: 'ollama', model: 'gemma', createdQuestion: false } });
    return route.fulfill({ json: { ok: true } });
  });
  const p = await ctx.newPage();
  p.calls = calls;
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(INDEX);
  if (await p.locator('[data-splash-skip]').isVisible().catch(() => false)) await p.locator('[data-splash-skip]').click();
  await p.waitForTimeout(600);
  return p;
}

(async () => {
  // 1. One config file decides where the server is; empty means "no server".
  assert.ok(exists('js/config.js'), 'js/config.js exists');
  const html = read('index.html');
  assert.ok(html.indexOf('js/config.js') !== -1 && html.indexOf('js/config.js') < html.indexOf('js/app.js'), 'config.js loads before app.js');
  assert.ok(/apiBase/.test(read('js/config.js')), 'config.js defines apiBase');
  assert.ok(read('sw.js').includes("'/js/config.js'"), 'the service worker caches config.js');
  ok('config: js/config.js with apiBase, loaded before the app');

  const browser = await chromium.launch();
  try {
    // 2. With an apiBase, every server call goes there, even from file:// or an app WebView.
    let p = await page(browser, (api) => { window.ACOMPANA_CONFIG = { apiBase: api }; localStorage.setItem('acompana-ai-consent', 'yes'); }, API);
    await p.waitForTimeout(500);
    assert.ok(p.calls.some((url) => url.startsWith(API + '/api/sync')), 'sync polls the configured server: ' + p.calls.join(', '));
    await p.locator('.view.is-active [data-demo-menu]').first().click();
    await p.locator('.view.is-active [data-view-as="familia"]').click();
    await p.waitForTimeout(500);
    await p.locator('[data-ask-input]').fill('¿A qué hora puedo entrar?');
    await p.locator('[data-ask-send]').click();
    await p.waitForTimeout(800);
    assert.ok(p.calls.some((url) => url === API + '/api/ask'), 'ask goes to the configured server');
    assert.ok((await p.locator('[data-ask-answer]').textContent()).includes('3:00'));
    assert.deepStrictEqual(p.errors, []);
    ok('config: apiBase routes sync and AI to the deployed server');

    // 3. A trailing slash in apiBase is tolerated.
    p = await page(browser, (api) => { window.ACOMPANA_CONFIG = { apiBase: api + '/' }; }, API);
    await p.waitForTimeout(500);
    assert.ok(p.calls.some((url) => url.startsWith(API + '/api/sync')) && !p.calls.some((url) => url.includes('//api/')), 'no double slash: ' + p.calls.join(', '));
    ok('config: trailing slash tolerated');

    // 4. Inside the Android app the web service worker is not registered.
    p = await page(browser, () => {
      window.Capacitor = { isNativePlatform: () => true };
      window.__swRegistered = false;
      if (navigator.serviceWorker) navigator.serviceWorker.register = () => { window.__swRegistered = true; return Promise.resolve(); };
    });
    assert.strictEqual(await p.evaluate(() => window.__swRegistered), false, 'no service worker inside the native app');
    ok('native: no service worker in the app');
  } finally {
    await browser.close();
  }

  // 5. The web bundle the APK ships: only the app, with the server address baked in.
  const www = path.join(ROOT, 'www');
  execFileSync('npm', ['run', 'build:www'], { cwd: ROOT, env: { ...process.env, ACOMPANA_API_BASE: API }, stdio: 'pipe' });
  ['index.html', 'manifest.webmanifest', 'css/tokens.css', 'js/app.js', 'js/i18n.js', 'js/config.js', 'js/views/nurse.js', 'media/splash.mp4', 'icons/icon-512.png', 'fonts'].forEach((file) => {
    assert.ok(fs.existsSync(path.join(www, file)), 'www has ' + file);
  });
  ['server', 'tests', 'node_modules', 'ref', 'tools', 'package.json', 'android', '.git'].forEach((file) => {
    assert.ok(!fs.existsSync(path.join(www, file)), 'www leaves out ' + file);
  });
  assert.ok(!fs.existsSync(path.join(www, 'media', 'raw')), 'www leaves out media/raw');
  assert.ok(fs.readFileSync(path.join(www, 'js', 'config.js'), 'utf8').includes(API), 'build bakes ACOMPANA_API_BASE into www/js/config.js');
  assert.ok(!read('js/config.js').includes(API), 'the source config.js is not modified by the build');
  ok('build: www holds only the app, with the API address baked in');

  // 6. Capacitor project for Android.
  const cap = JSON.parse(read('capacitor.config.json'));
  assert.strictEqual(cap.webDir, 'www');
  assert.ok(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(cap.appId), 'appId is a reverse domain: ' + cap.appId);
  assert.strictEqual(cap.appName, 'Acompaña');
  const pkg = JSON.parse(read('package.json'));
  ['@capacitor/core', '@capacitor/android'].forEach((dep) => assert.ok((pkg.dependencies || {})[dep], dep + ' in dependencies'));
  assert.ok((pkg.devDependencies || {})['@capacitor/cli'], '@capacitor/cli in devDependencies');
  assert.ok(pkg.scripts && pkg.scripts['build:www'] && pkg.scripts['cap:sync'], 'build:www and cap:sync scripts');
  assert.ok(exists('android/app/build.gradle') && exists('android/gradlew'), 'android project committed');
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.ok(manifest.includes('android.permission.INTERNET'), 'internet permission');
  ['www', 'android/app/src/main/assets/public', 'android/app/build', 'android/.gradle'].forEach((ignored) => {
    assert.ok(read('.gitignore').split('\n').some((line) => line.trim().replace(/\/$/, '') === ignored), '.gitignore has ' + ignored);
  });
  ok('capacitor: android project, scripts, ignores');

  // 7. CI builds the APK and publishes it.
  const workflow = read('.github/workflows/android.yml');
  ['actions/checkout', 'actions/setup-java', 'actions/setup-node', 'npm ci', 'build:www', 'cap sync android', 'assembleDebug', 'actions/upload-artifact', 'ACOMPANA_API_BASE', 'app-debug.apk'].forEach((needle) => {
    assert.ok(workflow.includes(needle), 'workflow mentions ' + needle);
  });
  assert.ok(/tags:\s*\n\s*-\s*['"]?v\*/.test(workflow) && /softprops\/action-gh-release|gh release/.test(workflow), 'tags v* publish a release with the APK');
  assert.ok(/vars\.ACOMPANA_API_BASE|secrets\.ACOMPANA_API_BASE/.test(workflow), 'the API address comes from a repository variable');
  ok('ci: workflow builds and publishes app-debug.apk');

  // 8. The launcher icon is the app's own, not the Capacitor default.
  const icon = path.join(ROOT, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png');
  assert.ok(fs.existsSync(icon), 'xxxhdpi launcher icon');
  const sizeOf = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepStrictEqual(sizeOf(icon), [192, 192], 'xxxhdpi icon is 192px');
  assert.ok(fs.readFileSync(icon).equals(fs.readFileSync(path.join(ROOT, 'icons/icon-192.png'))), 'xxxhdpi icon is icons/icon-192.png');
  const strings = read('android/app/src/main/res/values/strings.xml');
  assert.ok(strings.includes('Acompaña'), 'app name on the home screen');
  ok('android: own launcher icon and name');

  // 9. Deployable server: the host picks the port, AI endpoints are rate limited per IP.
  const { spawn } = require('child_process');
  const http = require('http');
  const get = (port, url) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: url }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  const child = spawn('node', ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: '9879', HOST: '127.0.0.1', OLLAMA_URL: 'http://127.0.0.1:9' }, stdio: 'ignore' });
  try {
    let status = 0;
    for (let i = 0; i < 40 && status !== 200; i += 1) {
      await new Promise((r) => setTimeout(r, 150));
      status = await get(9879, '/api/health').catch(() => 0);
    }
    assert.strictEqual(status, 200, 'server listens on $PORT');
  } finally {
    child.kill();
  }
  const srv = require('../server/server.js');
  const server = srv.createServer(null);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const post = (url, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method: 'POST' }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
  try {
    const codes = [];
    for (let i = 0; i < 31; i += 1) codes.push(await post('/api/ask', { question: '¿A qué hora puedo entrar?', facts: ['Horario de visita: hoy de 3:00 a 5:00 p. m.'] }));
    assert.ok(codes.slice(0, 30).every((c) => c === 200), 'first 30 AI calls pass');
    assert.strictEqual(codes[30], 429, '31st AI call in a minute is limited');
    assert.strictEqual(await post('/api/translate', { event: { kind: 'round', text: 'Ronda' }, reader: 'paciente' }), 429, 'the limit covers every AI endpoint');
    assert.strictEqual(await get(port, '/api/sync?reader=familia&since=0'), 200, 'sync is never limited');
  } finally {
    server.close();
  }
  ok('server: $PORT honoured, AI endpoints limited to 30 per minute per IP');

  // 10. Railway runs the server with `npm start`; the key and the URL stay out of the repo.
  const scripts = JSON.parse(read('package.json')).scripts || {};
  assert.strictEqual(scripts.start, 'node server/server.js', 'npm start runs the server');
  assert.ok(!exists('render.yaml'), 'no leftover Render blueprint');
  const readme = read('README.md');
  ['Railway', 'OLLAMA_API_KEY', 'ACOMPANA_API_BASE', '/api/health'].forEach((needle) => {
    assert.ok(readme.includes(needle), 'README explains ' + needle);
  });
  ok('deploy: npm start for Railway, README steps');

  // 11. Behind Railway's proxy the client cannot dodge the limit by forging x-forwarded-for.
  const limited = srv.createServer(null);
  await new Promise((r) => limited.listen(0, '127.0.0.1', r));
  const forged = (i) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: limited.address().port, path: '/api/ask', method: 'POST', headers: { 'x-forwarded-for': '203.0.113.' + i + ', 198.51.100.7' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(JSON.stringify({ question: 'hola', facts: ['x'] }));
  });
  try {
    const codes = [];
    for (let i = 0; i < 31; i += 1) codes.push(await forged(i));
    assert.strictEqual(codes[30], 429, 'a forged first hop does not reset the limit');
  } finally {
    limited.close();
  }
  ok('server: the limit keys on the proxy-added client address');

  console.log('apk: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + error.message);
  console.log('apk: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
