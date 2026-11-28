/**
 * Gemeinsame Typen und reine Helfer für die Automation Engine.
 *
 * Die Ausführung läuft im Electron-Hauptprozess (electron/automation.cjs);
 * der Renderer bearbeitet nur Entwürfe. Alles hier ist bewusst ohne
 * Seiteneffekte, damit die Oberfläche validieren und simulieren kann.
 */

export type ContextMode = 'neutral' | 'gaming' | 'productivity' | 'relax' | 'standby';
export type Metric = 'cpu' | 'gpu' | 'ram' | 'temperature';
export type ModuleId = 'telemetry' | 'conversation' | 'tiles' | 'core';
export type ConditionLogic = 'and' | 'or';

export type Trigger =
  | { kind: 'time'; at: string; days: number[] }
  | { kind: 'startup' }
  | { kind: 'app_start'; app: string }
  | { kind: 'app_stop'; app: string }
  | { kind: 'mode_change'; mode: ContextMode | 'any' }
  | { kind: 'threshold'; metric: Metric; value: number; direction: 'above' | 'below' }
  | { kind: 'idle'; minutes: number }
  | { kind: 'manual' }
  | { kind: 'voice' };

export type Condition =
  | { kind: 'app_running'; app: string; running: boolean }
  | { kind: 'mode'; mode: ContextMode }
  | { kind: 'time_window'; from: string; to: string; days: number[] }
  | { kind: 'metric'; metric: Metric; op: 'above' | 'below'; value: number }
  | { kind: 'user_active'; active: boolean; withinSeconds: number };

export type Action =
  | { kind: 'open_app'; app: string }
  | { kind: 'open_url'; url: string; title?: string }
  | { kind: 'notify'; title: string; message: string }
  | { kind: 'set_mode'; mode: ContextMode; durationSeconds: number }
  | { kind: 'restore_mode' }
  | { kind: 'toggle_module'; module: ModuleId; hidden: boolean }
  | { kind: 'set_volume'; percent: number }
  | { kind: 'create_reminder'; label: string; seconds: number }
  | { kind: 'run_routine'; routineId: string }
  | { kind: 'power_plan'; plan: 'balanced' | 'high' | 'saver' }
  | { kind: 'briefing'; prompt: string };

export type ActionKind = Action['kind'];
export type TriggerKind = Trigger['kind'];
export type ConditionKind = Condition['kind'];

export interface AutomationRoutine {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  conditionLogic: ConditionLogic;
  actions: Action[];
  cooldownSeconds: number;
  priority: number;
  requireConfirmation: boolean;
  preset?: string;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
}

export interface ApplicationProfiles {
  gaming: string[];
  productivity: string[];
  relax: string[];
}

export interface AutomationSettings {
  enabled: boolean;
  autoContext: boolean;
  manualMode: ContextMode | null;
  idleMinutes: number;
  pollSeconds: number;
  profiles: ApplicationProfiles;
  hiddenModules: ModuleId[];
}

export interface ActiveApplication {
  name: string;
  process: string;
  title: string;
  fullscreen: boolean;
}

export interface ContextSample {
  at: number;
  mode: ContextMode;
  reason: string;
  automatic: boolean;
  manual: ContextMode | null;
  idleSeconds: number;
  activeApp: ActiveApplication | null;
  processes: string[];
  metrics: { cpu: number | null; gpu: number | null; ram: number | null; temperature: number | null };
  overrideUntil: number;
}

export interface AutomationActionRun {
  kind: ActionKind;
  label: string;
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

export interface AutomationRun {
  id: string;
  at: number;
  routineId: string;
  routineName: string;
  trigger: string;
  status: 'ok' | 'error' | 'skipped' | 'simulated';
  message: string;
  actions: AutomationActionRun[];
  durationMs: number;
}

export interface AutomationConflict {
  routineId: string;
  otherId: string;
  message: string;
}

export interface AutomationSnapshot {
  supported: boolean;
  settings: AutomationSettings;
  routines: AutomationRoutine[];
  context: ContextSample;
  history: AutomationRun[];
  conflicts: AutomationConflict[];
  tickError?: string;
}

export const DEFAULT_PROFILES: ApplicationProfiles = {
  gaming: [
    'wow.exe',
    'world of warcraft',
    'steam.exe',
    'cs2.exe',
    'valorant.exe',
    'league of legends.exe',
    'dota2.exe',
    'fortnite.exe',
    'minecraft.exe',
  ],
  productivity: [
    'code.exe',
    'devenv.exe',
    'idea64.exe',
    'webstorm64.exe',
    'winword.exe',
    'excel.exe',
    'powerpnt.exe',
    'notion.exe',
    'obsidian.exe',
    'slack.exe',
    'teams.exe',
    'zoom.exe',
  ],
  relax: ['spotify.exe', 'vlc.exe', 'mpv.exe', 'foobar2000.exe', 'musicbee.exe', 'netflix'],
};

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  enabled: false,
  autoContext: true,
  manualMode: null,
  idleMinutes: 8,
  pollSeconds: 5,
  profiles: DEFAULT_PROFILES,
  hiddenModules: [],
};

