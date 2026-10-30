'use strict';

// "Avisar a la familia": a WhatsApp-ready, family-safe message with a link
// that opens the family view; confirm checks are white and turn blue on done.
// Run: node tests/share.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { openRegister } = require('./helpers');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

function lum(c) {
  const n = (c.match(/[\d.]+/g) || []).map(Number);
  const rgb = c.startsWith('color(') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
  const f = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

async function fresh(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { window.__shared = null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }; });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url || INDEX);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('acompana-theme', 'light'); });
  await page.reload();
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  try {
    let page = await fresh(browser);
    // Log something clinical for Carlos and María first.
    await openRegister(page);
    await page.waitForTimeout(400);
    await page.locator('[data-event-patient="mg"]').click();
    await page.locator('[data-quick-event="Medicación"]').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    await page.locator('[data-patient="mg"]').first().click();
    await page.waitForTimeout(700);
    const btn = page.locator('.view.is-active [data-share-family]');
    assert(await btn.isVisible(), 'patient detail has "Avisar a la familia"');
    await btn.click();
    await page.waitForTimeout(300);
    const shared = await page.evaluate(() => window.__shared);
    assert.strictEqual(shared, null, 'no system share sheet');
    assert(/Mensaje enviado a la familia|Sin conexión/.test(await page.locator('#snackbar').textContent()), 'shows in-app feedback');
    const text = await page.evaluate(() => window.__acompana.familyMessage({ id: 'mg', name: 'María González', room: 'Hab. 304-B' }).text);
    assert(/familia de María/i.test(text), 'addressed to María\'s family');
    assert(/visita/i.test(text), 'includes visiting hours');
    assert(/Tratamiento cumplido|medicamento/i.test(text), 'includes today\'s plain-language events');
    // Case-sensitive on purpose: \b treats "ñ" as a boundary, so /PA\b/i hits "Acompaña".
    assert(!/[Ee]noxaparina|\d\s?mg\b|\bSC\b|90\/55|[Tt]aquicardia|\bPA \d/.test(text), 'never clinical values or drug names');
    assert(!/ver=familia|wa\.me|https?:\/\//.test(text), 'no link line in the in-app message');
    ok('Avisar a la familia: family-safe message posted in the app');
    assert.deepStrictEqual(page.errors, []);
    await page.close();

    // The link opens the app in the family view.
    page = await fresh(browser, INDEX + '?ver=familia');
    await page.waitForTimeout(400);
    assert(await page.locator('[data-view-key="family-home"]').isVisible(), '?ver=familia opens the family home');
    ok('the shared link lands on the family view');
    await page.close();

    // Checks: white at rest, blue once done.
    page = await fresh(browser);
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(600);
    const check = page.locator('.view.is-active .task-action').first();
    assert(lum(await check.evaluate((n) => getComputedStyle(n).backgroundColor)) > 0.85, 'confirm check is white at rest');
    await check.click();
    await page.waitForTimeout(120);
    const done = await page.locator('.view.is-active .task-card.is-confirming .task-action, .view.is-active .task-action.is-done').first().evaluate((n) => { const s = getComputedStyle(n); return s.backgroundImage !== 'none' ? 'gradient' : s.backgroundColor; });
    assert(done === 'gradient' || lum(done) < 0.4, 'the check turns blue when done');
    ok('confirm checks: white, then blue');
    console.log('share: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('share: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
