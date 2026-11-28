'use strict';

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
  dialog,
  clipboard,
  powerMonitor,
  Notification,
  desktopCapturer,
} = require('electron');
const { mediaCommand, volumeCommand, lockCommand, openAppCommand, openUrlCommand } = require('./platform.cjs');
const { WakeEngine } = require('./wake/engine.cjs');
const monitor = require('./monitor.cjs');
const dictation = require('./dictation/index.cjs');
const piper = require('./tts/piper.cjs');
const elevenlabs = require('./tts/elevenlabs.cjs');
const ttsUsage = require('./tts/usage.cjs');
const memory = require('./memory.cjs');
const diagnostics = require('./diagnostics.cjs');
const apiconfig = require('./apiconfig.cjs');
const shortcuts = require('./hotkeys.cjs');
const timers = require('./timers.cjs');
const activity = require('./activity.cjs');
const history = require('./history.cjs');
const { SherpaStt, MODEL_NAME: STT_MODEL } = require('./stt/sherpa.cjs');
const updater = require('./updater.cjs');

app.setName('JARVIS');

const ROOT = path.join(__dirname, '..');
const DEFAULT_HOTKEYS = { listen: 'CommandOrControl+Shift+J', ptt: 'CommandOrControl+Alt+Space' };
let hotkeys = { ...DEFAULT_HOTKEYS };
let hotkeyState = { listen: false, ptt: false };
let wakeOnBattery = true;
let screenLocked = false;
let wakePausedReason = '';
const DESKTOP_PORTS = [8789, 8790, 8791, 8792];
const isDev = process.argv.includes('--dev');

// Im Entwicklungsmodus liegt die .env im Projektordner, in der App in userData;
// startServer() zeigt den Pfad gleich noch einmal auf die richtige Datei.
elevenlabs.configure({ envFile: path.join(ROOT, '.env') });
const startHidden = process.argv.includes('--hidden');

// Fehlerprogramm so früh wie möglich scharf schalten: alles ab hier landet im Protokoll.
diagnostics.init({ app, dialog, clipboard, shell });
ttsUsage.configure({ file: path.join(app.getPath('userData'), 'tts-usage.json') });
timers.configure({
  file: path.join(app.getPath('userData'), 'timers.json'),
  onDue: handleTimerDue,
});
activity.configure({ file: path.join(app.getPath('userData'), 'activity.jsonl') });
history.configure({ file: path.join(app.getPath('userData'), 'history.json') });

let win = null;
let rendererReady = false;
let tray = null;
let serverProcess = null;
let wakeWindow = null;
let wakeEngine = null;
let wakeCaptureError = '';
let appUrl = isDev ? 'http://localhost:3000' : '';
let quitting = false;

// Lokale Streaming-Spracherkennung. Wird erst beim ersten Zuhören geladen,
// damit Startzeit und Speicher unverändert bleiben, solange sie ungenutzt ist.
const stt = new SherpaStt({
  candidates: [
    process.env.JARVIS_STT_MODEL || '',
    path.join(app.getPath('userData'), 'stt-models', STT_MODEL),
    path.join(process.resourcesPath || '', 'models', 'stt', STT_MODEL),
    path.join(ROOT, 'models', 'stt', STT_MODEL),
  ],
  onPartial: (text) => sendToWin('jarvis:stt-partial', text),
  onFinal: (text) => sendToWin('jarvis:stt-final', text),
  onError: (message) => {
    diagnostics.record({ level: 'warning', source: 'Spracherkennung', message: String(message).slice(0, 200) });
    sendToWin('jarvis:stt-error', message);
  },
});

/* ------------------------------------------------------------------ Helfer */

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 6000, windowsHide: true, ...options },
      (error, stdout, stderr) => {
        const output = String(stdout ?? '').trim();
        if (error) {
          resolve({
            ok: false,
            message: String(stderr || error.message).trim().slice(0, 200) || 'Befehl fehlgeschlagen',
          });
          return;
        }
        resolve({ ok: true, message: output.slice(0, 200) });
      },
    );
  });
}

async function runSpec(spec) {
  if (!spec) return { ok: false, message: 'nicht unterstützt' };
  if (spec.error) return { ok: false, message: 'ungültiger Name' };
  const options = spec.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {};
  const first = await run(spec.command, spec.args, options);
  if (first.ok || !spec.fallback) return first;
  return run(spec.fallback.command, spec.fallback.args);
}

function waitForHealth(port, attempts = 60) {
  return new Promise((resolve) => {
    let tries = 0;
    const probe = () => {
      tries += 1;
      const request = http.get(
        { host: '127.0.0.1', port, path: '/api/health', timeout: 400 },
        (response) => {
          response.resume();
          if (response.statusCode === 200) resolve(true);
          else retry();
        },
      );
      request.on('error', retry);
      request.on('timeout', () => {
        request.destroy();
        retry();
      });
    };
    const retry = () => {
      if (tries >= attempts) resolve(false);
      else setTimeout(probe, 200);
    };
    probe();
  });
}