export const CONTEXT_LABEL: Record<ContextMode, string> = {
  neutral: 'NEUTRAL',
  gaming: 'GAMING',
  productivity: 'PRODUKTIV',
  relax: 'RELAX',
  standby: 'STANDBY',
};

export const TRIGGER_LABEL: Record<TriggerKind, string> = {
  time: 'Uhrzeit',
  startup: 'Systemstart',
  app_start: 'Anwendung startet',
  app_stop: 'Anwendung endet',
  mode_change: 'Moduswechsel',
  threshold: 'Hardware-Grenzwert',
  idle: 'Inaktivität',
  manual: 'Manuell',
  voice: 'Sprachbefehl',
};

export const CONDITION_LABEL: Record<ConditionKind, string> = {
  app_running: 'Anwendung läuft',
  mode: 'Aktiver Modus',
  time_window: 'Zeitfenster',
  metric: 'Hardwarewert',
  user_active: 'Benutzeraktivität',
};

export const ACTION_LABEL: Record<ActionKind, string> = {
  open_app: 'Programm öffnen',
  open_url: 'Webseite öffnen',
  notify: 'Benachrichtigung',
  set_mode: 'Modus wechseln',
  restore_mode: 'Modus wiederherstellen',
  toggle_module: 'Modul ein-/ausblenden',
  set_volume: 'Lautstärke setzen',
  create_reminder: 'Erinnerung erstellen',
  run_routine: 'Routine starten',
  power_plan: 'Energieprofil wechseln',
  briefing: 'KI-Briefing',
};

export const MODE_LABEL: Record<ContextMode, string> = {
  neutral: 'Neutral',
  gaming: 'Gaming',
  productivity: 'Produktivität',
  relax: 'Relax',
  standby: 'Standby',
};

export const METRIC_LABEL: Record<Metric, string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'RAM',
  temperature: 'Temperatur',
};

export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export function uid(prefix = 'rtn'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function isValidTime(value: unknown): value is string {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(value ?? '').trim());
}

