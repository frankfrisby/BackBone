/**
 * Quick test script for AI Brain
 * Run with: node test-ai-brain.js
 */

// Load environment variables first
import "dotenv/config";

import { getAIBrain } from "./src/services/ai-brain.js";
import { getMultiAIConfig, getAIStatus } from "./src/services/multi-ai.js";
import { getAPIQuotaMonitor, BILLING_URLS } from "./src/services/api-quota-monitor.js";

async function main() {
  console.log("=== AI Brain Quick Test ===\n");

  // Check API availability
  const config = getMultiAIConfig();
  console.log("API Status:");
  console.log(`  OpenAI: ${config.gptThinking.ready ? "Ready" : "Missing API key"}`);
  console.log(`  Claude: ${config.claude.ready ? "Ready" : "Missing API key"}`);
  console.log();

  if (!config.ready) {
    console.log("ERROR: No AI API keys configured. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env");
    process.exit(1);
  }

  // Initialize AI Brain
  const brain = getAIBrain();
  console.log("AI Brain initialized.");
  console.log(`  Thread messages: ${brain.thread.messages.length}`);
  console.log();

  // Register test context
  brain.registerContextProvider("portfolio", () => ({
    connected: true,
    equity: 125432,
    dayChange: "+2.3%",
    positions: [
      { symbol: "NVDA", shares: 50, todayChange: "+5.2%", totalPnL: "+12.5%" },
      { symbol: "AAPL", shares: 100, todayChange: "-1.1%", totalPnL: "-2.3%" },
      { symbol: "MSFT", shares: 75, todayChange: "+0.8%", totalPnL: "+8.7%" }
    ]
  }));

  brain.registerContextProvider("goals", () => ([
    { title: "Save $50k for house down payment", progress: 45, category: "financial" },
    { title: "Run a marathon", progress: 20, category: "health" }
  ]));

  brain.registerContextProvider("health", () => ({
    connected: true,
    sleep: { score: 72, duration: "7h 15m" },
    readiness: { score: 68 }
  }));

  // Test 1: Think (generate observation)
  console.log("Test 1: AI Brain Think");
  console.log("  Asking AI to analyze current state...\n");

  const thinkResult = await brain.think();

  if (thinkResult.success) {
    console.log("  SUCCESS - AI Generated Observation:");
    console.log("  ─".repeat(30));
    console.log(`  ${thinkResult.observation}`);
    console.log("  ─".repeat(30));
    console.log(`  Model: ${thinkResult.model || "Unknown"}`);
  } else {
    console.log(`  FAILED: ${thinkResult.error}`);
  }
  console.log();

  // Test 2: Generate Actions
  console.log("Test 2: AI Brain Generate Actions");
  console.log("  Asking AI to suggest 2 actions...\n");

  const actionsResult = await brain.generateActions(2);

  if (actionsResult.success) {
    console.log("  SUCCESS - AI Generated Actions:");
    console.log("  ─".repeat(30));

    if (actionsResult.actions.length > 0) {
      actionsResult.actions.forEach((action, i) => {
        console.log(`  ${i + 1}. ${action.title}`);
        console.log(`     Type: ${action.type}`);
        console.log(`     Priority: ${action.priority}`);
        console.log(`     Rationale: ${action.rationale || "N/A"}`);
        console.log();
      });
    } else {
      console.log("  (No actions suggested)");
    }

    if (actionsResult.summary) {
      console.log(`  Summary: ${actionsResult.summary}`);
    }
    console.log("  ─".repeat(30));
  } else {
    console.log(`  FAILED: ${actionsResult.error}`);
  }
  console.log();

  // Test 3: Thread persistence
  console.log("Test 3: Thread Persistence");
  console.log(`  Messages in thread: ${brain.thread.messages.length}`);
  console.log(`  Total messages ever: ${brain.thread.totalMessages}`);

  // Save thread
  brain.saveThread();
  console.log("  Thread saved to disk.");
  console.log();

  // Test 4: Quota Monitor Status
  console.log("Test 4: Quota Monitor Status");
  const quotaMonitor = getAPIQuotaMonitor();
  const quotaStatus = quotaMonitor.getStatus();
  const aiStatus = getAIStatus();

  console.log(`  OpenAI Quota Exceeded: ${quotaStatus.openai.quotaExceeded ? "YES" : "No"}`);
  console.log(`  Claude Quota Exceeded: ${quotaStatus.anthropic.quotaExceeded ? "YES" : "No"}`);

  if (quotaStatus.openai.quotaExceeded) {
    console.log();
    console.log("  ┌────────────────────────────────────────────────┐");
    console.log("  │  ⚠️  GPT-5.2 Tokens Exceeded                    │");
    console.log("  │                                                │");
    console.log("  │  Add credits to continue using AI features    │");
    console.log("  │                                                │");
    console.log("  │  Billing URL:                                  │");
    console.log(`  │  ${BILLING_URLS.openai}  │`);
    console.log("  └────────────────────────────────────────────────┘");
  }

  if (aiStatus.gptThinking.quotaExceeded) {
    console.log();
    console.log("  AI Status shows quota exceeded - alert will display in app");
  }
  console.log();

  console.log("=== Tests Complete ===");
}

main().catch(err => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
