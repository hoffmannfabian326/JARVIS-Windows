/**
 * Lokales Langzeitgedächtnis mit Vektorindex.
 *
 * Die Einbettung ist bewusst rein lokal und deterministisch: Wörter (leicht
 * gestemmt), Wortpaare und Zeichen-4-Gramme werden per Feature-Hashing in
 * einen 384-dimensionalen Vektor abgebildet und L2-normalisiert. Das ist keine
 * neuronale Einbettung, aber offline, schnell und ohne Modell-Download.
 */

export type MemoryKind = 'fact' | 'preference';
export type MemoryStatus = 'active' | 'pending';

export interface MemoryItem {
  id: string;
  text: string;
  kind: MemoryKind;
  status?: MemoryStatus;
  createdAt: number;
  updatedAt: number;
  hits: number;
}

export interface MemoryFile {
  version: number;
  items: MemoryItem[];
}

export const MEMORY_VERSION = 2;
export const MEMORY_STORAGE_KEY = 'jarvis.memory.v2';

const DIM = 384;
const MAX_ITEMS = 500;
const DUPLICATE_SCORE = 0.9;

const STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'und', 'oder', 'aber', 'auch', 'als', 'auf', 'aus', 'bei', 'bin', 'bist', 'ist',
  'sind', 'war', 'waren', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich',
  'dich', 'mir', 'dir', 'sich', 'mein', 'meine', 'meinen', 'meinem', 'dein',
  'deine', 'mit', 'von', 'zu', 'zum', 'zur', 'im', 'in', 'am', 'an', 'fuer',
  'für', 'ueber', 'über', 'unter', 'dass', 'wie', 'was', 'wer', 'wo', 'wann',
  'warum', 'weil', 'nicht', 'kein', 'keine', 'noch', 'schon', 'immer', 'sehr',
  'so', 'dann', 'doch', 'mal', 'bitte', 'gerne', 'gern', 'habe', 'hab', 'hat',
  'haben', 'haette', 'hätte', 'werde', 'wird', 'werden', 'kann', 'koennen',
  'können', 'muss', 'soll', 'will', 'the', 'and', 'for', 'with', 'that',
]);

/** Kleine Synonymtabelle für häufige Alltagsbegriffe (Verbessert Paraphrasen). */
const SYNONYMS: Record<string, string> = {
  auto: 'fahrzeug',
  wagen: 'fahrzeug',
  job: 'arbeit',
  beruf: 'arbeit',
  wohnung: 'zuhause',
  haus: 'zuhause',
  essen: 'gericht',
  speise: 'gericht',
  getraenk: 'trinken',
  getränk: 'trinken',
  kaffee: 'kaffee',
  stimme: 'stimme',
  musik: 'musik',
  hund: 'hund',
  katze: 'katze',
  partnerin: 'partner',
  partner: 'partner',
  freundin: 'freund',
  film: 'film',
  serie: 'serie',
};

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(word: string): string {
  if (word.length <= 5) return word;
  return word.replace(/(ungen|ung|lich|isch|heit|keit|chen|en|er|em|es|e|s|n|t)$/, '') || word;
}

function tokens(text: string): string[] {
  const words = normalize(text)
    .split(' ')
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
  const result: string[] = [];

  for (const word of words) {
    result.push(SYNONYMS[word] ?? stem(word));
    // Komposita zusätzlich über ihre ungestemmte Endung abbilden.
    if (word.length >= 9) result.push(word.slice(-5));
  }

  return result;
}

function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function addFeature(vector: Float64Array, key: string, weight: number): void {
  const h = hash(key);
  const index = h % DIM;
  const sign = (hash(`#${key}`) & 1) === 0 ? 1 : -1;
  vector[index] += sign * weight;
}

