import fs from "fs";
import path from "path";

const ICON_DIR = path.join(process.cwd(), "assets");
const ICON_PATH = path.join(ICON_DIR, "backbone.ico");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Color palette - dark blue background with bright blue "B"
const colors = {
  background: { r: 15, g: 23, b: 42, a: 255 },      // Dark slate
  primary: { r: 59, g: 130, b: 246, a: 255 },       // Blue
  highlight: { r: 96, g: 165, b: 250, a: 255 },     // Light blue
  accent: { r: 34, g: 197, b: 94, a: 255 }          // Green accent
};

// Draw a "B" shape for the backbone logo
const isForegroundPixel = (x, y, size) => {
  const scale = size / 16;
  const sx = Math.floor(x / scale);
  const sy = Math.floor(y / scale);

  // "B" shape coordinates (based on 16x16 grid)
  // Left vertical stroke
  const leftStroke = (sx === 3 || sx === 4) && sy >= 2 && sy <= 13;
  // Top horizontal stroke
  const topStroke = (sy === 2 || sy === 3) && sx >= 3 && sx <= 11;
  // Middle horizontal stroke
  const midStroke = (sy === 7 || sy === 8) && sx >= 3 && sx <= 10;
  // Bottom horizontal stroke
  const bottomStroke = (sy === 12 || sy === 13) && sx >= 3 && sx <= 11;
  // Right upper bump
  const rightUpper = (sx === 10 || sx === 11) && sy >= 3 && sy <= 7;
  // Right lower bump
  const rightLower = (sx === 10 || sx === 11) && sy >= 8 && sy <= 12;
  // Rounded corners on right
  const upperCorner = sx === 11 && (sy === 3 || sy === 7);
  const lowerCorner = sx === 11 && (sy === 8 || sy === 12);

  return leftStroke || topStroke || midStroke || bottomStroke || rightUpper || rightLower;
};

// Check if pixel is on the edge (for highlight effect)
const isHighlightPixel = (x, y, size) => {
  if (!isForegroundPixel(x, y, size)) return false;

  const scale = size / 16;
  const sx = Math.floor(x / scale);
  const sy = Math.floor(y / scale);

  // Top and left edges of the B get highlight
  return sy <= 3 || sx <= 4;
};

const buildXorMask = (size) => {
  const buffer = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = size - 1 - y;
      const offset = (row * size + x) * 4;

      let color;
      if (isForegroundPixel(x, y, size)) {
        color = isHighlightPixel(x, y, size) ? colors.highlight : colors.primary;
      } else {
        color = colors.background;
      }

      buffer[offset] = color.b;
      buffer[offset + 1] = color.g;
      buffer[offset + 2] = color.r;
      buffer[offset + 3] = color.a;
    }
  }

  return buffer;
};

const buildAndMask = (size) => {
  const rowBytes = Math.ceil(size / 8);
  const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
  return Buffer.alloc(size * paddedRowBytes, 0);
};

const buildBitmapInfoHeader = (size, imageSize) => {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);           // biSize
  header.writeInt32LE(size, 4);          // biWidth
  header.writeInt32LE(size * 2, 8);      // biHeight (doubled for XOR + AND masks)
  header.writeUInt16LE(1, 12);           // biPlanes
  header.writeUInt16LE(32, 14);          // biBitCount
  header.writeUInt32LE(0, 16);           // biCompression (BI_RGB)
  header.writeUInt32LE(imageSize, 20);   // biSizeImage
  header.writeInt32LE(0, 24);            // biXPelsPerMeter
  header.writeInt32LE(0, 28);            // biYPelsPerMeter
  header.writeUInt32LE(0, 32);           // biClrUsed
  header.writeUInt32LE(0, 36);           // biClrImportant
  return header;
};

const buildIconImage = (size) => {
  const xorMask = buildXorMask(size);
  const andMask = buildAndMask(size);
  const bmpHeader = buildBitmapInfoHeader(size, xorMask.length + andMask.length);
  return Buffer.concat([bmpHeader, xorMask, andMask]);
};

const buildMultiResolutionIcon = () => {
  const sizes = [16, 32, 48];
  const images = sizes.map(size => buildIconImage(size));

  // ICO header
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);           // Reserved
  iconDir.writeUInt16LE(1, 2);           // Type (1 = ICO)
  iconDir.writeUInt16LE(sizes.length, 4); // Number of images

  // Calculate offsets
  const headerSize = 6 + sizes.length * 16;
  let currentOffset = headerSize;

  // Build directory entries
  const entries = sizes.map((size, index) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);  // Width
    entry.writeUInt8(size === 256 ? 0 : size, 1);  // Height
    entry.writeUInt8(0, 2);              // Color palette
    entry.writeUInt8(0, 3);              // Reserved
    entry.writeUInt16LE(1, 4);           // Color planes
    entry.writeUInt16LE(32, 6);          // Bits per pixel
    entry.writeUInt32LE(images[index].length, 8);  // Image size
    entry.writeUInt32LE(currentOffset, 12);        // Image offset

    currentOffset += images[index].length;
    return entry;
  });

  return Buffer.concat([iconDir, ...entries, ...images]);
};

ensureDir(ICON_DIR);
fs.writeFileSync(ICON_PATH, buildMultiResolutionIcon());

process.stdout.write(`Icon created at ${ICON_PATH}\n`);
process.stdout.write(`Sizes: 16x16, 32x32, 48x48\n`);
