/**
 * Generate PWA icons for BACKBONE
 * Creates orange "B" on dark background at 192x192 and 512x512
 *
 * Uses a simple SVG-to-PNG approach with Canvas API fallback.
 * Run: node scripts/generate-pwa-icons.js
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";

const ICONS_DIR = path.join(process.cwd(), "public", "icons");

/**
 * Generate a minimal PNG file with an orange "B" on dark background.
 * Uses raw PNG encoding (no dependencies needed).
 */
function createIconPNG(size) {
  // We'll create an SVG and convert to a data URI for reference,
  // but for actual PNG we generate raw bytes.
  //
  // For simplicity, create a valid minimal PNG with the design baked in.
  // Since we can't easily render text to PNG without canvas/sharp,
  // we'll generate an SVG file that Firebase Hosting serves, plus
  // create a simple colored square PNG as fallback.

  const bg = [15, 15, 35];   // #0f0f23
  const fg = [249, 115, 22]; // #f97316

  // Build raw RGBA pixel data
  const pixels = Buffer.alloc(size * size * 4);

  // Draw background
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    pixels[offset] = bg[0];
    pixels[offset + 1] = bg[1];
    pixels[offset + 2] = bg[2];
    pixels[offset + 3] = 255;
  }

  // Draw a simple "B" shape using rectangles
  const s = size;
  const pad = Math.floor(s * 0.2);   // padding from edges
  const stroke = Math.floor(s * 0.12); // line thickness

  // Vertical bar of B (left side)
  fillRect(pixels, s, pad, pad, pad + stroke, s - pad, fg);

  // Top horizontal bar
  fillRect(pixels, s, pad, pad, s - pad - Math.floor(s * 0.05), pad + stroke, fg);

  // Middle horizontal bar
  const midY = Math.floor(s / 2) - Math.floor(stroke / 2);
  fillRect(pixels, s, pad, midY, s - pad - Math.floor(s * 0.05), midY + stroke, fg);

  // Bottom horizontal bar
  fillRect(pixels, s, pad, s - pad - stroke, s - pad - Math.floor(s * 0.05), s - pad, fg);

  // Top-right curve (simplified as vertical bar on right)
  const rightX = s - pad - stroke - Math.floor(s * 0.05);
  fillRect(pixels, s, rightX, pad, rightX + stroke, midY + stroke, fg);

  // Bottom-right curve (shifted slightly right for B shape)
  const rightX2 = s - pad - Math.floor(s * 0.02);
  fillRect(pixels, s, rightX2 - stroke, midY, rightX2, s - pad, fg);

  return encodePNG(pixels, size, size);
}

function fillRect(pixels, imgWidth, x1, y1, x2, y2, color) {
  for (let y = Math.max(0, y1); y < Math.min(imgWidth, y2); y++) {
    for (let x = Math.max(0, x1); x < Math.min(imgWidth, x2); x++) {
      const offset = (y * imgWidth + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
}

/**
 * Minimal PNG encoder (uncompressed, valid PNG)
 */
function encodePNG(pixels, width, height) {
  const { deflateSync } = await_import_zlib();

  // Build raw image data with filter byte (0 = None) per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter: None
    pixels.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = deflateSync(rawData);

  // Build PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function await_import_zlib() {
  return zlib;
}

// ── Main ──────────────────────────────────────────────────────
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

const icon192 = createIconPNG(192);
fs.writeFileSync(path.join(ICONS_DIR, "icon-192.png"), icon192);
console.log("Created icon-192.png (%d bytes)", icon192.length);

const icon512 = createIconPNG(512);
fs.writeFileSync(path.join(ICONS_DIR, "icon-512.png"), icon512);
console.log("Created icon-512.png (%d bytes)", icon512.length);

console.log("Done! Icons saved to public/icons/");
