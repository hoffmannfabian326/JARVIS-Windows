/**
 * Zerlegt einen Textstrom in fertige Sätze. Die Sprachausgabe bekommt dadurch
 * den ersten Satz, sobald er vollständig ist, statt auf die ganze Antwort zu
 * warten.
 */

const ABBREVIATIONS = new Set([
  'z',
  'b',
  'd',
  'h',
  'u',
  'a',
  'ca',
  'bzw',
  'dr',
  'prof',
  'nr',
  'abs',
  'art',
  'vgl',
  'tel',
  'str',
  'min',
  'max',
  'usw',
  'etc',
  'evtl',
  'ggf',
  'inkl',
  'exkl',
  'sog',
]);

const MONTHS = new Set([
  'januar',
  'februar',
  'märz',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
]);

const TERMINATORS = '.!?…';
const CLOSERS = '"\u2019\u2018\u201c\u201d\u00bb\u00ab)]';

export class SentenceStream {
  private buffer = '';

  /** Nimmt ein Textstück auf und gibt alle jetzt vollständigen Sätze zurück. */
  push(chunk: string): string[] {
    if (!chunk) return [];
    this.buffer += chunk;
    return this.extract(false);
  }

  /** Gibt den Rest aus, wenn der Strom endet. */
  flush(): string[] {
    return this.extract(true);
  }

  private extract(final: boolean): string[] {
    const sentences: string[] = [];

    while (this.buffer) {
      const cut = this.findEnd(this.buffer, final);
      if (cut <= 0) break;
      const sentence = this.clean(this.buffer.slice(0, cut));
      this.buffer = this.buffer.slice(cut);
      if (sentence) sentences.push(sentence);
    }

    this.buffer = this.buffer.replace(/^\s+/, '');

    if (final) {
      const rest = this.clean(this.buffer);
      this.buffer = '';
      if (rest) sentences.push(rest);
    } else {
      const long = this.splitLong(this.buffer);
      if (long) {
        sentences.push(long.sentence);
        this.buffer = long.rest;
      }
    }

    return sentences;
  }

  /** Position direkt hinter dem ersten echten Satzende, sonst 0. */
  private findEnd(text: string, final: boolean): number {
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (char === '\n') return index + 1;
      if (!TERMINATORS.includes(char)) continue;

      let end = index + 1;
      while (end < text.length && TERMINATORS.includes(text[end])) end += 1;

      let after = end;
      while (after < text.length && CLOSERS.includes(text[after])) after += 1;

      if (after < text.length && !/\s/.test(text[after])) {
        index = end - 1;
        continue;
      }

      // Am Pufferrand ist noch offen, ob das Satzende schon komplett ist.
      if (after >= text.length && !final) return 0;

      if (this.isFalseEnd(text, index, end)) {
        index = end - 1;
        continue;
      }

      return after;
    }

    return 0;
  }

  private isFalseEnd(text: string, start: number, end: number): boolean {
    const run = text.slice(start, end);
    if (run.length > 1) return false; // "..." oder "?!" beenden den Satz
    if (run !== '.') return false;

    const before = text.slice(Math.max(0, start - 12), start);
    const word = /([A-Za-zÄÖÜäöüß]+)$/.exec(before)?.[1]?.toLowerCase() ?? '';

    if (word.length === 1) return true;
    if (word && ABBREVIATIONS.has(word)) return true;

    // Datum wie "1. Januar" nicht auseinanderreißen.
    const numeric = /(\d{1,2})$/.exec(before)?.[1] ?? '';
    if (numeric) {
      const next = /^\s+([A-Za-zÄÖÜäöüß]+)/.exec(text.slice(end))?.[1]?.toLowerCase() ?? '';
      if (MONTHS.has(next)) return true;
    }

    return false;
  }

  /** Sehr lange Absätze ohne Satzzeichen an einer natürlichen Grenze teilen. */
  private splitLong(text: string): { sentence: string; rest: string } | null {
    const max = 240;
    if (text.length <= max) return null;

    const window = text.slice(0, max);
    const candidates = [
      window.lastIndexOf(', '),
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
      window.lastIndexOf(' – '),
      window.lastIndexOf(' '),
    ].filter((position) => position >= 80);

    if (candidates.length === 0) return null;

    const cut = Math.max(...candidates);
    const sentence = this.clean(text.slice(0, cut + 1));
    if (!sentence) return null;

    return { sentence, rest: text.slice(cut + 1) };
  }

  private clean(value: string): string {
    return value
      .replace(/\s+/g, ' ')
      .replace(/^[\s\-–—*•>#]+/, '')
      .trim();
  }
}
