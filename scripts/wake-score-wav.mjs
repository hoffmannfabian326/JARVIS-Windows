import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const { WakeEngine } = require(join(root, 'electron/wake/engine.cjs'));

const file = process.argv[2];
if (!file) {
  console.error('Aufruf: node scripts/wake-score-wav.mjs <16kHz-mono-16bit.wav>');
  process.exit(1);
}

/** Minimaler WAV-Parser (PCM 16 Bit, mono). */
function readWav(path) {
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('kein RIFF/WAV');
  let offset = 12;
  let fmt = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = {
        channels: buffer.readUInt16LE(offset + 10),
        rate: buffer.readUInt32LE(offset + 12),
        bits: buffer.readUInt16LE(offset + 22),
      };
    }
    if (id === 'data') {
      if (!fmt) throw new Error('fmt-Chunk fehlt');
      if (fmt.channels !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) {
        throw new Error(`erwartet 16 kHz mono 16 Bit, erhalten ${fmt.rate} Hz / ${fmt.channels} ch / ${fmt.bits} Bit`);
      }
      const data = buffer.subarray(offset + 8, offset + 8 + size);
      return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('data-Chunk fehlt');
}

const pcm = readWav(file);
const scores = [];
const engine = new WakeEngine({
  modelsDir: join(root, 'models'),
  onScore: (score) => scores.push(score),
});
let wakes = 0;
engine.onWake = ({ score }) => {
  wakes += 1;
  console.log(`Treffer bei Sample ${scores.length * 1280} (Score ${score.toFixed(3)})`);
};

if (!(await engine.init())) {
  console.error('Engine nicht bereit:', engine.status().reason);
  process.exit(1);
}

// Vorlauf aus Stille, damit die Puffer gefüllt sind.
const lead = new Int16Array(16000 * 2);
for (let offset = 0; offset < lead.length; offset += 1280) {
  await engine.push(lead.subarray(offset, offset + 1280));
}
scores.length = 0;

for (let offset = 0; offset < pcm.length; offset += 1280) {
  await engine.push(pcm.subarray(offset, Math.min(offset + 1280, pcm.length)));
}

console.log(
  JSON.stringify({
    file,
    frames: scores.length,
    maxScore: Number(Math.max(0, ...scores).toFixed(6)),
    maxRaw: Number(Math.max(0, ...scores).toFixed(6)),
    wakes,
    status: engine.status(),
  }),
);
engine.dispose();
