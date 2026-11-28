'use strict';

/** Speichert die systemweiten Tastenkürzel in <userData>/hotkeys.json. */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  listen: 'CommandOrControl+Shift+J',
  ptt: 'CommandOrControl+Alt+Space',
};

let file = '';
let current = { ...DEFAULTS };

function configure({ dir }) {
  file = path.join(String(dir), 'hotkeys.json');
  current = { ...DEFAULTS };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof parsed.listen === 'string' && parsed.listen.trim()) current.listen = parsed.listen.trim();
    if (typeof parsed.ptt === 'string' && parsed.ptt.trim()) current.ptt = parsed.ptt.trim();
  } catch {
    /* keine oder defekte Datei: Standard gilt */
  }
  return all();
}

function all() {
  return { ...current, defaults: { ...DEFAULTS } };
}

function persist(next) {
  current = { ...current, ...next };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ listen: current.listen, ptt: current.ptt }, null, 2));
  } catch {
    /* schreibgeschützt: Kürzel gelten bis zum Neustart */
  }
}

module.exports = { configure, all, persist, DEFAULTS };
