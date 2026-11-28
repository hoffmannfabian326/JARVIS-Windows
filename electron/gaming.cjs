'use strict';

/**
 * Gaming Hub: lokale Bibliothek, Spielstarts, Sitzungsprotokoll und
 * Spielprofile. Der Renderer bearbeitet nur Daten; gestartet und gespeichert
 * wird ausschließlich hier im Hauptprozess.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { detectInstalledGames } = require('./gaming-detect.cjs');

const VERSION = 1;
const MAX_GAMES = 320;
const MAX_SESSIONS = 200;
const MAX_ARTICLES = 160;
const MAX_SAMPLES = 2400;
const MAX_TIMELINE = 120;
const MAX_ARGUMENTS = 300;

const LAUNCHERS = new Set(['steam', 'epic', 'battlenet', 'gog', 'ubisoft', 'ea', 'manual', 'custom']);
const LAYOUTS = new Set(['cinematic', 'compact', 'focus']);
const NOTIFICATION_MODES = new Set(['quiet', 'normal', 'all']);
const SOURCE_KINDS = new Set(['news', 'patch', 'raid', 'dungeon', 'class', 'general']);
const URI_SCHEMES = new Set(['steam:', 'com.epicgames.launcher:', 'uplay:', 'origin:', 'battlenet:', 'goggalaxy:']);

let file = '';
let assetsDir = '';
let data = null;
let refs = {};
let active = null;
let sessionTimer = null;
let sampling = false;
let activeProfileId = '';
let modeActive = false;
let lastContext = null;
let lastDetection = {
  available: false,
  lastAt: 0,
  message: 'Spieleerkennung wurde noch nicht ausgeführt.',
  launchers: [],
  errors: [],
};
let pendingLaunch = null;
let processMisses = 0;
let lastEndedAt = 0;
let detectTimer = null;
let newsTimer = null;
let refreshingArticles = false;
let volumeToRestore = null;
let lastEndedGameId = '';
const endedRecently = new Map();

function now() {
  return Date.now();
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function text(value, max = 240) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanName(value, fallback = 'Unbenannt') {
  const name = text(value, 90).replace(/[™®©]/g, '').trim();
  return name.length >= 2 ? name : fallback;
}

function safeId(value, fallback = '') {
  const id = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return id || fallback;
}

function processName(value) {
  return path
    .basename(String(value ?? '').replace(/\\/g, '/'))
    .replace(/\.exe$/i, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    if (isPrivateHost(url.hostname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function isPrivateHost(hostname) {
  const host = String(hostname ?? '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === '::1' || host === '[::1]' || host === '0.0.0.0') return true;
  return false;
}

function safeUri(value) {
  const uri = String(value ?? '').trim();
  if (!uri || uri.length > 500 || /[\s\u0000-\u001f]/.test(uri)) return '';
  try {
    const parsed = new URL(uri);
    return URI_SCHEMES.has(parsed.protocol) ? uri : '';
  } catch {
    return '';
  }
}

function splitArgs(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  if (raw.length > MAX_ARGUMENTS || /[\u0000-\u001f]/.test(raw)) throw new Error('Startparameter sind ungültig.');
  const result = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(raw))) {
    const part = match[1] ?? match[2] ?? match[3] ?? '';
    if (part) result.push(part);
    if (result.length > 24) throw new Error('Zu viele Startparameter.');
  }
  return result;
}

function emptySettings() {
  return {
    autoDetect: true,
    autoGamingMode: true,
    autoProfile: true,
    autoSession: true,
    autoReport: true,
    reducedNotifications: true,
    companionEnabled: false,
    companionAutoShow: false,
    sessionSampleSeconds: 10,
    newsRefreshMinutes: 30,
    selectedGameId: '',
  };
}

function emptyWow() {
  return { launcherPath: '', launcherArgs: '', characters: [], events: [], notes: [] };
}

function emptyData() {
  return {
    version: VERSION,
    settings: emptySettings(),
    games: [],
    profiles: [],
    sessions: [],
    sources: [],
    guides: [],
    wow: emptyWow(),
    cache: { articles: [], fetchedAt: 0 },
  };
}

function normalizeSettings(raw) {
  const base = emptySettings();
  if (!raw || typeof raw !== 'object') return base;
  return {
    autoDetect: raw.autoDetect !== false,
    autoGamingMode: raw.autoGamingMode !== false,
    autoProfile: raw.autoProfile !== false,
    autoSession: raw.autoSession !== false,
    autoReport: raw.autoReport !== false,
    reducedNotifications: raw.reducedNotifications !== false,
    companionEnabled: Boolean(raw.companionEnabled),
    companionAutoShow: Boolean(raw.companionAutoShow),
    sessionSampleSeconds: clamp(raw.sessionSampleSeconds, 5, 60, 10),
    newsRefreshMinutes: clamp(raw.newsRefreshMinutes, 5, 240, 30),
    selectedGameId: text(raw.selectedGameId, 60),
  };
}

function normalizeGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanName(raw.name);
  if (name.length < 2) return null;
  const launcher = LAUNCHERS.has(raw.launcher) ? raw.launcher : 'manual';
  const exe = typeof raw.exe === 'string' && raw.exe.trim() ? path.resolve(raw.exe.trim()) : '';
  const uri = safeUri(raw.uri);
  if (launcher !== 'steam' && !exe && !uri) return null;
  return {
    id: safeId(raw.id, `game_${now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`),
    name,
    launcher,
    source: raw.source === 'detected' ? 'detected' : 'manual',
    exe: exe || undefined,
    args: text(raw.args, MAX_ARGUMENTS),
    uri: uri || undefined,
    process: processName(raw.process || exe || ''),
    installDir: text(raw.installDir, 400),
    steamAppId: text(raw.steamAppId, 20) || undefined,
    epicAppName: text(raw.epicAppName, 120) || undefined,
    kind: raw.kind === 'launcher' || raw.kind === 'tool' ? raw.kind : 'game',
    genre: text(raw.genre, 40),
    description: text(raw.description, 500),
    coverUrl: safeHttpUrl(raw.coverUrl) || undefined,
    heroUrl: safeHttpUrl(raw.heroUrl) || undefined,
    customCover: safeAssetName(raw.customCover),
    customHero: safeAssetName(raw.customHero),
    favorite: Boolean(raw.favorite),
    playtimeSeconds: clamp(raw.playtimeSeconds, 0, 10_000_000_000, 0),
    lastPlayedAt: clamp(raw.lastPlayedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    addedAt: clamp(raw.addedAt, 0, Number.MAX_SAFE_INTEGER, now()),
    available: raw.available !== false,
  };
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gameId = text(raw.gameId, 60);
  if (!gameId) return null;
  return {
    id: safeId(raw.id, `profile_${now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`),
    gameId,
    launcher: LAUNCHERS.has(raw.launcher) ? raw.launcher : 'manual',
    args: text(raw.args, MAX_ARGUMENTS),
    layout: LAYOUTS.has(raw.layout) ? raw.layout : 'cinematic',
    notifications: NOTIFICATION_MODES.has(raw.notifications) ? raw.notifications : 'quiet',
    hardwareMonitoring: raw.hardwareMonitoring !== false,
    guideIds: (Array.isArray(raw.guideIds) ? raw.guideIds : []).map((id) => text(id, 60)).filter(Boolean).slice(0, 20),
    sourceIds: (Array.isArray(raw.sourceIds) ? raw.sourceIds : []).map((id) => text(id, 60)).filter(Boolean).slice(0, 20),
    automationRoutineId: text(raw.automationRoutineId, 60),
    autoRoutine: Boolean(raw.autoRoutine),
    autoActivate: raw.autoActivate !== false,
    backgroundAsset: safeAssetName(raw.backgroundAsset),
    coverAsset: safeAssetName(raw.coverAsset),
    audioPercent: raw.audioPercent == null ? null : clamp(raw.audioPercent, 0, 100, 50),
    applyVolume: Boolean(raw.applyVolume),
    updatedAt: clamp(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, now()),
  };
}

function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = safeHttpUrl(raw.url);
  const name = cleanName(raw.name, 'Newsquelle');
  if (!url || !name) return null;
  return {
    id: safeId(raw.id, `source_${now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`),
    name,
    url,
    kind: SOURCE_KINDS.has(raw.kind) ? raw.kind : 'news',
    game: raw.game === 'wow' ? 'wow' : 'general',
    enabled: raw.enabled !== false,
  };
}

function normalizeArticle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 180);
  const url = safeHttpUrl(raw.url);
  if (!title || !url) return null;
  return {
    id: safeId(raw.id, crypto.createHash('sha1').update(`${url}|${title}`).digest('hex').slice(0, 24)),
    sourceId: text(raw.sourceId, 60),
    sourceName: text(raw.sourceName, 80),
    title,
    url,
    summary: text(raw.summary, 500),
    publishedAt: clamp(raw.publishedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    fetchedAt: clamp(raw.fetchedAt, 0, Number.MAX_SAFE_INTEGER, now()),
    kind: SOURCE_KINDS.has(raw.kind) ? raw.kind : 'news',
    game: raw.game === 'wow' ? 'wow' : 'general',
  };
}

function normalizeGuide(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 120);
  const url = safeHttpUrl(raw.url);
  if (!title || !url) return null;
  return {
    id: safeId(raw.id, `guide_${now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`),
    title,
    url,
    category: SOURCE_KINDS.has(raw.category) ? raw.category : 'general',
    game: text(raw.game, 40) || 'general',
    summary: text(raw.summary, 400),
    updatedAt: clamp(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, now()),
  };
}

function normalizeCharacter(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name, 40);
  if (!name) return null;
  return {
    id: safeId(raw.id, `char_${now().toString(36)}`),
    name,
    className: text(raw.className, 40),
    spec: text(raw.spec, 40),
    realm: text(raw.realm, 60),
    itemLevel: raw.itemLevel == null ? null : clamp(raw.itemLevel, 0, 999, 0),
    notes: text(raw.notes, 400),
  };
}

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 100);
  if (!title) return null;
  return {
    id: safeId(raw.id, `event_${now().toString(36)}`),
    title,
    at: clamp(raw.at, 0, Number.MAX_SAFE_INTEGER, now()),
    kind: raw.kind === 'dungeon' || raw.kind === 'event' ? raw.kind : 'raid',
    note: text(raw.note, 300),
  };
}

function normalizeWow(raw) {
  const base = emptyWow();
  if (!raw || typeof raw !== 'object') return base;
  return {
    launcherPath: text(raw.launcherPath, 400),
    launcherArgs: text(raw.launcherArgs, MAX_ARGUMENTS),
    characters: (Array.isArray(raw.characters) ? raw.characters : []).map(normalizeCharacter).filter(Boolean).slice(0, 40),
    events: (Array.isArray(raw.events) ? raw.events : []).map(normalizeEvent).filter(Boolean).slice(0, 80),
    notes: (Array.isArray(raw.notes) ? raw.notes : [])
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const value = text(entry.text, 1200);
        return value
          ? {
              id: safeId(entry.id, `note_${now().toString(36)}`),
              text: value,
              updatedAt: clamp(entry.updatedAt, 0, Number.MAX_SAFE_INTEGER, now()),
            }
          : null;
      })
      .filter(Boolean)
      .slice(0, 60),
  };
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gameName = text(raw.gameName, 90);
  if (!gameName) return null;
  const timeline = (Array.isArray(raw.timeline) ? raw.timeline : [])
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      return {
        at: clamp(entry.at, 0, Number.MAX_SAFE_INTEGER, 0),
        cpu: entry.cpu == null ? null : clamp(entry.cpu, 0, 100, 0),
        gpu: entry.gpu == null ? null : clamp(entry.gpu, 0, 100, 0),
        ram: entry.ram == null ? null : clamp(entry.ram, 0, 100, 0),
        cpuTemp: entry.cpuTemp == null ? null : clamp(entry.cpuTemp, 0, 150, 0),
        gpuTemp: entry.gpuTemp == null ? null : clamp(entry.gpuTemp, 0, 150, 0),
      };
    })
    .filter(Boolean)
    .slice(-MAX_TIMELINE);
  return {
    id: safeId(raw.id, `session_${now().toString(36)}`),
    gameId: text(raw.gameId, 60),
    gameName,
    startedAt: clamp(raw.startedAt, 0, Number.MAX_SAFE_INTEGER, now()),
    endedAt: clamp(raw.endedAt, 0, Number.MAX_SAFE_INTEGER, now()),
    durationSeconds: clamp(raw.durationSeconds, 0, 10_000_000, 0),
    avgCpu: raw.avgCpu == null ? null : clamp(raw.avgCpu, 0, 100, 0),
    avgGpu: raw.avgGpu == null ? null : clamp(raw.avgGpu, 0, 100, 0),
    avgRam: raw.avgRam == null ? null : clamp(raw.avgRam, 0, 100, 0),
    maxCpuTemp: raw.maxCpuTemp == null ? null : clamp(raw.maxCpuTemp, 0, 150, 0),
    maxGpuTemp: raw.maxGpuTemp == null ? null : clamp(raw.maxGpuTemp, 0, 150, 0),
    avgFps: null,
    avgDown: raw.avgDown == null ? null : clamp(raw.avgDown, 0, Number.MAX_SAFE_INTEGER, 0),
    avgUp: raw.avgUp == null ? null : clamp(raw.avgUp, 0, Number.MAX_SAFE_INTEGER, 0),
    anomalies: (Array.isArray(raw.anomalies) ? raw.anomalies : []).map((entry) => text(entry, 180)).filter(Boolean).slice(0, 8),
    source: raw.source === 'detected' || raw.source === 'manual' ? raw.source : 'hub',
    profileId: text(raw.profileId, 60) || undefined,
    timeline,
    ...(raw.comparison && typeof raw.comparison === 'object'
      ? {
          comparison: {
            previousAt: clamp(raw.comparison.previousAt, 0, Number.MAX_SAFE_INTEGER, 0),
            durationDeltaSeconds: Number(raw.comparison.durationDeltaSeconds) || 0,
            cpuDelta: raw.comparison.cpuDelta == null ? null : Number(raw.comparison.cpuDelta),
            gpuDelta: raw.comparison.gpuDelta == null ? null : Number(raw.comparison.gpuDelta),
            maxTempDelta: raw.comparison.maxTempDelta == null ? null : Number(raw.comparison.maxTempDelta),
          },
        }
      : {}),
  };
}

function safeAssetName(value) {
  const name = path.basename(String(value ?? '').trim());
  if (!name || name === '.' || name === '..') return '';
  return /^[a-zA-Z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(name) ? name : '';
}

function load() {
  data = emptyData();
  if (!file) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      data.settings = normalizeSettings(parsed.settings);
      data.games = (Array.isArray(parsed.games) ? parsed.games : []).map(normalizeGame).filter(Boolean).slice(0, MAX_GAMES);
      data.profiles = (Array.isArray(parsed.profiles) ? parsed.profiles : []).map(normalizeProfile).filter(Boolean).slice(0, 320);
      data.sessions = (Array.isArray(parsed.sessions) ? parsed.sessions : []).map(normalizeSession).filter(Boolean).slice(0, MAX_SESSIONS);
      data.sources = (Array.isArray(parsed.sources) ? parsed.sources : []).map(normalizeSource).filter(Boolean).slice(0, 80);
      data.guides = (Array.isArray(parsed.guides) ? parsed.guides : []).map(normalizeGuide).filter(Boolean).slice(0, 200);
      data.wow = normalizeWow(parsed.wow);
      data.cache = {
        articles: (Array.isArray(parsed.cache?.articles) ? parsed.cache.articles : [])
          .map(normalizeArticle)
          .filter(Boolean)
          .slice(-MAX_ARTICLES),
        fetchedAt: clamp(parsed.cache?.fetchedAt, 0, Number.MAX_SAFE_INTEGER, 0),
      };
    }
  } catch {
    /* Erste Sitzung oder beschädigte Datei: leere Bibliothek bleibt nutzbar. */
  }
}

