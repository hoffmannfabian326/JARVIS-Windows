export type GamingLauncher = 'steam' | 'epic' | 'battlenet' | 'gog' | 'ubisoft' | 'ea' | 'manual' | 'custom';

export type GamingLayout = 'cinematic' | 'compact' | 'focus';

export type GamingNotificationMode = 'quiet' | 'normal' | 'all';

export type GamingSourceKind = 'news' | 'patch' | 'raid' | 'dungeon' | 'class' | 'general';

export type GamingGameKind = 'game' | 'launcher' | 'tool';

export interface GamingGame {
  id: string;
  name: string;
  launcher: GamingLauncher;
  source: 'detected' | 'manual';
  exe?: string;
  args?: string;
  uri?: string;
  process?: string;
  installDir?: string;
  steamAppId?: string;
  epicAppName?: string;
  kind?: GamingGameKind;
  genre: string;
  description: string;
  coverUrl?: string;
  heroUrl?: string;
  customCover?: string;
  customHero?: string;
  favorite: boolean;
  playtimeSeconds: number;
  lastPlayedAt: number;
  addedAt: number;
  available?: boolean;
}

export interface GamingSettings {
  autoDetect: boolean;
  autoGamingMode: boolean;
  autoProfile: boolean;
  autoSession: boolean;
  autoReport: boolean;
  reducedNotifications: boolean;
  companionEnabled: boolean;
  companionAutoShow: boolean;
  sessionSampleSeconds: number;
  newsRefreshMinutes: number;
  selectedGameId: string;
}

export interface GamingProfile {
  id: string;
  gameId: string;
  launcher: GamingLauncher;
  args: string;
  layout: GamingLayout;
  notifications: GamingNotificationMode;
  hardwareMonitoring: boolean;
  guideIds: string[];
  sourceIds: string[];
  automationRoutineId: string;
  autoRoutine: boolean;
  autoActivate: boolean;
  backgroundAsset: string;
  coverAsset: string;
  audioPercent: number | null;
  applyVolume: boolean;
  updatedAt: number;
}

export interface GamingSessionSample {
  at: number;
  cpu: number | null;
  gpu: number | null;
  ram: number | null;
  cpuTemp: number | null;
  gpuTemp: number | null;
  vramUsed: number | null;
  vramTotal: number | null;
  down: number | null;
  up: number | null;
}

export interface GamingLiveStats {
  cpu: number | null;
  gpu: number | null;
  ram: number | null;
  cpuTemp: number | null;
  gpuTemp: number | null;
  vramUsed: number | null;
  vramTotal: number | null;
  down: number | null;
  up: number | null;
  fps: number | null;
}

export interface GamingSessionComparison {
  previousAt: number;
  durationDeltaSeconds: number;
  cpuDelta: number | null;
  gpuDelta: number | null;
  maxTempDelta: number | null;
}

export interface GamingSession {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  avgCpu: number | null;
  avgGpu: number | null;
  avgRam: number | null;
  maxCpuTemp: number | null;
  maxGpuTemp: number | null;
  avgFps: null;
  avgDown: number | null;
  avgUp: number | null;
  anomalies: string[];
  source: 'hub' | 'detected' | 'manual';
  profileId?: string;
  timeline: GamingSessionSample[];
  comparison?: GamingSessionComparison;
}

export interface GamingActiveSession {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: number;
  source: 'hub' | 'detected' | 'manual';
  elapsedSeconds: number;
  sampleCount: number;
  live: GamingLiveStats;
  profileId: string;
  modeActive: boolean;
  tracking: 'process' | 'manual';
  timeline: GamingSessionSample[];
}

export interface GamingLauncherStatus {
  id: GamingLauncher;
  label: string;
  detected: boolean;
  path?: string;
}

export interface GamingDetection {
  available: boolean;
  lastAt: number;
  message: string;
  launchers: GamingLauncherStatus[];
  errors: string[];
}

export interface GamingSource {
  id: string;
  name: string;
  url: string;
  kind: GamingSourceKind;
  game: 'general' | 'wow';
  enabled: boolean;
}

export interface GamingArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: number;
  fetchedAt: number;
  kind: GamingSourceKind;
  game: 'general' | 'wow';
}

export interface GamingGuide {
  id: string;
  title: string;
  url: string;
  category: GamingSourceKind;
  game: 'general' | 'wow' | string;
  summary: string;
  updatedAt: number;
}

export interface WowCharacter {
  id: string;
  name: string;
  className: string;
  spec: string;
  realm: string;
  itemLevel: number | null;
  notes: string;
}

export interface WowEvent {
  id: string;
  title: string;
  at: number;
  kind: 'raid' | 'dungeon' | 'event';
  note: string;
}

export interface WowNote {
  id: string;
  text: string;
  updatedAt: number;
}

export interface GamingWow {
  launcherPath: string;
  launcherArgs: string;
  characters: WowCharacter[];
  events: WowEvent[];
  notes: WowNote[];
}

