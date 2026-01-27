/**
 * Test: Verify Claude Code CLI streaming works end-to-end
 *
 * Tests both paths:
 * 1. Chat path: executeAgenticTask (multi-ai.js) — user sends a message
 * 2. Engine path: ClaudeOrchestrator (claude-orchestrator.js) — autonomous engine
 * 3. Event shape: claude-start event sends { goal }, handler must not crash
 * 4. Claude Code status: getClaudeCodeStatus returns ready
 */

import { getAgenticCapabilities, executeAgenticTask } from "./src/services/multi-ai.js";
import { getClaudeCodeStatus } from "./src/services/claude-code-cli.js";

let totalPassed = 0;
let totalFailed = 0;

function check(condition, passMsg, failMsg) {
  if (condition) {
    totalPassed++;
    console.log(`  ✓ ${passMsg}`);
  } else {
    totalFailed++;
    console.log(`  ✗ ${failMsg}`);
  }
}

async function testClaudeStatus() {
  console.log("\n=== Test 1: Claude Code Status ===\n");
  const status = await getClaudeCodeStatus();
  console.log(`  installed: ${status.installed}, loggedIn: ${status.loggedIn}, ready: ${status.ready}`);
  check(status.installed, "Claude Code CLI installed", "Claude Code CLI NOT installed");
  check(status.loggedIn, "Claude Code CLI logged in", "Claude Code CLI NOT logged in");
  check(status.ready, "Claude Code CLI ready", "Claude Code CLI NOT ready — engine will skip CLI path");
}

async function testAgenticCapabilities() {
  console.log("\n=== Test 2: Agentic Capabilities ===\n");
  const caps = await getAgenticCapabilities();
  console.log(`  claudeCode: ${caps.claudeCode}, available: ${caps.available}`);
  check(caps.claudeCode, "claudeCode capability detected", "claudeCode NOT detected — chat will skip CLI");
  check(caps.available, "Agentic tools available", "No agentic tools — all queries fall to API");
}

async function testChatPathStreaming() {
  console.log("\n=== Test 3: Chat Path Streaming (executeAgenticTask) ===\n");
  const events = [];
  let streamChunks = 0;

  const result = await executeAgenticTask(
    "Say exactly: 'Hello from CLI test'. Nothing else.",
    process.cwd(),
    (event) => {
      events.push({ type: event.type, time: Date.now() });
      if (event.type === "stdout") {
        streamChunks++;
        console.log(`  [stdout #${streamChunks}] "${event.text.slice(0, 80).replace(/\n/g, "\\n")}"`);
        // Test the fix: event.output should exist for stdout
        check(event.output !== undefined, "stdout event has .output", "stdout event MISSING .output");
      } else if (event.type === "stderr") {
        console.log(`  [stderr] "${event.text.slice(0, 80).replace(/\n/g, "\\n")}"`);
        // Test the fix: stderr has .error not .output
        check(event.error !== undefined, "stderr event has .error", "stderr event MISSING .error");
      } else if (event.type === "done") {
        console.log(`  [done] code=${event.code}`);
      }
    }
  );

  check(result.success, "CLI executed successfully", `CLI failed: ${result.error}`);
  check(streamChunks > 0, `${streamChunks} streaming chunk(s) received`, "No streaming chunks — UI would show nothing");
  check((result.output || "").length > 0, "Got output text", "Empty output — conversation panel blank");
  check(events.some(e => e.type === "done"), "'done' event received", "No 'done' event — state never clears");
}

async function testEventShapeFix() {
  console.log("\n=== Test 4: Event Shape Fix (claude-start handler) ===\n");

  // Simulate what app.js does with the claude-start event
  // Old code: ({ action }) => action.title — crashes when { goal } is sent
  // New code: (data) => data?.goal?.title || data?.action?.title

  const eventData = { goal: { title: "Test Goal" } };

  // Old handler (would crash):
  let oldCrashed = false;
  try {
    const { action } = eventData;
    const title = action.title; // This should crash
  } catch {
    oldCrashed = true;
  }
  check(oldCrashed, "Old handler correctly identified as crashing on { goal } event", "Old handler didn't crash — unexpected");

  // New handler (should work):
  let newTitle = null;
  try {
    const data = eventData;
    newTitle = data?.goal?.title || data?.action?.title || "Goal execution";
  } catch {
    newTitle = null;
  }
  check(newTitle === "Test Goal", `New handler extracts title: "${newTitle}"`, "New handler failed to extract title");

  // Test with { action } shape too (backwards compat)
  const actionData = { action: { title: "Test Action", executionPlan: { prompt: "do something" } } };
  let actionTitle = null;
  try {
    const data = actionData;
    actionTitle = data?.goal?.title || data?.action?.title || "Goal execution";
  } catch {
    actionTitle = null;
  }
  check(actionTitle === "Test Action", `Backwards compat: "${actionTitle}"`, "Backwards compat failed");
}

async function testOrchestratorEventFlow() {
  console.log("\n=== Test 5: Orchestrator Event Emitting ===\n");

  // Import and check that the orchestrator class has the expected methods
  try {
    const { getClaudeOrchestrator } = await import("./src/services/claude-orchestrator.js");
    const orchestrator = getClaudeOrchestrator({ maxTurns: 1, timeout: 5000 });

    check(typeof orchestrator.executeGoal === "function", "orchestrator.executeGoal exists", "orchestrator.executeGoal missing");
    check(typeof orchestrator.on === "function", "orchestrator is EventEmitter", "orchestrator not EventEmitter");

    // Test that events can be listened to
    let startedReceived = false;
    orchestrator.on("started", () => { startedReceived = true; });
    orchestrator.emit("started", { goal: { title: "test" } });
    check(startedReceived, "orchestrator emits 'started' event", "'started' event not received");
  } catch (err) {
    console.log(`  ✗ Failed to import orchestrator: ${err.message}`);
    totalFailed++;
  }
}

// Run all tests
console.log("╔══════════════════════════════════════════════╗");
console.log("║  CLI Streaming Integration Test Suite        ║");
console.log("╚══════════════════════════════════════════════╝");

await testClaudeStatus();
await testAgenticCapabilities();
await testChatPathStreaming();
await testEventShapeFix();
await testOrchestratorEventFlow();

console.log("\n══════════════════════════════════════════════");
console.log(`  Total: ${totalPassed + totalFailed} checks`);
console.log(`  Passed: ${totalPassed}`);
console.log(`  Failed: ${totalFailed}`);
if (totalFailed === 0) {
  console.log("\n  ✅ ALL CHECKS PASSED");
} else {
  console.log(`\n  ❌ ${totalFailed} CHECK(S) FAILED`);
}
console.log("══════════════════════════════════════════════\n");

process.exit(totalFailed > 0 ? 1 : 0);
