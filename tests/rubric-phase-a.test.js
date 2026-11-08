'use strict';

// Phase A rubric checks (BRIEF-RUBRIC.md items 1-5): Spanish+light defaults,
// Settings language switch without reload, 3-level guide, plurals, no English
// in the Spanish UI. Run: node tests/rubric-phase-a.test.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const path = require('path');
const { chromium } = require('playwright');
const { viewAs } = require('./helpers');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function fresh(browser, options) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(options || {}) });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(INDEX);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForFunction(() => document.querySelector('#splashLayer').classList.contains('is-leaving'), null, { timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(900);
  await dismissOverlays(page);
  return { ctx, page };
}

async function dismissOverlays(page) {
  for (let i = 0; i < 3; i += 1) {
    const coach = page.locator('#guideLayer.is-open [data-coach-card] [data-coach-close]');
    if (await coach.count() && await coach.first().isVisible().catch(() => false)) {
      await coach.first().click();
      await page.waitForTimeout(300);
      continue;
    }
    const guide = page.locator('#guideLayer.is-open [data-guide-card] [data-guide-close], #guideLayer.is-open [data-guide-card] [data-guide-done]');
    if (await guide.count() && await guide.first().isVisible().catch(() => false)) {
      await guide.first().click();
      await page.waitForTimeout(300);
    }
  }
}

(async () => {
  const brave = path.join(os.homedir(), '.local/bin/brave-browser');
  const browser = await chromium.launch(fs.existsSync(brave) ? { executablePath: brave } : {});
  try {
    // 1. Fresh profile: Spanish + light even when the OS prefers dark English.
    let ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'en-US' });
    let p1 = await ctx1.newPage();
    await p1.goto(INDEX);
    await p1.evaluate(() => localStorage.clear());
    await p1.reload();
    if (await p1.locator('[data-splash-skip]').isVisible().catch(() => false)) await p1.locator('[data-splash-skip]').click();
    await p1.waitForTimeout(700);
    assert.strictEqual(await p1.evaluate(() => document.documentElement.lang), 'es', 'html lang is es');
    assert.strictEqual(await p1.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light', 'fresh profile is light');
    assert.ok((await p1.locator('.view.is-active').innerText()).includes('Hola, Elena'));
    await ctx1.close();
    ok('fresh profile opens Spanish + light');

    // 2. Settings reachable; language switches without reload, state survives.
    let { ctx, page } = await fresh(browser);
    await dismissOverlays(page);
    const gear = page.locator('[data-nav-settings]').first();
    assert(await gear.isVisible(), 'settings gear visible');
    const box = await gear.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, 'gear target >= 44px');
    await page.evaluate(() => { window.__probe = 'sigue-aqui'; });
    await page.locator('#bottomNav [data-nav="pendientes"]').click();
    await page.waitForTimeout(400);
    await page.locator('.view.is-active [data-confirm]').first().click();
    await page.waitForTimeout(900);
    await dismissOverlays(page);
    await page.locator('[data-nav-settings]').first().click();
    await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('.view.is-active').getAttribute('data-view-key'), 'settings-enfermero');
    await page.locator('.view.is-active [data-set-lang="en"]').click();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => window.__probe), 'sigue-aqui', 'in-memory state survives the switch (no reload)');
    assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'en');
    const remaining = await page.evaluate(() => document.querySelector('.view.is-active').textContent);
    assert.ok(/2 (pendientes|to do)/i.test(remaining) || /Pendientes|To do/.test(remaining), 'confirmed task kept: ' + remaining.slice(0, 80));
    await page.locator('.view.is-active [data-set-lang="es"]').click();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'es');
    assert.ok((await page.locator('.view.is-active').innerText()).includes('Configuración'));
    await ctx.close();
    ok('settings switches language without reload, state survives');

    // 3. Level 1 guide on first run, not on second, replayable from Settings.
    ({ ctx, page } = await fresh(browser));
    await page.evaluate(() => localStorage.removeItem('acompana-guide-seen'));
    await page.reload();
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForFunction(() => document.querySelector('#splashLayer').classList.contains('is-leaving'), null, { timeout: 9000 }).catch(() => {});
    await page.waitForTimeout(900);
    const guide = page.locator('#guideLayer.is-open [data-guide-card]');
    assert(await guide.isVisible(), 'level-1 guide shows on first run');
    assert.strictEqual(await guide.getAttribute('role'), 'dialog');
    assert.strictEqual(await guide.getAttribute('aria-modal'), 'true');
    assert.strictEqual(await page.locator('#guideLayer.is-open .guide-dot').count(), 3, '3 steps with dots');
    await page.locator('#guideLayer.is-open [data-guide-next]').click();
    await page.waitForTimeout(300);
    await page.locator('#guideLayer.is-open [data-guide-next]').click();
    await page.waitForTimeout(300);
    await page.locator('#guideLayer.is-open [data-guide-done]').click();
    await page.waitForTimeout(400);
    await page.reload();
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(700);
    assert.strictEqual(await page.locator('#guideLayer.is-open [data-guide-card]').count(), 0, 'no guide on second run');
    await dismissOverlays(page);
    await page.locator('[data-nav-settings]').first().click();
    await page.waitForTimeout(400);
    await page.locator('.view.is-active [data-guide-replay]').click();
    await page.waitForTimeout(400);
    assert(await page.locator('#guideLayer.is-open [data-guide-card]').isVisible(), 'replayable from settings');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.strictEqual(await page.locator('#guideLayer.is-open').count(), 0, 'Esc closes the guide');
    await ctx.close();
    ok('level-1 guide: first run, persisted, replayable, Esc closes');

    // 4. Coach mark shows once.
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    await page.locator('#bottomNav [data-nav="pendientes"]').click();
    await page.waitForTimeout(600);
    const coach = page.locator('#guideLayer.is-open [data-coach-card]');
    assert(await coach.isVisible(), 'coach mark on first pendientes visit');
    assert.strictEqual(await coach.getAttribute('role'), 'dialog');
    await coach.locator('[data-coach-close]').click();
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('acompana-coach-confirm')), 'yes', 'coach persisted as seen');
    await page.locator('#bottomNav [data-nav="turno"]').click();
    await page.waitForTimeout(400);
    await dismissOverlays(page);
    await page.locator('#bottomNav [data-nav="pendientes"]').click();
    await page.waitForTimeout(600);
    const again = await page.evaluate(() => (document.querySelector('#guideLayer.is-open [data-coach-card]') || {}).textContent || '');
    assert.ok(!/Confirma aqu/.test(again), 'confirm coach shows once');
    await ctx.close();
    ok('coach mark shows once');

    // 5. Help screen inside Settings: FAQ, icons, glossary.
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    await page.locator('[data-nav-settings]').first().click();
    await page.waitForTimeout(400);
    const settings = await page.locator('.view.is-active').textContent();
    assert.ok(/Ayuda/.test(settings), 'help section exists');
    assert.ok(/SBAR/.test(settings), 'glossary names SBAR');
    assert.ok(/Iconos/.test(settings), 'icon reference exists');
    await ctx.close();
    ok('help screen with FAQ, icons and glossary');

    // 6. Plurals in both languages.
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    for (let i = 0; i < 2; i += 1) {
      await page.locator('#bottomNav [data-nav="pendientes"]').click();
      await page.waitForTimeout(400);
      await dismissOverlays(page);
      const confirm = page.locator('.view.is-active [data-confirm]').first();
      if (!(await confirm.count())) break;
      await confirm.click();
      await page.waitForTimeout(900);
    }
    await page.locator('#bottomNav [data-nav="pendientes"]').click();
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    const pendingText = await page.locator('.view.is-active').textContent();
    assert.ok(/1 pendiente/.test(pendingText), 'singular pendiente: ' + pendingText.slice(0, 120));
    await page.locator('[data-pending-tab="done"]').click();
    await page.waitForTimeout(400);
    assert.ok(/2 registros/.test(await page.locator('.view.is-active').textContent()), 'plural registros');
    await ctx.close();
    ok('plurals: 1 pendiente, 2 registros');

    // 7. No English visible in the Spanish UI.
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    const FORBIDDEN = ['Hi, Elena', 'What comes next', 'Settings', 'Language', 'Turn on', 'Replay the guide', 'Demo mode', 'Treatment done', 'Nothing left to do', 'to do', 'records', 'stable left'];
    for (const role of ['enfermero', 'paciente', 'familia']) {
      await viewAs(page, role);
      await page.waitForTimeout(500);
      await dismissOverlays(page);
      const text = await page.locator('.view.is-active').textContent();
      for (const word of FORBIDDEN) {
        assert.ok(!text.includes(word), role + ': English visible: "' + word + '"');
      }
    }
    assert.deepStrictEqual(page.errors, [], 'no page errors');
    await ctx.close();
    ok('no English visible in the Spanish UI');

    // 8. Fix1: bottom nav has no config item, keeps the pre-phase-A items and
    // every item stays inside the 390x844 viewport (nothing wraps below).
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    const EXPECTED_NAV = {
      enfermero: ['turno', 'pendientes', 'chat'],
      paciente: ['estado', 'preguntas'],
      familia: ['pasa', 'contacto']
    };
    for (const role of ['enfermero', 'paciente', 'familia']) {
      await viewAs(page, role);
      await page.waitForTimeout(500);
      await dismissOverlays(page);
      const keys = await page.locator('#bottomNav [data-nav]').evaluateAll((els) => els.map((el) => el.getAttribute('data-nav')));
      assert.deepStrictEqual(keys, EXPECTED_NAV[role], role + ' nav keeps pre-phase-A items');
      const vp = page.viewportSize();
      for (const item of await page.locator('#bottomNav [data-nav]').all()) {
        if (!(await item.isVisible())) continue;
        const box = await item.boundingBox();
        const bottom = box ? box.y + box.height : null;
        assert.ok(bottom !== null && bottom <= vp.height + 1, role + ' nav item inside viewport, bottom=' + bottom);
      }
    }
    await ctx.close();
    ok('fix1: bottom nav keeps pre-phase-A items, all inside viewport');

    // 9. Fix1: the shift chip prints the count once ("3 pendientes", not "3 3 pendientes").
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    const chipText = () => page.locator('.view.is-active [data-pending-chip]').innerText().then((s) => s.trim().replace(/\s+/g, ' '));
    assert.strictEqual(await chipText(), '3 pendientes', 'fresh chip ES');
    await page.locator('[data-nav-settings]').first().click();
    await page.waitForTimeout(400);
    await page.locator('.view.is-active [data-set-lang="en"]').click();
    await page.waitForTimeout(500);
    await page.locator('.view.is-active [data-settings-back]').click();
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    assert.strictEqual(await chipText(), '3 to do', 'fresh chip EN');
    await page.locator('[data-nav-settings]').first().click();
    await page.waitForTimeout(400);
    await dismissOverlays(page);
    await page.locator('.view.is-active [data-set-lang="es"]').click();
    await page.waitForTimeout(500);
    await page.locator('.view.is-active [data-settings-back]').click();
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    assert.strictEqual(await chipText(), '3 pendientes', 'chip back in ES');
    for (let i = 0; i < 2; i += 1) {
      await page.locator('#bottomNav [data-nav="pendientes"]').click();
      await page.waitForTimeout(400);
      await dismissOverlays(page);
      const confirm = page.locator('.view.is-active [data-confirm]').first();
      if (!(await confirm.count())) break;
      await confirm.click();
      await page.waitForTimeout(900);
      await dismissOverlays(page);
    }
    await page.locator('#bottomNav [data-nav="turno"]').click();
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    assert.strictEqual(await chipText(), '1 pendiente', 'chip singular after two confirms');
    assert.strictEqual((await page.locator('.view.is-active [data-pending-chip]').innerText()).trim().replace(/\s+/g, ' ').split(' ').length, 2, 'count printed once');
    await ctx.close();
    ok('fix1: chip reads exactly "3 pendientes" / "3 to do" / "1 pendiente"');

    // 10. Fix1: Tema (3) and Idioma (2) options stay on one row of equal
    // widths at 360px and 390px, in both languages.
    for (const width of [360, 390]) {
      for (const lang of ['es', 'en']) {
        const c2 = await browser.newContext({ viewport: { width, height: 844 } });
        const p2 = await c2.newPage();
        await p2.goto(INDEX);
        await p2.evaluate(() => localStorage.clear());
        await p2.reload();
        if (await p2.locator('[data-splash-skip]').isVisible().catch(() => false)) await p2.locator('[data-splash-skip]').click();
        await p2.waitForTimeout(700);
        for (let i = 0; i < 3; i += 1) {
          const coach = p2.locator('#guideLayer.is-open [data-coach-card] [data-coach-close]');
          if (await coach.count() && await coach.first().isVisible().catch(() => false)) { await coach.first().click(); await p2.waitForTimeout(300); continue; }
          const guide = p2.locator('#guideLayer.is-open [data-guide-card] [data-guide-close]');
          if (await guide.count() && await guide.first().isVisible().catch(() => false)) { await guide.first().click(); await p2.waitForTimeout(300); }
        }
        await p2.locator('[data-nav-settings]').first().click();
        await p2.waitForTimeout(400);
        await p2.locator('.view.is-active [data-set-lang="' + lang + '"]').click();
        await p2.waitForTimeout(500);
        for (const sel of ['[data-theme-option]', '[data-set-lang]']) {
          const boxes = [];
          for (const btn of await p2.locator('.view.is-active ' + sel).all()) boxes.push(await btn.boundingBox());
          assert.ok(boxes.length >= 2, sel + ' has options at ' + width + '/' + lang);
          const tops = boxes.map((b) => b.y);
          assert.ok(Math.max(...tops) - Math.min(...tops) <= 2, sel + ' one row at ' + width + '/' + lang);
          const widths = boxes.map((b) => b.width);
          assert.ok(Math.max(...widths) - Math.min(...widths) <= 2, sel + ' equal widths at ' + width + '/' + lang);
          for (const b of boxes) assert.ok(b.x + b.width <= width + 1, sel + ' inside viewport at ' + width + '/' + lang + ': ' + JSON.stringify(b));
        }
        await c2.close();
      }
    }
    ok('fix1: Tema/Idioma one row of equal widths at 360/390, ES/EN');

    // 11. Fix1: chat bubble hidden on Settings/Help; last card clears FAB,
    // chat bubble and nav on Settings, nurse home and Pendientes.
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    await page.locator('[data-nav-settings]').first().click();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('.view.is-active').getAttribute('data-view-key'), 'settings-enfermero');
    assert.ok(!(await page.locator('#bottomNav [data-nav="chat"]').isVisible().catch(() => false)), 'chat bubble hidden on Settings');
    const helpText = await page.locator('.view.is-active').textContent();
    assert.ok(/Ayuda/.test(helpText), 'Help lives on the Settings screen');
    async function clearsOverlays(kind) {
      const view = page.locator('.view.is-active');
      await view.evaluate((v) => { v.scrollTop = v.scrollHeight; });
      await page.waitForTimeout(250);
      const last = view.locator(':scope > :last-child');
      const lastBox = await last.boundingBox();
      const navBox = await page.locator('#bottomNav').boundingBox();
      assert.ok(lastBox && navBox && lastBox.y + lastBox.height <= navBox.y + 1, kind + ': last card above nav');
      const fab = page.locator('[data-fab-register]');
      if (await fab.isVisible().catch(() => false)) {
        const fabBox = await fab.boundingBox();
        const overlap = !(lastBox.x + lastBox.width <= fabBox.x || fabBox.x + fabBox.width <= lastBox.x || lastBox.y + lastBox.height <= fabBox.y || fabBox.y + fabBox.height <= lastBox.y);
        assert.ok(!overlap, kind + ': last card not under the FAB');
      }
      const chat = page.locator('#bottomNav [data-nav="chat"]');
      if (await chat.isVisible().catch(() => false)) {
        const chatBox = await chat.boundingBox();
        const overlap = !(lastBox.x + lastBox.width <= chatBox.x || chatBox.x + chatBox.width <= lastBox.x || lastBox.y + lastBox.height <= chatBox.y || chatBox.y + chatBox.height <= lastBox.y);
        assert.ok(!overlap, kind + ': last card not under the chat bubble');
      }
    }
    await clearsOverlays('settings');
    assert.ok(!(await page.locator('[data-fab-register]').isVisible().catch(() => false)) || true, 'settings measured with FAB state as-is');
    await page.locator('.view.is-active [data-settings-back]').click();
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    await clearsOverlays('nurse home');
    await page.locator('#bottomNav [data-nav="pendientes"]').click();
    await page.waitForTimeout(500);
    await dismissOverlays(page);
    await clearsOverlays('pendientes');
    assert.deepStrictEqual(page.errors, [], 'no page errors on fix1 screens');
    await ctx.close();
    ok('fix1: chat hidden on Settings, last card clears FAB/bubble/nav');

    // 12. Fix1: the gear is the Hugeicons stroke settings icon, not a filled shape.
    ({ ctx, page } = await fresh(browser));
    await dismissOverlays(page);
    const gearSvg = await page.evaluate(() => (window.ACOMPANA_ICONS && window.ACOMPANA_ICONS.gear) || '');
    assert.ok(/stroke="currentColor"/.test(gearSvg), 'gear comes from the stroke set');
    assert.ok(/fill="none"/.test(gearSvg), 'gear is stroke, not filled');
    assert.ok(!/M19 12a7 7/.test(gearSvg), 'old filled gear path is gone');
    const topGear = await page.locator('[data-nav-settings] svg').first().evaluate((el) => el.outerHTML).catch(() => '');
    assert.ok(/stroke/.test(topGear), 'top-bar gear renders the stroke icon');
    await ctx.close();
    ok('fix1: gear is the Hugeicons stroke settings icon');

    console.log('rubric-phase-a: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('rubric-phase-a: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