function persist() {
  if (!file || !data) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  } catch (error) {
    refs.log?.('warning', 'Gaming Hub', `Speichern fehlgeschlagen: ${String(error?.message ?? error).slice(0, 180)}`);
  }
}

function ensureAssetsDir() {
  if (!assetsDir) return false;
  try {
    fs.mkdirSync(assetsDir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function assetMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function safeAssetRelative(value) {
  const relative = String(value ?? '').replace(/\\/g, '/');
  if (!relative || relative.length > 160 || relative.includes('..')) return '';
  if (!/^[a-zA-Z0-9._/-]+\.(png|jpe?g|webp|gif)$/i.test(relative)) return '';
  return relative;
}

function assetDataUrl(filename) {
  const safe = safeAssetRelative(filename);
  if (!safe || !assetsDir) return '';
  try {
    const full = path.join(assetsDir, safe);
    if (!full.startsWith(`${assetsDir}${path.sep}`)) return '';
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return '';
    return `data:${assetMime(safe)};base64,${fs.readFileSync(full).toString('base64')}`;
  } catch {
    return '';
  }
}

function saveAssetDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpe?g|webp|gif);base64,([a-zA-Z0-9+/=\s]+)$/.exec(String(dataUrl ?? ''));
  if (!match) throw new Error('Nur PNG, JPEG, WebP oder GIF werden unterstützt.');
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new Error('Das Bild muss zwischen 1 Byte und 8 MB groß sein.');
  if (!ensureAssetsDir()) throw new Error('Der Bildordner ist nicht beschreibbar.');
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const name = `asset_${now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  fs.writeFileSync(path.join(assetsDir, name), buffer);
  return name;
}

function activeGame() {
  return active ? data.games.find((game) => game.id === active.gameId) || null : null;
}

function profileFor(gameId) {
  return data.profiles.find((profile) => profile.gameId === gameId) || null;
}

function normalizeListAverage(values) {
  const list = values.filter((value) => Number.isFinite(value));
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
}

function maxOrNull(values) {
  const list = values.filter((value) => Number.isFinite(value));
  return list.length ? Math.max(...list) : null;
}

function emptyLive() {
  return {
    cpu: null,
    gpu: null,
    ram: null,
    cpuTemp: null,
    gpuTemp: null,
    vramUsed: null,
    vramTotal: null,
    down: null,
    up: null,
    fps: null,
  };
}

function liveFromSample(sample) {
  if (!sample) return emptyLive();
  return {
    cpu: sample.cpu?.load ?? null,
    gpu: sample.gpu?.load ?? null,
    ram: sample.mem?.percent ?? null,
    cpuTemp: sample.cpu?.temp ?? null,
    gpuTemp: sample.gpu?.temp ?? null,
    vramUsed: sample.gpu?.vramUsed ?? null,
    vramTotal: sample.gpu?.vramTotal ?? null,
    down: sample.net?.down ?? null,
    up: sample.net?.up ?? null,
    fps: null,
  };
}

function liveSession() {
  if (!active) return null;
  const live = active.samples.length ? liveFromSample(active.samples[active.samples.length - 1].raw) : active.live;
  return {
    id: active.id,
    gameId: active.gameId,
    gameName: active.gameName,
    startedAt: active.startedAt,
    source: active.source,
    elapsedSeconds: Math.max(0, Math.round((now() - active.startedAt) / 1000)),
    sampleCount: active.samples.length,
    live,
    profileId: activeProfileId,
    modeActive,
    tracking: active.runtimeProcess ? 'process' : 'manual',
    timeline: active.timeline.slice(-MAX_TIMELINE),
  };
}

function snapshot() {
  const config = data || emptyData();
  const automation = (() => {
    try {
      return refs.getAutomationState?.() || null;
    } catch {
      return null;
    }
  })();
  const games = config.games
    .map((game) => ({ ...game, available: game.exe ? fs.existsSync(game.exe) : Boolean(game.uri) }))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.lastPlayedAt - a.lastPlayedAt || a.name.localeCompare(b.name));
  // Verläufe der alten Sitzungen werden nicht im IPC-Snapshot übertragen;
  // die Berichte brauchen nur Kennzahlen. Das hält den Broadcast klein.
  const sessions = [...config.sessions]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 80)
    .map((session) => ({ ...session, timeline: [] }));
  return {
    supported: true,
    platform: process.platform,
    settings: config.settings,
    games,
    profiles: config.profiles,
    sessions,
    activeSession: liveSession(),
    detection: lastDetection,
    sources: config.sources,
    guides: config.guides,
    articles: [...config.cache.articles].sort((a, b) => (b.publishedAt || b.fetchedAt) - (a.publishedAt || a.fetchedAt)).slice(0, 80),
    wow: config.wow,
    companionOpen: Boolean(refs.isCompanionOpen?.()),
    automationEnabled: Boolean(automation?.settings?.enabled),
    automationMode: automation?.context?.mode || 'neutral',
    version: VERSION,
  };
}

function broadcast() {
  if (!data) return;
  try {
    refs.onState?.(snapshot());
  } catch {
    /* Fenster kann geschlossen sein. */
  }
}

/* ------------------------------------------------------------------ Sitzungen */

function buildSessionSummary(session) {
  const parts = [
    session.gameName,
    `${Math.round(session.durationSeconds / 60)} Minuten`,
    `CPU ${session.avgCpu == null ? 'n/a' : `${Math.round(session.avgCpu)} %`}`,
    `GPU ${session.avgGpu == null ? 'n/a' : `${Math.round(session.avgGpu)} %`}`,
  ];
  const temp = Math.max(session.maxCpuTemp ?? 0, session.maxGpuTemp ?? 0);
  if (temp > 0) parts.push(`max. ${Math.round(temp)} °C`);
  if (session.anomalies.length) parts.push(session.anomalies.join(' '));
  return parts.join(' · ');
}

function startSession(game, source) {
  if (!game || active) return null;
  if (now() - (endedRecently.get(game.id) || 0) < 12_000) return null;
  active = {
    id: `session_${now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    gameId: game.id,
    gameName: game.name,
    startedAt: now(),
    source: source || 'hub',
    samples: [],
    timeline: [],
    live: emptyLive(),
    runtimeProcess: game.process || '',
  };
  processMisses = 0;
  activeProfileId = '';
  modeActive = false;
  scheduleSessionSampling();
  void sampleSession();
  broadcast();
  return active;
}

function scheduleSessionSampling() {
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = null;
  if (!active) return;
  const seconds = clamp(data?.settings.sessionSampleSeconds, 5, 60, 10);
  sessionTimer = setInterval(() => void sampleSession(), seconds * 1000);
  sessionTimer.unref?.();
}

async function sampleSession() {
  if (!active || sampling || !refs.sampleSystem) return;
  // Ein Profil darf das Hardware-Monitoring abschalten. Dann bleiben alle
  // Messwerte ehrlich leer, statt aus einer anderen Quelle zu stammen.
  const profile = profileFor(active.gameId);
  if (profile && profile.hardwareMonitoring === false) {
    active.live = emptyLive();
    return;
  }
  sampling = true;
  try {
    const sample = await refs.sampleSystem();
    if (!active || !sample) return;
    active.live = liveFromSample(sample);
    const entry = {
      at: now(),
      cpu: sample.cpu?.load ?? null,
      gpu: sample.gpu?.load ?? null,
      ram: sample.mem?.percent ?? null,
      cpuTemp: sample.cpu?.temp ?? null,
      gpuTemp: sample.gpu?.temp ?? null,
      vramUsed: sample.gpu?.vramUsed ?? null,
      vramTotal: sample.gpu?.vramTotal ?? null,
      down: sample.net?.down ?? null,
      up: sample.net?.up ?? null,
    };
    active.samples.push({ ...entry, raw: sample });
    if (active.samples.length > MAX_SAMPLES) active.samples.splice(0, active.samples.length - MAX_SAMPLES);
    active.timeline.push({
      at: entry.at,
      cpu: entry.cpu,
      gpu: entry.gpu,
      ram: entry.ram,
      cpuTemp: entry.cpuTemp,
      gpuTemp: entry.gpuTemp,
    });
    if (active.timeline.length > MAX_TIMELINE) {
      active.timeline = active.timeline.filter((_, index) => index % 2 === 0);
    }
    broadcast();
  } catch (error) {
    refs.log?.('warning', 'Gaming Hub', `Messwert fehlgeschlagen: ${String(error?.message ?? error).slice(0, 160)}`);
  } finally {
    sampling = false;
  }
}

function endSession(reason = 'manual') {
  if (!active) return { ok: false, error: 'Keine laufende Spielsitzung.' };
  const sessionState = active;
  const game = activeGame();
  active = null;
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = null;
  sampling = false;
  processMisses = 0;
  pendingLaunch = null;
  const endedAt = now();
  const durationSeconds = Math.max(0, Math.round((endedAt - sessionState.startedAt) / 1000));
  const values = sessionState.samples;
  const avgCpu = normalizeListAverage(values.map((entry) => entry.cpu));
  const avgGpu = normalizeListAverage(values.map((entry) => entry.gpu));
  const avgRam = normalizeListAverage(values.map((entry) => entry.ram));
  const maxCpuTemp = maxOrNull(values.map((entry) => entry.cpuTemp));
  const maxGpuTemp = maxOrNull(values.map((entry) => entry.gpuTemp));
  const avgDown = normalizeListAverage(values.map((entry) => entry.down));
  const avgUp = normalizeListAverage(values.map((entry) => entry.up));
  const anomalies = [];
  if (maxCpuTemp != null && maxCpuTemp >= 85) anomalies.push(`CPU-Temperatur erreichte ${Math.round(maxCpuTemp)} °C.`);
  if (maxGpuTemp != null && maxGpuTemp >= 85) anomalies.push(`GPU-Temperatur erreichte ${Math.round(maxGpuTemp)} °C.`);
  if (avgCpu != null && avgCpu >= 90) anomalies.push('CPU-Last lag im Mittel über 90 Prozent.');
  const previous = data.sessions.find((entry) => entry.gameId === sessionState.gameId) || null;
  const comparison = previous
    ? {
        previousAt: previous.startedAt,
        durationDeltaSeconds: durationSeconds - previous.durationSeconds,
        cpuDelta: avgCpu != null && previous.avgCpu != null ? avgCpu - previous.avgCpu : null,
        gpuDelta: avgGpu != null && previous.avgGpu != null ? avgGpu - previous.avgGpu : null,
        maxTempDelta:
          maxCpuTemp != null && previous.maxCpuTemp != null ? maxCpuTemp - previous.maxCpuTemp : null,
      }
    : undefined;
  const session = {
    id: sessionState.id,
    gameId: sessionState.gameId,
    gameName: sessionState.gameName,
    startedAt: sessionState.startedAt,
    endedAt,
    durationSeconds,
    avgCpu,
    avgGpu,
    avgRam,
    maxCpuTemp,
    maxGpuTemp,
    avgFps: null,
    avgDown,
    avgUp,
    anomalies,
    source: sessionState.source,
    ...(activeProfileId ? { profileId: activeProfileId } : {}),
    timeline: sessionState.timeline.slice(-MAX_TIMELINE),
    ...(comparison ? { comparison } : {}),
  };
  data.sessions.unshift(session);
  data.sessions = data.sessions.slice(0, MAX_SESSIONS);
  if (game) {
    game.playtimeSeconds += durationSeconds;
    game.lastPlayedAt = endedAt;
    if (sessionState.runtimeProcess) game.process = sessionState.runtimeProcess;
  }
  endedRecently.set(sessionState.gameId, endedAt);
  lastEndedGameId = sessionState.gameId;
  lastEndedAt = endedAt;
  if (modeActive) {
    try {
      refs.endGameMode?.();
    } catch {
      /* Automation kann deaktiviert sein. */
    }
    modeActive = false;
  }
  if (volumeToRestore != null) {
    const restore = volumeToRestore;
    volumeToRestore = null;
    try {
      void Promise.resolve(refs.setVolume?.(restore)).catch(() => {
        refs.log?.('warning', 'Gaming Hub', 'Vorherige Lautstärke konnte nicht wiederhergestellt werden.');
      });
    } catch {
      /* Kein Audio-Endpunkt verfügbar. */
    }
  }
  const report = { session, summary: buildSessionSummary(session) };
  activeProfileId = '';
  persist();
  try {
    refs.onReport?.(report);
  } catch {
    /* Bericht bleibt lokal gespeichert. */
  }
  if (data.settings.autoReport) {
    refs.notify?.('J.A.R.V.I.S. — Spielsitzung beendet', report.summary, 5);
  }
  refs.log?.(
    'info',
    'Gaming Hub',
    `Sitzung ${sessionState.gameName}: ${Math.round(durationSeconds / 60)} Min, ${reason}`,
  );
  broadcast();
  return { ok: true, session, summary: report.summary, snapshot: snapshot() };
}

/* ---------------------------------------------------------------- Spielstart */

function validateExecutable(exe) {
  const resolved = path.resolve(String(exe ?? ''));
  if (!path.isAbsolute(resolved)) throw new Error('Der Startpfad muss absolut sein.');
  if (!/\.(exe|lnk)$/i.test(resolved)) throw new Error('Nur EXE- oder LNK-Dateien sind erlaubt.');
  if (!fs.existsSync(resolved)) throw new Error('Die Startdatei wurde nicht gefunden.');
  return resolved;
}

async function launchSpec(game, profile) {
  const args = splitArgs(profile?.args || game.args || '');
  if (game.exe) {
    const exe = validateExecutable(game.exe);
    if (path.extname(exe).toLowerCase() === '.lnk') {
      const failure = await refs.openPath?.(exe);
      if (failure) throw new Error(String(failure).slice(0, 180));
      return;
    }
    await new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
      } catch (error) {
        reject(error);
        return;
      }
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
    return;
  }
  if (game.uri) {
    const uri = safeUri(game.uri);
    if (!uri) throw new Error('Der Launcher-Link ist ungültig.');
    await refs.openExternal?.(uri);
    return;
  }
  throw new Error('Für dieses Spiel ist kein gültiger Startpfad hinterlegt.');
}

