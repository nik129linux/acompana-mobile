'use strict';

// AI translation of one nurse event into plain words per reader (the
// product's core: "one event, three truths"). The model may phrase it; the
// server decides whether the phrasing is safe. Run: node tests/translate.test.js

const assert = require('assert');
const http = require('http');
const ai = require('../server/ai');
const srv = require('../server/server');

function client(reply) {
  return ai.createClient({
    baseUrl: 'http://mock',
    apiKey: '',
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) };
      if (reply instanceof Error) throw reply;
      return { ok: true, json: async () => ({ response: JSON.stringify(reply) }) };
    }
  });
}

const MED = { kind: 'medication', text: 'Enoxaparina 40mg SC, vía abdominal aplicada' };
const POS = { kind: 'position', text: 'Cambio postural decúbito lateral izquierdo' };
const ROUND = { kind: 'round', text: 'Ronda programada, control de signos' };
const OTHER = { kind: 'other', text: 'Familia pidió hablar con el médico' };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('rules: fixed plain phrase per kind and reader', () => {
  assert.strictEqual(srv.translateRules(POS, 'paciente').text, 'Le ayudaron a cambiar de posición');
  assert.strictEqual(srv.translateRules(MED, 'paciente').text, 'Le aplicaron el medicamento');
  assert.strictEqual(srv.translateRules(ROUND, 'paciente').text, 'La enfermera pasó a revisar');
  assert.strictEqual(srv.translateRules(MED, 'familia').text, 'Tratamiento cumplido');
  assert.strictEqual(srv.translateRules(ROUND, 'familia').text, 'El equipo pasó a revisar');
  assert.strictEqual(srv.translateRules(POS, 'familia').text, null, 'family does not get intimate care details');
  assert.strictEqual(srv.translateRules(OTHER, 'paciente').text, null, 'free-text events are never shown to patient');
  assert.strictEqual(srv.translateRules(OTHER, 'familia').text, null);
  assert.strictEqual(srv.translateRules(MED, 'paciente').source, 'rules');
});

test('model phrasing is used when it is plain and clean', async () => {
  const out = await srv.handleTranslate(MED, 'paciente', client({ text: 'Ya le pusieron el medicamento de la mañana' }));
  assert.strictEqual(out.source, 'ollama');
  assert.strictEqual(out.text, 'Ya le pusieron el medicamento de la mañana');
  assert.strictEqual(out.model, 'gemma4:31b');
});

test('drug names, doses and numbers are rejected', async () => {
  for (const bad of ['Le pusieron enoxaparina', 'Le aplicaron 40 mg', 'Recibió su dosis de las 11:05', 'Le pusieron una inyección SC']) {
    const out = await srv.handleTranslate(MED, 'paciente', client({ text: bad }));
    assert.strictEqual(out.source, 'rules', 'must reject: ' + bad);
    assert.strictEqual(out.text, 'Le aplicaron el medicamento');
  }
});

test('clinical words from the nurse record never reach the reader', async () => {
  const out = await srv.handleTranslate(POS, 'paciente', client({ text: 'Lo pusieron en decúbito lateral' }));
  assert.strictEqual(out.source, 'rules');
});

test('advice, diagnosis and alarm words are rejected', async () => {
  for (const bad of ['Está grave pero estable', 'Debería descansar más', 'No hay diagnóstico todavía']) {
    const out = await srv.handleTranslate(ROUND, 'paciente', client({ text: bad }));
    assert.strictEqual(out.source, 'rules', 'must reject: ' + bad);
  }
});

test('family never gets what rules hide, even if the model offers it', async () => {
  const out = await srv.handleTranslate(POS, 'familia', client({ text: 'Le ayudaron a moverse' }));
  assert.strictEqual(out.text, null);
  assert.strictEqual(out.source, 'rules');
  const other = await srv.handleTranslate(OTHER, 'paciente', client({ text: 'La familia quiere hablar con el médico' }));
  assert.strictEqual(other.text, null, 'free-text never goes to the model or the reader');
});

test('length cap, empty reply and model down fall back to rules', async () => {
  const long = await srv.handleTranslate(ROUND, 'paciente', client({ text: 'La enfermera pasó '.repeat(12) }));
  assert.strictEqual(long.source, 'rules');
  const empty = await srv.handleTranslate(ROUND, 'paciente', client({ text: '  ' }));
  assert.strictEqual(empty.source, 'rules');
  const down = await srv.handleTranslate(ROUND, 'paciente', client(new Error('down')));
  assert.strictEqual(down.source, 'rules');
  assert.strictEqual(down.text, 'La enfermera pasó a revisar');
});

test('POST /api/translate: 200 valid, 400 bad reader or kind', async () => {
  const server = srv.createServer(client({ text: 'La enfermera vino a ver cómo sigue' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const post = (body) => new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/translate', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let t = '';
      res.on('data', (c) => { t += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(t) }));
    });
    req.on('error', reject);
    req.end(data);
  });
  try {
    const okRes = await post({ event: ROUND, reader: 'paciente' });
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(okRes.body.text, 'La enfermera vino a ver cómo sigue');
    assert.strictEqual((await post({ event: ROUND, reader: 'enfermero' })).status, 400);
    assert.strictEqual((await post({ event: { kind: 'surgery', text: 'x' }, reader: 'paciente' })).status, 400);
    assert.strictEqual((await post({ event: { kind: 'round', text: 'a'.repeat(601) }, reader: 'paciente' })).status, 400);
  } finally {
    server.close();
  }
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log('ok - ' + name);
    } catch (error) {
      failed += 1;
      console.error('FAIL - ' + name + ': ' + error.message);
    }
  }
  console.log(failed === 0 ? 'translate: PASS (' + tests.length + ' tests)' : 'translate: ' + failed + ' FAILURES');
  process.exit(failed === 0 ? 0 : 1);
})();
