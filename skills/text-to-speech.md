# Text-to-Speech Skill

Convert text to speech audio programmatically.

## Dependencies
```bash
npm install say gtts elevenlabs-node
```

## System TTS (Cross-platform)

```javascript
import say from 'say';

// Speak text immediately
function speak(text, voice, speed = 1) {
  return new Promise((resolve, reject) => {
    say.speak(text, voice, speed, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Save to file
function textToFile(text, outputPath, voice, speed = 1) {
  return new Promise((resolve, reject) => {
    say.export(text, voice, speed, outputPath, (err) => {
      if (err) reject(err);
      else resolve(outputPath);
    });
  });
}

// Get available voices
function getVoices() {
  return new Promise((resolve) => {
    say.getInstalledVoices((err, voices) => {
      resolve(voices || []);
    });
  });
}

// Stop speaking
function stop() {
  say.stop();
}
```

## Google TTS

```javascript
import gTTS from 'gtts';
import fs from 'fs';

function googleTTS(text, outputPath, lang = 'en') {
  return new Promise((resolve, reject) => {
    const gtts = new gTTS(text, lang);
    gtts.save(outputPath, (err) => {
      if (err) reject(err);
      else resolve(outputPath);
    });
  });
}

// Supported languages
const GTTS_LANGUAGES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', ru: 'Russian', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi'
};
```

## ElevenLabs (Premium quality)

```javascript
import ElevenLabs from 'elevenlabs-node';
import fs from 'fs';

class ElevenLabsTTS {
  constructor(apiKey) {
    this.voice = new ElevenLabs({ apiKey });
  }

  async getVoices() {
    return await this.voice.getVoices();
  }

  async textToSpeech(text, voiceId, outputPath, options = {}) {
    const response = await this.voice.textToSpeech({
      voiceId,
      textInput: text,
      modelId: options.modelId || 'eleven_monolingual_v1',
      stability: options.stability || 0.5,
      similarityBoost: options.similarityBoost || 0.75
    });

    fs.writeFileSync(outputPath, response);
    return outputPath;
  }

  async textToSpeechStream(text, voiceId) {
    return await this.voice.textToSpeechStream({
      voiceId,
      textInput: text
    });
  }
}
```

## Audio Concatenation

```javascript
import { spawn } from 'child_process';

async function concatenateAudio(inputFiles, outputFile) {
  // Using ffmpeg
  const listFile = 'concat_list.txt';
  const listContent = inputFiles.map(f => `file '${f}'`).join('\n');
  fs.writeFileSync(listFile, listContent);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputFile]);
    ffmpeg.on('close', (code) => {
      fs.unlinkSync(listFile);
      if (code === 0) resolve(outputFile);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}
```

## Batch Processing

```javascript
async function batchTTS(texts, outputDir, options = {}) {
  const fs = await import('fs-extra');
  const path = await import('path');

  await fs.ensureDir(outputDir);
  const results = [];

  for (let i = 0; i < texts.length; i++) {
    const outputPath = path.join(outputDir, `${i + 1}.mp3`);
    try {
      await googleTTS(texts[i], outputPath, options.lang || 'en');
      results.push({ index: i, text: texts[i], file: outputPath, success: true });
    } catch (error) {
      results.push({ index: i, text: texts[i], error: error.message, success: false });
    }
  }

  return results;
}
```

## Usage Examples

```javascript
// System TTS
await speak('Hello, this is a test');
await textToFile('Save this to audio', 'output.wav');
const voices = await getVoices();

// Google TTS
await googleTTS('Hello world', 'hello.mp3', 'en');
await googleTTS('Bonjour le monde', 'french.mp3', 'fr');

// ElevenLabs
const eleven = new ElevenLabsTTS('your-api-key');
const voices = await eleven.getVoices();
await eleven.textToSpeech('Premium quality voice', 'voice-id', 'premium.mp3');

// Batch processing
const results = await batchTTS([
  'Chapter one begins here.',
  'The story continues.',
  'And so it ends.'
], './audiobook');

// Concatenate audio files
await concatenateAudio(['1.mp3', '2.mp3', '3.mp3'], 'full_audio.mp3');
```
