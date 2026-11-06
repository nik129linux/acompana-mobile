'use strict';

// Retoma (desktop app) AI routes, served by the Acompaña backend so the
// Windows build gets gemma without a local Ollama install.
// Zero dependencies. Nothing here stores or logs notes or titles: the text
// goes to the model and comes back only as the response body.
// Any model failure, budget exhaustion or validation failure answers
// { ok: true, fallback: true }, so the desktop always falls back to its rules.

const ai = require('./ai');

const APP_MAX = 60;
const TITLE_MAX = 120;
const NOTE_MAX = 200;
const RESUME_MIN = 8;
const RESUME_MAX = 140;
const REASON_MAX = 140;
const PER_APP_MAX = 20;
const MINUTES_MIN = 15;
const MINUTES_MAX = 180;
const METRIC_APP_MAX = 60;
const HABIT_NOTE_MIN = 1;
const HABIT_NOTE_MAX = 400;
const HABIT_TEXT_MAX = 200;
const HABIT_MINUTES_MIN = 5;
const HABIT_MINUTES_MAX = 120;
const ANSWER_MAX = 240;
const QUESTION_MAX = 200;
// Only these aggregates may reach a habit/ask prompt; titles and notes never do.
const METRIC_NUMBER_KEYS = [
  'totalMinutes', 'count', 'median', 'countLong', 'switchesPerHour',
  'distractionMinutes', 'distractionPct', 'distractionShare', 'breakCount',
  'medianGap', 'longestGap'
];
const METRIC_APP_KEYS = ['topDistraction', 'mostUsedApp'];
const HABIT_METRICS = ['switchesPerHour', 'longest', 'lateNight', 'distractionShare'];
const HABIT_TEXT_RE = /^After .+, I will .+ for \d+ min\.?$/;
const HABIT_TEXT_ES_RE = /^Después de .+, (voy a|haré) .+ (por|durante) \d+ min\.?$/;

// Same judging language the desktop refuses to show.
const JUDGE_RE = /productiv|distract|score|lazy|wasted|productividad|distra[ií]d|puntaje|perezos/i;
// Third person sounds like a report about someone else, not a nudge to you.
const THIRD_PERSON_RE = /\bthe user\b|\bel usuario\b/i;
// Second person, English or Spanish.
const SECOND_PERSON_RE = /\byou\b|\byour\b|\byou're\b|estabas|estuviste|\bestás\b|\bsigues\b|\bcontinúa\b|\bcontinua\b|\bretoma\b|\btu\b|\btú\b|\btenías\b|\btenias\b/i;
const START_RE = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;

const FALLBACK = { ok: true, fallback: true };

function clip(text, max) {
  const clean = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd();
}

// Input caps are clipped, never rejected; only a missing app is invalid.
function cleanCtx(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const app = clip(raw.app, APP_MAX);
  if (!app) return null;
  const away = Math.round(Number(raw.awayMinutes));
  return {
    app,
    title: clip(raw.title, TITLE_MAX),
    note: clip(raw.note, NOTE_MAX),
    awayMinutes: Number.isFinite(away) && away > 0 ? away : 0
  };
}

// Summary of the focus day; perApp is capped to 20 apps.
function cleanSummary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const perAppRaw = raw.perApp;
  if (!perAppRaw || typeof perAppRaw !== 'object' || Array.isArray(perAppRaw)) return null;
  const perApp = {};
  Object.keys(perAppRaw).slice(0, PER_APP_MAX).forEach((key) => {
    const app = clip(key, APP_MAX);
    const minutes = Math.round(Number(perAppRaw[key]));
    if (app && Number.isFinite(minutes) && minutes >= 0) perApp[app] = minutes;
  });
  if (!Object.keys(perApp).length) return null;
  return {
    perApp,
    longest: cleanAppMinutes(raw.longest),
    firstInterruption: cleanInterruption(raw.firstInterruption)
  };
}

function cleanAppMinutes(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const app = clip(raw.app, APP_MAX);
  const minutes = Math.round(Number(raw.minutes));
  if (!app || !Number.isFinite(minutes) || minutes < 0) return null;
  return { app, minutes };
}