export function normalizedDays(value: unknown): number[] {
  const list = Array.isArray(value) ? value : [];
  const days = [...new Set(list.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return days.length ? days.sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

/** Erzeugt eine leere, gültige Routine für den Builder. */
export function emptyRoutine(): AutomationRoutine {
  const at = Date.now();
  return {
    id: uid(),
    name: 'Neue Routine',
    description: '',
    enabled: false,
    trigger: { kind: 'manual' },
    conditions: [],
    conditionLogic: 'and',
    actions: [],
    cooldownSeconds: 60,
    priority: 3,
    requireConfirmation: false,
    createdAt: at,
    updatedAt: at,
  };
}

/** Kopiert eine Routine unter neuem Namen und neuer ID. */
export function duplicateRoutine(routine: AutomationRoutine): AutomationRoutine {
  const at = Date.now();
  return {
    ...routine,
    id: uid(),
    name: `${routine.name} (Kopie)`,
    preset: undefined,
    enabled: false,
    createdAt: at,
    updatedAt: at,
    lastRunAt: undefined,
    lastStatus: undefined,
    lastError: undefined,
  };
}

function clip(value: unknown, max = 120): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function appText(app: unknown): string {
  return clip(app, 80).toLowerCase();
}

/** Normalisiert einen Entwurf; gibt bei ungültigen Feldern einen Fehler zurück. */
export function normalizeRoutine(input: Partial<AutomationRoutine>): { ok: true; routine: AutomationRoutine } | { ok: false; error: string } {
  const name = clip(input.name, 80);
  if (name.length < 2) return { ok: false, error: 'Die Routine braucht einen Namen.' };

  const rawTrigger = input.trigger;
  if (!rawTrigger || typeof rawTrigger !== 'object') return { ok: false, error: 'Der Auslöser fehlt.' };

  let trigger: Trigger;
  switch (rawTrigger.kind) {
    case 'time':
      if (!isValidTime(rawTrigger.at)) return { ok: false, error: 'Bitte eine Uhrzeit im Format HH:MM angeben.' };
      trigger = { kind: 'time', at: rawTrigger.at, days: normalizedDays(rawTrigger.days) };
      break;
    case 'startup':
      trigger = { kind: 'startup' };
      break;
    case 'app_start':
    case 'app_stop': {
      const app = appText(rawTrigger.app);
      if (!app) return { ok: false, error: 'Bitte eine Anwendung angeben.' };
      trigger = { kind: rawTrigger.kind, app };
      break;
    }
    case 'mode_change': {
      const mode = rawTrigger.mode === 'any' || isContextMode(rawTrigger.mode) ? rawTrigger.mode : 'any';
      trigger = { kind: 'mode_change', mode };
      break;
    }
    case 'threshold': {
      if (!isMetric(rawTrigger.metric)) return { ok: false, error: 'Unbekannter Hardwarewert.' };
      trigger = {
        kind: 'threshold',
        metric: rawTrigger.metric,
        value: clampNumber(rawTrigger.value, 1, 110, 85),
        direction: rawTrigger.direction === 'below' ? 'below' : 'above',
      };
      break;
    }
    case 'idle':
      trigger = { kind: 'idle', minutes: clampNumber(rawTrigger.minutes, 1, 240, 10) };
      break;
    case 'manual':
      trigger = { kind: 'manual' };
      break;
    case 'voice':
      trigger = { kind: 'voice' };
      break;
    default:
      return { ok: false, error: 'Unbekannter Auslöser.' };
  }

  const conditions: Condition[] = [];
  for (const raw of Array.isArray(input.conditions) ? input.conditions.slice(0, 8) : []) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Eine Bedingung ist unvollständig.' };
    const before = conditions.length;
    switch (raw.kind) {
      case 'app_running': {
        const app = appText(raw.app);
        if (app) conditions.push({ kind: 'app_running', app, running: raw.running !== false });
        break;
      }
      case 'mode':
        if (isContextMode(raw.mode)) conditions.push({ kind: 'mode', mode: raw.mode });
        break;
      case 'time_window':
        if (isValidTime(raw.from) && isValidTime(raw.to)) {
          conditions.push({ kind: 'time_window', from: raw.from, to: raw.to, days: normalizedDays(raw.days) });
        }
        break;
      case 'metric':
        if (isMetric(raw.metric)) {
          conditions.push({
            kind: 'metric',
            metric: raw.metric,
            op: raw.op === 'below' ? 'below' : 'above',
            value: clampNumber(raw.value, 0, 110, 80),
          });
        }
        break;
      case 'user_active':
        conditions.push({
          kind: 'user_active',
          active: raw.active !== false,
          withinSeconds: clampNumber(raw.withinSeconds, 10, 3600, 120),
        });
        break;
      default:
        return { ok: false, error: 'Unbekannte Bedingung.' };
    }
    if (conditions.length === before) return { ok: false, error: 'Eine Bedingung ist unvollständig.' };
  }

  const rawActions = Array.isArray(input.actions) ? input.actions.slice(0, 12) : [];
  const actions: Action[] = [];
  for (const raw of rawActions) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Eine Aktion ist unvollständig.' };
    const action = normalizeAction(raw);
    if (!action) return { ok: false, error: 'Eine Aktion ist ungültig oder unvollständig.' };
    actions.push(action);
  }
  if (actions.length === 0) return { ok: false, error: 'Mindestens eine Aktion ist nötig.' };

  return {
    ok: true,
    routine: {
      id: String(input.id || uid()).slice(0, 60),
      name,
      description: clip(input.description, 240),
      enabled: Boolean(input.enabled),
      trigger,
      conditions,
      conditionLogic: input.conditionLogic === 'or' ? 'or' : 'and',
      actions,
      cooldownSeconds: clampNumber(input.cooldownSeconds, 30, 86_400, 60),
      priority: clampNumber(input.priority, 1, 10, 3),
      requireConfirmation: Boolean(input.requireConfirmation),
      preset: input.preset ? clip(input.preset, 40) : undefined,
      createdAt: Number(input.createdAt) || Date.now(),
      updatedAt: Date.now(),
      lastRunAt: Number(input.lastRunAt) || undefined,
      lastStatus: input.lastStatus,
      lastError: input.lastError ? clip(input.lastError, 200) : undefined,
    },
  };
}

export function normalizeAction(raw: Action): Action | null {
  switch (raw.kind) {
    case 'open_app': {
      const app = clip(raw.app, 60);
      return app ? { kind: 'open_app', app } : null;
    }
    case 'open_url': {
      const url = safeHttpUrl(raw.url);
      return url ? { kind: 'open_url', url, title: clip(raw.title, 80) || undefined } : null;
    }
    case 'notify': {
      const message = clip(raw.message, 240);
      return message ? { kind: 'notify', title: clip(raw.title, 80) || 'J.A.R.V.I.S.', message } : null;
    }
    case 'set_mode':
      return isContextMode(raw.mode)
        ? { kind: 'set_mode', mode: raw.mode, durationSeconds: clampNumber(raw.durationSeconds, 0, 86_400, 0) }
        : null;
    case 'restore_mode':
      return { kind: 'restore_mode' };
    case 'toggle_module':
      return isModuleId(raw.module)
        ? { kind: 'toggle_module', module: raw.module, hidden: raw.hidden !== false }
        : null;
    case 'set_volume':
      return { kind: 'set_volume', percent: clampNumber(raw.percent, 0, 100, 40) };
    case 'create_reminder': {
      const label = clip(raw.label, 80);
      return label ? { kind: 'create_reminder', label, seconds: clampNumber(raw.seconds, 5, 86_400, 600) } : null;
    }
    case 'run_routine': {
      const routineId = clip(raw.routineId, 60);
      return routineId ? { kind: 'run_routine', routineId } : null;
    }
    case 'power_plan':
      return raw.plan === 'high' || raw.plan === 'saver' || raw.plan === 'balanced'
        ? { kind: 'power_plan', plan: raw.plan }
        : null;
    case 'briefing':
      return { kind: 'briefing', prompt: clip(raw.prompt, 240) };
    default:
      return null;
  }
}

export function isContextMode(value: unknown): value is ContextMode {
  return value === 'neutral' || value === 'gaming' || value === 'productivity' || value === 'relax' || value === 'standby';
}

export function isMetric(value: unknown): value is Metric {
  return value === 'cpu' || value === 'gpu' || value === 'ram' || value === 'temperature';
}

export function isModuleId(value: unknown): value is ModuleId {
  return value === 'telemetry' || value === 'conversation' || value === 'tiles' || value === 'core';
}

export function safeHttpUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Kurze, vorlesbare Beschreibung eines Auslösers. */
export function describeTrigger(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'time':
      return `${trigger.at} Uhr${trigger.days.length < 7 ? ` · ${trigger.days.map((day) => WEEKDAYS[day]).join(', ')}` : ' · täglich'}`;
    case 'startup':
      return 'beim Systemstart';
    case 'app_start':
      return `wenn ${trigger.app} startet`;
    case 'app_stop':
      return `wenn ${trigger.app} endet`;
    case 'mode_change':
      return trigger.mode === 'any' ? 'bei jedem Moduswechsel' : `beim Wechsel zu ${MODE_LABEL[trigger.mode]}`;
    case 'threshold':
      return `${METRIC_LABEL[trigger.metric]} ${trigger.direction === 'above' ? 'über' : 'unter'} ${trigger.value}${trigger.metric === 'temperature' ? ' °C' : ' %'}`;
    case 'idle':
      return `nach ${trigger.minutes} Minuten Inaktivität`;
    case 'manual':
      return 'manuell';
    case 'voice':
      return 'per Sprachbefehl';
    default:
      return 'unbekannt';
  }
}

