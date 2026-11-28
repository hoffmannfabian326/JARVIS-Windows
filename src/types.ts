export type Mode = 'off' | 'wake' | 'woken' | 'thinking' | 'speaking';
export type Role = 'user' | 'jarvis' | 'system';

export interface LogEntry {
  id: string;
  role: Role;
  text: string;
  at: number;
  url?: string;
}

export interface Note {
  id: string;
  text: string;
  at: number;
}

export interface TimerItem {
  id: string;
  label: string;
  kind: 'timer' | 'alarm';
  due: number;
  createdAt: number;
}

export interface Settings {
  wakeWord: string;
  autoAck: boolean;
  /**
   * Nach jeder Antwort so viele Sekunden ohne Weckwort weitersprechen.
   * 0 schaltet das Nachfrage-Fenster ab.
   */
  followUpSeconds: number;
  lang: string;
  ttsEngine: 'piper' | 'elevenlabs';
  rate: number;
  volume: number;
  city: string;
  micDeviceId: string;
  /** Browser für Links; leer = Standardbrowser des Systems. */
  browser: string;
  wakeOnBattery: boolean;
  /** Push-to-talk und Weckwort nehmen über SAPI einen ganzen Befehl auf. */
  voiceCommands: boolean;
  /** Lokale Streaming-Erkennung (sherpa-onnx) statt SAPI für Befehle nutzen. */
  localStt: boolean;
  /**
   * Während der Ausgabe still lokal zuhören, damit ein Zuruf ohne Weckwort
   * unterbricht (nur Desktop). Kostet dauerhaft CPU und löst leichter aus.
   */
  bargeListening: boolean;
  /** Bestätigungskarten können mit Ja/Nein beantwortet werden. */
  voiceConfirm: boolean;
  /** Nach einem Gespräch werden Gedächtnis-Vorschläge erzeugt. */
  autoMemory: boolean;
  /** Zwischenablage nur auf ausdrücklichen Befehl lesen. */
  clipboardEnabled: boolean;
  /** Werkzeuge, die ohne Rückfrage ausgeführt werden dürfen. */
  autoAllowTools: string[];
}

export interface MicInput {
  id: string;
  label: string;
}

export const DEFAULT_SETTINGS: Settings = {
  wakeWord: 'jarvis',
  autoAck: true,
  followUpSeconds: 6,
  lang: 'de-DE',
  ttsEngine: 'piper',
  rate: 1,
  volume: 1,
  city: 'Berlin',
  micDeviceId: '',
  browser: '',
  wakeOnBattery: true,
  voiceCommands: true,
  localStt: false,
  bargeListening: false,
  voiceConfirm: true,
  autoMemory: false,
  clipboardEnabled: true,
  autoAllowTools: [],
};

export const STORAGE_KEYS = {
  settings: 'jarvis.settings.v1',
  notes: 'jarvis.notes.v1',
} as const;

export const uid = (): string =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const formatClock = (ts: number): string =>
  new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(ts);

export const formatDateLong = (ts: number): string =>
  new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(ts);

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${pad2(m)}m`;
  if (m > 0) return `${m}:${pad2(s)} min`;
  return `${s} s`;
};