export interface GamingSnapshot {
  supported: boolean;
  platform: string;
  settings: GamingSettings;
  games: GamingGame[];
  profiles: GamingProfile[];
  sessions: GamingSession[];
  activeSession: GamingActiveSession | null;
  detection: GamingDetection;
  sources: GamingSource[];
  guides: GamingGuide[];
  articles: GamingArticle[];
  wow: GamingWow;
  companionOpen: boolean;
  automationEnabled: boolean;
  automationMode: string;
  version: number;
}

export interface GamingResult {
  ok: boolean;
  error?: string;
  message?: string;
  snapshot?: GamingSnapshot;
  session?: GamingSession;
  game?: GamingGame;
  artwork?: string | null;
  path?: string;
  articles?: GamingArticle[];
}

export interface GamingReport {
  session: GamingSession;
  summary: string;
}

export const GAMING_LAUNCHERS: Array<{ id: GamingLauncher; label: string }> = [
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic Games' },
  { id: 'battlenet', label: 'Battle.net' },
  { id: 'gog', label: 'GOG' },
  { id: 'ubisoft', label: 'Ubisoft Connect' },
  { id: 'ea', label: 'EA App' },
  { id: 'manual', label: 'Manuell' },
  { id: 'custom', label: 'Eigener Launcher' },
];

export const WOW_CATEGORIES: Array<{ id: GamingSourceKind; label: string }> = [
  { id: 'news', label: 'Server-News' },
  { id: 'patch', label: 'Patchnotes' },
  { id: 'raid', label: 'Raid-Guides' },
  { id: 'dungeon', label: 'Dungeon-Guides' },
  { id: 'class', label: 'Klassen-Guides' },
  { id: 'general', label: 'Allgemein' },
];

export const LAYOUT_LABELS: Record<GamingLayout, string> = {
  cinematic: 'Cinematisch',
  compact: 'Kompakt',
  focus: 'Fokus',
};

export const NOTIFICATION_LABELS: Record<GamingNotificationMode, string> = {
  quiet: 'Nur wichtige Hinweise',
  normal: 'Normal',
  all: 'Alle Hinweise',
};

export const DEFAULT_GAMING_SETTINGS: GamingSettings = {
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

export const EMPTY_DETECTION: GamingDetection = {
  available: false,
  lastAt: 0,
  message: 'Die Spieleerkennung ist nur in der Desktop-App verfügbar.',
  launchers: [],
  errors: [],
};

export const EMPTY_GAMING_SNAPSHOT: GamingSnapshot = {
  supported: false,
  platform: 'web',
  settings: DEFAULT_GAMING_SETTINGS,
  games: [],
  profiles: [],
  sessions: [],
  activeSession: null,
  detection: EMPTY_DETECTION,
  sources: [],
  guides: [],
  articles: [],
  wow: { launcherPath: '', launcherArgs: '', characters: [], events: [], notes: [] },
  companionOpen: false,
  automationEnabled: false,
  automationMode: 'neutral',
  version: 0,
};

export function launcherLabel(launcher: GamingLauncher): string {
  return GAMING_LAUNCHERS.find((entry) => entry.id === launcher)?.label ?? launcher;
}

export function formatPlaytime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Noch keine Spielzeit';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 100) return `${hours} Std.`;
  if (hours > 0) return `${hours} Std. ${minutes.toString().padStart(2, '0')} Min.`;
  return `${Math.max(1, minutes)} Min.`;
}

export function formatSessionDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatPlayedAt(value: number): string {
  if (!value) return 'Noch nicht gespielt';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatMetric(value: number | null | undefined, suffix = ' %'): string {
  return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}${suffix}`;
}

export function formatNetwork(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) return '—';
  const mbit = (bytesPerSecond * 8) / 1e6;
  return `${mbit.toFixed(mbit >= 100 ? 0 : 1).replace('.', ',')} Mbit/s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

export function emptyProfile(gameId: string, launcher: GamingLauncher): GamingProfile {
  return {
    id: `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    gameId,
    launcher,
    args: '',
    layout: 'cinematic',
    notifications: 'quiet',
    hardwareMonitoring: true,
    guideIds: [],
    sourceIds: [],
    automationRoutineId: '',
    autoRoutine: false,
    autoActivate: true,
    backgroundAsset: '',
    coverAsset: '',
    audioPercent: null,
    applyVolume: false,
    updatedAt: Date.now(),
  };
}

export function findGame(snapshot: GamingSnapshot | null, id: string): GamingGame | undefined {
  return snapshot?.games.find((entry) => entry.id === id);
}

export function latestSessionFor(sessions: GamingSession[], gameId: string): GamingSession | undefined {
  return sessions.find((session) => session.gameId === gameId);
}

export function articleTimestamp(article: GamingArticle): number {
  return article.publishedAt || article.fetchedAt;
}

export function sessionSummary(session: GamingSession): string {
  const parts = [
    `${session.gameName}: ${formatSessionDuration(session.durationSeconds)}`,
    `CPU ${formatMetric(session.avgCpu)}`,
    `GPU ${formatMetric(session.avgGpu)}`,
  ];
  const temp = Math.max(session.maxCpuTemp ?? 0, session.maxGpuTemp ?? 0);
  if (temp > 0) parts.push(`max. ${Math.round(temp)} °C`);
  if (session.anomalies.length) parts.push(session.anomalies.join(' '));
  return parts.join(' · ');
}