function ensureUserEnv() {
  const file = path.join(app.getPath('userData'), '.env');
  if (fs.existsSync(file)) return file;
  const example = fs.existsSync(path.join(process.resourcesPath, '.env.example'))
    ? path.join(process.resourcesPath, '.env.example')
    : path.join(ROOT, '.env.example');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(example)) fs.copyFileSync(example, file);
    else fs.writeFileSync(file, '# AI_PROVIDER=groq\n# GROQ_API_KEY=...\n# ZAI_API_KEY=...\n');
  } catch {
    /* schreibgeschützt: der Proxy läuft dann ohne Key */
  }
  return file;
}

async function startServer() {
  const envFile = ensureUserEnv();
  elevenlabs.configure({ envFile });
  for (const port of DESKTOP_PORTS) {
    const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(port),
        SERVE_DIST: '1',
        JARVIS_ENV_FILE: envFile,
        JARVIS_DATA_DIR: app.getPath('userData'),
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    if (await waitForHealth(port)) {
      serverProcess = child;
      return `http://127.0.0.1:${port}/`;
    }
    child.kill();
  }
  return '';
}

/* ---------------------------------------------------------------- Autostart */

function linuxAutostartFile() {
  return path.join(app.getPath('home'), '.config', 'autostart', 'jarvis.desktop');
}

function getAutostart() {
  if (process.platform === 'linux') return fs.existsSync(linuxAutostartFile());
  return app.getLoginItemSettings().openAtLogin;
}

function setAutostart(enabled) {
  if (process.platform === 'linux') {
    const file = linuxAutostartFile();
    if (!enabled) {
      fs.rmSync(file, { force: true });
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const exec = `"${process.execPath}" "${app.getAppPath()}" --hidden`;
    fs.writeFileSync(
      file,
      ['[Desktop Entry]', 'Type=Application', 'Name=J.A.R.V.I.S.', `Exec=${exec}`, 'X-GNOME-Autostart-enabled=true', ''].join('\n'),
    );
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: ['--hidden'] });
}

/* ------------------------------------------------------------ Weckwort/PTT */

function modelsDir() {
  const packaged = path.join(process.resourcesPath, 'models');
  return fs.existsSync(packaged) ? packaged : path.join(ROOT, 'models');
}

function configurePiper() {
  const exeName = process.platform === 'win32' ? 'piper.exe' : 'piper';
  const packagedDir = path.join(process.resourcesPath, 'piper');
  const exeDir = fs.existsSync(packagedDir) ? packagedDir : path.join(ROOT, 'piper');
  piper.configure({ exe: path.join(exeDir, exeName), voiceDir: path.join(modelsDir(), 'piper') });
}

// Schon vor dem ersten Fenster konfigurieren, damit die Stimme sofort bereitsteht.
configurePiper();

function createWakeWindow() {
  if (wakeWindow) return;
  wakeWindow = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    frame: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'wake-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  wakeWindow.loadFile(path.join(__dirname, 'wake.html'));
  wakeWindow.on('closed', () => {
    wakeWindow = null;
  });
}

async function startWake() {
  wakeEngine = new WakeEngine({
    modelsDir: modelsDir(),
    onWake: ({ score }) => handleWake('wake', score),
  });
  const ready = await wakeEngine.init();
  if (ready) createWakeWindow();
  else console.warn('[jarvis] Offline-Weckwort inaktiv:', wakeEngine.reason);
}

/**
 * Energiesparmodus: bei Akkubetrieb oder gesperrtem Bildschirm pausiert das
 * Offline-Weckwort, damit nicht dauerhaft CPU für die Inferenz draufgeht.
 * Push-to-talk und der globale Hotkey bleiben davon unberührt.
 */
function applyWakePolicy() {
  const next = wakeOnBattery && powerMonitor.isOnBatteryPower()
    ? 'Akkubetrieb'
    : screenLocked
      ? 'Bildschirm gesperrt'
      : '';

  if (next && next !== wakePausedReason) wakeEngine?.pause();
  if (!next && wakePausedReason) wakeEngine?.resume();
  if (next !== wakePausedReason) refreshTrayMenu();
  wakePausedReason = next;
  return wakePausedReason;
}

/** Zeigt das Fenster und signalisiert dem Renderer den Zuhörmodus. */
function handleWake(source, score = null) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('jarvis:wake', { source, score });
}

let dictationMode = false;

/**
 * Push-to-talk: im Diktat-Modus darf das Fenster den Fokus nicht übernehmen,
 * sonst landet der erkannte Text in JARVIS statt im zuvor aktiven Programm.
 */
function handlePtt() {
  if (!win) return;
  if (dictationMode) {
    win.webContents.send('jarvis:wake', { source: 'ptt', score: null });
    return;
  }
  handleWake('ptt');
}

