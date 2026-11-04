'use strict';

// The server speaks the reader's language: English requests get English rules,
// English model prompts, and the same guardrails as Spanish.
// Run: node tests/english.test.js

const assert = require('assert');
const http = require('http');
const ai = require('../server/ai');
const srv = require('../server/server');

function client(reply, prompts) {
  return ai.createClient({
    baseUrl: 'http://mock',
    apiKey: '',
    timeoutMs: 1000,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) };
      if (prompts) prompts.push(JSON.parse(options.body).prompt);
      return { ok: true, json: async () => ({ response: JSON.stringify(reply) }) };
    }
  });
}

const EVENTS = [
  { time: '08:00', text: 'Morning position change done', done: true },
  { time: '11:05', text: 'Enoxaparin 40mg SC, abdominal, given', done: true },
  { time: '11:20', text: 'Position change planned', done: false },
  { time: '13:00', text: 'Round scheduled, vital signs check', done: false },
  { time: '11:00', text: 'BP 90/55, tachycardia 112, hypotension protocol alert', done: false }
];
const FACTS = [
  'Morning treatment done.',
  'The team is with her, nothing new to report.',
  "Today's visiting hours: 3:00 to 5:00 PM",
  'The nurse comes back at 1:00 PM.'
];
const MED = { kind: 'medication', text: 'Enoxaparin 40mg SC, abdominal, given' };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('guardrails refuse English questions about prognosis, doses and advice', () => {
  ['Will she get better?', 'What dose should I give?', 'How long will she live?', 'Is it cancer?', 'What medicine is she on?'].forEach((q) => {
    assert.ok(srv.isRefusal(q), q);
  });
  assert.ok(!srv.isRefusal('When can I visit?'));
});

test('advice filter catches English model output', () => {
  assert.ok(srv.containsAdvice('Her diagnosis is stable.'));
  assert.ok(srv.containsAdvice('She should take 500 mg.'));
  assert.ok(!srv.containsAdvice('The team is with her.'));
});

test('refused question answers in English and still files a nurse question', async () => {
  srv.resetNurseQuestions();
  const out = await srv.handleAsk('Will she get better?', FACTS, null, 'en');
  assert.ok(/ask|nurse/i.test(out.answer) && !/enfermera/i.test(out.answer), out.answer);
  assert.strictEqual(out.createdQuestion, true);
  assert.strictEqual(srv.listNurseQuestions().length, 1);
});

test('keyword rules answer English questions from English facts', async () => {
  const visit = await srv.handleAsk('When can I visit?', FACTS, null, 'en');
  assert.ok(visit.answer.includes('3:00'), visit.answer);
  const nurse = await srv.handleAsk('When does the nurse come back?', FACTS, null, 'en');
  assert.ok(nurse.answer.includes('1:00'), nurse.answer);
});

test('ask prompt asks for English; a grounded answer passes', async () => {
  const prompts = [];
  const out = await srv.handleAsk('How is she?', FACTS, client({ answer: 'The team is with her, nothing new to report.' }, prompts), 'en');
  assert.strictEqual(out.source, 'ollama');
  assert.ok(/plain English/i.test(prompts[0]), prompts[0].slice(0, 120));
  assert.ok(!/Colombian Spanish/.test(prompts[0]));
});

test('Spanish stays the default for ask, translate and handover prompts', async () => {
  const prompts = [];
  await srv.handleAsk('¿Cómo está?', ['El equipo está con ella.'], client({ answer: 'El equipo está con ella.' }, prompts));
  await srv.handleTranslate({ kind: 'round', text: 'Ronda' }, 'paciente', client({ text: 'La enfermera pasó.' }, prompts));
  prompts.forEach((prompt) => assert.ok(/Spanish/.test(prompt), prompt.slice(0, 100)));
});

