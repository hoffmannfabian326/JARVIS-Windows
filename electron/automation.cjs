'use strict';

/**
 * Adaptive Intelligence und Automation Engine.
 *
 * Läuft vollständig lokal im Hauptprozess. Der Renderer bearbeitet nur
 * Entwürfe; jede Ausführung wird hier erneut validiert. Es gibt keine
 * Shell-Eingabe aus Routinen: Aktionen sind fest registriert.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const si = require('systeminformation');
const {
  openAppCommand,
  openUrlCommand,
  setVolumeCommand,
} = require('./platform.cjs');

const VERSION = 1;
const MAX_ROUTINES = 80;
const MAX_HISTORY = 120;
const MAX_ACTIONS = 12;
const MAX_CONDITIONS = 8;
const MAX_DEPTH = 2;
const TICK_MIN_MS = 3000;

const MODES = new Set(['neutral', 'gaming', 'productivity', 'relax', 'standby']);
const METRICS = new Set(['cpu', 'gpu', 'ram', 'temperature']);
const MODULES = new Set(['telemetry', 'conversation', 'tiles', 'core']);
const TRIGGERS = new Set(['time', 'startup', 'app_start', 'app_stop', 'mode_change', 'threshold', 'idle', 'manual', 'voice']);
const CONDITIONS = new Set(['app_running', 'mode', 'time_window', 'metric', 'user_active']);
const ACTIONS = new Set([
  'open_app',
  'open_url',
  'notify',
  'set_mode',
  'restore_mode',
  'toggle_module',
  'set_volume',
  'create_reminder',
  'run_routine',
  'power_plan',
  'briefing',
]);

const ACTION_LABEL = {
  open_app: 'Programm öffnen',
  open_url: 'Webseite öffnen',
  notify: 'Benachrichtigung',
  set_mode: 'Modus wechseln',
  restore_mode: 'Modus wiederherstellen',
  toggle_module: 'Modul umschalten',
  set_volume: 'Lautstärke setzen',
  create_reminder: 'Erinnerung',
  run_routine: 'Routine starten',
  power_plan: 'Energieprofil',
  briefing: 'Briefing',
};

let file = '';
let data = null;
let timer = null;
let ticking = false;
let started = false;
let lastProcessScan = 0;
let lastMetricsAt = 0;
let lastForegroundAt = 0;
let foregroundCache = null;
let processCache = [];
let metricsCache = { cpu: null, gpu: null, ram: null, temperature: null };
let previousMode = 'neutral';
let idleLatch = new Set();
let thresholdArmed = new Map();
let override = null;
let suppressModeTriggerUntil = 0;
let startupHandled = false;
const timeFired = new Map();
let runDepth = 0;
let recentRuns = [];
let tickError = '';
const refs = {
  getWindow: () => null,
  confirm: async () => false,
  notify: () => {},
  onState: () => {},
  onBriefing: () => {},
  sampleSystem: null,
  getIdleSeconds: () => 0,
  getDisplay: () => null,
  addTimer: null,
  openExternal: null,
  log: () => {},
};

/* ------------------------------------------------------------------ Helfer */

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function text(value, max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isValidTime(value) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim());
}