export function describeCondition(condition: Condition): string {
  switch (condition.kind) {
    case 'app_running':
      return `${condition.app} ${condition.running ? 'läuft' : 'läuft nicht'}`;
    case 'mode':
      return `Modus ${MODE_LABEL[condition.mode]}`;
    case 'time_window':
      return `${condition.from}–${condition.to} Uhr`;
    case 'metric':
      return `${METRIC_LABEL[condition.metric]} ${condition.op === 'above' ? '>' : '<'} ${condition.value}${condition.metric === 'temperature' ? ' °C' : ' %'}`;
    case 'user_active':
      return condition.active ? `aktiv (${condition.withinSeconds} s)` : 'inaktiv';
    default:
      return 'unbekannt';
  }
}

export function describeAction(action: Action): string {
  switch (action.kind) {
    case 'open_app':
      return `Öffne ${action.app}`;
    case 'open_url':
      return `Öffne ${action.title || action.url}`;
    case 'notify':
      return `Benachrichtigung: ${action.message}`;
    case 'set_mode':
      return `Wechsle in ${MODE_LABEL[action.mode]}${action.durationSeconds ? ` (${action.durationSeconds} s)` : ''}`;
    case 'restore_mode':
      return 'Stelle den vorherigen Modus wieder her';
    case 'toggle_module':
      return `${action.module} ${action.hidden ? 'ausblenden' : 'einblenden'}`;
    case 'set_volume':
      return `Lautstärke auf ${action.percent} %`;
    case 'create_reminder':
      return `Erinnerung in ${Math.round(action.seconds / 60)} min: ${action.label}`;
    case 'run_routine':
      return `Starte Routine ${action.routineId}`;
    case 'power_plan':
      return `Energieprofil ${action.plan === 'high' ? 'Höchstleistung' : action.plan === 'saver' ? 'Energiesparen' : 'Ausbalanciert'}`;
    case 'briefing':
      return 'Erstelle ein KI-Briefing';
    default:
      return 'unbekannt';
  }
}