/** Meldet fällige Timer: Systembenachrichtigung, Fenstersignal, Protokoll. */
function handleTimerDue(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  const body = entries
    .map((entry) => (entry.label ? `${entry.label} ist fällig.` : 'Ein Timer ist fällig.'))
    .join(' ');

  try {
    if (Notification.isSupported()) {
      new Notification({ title: 'J.A.R.V.I.S. — Timer', body, silent: false }).show();
    }
  } catch {
    /* Ohne Benachrichtigungsdienst bleibt die Sprachansage. */
  }

  // Beim Start kann ein Termin fällig werden, bevor der Renderer seinen
  // Zuhörer registriert hat. Dann warten die Einträge auf timersReady.
  if (!rendererReady) timers.hold(entries);
  else {
    try {
      win?.flashFrame(true);
      win?.webContents.send('jarvis:timer-due', entries);
    } catch {
      /* Fenster kann bereits geschlossen sein. */
    }
  }

  diagnostics.record({ level: 'info', source: 'Timer', message: body.slice(0, 200) });
}

/** Führt eine Aufnahme aus, ohne dass das Weckwort dazwischenfunkt. */
async function withWakePaused(task) {
  wakeEngine?.pause();
  try {
    return await task();
  } finally {
    // Eine laufende lokale Erkennung braucht das Mikrofon weiterhin.
    if (stt.isActive()) return;
    if (wakePausedReason) applyWakePolicy();
    else wakeEngine?.resume();
  }
}

/** Schickt eine Nachricht an das Hauptfenster, falls es noch existiert. */
function sendToWin(channel, payload) {
  try {
    win?.webContents.send(channel, payload);
  } catch {
    /* Fenster kann bereits geschlossen sein. */
  }
}

/** Setzt das Weckwort nach einer STT-Sitzung wieder gemäß Richtlinie fort. */
function resumeWakeAfterStt() {
  if (stt.isActive()) return;
  if (wakePausedReason) applyWakePolicy();
  else wakeEngine?.resume();
}

/* --------------------------------------------------------------- Fenster/Tray */

function triggerListen() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('jarvis:hotkey');
}

function refreshTrayMenu() {
  if (!tray) return;
  const update = updater.getState();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'J.A.R.V.I.S. öffnen', click: () => { win?.show(); win?.focus(); } },
      { label: `Zuhören (${hotkeyLabel(hotkeys.listen)})`, click: triggerListen },
      { label: `Push-to-talk (${hotkeyLabel(hotkeys.ptt)})`, click: () => handlePtt() },
      { type: 'separator' },
      {
        label: 'Beim Anmelden starten',
        type: 'checkbox',
        checked: getAutostart(),
        click: (item) => {
          setAutostart(item.checked);
          refreshTrayMenu();
        },
      },
      update.status === 'ready'
        ? {
            label: `Update ${update.newVersion} installieren …`,
            click: () => updater.install(),
          }
        : update.status === 'downloading'
          ? {
              label: `Update wird geladen … ${update.percent}%`,
              click: () => {
                win?.show();
                win?.focus();
              },
            }
          : {
              label: update.status === 'checking' ? 'Suche nach Updates …' : `Nach Updates suchen (v${app.getVersion()})`,
              enabled: update.status !== 'checking',
              click: () => void updater.check({ manual: true }),
            },
      { type: 'separator' },
      {
        label: 'Beenden',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.setToolTip(`J.A.R.V.I.S. — ${hotkeyLabel(hotkeys.listen)} zum Zuhören`);
}

/** Macht aus einem Electron-Accelerator eine lesbare Beschriftung. */
function hotkeyLabel(accelerator) {
  return String(accelerator || '')
    .replace(/CommandOrControl/g, process.platform === 'darwin' ? '⌘' : 'Strg')
    .replace(/Command/g, '⌘')
    .replace(/Control/g, 'Strg')
    .replace(/Alt/g, process.platform === 'darwin' ? '⌥' : 'Alt')
    .replace(/Shift/g, 'Shift')
    .replace(/Space/g, 'Leertaste');
}

function tryRegister(accelerator, handler) {
  if (!accelerator) return false;
  try {
    return globalShortcut.register(accelerator, handler);
  } catch {
    return false;
  }
}

/** Registriert beide Kürzel neu; Rückgabe sagt, was geklappt hat. */
function registerHotkeys() {
  globalShortcut.unregisterAll();
  hotkeyState = {
    listen: tryRegister(hotkeys.listen, triggerListen),
    ptt: tryRegister(hotkeys.ptt, () => handlePtt()),
  };
  if (!hotkeyState.listen) console.warn(`[jarvis] Hotkey ${hotkeys.listen} nicht registrierbar.`);
  if (!hotkeyState.ptt) console.warn(`[jarvis] Push-to-talk ${hotkeys.ptt} nicht registrierbar.`);
  refreshTrayMenu();
  return hotkeyState;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 640,
    backgroundColor: '#05080f',
    title: 'J.A.R.V.I.S.',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'tray.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  diagnostics.attachWindow(win);
  // Bei jedem Neuladen ist der Renderer kurz nicht empfangsbereit.
  win.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });
  win.loadURL(appUrl);
  win.once('ready-to-show', () => {
    if (!startHidden) win.show();
  });
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

/** Im Entwicklungsmodus liegt die bearbeitete .env im Projektordner. */
function apiEnvFile() {
  return isDev ? path.join(ROOT, '.env') : ensureUserEnv();
}

