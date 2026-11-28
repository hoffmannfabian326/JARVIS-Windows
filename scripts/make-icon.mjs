import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 32;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y += 1) {
  const row = y * (1 + SIZE * 4);
  raw[row] = 0;
  for (let x = 0; x < SIZE; x += 1) {
    const offset = row + 1 + x * 4;
    const dx = x - SIZE / 2 + 0.5;
    const dy = y - SIZE / 2 + 0.5;
    const distance = Math.hypot(dx, dy);
    const ring = distance > 10.5 && distance < 13;
    const core = distance < 4.5;
    const glow = Math.max(0, 1 - distance / 14);
    let alpha = 0;
    if (ring) alpha = 235;
    else if (core) alpha = 255;
    else alpha = Math.round(glow * glow * 130);
    raw[offset] = core ? 235 : 60;
    raw[offset + 1] = core ? 250 : 220;
    raw[offset + 2] = 255;
    raw[offset + 3] = alpha;
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8;
header[9] = 6;
header[10] = 0;
header[11] = 0;
header[12] = 0;

const png = Buffer.concat([
  SIGNATURE,
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync('electron', { recursive: true });
writeFileSync('electron/tray.png', png);
console.log(`electron/tray.png (${png.length} Bytes)`);
