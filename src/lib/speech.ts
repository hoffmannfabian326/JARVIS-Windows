type RecognitionCtor = new () => any;

/** Kurze deutsche Beschreibung eines Erkennungsfehlers für die Oberfläche. */
export function describeRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Zugriff verweigert';
    case 'unsupported':
      return 'API nicht verfügbar';
    case 'network':
      return 'Dienst nicht erreichbar';
    case 'audio-capture':
      return 'Kein Mikrofon';
    case 'language-not-supported':
      return 'Sprache nicht unterstützt';
    default:
      return code;
  }
}

export function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) ?? null;
}

/**
 * Nur im Browser nutzbar. In der Electron-Hülle gibt es das Objekt zwar,
 * aber keinen Dienst dahinter: Chromium überträgt Sprache an Google, und
 * dafür fehlen der Desktop-App die Schlüssel. Jeder Start endet dort mit
 * dem Fehler „network“. In der App übernehmen deshalb die lokale Engine
 * (sherpa-onnx) bzw. die Windows-Spracherkennung (SAPI).
 */
export const recognitionSupported = (): boolean => {
  if (typeof window === 'undefined') return false;
  if ((window as any).jarvisDesktop) return false;
  return getRecognitionCtor() !== null;
};

export interface SpeechEngineHandlers {
  lang: string;
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onError: (code: string) => void;
  onActiveChange: (active: boolean) => void;
}

/**
 * Kapselt die Web Speech API: kontinuierliches Zuhören und automatischer
 * Neustart (Chrome beendet die Erkennung nach Sprechpausen).
 *
 * Die Erkennung läuft auch während Jarvis spricht weiter — nur so lässt sich
 * eine Antwort unterbrechen (Barge-in). Ob ein erkannter Satz die eigene
 * Stimme war, entscheidet bargein.ts über den Textvergleich.
 */
export class SpeechEngine {
  private recognition: any = null;
  private timer: number | null = null;
  private active = false;
  private networkFailures = 0;
  private handlers: SpeechEngineHandlers;

  constructor(handlers: SpeechEngineHandlers) {
    this.handlers = handlers;
  }

  get isActive(): boolean {
    return this.active;
  }

  setLang(lang: string): void {
    if (this.handlers.lang === lang) return;
    this.handlers.lang = lang;
    if (this.active) this.schedule(120);
  }

  start(): void {
    if (!getRecognitionCtor()) {
      this.handlers.onError('unsupported');
      return;
    }
    if (this.active) return;
    this.active = true;
    this.networkFailures = 0;
    this.handlers.onActiveChange(true);
    this.schedule(0);
  }

  stop(): void {
    this.active = false;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.teardown();
    this.handlers.onActiveChange(false);
  }

  private teardown(): void {
    const rec = this.recognition;
    this.recognition = null;
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onstart = null;
    try {
      rec.abort();
    } catch {
      /* Erkennung war bereits beendet */
    }
  }

  private schedule(delay: number): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.launch();
    }, delay);
  }

  private launch(): void {
    if (!this.active) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    this.teardown();

    let rec: any;
    try {
      rec = new Ctor();
    } catch {
      this.schedule(1500);
      return;
    }

    rec.lang = this.handlers.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      this.networkFailures = 0;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result[0]?.transcript ?? '').trim();
        if (!text) continue;
        if (result.isFinal) {
          this.handlers.onInterim('');
          this.handlers.onFinal(text);
        } else {
          interim += ` ${text}`;
        }
      }
      if (interim.trim()) this.handlers.onInterim(interim.trim());
    };

    rec.onerror = (event: any) => {
      const code = String(event?.error ?? 'unknown');
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.active = false;
        this.handlers.onError(code);
        this.handlers.onActiveChange(false);
        return;
      }
      if (code === 'network') {
        this.networkFailures += 1;
        this.handlers.onError(code);
        return;
      }
      if (code !== 'no-speech' && code !== 'aborted') {
        this.handlers.onError(code);
      }
    };

    rec.onend = () => {
      if (!this.active) return;
      const delay = this.networkFailures > 0 ? 2000 : 250;
      this.schedule(delay);
    };

    try {
      rec.start();
      this.recognition = rec;
    } catch {
      this.schedule(600);
    }
  }
}