function cleanInterruption(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const app = clip(raw.app, APP_MAX);
  if (!app) return null;
  return { app, at: clip(raw.at, 10) };
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cleanMetricApp(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const app = clip(raw.app, METRIC_APP_MAX);
  const minutes = finiteNumber(raw.minutes);
  if (!app || minutes === null || minutes < 0) return null;
  return { app, minutes };
}

function cleanTrend(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const trend = {};
  ['days', 'current', 'previous', 'delta'].forEach((key) => {
    const n = finiteNumber(raw[key]);
    if (n !== null) trend[key] = n;
  });
  const direction = clip(raw.direction, METRIC_APP_MAX);
  if (direction) trend.direction = direction;
  return Object.keys(trend).length ? trend : null;
}

function metricTime(value) {
  if (typeof value !== 'string') return null;
  const time = value.trim();
  return START_RE.test(time) ? time : null;
}

// Whitelist of usage aggregates: only known keys survive, numbers must be
// finite, strings are clipped to 60, perApp is capped to 20 apps. A missing
// or empty perApp is the one hard failure (the route answers 400 for it).
function cleanMetrics(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const perAppRaw = raw.perApp;
  if (!perAppRaw || typeof perAppRaw !== 'object' || Array.isArray(perAppRaw)) return null;
  const perApp = {};
  Object.keys(perAppRaw).slice(0, PER_APP_MAX).forEach((key) => {
    const app = clip(key, METRIC_APP_MAX);
    const minutes = finiteNumber(perAppRaw[key]);
    if (app && minutes !== null && minutes >= 0) perApp[app] = minutes;
  });
  if (!Object.keys(perApp).length) return null;
  const out = { perApp };
  METRIC_NUMBER_KEYS.forEach((key) => {
    const n = finiteNumber(raw[key]);
    if (n !== null) out[key] = n;
  });
  METRIC_APP_KEYS.forEach((key) => {
    const app = clip(raw[key], METRIC_APP_MAX);
    if (app) out[key] = app;
  });
  const longest = cleanMetricApp(raw.longest);
  if (longest) out.longest = longest;
  const firstAt = metricTime(raw.firstAt);
  if (firstAt) out.firstAt = firstAt;
  const lastAt = metricTime(raw.lastAt);
  if (lastAt) out.lastAt = lastAt;
  if (typeof raw.lateNight === 'boolean') out.lateNight = raw.lateNight;
  const trend = cleanTrend(raw.trend);
  if (trend) out.trend = trend;
  return out;
}

// Resume line: one line, names the app, speaks to you, no judging words.
function validResumeLine(line, app) {
  if (typeof line !== 'string') return false;
  if (/[\r\n]/.test(line)) return false;
  const text = line.trim();
  if (text.length < RESUME_MIN || text.length > RESUME_MAX) return false;
  const name = clip(app, APP_MAX);
  if (!name || !text.toLowerCase().includes(name.toLowerCase())) return false;
  if (THIRD_PERSON_RE.test(text)) return false;
  if (JUDGE_RE.test(text)) return false;
  return SECOND_PERSON_RE.test(text);
}

// Proposal: H:MM start, integer minutes 15-180, short neutral reason.
function validProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return false;
  if (typeof proposal.start !== 'string' || !START_RE.test(proposal.start)) return false;
  if (!Number.isInteger(proposal.minutes)) return false;
  if (proposal.minutes < MINUTES_MIN || proposal.minutes > MINUTES_MAX) return false;
  if (typeof proposal.reason !== 'string') return false;
  const reason = proposal.reason.trim();
  if (reason.length < 1 || reason.length > REASON_MAX) return false;
  if (JUDGE_RE.test(reason)) return false;
  return true;
}

// Experiment: one actionable line (English or Spanish shape), short trigger,
// action, 5-120 minutes, a known metric, and a target with a direction.
function validExperiment(exp) {
  if (!exp || typeof exp !== 'object' || Array.isArray(exp)) return false;
  if (typeof exp.text !== 'string') return false;
  const text = exp.text.trim();
  if (!text || text.length > HABIT_TEXT_MAX) return false;
  if (!HABIT_TEXT_RE.test(text) && !HABIT_TEXT_ES_RE.test(text)) return false;
  if (JUDGE_RE.test(text) || THIRD_PERSON_RE.test(text)) return false;
  if (typeof exp.trigger !== 'string' || !exp.trigger.trim()) return false;
  if (typeof exp.action !== 'string' || !exp.action.trim()) return false;
  if (!Number.isInteger(exp.minutes)) return false;
  if (exp.minutes < HABIT_MINUTES_MIN || exp.minutes > HABIT_MINUTES_MAX) return false;
  if (!HABIT_METRICS.includes(exp.metric)) return false;
  if (typeof exp.target !== 'number' || !Number.isFinite(exp.target)) return false;
  return exp.direction === 'atLeast' || exp.direction === 'atMost';
}

