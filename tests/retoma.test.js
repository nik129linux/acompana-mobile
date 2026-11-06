'use strict';

// Retoma (desktop app) routes on the Acompaña server: gemma for the resume line and the
// focus proposal, so the Windows .exe has AI without a local Ollama.
// Contract (server/retoma.js + two routes in server/server.js):
//   POST /api/retoma/resume-line  { ctx: { app, title, note, awayMinutes }, lang }
//     -> 200 { ok: true, text, source: 'Retoma server · <model>', fallback: false }
//     -> 200 { ok: true, fallback: true }  when the model is down, over budget or its line fails validation
//   POST /api/retoma/propose      { summary: { perApp: {app: minutes}, longest: {app, minutes},
//                                              firstInterruption: {app, at} }, lang }
//     -> 200 { ok: true, start: 'H:MM', minutes, reason, source, fallback: false } | { ok: true, fallback: true }
//   Both: 400 { ok: false, error } for bad bodies; inside AI_RATE_PATHS (per-IP rate limit) and every model
//   call goes through the shared daily budget (generateWithinBudget). Nothing is stored or logged.
//   Input caps: app 60, title 120, note 200 chars (clipped, not rejected); at most 20 apps in perApp.
//   Validation (server side, the desktop trusts it): resume line 8-140 chars, one line, names the app
//   (case-insensitive), second person (never "the user"/"el usuario"), no judging words
//   (productiv|distract|score|lazy|wasted|productividad|distraíd|puntaje|perezos); proposal start H:MM,
//   minutes integer 15-180, reason 1-140 chars and no judging words.
//   lang 'es' asks gemma for Spanish ("Estabas en ..."), anything else English.
//   POST /api/retoma/habits { metrics, lang } -> { ok, note, experiment, source, fallback, quotaLeft, quotaLimit }
//   POST /api/retoma/ask    { metrics, question, lang } -> { ok, answer, source, fallback, quotaLeft, quotaLimit }
//   Both clip the question to 200 chars and drop anything but the cleanMetrics whitelist.
//   Every AI_RATE_PATHS response carries X-Quota-Left / X-Quota-Limit (and an expose header);
//   the daily per-IP cap answers 429 { quotaLeft: 0 }.
// Run: node tests/retoma.test.js

const assert = require('assert');
const http = require('http');
const path = require('path');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log('  ok ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}

function loadServer() {
  delete require.cache[require.resolve('../server/server')];
  return require('../server/server');
}
const ai = require('../server/ai');
const retoma = require('../server/retoma');

function client(reply, calls) {
  return ai.createClient({
    baseUrl: 'http://fake', apiKey: 'k', timeoutMs: 2000,
    fetchImpl: async (url, opts) => {
      if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'gemma4:31b' }] }) };
      calls.push(JSON.parse(opts.body));
      if (reply instanceof Error) throw reply;
      return { ok: true, json: async () => ({ response: typeof reply === 'string' ? reply : JSON.stringify(reply) }) };
    }
  });
}
async function listen(srv, c) {
  const server = srv.createServer(c);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}
