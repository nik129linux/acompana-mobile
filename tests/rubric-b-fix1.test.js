'use strict';

// Phase B fix round 1: docked FAB + 3 equal tabs + compact Confirmar.
// Run: node tests/rubric-b-fix1.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { openSettings } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function freshPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('acompana-guide-seen', '{"all":true}');
    ['confirm', 'handover', 'register', 'ask', 'visit'].forEach(function (k) { localStorage.setItem('acompana-coach-' + k, 'yes'); });
    localStorage.setItem('acompana-lang', 'es');
    try { localStorage.removeItem('acompana-confirmed'); } catch (e) {}
  });
  const p = await ctx.newPage();
  await p.goto(INDEX);
  if (await p.locator('[data-splash-skip]').isVisible().catch(() => false)) await p.locator('[data-splash-skip]').click();
  await p.waitForTimeout(600);
  return p;
}

async function setLang(page, lang) {
  await openSettings(page);
  await page.locator('.view.is-active [data-set-lang="' + lang + '"]').first().click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();

  // 1. Three equal tabs, symmetric; FAB docked bottom-right, extended.
  {
    const page = await freshPage(browser);
    const nav = await page.evaluate(() => {
      const bar = document.querySelector('#bottomNav');
      const items = [...bar.querySelectorAll('[data-nav]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { key: el.getAttribute('data-nav'), label: el.textContent.trim(), x: r.left, w: r.width };
      });
      const b = bar.getBoundingClientRect();
      const fab = document.querySelector('[data-fab-register]');
      const f = fab.getBoundingClientRect();
      const phone = document.querySelector('.phone').getBoundingClientRect();
      return { items, nav: { x: b.left, w: b.width, top: b.top }, fab: { x: f.left, w: f.width, h: f.height, right: f.right, bottom: f.bottom, label: fab.textContent.trim(), hidden: fab.hidden }, phone: { x: phone.left, w: phone.width } };
    });
    assert.strictEqual(nav.items.length, 3, 'nurse nav has 3 tabs, got ' + JSON.stringify(nav.items));
    assert.deepStrictEqual(nav.items.map((i) => i.key), ['turno', 'pendientes', 'chat'], 'tabs are Turno/Pendientes/Chat');
    const ws = nav.items.map((i) => i.w);
    assert.ok(Math.max(...ws) - Math.min(...ws) <= 2, 'tabs equal width, got ' + ws.map((w) => w.toFixed(1)).join(','));
    const leftPad = nav.items[0].x - nav.nav.x;
    const rightPad = (nav.nav.x + nav.nav.w) - (nav.items[2].x + nav.items[2].w);
    assert.ok(Math.abs(leftPad - rightPad) <= 4, 'tabs symmetric in bar: left ' + leftPad.toFixed(1) + ' right ' + rightPad.toFixed(1));
    const midC = nav.items[1].x + nav.items[1].w / 2;
    const navC = nav.nav.x + nav.nav.w / 2;
    assert.ok(Math.abs(midC - navC) <= 4, 'middle tab centered: ' + midC.toFixed(1) + ' vs ' + navC.toFixed(1));
    const fabC = nav.fab.x + nav.fab.w / 2;
    assert.ok(fabC > navC, 'FAB is on the right half, center ' + fabC.toFixed(1) + ' vs nav ' + navC.toFixed(1));
    assert.ok(nav.fab.w > nav.fab.h, 'FAB is extended (w ' + nav.fab.w.toFixed(0) + ' > h ' + nav.fab.h.toFixed(0) + ')');
    assert.ok(/Registrar|Log/.test(nav.fab.label), 'FAB shows Registrar label, got: ' + nav.fab.label);
    assert.ok(nav.fab.bottom <= nav.nav.top + 1, 'FAB sits above the nav (bottom ' + nav.fab.bottom.toFixed(0) + ' vs nav top ' + nav.nav.top.toFixed(0) + ')');
    await page.close();
    ok('1: 3 equal symmetric tabs; extended Registrar FAB docked bottom-right above nav');
  }

  // 2. No card text intersects the FAB at any scroll position.
  {
    const page = await freshPage(browser);
    for (const step of ['home', 'pendientes', 'detail']) {
      if (step === 'pendientes') { await page.locator('[data-nav="pendientes"]').click(); await page.waitForTimeout(500); }
      if (step === 'detail') {
        await page.locator('[data-nav="turno"]').click().catch(() => {});
        await page.waitForTimeout(400);
        const card = page.locator('[data-patient]').first();
        if (await card.count()) { await card.click(); await page.waitForTimeout(600); }
      }
      const hits = await page.evaluate(async () => {
        const fab = document.querySelector('[data-fab-register]');
        const view = document.querySelector('.view.is-active');
        const bad = [];
        const f = fab.getBoundingClientRect();
        const overlaps = (r) => r.width > 0 && r.height > 0 && !(f.right < r.left || f.left > r.right || f.bottom < r.top || f.top > r.bottom);
        const scan = () => {
          for (const el of view.querySelectorAll('.patient-card, .task-card, .hero-card, .shift-list, .ai-card, .section-head')) {
            if (overlaps(el.getBoundingClientRect())) bad.push(el.className.toString().slice(0, 40));
          }
        };
        view.scrollTop = 0; await new Promise((r) => setTimeout(r, 120)); scan();
        view.scrollTop = view.scrollHeight / 2; await new Promise((r) => setTimeout(r, 120)); scan();
        view.scrollTop = view.scrollHeight; await new Promise((r) => setTimeout(r, 120)); scan();
        return { fab: { w: f.width, h: f.height }, bad: bad.slice(0, 6) };
      });
      assert.deepStrictEqual(hits.bad, [], step + ': card overlaps FAB: ' + hits.bad.join('|'));
    }
    await page.close();
    ok('2: scroll padding clears nav+FAB; no card intersects FAB on home/pendientes/detail');
  }

  // 3. Compact Confirmar; names on one line in ES and EN.
  {
    for (const lang of ['es', 'en']) {
      const page = await freshPage(browser);
      await setLang(page, lang);
      await page.locator('[data-nav="turno"]').click().catch(() => {});
      await page.waitForTimeout(400);
      const home = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.view.is-active [data-confirm]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height, label: el.getAttribute('aria-label') || '', text: (el.textContent || '').trim().slice(0, 20) };
        });
        const names = [...document.querySelectorAll('.view.is-active .patient-name')].map((el) => {
          const cs = getComputedStyle(el);
          return { text: (el.textContent || '').trim().slice(0, 20), wrap: el.scrollWidth > el.clientWidth + 1, ws: cs.whiteSpace, h: el.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight) || 0 };
        });
        return { btns, names };
      });
      assert.ok(home.btns.length >= 1, lang + ': confirm buttons present');
      for (const b of home.btns) {
        assert.ok(/Confirmar|Confirm/.test(b.text), lang + ': button reads Confirmar, got ' + b.text);
        assert.ok(/ de | for /.test(b.label), lang + ': aria-label names task+patient, got ' + b.label);
        assert.ok(b.w <= 120.5, lang + ': confirm no wider than 120px, got ' + b.w.toFixed(1));
        assert.ok(b.h <= 56.5 && b.h >= 40, lang + ': confirm height 44..56, got ' + b.h.toFixed(1));
      }
      for (const n of home.names) {
        assert.ok(!n.wrap, lang + ': name stays on one line: ' + n.text);
      }
      await page.locator('[data-nav="pendientes"]').click();
      await page.waitForTimeout(500);
      const pend = await page.evaluate(() => {
        const el = document.querySelector('.view.is-active [data-confirm]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, label: el.getAttribute('aria-label') || '' };
      });
      assert.ok(pend && pend.w <= 120.5, lang + ': pendientes confirm <=120px, got ' + (pend && pend.w.toFixed(1)));
      assert.ok(pend && pend.h <= 56.5, lang + ': pendientes confirm height ok, got ' + (pend && pend.h.toFixed(1)));
      await page.close();
    }
    ok('3: compact Confirmar (<=120px) with task+patient label; names one line in ES+EN');
  }

  await browser.close();
  console.log('rubric-b-fix1: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + (error && error.stack || error));
  console.log('rubric-b-fix1: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
