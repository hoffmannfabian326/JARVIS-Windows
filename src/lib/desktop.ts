import type { GamingLauncher, GamingResult, GamingSnapshot } from './gaming';

export interface DesktopResult {
  ok: boolean;
  message?: string;
}

export interface WakeStatus {
  available: boolean;
  listening: boolean;
  model: string;
  reason?: string;
  threshold?: number;
  pausedReason?: string;
}

export interface HotkeyInfo {
  listen: string;
  ptt: string;
  registered: { listen: boolean; ptt: boolean };
  defaults: { listen: string; ptt: string };
}

export interface HotkeySaveResult {
  ok: boolean;
  error?: string;
  listen?: string;
  ptt?: string;
  registered?: { listen: boolean; ptt: boolean };
}

export interface ScreenShot {
  ok: boolean;
  image?: string;
  width?: number;
  height?: number;
  name?: string;
  error?: string;
}

export interface WakeEvent {
  source: 'wake' | 'ptt';
  score: number | null;
}

export interface TtsInfo {
  available: boolean;
  engine: string;
  voice: string;
  model: string;
}

export interface TtsEngineOption {
  id: string;
  label: string;
  available: boolean;
}

export interface DictationResult {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface TelemetrySample {
  at: number;
  cpu: { load: number | null; temp: number | null; cores: number | null };
  gpu: {
    name: string | null;
    load: number | null;
    temp: number | null;
    vramUsed?: number | null;
    vramTotal?: number | null;
  };
  mem: { used: number; total: number; percent: number } | null;
  disk: { used: number; size: number; percent: number; mount: string | null } | null;
  net: { down: number; up: number } | null;
}

export interface SttStatus {
  available: boolean;
  ready: boolean;
  active: boolean;
  backend: string;
  model: string;
  modelDir: string;
  reason: string;
}

export interface SttStartResult {
  ok: boolean;
  error?: string;
  status?: SttStatus;
}

export interface DesktopInfo {
  platform: string;
  hotkey: string;
  ptt: string;
  autostart: boolean;
  wake: WakeStatus;
  wakeCaptureError?: string;
  dictation: boolean;
  voiceInput?: boolean;
  stt?: SttStatus;
  tts: TtsInfo;
  ttsEngines?: TtsEngineOption[];
  hotkeyRegistered?: { listen: boolean; ptt: boolean };
  hotkeyDefaults?: { listen: string; ptt: string };
  wakePausedReason?: string;
}

export interface DiagnoseCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
  hint?: string;
}

export interface LoggedError {
  at: number;
  level: string;
  source: string;
  message: string;
}

export interface UsageDay {
  date: string;
  characters: number;
  requests: number;
  failures: number;
  lastError?: string;
  lastErrorAt?: number;
}

export interface ElevenLabsUsage {
  today: UsageDay;
  days: UsageDay[];
  warnCharacters: number;
  warnFailures: number;
  warning: boolean;
  reason: string;
}

export interface ElevenLabsTestCheck {
  id: string;
  label: string;
  status: DiagnoseCheck['status'];
  detail: string;
  hint?: string;
}

export interface ElevenLabsTestResult {
  ok: boolean;
  at: number;
  voiceId: string;
  modelId: string;
  apiBase: string;
  checks: ElevenLabsTestCheck[];
  summary: string;
}

export interface LlmUsageDay {
  date: string;
  prompt: number;
  completion: number;
  tokens: number;
  requests: number;
  failures: number;
  usd: number;
  estimated: number;
  unpriced: number;
}

export interface LlmUsage {
  today: LlmUsageDay;
  days: LlmUsageDay[];
  warnTokens: number;
  warnUsd: number;
  warning: boolean;
  reason: string;
  priced: boolean;
}

export interface TimerRecord {
  id: string;
  label: string;
  kind: 'timer' | 'alarm';
  due: number;
  createdAt: number;
}

export interface ActivityEntry {
  id: string;
  at: number;
  tool: string;
  ok: boolean;
  summary: string;
  args?: Record<string, unknown>;
  undo?: { type: 'note' | 'timer'; id: string };
}