/** Erzeugt eine L2-normalisierte Einbettung des Textes. */
export function embed(text: string): number[] {
  const vector = new Float64Array(DIM);
  const words = tokens(text);
  const compact = normalize(text).replace(/ /g, '');

  words.forEach((word, index) => {
    addFeature(vector, `w:${word}`, 2);
    if (index + 1 < words.length) addFeature(vector, `b:${word}_${words[index + 1]}`, 0.8);
    // Deutsche Komposita: „Lieblingsfarbe“ teilt sich die Endung mit „Farbe“.
    if (word.length >= 9) addFeature(vector, `t:${word.slice(-5)}`, 1);
  });

  for (let i = 0; i + 4 <= compact.length; i += 1) {
    addFeature(vector, `c:${compact.slice(i, i + 4)}`, 0.22);
  }

  let norm = 0;
  for (let i = 0; i < DIM; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < DIM; i += 1) vector[i] /= norm;
  }

  return Array.from(vector);
}

export function cosine(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) sum += a[i] * b[i];
  return sum;
}

function makeId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim();
}

function classify(text: string): MemoryKind {
  const lower = normalize(text);
  if (
    /^(ich\s+)?(mag|liebe|hasse|bevorzuge|mochte|moechte|brauche|esse|trinke)\b/.test(
      lower,
    ) ||
    /\bam liebsten\b/.test(lower) ||
    /\b(mein|meine) (lieblings|lieblings-)/.test(lower)
  ) {
    return 'preference';
  }
  return 'fact';
}

export interface AddResult {
  item: MemoryItem;
  duplicate: boolean;
}

export class MemoryStore {
  items: MemoryItem[] = [];
  private vectors = new Map<string, number[]>();

  constructor(items: MemoryItem[] = []) {
    this.items = items.slice(0, MAX_ITEMS);
    this.items.forEach((item) => this.vectors.set(item.id, embed(item.text)));
  }

  static fromFile(raw: unknown): MemoryStore {
    if (!raw || typeof raw !== 'object') return new MemoryStore();
    const data = raw as Partial<MemoryFile>;
    if (!Array.isArray(data.items)) return new MemoryStore();

    const items: MemoryItem[] = [];
    for (const entry of data.items) {
      if (!entry || typeof entry.text !== 'string') continue;
      const text = cleanText(entry.text).slice(0, 400);
      if (text.length < 2) continue;
      const kind: MemoryKind = entry.kind === 'preference' ? 'preference' : 'fact';
      items.push({
        id: typeof entry.id === 'string' ? entry.id : makeId(),
        text,
        kind,
        status: entry.status === 'pending' ? 'pending' : 'active',
        createdAt: Number(entry.createdAt) || Date.now(),
        updatedAt: Number(entry.updatedAt) || Number(entry.createdAt) || Date.now(),
        hits: Math.max(0, Number(entry.hits) || 0),
      });
      if (items.length >= MAX_ITEMS) break;
    }
    return new MemoryStore(items);
  }