test('rules handover in English', () => {
  const draft = srv.buildHandoverRules(EVENTS, 'en');
  assert.ok(draft.s.startsWith('Shift: 2 of 5'), draft.s);
  assert.ok(/Enoxaparin 40mg/.test(draft.b), draft.b);
  assert.ok(/BP 90\/55/.test(draft.a), draft.a);
  assert.ok(/13:00/.test(draft.r), draft.r);
  Object.values(draft).forEach((line) => assert.ok(!/Turno|Faltan|Aplicado|Quedan|Completa/.test(line), line));
});

test('English handover keeps the alert and the pending-task checks', async () => {
  const skipsAlert = { s: 'Shift: 2 of 5 done.', b: 'Enoxaparin 40mg given.', a: 'All calm.', r: 'Carry on.' };
  assert.strictEqual((await srv.handleHandover(EVENTS, client(skipsAlert), 'en')).source, 'rules');
  const claimsDone = { s: 'Shift: 2 of 5 done.', b: 'Enoxaparin 40mg given.', a: 'BP 90/55, tachycardia 112.', r: 'The vital signs check was done.' };
  assert.strictEqual((await srv.handleHandover(EVENTS, client(claimsDone), 'en')).source, 'rules');
  const honest = { s: 'You take over with 2 of 5 done.', b: 'Enoxaparin 40mg given at 11:05.', a: 'Open alert: BP 90/55, tachycardia 112.', r: 'Finish the round at 13:00.' };
  const prompts = [];
  assert.strictEqual((await srv.handleHandover(EVENTS, client(honest, prompts), 'en')).source, 'ollama');
  assert.ok(/plain English/i.test(prompts[0]));
});

test('translation rules and guards in English', async () => {
  assert.strictEqual(srv.translateRules(MED, 'paciente', 'en').text, 'You were given your medication');
  assert.strictEqual(srv.translateRules(MED, 'familia', 'en').text, 'Treatment done');
  assert.strictEqual(srv.translateRules({ kind: 'position', text: 'x' }, 'familia', 'en').text, null);
  const leaks = ['You got it in your arm.', 'Your enoxaparin was given.', 'You got 40 mg.', 'It was given into a vein.'];
  for (const text of leaks) {
    const out = await srv.handleTranslate(MED, 'paciente', client({ text }), 'en');
    assert.strictEqual(out.source, 'rules', text);
  }
  const prompts = [];
  const safe = await srv.handleTranslate(MED, 'paciente', client({ text: 'You had your medication.' }, prompts), 'en');
  assert.strictEqual(safe.source, 'ollama');
  assert.ok(/plain English/i.test(prompts[0]));
});

test('dictation classifies English and asks the model in English', async () => {
  assert.strictEqual(srv.classifyEventRules('gave enoxaparin 40 mg').kind, 'medication');
  assert.strictEqual(srv.classifyEventRules('repositioned to the left side').kind, 'position');
  assert.strictEqual(srv.classifyEventRules('did the round, vitals fine').kind, 'round');
  const prompts = [];
  await srv.handleEvent('gave enoxaparin 40 mg', client({ kind: 'medication', text: 'Enoxaparin 40 mg given' }, prompts), 'en');
  assert.ok(/English/.test(prompts[0]) && !/español/.test(prompts[0]), prompts[0]);
});

test('the HTTP layer passes lang through', async () => {
  const server = srv.createServer(null);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const post = (url, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method: 'POST' }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve(JSON.parse(text)));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
  try {
    assert.ok((await post('/api/handover', { events: EVENTS, lang: 'en' })).s.startsWith('Shift'));
    assert.ok(!/enfermera/.test((await post('/api/ask', { question: 'Is it cancer?', facts: FACTS, lang: 'en' })).answer));
    assert.strictEqual((await post('/api/translate', { event: MED, reader: 'familia', lang: 'en' })).text, 'Treatment done');
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
  console.log(failed === 0 ? 'english: PASS (' + tests.length + ' tests)' : 'english: ' + failed + ' FAILURES');
  process.exit(failed === 0 ? 0 : 1);
})();