async function activateProtocol(game, profile) {
  const activeProfile = profile && data.settings.autoProfile ? profile : null;
  const protocolFor = active?.id || '';
  activeProfileId = activeProfile?.id || '';
  if (data.settings.autoGamingMode) {
    try {
      const result = await refs.beginGameMode?.(game.name);
      if (!active || active.id !== protocolFor) {
        if (result?.ok) refs.endGameMode?.();
        return;
      }
      modeActive = Boolean(result?.ok);
    } catch {
      modeActive = false;
    }
  }
  if (activeProfile?.applyVolume && activeProfile.audioPercent != null) {
    try {
      // Vor dem Eingriff den alten Pegel merken, damit der Gaming Mode beim
      // Beenden wieder genau dorthin zurückkehrt.
      const previous = await refs.getVolume?.();
      if (!active || active.id !== protocolFor) return;
      if (typeof previous === 'number' && Number.isFinite(previous)) volumeToRestore = previous;
      await refs.setVolume?.(activeProfile.audioPercent);
    } catch {
      refs.log?.('warning', 'Gaming Hub', 'Profil-Lautstärke konnte nicht gesetzt werden.');
    }
  }
  if (activeProfile?.autoRoutine && activeProfile.automationRoutineId) {
    try {
      await refs.runRoutineById?.(activeProfile.automationRoutineId, `Spielprofil ${game.name}`);
    } catch (error) {
      refs.log?.('warning', 'Gaming Hub', `Profilroutine fehlgeschlagen: ${String(error?.message ?? error).slice(0, 160)}`);
    }
  }
  if (data.settings.companionEnabled && data.settings.companionAutoShow) {
    try {
      refs.onCompanion?.(true);
    } catch {
      /* Companion ist optional. */
    }
  }
  broadcast();
}

