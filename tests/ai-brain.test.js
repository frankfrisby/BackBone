/**
 * AI Brain Test Suite
 *
 * Verifies:
 * 1. AI Brain initializes correctly
 * 2. Context providers work
 * 3. AI generates real observations (not hardcoded)
 * 4. Actions contain real data (paths, commands, content)
 * 5. Thread persistence works
 */

import { getAIBrain } from "./ai/ai-brain.js";
import { getMultiAIConfig } from "./ai/multi-ai.js";

import { dataFile } from "./paths.js";
// Test results collector
const results = {
  passed: [],
  failed: [],
  skipped: []
};

const test = (name, fn) => {
  try {
    const result = fn();
    if (result === "skip") {
      results.skipped.push(name);
      console.log(`  SKIP: ${name}`);
    } else {
      results.passed.push(name);
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`  FAIL: ${name} - ${error.message}`);
  }
};

const testAsync = async (name, fn) => {
  try {
    const result = await fn();
    if (result === "skip") {
      results.skipped.push(name);
      console.log(`  SKIP: ${name}`);
    } else {
      results.passed.push(name);
      console.log(`  PASS: ${name}`);
    }
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`  FAIL: ${name} - ${error.message}`);
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

/**
 * Run all AI Brain tests
 */
export const testAIBrain = async () => {
  console.log("\n=== AI Brain Test Suite ===\n");

  // Check if AI is available
  const config = getMultiAIConfig();
  const hasAI = config.ready;

  if (!hasAI) {
    console.log("WARNING: No AI API keys configured. Some tests will be skipped.\n");
  }

  // 1. Initialization Tests
  console.log("1. Initialization Tests:");

  test("AI Brain singleton exists", () => {
    const brain = getAIBrain();
    assert(brain !== null, "Brain should not be null");
    assert(typeof brain.think === "function", "Brain should have think method");
    assert(typeof brain.generateActions === "function", "Brain should have generateActions method");
  });

  test("AI Brain has thread structure", () => {
    const brain = getAIBrain();
    assert(brain.thread !== undefined, "Brain should have thread");
    assert(Array.isArray(brain.thread.messages), "Thread should have messages array");
  });

  test("AI Brain can register context providers", () => {
    const brain = getAIBrain();

    // Register test providers
    brain.registerContextProvider("testPortfolio", () => ({
      equity: "$125,432",
      positions: [
        { symbol: "NVDA", shares: 50, pnl: "+12.5%" },
        { symbol: "AAPL", shares: 100, pnl: "-2.3%" }
      ]
    }));

    brain.registerContextProvider("testGoals", () => ([
      { title: "Save $50k for house", progress: 45 },
      { title: "Run a marathon", progress: 20 }
    ]));

    assert(brain.contextProviders.testPortfolio, "Should have testPortfolio provider");
    assert(brain.contextProviders.testGoals, "Should have testGoals provider");
  });

  // 2. Context Gathering Tests
  console.log("\n2. Context Gathering Tests:");

  await testAsync("AI Brain gathers context from providers", async () => {
    const brain = getAIBrain();
    const context = await brain.gatherContext();

    assert(context.testPortfolio !== undefined, "Context should include testPortfolio");
    assert(context.testPortfolio.equity === "$125,432", "Portfolio equity should match");
    assert(context.testGoals.length === 2, "Should have 2 test goals");
  });

  // 3. AI Thinking Tests (requires API key)
  console.log("\n3. AI Thinking Tests:");

  await testAsync("AI Brain generates real observation", async () => {
    if (!hasAI) return "skip";

    const brain = getAIBrain();
    const result = await brain.think("What's the most important thing I should focus on right now based on my portfolio and goals?");

    assert(result.success, `Think should succeed: ${result.error || ""}`);
    assert(result.observation, "Should have observation");
    assert(result.observation.length > 20, "Observation should be substantive (>20 chars)");

    // Verify it's not a hardcoded response
    assert(!result.observation.includes("Found X"), "Should not contain template text");
    assert(!result.observation.includes("Update("), "Should not contain template text");

    console.log(`    AI Response: "${result.observation.slice(0, 100)}..."`);
  });

  await testAsync("AI Brain adds to thread", async () => {
    if (!hasAI) return "skip";

    const brain = getAIBrain();
    const initialLength = brain.thread.messages.length;

    await brain.think("Quick status check");

    assert(brain.thread.messages.length > initialLength, "Thread should grow after thinking");
  });

  // 4. Action Generation Tests
  console.log("\n4. Action Generation Tests:");

  await testAsync("AI Brain generates actions with real data", async () => {
    if (!hasAI) return "skip";

    const brain = getAIBrain();
    const result = await brain.generateActions(2);

    assert(result.success, `Action generation should succeed: ${result.error || ""}`);

    if (result.actions.length > 0) {
      const action = result.actions[0];

      console.log(`    Generated action: "${action.title}"`);
      console.log(`    Type: ${action.type}`);
      console.log(`    Rationale: "${action.rationale?.slice(0, 80) || "N/A"}..."`);

      assert(action.title, "Action should have title");
      assert(action.type, "Action should have type");

      // Verify action contains real content, not placeholders
      assert(!action.title.includes("{{"), "Title should not have placeholders");
      assert(!action.title.includes("TODO"), "Title should not be a TODO");
    }

    if (result.summary) {
      console.log(`    Summary: "${result.summary.slice(0, 100)}..."`);
    }
  });

  // 5. Thread Persistence Tests
  console.log("\n5. Thread Persistence Tests:");

  test("AI Brain saves thread to disk", () => {
    const brain = getAIBrain();
    brain.saveThread();

    // Check file exists
    const fs = await import("fs");
    const path = await import("path");
    const threadPath = dataFile("ai_brain_thread.json");

    assert(fs.existsSync(threadPath), "Thread file should exist");
  });

  test("AI Brain loads thread from disk", () => {
    const brain = getAIBrain();
    const thread = brain.loadThread();

    assert(thread !== null, "Loaded thread should not be null");
    assert(Array.isArray(thread.messages), "Thread should have messages array");
  });

  // 6. Display Data Tests
  console.log("\n6. Display Data Tests:");

  test("AI Brain provides display data", () => {
    const brain = getAIBrain();
    const data = brain.getDisplayData();

    assert(typeof data.isThinking === "boolean", "Should have isThinking");
    assert(typeof data.threadLength === "number", "Should have threadLength");
    assert(data.totalMessages !== undefined, "Should have totalMessages");
  });

  // Print Summary
  console.log("\n=== Test Summary ===");
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Skipped: ${results.skipped.length}`);

  if (results.failed.length > 0) {
    console.log("\nFailed Tests:");
    results.failed.forEach(f => {
      console.log(`  - ${f.name}: ${f.error}`);
    });
  }

  return {
    passed: results.passed.length,
    failed: results.failed.length,
    skipped: results.skipped.length,
    details: results
  };
};

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  testAIBrain().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}

export default testAIBrain;