/* ------------------------------------------------------------- Fehlerprogramm */

function httpGetJson(url, timeout = 1200) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (body.length < 20000) body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}

/** Liest nur die Namen der gesetzten Variablen — niemals deren Werte. */
function envNames(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[0].trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Protokolliert das erstmalige Überschreiten der Tageswarnschwelle. */
function noteUsageWarning(before, after) {
  if (before.warning || !after.warning) return;
  diagnostics.record({
    level: 'warning',
    source: 'ElevenLabs',
    message: `Tageswarnschwelle erreicht: ${after.reason}. Cloud-Stimme nicht für Dauerbetrieb empfohlen; Piper bleibt lokal.`,
  });
}

/** Übersetzt den Provider-Fehler in einen konkreten nächsten Schritt. */
function cloudErrorHint(message) {
  const text = String(message || '');
  if (/voice|stimm|404|not found/i.test(text)) {
    return 'Stimmen-ID prüfen: ElevenLabs → My Voices → Copy voice ID, dann in den Einstellungen eintragen.';
  }
  if (/401|403|invalid.?api.?key|prefix|unauthor/i.test(text)) {
    return 'Key in ElevenLabs unter Developers → API Keys neu erzeugen; der vollständige sk_…-Wert wird nur einmal angezeigt.';
  }
  if (/402|429|quota|credit|limit|kontingent/i.test(text)) {
    return 'Guthaben und Kontingent im ElevenLabs-Konto prüfen; Piper spricht lokal weiter.';
  }
  if (/timeout|zeitüberschreitung|fetch|network|ECONN|ENOTFOUND/i.test(text)) {
    return 'Internetverbindung, Firewall oder Proxy prüfen; Piper spricht lokal weiter.';
  }
  return 'Piper bleibt als lokale Stimme aktiv; Details stehen im Fehlerprotokoll.';
}

/** "2026-11-24" → "24.11.2026" für Hinweise im Bericht. */
function formatShortDate(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(date || '');
}

// Denselben Fehler nicht bei jedem Satz erneut ins Protokoll schreiben.
let lastCloudError = '';

function noteCloudFailure(error) {
  const text = String(error || '').trim();
  if (!text || text === lastCloudError) return;
  lastCloudError = text;
  diagnostics.record({
    level: 'warning',
    source: 'ElevenLabs',
    message: `Cloud-Stimme fehlgeschlagen: ${text}`,
    context: { hinweis: cloudErrorHint(text) },
  });
}

async function collectDiagnostics() {
  const checks = [];
  const envFile = path.join(app.getPath('userData'), '.env');
  const names = envNames(envFile).filter((name) => /_API_KEY$/.test(name));
  const health = appUrl ? await httpGetJson(`${appUrl.replace(/\/?$/, '/')}api/health`) : null;
  const rawUsage = appUrl
    ? await httpGetJson(`${appUrl.replace(/\/?$/, '/')}api/usage`, 2000)
    : null;
  const llm = rawUsage && rawUsage.today && Array.isArray(rawUsage.days) ? rawUsage : null;

  checks.push({
    id: 'server',
    label: 'Lokaler Server',
    status: health ? 'ok' : 'fail',
    detail: health ? `erreichbar über ${appUrl}` : 'nicht erreichbar',
    hint: health ? undefined : 'Meist belegt eine zweite Instanz den Port. Jarvis beenden und neu starten.',
  });

  checks.push({
    id: 'model',
    label: 'Sprachmodell',
    status: health?.configured ? 'ok' : 'warn',
    detail: health?.configured
      ? `${health.provider || 'Anbieter'} · ${health.model || 'Modell unbekannt'}`
      : 'kein API-Key hinterlegt',
    hint: health?.configured
      ? `Ausweichkette: ${(health.providers || []).map((entry) => entry.name).join(' → ') || '—'}`
      : 'GROQ_API_KEY oder ZAI_API_KEY in die .env eintragen.',
  });

  checks.push({
    id: 'voice-input',
    label: 'Spracheingabe',
    status: process.platform === 'win32' && dictation.available() ? 'ok' : 'warn',
    detail:
      process.platform === 'win32' && dictation.available()
        ? 'Windows-Spracherkennung (offline, SAPI)'
        : 'nur Befehlseingabe und Push-to-talk-Texteingabe',
    hint:
      process.platform === 'win32'
        ? 'Push-to-talk nimmt einen Befehl auf; die lokale Streaming-Erkennung ist der nächste Ausbauschritt.'
        : 'SAPI gibt es nur unter Windows.',
  });

  if (llm) {
    const tokens = Number(llm.today?.tokens) || 0;
    checks.push({
      id: 'llm-usage',
      label: 'Sprachmodell heute',
      status: llm.warning ? 'warn' : 'ok',
      detail: `${tokens.toLocaleString('de-DE')} Tokens · ${Number(llm.today?.requests) || 0} Anfragen${
        llm.priced ? ` · ca. ${(Number(llm.today?.usd) || 0).toFixed(2)} US-Dollar` : ''
      }`,
      hint: llm.warning
        ? `Warnschwelle erreicht: ${llm.reason}. Ein lokales Modell über Ollama kostet nichts.`
        : `Richtwert ${Number(llm.warnTokens).toLocaleString('de-DE')} Tokens pro Tag.`,
    });
  }

  const voice = piper.info();
  checks.push({
    id: 'piper',
    label: 'Stimme lokal (Piper)',
    status: voice.available ? 'ok' : 'warn',
    detail: voice.available ? `${voice.voice} · ${voice.model}` : 'nicht installiert',
    hint: voice.available ? undefined : 'Eine Systemstimme gibt es nicht mehr: ohne Piper und ohne ElevenLabs-Key bleibt Jarvis stumm.',
  });

  const voiceUsage = ttsUsage.summary();
  const cloudKey = elevenlabs.available();
  const cloudFailures = voiceUsage.today.failures;
  const lastCloudFailure = voiceUsage.today.lastError;
  // Ältere Versionen speicherten keinen Fehlertext; dann wenigstens den letzten bekannten nennen.
  const earlierFailure = lastCloudFailure
    ? null
    : [...voiceUsage.days].reverse().find((day) => day.lastError);
  checks.push({
    id: 'elevenlabs',
    label: 'Stimme Cloud (ElevenLabs)',
    status: cloudKey && cloudFailures === 0 ? 'ok' : 'warn',
    detail: !cloudKey
      ? 'kein ELEVENLABS_API_KEY'
      : cloudFailures > 0
        ? `API-Key gesetzt · ${cloudFailures} Fehlversuche in Folge`
        : 'API-Key gesetzt',
    hint: !cloudKey
      ? 'Optional: Key in die .env eintragen, Piper bleibt Rückfall.'
      : cloudFailures === 0
        ? 'Live-Test im Fehlerprogramm prüft Key und Stimmen-ID auf Knopfdruck.'
        : lastCloudFailure
          ? `Zuletzt: ${lastCloudFailure}. ${cloudErrorHint(lastCloudFailure)}`
          : `${
              earlierFailure
                ? `Zuletzt am ${formatShortDate(earlierFailure.date)}: ${earlierFailure.lastError}. `
                : 'Für diese Fehlversuche wurde kein Fehlertext gespeichert (ältere App-Version). '
            }Live-Test im Fehlerprogramm prüft Key und Stimmen-ID.`,
  });
  checks.push({
    id: 'elevenlabs-usage',
    label: 'ElevenLabs heute',
    status: voiceUsage.warning ? 'warn' : 'ok',
    detail: `${voiceUsage.today.characters.toLocaleString('de-DE')} Zeichen · ${voiceUsage.today.requests} Aufrufe${voiceUsage.today.failures ? ` · ${voiceUsage.today.failures} Fehlversuche` : ''}`,
    hint: voiceUsage.warning
      ? 'Warnschwelle erreicht. Cloud-Stimme nicht für Dauerbetrieb empfohlen — Piper ist lokal und ohne Kontingent.'
      : `Richtwert ${voiceUsage.warnCharacters.toLocaleString('de-DE')} Zeichen pro Tag. ElevenLabs rechnet in Zeichen, nicht in Tokens.`,
  });

  const wake = wakeEngine?.status?.() ?? null;
  checks.push({
    id: 'wake',
    label: 'Offline-Weckwort',
    status: wake?.available ? 'ok' : 'warn',
    detail: wake?.available ? `aktiv · ${wake.model}` : wake?.reason || 'Engine startet noch',
    hint: wake?.available ? undefined : 'Push-to-talk funktioniert trotzdem.',
  });

  checks.push({
    id: 'mic',
    label: 'Mikrofon',
    status: wakeCaptureError ? 'fail' : 'ok',
    detail: wakeCaptureError || 'Aufnahme läuft ohne Fehler',
    hint: wakeCaptureError
      ? 'Systemeinstellungen: Mikrofonzugriff für Jarvis erlauben und Eingabegerät prüfen.'
      : undefined,
  });

  const hasEnv = fs.existsSync(envFile);
  checks.push({
    id: 'config',
    label: 'Konfiguration',
    status: hasEnv && names.length ? 'ok' : 'warn',
    detail: hasEnv
      ? names.length
        ? `API-Keys gesetzt: ${names.join(', ')}`
        : 'Datei vorhanden, aber kein Key gesetzt'
      : 'keine .env angelegt',
    hint: `Datei: ${envFile}`,
  });

  const ollama = await httpGetJson('http://127.0.0.1:11434/api/tags', 900);
  const localModels = Array.isArray(ollama?.models)
    ? ollama.models.map((entry) => String(entry?.name ?? '')).filter(Boolean)
    : [];
  checks.push({
    id: 'ollama',
    label: 'Lokales Modell (Ollama)',
    status: localModels.length ? 'ok' : 'warn',
    detail: localModels.length
      ? `läuft · ${localModels.slice(0, 3).join(', ')}`
      : 'kein Ollama-Dienst auf 127.0.0.1:11434',
    hint: localModels.length
      ? 'Ohne Cloud-Key antwortet dieses Modell — auch offline.'
      : 'Optional: ollama.com installieren, dann „ollama pull gemma3:4b“.',
  });

  checks.push({
    id: 'hotkeys',
    label: 'Tastenkürzel',
    status: hotkeyState.listen && hotkeyState.ptt ? 'ok' : 'warn',
    detail: `${hotkeyLabel(hotkeys.listen)} ${hotkeyState.listen ? 'aktiv' : 'belegt'} · ${hotkeyLabel(hotkeys.ptt)} ${hotkeyState.ptt ? 'aktiv' : 'belegt'}`,
    hint: hotkeyState.listen && hotkeyState.ptt ? undefined : 'In den Einstellungen ein anderes Kürzel wählen.',
  });

  const logged = diagnostics.recent(200);
  const problems = logged.filter((entry) => entry.level === 'error' || entry.level === 'fatal').length;
  checks.push({
    id: 'log',
    label: 'Fehlerprotokoll',
    status: problems ? 'warn' : 'ok',
    detail: problems ? `${problems} Fehler in dieser Sitzung` : 'keine Fehler in dieser Sitzung',
    hint: diagnostics.paths().logFile,
  });

  return {
    at: Date.now(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron ?? '',
    node: process.versions.node,
    logFile: diagnostics.paths().logFile,
    logDir: diagnostics.paths().logDir,
    checks,
    usage: { elevenlabs: voiceUsage, ...(llm ? { llm } : {}) },
    errors: diagnostics.recent(25),
  };
}

/* --------------------------------------------------------------------- IPC */

ipcMain.handle('jarvis:volume', (_event, direction) => runSpec(volumeCommand(direction)));
ipcMain.handle('jarvis:media', (_event, action) => runSpec(mediaCommand(action)));
ipcMain.handle('jarvis:lock', () => runSpec(lockCommand()));
ipcMain.handle('jarvis:openApp', (_event, name) => runSpec(openAppCommand(name)));

// Links gehen an den in den Einstellungen gewählten Browser; ohne Auswahl
// öffnet das System seinen Standardbrowser.
ipcMain.handle('jarvis:openUrl', async (_event, url, browser) => {
  const spec = openUrlCommand(url, browser);
  if (spec?.error) return { ok: false, message: 'Nur http- und https-Adressen.' };
  if (spec) return runSpec(spec);
  try {
    await shell.openExternal(String(url));
    return { ok: true, message: 'Standardbrowser' };
  } catch (error) {
    return { ok: false, message: String(error?.message ?? error).slice(0, 160) };
  }
});
ipcMain.handle('jarvis:desktopInfo', () => ({
  platform: process.platform,
  hotkey: hotkeys.listen,
  ptt: hotkeys.ptt,
  hotkeyRegistered: hotkeyState,
  hotkeyDefaults: DEFAULT_HOTKEYS,
  wakePausedReason,
  autostart: getAutostart(),
  dictation: dictation.available(),
  voiceInput: dictation.available(),
  stt: stt.status(),
  tts: piper.info(),
  ttsEngines: [
    { id: 'piper', label: 'Piper · Thorsten (lokal)', available: piper.info().available },
    { id: 'elevenlabs', label: 'ElevenLabs · Cloud', available: elevenlabs.available() },
  ],
  wake: {
    ...(wakeEngine?.status() ?? {
      available: false,
      listening: false,
      model: 'hey jarvis (offline)',
      reason: 'Engine startet noch',
      threshold: 0.5,
    }),
    pausedReason: wakePausedReason,
  },
  wakeCaptureError,
}));
ipcMain.handle('jarvis:hotkeysGet', () => ({
  listen: hotkeys.listen,
  ptt: hotkeys.ptt,
  registered: hotkeyState,
  defaults: DEFAULT_HOTKEYS,
}));
ipcMain.handle('jarvis:hotkeysSet', (_event, payload) => {
  const listen = String(payload?.listen ?? '').trim();
  const ptt = String(payload?.ptt ?? '').trim();
  if (!listen || !ptt) return { ok: false, error: 'Beide Kürzel brauchen eine Tastenkombination.' };
  if (listen.toLowerCase() === ptt.toLowerCase()) {
    return { ok: false, error: 'Die beiden Kürzel müssen sich unterscheiden.' };
  }

  const previous = { ...hotkeys };
  hotkeys = { listen, ptt };
  const registered = registerHotkeys();
  const failed = [];
  if (!registered.listen) failed.push('Zuhören');
  if (!registered.ptt) failed.push('Push-to-talk');

  if (failed.length > 0) {
    hotkeys = previous;
    registerHotkeys();
    return {
      ok: false,
      error: `${failed.join(' und ')} ließ sich nicht registrieren — vermutlich belegt ein anderes Programm die Kombination.`,
    };
  }

  shortcuts.persist({ listen, ptt });
  return { ok: true, listen, ptt, registered };
});
ipcMain.handle('jarvis:setWakeOnBattery', (_event, enabled) => {
  wakeOnBattery = Boolean(enabled);
  applyWakePolicy();
  return { ok: true, pausedReason: wakePausedReason };
});
ipcMain.handle('jarvis:captureScreen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1600, height: 1000 },
      fetchWindowIcons: false,
    });
    const source = sources[0];
    if (!source || source.thumbnail.isEmpty()) {
      return { ok: false, error: 'Es kam kein Bildschirmfoto an. Prüfe die Bildschirmaufnahme-Rechte.' };
    }
    const size = source.thumbnail.getSize();
    return {
      ok: true,
      image: source.thumbnail.toDataURL(),
      width: size.width,
      height: size.height,
      name: source.name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bildschirmfoto fehlgeschlagen';
    diagnostics.record({ level: 'error', source: 'Bildschirm', message });
    return { ok: false, error: `Bildschirmfoto fehlgeschlagen: ${message}` };
  }
});
ipcMain.handle('jarvis:errorReport', (_event, payload) => {
  const entry = diagnostics.record({
    level: payload?.level === 'fatal' ? 'fatal' : 'error',
    source: payload?.source || 'Oberfläche',
    message: payload?.message || 'Unbekannter Fehler',
    stack: payload?.stack,
    context: payload?.context,
  });
  return { ok: true, id: entry.id };
});
ipcMain.handle('jarvis:apiConfig', () => {
  apiconfig.configure(apiEnvFile());
  return apiconfig.state();
});
ipcMain.handle('jarvis:apiConfigSave', (_event, payload) => {
  const file = apiEnvFile();
  apiconfig.configure(file);
  try {
    const state = apiconfig.save(payload ?? {});
    elevenlabs.configure({ envFile: file });
    return { ok: true, ...state };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.';
    diagnostics.record({ level: 'error', source: 'Zugangsdaten', message });
    return { ok: false, error: message };
  }
});
ipcMain.handle('jarvis:errorLog', () => diagnostics.report());
ipcMain.handle('jarvis:openLogFolder', () => diagnostics.openFolder());
ipcMain.handle('jarvis:diagnose', () => collectDiagnostics());
ipcMain.handle('jarvis:elevenlabsTest', () => elevenlabs.test());
ipcMain.handle('jarvis:updateState', () => updater.getState());
ipcMain.handle('jarvis:updateCheck', () => updater.check({ manual: true }));
ipcMain.handle('jarvis:updateInstall', () => updater.install());

