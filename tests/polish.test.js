'use strict';

// Regressions from Nico's phone review (2026-10-30): dictation feedback and
// errors, Spanish proposal labels, the 5 s undo toast, the logged-card answer,
// and the success check never sitting under the app bar.
// Run: node tests/polish.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { openRegister } = require('./helpers');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

// Fake recognizer: stays "listening" until stop(), can fail with an error.
const FAKE = () => {
  window.__speech = { error: null, text: 'cambio de posición del paciente' };
  window.webkitSpeechRecognition = function () {
    const self = this;
    self.start = () => setTimeout(() => {
      if (window.__speech.error) { self.onerror && self.onerror({ error: window.__speech.error }); self.onend && self.onend(); return; }
      self.onresult && self.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'cambio de ' }], { isFinal: false })] });
    }, 40);
    self.stop = () => setTimeout(() => {
      self.onresult && self.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: window.__speech.text }], { isFinal: true })] });
      self.onend && self.onend();
    }, 20);
    self.abort = self.stop;
  };
};

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(INDEX);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  try {
    let page = await fresh(browser);
    await openRegister(page);
    await page.waitForTimeout(500);
    const dictate = page.locator('[data-dictate]');
    await dictate.click();
    await page.waitForTimeout(200);
    assert(/Escuchando/.test(await dictate.textContent()), 'button says it is listening');
    assert.strictEqual(await dictate.getAttribute('aria-pressed'), 'true');
    assert(/cambio de/.test(await dictate.textContent()), 'live transcript shows while listening');
    await dictate.click();
    await page.waitForTimeout(400);
    assert(!/Escuchando/.test(await dictate.textContent()), 'second tap stops listening');
    const proposal = page.locator('[data-event-proposal]');
    assert(await proposal.isVisible(), 'proposal appears after stopping');
    assert.strictEqual((await page.locator('[data-proposal-kind]').textContent()).trim(), 'Cambio de posición', 'kind label is Spanish, never "position"');
    ok('dictation: listening state, live text, tap to stop, Spanish proposal');

    await page.evaluate(() => { window.__speech.error = 'not-allowed'; });
    await page.locator('[data-proposal-cancel]').click().catch(() => {});
    await dictate.click();
    await page.waitForTimeout(300);
    assert(await page.locator('[data-other-text]').isVisible(), 'error falls back to typing');
    assert(/micrófono/i.test(await page.locator('[data-dictate-note]').textContent()), 'error says why');
    ok('dictation: a denied microphone explains itself and offers typing');

    await page.locator('[data-quick-event="Ronda"]').click();
    await page.waitForTimeout(150);
    assert(await page.locator('[data-quick-event="Ronda"] .logged-mark').isVisible(), 'the card answers with a check');
    assert(await page.locator('.snackbar .snack-timer').count() === 1, 'toast shows its 5 s countdown');
    assert(await page.locator('.snackbar [data-undo-event]').isVisible());
    await page.waitForTimeout(5300);
    assert(!(await page.locator('.snackbar').isVisible()), 'toast is gone after 5 s');
    ok('registro: card check, toast with countdown, gone after 5 s');
    assert.deepStrictEqual(page.errors, []);
    await page.close();

    page = await fresh(browser);
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(500);
    for (let i = 0; i < 3; i += 1) {
      await page.locator('.view.is-active .tap-confirm').first().click();
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(2500);
    const bar = await page.locator('.view.is-active .top-app-bar').boundingBox();
    const check = await page.locator('.view.is-active .success-check').boundingBox();
    const box = await page.locator('.view.is-active [data-empty-state]').boundingBox();
    assert(check.y >= bar.y + bar.height + 8, 'success check sits below the app bar');
    assert(check.y >= box.y, 'success check never overflows above its container');
    ok('all done: the check sits below the app bar');
    console.log('polish: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('polish: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