function validHabits(out) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return false;
  if (typeof out.note !== 'string') return false;
  const note = out.note.trim();
  if (note.length < HABIT_NOTE_MIN || note.length > HABIT_NOTE_MAX) return false;
  if (JUDGE_RE.test(note) || THIRD_PERSON_RE.test(note)) return false;
  return validExperiment(out.experiment);
}

function validAskAnswer(out) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return false;
  if (typeof out.answer !== 'string') return false;
  const answer = out.answer.trim();
  if (answer.length < 1 || answer.length > ANSWER_MAX) return false;
  if (JUDGE_RE.test(answer) || THIRD_PERSON_RE.test(answer)) return false;
  return true;
}

// Shape-only validation; grounding is the desktop's job.
function cleanExperiment(exp) {
  return {
    text: exp.text.trim(),
    trigger: exp.trigger.trim(),
    action: exp.action.trim(),
    minutes: exp.minutes,
    metric: exp.metric,
    target: exp.target,
    direction: exp.direction
  };
}

const HABITS_PROMPT =
  'You are a supportive habit coach. Read these usage aggregates (app minutes, focus blocks, switches, breaks) ' +
  'and reply with JSON only, exactly {"note":"max 400 chars, kind, no guilt, no medical claims",' +
  '"experiment":{"text":"After <trigger>, I will <action> for <N min>","trigger":"<trigger>",' +
  '"action":"<action>","minutes":N,"metric":"switchesPerHour|longest|lateNight|distractionShare",' +
  '"target":N,"direction":"atLeast|atMost"}}. ' +
  'minutes is a whole number from 5 to 120. ' +
  'Never use the words productive, distraction, distracted, score, lazy or wasted, and never say "the user". ' +
  'Cite only numbers and apps from these metrics: ';

const ASK_PROMPT =
  'Answer this question about PC usage using ONLY these aggregates. ' +
  'Reply with JSON only, exactly {"answer":"max 240 chars"}. ' +
  'If the metrics cannot answer it, reply {"answer":"I cannot tell from the tracked time yet. ' +
  'Ask about your longest block, most-used app, or switches."}. ' +
  'Never use the words productive, distraction, distracted, score, lazy or wasted, and never say "the user".';

const RESUME_PROMPT = {
  es: 'Escribe una sola línea corta (8-140 caracteres) para una app de concentración, en Spanish (español), ' +
    'en segunda persona ("tú"), diciendo en qué app se quedó la persona y con qué seguir. ' +
    'Nombra la app. Nunca digas "el usuario". No juzgues a la persona (nada de productivo, distraído, puntaje). ' +
    'Devuelve JSON {"line":"..."}. DATOS: ',
  en: 'Write one short line (8-140 characters) for a focus app, in second person ("you"), saying which app ' +
    'the person was in and what to continue with. Name the app. Never say "the user". Never judge the person ' +
    '(no productive, distracted, score, lazy, wasted). Return JSON {"line":"..."}. DATA: '
};

const PROPOSE_PROMPT = {
  es: 'Propón el próximo bloque de concentración en Spanish (español), en segunda persona ("tú"). ' +
    'Devuelve JSON {"start":"H:MM","minutes":15-180,"reason":"1-140 caracteres"}. ' +
    'Usa solo las apps y minutos de los DATOS. No juzgues a la persona (nada de productivo, distraído, puntaje). ' +
    'DATOS: ',
  en: 'Propose the next focus block in plain English, in second person ("you"). ' +
    'Return JSON {"start":"H:MM","minutes":15-180,"reason":"1-140 characters"}. ' +
    'Use only the apps and minutes in DATA. Never judge the person ' +
    '(no productive, distracted, score, lazy, wasted). DATA: '
};

function langOf(value) {
  return value === 'es' ? 'es' : 'en';
}

// generateJson already parses; this also accepts a raw string just in case.
function parseModelOutput(raw) {
  if (typeof raw !== 'string') return raw;
  const clean = typeof ai.cleanModelJson === 'function' ? ai.cleanModelJson(raw) : raw;
  try {
    return JSON.parse(clean);
  } catch (_) {
    return null;
  }
}

