const fold = (value: string): string =>
  value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');

const NUM: Record<string, number> = {
  null: 0,
  zero: 0,
  eins: 1,
  ein: 1,
  eine: 1,
  einen: 1,
  einem: 1,
  einer: 1,
  zwei: 2,
  zwo: 2,
  drei: 3,
  vier: 4,
  fuenf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwoelf: 12,
  dreizehn: 13,
  vierzehn: 14,
  fuenfzehn: 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
  zwanzig: 20,
  dreissig: 30,
  vierzig: 40,
  fuenfzig: 50,
  sechzig: 60,
  siebzig: 70,
  achtzig: 80,
  neunzig: 90,
  hundert: 100,
  tausend: 1000,
  halb: 0.5,
  halbe: 0.5,
  halben: 0.5,
};

/** Parst eine einzelne Zahl (Ziffern oder deutsches Zahlwort). */
export function parseNumberToken(token: string): number | null {
  const raw = fold(token).replace(/[^a-z0-9]/g, '');
  if (!raw) return null;
  if (/^\d+([.,]\d+)?$/.test(token.trim())) {
    return Number(token.trim().replace(',', '.'));
  }
  if (raw in NUM) return NUM[raw];

  const parts = raw.split('und');
  if (parts.length === 2) {
    const unit = NUM[parts[0]];
    const tens = NUM[parts[1]];
    if (unit != null && tens != null && tens >= 20) return tens + unit;
  }

  if (raw.endsWith('hundert')) {
    const rest = raw.slice(0, -7);
    const base = rest ? parseNumberToken(rest) : 1;
    if (base != null) return base * 100;
  }
  if (raw.endsWith('tausend')) {
    const rest = raw.slice(0, -8);
    const base = rest ? parseNumberToken(rest) : 1;
    if (base != null) return base * 1000;
  }
  return null;
}

export interface ParsedDuration {
  ms: number;
  label: string;
}

const UNIT_MS: Record<string, number> = {
  sekunde: 1000,
  sekunden: 1000,
  sek: 1000,
  min: 60000,
  minute: 60000,
  minuten: 60000,
  stunde: 3600000,
  stunden: 3600000,
  std: 3600000,
  tag: 86400000,
  tage: 86400000,
  tagen: 86400000,
};

/** Findet Zeitangaben wie "10 minuten", "eine halbe stunde", "1 std 30 min". */
export function parseDuration(text: string): ParsedDuration | null {
  const normalized = fold(text).replace(/\s+/g, ' ');
  const re =
    /(\d+(?:[.,]\d+)?|halb(?:e|en)?|[a-z]+)\s*(sekunden?|sek|minuten?|min|stunden?|std|tage?n?)\b/g;
  let total = 0;
  let matched = false;
  let labelParts: string[] = [];

  for (const match of normalized.matchAll(re)) {
    const amountRaw = match[1];
    const unitRaw = match[2];
    const unit = UNIT_MS[unitRaw] ?? null;
    if (!unit) continue;
    let amount: number | null;
    if (amountRaw === 'halb' || amountRaw === 'halbe' || amountRaw === 'halben') {
      amount = 0.5;
    } else {
      amount = parseNumberToken(amountRaw);
    }
    if (amount == null || amount <= 0) continue;
    matched = true;
    total += amount * unit;
    const unitLabel =
      unit === 3600000
        ? amount === 1
          ? 'Stunde'
          : 'Stunden'
        : unit === 60000
          ? amount === 1
            ? 'Minute'
            : 'Minuten'
          : unit === 1000
            ? amount === 1
              ? 'Sekunde'
              : 'Sekunden'
            : amount === 1
              ? 'Tag'
              : 'Tage';
    labelParts.push(`${amount % 1 === 0 ? amount : '0,5'} ${unitLabel}`);
  }

  if (!matched || total <= 0) return null;
  return { ms: total, label: labelParts.join(' und ') };
}

export const round1 = (value: number): number => Math.round(value * 10) / 10;
