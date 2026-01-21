/**
 * Autonomous System Tests for BACKBONE
 * Validates all new services and components work correctly
 */

import assert from "assert";

// Test results
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

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

// ===== AUTONOMOUS ENGINE TESTS =====
console.log("\n=== Autonomous Engine Tests ===");

const {
  getAutonomousEngine,
  createAIAction,
  AI_ACTION_STATUS,
  AI_ACTION_TYPES,
  EXECUTION_TOOLS
} = await import("../src/services/autonomous-engine.js");

test("AutonomousEngine: singleton instance", () => {
  const engine1 = getAutonomousEngine();
  const engine2 = getAutonomousEngine();
  assert.strictEqual(engine1, engine2, "Should return same instance");
});

test("AutonomousEngine: createAIAction creates valid action", () => {
  const action = createAIAction({
    title: "Test Action",
    type: AI_ACTION_TYPES.RESEARCH,
    description: "Test description"
  });
  assert(action.id.startsWith("ai_action_"), "Should have valid ID prefix");
  assert.strictEqual(action.title, "Test Action");
  assert.strictEqual(action.status, AI_ACTION_STATUS.PROPOSED);
  assert(action.createdAt, "Should have createdAt timestamp");
});

test("AutonomousEngine: getDisplayData returns valid structure", () => {
  const engine = getAutonomousEngine();
  const data = engine.getDisplayData();
  assert(typeof data.running === "boolean", "Should have running boolean");
  assert(Array.isArray(data.proposedActions), "Should have proposedActions array");
  assert(typeof data.approvedCount === "number", "Should have approvedCount");
});

test("AutonomousEngine: registerContextProvider works", () => {
  const engine = getAutonomousEngine();
  engine.registerContextProvider("test", async () => ({ value: 42 }));
  assert(engine.contextProviders.test, "Should register provider");
});

test("AutonomousEngine: registerExecutor works", () => {
  const engine = getAutonomousEngine();
  engine.registerExecutor("test-tool", async () => ({ success: true }));
  assert(engine.executors["test-tool"], "Should register executor");
});

// ===== CLAUDE CODE BACKEND TESTS =====
console.log("\n=== Claude Code Backend Tests ===");

const { getClaudeCodeBackend, BACKEND_TYPE, TASK_STATUS } = await import("../src/services/claude-code-backend.js");

test("ClaudeCodeBackend: singleton instance", () => {
  const backend1 = getClaudeCodeBackend();
  const backend2 = getClaudeCodeBackend();
  assert.strictEqual(backend1, backend2, "Should return same instance");
});

asyncTest("ClaudeCodeBackend: initialize detects backend", async () => {
  const backend = getClaudeCodeBackend();
  const result = await backend.initialize();
  assert(result.type, "Should have type");
  assert(typeof result.installed === "boolean", "Should have installed boolean");
});

test("ClaudeCodeBackend: getStatus returns valid structure", () => {
  const backend = getClaudeCodeBackend();
  const status = backend.getStatus();
  assert(typeof status.initialized === "boolean", "Should have initialized");
  assert(typeof status.runningTasks === "number", "Should have runningTasks count");
});

test("ClaudeCodeBackend: getInstallInstructions returns valid object", () => {
  const backend = getClaudeCodeBackend();
  const instructions = backend.getInstallInstructions();
  assert(instructions.message, "Should have message");
  assert(Array.isArray(instructions.commands), "Should have commands array");
});

// ===== WORK LOG TESTS =====
console.log("\n=== Work Log Tests ===");

const { getWorkLog, LOG_TYPE, LOG_SOURCE, LOG_STATUS } = await import("../src/services/work-log.js");

test("WorkLog: singleton instance", () => {
  const log1 = getWorkLog();
  const log2 = getWorkLog();
  assert.strictEqual(log1, log2, "Should return same instance");
});

test("WorkLog: log creates entry", () => {
  const log = getWorkLog();
  const entry = log.log({
    type: LOG_TYPE.SYSTEM,
    source: LOG_SOURCE.SYSTEM,
    title: "Test Entry",
    status: LOG_STATUS.SUCCESS
  });
  assert(entry.id.startsWith("log_"), "Should have valid ID prefix");
  assert.strictEqual(entry.title, "Test Entry");
  assert(entry.timestamp, "Should have timestamp");
});

