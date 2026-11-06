'use strict';

// Phone bugs from 2026-11-06 (APK on Android):
// 1. Dictation in the APK goes through the native speech plugin, because the
//    Android WebView's Web Speech API answers "not-allowed" without asking.
// 2. The Registrar sheet scrolls when the typing field opens instead of
//    squashing the patient row in half.
// 3. "Generar borrador" shows its bar at once even when the server is slow
//    or down, then falls back to the rules draft.
// Run: node tests/native.test.js

const assert = require('assert');
const { chromium } = require('playwright');
const srv = require('../server/server');
const { openRegister } = require('./helpers');

let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function skipSplash(page) {
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
}

// A fake Capacitor bridge with the SpeechRecognition plugin.
function fakeNative(mode) {
  window.__speech = { calls: [] };
  var plugin = {
    requestPermissions: function () {
      window.__speech.calls.push('requestPermissions');
      return Promise.resolve({ speechRecognition: mode === 'denied' ? 'denied' : 'granted' });
    },
    start: function (options) {
      window.__speech.calls.push('start:' + options.language);
      return Promise.resolve({ matches: ['cambio de posición a decúbito lateral'] });
    },
    stop: function () { return Promise.resolve(); }
  };
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    isPluginAvailable: function (name) { return name === 'SpeechRecognition'; },
    registerPlugin: function (name) {
      if (name === 'SpeechRecognition') return plugin;
      return { addListener: function () { return Promise.resolve({ remove: function () {} }); }, exitApp: function () {} };
    },
    Plugins: {}
  };
  // The broken WebView API must never be used when the plugin exists.
  window.webkitSpeechRecognition = function () { throw new Error('web speech used in the APK'); };
}

(async () => {
  const server = srv.createServer(null);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    // 1a. Native plugin: asks for the mic, then proposes what it heard.
    let page = await browser.newPage({ viewport: { width: 360, height: 640 }, hasTouch: true });
    let errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(fakeNative, 'granted');
    await page.goto(origin + '/');
    await skipSplash(page);
    await openRegister(page);
    await page.waitForTimeout(500);
    await page.locator('[data-dictate]').click();
    const proposal = page.locator('[data-event-proposal]');
    await proposal.waitFor({ state: 'visible', timeout: 3000 });
    assert(/decúbito lateral/i.test(await proposal.textContent()), 'proposal shows the native transcript');
    const calls = await page.evaluate(() => window.__speech.calls);
    assert.strictEqual(calls[0], 'requestPermissions', 'the mic permission is requested first: ' + calls);
    assert(/^start:/.test(calls[1]), 'then the native recognizer starts: ' + calls);
    assert.deepStrictEqual(errors, []);
    ok('APK dictation uses the native plugin and asks for the mic');
    await page.close();

    // 1b. Permission denied: typing fallback with the mic message.
    page = await browser.newPage({ viewport: { width: 360, height: 640 }, hasTouch: true });
    await page.addInitScript(fakeNative, 'denied');
    await page.goto(origin + '/');
    await skipSplash(page);
    await openRegister(page);
    await page.waitForTimeout(500);
    await page.locator('[data-dictate]').click();
    await page.waitForTimeout(300);
    assert(await page.locator('[data-other-text]').isVisible(), 'denied mic opens the text field');
    assert(/micrófono/i.test(await page.locator('[data-dictate-note]').textContent()), 'note explains the mic permission');
    ok('denied mic falls back to typing');

    // 2. With the typing field open on a short screen, no child is squashed.
    const sheet = page.locator('.registration-sheet');
    const picker = await page.locator('.registration-sheet .event-patient-picker').evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    assert(picker.client >= picker.scroll, 'patient row is cut: ' + JSON.stringify(picker));
    const overflow = await sheet.evaluate((el) => ({ style: getComputedStyle(el).overflowY, scroll: el.scrollHeight, client: el.clientHeight }));
    assert(overflow.scroll <= overflow.client || overflow.style === 'auto', 'sheet content overflows without scrolling: ' + JSON.stringify(overflow));
    ok('Registrar sheet scrolls instead of cutting the patient row');
    await page.close();

    // 3. Slow or dead server: the draft bar shows right away, rules draft follows.
    page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/handover', () => { /* never answers, like a stopped server */ });
    await page.goto(origin + '/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await skipSplash(page);
    await page.locator('.view.is-active [data-handover-open]').first().click();
    await page.waitForTimeout(500);
    await page.locator('[data-handover-generate]').click();
    await page.waitForTimeout(300);
    assert(await page.locator('[data-handover-progress]').isVisible(), 'draft bar shows at once');
    assert(await page.locator('[data-handover-generate]').isDisabled(), 'button is disabled while drafting');
    await page.waitForFunction(() => (document.querySelector('[data-handover-s]') || {}).value, null, { timeout: 7000 });
    assert(!(await page.locator('[data-handover-progress]').isVisible()), 'bar closes after the fallback');
    assert.deepStrictEqual(errors, []);
    ok('draft bar starts on tap and falls back to rules when the server is down');
  } finally {
    await browser.close();
    server.close();
  }
  console.log(passed + ' passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
