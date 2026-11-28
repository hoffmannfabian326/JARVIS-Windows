/**
 * Werkzeuge für J.A.R.V.I.S.
 *
 * Der Server kennt alle Definitionen und führt nur `web_search` selbst aus.
 * Alles andere geht als Tool-Call an den Renderer, wo die Aktion ausgeführt
 * wird — schreibende Aktionen erst nach einer Bestätigung im Fenster.
 */

export const MAX_TOOL_ROUNDS = 3;

const TIMER_SCHEMA = {
  type: 'function',
  function: {
    name: 'set_timer',
    description:
      'Stellt einen Timer oder Wecker. Für einen Timer die Dauer in Sekunden angeben, für einen Wecker die Uhrzeit im Format HH:MM.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['timer', 'alarm'], description: 'timer oder alarm' },
        label: { type: 'string', description: 'Kurze Beschriftung, z. B. Tee oder Arzttermin' },
        seconds: { type: 'integer', description: 'Dauer in Sekunden (nur bei kind=timer), 5 bis 86400' },
        time: { type: 'string', description: 'Uhrzeit HH:MM (nur bei kind=alarm), z. B. 07:30' },
      },
      required: ['kind', 'label'],
      additionalProperties: false,
    },
  },
};

const NOTE_SCHEMA = {
  type: 'function',
  function: {
    name: 'add_note',
    description: 'Speichert eine kurze Notiz in der sichtbaren Notizliste des Nutzers.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Der Notiztext, 2 bis 400 Zeichen' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
};

const MEMORY_SCHEMA = {
  type: 'function',
  function: {
    name: 'remember_fact',
    description:
      'Merkt sich dauerhaft eine Tatsache oder Vorliebe über den Nutzer. Nur nutzen, wenn der Nutzer ausdrücklich bittet, etwas zu merken.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Die zu merkende Information, 2 bis 400 Zeichen' },
        kind: { type: 'string', enum: ['fact', 'preference'], description: 'Tatsache oder Vorliebe' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
};

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Sucht aktuelle Informationen im Web. Nutze dieses Werkzeug bei Nachrichten, Preisen, Ereignissen, Personen oder wenn der Nutzer ausdrücklich nach einer Suche fragt. Nicht für Allgemeinwissen oder Smalltalk.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Suchbegriff, 2 bis 200 Zeichen, möglichst konkret' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: 'Liest den aktuellen Zustand von Jarvis: Mikrofon, Stimme, Laufzeit, Timer, Notizen und Erinnerungen.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Ruft den aktuellen Wetterbericht für eine Stadt ab.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Stadt; ohne Angabe die in den Einstellungen gespeicherte Stadt' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_notes',
      description: 'Liest die gespeicherten Notizen des Nutzers vor.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_timers',
      description: 'Listet laufende Timer und Wecker mit Restzeit auf.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  TIMER_SCHEMA,
  NOTE_SCHEMA,
  MEMORY_SCHEMA,
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Startet ein installiertes Programm auf diesem Rechner.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Programmname, z. B. Chrome, Notepad oder Spotify' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_app',
      description:
        'Beendet ein laufendes Programm auf diesem Rechner. Nur auf ausdrückliche Anweisung; der Nutzer bestätigt vorher.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Programmname, z. B. Spotify, Chrome oder Notepad' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: 'Öffnet eine Webseite im Standardbrowser. Nur http- und https-Adressen.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Vollständige http(s)-Adresse' },
          title: { type: 'string', description: 'Kurzer Seitentitel für die Bestätigung' },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'control_volume',
      description: 'Ändert die Systemlautstärke.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'mute'] },
        },
        required: ['direction'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'control_media',
      description: 'Steuert die aktuell laufende Medienwiedergabe.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['playpause', 'next', 'previous'] },
        },
        required: ['action'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lock_screen',
      description: 'Sperrt den Rechner. Nur auf ausdrückliche Anweisung des Nutzers.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

export const SERVER_TOOLS = new Set(['web_search']);
export const CLIENT_TOOLS = new Set(
  TOOL_DEFINITIONS.map((tool) => tool.function.name).filter((name) => !SERVER_TOOLS.has(name)),
);

export const CLIENT_TOOL_NAMES = [...CLIENT_TOOLS];

function safeSourceUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Akzeptiert nur die Form, die OpenAI-kompatible Modelle zurückgeben. */
export function normalizeToolCalls(raw) {
  const calls = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const id = String(entry?.id ?? '').slice(0, 80);
    const name = String(entry?.function?.name ?? '').slice(0, 60);
    if (!id || !name) continue;
    let args = entry?.function?.arguments;
    if (typeof args !== 'string') {
      try {
        args = JSON.stringify(args ?? {});
      } catch {
        args = '{}';
      }
    }
    calls.push({
      id,
      type: 'function',
      function: { name, arguments: args.slice(0, 4000) },
    });
    if (calls.length >= 6) break;
  }
  return calls;
}

