import type { Note, Settings, TimerItem } from '../types';
import { parseMemoryIntent, type MemoryItem, type MemoryKind } from './memory';
import { parseDuration } from './numbers';
import { getWeatherReport } from './weather';
import { matchRoutine, runRoutine } from './routines';

export interface DesktopActions {
  openApp: (name: string) => Promise<JarvisReply>;
  volume: (direction: 'up' | 'down' | 'mute') => Promise<JarvisReply>;
  media: (action: 'playpause' | 'next' | 'previous') => Promise<JarvisReply>;
  lock: () => Promise<JarvisReply>;
}

export interface JarvisContext {
  settings: Settings;
  desktop?: DesktopActions | null;
  notes: Note[];
  timers: TimerItem[];
  addNote: (text: string) => void;
  clearNotes: () => void;
  addTimer: (due: number, label: string, kind: 'timer' | 'alarm') => void;
  stopSpeaking: () => void;
  vision?: (question: string) => Promise<JarvisReply>;
  voiceLabel: string;
  listening: boolean;
  startedAt: number;
  /** Ohne Sprachmodell bleibt für Suchen der Browser als Rückfall. */
  brainConfigured: boolean;
  memory: {
    add: (text: string, kind?: MemoryKind) => { duplicate: boolean; count: number };
    search: (query: string, limit?: number) => MemoryItem[];
    recent: (limit?: number) => MemoryItem[];
    forget: (query: string) => number;
    clear: () => void;
    count: number;
  };
}

export interface JarvisReply {
  speak: string;
  /** Der eigentliche Antworttext, auch wenn er schon gestreamt gesprochen wurde. */
  text?: string;
  url?: string;
  sources?: Array<{ title: string; url: string }>;
}

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const JOKES = [
  'Warum können Programmierer keine Vampire leiden? Weil sie ständig Bugs im Blut haben.',
  'Ich habe versucht, einen Witz über UDP zu erzählen. Ich weiß nicht, ob er angekommen ist.',
  'Zwei Zustände treffen sich. Sagt der eine: Ich fühle mich instabil. Sagt der andere: Kein Wunder, du bist ein Flip-Flop.',
  'Warum hat der Roboter keinen Hunger? Weil er nur Speicher frisst.',
  'Herr Stark hat mich einmal neu gestartet. Er nannte es einen produktiven Nachmittag.',
  'Ein Informatiker bestellt im Restaurant ein Steak. Der Kellner fragt nach der Beilage. Er antwortet: ein Semikolon.',
];

const AMBIENT = [
  'Mir geht es gut. Der Reaktor läuft rund, die Latenz ist niedrig.',
  'Alle Systeme arbeiten innerhalb der Toleranz. Danke der Nachfrage.',
  'Ich bin bereit. Und ich habe Geduld, das ist ein Vorteil gegenüber Menschen.',
  'Bestens. Ich habe mir erlaubt, die Prozesse im Blick zu behalten.',
];

const SITES: Record<string, string> = {
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  github: 'https://github.com',
  gmail: 'https://mail.google.com',
  wikipedia: 'https://de.wikipedia.org',
  netflix: 'https://www.netflix.com',
  spotify: 'https://open.spotify.com',
  amazon: 'https://www.amazon.de',
  karten: 'https://www.google.com/maps',
  maps: 'https://www.google.com/maps',
  chatgpt: 'https://chatgpt.com',
  deepseek: 'https://chat.deepseek.com',
  tagesschau: 'https://www.tagesschau.de',
  heise: 'https://www.heise.de',
  reddit: 'https://www.reddit.com',
  instagram: 'https://www.instagram.com',
  whatsapp: 'https://web.whatsapp.com',
  stackoverflow: 'https://stackoverflow.com',
  wetter: 'https://www.wetter.de',
  ard: 'https://www.ardmediathek.de',
  zdf: 'https://www.zdf.de',
  ebay: 'https://www.ebay.de',
  kleinanzeigen: 'https://www.kleinanzeigen.de',
  idealo: 'https://www.idealo.de',
  übersetzer: 'https://translate.google.com',
  uebersetzer: 'https://translate.google.com',
  translate: 'https://translate.google.com',
  twitch: 'https://www.twitch.tv',
  discord: 'https://discord.com/app',
  outlook: 'https://outlook.live.com',
  drive: 'https://drive.google.com',
  kalender: 'https://calendar.google.com',
  twitter: 'https://x.com',
  facebook: 'https://www.facebook.com',
  tiktok: 'https://www.tiktok.com',
};

