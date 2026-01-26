# Video Processing Skill

Process and manipulate videos programmatically.

## Dependencies
```bash
npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg
```

## Basic Setup

```javascript
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Get video metadata
function getVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) reject(err);
      else {
        const video = metadata.streams.find(s => s.codec_type === 'video');
        const audio = metadata.streams.find(s => s.codec_type === 'audio');

        resolve({
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          format: metadata.format.format_name,
          video: video ? {
            codec: video.codec_name,
            width: video.width,
            height: video.height,
            fps: eval(video.r_frame_rate),
            bitrate: video.bit_rate
          } : null,
          audio: audio ? {
            codec: audio.codec_name,
            channels: audio.channels,
            sampleRate: audio.sample_rate
          } : null
        });
      }
    });
  });
}
```

## Video Conversion

```javascript
// Convert video format
function convertVideo(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (options.videoCodec) command = command.videoCodec(options.videoCodec);
    if (options.audioCodec) command = command.audioCodec(options.audioCodec);
    if (options.videoBitrate) command = command.videoBitrate(options.videoBitrate);
    if (options.audioBitrate) command = command.audioBitrate(options.audioBitrate);

    command
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// Convert to MP4
function toMP4(inputPath, outputPath) {
  return convertVideo(inputPath, outputPath, {
    videoCodec: 'libx264',
    audioCodec: 'aac'
  });
}

// Convert to WebM
function toWebM(inputPath, outputPath) {
  return convertVideo(inputPath, outputPath, {
    videoCodec: 'libvpx',
    audioCodec: 'libvorbis'
  });
}
```

## Video Manipulation

```javascript
// Trim video
function trimVideo(inputPath, outputPath, startTime, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime) // e.g., '00:00:10'
      .setDuration(duration)    // e.g., 30 (seconds)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// Resize video
function resizeVideo(inputPath, outputPath, width, height) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .size(`${width}x${height}`)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// Change speed
function changeSpeed(inputPath, outputPath, speed) {
  return new Promise((resolve, reject) => {
    const videoFilter = `setpts=${1/speed}*PTS`;
    const audioFilter = `atempo=${speed}`;

    ffmpeg(inputPath)
      .videoFilters(videoFilter)
      .audioFilters(audioFilter)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// Rotate video
function rotateVideo(inputPath, outputPath, degrees) {
  const transpose = {
    90: 'transpose=1',
    180: 'transpose=1,transpose=1',
    270: 'transpose=2'
  }[degrees] || 'transpose=1';

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(transpose)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}
```

## Extract Frames

```javascript
// Extract single frame
function extractFrame(inputPath, outputPath, timestamp) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename: outputPath.split('/').pop(),
        folder: outputPath.split('/').slice(0, -1).join('/')
      })
      .on('end', () => resolve(outputPath))
      .on('error', reject);
  });
}

// Extract multiple frames
function extractFrames(inputPath, outputDir, options = {}) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        count: options.count || 10,
        folder: outputDir,
        filename: options.filenamePattern || 'frame-%i.png',
        size: options.size || '320x240'
      })
      .on('end', () => resolve(outputDir))
      .on('error', reject);
  });
}

// Create thumbnail
function createThumbnail(inputPath, outputPath, size = '320x240') {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['50%'],
        filename: outputPath.split('/').pop(),
        folder: outputPath.split('/').slice(0, -1).join('/'),
        size
      })
      .on('end', () => resolve(outputPath))
      .on('error', reject);
  });
}
```

## Audio Operations

```javascript
// Extract audio
function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// Remove audio
function removeAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noAudio()
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// Add audio to video
function addAudio(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(['-map 0:v', '-map 1:a', '-shortest'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}
```

## Video Composition

```javascript
// Concatenate videos
function concatenateVideos(inputPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    inputPaths.forEach(path => command.input(path));

    command
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .mergeToFile(outputPath);
  });
}

// Add watermark
function addWatermark(inputPath, watermarkPath, outputPath, position = 'bottomright') {
  const positions = {
    topleft: '10:10',
    topright: 'W-w-10:10',
    bottomleft: '10:H-h-10',
    bottomright: 'W-w-10:H-h-10',
    center: '(W-w)/2:(H-h)/2'
  };

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .input(watermarkPath)
      .complexFilter(`overlay=${positions[position]}`)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

// Add text overlay
function addTextOverlay(inputPath, outputPath, text, options = {}) {
  const fontfile = options.fontfile || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const fontsize = options.fontsize || 24;
  const fontcolor = options.fontcolor || 'white';
  const x = options.x || '10';
  const y = options.y || '10';

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters(`drawtext=text='${text}':fontfile=${fontfile}:fontsize=${fontsize}:fontcolor=${fontcolor}:x=${x}:y=${y}`)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}
```

## GIF Creation

```javascript
function videoToGif(inputPath, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(options.startTime || 0)
      .setDuration(options.duration || 5)
      .size(options.size || '320x?')
      .fps(options.fps || 10)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}
```

## Usage Examples

```javascript
// Get info
const info = await getVideoInfo('video.mp4');
console.log(`Duration: ${info.duration}s, Resolution: ${info.video.width}x${info.video.height}`);

// Convert
await toMP4('input.avi', 'output.mp4');
await toWebM('input.mp4', 'output.webm');

// Trim
await trimVideo('input.mp4', 'clip.mp4', '00:01:30', 60);

// Resize
await resizeVideo('input.mp4', 'small.mp4', 640, 360);

// Speed up/slow down
await changeSpeed('input.mp4', 'fast.mp4', 2);    // 2x speed
await changeSpeed('input.mp4', 'slow.mp4', 0.5);  // half speed

// Extract frames
await extractFrames('video.mp4', './frames', { count: 20 });
await createThumbnail('video.mp4', './thumb.jpg');

// Audio
await extractAudio('video.mp4', 'audio.mp3');
await removeAudio('video.mp4', 'silent.mp4');
await addAudio('silent.mp4', 'music.mp3', 'final.mp4');

// Composition
await concatenateVideos(['clip1.mp4', 'clip2.mp4'], 'combined.mp4');
await addWatermark('video.mp4', 'logo.png', 'watermarked.mp4');

// GIF
await videoToGif('video.mp4', 'animation.gif', { startTime: 10, duration: 3 });
```
