'use strict';

/**
 * Lokales Aktivitätsprotokoll: was Jarvis tatsächlich getan hat.
 *
 * Eine Zeile pro Aktion, niemals Inhalte von Zugangsdaten. Die Datei wächst
 * nur bis 256 KB, danach wird sie einmalig weggeräumt. Sie ist die Grundlage
 * für „Was hast du zuletzt getan?“ und für das kleine Rückgängig.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_ENTRIES = 200;
const MAX_BYTES = 256 * 1024;
const SECRET_KEY = /(key|token|secret|passwor|authorization|cookie|bearer)/i;

let file = '';
let entries = [];

function clean(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.slice(0, 200);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 1) return '…';
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => clean(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 12)) {
      out[key] = SECRET_KEY.test(key) ? '***' : clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

function readFile() {
  entries = [];
  if (!file) return;
  try {
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed.tool === 'string') entries.push(parsed);
      } catch {
        /* einzelne beschädigte Zeile überspringen */
      }
    }
    entries = entries.slice(-MAX_ENTRIES);
  } catch {
    /* erste Sitzung */
  }
}

function rotate() {
  try {
    if (!file || !fs.existsSync(file)) return;
    if (fs.statSync(file).size < MAX_BYTES) return;
    fs.rmSync(`${file}.alt`, { force: true });
    fs.renameSync(file, `${file}.alt`);
  } catch {
    /* Rotation ist nur Komfort */
  }
}

function append(input = {}) {
  const tool = String(input.tool || '').slice(0, 60);
  if (!tool) return { ok: false, error: 'invalid' };
  const undo =
    input.undo && typeof input.undo === 'object' && ['note', 'timer'].includes(input.undo.type)
      ? { type: input.undo.type, id: String(input.undo.id || '').slice(0, 60) }
      : undefined;

  const entry = {
    id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    tool,
    ok: Boolean(input.ok),
    summary: String(input.summary || '').replace(/\s+/g, ' ').slice(0, 240),
    args: clean(input.args && typeof input.args === 'object' ? input.args : {}),
    ...(undo && undo.id ? { undo } : {}),
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotate();
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* Protokoll bleibt im Speicher */
  }
  return { ok: true, entry };
}

function recent(limit = 30) {
  const count = Math.max(1, Math.min(MAX_ENTRIES, Number(limit) || 30));
  return entries.slice(-count).reverse();
}

function configure(next = {}) {
  if (next.file) file = String(next.file);
  readFile();
}

module.exports = { configure, append, recent };
