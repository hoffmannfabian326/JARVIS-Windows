import { getDesktop } from './desktop';

export interface VisionResult {
  ok: boolean;
  answer?: string;
  error?: string;
}

export interface VisionOptions {
  /** Wird aufgerufen, sobald das Foto im Speicher liegt — vor dem Senden. */
  onCapture?: (info: { width?: number; height?: number; name?: string }) => void;
}

/**
 * Nimmt ein Bildschirmfoto auf und lässt es vom Bildmodell beschreiben.
 * Das Bild verlässt den Rechner nur auf ausdrücklichen Befehl.
 */
export async function askVision(question: string, options: VisionOptions = {}): Promise<VisionResult> {
  const desktop = getDesktop();
  if (!desktop?.captureScreen) {
    return { ok: false, error: 'Das Bildschirmlesen geht nur in der Desktop-App von Jarvis.' };
  }

  const shot = await desktop.captureScreen();
  if (!shot.ok || !shot.image) {
    return { ok: false, error: shot.error || 'Es kam kein Bildschirmfoto an.' };
  }

  try {
    options.onCapture?.({ width: shot.width, height: shot.height, name: shot.name });
  } catch {
    /* Rückmeldung darf die Aufnahme nicht verhindern */
  }

  try {
    const response = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, image: shot.image }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = (await response.json().catch(() => null)) as { answer?: string; error?: string } | null;

    if (response.status === 501) {
      return {
        ok: false,
        error:
          'Für Bildschirmfragen fehlt ein Bildmodell. Trage in den Zugangsdaten ein Modell mit Bildverständnis ein oder nutze Groq.',
      };
    }
    if (response.status === 503) {
      return {
        ok: false,
        error: 'Für Bildschirmfragen brauche ich ein Sprachmodell. Hinterlege einen API-Key in den Zugangsdaten.',
      };
    }
    if (!response.ok || !data?.answer) {
      return { ok: false, error: 'Ich konnte den Bildschirm gerade nicht auswerten.' };
    }
    return { ok: true, answer: data.answer.trim() };
  } catch {
    return { ok: false, error: 'Die Bildauswertung hat zu lange gedauert oder ist nicht erreichbar.' };
  }
}
