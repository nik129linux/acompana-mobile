'use strict';

// Nico's review of the nurse flow (2026-10-30): the sheet must not always pick
// Carlos, switching patient animates, a logged event shows up right away,
// "Copiar nota" can also share, Brave explains why it can't dictate, the
// detail CTA sits above the nav (not on the content), and the nav is centered.
// Run: node tests/flow.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { openRegister } = require('./helpers');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function fresh(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (init) await ctx.addInitScript(init);
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

const selected = (page) => page.locator('[data-event-patient][aria-pressed="true"]').getAttribute('data-event-patient');

(async () => {
  const browser = await chromium.launch();
  try {
    let page = await fresh(browser);

    // 1. Default patient: the one whose next task is due first, then the last one used.
    await openRegister(page);
    await page.waitForTimeout(500);
    assert.strictEqual(await selected(page), 'mg', 'from home the sheet preselects the next task due (María 11:00), not the first patient');
    await page.locator('[data-event-patient="jp"]').click();
    const animating = await page.locator('[data-event-patient="jp"]').evaluate((n) => n.getAnimations().length + (n.closest('.event-patient-picker') ? n.closest('.event-patient-picker').getAnimations({ subtree: true }).length : 0));
    assert(animating > 0, 'switching patient animates');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await openRegister(page);
    await page.waitForTimeout(500);
    assert.strictEqual(await selected(page), 'jp', 'reopening remembers the last patient chosen');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    ok('sheet: smart default, remembered choice, animated switch');

    // 2. A logged event shows up on the screen behind the sheet right away.
    await page.locator('[data-patient="mg"]').first().click();
    await page.waitForTimeout(700);
    await page.locator('.view.is-active [data-open-register]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-quick-event="Ronda"]').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const shift = await page.locator('.view.is-active').textContent();
    assert(/Ronda/.test(shift) && /Registrado/.test(shift), 'the detail list shows the new event without navigating away');
    ok('a logged event is visible immediately');

    // 3. Detail CTA docked above the nav, nothing hidden behind it; one register button only.
    const cta = await page.locator('.view.is-active [data-open-register]').boundingBox();
    const nav = await page.locator('.bottom-nav').boundingBox();
    assert(cta.y + cta.height <= nav.y + 1, 'Registrar evento sits above the bottom bar');
    assert(!(await page.locator('[data-fab-register]').isVisible()), 'the + hides where Registrar evento is shown');
    await page.locator('.view.is-active').evaluate((v) => { v.scrollTop = v.scrollHeight; });
    await page.waitForTimeout(200);
    const lastRow = await page.locator('.view.is-active .shift-row, .view.is-active .detail-list-row, .view.is-active .clinical-why').last().boundingBox();
    const cta2 = await page.locator('.view.is-active [data-open-register]').boundingBox();
    assert(lastRow.y + lastRow.height <= cta2.y + 1, 'scrolled to the end, content clears the CTA');
    ok('detail: CTA above the nav, content never under it');
    await page.goBack();
    await page.waitForTimeout(600);

    // 4. Nav: "+" exactly centered, tabs symmetric.
    const phone = await page.locator('.phone').boundingBox();
    const center = phone.x + phone.width / 2;
    const fab = await page.locator('[data-fab-register]').boundingBox();
    assert(Math.abs(fab.x + fab.width / 2 - center) <= 2, '+ is centered');
    const tabs = await page.locator('.bottom-nav .nav-item').all();
    const t0 = await tabs[0].boundingBox();
    const t1 = await tabs[1].boundingBox();
    assert(Math.abs((center - (t0.x + t0.width / 2)) - ((t1.x + t1.width / 2) - center)) <= 4, 'tabs sit symmetric around the +');
    ok('nav: centered + and symmetric tabs');

    // 5. SBAR goes to the team chat in-app, and can still be copied.
    await page.locator('[data-handover-open]').first().click();
    await page.waitForTimeout(500);
    const send = page.locator('[data-handover-chat]');
    assert(await send.isVisible(), 'SBAR has an "Enviar al equipo" button');
    assert(await send.evaluate((n) => n.classList.contains('btn-primary')), 'it is the primary action');
    await send.click();
    await page.waitForTimeout(300);
    assert(/Sin conexión|enviada/i.test(await page.locator('[data-ai-feedback]').textContent()), 'sending reports its state');
    assert(await page.locator('[data-handover-copy]').isVisible(), 'Copiar stays');
    ok('SBAR: team chat and copy');
    assert.deepStrictEqual(page.errors, []);
    await page.close();

    // 6. Brave: the speech API exists but its service is blocked; say so.
    page = await fresh(browser, () => {
      navigator.brave = { isBrave: () => Promise.resolve(true) };
      window.webkitSpeechRecognition = function () {
        const self = this;
        self.start = () => setTimeout(() => { self.onerror && self.onerror({ error: 'network' }); self.onend && self.onend(); }, 30);
        self.stop = () => {};
      };
    });
    await openRegister(page);
    await page.waitForTimeout(500);
    await page.locator('[data-dictate]').click();
    await page.waitForTimeout(300);
    assert(/Chrome/.test(await page.locator('[data-dictate-note]').textContent()), 'Brave users are told to use Chrome or type');
    assert(await page.locator('[data-other-text]').isVisible(), 'typing stays available');
    ok('dictation: Brave explains itself');
    console.log('flow: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('flow: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
