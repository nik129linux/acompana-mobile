'use strict';

// Shared Ollama client for the nursing prototype backend.
// Zero dependencies. Every function accepts an injected fetchImpl so tests
// can mock the network without touching globals.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const CLOUD_BASE_URL = 'https://ollama.com';
const PREFERRED_MODEL = 'gemma4:31b';
const OLLAMA_TIMEOUT_MS = 10000;
const KEY_FILE = path.join(os.homedir(), '.config', 'acompana', 'ollama-key');

// The cloud API key lives outside the repo: OLLAMA_API_KEY, or a one-line
// file only its owner can read. A group/other readable file is ignored.
function readKeyFile(file) {
  try {
    const stat = fs.statSync(file);
    if ((stat.mode & 0o077) !== 0) {
      console.warn('ignoring ' + file + ': run chmod 600 on it');
      return null;
    }
    const key = fs.readFileSync(file, 'utf8').trim();
    return key || null;
  } catch (error) {
    return null;
  }
}

function apiKey() {
  return process.env.OLLAMA_API_KEY || readKeyFile(process.env.OLLAMA_KEY_FILE || KEY_FILE);
}

// With a key and no OLLAMA_URL, talk to the cloud API directly (no local
// Ollama install needed). Without a key, the local server.
function baseUrl(key) {
  if (process.env.OLLAMA_URL) return process.env.OLLAMA_URL;
  return key ? CLOUD_BASE_URL : DEFAULT_BASE_URL;
}

function createClient(options) {
  const opts = options || {};
  const key = opts.apiKey !== undefined ? opts.apiKey : apiKey();
  return {
    baseUrl: opts.baseUrl || baseUrl(key),
    apiKey: key || null,
    timeoutMs: opts.timeoutMs || OLLAMA_TIMEOUT_MS,
    fetchImpl: opts.fetchImpl || fetch
  };
}

// Runs fetchImpl with an 8s abort timeout. Any failure (network, timeout,
// non-2xx, bad JSON) is thrown so callers fall back to deterministic rules.
async function fetchJson(client, path, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), client.timeoutMs);
  try {
    const response = await client.fetchImpl(client.baseUrl + path, {
      method: (options && options.method) || 'GET',
      headers: client.apiKey
        ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + client.apiKey }
        : { 'Content-Type': 'application/json' },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    if (!response || !response.ok) {
      throw new Error('ollama http ' + (response ? response.status : 'no-response'));
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function listModels(client) {
  const data = await fetchJson(client, '/api/tags');
  if (!data || !Array.isArray(data.models)) throw new Error('ollama bad tags');
  return data.models;
}

// Model policy: OLLAMA_MODEL env wins, then gemma4:31b, then any gemma
// (cloud-tagged gemma4:31b-cloud is fine). Never auto-pick another local
// model: a big local one can freeze the PC. No gemma = null = rules.
function pickModel(models) {
  if (!Array.isArray(models)) return null;
  const names = models.map((m) => m && m.name).filter(Boolean);
  const want = process.env.OLLAMA_MODEL;
  if (want) return names.includes(want) ? want : null;
  if (names.includes(PREFERRED_MODEL)) return PREFERRED_MODEL;
  return names.find((name) => /^gemma/i.test(name)) || null;
}

async function activeModel(client) {
  const models = await listModels(client);
  return pickModel(models);
}

// POST /api/generate with format json and stream false. The model must
// return {"response": "<json string>"}; the inner string is parsed here so
// malformed model JSON throws and the caller falls back to rules.
// Leading ```json fences are stripped; anything else unparseable throws.
function cleanModelJson(raw) {
  const trimmed = String(raw || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function generateJson(client, model, prompt) {
  const data = await fetchJson(client, '/api/generate', {
    method: 'POST',
    body: { model, prompt, format: 'json', stream: false }
  });
  if (!data || typeof data.response !== 'string') throw new Error('ollama bad generate');
  return JSON.parse(cleanModelJson(data.response));
}

module.exports = {
  OLLAMA_TIMEOUT_MS,
  DEFAULT_BASE_URL,
  CLOUD_BASE_URL,
  KEY_FILE,
  readKeyFile,
  baseUrl,
  createClient,
  fetchJson,
  listModels,
  pickModel,
  activeModel,
  generateJson
};
