export interface BrainTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface BrainSource {
  title: string;
  url: string;
}

export interface BrainStatus {
  configured: boolean;
  model: string;
  provider?: string;
  search?: string;
  active?: string;
  providers?: Array<{ id: string; name: string; ready: boolean; cooldown: number }>;
}

export class BrainError extends Error {
  code: string;
  status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = 'BrainError';
    this.code = code;
    this.status = status;
  }
}

/** Übersetzt technische Fehlercodes in einen Satz, den man vorlesen kann. */
export function describeBrainError(error: unknown): string {
  const code = error instanceof BrainError ? error.code : String((error as Error)?.message || '');
  if (code === 'auth' || code === 'brain_401') {
    return 'Der API-Key wird abgelehnt. Prüfe ihn in den Einstellungen unter Zugangsdaten.';
  }
  if (code === 'quota' || code === 'brain_429') {
    return 'Das Kontingent des Anbieters ist erschöpft, und kein Ausweichanbieter hat geantwortet.';
  }
  if (code === 'network' || code === 'brain_network' || code === 'brain_502') {
    return 'Ich erreiche den Anbieter nicht. Prüfe die Internetverbindung.';
  }
  if (code === 'timeout' || code === 'brain_504') {
    return 'Der Anbieter antwortet zu langsam. Versuche es gleich noch einmal.';
  }
  if (code === 'no_key') {
    return 'Für freie Fragen fehlt ein API-Key. Hinterlege ihn in den Zugangsdaten.';
  }
  if (code === 'no_vision_model') {
    return 'Für Bildschirmfotos ist bei diesem Anbieter kein Bildmodell hinterlegt.';
  }
  return 'Ich erreiche mein Sprachmodell gerade nicht. Prüfe Verbindung und Zugangsdaten.';
}

export interface ToolCall {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolOutcome {
  ok: boolean;
  [key: string]: unknown;
}

export interface BrainReply {
  answer: string;
  sources: BrainSource[];
}

export interface BrainOptions {
  /** Führt einen Tool-Call aus; die Bestätigung passiert im Aufrufer. */
  onToolCall?: (call: ToolCall) => Promise<ToolOutcome>;
  /** Liefert Textstücke, sobald sie vom Modell eintreffen. */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  /** Text aus der Zwischenablage, ausdrücklich vom Nutzer mitgeschickt. */
  clipboard?: string;
  /** Zusammenfassung älterer Beiträge, damit der Kontext kurz bleibt. */
  summary?: string;
}

interface ChatResponse {
  answer?: string;
  sources?: unknown;
  toolCalls?: unknown;
  messages?: unknown;
  round?: number;
  error?: string;
  status?: number;
  provider?: string;
}

interface StreamEvent {
  type?: string;
  text?: unknown;
  answer?: unknown;
  sources?: unknown;
  toolCalls?: unknown;
  messages?: unknown;
  round?: unknown;
  error?: unknown;
  status?: unknown;
  provider?: unknown;
}

interface ToolState {
  messages: unknown[];
  round: number;
  sources: BrainSource[];
  provider?: string;
}

function isToolCall(value: unknown): value is ToolCall {
  const call = value as ToolCall | null;
  return Boolean(
    call &&
      typeof call.id === 'string' &&
      call.id &&
      call.function &&
      typeof call.function.name === 'string' &&
      typeof call.function.arguments === 'string',
  );
}

function normalizeSources(value: unknown): BrainSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sources: BrainSource[] = [];
  for (const entry of value) {
    const title = String(entry?.title ?? '').trim().slice(0, 200);
    const url = String(entry?.url ?? '').trim();
    if (!title || seen.has(url)) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      seen.add(url);
      sources.push({ title, url: parsed.href });
    } catch {
      /* ungültige Quelle ignorieren */
    }
    if (sources.length >= 5) break;
  }
  return sources;
}

/**
 * Liest die SSE-Antwort des Proxys. Jedes `data:`-Ereignis ist ein JSON-Objekt;
 * Deltas gehen sofort an den Aufrufer, das letzte Ereignis beendet den Lauf.
 */
async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onDelta?: (text: string) => void,
): Promise<ChatResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outcome: ChatResponse = {};
  let finished = false;

  const consume = (line: string) => {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw) return;

    let event: StreamEvent;
    try {
      event = JSON.parse(raw) as StreamEvent;
    } catch {
      return;
    }

    if (event.type === 'delta') {
      if (typeof event.text === 'string' && event.text) onDelta?.(event.text);
      return;
    }

    if (event.type === 'done') {
      outcome = {
        answer: typeof event.answer === 'string' ? event.answer : '',
        sources: event.sources,
        round: Number(event.round),
        provider: typeof event.provider === 'string' ? event.provider : undefined,
      };
      finished = true;
      return;
    }

    if (event.type === 'tools') {
      outcome = {
        toolCalls: event.toolCalls,
        messages: event.messages,
        round: Number(event.round),
        sources: event.sources,
        provider: typeof event.provider === 'string' ? event.provider : undefined,
      };
      finished = true;
      return;
    }

    if (event.type === 'error') {
      outcome = {
        error: String(event.error ?? 'brain_stream'),
        status: Number.isFinite(Number(event.status)) ? Number(event.status) : undefined,
      };
      finished = true;
    }
  };

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        consume(line);
        if (finished) break;
      }
    }
    if (!finished && buffer.trim()) consume(buffer);
  } finally {
    await reader.cancel().catch(() => {});
  }

  return outcome;
}

