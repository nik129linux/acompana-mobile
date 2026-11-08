'use strict';

// Phase B fix round 2: the reveal toggle must clear the detail CTA, patient
// names must never truncate/ellipsize, and the 56px round Registrar FAB must
// never overlap content at any scroll position.
// Run: node tests/rubric-b-fix2.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { openSettings, setLang } = require('./helpers');

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
  const page = await ctx.newPage();
  await page.goto(INDEX);
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
  return page;
}

// Visible leaf text and interactive nodes inside the active view.
function overlapReport() {
  const fab = document.querySelector('[data-fab-register]');
  const view = document.querySelector('.view.is-active');
  if (!fab || !view || fab.hidden || getComputedStyle(fab).display === 'none') return { hidden: true, hits: [] };
  const f = fab.getBoundingClientRect();
  if (!f.width || !f.height) return { hidden: true, hits: [] };
  const overlaps = (r) => r.width > 0 && r.height > 0 && !(f.right <= r.left || f.left >= r.right || f.bottom <= r.top || f.top >= r.bottom);
  const clip = view.getBoundingClientRect();
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    // Only what is actually visible: the scroll container clips the rest.
    return r.width > 1 && r.height > 1 && r.bottom > clip.top + 1 && r.top < clip.bottom - 1 && r.right > clip.left + 1 && r.left < clip.right - 1;
  };
  const nodes = [...view.querySelectorAll('button, a, input, textarea, select, p, h1, h2, h3, .patient-name, .task-title, .list-title, span')]
    .filter((el) => !el.closest('[hidden]') && (el.tagName !== 'SPAN' || el.children.length === 0 || el.classList.contains('patient-name') || el.classList.contains('list-title')))
    .filter(visible);
  const hits = nodes.filter((el) => overlaps(el.getBoundingClientRect())).map((el) => (el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0] + ' "' + (el.textContent || '').trim().slice(0, 28) + '"'));
  return { hidden: false, hits: [...new Set(hits)] };
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1. The clinical reveal toggle never sits under the docked detail CTA.
    {
      const page = await freshPage(browser);
      await page.locator('[data-patient="cr"]').first().click();
      await page.waitForTimeout(700);
      const gap = await page.evaluate(() => {
        const toggle = document.querySelector('.view.is-active .reveal-button').getBoundingClientRect();
        const cta = document.querySelector('.view.is-active .detail-cta').getBoundingClientRect();
        return cta.top - toggle.bottom;
      });
      assert.ok(gap >= 0, 'reveal toggle clear of the CTA, gap ' + gap.toFixed(1) + 'px');
      await page.close();
      ok('1: reveal toggle clear of the detail CTA');
    }

    // 2. Names never truncate/ellipsize; patient confirm is a 48x48 round icon
    // button that turns into a filled check + "Hecho" under the meta.
    {
      for (const width of [360, 390, 430]) {
        for (const lang of ['es', 'en']) {
          const page = await freshPage(browser, { width });
          if (lang === 'en') await setLang(page, 'en');
          await page.locator('[data-nav="turno"]').click().catch(() => {});
          await page.waitForTimeout(400);
          const home = await page.evaluate(() => {
            const names = [...document.querySelectorAll('.view.is-active .patient-name')].map((el) => {
              const cs = getComputedStyle(el);
              return { text: (el.textContent || '').trim(), ellipsis: cs.textOverflow === 'ellipsis', overflow: el.scrollWidth > el.clientWidth + 1, h: el.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight) || 0 };
            });
            const btn = document.querySelector('.view.is-active .patient-card [data-confirm]');
            const r = btn.getBoundingClientRect();
            const cs = getComputedStyle(btn);
            return { names, btn: { w: r.width, h: r.height, radius: cs.borderRadius, label: btn.getAttribute('aria-label') || '' } };
          });
          assert.ok(home.names.length >= 1, width + '/' + lang + ': patient names rendered');
          for (const n of home.names) {
            assert.ok(!n.ellipsis, width + '/' + lang + ': no ellipsis on "' + n.text + '"');
            assert.ok(!n.overflow, width + '/' + lang + ': no overflow on "' + n.text + '"');
            assert.ok(n.h <= n.lh + 2, width + '/' + lang + ': one line for "' + n.text + '"');
          }
          assert.ok(Math.abs(home.btn.w - 48) <= 0.5 && Math.abs(home.btn.h - 48) <= 0.5, width + '/' + lang + ': confirm 48x48, got ' + home.btn.w.toFixed(1) + 'x' + home.btn.h.toFixed(1));
          assert.ok(parseFloat(home.btn.radius) >= 23, width + '/' + lang + ': confirm is round, radius ' + home.btn.radius);
          assert.ok(/Confirmar|Confirm/.test(home.btn.label) && / de | for /.test(home.btn.label), width + '/' + lang + ': confirm names task + patient, got ' + home.btn.label);
          await page.close();
        }
      }

      const page = await freshPage(browser);
      const btn = page.locator('.view.is-active .patient-card [data-confirm]').first();
      await btn.click();
      await page.waitForTimeout(120);
      const done = await page.evaluate(() => {
        const card = document.querySelector('.view.is-active .patient-card.is-confirming');
        if (!card) return null;
        const pill = card.querySelector('.patient-done');
        const button = card.querySelector('.quick-confirm');
        const cs = getComputedStyle(button);
        return { text: (pill && (pill.textContent || '')).trim(), pillVisible: !!(pill && getComputedStyle(pill).display !== 'none'), fill: cs.backgroundImage + ' ' + cs.backgroundColor };
      });
      assert.ok(done && done.pillVisible, 'confirming card shows "Hecho" under the meta: ' + JSON.stringify(done));
      assert.ok(/Hecho|Done/.test(done.text), 'confirmed state reads Hecho/Done, got ' + (done && done.text));
      assert.ok(/gradient|rgb\(/i.test(done.fill) && !/rgb\(255,\s*255,\s*255\)/.test(done.fill), 'check turns filled/primary, got ' + (done && done.fill));
      await page.close();
      ok('2: names never truncate; 48px round confirm + filled check with "Hecho"');
    }

    // 3. FAB: 56px round "+", 16px above the nav, list padding nav+56+24, and
    // zero intersections at six scroll positions on home, Pendientes, detail.
    {
      const page = await freshPage(browser);
      const fabBox = await page.evaluate(() => {
        const fab = document.querySelector('[data-fab-register]');
        const nav = document.querySelector('#bottomNav').getBoundingClientRect();
        const phone = document.querySelector('.phone').getBoundingClientRect();
        const f = fab.getBoundingClientRect();
        return { w: f.width, h: f.height, right: f.right, bottom: f.bottom, navTop: nav.top, navH: nav.height, phoneRight: phone.right, label: fab.getAttribute('aria-label') || '', radius: getComputedStyle(fab).borderRadius };
      });
      assert.ok(Math.abs(fabBox.w - 56) <= 0.5 && Math.abs(fabBox.h - 56) <= 0.5, 'FAB is 56x56, got ' + fabBox.w + 'x' + fabBox.h);
      assert.ok(parseFloat(fabBox.radius) >= 27, 'FAB is round, radius ' + fabBox.radius);
      assert.ok(Math.abs(fabBox.phoneRight - fabBox.right - 16) <= 1, 'FAB is 16px from the right edge');
      assert.ok(Math.abs(fabBox.navTop - fabBox.bottom - 16) <= 1, 'FAB is 16px above the nav');
      assert.ok(/^Registrar evento$|^Log event$/.test(fabBox.label), 'FAB aria-label names the action, got ' + fabBox.label);

      for (const screen of ['home', 'pendientes', 'detail']) {
        if (screen === 'pendientes') {
          await page.locator('[data-nav="pendientes"]').click();
          await page.waitForTimeout(500);
        }
        if (screen === 'detail') {
          await page.locator('[data-nav="turno"]').click().catch(() => {});
          await page.waitForTimeout(400);
          await page.locator('.view.is-active [data-patient]').first().click();
          await page.waitForTimeout(600);
        }
        const pad = await page.evaluate(() => {
          const view = document.querySelector('.view.is-active');
          const nav = document.querySelector('#bottomNav').getBoundingClientRect();
          return { pad: parseFloat(getComputedStyle(view).paddingBottom) || 0, navH: nav.height };
        });
        if (screen !== 'detail') {
          assert.ok(Math.abs(pad.pad - (pad.navH + 56 + 24)) <= 1, screen + ': list padding = nav + 56 + 24, got ' + pad.pad + ' (nav ' + pad.navH + ')');
        }
        const positions = await page.evaluate(() => {
          const view = document.querySelector('.view.is-active');
          return [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.round((view.scrollHeight - view.clientHeight) * f));
        });
        for (const top of positions) {
          await page.evaluate((y) => { document.querySelector('.view.is-active').scrollTop = y; }, top);
          await page.waitForTimeout(120);
          const report = await page.evaluate(overlapReport);
          assert.deepStrictEqual(report.hits, [], screen + ' @scrollTop ' + top + ': FAB hits ' + JSON.stringify(report.hits));
        }
        await page.evaluate(() => { const v = document.querySelector('.view.is-active'); if (v) v.scrollTop = 0; });
      }
      await page.close();
      ok('3: 56px round FAB, 16px above nav, list padding, zero overlaps at six scroll positions');
    }
  } finally {
    await browser.close();
  }
  console.log('rubric-b-fix2: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + (error && error.stack || error));
  console.log('rubric-b-fix2: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
