/** Textnormalisierung und Weckwort-Erkennung. */

export const normalize = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[.,!?;:„“"'»«()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const WAKE_ALIASES = ['jarvis', 'jervis', 'javis', 'jarwis', 'dscharvis', 'charvis', 'jarvix'];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wakeVariants(wakeWord: string): string[] {
  const cleaned = normalize(wakeWord)
    .split(' ')
    .filter((part) => part && !['hey', 'hi', 'hallo', 'ok', 'okay', 'na'].includes(part))
    .join(' ');
  const variants = new Set<string>(WAKE_ALIASES);
  if (cleaned) variants.add(cleaned);
  return [...variants].map(escapeRegExp);
}

/** Erkennt "Jarvis" inklusive typischer Erkennungsfehler. */
export function containsWake(text: string, wakeWord: string): boolean {
  const norm = normalize(text);
  if (!norm) return false;
  return new RegExp(`\\b(?:${wakeVariants(wakeWord).join('|')})\\b`, 'i').test(norm);
}

/** Entfernt Anrede und Weckwort, liefert den eigentlichen Befehl. */
export function stripWake(text: string, wakeWord: string): string {
  const pattern = new RegExp(
    `^\\s*(?:(?:hey|hi|hallo|ok|okay|na)\\s+)?(?:${wakeVariants(wakeWord).join('|')})\\b[\\s,.!?]*`,
    'i',
  );
  return text.replace(pattern, '').replace(/\s+/g, ' ').trim();
}
