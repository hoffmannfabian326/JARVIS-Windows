import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const { AudioFeatures } = require(join(root, 'electron/wake/features.cjs'));
const { WakeEngine } = require(join(root, 'electron/wake/engine.cjs'));

const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = join(root, 'node_modules/onnxruntime-web/dist') + '/';

/** Gleicher LCG wie im Python-Gegencheck: reproduzierbares Rauschen. */
function noise(seconds, seed = 12345) {
  const out = new Int16Array(16000 * seconds);
  let x = seed >>> 0;
  for (let i = 0; i < out.length; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = ((x >>> 16) % 2001) - 1000;
  }
  return out;
}

async function scoresFor(samples) {
  const speak = (name) => ort.InferenceSession.create(join(root, 'models', name), {
    executionProviders: ['wasm'],
  });
  const [mel, embedding, wake] = await Promise.all([
    speak('melspectrogram.onnx'),
    speak('embedding_model.onnx'),
    speak('hey_jarvis_v0.1.onnx'),
  ]);
  const features = new AudioFeatures(ort, mel, embedding);
  const scores = [];
  for (let offset = 0; offset + 1280 <= samples.length; offset += 1280) {
    await features.feed(samples.subarray(offset, offset + 1280));
    const data = features.getFeatures(16);
    if (!data) {
      scores.push(0);
      continue;
    }
    const result = await wake.run({
      'x.1': new ort.Tensor('float32', data, [1, 16, 96]),
    });
    scores.push(result[wake.outputNames[0]].data[0]);
  }
  return scores;
}

const noiseScores = await scoresFor(noise(6));
const silenceScores = await scoresFor(new Int16Array(16000 * 6));

const after = noiseScores.slice(38); // ab 3 s ist der Warmstart heraus
const maxAfter = Math.max(...after);
const maxNoise = Math.max(...noiseScores);
const maxSilence = Math.max(...silenceScores);

console.log(
  JSON.stringify({
    chunks: noiseScores.length,
    maxNoiseAfter3s: Number(maxAfter.toFixed(6)),
    maxNoise: Number(maxNoise.toFixed(6)),
    maxSilence: Number(maxSilence.toFixed(6)),
    sampleAfter3s: after.slice(0, 5).map((v) => Number(v.toFixed(6))),
  }),
);

// Engine-Smoke: muss laden, darf auf Rauschen nicht auslösen.
const engine = new WakeEngine({ modelsDir: join(root, 'models') });
const ready = await engine.init();
let wakes = 0;
engine.onWake = () => {
  wakes += 1;
};
const pcm = noise(4, 99);
for (let offset = 0; offset < pcm.length; offset += 2048) {
  await engine.push(pcm.subarray(offset, Math.min(offset + 2048, pcm.length)));
}
console.log(JSON.stringify({ engineReady: ready, status: engine.status(), wakes }));
engine.dispose();