function sourceLabel(model) {
  return 'Retoma server · ' + model;
}

// deps.generate is the server's generateWithinBudget, so every call spends
// from the one shared daily budget.
async function handleResumeLine(body, client, generate) {
  const ctx = cleanCtx(body && body.ctx);
  if (!ctx) return null;
  const lang = langOf(body && body.lang);
  if (!client) return Object.assign({}, FALLBACK);
  try {
    const model = await ai.activeModel(client);
    if (!model) return Object.assign({}, FALLBACK);
    const out = parseModelOutput(await generate(client, model, RESUME_PROMPT[lang] + JSON.stringify(ctx)));
    if (!out || !validResumeLine(out.line, ctx.app)) return Object.assign({}, FALLBACK);
    return { ok: true, text: out.line.trim(), source: sourceLabel(model), fallback: false };
  } catch (_) {
    return Object.assign({}, FALLBACK);
  }
}

async function handlePropose(body, client, generate) {
  const summary = cleanSummary(body && body.summary);
  if (!summary) return null;
  const lang = langOf(body && body.lang);
  if (!client) return Object.assign({}, FALLBACK);
  try {
    const model = await ai.activeModel(client);
    if (!model) return Object.assign({}, FALLBACK);
    const out = parseModelOutput(await generate(client, model, PROPOSE_PROMPT[lang] + JSON.stringify(summary)));
    if (!out || !validProposal(out)) return Object.assign({}, FALLBACK);
    return {
      ok: true,
      start: out.start,
      minutes: out.minutes,
      reason: out.reason.trim(),
      source: sourceLabel(model),
      fallback: false
    };
  } catch (_) {
    return Object.assign({}, FALLBACK);
  }
}

// The desktop also grounds the numbers; the server enforces shape and language.
function langNote(lang) {
  return lang === 'es' ? ' Reply in Spanish (español).' : '';
}

async function handleHabits(body, client, generate) {
  const metrics = cleanMetrics(body && body.metrics);
  if (!metrics) return null;
  const lang = langOf(body && body.lang);
  if (!client) return Object.assign({}, FALLBACK);
  try {
    const model = await ai.activeModel(client);
    if (!model) return Object.assign({}, FALLBACK);
    const prompt = HABITS_PROMPT + langNote(lang) + ' ' + JSON.stringify(metrics);
    const out = parseModelOutput(await generate(client, model, prompt));
    if (!out || !validHabits(out)) return Object.assign({}, FALLBACK);
    return {
      ok: true,
      note: out.note.trim(),
      experiment: cleanExperiment(out.experiment),
      source: sourceLabel(model),
      fallback: false
    };
  } catch (_) {
    return Object.assign({}, FALLBACK);
  }
}

async function handleAsk(body, client, generate) {
  const metrics = cleanMetrics(body && body.metrics);
  if (!metrics) return null;
  if (typeof (body && body.question) !== 'string') return null;
  const question = clip(body.question, QUESTION_MAX);
  if (!question) return null;
  const lang = langOf(body && body.lang);
  if (!client) return Object.assign({}, FALLBACK);
  try {
    const model = await ai.activeModel(client);
    if (!model) return Object.assign({}, FALLBACK);
    const prompt = ASK_PROMPT + langNote(lang) + ' Question: ' + question + ' Metrics: ' + JSON.stringify(metrics);
    const out = parseModelOutput(await generate(client, model, prompt));
    if (!out || !validAskAnswer(out)) return Object.assign({}, FALLBACK);
    return { ok: true, answer: out.answer.trim(), source: sourceLabel(model), fallback: false };
  } catch (_) {
    return Object.assign({}, FALLBACK);
  }
}

module.exports = {
  APP_MAX,
  TITLE_MAX,
  NOTE_MAX,
  RESUME_MIN,
  RESUME_MAX,
  REASON_MAX,
  METRIC_APP_MAX,
  HABIT_NOTE_MIN,
  HABIT_NOTE_MAX,
  HABIT_TEXT_MAX,
  HABIT_MINUTES_MIN,
  HABIT_MINUTES_MAX,
  ANSWER_MAX,
  QUESTION_MAX,
  HABIT_METRICS,
  cleanCtx,
  cleanSummary,
  cleanMetrics,
  validResumeLine,
  validProposal,
  validExperiment,
  validHabits,
  validAskAnswer,
  handleResumeLine,
  handlePropose,
  handleHabits,
  handleAsk
};
