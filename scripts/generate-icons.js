import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) v = v & 1 ? 0xEDB88320 ^ (v >>> 1) : v >>> 1;
    table[n] = v;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function createPNG(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (2 * size);
      pixels[i]     = Math.round(79 + t * (124 - 79));
      pixels[i + 1] = Math.round(70 + t * (58 - 70));
      pixels[i + 2] = Math.round(229 + t * (237 - 229));
      pixels[i + 3] = 255;
    }
  }

  const cx = size / 2, cy = size / 2;
  const boltPoints = [
    [0, -0.7], [0.15, -0.15], [0.4, -0.15],
    [0, 0.15], [0.2, 0.15], [-0.15, 0.7],
    [-0.15, 0.1], [-0.4, 0.1], [0, -0.2],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - cx) / (size * 0.35);
      const ny = (y - cy) / (size * 0.35);
      if (isInsideBolt(nx, ny, boltPoints)) {
        const i = (y * size + x) * 4;
        pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255;
      }
    }
  }

  const rawRows = [];
  for (let y = 0; y < size; y++) {
    rawRows.push(Buffer.from([0]));
    rawRows.push(pixels.subarray(y * size * 4, (y + 1) * size * 4));
  }

  const compressed = deflateSync(Buffer.concat(rawRows));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function isInsideBolt(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

for (const size of [16, 48, 128]) {
  const png = createPNG(size);
  writeFileSync(`extension/icons/icon${size}.png`, png);
  console.log(`Created icon${size}.png (${png.length} bytes)`);
}
