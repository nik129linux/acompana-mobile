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

module.exports = {
  APP_MAX,
  TITLE_MAX,
  NOTE_MAX,
  RESUME_MIN,
  RESUME_MAX,
  REASON_MAX,
  cleanCtx,
  cleanSummary,
  validResumeLine,
  validProposal,
  handleResumeLine,
  handlePropose
};