export interface ConversationMeta {
  id: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  summary: string;
  turns: number;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation extends ConversationMeta {
  turnsData: ConversationTurn[];
}

export interface ConversationFile {
  id: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  summary: string;
  turns: ConversationTurn[];
}

export interface ClipboardText {
  ok: boolean;
  text?: string;
  length?: number;
  error?: string;
}

export interface VoiceCapture {
  ok: boolean;
  text?: string;
  error?: string;
}

export interface DiagnoseReport {
  at: number;
  version: string;
  platform: string;
  arch: string;
  electron: string;
  node: string;
  logFile: string;
  logDir: string;
  checks: DiagnoseCheck[];
  errors: LoggedError[];
  usage?: {
    elevenlabs?: ElevenLabsUsage;
    llm?: LlmUsage;
  };
}

export interface UpdateState {
  status: 'idle' | 'disabled' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error';
  current: string;
  newVersion: string;
  percent: number;
  transferred: number;
  total: number;
  error: string;
  checkedAt: number;
}

export interface ErrorReportInput {
  message: string;
  source?: string;
  level?: 'error' | 'fatal';
  stack?: string;
  context?: Record<string, unknown>;
}

export interface ErrorLog {
  ok: boolean;
  file: string;
  dir: string;
  text: string;
  entries: LoggedError[];
  count: number;
}

export interface ApiConfigState {
  envFile: string;
  fileExists: boolean;
  provider: '' | 'gemini' | 'zai' | 'ollama';
  detected: '' | 'gemini' | 'zai';
  model: string;
  aiBase: string;
  elevenlabsVoiceId: string;
  keys: { gemini: boolean; zai: boolean; custom: boolean; elevenlabs: boolean };
}

export interface ApiConfigDraft {
  provider?: '' | 'gemini' | 'zai' | 'ollama';
  model?: string | null;
  aiBase?: string | null;
  geminiKey?: string | null;
  zaiKey?: string | null;
  customKey?: string | null;
  elevenlabsKey?: string | null;
  elevenlabsVoiceId?: string | null;
}

export type ApiConfigResult = { ok: boolean; error?: string } & Partial<ApiConfigState>;

export interface AutomationSimulation {
  ok: boolean;
  error?: string;
  triggerOk?: boolean;
  triggerNote?: string;
  conditionsOk?: boolean;
  conditionsNote?: string;
  wouldRun?: boolean;
  actions?: string[];
  contextMode?: string;
}

export interface AutomationResult {
  ok: boolean;
  error?: string;
  message?: string;
  status?: string;
  routine?: unknown;
  snapshot?: unknown;
  actions?: Array<{ kind: string; label: string; ok: boolean; error?: string; skipped?: boolean }>;
}

export interface AutomationBriefing {
  routineId: string;
  routineName: string;
  prompt: string;
}

export interface GamingGameInput {
  name: string;
  launcher: GamingLauncher;
  exe?: string;
  args?: string;
  uri?: string;
  process?: string;
  installDir?: string;
  genre?: string;
  description?: string;
  coverUrl?: string;
  heroUrl?: string;
}

export interface DesktopBridge {
  isDesktop: true;
  platform: string;
  onHotkey: (callback: () => void) => () => void;
  openApp: (name: string) => Promise<DesktopResult>;
  closeApp?: (name: string) => Promise<DesktopResult>;
  /** Systemlautstärke auf 0-100 Prozent setzen. */
  setVolume?: (percent: number) => Promise<DesktopResult>;
  /** Browser leer = Standardbrowser des Systems. */
  openUrl?: (url: string, browser?: string) => Promise<DesktopResult>;
  volume: (direction: 'up' | 'down' | 'mute') => Promise<DesktopResult>;
  media: (action: 'playpause' | 'next' | 'previous') => Promise<DesktopResult>;
  lock: () => Promise<DesktopResult>;
  onWake: (callback: (event: WakeEvent) => void) => () => void;
  getInfo: () => Promise<DesktopInfo>;
  setAutostart: (enabled: boolean) => Promise<{ ok: boolean; autostart: boolean }>;
  memoryLoad: () => Promise<unknown>;
  memorySave: (file: unknown) => Promise<{ ok: boolean; count?: number; error?: string }>;
  synthesizeSpeech: (
    text: string,
    options?: { lengthScale?: number; engine?: string },
  ) => Promise<{
    ok: boolean;
    audio?: string;
    sampleRate?: number;
    mime?: string;
    engine?: string;
    error?: string;
  }>;
  setDictationMode: (enabled: boolean) => Promise<boolean>;
  dictate: (options?: { culture?: string }) => Promise<DictationResult>;
  typeText: (text: string) => Promise<{ ok: boolean; error?: string }>;
  getMonitorConsent: () => Promise<boolean | null>;
  setMonitorConsent: (granted: boolean) => Promise<boolean>;
  sampleSystem: () => Promise<TelemetrySample | null>;
  reportError?: (report: ErrorReportInput) => Promise<{ ok: boolean; id?: string }>;
  getErrorLog?: () => Promise<ErrorLog>;
  openLogFolder?: () => Promise<{ ok: boolean; error?: string }>;
  diagnose?: () => Promise<DiagnoseReport>;
  testElevenLabs?: () => Promise<ElevenLabsTestResult>;
  updateState?: () => Promise<UpdateState>;
  checkForUpdates?: () => Promise<UpdateState>;
  installUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateState?: (callback: (state: UpdateState) => void) => () => void;
  getApiConfig?: () => Promise<ApiConfigState>;
  saveApiConfig?: (draft: ApiConfigDraft) => Promise<ApiConfigResult>;
  getHotkeys?: () => Promise<HotkeyInfo>;
  setHotkeys?: (next: { listen: string; ptt: string }) => Promise<HotkeySaveResult>;
  setWakeOnBattery?: (enabled: boolean) => Promise<{ ok: boolean; pausedReason?: string }>;
  captureScreen?: () => Promise<ScreenShot>;
  onTimerDue?: (callback: (entries: TimerRecord[]) => void) => () => void;
  timersList?: () => Promise<TimerRecord[]>;
  timersReady?: () => Promise<TimerRecord[]>;
  timersAdd?: (payload: {
    id?: string;
    label: string;
    kind: 'timer' | 'alarm';
    due: number;
  }) => Promise<TimerRecord | null>;
  timersRemove?: (id: string) => Promise<{ ok: boolean; error?: string }>;
  activityList?: (limit?: number) => Promise<ActivityEntry[]>;
  activityAppend?: (entry: {
    tool: string;
    ok: boolean;
    summary: string;
    args?: Record<string, unknown>;
    undo?: { type: 'note' | 'timer'; id: string };
  }) => Promise<{ ok: boolean; entry?: ActivityEntry }>;
  historyList?: () => Promise<ConversationMeta[]>;
  historyLoad?: (id: string) => Promise<ConversationFile | null>;
  historySave?: (payload: {
    id?: string;
    title: string;
    startedAt?: number;
    updatedAt?: number;
    summary?: string;
    turns: ConversationTurn[];
  }) => Promise<{ ok: boolean; item?: ConversationFile }>;
  historyRemove?: (id: string) => Promise<{ ok: boolean; error?: string }>;
  readClipboard?: () => Promise<ClipboardText>;
  voiceCommand?: (options?: { culture?: string }) => Promise<VoiceCapture>;
  voiceConfirm?: (options?: { culture?: string }) => Promise<VoiceCapture>;
  sttStatus?: () => Promise<SttStatus>;
  sttStart?: () => Promise<SttStartResult>;
  sttStop?: () => Promise<SttStatus>;
  sttCancel?: () => Promise<SttStatus>;
  sttPush?: (buffer: ArrayBuffer) => void;
  onSttPartial?: (callback: (text: string) => void) => () => void;
  onSttFinal?: (callback: (text: string) => void) => () => void;
  onSttError?: (callback: (message: string) => void) => () => void;
  getLlmUsage?: () => Promise<LlmUsage | null>;
  automationState?: () => Promise<unknown>;
  automationSetEnabled?: (enabled: boolean) => Promise<unknown>;
  automationSettings?: (patch: Record<string, unknown>) => Promise<AutomationResult>;
  automationProfiles?: (profiles: { gaming: string[]; productivity: string[]; relax: string[] }) => Promise<AutomationResult>;
  automationHidden?: (modules: string[]) => Promise<AutomationResult>;
  automationSave?: (routine: unknown) => Promise<AutomationResult>;
  automationDelete?: (id: string) => Promise<AutomationResult>;
  automationDuplicate?: (id: string) => Promise<AutomationResult>;
  automationToggle?: (id: string, enabled: boolean) => Promise<AutomationResult>;
  automationRun?: (id: string) => Promise<AutomationResult>;
  automationSimulate?: (id: string) => Promise<AutomationSimulation>;
  automationHistory?: (limit?: number) => Promise<AutomationRunRecord[]>;
  automationClearHistory?: () => Promise<AutomationResult>;
  automationCheck?: () => Promise<AutomationResult>;
  onAutomationState?: (callback: (snapshot: unknown) => void) => () => void;
  onAutomationNotify?: (callback: (payload: { title: string; body: string; priority: number }) => void) => () => void;
  onAutomationBriefing?: (callback: (payload: AutomationBriefing) => void) => () => void;
  gamingState?: () => Promise<GamingResult>;
  gamingDetect?: () => Promise<GamingResult>;
  gamingLaunch?: (id: string) => Promise<GamingResult>;
  gamingStop?: () => Promise<GamingResult>;
  gamingSettings?: (patch: Partial<GamingSnapshot['settings']>) => Promise<GamingResult>;
  gamingSelect?: (id: string) => Promise<GamingResult>;
  gamingAddGame?: (input: GamingGameInput) => Promise<GamingResult>;
  gamingUpdateGame?: (id: string, patch: Record<string, unknown>) => Promise<GamingResult>;
  gamingRemoveGame?: (id: string) => Promise<GamingResult>;
  gamingProfileSave?: (profile: Record<string, unknown>) => Promise<GamingResult>;
  gamingProfileDelete?: (id: string) => Promise<GamingResult>;
  gamingAssetUpload?: (dataUrl: string) => Promise<GamingResult>;
  gamingArtwork?: (id: string, kind: 'cover' | 'hero') => Promise<GamingResult>;
  gamingSourceSave?: (source: Record<string, unknown>) => Promise<GamingResult>;
  gamingSourceRemove?: (id: string) => Promise<GamingResult>;
  gamingNewsRefresh?: (id?: string) => Promise<GamingResult>;
  gamingGuideSave?: (guide: Record<string, unknown>) => Promise<GamingResult>;
  gamingGuideRemove?: (id: string) => Promise<GamingResult>;
  gamingGuideOpen?: (url: string) => Promise<GamingResult>;
  gamingWowSave?: (patch: Record<string, unknown>) => Promise<GamingResult>;
  gamingWowLaunch?: () => Promise<GamingResult>;
  gamingPickFile?: (kind: 'executable' | 'folder') => Promise<{ ok: boolean; path?: string; canceled?: boolean }>;
  gamingSessionDelete?: (id: string) => Promise<GamingResult>;
  gamingSessionsClear?: () => Promise<GamingResult>;
  gamingCompanion?: (open: boolean) => Promise<{ ok: boolean; open: boolean }>;
  gamingCompanionAction?: (action: 'chat' | 'voice' | 'hub') => Promise<{ ok: boolean }>;
  onGamingState?: (callback: (snapshot: GamingSnapshot) => void) => () => void;
  onGamingReport?: (callback: (payload: { session: unknown; summary: string }) => void) => () => void;
  onGamingNotify?: (callback: (payload: { title: string; body: string; priority: number }) => void) => () => void;
  onCompanionAction?: (callback: (action: string) => void) => () => void;
}

export interface AutomationRunRecord {
  id: string;
  at: number;
  routineId: string;
  routineName: string;
  trigger: string;
  status: 'ok' | 'error' | 'skipped' | 'simulated';
  message: string;
  actions: Array<{ kind: string; label: string; ok: boolean; error?: string; skipped?: boolean }>;
  durationMs: number;
}

declare global {
  interface Window {
    jarvisDesktop?: DesktopBridge;
  }
}

/** Liefert die Desktop-Bridge oder undefined im normalen Browser. */
export const getDesktop = (): DesktopBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.jarvisDesktop;

/** Macht aus "CommandOrControl+Shift+J" eine lesbare Tastenkombination. */
export function formatHotkey(accelerator?: string, platform?: string): string {
  if (!accelerator) return '—';
  return accelerator
    .split('+')
    .map((part) => (part === 'CommandOrControl' ? (platform === 'darwin' ? '⌘' : 'Strg') : part))
    .join(' + ');
}
