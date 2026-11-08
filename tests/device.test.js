'use strict';

// Phone review of v0.1.2 (Nico, 2026-11-05): a focused field shows one rounded
// ring, not a square box inside it; and on Android 15 the app sits inside the
// status bar and the 3-button navigation instead of under them.
// Run: node tests/device.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { openRegister } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function ring(page, selector) {
  return page.locator(selector).first().evaluate((field) => {
    const box = field.closest('.field-box');
    const css = getComputedStyle(field);
    const boxCss = box ? getComputedStyle(box) : null;
    return {
      fieldOutline: css.outlineStyle,
      boxShadow: boxCss ? boxCss.boxShadow : 'no field-box',
      boxRadius: boxCss ? parseFloat(boxCss.borderTopLeftRadius) : 0
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(INDEX);
    await page.evaluate(() => { localStorage.setItem('acompana-guide-seen', '{"all":true}'); ['confirm','handover','register','ask','visit'].forEach(function(k){ localStorage.setItem('acompana-coach-'+k, 'yes'); }); });
      await page.evaluate(() => { localStorage.setItem('acompana-guide-seen', '{"all":true}'); ['confirm','handover','register','ask','visit'].forEach(function(k){ localStorage.setItem('acompana-coach-'+k, 'yes'); }); });
      if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
      await page.waitForTimeout(600);

      // SBAR fields.
      await page.locator('.view.is-active [data-handover-open]').click();
      await page.waitForTimeout(500);
      await page.locator('[data-handover-b]').click();
      let r = await ring(page, '[data-handover-b]');
      assert.strictEqual(r.fieldOutline, 'none', scheme + ': no square outline inside the SBAR field');
      assert.ok(r.boxShadow !== 'none' && r.boxRadius > 0, scheme + ': the rounded field box carries the focus ring: ' + JSON.stringify(r));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // "Otro evento" text box in the register sheet.
      await openRegister(page);
      await page.waitForTimeout(500);
      await page.locator('[data-quick-event="Otro evento"]').click();
      await page.waitForTimeout(300);
      await page.locator('[data-other-text]').click();
      r = await ring(page, '[data-other-text]');
      assert.strictEqual(r.fieldOutline, 'none', scheme + ': no square outline inside the event field');
      assert.ok(r.boxShadow !== 'none', scheme + ': event field box shows the ring');
      await ctx.close();
    }
    ok('fields: one rounded focus ring in light and dark');
  } finally {
    await browser.close();
  }

  // Chat is a bottom-nav tab (Turno / Pendientes / Chat, three equal
  // symmetric tabs) with the round 56px Registrar FAB docked bottom-right
  // 16px above the nav; the toast clears the nav.
  const browser2 = await chromium.launch();
  try {
    const page = await browser2.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(INDEX);
    await page.evaluate(() => { localStorage.setItem('acompana-guide-seen', '{"all":true}'); ['confirm','handover','register','ask','visit'].forEach(function(k){ localStorage.setItem('acompana-coach-'+k, 'yes'); }); });
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(600);
    await openRegister(page);
    await page.waitForTimeout(400);
    await page.locator('[data-quick-event="Ronda"]').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const g = await page.evaluate(() => {
      const nav = document.querySelector('#bottomNav').getBoundingClientRect();
      const tabs = [...document.querySelectorAll('#bottomNav [data-nav]')].map((el) => el.getBoundingClientRect());
      const chat = document.querySelector('#bottomNav [data-nav="chat"]').getBoundingClientRect();
      const fab = document.querySelector('[data-fab-register]').getBoundingClientRect();
      const snack = document.querySelector('#snackbar').getBoundingClientRect();
      return { navTop: nav.top, navBottom: nav.bottom, navCx: nav.left + nav.width / 2, tabs: tabs.map((t) => t.width), midCx: tabs[1].left + tabs[1].width / 2, chatTop: chat.top, chatBottom: chat.bottom, fabCx: fab.left + fab.width / 2, fabRight: fab.right, navRight: nav.right, fabW: fab.width, fabH: fab.height, fabTop: fab.top, fabBottom: fab.bottom, snackBottom: snack.bottom, snackVisible: snack.height > 0 };
    });
    assert.ok(g.chatTop >= g.navTop - 2 && g.chatBottom <= g.navBottom + 2, 'chat tab lives inside the bottom nav: ' + JSON.stringify(g));
    assert.strictEqual(g.tabs.length, 3, 'three equal tabs: ' + JSON.stringify(g));
    assert.ok(Math.max(...g.tabs) - Math.min(...g.tabs) <= 2, 'tabs equal width: ' + JSON.stringify(g.tabs));
    assert.ok(Math.abs(g.midCx - g.navCx) <= 4, 'tabs symmetric around the nav center: ' + JSON.stringify(g));
    assert.ok(g.fabCx > g.navCx, 'the Registrar FAB is docked right, not centered: ' + JSON.stringify(g));
    assert.ok(Math.abs(g.navRight - g.fabRight - 16) <= 1, 'the Registrar FAB docks 16px from the right edge: ' + JSON.stringify(g));
    assert.ok(Math.abs(g.fabW - 56) <= 0.5 && Math.abs(g.fabH - 56) <= 0.5, 'the Registrar FAB is a 56px circle: ' + JSON.stringify(g));
    assert.ok(Math.abs(g.navTop - g.fabBottom - 16) <= 1, 'the Registrar FAB sits 16px above the nav: ' + JSON.stringify(g));
    assert.ok(g.snackVisible && g.snackBottom <= g.navTop, 'the toast clears the bottom nav: ' + JSON.stringify(g));
  } finally {
    await browser2.close();
  }
  ok('layout: chat tab inside the bottom nav, 3 symmetric tabs, Registrar docked right, toast above it');

  // The Android WebView is laid out inside the system bars on every Android version.
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  assert.strictEqual(cap.android && cap.android.adjustMarginsForEdgeToEdge, 'force', 'adjustMarginsForEdgeToEdge is force');
  ok('android: app kept inside the status bar and the navigation buttons');

  console.log('device: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + error.message);
  console.log('device: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
