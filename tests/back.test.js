'use strict';

// Android back button inside the app (Nico, 2026-11-05): it walks back through
// the app instead of closing it. Open layers close first, then a tab or
// sub-screen returns to its home, and only a second press on home exits.
// Run: node tests/back.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { viewAs, openRegister } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

// A stand-in for Capacitor's App plugin: records the listener and exits.
const NATIVE = () => {
  window.__exits = 0;
  window.__app = {
    listeners: {},
    addListener(event, cb) { this.listeners[event] = cb; return Promise.resolve({ remove() {} }); },
    exitApp() { window.__exits += 1; }
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    registerPlugin: (name) => (name === 'App' ? window.__app : {}),
    Plugins: { App: window.__app }
  };
};

async function fresh(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(INDEX);
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(600);
  return page;
}

async function back(page) {
  await page.evaluate(() => window.__app.listeners.backButton({ canGoBack: window.history.length > 1 }));
  await page.waitForTimeout(500);
}

const viewKey = (page) => page.locator('.view.is-active').getAttribute('data-view-key');
const exits = (page) => page.evaluate(() => window.__exits);

(async () => {
  const browser = await chromium.launch();
  try {
    let page = await fresh(browser, NATIVE);
    assert.strictEqual(await page.evaluate(() => typeof window.__app.listeners.backButton), 'function', 'the app listens to the hardware back button');

    // 1. Patient detail: back returns to the shift list.
    await page.locator('[data-patient="cr"]').first().click();
    await page.waitForTimeout(600);
    assert.strictEqual(await viewKey(page), 'nurse-detail');
    await back(page);
    assert.strictEqual(await viewKey(page), 'nurse-home', 'detail closes back to home');
    assert.strictEqual(await exits(page), 0);
    ok('back: patient detail returns to the shift');

    // 2. Open sheets and menus close before anything else.
    await openRegister(page);
    await page.waitForTimeout(500);
    await back(page);
    assert.ok(!(await page.locator('#registrationLayer.is-open').count()), 'register sheet closed');
    await page.locator('.view.is-active [data-handover-open]').click();
    await page.waitForTimeout(500);
    await back(page);
    assert.ok(!(await page.locator('#aiLayer.is-open').count()), 'SBAR sheet closed');
    await page.locator('.view.is-active [data-demo-menu]').click();
    await back(page);
    assert.ok(!(await page.locator('.demo-menu.is-open').count()), 'menu closed');
    await page.locator('.view.is-active [data-demo-menu]').click();
    await page.locator('.view.is-active .demo-menu.is-open [data-simulate-error]').click();
    await page.waitForTimeout(500);
    await back(page);
    assert.ok(!(await page.locator('#errorLayer.is-open').count()), 'error state closed');
    assert.strictEqual(await viewKey(page), 'nurse-home');
    assert.strictEqual(await exits(page), 0);
    ok('back: sheets, menu and error close first');

    // 3. Another tab returns to the role's home.
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(500);
    await back(page);
    assert.strictEqual(await viewKey(page), 'nurse-home', 'Pendientes back to Turno');
    await page.locator('[data-nav="chat"]').click();
    await page.waitForTimeout(500);
    await back(page);
    assert.strictEqual(await viewKey(page), 'nurse-home', 'Chat back to Turno');
    assert.strictEqual(await exits(page), 0);
    ok('back: tabs return to home');

    // 4. Family: chat back to Contacto, Contacto back to Qué pasa.
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    await page.locator('[data-nav="contacto"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-chat-open]').click();
    await page.waitForTimeout(500);
    await back(page);
    assert.strictEqual(await viewKey(page), 'family-contact', 'family chat back to Contacto');
    await back(page);
    assert.strictEqual(await viewKey(page), 'family-home', 'Contacto back to Qué pasa');
    assert.strictEqual(await exits(page), 0);
    ok('back: family sub-screens walk back');

    // 5. On home: the first press warns, a second press within 2 s exits.
    await back(page);
    assert.strictEqual(await exits(page), 0, 'first press on home does not exit');
    assert.ok(/atrás otra vez/i.test(await page.locator('#snackbar').textContent()), 'warns before exiting');
    await back(page);
    assert.strictEqual(await exits(page), 1, 'second press exits');
    await page.waitForTimeout(2300);
    await back(page);
    assert.strictEqual(await exits(page), 1, 'a press after the 2 s window warns again instead of exiting');
    assert.deepStrictEqual(page.errors, []);
    ok('back: home needs a second press to exit');

    // 6. The warning follows the language.
    page = await fresh(browser, () => { localStorage.setItem('acompana-lang', 'en'); });
    await page.addInitScript(NATIVE);
    await page.reload();
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(600);
    await back(page);
    assert.ok(/back again/i.test(await page.locator('#snackbar').textContent()), 'English warning');
    ok('back: warning in English too');

    // 7. In a normal browser nothing changes: no plugin, no listener, no errors.
    page = await fresh(browser);
    assert.deepStrictEqual(page.errors, []);
    ok('web: no native back handling in the browser');
  } finally {
    await browser.close();
  }

  // 8. The native plugin ships with the app.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok((pkg.dependencies || {})['@capacitor/app'], '@capacitor/app in dependencies');
  const settings = fs.readFileSync(path.join(ROOT, 'android/capacitor.settings.gradle'), 'utf8');
  assert.ok(settings.includes('capacitor-app'), 'android project includes the App plugin (npx cap sync android)');
  ok('android: App plugin installed and synced');

  console.log('back: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + error.message);
  console.log('back: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