ipcMain.handle('jarvis:setAutostart', (_event, enabled) => {
  setAutostart(Boolean(enabled));
  refreshTrayMenu();
  return { ok: true, autostart: getAutostart() };
});

ipcMain.handle('jarvis:memoryLoad', () => memory.load(app));
ipcMain.handle('jarvis:memorySave', (_event, data) => memory.save(app, data));

ipcMain.handle('jarvis:ttsSynthesize', async (_event, text, options) => {
  const opts = options ?? {};

  // Gewählte Cloud-Stimme zuerst; scheitert sie, spricht Piper weiter.
  if (opts.engine === 'elevenlabs') {
    const beforeUsage = ttsUsage.summary();
    const cloud = await elevenlabs.synthesize(text, opts);
    if (cloud.ok) {
      lastCloudError = '';
      noteUsageWarning(
        beforeUsage,
        ttsUsage.recordSuccess(cloud.characters ?? String(text ?? '').length),
      );
      return {
        ok: true,
        audio: cloud.audio.toString('base64'),
        mime: cloud.mime,
        engine: 'elevenlabs',
      };
    }
    noteCloudFailure(cloud.error);
    noteUsageWarning(beforeUsage, ttsUsage.recordFailure(cloud.error));
    console.warn('[jarvis] ElevenLabs nicht verfügbar:', cloud.error);
  }

  const result = await piper.synthesize(text, opts);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    audio: result.wav.toString('base64'),
    sampleRate: result.sampleRate,
    engine: 'piper',
  };
});
ipcMain.handle('jarvis:setDictationMode', (_event, enabled) => {
  dictationMode = Boolean(enabled);
  return dictationMode;
});
ipcMain.handle('jarvis:dictate', (_event, options) =>
  // Mikrofon für die Dauer des Diktats freigeben, damit SAPI aufnehmen kann.
  withWakePaused(() => dictation.listen({ culture: options?.culture || 'de-DE' })),
);
ipcMain.handle('jarvis:typeText', (_event, text) => dictation.typeText(text));
ipcMain.handle('jarvis:voiceCommand', (_event, options) =>
  withWakePaused(() =>
    dictation.listen({ culture: options?.culture || 'de-DE', seconds: 10 }),
  ),
);

