# Image Processing Skill

Process and manipulate images programmatically.

## Dependencies
```bash
npm install sharp jimp
```

## Basic Image Operations with Sharp

```javascript
import sharp from 'sharp';

// Resize image
async function resizeImage(inputPath, outputPath, width, height, options = {}) {
  await sharp(inputPath)
    .resize(width, height, {
      fit: options.fit || 'cover', // cover, contain, fill, inside, outside
      position: options.position || 'center'
    })
    .toFile(outputPath);
  return outputPath;
}

// Convert format
async function convertImage(inputPath, outputPath, format) {
  let image = sharp(inputPath);

  switch (format) {
    case 'jpeg':
    case 'jpg':
      image = image.jpeg({ quality: 80 });
      break;
    case 'png':
      image = image.png();
      break;
    case 'webp':
      image = image.webp({ quality: 80 });
      break;
    case 'avif':
      image = image.avif({ quality: 60 });
      break;
  }

  await image.toFile(outputPath);
  return outputPath;
}

// Get image metadata
async function getImageInfo(inputPath) {
  const metadata = await sharp(inputPath).metadata();
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
    size: metadata.size
  };
}
```

## Image Transformations

```javascript
// Rotate image
async function rotateImage(inputPath, outputPath, degrees) {
  await sharp(inputPath)
    .rotate(degrees)
    .toFile(outputPath);
  return outputPath;
}

// Flip/Flop
async function flipImage(inputPath, outputPath, direction) {
  let image = sharp(inputPath);

  if (direction === 'vertical') {
    image = image.flip();
  } else {
    image = image.flop();
  }

  await image.toFile(outputPath);
  return outputPath;
}

// Crop image
async function cropImage(inputPath, outputPath, region) {
  await sharp(inputPath)
    .extract({
      left: region.left,
      top: region.top,
      width: region.width,
      height: region.height
    })
    .toFile(outputPath);
  return outputPath;
}
```

## Image Effects

```javascript
// Apply blur
async function blurImage(inputPath, outputPath, sigma = 5) {
  await sharp(inputPath)
    .blur(sigma)
    .toFile(outputPath);
  return outputPath;
}

// Sharpen image
async function sharpenImage(inputPath, outputPath) {
  await sharp(inputPath)
    .sharpen()
    .toFile(outputPath);
  return outputPath;
}

// Grayscale
async function grayscaleImage(inputPath, outputPath) {
  await sharp(inputPath)
    .grayscale()
    .toFile(outputPath);
  return outputPath;
}

// Adjust brightness and contrast
async function adjustImage(inputPath, outputPath, options = {}) {
  await sharp(inputPath)
    .modulate({
      brightness: options.brightness || 1,
      saturation: options.saturation || 1,
      hue: options.hue || 0
    })
    .toFile(outputPath);
  return outputPath;
}

// Add tint
async function tintImage(inputPath, outputPath, color) {
  await sharp(inputPath)
    .tint(color) // e.g., { r: 255, g: 0, b: 0 }
    .toFile(outputPath);
  return outputPath;
}
```

## Composite Images

```javascript
// Watermark
async function addWatermark(inputPath, watermarkPath, outputPath, options = {}) {
  await sharp(inputPath)
    .composite([{
      input: watermarkPath,
      gravity: options.gravity || 'southeast',
      blend: options.blend || 'over'
    }])
    .toFile(outputPath);
  return outputPath;
}

// Overlay images
async function overlayImages(basePath, overlayPath, outputPath, position) {
  await sharp(basePath)
    .composite([{
      input: overlayPath,
      left: position.left || 0,
      top: position.top || 0
    }])
    .toFile(outputPath);
  return outputPath;
}

// Add text overlay (using buffer)
async function addTextOverlay(inputPath, outputPath, text, options = {}) {
  const svgText = `
    <svg width="${options.width || 200}" height="${options.height || 50}">
      <text x="50%" y="50%" font-family="Arial" font-size="${options.fontSize || 24}"
            fill="${options.color || 'white'}" text-anchor="middle" dominant-baseline="middle">
        ${text}
      </text>
    </svg>
  `;

  await sharp(inputPath)
    .composite([{
      input: Buffer.from(svgText),
      gravity: options.gravity || 'south'
    }])
    .toFile(outputPath);
  return outputPath;
}
```

## Batch Processing

```javascript
async function batchResize(inputDir, outputDir, width, height) {
  const fs = await import('fs-extra');
  const path = await import('path');

  await fs.ensureDir(outputDir);
  const files = await fs.readdir(inputDir);
  const results = [];

  for (const file of files) {
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
      const inputPath = path.join(inputDir, file);
      const outputPath = path.join(outputDir, file);

      try {
        await resizeImage(inputPath, outputPath, width, height);
        results.push({ file, success: true });
      } catch (error) {
        results.push({ file, success: false, error: error.message });
      }
    }
  }

  return results;
}

async function optimizeImages(inputDir, outputDir, quality = 80) {
  const fs = await import('fs-extra');
  const path = await import('path');

  await fs.ensureDir(outputDir);
  const files = await fs.readdir(inputDir);
  const results = [];

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file.replace(/\.[^.]+$/, '.webp'));

    if (/\.(jpg|jpeg|png)$/i.test(file)) {
      try {
        const inputStats = await fs.stat(inputPath);
        await sharp(inputPath)
          .webp({ quality })
          .toFile(outputPath);
        const outputStats = await fs.stat(outputPath);

        results.push({
          file,
          originalSize: inputStats.size,
          optimizedSize: outputStats.size,
          savings: ((1 - outputStats.size / inputStats.size) * 100).toFixed(1) + '%'
        });
      } catch (error) {
        results.push({ file, error: error.message });
      }
    }
  }

  return results;
}
```

## Create Thumbnails

```javascript
async function createThumbnail(inputPath, outputPath, size = 150) {
  await sharp(inputPath)
    .resize(size, size, { fit: 'cover', position: 'attention' })
    .toFile(outputPath);
  return outputPath;
}

async function createThumbnailSet(inputPath, outputDir, sizes = [64, 128, 256]) {
  const fs = await import('fs-extra');
  const path = await import('path');

  await fs.ensureDir(outputDir);
  const results = [];
  const baseName = path.basename(inputPath, path.extname(inputPath));

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `${baseName}_${size}.webp`);
    await sharp(inputPath)
      .resize(size, size, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(outputPath);
    results.push({ size, path: outputPath });
  }

  return results;
}
```

## Usage Examples

```javascript
// Basic operations
await resizeImage('photo.jpg', 'photo_resized.jpg', 800, 600);
await convertImage('photo.jpg', 'photo.webp', 'webp');
const info = await getImageInfo('photo.jpg');

// Transformations
await rotateImage('photo.jpg', 'rotated.jpg', 90);
await cropImage('photo.jpg', 'cropped.jpg', { left: 100, top: 100, width: 500, height: 500 });

// Effects
await blurImage('photo.jpg', 'blurred.jpg', 10);
await grayscaleImage('photo.jpg', 'bw.jpg');
await adjustImage('photo.jpg', 'bright.jpg', { brightness: 1.2, saturation: 1.1 });

// Composites
await addWatermark('photo.jpg', 'logo.png', 'watermarked.jpg', { gravity: 'southeast' });
await addTextOverlay('photo.jpg', 'titled.jpg', 'My Photo', { fontSize: 32, color: 'white' });

// Batch processing
await batchResize('./photos', './resized', 1920, 1080);
await optimizeImages('./photos', './optimized', 75);

// Thumbnails
await createThumbnailSet('photo.jpg', './thumbnails', [64, 128, 256, 512]);
```
