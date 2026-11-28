import type { ToolCall } from './brain';

export type ToolRisk = 'normal' | 'high';

export interface ToolDescription {
  title: string;
  detail: string;
  risk: ToolRisk;
}

export interface PendingTool {
  id: string;
  name: string;
  args: Record<string, unknown>;
  description: ToolDescription;
}

/** Nur diese Werkzeuge verändern etwas und brauchen eine Bestätigung. */
const CONFIRM_TOOLS = new Set([
  'set_timer',
  'add_note',
  'remember_fact',
  'open_app',
  'close_app',
  'open_url',
  'control_volume',
  'control_media',
  'lock_screen',
  'propose_automation',
]);

const KNOWN_TOOLS = new Set([
  'web_search',
  'get_system_status',
  'get_weather',
  'list_notes',
  'list_timers',
  ...CONFIRM_TOOLS,
]);

function clip(value: unknown, max = 160): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatSeconds(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  if (seconds < 60) return `${seconds} Sekunden`;
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}${minutes ? ` ${minutes} Minuten` : ''}`;
}

const VOLUME_LABEL: Record<string, string> = {
  up: 'lauter',
  down: 'leiser',
  mute: 'Stummschaltung umschalten',
};

const MEDIA_LABEL: Record<string, string> = {
  playpause: 'Wiedergabe umschalten',
  next: 'nächster Titel',
  previous: 'vorheriger Titel',
};

export function describeToolCall(name: string, args: Record<string, unknown>): ToolDescription {
  switch (name) {
    case 'get_system_status':
      return { title: 'Systemstatus lesen', detail: 'Mikrofon, Stimme, Timer und Gedächtnis prüfen.', risk: 'normal' };
    case 'get_weather':
      return {
        title: 'Wetter abrufen',
        detail: args.city ? `Für ${clip(args.city, 80)}.` : 'Für die eingestellte Stadt.',
        risk: 'normal',
      };
    case 'list_notes':
      return { title: 'Notizen lesen', detail: 'Die gespeicherten Notizen werden gelesen.', risk: 'normal' };
    case 'list_timers':
      return { title: 'Timer prüfen', detail: 'Laufende Timer und Wecker werden aufgelistet.', risk: 'normal' };
    case 'set_timer': {
      const label = clip(args.label, 80) || 'Timer';
      if (args.kind === 'alarm') {
        return { title: 'Wecker stellen', detail: `${clip(args.time, 5) || 'Uhrzeit fehlt'} Uhr · ${label}`, risk: 'normal' };
      }
      const seconds = Number(args.seconds);
      return {
        title: 'Timer stellen',
        detail: `${Number.isFinite(seconds) && seconds > 0 ? formatSeconds(seconds) : 'Dauer fehlt'} · ${label}`,
        risk: 'normal',
      };
    }
    case 'add_note':
      return { title: 'Notiz speichern', detail: clip(args.text, 220) || 'Leerer Notiztext.', risk: 'normal' };
    case 'remember_fact':
      return {
        title: args.kind === 'preference' ? 'Vorliebe dauerhaft merken' : 'Fakt dauerhaft merken',
        detail: clip(args.text, 220) || 'Leerer Eintrag.',
        risk: 'normal',
      };
    case 'open_app':
      return { title: 'Programm starten', detail: clip(args.name, 60) || 'Kein Programmname.', risk: 'normal' };
    case 'close_app':
      return {
        title: 'Programm schließen',
        detail: `${clip(args.name, 60) || 'Kein Programmname.'} wird beendet — nicht gespeicherte Arbeit geht verloren.`,
        risk: 'high',
      };
    case 'open_url':
      return {
        title: 'Webseite öffnen',
        detail: `${clip(args.title, 80) || 'Webseite'}\n${clip(args.url, 300)}`,
        risk: 'high',
      };
    case 'control_volume':
      return {
        title: 'Lautstärke ändern',
        detail: VOLUME_LABEL[String(args.direction)] ?? 'Unbekannte Richtung.',
        risk: 'normal',
      };
    case 'control_media':
      return {
        title: 'Wiedergabe steuern',
        detail: MEDIA_LABEL[String(args.action)] ?? 'Unbekannte Aktion.',
        risk: 'normal',
      };
    case 'lock_screen':
      return { title: 'Rechner sperren', detail: 'Der Bildschirm wird sofort gesperrt.', risk: 'high' };
    case 'propose_automation': {
      const summary = clip(args.summary || args.description, 400);
      return {
        title: 'Automation entwerfen',
        detail: `${summary || 'Keine Zusammenfassung geliefert.'}\n\nDer Entwurf wird gespeichert und ist danach deaktiviert. Erst im Automation Center prüfen und aktivieren.`,
        risk: 'normal',
      };
    }
    case 'web_search':
      return { title: 'Im Web suchen', detail: clip(args.query, 160), risk: 'normal' };
    default:
      return { title: 'Aktion ausführen', detail: name, risk: 'normal' };
  }
}

export function requiresConfirmation(name: string): boolean {
  return CONFIRM_TOOLS.has(name);
}

/**
 * Prüft einen Tool-Call aus dem Server. Ungültige Argumente werden nicht
 * bestätigt, sondern als Fehler an das Modell zurückgegeben.
 */
export function parseToolCall(call: ToolCall): PendingTool | null {
  const name = String(call?.function?.name ?? '');
  if (!KNOWN_TOOLS.has(name)) return null;

  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(call.function.arguments || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    } else {
      return null;
    }
  } catch {
    return null;
  }

  return {
    id: String(call.id),
    name,
    args,
    description: describeToolCall(name, args),
  };
}
