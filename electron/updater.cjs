'use strict';

const { app, Notification } = require('electron');

const FIRST_CHECK_MS = 8000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

let autoUpdater = null;
let timer = null;
let onChange = () => {};
let onActivate = () => {};

let state = {
  status: 'idle', // idle|disabled|checking|available|downloading|ready|none|error
  current: '',
  newVersion: '',
  percent: 0,
  transferred: 0,
  total: 0,
  error: '',
  checkedAt: 0,
};

function setState(patch) {
  state = { ...state, ...patch, current: app.getVersion() };
  try {
    onChange(state);
  } catch {
    /* Fenster kann bereits geschlossen sein. */
  }
}

function load() {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    autoUpdater = null;
  }
  return autoUpdater;
}

function notifyReady(version) {
  if (!Notification.isSupported()) return;
  const note = new Notification({
    title: 'J.A.R.V.I.S. — Update bereit',
    body: `Version ${version || 'neu'} ist geladen. Neu starten, um zu aktualisieren.`,
    silent: false,
  });
  note.on('click', () => onActivate());
  note.show();
}

/** Einmal beim Start aufrufen; verbindet Ereignisse, prüft aber noch nicht. */
function configure({ onChange: handler, onActivate: activate } = {}) {
  if (typeof handler === 'function') onChange = handler;
  if (typeof activate === 'function') onActivate = activate;

  const updater = load();
  if (!updater) {
    setState({ status: 'disabled', error: 'electron-updater ist nicht installiert.' });
    return false;
  }
  if (!app.isPackaged) {
    setState({ status: 'disabled', error: 'Updates gibt es nur in der installierten App.' });
    return false;
  }

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  // Alpha-Versionen sind Prereleases; electron-updater muss sie zulassen.
  updater.allowPrerelease = /-/.test(app.getVersion());
  updater.logger = null;

  updater.on('checking-for-update', () => setState({ status: 'checking', error: '' }));
  updater.on('update-available', (info) =>
    setState({ status: 'available', newVersion: String(info?.version ?? '') }),
  );
  updater.on('update-not-available', () =>
    setState({ status: 'none', newVersion: '', checkedAt: Date.now() }),
  );
  updater.on('download-progress', (progress) =>
    setState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0))),
      transferred: Number(progress?.transferred) || 0,
      total: Number(progress?.total) || 0,
    }),
  );
  updater.on('update-downloaded', (info) => {
    const version = String(info?.version ?? '') || state.newVersion;
    setState({ status: 'ready', newVersion: version, percent: 100, checkedAt: Date.now() });
    notifyReady(version);
  });
  updater.on('error', (error) =>
    setState({
      status: 'error',
      error: String(error?.message || error || 'Unbekannter Fehler').slice(0, 300),
      checkedAt: Date.now(),
    }),
  );

  setState({ current: app.getVersion() });
  return true;
}

function stop() {
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
    timer = null;
  }
}

/** Erste Prüfung kurz nach dem Start, danach alle sechs Stunden. */
function start() {
  if (!autoUpdater) return;
  stop();
  timer = setTimeout(() => {
    void check({ manual: false });
    timer = setInterval(() => void check({ manual: false }), INTERVAL_MS);
  }, FIRST_CHECK_MS);
}

async function check({ manual = false } = {}) {
  const updater = load();
  if (!updater || !app.isPackaged) {
    if (manual) {
      setState({ status: 'disabled', error: 'Updates gibt es nur in der installierten App.' });
    }
    return getState();
  }
  if (state.status === 'downloading' || state.status === 'ready') return getState();

  setState({ status: 'checking', error: '' });
  try {
    await updater.checkForUpdates();
  } catch (error) {
    setState({
      status: 'error',
      error: String(error?.message || error || 'Prüfung fehlgeschlagen').slice(0, 300),
      checkedAt: Date.now(),
    });
  }
  return getState();
}

function install() {
  const updater = load();
  if (!updater || state.status !== 'ready') {
    return { ok: false, error: 'Kein Update bereit.' };
  }
  // Kurz warten, damit die IPC-Antwort den Renderer noch erreicht.
  setImmediate(() => updater.quitAndInstall(false, true));
  return { ok: true };
}

function getState() {
  return { ...state, current: app.getVersion() };
}

module.exports = { configure, start, stop, check, install, getState };
