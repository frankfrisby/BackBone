#!/usr/bin/env node

/**
 * Goals Voice App - OpenAI Realtime API
 *
 * Standalone voice conversation for setting life goals.
 * Uses microphone input and speaker output for real-time voice interaction.
 *
 * Usage: node scripts/goals-voice.js
 */

import "dotenv/config";
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createInterface } from "readline";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const GOALS_PATH = path.join(DATA_DIR, "goals.json");

// OpenAI Realtime API
const REALTIME_API_URL = "wss://api.openai.com/v1/realtime";
const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m"
};

const log = {
  info: (msg) => console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[OK]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  ai: (msg) => process.stdout.write(`${colors.magenta}${msg}${colors.reset}`),
  user: (msg) => console.log(`${colors.blue}[You]${colors.reset} ${msg}`)
};

/**
 * Load current goals
 */
function loadGoals() {
  try {
    if (fs.existsSync(GOALS_PATH)) {
      return JSON.parse(fs.readFileSync(GOALS_PATH, "utf-8"));
    }
  } catch (err) {
    log.error(`Failed to load goals: ${err.message}`);
  }
  return { goals: [], lastUpdated: null };
}

/**
 * Save goals
 */
function saveGoals(goals) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(GOALS_PATH, JSON.stringify({
    goals,
    lastUpdated: new Date().toISOString()
  }, null, 2));
}

/**
 * Build system prompt
 */
function buildSystemPrompt(currentGoals) {
  const goalsContext = currentGoals.length > 0
    ? `Current goals:\n${currentGoals.map((g, i) => `${i + 1}. ${g.title} (${g.category})`).join("\n")}`
    : "No goals currently set.";

  return `You are a warm, encouraging life coach helping someone define their personal goals.

${goalsContext}

Your approach:
1. Start by warmly greeting them and asking what matters most in their life right now
2. Listen carefully and ask clarifying questions
3. Help them turn vague aspirations into specific, measurable goals
4. Categorize each goal: finance, health, family, career, growth, or education
5. Discuss priority (what's most urgent vs important)
6. Suggest milestones to track progress

Be conversational and supportive. Ask one focused question at a time.
When they're ready to finish, summarize the goals you've discussed.

Keep responses concise - this is a voice conversation, not a written essay.`;
}

/**
 * Parse goals from conversation transcript
 */
function parseGoalsFromTranscript(transcript) {
  // This would ideally use GPT to extract structured goals from the conversation
  // For now, return empty - goals would be saved via separate extraction call
  return [];
}

/**
 * Main voice session
 */
async function startVoiceSession() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log("\n");
    log.error("OpenAI API key not found!");
    console.log("\n  To use voice goals, you need an OpenAI API key.");
    console.log("  Add it to your .env file:");
    console.log(`\n    ${colors.cyan}OPENAI_API_KEY=sk-your-key-here${colors.reset}\n`);
    console.log("  Or run: /models in BACKBONE to set up your API keys.\n");
    process.exit(1);
  }

  const currentGoals = loadGoals().goals || [];

  console.log("\n");
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log(`${colors.bright}       BACKBONE Goals Voice Coach       ${colors.reset}`);
  console.log(`${colors.bright}========================================${colors.reset}`);
  console.log("\n");

  if (currentGoals.length > 0) {
    log.info(`You have ${currentGoals.length} existing goals`);
    currentGoals.forEach((g, i) => {
      console.log(`  ${i + 1}. ${g.title} (${g.category})`);
    });
    console.log("");
  } else {
    log.info("No goals set yet - let's create some!");
  }

  log.info("Connecting to OpenAI Realtime API...");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${REALTIME_API_URL}?model=${REALTIME_MODEL}`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    const transcript = [];
    let isListening = false;

    ws.on("open", () => {
      log.success("Connected to OpenAI Realtime API");
      console.log("");

      // Configure session for text mode (audio requires native bindings)
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text"],
          instructions: buildSystemPrompt(currentGoals),
          voice: "alloy"
        }
      }));

      // Start the conversation
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text"]
          }
        }));
      }, 500);
    });

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());

        switch (event.type) {
          case "session.created":
            log.success("Session started");
            break;

          case "session.updated":
            log.info("Ready for conversation");
            console.log(`\n${colors.dim}Type your message and press Enter. Type 'quit' to exit.${colors.reset}\n`);
            startTextInput(ws, transcript);
            break;

          case "response.text.delta":
            if (event.delta) {
              log.ai(event.delta);
            }
            break;

          case "response.text.done":
            if (event.text) {
              transcript.push({ role: "assistant", content: event.text });
              console.log("\n");
            }
            break;

          case "response.done":
            // Response complete, ready for next input
            break;

          case "error":
            log.error(event.error?.message || JSON.stringify(event.error));
            break;
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on("error", (err) => {
      log.error(`Connection error: ${err.message}`);
      reject(err);
    });

    ws.on("close", () => {
      log.info("Session ended");
      console.log("\n");

      // Save transcript
      if (transcript.length > 0) {
        const transcriptPath = path.join(DATA_DIR, "goals-conversation.json");
        fs.writeFileSync(transcriptPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          transcript
        }, null, 2));
        log.success(`Conversation saved to ${transcriptPath}`);
      }

      resolve({ transcript });
    });

    // Handle Ctrl+C
    process.on("SIGINT", () => {
      console.log("\n");
      log.info("Ending session...");
      ws.close();
    });
  });
}

/**
 * Text input mode (fallback when audio not available)
 */
function startTextInput(ws, transcript) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = () => {
    rl.question(`${colors.blue}You: ${colors.reset}`, (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === "quit" || trimmed.toLowerCase() === "exit") {
        rl.close();
        ws.close();
        return;
      }

      if (trimmed) {
        transcript.push({ role: "user", content: trimmed });

        // Send to OpenAI
        ws.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{
              type: "input_text",
              text: trimmed
            }]
          }
        }));

        ws.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text"]
          }
        }));

        // Wait for response then prompt again
        setTimeout(prompt, 100);
      } else {
        prompt();
      }
    });
  };

  prompt();
}

// Run the voice session
startVoiceSession()
  .then(({ transcript }) => {
    if (transcript && transcript.length > 0) {
      console.log(`\n${colors.bright}Conversation Summary:${colors.reset}`);
      console.log(`${colors.dim}${transcript.length} messages exchanged${colors.reset}\n`);
    }
    process.exit(0);
  })
  .catch((err) => {
    log.error(err.message);
    process.exit(1);
  });
