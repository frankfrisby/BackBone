/**
 * WhatsApp → BACKBONE Task Execution Pipeline Tests
 *
 * Validates that:
 * 1. The WhatsApp prompt includes WORK INSTRUCTIONS for tool use
 * 2. Timeout is set to 300s (5 min) for WhatsApp tasks
 * 3. Action-word heuristic triggers background work for task-like messages
 * 4. Background work prompt mandates tool use
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "..", "src", "server.js");
const autoWorkPath = path.join(__dirname, "..", "src", "services", "messaging", "whatsapp-auto-work.js");

// Read source files once
const serverSource = fs.readFileSync(serverPath, "utf-8");
const autoWorkSource = fs.readFileSync(autoWorkPath, "utf-8");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

console.log("\n=== WhatsApp Task Pipeline Tests ===\n");

// --- Test 1: WhatsApp prompt includes WORK INSTRUCTIONS ---
console.log("server.js — WhatsApp prompt:");

test("Contains WORK INSTRUCTIONS section", () => {
  assert(serverSource.includes("WORK INSTRUCTIONS:"), "Missing WORK INSTRUCTIONS section in prompt");
});

test("Mandates WebSearch tool use", () => {
  assert(serverSource.includes("Use WebSearch to find current information"), "Missing WebSearch mandate");
});

test("Mandates MCP tools", () => {
  assert(serverSource.includes("Use MCP tools"), "Missing MCP tools mandate");
});

test("Mandates Read/Write for user files", () => {
  assert(serverSource.includes("Use Read/Write to check and update user files"), "Missing Read/Write mandate");
});

test("Tells AI to save findings to files", () => {
  assert(serverSource.includes("save key findings to a file"), "Missing file persistence instruction");
});

test("Tells AI to report what it actually did", () => {
  assert(serverSource.includes("WHAT YOU ACTUALLY DID"), "Missing action reporting instruction");
});

// --- Test 2: Timeout set to 300s ---
console.log("\nserver.js — Timeout:");

test("WhatsApp agentic task timeout is 300000ms (5 min)", () => {
  // Find the WhatsApp handler's executeAgenticTask call with the 300000 timeout
  const timeoutMatch = serverSource.match(/claudeTimeoutMs:\s*300000\s*\/\/\s*5 minutes for WhatsApp/);
  assert(timeoutMatch, "Missing claudeTimeoutMs: 300000 for WhatsApp tasks");
});

// --- Test 3: Action-word heuristic for background work ---
console.log("\nserver.js — Background work trigger:");

test("Has action word regex for task detection", () => {
  assert(serverSource.includes("research|find|check|look"), "Missing action word regex");
});

test("Checks content length > 15 for task-like messages", () => {
  assert(serverSource.includes("content.length > 15"), "Missing content length check");
});

test("Falls back to general-task intent when no goal/project match", () => {
  assert(serverSource.includes('"general-task"'), "Missing general-task fallback intent");
});

test("Triggers background work for looksLikeTask", () => {
  assert(serverSource.includes("looksLikeTask"), "Missing looksLikeTask variable");
  // Both single-message and multi-message paths
  const matches = serverSource.match(/looksLikeTask/g);
  assert(matches && matches.length >= 4, `Expected looksLikeTask in both code paths, found ${matches?.length || 0} occurrences`);
});

// --- Test 4: Background work prompt mandates tool use ---
console.log("\nwhatsapp-auto-work.js — Background work prompt:");

test("Contains MANDATORY tool-use instruction", () => {
  assert(autoWorkSource.includes("MANDATORY: You MUST use tools"), "Missing MANDATORY tool-use instruction");
});

test("Mandates WebSearch in background prompt", () => {
  assert(autoWorkSource.includes("Use WebSearch for current data"), "Missing WebSearch in background prompt");
});

test("Mandates Read for user files in background prompt", () => {
  assert(autoWorkSource.includes("Use Read to check existing user files"), "Missing Read in background prompt");
});

test("Mandates Write for persistence in background prompt", () => {
  assert(autoWorkSource.includes("Use Write to save your findings"), "Missing Write in background prompt");
});

test("Background work timeout is 300000ms", () => {
  assert(autoWorkSource.includes("timeout: 300000"), "Missing 300000 timeout in background work");
});

// --- Test 5: Action word regex correctness ---
console.log("\nAction word regex validation:");

const actionWords = /\b(research|find|check|look\s?up|analyze|analyse|create|build|write|schedule|compare|investigate|review|summarize|calculate|track|monitor)\b/i;

const shouldMatch = [
  "research the best index funds for retirement",
  "find me a good restaurant nearby",
  "check my portfolio performance this week",
  "look up NVDA earnings date",
  "analyze my sleep patterns",
  "create a budget spreadsheet",
  "compare Tesla vs Rivian stock",
  "investigate why my health score dropped",
  "review my goals progress",
  "summarize the latest AI news",
  "calculate my net worth growth",
  "track my daily steps this month",
  "monitor AAPL price movements",
];

const shouldNotMatch = [
  "hello",
  "thanks",
  "good morning",
  "yes",
  "ok sounds good",
  "lol",
  "short msg",  // < 15 chars
];

for (const msg of shouldMatch) {
  test(`Matches task: "${msg.slice(0, 50)}"`, () => {
    assert(actionWords.test(msg) && msg.length > 15, `Should match as task: "${msg}"`);
  });
}

for (const msg of shouldNotMatch) {
  test(`Skips non-task: "${msg}"`, () => {
    const isTask = actionWords.test(msg) && msg.length > 15;
    assert(!isTask, `Should NOT match as task: "${msg}"`);
  });
}

// --- Summary ---
console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
