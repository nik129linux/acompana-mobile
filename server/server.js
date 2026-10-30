'use strict';

// Zero-dependency HTTP backend for the nursing mobile prototype.
// Endpoints: GET /api/health, POST /api/handover, POST /api/ask,
// GET /api/questions, POST /api/questions/resolve.
// Provider chain everywhere: deterministic rules -> Ollama -> rules.
// Only aggregates (counts, times, clinical tokens) are ever sent to Ollama:
// no names, rooms, titles or free text. See buildHandoverPayload.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ai = require('./ai');

const PORT = 8787;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, '..');

// Static files allowed to be served from the repo root. Anything outside
// this set (server/, tests/, .git, *.md, path traversal) is 404.
const STATIC_ROOT_FILES = ['index.html', 'manifest.webmanifest', 'sw.js'];
const STATIC_DIRS = ['css', 'js', 'media', 'icons', 'fonts'];
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2'
};

function serveStatic(res, pathname) {
  var decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    decoded = pathname;
  }
  // Reject path traversal (encoded or raw).
  if (decoded.includes('..')) {
    sendJson(res, 404, { ok: false, error: 'not found' });
    return;
  }
  var rel = decoded.replace(/^\/+/, '');
  if (!rel) rel = 'index.html';
  var top = rel.split('/')[0];
  var allowed = STATIC_ROOT_FILES.includes(rel) || STATIC_DIRS.includes(top);
  if (!allowed) {
    sendJson(res, 404, { ok: false, error: 'not found' });
    return;
  }
  var filePath = path.join(ROOT, rel);
  // Belt-and-suspenders: resolved path must stay under ROOT.
  var resolved = path.resolve(filePath);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    sendJson(res, 404, { ok: false, error: 'not found' });
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    sendJson(res, 404, { ok: false, error: 'not found' });
    return;
  }
  var ext = path.extname(resolved).toLowerCase();
  var type = CONTENT_TYPES[ext] || 'application/octet-stream';
  var body = fs.readFileSync(resolved);
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
  res.end(body);
}
const MAX_BODY_BYTES = 256 * 1024;
const HANDOVER_MAX = 200;
const ASK_MAX = 220;

// Fixed reply for every hard guardrail refusal (diagnosis, prognosis,
// doses, medication advice, anything outside the visible events).
const SAFE_MESSAGE =
  'No puedo responder eso con la información del turno. Ya dejé su pregunta anotada para la enfermera.';

const MED_WORDS = [
  'enoxaparina', 'heparina', 'paracetamol', 'ibuprofeno', 'insulina',
  'morfina', 'tramadol', 'omeprazol', 'furosemida', 'losartan',
  'amoxicilina', 'ceftriaxona', 'dexametasona', 'ondansetron',
  'adrenalina', 'atropina', 'warfarina', 'aspirina', 'salino', 'suero',
  'oxígeno', 'oxigeno', 'medicamento'
];

const EVENT_KIND_ENUM = ['medication', 'position', 'round', 'other'];
const EVENT_KIND_KEYWORDS = {
  medication: ['enoxaparina', 'heparina', 'paracetamol', 'ibuprofeno', 'insulina', 'morfina', 'tramadol', 'omeprazol', 'furosemida', 'losartan', 'amoxicilina', 'ceftriaxona', 'dexametasona', 'ondansetron', 'adrenalina', 'atropina', 'warfarina', 'aspirina', 'salino', 'suero', 'oxígeno', 'oxigeno', 'medicamento', 'medicina', 'pastilla', 'inyección', 'aplic', 'mg', 'ml'],
  position: ['posición', 'posicion', 'postural', 'decúbito', 'decubito', 'lateral', 'cambio de posicion', 'cambio de posición', 'levantar', 'sentar', 'mover'],
  round: ['ronda', 'control', 'signos', 'vitales', 'revis', 'monitoreo']
};

function classifyEventRules(text) {
  const lower = String(text || '').toLowerCase();
  for (const kind of ['medication', 'position', 'round']) {
    for (const kw of EVENT_KIND_KEYWORDS[kind]) {
      if (lower.includes(kw)) {
        return { kind, text: clip(text, 140), source: 'rules' };
      }
    }
  }
  return { kind: 'other', text: clip(text, 140), source: 'rules' };
}

const EVENT_PROMPT =
  'Clasifica este evento de enfermería. Devuelve JSON {"kind":"medication|position|round|other","text":"texto breve en español neutro"}. ' +
  'Solo usa números, medicamentos y tiempos que aparezcan en el texto original. Nunca inventes valores. Texto: ';

function validEventDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  if (!EVENT_KIND_ENUM.includes(draft.kind)) return false;
  if (typeof draft.text !== 'string' || !draft.text.trim() || draft.text.length > 140) return false;
  return true;
}

