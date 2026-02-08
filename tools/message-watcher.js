#!/usr/bin/env node
/**
 * Message Watcher with Claude Code Integration
 *
 * Watches Firebase for incoming messages and routes them to Claude Code for processing.
 * Runs in background, checks every 3 minutes (idle) or 10 seconds (active).
 *
 * Start: node tools/message-watcher.js
 */

import { spawn } from "child_process";
import { getRealtimeMessaging, MESSAGE_TYPE, MESSAGE_STATUS } from "../src/services/messaging/realtime-messaging.js";
import { loadFirebaseUser } from "../src/services/firebase/firebase-auth.js";

const USER_ID = loadFirebaseUser()?.localId;
if (!USER_ID) { console.error("No Firebase user found. Run backbone and sign in first."); process.exit(1); }

/**
 * Invoke Claude Code CLI to answer a question
 */
async function askClaudeCode(question) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`[CLAUDE] Asking: ${question.substring(0, 60)}...`);

    // Use claude CLI with --print flag to get response
    const claude = spawn("claude", [
      "--print",
      "--output-format", "text",
      "-p", question
    ], {
      shell: true,
      cwd: process.cwd()
    });

    let output = "";
    let error = "";

    claude.stdout.on("data", (data) => {
      output += data.toString();
    });

    claude.stderr.on("data", (data) => {
      error += data.toString();
    });

    claude.on("close", (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (code === 0 && output.trim()) {
        console.log(`[CLAUDE] Response received (${elapsed}s)`);
        resolve(output.trim());
      } else {
        console.error(`[CLAUDE] Error (code ${code}): ${error}`);
        reject(new Error(error || "Claude CLI failed"));
      }
    });

    claude.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Process a message using Claude Code
 */
async function handleMessage(message) {
  const question = message.content || "";
  console.log(`\n${"=".repeat(50)}`);
  console.log(`[RECEIVED] ${new Date().toLocaleString()}`);
  console.log(`[QUESTION] ${question}`);
  console.log(`${"=".repeat(50)}`);

  try {
    // Context-aware prompt for Claude
    const prompt = `You are BACKBONE AI assistant. The user sent this message via WhatsApp:

"${question}"

Answer helpfully and concisely. You have access to the user's goals, portfolio, and life data.`;

    const response = await askClaudeCode(prompt);

    console.log(`\n[RESPONSE] ${response.substring(0, 200)}...`);

    return {
      content: response,
      type: MESSAGE_TYPE.AI
    };
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    return {
      content: `I received your message but encountered an error: ${err.message}`,
      type: MESSAGE_TYPE.SYSTEM
    };
  }
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════╗
║     BACKBONE MESSAGE WATCHER + CLAUDE CODE       ║
╠══════════════════════════════════════════════════╣
║  Polls Firebase for messages                      ║
║  Routes to Claude Code CLI for answers            ║
║  Sends responses back via WhatsApp                ║
╠══════════════════════════════════════════════════╣
║  Idle: 3 min | Active: 10 sec                     ║
║  Press Ctrl+C to stop                             ║
╚══════════════════════════════════════════════════╝
`);

  const r = getRealtimeMessaging();
  await r.initialize(USER_ID);
  r.setMessageHandler(handleMessage);

  // Status updates
  r.on("poll-scheduled", ({ nextPollTime }) => {
    const time = new Date(nextPollTime).toLocaleTimeString();
    console.log(`[${new Date().toLocaleTimeString()}] Next check: ${time}`);
  });

  r.on("message-sent", ({ messageId }) => {
    console.log(`[SENT] Response delivered (${messageId})`);
  });

  r.on("polling-mode-changed", ({ mode }) => {
    console.log(`[MODE] ${mode === "active" ? "⚡ ACTIVE (10s)" : "💤 IDLE (3min)"}`);
  });

  await r.startListening();
  console.log(`[STARTED] Watching for messages...\n`);

  // Keep alive
  process.on("SIGINT", async () => {
    console.log("\n[STOPPING]...");
    await r.stopListening();
    process.exit(0);
  });
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
