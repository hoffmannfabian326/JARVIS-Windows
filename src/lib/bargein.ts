/**
 * Barge-in: Jarvis soll unterbrochen werden können, während er spricht.
 *
 * Dafür bleibt die Erkennung während der Ausgabe eingeschaltet. Damit die
 * eigene Stimme über Lautsprecher nicht als Unterbrechung zählt, wird der
 * erkannte Text mit dem Satz verglichen, der gerade gesprochen wird: Besteht
 * er nur aus dessen Wörtern, ist es ein Rückkopplungsrest. Ein echter
 * Zwischenruf enthält fast immer ein Wort, das Jarvis gerade nicht sagt.
 *
 * Ein pauschales Stummschalten wäre einfacher, würde aber genau die
 * Unterbrechung verhindern, um die es hier geht.
 */

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Vergleichbare Wörter: kleingeschrieben, ohne Umlaute und Satzzeichen. */
export function spokenWords(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/**
 * Kurze Zurufe, die immer unterbrechen dürfen — auch wenn Jarvis sie zufällig
 * gerade selbst sagt.
 */
const STOP_PHRASE = /^(stopp|stop|halt|ruhe|genug|sei still|hoer auf|hor auf|warte|nein|abbrechen)\b/;

export function isStopPhrase(transcript: string): boolean {
  const words = spokenWords(transcript);
  return Boolean(words.length) && STOP_PHRASE.test(words.join(' '));
}

/**
 * Wahr, wenn der erkannte Text nur aus Wörtern besteht, die Jarvis in diesem
 * Moment selbst spricht. Dann war es die eigene Stimme, keine Unterbrechung.
 */
export function looksLikeOwnVoice(transcript: string, spoken: string): boolean {
  const heard = spokenWords(transcript);
  const said = new Set(spokenWords(spoken));
  if (!heard.length || !said.size) return false;
  return heard.every((word) => said.has(word));
}

/**
 * Entscheidet, ob eine Äußerung während der Ausgabe unterbrechen darf.
 * Zurufe wie „stopp“ immer; sonst nur, wenn sie nicht nach eigener Stimme
 * klingen und mehr als ein Füllsel sind.
 */
export function shouldInterrupt(transcript: string, spoken: string): boolean {
  const heard = spokenWords(transcript);
  if (!heard.length) return false;
  if (isStopPhrase(transcript)) return true;
  if (looksLikeOwnVoice(transcript, spoken)) return false;
  // Ein einzelnes kurzes Wort („und“, „hm“) ist Füllsel oder Rauschen.
  if (heard.length === 1 && heard[0].length < 4) return false;
  return true;
}
