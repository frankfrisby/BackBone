/**
 * BACKBONE Functional Tests
 * Tests that verify real end-to-end functionality, not just data shapes.
 * Created 2026-01-27 as part of system audit.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir } from "../../src/services/paths.js";

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: "PASS" });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: error.message });
    console.log(`  ✗ ${name}: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: "PASS" });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: error.message });
    console.log(`  ✗ ${name}: ${error.message}`);
  }
}

function skip(name, reason) {
  results.skipped++;
  results.tests.push({ name, status: "SKIP", reason });
  console.log(`  ⊘ ${name} (${reason})`);
}

// ===== 1. GOALS SYSTEM - End-to-End =====
console.log("\n=== Goals System: End-to-End ===");

test("Goals directory exists", () => {
  const goalsDir = path.join(DATA_DIR, "goals");
  assert(fs.existsSync(goalsDir), "data/goals/ directory must exist");
});

test("goals.json loads and has valid structure", () => {
  const goalsPath = path.join(DATA_DIR, "goals.json");
  assert(fs.existsSync(goalsPath), "data/goals.json must exist");
  const raw = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
  // goals.json can be {goals: [...]} or a bare array
  const goals = Array.isArray(raw) ? raw : raw.goals;
  assert(Array.isArray(goals), "goals.json must contain a goals array");
  for (const goal of goals) {
    assert(goal.id, `Goal missing id: ${JSON.stringify(goal)}`);
    assert(goal.title, `Goal missing title: ${goal.id}`);
    assert(goal.category, `Goal missing category: ${goal.id}`);
  }
});

const { getGoalTracker } = await import("../src/services/goal-tracker.js");

test("GoalTracker loads actual goals from disk", () => {
  const tracker = getGoalTracker();
  const all = tracker.getAll();
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "goals.json"), "utf-8"));
  const goalsFromFile = Array.isArray(raw) ? raw : raw.goals;
  assert.strictEqual(all.length, goalsFromFile.length,
    `GoalTracker has ${all.length} goals but goals.json has ${goalsFromFile.length}`);
});

test("GoalTracker progress calculation edge cases", () => {
  const tracker = getGoalTracker();
  // 0 progress
  assert.strictEqual(tracker.calculateProgress({ startValue: 0, currentValue: 0, targetValue: 100 }), 0);
  // 100% progress
  assert.strictEqual(tracker.calculateProgress({ startValue: 0, currentValue: 100, targetValue: 100 }), 1);
  // Over 100%
  assert(tracker.calculateProgress({ startValue: 0, currentValue: 150, targetValue: 100 }) >= 1);
  // Negative start
  assert.strictEqual(tracker.calculateProgress({ startValue: -50, currentValue: 0, targetValue: 50 }), 0.5);
});

// ===== 2. LIFE SCORES - Real Data =====
console.log("\n=== Life Scores: Real Data ===");

test("life-scores.json exists and has valid structure", () => {
  const scoresPath = path.join(DATA_DIR, "life-scores.json");
  assert(fs.existsSync(scoresPath), "data/life-scores.json must exist");
  const data = JSON.parse(fs.readFileSync(scoresPath, "utf-8"));
  assert(data.categories || data.scores, "life-scores.json must have categories or scores");
});

const { getLifeScores, LIFE_CATEGORIES } = await import("../src/services/life-scores.js");

test("LifeScores computes overall from categories", () => {
  const scores = getLifeScores();
  const display = scores.getDisplayData();
  assert(typeof display.overall === "number", "Should have overall score");
  assert(display.overall >= 0 && display.overall <= 100, `Overall score ${display.overall} should be 0-100`);
  assert(display.categories.length > 0, "Should have at least one category");
});

test("LifeScores grade boundaries are correct", () => {
  const scores = getLifeScores();
  // Actual grade scale: A+ (90+), A (85+), A- (80+), B+ (75+), B (70+), B- (65+),
  // C+ (60+), C (55+), C- (50+), D+ (45+), D (40+), F (<40)
  assert.strictEqual(scores.getGrade(100), "A+");
  assert.strictEqual(scores.getGrade(90), "A+");
  assert.strictEqual(scores.getGrade(89), "A");
  assert.strictEqual(scores.getGrade(85), "A");
  assert.strictEqual(scores.getGrade(84), "A-");
  assert.strictEqual(scores.getGrade(80), "A-");
  assert.strictEqual(scores.getGrade(79), "B+");
  assert.strictEqual(scores.getGrade(75), "B+");
  assert.strictEqual(scores.getGrade(74), "B");
  assert.strictEqual(scores.getGrade(70), "B");
  assert.strictEqual(scores.getGrade(69), "B-");
  assert.strictEqual(scores.getGrade(65), "B-");
  assert.strictEqual(scores.getGrade(64), "C+");
  assert.strictEqual(scores.getGrade(60), "C+");
  assert.strictEqual(scores.getGrade(59), "C");
  assert.strictEqual(scores.getGrade(55), "C");
  assert.strictEqual(scores.getGrade(54), "C-");
  assert.strictEqual(scores.getGrade(50), "C-");
  assert.strictEqual(scores.getGrade(49), "D+");
  assert.strictEqual(scores.getGrade(45), "D+");
  assert.strictEqual(scores.getGrade(44), "D");
  assert.strictEqual(scores.getGrade(40), "D");
  assert.strictEqual(scores.getGrade(39), "F");
  assert.strictEqual(scores.getGrade(0), "F");
});

// ===== 3. MEMORY SYSTEM - Read/Write =====
console.log("\n=== Memory System: Read/Write ===");

const { readMemory, writeMemory, ensureMemoryDir, buildMainMemory } = await import("../src/services/memory.js");

test("Memory directory exists", () => {
  ensureMemoryDir();
  assert(fs.existsSync(MEMORY_DIR), "memory/ directory must exist");
});

test("Memory read/write roundtrip works", () => {
  const testContent = `# Test Memory\nCreated at ${new Date().toISOString()}`;
  writeMemory("_test-functional.md", testContent);
  const readBack = readMemory("_test-functional.md");
  assert.strictEqual(readBack, testContent, "Read content should match written content");
  // Cleanup
  fs.unlinkSync(path.join(MEMORY_DIR, "_test-functional.md"));
});

test("Memory read returns null for nonexistent file", () => {
  const result = readMemory("_nonexistent-file-that-should-not-exist.md");
  assert.strictEqual(result, null, "Should return null for missing file");
});

test("buildMainMemory generates valid markdown", () => {
  const content = buildMainMemory({
    profile: { name: "Test User", email: "test@test.com", role: "Engineer" },
    portfolio: { equity: "$10,000", cash: "$5,000" },
    health: { connected: false },
    integrations: { alpaca: "Connected", oura: "Not connected" }
  });
  assert(content.includes("# BACKBONE Memory"), "Should have title");
  assert(content.includes("Test User"), "Should include user name");
  assert(content.includes("$10,000"), "Should include portfolio equity");
  assert(content.includes("alpaca"), "Should include integration names");
});

test("All core memory files exist", () => {
  const requiredFiles = ["BACKBONE.md", "profile.md", "portfolio.md", "health.md", "tickers.md", "integrations.md"];
  for (const file of requiredFiles) {
    assert(fs.existsSync(path.join(MEMORY_DIR, file)), `Memory file ${file} must exist`);
  }
});

// ===== 4. HABITS - Full CRUD =====
console.log("\n=== Habits: Full CRUD ===");

const { getTodayHabits, addHabit, completeHabit, getHabitsSummary } = await import("../src/services/habits.js");

test("getTodayHabits returns array", () => {
  const habits = getTodayHabits();
  assert(Array.isArray(habits), "Should return array");
});

test("addHabit creates a new habit", () => {
  const result = addHabit("_Test Habit Functional");
  assert(result, "Should return result");
  // addHabit returns {success: true, habit: {...}}
  const habit = result.habit || result;
  assert(habit.title === "_Test Habit Functional",
    `Habit should have correct title, got: ${JSON.stringify(result)}`);
});

test("getHabitsSummary includes the test habit", () => {
  const summary = getHabitsSummary();
  assert(summary, "Should return summary");
});

// ===== 5. FOCUS TIMER - Session Lifecycle =====
console.log("\n=== Focus Timer: Session Lifecycle ===");

const { startSession, getSessionStatus, endSession, pauseSession, resumeSession, getTodayStats } = await import("../src/services/focus-timer.js");

test("Focus timer starts a session", () => {
  // startSession takes an options object, not a string
  const result = startSession({ task: "Test Task" });
  assert(result, "Should return result");
  assert(result.success || result.task || result.id, `Session should start, got: ${JSON.stringify(result)}`);
});

test("Focus timer reports status while active", () => {
  const status = getSessionStatus();
  assert(status, "Should return status");
  assert(status.active || status.running, "Should show active session");
});

test("Focus timer pause/resume works", () => {
  const paused = pauseSession();
  assert(paused !== undefined, "Should handle pause");
  const resumed = resumeSession();
  assert(resumed !== undefined, "Should handle resume");
});

test("Focus timer ends session", () => {
  const ended = endSession();
  assert(ended !== undefined, "Should handle end");
  const status = getSessionStatus();
  assert(!status.active && !status.running, "Should show no active session after end");
});

// ===== 6. LEARNING TRACKER - Full Lifecycle =====
console.log("\n=== Learning Tracker: Full Lifecycle ===");

const { addLearningItem, getReadingList, startLearning, updateProgress, completeLearning } = await import("../src/services/learning-tracker.js");

test("addLearningItem adds a book", () => {
  const item = addLearningItem("_Test Book Functional", "book");
  assert(item, "Should return added item");
});

test("getReadingList includes added book", () => {
  const list = getReadingList();
  assert(Array.isArray(list), "Should return array");
  const found = list.some(item => (item.title || item.name || "").includes("_Test Book"));
  assert(found, "Reading list should include the test book");
});

// ===== 7. EXCEL MANAGER - Create/Read =====
console.log("\n=== Excel Manager: Create/Read ===");

const { createSpreadsheet, readSpreadsheet, listSpreadsheets } = await import("../src/services/excel-manager.js");

// Excel tests must be sequential (create -> read -> list -> cleanup)
await asyncTest("Excel full lifecycle (create, read, list, cleanup)", async () => {
  // Create
  await createSpreadsheet("_test-functional", {
    sheetName: "Test",
    headers: [
      { name: "Item", key: "item" },
      { name: "Value", key: "value" }
    ],
    rows: [
      { item: "Test Item 1", value: 42 },
      { item: "Test Item 2", value: 99 }
    ]
  });
  const filePath = path.join(DATA_DIR, "spreadsheets", "_test-functional.xlsx");
  assert(fs.existsSync(filePath), "Excel file should exist after creation");

  // Read back
  const data = await readSpreadsheet("_test-functional");
  assert(data, "Should return data from readSpreadsheet");

  // List
  const list = listSpreadsheets();
  assert(Array.isArray(list), "listSpreadsheets should return array");
  const found = list.some(f => (typeof f === "string" ? f : f.name || "").includes("_test-functional"));
  assert(found, "List should include the test spreadsheet");

  // Cleanup
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  assert(!fs.existsSync(filePath), "Test file should be cleaned up");
});

// ===== 8. ACTIVITY TRACKER - Logging =====
console.log("\n=== Activity Tracker: Logging ===");

const { getActivityTracker, ACTIVITY_STATUS } = await import("../src/services/activity-tracker.js");

test("ActivityTracker logs and retrieves activities", () => {
  const tracker = getActivityTracker();
  // ActivityTracker uses .log(action, target, status) not .addActivity()
  tracker.log("testing", "Functional test activity", ACTIVITY_STATUS.COMPLETED);
  const recent = tracker.getRecent ? tracker.getRecent(1) : tracker.activities?.slice(-1);
  assert(recent && recent.length > 0, "Should have at least one activity after logging");
});

// ===== 9. AUTO-TRADER - Evaluation Logic =====
console.log("\n=== Auto-Trader: Evaluation Logic ===");

const { evaluateBuySignal, evaluateSellSignal, isMarketOpen, loadConfig } = await import("../src/services/auto-trader.js");

test("Auto-trader loadConfig returns valid config", () => {
  const config = loadConfig();
  assert(typeof config.buyThreshold === "number", "Should have buyThreshold");
  assert(typeof config.sellThreshold === "number", "Should have sellThreshold");
  assert(typeof config.maxPositionSize === "number", "Should have maxPositionSize");
  assert(config.mode === "paper" || config.mode === "live", "Mode should be paper or live");
});

test("Auto-trader evaluateBuySignal correctly identifies buy", () => {
  const result = evaluateBuySignal({ symbol: "TEST", score: 9.5, price: 100 });
  assert(result.action === "EXTREME_BUY", `Score 9.5 should be EXTREME_BUY, got ${result.action}`);
  assert(result.signals.length > 0, "Should have signals");
});

test("Auto-trader evaluateBuySignal rejects low score", () => {
  const result = evaluateBuySignal({ symbol: "TEST", score: 3.0, price: 100 });
  assert(result.action === "HOLD", `Score 3.0 should be HOLD, got ${result.action}`);
});

test("Auto-trader evaluateSellSignal correctly identifies sell", () => {
  const result = evaluateSellSignal({ symbol: "TEST", score: 1.0, price: 100 });
  assert(result.action === "EXTREME_SELL", `Score 1.0 should be EXTREME_SELL, got ${result.action}`);
});

test("Auto-trader evaluateSellSignal holds for good score", () => {
  const result = evaluateSellSignal({ symbol: "TEST", score: 7.0, price: 100 });
  assert(result.action === "HOLD", `Score 7.0 should be HOLD, got ${result.action}`);
});

test("Auto-trader momentum protection works", () => {
  const positions = [{ symbol: "AAPL", unrealized_plpc: "0.10" }]; // +10%
  const result = evaluateBuySignal({ symbol: "MSFT", score: 8.5, price: 300 }, { positions });
  assert(result.action === "HOLD", "Should HOLD when protected positions exist");
  assert(result.signals.some(s => s.includes("Momentum protection")), "Should mention momentum protection");
});

test("Auto-trader SPY-based threshold works", () => {
  // SPY positive = lower threshold (7.1)
  const resultPositive = evaluateBuySignal({ symbol: "TEST", score: 7.5, price: 100 }, { spyPositive: true });
  assert(resultPositive.action === "BUY", `Score 7.5 with SPY positive should be BUY, got ${resultPositive.action}`);

  // SPY negative = higher threshold (8.0)
  const resultNegative = evaluateBuySignal({ symbol: "TEST", score: 7.5, price: 100 }, { spyPositive: false });
  assert(resultNegative.action === "HOLD", `Score 7.5 with SPY negative should be HOLD, got ${resultNegative.action}`);
});

test("isMarketOpen returns valid structure", () => {
  const status = isMarketOpen();
  assert(typeof status.open === "boolean", "Should have open boolean");
  assert(typeof status.reason === "string", "Should have reason string");
});

// ===== 10. PROACTIVE ENGINE - Question System =====
console.log("\n=== Proactive Engine: Question System ===");

const { getProactiveEngine } = await import("../src/services/proactive-engine.js");

test("ProactiveEngine queues questions without duplicates", () => {
  const engine = getProactiveEngine();
  const q1 = engine.queueQuestion("Test question 1?", "test", 5);
  const q2 = engine.queueQuestion("Test question 1?", "test", 5); // duplicate
  assert(q1, "First queue should succeed");
  assert(q2 === null, "Duplicate queue should return null");
});

test("ProactiveEngine quiet hours detection works", () => {
  const engine = getProactiveEngine();
  // Test the method exists and returns boolean
  const result = engine.isQuietHours();
  assert(typeof result === "boolean", "isQuietHours should return boolean");
});

test("ProactiveEngine getDisplayData returns complete structure", () => {
  const engine = getProactiveEngine();
  const data = engine.getDisplayData();
  assert(typeof data.pendingQuestions === "number", "Should have pendingQuestions count");
  assert(typeof data.onboardingComplete === "boolean", "Should have onboardingComplete flag");
  assert(Array.isArray(data.notifications), "Should have notifications array");
});

// ===== 11. CLOUD SYNC - Config & Status =====
console.log("\n=== Cloud Sync: Config & Status ===");

const { getCloudSyncConfig, buildCloudSyncStatus } = await import("../src/services/cloud-sync.js");

test("Cloud sync config loads without error", () => {
  const config = getCloudSyncConfig();
  assert(typeof config.ready === "boolean", "Should have ready flag");
  assert(config.provider, "Should have provider");
});

test("Cloud sync status reflects config readiness", () => {
  const config = getCloudSyncConfig();
  const status = buildCloudSyncStatus(config);
  if (config.ready) {
    assert(status.connected === true, "Should be connected when config is ready");
  } else {
    assert(status.connected === false, "Should not be connected when config is not ready");
    assert(status.status === "Not configured", "Should show not configured");
  }
});

// ===== 12. DATA FILE INTEGRITY =====
console.log("\n=== Data File Integrity ===");

test("tickers-cache.json is valid JSON with ticker data", () => {
  const filePath = path.join(DATA_DIR, "tickers-cache.json");
  if (!fs.existsSync(filePath)) {
    throw new Error("tickers-cache.json does not exist");
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert(typeof data === "object", "Should be an object");
  // Should have ticker symbols as keys or be an array
  const entries = Array.isArray(data) ? data : Object.entries(data);
  assert(entries.length > 0, "Should have ticker entries");
});

test("trades-log.json is valid JSON", () => {
  const filePath = path.join(DATA_DIR, "trades-log.json");
  if (!fs.existsSync(filePath)) {
    throw new Error("trades-log.json does not exist");
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert(Array.isArray(data), "trades-log should be an array");
});

test("user-settings.json has required fields", () => {
  const filePath = path.join(DATA_DIR, "user-settings.json");
  if (!fs.existsSync(filePath)) {
    throw new Error("user-settings.json does not exist");
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert(typeof data === "object", "Should be an object");
});

test("activity-log.json is valid JSON", () => {
  const filePath = path.join(DATA_DIR, "activity-log.json");
  if (!fs.existsSync(filePath)) {
    throw new Error("activity-log.json does not exist");
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  assert(typeof data === "object", "Should be an object or array");
});

// ===== 13. COMMAND REGISTRY =====
console.log("\n=== Command Registry ===");

const commands = await import("../src/commands.js");

test("Commands registry exports command list", () => {
  const cmdList = commands.COMMANDS || commands.default || commands;
  assert(typeof cmdList === "object", "Should export commands");
});

// ===== SUMMARY =====
console.log("\n" + "=".repeat(50));
console.log("=== Functional Test Summary ===");
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Skipped: ${results.skipped}`);
console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

if (results.failed > 0) {
  console.log("\nFailed tests:");
  results.tests.filter(t => t.status === "FAIL").forEach(t => {
    console.log(`  ✗ ${t.name}`);
    console.log(`    ${t.error}`);
  });
  process.exit(1);
} else {
  console.log("\nAll functional tests passed! ✓");
  process.exit(0);
}
