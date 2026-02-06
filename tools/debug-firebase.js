#!/usr/bin/env node
/**
 * Debug Firebase Messages
 * Check what messages are in Firebase and their status
 */

import { getRealtimeMessaging } from "../src/services/realtime-messaging.js";

async function main() {
  const r = getRealtimeMessaging();
  await r.initialize("OVT9OwtRQocYlhZqpOdIoxjYGy02");

  console.log("=".repeat(60));
  console.log("  FIREBASE MESSAGE DEBUG");
  console.log("=".repeat(60));

  const history = await r.getConversationHistory(30);

  // Sort by createdAt descending (newest first)
  const sorted = history.sort((a, b) =>
    new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  ).slice(0, 15);

  console.log("\n=== LAST 15 MESSAGES (newest first) ===\n");

  sorted.forEach((msg) => {
    const time = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : "unknown";
    const type = msg.type || "unknown";
    const status = msg.status || "no-status";
    const channel = msg.channel || "app";
    const isWhatsApp = channel.includes("whatsapp") || msg.source?.includes("whatsapp");
    const content = (msg.content || "").substring(0, 80);

    console.log("─".repeat(60));
    console.log(`ID: ${msg.id}`);
    console.log(`Time: ${time}`);
    console.log(`Type: ${type} | Status: ${status} | Channel: ${channel}${isWhatsApp ? " [WHATSAPP]" : ""}`);
    console.log(`Content: ${content}`);
  });

  // Find pending messages
  const pending = history.filter(msg =>
    msg.type === "user" &&
    msg.status !== "completed" &&
    msg.status !== "processing"
  );

  console.log("\n" + "=".repeat(60));
  console.log(`PENDING MESSAGES: ${pending.length}`);
  console.log("=".repeat(60));

  if (pending.length > 0) {
    pending.forEach(p => {
      console.log(`\n  ID: ${p.id}`);
      console.log(`  Status: ${p.status}`);
      console.log(`  Channel: ${p.channel || "app"}`);
      console.log(`  Content: ${p.content}`);
    });
  } else {
    console.log("\nNo pending messages - all have been answered.");
  }

  // Check realtime messaging status
  const status = r.getStatus();
  console.log("\n" + "=".repeat(60));
  console.log("REALTIME MESSAGING STATUS");
  console.log("=".repeat(60));
  console.log(`Listening: ${status.listening}`);
  console.log(`Presence: ${status.presence}`);
  console.log(`Polling Mode: ${status.pollingMode}`);
  console.log(`Next Poll: ${status.nextPollCountdown || "N/A"}`);
  console.log(`Processed Count: ${status.processedCount}`);
}

main().catch(console.error);
