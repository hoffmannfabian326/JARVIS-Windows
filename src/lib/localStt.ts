const TARGET_RATE = 16000;
const BLOCK = 1024;

/**
 * Nimmt den bereits geöffneten Mikrofonstrom der Oberfläche ab und schickt
 * 16-kHz-Int16-Blöcke an den Hauptprozess. Kein Netzwerk, keine Erkennung hier.
 */
export class MicTap {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;

  start(stream: MediaStream, push: (buffer: ArrayBuffer) => void): boolean {
    this.stop();
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;

      // Chromium resampelt die Aufnahme auf die gewünschte Rate. Lehnt das
      // Gerät 16 kHz ab, greift der lineare Fallback unten.
      let ctx: AudioContext;
      try {
        ctx = new Ctor({ sampleRate: TARGET_RATE });
      } catch {
        ctx = new Ctor();
      }
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(BLOCK, 1, 1);
      const gain = ctx.createGain();
      gain.gain.value = 0;

      let phase = 0;
      node.onaudioprocess = (event) => {
        const raw = event.inputBuffer.getChannelData(0);
        const samples =
          ctx.sampleRate === TARGET_RATE ? raw : resample(raw, ctx.sampleRate, phase, (next) => {
            phase = next;
          });
        if (samples.length === 0) return;
        const pcm = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i += 1) {
          const value = Math.max(-1, Math.min(1, samples[i]));
          pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
        }
        push(pcm.buffer);
      };

      source.connect(node);
      node.connect(gain);
      gain.connect(ctx.destination);

      this.ctx = ctx;
      this.source = source;
      this.node = node;
      this.gain = gain;
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  stop(): void {
    if (this.node) {
      this.node.onaudioprocess = null;
      try {
        this.node.disconnect();
      } catch {
        /* bereits getrennt */
      }
    }
    try {
      this.source?.disconnect();
      this.gain?.disconnect();
    } catch {
      /* bereits getrennt */
    }
    if (this.ctx) void this.ctx.close().catch(() => {});
    this.node = null;
    this.source = null;
    this.gain = null;
    this.ctx = null;
  }
}

/** Einfache lineare Umsetzung mit Phasenüberlauf zwischen den Blöcken. */
function resample(
  input: Float32Array,
  fromRate: number,
  phase: number,
  setPhase: (next: number) => void,
): Float32Array {
  const ratio = fromRate / TARGET_RATE;
  const length = Math.max(0, Math.floor((input.length - phase) / ratio));
  const out = new Float32Array(length);
  let cursor = phase;
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(cursor);
    const next = Math.min(index + 1, input.length - 1);
    const mix = cursor - index;
    out[i] = input[index] * (1 - mix) + input[next] * mix;
    cursor += ratio;
  }
  setPhase(cursor - input.length);
  return out;
}
