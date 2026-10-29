'use strict';

// Real registration: quick chips, "Otro evento" and dictation save events
// that survive a reload, show up in the nurse history, feed the SBAR, and
// reach the patient and family only as plain words. Plus /api/event.
// Run: node tests/events.test.js

const assert = require('assert');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ai = require('../server/ai');
const srv = require('../server/server');
const { chromium } = require('playwright');

const INDEX = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

function mockClient(response) {
  return ai.createClient({
    baseUrl: 'http://mock',
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma-test' }] }) };
      if (response instanceof Error) throw response;
      return { ok: true, json: async () => ({ response: JSON.stringify(response) }) };
    }
  });
}

function post(port, p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function serverTests() {
  // Rules: keyword classification, no model.
  const cases = [
    ['le puse la enoxaparina subcutánea', 'medication'],
    ['cambio de posición a decúbito lateral', 'position'],
    ['hice la ronda y control de signos', 'round'],
    ['la familia pidió hablar con el médico', 'other']
  ];
  for (const [text, kind] of cases) {
    const out = srv.classifyEventRules(text);
    assert.strictEqual(out.kind, kind, text);
    assert.strictEqual(out.source, 'rules');
    assert(out.text.length > 0 && out.text.length <= 140);
  }
  ok('rules classify dictation into medication/position/round/other');

  // Model path: valid structured answer is used.
  const good = await srv.handleEvent('le puse enoxaparina 40 mg', mockClient({ kind: 'medication', text: 'Enoxaparina 40 mg aplicada' }));
  assert.strictEqual(good.source, 'ollama');
  assert.strictEqual(good.kind, 'medication');
  assert.strictEqual(good.text, 'Enoxaparina 40 mg aplicada');
  ok('model answer used when valid');

  // Model invents a number that was not dictated: rejected, rules win.
  const invented = await srv.handleEvent('le puse enoxaparina', mockClient({ kind: 'medication', text: 'Enoxaparina 80 mg aplicada' }));
  assert.strictEqual(invented.source, 'rules');
  ok('ungrounded number from the model falls back to rules');

  // Bad kind or model down: rules.
  assert.strictEqual((await srv.handleEvent('ronda hecha', mockClient({ kind: 'surgery', text: 'x' }))).source, 'rules');
  assert.strictEqual((await srv.handleEvent('ronda hecha', mockClient(new Error('down')))).source, 'rules');
  ok('invalid kind or model down falls back to rules');

  const server = srv.createServer(mockClient({ kind: 'round', text: 'Ronda hecha' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const port = server.address().port;
    const r = await post(port, '/api/event', { text: 'ronda hecha' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.kind, 'round');
    const empty = await post(port, '/api/event', { text: '   ' });
    assert.strictEqual(empty.status, 400);
    const long = await post(port, '/api/event', { text: 'a'.repeat(601) });
    assert.strictEqual(long.status, 400);
    ok('POST /api/event: 200 valid, 400 empty or over 600 chars');
  } finally {
    server.close();
  }
}

async function skipSplash(page) {
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
}

async function openSheet(page) {
  await page.locator('.bottom-nav [data-nav="registrar"]').first().click();
  await page.waitForSelector('.registration-sheet');
  await page.waitForTimeout(400);
}

async function uiTests() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Fake speech recognition: start() emits one final transcript.
    await context.addInitScript(() => {
      window.__speechText = 'cambio de posición a decúbito lateral';
      window.webkitSpeechRecognition = function () {
        const self = this;
        self.lang = ''; self.interimResults = false;
        self.start = () => setTimeout(() => {
          self.onresult && self.onresult({ results: [[{ transcript: window.__speechText }]], resultIndex: 0 });
          self.onend && self.onend();
        }, 50);
        self.stop = () => { self.onend && self.onend(); };
        self.abort = self.stop;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(INDEX);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await skipSplash(page);

    // 1. Quick chip for a chosen patient.
    await openSheet(page);
    const patients = page.locator('[data-event-patient]');
    assert.strictEqual(await patients.count(), 3, 'sheet lets the nurse pick one of the 3 patients');
    await page.locator('[data-event-patient="mg"]').click();
    assert.strictEqual(await page.locator('[data-event-patient="mg"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-quick-event="Medicación"]').click();
    const feedback = page.locator('[data-tray-feedback]');
    await page.waitForTimeout(200);
    assert(/registrad/i.test(await feedback.textContent()), 'feedback confirms it was registered');
    assert(!/listo para registrar/i.test(await feedback.textContent()), 'old placeholder copy is gone');
    assert(await page.locator('[data-undo-event]').isVisible(), 'undo is offered');
    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('acompana-events') || '[]'));
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].patientId, 'mg');
    assert.strictEqual(stored[0].kind, 'medication');
    assert(/^\d{2}:\d{2}$/.test(stored[0].time), 'time is HH:MM');
    ok('quick chip saves an event for the chosen patient with undo');

    // 2. Undo removes it.
    await page.locator('[data-undo-event]').click();
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem('acompana-events') || '[]'));
    assert.strictEqual(stored.length, 0, 'undo removes the event');
    await page.locator('[data-quick-event="Ronda"]').click();
    ok('undo works');

    // 3. Otro evento: inline text, saved as kind other.
    await page.locator('[data-quick-event="Otro evento"]').click();
    const other = page.locator('[data-other-text]');
    assert(await other.isVisible(), 'Otro evento opens a text field');
    await other.fill('Familia pidió hablar con el médico');
    await page.locator('[data-other-save]').click();
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem('acompana-events') || '[]'));
    assert.strictEqual(stored.length, 2);
    assert(stored.some((e) => e.kind === 'other' && e.text === 'Familia pidió hablar con el médico'));
    ok('Otro evento saves free text');

    // 4. Dictation: transcript -> proposal card -> nurse confirms -> saved.
    await page.locator('[data-dictate]').click();
    const proposal = page.locator('[data-event-proposal]');
    await proposal.waitFor({ timeout: 5000 });
    assert(/decúbito lateral/i.test(await proposal.textContent()), 'proposal shows the dictated text');
    assert.strictEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('acompana-events') || '[]'))).length, 2, 'nothing saved before confirm');
    await page.locator('[data-proposal-save]').click();
    stored = await page.evaluate(() => JSON.parse(localStorage.getItem('acompana-events') || '[]'));
    assert.strictEqual(stored.length, 3);
    assert(stored.some((e) => e.kind === 'position' && e.source === 'voice'));
    ok('dictation proposes, nurse confirms, then it saves');

    // 5. Survives reload and shows in the nurse history for that patient.
    await page.reload();
    await skipSplash(page);
    await page.locator('[data-patient="mg"]').click();
    await page.waitForTimeout(600);
    const history = await page.locator('.view.is-active').textContent();
    assert(/Familia pidió hablar con el médico/.test(history), 'manual event in nurse history after reload');
    ok('events persist and show in the patient history');

    // 6. SBAR uses them (rules path, server is not running from file://).
    const sbar = await page.evaluate(() => window.__acompana && window.__acompana.dayEvents && window.__acompana.dayEvents().map((e) => e.text).join(' | '));
    assert(sbar && /médico/.test(sbar), 'dayEvents() includes logged events (expose window.__acompana.dayEvents)');
    ok('SBAR input includes logged events');

    // 7. Patient and family see plain words only, never the raw nurse text.
    await page.locator('.role-tab[data-role="paciente"]').first().click();
    await page.waitForTimeout(600);
    const patientView = await page.locator('.view.is-active').textContent();
    assert(/cambiar de posición/i.test(patientView), 'patient sees plain words for the position change');
    assert(!/decúbito|médico/i.test(patientView), 'patient never sees the raw clinical/manual text');
    await page.locator('.role-tab[data-role="familia"]').first().click();
    await page.waitForTimeout(600);
    const familyView = await page.locator('.view.is-active').textContent();
    assert(!/decúbito|médico|enoxaparina/i.test(familyView), 'family never sees raw text');
    ok('patient and family get plain-language versions only');

    // 8. Contact buttons do something.
    await page.locator('.bottom-nav [data-nav="contacto"]').first().click();
    await page.waitForTimeout(600);
    const call = page.locator('a[href^="tel:"]', { hasText: 'Llamar al turno' });
    assert.strictEqual(await call.count(), 1, 'Llamar al turno is a tel: link');
    await page.locator('button:has-text("Ver horarios"), a:has-text("Ver horarios")').first().click();
    await page.waitForTimeout(500);
    assert(await page.locator('[data-schedule-sheet]').isVisible(), 'Ver horarios opens the schedule sheet');
    ok('contact actions work');

    // 9. No speech API: dictate falls back to typing.
    const page2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page2.goto(INDEX);
    await skipSplash(page2);
    await openSheet(page2);
    await page2.locator('[data-dictate]').click();
    assert(await page2.locator('[data-other-text]').isVisible(), 'without speech API, dictate opens the text field');
    ok('dictation falls back to typing without the speech API');

    assert.deepStrictEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
  }
}

(async () => {
  try {
    await serverTests();
    await uiTests();
    console.log('events: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('events: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  }
})();
