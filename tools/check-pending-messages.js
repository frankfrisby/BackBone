#!/usr/bin/env node
/**
 * Check Firebase for pending/unanswered messages
 */

import { getRealtimeMessaging } from "../src/services/messaging/realtime-messaging.js";
import { loadFirebaseUser } from "../src/services/firebase/firebase-auth.js";

async function main() {
  const r = getRealtimeMessaging();
  const uid = loadFirebaseUser()?.localId;
  if (!uid) { console.error("No Firebase user found."); process.exit(1); }
  await r.initialize(uid);

  // Get conversation history
  const history = await r.getConversationHistory(50);

  // Find unanswered user messages
  const pending = history.filter(msg =>
    msg.type === "user" &&
    msg.status !== "completed" &&
    msg.status !== "processing"
  );

  console.log("=== RECENT MESSAGES (last 20) ===\n");
  history.slice(-20).forEach(msg => {
    const time = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "unknown";
    const status = msg.status || "no-status";
    const type = msg.type || "unknown";
    const content = (msg.content || "").substring(0, 100);
    console.log(`[${type}] ${status} | ${time}`);
    console.log(`  ${content}`);
    console.log("");
  });

  console.log("\n=== PENDING/UNANSWERED ===\n");
  if (pending.length === 0) {
    console.log("No pending messages found - all messages have been answered!");
  } else {
    console.log(`Found ${pending.length} pending message(s):\n`);
    pending.forEach(msg => {
      console.log(`ID: ${msg.id}`);
      console.log(`Status: ${msg.status}`);
      console.log(`Content: ${msg.content}`);
      console.log(`Created: ${msg.createdAt}`);
      console.log("---");
    });
  }
}

main().catch(console.error);