function request(server, url, body, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) }, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch (_) {} resolve({ status: res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject);
    req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

const CTX = { app: 'Document', title: 'Informe de calidad', note: 'fix the citation in paragraph 3', awayMinutes: 25 };
const SUMMARY = { perApp: { Document: 40, WhatsApp: 18 }, longest: { app: 'Document', minutes: 40 }, firstInterruption: { app: 'WhatsApp', at: '9:40' } };

(async () => {
  console.log('retoma: module');
  await test('validResumeLine', () => {
    assert.strictEqual(retoma.validResumeLine('You were in Document; next, fix the citation.', 'Document'), true);
    assert.strictEqual(retoma.validResumeLine('Estabas en Document; sigue con la cita.', 'Document'), true);
    ['In Document, the user worked on it.', 'El usuario estaba en Document.', 'You were distracted in Document.',
      'You were writing a thesis.', 'Doc', 'You were in Document.\nNext.', 'You were in Document ' + 'and '.repeat(40), 42
    ].forEach((bad) => assert.strictEqual(retoma.validResumeLine(bad, 'Document'), false, 'should reject ' + JSON.stringify(bad)));
  });
  await test('validProposal', () => {
    assert.strictEqual(retoma.validProposal({ start: '9:40', minutes: 40, reason: 'Your longest block was in Document.' }), true);
    assert.strictEqual(retoma.validProposal({ start: '25:00', minutes: 40, reason: 'x' }), false);
    assert.strictEqual(retoma.validProposal({ start: '9:40', minutes: 5, reason: 'x' }), false);
    assert.strictEqual(retoma.validProposal({ start: '9:40', minutes: 40, reason: 'Avoid the WhatsApp distraction.' }), false);
  });
  await test('cleanCtx clips, never throws', () => {
    const c = retoma.cleanCtx({ app: 'a'.repeat(100), title: 't'.repeat(300), note: 'n'.repeat(500), awayMinutes: '7' });
    assert.ok(c.app.length <= 60 && c.title.length <= 120 && c.note.length <= 200);
    assert.strictEqual(retoma.cleanCtx(null), null);
    assert.strictEqual(retoma.cleanCtx({ app: '' }), null, 'app is required');
  });

  console.log('retoma: routes');
  let srv = loadServer();
  let calls = [];
  let server = await listen(srv, client({ line: 'You were in Document; next, fix the citation in paragraph 3.' }, calls));
  try {
    await test('resume-line: model line comes back with the server label', async () => {
      const r = await request(server, '/api/retoma/resume-line', { ctx: CTX, lang: 'en' });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.json, { ok: true, text: 'You were in Document; next, fix the citation in paragraph 3.', source: 'Retoma server · gemma4:31b', fallback: false, quotaLeft: 49, quotaLimit: 50 });
      const prompt = calls[calls.length - 1].prompt;
      assert.ok(/fix the citation in paragraph 3/.test(prompt) && /Document/.test(prompt), 'note and app reach the prompt');
      assert.ok(/second person|"you"/i.test(prompt), 'asks for second person');
    });
    await test('resume-line: lang es asks for Spanish', async () => {
      await request(server, '/api/retoma/resume-line', { ctx: CTX, lang: 'es' });
      assert.ok(/Spanish|español/i.test(calls[calls.length - 1].prompt));
    });
    await test('resume-line: bad bodies are 400', async () => {
      assert.strictEqual((await request(server, '/api/retoma/resume-line', '{nope')).status, 400);
      assert.strictEqual((await request(server, '/api/retoma/resume-line', { ctx: { app: '' } })).status, 400);
      assert.strictEqual((await request(server, '/api/retoma/resume-line', {})).status, 400);
    });
    await test('propose: valid proposal with the server label', async () => {
      server.close();
      calls = [];
      server = await listen(loadServer(), client({ start: '9:00', minutes: 40, reason: 'Your longest block was in Document.' }, calls));
      const r = await request(server, '/api/retoma/propose', { summary: SUMMARY, lang: 'en' });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.json, { ok: true, start: '9:00', minutes: 40, reason: 'Your longest block was in Document.', source: 'Retoma server · gemma4:31b', fallback: false, quotaLeft: 49, quotaLimit: 50 });
      assert.strictEqual((await request(server, '/api/retoma/propose', { summary: { perApp: 'x' } })).status, 400);
    });
    await test('judging or third-person model output -> fallback, never forwarded', async () => {
      server.close();
      server = await listen(loadServer(), client({ line: 'In Document, the user was distracted.' }, []));
      const r = await request(server, '/api/retoma/resume-line', { ctx: CTX, lang: 'en' });
      assert.deepStrictEqual(r.json, { ok: true, fallback: true, quotaLeft: 49, quotaLimit: 50 });
    });
    await test('model down -> fallback, 200', async () => {
      server.close();
      server = await listen(loadServer(), client(new Error('ECONNREFUSED'), []));
      const r = await request(server, '/api/retoma/propose', { summary: SUMMARY });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.json, { ok: true, fallback: true, quotaLeft: 49, quotaLimit: 50 });
    });
  } finally { server.close(); }

  console.log('retoma: abuse limits');
  await test('both routes spend the shared daily budget', async () => {
    process.env.AI_DAILY_LIMIT = '2';
    const used = [];
    const s = await listen(loadServer(), client({ line: 'You were in Document; next, the citation.' }, used));
    try {
      const out = [];
      for (let i = 0; i < 4; i += 1) out.push((await request(s, '/api/retoma/resume-line', { ctx: CTX }, { 'X-Forwarded-For': '10.0.0.' + i })).json);
      assert.strictEqual(used.length, 2, 'only 2 model calls');
      assert.deepStrictEqual(out[3], { ok: true, fallback: true, quotaLeft: 49, quotaLimit: 50 });
    } finally { s.close(); delete process.env.AI_DAILY_LIMIT; }
  });
  await test('both routes are rate limited per IP', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
    const m = /const AI_RATE_PATHS = \[([^\]]*)\]/.exec(src);
    assert.ok(m && /\/api\/retoma\/resume-line/.test(m[1]) && /\/api\/retoma\/propose/.test(m[1]), 'routes in AI_RATE_PATHS');
    assert.ok(/\/api\/retoma\/habits/.test(m[1]) && /\/api\/retoma\/ask\b/.test(m[1]), 'habits and ask in AI_RATE_PATHS');
  });
  await test('server/retoma.js never writes notes anywhere', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'retoma.js'), 'utf8');
    assert.ok(!/writeFile|appendFile|console\.log\([^)]*note/.test(src), 'no storage or logging of notes');
  });

  console.log('retoma: habits + ask');
  const METRICS = {
    totalMinutes: 240, count: 12, perApp: { Document: 90, WhatsApp: 30 },
    longest: { app: 'Document', minutes: 45 }, median: 12, countLong: 3,
    switchesPerHour: 8, distractionMinutes: 30, distractionPct: 12.5,
    distractionShare: 0.13, topDistraction: 'WhatsApp', mostUsedApp: 'Document',
    firstAt: '8:10', lastAt: '12:30', lateNight: false, breakCount: 4,
    medianGap: 18, longestGap: 60,
    trend: { days: 7, current: 240, previous: 200, delta: 40, direction: 'up' },
    title: 'Secret thesis title', note: 'private exam note'
  };
  const HABIT = {
    note: 'Document held your longest stretch at 45 minutes; 12 blocks in all.',
    experiment: {
      text: 'After you open WhatsApp, I will return to Document for 25 min.',
      trigger: 'you open WhatsApp', action: 'return to Document',
      minutes: 25, metric: 'longest', target: 45, direction: 'atLeast'
    }
  };
  const ASK = { answer: 'Your longest block was 45 minutes in Document.' };

  await test('cleanMetrics keeps aggregates, drops titles and notes', () => {
    const m = retoma.cleanMetrics(METRICS);
    assert.strictEqual(m.totalMinutes, 240);
    assert.deepStrictEqual(m.perApp, { Document: 90, WhatsApp: 30 });
    assert.deepStrictEqual(m.longest, { app: 'Document', minutes: 45 });
    assert.strictEqual(m.firstAt, '8:10');
    assert.strictEqual(m.title, undefined, 'title dropped');
    assert.strictEqual(m.note, undefined, 'note dropped');
    assert.strictEqual(retoma.cleanMetrics(null), null);
    assert.strictEqual(retoma.cleanMetrics({}), null, 'perApp required');
    assert.strictEqual(retoma.cleanMetrics({ perApp: {} }), null, 'perApp must not be empty');
    const clipped = retoma.cleanMetrics({ perApp: { ['x'.repeat(90)]: 5, Bad: -1 } });
    assert.ok(Object.keys(clipped.perApp)[0].length <= 60, 'app names clipped to 60');
    assert.ok(!('Bad' in clipped.perApp), 'negative minutes dropped');
  });

  await test('habits: valid note and experiment come back with the server label', async () => {
    calls = [];
    const s = await listen(loadServer(), client(HABIT, calls));
    try {
      const r = await request(s, '/api/retoma/habits', { metrics: METRICS, lang: 'en' });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.json, {
        ok: true, note: HABIT.note, experiment: HABIT.experiment,
        source: 'Retoma server · gemma4:31b', fallback: false, quotaLeft: 49, quotaLimit: 50
      });
      const prompt = calls[calls.length - 1].prompt;
      assert.ok(/habit coach/i.test(prompt), 'habits prompt');
      assert.ok(/Document/.test(prompt) && /WhatsApp/.test(prompt), 'aggregates reach the prompt');
      assert.ok(!/Secret thesis title|private exam note/.test(prompt), 'titles and notes never reach the prompt');
      assert.ok(!/"title"/.test(prompt), 'no title key in the prompt');
    } finally { s.close(); }
  });
  await test('habits: lang es asks for Spanish', async () => {
    calls = [];
    const s = await listen(loadServer(), client(HABIT, calls));
    try {
      await request(s, '/api/retoma/habits', { metrics: METRICS, lang: 'es' });
      assert.ok(/Reply in Spanish \(español\)/.test(calls[calls.length - 1].prompt));
    } finally { s.close(); }
  });
  await test('habits: lazy or third-person output -> fallback', async () => {
    const bads = [
      { note: 'You were lazy today.', experiment: HABIT.experiment },
      { note: 'The user kept 12 blocks.', experiment: HABIT.experiment },
      { note: 'You kept 12 blocks.', experiment: Object.assign({}, HABIT.experiment, { minutes: 3 }) },
      { note: 'You kept 12 blocks.', experiment: Object.assign({}, HABIT.experiment, { text: 'Open WhatsApp for 25 min.' }) }
    ];
    for (const bad of bads) {
      const s = await listen(loadServer(), client(bad, []));
      try {
        const r = await request(s, '/api/retoma/habits', { metrics: METRICS });
        assert.strictEqual(r.status, 200);
        assert.deepStrictEqual(r.json, { ok: true, fallback: true, quotaLeft: 49, quotaLimit: 50 }, JSON.stringify(bad));
      } finally { s.close(); }
    }
  });
  await test('ask: valid answer with the server label', async () => {
    calls = [];
    const s = await listen(loadServer(), client(ASK, calls));
    try {
      const r = await request(s, '/api/retoma/ask', { metrics: METRICS, question: 'Which app did I use most?', lang: 'en' });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.json, {
        ok: true, answer: ASK.answer, source: 'Retoma server · gemma4:31b', fallback: false, quotaLeft: 49, quotaLimit: 50
      });
      assert.ok(/Which app did I use most\?/.test(calls[calls.length - 1].prompt), 'question reaches the prompt');
    } finally { s.close(); }
  });
  await test('ask: a 500-char question is clipped to 200, never rejected', async () => {
    calls = [];
    const s = await listen(loadServer(), client(ASK, calls));
    try {
      const r = await request(s, '/api/retoma/ask', { metrics: METRICS, question: 'q'.repeat(500) });
      assert.strictEqual(r.status, 200);
      const prompt = calls[calls.length - 1].prompt;
      assert.ok(prompt.includes('q'.repeat(200)), 'first 200 chars reach the prompt');
      assert.ok(!prompt.includes('q'.repeat(201)), 'at most 200 chars of the question');
    } finally { s.close(); }
  });
  await test('habits/ask: bad bodies are 400 with quota headers', async () => {
    const s = await listen(loadServer(), client(HABIT, []));
    try {
      const bads = [
        ['/api/retoma/habits', {}],
        ['/api/retoma/habits', { metrics: null }],
        ['/api/retoma/habits', { metrics: {} }],
        ['/api/retoma/habits', { metrics: { perApp: {} } }],
        ['/api/retoma/habits', { metrics: { perApp: 'x' } }],
        ['/api/retoma/ask', { question: 'hi' }],
        ['/api/retoma/ask', { metrics: METRICS }],
        ['/api/retoma/ask', { metrics: METRICS, question: '   ' }]
      ];
      for (const pair of bads) {
        const r = await request(s, pair[0], pair[1]);
        assert.strictEqual(r.status, 400, pair[0] + ' ' + JSON.stringify(pair[1]));
        assert.deepStrictEqual(r.json, { ok: false, error: 'bad request' });
        assert.strictEqual(r.headers['x-quota-limit'], '50', 'quota limit header on 400');
        assert.ok(/^\d+$/.test(r.headers['x-quota-left'] || ''), 'quota left header on 400');
        assert.strictEqual(r.headers['access-control-expose-headers'], 'X-Quota-Left, X-Quota-Limit');
      }
    } finally { s.close(); }
  });

  console.log('retoma: quota');
  await test('quota: X-Quota-Left counts down per IP, 429 at zero', async () => {
    process.env.AI_DAILY_PER_IP = '3';
    const ip = { 'X-Forwarded-For': '10.9.9.9' };
    const s = await listen(loadServer(), client({ line: 'You were in Document; next, fix the citation.' }, []));
    try {
      const left = [];
      for (let i = 0; i < 3; i += 1) {
        const r = await request(s, '/api/retoma/resume-line', { ctx: CTX }, ip);
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.headers['x-quota-limit'], '3');
        assert.strictEqual(r.headers['access-control-expose-headers'], 'X-Quota-Left, X-Quota-Limit');
        left.push(r.headers['x-quota-left']);
        assert.strictEqual(r.json.quotaLeft, Number(r.headers['x-quota-left']), 'body matches header');
        assert.strictEqual(r.json.quotaLimit, 3);
      }
      assert.deepStrictEqual(left, ['2', '1', '0']);
      const denied = await request(s, '/api/retoma/resume-line', { ctx: CTX }, ip);
      assert.strictEqual(denied.status, 429);
      assert.deepStrictEqual(denied.json, { ok: false, error: 'rate limited', quotaLeft: 0, quotaLimit: 3 });
      assert.strictEqual(denied.headers['x-quota-left'], '0');
    } finally { s.close(); delete process.env.AI_DAILY_PER_IP; }
  });
  await test('quota: a minute-limit 429 keeps the real daily count', async () => {
    process.env.AI_RATE_PER_MIN = '1';
    process.env.AI_DAILY_PER_IP = '5';
    const ip = { 'X-Forwarded-For': '10.9.9.8' };
    const s = await listen(loadServer(), client({ line: 'You were in Document; next, fix the citation.' }, []));
    try {
      const first = await request(s, '/api/retoma/resume-line', { ctx: CTX }, ip);
      assert.strictEqual(first.status, 200);
      assert.strictEqual(first.headers['x-quota-left'], '4');
      const second = await request(s, '/api/retoma/resume-line', { ctx: CTX }, ip);
      assert.strictEqual(second.status, 429);
      assert.strictEqual(second.headers['x-quota-left'], '4', 'minute block does not spend the day');
      assert.deepStrictEqual(second.json, { ok: false, error: 'rate limited', quotaLeft: 4, quotaLimit: 5 });
    } finally { s.close(); delete process.env.AI_RATE_PER_MIN; delete process.env.AI_DAILY_PER_IP; }
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