/**
 * Programme, die auf dem Rechner gestartet werden dürfen. Die Namen sind
 * gesprochene Alltagsbegriffe; welche Datei dahinter steckt, entscheidet
 * electron/platform.cjs je nach System.
 */
const APP_WORDS = new Set([
  'chrome',
  'google chrome',
  'edge',
  'microsoft edge',
  'firefox',
  'notepad',
  'editor',
  'rechner',
  'taschenrechner',
  'calculator',
  'explorer',
  'dateimanager',
  'dateien',
  'terminal',
  'powershell',
  'eingabeaufforderung',
  'cmd',
  'einstellungen',
  'settings',
  'taskmanager',
  'task-manager',
  'paint',
  'word',
  'excel',
  'powerpoint',
  'outlook',
  'spotify',
  'discord',
  'steam',
  'vscode',
  'visual studio code',
  'teams',
  'zoom',
  'telegram',
  'whatsapp',
]);

/** Suchziele für „suche auf YouTube nach …“. */
const SEARCH_TARGETS: Record<string, string> = {
  youtube: 'https://www.youtube.com/results?search_query=',
  google: 'https://www.google.com/search?q=',
  wikipedia: 'https://de.wikipedia.org/w/index.php?search=',
  amazon: 'https://www.amazon.de/s?k=',
  github: 'https://github.com/search?q=',
  maps: 'https://www.google.com/maps/search/',
  bilder: 'https://www.google.com/search?tbm=isch&q=',
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const numberFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 });

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function evaluateExpression(source: string): number | null {
  const tokens = source.match(/\d+(?:\.\d+)?|[+\-*/()%]/g);
  if (!tokens || tokens.length < 2) return null;
  let pos = 0;

  const peek = (): string | undefined => tokens[pos];

  const parseFactor = (): number => {
    const token = tokens[pos];
    if (token === '(') {
      pos += 1;
      const value = parseSum();
      if (tokens[pos] === ')') pos += 1;
      return value;
    }
    if (token === '-') {
      pos += 1;
      return -parseFactor();
    }
    if (token === '+') {
      pos += 1;
      return parseFactor();
    }
    pos += 1;
    const value = Number(token);
    return Number.isFinite(value) ? value : Number.NaN;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = tokens[pos];
      pos += 1;
      const rhs = parseFactor();
      if (op === '*') value *= rhs;
      else if (op === '/') value = rhs === 0 ? Number.NaN : value / rhs;
      else value %= rhs;
    }
    return value;
  };

  const parseSum = (): number => {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos];
      pos += 1;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  };

  const result = parseSum();
  if (!Number.isFinite(result) || pos !== tokens.length) return null;
  return result;
}

function spellNumber(value: number): string {
  return numberFormat.format(value);
}