ipcMain.handle('jarvis:sttStatus', () => stt.status());
ipcMain.handle('jarvis:sttStart', () => {
  wakeEngine?.pause();
  const result = stt.start();
  if (!result.ok) resumeWakeAfterStt();
  return result;
});
ipcMain.handle('jarvis:sttStop', () => {
  const status = stt.finish();
  resumeWakeAfterStt();
  return status;
});
ipcMain.handle('jarvis:sttCancel', () => {
  const status = stt.cancel();
  resumeWakeAfterStt();
  return status;
});
ipcMain.on('jarvis:sttAudio', (event, buffer) => {
  if (!win || event.sender !== win.webContents) return;
  stt.push(buffer);
});
ipcMain.handle('jarvis:voiceConfirm', (_event, options) =>
  withWakePaused(() =>
    dictation.confirm({ culture: options?.culture || 'de-DE', seconds: 6 }),
  ),
);

ipcMain.handle('jarvis:timersList', () => timers.list());
ipcMain.handle('jarvis:timersReady', () => {
  rendererReady = true;
  return timers.consumeMissed();
});
ipcMain.handle('jarvis:timersAdd', (_event, payload) => timers.add(payload ?? {}));
ipcMain.handle('jarvis:timersRemove', (_event, id) => timers.remove(id));
ipcMain.handle('jarvis:activityList', (_event, limit) => activity.recent(limit));
ipcMain.handle('jarvis:activityAppend', (_event, entry) => activity.append(entry ?? {}));
ipcMain.handle('jarvis:historyList', () => history.list());
ipcMain.handle('jarvis:historyLoad', (_event, id) => history.load(id));
ipcMain.handle('jarvis:historySave', (_event, payload) => history.save(payload ?? {}));
ipcMain.handle('jarvis:historyRemove', (_event, id) => history.remove(id));
ipcMain.handle('jarvis:clipboardRead', () => {
  const text = clipboard.readText().slice(0, 12000);
  return { ok: true, text, length: text.length };
});
ipcMain.handle('jarvis:llmUsage', () =>
  appUrl ? httpGetJson(`${appUrl.replace(/\/?$/, '/')}api/usage`, 2000) : null,
);

