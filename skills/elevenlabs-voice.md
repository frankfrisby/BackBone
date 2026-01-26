# ElevenLabs Voice AI Skill

Generate realistic AI voices and audio with ElevenLabs.

## Dependencies
```bash
npm install elevenlabs
```

## Setup

```javascript
import { ElevenLabsClient } from 'elevenlabs';
import fs from 'fs';

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});
```

## Text-to-Speech

```javascript
// Basic text-to-speech
async function textToSpeech(text, voiceId, outputPath) {
  const audio = await client.generate({
    voice: voiceId,
    text: text,
    model_id: 'eleven_multilingual_v2'
  });

  const chunks = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// With advanced settings
async function textToSpeechAdvanced(text, options) {
  const audio = await client.generate({
    voice: options.voiceId,
    text: text,
    model_id: options.model || 'eleven_multilingual_v2',
    voice_settings: {
      stability: options.stability || 0.5,
      similarity_boost: options.similarityBoost || 0.75,
      style: options.style || 0,
      use_speaker_boost: options.speakerBoost || true
    }
  });

  const chunks = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
```

## Voice Management

```javascript
// List all voices
async function listVoices() {
  const response = await client.voices.getAll();
  return response.voices.map(v => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels,
    previewUrl: v.preview_url
  }));
}

// Get voice details
async function getVoice(voiceId) {
  return await client.voices.get(voiceId);
}

// Get default voice settings
async function getDefaultSettings(voiceId) {
  return await client.voices.getSettings(voiceId);
}

// Update voice settings
async function updateVoiceSettings(voiceId, settings) {
  return await client.voices.editSettings(voiceId, settings);
}
```

## Voice Cloning

```javascript
// Clone voice from audio samples
async function cloneVoice(name, description, audioFiles) {
  const files = audioFiles.map(f => fs.createReadStream(f));

  const voice = await client.voices.add({
    name: name,
    description: description,
    files: files,
    labels: { accent: 'custom', gender: 'neutral' }
  });

  return voice;
}

// Clone from URL
async function cloneVoiceFromUrl(name, audioUrls) {
  // Download audio files first
  const tempFiles = [];
  for (let i = 0; i < audioUrls.length; i++) {
    const response = await fetch(audioUrls[i]);
    const buffer = await response.arrayBuffer();
    const tempPath = `/tmp/voice_sample_${i}.mp3`;
    fs.writeFileSync(tempPath, Buffer.from(buffer));
    tempFiles.push(tempPath);
  }

  const voice = await cloneVoice(name, 'Cloned from URLs', tempFiles);

  // Cleanup temp files
  tempFiles.forEach(f => fs.unlinkSync(f));

  return voice;
}

// Delete cloned voice
async function deleteVoice(voiceId) {
  return await client.voices.delete(voiceId);
}
```

## Streaming Audio

```javascript
// Stream audio in real-time
async function streamAudio(text, voiceId, onChunk) {
  const audioStream = await client.generate({
    voice: voiceId,
    text: text,
    model_id: 'eleven_multilingual_v2',
    stream: true
  });

  for await (const chunk of audioStream) {
    onChunk(chunk);
  }
}

// Stream to file with progress
async function streamToFile(text, voiceId, outputPath, onProgress) {
  const writeStream = fs.createWriteStream(outputPath);
  let bytesWritten = 0;

  const audioStream = await client.generate({
    voice: voiceId,
    text: text,
    stream: true
  });

  for await (const chunk of audioStream) {
    writeStream.write(chunk);
    bytesWritten += chunk.length;
    if (onProgress) onProgress(bytesWritten);
  }

  writeStream.end();
  return outputPath;
}
```

## Speech-to-Speech

```javascript
// Convert speech with different voice
async function speechToSpeech(audioPath, voiceId, outputPath) {
  const audioBuffer = fs.readFileSync(audioPath);

  const response = await client.speechToSpeech.convert(voiceId, {
    audio: audioBuffer,
    model_id: 'eleven_english_sts_v2'
  });

  const chunks = [];
  for await (const chunk of response) {
    chunks.push(chunk);
  }

  fs.writeFileSync(outputPath, Buffer.concat(chunks));
  return outputPath;
}
```

## Audio Projects

```javascript
// Create audiobook
async function createAudiobook(chapters, voiceId, outputDir) {
  const results = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const outputPath = `${outputDir}/chapter_${i + 1}.mp3`;

    await textToSpeech(chapter.text, voiceId, outputPath);

    results.push({
      chapter: i + 1,
      title: chapter.title,
      file: outputPath
    });

    // Rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  return results;
}

// Generate podcast
async function generatePodcast(script, voices, outputPath) {
  const segments = [];

  for (const line of script) {
    const voiceId = voices[line.speaker];
    const audio = await textToSpeechAdvanced(line.text, {
      voiceId,
      stability: 0.7,
      similarityBoost: 0.8
    });
    segments.push(audio);
  }

  // Concatenate segments (requires ffmpeg)
  const combined = Buffer.concat(segments);
  fs.writeFileSync(outputPath, combined);
  return outputPath;
}
```

## Voice Library

```javascript
// Popular pre-made voices
const POPULAR_VOICES = {
  rachel: '21m00Tcm4TlvDq8ikWAM', // Calm, narrative
  domi: 'AZnzlk1XvdvUeBnXmlld',   // Strong, confident
  bella: 'EXAVITQu4vr4xnSDxMaL',  // Soft, friendly
  antoni: 'ErXwobaYiN019PkySvjV', // Well-rounded
  elli: 'MF3mGyEYCl7XYWbV9V6O',   // Emotional range
  josh: 'TxGEqnHWrfWFTfGW9XjX',   // Deep, narrative
  arnold: 'VR6AewLTigWG4xSOukaG', // Crisp, assertive
  adam: 'pNInz6obpgDQGcFmaJgB',   // Deep, authoritative
  sam: 'yoZ06aMxZJJ28mfd3POQ'     // Raspy, dynamic
};

// Get voice by name
function getVoiceId(name) {
  return POPULAR_VOICES[name.toLowerCase()];
}
```

## Usage Examples

```javascript
// Basic TTS
await textToSpeech('Hello, world!', POPULAR_VOICES.rachel, 'hello.mp3');

// With custom settings
const audio = await textToSpeechAdvanced('Welcome to our podcast!', {
  voiceId: POPULAR_VOICES.josh,
  stability: 0.8,
  similarityBoost: 0.9,
  style: 0.5
});
fs.writeFileSync('intro.mp3', audio);

// List available voices
const voices = await listVoices();
voices.forEach(v => console.log(`${v.name}: ${v.id}`));

// Clone a voice
const myVoice = await cloneVoice('My Voice', 'Personal voice clone', [
  'sample1.mp3', 'sample2.mp3', 'sample3.mp3'
]);

// Create audiobook
await createAudiobook([
  { title: 'Introduction', text: 'Welcome to this audiobook...' },
  { title: 'Chapter 1', text: 'It was a dark and stormy night...' }
], POPULAR_VOICES.bella, './audiobook');

// Stream with progress
await streamToFile('Long text...', POPULAR_VOICES.adam, 'output.mp3',
  (bytes) => console.log(`Written ${bytes} bytes`)
);
```

## Rate Limits & Quotas

```javascript
// Check subscription info
async function getSubscriptionInfo() {
  const user = await client.user.getSubscription();
  return {
    tier: user.tier,
    characterCount: user.character_count,
    characterLimit: user.character_limit,
    voiceLimit: user.voice_limit
  };
}

// Character count helper
function countCharacters(text) {
  return text.length;
}
```
