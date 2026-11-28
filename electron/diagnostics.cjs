'use strict';

/**
 * Fehlerprogramm: fängt Abstürze und Ausnahmen ab, schreibt ein lesbares
 * Protokoll nach <userData>/logs/fehler.log und bietet dem Nutzer, den
 * Bericht zu kopieren oder den Ordner zu öffnen. Keys und Tokens werden
 * beim Mitschreiben maskiert.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MAX_LOG_BYTES = 512 * 1024;
const MAX_ENTRIES = 200;
const SECRET_KEY = /(key|token|secret|passwor|authorization|cookie|bearer)/i;

let refs = {};
let logDir = '';
let logFile = '';
let fatalOpen = false;
let counter = 0;
const entries = [];

/* ------------------------------------------------------------------ Helfer */

const IMAGE_DATA = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{16,}/gi;

/** Bilddaten gehören niemals ins Protokoll — nur der Hinweis darauf. */
function redact(text) {
  const value = String(text ?? '');
  if (/^data:image\//i.test(value)) return '[Bild entfernt]';
  return value.replace(IMAGE_DATA, '[Bild entfernt]');
}

function clean(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redact(value).slice(0, 600);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 2) return '…';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => clean(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 24)) {
      out[key] = SECRET_KEY.test(key) ? '***' : clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

function stamp(at) {
  const date = new Date(at);
  return date.toLocaleString('de-DE', { hour12: false });
}

function reasonText(reason) {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(clean(reason));
  } catch {
    return String(reason);
  }
}

function environment() {
  const app = refs.app;
  const version = app?.getVersion ? app.getVersion() : '0.0.0';
  return [
    `J.A.R.V.I.S. ${version}`,
    `${process.platform} ${process.arch}`,
    `Electron ${process.versions.electron ?? '—'}`,
    `Node ${process.versions.node}`,
  ].join(' · ');
}

function formatEntry(entry) {
  const lines = [`[${stamp(entry.at)}] ${entry.level.toUpperCase()} · ${entry.source}`, `  ${entry.message}`];
  if (entry.context && Object.keys(entry.context).length > 0) {
    lines.push(`  Kontext: ${JSON.stringify(entry.context)}`);
  }
  if (entry.stack) {
    lines.push(
      entry.stack
        .split('\n')
        .slice(0, 24)
        .map((line) => `  ${line.trim()}`)
        .join('\n'),
    );
  }
  return lines.join('\n');
}

function formatReport(list) {
  const header = [
    'J.A.R.V.I.S. Fehlerbericht',
    `Erstellt: ${stamp(Date.now())}`,
    environment(),
    `Protokoll: ${logFile || '—'}`,
    ''.padEnd(58, '-'),
  ];
  const body = list.length ? list.map(formatEntry).join('\n\n') : 'Keine Fehler aufgezeichnet.';
  return `${header.join('\n')}\n${body}\n`;
}

function rotate() {
  try {
    if (!fs.existsSync(logFile)) return;
    if (fs.statSync(logFile).size < MAX_LOG_BYTES) return;
    const previous = path.join(logDir, 'fehler.alt.log');
    fs.rmSync(previous, { force: true });
    fs.renameSync(logFile, previous);
  } catch {
    /* Rotation ist nur Komfort, das Protokoll bleibt schreibbar */
  }
}

function write(entry) {
  if (!logFile) return;
  try {
    rotate();
    fs.appendFileSync(logFile, `${formatEntry(entry)}\n\n`, 'utf8');
  } catch {
    /* schreibgeschützter Ordner: Einträge bleiben im Speicher */
  }
}

/* --------------------------------------------------------------------- API */

function init(options = {}) {
  refs = { ...refs, ...options };
  if (!logFile) {
    const base = refs.app?.getPath ? refs.app.getPath('userData') : path.join(os.tmpdir(), 'jarvis');
    logDir = path.join(base, 'logs');
    logFile = path.join(logDir, 'fehler.log');
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch {
      /* Ordner evtl. schreibgeschützt */
    }
    write({ at: Date.now(), level: 'info', source: 'Start', message: `Sitzung gestartet · ${environment()}` });
  }
  installProcessHandlers();
  return api;
}

