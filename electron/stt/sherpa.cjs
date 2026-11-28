'use strict';

/**
 * Lokale Streaming-Spracherkennung über sherpa-onnx.
 *
 * Das Modell (deutsches Streaming-Zipformer von Kroko, ~55 MB) liegt bewusst
 * außerhalb des Installers im Benutzerdatenordner. Fehlt Modell oder Addon,
 * bleibt alles beim bisherigen SAPI-Weg; die App startet trotzdem.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SttSession, SAMPLE_RATE } = require('./session.cjs');

const MODEL_NAME = 'sherpa-onnx-streaming-zipformer-de-kroko-2025-08-06';
const MODEL_FILES = ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt'];

function findModelDir(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const dir = path.resolve(String(candidate));
    if (MODEL_FILES.every((file) => fs.existsSync(path.join(dir, file)))) return dir;
  }
  return '';
}

function addonResolvable() {
  try {
    require.resolve('sherpa-onnx-node');
    return true;
  } catch {
    return false;
  }
}

class SherpaStt {
  constructor({ candidates = [], onPartial, onFinal, onError } = {}) {
    this.candidates = candidates.filter(Boolean);
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.onError = onError;

    this.modelDir = '';
    this.recognizer = null;
    this.session = null;
    this.reason = '';
  }

  status() {
    // Ohne geladenes Modell hier prüfen, damit die Oberfläche den Grund
    // schon vor dem ersten Zuhören anzeigen kann. Ladefehler bleiben stehen.
    if (!this.recognizer) {
      this.modelDir = findModelDir(this.candidates);
      if (!this.modelDir) {
        this.reason = `Modell fehlt (${this.candidates[0] || MODEL_NAME})`;
      } else if (!addonResolvable()) {
        this.reason = 'sherpa-onnx-node ist nicht installiert (npm install sherpa-onnx-node)';
      }
    }
    return {
      available: Boolean(this.recognizer) || Boolean(this.modelDir && addonResolvable()),
      ready: Boolean(this.recognizer),
      active: Boolean(this.session),
      backend: 'sherpa-onnx',
      model: MODEL_NAME,
      modelDir: this.modelDir,
      reason: this.reason,
    };
  }

  /** Lädt das Modell einmalig; weitere Sitzungen sind danach sofort bereit. */
  init() {
    if (this.recognizer) return true;

    this.modelDir = findModelDir(this.candidates);
    if (!this.modelDir) {
      const expected = this.candidates[0] || MODEL_NAME;
      this.reason = `Modell fehlt (${expected})`;
      return false;
    }
    if (!addonResolvable()) {
      this.reason = 'sherpa-onnx-node ist nicht installiert (npm install sherpa-onnx-node)';
      return false;
    }

    try {
      const sherpa = require('sherpa-onnx-node');
      const model = (file) => path.join(this.modelDir, file);
      this.recognizer = new sherpa.OnlineRecognizer({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: model('encoder.onnx'),
            decoder: model('decoder.onnx'),
            joiner: model('joiner.onnx'),
          },
          tokens: model('tokens.txt'),
          numThreads: Math.max(1, Math.min(4, (os.cpus()?.length || 2) - 1)),
          provider: 'cpu',
          debug: 0,
          modelType: 'zipformer2',
        },
        decodingMethod: 'greedy_search',
        maxActivePaths: 4,
        enableEndpoint: true,
        // Nach etwa einer Sekunde Stille ist ein Befehl zu Ende; ohne
        // Nicht-Sprache endet nur die Stille und wird zurückgesetzt.
        rule1MinTrailingSilence: 1.2,
        rule2MinTrailingSilence: 1,
        rule3MinUtteranceLength: 20,
      });
      this.reason = '';
      return true;
    } catch (error) {
      this.recognizer = null;
      this.reason = `Modell konnte nicht geladen werden: ${String(error?.message ?? error).slice(0, 180)}`;
      return false;
    }
  }

  start() {
    // Eine neue Sitzung ersetzt eine noch laufende restlos.
    this.cancel();
    if (!this.init()) return { ok: false, error: this.reason, status: this.status() };
    try {
      this.session = new SttSession(this.recognizer, {
        onPartial: (text) => this.onPartial?.(text),
        onFinal: (text) => {
          this.session = null;
          this.onFinal?.(text);
        },
        onError: (message) => {
          this.session = null;
          this.onError?.(message);
        },
      });
      return { ok: true, status: this.status() };
    } catch (error) {
      this.session = null;
      this.reason = `Sitzung fehlgeschlagen: ${String(error?.message ?? error).slice(0, 180)}`;
      return { ok: false, error: this.reason, status: this.status() };
    }
  }

  push(buffer) {
    this.session?.accept(buffer);
  }

  finish() {
    const session = this.session;
    this.session = null;
    session?.finish();
    return this.status();
  }

  cancel() {
    const session = this.session;
    this.session = null;
    session?.cancel();
    return this.status();
  }

  isActive() {
    return Boolean(this.session);
  }

  dispose() {
    this.cancel();
    this.recognizer = null;
  }
}

module.exports = { SherpaStt, MODEL_NAME, MODEL_FILES, findModelDir };
