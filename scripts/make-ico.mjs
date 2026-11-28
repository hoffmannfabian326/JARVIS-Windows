import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIZES = [16, 24, 32, 48, 64, 128, 256];

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

/** Reaktor-Ring als RGBA-PNG in der gewünschten Kantenlänge. */
function ringPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const unit = size / 32;

  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + size * 4);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const dx = x - cx + 0.5;
      const dy = y - cx + 0.5;
      const distance = Math.hypot(dx, dy);
      const ring = distance > 10.5 * unit && distance < 13 * unit;
      const core = distance < 4.5 * unit;
      const glow = Math.max(0, 1 - distance / (14 * unit));
      let alpha = Math.round(glow * glow * 130);
      if (ring) alpha = 235;
      if (core) alpha = 255;
      raw[offset] = core ? 235 : 60;
      raw[offset + 1] = core ? 250 : 220;
      raw[offset + 2] = 255;
      raw[offset + 3] = alpha;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const images = SIZES.map((size) => ({ size, png: ringPng(size) }));

const directory = Buffer.alloc(6 + images.length * 16);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);

let offset = directory.length;
images.forEach(({ size, png }, index) => {
  const entry = 6 + index * 16;
  directory[entry] = size >= 256 ? 0 : size;
  directory[entry + 1] = size >= 256 ? 0 : size;
  directory[entry + 2] = 0;
  directory[entry + 3] = 0;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(png.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});

mkdirSync('build', { recursive: true });
const ico = Buffer.concat([directory, ...images.map((image) => image.png)]);
writeFileSync('build/icon.ico', ico);
console.log(`build/icon.ico (${ico.length} Bytes, ${images.length} Größen)`);
