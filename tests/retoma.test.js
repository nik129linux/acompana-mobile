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
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch (_) {} resolve({ status: res.statusCode, json }); });
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
      assert.deepStrictEqual(r.json, { ok: true, text: 'You were in Document; next, fix the citation in paragraph 3.', source: 'Retoma server · gemma4:31b', fallback: false });
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
      assert.deepStrictEqual(r.json, { ok: true, start: '9:00', minutes: 40, reason: 'Your longest block was in Document.', source: 'Retoma server · gemma4:31b', fallback: false });
      assert.strictEqual((await request(server, '/api/retoma/propose', { summary: { perApp: 'x' } })).status, 400);
    });
    await test('judging or third-person model output -> fallback, never forwarded', async () => {
      server.close();
      server = await listen(loadServer(), client({ line: 'In Document, the user was distracted.' }, []));
      const r = await request(server, '/api/retoma/resume-line', { ctx: CTX, lang: 'en' });
      assert.deepStrictEqual(r.json, { ok: true, fallback: true });
    });
    await test('model down -> fallback, 200', async () => {
      server.close();
      server = await listen(loadServer(), client(new Error('ECONNREFUSED'), []));
      const r = await request(server, '/api/retoma/propose', { summary: SUMMARY });
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual(r.json, { ok: true, fallback: true });
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
      assert.deepStrictEqual(out[3], { ok: true, fallback: true });
    } finally { s.close(); delete process.env.AI_DAILY_LIMIT; }
  });
  await test('both routes are rate limited per IP', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
    const m = /const AI_RATE_PATHS = \[([^\]]*)\]/.exec(src);
    assert.ok(m && /\/api\/retoma\/resume-line/.test(m[1]) && /\/api\/retoma\/propose/.test(m[1]), 'routes in AI_RATE_PATHS');
  });
  await test('server/retoma.js never writes notes anywhere', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'retoma.js'), 'utf8');
    assert.ok(!/writeFile|appendFile|console\.log\([^)]*note/.test(src), 'no storage or logging of notes');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
