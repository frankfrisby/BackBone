#!/usr/bin/env node
/**
 * Background Message Listener
 *
 * Runs continuously to check for and process Firebase messages.
 * Start this in a separate terminal: node tools/message-listener.js
 *
 * Polls every 3 minutes in idle mode, 10 seconds when active.
 */

import { getRealtimeMessaging, MESSAGE_TYPE, MESSAGE_STATUS } from "../src/services/messaging/realtime-messaging.js";
import { getAIBrain } from "../src/services/ai/ai-brain.js";
import { loadFirebaseUser } from "../src/services/firebase/firebase-auth.js";

const USER_ID = loadFirebaseUser()?.localId;
if (!USER_ID) { console.error("No Firebase user found. Run backbone and sign in first."); process.exit(1); }

// Simple AI response handler
async function handleMessage(message) {
  console.log(`\n[RECEIVED] ${message.content?.substring(0, 100)}...`);

  try {
    // Use AI Brain to generate response
    const aiBrain = getAIBrain();
    const response = await aiBrain.chat(message.content, {
      userId: USER_ID,
      channel: message.channel || "app"
    });

    return {
      content: response.content,
      type: MESSAGE_TYPE.AI
    };
  } catch (err) {
    console.error("[ERROR] AI response failed:", err.message);
    return {
      content: "I received your message but encountered an error. Please try again.",
      type: MESSAGE_TYPE.SYSTEM
    };
  }
}

async function main() {
  console.log("=".repeat(50));
  console.log("  BACKBONE MESSAGE LISTENER");
  console.log("=".repeat(50));
  console.log("");
  console.log("Polling: 3 min (idle) / 10 sec (active)");
  console.log("Press Ctrl+C to stop");
  console.log("");

  const r = getRealtimeMessaging();
  await r.initialize(USER_ID);
  r.setMessageHandler(handleMessage);

  // Log poll events
  r.on("poll-scheduled", ({ nextPollTime, interval }) => {
    const time = new Date(nextPollTime).toLocaleTimeString();
    const secs = Math.round(interval / 1000);
    console.log(`[${new Date().toLocaleTimeString()}] Next poll at ${time} (${secs}s)`);
  });

  r.on("message-received", ({ messageId, message }) => {
    console.log(`\n>>> NEW MESSAGE: ${message.content?.substring(0, 80)}...`);
  });

  r.on("message-sent", ({ messageId, content }) => {
    console.log(`<<< SENT RESPONSE (${messageId})`);
  });

  r.on("polling-mode-changed", ({ mode }) => {
    console.log(`[MODE] Switched to ${mode} polling`);
  });

  await r.startListening();
  console.log("[STARTED] Listening for messages...\n");

  // Keep process alive
  process.on("SIGINT", async () => {
    console.log("\n[STOPPING]...");
    await r.stopListening();
    process.exit(0);
  });
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
