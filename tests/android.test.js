'use strict';

// Android structure (critique 2026-10-29, P1 + P2): no fake phone chrome on a
// real phone, top app bar per screen, one Registrar FAB, system Back closes
// detail and sheets instead of the app, roles behind a demo "Ver como" menu,
// a glove-sized Registrar sheet, and the mascot only at calm moments.
// Run: node tests/android.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const srv = require('../server/server');
const INDEX_FILE = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function skipSplash(page) {
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
}

async function box(locator) {
  const b = await locator.boundingBox();
  assert(b, 'element has no box');
  return b;
}

(async () => {
  // Served over http so history (Back) behaves like the installed app.
  const server = srv.createServer(null);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await skipSplash(page);

    // 1. No fake chrome on a phone-width screen.
    for (const sel of ['.phone-notch', '.status-bar', '.role-switch']) {
      assert(!(await page.locator(sel).first().isVisible().catch(() => false)), sel + ' must not show on a phone');
    }
    ok('no fake notch, status bar or role tabs on a phone');

    // 2. Top app bar with exactly one h1 and the demo menu.
    const bar = page.locator('.view.is-active .top-app-bar');
    assert.strictEqual(await bar.count(), 1, 'active view has one .top-app-bar');
    assert.strictEqual(await page.locator('.view.is-active h1').count(), 1, 'one h1 per view');
    const menu = page.locator('[data-demo-menu]');
    assert(await menu.first().isVisible(), 'demo menu button visible');
    const mb = await box(menu.first());
    assert(mb.width >= 48 && mb.height >= 48, 'menu button >= 48dp');
    await menu.first().click();
    const items = page.locator('[data-view-as]');
    assert.strictEqual(await items.count(), 3, 'menu offers the 3 readers');
    assert.strictEqual(await page.locator('[data-view-as="enfermero"]').getAttribute('aria-checked'), 'true', 'current reader is checked');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert(!(await items.first().isVisible()), 'Escape closes the menu');
    ok('top app bar, one h1, demo "Ver como" menu');

    // 3. FAB replaces the Registrar nav tab.
    assert.strictEqual(await page.locator('.bottom-nav [data-nav="registrar"]').count(), 0, 'Registrar is no longer a nav tab');
    const fab = page.locator('[data-fab-register]');
    assert(await fab.isVisible(), 'FAB visible on nurse home');
    const fb = await box(fab);
    assert(fb.width >= 56 && fb.height >= 56, 'FAB >= 56dp');
    assert(/Registrar/.test((await fab.getAttribute('aria-label')) || (await fab.textContent())), 'FAB is labelled Registrar');
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(500);
    assert(await fab.isVisible(), 'FAB visible on Pendientes');
    await page.locator('[data-nav="turno"]').click();
    await page.waitForTimeout(500);
    ok('Registrar FAB on nurse screens');

    // 4. System Back closes detail and sheets, never the app.
    await page.locator('[data-patient="mg"]').first().click();
    await page.waitForTimeout(600);
    assert(await page.locator('[data-fab-register]').isVisible(), 'FAB visible on patient detail');
    await page.goBack();
    await page.waitForTimeout(600);
    assert(page.url().startsWith(origin), 'Back stayed in the app');
    assert(await page.locator('[data-view-key="nurse-home"]').isVisible(), 'Back from detail returns to home');
    await fab.click();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('.registration-layer.is-open').count(), 1, 'FAB opens the sheet');
    await page.goBack();
    await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('.registration-layer.is-open').count(), 0, 'Back closes the sheet');
    assert(page.url().startsWith(origin), 'Back from sheet stayed in the app');
    await page.locator('[data-handover-open]').first().click();
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('.ai-layer.is-open').count(), 0, 'Back closes the SBAR sheet');
    ok('system Back closes detail, Registrar and SBAR sheets');

    // 5. Glove-sized Registrar sheet; no hold-to-talk lie; no decorative pulse.
    await fab.click();
    await page.waitForTimeout(500);
    for (const chip of await page.locator('[data-event-patient]').all()) {
      const b = await box(chip);
      assert(b.height >= 48, 'patient chip >= 48dp tall, got ' + b.height);
    }
    const sheetText = await page.locator('.registration-sheet').textContent();
    assert(!/Mantén presionado/i.test(sheetText), 'dictate copy must match a tap, not press-and-hold');
    const dictate = page.locator('.dictate-button');
    assert((await box(dictate)).height >= 56, 'dictate >= 56dp');
    const colors = await dictate.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ink)';
      el.appendChild(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      return { bg: getComputedStyle(el).backgroundColor, ink };
    });
    assert.notStrictEqual(colors.bg, colors.ink, 'dictate is tonal, not an ink-black bar');
    assert.strictEqual(await page.locator('.dictate-pulse').count(), 0, 'decorative pulsing dot removed');
    ok('Registrar sheet: 48dp patient chips, tap copy, tonal mic, no pulse');

    // 6. Feedback is a Material snackbar with undo.
    await page.locator('[data-quick-event="Ronda"]').click();
    await page.waitForTimeout(300);
    const snack = page.locator('.snackbar[role="status"]');
    assert(await snack.isVisible(), 'snackbar with role=status after registering');
    assert(await snack.locator('[data-undo-event]').isVisible(), 'snackbar offers undo');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    ok('snackbar feedback with undo');

    // 7. Readers: FAB only for the nurse; mascot only at calm moments.
    const { viewAs } = require('./helpers');
    await viewAs(page, 'paciente');
    await page.waitForTimeout(600);
    assert(!(await page.locator('[data-fab-register]').isVisible().catch(() => false)), 'no FAB for the patient');
    assert(await page.locator('.view.is-active .next-card [data-mascot]').count() >= 1, 'mascot accompanies the patient "Lo que sigue" card');
    await viewAs(page, 'enfermero');
    await page.waitForTimeout(600);
    await page.locator('[data-patient="cr"]').first().click();
    await page.waitForTimeout(600);
    assert.strictEqual(await page.locator('.view.is-active [data-mascot]').count(), 0, 'no mascot on the clinical detail');
    ok('FAB only for the nurse; mascot on calm screens, not clinical ones');

    // 8. Desktop stage may keep the phone frame for the demo.
    const wide = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await wide.goto(origin + '/');
    await skipSplash(wide);
    assert(await wide.locator('[data-demo-menu]').first().isVisible(), 'demo menu also works on the desktop stage');
    await wide.close();
    ok('desktop stage still demos');

    // 9. file:// still opens (double-click demo), no page errors anywhere.
    const local = await browser.newPage({ viewport: { width: 390, height: 844 } });
    local.on('pageerror', (e) => errors.push('file: ' + e.message));
    await local.goto(INDEX_FILE);
    await skipSplash(local);
    assert(await local.locator('[data-view-key="nurse-home"]').isVisible(), 'file:// opens the nurse home');
    await local.close();
    assert.deepStrictEqual(errors, [], 'no page errors');
    ok('file:// works, no page errors');

    console.log('android: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('android: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
