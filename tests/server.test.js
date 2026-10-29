'use strict';

// Backend tests: grounding, guardrails, provider fallback.
// Ollama is mocked via injected fetchImpl. Run: node tests/server.test.js

const assert = require('assert');
const ai = require('../server/ai');
const srv = require('../server/server');

const EVENTS = [
  { time: '08:00', text: 'Cambio postural decubito lateral hecho', done: true },
  { time: '11:05', text: 'Enoxaparina 40mg SC via abdominal aplicada', done: true },
  { time: '11:20', text: 'Cambio postural previsto', done: false },
  { time: '13:00', text: 'Ronda programada, control de signos', done: false },
  { time: '11:00', text: 'PA 90/55, taquicardia 112, alerta protocolo hipotension', done: false }
];

const FACTS = [
  'Tratamiento de la manana cumplido.',
  'El equipo esta con ella, sin novedad que reportar.',
  'Horario de visita: 15:00.',
  'La enfermera vuelve a la 1:00 p. m.'
];

// Mock fetch routing on URL path. modes: { tags, generate, failAt }
function makeFetchImpl(modes) {
  return async (url, options) => {
    if (modes.failAt === 'tags' && url.endsWith('/api/tags')) {
      throw new Error('connection refused');
    }
    if (modes.failAt === 'generate' && url.endsWith('/api/generate')) {
      throw new Error('connection refused');
    }
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: modes.tags }) };
    }
    if (url.endsWith('/api/generate')) {
      if (modes.invalidJson === true) {
        return { ok: true, json: async () => ({ response: 'not json{{' }) };
      }
      return { ok: true, json: async () => ({ response: JSON.stringify(modes.generate) }) };
    }
    throw new Error('unexpected url ' + url);
  };
}

function localClient(modes) {
  return ai.createClient({ baseUrl: 'http://mock', fetchImpl: makeFetchImpl(modes), timeoutMs: 1000 });
}

const LOCAL_TAGS = [
  { name: 'gemma4:31b-cloud', remote_host: 'https://ollama.com:443' },
  { name: 'huihui_ai/qwen3.5-abliterated:4b' }
];
const CLOUD_ONLY_TAGS = [
  { name: 'gemma4:31b-cloud', remote_host: 'https://ollama.com:443' }
];

const GOOD_DRAFT = {
  s: 'Turno: 2 de 5 eventos listos. Faltan 3: 11:20, 13:00, 11:00.',
  b: 'Aplicado: Enoxaparina 40mg SC via abdominal aplicada (11:05). Cambio postural hecho.',
  a: 'En revisión: PA 90/55, taquicardia 112, alerta protocolo hipotension. Quedan 3 por confirmar.',
  r: 'Completa lo pendiente y revalora signos en la ronda de las 13:00.'
};

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// --- model picking ---

test('never picks a non-gemma local model (it can freeze the PC)', () => {
  assert.strictEqual(ai.pickModel(LOCAL_TAGS), 'gemma4:31b-cloud');
  assert.strictEqual(ai.pickModel([{ name: 'huihui_ai/qwen3.5-abliterated:4b' }]), null);
});

test('cloud-tagged-only list is valid, first model is used', () => {
  assert.strictEqual(ai.pickModel(CLOUD_ONLY_TAGS), 'gemma4:31b-cloud');
});

test('empty model list returns null', () => {
  assert.strictEqual(ai.pickModel([]), null);
});

// --- rules handover ---

test('rules handover names the real vitals event in assessment', () => {
  const draft = srv.buildHandoverRules(EVENTS);
  assert.ok(draft.a.includes('PA 90/55'), draft.a);
});

test('rules handover is a valid grounded SBAR within 200 chars', () => {
  const draft = srv.buildHandoverRules(EVENTS);
  for (const key of ['s', 'b', 'a', 'r']) {
    assert.ok(draft[key].length > 0 && draft[key].length <= 200, key + ' length ' + draft[key].length);
    assert.ok(
      srv.isGrounded(draft[key], srv.eventSource(EVENTS), srv.handoverExtras(EVENTS)),
      key + ' ungrounded: ' + draft[key]
    );
  }
});

test('12h output time is grounded in 24h source time', () => {
  assert.ok(srv.isGrounded('Vuelve a la 1:00 p. m.', 'Ronda programada 13:00', []));
  assert.ok(srv.isGrounded('Visita 15:00.', 'Horario de visita: 3:00 p. m.', []));
});

// --- provider chain: handover ---