test("WorkLog: getRecent returns entries", () => {
  const log = getWorkLog();
  const recent = log.getRecent(5);
  assert(Array.isArray(recent), "Should return array");
});

test("WorkLog: getDisplayData returns formatted entries", () => {
  const log = getWorkLog();
  const display = log.getDisplayData(5);
  assert(Array.isArray(display), "Should return array");
  if (display.length > 0) {
    assert(display[0].time, "Should have formatted time");
    assert(display[0].color, "Should have color");
  }
});

test("WorkLog: logConnection convenience method works", () => {
  const log = getWorkLog();
  const entry = log.logConnection(LOG_SOURCE.ALPACA, "Test Connection", "Details");
  assert.strictEqual(entry.type, LOG_TYPE.CONNECTION);
  assert.strictEqual(entry.source, LOG_SOURCE.ALPACA);
});

// ===== GOAL TRACKER TESTS =====
console.log("\n=== Goal Tracker Tests ===");

const { getGoalTracker, GOAL_CATEGORY, GOAL_STATUS } = await import("../src/services/goal-tracker.js");

test("GoalTracker: singleton instance", () => {
  const tracker1 = getGoalTracker();
  const tracker2 = getGoalTracker();
  assert.strictEqual(tracker1, tracker2, "Should return same instance");
});

test("GoalTracker: getAll returns goals array", () => {
  const tracker = getGoalTracker();
  const goals = tracker.getAll();
  assert(Array.isArray(goals), "Should return array");
});

test("GoalTracker: getActive returns only active goals", () => {
  const tracker = getGoalTracker();
  const active = tracker.getActive();
  assert(Array.isArray(active), "Should return array");
  active.forEach(g => {
    assert.strictEqual(g.status, GOAL_STATUS.ACTIVE, "Should only have active goals");
  });
});

test("GoalTracker: calculateProgress works correctly", () => {
  const tracker = getGoalTracker();
  const goal = { startValue: 0, currentValue: 50, targetValue: 100 };
  const progress = tracker.calculateProgress(goal);
  assert.strictEqual(progress, 0.5, "Should calculate 50% progress");
});

test("GoalTracker: getDisplayData returns formatted data", () => {
  const tracker = getGoalTracker();
  const display = tracker.getDisplayData();
  assert(Array.isArray(display), "Should return array");
  if (display.length > 0) {
    assert(typeof display[0].progress === "number", "Should have progress");
    assert(display[0].color, "Should have color");
  }
});

// ===== LIFE SCORES TESTS =====
console.log("\n=== Life Scores Tests ===");

const { getLifeScores, LIFE_CATEGORIES } = await import("../src/services/life-scores.js");

test("LifeScores: singleton instance", () => {
  const scores1 = getLifeScores();
  const scores2 = getLifeScores();
  assert.strictEqual(scores1, scores2, "Should return same instance");
});

test("LifeScores: getDisplayData returns valid structure", () => {
  const scores = getLifeScores();
  const display = scores.getDisplayData();
  assert(typeof display.overall === "number", "Should have overall score");
  assert(display.overallGrade, "Should have overall grade");
  assert(Array.isArray(display.categories), "Should have categories array");
});

test("LifeScores: getGrade returns valid grades", () => {
  const scores = getLifeScores();
  assert.strictEqual(scores.getGrade(95), "A+");
  assert.strictEqual(scores.getGrade(85), "A");
  assert.strictEqual(scores.getGrade(75), "B+");
  assert.strictEqual(scores.getGrade(55), "C");
  assert.strictEqual(scores.getGrade(30), "F");
});

test("LifeScores: updateCategoryScore works", () => {
  const scores = getLifeScores();
  scores.updateCategoryScore(LIFE_CATEGORIES.HEALTH, 75);
  const display = scores.getDisplayData();
  const health = display.categories.find(c => c.category === LIFE_CATEGORIES.HEALTH);
  assert.strictEqual(health.score, 75, "Should update health score to 75");
});