ipcMain.handle('jarvis:monitorConsent', (_event, granted) =>
  granted === undefined ? monitor.getConsent() : monitor.setConsent(granted),
);
ipcMain.handle('jarvis:monitorSample', async () => (monitor.getConsent() ? monitor.sample() : null));

ipcMain.on('jarvis:wake-audio', (event, buffer) => {
  if (!wakeEngine || !wakeWindow || event.sender !== wakeWindow.webContents) return;
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength % 2 !== 0) return;
  void wakeEngine.push(new Int16Array(buffer));
});
ipcMain.on('jarvis:wake-ready', (_event, info) => {
  console.log(`[jarvis] Mikrofon-Aufnahme aktiv (${info?.sampleRate ?? '?'} Hz)`);
  wakeCaptureError = '';
});
ipcMain.on('jarvis:wake-failed', (_event, message) => {
  wakeCaptureError = String(message ?? '').slice(0, 200);
  console.warn('[jarvis] Mikrofon für Weckwort nicht verfügbar:', wakeCaptureError);
});

/* ------------------------------------------------------------------ Start */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    win.show();
    win.focus();
  });

  app.whenReady().then(async () => {
    if (!isDev) {
      appUrl = await startServer();
      if (!appUrl) {
        dialog.showErrorBox(
          'Jarvis konnte nicht starten',
          'Der lokale Server ist nicht erreichbar. Läuft bereits eine andere Instanz oder ist der Port blockiert?',
        );
        app.quit();
        return;
      }
    }

    createWindow();

    updater.configure({
      onChange: (next) => {
        sendToWin('jarvis:update-state', next);
        refreshTrayMenu();
      },
      onActivate: () => {
        win?.show();
        win?.focus();
      },
    });
    updater.start();

    const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
    tray = new Tray(icon);
    refreshTrayMenu();
    tray.on('click', () => {
      if (!win) return;
      if (win.isVisible()) win.hide();
      else {
        win.show();
        win.focus();
      }
    });

    const saved = shortcuts.configure({ dir: app.getPath('userData') });
    hotkeys = { listen: saved.listen, ptt: saved.ptt };
    registerHotkeys();

    configurePiper();
    void startWake().then(() => applyWakePolicy());

    powerMonitor.on('on-ac', applyWakePolicy);
    powerMonitor.on('on-battery', applyWakePolicy);
    powerMonitor.on('lock-screen', () => {
      screenLocked = true;
      applyWakePolicy();
    });
    powerMonitor.on('unlock-screen', () => {
      screenLocked = false;
      applyWakePolicy();
    });
    powerMonitor.on('suspend', () => {
      screenLocked = true;
      applyWakePolicy();
    });
    powerMonitor.on('resume', () => {
      screenLocked = false;
      applyWakePolicy();
    });

    app.on('activate', () => {
      if (win) {
        win.show();
        win.focus();
      } else {
        createWindow();
      }
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    stt.dispose();
  });

  app.on('child-process-gone', (_event, details) => {
    diagnostics.record({
      level: 'warning',
      source: 'Hilfsprozess',
      message: `${details?.type || 'Prozess'} beendet (${details?.reason || 'unbekannt'})`,
      context: { exitCode: details?.exitCode, serviceName: details?.serviceName },
    });
  });

  app.on('will-quit', () => {
    updater.stop();
    globalShortcut.unregisterAll();
    wakeEngine?.dispose();
    wakeWindow?.destroy();
    wakeWindow = null;
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}
