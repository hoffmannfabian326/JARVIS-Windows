'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MODEL_FILE = 'de_DE-thorsten-medium.onnx';

let config = { exe: null, voiceDir: null };

function configure(next) {
  config = {
    exe: next.exe ? path.resolve(next.exe) : config.exe,
    voiceDir: next.voiceDir ? path.resolve(next.voiceDir) : config.voiceDir,
  };
}

function modelPath() {
  if (!config.voiceDir) return null;
  const file = path.join(config.voiceDir, MODEL_FILE);
  return fs.existsSync(file) ? file : null;
}

function available() {
  return Boolean(config.exe && fs.existsSync(config.exe) && modelPath());
}

function info() {
  return {
    available: available(),
    engine: 'piper',
    voice: 'Thorsten (neuronal)',
    model: MODEL_FILE,
  };
}

function parseSampleRate(wav) {
  if (wav.length < 44) return null;
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null;
  return wav.readUInt32LE(24) || null;
}

/**
 * Synthetisiert einen Satz lokal mit Piper. Rückgabe enthält das komplette WAV
 * als Buffer; der Renderer spielt es ab und fordert den nächsten Satz parallel an.
 */
function synthesize(text, { lengthScale = 1, timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    if (!available()) {
      resolve({ ok: false, error: 'Piper-Stimme nicht installiert' });
      return;
    }

    const input = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (!input) {
      resolve({ ok: false, error: 'leerer Text' });
      return;
    }

    const outFile = path.join(
      os.tmpdir(),
      `jarvis-tts-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`,
    );
    const scale = Math.min(1.6, Math.max(0.6, Number(lengthScale) || 1));

    const child = spawn(
      config.exe,
      ['--model', modelPath(), '--output_file', outFile, '--length_scale', scale.toFixed(2)],
      { cwd: path.dirname(config.exe), windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] },
    );

    let stderr = '';
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    const cleanup = () => {
      try {
        fs.unlinkSync(outFile);
      } catch {
        /* Datei wurde nie geschrieben */
      }
    };

    timer = setTimeout(() => {
      child.kill();
      cleanup();
      finish({ ok: false, error: 'Zeitüberschreitung bei der Sprachsynthese' });
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on('error', (error) => {
      cleanup();
      finish({ ok: false, error: error.message });
    });

    child.on('close', (code) => {
      if (settled) {
        cleanup();
        return;
      }
      if (code !== 0) {
        cleanup();
        finish({ ok: false, error: (stderr.split('\n').filter(Boolean).pop() || `Piper exit ${code}`).slice(0, 200) });
        return;
      }
      try {
        const wav = fs.readFileSync(outFile);
        const sampleRate = parseSampleRate(wav);
        cleanup();
        if (!sampleRate) {
          finish({ ok: false, error: 'ungültige Audiodatei' });
          return;
        }
        finish({ ok: true, wav, sampleRate });
      } catch (error) {
        cleanup();
        finish({ ok: false, error: error.message });
      }
    });

    child.stdin.on('error', () => {
      /* Piper kann stdin früh schließen */
    });
    child.stdin.end(`${input}\n`);
  });
}

module.exports = { configure, available, info, synthesize };
