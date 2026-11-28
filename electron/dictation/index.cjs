'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const SCRIPTS = {
  listen: path.join(__dirname, 'listen.ps1'),
  confirm: path.join(__dirname, 'confirm.ps1'),
  paste: path.join(__dirname, 'paste.ps1'),
};

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: 'timeout' });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => finish({ ok: false, error: error.message }));
    child.on('close', () => {
      const raw = stdout.trim();
      if (raw) {
        try {
          const parsed = JSON.parse(raw.split('\n').pop());
          finish(parsed);
          return;
        } catch {
          /* kein JSON: Fallback unten */
        }
      }
      finish({ ok: false, error: (stderr || raw || 'keine Antwort').slice(0, 200) });
    });
  });
}

function available() {
  return process.platform === 'win32';
}

/** Einmalige Diktataufnahme über die Windows-Spracherkennung (SAPI, offline). */
async function listen({ culture = 'de-DE', seconds = 12 } = {}) {
  if (!available()) {
    return { ok: false, error: 'Diktat wird derzeit nur unter Windows unterstützt.' };
  }
  const timeout = Math.min(25, Math.max(4, Number(seconds) || 12));
  return run(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-STA',
      '-File',
      SCRIPTS.listen,
      '-Culture',
      culture,
      '-Seconds',
      String(timeout),
    ],
    (timeout + 8) * 1000,
  );
}

/** Kurze Ja/Nein-Bestätigung mit kleinem Regelvokabular. */
async function confirm({ culture = 'de-DE', seconds = 6 } = {}) {
  if (!available()) {
    return { ok: false, error: 'Sprachbestätigung wird derzeit nur unter Windows unterstützt.' };
  }
  const timeout = Math.min(10, Math.max(3, Number(seconds) || 6));
  return run(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-STA',
      '-File',
      SCRIPTS.confirm,
      '-Culture',
      culture,
      '-Seconds',
      String(timeout),
    ],
    (timeout + 6) * 1000,
  );
}

/** Fügt Text ins aktive Fenster ein (Zwischenablage + Paste, Clipboard wird zurückgesetzt). */
async function typeText(text) {
  if (!text || !String(text).trim()) return { ok: false, error: 'leerer Text' };

  if (process.platform === 'win32') {
    const base64 = Buffer.from(String(text), 'utf8').toString('base64');
    return run(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', SCRIPTS.paste, '-Base64', base64],
      8000,
    );
  }

  if (process.platform === 'darwin') {
    // AppleScript: Text über argv, keine Shell-Interpolation.
    return run(
      'osascript',
      [
        '-e',
        'on run argv\nset the clipboard to item 1 of argv\ntell application "System Events" to keystroke "v" using command down\nend run',
        String(text),
      ],
      8000,
    );
  }

  // Linux: xdotool tippt direkt, ohne die Zwischenablage zu belegen.
  const result = await run('xdotool', ['type', '--clearmodifiers', '--delay', '8', '--', String(text)], 15000);
  if (result.ok) return result;
  return { ok: false, error: result.error || 'xdotool nicht verfügbar' };
}

module.exports = { available, listen, confirm, typeText };
