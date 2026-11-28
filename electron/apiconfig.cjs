'use strict';

/**
 * Bearbeitet die Zugangsdaten in der .env des Nutzers, ohne dass Werte die
 * Oberfläche erreichen: gelesen werden nur „gesetzt/fehlt“, geschrieben wird
 * atomar, damit der lokale Server nie eine halbe Datei sieht.
 */

const fs = require('node:fs');
const path = require('node:path');

const PROVIDERS = new Set(['', 'gemini', 'zai', 'ollama']);
const HEADER = [
  '# J.A.R.V.I.S. — Zugangsdaten, nur lokal auf diesem Rechner.',
  '# Diese Datei wird von der App gepflegt (Einstellungen → Zugangsdaten).',
  '',
];

let envFile = '';

function configure(file) {
  envFile = String(file || '');
}

function parse(text) {
  const values = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function readEnv() {
  try {
    return parse(fs.readFileSync(envFile, 'utf8'));
  } catch {
    return {};
  }
}

/** Status ohne Werte — nur, ob ein Key hinterlegt ist. */
function state() {
  const env = readEnv();
  const requested = String(env.AI_PROVIDER || '').toLowerCase();
  return {
    envFile,
    fileExists: fs.existsSync(envFile),
    provider: PROVIDERS.has(requested) && requested !== '' ? requested : '',
    detected: env.GEMINI_API_KEY ? 'gemini' : env.ZAI_API_KEY ? 'zai' : '',
    model: env.AI_MODEL || '',
    aiBase: env.AI_API_BASE || '',
    elevenlabsVoiceId: env.ELEVENLABS_VOICE_ID || '',
    keys: {
      gemini: Boolean(env.GEMINI_API_KEY),
      zai: Boolean(env.ZAI_API_KEY),
      custom: Boolean(env.AI_API_KEY),
      elevenlabs: Boolean(env.ELEVENLABS_API_KEY),
    },
  };
}

function normalizeSecret(value) {
  const text = String(value).trim().replace(/^["']|["']$/g, '');
  if (/[\r\n]/.test(text)) throw new Error('Ein Key darf keine Zeilenumbrüche enthalten.');
  if (text.length > 400) throw new Error('Der Key ist zu lang (mehr als 400 Zeichen).');
  return text;
}

function write(updates) {
  fs.mkdirSync(path.dirname(envFile), { recursive: true });

  const original = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original ? original.split(/\r?\n/) : [];
  const written = new Set();
  const out = [];

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !(match[1] in updates)) {
      out.push(line);
      continue;
    }
    written.add(match[1]);
    const value = updates[match[1]];
    if (value !== null) out.push(`${match[1]}=${value}`);
  }

  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  for (const [name, value] of Object.entries(updates)) {
    if (value !== null && !written.has(name)) out.push(`${name}=${value}`);
  }

  let text = out.join(eol).replace(/^(\s*\n)+/, '');
  if (!original.trim()) text = HEADER.join(eol) + text;
  if (text && !text.endsWith(eol)) text += eol;

  // Atomar ersetzen: der Server watcher sieht so nie eine halb geschriebene Datei.
  const temp = `${envFile}.tmp`;
  fs.writeFileSync(temp, text, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, envFile);
}

function save(input = {}) {
  if (!envFile) throw new Error('Kein Speicherort für Zugangsdaten bekannt.');

  const updates = {};
  const take = (value, name, kind = 'secret') => {
    if (value === undefined) return;
    if (value === null) {
      updates[name] = null;
      return;
    }
    const text = kind === 'secret' ? normalizeSecret(value) : String(value).trim();
    updates[name] = text === '' ? null : text;
  };

  if (input.provider !== undefined) {
    const provider = String(input.provider ?? '').toLowerCase();
    if (!PROVIDERS.has(provider)) throw new Error('Unbekannter Anbieter.');
    updates.AI_PROVIDER = provider === '' ? null : provider;
  }

  take(input.model, 'AI_MODEL', 'text');
  take(input.aiBase, 'AI_API_BASE', 'text');
  take(input.geminiKey, 'GEMINI_API_KEY');
  take(input.zaiKey, 'ZAI_API_KEY');
  take(input.customKey, 'AI_API_KEY');
  take(input.elevenlabsKey, 'ELEVENLABS_API_KEY');
  take(input.elevenlabsVoiceId, 'ELEVENLABS_VOICE_ID', 'text');

  write(updates);
  return state();
}

module.exports = { configure, state, save, parse };
