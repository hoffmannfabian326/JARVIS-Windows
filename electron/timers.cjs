'use strict';

/**
 * Persistente Timer und Wecker im Hauptprozess.
 *
 * Der Renderer zeigt sie nur an: Wer hier einen Timer stellt, verliert ihn
 * auch dann nicht, wenn das Fenster geschlossen oder die App neu gestartet
 * wird. Verpasste Termine werden beim Start einmal nachgemeldet.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_ITEMS = 100;
const MAX_FUTURE = 366 * 24 * 60 * 60 * 1000;

let file = '';
let items = [];
let missed = [];
let timer = null;
let onDue = null;

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const due = Number(raw.due);
  if (!Number.isFinite(due) || due <= 0) return null;
  const kind = raw.kind === 'alarm' ? 'alarm' : 'timer';
  return {
    id: String(raw.id || `tmr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`).slice(0, 60),
    label: String(raw.label || (kind === 'alarm' ? 'Wecker' : 'Timer')).slice(0, 80),
    kind,
    due: Math.round(due),
    createdAt: Number(raw.createdAt) || Date.now(),
  };
}

function persist() {
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify({ version: 1, items }, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  } catch {
    /* Timer bleiben dann nur im Speicher */
  }
}

function load() {
  items = [];
  missed = [];
  if (!file) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.items)) return;
    const now = Date.now();
    for (const raw of parsed.items.slice(0, MAX_ITEMS)) {
      const entry = normalize(raw);
      if (!entry) continue;
      if (entry.due <= now) missed.push(entry);
      else items.push(entry);
    }
    persist();
  } catch {
    /* erste Sitzung oder beschädigte Datei */
  }
}

function list() {
  return [...items].sort((a, b) => a.due - b.due);
}

function add(payload = {}) {
  const kind = payload.kind === 'alarm' ? 'alarm' : 'timer';
  const now = Date.now();
  const due = Math.min(now + MAX_FUTURE, Math.max(now + 1000, Math.round(Number(payload.due) || 0)));
  const entry = normalize({
    id: payload.id,
    label: payload.label,
    kind,
    due,
    createdAt: now,
  });
  if (!entry) return null;
  items.push(entry);
  items = items.sort((a, b) => a.due - b.due).slice(0, MAX_ITEMS);
  persist();
  schedule();
  return entry;
}

function remove(id) {
  const key = String(id || '');
  const before = items.length;
  items = items.filter((entry) => entry.id !== key);
  if (items.length === before) return { ok: false, error: 'not_found' };
  persist();
  schedule();
  return { ok: true };
}

function consumeMissed() {
  const pending = missed.slice();
  missed = [];
  return pending;
}

/** Hält fällige Termine zurück, bis der Renderer zuhören kann. */
function hold(entries) {
  for (const raw of Array.isArray(entries) ? entries : []) {
    const entry = normalize(raw);
    if (entry) missed.push(entry);
  }
  if (missed.length > MAX_ITEMS) missed = missed.slice(-MAX_ITEMS);
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (items.length === 0) return;

  const next = Math.min(...items.map((entry) => entry.due));
  const delay = Math.max(0, next - Date.now());
  timer = setTimeout(fire, Math.min(delay, 2_147_000_000));
  timer.unref?.();
}

function fire() {
  const now = Date.now();
  const due = items.filter((entry) => entry.due <= now);
  if (due.length === 0) {
    schedule();
    return;
  }
  items = items.filter((entry) => entry.due > now);
  persist();
  schedule();
  if (typeof onDue === 'function') {
    try {
      onDue(due);
    } catch {
      /* Der Melder darf den Zeitgeber nicht stoppen. */
    }
  }
}

function configure(next = {}) {
  if (next.file) file = String(next.file);
  if (next.onDue) onDue = next.onDue;
  load();
  schedule();
}

module.exports = { configure, list, add, remove, consumeMissed, hold, schedule };