async function launchGame(id) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  if (active) return { ok: false, error: `Es läuft bereits eine Sitzung für ${active.gameName}.` };
  const game = data.games.find((entry) => entry.id === safeId(id));
  if (!game) return { ok: false, error: 'Spiel nicht gefunden.' };
  if (!game.exe && !game.uri) return { ok: false, error: 'Für dieses Spiel ist kein Startweg hinterlegt.' };
  const profile = profileFor(game.id);
  const before = new Set(lastContext?.processes ?? []);
  try {
    await launchSpec(game, profile);
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 220);
    refs.log?.('warning', 'Gaming Hub', `Start fehlgeschlagen (${game.name}): ${message}`);
    return { ok: false, error: message };
  }
  pendingLaunch = { gameId: game.id, before, at: now() };
  startSession(game, 'hub');
  void activateProtocol(game, profile);
  if (data.settings.reducedNotifications) {
    refs.notify?.('Gaming Hub', `${game.name} wird gestartet.`, 4);
  }
  return { ok: true, game, snapshot: snapshot() };
}

function stopSession() {
  return endSession('manual-stop');
}

/* ------------------------------------------------------------ Kontext / Auto */

function processMatches(game, processes) {
  const wanted = processName(game.process || game.exe || '');
  if (!wanted) return false;
  return processes.some((entry) => {
    const current = processName(entry);
    return current && (current === wanted || current.includes(wanted) || wanted.includes(current));
  });
}

