'use strict';

// Nico's front-end finish list (2026-10-31): English/Spanish, a loading bar on
// the SBAR draft, no black hover, blue checks everywhere, an error state with a
// big X, plus the screen bugs found in the audit.
// Run: node tests/finish.test.js

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { viewAs, openRegister } = require('./helpers');
const srv = require('../server/server.js');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function fresh(browser, options) {
  const opts = options || {};
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(opts.context || {}) });
  await ctx.addInitScript((consent) => {
    if (consent) localStorage.setItem('acompana-ai-consent', consent);
  }, opts.consent || null);
  if (opts.route) await opts.route(ctx);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(INDEX);
  await page.evaluate(() => {
    const consent = localStorage.getItem('acompana-ai-consent');
    localStorage.clear();
    if (consent) localStorage.setItem('acompana-ai-consent', consent);
  });
  await page.reload();
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
  return page;
}

async function openMenu(page) {
  await page.locator('.view.is-active [data-demo-menu]').first().click();
}

async function setEnglish(page) {
  await openMenu(page);
  await page.locator('.view.is-active .demo-menu.is-open [data-menu-lang]').click();
  await page.waitForTimeout(400);
}

// Spanish that must not survive in the English UI. Patient, nurse and brand
// names are real Spanish words on purpose, so they are removed first.
const NAMES = /Mar[ií]a Gonz[aá]lez|Mar[ií]a|Gonz[aá]lez|Carlos Rodr[ií]guez|Carlos|Rodr[ií]guez|Jorge P[eé]rez|Jorge|P[eé]rez|Elena|Acompaña|Español|Enoxaparin[a]?/g;
const SPANISH = /[áéíóúñ¿¡]|\b(de|del|la|el|los|las|para|con|sin|turno|pendientes?|hecho|hechas|enfermera?|familia|paciente|registrar|hoy|mañana|ronda|visita|horarios?|preguntas?|listo)\b/i;

async function assertEnglish(page, where) {
  const text = await page.evaluate(() => {
    const roots = ['.view.is-active', '#bottomNav', '#registrationLayer.is-open', '#aiLayer.is-open', '#celebrationLayer.is-visible', '#errorLayer.is-open'];
    const seen = [];
    roots.forEach((selector) => {
      const node = document.querySelector(selector);
      if (!node) return;
      seen.push(node.innerText);
      node.querySelectorAll('[aria-label],[placeholder]').forEach((el) => {
        seen.push(el.getAttribute('aria-label') || '');
        seen.push(el.getAttribute('placeholder') || '');
      });
    });
    return seen.join(' | ');
  });
  const clean = text.replace(NAMES, ' ');
  const hit = clean.match(SPANISH);
  assert.ok(!hit, where + ': Spanish left ("' + (hit && hit[0]) + '") in: ' + clean.slice(Math.max(0, (hit ? hit.index : 0) - 60), (hit ? hit.index : 0) + 60));
}