/**
 * Fragt das Sprachmodell über den lokalen Proxy. Der Server kann seinerseits
 * Werkzeuge aufrufen; alles, was der Renderer ausführen muss, kommt als
 * Tool-Calls zurück, wird hier bestätigt/ausgeführt und erneut eingesandt.
 * Antworttext kommt gestreamt über `onDelta`.
 */
export async function askBrain(
  question: string,
  history: BrainTurn[],
  memories: string[] = [],
  options: BrainOptions = {},
): Promise<BrainReply> {
  const deadline = AbortSignal.timeout(180_000);
  const signal = options.signal ?? deadline;
  let toolState: ToolState | null = null;
  let sources: BrainSource[] = [];

  for (let step = 0; step < 5; step += 1) {
    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          toolState
            ? { toolState, memories: memories.slice(0, 6), stream: true }
            : {
                question,
                history: history.slice(-6),
                memories: memories.slice(0, 6),
                stream: true,
                ...(options.clipboard ? { clipboard: options.clipboard } : {}),
                ...(options.summary ? { summary: options.summary } : {}),
              },
        ),
        signal,
      });
    } catch {
      throw new Error('brain_network');
    }

    if (!response.ok) {
      let code = `brain_${response.status}`;
      try {
        const detail = (await response.json()) as { error?: unknown };
        if (typeof detail?.error === 'string') code = detail.error;
      } catch {
        /* Antwort ohne JSON */
      }
      throw new BrainError(code, response.status);
    }

    const contentType = response.headers.get('content-type') ?? '';
    let data: ChatResponse | null;

    if (contentType.includes('text/event-stream') && response.body) {
      data = await readChatStream(response.body, options.onDelta);
      if (data.error) throw new BrainError(data.error, data.status);
    } else {
      // Ältere Server oder Anbieter ohne Streaming antworten mit JSON.
      data = (await response.json().catch(() => null)) as ChatResponse | null;
    }

    if (!data) {
      throw new Error('brain_empty');
    }

    sources = normalizeSources(data.sources);
    if (typeof data.answer === 'string' && data.answer.trim()) {
      return { answer: data.answer.trim(), sources };
    }

    const calls = Array.isArray(data.toolCalls) ? data.toolCalls.filter(isToolCall) : [];
    if (calls.length === 0 || !Array.isArray(data.messages)) {
      throw new Error('brain_empty');
    }
    if (!options.onToolCall) {
      throw new Error('brain_tools_unavailable');
    }

    const results: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];
    for (const call of calls) {
      let outcome: ToolOutcome;
      try {
        outcome = await options.onToolCall(call);
      } catch {
        outcome = { ok: false, error: 'Das Werkzeug ist fehlgeschlagen.' };
      }
      // Felder mit Unterstrich sind nur für die Oberfläche (Undo-IDs) und
      // gehören nicht in den Modellkontext.
      const cleanOutcome = Object.fromEntries(
        Object.entries(outcome).filter(([key]) => !key.startsWith('_')),
      );
      results.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(cleanOutcome).slice(0, 6000),
      });
    }

    toolState = {
      messages: [...data.messages, ...results],
      round: Number.isFinite(Number(data.round)) ? Number(data.round) : step + 1,
      sources,
      provider: data.provider,
    };
  }

  throw new Error('brain_rounds');
}

export async function fetchBrainStatus(): Promise<BrainStatus | null> {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<BrainStatus>;
    return {
      configured: Boolean(data.configured),
      model: String(data.model ?? ''),
      provider: data.provider ? String(data.provider) : undefined,
      search: data.search ? String(data.search) : undefined,
      active: data.active ? String(data.active) : undefined,
      providers: Array.isArray(data.providers) ? data.providers : [],
    };
  } catch {
    return null;
  }
}

/** Bittet das Modell um höchstens zwei dauerhafte Fakten aus einem Gespräch. */
export async function extractMemories(
  question: string,
  answer: string,
): Promise<Array<{ text: string; kind: 'fact' | 'preference' }>> {
  try {
    const response = await fetch('/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return [];
    return data.items
      .filter(
        (item): item is { text: string; kind: 'fact' | 'preference' } =>
          Boolean(item) &&
          typeof (item as { text?: unknown }).text === 'string' &&
          ((item as { kind?: unknown }).kind === 'fact' ||
            (item as { kind?: unknown }).kind === 'preference'),
      )
      .slice(0, 2);
  } catch {
    return [];
  }
}

/** Erzeugt eine kurze Zusammenfassung älterer Beiträge. */
export async function summarizeTurns(turns: BrainTurn[], previous = ''): Promise<string> {
  try {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(previous ? { turns, summary: previous } : { turns }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return '';
    const data = (await response.json()) as { summary?: unknown };
    return typeof data.summary === 'string' ? data.summary.trim().slice(0, 1200) : '';
  } catch {
    return '';
  }
}