function days(value) {
  const list = Array.isArray(value) ? value : [];
  const clean = [...new Set(list.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return clean.length ? clean.sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function normalizeApp(value) {
  return text(value, 80).toLowerCase();
}

function normalizeAction(raw) {
  if (!raw || typeof raw !== 'object' || !ACTIONS.has(raw.kind)) return null;
  switch (raw.kind) {
    case 'open_app': {
      const app = text(raw.app, 60);
      return app ? { kind: 'open_app', app } : null;
    }
    case 'open_url': {
      const url = safeUrl(raw.url);
      return url ? { kind: 'open_url', url, ...(text(raw.title, 80) ? { title: text(raw.title, 80) } : {}) } : null;
    }
    case 'notify': {
      const message = text(raw.message, 240);
      return message ? { kind: 'notify', title: text(raw.title, 80) || 'J.A.R.V.I.S.', message } : null;
    }
    case 'set_mode':
      return MODES.has(raw.mode)
        ? { kind: 'set_mode', mode: raw.mode, durationSeconds: clampNumber(raw.durationSeconds, 0, 86_400, 0) }
        : null;
    case 'restore_mode':
      return { kind: 'restore_mode' };
    case 'toggle_module':
      return MODULES.has(raw.module)
        ? { kind: 'toggle_module', module: raw.module, hidden: raw.hidden !== false }
        : null;
    case 'set_volume':
      return { kind: 'set_volume', percent: clampNumber(raw.percent, 0, 100, 40) };
    case 'create_reminder': {
      const label = text(raw.label, 80);
      return label ? { kind: 'create_reminder', label, seconds: clampNumber(raw.seconds, 5, 86_400, 600) } : null;
    }
    case 'run_routine': {
      const routineId = text(raw.routineId, 60);
      return routineId ? { kind: 'run_routine', routineId } : null;
    }
    case 'power_plan':
      return raw.plan === 'high' || raw.plan === 'saver' || raw.plan === 'balanced'
        ? { kind: 'power_plan', plan: raw.plan }
        : null;
    case 'briefing':
      return { kind: 'briefing', prompt: text(raw.prompt, 240) };
    default:
      return null;
  }
}

function normalizeCondition(raw) {
  if (!raw || typeof raw !== 'object' || !CONDITIONS.has(raw.kind)) return null;
  switch (raw.kind) {
    case 'app_running': {
      const app = normalizeApp(raw.app);
      return app ? { kind: 'app_running', app, running: raw.running !== false } : null;
    }
    case 'mode':
      return MODES.has(raw.mode) ? { kind: 'mode', mode: raw.mode } : null;
    case 'time_window':
      return isValidTime(raw.from) && isValidTime(raw.to)
        ? { kind: 'time_window', from: raw.from, to: raw.to, days: days(raw.days) }
        : null;
    case 'metric':
      return METRICS.has(raw.metric)
        ? { kind: 'metric', metric: raw.metric, op: raw.op === 'below' ? 'below' : 'above', value: clampNumber(raw.value, 0, 110, 80) }
        : null;
    case 'user_active':
      return {
        kind: 'user_active',
        active: raw.active !== false,
        withinSeconds: clampNumber(raw.withinSeconds, 10, 3600, 120),
      };
    default:
      return null;
  }
}

function normalizeTrigger(raw) {
  if (!raw || typeof raw !== 'object' || !TRIGGERS.has(raw.kind)) return null;
  switch (raw.kind) {
    case 'time':
      return isValidTime(raw.at) ? { kind: 'time', at: raw.at, days: days(raw.days) } : null;
    case 'startup':
      return { kind: 'startup' };
    case 'app_start':
    case 'app_stop': {
      const app = normalizeApp(raw.app);
      return app ? { kind: raw.kind, app } : null;
    }
    case 'mode_change':
      return { kind: 'mode_change', mode: raw.mode === 'any' || MODES.has(raw.mode) ? raw.mode : 'any' };
    case 'threshold':
      return METRICS.has(raw.metric)
        ? {
            kind: 'threshold',
            metric: raw.metric,
            value: clampNumber(raw.value, 1, 110, 85),
            direction: raw.direction === 'below' ? 'below' : 'above',
          }
        : null;
    case 'idle':
      return { kind: 'idle', minutes: clampNumber(raw.minutes, 1, 240, 10) };
    case 'manual':
      return { kind: 'manual' };
    case 'voice':
      return { kind: 'voice' };
    default:
      return null;
  }
}

function normalizeRoutine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name, 80);
  if (name.length < 2) return null;
  const trigger = normalizeTrigger(raw.trigger);
  if (!trigger) return null;
  const rawConditions = (Array.isArray(raw.conditions) ? raw.conditions.slice(0, MAX_CONDITIONS) : []);
  const conditions = rawConditions.map(normalizeCondition);
  if (conditions.some((condition) => !condition)) return null;
  const rawActions = (Array.isArray(raw.actions) ? raw.actions.slice(0, MAX_ACTIONS) : []);
  const actions = rawActions.map(normalizeAction);
  if (!actions.length || actions.some((action) => !action)) return null;
  return {
    id: text(raw.id, 60) || `rtn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: text(raw.description, 240),
    enabled: Boolean(raw.enabled),
    trigger,
    conditions,
    conditionLogic: raw.conditionLogic === 'or' ? 'or' : 'and',
    actions,
    cooldownSeconds: clampNumber(raw.cooldownSeconds, 30, 86_400, 60),
    priority: clampNumber(raw.priority, 1, 10, 3),
    requireConfirmation: Boolean(raw.requireConfirmation),
    preset: raw.preset ? text(raw.preset, 40) : undefined,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    ...(Number(raw.lastRunAt) ? { lastRunAt: Number(raw.lastRunAt) } : {}),
    ...(raw.lastStatus ? { lastStatus: raw.lastStatus } : {}),
    ...(raw.lastError ? { lastError: text(raw.lastError, 200) } : {}),
  };
}

function settingsDefaults() {
  return {
    enabled: false,
    autoContext: true,
    manualMode: null,
    idleMinutes: 8,
    pollSeconds: 5,
    profiles: {
      gaming: ['wow.exe', 'world of warcraft', 'steam.exe', 'cs2.exe', 'valorant.exe', 'league of legends.exe', 'dota2.exe', 'fortnite.exe', 'minecraft.exe'],
      productivity: ['code.exe', 'devenv.exe', 'idea64.exe', 'windowsterminal.exe', 'winword.exe', 'excel.exe', 'powerpnt.exe', 'notion.exe', 'obsidian.exe', 'slack.exe', 'teams.exe', 'zoom.exe'],
      relax: ['spotify.exe', 'vlc.exe', 'mpv.exe', 'foobar2000.exe', 'musicbee.exe', 'netflix'],
    },
    hiddenModules: [],
  };
}

function normalizeSettings(raw) {
  const base = settingsDefaults();
  if (!raw || typeof raw !== 'object') return base;
  const profiles = raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {};
  const cleanList = (value, fallback) => {
    const list = (Array.isArray(value) ? value : [])
      .map((entry) => text(entry, 60).toLowerCase())
      .filter(Boolean)
      .slice(0, 40);
    return list.length ? [...new Set(list)] : fallback;
  };
  return {
    enabled: Boolean(raw.enabled),
    autoContext: raw.autoContext !== false,
    manualMode: MODES.has(raw.manualMode) ? raw.manualMode : null,
    idleMinutes: clampNumber(raw.idleMinutes, 1, 120, 8),
    pollSeconds: clampNumber(raw.pollSeconds, 3, 30, 5),
    profiles: {
      gaming: cleanList(profiles.gaming, base.profiles.gaming),
      productivity: cleanList(profiles.productivity, base.profiles.productivity),
      relax: cleanList(profiles.relax, base.profiles.relax),
    },
    hiddenModules: (Array.isArray(raw.hiddenModules) ? raw.hiddenModules : []).filter((module) => MODULES.has(module)),
  };
}

/* ------------------------------------------------------------------ Presets */

function presetRoutines() {
  const at = Date.now();
  const base = (id, name, description, trigger, actions, extra = {}) => ({
    id,
    name,
    description,
    enabled: false,
    trigger,
    conditions: [],
    conditionLogic: 'and',
    actions,
    cooldownSeconds: 300,
    priority: 4,
    requireConfirmation: false,
    preset: id,
    createdAt: at,
    updatedAt: at,
    ...extra,
  });

  return [
    base('preset-morgen', 'Morning Briefing', 'Begrüßung, Systemlage und anstehende Aufgaben am Morgen.', { kind: 'time', at: '07:30', days: [0, 1, 2, 3, 4] }, [
      { kind: 'notify', title: 'J.A.R.V.I.S. — Morning Briefing', message: 'Guten Morgen. System, Wetter und Aufgaben stehen bereit.' },
      { kind: 'briefing', prompt: 'Fasse in höchstens drei Sätzen Systemlage, ein bis zwei relevante Nachrichten und die anstehenden Aufgaben zusammen.' },
    ], { description: 'Begrüßung durch J.A.R.V.I.S., Systeminformationen, Nachrichten, Aufgaben und optionale Programme.', cooldownSeconds: 600 }),
    base('preset-gaming', 'Gaming Protocol', 'Aktiviert beim Spielstart den Gaming Mode und stellt danach den vorherigen Modus wieder her.', { kind: 'app_start', app: 'wow.exe' }, [
      { kind: 'set_mode', mode: 'gaming', durationSeconds: 0 },
      { kind: 'notify', title: 'Gaming Protocol', message: 'Gaming Mode aktiv. Hardware-Anzeigen und Spielzugriff stehen vorn.' },
    ], { cooldownSeconds: 120, priority: 6 }),
    base('preset-gaming-ende', 'Gaming Protocol · Ende', 'Stellt den Modus wieder her, sobald das Spiel beendet ist.', { kind: 'app_stop', app: 'wow.exe' }, [
      { kind: 'restore_mode' },
      { kind: 'notify', title: 'Gaming Protocol', message: 'Spiel beendet. Der vorherige Modus ist zurück.' },
    ], { cooldownSeconds: 120, priority: 6 }),
    base('preset-work', 'Work Protocol', 'Wechselt beim Start einer Arbeitsanwendung in den Productivity Mode.', { kind: 'app_start', app: 'code.exe' }, [
      { kind: 'set_mode', mode: 'productivity', durationSeconds: 0 },
      { kind: 'notify', title: 'Work Protocol', message: 'Productivity Mode aktiv. Chat und Aufgaben stehen im Vordergrund.' },
    ], { cooldownSeconds: 180 }),
    base('preset-guard', 'System Guardian · CPU', 'Warnt bei anhaltend hoher CPU-Last, ohne einzugreifen.', { kind: 'threshold', metric: 'cpu', value: 90, direction: 'above' }, [
      { kind: 'notify', title: 'System Guardian', message: 'Die CPU-Last liegt über 90 Prozent. Prüfe laufende Prozesse.' },
    ], { cooldownSeconds: 600, priority: 8 }),
    base('preset-guard-temp', 'System Guardian · Temperatur', 'Warnt bei hoher CPU-Temperatur, ohne Prozesse zu beenden.', { kind: 'threshold', metric: 'temperature', value: 85, direction: 'above' }, [
      { kind: 'notify', title: 'System Guardian', message: 'Die CPU-Temperatur ist hoch. Belüftung und Last prüfen.' },
    ], { cooldownSeconds: 600, priority: 8 }),
    base('preset-nacht', 'Night Protocol', 'Wechselt am Abend in den ruhigen Relax Mode.', { kind: 'time', at: '22:30', days: [0, 1, 2, 3, 4, 5, 6] }, [
      { kind: 'set_mode', mode: 'relax', durationSeconds: 0 },
      { kind: 'notify', title: 'Night Protocol', message: 'Relax Mode aktiv. Reize und Benachrichtigungen sind reduziert.' },
    ], { cooldownSeconds: 600 }),
  ];
}

/* --------------------------------------------------------------- Persistenz */

function defaultData() {
  return {
    version: VERSION,
    settings: settingsDefaults(),
    routines: presetRoutines(),
    history: [],
  };
}

function persist() {
  if (!file || !data) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  } catch (error) {
    refs.log('warning', 'Automation', `Speichern fehlgeschlagen: ${error?.message ?? error}`);
  }
}

function load() {
  data = defaultData();
  if (!file) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      data.settings = normalizeSettings(parsed.settings);
      const routines = (Array.isArray(parsed.routines) ? parsed.routines : [])
        .map(normalizeRoutine)
        .filter(Boolean)
        .slice(0, MAX_ROUTINES);
      if (routines.length) data.routines = routines;
      data.history = (Array.isArray(parsed.history) ? parsed.history : [])
        .filter((entry) => entry && typeof entry === 'object' && entry.routineName)
        .slice(-MAX_HISTORY);
      recentRuns = data.history.slice(-MAX_HISTORY);
    }
  } catch {
    /* erste Sitzung oder beschädigte Datei */
  }
}

/* ----------------------------------------------------------------- Kontext */

function normalizeProcess(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\.exe$/, '')
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function terminalProcess(name) {
  return name === 'powershell' || name === 'cmd' || name === 'windowsterminal' || name === 'conhost';
}

function appMatches(profile, active) {
  const wanted = normalizeProcess(profile);
  if (!wanted) return false;
  if (!active) return false;
  const proc = normalizeProcess(active.process);
  const title = String(active.title ?? '').toLowerCase();
  if (proc && (proc === wanted || proc.includes(wanted) || wanted.includes(proc))) return true;
  if (title.includes(wanted)) return true;
  return false;
}

function powershellScript() {
  return [
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public struct JRECT { public int Left; public int Top; public int Right; public int Bottom; }',
    'public class JWin {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out JRECT r);',
    '}',
    "'@",
    '$h = [JWin]::GetForegroundWindow()',
    '$b = New-Object System.Text.StringBuilder 512',
    '[void][JWin]::GetWindowText($h, $b, 512)',
    '$procId = 0',
    '[void][JWin]::GetWindowThreadProcessId($h, [ref]$procId)',
    '$p = Get-Process -Id $procId -ErrorAction SilentlyContinue',
    '$r = New-Object JRECT',
    '[void][JWin]::GetWindowRect($h, [ref]$r)',
    '[pscustomobject]@{ process = $p.ProcessName; title = $b.ToString(); pid = $procId; left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom } | ConvertTo-Json -Compress',
  ].join('\n');
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: 5000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(String(stdout ?? '').trim()));
        } catch {
          resolve(null);
        }
      },
    );
  });
}

async function foregroundWindow() {
  if (process.platform !== 'win32') return null;
  const now = Date.now();
  if (now - lastForegroundAt < 2500) return foregroundCache;
  lastForegroundAt = now;
  const raw = await runPowerShell(powershellScript());
  if (!raw || typeof raw !== 'object') {
    foregroundCache = null;
    return null;
  }
  const display = refs.getDisplay?.();
  let fullscreen = false;
  if (display && Number.isFinite(raw.left)) {
    const scale = Number(display.scaleFactor) || 1;
    const width = Math.abs(Number(raw.right) - Number(raw.left));
    const height = Math.abs(Number(raw.bottom) - Number(raw.top));
    const screenW = Number(display.width) * scale;
    const screenH = Number(display.height) * scale;
    if (screenW > 0 && screenH > 0) {
      fullscreen = width >= screenW * 0.92 && height >= screenH * 0.9;
    }
  }
  foregroundCache = {
    name: text(raw.process, 60) || 'unbekannt',
    process: text(raw.process, 60) || '',
    title: text(raw.title, 160),
    fullscreen,
  };
  return foregroundCache;
}

async function scanProcesses(now) {
  if (now - lastProcessScan < 8000 && processCache.length) return processCache;
  lastProcessScan = now;
  try {
    const result = await si.processes();
    const names = (result?.list ?? [])
      .map((entry) => normalizeProcess(entry.name))
      .filter((name) => name && !terminalProcess(name));
    processCache = [...new Set(names)].slice(0, 260);
  } catch {
    // Prozessliste bleibt beim letzten Stand.
  }
  return processCache;
}

async function refreshMetrics(now, idleSeconds) {
  const quiet = idleSeconds > 60;
  const interval = quiet ? 30_000 : 6000;
  if (now - lastMetricsAt < interval || !refs.sampleSystem) return metricsCache;
  lastMetricsAt = now;
  try {
    const sample = await refs.sampleSystem();
    if (sample) {
      metricsCache = {
        cpu: sample.cpu?.load ?? null,
        gpu: sample.gpu?.load ?? null,
        ram: sample.mem?.percent ?? null,
        temperature: sample.cpu?.temp ?? sample.gpu?.temp ?? null,
      };
    }
  } catch {
    /* Werte bleiben stehen */
  }
  return metricsCache;
}

function resolveMode(context) {
  if (context.manual) {
    return { mode: context.manual, reason: 'Manuell gewählt — Automatik pausiert.', automatic: false };
  }
  if (context.idleSeconds >= data.settings.idleMinutes * 60) {
    const minutes = Math.round(context.idleSeconds / 60);
    return { mode: 'standby', reason: `Seit ${minutes} Minuten keine Eingabe.`, automatic: true };
  }
  if (override && (override.until === 0 || override.until > Date.now())) {
    return { mode: override.mode, reason: `Routine „${override.routineName}“ hat den Modus gesetzt.`, automatic: true };
  }
  if (!data.settings.autoContext) {
    return { mode: 'neutral', reason: 'Automatische Kontexterkennung ist ausgeschaltet.', automatic: false };
  }
  const app = context.activeApp;
  if (app) {
    if (data.settings.profiles.gaming.some((entry) => appMatches(entry, app))) {
      return { mode: 'gaming', reason: `${app.name}${app.fullscreen ? ' (Vollbild)' : ''} als Spiel erkannt.`, automatic: true };
    }
    if (data.settings.profiles.productivity.some((entry) => appMatches(entry, app))) {
      return { mode: 'productivity', reason: `${app.name} als Arbeitsanwendung erkannt.`, automatic: true };
    }
    if (data.settings.profiles.relax.some((entry) => appMatches(entry, app))) {
      return { mode: 'relax', reason: `${app.name} als Medienanwendung erkannt.`, automatic: true };
    }
  }
  return { mode: 'neutral', reason: 'Kein passendes Anwendungsprofil — normaler Betrieb.', automatic: true };
}

async function sampleContext() {
  const idleSeconds = Math.max(0, Number(refs.getIdleSeconds?.()) || 0);
  const manual = data.settings.manualMode;
  // Im Standby keine PowerShell-Abfrage und keinen neuen Prozess-Scan starten:
  // die letzte Momentaufnahme reicht, bis der Nutzer wieder aktiv wird.
  const standby = idleSeconds >= data.settings.idleMinutes * 60;
  const activeApp = data.settings.autoContext && !standby ? await foregroundWindow() : foregroundCache;
  const processes = data.settings.autoContext && !standby ? await scanProcesses(Date.now()) : processCache;
  const metrics = await refreshMetrics(Date.now(), idleSeconds);
  const base = { idleSeconds, activeApp, processes, manual, metrics };
  const resolved = resolveMode(base);
  const context = {
    at: Date.now(),
    mode: resolved.mode,
    reason: resolved.reason,
    automatic: resolved.automatic,
    manual,
    idleSeconds,
    activeApp,
    processes,
    metrics,
    overrideUntil: override ? override.until : 0,
  };
  return context;
}

/* --------------------------------------------------------------- Bedingungen */

function inWindow(from, to) {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const parse = (value) => {
    const [hours, minutes] = String(value).split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = parse(from);
  const end = parse(to);
  return start <= end ? current >= start && current <= end : current >= start || current <= end;
}

function processRunning(context, app) {
  const wanted = normalizeProcess(app);
  return context.processes.some((entry) => entry === wanted || entry.includes(wanted) || wanted.includes(entry));
}

function evaluateCondition(condition, context) {
  switch (condition.kind) {
    case 'app_running':
      return processRunning(context, condition.app) === condition.running;
    case 'mode':
      return context.mode === condition.mode;
    case 'time_window':
      return condition.days.includes((new Date().getDay() + 6) % 7) && inWindow(condition.from, condition.to);
    case 'metric': {
      const value = context.metrics?.[condition.metric];
      if (value == null) return false;
      return condition.op === 'above' ? value > condition.value : value < condition.value;
    }
    case 'user_active':
      return condition.active ? context.idleSeconds * 1000 <= condition.withinSeconds * 1000 : context.idleSeconds * 1000 > condition.withinSeconds * 1000;
    default:
      return false;
  }
}

function evaluateConditions(routine, context) {
  if (routine.conditions.length === 0) return { ok: true, reason: '' };
  const results = routine.conditions.map((condition) => ({
    condition,
    ok: evaluateCondition(condition, context),
  }));
  const ok = routine.conditionLogic === 'or' ? results.some((entry) => entry.ok) : results.every((entry) => entry.ok);
  const failed = results.filter((entry) => !entry.ok).map((entry) => `${entry.condition.kind}`);
  return { ok, reason: ok ? '' : `Bedingung nicht erfüllt: ${failed.join(', ')}` };
}

function triggerLabel(routine) {
  const trigger = routine.trigger;
  switch (trigger.kind) {
    case 'time':
      return `${trigger.at} Uhr`;
    case 'startup':
      return 'Systemstart';
    case 'app_start':
      return `Start von ${trigger.app}`;
    case 'app_stop':
      return `Ende von ${trigger.app}`;
    case 'mode_change':
      return 'Moduswechsel';
    case 'threshold':
      return `${trigger.metric} ${trigger.direction}`;
    case 'idle':
      return `Inaktivität ${trigger.minutes} min`;
    case 'manual':
      return 'manuell';
    case 'voice':
      return 'Sprachbefehl';
    default:
      return 'unbekannt';
  }
}

/* --------------------------------------------------------------- Aktionen */

function runCommand(spec) {
  if (!spec || spec.error) return Promise.resolve({ ok: false, message: 'Aktion nicht unterstützt.' });
  return new Promise((resolve) => {
    const options = { timeout: 8000, windowsHide: true };
    if (spec.windowsVerbatimArguments) options.windowsVerbatimArguments = true;
    execFile(spec.command, spec.args, options, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: text(stderr || error.message, 160) || 'Befehl fehlgeschlagen' });
        return;
      }
      resolve({ ok: true, message: text(stdout, 160) });
    });
  });
}

const POWER_GUIDS = {
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  saver: 'a1841308-3541-4fab-bc81-f71556f20b4a',
};

async function applyMode(mode, durationSeconds, routine) {
  const previous = override?.previous || (previousMode && previousMode !== mode ? previousMode : 'neutral');
  override = {
    mode,
    previous,
    routineId: routine.id,
    routineName: routine.name,
    until: durationSeconds > 0 ? Date.now() + durationSeconds * 1000 : 0,
  };
  suppressModeTriggerUntil = Date.now() + Math.max(2500, (data.settings.pollSeconds || 5) * 1000 + 1000);
  refs.log('info', 'Automation', `Modus ${mode} durch ${routine.name}`);
}

async function executeAction(action, routine, context, depth) {
  switch (action.kind) {
    case 'open_app': {
      const result = await runCommand(openAppCommand(action.app));
      return { ok: result.ok, error: result.ok ? undefined : result.message };
    }
    case 'open_url': {
      const spec = openUrlCommand(action.url, '');
      if (spec) {
        const result = await runCommand(spec);
        return { ok: result.ok, error: result.ok ? undefined : result.message };
      }
      try {
        await refs.openExternal?.(action.url);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Link ließ sich nicht öffnen.' };
      }
    }
    case 'notify': {
      if (['gaming', 'relax', 'standby'].includes(context.mode) && routine.priority < 7) {
        return { ok: true, skipped: true, error: 'Im aktuellen Modus unterdrückt.' };
      }
      refs.notify(action.title, action.message, routine.priority);
      return { ok: true };
    }
    case 'set_mode': {
      await applyMode(action.mode, action.durationSeconds, routine);
      return { ok: true };
    }
    case 'restore_mode': {
      if (!override) return { ok: true, skipped: true, error: 'Kein gesetzter Modus zum Wiederherstellen.' };
      const previous = override.previous;
      override = null;
      suppressModeTriggerUntil = Date.now() + Math.max(2500, (data.settings.pollSeconds || 5) * 1000 + 1000);
      if (MODES.has(previous)) {
        override = {
          mode: previous,
          previous: 'neutral',
          routineId: routine.id,
          routineName: routine.name,
          until: Date.now() + 3000,
        };
      }
      return { ok: true };
    }
    case 'toggle_module': {
      const hidden = new Set(data.settings.hiddenModules);
      if (action.hidden) hidden.add(action.module);
      else hidden.delete(action.module);
      data.settings.hiddenModules = [...hidden];
      persist();
      broadcast();
      return { ok: true };
    }
    case 'set_volume': {
      const result = await runCommand(setVolumeCommand(action.percent, path.join(__dirname, 'volume', 'level.ps1')));
      return { ok: result.ok, error: result.ok ? undefined : result.message };
    }
    case 'create_reminder': {
      if (!refs.addTimer) return { ok: false, error: 'Timer-Speicher nicht verfügbar.' };
      refs.addTimer({ label: action.label, kind: 'timer', due: Date.now() + action.seconds * 1000 });
      return { ok: true };
    }
    case 'run_routine': {
      if (depth >= MAX_DEPTH) return { ok: false, error: 'Zu tiefe Routine-Verkettung.' };
      const target = data.routines.find((entry) => entry.id === action.routineId && entry.enabled);
      if (!target) return { ok: false, error: 'Zielroutine nicht gefunden oder deaktiviert.' };
      if (target.id === routine.id) return { ok: false, error: 'Eine Routine kann sich nicht selbst starten.' };
      const result = await runRoutine(target, context, { depth: depth + 1, source: `Routine ${routine.name}` });
      return { ok: result.status === 'ok', error: result.status === 'ok' ? undefined : result.message };
    }
    case 'power_plan': {
      if (process.platform !== 'win32') return { ok: false, error: 'Energieprofile gibt es nur unter Windows.' };
      const result = await runCommand({ command: 'powercfg.exe', args: ['/setactive', POWER_GUIDS[action.plan]] });
      return { ok: result.ok, error: result.ok ? undefined : result.message };
    }
    case 'briefing': {
      refs.onBriefing({ routineId: routine.id, routineName: routine.name, prompt: action.prompt });
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Unbekannte Aktion.' };
  }
}

/* ---------------------------------------------------------------- Ausführung */

function historyEntry(routine, trigger, status, message, actions, startedAt) {
  const entry = {
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    at: Date.now(),
    routineId: routine.id,
    routineName: routine.name,
    trigger,
    status,
    message: text(message, 240),
    actions,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
  data.history.push(entry);
  if (data.history.length > MAX_HISTORY) data.history.splice(0, data.history.length - MAX_HISTORY);
  recentRuns = data.history.slice(-MAX_HISTORY);
  persist();
  return entry;
}

async function confirmRoutine(routine) {
  const needsConfirm = routine.requireConfirmation || routine.actions.some((action) => action.kind === 'power_plan');
  if (!needsConfirm) return true;
  try {
    return await refs.confirm(routine);
  } catch {
    return false;
  }
}

async function runRoutine(routine, context, options = {}) {
  if (runDepth > MAX_DEPTH) return { status: 'skipped', message: 'Zu viele gleichzeitige Routinen.' };
  if (!routine || !data.routines.some((entry) => entry.id === routine.id)) {
    return { status: 'skipped', message: 'Routine nicht gefunden.' };
  }
  if (!routine.enabled && !options.manual) {
    return { status: 'skipped', message: 'Routine ist deaktiviert.' };
  }
  const now = Date.now();
  if (!options.manual && now - Number(routine.lastRunAt || 0) < routine.cooldownSeconds * 1000) {
    return { status: 'skipped', message: 'Cooldown aktiv.' };
  }
  if (options.actionsSetMode && routine.actions.some((action) => action.kind === 'set_mode')) {
    return { status: 'skipped', message: 'Konflikt: Ein höher priorisierter Modus wurde bereits gesetzt.' };
  }

  const condition = evaluateConditions(routine, context);
  const startedAt = now;
  if (!condition.ok) {
    routine.lastRunAt = now;
    routine.lastStatus = 'skipped';
    historyEntry(routine, options.source || triggerLabel(routine), 'skipped', condition.reason, [], startedAt);
    return { status: 'skipped', message: condition.reason };
  }

  if (!(await confirmRoutine(routine))) {
    routine.lastRunAt = now;
    routine.lastStatus = 'skipped';
    historyEntry(routine, options.source || triggerLabel(routine), 'skipped', 'Vom Nutzer nicht bestätigt.', [], startedAt);
    return { status: 'skipped', message: 'Nicht bestätigt.' };
  }

  if (options.actionsSetMode === undefined) {
    options.actionsSetMode = false;
  }
  if (routine.actions.some((action) => action.kind === 'set_mode')) options.actionsSetMode = true;

  runDepth += 1;
  const results = [];
  let failed = false;
  try {
    for (const action of routine.actions) {
      try {
        const result = await executeAction(action, routine, context, options.depth || 0);
        results.push({
          kind: action.kind,
          label: ACTION_LABEL[action.kind],
          ok: Boolean(result.ok),
          ...(result.error ? { error: result.error } : {}),
          ...(result.skipped ? { skipped: true } : {}),
        });
        if (!result.ok) failed = true;
      } catch (error) {
        failed = true;
        results.push({ kind: action.kind, label: ACTION_LABEL[action.kind], ok: false, error: text(error?.message, 160) });
      }
    }
  } finally {
    runDepth -= 1;
  }

  routine.lastRunAt = Date.now();
  routine.lastStatus = failed ? 'error' : 'ok';
  routine.lastError = failed ? text(results.find((entry) => !entry.ok)?.error || 'Aktion fehlgeschlagen.', 200) : undefined;
  routine.updatedAt = Date.now();
  const message = failed ? 'Mindestens eine Aktion ist fehlgeschlagen.' : 'Ausgeführt.';
  historyEntry(routine, options.source || triggerLabel(routine), failed ? 'error' : 'ok', message, results, startedAt);
  broadcast();
  return { status: failed ? 'error' : 'ok', message, actions: results };
}

/* -------------------------------------------------------------- Triggerprüfung */

async function triggerFired(routine, context, events) {
  const trigger = routine.trigger;
  switch (trigger.kind) {
    case 'startup':
      return events.startup ? 'Systemstart' : '';
    case 'time': {
      const now = new Date();
      const key = `${routine.id}:${now.toDateString()} ${trigger.at}`;
      if (timeFired.has(key)) return '';
      const weekday = (now.getDay() + 6) % 7;
      if (!trigger.days.includes(weekday)) return '';
      const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (current !== trigger.at) return '';
      if (Date.now() - Number(routine.lastRunAt || 0) < 90_000) return '';
      timeFired.set(key, true);
      if (timeFired.size > 400) timeFired.clear();
      return `${trigger.at} Uhr`;
    }
    case 'app_start':
      return events.started.some((app) => normalizeProcess(trigger.app) === app || app.includes(normalizeProcess(trigger.app))) ? `Start von ${trigger.app}` : '';
    case 'app_stop':
      return events.stopped.some((app) => normalizeProcess(trigger.app) === app || app.includes(normalizeProcess(trigger.app))) ? `Ende von ${trigger.app}` : '';
    case 'mode_change':
      return events.modeChanged && (trigger.mode === 'any' || trigger.mode === context.mode) ? `Wechsel zu ${context.mode}` : '';
    case 'threshold': {
      const value = context.metrics?.[trigger.metric];
      if (value == null) return '';
      const armed = thresholdArmed.get(routine.id) !== false;
      const hit = trigger.direction === 'above' ? value > trigger.value : value < trigger.value;
      if (!hit) {
        thresholdArmed.set(routine.id, true);
        return '';
      }
      if (!armed) return '';
      thresholdArmed.set(routine.id, false);
      return `${trigger.metric} ${value}${trigger.metric === 'temperature' ? ' °C' : ' %'}`;
    }
    case 'idle': {
      const hit = context.idleSeconds >= trigger.minutes * 60;
      if (!hit) {
        idleLatch.delete(routine.id);
        return '';
      }
      if (idleLatch.has(routine.id)) return '';
      idleLatch.add(routine.id);
      return `${trigger.minutes} min inaktiv`;
    }
    case 'manual':
    case 'voice':
      return '';
    default:
      return '';
  }
}

async function processTriggers(context, events) {
  if (!data.settings.enabled) return;
  const routines = [...data.routines]
    .filter((routine) => routine.enabled)
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  let modeSet = false;
  for (const routine of routines) {
    let source;
    try {
      source = await triggerFired(routine, context, events);
    } catch {
      source = '';
    }
    if (!source) continue;
    const result = await runRoutine(routine, context, { source, actionsSetMode: modeSet });
    if (result.actions?.some((action) => action.kind === 'set_mode' && action.ok)) {
      modeSet = true;
    }
  }
}

/* ------------------------------------------------------------------- Tick */

async function tick() {
  if (!data || ticking) return;
  ticking = true;
  try {
    // Abgelaufene Modus-Übersteuerung vor der Kontextabfrage aufräumen, damit
    // die Automatik im selben Zyklus wieder greifen kann.
    if (override && override.until > 0 && override.until <= Date.now()) {
      override = null;
    }
    const context = await sampleContext();
    const events = { started: [], stopped: [], modeChanged: false, startup: false };
    const previous = previousMode;
    if (context.mode !== previousMode) {
      events.modeChanged = Date.now() > suppressModeTriggerUntil;
      previousMode = context.mode;
    }
    const lastProcesses = tick.lastProcesses || [];
    const current = context.processes;
    if (lastProcesses.length) {
      const previousSet = new Set(lastProcesses);
      const currentSet = new Set(current);
      events.started = current.filter((name) => !previousSet.has(name)).slice(0, 40);
      events.stopped = lastProcesses.filter((name) => !currentSet.has(name)).slice(0, 40);
    }
    tick.lastProcesses = current;
    tick.lastContext = context;

    // Der Gaming Hub wertet denselben Kontext aus, ohne einen zweiten
    // Prozess- oder Fenster-Scan zu starten.
    try {
      refs.onContext?.(context);
    } catch (error) {
      refs.log('warning', 'Automation', `Gaming-Kontext fehlgeschlagen: ${text(error?.message || error, 160)}`);
    }

    // Der Start-Trigger läuft genau einmal, beim ersten Tick nach dem Start.
    events.startup = !startupHandled && data.settings.enabled;
    if (!startupHandled) startupHandled = true;

    await processTriggers(context, events);
    tickError = '';
    broadcast();
  } catch (error) {
    tickError = text(error?.message || error, 200);
    refs.log('warning', 'Automation', `Prüfzyklus fehlgeschlagen: ${tickError}`);
  } finally {
    ticking = false;
  }
}

function schedule() {
  if (timer) clearInterval(timer);
  timer = null;
  if (!data) return;
  const seconds = data.settings.pollSeconds;
  timer = setInterval(() => void tick(), Math.max(TICK_MIN_MS, seconds * 1000));
  timer.unref?.();
}

/* ------------------------------------------------------------------ Snapshot */

function conflicts(routines) {
  const active = routines.filter((routine) => routine.enabled);
  const list = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      const appA = ['app_start', 'app_stop'].includes(a.trigger.kind) ? a.trigger.app : '';
      const appB = ['app_start', 'app_stop'].includes(b.trigger.kind) ? b.trigger.app : '';
      const modeA = a.actions.find((action) => action.kind === 'set_mode');
      const modeB = b.actions.find((action) => action.kind === 'set_mode');
      if (appA && appA === appB) {
        list.push({ routineId: a.id, otherId: b.id, message: `„${a.name}“ und „${b.name}“ reagieren beide auf ${appA}.` });
      } else if (modeA && modeB && modeA.mode !== modeB.mode) {
        list.push({
          routineId: a.id,
          otherId: b.id,
          message: `„${a.name}“ und „${b.name}“ setzen unterschiedliche Modi (${modeA.mode} / ${modeB.mode}).`,
        });
      }
    }
  }
  return list.slice(0, 6);
}

function snapshot() {
  const context = tick.lastContext || {
    at: Date.now(),
    mode: data.settings.manualMode || 'neutral',
    reason: data.settings.manualMode ? 'Manuell gewählt.' : 'Kontext wird ermittelt …',
    automatic: !data.settings.manualMode,
    manual: data.settings.manualMode,
    idleSeconds: 0,
    activeApp: null,
    processes: [],
    metrics: metricsCache,
    overrideUntil: override?.until || 0,
  };
  return {
    supported: true,
    settings: data.settings,
    routines: data.routines,
    context,
    history: recentRuns.slice(-60).reverse(),
    conflicts: conflicts(data.routines),
    tickError,
  };
}

function broadcast() {
  try {
    refs.onState(snapshot());
  } catch {
    /* Fenster kann geschlossen sein. */
  }
}

/* --------------------------------------------------------------- Öffentlich */

function configure(next = {}) {
  if (next.file) file = String(next.file);
  Object.assign(refs, next);
  load();
  tick.lastProcesses = [];
  started = true;
  startupHandled = false;
  timeFired.clear();
  override = null;
  idleLatch = new Set();
  thresholdArmed = new Map();
  previousMode = data.settings.manualMode || 'neutral';
  schedule();
  void tick();
}

function getState() {
  return snapshot();
}

function refreshContextAfterSettings() {
  const context = tick.lastContext;
  if (!context) return;
  const base = { ...context, manual: data.settings.manualMode };
  const resolved = resolveMode(base);
  tick.lastContext = {
    ...context,
    mode: resolved.mode,
    reason: resolved.reason,
    automatic: resolved.automatic,
    manual: data.settings.manualMode,
    overrideUntil: override ? override.until : 0,
  };
}

function setEnabled(enabled) {
  if (!data) return snapshot();
  data.settings.enabled = Boolean(enabled);
  // Der zentrale Ausschalter darf keinen von einer Routine gesetzten Modus
  // stehen lassen; die Automatik übernimmt wieder die normale Erkennung.
  if (!data.settings.enabled && override) override = null;
  persist();
  // Beim Einschalten keinen Systemstart nachholen — nur echte Starts zählen.
  if (data.settings.enabled) startupHandled = true;
  refreshContextAfterSettings();
  broadcast();
  return snapshot();
}

function setModeSettings(patch = {}) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const allowed = ['autoContext', 'manualMode', 'idleMinutes', 'pollSeconds'];
  for (const key of allowed) {
    if (!(key in patch)) continue;
    if (key === 'autoContext') data.settings.autoContext = Boolean(patch.autoContext);
    if (key === 'manualMode') data.settings.manualMode = MODES.has(patch.manualMode) ? patch.manualMode : null;
    if (key === 'idleMinutes') data.settings.idleMinutes = clampNumber(patch.idleMinutes, 1, 120, 8);
    if (key === 'pollSeconds') data.settings.pollSeconds = clampNumber(patch.pollSeconds, 3, 30, 5);
  }
  // Auch die Rückkehr auf „Auto“ muss einen von einer Routine gesetzten
  // Modus beenden; sonst bliebe der Override unsichtbar bestehen.
  if ('manualMode' in patch) override = null;
  if ('autoContext' in patch && !patch.autoContext) override = null;
  persist();
  schedule();
  refreshContextAfterSettings();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function setProfiles(profiles = {}) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const clean = (list, fallback) => {
    const entries = (Array.isArray(list) ? list : [])
      .map((entry) => text(entry, 60).toLowerCase())
      .filter(Boolean)
      .slice(0, 40);
    return entries.length ? [...new Set(entries)] : fallback;
  };
  const defaults = settingsDefaults().profiles;
  data.settings.profiles = {
    gaming: clean(profiles.gaming, defaults.gaming),
    productivity: clean(profiles.productivity, defaults.productivity),
    relax: clean(profiles.relax, defaults.relax),
  };
  persist();
  refreshContextAfterSettings();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function saveRoutine(input) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const routine = normalizeRoutine(input);
  if (!routine) return { ok: false, error: 'Die Routine ist unvollständig oder enthält ungültige Aktionen.' };
  const index = data.routines.findIndex((entry) => entry.id === routine.id);
  if (index >= 0) {
    routine.createdAt = data.routines[index].createdAt;
    data.routines[index] = routine;
  } else {
    if (data.routines.length >= MAX_ROUTINES) return { ok: false, error: 'Zu viele Routinen.' };
    data.routines.push(routine);
  }
  persist();
  broadcast();
  return { ok: true, routine, snapshot: snapshot() };
}

function deleteRoutine(id) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const key = text(id, 60);
  const before = data.routines.length;
  data.routines = data.routines.filter((entry) => entry.id !== key);
  if (data.routines.length === before) return { ok: false, error: 'Routine nicht gefunden.' };
  if (override?.routineId === key) override = null;
  persist();
  refreshContextAfterSettings();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function duplicateRoutine(id) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const source = data.routines.find((entry) => entry.id === text(id, 60));
  if (!source) return { ok: false, error: 'Routine nicht gefunden.' };
  const copy = normalizeRoutine({
    ...source,
    id: undefined,
    name: `${source.name} (Kopie)`,
    enabled: false,
    preset: undefined,
    lastRunAt: undefined,
    lastStatus: undefined,
    lastError: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  if (!copy) return { ok: false, error: 'Kopie konnte nicht erstellt werden.' };
  if (data.routines.length >= MAX_ROUTINES) return { ok: false, error: 'Zu viele Routinen.' };
  data.routines.push(copy);
  persist();
  broadcast();
  return { ok: true, routine: copy, snapshot: snapshot() };
}

function toggleRoutine(id, enabled) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const routine = data.routines.find((entry) => entry.id === text(id, 60));
  if (!routine) return { ok: false, error: 'Routine nicht gefunden.' };
  routine.enabled = Boolean(enabled);
  routine.updatedAt = Date.now();
  if (!routine.enabled && override?.routineId === routine.id) override = null;
  persist();
  refreshContextAfterSettings();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function beginGameMode(gameName) {
  if (!data) return { ok: false, reason: 'Engine nicht bereit.' };
  if (!data.settings.enabled) return { ok: false, reason: 'Automationen sind ausgeschaltet.' };
  if (data.settings.manualMode) return { ok: false, reason: 'Manueller Modus hat Vorrang.' };
  if (override?.routineId === 'gaming-hub' && override.mode === 'gaming') {
    return { ok: true, mode: 'gaming', reason: 'Gaming-Modus läuft bereits.' };
  }
  const previous = override?.previous || (previousMode && previousMode !== 'gaming' ? previousMode : 'neutral');
  override = {
    mode: 'gaming',
    previous,
    routineId: 'gaming-hub',
    routineName: gameName ? `Gaming: ${text(gameName, 60)}` : 'Gaming Hub',
    until: 0,
  };
  suppressModeTriggerUntil = Date.now() + Math.max(2500, (data.settings.pollSeconds || 5) * 1000 + 1000);
  refreshContextAfterSettings();
  broadcast();
  return { ok: true, mode: 'gaming', previous };
}

function endGameMode() {
  if (!data || override?.routineId !== 'gaming-hub') {
    return { ok: false, reason: 'Kein Gaming-Override aktiv.' };
  }
  override = null;
  suppressModeTriggerUntil = Date.now() + Math.max(2500, (data.settings.pollSeconds || 5) * 1000 + 1000);
  refreshContextAfterSettings();
  broadcast();
  return { ok: true };
}

async function runRoutineById(id, source = 'Gaming-Profil') {
  if (!data) return { ok: false, status: 'skipped', message: 'Engine nicht bereit.' };
  if (!data.settings.enabled) return { ok: false, status: 'skipped', message: 'Automationen sind ausgeschaltet.' };
  const routine = data.routines.find((entry) => entry.id === text(id, 60));
  if (!routine) return { ok: false, status: 'skipped', message: 'Routine nicht gefunden.' };
  const context = tick.lastContext || (await sampleContext());
  const result = await runRoutine(routine, context, { source });
  broadcast();
  return {
    ok: result.status === 'ok',
    status: result.status,
    message: result.message,
    actions: result.actions,
  };
}

function setHiddenModules(modules) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  data.settings.hiddenModules = (Array.isArray(modules) ? modules : []).filter((module) => MODULES.has(module));
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

async function runManual(id) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const routine = data.routines.find((entry) => entry.id === text(id, 60));
  if (!routine) return { ok: false, error: 'Routine nicht gefunden.' };
  const context = tick.lastContext || (await sampleContext());
  const result = await runRoutine(routine, context, { manual: true, source: 'Manuell gestartet' });
  broadcast();
  return { ok: result.status === 'ok', status: result.status, message: result.message, actions: result.actions };
}

async function simulate(id) {
  if (!data) return { ok: false, error: 'Engine nicht bereit.' };
  const routine = data.routines.find((entry) => entry.id === text(id, 60));
  if (!routine) return { ok: false, error: 'Routine nicht gefunden.' };
  const context = tick.lastContext || (await sampleContext());
  const conditions = evaluateConditions(routine, context);
  const trigger = routine.trigger;
  let triggerOk = false;
  let triggerNote = '';
  switch (trigger.kind) {
    case 'time':
      triggerOk = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}` === trigger.at;
      triggerNote = triggerOk ? 'Uhrzeit stimmt mit der aktuellen Minute überein.' : `Würde um ${trigger.at} Uhr auslösen.`;
      break;
    case 'app_start':
    case 'app_stop':
      triggerOk = processRunning(context, trigger.app);
      triggerNote = triggerOk ? `${trigger.app} läuft aktuell.` : `${trigger.app} läuft aktuell nicht.`;
      break;
    case 'threshold': {
      const value = context.metrics?.[trigger.metric];
      triggerOk = value != null && (trigger.direction === 'above' ? value > trigger.value : value < trigger.value);
      triggerNote = value == null ? 'Sensorwert nicht verfügbar.' : `${trigger.metric}: ${value}${trigger.metric === 'temperature' ? ' °C' : ' %'}.`;
      break;
    }
    case 'idle':
      triggerOk = context.idleSeconds >= trigger.minutes * 60;
      triggerNote = `Inaktivität: ${Math.round(context.idleSeconds / 60)} min.`;
      break;
    case 'mode_change':
      triggerOk = true;
      triggerNote = 'Wird bei einem passenden Moduswechsel ausgelöst.';
      break;
    case 'startup':
      triggerNote = 'Wird beim nächsten Systemstart ausgelöst.';
      break;
    case 'manual':
    case 'voice':
      triggerOk = true;
      triggerNote = 'Wird manuell oder per Sprache gestartet.';
      break;
    default:
      triggerNote = 'Unbekannt.';
  }
  return {
    ok: true,
    triggerOk,
    triggerNote,
    conditionsOk: conditions.ok,
    conditionsNote: conditions.reason || 'Alle Bedingungen erfüllt.',
    wouldRun: data.settings.enabled && routine.enabled && triggerOk && conditions.ok,
    actions: routine.actions.map((action) => ACTION_LABEL[action.kind] || action.kind),
    contextMode: context.mode,
  };
}

function history(limit) {
  return recentRuns
    .slice(-Math.max(1, Math.min(MAX_HISTORY, Number(limit) || 60)))
    .reverse();
}

function clearHistory() {
  if (!data) return { ok: false };
  data.history = [];
  recentRuns = [];
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function checkTriggersNow() {
  void tick();
  return { ok: true };
}

module.exports = {
  configure,
  getState,
  setEnabled,
  setModeSettings,
  setProfiles,
  setHiddenModules,
  saveRoutine,
  deleteRoutine,
  duplicateRoutine,
  toggleRoutine,
  runManual,
  beginGameMode,
  endGameMode,
  runRoutineById,
  simulate,
  history,
  clearHistory,
  checkTriggersNow,
  // Für Tests und Wiederverwendung:
  _internals: {
    normalizeRoutine,
    normalizeSettings,
    presetRoutines,
    evaluateCondition,
    evaluateConditions,
    resolveMode,
    triggerFired,
    appMatches,
    normalizeProcess,
    inWindow,
    conflicts,
  },
};