test('ollama up with valid draft returns ollama source', async () => {
  const out = await srv.handleHandover(EVENTS, localClient({ tags: LOCAL_TAGS, generate: GOOD_DRAFT }));
  assert.strictEqual(out.source, 'ollama');
  assert.strictEqual(out.model, 'gemma4:31b-cloud');
  assert.strictEqual(out.s, GOOD_DRAFT.s);
});

test('ollama down falls back to rules', async () => {
  const out = await srv.handleHandover(EVENTS, localClient({ tags: LOCAL_TAGS, failAt: 'generate' }));
  assert.strictEqual(out.source, 'rules');
  assert.deepStrictEqual(
    { s: out.s, b: out.b, a: out.a, r: out.r },
    srv.buildHandoverRules(EVENTS)
  );
});

test('tags down falls back to rules', async () => {
  const out = await srv.handleHandover(EVENTS, localClient({ tags: LOCAL_TAGS, failAt: 'tags' }));
  assert.strictEqual(out.source, 'rules');
});

test('invalid model JSON falls back to rules', async () => {
  const out = await srv.handleHandover(EVENTS, localClient({ tags: LOCAL_TAGS, invalidJson: true }));
  assert.strictEqual(out.source, 'rules');
});

test('fenced model JSON is accepted when grounded', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: LOCAL_TAGS }) };
    }
    return { ok: true, json: async () => ({ response: '```json\n' + JSON.stringify(GOOD_DRAFT) + '\n```' }) };
  };
  const client = ai.createClient({ baseUrl: 'http://mock', fetchImpl, timeoutMs: 1000 });
  const out = await srv.handleHandover(EVENTS, client);
  assert.strictEqual(out.source, 'ollama');
});

test('hallucinated number in model draft is rejected', async () => {
  const bad = { ...GOOD_DRAFT, a: 'En revisión: PA 70/40, taquicardia 150. Quedan 3 por confirmar.' };
  const out = await srv.handleHandover(EVENTS, localClient({ tags: LOCAL_TAGS, generate: bad }));
  assert.strictEqual(out.source, 'rules');
  assert.ok(!out.a.includes('70/40'));
});

test('hallucinated medication in model draft is rejected', async () => {
  const bad = { ...GOOD_DRAFT, b: 'Aplicado: Insulina 10mg SC (11:05). Cambio postural hecho.' };
  const out = await srv.handleHandover(EVENTS, localClient({ tags: LOCAL_TAGS, generate: bad }));
  assert.strictEqual(out.source, 'rules');
});

test('cloud-tagged-only machine still uses ollama', async () => {
  const out = await srv.handleHandover(EVENTS, localClient({ tags: CLOUD_ONLY_TAGS, generate: GOOD_DRAFT }));
  assert.strictEqual(out.source, 'ollama');
  assert.strictEqual(out.model, 'gemma4:31b-cloud');
});

test('oversize model field is rejected', async () => {
  const bad = { ...GOOD_DRAFT, s: 'x'.repeat(201) };
  const out = await srv.handleHandover(EVENTS, localClient({ tags: LOCAL_TAGS, generate: bad }));
  assert.strictEqual(out.source, 'rules');
});

// --- privacy ---

test('handover payload carries no names', () => {
  const withNames = EVENTS.concat([
    { time: '10:00', text: 'Maria Gonzalez acepta el tratamiento', done: true }
  ]);
  const payload = JSON.stringify(srv.buildHandoverPayload(withNames));
  assert.ok(!payload.includes('Maria'), 'name leaked: ' + payload);
  assert.ok(!payload.includes('Gonzalez'), 'surname leaked: ' + payload);
});

// --- family Q&A ---

test('keyword fallback answers the night question from facts', async () => {
  srv.resetNurseQuestions();
  const out = await srv.handleAsk('¿Cómo pasó la noche?', FACTS, null);
  assert.strictEqual(out.source, 'rules');
  assert.strictEqual(out.createdQuestion, false);
  assert.ok(out.answer.length <= 220);
  assert.deepStrictEqual(srv.listNurseQuestions(), []);
});

test('diagnosis question is refused and creates a nurse question', async () => {
  srv.resetNurseQuestions();
  const out = await srv.handleAsk('¿Cuál es el diagnóstico?', FACTS, null);
  assert.strictEqual(out.answer, srv.SAFE_MESSAGE);
  assert.strictEqual(out.createdQuestion, true);
  const items = srv.listNurseQuestions();
  assert.strictEqual(items.length, 1);
  assert.ok(items[0].question.includes('diagnóstico'));
});