// Colors built with color-mix() compute to color(srgb 0-1) instead of rgb().
function channels(color) {
  const text = String(color);
  const values = (text.replace('srgb', '').match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  return text.startsWith('color(') ? values.map((v) => v * 255) : values;
}
function luminance(rgb) {
  const [r, g, b] = channels(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const bg = (locator) => locator.first().evaluate((node) => getComputedStyle(node).backgroundColor);

(async () => {
  // The bundled Chromium loses text layout on this machine (innerText comes back
  // empty); Brave renders it, so these visible-text checks run there when present.
  const brave = path.join(os.homedir(), '.local/bin/brave-browser');
  const browser = await chromium.launch(fs.existsSync(brave) ? { executablePath: brave } : {});
  try {
    // 1. Spanish stays the default; the menu flips the whole app and persists.
    let page = await fresh(browser);
    assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'es');
    assert.ok((await page.locator('.view.is-active').innerText()).includes('Hola, Elena'));
    await setEnglish(page);
    assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.ok((await page.locator('.view.is-active').innerText()).includes('Hi, Elena'), 'greeting follows the language');
    await page.reload();
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => document.documentElement.lang), 'en', 'language survives a reload');
    ok('i18n: Spanish default, English from the menu, persisted');

    // 2. Every screen in English.
    await assertEnglish(page, 'nurse home');
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(500);
    await assertEnglish(page, 'pending');
    await page.locator('[data-pending-tab="done"]').click();
    await page.waitForTimeout(400);
    await assertEnglish(page, 'done tab');
    await page.locator('[data-nav="chat"]').click();
    await page.waitForTimeout(500);
    await assertEnglish(page, 'nurse chat');
    await page.locator('[data-nav="turno"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-patient="cr"]').first().click();
    await page.waitForTimeout(600);
    await assertEnglish(page, 'detail');
    await page.locator('.view.is-active [data-reveal]').first().click();
    await page.waitForTimeout(300);
    await assertEnglish(page, 'detail revealed');
    await page.locator('.view.is-active [data-back]').click();
    await page.waitForTimeout(600);
    await openRegister(page);
    await page.waitForTimeout(600);
    await assertEnglish(page, 'register sheet');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.locator('.view.is-active [data-handover-open]').click();
    await page.waitForTimeout(600);
    await assertEnglish(page, 'handover sheet');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await viewAs(page, 'paciente');
    await page.waitForTimeout(500);
    await assertEnglish(page, 'patient');
    await page.locator('[data-nav="preguntas"]').click();
    await page.waitForTimeout(500);
    await assertEnglish(page, 'patient questions');
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    await assertEnglish(page, 'family');
    await page.locator('[data-nav="contacto"]').click();
    await page.waitForTimeout(500);
    await assertEnglish(page, 'contact');
    await page.locator('[data-chat-open]').click();
    await page.waitForTimeout(500);
    await assertEnglish(page, 'family chat');
    assert.deepStrictEqual(page.errors, []);
    ok('i18n: no Spanish left on any screen in English');

    // 3. The all-done moment, in English too.
    page = await fresh(browser);
    await setEnglish(page);
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(400);
    for (let i = 0; i < 3; i += 1) {
      await page.locator('.view.is-active [data-confirm]').first().click();
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(400);
    await assertEnglish(page, 'all done');
    // ...and its check is the primary color, not green.
    const checkStyle = await page.locator('.celebration-card .success-check').evaluate((node) => {
      const css = getComputedStyle(node);
      return css.backgroundImage + ' ' + css.boxShadow;
    });
    assert.ok(!/37,\s*172,\s*95|0\.145\d*\s+0\.674/.test(checkStyle), 'success check is not green: ' + checkStyle);
    ok('blue: the finished-shift check uses the primary color');

    // 4. Dictation listens in the chosen language and the server is told too.
    let recogLang = null;
    page = await fresh(browser, { consent: 'yes', route: async (ctx) => {
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'brave', { value: undefined });
        window.webkitSpeechRecognition = function () {
          const self = this;
          self.start = () => { window.__recogLang = self.lang; };
          self.stop = () => { self.onend && self.onend(); };
        };
      });
    } });
    await setEnglish(page);
    await openRegister(page);
    await page.waitForTimeout(500);
    await page.locator('[data-dictate]').click();
    await page.waitForTimeout(200);
    recogLang = await page.evaluate(() => window.__recogLang);
    assert.strictEqual(recogLang, 'en-US');
    ok('i18n: dictation follows the language');

    // 5. Generating the draft shows a real loading bar, then the fields.
    let askedLang = null;
    page = await fresh(browser, { consent: 'yes', route: async (ctx) => {
      await ctx.route('**/api/handover', async (route) => {
        askedLang = JSON.parse(route.request().postData()).lang;
        await new Promise((r) => setTimeout(r, 900));
        await route.fulfill({ json: { s: 'Situacion', b: 'Antecedentes', a: 'Evaluacion', r: 'Recomendacion', source: 'ollama', model: 'gemma' } });
      });
    } });
    await page.locator('.view.is-active [data-handover-open]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-handover-generate]').click();
    await page.waitForTimeout(250);
    const bar = page.locator('[data-handover-progress]');
    assert.ok(await bar.isVisible(), 'the bar shows while generating');
    assert.strictEqual(await bar.getAttribute('role'), 'progressbar');
    assert.ok(await page.locator('[data-handover-generate]').isDisabled(), 'no double submit');
    assert.strictEqual(await page.locator('[data-handover-s]').inputValue(), '');
    await page.waitForTimeout(1500);
    assert.ok(!(await bar.isVisible().catch(() => false)), 'the bar leaves when the draft is ready');
    assert.strictEqual(await page.locator('[data-handover-s]').inputValue(), 'Situacion');
    assert.ok(await page.locator('[data-handover-generate]').isEnabled());
    assert.strictEqual(askedLang, 'es');
    ok('loading bar: visible while drafting, gone after, button locked');

    // 6. Hover never turns a control black, on either kind of tap target.
    page = await fresh(browser);
    await page.locator('.patient-card .quick-confirm').first().hover();
    await page.waitForTimeout(450);
    const quickBg = await bg(page.locator('.patient-card .quick-confirm'));
    assert.ok(luminance(quickBg) > 120, 'quick confirm hover stays light: ' + quickBg);
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    const askButton = page.locator('[data-ask-send]');
    await askButton.scrollIntoViewIfNeeded();
    await askButton.hover();
    await page.waitForTimeout(450);
    const askPaint = await askButton.evaluate((node) => {
      const css = getComputedStyle(node);
      return { image: css.backgroundImage, color: css.backgroundColor };
    });
    assert.ok(/gradient/.test(askPaint.image), 'Preguntar keeps the primary gradient on hover: ' + JSON.stringify(askPaint));
    ok('hover: no black on the confirm or ask buttons');

    // 7. No green left on the patient side.
    page = await fresh(browser);
    await viewAs(page, 'paciente');
    await page.waitForTimeout(600);
    const greenCheck = (color) => {
      const [r, g, b] = channels(color);
      return g > r + 40 && g > b + 25;
    };
    const paints = await page.evaluate(() => Array.from(document.querySelectorAll('.view.is-active *, #bottomNav *')).map((node) => {
      const css = getComputedStyle(node);
      return [css.backgroundColor, css.color, css.stroke];
    }).flat());
    assert.deepStrictEqual(paints.filter((c) => /^(rgb|color)/.test(c) && greenCheck(c)), [], 'patient side has green');
    const badge = channels(await bg(page.locator('.timeline-badge:not(.is-pending)')));
    assert.ok(badge[2] > badge[1] && badge[2] > badge[0], 'done badge is blue');
    const tokens = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8');
    assert.ok(!/--color-patient-500/.test(tokens), 'the green primitive is gone');
    ok('blue: no green on the patient side');

    // 8. The error case: reachable from the menu, a big X, retry and close.
    page = await fresh(browser);
    await openMenu(page);
    await page.locator('.view.is-active .demo-menu.is-open [data-simulate-error]').click();
    await page.waitForTimeout(600);
    const error = page.locator('[data-error-state]');
    assert.ok(await error.isVisible(), 'the error state opens');
    assert.strictEqual(await error.getAttribute('role'), 'alertdialog');
    const mark = await page.locator('.error-x').boundingBox();
    assert.ok(mark.width >= 112 && mark.height >= 112, 'the X is big: ' + mark.width);
    assert.ok(await page.locator('[data-error-retry]').isVisible());
    assert.ok(await page.locator('[data-error-close]').isVisible());
    assert.ok((await error.innerText()).includes('No se pudo enviar'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    assert.ok(!(await error.isVisible().catch(() => false)), 'Escape closes it');
    await openMenu(page);
    await page.locator('.view.is-active .demo-menu.is-open [data-simulate-error]').click();
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(500);
    assert.ok(!(await error.isVisible().catch(() => false)), 'system Back closes it');
    ok('error: big X from the menu, Escape and Back close it');

    // 9. A real failed send lands on the same state, and retry resends.
    let failNext = true;
    let sends = 0;
    const server = http.createServer(srv.createRequestHandler(null));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port + '/';
    const ctx9 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx9.addInitScript(() => localStorage.setItem('acompana-ai-consent', 'no'));
    await ctx9.route('**/api/chat', async (route) => {
      sends += 1;
      if (failNext) { failNext = false; await route.abort(); return; }
      await route.continue();
    });
    page = await ctx9.newPage();
    await page.goto(base);
    if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
    await page.waitForTimeout(600);
    await page.locator('.view.is-active [data-handover-open]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-handover-s]').fill('Nota de prueba');
    await page.locator('[data-handover-chat]').click();
    await page.waitForTimeout(500);
    assert.ok(await page.locator('[data-error-state]').isVisible(), 'failed send shows the big X');
    assert.strictEqual(await page.locator('[data-handover-s]').inputValue(), 'Nota de prueba', 'the note survives');
    await page.locator('[data-error-retry]').click();
    await page.waitForTimeout(700);
    assert.strictEqual(sends, 2, 'retry sends again');
    assert.ok(!(await page.locator('[data-error-state]').isVisible().catch(() => false)));
    assert.strictEqual(await page.locator('[data-handover-s]').inputValue(), '', 'sent on retry');
    await ctx9.close();
    server.close();
    ok('error: a failed note shows the X, keeps the text, retry resends');

    // 10. The family's answer lands where it can be read.
    page = await fresh(browser, { consent: 'no' });
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    await page.locator('[data-ask-input]').fill('¿A qué hora puedo entrar?');
    await page.locator('[data-ask-send]').click();
    await page.waitForTimeout(900);
    const geometry = await page.evaluate(() => ({
      answer: document.querySelector('[data-ask-answer]').getBoundingClientRect().bottom,
      nav: document.querySelector('#bottomNav').getBoundingClientRect().top
    }));
    assert.ok(geometry.answer <= geometry.nav, 'answer above the nav: ' + JSON.stringify(geometry));
    ok('family: the answer is on screen after asking');

    // 11. Ask box comes before the tutorial cards.
    const order = await page.evaluate(() => {
      const ask = document.querySelector('.view.is-active [data-ask-input]');
      const tutorial = document.querySelector('.view.is-active .onboarding-list');
      return Boolean(ask.compareDocumentPosition(tutorial) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.ok(order, 'ask box above the tutorial');
    const pill = await page.locator('.family-hero .glass-pill').innerText();
    assert.ok(/Horario de visita.*3:00.*5:00/s.test(pill.replace(/\n/g, ' ')), 'pill reads in order: ' + pill);
    const lines = await page.locator('.family-hero .glass-pill').evaluate((node) => Array.from(node.children).filter((c) => !c.classList.contains('visit-icon')).length);
    assert.strictEqual(lines, 1, 'pill text is one flow, not flex fragments');
    const meta = await page.locator('.view.is-active .greet-meta').innerText();
    assert.ok(!meta.includes('González'), 'the room line no longer repeats the name and wraps: ' + meta);
    ok('family: ask first, visit pill in order, room on one line');

    // 12. Family timeline stays in time order.
    page = await fresh(browser, { consent: 'no' });
    await page.evaluate(() => localStorage.setItem('acompana-events', JSON.stringify([
      { id: 'e1', patientId: 'mg', kind: 'medication', text: 'x', time: '12:00' }
    ])));
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    const times = await page.locator('.view.is-active .timeline-time').allInnerTexts();
    assert.ok(times.indexOf('12:00') !== -1 && times.indexOf('12:00') < times.indexOf('15:00'), 'time order: ' + times.join(', '));
    ok('family: timeline in time order');

    // 13. "What's next" follows the shift, it is not a fixed sentence.
    page = await fresh(browser, { consent: 'no' });
    await viewAs(page, 'paciente');
    await page.waitForTimeout(500);
    let next = await page.locator('.next-card').innerText();
    assert.ok(/medicamento/i.test(next), 'María still has her medication next: ' + next);
    await viewAs(page, 'enfermero');
    await page.waitForTimeout(500);
    await page.locator('[data-confirm="medication"]').first().click();
    await page.waitForTimeout(800);
    await viewAs(page, 'paciente');
    await page.waitForTimeout(500);
    next = await page.locator('.next-card').innerText();
    assert.ok(/ronda/i.test(next) && !/medicamento/i.test(next), 'after confirming, the round is next: ' + next);
    const done = await page.locator('.view.is-active .timeline').innerText();
    assert.ok(/medicamento/i.test(done), 'the confirmed medication shows on the timeline');
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    assert.ok((await page.locator('.view.is-active .timeline').innerText()).includes('Tratamiento de la mañana cumplido'));
    ok('shift data: patient next step and family status follow the confirmed tasks');

    // 14. Before the nurse confirms, nobody is told the treatment is done.
    page = await fresh(browser, { consent: 'no' });
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    const early = await page.locator('.view.is-active .timeline').innerText();
    assert.ok(!early.includes('cumplido'), 'family is not told it is done yet: ' + early);
    ok('shift data: no fake "done" before the nurse confirms');

    // 15. The patient can ask too.
    page = await fresh(browser, { consent: 'no' });
    await viewAs(page, 'paciente');
    await page.waitForTimeout(400);
    await page.locator('[data-nav="preguntas"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-ask-input]').fill('¿Cuándo vuelve la enfermera?');
    await page.locator('[data-ask-send]').click();
    await page.waitForTimeout(700);
    assert.ok((await page.locator('[data-ask-answer]').innerText()).includes('1:00'));
    ok('patient: ask box answers from the shift');

    // 16. The clinical toggle is never under the docked button, no chat bubble there.
    page = await fresh(browser);
    await page.locator('[data-patient="cr"]').first().click();
    await page.waitForTimeout(700);
    const covered = await page.evaluate(() => {
      const toggle = document.querySelector('.view.is-active .reveal-button').getBoundingClientRect();
      const cta = document.querySelector('.view.is-active .detail-cta').getBoundingClientRect();
      return toggle.bottom > cta.top;
    });
    assert.ok(!covered, 'reveal toggle clear of the CTA');
    assert.ok(!(await page.locator('#bottomNav [data-nav="chat"]').isVisible()), 'chat bubble hidden on detail');
    ok('detail: toggle clear of the CTA, no bubble over it');

    // 17. Scrolled content never peeks above the sticky greeting.
    page = await fresh(browser);
    await viewAs(page, 'familia');
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.querySelector('.view.is-active').scrollTop = 500; });
    await page.waitForTimeout(200);
    const leak = await page.evaluate(() => {
      const view = document.querySelector('.view.is-active');
      const bar = view.querySelector('[data-greet]').getBoundingClientRect();
      return Math.round(bar.top - view.getBoundingClientRect().top);
    });
    assert.ok(leak <= 0, 'greeting sticks to the top edge, gap ' + leak);
    ok('readers: nothing peeks above the sticky greeting');

    // 18. The snackbar reads in dark mode.
    page = await fresh(browser, { context: { colorScheme: 'dark' } });
    await openMenu(page);
    await page.locator('.view.is-active .demo-menu.is-open [data-simulate-error]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-error-retry]').click();
    await page.waitForTimeout(500);
    const snack = await page.evaluate(() => {
      const bar = document.querySelector('#snackbar');
      const line = bar.querySelector('.tray-feedback-line > span');
      return { fill: getComputedStyle(bar).backgroundColor, ink: getComputedStyle(line).color, text: line.textContent };
    });
    assert.ok(snack.text.includes('prueba'), snack.text);
    const ratio = (a, b) => {
      const light = (rgb) => {
        const [r, g, b2] = channels(rgb).map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
      };
      const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    assert.ok(ratio(snack.fill, snack.ink) >= 4.5, 'snackbar contrast ' + ratio(snack.fill, snack.ink).toFixed(2) + ' ' + JSON.stringify(snack));
    ok('dark: the snackbar text can be read');

    // 19. Checks really are heavier than the 1.5 default, and flat.
    page = await fresh(browser);
    await viewAs(page, 'paciente');
    await page.waitForTimeout(500);
    const badgeStroke = await page.locator('.timeline-badge:not(.is-pending) svg path').first().evaluate((node) => parseFloat(getComputedStyle(node).strokeWidth));
    assert.ok(badgeStroke >= 2, 'timeline check weight ' + badgeStroke);
    await viewAs(page, 'enfermero');
    await page.waitForTimeout(500);
    await page.locator('[data-nav="pendientes"]').click();
    await page.waitForTimeout(400);
    for (let i = 0; i < 3; i += 1) {
      await page.locator('.view.is-active [data-confirm]').first().click();
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(400);
    const big = await page.locator('.celebration-card .success-check').evaluate((node) => ({
      stroke: parseFloat(getComputedStyle(node.querySelector('path')).strokeWidth),
      image: getComputedStyle(node).backgroundImage
    }));
    assert.ok(big.stroke >= 2.4, 'big check weight ' + big.stroke);
    assert.ok(!/radial/.test(big.image), 'no glossy ball: ' + big.image);
    const mascot = await page.locator('.celebration-mascot').evaluate((node) => {
      const css = getComputedStyle(node);
      return { radius: css.borderRadius, overflow: css.overflow };
    });
    assert.ok(mascot.radius === '50%' && mascot.overflow === 'hidden', 'mascot sits on a round disc: ' + JSON.stringify(mascot));
    ok('checks: heavier stroke, flat disc');

    // 20. Contact: three blue discs on one line, in both languages.
    for (const english of [false, true]) {
      page = await fresh(browser);
      if (english) await setEnglish(page);
      await viewAs(page, 'familia');
      await page.waitForTimeout(500);
      await page.locator('[data-nav="contacto"]').click();
      await page.waitForTimeout(700);
      const discs = await page.locator('.view.is-active .contact-icon').evaluateAll((nodes) => nodes.map((node) => {
        const css = getComputedStyle(node);
        return { top: Math.round(node.getBoundingClientRect().top), image: css.backgroundImage, color: css.color };
      }));
      assert.strictEqual(discs.length, 3);
      assert.strictEqual(new Set(discs.map((d) => d.top)).size, 1, 'same height: ' + JSON.stringify(discs.map((d) => d.top)));
      discs.forEach((disc) => assert.ok(/gradient/.test(disc.image), 'blue disc: ' + JSON.stringify(disc)));
      assert.strictEqual(new Set(discs.map((d) => d.color)).size, 1, 'same icon color');
    }
    const nurseLine = await page.locator('.view.is-active .list-card .list-meta').first().evaluate((node) => node.children.length);
    assert.strictEqual(nurseLine, 1, 'the return time is one line of text, not flex fragments');
    ok('contact: three blue icons at one height');
  } finally {
    await browser.close();
  }
  console.log('finish: PASS (' + passed + ' tests)');
})().catch((error) => {
  console.error('not ok - ' + error.message);
  console.log('finish: FAIL (' + passed + ' passed before failure)');
  process.exit(1);
});
