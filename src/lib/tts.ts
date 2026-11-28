export interface SpeakOptions {
  rate: number;
  volume: number;
  engine?: string;
}

export interface NeuralSynthesis {
  ok: boolean;
  audio?: string;
  sampleRate?: number;
  error?: string;
}

export type NeuralSynth = (
  text: string,
  options?: { lengthScale?: number; engine?: string },
) => Promise<NeuralSynthesis>;

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Satzweise Zerlegung: Jeder Satz wird einzeln synthetisiert und abgespielt,
 * damit Jarvis schon mit dem ersten Satz beginnt, während der Rest entsteht.
 */
function splitForSpeech(text: string): string[] {
  const sentences = text.match(/[^.!?…\n]+[.!?…]*/g) ?? [text];
  const parts: string[] = [];
  let carry = '';

  for (const sentence of sentences) {
    let current = sentence.trim();
    if (!current) continue;
    if (carry) {
      current = `${carry} ${current}`;
      carry = '';
    }
    // Kurze Fragmente („z.“, „B.“) an den nächsten Satz hängen.
    if (current.length < 15) {
      carry = current;
      continue;
    }
    parts.push(current);
  }

  if (carry) {
    if (parts.length) parts[parts.length - 1] = `${parts[parts.length - 1]} ${carry}`;
    else parts.push(carry);
  }

  return parts.length ? parts : [text];
}

/**
 * Sprachausgabe ausschließlich über Jarvis' eigene Stimmen: Piper lokal oder
 * ElevenLabs aus der Cloud. Die Windows-/Browser-Standardstimme wird bewusst
 * nicht mehr benutzt — fällt die neuronale Stimme aus, bleibt es still, statt
 * mit einer fremden Stimme weiterzusprechen.
 */
export class Speaker {
  private bridge?: NeuralSynth;
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;

  constructor(bridge?: NeuralSynth) {
    this.bridge = bridge;
  }

  /** Ohne Brücke zur Desktop-App gibt es keine Stimme. */
  get available(): boolean {
    return typeof this.bridge === 'function';
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    if (!text.trim() || !this.bridge) return;

    // Ein Token pro Äußerung: cancel() erhöht es, der Ablauf prüft es.
    // Eine neue Äußerung übernimmt sofort, statt die alte zu überlagern.
    const generation = ++this.generation;
    this.stopPlayback();
    const sentences = splitForSpeech(text);
    let pending: Promise<ArrayBuffer | null> | null = null;

    for (let i = 0; i < sentences.length; i += 1) {
      if (generation !== this.generation) return;

      const audio = await (pending ?? this.fetchWav(sentences[i], options, generation));
      pending = null;
      if (generation !== this.generation) return;
      // Kein Rückfall auf eine Systemstimme: lieber stumm als fremde Stimme.
      if (!audio) return;

      if (i + 1 < sentences.length) pending = this.fetchWav(sentences[i + 1], options, generation);
      await this.playWav(audio, options.volume, generation);
    }
  }

  private async fetchWav(
    text: string,
    options: SpeakOptions,
    generation: number,
  ): Promise<ArrayBuffer | null> {
    if (!this.bridge) return null;
    try {
      const rate = Math.min(2, Math.max(0.5, options.rate));
      const result = await this.bridge(text, {
        lengthScale: Math.min(1.6, Math.max(0.6, 1 / rate)),
        engine: options.engine,
      });
      if (!result.ok || !result.audio || generation !== this.generation) return null;
      return base64ToBuffer(result.audio);
    } catch {
      return null;
    }
  }

  private async playWav(bytes: ArrayBuffer, volume: number, generation: number): Promise<void> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx ??= new Ctor();
    const ctx = this.ctx;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    // Ohne laufenden Kontext würde onended nie feuern und speak() ewig hängen.
    if (ctx.state !== 'running' || generation !== this.generation) return;

    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(bytes);
    } catch {
      return;
    }
    if (generation !== this.generation) return;

    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, volume));
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);

      const finish = () => {
        if (this.source === source) this.source = null;
        resolve();
      };
      source.onended = finish;
      this.source = source;

      try {
        source.start();
      } catch {
        finish();
      }
    });
  }

  cancel(): void {
    this.generation += 1;
    this.stopPlayback();
  }

  private stopPlayback(): void {
    try {
      this.source?.stop();
    } catch {
      /* bereits beendet */
    }
    this.source = null;
  }
}