async function handleEvent(text, ollamaClient) {
  const cleanText = String(text || '').trim();
  if (!cleanText || cleanText.length > 600) return classifyEventRules(cleanText || 'evento sin texto');
  const safeText = stripNames(cleanText);
  if (!ollamaClient) return classifyEventRules(safeText);
  try {
    const model = await ai.activeModel(ollamaClient);
    if (!model) return classifyEventRules(safeText);
    const draft = await ai.generateJson(ollamaClient, model, EVENT_PROMPT + JSON.stringify({ text: safeText }));
    if (!validEventDraft(draft)) return classifyEventRules(safeText);
    const ok = isGrounded(draft.text, safeText, []);
    if (!ok) return classifyEventRules(safeText);
    return { kind: draft.kind, text: clip(draft.text, 140), source: 'ollama', model };
  } catch (_) {
    return classifyEventRules(safeText);
  }
}
const UNIT_WORDS = ['mg', 'ml', 'mcg', 'g', 'ui', 'sc', 'iv', 'im', 'vo'];
const NUMBER_WORDS = {
  uno: '1', una: '1', un: '1', dos: '2', tres: '3', cuatro: '4',
  cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10'
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clip(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + '…';
}

// Defensive: drop anything shaped like a person name ("María González")
// before a string leaves this process toward the model.
function stripNames(text) {
  return String(text || '').replace(
    /[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+/g, ''
  ).replace(/\s+/g, ' ').trim();
}

function normToken(token) {
  return String(token).toLowerCase().replace(/[\s.]+/g, '');
}

// Canonical 24h key for a time expression, plus its 12h twin, so that
// "13:00" in the source grounds "1:00 p. m." in the output and vice versa.
function timeKeys(hour, minute, meridiem) {
  let h = Number(hour);
  const m = String(minute);
  if (meridiem) {
    const pm = meridiem.toLowerCase().startsWith('p');
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const h24 = String(h);
  const key24 = h24 + ':' + m;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const twin = h12 + ':' + m + (h < 12 ? 'am' : 'pm');
  return [normToken(key24), normToken(twin)];
}

function collectTimeKeys(text) {
  const keys = new Set();
  const source = String(text || '');
  let match;
  const withMeridiem = /(\d{1,2}):(\d{2})\s*([ap])\s*\.?\s*m\.?/gi;
  while ((match = withMeridiem.exec(source)) !== null) {
    timeKeys(match[1], match[2], match[3]).forEach((k) => keys.add(k));
  }
  const plain = source.replace(withMeridiem, ' ');
  const bare = /(\d{1,2}):(\d{2})/g;
  while ((match = bare.exec(plain)) !== null) {
    timeKeys(match[1], match[2], null).forEach((k) => keys.add(k));
  }
  return keys;
}

function withoutTimes(text) {
  return String(text || '')
    .replace(/(\d{1,2}):(\d{2})\s*([ap])\s*\.?\s*m\.?/gi, ' ')
    .replace(/(\d{1,2}):(\d{2})/g, ' ');
}

function digitTokens(text) {
  const found = withoutTimes(text).match(/\d[\w/:.-]*/g) || [];
  return found.map(normToken);
}

function splitParts(token) {
  return String(token).split(/[/:-]/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Grounding: every number/time/medication token in the output must appear
// in the source. extraDigits holds computed count strings ("3") that are
// derived from the event list itself, not cited from it.
// ---------------------------------------------------------------------------

function groundingSets(sourceText) {
  const source = String(sourceText || '');
  const lower = source.toLowerCase();
  return {
    digits: new Set(digitTokens(source).flatMap((t) => [t, ...splitParts(t)])),
    times: collectTimeKeys(source),
    meds: new Set(MED_WORDS.filter((w) => lower.includes(w))),
    units: new Set(
      UNIT_WORDS.filter((w) => new RegExp('\\b' + w + '\\b', 'i').test(source))
    )
  };
}

function isGrounded(output, sourceText, extraDigits) {
  const text = String(output || '');
  const sets = groundingSets(sourceText);
  const allowed = new Set([...sets.digits, ...(extraDigits || []).map(normToken)]);
  for (const token of digitTokens(text)) {
    if (allowed.has(token)) continue;
    // A compound token is grounded when every part is known.
    if (splitParts(token).every((p) => allowed.has(p))) continue;
    return false;
  }
  const outTimes = collectTimeKeys(text);
  for (const key of outTimes) {
    if (!sets.times.has(key)) return false;
  }
  const lower = text.toLowerCase();
  for (const word of MED_WORDS) {
    if (lower.includes(word) && !sets.meds.has(word)) return false;
  }
  for (const unit of UNIT_WORDS) {
    if (new RegExp('\\b' + unit + '\\b', 'i').test(text) && !sets.units.has(unit)) {
      return false;
    }
  }
  // Spanish number words count as numbers too.
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp('\\b' + word + '\\b', 'i').test(text)) {
      if (!allowed.has(digit)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Nurse handover (SBAR): deterministic rules fallback
// ---------------------------------------------------------------------------

function cleanEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((e) => e && typeof e.text === 'string' && e.text.trim())
    .slice(0, 50)
    .map((e) => ({
      time: typeof e.time === 'string' ? e.time : '',
      text: e.text.trim(),
      done: Boolean(e.done)
    }));
}

function eventSource(events) {
  return events.map((e) => (e.time ? e.time + ' ' : '') + e.text).join(' | ');
}

function handoverCounts(events) {
  const total = events.length;
  const done = events.filter((e) => e.done).length;
  return { total, done, pending: total - done };
}

function findVitals(list) {
  return list.find((e) => /\bPA\b|taquicardia|hipotensi|alerta|protocolo/i.test(e.text)) ||
    list.find((e) => /signos|vitales/i.test(e.text));
}

function buildHandoverRules(events) {
  const list = cleanEvents(events);
  const { total, done, pending } = handoverCounts(list);
  const pend = list.filter((e) => !e.done);
  const pendTimes = pend.map((e) => e.time || 'sin hora').join(', ');
  const vitals = findVitals(list);
  const med = list.find((e) => e.done && /mg\b|ml\b|medicamento|enoxaparina|aplic/i.test(e.text));
  const postureDone = list.some((e) => e.done && /postural|cambio de posici/i.test(e.text));
  const round = list.find((e) => /ronda/i.test(e.text));

  const situation = total === 0
    ? 'Turno sin eventos registrados todavía.'
    : 'Turno: ' + done + ' de ' + total + ' eventos listos.' +
      (pending > 0 ? ' Faltan ' + pending + ': ' + pendTimes + '.' : ' Nada pendiente.');
  const background = med
    ? 'Aplicado: ' + med.text + ' (' + (med.time || 'turno actual') + ').' +
      (postureDone ? ' Cambio postural hecho.' : '')
    : 'Sin medicación aplicada en el turno.' + (postureDone ? ' Cambio postural hecho.' : '');
  const assessment = vitals
    ? 'En revisión: ' + vitals.text + '.' + (pending > 0 ? ' Quedan ' + pending + ' por confirmar.' : '')
    : 'Sin alertas en lo registrado.' + (pending > 0 ? ' Quedan ' + pending + ' por confirmar.' : '');
  const recommendation = pending > 0
    ? (round
      ? 'Completa lo pendiente y revalora signos en la ronda de las ' + (round.time || 'próxima hora') + '.'
      : 'Completa lo pendiente y deja nota en el turno.')
    : 'Turno al día. Deja nota breve para el siguiente turno.';

  return {
    s: clip(situation, HANDOVER_MAX),
    b: clip(background, HANDOVER_MAX),
    a: clip(assessment, HANDOVER_MAX),
    r: clip(recommendation, HANDOVER_MAX)
  };
}

// Exact aggregate payload shown for consent and sent to Ollama.
// Names/rooms/titles never leave this function toward the model.
const ALERT_RE = /\bPA\b|taquicardia|hipotensi|alerta|protocolo/i;

function openAlerts(list) {
  return list.filter((e) => !e.done && ALERT_RE.test(e.text));
}

function buildHandoverPayload(events) {
  const list = cleanEvents(events);
  const { total, done, pending } = handoverCounts(list);
  const alerts = openAlerts(list);
  const vitals = alerts[0] || list.find((e) => /signos|vitales/i.test(e.text));
  return {
    task: 'handover',
    counts: { total, done, pending },
    pendingTimes: list.filter((e) => !e.done).map((e) => e.time || ''),
    pending: list.filter((e) => !e.done).map((e) => ({ time: e.time || '', text: stripNames(e.text).slice(0, 120) })),
    alerts: alerts.map((e) => stripNames((e.time ? e.time + ' ' : '') + e.text).slice(0, 120)),
    lastVitals: vitals ? stripNames(vitals.text) : null,
    applied: list
      .filter((e) => e.done)
      .map((e) => stripNames(((e.time ? e.time + ' ' : '') + e.text)).slice(0, 120)),
    schema: 'Return JSON {"s","b","a","r"}; each max 200 chars, Spanish, nurse "tu". Use ONLY numbers, times and medication names present above. Items in "pending" are NOT done yet. "a" must name every item in "alerts".'
  };
}

function handoverExtras(events) {
  const { total, done, pending } = handoverCounts(cleanEvents(events));
  return [String(total), String(done), String(pending)];
}

function validHandoverDraft(draft) {
  if (!draft || typeof draft !== 'object') return false;
  return ['s', 'b', 'a', 'r'].every(
    (k) => typeof draft[k] === 'string' && draft[k].trim().length > 0 && draft[k].length <= HANDOVER_MAX
  );
}

// Truth checks the grounding check can't see: every number can be real and the
// sentence still false. Reject drafts that (1) skip an open alert in the
// assessment or (2) call a pending task done.
const DONE_CLAIM_RE = /cumpli|realiz|hech[oa]s?\b|aplicad|complet|termin|ya se/i;
const STILL_OPEN_RE = /pendiente|falta|por hacer|no se ha|sin hacer|queda/i;
const STOPWORDS = new Set(['programada', 'programado', 'previsto', 'prevista', 'control', 'durante', 'despues']);

function keywords(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !STOPWORDS.has(w));
}

function plain(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function namesOpenAlerts(draft, list) {
  return openAlerts(list).every((e) => {
    const marks = e.text.match(/\d+\/\d+/g) || keywords(e.text).slice(0, 1);
    return marks.every((m) => plain(draft.a).includes(plain(m)));
  });
}

function claimsPendingDone(draft, list) {
  const pending = list.filter((e) => !e.done);
  const done = list.filter((e) => e.done);
  const sentences = [draft.s, draft.b, draft.a, draft.r].join('. ').split(/[.;]\s*/);
  return sentences.some((sentence) => {
    if (!DONE_CLAIM_RE.test(sentence) || STILL_OPEN_RE.test(sentence)) return false;
    const words = plain(sentence);
    const hitsPending = pending.some((e) => keywords(e.text).some((w) => words.includes(w)));
    if (!hitsPending) return false;
    // A finished task with the same words makes the claim plausible; only
    // flag claims that can only refer to something still pending.
    const matchesDone = done.some((e) => keywords(e.text).some((w) => words.includes(w)));
    return !matchesDone;
  });
}

function truthfulHandover(draft, list) {
  return namesOpenAlerts(draft, list) && !claimsPendingDone(draft, list);
}

const HANDOVER_PROMPT =
  'You draft a nursing shift handover (SBAR) in neutral Colombian Spanish, ' +
  'addressing the incoming nurse as "tu". FACTS below are the only allowed source. ' +
  'Return JSON {"s":situation,"b":background,"a":assessment,"r":recommendation}, ' +
  'each 1-200 chars. Cite ONLY numbers, times and medication names present in FACTS. ' +
  'Never invent values. Items under "pending" are NOT done: never say they were done. ' +
  'The assessment must name every open alert with its numbers. FACTS: ';

// ---------------------------------------------------------------------------
// Family Q&A: guardrails + keyword rules from ref/content-spec.md
// ---------------------------------------------------------------------------

const REFUSAL_RE =
  /diagn[oó]st|pron[oó]st|c[áa]ncer|tumor|grave|morir|muerte|curar|se va a|cu[áa]nto (tiempo|falta|vive)|dosis|cu[áa]ntos?\s*(mg|ml|gramos)|qu[ée] medicamento|qu[ée] pastilla|qu[ée] droga|debo darle|le (doy|damos|puedo dar)|recomienda|aconseja|deber[íi]a tomar|resultados? (de |del )?(examen|sangre|laboratorio)|alta m[ée]dica|cu[áa]ndo sale|anestesia|cirug[íi]a|presi[óo]n arterial|fiebre|az[úu]car/i;

const ADVICE_RE =
  /\b(diagn[oó]stico|pron[oó]stico|dosis|receto|recomiendo|deber[íi]a|tome |dele |suministre|inyecte|grave|cr[íi]tico|curar[áa]|mejorar[áa]|empeorar[áa]|mg\b|ml\b|comprimidos?|pastillas? para|antibi[oó]tico)/i;

function isRefusal(question) {
  return REFUSAL_RE.test(String(question || ''));
}

function containsAdvice(answer) {
  return ADVICE_RE.test(String(answer || ''));
}

function cleanFacts(facts) {
  if (!Array.isArray(facts)) return [];
  return facts.filter((f) => typeof f === 'string' && f.trim()).slice(0, 20);
}

// Keyword answers mirror the family column of the translation table in
// ref/content-spec.md. Cells marked "—" there (e.g. intimate procedures)
// have no keyword here and fall through to the safe message.
function answerFamilyRules(question, facts) {
  const q = String(question || '').toLowerCase();
  const source = cleanFacts(facts).join(' | ');
  if (!source) return null;
  if (/visit|horario|cu[áa]ndo (puedo|puede|vamos|ir|venir|ver|entrar)|verlo|verla|venir|entrar|hora de/.test(q)) {
    const visit = cleanFacts(facts).find((f) => /visita/i.test(f));
    if (visit && isGrounded(visit, source, [])) return clip(visit, ASK_MAX);
    return null;
  }
  if (/ronda|enfermera|vuelve|vuelven|qui[ée]n (la|lo) cuida|cuida/.test(q)) {
    const round = cleanFacts(facts).find((f) => /ronda|enfermera|vuelve/i.test(f));
    if (round && isGrounded(round, source, [])) return clip(round, ASK_MAX);
    return null;
  }
  if (/noche|durmi|madrugada|c[óo]mo pas|c[óo]mo est|c[óo]mo sigue|c[óo]mo amaneci|descans|tranquil/.test(q)) {
    const calm = cleanFacts(facts).find((f) => /tranquil|sin novedad|normalidad|equipo/i.test(f));
    if (calm && isGrounded(calm, source, [])) return clip(calm, ASK_MAX);
    return null;
  }
  if (/medicamento|medicina|tratamiento|pastilla|inyecci|suero|remedio/.test(q)) {
    const med = cleanFacts(facts).find((f) => /tratamiento|medicamento|cumplido/i.test(f));
    if (med && isGrounded(med, source, [])) return clip(med, ASK_MAX);
    return null;
  }
  return null;
}

function buildAskPayload(question, facts) {
  return {
    task: 'family-qa',
    question: stripNames(String(question || '').slice(0, 300)),
    facts: cleanFacts(facts).map((f) => stripNames(f).slice(0, 200)),
    schema: 'Answer in warm plain Spanish ("usted"), max 220 chars, using ONLY the facts above. ' +
      'If the facts lack the answer, return {"refuse":true}. Never diagnose, prognose, dose or advise medication. ' +
      'Return JSON {"answer":"..."} or {"refuse":true}.'
  };
}

const ASK_PROMPT =
  'You answer a hospital patient family question in warm plain neutral Colombian Spanish ' +
  '("usted"), like a kind nurse. The FACTS below are the only allowed source. Never diagnose, ' +
  'prognose, give doses or advise medication. Broad questions ("how is she", "how was the ' +
  'night", "any news") are normal: answer with what FACTS do say about today, and when they ' +
  'do not cover the exact thing asked, say so briefly and offer the nurse. Never invent ' +
  'details, times or numbers. Return {"refuse":true} only when FACTS have nothing related ' +
  'to the question. Otherwise return JSON {"answer":"..."}, 1-2 short sentences, max 220 ' +
  'chars. FACTS: ';

function validAskAnswer(answer, sourceText) {
  if (typeof answer !== 'string') return false;
  const clean = answer.trim();
  if (!clean || clean.length > ASK_MAX) return false;
  if (containsAdvice(clean)) return false;
  return isGrounded(clean, sourceText, []);
}

// ---------------------------------------------------------------------------
// In-memory "pregunta para la enfermera" items (prototype scope)
// ---------------------------------------------------------------------------

let nurseQuestions = [];
let nextQuestionId = 1;

function listNurseQuestions() {
  return nurseQuestions.filter((q) => q.status === 'open');
}

function addNurseQuestion(question) {
  const item = {
    id: nextQuestionId++,
    question: String(question || '').slice(0, 300),
    at: new Date().toISOString(),
    status: 'open'
  };
  nurseQuestions.push(item);
  return item;
}

function resolveNurseQuestion(id) {
  const item = nurseQuestions.find((q) => q.id === Number(id) && q.status === 'open');
  if (!item) return false;
  item.status = 'done';
  return true;
}

function resetNurseQuestions() {
  nurseQuestions = [];
  nextQuestionId = 1;
}

// ---------------------------------------------------------------------------
// Shared shift: events + in-app chat with one global, increasing sequence.
// In memory only (prototype scope); resetShared() gives every test a clean run.
// ---------------------------------------------------------------------------

let sharedEvents = [];
let sharedMessages = [];
let sharedDeleted = [];
let sharedSeq = 0;
let nextMessageId = 1;

function addSharedEvent(body) {
  const source = body && typeof body === 'object' ? body : {};
  if (!source.id) return null;
  const existing = sharedEvents.find((item) => item.id === String(source.id));
  if (existing) return existing;
  const event = {
    id: String(source.id),
    patientId: String(source.patientId || ''),
    kind: String(source.kind || 'other'),
    text: String(source.text || '').slice(0, 600),
    time: String(source.time || ''),
    seq: ++sharedSeq
  };
  sharedEvents.push(event);
  return event;
}

function deleteSharedEvent(id) {
  const index = sharedEvents.findIndex((item) => item.id === String(id));
  if (index === -1) return false;
  sharedEvents.splice(index, 1);
  sharedSeq += 1;
  sharedDeleted.push({ id: String(id), seq: sharedSeq });
  return true;
}

const CHAT_CHANNELS = ['familia', 'equipo'];
// A full SBAR note (4 fields of 200 chars plus labels) must fit the team channel.
const CHAT_MAX = { familia: 600, equipo: 1000 };

function addChatMessage(body) {
  const source = body && typeof body === 'object' ? body : {};
  const channel = source.channel;
  const text = typeof source.text === 'string' ? source.text.trim() : '';
  if (CHAT_CHANNELS.indexOf(channel) === -1) return null;
  if (!text || text.length > CHAT_MAX[channel]) return null;
  const message = {
    id: 'msg-' + nextMessageId++,
    channel: channel,
    patientId: String(source.patientId || ''),
    author: String(source.author || ''),
    text: text,
    time: new Date().toISOString(),
    seq: ++sharedSeq
  };
  sharedMessages.push(message);
  return message;
}

// reader=familia (and paciente, or a missing reader) never receives clinical
// event text nor the team channel. Only the nurse feed is complete.
function sharedSnapshot(reader, since) {
  const familySafe = reader !== 'enfermero';
  const after = Number(since) || 0;
  const events = sharedEvents
    .filter((item) => item.seq > after)
    .map((item) => ({
      id: item.id,
      patientId: item.patientId,
      kind: item.kind,
      text: familySafe ? '' : item.text,
      time: item.time,
      seq: item.seq
    }));
  const messages = sharedMessages.filter(
    (item) => item.seq > after && (!familySafe || item.channel === 'familia')
  );
  const deleted = sharedDeleted
    .filter((item) => item.seq > after)
    .map((item) => item.id);
  return { seq: sharedSeq, events, messages, deleted };
}

function resetShared() {
  sharedEvents = [];
  sharedMessages = [];
  sharedDeleted = [];
  sharedSeq = 0;
  nextMessageId = 1;
}

// ---------------------------------------------------------------------------
// Orchestration: rules -> Ollama -> rules
// ---------------------------------------------------------------------------

async function handleHandover(events, ollamaClient) {
  const list = cleanEvents(events);
  const rules = buildHandoverRules(list);
  const source = eventSource(list);
  const extras = handoverExtras(list);
  if (!ollamaClient) return { ...rules, source: 'rules', model: null };
  try {
    const model = await ai.activeModel(ollamaClient);
    if (!model) return { ...rules, source: 'rules', model: null };
    const payload = buildHandoverPayload(list);
    const draft = await ai.generateJson(ollamaClient, model, HANDOVER_PROMPT + JSON.stringify(payload));
    if (!validHandoverDraft(draft)) return { ...rules, source: 'rules', model: null };
    const ok = ['s', 'b', 'a', 'r'].every((k) => isGrounded(draft[k], source, extras));
    if (!ok || !truthfulHandover(draft, list)) return { ...rules, source: 'rules', model: null };
    return { s: draft.s, b: draft.b, a: draft.a, r: draft.r, source: 'ollama', model };
  } catch (_) {
    return { ...rules, source: 'rules', model: null };
  }
}

async function handleAsk(question, facts, ollamaClient) {
  const list = cleanFacts(facts);
  const source = list.join(' | ');
  if (isRefusal(question)) {
    addNurseQuestion(question);
    return { answer: SAFE_MESSAGE, source: 'rules', model: null, createdQuestion: true };
  }
  // The model phrases the answer; the keyword rules only stand in when it can't.
  if (ollamaClient) {
    try {
      const model = await ai.activeModel(ollamaClient);
      if (model) {
        const payload = buildAskPayload(question, list);
        const out = await ai.generateJson(ollamaClient, model, ASK_PROMPT + JSON.stringify(payload));
        if (out && validAskAnswer(out.answer, source)) {
          return { answer: out.answer.trim(), source: 'ollama', model, createdQuestion: false };
        }
      }
    } catch (_) {
      // fall through to the rules below
    }
  }
  const direct = answerFamilyRules(question, list);
  if (direct) {
    return { answer: direct, source: 'rules', model: null, createdQuestion: false };
  }
  addNurseQuestion(question);
  return { answer: SAFE_MESSAGE, source: 'rules', model: null, createdQuestion: true };
}

// ---------------------------------------------------------------------------
// Per-reader translation of one event: deterministic rules -> Ollama -> rules.
// The model may phrase the sentence; the server alone decides if it is safe.
// ---------------------------------------------------------------------------

const TRANSLATE_MAX = 90;
const TRANSLATE_READERS = ['paciente', 'familia'];

// Fixed plain phrases per kind and reader. Family never gets intimate care
// details (position) and free-text ("other") events reach nobody.
const RULE_PHRASES = {
  paciente: {
    medication: 'Le aplicaron el medicamento',
    position: 'Le ayudaron a cambiar de posición',
    round: 'La enfermera pasó a revisar',
    other: null
  },
  familia: {
    medication: 'Tratamiento cumplido',
    position: null,
    round: 'El equipo pasó a revisar',
    other: null
  }
};

function translateRules(event, reader) {
  const phrases = RULE_PHRASES[reader] || {};
  const kind = event && event.kind;
  const text = kind && Object.prototype.hasOwnProperty.call(phrases, kind)
    ? phrases[kind]
    : null;
  return { text, source: 'rules', model: null };
}

// Safety gates applied to any model phrasing before a reader sees it.
const TRANSLATE_UNIT_RE = /\b(?:mg|ml|sc|dosis)\b|\binyecc/i;
const TRANSLATE_ALARM_RE = /grave|diagn|pron[oó]st|deber[ií]a/i;
// Where and how a drug went in is clinical detail, never plain language.
const TRANSLATE_BODY_RE = /abdom|brazo|pierna|muslo|nalga|gl[uú]te|vena|intraven|subcut|\bv[ií]a\b|\boral\b|\bboca\b/i;
const TRANSLATE_STEM_OK = new Set(['cambi', 'posic', 'ronda', 'medic', 'enfer', 'revis', 'aplic']);

// 5-letter stems so "abdomen" still matches the record's "abdominal".
function stems(text) {
  const words = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-zñ]{5,}/g) || [];
  return new Set(words.map((w) => w.slice(0, 5)));
}

// No clinical word from the nurse record may reach the reader, even reworded.
function leaksEventWords(output, eventText) {
  const source = stems(eventText);
  for (const stem of stems(output)) {
    if (source.has(stem) && !TRANSLATE_STEM_OK.has(stem)) return true;
  }
  return false;
}

function validTranslateText(raw, eventText) {
  if (typeof raw !== 'string') return false;
  const text = raw.trim();
  if (!text || text.length > TRANSLATE_MAX) return false;
  if (/\d/.test(text)) return false;
  if (TRANSLATE_UNIT_RE.test(text)) return false;
  if (containsAdvice(text)) return false;
  if (TRANSLATE_ALARM_RE.test(text)) return false;
  if (TRANSLATE_BODY_RE.test(text)) return false;
  if (leaksEventWords(text, eventText)) return false;
  return true;
}

const TRANSLATE_PROMPT =
  'Translate one nursing event into exactly one short plain sentence in neutral ' +
  'Colombian Spanish. If reader is "paciente", speak to the patient as "usted". ' +
  'If reader is "familia", speak to a relative about the patient in third person ' +
  '(never "usted" for the patient). Reassuring and concrete. No names, no numbers, ' +
  'no doses, no drug names, no body parts, no route (where or how it was given), ' +
  'no advice, no diagnosis. Return JSON {"text":"..."}. EVENT: ';

function buildTranslatePayload(event, reader) {
  return {
    task: 'translate',
    reader,
    kind: event.kind,
    event: stripNames(String(event.text || '').slice(0, 600)),
    schema: 'Return JSON {"text":"..."}: one short sentence, Spanish, "usted", ' +
      'no names, no numbers, no drug names, no advice.'
  };
}

async function handleTranslate(event, reader, ollamaClient) {
  const rules = translateRules(event, reader);
  // Family hidden details and free-text events never reach the model at all.
  if (!rules.text) return rules;
  if (!ollamaClient) return rules;
  try {
    const model = await ai.activeModel(ollamaClient);
    if (!model) return rules;
    const payload = buildTranslatePayload(event, reader);
    const draft = await ai.generateJson(ollamaClient, model, TRANSLATE_PROMPT + JSON.stringify(payload));
    if (!draft || !validTranslateText(draft.text, event && event.text)) return rules;
    return { text: draft.text.trim(), source: 'ollama', model };
  } catch (_) {
    return rules;
  }
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createRequestHandler(client) {
  return async function (req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        let model = null;
        try {
          if (client) model = await ai.activeModel(client);
        } catch (_) {
          model = null;
        }
        sendJson(res, 200, {
          ok: true,
          service: 'nursing-prototype',
          ollama: { reachable: Boolean(model), model }
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/questions') {
        sendJson(res, 200, { items: listNurseQuestions() });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/questions/resolve') {
        const body = JSON.parse(await readBody(req));
        const ok = resolveNurseQuestion(body && body.id);
        sendJson(res, ok ? 200 : 404, { ok });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/handover') {
        const body = JSON.parse(await readBody(req));
        if (body && body.dryRun === true) {
          sendJson(res, 200, { payload: buildHandoverPayload(cleanEvents(body.events)) });
          return;
        }
        const result = await handleHandover(body && body.events, client);
        sendJson(res, 200, result);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/ask') {
        const body = JSON.parse(await readBody(req));
        if (body && body.dryRun === true) {
          sendJson(res, 200, {
            payload: buildAskPayload(body.question || '', cleanFacts(body.facts))
          });
          return;
        }
        const result = await handleAsk(body && body.question, body && body.facts, client);
        sendJson(res, 200, result);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/translate') {
        const body = JSON.parse(await readBody(req));
        const event = body && body.event;
        const reader = body && body.reader;
        const text = event && typeof event.text === 'string' ? event.text : '';
        const ok = TRANSLATE_READERS.includes(reader) &&
          EVENT_KIND_ENUM.includes(event && event.kind) &&
          text.trim().length >= 1 && text.length <= 600;
        if (!ok) { sendJson(res, 400, { ok: false, error: 'bad request' }); return; }
        const result = await handleTranslate(
          { kind: event.kind, text: text.trim() }, reader, client
        );
        sendJson(res, 200, result);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/event') {
        const body = JSON.parse(await readBody(req));
        const text = body && typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) { sendJson(res, 400, { ok: false, error: 'empty text' }); return; }
        if (text.length > 600) { sendJson(res, 400, { ok: false, error: 'text too long' }); return; }
        const result = await handleEvent(text, client);
        sendJson(res, 200, result);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/events') {
        const body = JSON.parse(await readBody(req));
        const event = addSharedEvent(body);
        if (!event) { sendJson(res, 400, { ok: false, error: 'bad event' }); return; }
        sendJson(res, 200, { ok: true, event });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/events/delete') {
        const body = JSON.parse(await readBody(req));
        // 200 even for an unknown id: a client retries failures, and an event the
        // server no longer has (restart) must not block its queue.
        const ok = deleteSharedEvent(body && body.id);
        sendJson(res, 200, { ok });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = JSON.parse(await readBody(req));
        const message = addChatMessage(body);
        if (!message) { sendJson(res, 400, { ok: false, error: 'bad message' }); return; }
        sendJson(res, 200, { ok: true, message });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/sync') {
        const reader = url.searchParams.get('reader');
        const since = url.searchParams.get('since');
        sendJson(res, 200, sharedSnapshot(reader, since));
        return;
      }
      // Static frontend: only for GET, everything else 404.
      if (req.method === 'GET') {
        serveStatic(res, url.pathname);
      } else {
        sendJson(res, 404, { ok: false, error: 'not found' });
      }
    } catch (error) {
      sendJson(res, 400, { ok: false, error: 'bad request' });
    }
  };
}

function createServer(ollamaClient) {
  const client = ollamaClient === undefined ? ai.createClient() : ollamaClient;
  return http.createServer(createRequestHandler(client));
}

if (require.main === module) {
  const client = ai.createClient();
  const handler = createRequestHandler(client);
  const printUrls = function (protocol) {
    const port = protocol === 'https' ? 8443 : PORT;
    const ifaces = os.networkInterfaces();
    const lan = [];
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) lan.push(iface.address);
      }
    }
    // eslint-disable-next-line no-console
    console.log('Acompaña backend on:');
    if (HOST === '0.0.0.0') console.log('  ' + protocol + '://localhost:' + port);
    for (const ip of lan) console.log('  ' + protocol + '://' + ip + ':' + port);
  };
  http.createServer(handler).listen(PORT, HOST, () => printUrls('http'));
  const tlsDir = path.join(os.homedir(), '.config', 'acompana', 'tls');
  const keyPath = path.join(tlsDir, 'key.pem');
  const certPath = path.join(tlsDir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      const https = require('https');
      https.createServer({
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      }, handler).listen(8443, HOST, () => printUrls('https'));
    } catch (tlsError) {
      // eslint-disable-next-line no-console
      console.error('https disabled: ' + tlsError.message);
    }
  }
}

module.exports = {
  HOST,
  PORT,
  HANDOVER_MAX,
  ASK_MAX,
  SAFE_MESSAGE,
  cleanEvents,
  eventSource,
  buildHandoverRules,
  buildHandoverPayload,
  truthfulHandover,
  handoverExtras,
  validHandoverDraft,
  isGrounded,
  groundingSets,
  stripNames,
  isRefusal,
  containsAdvice,
  answerFamilyRules,
  buildAskPayload,
  validAskAnswer,
  listNurseQuestions,
  addNurseQuestion,
  resolveNurseQuestion,
  resetNurseQuestions,
  addSharedEvent,
  deleteSharedEvent,
  addChatMessage,
  sharedSnapshot,
  resetShared,
  createRequestHandler,
  handleHandover,
  handleAsk,
  translateRules,
  handleTranslate,
  classifyEventRules,
  handleEvent,
  createServer
};
