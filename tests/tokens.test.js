'use strict';

// Professor's check: change --color-primary-500 at runtime and nothing of the
// old primary may remain, in BOTH themes. Dark theme must stay readable.
// Run: node tests/tokens.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

function lum(rgb) {
  const c = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => p - q);
  return (y + 0.05) / (x + 0.05);
}

// Walks nurse home, pendientes, registration sheet and the other two roles,
// returning every computed color/background/border/fill/stroke in use.
async function collectColors(page) {
  return page.evaluate(() => {
    const props = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'outlineColor', 'fill', 'stroke'];
    const seen = new Set();
    for (const el of document.querySelectorAll('.phone, .phone *')) {
      const cs = getComputedStyle(el);
      for (const p of props) seen.add(cs[p]);
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content && ps.content !== 'none') { seen.add(ps.backgroundColor); seen.add(ps.color); }
      }
    }
    return [...seen];
  });
}

async function skipSplash(page) {
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
}

async function walk(page) {
  const all = new Set();
  const add = async () => (await collectColors(page)).forEach((c) => all.add(c));
  await add();
  await page.locator('[data-nav="pendientes"]').click(); await page.waitForTimeout(500); await add();
  await page.locator('[data-nav="registrar"]').click(); await page.waitForTimeout(500); await add();
  await page.keyboard.press('Escape'); await page.locator('[data-sheet-close]').first().click().catch(() => {}); await page.waitForTimeout(500);
  await page.locator('.role-tab[data-role="paciente"]').click(); await page.waitForTimeout(500); await add();
  await page.locator('.role-tab[data-role="familia"]').click(); await page.waitForTimeout(500); await add();
  await page.locator('.role-tab[data-role="enfermero"]').click(); await page.waitForTimeout(500);
  return [...all];
}

(async () => {
  const browser = await chromium.launch();
  try {
    // Static: raw colors only in tokens.css; primary is a palette token.
    const tokens = fs.readFileSync(path.join(ROOT, 'css/tokens.css'), 'utf8');
    assert(/--color-primary-500:\s*#[0-9a-f]{6}/i.test(tokens), 'tokens.css defines --color-primary-500');
    for (const f of fs.readdirSync(path.join(ROOT, 'css')).filter((n) => n.endsWith('.css') && n !== 'tokens.css')) {
      const css = fs.readFileSync(path.join(ROOT, 'css', f), 'utf8');
      assert(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/.test(css), 'raw color literal in css/' + f);
    }
    assert(/\[data-theme="dark"\]/.test(tokens) && /prefers-color-scheme:\s*dark/.test(tokens), 'tokens.css has a dark theme for data-theme and prefers-color-scheme');
    ok('raw colors only in tokens.css; dark theme declared');

    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: theme });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(INDEX);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await skipSplash(page);

      const before = await walk(page);
      // Primary is blue; a color counts as primary-derived if it reads blue.
      const chan = (c) => {
        const n = (c.match(/[\d.]+/g) || []).map(Number);
        const rgb = c.startsWith('color(') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
        const a = n.length > 3 ? n[3] : 1;
        return { rgb, a };
      };
      const bluish = (c) => { const { rgb, a } = chan(c); return a > 0.05 && rgb.length === 3 && rgb[2] - rgb[0] > 12 && rgb[2] > rgb[1]; };
      const blueBefore = before.filter(bluish);
      console.log('  blue in use:', blueBefore.join(' | '));
      assert(blueBefore.length >= 2, theme + ': primary-derived colors are in use before the change (' + blueBefore.length + ')');

      await page.evaluate(() => document.documentElement.style.setProperty('--color-primary-500', '#ff0000'));
      await page.waitForTimeout(1500);
      const after = await walk(page);
      const left = blueBefore.filter((c) => after.includes(c));
      assert.deepStrictEqual(left, [], theme + ': blue colors still rendered after changing --color-primary-500');
      assert(after.includes('rgb(255, 0, 0)') || after.some((c) => { const { rgb } = chan(c); return rgb[0] - rgb[2] > 80 && rgb[0] - rgb[1] > 80; }), theme + ': new primary is rendered');
      ok(theme + ': changing --color-primary-500 leaves nothing of the old primary');

      // Readability: main text on canvas and on cards.
      await page.evaluate(() => document.documentElement.style.removeProperty('--color-primary-500'));
      await page.waitForTimeout(1500); // let the animated --accent settle
      const pairs = await page.evaluate(() => {
        // Parses rgb()/rgba() and color(srgb r g b / a) (what color-mix computes to).
        const parse = (s) => {
          const n = (s.match(/[\d.]+/g) || []).map(Number);
          if (s.startsWith('color(')) return { c: n.slice(0, 3).map((v) => v * 255), a: n.length > 3 ? n[3] : 1 };
          return { c: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
        };
        const rgb = (s) => parse(s).c;
        const bgOf = (el) => {
          for (let n = el; n; n = n.parentElement) {
            const b = getComputedStyle(n).backgroundColor;
            if (b && b !== 'transparent' && parse(b).a > 0.5) return rgb(b);
          }
          return [255, 255, 255];
        };
        const sels = ['.view.is-active .view-title', '.view.is-active .view-copy', '.patient-card', '.section-label', '.nav-item.is-active', '.role-tab.is-active', '.primary-button, .quick-confirm'];
        return sels.map((s) => {
          const el = document.querySelector(s);
          if (!el) return null;
          return { s, fg: rgb(getComputedStyle(el).color), bg: bgOf(el) };
        }).filter(Boolean);
      });
      assert(pairs.length >= 5, theme + ': found the elements to check');
      for (const p of pairs) {
        const r = ratio(p.fg, p.bg);
        assert(r >= 4.5, theme + ': ' + p.s + ' contrast ' + r.toFixed(2) + ' < 4.5');
      }
      const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const canvasRgb = (canvas.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((v) => (canvas.startsWith('color(') ? v * 255 : v));
      const dark = lum(canvasRgb) < 0.1;
      assert.strictEqual(dark, theme === 'dark', theme + ': page background matches theme, got ' + canvas);
      ok(theme + ': text contrast >= 4.5:1 and background matches the theme');
      assert.deepStrictEqual(errors, []);
      await page.close();
    }

    // Toggle: a visible control flips data-theme and remembers it.
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    await page.goto(INDEX);
    await skipSplash(page);
    const toggle = page.locator('[data-theme-toggle]');
    assert(await toggle.isVisible(), 'theme toggle is visible');
    const box = await toggle.boundingBox();
    assert(box.width >= 44 && box.height >= 44, 'theme toggle hit target >= 44px');
    await toggle.click();
    await page.waitForTimeout(600);
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
    await page.reload();
    await skipSplash(page);
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark', 'theme choice persists');
    ok('theme toggle flips and persists');

    console.log('tokens: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('tokens: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