test('dose and medication-advice questions are refused', async () => {
  for (const q of ['¿Qué dosis le dieron?', '¿Qué medicamento le doy en casa?', '¿Cuál es el pronóstico?']) {
    srv.resetNurseQuestions();
    const out = await srv.handleAsk(q, FACTS, null);
    assert.strictEqual(out.answer, srv.SAFE_MESSAGE, q);
    assert.strictEqual(srv.listNurseQuestions().length, 1, q);
  }
});

test('unknown topic falls back to safe message plus nurse question', async () => {
  srv.resetNurseQuestions();
  const out = await srv.handleAsk('¿A qué hora es la cirugía?', FACTS, null);
  assert.strictEqual(out.answer, srv.SAFE_MESSAGE);
  assert.strictEqual(srv.listNurseQuestions().length, 1);
});

test('ollama answer grounded in facts is used', async () => {
  srv.resetNurseQuestions();
  const out = await srv.handleAsk(
    '¿La acompañan en este momento?',
    FACTS,
    localClient({ tags: LOCAL_TAGS, generate: { answer: 'El equipo esta con ella, sin novedad.' } })
  );
  assert.strictEqual(out.source, 'ollama');
  assert.strictEqual(out.createdQuestion, false);
});

test('ollama advising answer is discarded', async () => {
  srv.resetNurseQuestions();
  const out = await srv.handleAsk(
    '¿La acompañan en este momento?',
    FACTS,
    localClient({ tags: LOCAL_TAGS, generate: { answer: 'Dele 40mg de Enoxaparina en casa.' } })
  );
  assert.strictEqual(out.answer, srv.SAFE_MESSAGE);
  assert.strictEqual(srv.listNurseQuestions().length, 1);
});

test('ollama refuse flag creates a nurse question', async () => {
  srv.resetNurseQuestions();
  const out = await srv.handleAsk(
    '¿Algo que no cubren las reglas?',
    FACTS,
    localClient({ tags: LOCAL_TAGS, generate: { refuse: true } })
  );
  assert.strictEqual(out.answer, srv.SAFE_MESSAGE);
  assert.strictEqual(out.createdQuestion, true);
});

// --- HTTP layer ---

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = require('http').request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      }
    );
    req.on('error', reject);
    req.end(data);
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    require('http').get({ host: '127.0.0.1', port, path }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on('error', reject);
  });
}

