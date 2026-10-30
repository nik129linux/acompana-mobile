'use strict';

// Shared store + in-app chat: a nurse and a family on two devices see the same
// shift through the server, and the family AI answers from what was logged.
// Run: node tests/sync.test.js

const assert = require('assert');
const { chromium } = require('playwright');
const { createServer, resetShared } = require('../server/server.js');
const { openRegister } = require('./helpers');

let passed = 0;
function ok(name) { passed += 1; console.log('ok - ' + name); }

async function api(base, path, body) {
  const res = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json() };
}

async function open(browser, url, secure) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    window.__shared = 0;
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => { window.__shared += 1; return Promise.resolve(); } });
    window.__opened = 0;
    window.open = () => { window.__opened += 1; return null; };
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url);
  if (await page.locator('[data-splash-skip]').isVisible().catch(() => false)) await page.locator('[data-splash-skip]').click();
  await page.waitForTimeout(500);
  return page;
}

(async () => {
  const server = createServer(null);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    resetShared();
    // Server contract.
    let r = await api(base, '/api/events', { id: 'e1', patientId: 'mg', kind: 'medication', text: 'Enoxaparina 40mg', time: '11:05' });
    assert.strictEqual(r.status, 200);
    r = await api(base, '/api/events', { id: 'e1', patientId: 'mg', kind: 'medication', text: 'Enoxaparina 40mg', time: '11:05' });
    r = await api(base, '/api/sync?reader=enfermero');
    assert.strictEqual(r.data.events.length, 1, 'same id twice stores once');
    assert.strictEqual(r.data.events[0].text, 'Enoxaparina 40mg');
    ok('events: idempotent by id');

    const before = r.data.seq;
    assert.strictEqual((await api(base, '/api/chat', { channel: 'nada', patientId: 'mg', author: 'x', text: 'hola' })).status, 400);
    assert.strictEqual((await api(base, '/api/chat', { channel: 'familia', patientId: 'mg', author: 'x', text: '   ' })).status, 400);
    assert.strictEqual((await api(base, '/api/chat', { channel: 'familia', patientId: 'mg', author: 'x', text: 'a'.repeat(601) })).status, 400);
    assert.strictEqual((await api(base, '/api/chat', { channel: 'familia', patientId: 'mg', author: 'Familia', text: 'hola' })).status, 200);
    assert.strictEqual((await api(base, '/api/chat', { channel: 'equipo', patientId: 'mg', author: 'Elena', text: 'PA 90/55' })).status, 200);
    ok('chat: validates channel and text');

    r = await api(base, '/api/sync?reader=familia');
    assert.strictEqual(r.data.events[0].text, '', 'family never receives clinical event text');
    assert.strictEqual(r.data.events[0].kind, 'medication');
    assert.deepStrictEqual(r.data.messages.map((m) => m.channel), ['familia'], 'family never receives the team channel');
    assert(!JSON.stringify(r.data).includes('90/55') && !JSON.stringify(r.data).includes('Enoxaparina'));
    ok('sync: the family feed carries no clinical text');

    r = await api(base, '/api/sync?reader=enfermero&since=' + before);
    assert.strictEqual(r.data.messages.length, 2, 'since returns only the newer items');
    assert.strictEqual(r.data.events.length, 0);
    assert(r.data.seq > before);
    ok('sync: since is incremental');

    // Two devices.
    resetShared();
    const nurse = await open(browser, base + '/');
    const family = await open(browser, base + '/?ver=familia');

    await openRegister(nurse);
    await nurse.waitForTimeout(400);
    await nurse.locator('[data-event-patient="mg"]').click();
    await nurse.locator('[data-quick-event="Medicación"]').click();
    await nurse.keyboard.press('Escape');
    await family.waitForFunction(() => (localStorage.getItem('acompana-events') || '').includes('medication'), null, { timeout: 8000 });
    ok('event logged on the nurse phone reaches the family device within 8s');
    assert(!(await family.evaluate(() => localStorage.getItem('acompana-events'))).match(/Enoxaparina/i));

    await family.locator('[data-ask-input]').waitFor({ timeout: 3000 });
    const facts = await family.evaluate(async () => {
      const original = window.fetch; let sent = null;
      window.fetch = (u, o) => { if (String(u).includes('/api/ask')) sent = o.body; return original(u, o); };
      localStorage.setItem('acompana-ai-consent', 'yes');
      return { before: !!sent };
    });
    assert(facts);
    let askBody = null;
    await family.route('**/api/ask', (route) => { askBody = route.request().postData(); route.continue(); });
    await family.reload();
    if (await family.locator('[data-splash-skip]').isVisible().catch(() => false)) await family.locator('[data-splash-skip]').click();
    await family.waitForTimeout(500);
    await family.locator('[data-ask-input]').fill('¿Cómo va?');
    await family.locator('[data-ask-send]').click();
    await family.waitForTimeout(800);
    assert(askBody, 'ask reached the server');
    const askFacts = JSON.parse(askBody).facts.join(' ');
    assert(/Tratamiento cumplido/.test(askFacts), 'family AI facts include the logged medication phrase: ' + askFacts);
    assert(!/Enoxaparina/i.test(askFacts));
    ok('family AI facts come from the logged events');

    assert.deepStrictEqual(await Promise.all(['ai-answer.mp4', 'ai-answer.webm', 'ai-answer.jpg', 'ai-thinking.mp4', 'ai-thinking.webm', 'ai-thinking.jpg']
      .map((f) => fetch(base + '/media/' + f).then((r) => r.status))), [200, 200, 200, 200, 200, 200], 'AI mark media is served');

    // Avisar a la familia lands in chat, no OS share and no wa.me.
    await nurse.locator('[data-patient="mg"]').first().click();
    await nurse.waitForTimeout(500);
    await nurse.locator('[data-share-family]').click();
    await nurse.waitForTimeout(400);
    assert.strictEqual(await nurse.evaluate(() => window.__shared + window.__opened), 0, 'no share sheet, no wa.me');
    await family.locator('[data-nav="contacto"]').click();
    await family.waitForTimeout(400);
    await family.locator('[data-chat-open]').click();
    await family.locator('[data-chat-thread] .chat-message').first().waitFor({ timeout: 8000 });
    assert(/Hola, familia de/.test(await family.locator('[data-chat-thread]').textContent()));
    ok('Avisar a la familia arrives in the family chat');

    await family.locator('[data-chat-input]').fill('¿Podemos ir a las 4?');
    await family.locator('[data-chat-send]').click();
    await nurse.keyboard.press('Escape');
    await nurse.waitForTimeout(300);
    await nurse.reload();
    if (await nurse.locator('[data-splash-skip]').isVisible().catch(() => false)) await nurse.locator('[data-splash-skip]').click();
    await nurse.waitForTimeout(500);
    await nurse.locator('.bottom-nav [data-nav="chat"]').click();
    await nurse.locator('[data-chat-channel="familia"]').click();
    await nurse.locator('[data-chat-thread] .chat-message:has-text("a las 4")').waitFor({ timeout: 8000 });
    ok('family message reaches the nurse chat');

    // SBAR goes to the team channel, never to the family thread.
    assert.strictEqual(await nurse.locator('[data-handover-share]').count(), 0);
    await nurse.locator('.bottom-nav [data-nav="turno"]').click();
    await nurse.waitForTimeout(300);
    await nurse.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /entrega|SBAR/i.test(x.textContent));
      if (b) b.click();
    });
    await nurse.locator('[data-handover-chat]').waitFor({ timeout: 4000 });
    await nurse.locator('[data-handover-s]').fill('Paciente estable, PA 90/55');
    await nurse.locator('[data-handover-chat]').click();
    await nurse.waitForTimeout(500);
    await nurse.locator('[data-handover-sent] .success-check').waitFor({ state: 'attached', timeout: 2000 });
    assert.strictEqual(await nurse.locator('[data-handover-s]').inputValue(), '', 'fields clear after sending');
    await nurse.locator('.ai-sheet').evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await nurse.waitForTimeout(100);
    const closeBox = await nurse.locator('.ai-sheet [data-ai-close]').boundingBox();
    const sheetBox = await nurse.locator('.ai-sheet').boundingBox();
    assert(closeBox.y >= sheetBox.y - 1, 'close button stays visible when scrolled');
    const before2 = (await api(base, '/api/sync?reader=enfermero')).data.messages.length;
    await nurse.locator('[data-handover-chat]').click();
    await nurse.waitForTimeout(300);
    assert.strictEqual((await api(base, '/api/sync?reader=enfermero')).data.messages.length, before2, 'an empty note is not sent');
    await nurse.locator('.ai-sheet [data-ai-close]').click();
    const team = await api(base, '/api/sync?reader=enfermero');
    assert(team.data.messages.some((m) => m.channel === 'equipo' && m.text.includes('PA 90/55')), 'SBAR is in the team channel');
    const fam = await api(base, '/api/sync?reader=familia');
    assert(!JSON.stringify(fam.data).includes('90/55'));
    ok('SBAR goes to the team chat only');

    const fit = await family.locator('[data-chat-send]').boundingBox();
    assert(fit && fit.x + fit.width <= 390, 'send button stays on screen');
    // The sender sees the state of every message, including a failed send.
    await family.locator('[data-chat-input]').fill('Confirmo la visita');
    await family.locator('[data-chat-send]').click();
    await family.locator('.chat-message:has-text("Confirmo la visita") .chat-status.is-sent').waitFor({ state: 'attached', timeout: 4000 });
    assert.strictEqual(await family.locator('[data-chat-input]').inputValue(), '', 'composer clears after a send');
    await family.route('**/api/chat', (route) => route.abort());
    await family.locator('[data-chat-input]').fill('Sin red');
    await family.locator('[data-chat-send]').click();
    await family.locator('.chat-message:has-text("Sin red") .chat-status.is-failed').waitFor({ state: 'attached', timeout: 4000 });
    assert.strictEqual(await family.locator('[data-chat-input]').inputValue(), 'Sin red', 'a failed send keeps the text');
    await family.unroute('**/api/chat');
    ok('chat: sending, sent and failed are visible to the sender');

    // A full SBAR is not cut, and a reply shows while the composer keeps focus.
    const long = 'x'.repeat(190);
    const full = 'Situación: ' + long + '\nAntecedentes: ' + long + '\nEvaluación: ' + long + '\nRecomendación: ' + long + ' FIN';
    assert.strictEqual((await api(base, '/api/chat', { channel: 'equipo', patientId: 'mg', author: 'Elena', text: full })).status, 200);
    assert((await api(base, '/api/events/delete', { id: 'unknown' })).status === 200, 'unknown delete does not block the push queue');
    await nurse.keyboard.press('Escape');
    await nurse.waitForTimeout(400);
    await nurse.locator('.bottom-nav [data-nav="chat"]').click();
    await nurse.waitForTimeout(400);
    await nurse.locator('[data-chat-channel="familia"]').click();
    await nurse.waitForTimeout(300);
    await nurse.locator('[data-chat-input]').fill('Sí, a las 4 está bien');
    await nurse.locator('[data-chat-send]').click();
    await nurse.locator('[data-chat-input]').fill('escribiendo');
    await nurse.locator('[data-chat-input]').focus();
    await api(base, '/api/chat', { channel: 'familia', patientId: 'mg', author: 'Familia', text: 'Gracias, Elena' });
    await nurse.locator('[data-chat-thread] .chat-message:has-text("Gracias, Elena")').waitFor({ timeout: 8000 });
    assert.strictEqual(await nurse.locator('[data-chat-input]').inputValue(), 'escribiendo', 'draft survives an incoming message');
    assert.strictEqual(await nurse.locator('[data-chat-thread] .chat-message:has-text("a las 4 está bien")').count(), 1, 'own message shown once');
    ok('chat: replies arrive while typing, no duplicates');

    // Server restart: the seq drops, and clients must resync instead of going deaf.
    resetShared();
    await api(base, '/api/chat', { channel: 'familia', patientId: 'mg', author: 'Familia', text: 'Tras reinicio' });
    await nurse.locator('[data-chat-thread] .chat-message:has-text("Tras reinicio")').waitFor({ timeout: 12000 });
    ok('sync: recovers after a server restart');

    assert.deepStrictEqual(nurse.errors.concat(family.errors), [], 'no page errors');
    ok('no page errors');
    console.log('sync: PASS (' + passed + ' tests)');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); console.log('sync: FAIL (' + passed + ' passed before failure)'); process.exit(1); });