  add(text: string, kind?: MemoryKind, status: MemoryStatus = 'active'): AddResult {
    const clean = cleanText(text).slice(0, 400);
    if (!clean) throw new Error('leerer Eintrag');
    const resolvedKind = kind ?? classify(clean);
    const vector = embed(clean);

    let best: MemoryItem | null = null;
    let bestScore = 0;
    for (const item of this.items) {
      const score = cosine(vector, this.vectors.get(item.id) ?? []);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    if (best && bestScore >= DUPLICATE_SCORE) {
      best.updatedAt = Date.now();
      best.hits += 1;
      return { item: best, duplicate: true };
    }

    const item: MemoryItem = {
      id: makeId(),
      text: clean,
      kind: resolvedKind,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hits: 0,
    };
    this.items.push(item);
    this.vectors.set(item.id, vector);
    if (this.items.length > MAX_ITEMS) {
      const removed = this.items.shift();
      if (removed) this.vectors.delete(removed.id);
    }
    return { item, duplicate: false };
  }

  search(query: string, limit = 5, minScore = 0.06): Array<{ item: MemoryItem; score: number }> {
    const vector = embed(query);
    const scored = this.items
      .filter((item) => item.status !== 'pending')
      .map((item) => ({ item, score: cosine(vector, this.vectors.get(item.id) ?? []) }))
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    scored.forEach((entry) => {
      entry.item.hits += 1;
    });
    return scored;
  }

  recent(limit = 6): MemoryItem[] {
    return this.items
      .filter((item) => item.status !== 'pending')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  pending(limit = 10): MemoryItem[] {
    return this.items
      .filter((item) => item.status === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  approve(id: string): boolean {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return false;
    item.status = 'active';
    item.updatedAt = Date.now();
    return true;
  }

  reject(id: string): boolean {
    return this.forgetById(id);
  }

  forget(query: string): number {
    const [best] = this.search(query, 1, 0.35);
    if (!best) return 0;
    this.items = this.items.filter((item) => item.id !== best.item.id);
    this.vectors.delete(best.item.id);
    return 1;
  }

  forgetById(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    this.vectors.delete(id);
    return this.items.length < before;
  }

  clear(): void {
    this.items = [];
    this.vectors.clear();
  }

  get size(): number {
    return this.items.filter((item) => item.status !== 'pending').length;
  }

  toFile(): MemoryFile {
    return { version: MEMORY_VERSION, items: this.items };
  }
}

export interface MemoryBridge {
  load?: () => Promise<unknown>;
  save?: (file: MemoryFile) => Promise<unknown>;
}

/** Lädt das Gedächtnis aus der Desktop-Datei oder aus localStorage (Web). */
export async function loadMemoryStore(bridge?: MemoryBridge): Promise<MemoryStore> {
  if (bridge?.load) {
    try {
      const data = await bridge.load();
      if (data) return MemoryStore.fromFile(data);
    } catch {
      /* Datei nicht lesbar: Fallback unten */
    }
  }
  try {
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (raw) return MemoryStore.fromFile(JSON.parse(raw));
  } catch {
    /* kein Speicher verfügbar */
  }
  return new MemoryStore();
}

export async function saveMemoryStore(store: MemoryStore, bridge?: MemoryBridge): Promise<void> {
  const file = store.toFile();
  if (bridge?.save) {
    try {
      await bridge.save(file);
      return;
    } catch {
      /* Fallback: localStorage */
    }
  }
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(file));
  } catch {
    /* Speicher voll oder gesperrt */
  }
}

export type MemoryIntent =
  | { action: 'add'; text: string; kind: MemoryKind }
  | { action: 'list' }
  | { action: 'search'; query: string }
  | { action: 'forget'; query: string }
  | { action: 'clear' };

/** Erkennt deutsche Gedächtnisbefehle, bevor die allgemeinen Intents greifen. */
export function parseMemoryIntent(raw: string): MemoryIntent | null {
  const text = raw.trim();
  if (!text) return null;

  if (/^(vergiss alles|vergiss all das|gedächtnis (leeren|löschen|zurücksetzen)|gedaechtnis (leeren|loeschen)|memory (reset|clear))\b/.test(text.toLowerCase())) {
    return { action: 'clear' };
  }

  const forget = text.match(
    /^(?:vergiss|vergesse|entferne|lösch(?:e)?)[\s,]+(?:dass\s+|den eintrag\s+|die erinnerung\s+|aus dem gedächtnis\s+)?(.{3,})$/i,
  );
  if (forget && !/(notiz|liste)\b/i.test(forget[1])) {
    return { action: 'forget', query: forget[1].replace(/[.!?]+$/, '').trim() };
  }

  if (
    /(was (?:weißt|weisst) du über mich|was (?:weißt|weisst) du von mir|was hast du dir gemerkt|mein gedächtnis|meine erinnerungen|woran erinnerst du dich|was hast du gespeichert|was weisst du ueber mich)/i.test(
      text,
    )
  ) {
    return { action: 'list' };
  }

  const search = text.match(/^was (?:weißt|weisst) du (?:über|ueber|von)\s+(.{2,})$/i);
  if (search) {
    return { action: 'search', query: search[1].replace(/[.!?]+$/, '').trim() };
  }

  const add = text.match(
    /^(?:merk(?:e)?\s+dir|merk(?:e)?|behalte(?: dir)?|speicher(?:e)?(?: dir)?|präg(?:e)?(?: dir)?\s+ein|notier(?:e)?\s+dir)\b[\s,:]*(.{3,})$/i,
  );
  if (add) {
    const content = cleanText(add[1].replace(/^(?:das|dass)\b[\s,:]*/i, ''));
    if (content.length >= 2) {
      return { action: 'add', text: content, kind: classify(content) };
    }
  }

  return null;
}
