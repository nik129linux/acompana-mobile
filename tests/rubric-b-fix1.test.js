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

  // 1. Three equal tabs, symmetric; 56px round "+" FAB docked bottom-right
  // 16px above the nav, with its accessible name.
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
      return { items, nav: { x: b.left, w: b.width, top: b.top }, fab: { x: f.left, w: f.width, h: f.height, right: f.right, bottom: f.bottom, label: fab.getAttribute('aria-label') || '', hidden: fab.hidden }, phone: { x: phone.left, w: phone.width } };
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
    assert.ok(Math.abs(nav.fab.w - 56) <= 0.5 && Math.abs(nav.fab.h - 56) <= 0.5, 'FAB is a 56px circle, got ' + nav.fab.w.toFixed(0) + 'x' + nav.fab.h.toFixed(0));
    assert.ok(Math.abs((nav.phone.x + nav.phone.w) - nav.fab.right - 16) <= 1, 'FAB is 16px from the right edge, got ' + ((nav.phone.x + nav.phone.w) - nav.fab.right).toFixed(1));
    assert.ok(/^Registrar evento$|^Log event$/.test(nav.fab.label), 'FAB aria-label names the action, got: ' + nav.fab.label);
    assert.ok(Math.abs((nav.nav.top - nav.fab.bottom) - 16) <= 1, 'FAB sits 16px above the nav (gap ' + (nav.nav.top - nav.fab.bottom).toFixed(1) + ')');
    await page.close();
    ok('1: 3 equal symmetric tabs; 56px round "+" FAB docked bottom-right 16px above nav');
  }

  // 2. Bottom padding clears nav+FAB: the brief's case (Jorge's
  // "Cambio de posición" hidden behind the +) is gone at rest, and the
  // last card scrolls fully clear of the FAB at max scroll. (A transient
  // pass under an overlay FAB mid-scroll is inherent to the Material
  // docked pattern; the padding guarantees every card can be read clear.)
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
        const cs = getComputedStyle(view);
        const f = fab.getBoundingClientRect();
        const overlaps = (r) => r.width > 0 && r.height > 0 && !(f.right < r.left || f.left > r.right || f.bottom < r.top || f.top > r.bottom);
        const box = (sel) => {
          const el = view.querySelector(sel);
          return el ? overlaps(el.getBoundingClientRect()) : null;
        };
        view.scrollTop = 0; await new Promise((r) => setTimeout(r, 120));
        const topHero = box('.urgent-card, .hero-card');
        const topCards = [...view.querySelectorAll('.patient-card, .task-card')].slice(0, 2).map((el) => overlaps(el.getBoundingClientRect()));
        const jorge = (() => {
          const els = [...view.querySelectorAll('.view.is-active *, .patient-card *, .task-card *')].filter((el) => (el.textContent || '').includes('Cambio de posici'));
          const leaf = els.filter((el) => el.children.length === 0)[0] || els[0];
          return leaf ? overlaps(leaf.getBoundingClientRect()) : 'missing';
        })();
        view.scrollTop = view.scrollHeight; await new Promise((r) => setTimeout(r, 150));
        const lastCard = (() => {
          const cards = [...view.querySelectorAll('.patient-card, .task-card, .ai-card, .shift-list')];
          const el = cards[cards.length - 1];
          return el ? overlaps(el.getBoundingClientRect()) : 'none';
        })();
        return { pad: parseFloat(cs.paddingBottom) || 0, fabH: f.height, topHero, topCards, jorge, lastCard };
      });
      if (step === 'detail') {
        assert.strictEqual(hits.fabH, 0, 'detail: the FAB steps aside for the docked Registrar evento CTA');
      } else {
        assert.ok(hits.pad >= hits.fabH + 16, step + ': bottom padding (' + hits.pad + ') clears the FAB (' + hits.fabH.toFixed(0) + ')');
      }
      assert.ok(!hits.topHero, step + ' (top): hero under FAB');
      assert.ok(hits.topCards.every((h) => !h), step + ' (top): first cards under FAB: ' + JSON.stringify(hits.topCards));
      assert.ok(hits.jorge !== true, step + ': Jorge Cambio text under FAB');
      assert.ok(!hits.lastCard, step + ' (bottom): last card under FAB');
    }
    await page.close();
    ok('2: padding clears nav+FAB; hero/first cards/Jorge text clear at top, last card clear at bottom');
  }

  // 3. Patient-card confirm is a 48px round icon button; names never truncate.
  {
    for (const width of [360, 390, 430]) {
      for (const lang of ['es', 'en']) {
        const page = await freshPage(browser, { width });
        await setLang(page, lang);
        await page.locator('[data-nav="turno"]').click().catch(() => {});
        await page.waitForTimeout(400);
        const home = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('.view.is-active .patient-card [data-confirm]')].map((el) => {
            const r = el.getBoundingClientRect();
            return { w: r.width, h: r.height, label: el.getAttribute('aria-label') || '', text: (el.textContent || '').trim().slice(0, 20), radius: getComputedStyle(el).borderRadius };
          });
          const names = [...document.querySelectorAll('.view.is-active .patient-name')].map((el) => {
            const cs = getComputedStyle(el);
            return { text: (el.textContent || '').trim().slice(0, 20), overflow: el.scrollWidth > el.clientWidth + 1, ellipsis: cs.textOverflow === 'ellipsis', h: el.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight) || 0 };
          });
          return { btns, names };
        });
        assert.ok(home.btns.length >= 1, width + '/' + lang + ': patient confirm buttons present');
        for (const b of home.btns) {
          assert.ok(Math.abs(b.w - 48) <= 0.5 && Math.abs(b.h - 48) <= 0.5, width + '/' + lang + ': confirm is 48x48, got ' + b.w.toFixed(1) + 'x' + b.h.toFixed(1));
          assert.ok(parseFloat(b.radius) >= 23, width + '/' + lang + ': confirm is round, radius ' + b.radius);
          assert.ok(/Confirmar|Confirm/.test(b.text), width + '/' + lang + ': button names Confirmar, got ' + b.text);
          assert.ok(/ de | for /.test(b.label), width + '/' + lang + ': aria-label names task+patient, got ' + b.label);
        }
        for (const n of home.names) {
          assert.ok(!n.ellipsis, width + '/' + lang + ': name has no ellipsis: ' + n.text);
          assert.ok(!n.overflow, width + '/' + lang + ': name fits its box: ' + n.text);
          assert.ok(n.h <= n.lh + 2, width + '/' + lang + ': name stays on one line: ' + n.text);
        }
        await page.close();
      }
    }
    ok('3: 48x48 round confirm with task+patient label; names fit one line at 360/390/430 in ES+EN');
  }

  await browser.close();
  console.log('rubric-b-fix1: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + (error && error.stack || error));
  console.log('rubric-b-fix1: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
