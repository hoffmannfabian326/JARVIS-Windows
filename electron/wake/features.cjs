'use strict';

const FRAME = 1280; // 80 ms @ 16 kHz
const MEL_CONTEXT = 480; // zusätzliche Samples für das Mel-Fenster (wie openWakeWord)
const MEL_MAX = 970;
const FEATURE_MAX = 120;

/**
 * Streaming-Feature-Extraktion wie in openWakeWord:
 *  - melspectrogram.onnx: 1280 Samples -> 8 Mel-Zeilen (32 Bins, x/10+2)
 *  - embedding_model.onnx: 76 Mel-Zeilen -> 96-dim Embedding
 *  - Wake-Modell: letzte 16 Embeddings -> Score
 */
class AudioFeatures {
  constructor(ort, melSession, embeddingSession) {
    this.ort = ort;
    this.melSession = melSession;
    this.embeddingSession = embeddingSession;
    this.raw = [];
    this.mel = Array.from({ length: 76 }, () => new Float32Array(32).fill(1));
    this.features = [];
    this.accumulated = 0;
    this.remainder = new Int16Array(0);
  }

  _bufferRaw(samples) {
    for (let i = 0; i < samples.length; i += 1) this.raw.push(samples[i]);
    if (this.raw.length > 160000) this.raw = this.raw.slice(-160000);
  }

  _melSlice(start, end) {
    const len = this.mel.length;
    const from = start < 0 ? len + start : start;
    const to = end < 0 ? len + end : end;
    return this.mel.slice(Math.max(0, from), Math.min(len, to));
  }

  async _streamMel(nSamples) {
    const take = Math.min(this.raw.length, nSamples + MEL_CONTEXT);
    const input = Float32Array.from(this.raw.slice(-take));
    const result = await this.melSession.run({
      input: new this.ort.Tensor('float32', input, [1, input.length]),
    });
    const output = result[this.melSession.outputNames[0]];
    const frames = output.dims[2];
    const bins = output.dims[3];
    for (let t = 0; t < frames; t += 1) {
      const row = new Float32Array(bins);
      for (let b = 0; b < bins; b += 1) row[b] = output.data[t * bins + b] / 10 + 2;
      this.mel.push(row);
    }
    if (this.mel.length > MEL_MAX) this.mel = this.mel.slice(-MEL_MAX);
  }

  async _embed(window) {
    const data = new Float32Array(76 * 32);
    for (let i = 0; i < 76; i += 1) data.set(window[i], i * 32);
    const result = await this.embeddingSession.run({
      input_1: new this.ort.Tensor('float32', data, [1, 76, 32, 1]),
    });
    const output = result[this.embeddingSession.outputNames[0]];
    this.features.push(Float32Array.from(output.data));
    if (this.features.length > FEATURE_MAX) this.features.shift();
  }

  /** Fügt 16-kHz-Int16-Samples hinzu und verarbeitet alle vollen 80-ms-Frames. */
  async feed(samples) {
    let x = samples;
    if (this.remainder.length > 0) {
      const merged = new Int16Array(this.remainder.length + x.length);
      merged.set(this.remainder, 0);
      merged.set(x, this.remainder.length);
      x = merged;
      this.remainder = new Int16Array(0);
    }

    if (this.accumulated + x.length >= FRAME) {
      const rest = (this.accumulated + x.length) % FRAME;
      if (rest !== 0) {
        this._bufferRaw(x.subarray(0, x.length - rest));
        this.accumulated += x.length - rest;
        this.remainder = x.slice(x.length - rest);
      } else {
        this._bufferRaw(x);
        this.accumulated += x.length;
      }
    } else {
      this.accumulated += x.length;
      this._bufferRaw(x);
    }

    if (this.accumulated < FRAME || this.accumulated % FRAME !== 0) return 0;

    const chunks = this.accumulated / FRAME;
    await this._streamMel(this.accumulated);

    for (let i = chunks - 1; i >= 0; i -= 1) {
      const ndx = i === 0 ? this.mel.length : -8 * i;
      const window = this._melSlice(-76 + ndx, ndx);
      if (window.length === 76) await this._embed(window);
    }

    const processed = this.accumulated;
    this.accumulated = 0;
    return processed;
  }

  /** Letzte `count` Embeddings als Tensor-Daten (count x 96). */
  getFeatures(count) {
    const rows = this.features.slice(-count);
    if (rows.length < count) return null;
    const data = new Float32Array(count * 96);
    for (let i = 0; i < count; i += 1) data.set(rows[i], i * 96);
    return data;
  }
}

module.exports = { AudioFeatures, FRAME };
