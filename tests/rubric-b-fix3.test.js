'use strict';

// Phase B fix round 3: the selected patient avatar, the transparent FAB dock,
// the compact AI source badge + full-width answer/fallback, the build key
// decision, and Settings spacing + nav parity. Run: node tests/rubric-b-fix3.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { viewAs, openSettings } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function freshPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: opts.width || 360, height: opts.height || 800 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('acompana-guide-seen', '{"all":true}');
    ['confirm', 'handover', 'register', 'ask', 'visit'].forEach(function (k) { localStorage.setItem('acompana-coach-' + k, 'yes'); });
    localStorage.setItem('acompana-lang', 'es');
    localStorage.setItem('acompana-ai-consent', 'yes');
    localStorage.removeItem('acompana-theme');
  });
  const page = await ctx.newPage();
  await page.goto(INDEX);
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => {
    const view = document.querySelector('.view.is-active');
    return view && Number(getComputedStyle(view).opacity) === 1;
  }).catch(() => {});
  await page.waitForTimeout(150);
  return page;
}

function parseColor(value) {
  const match = String(value).match(/rgba?\(([^)]+)\)/);
  if (!match) return { rgb: String(value), alpha: value === 'transparent' ? 0 : 1 };
  const parts = match[1].split(',').map((n) => parseFloat(n));
  return { rgb: parts.slice(0, 3).join(','), alpha: parts.length > 3 ? parts[3] : 1 };
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1. Selected/unselected patient chip: a fixed 28px circle, initials on one
    // line and readable in both states.
    {
      const page = await freshPage(browser);
      await page.locator('[data-fab-register]').click();
      await page.waitForTimeout(600);
      const chips = await page.evaluate(() => {
        return [...document.querySelectorAll('.registration-sheet .event-patient-btn')].map((btn) => {
          const dot = btn.querySelector('.patient-dot');
          const r = dot.getBoundingClientRect();
          const cs = getComputedStyle(dot);
          return {
            selected: btn.getAttribute('aria-pressed') === 'true',
            initials: (dot.textContent || '').trim(),
            w: r.width,
            h: r.height,
            scrollWidth: dot.scrollWidth,
            clientWidth: dot.clientWidth,
            color: cs.color,
            background: cs.backgroundColor,
            whiteSpace: cs.whiteSpace,
            radius: cs.borderRadius,
            lines: (function () {
              const range = document.createRange();
              range.selectNodeContents(dot);
              return range.getClientRects().length;
            })()
          };
        });
      });
      assert.ok(chips.length >= 2, 'the registrar sheet shows patient chips, got ' + chips.length);
      assert.ok(chips.some((c) => c.selected), 'one chip is selected');
      for (const chip of chips) {
        const state = chip.selected ? 'selected' : 'unselected';
        assert.ok(chip.initials.length >= 1, state + ': chip has initials');
        assert.ok(Math.abs(chip.w - 28) <= 0.5 && Math.abs(chip.h - 28) <= 0.5, state + ': dot is 28x28, got ' + chip.w + 'x' + chip.h);
        assert.ok(Math.abs(chip.w - chip.h) <= 0.5, state + ': dot height == width');
        assert.strictEqual(chip.whiteSpace, 'nowrap', state + ': initials never wrap');
        assert.ok(chip.scrollWidth <= chip.clientWidth + 1, state + ': initials fit in one line (' + chip.scrollWidth + '<=' + chip.clientWidth + ')');
        assert.ok(chip.lines <= 1, state + ': initials stay on one line, got ' + chip.lines + ' line(s)');
        const fg = parseColor(chip.color);
        const bg = parseColor(chip.background);
        const bgIsWhiteish = bg.rgb.split(',').every((n) => Number(n) >= 245);
        if (chip.selected) {
          assert.ok(bgIsWhiteish || bg.alpha < 1, state + ': selected dot is a white/translucent circle, got ' + chip.background);
        }
        assert.ok(fg.rgb !== bg.rgb && !(fg.rgb === '255,255,255' && bg.rgb === '255,255,255'), state + ': text color differs from background (' + chip.color + ' on ' + chip.background + ')');
      }
      await page.close();
      ok('1: patient avatar is a fixed 28px circle with one-line initials, readable in both states');
    }

    // 2. The FAB strip is transparent: at rest nothing opaque sits between the
    // list and the nav; at max scroll the last card clears the FAB + nav.
    {
      const page = await freshPage(browser);
      const band = await page.evaluate(() => {
        const nav = document.querySelector('#bottomNav').getBoundingClientRect();
        const dock = document.querySelector('[data-fab-dock]');
        const fab = document.querySelector('[data-fab-register]');
        const fabBox = fab.getBoundingClientRect();
        const dockBox = dock.getBoundingClientRect();
        const view = document.querySelector('.view.is-active');
        const viewBox = view.getBoundingClientRect();
        const before = document.querySelectorAll('.view.is-active .patient-list .patient-card');
        const second = before[1] ? before[1].getBoundingClientRect() : null;
        const opaque = [];
        for (const el of document.querySelectorAll('.phone *')) {
          if (el === fab || fab.contains(el)) continue;
          if (el.closest('#screen, .bottom-nav')) continue;
          if (el === document.querySelector('#screen') || el === view) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.bottom <= nav.top - 78 || r.top >= nav.top) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
          const bg = cs.backgroundColor;
          const m = String(bg).match(/rgba?\(([^)]+)\)/);
          const parts = m ? m[1].split(',').map(Number) : [];
          const alpha = parts.length > 3 ? parts[3] : (bg === 'transparent' ? 0 : 1);
          if (alpha > 0.05 && el !== dock) opaque.push((el.className || el.tagName).toString().split(' ')[0]);
        }
        return {
          dockBg: getComputedStyle(dock).backgroundColor,
          dockPointer: getComputedStyle(dock).pointerEvents,
          dockBottom: dockBox.bottom,
          navTop: nav.top,
          fabTop: fabBox.top,
          fabBottom: fabBox.bottom,
          viewBottom: viewBox.bottom,
          secondBottom: second ? second.bottom : null,
          secondTop: second ? second.top : null,
          opaque
        };
      });
      const dockBg = parseColor(band.dockBg);
      assert.ok(dockBg.alpha === 0, 'the FAB dock has a transparent background, got ' + band.dockBg);
      assert.strictEqual(band.dockPointer, 'none', 'the FAB dock only lets the FAB take pointer events');
      assert.ok(Math.abs(band.fabBottom - (band.navTop - 16)) <= 1, 'FAB still 16px above the nav');
      assert.deepStrictEqual(band.opaque, [], 'nothing opaque in the FAB band between the list and the nav: ' + band.opaque.join(','));
      assert.ok(Math.abs(band.viewBottom - band.navTop) <= 1, 'the scroll view reaches the nav (no 80px band reserved): view ' + band.viewBottom + ' vs nav ' + band.navTop);
      assert.ok(band.secondBottom === null || band.secondTop < band.viewBottom, 'the patient list continues under the transparent FAB strip');

      const end = await page.evaluate(() => {
        const view = document.querySelector('.view.is-active');
        view.scrollTop = view.scrollHeight;
        const last = view.lastElementChild.getBoundingClientRect();
        const fab = document.querySelector('[data-fab-register]').getBoundingClientRect();
        const nav = document.querySelector('#bottomNav').getBoundingClientRect();
        return { lastBottom: last.bottom, fabTop: fab.top, navTop: nav.top };
      });
      assert.ok(end.lastBottom <= end.fabTop + 1, 'at max scroll the last card is fully above the FAB (card ' + end.lastBottom + ' <= fab ' + end.fabTop + ')');
      assert.ok(end.lastBottom <= end.navTop + 1, 'at max scroll the last card is fully above the nav');
      await page.close();
      ok('2: transparent FAB strip, content scrolls to the nav, last card clears FAB + nav');
    }

    // 3. AI source: one compact pill (24px mark + inline label); answer and
    // fallback note are full-width lines below it.
    {
      const page = await freshPage(browser);
      await page.locator('[data-handover-open]').click();
      await page.waitForTimeout(600);
      const badge = await page.evaluate(() => {
        const el = document.querySelector('.ai-sheet [data-handover-badge]');
        const r = el.getBoundingClientRect();
        const mark = el.querySelector('.ai-mark').getBoundingClientRect();
        const label = el.querySelector('.ai-source-text');
        const cs = getComputedStyle(el);
        return {
          h: r.height,
          w: r.width,
          markW: mark.width,
          markH: mark.height,
          text: (el.textContent || '').trim(),
          labelDisplay: label ? getComputedStyle(label).display : 'missing',
          radius: parseFloat(cs.borderRadius) || 0
        };
      });
      assert.ok(badge.h <= 32, 'handover badge is <=32px tall, got ' + badge.h);
      assert.ok(Math.abs(badge.markW - 24) <= 0.5 && Math.abs(badge.markH - 24) <= 0.5, 'badge mark is a 24px Bloub disc, got ' + badge.markW + 'x' + badge.markH);
      assert.ok(/Plantilla|IA/.test(badge.text), 'badge label is inline and visible, got "' + badge.text + '"');
      assert.ok(badge.labelDisplay !== 'missing', 'badge has an inline label node');
      assert.ok(badge.w < badge.h * 6, 'badge is a compact pill, not a big circle (' + badge.w + 'x' + badge.h + ')');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await viewAs(page, 'familia');
      await page.waitForTimeout(500);
      const initialBadge = await page.evaluate(() => {
        const el = document.querySelector('.view.is-active [data-ask-badge]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { h: r.height, w: r.width, text: (el.textContent || '').trim() };
      });
      assert.ok(initialBadge && initialBadge.h <= 32, 'ask card badge is <=32px tall, got ' + (initialBadge && initialBadge.h));
      assert.ok(initialBadge && /Plantilla|IA/.test(initialBadge.text), 'ask card badge shows an inline label, got "' + (initialBadge && initialBadge.text) + '"');

      await page.locator('.view.is-active [data-ask-input]').fill('¿Cómo pasó la noche?');
      await page.locator('.view.is-active [data-ask-send]').click();
      await page.waitForTimeout(1500);
      const answer = await page.evaluate(() => {
        const card = document.querySelector('.view.is-active .ask-card');
        const box = card.querySelector('[data-ask-answer]');
        const text = box.querySelector('.ask-text');
        const note = box.querySelector('.ai-fallback-note');
        const cs = getComputedStyle(card);
        const content = card.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
        const badge = box.querySelector('.ai-source');
        return {
          content,
          textW: text ? text.getBoundingClientRect().width : 0,
          noteW: note ? note.getBoundingClientRect().width : 0,
          noteText: note ? (note.textContent || '').trim() : '',
          badgeH: badge ? badge.getBoundingClientRect().height : 0,
          badgeTop: badge ? badge.getBoundingClientRect().top : 0,
          body: (box.textContent || '').trim()
        };
      });
      assert.ok(answer.textW >= answer.content * 0.8, 'answer text is full width: ' + Math.round(answer.textW) + ' of ' + Math.round(answer.content));
      assert.ok(answer.noteW >= answer.content * 0.8, 'fallback note is a full-width line: ' + Math.round(answer.noteW) + ' of ' + Math.round(answer.content));
      assert.ok(/No pudimos usar la IA; esto lo escribieron las reglas\./.test(answer.noteText), 'fallback note keeps its copy, got "' + answer.noteText + '"');
      assert.ok(answer.badgeH <= 32, 'answer badge is <=32px tall, got ' + answer.badgeH);
      assert.ok(answer.body.length > 0, 'the answer rendered');
      await page.close();
      ok('3: compact AI pill + full-width answer and fallback note on handover and ask');
    }

    // 4. Build key decision: env wins, SSM fallback, loud warning, no key print.
    {
      const { resolveAppKey } = require('../tools/build-www.js');
      const calls = [];
      const fakeRun = (args) => { calls.push(args.join(' ')); return 'from-ssm\n'; };
      const warnings = [];
      const warn = (message) => warnings.push(message);

      assert.strictEqual(resolveAppKey({ apiBase: '', envKey: '', run: fakeRun, warn }), '', 'no server build has no key');
      assert.deepStrictEqual(calls, [], 'SSM is not called when the build has no server');

      assert.strictEqual(resolveAppKey({ apiBase: 'https://x.example', envKey: 'env-key', run: fakeRun, warn }), 'env-key', 'env key wins');
      assert.deepStrictEqual(calls, [], 'SSM is not called when the env key exists');

      assert.strictEqual(resolveAppKey({ apiBase: 'https://x.example', envKey: '', run: fakeRun, warn }), 'from-ssm', 'falls back to the SSM parameter');
      assert.ok(calls.length === 1 && /ssm get-parameter/.test(calls[0]) && /--with-decryption/.test(calls[0]) && /\/acompana\/app-key/.test(calls[0]), 'SSM command reads /acompana/app-key with decryption, got ' + calls[0]);
      assert.deepStrictEqual(warnings, [], 'no warning when SSM answers');

      const failingRun = () => { throw new Error('aws: no credentials'); };
      assert.strictEqual(resolveAppKey({ apiBase: 'https://x.example', envKey: '', run: failingRun, warn }), '', 'both missing returns an empty key');
      assert.ok(warnings.length === 1 && /WARNING: building with a server but NO app key/.test(warnings[0]), 'both missing warns loudly, got ' + JSON.stringify(warnings));

      const source = require('fs').readFileSync(path.join(ROOT, 'tools', 'build-www.js'), 'utf8');
      assert.ok(!/console\.log\([^)]*(appKey|secret)/i.test(source) && !/console\.log\([^)]*' \+ appKey/.test(source), 'the build never prints the key');
      ok('4: env key wins, SSM fallback, loud warning, key never printed');
    }

    // 5. Settings: >=16px between stacked controls, the same 3 nav tabs as
    // nurse home in light and dark, and no left seam on the pushed screen.
    {
      const page = await freshPage(browser);
      const homeTabs = await page.locator('#bottomNav [data-nav]').count();
      assert.strictEqual(homeTabs, 3, 'nurse home has 3 nav tabs, got ' + homeTabs);
      await openSettings(page);
      const settings = await page.evaluate(() => {
        const view = document.querySelector('.view.is-active');
        const blocks = [...view.querySelectorAll('.settings-block')].map((block) => {
          const kids = [...block.children].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.width > 0;
          });
          const gaps = [];
          for (let i = 1; i < kids.length; i += 1) {
            gaps.push(kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom);
          }
          return { id: block.getAttribute('aria-labelledby'), gaps };
        });
        const demo = view.querySelector('.settings-block[aria-labelledby="set-demo"]');
        const segment = demo.querySelector('.segmented').getBoundingClientRect();
        const simulate = demo.querySelector('[data-simulate-error]').getBoundingClientRect();
        const nav = document.querySelector('#bottomNav');
        return {
          blocks,
          demoGap: simulate.top - segment.bottom,
          tabs: [...nav.querySelectorAll('[data-nav]')].filter((el) => el.offsetParent !== null).map((el) => (el.textContent || '').trim()),
          borderLeft: parseFloat(getComputedStyle(view).borderLeftWidth) || 0,
          viewKey: view.getAttribute('data-view-key')
        };
      });
      assert.ok(/^settings-/.test(settings.viewKey), 'Settings is open, got ' + settings.viewKey);
      assert.ok(settings.demoGap >= 16, 'Modo demostración: segmented control and button keep >=16px, got ' + settings.demoGap.toFixed(1));
      for (const block of settings.blocks) {
        for (const gap of block.gaps) {
          assert.ok(gap >= 15.5, block.id + ': stacked controls keep >=16px, got ' + gap.toFixed(1));
        }
      }
      assert.deepStrictEqual(settings.tabs, ['Turno', 'Pendientes', 'Chat'], 'Settings shows the same 3 nurse tabs, got ' + JSON.stringify(settings.tabs));
      assert.strictEqual(settings.borderLeft, 0, 'no stray left border on Settings');

      await page.locator('.view.is-active [data-set-theme="dark"]').click();
      await page.waitForTimeout(500);
      const dark = await page.evaluate(() => {
        const view = document.querySelector('.view.is-active');
        const nav = document.querySelector('#bottomNav');
        return {
          theme: document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '',
          tabs: [...nav.querySelectorAll('[data-nav]')].filter((el) => el.offsetParent !== null).map((el) => (el.textContent || '').trim()),
          borderLeft: parseFloat(getComputedStyle(view).borderLeftWidth) || 0
        };
      });
      assert.strictEqual(dark.theme, 'dark', 'dark theme applied, got ' + dark.theme);
      assert.deepStrictEqual(dark.tabs, ['Turno', 'Pendientes', 'Chat'], 'dark Settings also shows 3 nav tabs, got ' + JSON.stringify(dark.tabs));
      assert.strictEqual(dark.borderLeft, 0, 'no stray left border on dark Settings');
      await page.close();
      ok('5: >=16px settings spacing, 3 nav tabs and no left border in light + dark');
    }
  } finally {
    await browser.close();
  }
  console.log('rubric-b-fix3: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + (error && error.stack || error));
  console.log('rubric-b-fix3: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