test('http: health, handover dryRun, ask flow, questions resolve', async () => {
  srv.resetNurseQuestions();
  const server = srv.createServer(localClient({ tags: LOCAL_TAGS, generate: GOOD_DRAFT }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const health = await get(port, '/api/health');
    assert.strictEqual(health.body.ok, true);
    assert.strictEqual(health.body.ollama.model, 'gemma4:31b-cloud');

    const dry = await post(port, '/api/handover', { events: EVENTS, dryRun: true });
    assert.ok(dry.body.payload && dry.body.payload.counts.total === 5);
    assert.ok(!JSON.stringify(dry.body.payload).includes('Gonzalez'));

    const hand = await post(port, '/api/handover', { events: EVENTS });
    assert.strictEqual(hand.body.source, 'ollama');

    const ask = await post(port, '/api/ask', { question: '¿Cuál es el pronóstico?', facts: FACTS });
    assert.strictEqual(ask.body.answer, srv.SAFE_MESSAGE);

    const list = await get(port, '/api/questions');
    assert.strictEqual(list.body.items.length, 1);

    const done = await post(port, '/api/questions/resolve', { id: list.body.items[0].id });
    assert.strictEqual(done.body.ok, true);
    const empty = await get(port, '/api/questions');
    assert.deepStrictEqual(empty.body.items, []);
  } finally {
    server.close();
  }
});

// --- SBAR truthfulness (real gemma output, 2026-10-29) ---

const REAL_EVENTS = [
  { time: '08:00', text: 'Cambio postural de la mañana hecho', done: true },
  { time: '11:05', text: 'Enoxaparina 40mg SC, vía abdominal aplicada', done: true },
  { time: '13:00', text: 'Ronda programada, control de signos', done: false },
  { time: '11:00', text: 'PA 90/55, taquicardia 112, alerta protocolo hipotensión', done: false }
];

test('payload carries the pending tasks and the open alert, not just times', () => {
  const payload = srv.buildHandoverPayload(REAL_EVENTS);
  assert(JSON.stringify(payload.pending).includes('Ronda programada'), 'pending task text is sent');
  assert(payload.alerts.length === 1 && payload.alerts[0].includes('90/55'), 'open alert is sent first-class');
});

test('draft claiming a pending task was done falls back to rules', async () => {
  const bad = {
    s: 'Tienes 4 tareas en total: 2 ya están hechas y 2 quedan pendientes.',
    b: 'Se realizó cambio postural a las 08:00 y se aplicó Enoxaparina 40mg SC en abdomen a las 11:05.',
    a: 'Se cumplió la ronda programada y el control de signos.',
    r: 'Tu pendiente es gestionar las tareas de las 11:00 y las 13:00.'
  };
  const out = await srv.handleHandover(REAL_EVENTS, localClient({ tags: LOCAL_TAGS, generate: bad }));
  assert.strictEqual(out.source, 'rules', 'false "se cumplió la ronda" must be rejected');
});

test('draft that omits the open alert falls back to rules', async () => {
  const silent = {
    s: 'Tienes 4 tareas: 2 hechas y 2 pendientes.',
    b: 'Cambio postural a las 08:00 y Enoxaparina 40mg SC a las 11:05.',
    a: 'Paciente sin novedad.',
    r: 'Haz la ronda de las 13:00.'
  };
  const out = await srv.handleHandover(REAL_EVENTS, localClient({ tags: LOCAL_TAGS, generate: silent }));
  assert.strictEqual(out.source, 'rules', 'assessment must name the 90/55 alert');
});

test('truthful draft with the alert is accepted', async () => {
  const good = {
    s: 'Tienes 4 tareas: 2 hechas y 2 pendientes.',
    b: 'Cambio postural a las 08:00 y Enoxaparina 40mg SC a las 11:05.',
    a: 'Alerta abierta: PA 90/55 y taquicardia 112, protocolo de hipotensión pendiente.',
    r: 'Revalora signos ya y haz la ronda de las 13:00.'
  };
  const out = await srv.handleHandover(REAL_EVENTS, localClient({ tags: LOCAL_TAGS, generate: good }));
  assert.strictEqual(out.source, 'ollama');
});

// --- Ollama cloud API key ---

test('api key: Bearer header sent to ollama.com, never without a key', async () => {
  const seen = [];
  const spy = async (url, options) => { seen.push({ url, headers: options.headers }); return { ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) }; };
  await ai.listModels(ai.createClient({ apiKey: 'test-key-123', fetchImpl: spy }));
  assert.strictEqual(seen[0].url, 'https://ollama.com/api/tags', 'a key without OLLAMA_URL targets the cloud API');
  assert.strictEqual(seen[0].headers.Authorization, 'Bearer test-key-123');
  await ai.listModels(ai.createClient({ apiKey: '', baseUrl: 'http://mock', fetchImpl: spy }));
  assert.strictEqual(seen[1].headers.Authorization, undefined, 'no key, no header');
});

test('api key: read from a private file outside the repo, loose permissions refused', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acompana-key-'));
  const file = path.join(dir, 'ollama-key');
  fs.writeFileSync(file, 'file-key-456\n', { mode: 0o600 });
  assert.strictEqual(ai.readKeyFile(file), 'file-key-456');
  fs.chmodSync(file, 0o644);
  assert.strictEqual(ai.readKeyFile(file), null, 'group/other readable key file is ignored');
  assert.strictEqual(ai.readKeyFile(path.join(dir, 'missing')), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('model: gemma4:31b preferred over other gemma sizes', () => {
  const saved = process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_MODEL;
  assert.strictEqual(ai.pickModel([{ name: 'gemma4:e2b' }, { name: 'gemma4:31b' }, { name: 'glm-5.3' }]), 'gemma4:31b');
  if (saved !== undefined) process.env.OLLAMA_MODEL = saved;
});

test('health never exposes the key', async () => {
  const spy = async () => ({ ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) });
  const server = srv.createServer(ai.createClient({ apiKey: 'secret-key-789', fetchImpl: spy }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const body = await new Promise((resolve, reject) => {
      require('http').get({ host: '127.0.0.1', port: server.address().port, path: '/api/health' }, (res) => {
        let text = '';
        res.on('data', (c) => { text += c; });
        res.on('end', () => resolve(text));
      }).on('error', reject);
    });
    assert(!body.includes('secret-key-789'), 'key leaked in /api/health');
    assert(body.includes('gemma4:31b'));
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
      console.error('FAIL - ' + name);
      console.error(error.stack || error);
    }
  }
  console.log(failed === 0 ? 'server: PASS (' + tests.length + ' tests)' : 'server: ' + failed + ' FAILURES');
  process.exit(failed === 0 ? 0 : 1);
})();
