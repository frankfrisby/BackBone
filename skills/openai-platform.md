# OpenAI Platform Skill

Connect to OpenAI models and platform services.

## Dependencies
```bash
npm install openai
```

## Setup

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
```

## Chat Completions

```javascript
// Basic chat completion
async function chat(messages, options = {}) {
  const response = await openai.chat.completions.create({
    model: options.model || 'gpt-4o',
    messages: messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.maxTokens || 4096
  });

  return response.choices[0].message.content;
}

// Simple prompt
async function prompt(text, systemPrompt = null) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: text });

  return await chat(messages);
}

// Conversation helper
class Conversation {
  constructor(systemPrompt = null, model = 'gpt-4o') {
    this.messages = [];
    this.model = model;
    if (systemPrompt) {
      this.messages.push({ role: 'system', content: systemPrompt });
    }
  }

  async send(message) {
    this.messages.push({ role: 'user', content: message });

    const response = await openai.chat.completions.create({
      model: this.model,
      messages: this.messages
    });

    const reply = response.choices[0].message.content;
    this.messages.push({ role: 'assistant', content: reply });

    return reply;
  }

  clear() {
    const system = this.messages.find(m => m.role === 'system');
    this.messages = system ? [system] : [];
  }
}
```

## Streaming

```javascript
// Stream chat response
async function streamChat(messages, onChunk) {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: messages,
    stream: true
  });

  let fullContent = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullContent += content;
    onChunk(content);
  }

  return fullContent;
}
```

## Function Calling

```javascript
// Define functions
const functions = [
  {
    name: 'get_weather',
    description: 'Get the current weather in a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location']
    }
  }
];

// Chat with function calling
async function chatWithFunctions(message, availableFunctions) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: message }],
    tools: functions.map(f => ({ type: 'function', function: f })),
    tool_choice: 'auto'
  });

  const responseMessage = response.choices[0].message;

  if (responseMessage.tool_calls) {
    for (const toolCall of responseMessage.tool_calls) {
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      if (availableFunctions[functionName]) {
        const result = await availableFunctions[functionName](functionArgs);
        return { functionCalled: functionName, args: functionArgs, result };
      }
    }
  }

  return { content: responseMessage.content };
}
```

## Embeddings

```javascript
// Generate embeddings
async function createEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });

  return response.data[0].embedding;
}

// Batch embeddings
async function createEmbeddings(texts) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts
  });

  return response.data.map(d => d.embedding);
}

// Cosine similarity
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Semantic search
async function semanticSearch(query, documents) {
  const queryEmbedding = await createEmbedding(query);
  const docEmbeddings = await createEmbeddings(documents);

  const results = documents.map((doc, i) => ({
    document: doc,
    similarity: cosineSimilarity(queryEmbedding, docEmbeddings[i])
  }));

  return results.sort((a, b) => b.similarity - a.similarity);
}
```

## Image Generation (DALL-E)

```javascript
// Generate image
async function generateImage(prompt, options = {}) {
  const response = await openai.images.generate({
    model: options.model || 'dall-e-3',
    prompt: prompt,
    size: options.size || '1024x1024',
    quality: options.quality || 'standard',
    n: options.count || 1
  });

  return response.data.map(img => img.url);
}

// Generate and save
async function generateAndSaveImage(prompt, outputPath, options = {}) {
  const urls = await generateImage(prompt, options);
  const response = await fetch(urls[0]);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  return outputPath;
}

// Image variations
async function createVariation(imagePath) {
  const response = await openai.images.createVariation({
    image: fs.createReadStream(imagePath),
    n: 1,
    size: '1024x1024'
  });

  return response.data[0].url;
}

// Edit image
async function editImage(imagePath, maskPath, prompt) {
  const response = await openai.images.edit({
    image: fs.createReadStream(imagePath),
    mask: fs.createReadStream(maskPath),
    prompt: prompt,
    size: '1024x1024'
  });

  return response.data[0].url;
}
```

## Vision (GPT-4 Vision)

```javascript
// Analyze image
async function analyzeImage(imageUrl, prompt) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    }]
  });

  return response.choices[0].message.content;
}

// Analyze local image
async function analyzeLocalImage(imagePath, prompt) {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
      ]
    }]
  });

  return response.choices[0].message.content;
}
```

## Audio (Whisper & TTS)

```javascript
// Transcribe audio
async function transcribe(audioPath, options = {}) {
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    language: options.language,
    response_format: options.format || 'text'
  });

  return response;
}

// Translate audio to English
async function translateAudio(audioPath) {
  const response = await openai.audio.translations.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1'
  });

  return response.text;
}

// Text-to-speech
async function textToSpeech(text, outputPath, options = {}) {
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: options.voice || 'alloy', // alloy, echo, fable, onyx, nova, shimmer
    input: text,
    speed: options.speed || 1.0
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}
```

## Assistants API

```javascript
// Create assistant
async function createAssistant(name, instructions, tools = []) {
  const assistant = await openai.beta.assistants.create({
    name: name,
    instructions: instructions,
    model: 'gpt-4o',
    tools: tools
  });

  return assistant;
}

// Create thread and run
async function runAssistant(assistantId, message) {
  const thread = await openai.beta.threads.create();

  await openai.beta.threads.messages.create(thread.id, {
    role: 'user',
    content: message
  });

  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistantId
  });

  // Wait for completion
  let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  while (runStatus.status !== 'completed') {
    await new Promise(r => setTimeout(r, 1000));
    runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
  }

  const messages = await openai.beta.threads.messages.list(thread.id);
  return messages.data[0].content[0].text.value;
}
```

## Usage Examples

```javascript
// Simple chat
const response = await prompt('Explain quantum computing in simple terms');

// Conversation
const conv = new Conversation('You are a helpful coding assistant');
await conv.send('How do I read a file in Node.js?');
await conv.send('Now show me how to write to it');

// Generate image
const imageUrl = await generateImage('A futuristic city at sunset, cyberpunk style');

// Analyze image
const description = await analyzeImage(imageUrl, 'Describe this image in detail');

// Transcribe audio
const transcript = await transcribe('meeting.mp3');

// Text to speech
await textToSpeech('Hello, welcome to our application!', 'welcome.mp3', { voice: 'nova' });

// Semantic search
const results = await semanticSearch('machine learning', documents);

// Stream response
await streamChat([{ role: 'user', content: 'Write a story' }], chunk => process.stdout.write(chunk));
```
