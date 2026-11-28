/**
 * Tageszähler für das Sprachmodell.
 *
 * Gezählt werden Prompt- und Completion-Tokens sowie Anfragen und Fehler.
 * Die Kosten sind eine Schätzung anhand einer kleinen Preistabelle (USD pro
 * Million Tokens); Anbieter ohne bekannten Preis werden als „unbepreist“
 * markiert, damit die Oberfläche keine Zahl erfindet.
 */

import fs from 'node:fs';
import path from 'node:path';

const MAX_DAYS = 31;
export const WARN_TOKENS = 250_000;
export const WARN_USD = 1;

/** Preise in USD pro 1 Mio. Tokens. */
const PRICES = [
  { provider: 'gemini', match: /^gemini-4-hydrogen/i, input: 1.5, output: 7.5 },
  { provider: 'zai', match: /^glm-4-flash/i, input: 0, output: 0 },
  { provider: 'ollama', match: /.*/, input: 0, output: 0 },
];

let file = '';
let store = { version: 1, days: {} };

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function number(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeDay(raw) {
  return {
    prompt: number(raw?.prompt),
    completion: number(raw?.completion),
    requests: number(raw?.requests),
    failures: number(raw?.failures),
    usd: Math.max(0, Number(raw?.usd) || 0),
    estimated: number(raw?.estimated),
    unpriced: number(raw?.unpriced),
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

function persist() {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  } catch {
    /* Zähler bleibt dann nur im Speicher */
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
    store.days[date] = normalizeDay({});
    prune();
  }
  return store.days[date];
}

function priceFor(provider, model) {
  const entry = PRICES.find(
    (candidate) => candidate.provider === provider && candidate.match.test(String(model || '')),
  );
  if (!entry) return null;
  return { input: entry.input, output: entry.output };
}

export function configure(next = {}) {
  if (next.file) {
    file = String(next.file);
    load();
  }
  return file;
}

export function record({ provider = '', model = '', prompt = 0, completion = 0, estimated = false } = {}) {
  const day = current();
  const promptTokens = number(prompt);
  const completionTokens = number(completion);
  day.prompt += promptTokens;
  day.completion += completionTokens;
  day.requests += 1;
  if (estimated) day.estimated += 1;

  const price = priceFor(provider, model);
  if (price) {
    day.usd += (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
  } else {
    day.unpriced += 1;
  }

  persist();
  return summary();
}

export function recordFailure({ provider = '' } = {}) {
  void provider;
  current().failures += 1;
  persist();
  return summary();
}

export function summary() {
  const today = { date: todayKey(), ...current() };
  const tokens = today.prompt + today.completion;
  const days = Object.keys(store.days)
    .sort()
    .slice(-7)
    .map((date) => {
      const day = store.days[date];
      return { date, ...day, tokens: day.prompt + day.completion };
    });

  const tooManyTokens = tokens >= WARN_TOKENS;
  const tooMuchMoney = today.usd >= WARN_USD;

  return {
    today: { ...today, tokens },
    days,
    warnTokens: WARN_TOKENS,
    warnUsd: WARN_USD,
    warning: tooManyTokens || tooMuchMoney,
    reason: tooManyTokens
      ? `${tokens.toLocaleString('de-DE')} Tokens heute (Richtwert ${WARN_TOKENS.toLocaleString('de-DE')})`
      : tooMuchMoney
        ? `geschätzt ${today.usd.toFixed(2)} US-Dollar heute`
        : '',
    priced: today.unpriced === 0,
  };
}