function findGameForProcesses(processes) {
  const matches = data.games.filter((game) => game.kind !== 'launcher' && processMatches(game, processes));
  if (!matches.length) return null;
  return matches.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)[0];
}

function observeContext(context) {
  if (!data || !context || !Array.isArray(context.processes)) return;
  lastContext = context;
  if (active) {
    const game = activeGame();
    if (!game) return;
    if (!active.runtimeProcess) {
      const pending = pendingLaunch && pendingLaunch.gameId === game.id ? pendingLaunch : null;
      if (pending && now() - pending.at < 90_000) {
        const newProcesses = context.processes.filter((entry) => !pending.before.has(entry));
        const candidate = newProcesses.find(
          (entry) => !/^(steam|steamwebhelper|epicgameslauncher|battle\.net|battlenet|galaxyclient|ubisoftconnect|eadesktop|origin|crashpad|runtimebroker|conhost)$/i.test(entry),
        );
        if (candidate) {
          active.runtimeProcess = candidate;
          game.process = candidate;
          pendingLaunch = null;
          broadcast();
        }
      }
    }
    if (active.runtimeProcess && context.processes.length) {
      const running = processMatches({ ...game, process: active.runtimeProcess }, context.processes);
      if (running) {
        processMisses = 0;
      } else {
        processMisses += 1;
        if (processMisses >= 2) endSession('process-exit');
      }
    }
    return;
  }
  if (!data.settings.autoSession) return;
  if (!context.processes.length) return;
  if (now() - lastEndedAt < 12_000) return;
  const game = findGameForProcesses(context.processes);
  if (!game) return;
  if (now() - (endedRecently.get(game.id) || 0) < 30_000) return;
  const profile = profileFor(game.id);
  if (profile && !profile.autoActivate) return;
  startSession(game, 'detected');
  void activateProtocol(game, profile);
}

