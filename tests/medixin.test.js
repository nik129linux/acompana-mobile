'use strict';

// Structure of every screen in the Medixin language (DESIGN.md §4). Visual
// quality is reviewed by eye; this checks the anatomy is really there.
// Run all: node tests/medixin.test.js · one area: MEDIXIN_ONLY=nurse|sheets|readers

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { viewAs, openRegister } = require('./helpers');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const ONLY = process.env.MEDIXIN_ONLY || '';
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }
function want(area) { return !ONLY || ONLY === area; }

async function fresh(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(INDEX);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
  return page;
}

const box = async (loc) => loc.boundingBox();

async function nurse(browser) {
  const page = await fresh(browser);
  await page.locator('[data-nav="pendientes"]').click();
  await page.waitForTimeout(600);
  const view = page.locator('.view.is-active');
  assert.strictEqual(await view.locator('.segmented .segment').count(), 2, 'Pendientes has a 2-way segmented control');
  assert(/Pendientes/.test(await view.locator('.segmented').textContent()) && /Hechas/.test(await view.locator('.segmented').textContent()), 'segments are Pendientes / Hechas');
  assert(await view.locator('.list-card').count() >= 3, 'tasks are list cards');
  for (const b of await view.locator('.tap-confirm').all()) {
    const r = await box(b);
    assert(r.width >= 56 && r.height >= 56, 'confirm targets stay >= 56px');
  }
  await view.locator('.segmented .segment').nth(1).click();
  await page.waitForTimeout(400);
  assert(/Hechas|Todavía|Aún/.test(await view.textContent()), 'Hechas tab shows done items or an empty message');
  ok('nurse: Pendientes is Medixin "Appointment" (segmented + list cards)');

  await page.locator('[data-nav="turno"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-patient="mg"]').first().click();
  await page.waitForTimeout(700);
  const detail = page.locator('.view.is-active');
  assert.strictEqual(await detail.locator('.stat-tiles .stat-tile').count(), 2, 'detail has two stat tiles');
  assert.strictEqual(await detail.locator('.stat-tile.is-warm').count(), 1, 'second tile is the warm one');
  assert(!(await detail.locator('.clinical-value').evaluate((n) => n.classList.contains('is-revealed'))), 'clinical value still hidden first');
  const cta = detail.locator('.btn-primary[data-open-register]');
  assert.strictEqual(await cta.count(), 1, 'detail has a primary "Registrar evento" button');
  await cta.click();
  await page.waitForTimeout(500);
  assert.strictEqual(await page.locator('.registration-layer.is-open').count(), 1, 'the button opens the registration sheet');
  assert.strictEqual(await page.locator('[data-event-patient="mg"]').getAttribute('aria-pressed'), 'true', 'sheet preselects this patient');
  ok('nurse: patient detail is Medixin "Doctor Details" (stat tiles + primary CTA)');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.goBack().catch(() => {});
  await page.locator('[data-nav="pendientes"]').click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 3; i += 1) {
    const b = page.locator('.view.is-active .tap-confirm').first();
    if (!(await b.count())) break;
    await b.click();
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(1500);
  assert(await page.locator('.success-check').first().isVisible(), 'all done shows the Medixin success check');
  ok('nurse: finishing every task shows the success check');
  assert.deepStrictEqual(page.errors, []);
  await page.close();
}

async function sheets(browser) {
  const page = await fresh(browser);
  await openRegister(page);
  await page.waitForTimeout(500);
  const sheet = page.locator('.registration-sheet');
  const radius = await sheet.evaluate((n) => parseFloat(getComputedStyle(n).borderTopLeftRadius));
  assert(radius >= 24, 'sheet top radius >= 24px');
  assert(await page.locator('[data-event-patient].chip').count() === 3, 'patient picker uses chips');
  assert(await page.locator('[data-quick-event] .chip-icon, [data-quick-event] .media-square').count() >= 4, 'quick events carry an icon well');
  await page.locator('[data-quick-event="Otro evento"]').click();
  assert(await page.locator('[data-other-save].btn-primary').isVisible(), 'save is a primary button');
  assert(await page.locator('.field-box [data-other-text], [data-other-text].field-input').count() === 1, 'free text sits in a Medixin field');
  ok('sheets: registration sheet is Medixin "My Appointment" (chips, icon wells, primary save, field)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('[data-handover-open]').first().click();
  await page.waitForTimeout(500);
  assert(await page.locator('.ai-sheet .field').count() >= 4, 'SBAR fields use the field component');
  assert(await page.locator('.ai-sheet [data-handover-chat].btn-primary, .ai-sheet [data-handover-copy].btn-primary').count() === 1, 'one primary action (Enviar al equipo) in the SBAR sheet');
  ok('sheets: SBAR sheet uses fields and buttons');
  assert.deepStrictEqual(page.errors, []);
  await page.close();
}

async function readers(browser) {
  const page = await fresh(browser);
  const splash = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await splash.goto(INDEX);
  await splash.waitForTimeout(300);
  const bg = await splash.locator('#splashLayer').evaluate((n) => getComputedStyle(n).backgroundImage);
  assert(/gradient/.test(bg), 'splash sits on the primary gradient (Medixin "Splash Blue")');
  await splash.close();
  ok('readers: blue gradient splash');

  await viewAs(page, 'paciente');
  await page.waitForTimeout(700);
  let view = page.locator('.view.is-active');
  assert.strictEqual(await view.locator('[data-greet] .avatar').count(), 1, 'patient home opens with the greeting bar');
  assert.strictEqual(await view.locator('.hero-card.next-card').count(), 1, '"Lo que sigue" is the gradient hero');
  assert(await view.locator('.next-card [data-mascot]').count() >= 1, 'mascot stays in the hero');
  assert(!/\d{2,3}\/\d{2,3}|mg\b/i.test(await view.textContent()), 'no clinical values');
  ok('readers: patient home (greeting + hero + mascot, no clinical values)');

  await viewAs(page, 'familia');
  await page.waitForTimeout(700);
  view = page.locator('.view.is-active');
  assert.strictEqual(await view.locator('[data-greet] .avatar').count(), 1, 'family home opens with the greeting bar');
  assert.strictEqual(await view.locator('.hero-card').count(), 1, 'family home has one gradient hero');
  await page.locator('[data-nav="contacto"]').click();
  await page.waitForTimeout(600);
  view = page.locator('.view.is-active');
  assert.strictEqual(await view.locator('.contact-option').count(), 3, 'Contacto offers 3 option cards (Llamar / Mensaje / Visita)');
  assert.strictEqual(await view.locator('a.contact-option[href^="tel:"]').count(), 1, 'Llamar is a tel: link');
  ok('readers: family home + Contacto (3 option cards)');
  assert.deepStrictEqual(page.errors, []);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (want('nurse')) await nurse(browser);
    if (want('sheets')) await sheets(browser);
    if (want('readers')) await readers(browser);
    console.log('medixin' + (ONLY ? ' (' + ONLY + ')' : '') + ': PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('medixin: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
