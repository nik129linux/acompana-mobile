'use strict';

// Nico's review of the patient/family screens (2026-10-30): mascot on a white
// disc (not darkened by the gradient), timeline badges instead of flat dots,
// white icons on filled circles, pro contact option icons.
// Run: node tests/readers-polish.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { viewAs } = require('./helpers');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

function lum(c) {
  const n = (c.match(/[\d.]+/g) || []).map(Number);
  const rgb = c.startsWith('color(') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3);
  const f = rgb.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(INDEX);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('acompana-theme', 'light'); });
    await page.reload();
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(500);

    await viewAs(page, 'paciente');
    await page.waitForTimeout(800);
    const view = page.locator('.view.is-active');
    const disc = view.locator('.next-card .mascot-disc');
    assert.strictEqual(await disc.count(), 1, 'the mascot in "Lo que sigue" sits in a .mascot-disc');
    assert(await disc.locator('[data-mascot]').count() >= 1, 'the mascot is inside the disc');
    assert(lum(await disc.evaluate((n) => getComputedStyle(n).backgroundColor)) > 0.85, 'the disc is white, so the mascot is not darkened');
    ok('patient: mascot on a white disc');

    const items = view.locator('.timeline-item');
    assert(await items.count() >= 2, 'timeline has items');
    for (const item of await items.all()) {
      const badge = item.locator('.timeline-badge');
      assert.strictEqual(await badge.count(), 1, 'every timeline item has a .timeline-badge');
      assert.strictEqual(await badge.locator('svg').count(), 1, 'badges carry an icon');
      const c = await badge.evaluate((n) => getComputedStyle(n).color);
      assert(lum(c) > 0.85, 'badge icons are white');
    }
    const flat = await view.locator('.timeline-item').first().evaluate((n) => getComputedStyle(n, '::before').content);
    assert(flat === 'none' || flat === 'normal', 'the old flat ::before dot is gone');
    ok('patient: timeline badges with white icons replace flat dots');

    await viewAs(page, 'familia');
    await page.waitForTimeout(800);
    const fam = page.locator('.view.is-active');
    const visit = fam.locator('.visit-icon').first();
    assert(lum(await visit.evaluate((n) => getComputedStyle(n).color)) > 0.85, 'visit hours icon is white');
    const visitBg = await visit.evaluate((n) => { const s = getComputedStyle(n); return s.backgroundImage !== 'none' ? 'gradient' : s.backgroundColor; });
    assert(visitBg === 'gradient' || lum(visitBg) < 0.5, 'visit icon sits on a filled, saturated circle');
    for (const badge of await fam.locator('.timeline-badge').all()) {
      assert(lum(await badge.evaluate((n) => getComputedStyle(n).color)) > 0.85, 'family timeline icons are white');
    }
    ok('family: visit icon and timeline circles are white on color');

    await page.locator('[data-nav="contacto"]').click();
    await page.waitForTimeout(700);
    const options = page.locator('.view.is-active .contact-option');
    assert.strictEqual(await options.count(), 3);
    for (const opt of await options.all()) {
      const icon = opt.locator('.contact-icon');
      assert.strictEqual(await icon.count(), 1, 'each option has a .contact-icon');
      if (await icon.evaluate((n) => n.classList.contains('is-visit'))) {
        // Visita: white disc with a blue icon (Nico 2026-10-30: no orange in Contacto).
        assert(lum(await icon.evaluate((n) => getComputedStyle(n).backgroundColor)) > 0.85, 'Visita sits on a white disc');
        assert(lum(await icon.evaluate((n) => getComputedStyle(n).color)) < 0.4, 'Visita icon is blue on white');
      } else {
        assert(lum(await icon.evaluate((n) => getComputedStyle(n).color)) > 0.85, 'contact icons are white');
        assert(/gradient/.test(await icon.evaluate((n) => getComputedStyle(n).backgroundImage)), 'contact icons sit on a gradient disc');
      }
      const b = await icon.boundingBox();
      assert(b.width >= 48 && b.height >= 48, 'contact icon discs are at least 48px');
    }
    ok('family: Llamar / Mensaje / Visita have pro icon discs');
    assert.deepStrictEqual(errors, []);
    console.log('readers-polish: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('readers-polish: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