/* --------------------------------------------------------------- Einstellungen */

function setSettings(patch = {}) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const allowed = [
    'autoDetect',
    'autoGamingMode',
    'autoProfile',
    'autoSession',
    'autoReport',
    'reducedNotifications',
    'companionEnabled',
    'companionAutoShow',
  ];
  for (const key of allowed) {
    if (key in patch) data.settings[key] = Boolean(patch[key]);
  }
  if ('sessionSampleSeconds' in patch) data.settings.sessionSampleSeconds = clamp(patch.sessionSampleSeconds, 5, 60, 10);
  if ('newsRefreshMinutes' in patch) data.settings.newsRefreshMinutes = clamp(patch.newsRefreshMinutes, 5, 240, 30);
  if ('selectedGameId' in patch) data.settings.selectedGameId = text(patch.selectedGameId, 60);
  if ('companionEnabled' in patch && !data.settings.companionEnabled) refs.onCompanion?.(false);
  if ('sessionSampleSeconds' in patch && active) scheduleSessionSampling();
  if ('newsRefreshMinutes' in patch) scheduleNewsRefresh();
  if ('autoDetect' in patch) {
    if (detectTimer) clearTimeout(detectTimer);
    detectTimer = null;
    if (data.settings.autoDetect && process.platform === 'win32') {
      detectTimer = setTimeout(() => void detectGames(), 1500);
      detectTimer.unref?.();
    }
  }
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function selectGame(id) {
  if (!data) return { ok: false };
  data.settings.selectedGameId = text(id, 60);
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

/* ---------------------------------------------------------------- Bibliothek */

function addGame(input = {}) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const name = cleanName(input.name, '');
  if (!name) return { ok: false, error: 'Bitte einen Spielnamen angeben.' };
  let exe = '';
  if (input.exe) {
    try {
      exe = validateExecutable(input.exe);
    } catch (error) {
      return { ok: false, error: String(error.message) };
    }
  }
  const uri = safeUri(input.uri);
  if (!exe && !uri) return { ok: false, error: 'Bitte eine EXE/LNK-Datei oder einen unterstützten Launcher-Link angeben.' };
  let args = '';
  try {
    args = splitArgs(input.args).join(' ');
  } catch (error) {
    return { ok: false, error: String(error.message) };
  }
  const game = normalizeGame({
    id: `manual-${safeId(name)}-${now().toString(36)}`,
    name,
    launcher: LAUNCHERS.has(input.launcher) ? input.launcher : 'manual',
    source: 'manual',
    exe,
    uri,
    args,
    process: input.process || exe,
    genre: input.genre,
    description: input.description,
    coverUrl: input.coverUrl,
    heroUrl: input.heroUrl,
    addedAt: now(),
  });
  if (!game) return { ok: false, error: 'Das Spiel konnte nicht angelegt werden.' };
  if (data.games.length >= MAX_GAMES) return { ok: false, error: 'Die Bibliothek ist voll.' };
  data.games.push(game);
  data.settings.selectedGameId = game.id;
  persist();
  broadcast();
  return { ok: true, game, snapshot: snapshot() };
}

function updateGame(id, patch = {}) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const game = data.games.find((entry) => entry.id === safeId(id));
  if (!game) return { ok: false, error: 'Spiel nicht gefunden.' };
  if ('name' in patch) game.name = cleanName(patch.name, game.name);
  if ('launcher' in patch && LAUNCHERS.has(patch.launcher)) game.launcher = patch.launcher;
  if ('favorite' in patch) game.favorite = Boolean(patch.favorite);
  if ('genre' in patch) game.genre = text(patch.genre, 40);
  if ('description' in patch) game.description = text(patch.description, 500);
  if ('process' in patch) game.process = processName(patch.process);
  if ('args' in patch) {
    try {
      game.args = splitArgs(patch.args).join(' ');
    } catch (error) {
      return { ok: false, error: String(error.message) };
    }
  }
  if ('exe' in patch) {
    if (patch.exe) {
      try {
        game.exe = validateExecutable(patch.exe);
      } catch (error) {
        return { ok: false, error: String(error.message) };
      }
    } else {
      game.exe = undefined;
    }
  }
  if ('uri' in patch) game.uri = safeUri(patch.uri) || undefined;
  if ('customCover' in patch) game.customCover = safeAssetName(patch.customCover);
  if ('customHero' in patch) game.customHero = safeAssetName(patch.customHero);
  if (!game.exe && !game.uri) return { ok: false, error: 'Das Spiel braucht weiterhin einen Startweg.' };
  persist();
  broadcast();
  return { ok: true, game, snapshot: snapshot() };
}

function removeGame(id) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const key = safeId(id);
  const before = data.games.length;
  data.games = data.games.filter((game) => game.id !== key);
  if (data.games.length === before) return { ok: false, error: 'Spiel nicht gefunden.' };
  data.profiles = data.profiles.filter((profile) => profile.gameId !== key);
  if (data.settings.selectedGameId === key) data.settings.selectedGameId = data.games[0]?.id || '';
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function saveProfile(input = {}) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const profile = normalizeProfile(input);
  if (!profile) return { ok: false, error: 'Das Profil ist unvollständig.' };
  if (!data.games.some((game) => game.id === profile.gameId)) {
    return { ok: false, error: 'Das zugehörige Spiel fehlt in der Bibliothek.' };
  }
  const index = data.profiles.findIndex((entry) => entry.id === profile.id);
  if (index >= 0) data.profiles[index] = profile;
  else data.profiles.push(profile);
  data.profiles = data.profiles.slice(-320);
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function deleteProfile(id) {
  if (!data) return { ok: false };
  const before = data.profiles.length;
  data.profiles = data.profiles.filter((profile) => profile.id !== safeId(id));
  if (data.profiles.length === before) return { ok: false, error: 'Profil nicht gefunden.' };
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

/* ------------------------------------------------------------------- Bilder */

function uploadAsset(dataUrl) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  try {
    return { ok: true, path: saveAssetDataUrl(dataUrl) };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function downloadBuffer(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 3) {
      resolve({ ok: false, error: 'Zu viele Weiterleitungen.' });
      return;
    }
    const target = safeHttpUrl(url);
    if (!target) {
      resolve({ ok: false, error: 'Ungültige Bildadresse.' });
      return;
    }
    const client = target.startsWith('https:') ? https : http;
    const request = client.get(
      target,
      {
        timeout: 9000,
        headers: { 'User-Agent': 'JARVIS-Gaming/1.0', Accept: 'image/*' },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(downloadBuffer(new URL(response.headers.location, target).href, redirects + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          resolve({ ok: false, error: `HTTP ${response.statusCode}` });
          return;
        }
        const type = String(response.headers['content-type'] ?? '');
        if (!/^image\//i.test(type)) {
          response.resume();
          resolve({ ok: false, error: 'Antwort ist kein Bild.' });
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 6 * 1024 * 1024) {
            request.destroy();
            resolve({ ok: false, error: 'Bild ist zu groß.' });
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          if (size > 6 * 1024 * 1024) return;
          resolve({ ok: true, buffer: Buffer.concat(chunks), type });
        });
      },
    );
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, error: 'Zeitüberschreitung.' });
    });
    request.on('error', (error) => resolve({ ok: false, error: String(error?.message ?? error).slice(0, 160) }));
  });
}

