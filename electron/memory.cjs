'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_ITEMS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;

function filePath(app) {
  return path.join(app.getPath('userData'), 'memory.json');
}

function load(app) {
  try {
    const file = filePath(app);
    if (!fs.existsSync(file)) return null;
    if (fs.statSync(file).size > MAX_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch (error) {
    console.warn('[jarvis] Gedächtnis konnte nicht geladen werden:', error.message);
    return null;
  }
}

function save(app, data) {
  try {
    if (!data || !Array.isArray(data.items)) return { ok: false, error: 'invalid' };
    const file = filePath(app);
    const payload = {
      version: Number(data.version) || 2,
      items: data.items.slice(0, MAX_ITEMS),
    };
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) {
      return { ok: false, error: 'too_large' };
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, serialized, 'utf8');
    fs.renameSync(temp, file);
    return { ok: true, count: payload.items.length };
  } catch (error) {
    console.warn('[jarvis] Gedächtnis konnte nicht gespeichert werden:', error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = { load, save, filePath };
