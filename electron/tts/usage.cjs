'use strict';

/**
 * Tageszähler für die Cloud-Stimme. ElevenLabs rechnet in Zeichen, nicht in
 * Tokens; gespeichert werden deshalb Zeichen, Synthese-Aufrufe und Fehler.
 * Die Datei liegt im Benutzerverzeichnis und überdauert Neustarts.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_DAYS = 31;
const WARN_CHARACTERS = 5000;
const WARN_FAILURES = 3;

let file = '';
let store = { version: 1, days: {} };

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDay(raw) {
  const number = (value) => Math.max(0, Math.round(Number(value) || 0));
  return {
    characters: number(raw?.characters),
    requests: number(raw?.requests),
    failures: number(raw?.failures),
    lastError: typeof raw?.lastError === 'string' ? raw.lastError.slice(0, 300) : '',
    lastErrorAt: number(raw?.lastErrorAt),
  };
}

function load() {
  store = { version: 1, days: {} };
  if (!file) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.days || typeof parsed.days !== 'object') return;
    for (const [date, value] of Object.entries(parsed.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      store.days[date] = normalizeDay(value);
    }
    prune();
  } catch {
    /* erste Sitzung oder beschädigte Datei */
  }
}

function save() {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  } catch {
    /* Nutzung bleibt dann nur im Speicher */
  }
}

function prune() {
  const dates = Object.keys(store.days).sort();
  while (dates.length > MAX_DAYS) {
    delete store.days[dates.shift()];
  }
}

function current() {
  const date = todayKey();
  if (!store.days[date]) {
    store.days[date] = { characters: 0, requests: 0, failures: 0, lastError: '', lastErrorAt: 0 };
    prune();
  }
  return store.days[date];
}

function configure(next = {}) {
  if (next.file) {
    file = String(next.file);
    load();
  }
  return file;
}

function recordSuccess(characters) {
  const day = current();
  const count = Math.max(0, Math.min(100_000, Math.round(Number(characters) || 0)));
  day.characters += count;
  day.requests += 1;
  // Ein Erfolg beendet die Fehlerserie; sonst bliebe eine alte Warnung stehen.
  day.failures = 0;
  day.lastError = '';
  day.lastErrorAt = 0;
  save();
  return summary();
}

function recordFailure(message = '') {
  const day = current();
  day.failures += 1;
  day.lastError = String(message ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  day.lastErrorAt = Date.now();
  save();
  return summary();
}

function summary() {
  const today = { date: todayKey(), ...current() };
  const days = Object.keys(store.days)
    .sort()
    .slice(-7)
    .map((date) => ({ date, ...store.days[date] }));

  const tooManyCharacters = today.characters >= WARN_CHARACTERS;
  const tooManyFailures = today.failures >= WARN_FAILURES;

  return {
    today,
    days,
    warnCharacters: WARN_CHARACTERS,
    warnFailures: WARN_FAILURES,
    warning: tooManyCharacters || tooManyFailures,
    reason: tooManyCharacters
      ? `${today.characters.toLocaleString('de-DE')} Zeichen heute (Richtwert ${WARN_CHARACTERS.toLocaleString('de-DE')})`
      : tooManyFailures
        ? `${today.failures} fehlgeschlagene Cloud-Aufrufe in Folge`
        : '',
  };
}

module.exports = {
  configure,
  recordSuccess,
  recordFailure,
  summary,
  todayKey,
  WARN_CHARACTERS,
  WARN_FAILURES,
};