/**
 * Validiert den Tool-Zustand, den der Renderer zurückschickt. Der Verlauf
 * kommt vollständig vom Client; der Server hängt nur seinen Systemprompt davor.
 */
export function sanitizeToolState(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'invalid_tool_state' };

  const round = Number(raw.round);
  if (!Number.isInteger(round) || round < 1 || round > MAX_TOOL_ROUNDS) {
    return { ok: false, error: 'invalid_round' };
  }
  if (!Array.isArray(raw.messages) || raw.messages.length === 0 || raw.messages.length > 40) {
    return { ok: false, error: 'invalid_messages' };
  }

  const messages = [];
  const knownCallIds = new Set();

  for (const entry of raw.messages) {
    if (!entry || typeof entry !== 'object') return { ok: false, error: 'invalid_message' };
    const role = entry.role;

    if (role === 'system') {
      if (typeof entry.content !== 'string') return { ok: false, error: 'invalid_system' };
      messages.push({ role: 'system', content: entry.content.slice(0, 8000) });
      continue;
    }

    if (role === 'user') {
      if (typeof entry.content !== 'string') return { ok: false, error: 'invalid_user' };
      messages.push({ role: 'user', content: entry.content.slice(0, 6000) });
      continue;
    }

    if (role === 'assistant') {
      const content = typeof entry.content === 'string' ? entry.content.slice(0, 8000) : '';
      const calls = normalizeToolCalls(entry.tool_calls);
      if (!content && calls.length === 0) return { ok: false, error: 'empty_assistant' };
      const message = { role: 'assistant', content: content || null };
      if (calls.length) {
        message.tool_calls = calls;
        calls.forEach((call) => knownCallIds.add(call.id));
      }
      messages.push(message);
      continue;
    }

    if (role === 'tool') {
      const id = String(entry.tool_call_id ?? '').slice(0, 80);
      if (!id || typeof entry.content !== 'string') return { ok: false, error: 'invalid_tool_result' };
      if (!knownCallIds.has(id)) return { ok: false, error: 'unknown_tool_call' };
      messages.push({ role: 'tool', tool_call_id: id, content: entry.content.slice(0, 8000) });
      continue;
    }

    return { ok: false, error: 'invalid_role' };
  }

  if (!messages.some((message) => message.role === 'user')) {
    return { ok: false, error: 'missing_user' };
  }

  const sources = [];
  if (Array.isArray(raw.sources)) {
    for (const entry of raw.sources.slice(0, 6)) {
      const title = String(entry?.title ?? '').trim().slice(0, 200);
      const url = safeSourceUrl(entry?.url);
      if (title && url) sources.push({ title, url });
    }
  }

  const provider = typeof raw.provider === 'string' ? raw.provider.slice(0, 32) : '';

  return { ok: true, messages, round, sources, provider };
}

/** Hängt neue Suchtreffer an, ohne doppelte URLs und ohne zu viele Quellen. */
export function mergeSources(existing, results) {
  const map = new Map();
  for (const entry of Array.isArray(existing) ? existing : []) {
    const url = safeSourceUrl(entry?.url);
    const title = String(entry?.title ?? '').trim().slice(0, 200);
    if (url && title) map.set(url, { title, url });
  }
  for (const entry of Array.isArray(results) ? results : []) {
    const url = safeSourceUrl(entry?.url);
    const title = String(entry?.title ?? '').trim().slice(0, 200);
    if (url && title && !map.has(url)) map.set(url, { title, url });
    if (map.size >= 5) break;
  }
  return [...map.values()].slice(0, 5);
}
