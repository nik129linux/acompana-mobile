'use strict';

// Patient and family timelines show the server's translation of each logged
// event (Gemma when it passes the guards, rules otherwise), with the source
// visible, and never block or leak when the server is away.
// Run: node tests/translate-ui.test.js

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const ai = require('../server/ai');
const srv = require('../server/server');
const { viewAs, openRegister } = require('./helpers');

const PHRASE = 'La ayudaron a acomodarse en la cama';
let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

const mock = ai.createClient({
  baseUrl: 'http://mock',
  apiKey: '',
  timeoutMs: 1000,
  fetchImpl: async (url) => {
    if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) };
    return { ok: true, json: async () => ({ response: JSON.stringify({ text: PHRASE }) }) };
  }
});

async function skipSplash(page) {
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
}

async function logPositionForMaria(page) {
  await openRegister(page);
  await page.waitForTimeout(400);
  await page.locator('[data-event-patient="mg"]').click();
  await page.locator('[data-quick-event="Cambio de posición"]').click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

(async () => {
  const server = srv.createServer(mock);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const translateCalls = [];
    page.on('request', (r) => { if (r.url().includes('/api/translate')) translateCalls.push(JSON.parse(r.postData() || '{}')); });
    await page.goto(origin + '/');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('acompana-ai-consent', 'yes'); });
    await page.reload();
    await skipSplash(page);
    await logPositionForMaria(page);

    await viewAs(page, 'paciente');
    await page.waitForTimeout(1500);
    const patientView = page.locator('.view.is-active');
    assert((await patientView.textContent()).includes(PHRASE), 'patient timeline shows the AI phrasing');
    assert(!/decúbito|postural/i.test(await patientView.textContent()), 'no raw nurse text');
    const item = patientView.locator('.timeline-item', { hasText: PHRASE });
    assert(/IA/.test(await item.textContent()), 'the AI-written line says it came from IA');
    assert(translateCalls.some((c) => c.reader === 'paciente' && c.event && c.event.kind === 'position'), 'client asked /api/translate for the patient');
    assert(translateCalls.every((c) => !/Mar[ií]a|Gonz/i.test(JSON.stringify(c))), 'no patient name sent to the server');
    ok('patient sees the AI phrase with its source, no names sent');

    await viewAs(page, 'familia');
    await page.waitForTimeout(1500);
    const familyText = await page.locator('.view.is-active').textContent();
    assert(!familyText.includes(PHRASE), 'family never gets a position event (rules return null)');
    ok('family gets nothing the rules hide');

    // Server away (file://): rules phrase, no errors, nothing blocks.
    const local = await browser.newPage({ viewport: { width: 390, height: 844 } });
    local.on('pageerror', (e) => errors.push('file: ' + e.message));
    await local.goto(pathToFileURL(path.join(__dirname, '..', 'index.html')).href);
    await local.evaluate(() => { localStorage.clear(); localStorage.setItem('acompana-ai-consent', 'yes'); });
    await local.reload();
    await skipSplash(local);
    await logPositionForMaria(local);
    await viewAs(local, 'paciente');
    await local.waitForTimeout(4000);
    assert((await local.locator('.view.is-active').textContent()).includes('Le ayudaron a cambiar de posición'), 'falls back to the rules phrase offline');
    await local.close();
    ok('offline falls back to rules without errors');

    // Without AI consent the client must not call the model.
    translateCalls.length = 0;
    await page.evaluate(() => localStorage.setItem('acompana-ai-consent', 'no'));
    await page.reload();
    await skipSplash(page);
    await viewAs(page, 'paciente');
    await page.waitForTimeout(1200);
    assert.strictEqual(translateCalls.length, 0, 'no /api/translate calls without consent');
    assert((await page.locator('.view.is-active').textContent()).includes('Le ayudaron a cambiar de posición'), 'rules phrase without consent');
    ok('no AI calls without consent');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('translate-ui: PASS (' + passed + ' tests)');
  } catch (error) {
    console.error('not ok - ' + error.message);
    console.log('translate-ui: FAIL (' + passed + ' passed before failure)');
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