function toClock(hour: number, minute: number): string {
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${h}:${m}`;
}

async function weatherReply(city: string): Promise<JarvisReply> {
  try {
    return { speak: await getWeatherReport(city) };
  } catch {
    return {
      speak: `Ich konnte keine Wetterdaten für ${city} abrufen. Prüfe bitte die Internetverbindung oder ändere die Stadt in den Einstellungen.`,
    };
  }
}

/**
 * Zentrale Befehl-Engine: versteht deutsche Sätze, antwortet kurz und
 * sprachtauglich. Gibt null zurück, wenn kein lokaler Befehl passt — dann
 * übernimmt das Sprachmodell.
 */
export async function handleCommand(raw: string, ctx: JarvisContext): Promise<JarvisReply | null> {
  const text = raw.trim();
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return { speak: '' };

  // Sprachausgabe stoppen
  if (/^(stopp|stop|halt|ruhe|sei still|genug|hör auf|hoer auf)\b/.test(t)) {
    ctx.stopSpeaking();
    return { speak: 'In Ordnung.' };
  }

  // Routinen bündeln mehrere Schritte unter einem Befehl — lokal, ohne Modell.
  const routine = matchRoutine(t);
  if (routine) return runRoutine(routine, ctx);

  // Hilfe
  if (/(hilfe|was kannst du|welche befehle|kommandos|fähigkeiten|faehigkeiten|was kann ich sagen)/.test(t)) {
    return {
      speak:
        'Ich höre auf mein Weckwort. Ich nenne Uhrzeit und Datum, melde das Wetter, stelle Timer und Wecker, ' +
        'speichere und lese Notizen vor, merke mir Fakten und Vorlieben dauerhaft, rechne Aufgaben, öffne Webseiten, ' +
        'starte Programme wie Chrome, Spotify oder den Rechner, stelle die Lautstärke, sperre den Bildschirm, ' +
        'suche im Netz und nenne dabei die Quellen, beschreibe deinen Bildschirm und erzähle Witze. ' +
        'Zum Beispiel: Öffne YouTube, öffne Notepad, suche auf YouTube nach Katzenvideos, suche auf Wikipedia nach Turing. ' +
        'Mit „Guten Morgen“ bekommst du einen Kurzbericht aus Wetter, Timern und Notizen, mit „Feierabend“ die Zusammenfassung des Tages. ' +
        'Sage zum Beispiel: Jarvis, Wetter in Hamburg. Oder: Jarvis, was steht auf dem Bildschirm? ' +
        'Und du kannst mich mitten im Satz unterbrechen — ich höre sofort auf.',
    };
  }

  // Bildschirm verstehen: ausdrücklich nur auf Zuruf.
  if (
    /(bildschirm|screen|monitor)/.test(t) &&
    /(was|steht|siehst|erkenn|erkl|erzähl|erzaehl|fass|zusammen|übersetz|uebersetz|lese|lies|vorlesen|zeig)/.test(t)
  ) {
    if (!ctx.vision) {
      return { speak: 'Das Bildschirmlesen geht nur in der Desktop-Version von Jarvis.' };
    }
    return ctx.vision(text);
  }

  // Langzeitgedächtnis: merken, erinnern, vergessen
  const memoryIntent = parseMemoryIntent(text);
  if (memoryIntent) {
    if (memoryIntent.action === 'add') {
      const result = ctx.memory.add(memoryIntent.text, memoryIntent.kind);
      const shown = memoryIntent.text.charAt(0).toUpperCase() + memoryIntent.text.slice(1);
      return {
        speak: result.duplicate
          ? 'Das hatte ich mir schon gemerkt.'
          : memoryIntent.kind === 'preference'
            ? `Gemerkt: ${shown}.`
            : `Gemerkt: ${shown}.`,
      };
    }

    if (memoryIntent.action === 'list') {
      const items = ctx.memory.recent(6);
      if (!items.length) {
        return {
          speak:
            'Ich habe noch nichts über dich gespeichert. Sage zum Beispiel: Merk dir, dass ich Kaffee schwarz trinke.',
        };
      }
      const spoken = items.map((item, index) => `${index + 1}. ${item.text}`).join('. ');
      return {
        speak: `Ich habe ${ctx.memory.count} ${ctx.memory.count === 1 ? 'Erinnerung' : 'Erinnerungen'}. ${spoken}.`,
      };
    }

    if (memoryIntent.action === 'search') {
      const hits = ctx.memory.search(memoryIntent.query, 3);
      if (!hits.length) return { speak: 'Dazu habe ich noch nichts gespeichert.' };
      return { speak: `Dazu weiß ich: ${hits.map((entry) => entry.text).join('. ')}.` };
    }

    if (memoryIntent.action === 'forget') {
      const removed = ctx.memory.forget(memoryIntent.query);
      return {
        speak: removed ? `Vergessen: ${memoryIntent.query}.` : 'Dazu habe ich nichts gespeichert gefunden.',
      };
    }

    ctx.memory.clear();
    return { speak: 'Gedächtnis geleert.' };
  }

  // Uhrzeit
  if (/(wie spät|wie spaet|uhrzeit|wie viel uhr|wieviel uhr|aktuelle zeit|die zeit)/.test(t)) {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    return { speak: `Es ist ${hour} Uhr ${minute === 0 ? '' : minute}.` };
  }

  // Datum
  if (/(datum|welcher tag|welches datum|den wievielten|heute für ein tag)/.test(t)) {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(now);
    const day = now.getDate();
    const month = new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(now);
    return { speak: `Heute ist ${weekday}, der ${day}. ${month}.` };
  }

  // Wetter
  if (/(wetter|wetterbericht|temperatur|regnet|schneit|schnee|grad)/.test(t)) {
    const cityMatch = text.match(/\bin\s+([A-ZÄÖÜa-zäöüß][\wäöüß.\- ]{1,40})$/);
    const city = cityMatch?.[1]?.replace(/[.!?]+$/, '').trim() || ctx.settings.city;
    return weatherReply(city);
  }

  // Timer und Wecker
  if (/(timer|countdown|erinner|erinnere|wecker|alarm|weck mich|wecken)/.test(t)) {
    const alarmMatch = t.match(/um\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?/);
    const duration = parseDuration(text);

    if (alarmMatch && /(wecker|alarm|weck)/.test(t)) {
      const hour = Math.min(23, Math.max(0, Number(alarmMatch[1])));
      const minute = Math.min(59, Math.max(0, alarmMatch[2] ? Number(alarmMatch[2]) : 0));
      const due = new Date();
      due.setHours(hour, minute, 0, 0);
      if (due.getTime() <= Date.now()) due.setDate(due.getDate() + 1);
      ctx.addTimer(due.getTime(), `Wecker ${toClock(hour, minute)}`, 'alarm');
      return { speak: `Wecker gestellt für ${hour} Uhr ${minute === 0 ? '' : minute}.` };
    }

    if (duration) {
      const taskMatch = text.match(/(?:an|dass|wegen|für)\s+(.{2,})$/i);
      const extra = taskMatch?.[1]?.replace(/[.!?]+$/, '').trim();
      const isReminder = /erinner|weck mich/.test(t) && !!extra;
      const label = isReminder ? extra : 'Timer';
      ctx.addTimer(Date.now() + duration.ms, label, 'timer');
      return {
        speak: isReminder
          ? `Ich erinnere dich in ${duration.label} an ${extra}.`
          : `Timer für ${duration.label} läuft.`,
      };
    }

    return { speak: 'Für wie lange soll der Timer laufen? Sage zum Beispiel: Timer für zehn Minuten.' };
  }

  // Notiz anlegen
  const noteMatch = text.match(
    /^(?:notiere|notier|merke? dir|schreib auf|schreib dir auf|neue notiz(?: an)?|notiz)\s+(.{2,})$/i,
  );
  if (noteMatch) {
    const note = noteMatch[1].replace(/[.!?]+$/, '').trim();
    ctx.addNote(note);
    return { speak: 'Notiert.' };
  }

  // Notizen vorlesen
  if (/(meine (?:liste|notizen)|was steht auf|notizen vorlesen|liste vorlesen|was habe ich notiert|wie viele notizen)/.test(t)) {
    if (!ctx.notes.length) return { speak: 'Deine Liste ist leer.' };
    const shown = ctx.notes.slice(-8);
    const spoken = shown.map((note, index) => `${index + 1}. ${note.text}`).join('. ');
    const rest = ctx.notes.length - shown.length;
    return {
      speak: `Du hast ${ctx.notes.length} ${ctx.notes.length === 1 ? 'Notiz' : 'Notizen'}. ${spoken}${rest > 0 ? `. Und ${rest} weitere.` : ''}`,
    };
  }

  // Notizen löschen
  if (/(lösche|löschen|leere|leeren|vergiss)\b.*(notiz|liste)/.test(t)) {
    ctx.clearNotes();
    return { speak: 'Die Liste ist geleert.' };
  }

  // Rechnen
  const percentMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:prozent|%)\s*von\s*(\d+(?:[.,]\d+)?)/);
  if (percentMatch) {
    const share = Number(percentMatch[1].replace(',', '.'));
    const base = Number(percentMatch[2].replace(',', '.'));
    const result = (share / 100) * base;
    return { speak: `${spellNumber(share)} Prozent von ${spellNumber(base)} sind ${spellNumber(result)}.` };
  }

  const mathSymbols = /[+\-*/]|\bplus\b|\bminus\b|\bmal\b|\bgeteilt\b|\bdurch\b|\bprozent\b/.test(t);
  if (/\d/.test(t) && (/^(rechne|berechne)\b/.test(t) || mathSymbols)) {
    const source = t
      .replace(/^(rechne|berechne|was ist|wie viel ist|wieviel ist|was macht|wie viel macht)\s*/, '')
      .replace(/\bgeteilt durch\b|\bgeteilt\b|\bdurch\b/g, '/')
      .replace(/\bplus\b/g, '+')
      .replace(/\bminus\b/g, '-')
      .replace(/\bmal\b/g, '*')
      .replace(/,/g, '.')
      .replace(/[^0-9+\-*/().% ]/g, ' ');
    const result = evaluateExpression(source);
    if (result != null) {
      return { speak: `Das Ergebnis ist ${spellNumber(result)}.` };
    }
    return { speak: 'Die Rechnung konnte ich nicht auflösen. Versuche es zum Beispiel mit: zwölf mal acht.' };
  }

  // Desktop-Aktionen (nur in der Electron-Hülle verfügbar)
  const needsDesktop = (): JarvisReply => ({
    speak: 'Das geht nur in der Desktop-Version von Jarvis, nicht im Browser.',
  });

  if (/(sperr|lock).*(pc|rechner|computer|bildschirm|screen)|bildschirm sperren|pc sperren/.test(t)) {
    return ctx.desktop ? ctx.desktop.lock() : needsDesktop();
  }

  if (/(lautstärke|volume|lauter|leiser|stumm|mute)/.test(t)) {
    let direction: 'up' | 'down' | 'mute' | null = null;
    if (/(stumm|mute)/.test(t)) direction = 'mute';
    else if (/(leiser|runter|down)/.test(t)) direction = 'down';
    else if (/(lauter|rauf|up|erhöh)/.test(t)) direction = 'up';
    if (direction) return ctx.desktop ? ctx.desktop.volume(direction) : needsDesktop();
  }

  if (
    /^(pause|pausiere|weiterspielen|play|weiter)\b/.test(t) ||
    /(nächster|naechster|vorheriger|letzter)\s*(titel|song|track)/.test(t)
  ) {
    let action: 'playpause' | 'next' | 'previous' = 'playpause';
    if (/(nächster|naechster)/.test(t)) action = 'next';
    else if (/(vorheriger|letzter)/.test(t)) action = 'previous';
    return ctx.desktop ? ctx.desktop.media(action) : needsDesktop();
  }

  const programMatch = text.match(
    /^(?:starte|öffne|oeffne)\s+(?:das\s+|die\s+)?(?:programm|app|anwendung)\s+(.{2,})$/i,
  );
  if (programMatch) {
    const name = programMatch[1].replace(/[.!?]+$/, '').trim();
    return ctx.desktop ? ctx.desktop.openApp(name) : needsDesktop();
  }

  // Gezielte Suche: „suche auf YouTube nach Katzenvideos“ oder „youtube Katzenvideos“.
  const targetSearch =
    text.match(/^(?:suche|such)\s+(?:auf|bei|in)\s+(\S+)\s+(?:nach\s+)?(.+)$/i) ??
    text.match(/^(youtube|google|wikipedia|amazon|github|maps|bilder)\s+(?:nach\s+)?(.+)$/i);
  if (targetSearch) {
    const service = targetSearch[1].toLowerCase().replace(/[.!?]+$/, '');
    const query = targetSearch[2].replace(/[.!?]+$/, '').trim();
    if (query) {
      const base = SEARCH_TARGETS[service];
      return {
        speak: base
          ? `Ich suche auf ${capitalize(service)} nach ${query}.`
          : `Ich suche nach ${service} ${query}.`,
        url: base
          ? `${base}${encodeURIComponent(query)}`
          : `https://www.google.com/search?q=${encodeURIComponent(`${service} ${query}`)}`,
      };
    }
  }

  // Webseite oder Programm öffnen
  const openMatch = text.match(/^(?:öffne|oeffne|starte|geh auf|gehe auf|mach)\s+(.+?)(?:\s+auf)?$/i);
  if (openMatch) {
    const target = openMatch[1].replace(/[.!?]+$/, '').trim();
    const lower = target
      .toLowerCase()
      .replace(/^(den|die|das)\s+/, '')
      .trim();

    // Bekannte Programme zuerst: „öffne Spotify“ soll die App starten, nicht den Webplayer.
    if (APP_WORDS.has(lower)) {
      // Groß geschrieben, damit die Ansage „Notepad wird gestartet“ lautet.
      return ctx.desktop ? ctx.desktop.openApp(capitalize(lower)) : needsDesktop();
    }

    const key = Object.keys(SITES).find((name) => lower.includes(name));
    if (key) {
      return { speak: `${capitalize(key)} wird geöffnet.`, url: SITES[key] };
    }
    if (/^[\w-]+(\.[\w-]+)+$/.test(lower)) {
      return { speak: `Ich öffne ${target}.`, url: `https://${lower}` };
    }
    return {
      speak: `Ich suche ${target} im Netz.`,
      url: `https://www.google.com/search?q=${encodeURIComponent(target)}`,
    };
  }

  // Websuche: Mit Sprachmodell beantwortet und mit Quellen belegt. Ohne
  // Modell bleibt der Browser als Rückfall, damit die Suche nicht ausfällt.
  const searchMatch = text.match(/^(?:suche|google|such|recherchiere)\s+(?:nach\s+|mir\s+)?(.+)$/i);
  if (searchMatch) {
    const query = searchMatch[1].replace(/[.!?]+$/, '').trim();
    if (!ctx.brainConfigured) {
      return {
        speak: `Ich suche nach ${query}.`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      };
    }
    return null;
  }

  // Musik
  const playMatch = text.match(/^(?:spiele|spiel)\s+(?:mir\s+)?(.+)$/i);
  if (playMatch) {
    const what = playMatch[1].replace(/[.!?]+$/, '').trim();
    return {
      speak: `Ich öffne ${what} auf YouTube.`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(what)}`,
    };
  }

  // Systemstatus
  if (/(systemstatus|diagnose|status|bist du da|hörst du mich|hoerst du mich|alles in ordnung|alles klar bei dir)/.test(t)) {
    const minutes = Math.max(1, Math.round((Date.now() - ctx.startedAt) / 60000));
    return {
      speak:
        `Alle Systeme nominal. Mikrofon ${ctx.listening ? 'aktiv' : 'inaktiv'}, ` +
        `Stimme ${ctx.voiceLabel}, Laufzeit ${minutes} Minuten, ` +
        `${ctx.timers.length} aktive Zeitgeber, ${ctx.notes.length} Notizen, ${ctx.memory.count} Erinnerungen.`,
    };
  }

  // Witz
  if (/(witz|lustig|bring mich zum lachen)/.test(t)) {
    return { speak: pick(JOKES) };
  }

  // Identität
  if (/(wer bist du|wie heißt du|wie heisst du|dein name|was bist du)/.test(t)) {
    return {
      speak:
        'Ich bin Jarvis, dein sprachgesteuerter Assistent. Ich laufe lokal in deinem Browser, höre auf das Weckwort und antworte mit einer deutschen Stimme.',
    };
  }

  // Befindlichkeit
  if (/(wie geht es dir|wie geht's dir|wie gehts dir|wie läuft es|alles gut)/.test(t)) {
    return { speak: pick(AMBIENT) };
  }

  // Dank
  if (/^(danke|dankeschön|danke schön|vielen dank|besten dank)\b/.test(t)) {
    return { speak: pick(['Gern geschehen.', 'Immer wieder gern.', 'Dafür bin ich da.']) };
  }

  // Begrüßung
  if (/^(hallo|hi|hey|guten morgen|guten tag|guten abend|moin|servus)\b/.test(t)) {
    return { speak: `${greeting()}. Ich höre zu.` };
  }

  // Verabschiedung
  if (/(tschüss|tschuess|auf wiedersehen|bis später|bis spaeter|gute nacht)/.test(t)) {
    return { speak: 'Bis später. Ich bleibe im Standby.' };
  }

  return null;
}