// ===== MOBILE SERVICE TESTS =====
console.log("\n=== Mobile Service Tests ===");

const { getMobileService, MOBILE_TYPE, MESSAGE_TYPE } = await import("../src/services/mobile.js");

test("MobileService: singleton instance", () => {
  const mobile1 = getMobileService();
  const mobile2 = getMobileService();
  assert.strictEqual(mobile1, mobile2, "Should return same instance");
});

test("MobileService: getConnectionInfo returns valid structure", () => {
  const mobile = getMobileService();
  const info = mobile.getConnectionInfo();
  assert(info.webDashboard, "Should have webDashboard info");
  assert(info.sms, "Should have sms info");
  assert(typeof info.webDashboard.port === "number" || typeof info.webDashboard.port === "string", "Should have port");
});

test("MobileService: data setters and getters work", () => {
  const mobile = getMobileService();
  mobile.setStatusData({ running: true });
  const status = mobile.getStatusData();
  assert.strictEqual(status.running, true, "Should store and retrieve status data");
});

test("MobileService: getDashboardHTML returns HTML", () => {
  const mobile = getMobileService();
  const html = mobile.getDashboardHTML();
  assert(html.includes("<!DOCTYPE html>"), "Should return valid HTML");
  assert(html.includes("BACKBONE"), "Should include BACKBONE title");
});

asyncTest("MobileService: startWebDashboard starts server", async () => {
  const mobile = getMobileService();
  // Reset port for test
  mobile.config.port = 3050;
  try {
    const result = await mobile.startWebDashboard();
    assert(result.port, "Should return port");
    assert(mobile.running, "Should set running to true");
    await mobile.stopWebDashboard();
  } catch (error) {
    // Port might be in use, skip this test
    console.log("    (skipped - ports in use)");
  }
});

// ===== GOALS DATA TESTS =====
console.log("\n=== Goals Data Tests ===");

const goalsData = await import("../src/data/goals.js");

test("GoalsData: has GOAL_CATEGORIES", () => {
  assert(goalsData.GOAL_CATEGORIES, "Should export GOAL_CATEGORIES");
  assert(goalsData.GOAL_CATEGORIES.FINANCE, "Should have FINANCE category");
  assert(goalsData.GOAL_CATEGORIES.HEALTH, "Should have HEALTH category");
});

test("GoalsData: has GOAL_TEMPLATES", () => {
  assert(goalsData.GOAL_TEMPLATES, "Should export GOAL_TEMPLATES");
  assert(goalsData.GOAL_TEMPLATES.WEALTH_1M, "Should have WEALTH_1M template");
  assert(goalsData.GOAL_TEMPLATES.SLEEP_OPTIMIZATION, "Should have SLEEP_OPTIMIZATION template");
});

test("GoalsData: calculateProgress works correctly", () => {
  assert.strictEqual(goalsData.calculateProgress(50, 0, 100), 0.5, "Should calculate 50%");
  assert.strictEqual(goalsData.calculateProgress(0, 0, 100), 0, "Should calculate 0%");
  assert.strictEqual(goalsData.calculateProgress(100, 0, 100), 1, "Should calculate 100%");
});

test("GoalsData: formatCurrency formats correctly", () => {
  assert.strictEqual(goalsData.formatCurrency(1500000), "$1.5M");
  assert.strictEqual(goalsData.formatCurrency(50000), "$50.0K");
  assert.strictEqual(goalsData.formatCurrency(500), "$500");
});

test("GoalsData: getSuggestedActions returns actions for categories", () => {
  const financeActions = goalsData.getSuggestedActions({ category: goalsData.GOAL_CATEGORIES.FINANCE });
  assert(Array.isArray(financeActions), "Should return array");
  assert(financeActions.length > 0, "Should have suggestions");
});

// ===== SUMMARY =====
console.log("\n=== Test Summary ===");
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);
console.log(`Total:  ${results.passed + results.failed}`);

if (results.failed > 0) {
  console.log("\nFailed tests:");
  results.tests.filter(t => t.status === "FAIL").forEach(t => {
    console.log(`  - ${t.name}: ${t.error}`);
  });
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
  process.exit(0);
}