function record(input = {}) {
  const level = ['info', 'warning', 'error', 'fatal'].includes(input.level) ? input.level : 'error';
  const entry = {
    id: `F-${Date.now().toString(36)}-${(counter += 1)}`,
    at: Date.now(),
    level,
    source: String(input.source || 'unbekannt').slice(0, 80),
    message: redact(input.message || 'Unbekannter Fehler').slice(0, 2000),
    stack: redact(input.stack || '').slice(0, 12000),
    context: input.context && typeof input.context === 'object' ? clean(input.context) : null,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  write(entry);
  if (level === 'error' || level === 'fatal') {
    console.error(`[jarvis] ${level} (${entry.source}): ${entry.message}`);
  } else if (level === 'warning') {
    console.warn(`[jarvis] ${entry.source}: ${entry.message}`);
  }
  return entry;
}

function recent(limit = 25) {
  return entries.slice(-limit).map((entry) => ({
    at: entry.at,
    level: entry.level,
    source: entry.source,
    message: entry.message,
  }));
}

function report() {
  let text = '';
  try {
    text = fs.readFileSync(logFile, 'utf8');
  } catch {
    text = formatReport(entries);
  }
  return {
    ok: true,
    file: logFile,
    dir: logDir,
    text: text.slice(-60000),
    entries: recent(25),
    count: entries.filter((entry) => entry.level === 'error' || entry.level === 'fatal').length,
  };
}

async function openFolder() {
  if (!logDir || !refs.shell) return { ok: false, error: 'Logordner nicht verfügbar' };
  try {
    const error = await refs.shell.openPath(logDir);
    return error ? { ok: false, error } : { ok: true };
  } catch (error) {
    return { ok: false, error: reasonText(error) };
  }
}

function copy(list) {
  if (!refs.clipboard) return false;
  try {
    refs.clipboard.writeText(formatReport(list));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- Absturzmelder */

function presentFatal(entry) {
  if (!refs.dialog || fatalOpen) return;
  fatalOpen = true;
  try {
    const choice = refs.dialog.showMessageBoxSync({
      type: 'error',
      title: 'J.A.R.V.I.S. — Systemstörung',
      message: (entry.message || 'Unbekannter Fehler').slice(0, 300),
      detail: [
        `Quelle: ${entry.source}`,
        `Zeitpunkt: ${stamp(entry.at)}`,
        environment(),
        '',
        'Das vollständige Protokoll liegt unter:',
        logFile || logDir || '—',
        '',
        '„Bericht kopieren“ legt alles in die Zwischenablage — praktisch für eine Fehlermeldung.',
      ].join('\n'),
      buttons: ['Bericht kopieren', 'Logordner öffnen', 'Neu starten', 'Schließen'],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    });

    if (choice === 0) {
      const ok = copy([entry]);
      refs.dialog.showMessageBoxSync({
        type: ok ? 'info' : 'warning',
        title: 'Fehlerbericht',
        message: ok ? 'Fehlerbericht kopiert' : 'Zwischenablage nicht verfügbar',
        detail: ok
          ? 'Der vollständige Bericht steckt jetzt in der Zwischenablage.'
          : `Bitte den Ordner öffnen und fehler.log weitergeben: ${logDir || '—'}`,
        buttons: ['OK'],
      });
      return;
    }
    if (choice === 1) {
      void openFolder();
      return;
    }
    if (choice === 2) {
      refs.app?.relaunch?.();
      refs.app?.exit?.(1);
    }
  } catch {
    /* Der Melder darf selbst niemals werfen. */
  } finally {
    fatalOpen = false;
  }
}

function installProcessHandlers() {
  if (refs.installed) return;
  refs.installed = true;

  process.on('uncaughtException', (error) => {
    const entry = record({
      level: 'fatal',
      source: 'Hauptprozess',
      message: error?.message || 'Unbehandelte Ausnahme',
      stack: error?.stack,
    });
    presentFatal(entry);
  });

  process.on('unhandledRejection', (reason) => {
    record({
      level: 'error',
      source: 'Hauptprozess · Promise',
      message: reasonText(reason),
      stack: reason instanceof Error ? reason.stack : '',
    });
  });
}

function promptReload(win, reason) {
  if (!refs.dialog || !win) return;
  try {
    const choice = refs.dialog.showMessageBoxSync(win, {
      type: 'error',
      title: 'J.A.R.V.I.S. — Oberfläche neu starten',
      message: 'Die Oberfläche wurde unerwartet beendet.',
      detail: [
        `Ursache: ${reason || 'unbekannt'}`,
        'Der Fehler steht im Protokoll:',
        logFile || '—',
        '',
        'Neu laden bringt das Fenster meist sofort zurück.',
      ].join('\n'),
      buttons: ['Neu laden', 'Logordner öffnen', 'Schließen'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (choice === 0) win.reload();
    if (choice === 1) void openFolder();
  } catch {
    /* ignore */
  }
}

function attachWindow(win) {
  const contents = win?.webContents;
  if (!contents) return;

  contents.on('render-process-gone', (_event, details) => {
    record({
      level: 'fatal',
      source: 'Oberfläche',
      message: `Oberfläche beendet (${details?.reason || 'unbekannt'})`,
      context: { exitCode: details?.exitCode },
    });
    promptReload(win, details?.reason);
  });

  contents.on('preload-error', (_event, file, error) => {
    record({
      level: 'error',
      source: 'Vorschaltskript',
      message: error?.message || 'Vorschaltskript fehlgeschlagen',
      stack: error?.stack,
      context: { file },
    });
  });

  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return;
    record({
      level: 'error',
      source: 'Fenster',
      message: `Seite nicht geladen: ${description} (${code})`,
      context: { url },
    });
  });

  contents.on('unresponsive', () => {
    record({ level: 'warning', source: 'Fenster', message: 'Fenster reagiert nicht mehr' });
  });
  contents.on('responsive', () => {
    record({ level: 'info', source: 'Fenster', message: 'Fenster reagiert wieder' });
  });
}

function inform(message, detail) {
  if (!refs.dialog) return;
  try {
    refs.dialog.showMessageBoxSync({
      type: 'warning',
      title: 'J.A.R.V.I.S. — Hinweis',
      message,
      detail,
      buttons: ['OK'],
    });
  } catch {
    /* ignore */
  }
}

const api = {
  init,
  record,
  recent,
  report,
  openFolder,
  formatReport,
  attachWindow,
  presentFatal,
  inform,
  paths: () => ({ logFile, logDir }),
};

module.exports = api;
