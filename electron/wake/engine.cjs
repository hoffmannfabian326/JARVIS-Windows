'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { AudioFeatures, FRAME } = require('./features.cjs');

const MODEL_FILES = {
  mel: 'melspectrogram.onnx',
  embedding: 'embedding_model.onnx',
  wake: 'hey_jarvis_v0.1.onnx',
};

const ORT_GLUE = 'ort-wasm-simd-threaded.mjs';
const ORT_WASM = 'ort-wasm-simd-threaded.wasm';

/**
 * onnxruntime-web liegt im App-Ordner (asar aus, also normale Dateien).
 * Die Kandidaten decken Entwicklung, Installation und Portable ab.
 */
function ortDistCandidates() {
  const roots = [path.join(__dirname, '..', '..')];
  if (process.resourcesPath) roots.push(path.join(process.resourcesPath, 'app'));
  try {
    const { app } = require('electron');
    if (app?.getAppPath) roots.push(app.getAppPath());
  } catch {
    /* außerhalb von Electron (Selbsttest) */
  }
  return roots.map((root) => path.join(root, 'node_modules', 'onnxruntime-web', 'dist'));
}

/**
 * Lokale Weckwort-Erkennung im Main-Prozess (kein Netz, kein Google).
 * Modelle: openWakeWord (Apache-2.0), "hey jarvis" auf Englisch.
 */
class WakeEngine {
  constructor({ modelsDir, threshold = 0.5, debounceSeconds = 2, refractoryMs = 2500, onWake, onScore }) {
    this.modelsDir = modelsDir;
    this.threshold = threshold;
    this.debounceFrames = Math.max(1, Math.ceil(debounceSeconds / (FRAME / 16000)));
    this.refractoryMs = refractoryMs;
    this.onWake = onWake;
    this.onScore = onScore;

    this.available = false;
    this.reason = 'nicht initialisiert';
    this.listening = false;
    this.lastWakeAt = 0;
    this.scores = [];
    this.pending = new Int16Array(0);
    this.chain = Promise.resolve();
    this.ort = null;
    this.features = null;
    this.wakeSession = null;
    this.busy = false;
  }

  status() {
    return {
      available: this.available,
      listening: this.listening,
      model: 'hey jarvis (offline)',
      reason: this.reason,
      threshold: this.threshold,
    };
  }

  async init() {
    const missing = Object.values(MODEL_FILES).filter(
      (file) => !fs.existsSync(path.join(this.modelsDir, file)),
    );
    if (missing.length > 0) {
      this.reason = `Modelle fehlen: ${missing.join(', ')}`;
      return false;
    }

    const dist = ortDistCandidates().find(
      (dir) => fs.existsSync(path.join(dir, ORT_GLUE)) && fs.existsSync(path.join(dir, ORT_WASM)),
    );
    if (!dist) {
      this.reason = 'onnxruntime-web fehlt im App-Ordner (Node-Paket unvollständig) — bitte neu installieren.';
      return false;
    }

    try {
      const ort = require('onnxruntime-web');
      // Ein Thread vermeidet SharedArrayBuffer-Anforderungen in Electron.
      ort.env.wasm.numThreads = 1;
      // Wichtig unter Windows: ein bloßer Pfad wie C:\... wird beim dynamischen
      // Import als URL-Schema „c:“ gelesen (ERR_UNSUPPORTED_ESM_URL_SCHEME).
      // Deshalb die mjs-Datei als echte file:-URL und das WASM-Binary direkt,
      // damit kein zweiter Dateizugriff über fetch nötig ist.
      ort.env.wasm.wasmPaths = { mjs: pathToFileURL(path.join(dist, ORT_GLUE)).href };
      ort.env.wasm.wasmBinary = fs.readFileSync(path.join(dist, ORT_WASM));
      this.ort = ort;

      const options = { executionProviders: ['wasm'] };
      const [mel, embedding, wake] = await Promise.all([
        ort.InferenceSession.create(path.join(this.modelsDir, MODEL_FILES.mel), options),
        ort.InferenceSession.create(path.join(this.modelsDir, MODEL_FILES.embedding), options),
        ort.InferenceSession.create(path.join(this.modelsDir, MODEL_FILES.wake), options),
      ]);

      this.features = new AudioFeatures(ort, mel, embedding);
      this.wakeSession = wake;
      this.available = true;
      this.listening = true;
      this.reason = '';
      return true;
    } catch (error) {
      this.available = false;
      this.reason = `Ladefehler: ${String(error?.message ?? error).slice(0, 200)}`;
      return false;
    }
  }

  /** Audio in 16 kHz Int16; beliebig große Blöcke erlaubt.
   *  Blöcke werden serialisiert, damit während einer laufenden Inferenz
   *  keine Audiodaten verloren gehen. */
  push(samples) {
    if (!this.available || !this.listening) return Promise.resolve(0);
    this.chain = (this.chain ?? Promise.resolve()).then(() => this._process(samples));
    return this.chain;
  }

  async _process(samples) {
    const merged = new Int16Array(this.pending.length + samples.length);
    merged.set(this.pending, 0);
    merged.set(samples, this.pending.length);

    let offset = 0;
    let detected = 0;
    this.busy = true;
    try {
      while (merged.length - offset >= FRAME) {
        const chunk = merged.subarray(offset, offset + FRAME);
        offset += FRAME;
        const score = await this._predict(chunk);
        if (score >= this.threshold) {
          const now = Date.now();
          if (now - this.lastWakeAt >= this.refractoryMs) {
            this.lastWakeAt = now;
            detected = score;
            this.onWake?.({ score, at: now });
          }
        }
      }
    } catch (error) {
      this.reason = `Erkennungsfehler: ${String(error?.message ?? error).slice(0, 160)}`;
    } finally {
      this.busy = false;
    }

    this.pending = merged.slice(offset);
    if (this.pending.length > FRAME) this.pending = this.pending.slice(-FRAME);
    return detected;
  }

  async _predict(chunk) {
    await this.features.feed(chunk);
    const data = this.features.getFeatures(16);
    if (!data) return 0;

    const result = await this.wakeSession.run({
      'x.1': new this.ort.Tensor('float32', data, [1, 16, 96]),
    });
    let score = result[this.wakeSession.outputNames[0]].data[0];

    // Wie openWakeWord: erste fünf Frames unterdrücken, dann Debounce.
    const history = this.scores.length;
    if (history < 5) score = 0;
    else if (score >= this.threshold && this.scores.slice(-this.debounceFrames).some((s) => s >= this.threshold)) {
      score = 0;
    }

    this.scores.push(result[this.wakeSession.outputNames[0]].data[0]);
    if (this.scores.length > 30) this.scores.shift();
    this.onScore?.(score);
    return score;
  }

  pause() {
    this.listening = false;
  }

  resume() {
    if (this.available) this.listening = true;
  }

  dispose() {
    this.listening = false;
    this.features = null;
    this.wakeSession = null;
    this.available = false;
  }
}

module.exports = { WakeEngine };
