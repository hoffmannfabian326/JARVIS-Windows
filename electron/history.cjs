'use strict';

/**
 * Gesprächsverlauf auf der Platte.
 *
 * Bewusst klein gehalten: die letzten 20 Gespräche, höchstens 60 Beiträge
 * pro Gespräch. Die Zusammenfassung kommt vom Modell und hält den Kontext
 * langfristig bezahlbar.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_CONVERSATIONS = 20;
const MAX_TURNS = 60;

let file = '';
let store = { version: 1, items: [] };

function normalizeTurn(raw) {
  if (!raw || (raw.role !== 'user' && raw.role !== 'assistant')) return null;
  const content = String(raw.content ?? '').replace(/\s+$/g, '').slice(0, 4000);
  if (!content.trim()) return null;
  return { role: raw.role, content };
}

function normalizeConversation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const turns = (Array.isArray(raw.turns) ? raw.turns : []).map(normalizeTurn).filter(Boolean).slice(-MAX_TURNS);
  if (turns.length === 0) return null;
  const id = String(raw.id || `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`).slice(0, 60);
  return {
    id,
    title: String(raw.title || 'Gespräch').replace(/\s+/g, ' ').slice(0, 80),
    startedAt: Number(raw.startedAt) || Number(raw.updatedAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    summary: String(raw.summary || '').slice(0, 1200),
    turns,
  };
}

function load() {
  store = { version: 1, items: [] };
  if (!file) return;
  try {
    // Die Datei wird beim Speichern bereits auf 20 Gespräche gekappt. Eine
    // zusätzliche Größenprüfung würde bei einer etwas größeren Datei den
    // gesamten Verlauf stillschweigend verwerfen.
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.items)) return;
    store.items = parsed.items
      .map(normalizeConversation)
      .filter(Boolean)
      .slice(0, MAX_CONVERSATIONS);
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
    /* Verlauf bleibt dann nur im Speicher */
  }
}

function list() {
  return [...store.items]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      startedAt: entry.startedAt,
      updatedAt: entry.updatedAt,
      summary: entry.summary,
      turns: entry.turns.length,
    }));
}

function loadOne(id) {
  return store.items.find((entry) => entry.id === String(id || '')) || null;
}

function save(payload = {}) {
  const normalized = normalizeConversation(payload);
  if (!normalized) return { ok: false, error: 'invalid' };
  const existing = store.items.findIndex((entry) => entry.id === normalized.id);
  if (existing >= 0) store.items[existing] = normalized;
  else store.items.push(normalized);
  store.items = store.items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
  persist();
  return { ok: true, item: normalized };
}

function remove(id) {
  const before = store.items.length;
  store.items = store.items.filter((entry) => entry.id !== String(id || ''));
  if (store.items.length === before) return { ok: false, error: 'not_found' };
  persist();
  return { ok: true };
}

function configure(next = {}) {
  if (next.file) file = String(next.file);
  load();
}

module.exports = { configure, list, load: loadOne, save, remove };
