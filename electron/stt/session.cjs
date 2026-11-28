'use strict';

/**
 * Eine einzelne Streaming-Session über einem sherpa-onnx-OnlineRecognizer.
 *
 * Bewusst frei von Electron und nativen Abhängigkeiten: Der Recognizer wird
 * hereingereicht, damit sich Endpoint, Partial-Texte und das Nachspannen der
 * letzten Silben ohne Modell testen lassen.
 */

const SAMPLE_RATE = 16000;
const TAIL_SECONDS = 0.3;
const MAX_CHUNK_SECONDS = 10;

/** Wandelt Int16-PCM (ArrayBuffer, Buffer oder Int16Array) in Float32 um. */
function toFloat32(input) {
  let view;
  if (input instanceof ArrayBuffer) {
    view = new Int16Array(input);
  } else if (input instanceof Int16Array) {
    view = input;
  } else if (ArrayBuffer.isView(input)) {
    const bytes = Math.floor(input.byteLength / 2);
    view = new Int16Array(input.buffer, input.byteOffset, bytes);
  } else {
    return new Float32Array(0);
  }

  const length = Math.min(view.length, SAMPLE_RATE * MAX_CHUNK_SECONDS);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = view[i] / 32768;
  return samples;
}

class SttSession {
  constructor(recognizer, { onPartial, onFinal, onError, sampleRate = SAMPLE_RATE } = {}) {
    this.recognizer = recognizer;
    this.sampleRate = sampleRate;
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.onError = onError;
    this.stream = recognizer.createStream();
    this.active = true;
    this.lastPartial = '';
  }

  /** Nimmt einen Block 16-kHz-Int16-PCM entgegen und liefert Zwischenstände. */
  accept(input) {
    if (!this.active) return;
    try {
      const samples = toFloat32(input);
      if (samples.length === 0) return;
      this.stream.acceptWaveform({ samples, sampleRate: this.sampleRate });
      this._decode();
      const text = this._text();
      if (text && text !== this.lastPartial) {
        this.lastPartial = text;
        this.onPartial?.(text);
      }
      if (!this.recognizer.isEndpoint(this.stream)) return;

      if (text) {
        this.active = false;
        this.lastPartial = '';
        this.onFinal?.(text);
        return;
      }
      // Stille am Anfang ist kein Ergebnis, sondern nur ein Endpoint.
      this.recognizer.reset(this.stream);
      this.lastPartial = '';
    } catch (error) {
      this.active = false;
      this.onError?.(String(error?.message ?? error).slice(0, 240));
    }
  }

  /** Schließt die Aufnahme ab und spannt leise Silben an das Ende. */
  finish() {
    if (!this.active) return;
    this.active = false;
    try {
      const padding = new Float32Array(Math.round(this.sampleRate * TAIL_SECONDS));
      this.stream.acceptWaveform({ samples: padding, sampleRate: this.sampleRate });
      this._decode();
      const text = this._text();
      this.lastPartial = '';
      if (text) this.onFinal?.(text);
    } catch (error) {
      this.onError?.(String(error?.message ?? error).slice(0, 240));
    }
  }

  /** Verwirft die Session ohne Ergebnis. */
  cancel() {
    this.active = false;
    this.lastPartial = '';
  }

  _decode() {
    // Schutz gegen einen Recognizer, der dauerhaft „ready“ meldet.
    for (let guard = 0; guard < 1000 && this.recognizer.isReady(this.stream); guard += 1) {
      this.recognizer.decode(this.stream);
    }
  }

  _text() {
    return String(this.recognizer.getResult(this.stream)?.text ?? '').trim();
  }
}

module.exports = { SttSession, toFloat32, SAMPLE_RATE, TAIL_SECONDS };