async function remoteCachedArtwork(url) {
  const target = safeHttpUrl(url);
  if (!target) return null;
  if (!ensureAssetsDir()) return null;
  const cacheDir = path.join(assetsDir, 'cache');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch {
    return null;
  }
  const hash = crypto.createHash('sha1').update(target).digest('hex');
  const existing = fs.readdirSync(cacheDir).find((name) => name.startsWith(`${hash}.`));
  if (existing) {
    const dataUrl = assetDataUrl(`cache/${existing}`);
    if (dataUrl) return dataUrl;
  }
  const downloaded = await downloadBuffer(target);
  if (!downloaded.ok) return null;
  const ext = downloaded.type.includes('png') ? 'png' : downloaded.type.includes('webp') ? 'webp' : 'jpg';
  const filename = `${hash}.${ext}`;
  try {
    fs.writeFileSync(path.join(cacheDir, filename), downloaded.buffer);
    return `data:${assetMime(filename)};base64,${downloaded.buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

async function getArtwork(gameId, kind = 'cover') {
  if (!data) return null;
  const game = data.games.find((entry) => entry.id === safeId(gameId));
  if (!game) return null;
  const profile = profileFor(game.id);
  const custom =
    kind === 'hero'
      ? profile?.backgroundAsset || game.customHero
      : profile?.coverAsset || game.customCover;
  if (custom) {
    const local = assetDataUrl(custom);
    if (local) return local;
  }
  const remote = kind === 'hero' ? game.heroUrl : game.coverUrl;
  if (remote) return remoteCachedArtwork(remote);
  return null;
}

/* --------------------------------------------------------------- News/Guides */

function stripHtml(value) {
  return text(
    String(value ?? '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => {
        const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
        return Number.isFinite(number) ? String.fromCodePoint(number) : '';
      })
      .replace(/&#39;/gi, "'"),
    500,
  );
}

function readTag(xml, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  return match ? match[1] : '';
}

function parseFeed(xml, source) {
  const articles = [];
  const items = [...String(xml ?? '').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const entries = items.length
    ? items
    : [...String(xml ?? '').matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  for (const entry of entries.slice(0, 24)) {
    const title = stripHtml(readTag(entry, 'title')).slice(0, 180);
    const linkMatch = /<link[^>]*href=["']([^"']+)["']/i.exec(entry);
    const link = stripHtml(linkMatch ? linkMatch[1] : readTag(entry, 'link'));
    const summary = stripHtml(readTag(entry, 'description') || readTag(entry, 'summary') || readTag(entry, 'content'));
    const date = readTag(entry, 'pubDate') || readTag(entry, 'published') || readTag(entry, 'updated') || readTag(entry, 'dc:date');
    const parsedDate = Date.parse(stripHtml(date));
    if (!title || !link) continue;
    const url = safeHttpUrl(link);
    if (!url) continue;
    articles.push({
      id: crypto.createHash('sha1').update(`${source.id}|${url}|${title}`).digest('hex').slice(0, 24),
      sourceId: source.id,
      sourceName: source.name,
      title,
      url,
      summary,
      publishedAt: Number.isFinite(parsedDate) ? parsedDate : 0,
      fetchedAt: now(),
      kind: source.kind,
      game: source.game,
    });
  }
  return articles;
}

function requestText(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 3) {
      resolve({ ok: false, error: 'Zu viele Weiterleitungen.' });
      return;
    }
    const target = safeHttpUrl(url);
    if (!target) {
      resolve({ ok: false, error: 'Ungültige Feed-Adresse.' });
      return;
    }
    const client = target.startsWith('https:') ? https : http;
    const request = client.get(
      target,
      {
        timeout: 10_000,
        headers: {
          'User-Agent': 'JARVIS-Gaming/1.0',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(requestText(new URL(response.headers.location, target).href, redirects + 1));
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          resolve({ ok: false, error: `HTTP ${response.statusCode}` });
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          if (body.length < 1_500_000) body += chunk;
        });
        response.on('end', () => resolve({ ok: true, text: body }));
      },
    );
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, error: 'Zeitüberschreitung.' });
    });
    request.on('error', (error) => resolve({ ok: false, error: String(error?.message ?? error).slice(0, 160) }));
  });
}

function scheduleNewsRefresh() {
  if (newsTimer) clearInterval(newsTimer);
  newsTimer = null;
  if (!data || !data.sources.some((source) => source.enabled)) return;
  const minutes = clamp(data.settings.newsRefreshMinutes, 5, 240, 30);
  newsTimer = setInterval(() => void refreshArticles(), minutes * 60_000);
  newsTimer.unref?.();
}

async function refreshArticles(sourceId = '') {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  if (refreshingArticles) {
    return { ok: true, message: 'Eine Aktualisierung läuft bereits.', articles: data.cache.articles, snapshot: snapshot() };
  }
  refreshingArticles = true;
  try {
    return await refreshArticlesNow(sourceId);
  } finally {
    refreshingArticles = false;
  }
}

async function refreshArticlesNow(sourceId = '') {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const selected = data.sources.filter(
    (source) => source.enabled && (!sourceId || source.id === safeId(sourceId)),
  );
  if (!selected.length) {
    return { ok: true, message: 'Keine aktiven Newsquellen konfiguriert.', articles: [], snapshot: snapshot() };
  }
  const errors = [];
  const fetched = [];
  for (const source of selected.slice(0, 12)) {
    const result = await requestText(source.url);
    if (!result.ok) {
      errors.push(`${source.name}: ${result.error}`);
      continue;
    }
    const parsed = parseFeed(result.text, source);
    if (!parsed.length) errors.push(`${source.name}: kein lesbarer RSS-/Atom-Feed.`);
    fetched.push(...parsed);
  }
  data.cache.articles = [...fetched, ...data.cache.articles]
    .filter((entry, index, list) => list.findIndex((other) => other.id === entry.id) === index)
    .sort((a, b) => (b.publishedAt || b.fetchedAt) - (a.publishedAt || a.fetchedAt))
    .slice(0, MAX_ARTICLES);
  data.cache.fetchedAt = now();
  persist();
  broadcast();
  return {
    ok: errors.length === 0,
    message: errors.length ? errors.join(' · ').slice(0, 500) : `${fetched.length} Meldungen geladen.`,
    articles: data.cache.articles,
    snapshot: snapshot(),
  };
}

function saveSource(input = {}) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const source = normalizeSource(input);
  if (!source) return { ok: false, error: 'Name und eine gültige http(s)-Adresse sind nötig.' };
  const index = data.sources.findIndex((entry) => entry.id === source.id);
  if (index >= 0) data.sources[index] = source;
  else data.sources.push(source);
  data.sources = data.sources.slice(-80);
  scheduleNewsRefresh();
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function removeSource(id) {
  if (!data) return { ok: false };
  const before = data.sources.length;
  data.sources = data.sources.filter((source) => source.id !== safeId(id));
  if (data.sources.length === before) return { ok: false, error: 'Quelle nicht gefunden.' };
  scheduleNewsRefresh();
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function saveGuide(input = {}) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  const guide = normalizeGuide(input);
  if (!guide) return { ok: false, error: 'Titel und eine gültige http(s)-Adresse sind nötig.' };
  const index = data.guides.findIndex((entry) => entry.id === guide.id);
  if (index >= 0) data.guides[index] = guide;
  else data.guides.push(guide);
  data.guides = data.guides.slice(-200);
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function removeGuide(id) {
  if (!data) return { ok: false };
  const before = data.guides.length;
  data.guides = data.guides.filter((guide) => guide.id !== safeId(id));
  if (data.guides.length === before) return { ok: false, error: 'Guide nicht gefunden.' };
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function openGuide(url) {
  const target = safeHttpUrl(url);
  if (!target) return { ok: false, error: 'Nur http(s)-Links sind erlaubt.' };
  try {
    refs.openExternal?.(target);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function saveWow(patch = {}) {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  data.wow = normalizeWow({ ...data.wow, ...patch });
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

async function launchWowLauncher() {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  if (!data.wow.launcherPath) return { ok: false, error: 'Es ist kein WoW-Launcher hinterlegt.' };
  try {
    const exe = validateExecutable(data.wow.launcherPath);
    await launchSpec({ exe, args: data.wow.launcherArgs }, null);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).slice(0, 220) };
  }
}

/* --------------------------------------------------------------- Erkennung */

async function detectGames() {
  if (!data) return { ok: false, error: 'Gaming Hub ist nicht bereit.' };
  try {
    const result = await detectInstalledGames();
    const manual = data.games.filter((game) => game.source === 'manual');
    const manualNames = new Set(manual.map((game) => game.name.toLowerCase()));
    const byId = new Map(data.games.map((game) => [game.id, game]));
    let added = 0;
    for (const detected of result.games) {
      if (manualNames.has(detected.name.toLowerCase())) continue;
      const previous = byId.get(detected.id);
      if (previous) {
        previous.name = detected.name;
        previous.launcher = detected.launcher;
        previous.steamAppId = detected.steamAppId || previous.steamAppId;
        previous.epicAppName = detected.epicAppName || previous.epicAppName;
        previous.installDir = detected.installDir || previous.installDir;
        previous.uri = detected.uri || previous.uri;
        previous.exe = detected.exe || previous.exe;
        previous.process = detected.process || previous.process;
        previous.coverUrl = detected.coverUrl || previous.coverUrl;
        previous.heroUrl = detected.heroUrl || previous.heroUrl;
        previous.available = detected.available !== false;
        previous.source = 'detected';
      } else {
        data.games.push(detected);
        added += 1;
      }
    }
    const detectedIds = new Set(result.games.map((game) => game.id));
    for (const game of data.games) {
      if (game.source === 'detected' && !detectedIds.has(game.id)) game.available = false;
    }
    data.games = data.games.slice(0, MAX_GAMES);
    lastDetection = {
      available: result.supported !== false,
      lastAt: now(),
      message: result.message,
      launchers: Array.isArray(result.launchers) ? result.launchers : [],
      errors: Array.isArray(result.errors) ? result.errors : [],
    };
    persist();
    broadcast();
    return {
      ok: true,
      message: `${result.message}${added ? ` ${added} neu aufgenommen.` : ''}`,
      snapshot: snapshot(),
    };
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 220);
    lastDetection = {
      available: process.platform === 'win32',
      lastAt: now(),
      message: `Erkennung fehlgeschlagen: ${message}`,
      launchers: [],
      errors: [message],
    };
    refs.log?.('warning', 'Gaming Hub', `Erkennung fehlgeschlagen: ${message}`);
    broadcast();
    return { ok: false, error: message, snapshot: snapshot() };
  }
}

/* --------------------------------------------------------------- Lebenszyklus */

function configure(next = {}) {
  if (next.file) file = String(next.file);
  if (next.assetsDir) assetsDir = String(next.assetsDir);
  refs = { ...refs, ...next };
  load();
  active = null;
  activeProfileId = '';
  modeActive = false;
  lastContext = null;
  pendingLaunch = null;
  volumeToRestore = null;
  lastDetection = {
    available: process.platform === 'win32',
    lastAt: 0,
    message: process.platform === 'win32' ? 'Spieleerkennung bereit.' : 'Automatische Erkennung nur unter Windows.',
    launchers: [],
    errors: [],
  };
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = null;
  if (process.platform === 'win32' && data.settings.autoDetect) {
    detectTimer = setTimeout(() => void detectGames(), 4000);
    detectTimer.unref?.();
  }
  scheduleNewsRefresh();
  broadcast();
}

function getState() {
  return snapshot();
}

function getSessions() {
  return data ? [...data.sessions] : [];
}

function deleteSession(id) {
  if (!data) return { ok: false };
  const before = data.sessions.length;
  data.sessions = data.sessions.filter((session) => session.id !== safeId(id));
  if (data.sessions.length === before) return { ok: false, error: 'Sitzung nicht gefunden.' };
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function clearSessions() {
  if (!data) return { ok: false };
  data.sessions = [];
  persist();
  broadcast();
  return { ok: true, snapshot: snapshot() };
}

function shutdown() {
  if (active) endSession('app-exit');
  if (sessionTimer) clearInterval(sessionTimer);
  if (detectTimer) clearTimeout(detectTimer);
  if (newsTimer) clearInterval(newsTimer);
  sessionTimer = null;
  detectTimer = null;
  newsTimer = null;
  persist();
}

module.exports = {
  configure,
  getState,
  getSessions,
  launchGame,
  stopSession,
  observeContext,
  setSettings,
  selectGame,
  addGame,
  updateGame,
  removeGame,
  saveProfile,
  deleteProfile,
  uploadAsset,
  getArtwork,
  refreshArticles,
  saveSource,
  removeSource,
  saveGuide,
  removeGuide,
  openGuide,
  saveWow,
  launchWowLauncher,
  detectGames,
  deleteSession,
  clearSessions,
  shutdown,
  _internals: {
    normalizeSettings,
    normalizeGame,
    normalizeProfile,
    normalizeSource,
    normalizeSession,
    parseFeed,
    splitArgs,
    safeHttpUrl,
    safeUri,
    processName,
    summary: buildSessionSummary,
  },
};