/** Fasst eine Routine in einem Satz zusammen — auch für die Bestätigung. */
export function summarizeRoutine(routine: AutomationRoutine): string {
  const trigger = describeTrigger(routine.trigger);
  const actions = routine.actions.map(describeAction).join('; ');
  return `${routine.name}: ${trigger}${routine.conditions.length ? `, wenn ${routine.conditions.map(describeCondition).join(routine.conditionLogic === 'or' ? ' oder ' : ' und ')}` : ''} → ${actions}`;
}

/**
 * Erkennt einfache Überschneidungen: zwei aktive Routinen, die denselben Modus
 * setzen, oder dieselbe Anwendung als Auslöser nutzen. Nur ein Hinweis, keine
 * Blockade — Prioritäten entscheiden bei der Ausführung.
 */
export function findConflicts(routines: AutomationRoutine[]): AutomationConflict[] {
  const conflicts: AutomationConflict[] = [];
  const active = routines.filter((routine) => routine.enabled);
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      const modeA = a.actions.find((action) => action.kind === 'set_mode');
      const modeB = b.actions.find((action) => action.kind === 'set_mode');
      const sameApp =
        (a.trigger.kind === 'app_start' || a.trigger.kind === 'app_stop') &&
        (b.trigger.kind === 'app_start' || b.trigger.kind === 'app_stop') &&
        a.trigger.app === b.trigger.app;
      if (sameApp) {
        conflicts.push({
          routineId: a.id,
          otherId: b.id,
          message: `„${a.name}“ und „${b.name}“ reagieren beide auf ${(a.trigger as { app: string }).app}.`,
        });
      } else if (modeA && modeB && modeA.mode !== modeB.mode) {
        conflicts.push({
          routineId: a.id,
          otherId: b.id,
          message: `„${a.name}“ und „${b.name}“ setzen unterschiedliche Modi (${MODE_LABEL[modeA.mode]} / ${MODE_LABEL[modeB.mode]}).`,
        });
      }
    }
  }
  return conflicts.slice(0, 6);
}

/** Baut aus dem KI-Entwurf eine Routine (wird im Hauptprozess erneut geprüft). */
export interface RoutineDraftInput {
  name?: unknown;
  description?: unknown;
  trigger?: unknown;
  conditions?: unknown;
  actions?: unknown;
}

export function routineFromDraft(input: RoutineDraftInput): { ok: true; routine: AutomationRoutine } | { ok: false; error: string } {
  const draft = emptyRoutine();
  const trigger = input.trigger && typeof input.trigger === 'object' ? (input.trigger as Trigger) : { kind: 'manual' as const };
  return normalizeRoutine({
    ...draft,
    name: String(input.name ?? '').slice(0, 80),
    description: String(input.description ?? '').slice(0, 240),
    trigger,
    conditions: Array.isArray(input.conditions) ? (input.conditions as Condition[]) : [],
    actions: Array.isArray(input.actions) ? (input.actions as Action[]) : [],
    enabled: false,
    preset: undefined,
  });
}

export function formatRunTime(at: number): string {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(at);
}

export function modeAccent(mode: ContextMode): string {
  switch (mode) {
    case 'gaming':
      return '#ff9f43';
    case 'productivity':
      return '#63e6be';
    case 'relax':
      return '#b197fc';
    case 'standby':
      return '#8d99ae';
    default:
      return '#ffb347';
  }
}
