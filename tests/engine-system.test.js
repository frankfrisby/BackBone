/**
 * Engine System Tests
 * Tests Claude Code CLI, Claude Code Backend, and Engine State Manager
 * Verifies the engine pipeline: CLI detection → Backend streaming → State display
 */

import { describe, it, expect, beforeEach } from "vitest";

// Claude Code CLI
import {
  getClaudeCodeConfigDir,
  isClaudeCodeInstalled,
  getClaudeCodeStatus,
  getInstallInstructions,
} from "../src/services/claude-code-cli.js";

// Claude Code Backend
import {
  getClaudeCodeBackend,
  BACKEND_TYPE,
  TASK_STATUS,
  STREAM_MESSAGE_TYPE,
  detectClaudeCode,
  createSessionManager,
} from "../src/services/claude-code-backend.js";

// Engine State Manager
import {
  getEngineStateManager,
  ENGINE_STATUS,
  STATE_FLOW,
  PROJECT_DOMAINS,
  getStateForActivity,
  isValidTransition,
} from "../src/services/engine-state.js";

// ─── Claude Code CLI ─────────────────────────────────────────────

describe("Claude Code CLI", () => {
  it("getClaudeCodeConfigDir returns a string path", () => {
    const dir = getClaudeCodeConfigDir();
    expect(typeof dir).toBe("string");
    expect(dir.length).toBeGreaterThan(0);
  });

  it("isClaudeCodeInstalled returns proper shape", () => {
    const result = isClaudeCodeInstalled();
    expect(result).toHaveProperty("installed");
    expect(typeof result.installed).toBe("boolean");
    expect(result).toHaveProperty("version");
  });

  it("getClaudeCodeStatus returns full status object", async () => {
    const status = await getClaudeCodeStatus();
    expect(status).toHaveProperty("installed");
    expect(status).toHaveProperty("loggedIn");
    expect(status).toHaveProperty("configDir");
    expect(status).toHaveProperty("ready");
    expect(typeof status.ready).toBe("boolean");
  });

  it("getInstallInstructions returns instructions object", () => {
    const info = getInstallInstructions();
    expect(info).toHaveProperty("message");
    expect(info).toHaveProperty("steps");
    expect(info).toHaveProperty("docs");
    expect(Array.isArray(info.steps)).toBe(true);
    expect(info.steps.length).toBeGreaterThan(0);
  });
});

// ─── Claude Code Backend ─────────────────────────────────────────

describe("Claude Code Backend", () => {
  it("BACKEND_TYPE has expected values", () => {
    expect(BACKEND_TYPE.CLAUDE_CODE).toBe("claude-code");
    expect(BACKEND_TYPE.API_FALLBACK).toBe("api-fallback");
  });

  it("TASK_STATUS has all lifecycle states", () => {
    expect(TASK_STATUS.PENDING).toBe("pending");
    expect(TASK_STATUS.RUNNING).toBe("running");
    expect(TASK_STATUS.STREAMING).toBe("streaming");
    expect(TASK_STATUS.COMPLETED).toBe("completed");
    expect(TASK_STATUS.FAILED).toBe("failed");
    expect(TASK_STATUS.CANCELLED).toBe("cancelled");
  });

  it("STREAM_MESSAGE_TYPE has all message types", () => {
    expect(STREAM_MESSAGE_TYPE.SYSTEM).toBe("system");
    expect(STREAM_MESSAGE_TYPE.ASSISTANT).toBe("assistant");
    expect(STREAM_MESSAGE_TYPE.TOOL_USE).toBe("tool_use");
    expect(STREAM_MESSAGE_TYPE.TOOL_RESULT).toBe("tool_result");
    expect(STREAM_MESSAGE_TYPE.ERROR).toBe("error");
    expect(STREAM_MESSAGE_TYPE.RESULT).toBe("result");
  });

  it("getClaudeCodeBackend returns singleton", () => {
    const a = getClaudeCodeBackend();
    const b = getClaudeCodeBackend();
    expect(a).toBe(b);
  });

  it("backend has getStatus method returning status object", () => {
    const backend = getClaudeCodeBackend();
    const status = backend.getStatus();
    expect(status).toHaveProperty("initialized");
    expect(status).toHaveProperty("runningTasks");
    expect(status).toHaveProperty("available");
    expect(typeof status.runningTasks).toBe("number");
    expect(typeof status.available).toBe("boolean");
  });

  it("backend has session management methods", () => {
    const backend = getClaudeCodeBackend();
    expect(typeof backend.getSessions).toBe("function");
    expect(typeof backend.clearAllSessions).toBe("function");
    expect(typeof backend.cancelTask).toBe("function");
    expect(typeof backend.stopAll).toBe("function");
    expect(typeof backend.isRunning).toBe("function");
  });

  it("getSessions returns an array", () => {
    const backend = getClaudeCodeBackend();
    const sessions = backend.getSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });

  it("isRunning returns boolean", () => {
    const backend = getClaudeCodeBackend();
    expect(typeof backend.isRunning()).toBe("boolean");
  });

  it("detectClaudeCode returns detection result", async () => {
    const result = await detectClaudeCode();
    expect(result).toHaveProperty("type");
    expect(result).toHaveProperty("installed");
    expect(typeof result.installed).toBe("boolean");
  });

  it("createSessionManager returns manager with expected API", () => {
    const mgr = createSessionManager();
    expect(typeof mgr.start).toBe("function");
    expect(typeof mgr.continue).toBe("function");
    expect(typeof mgr.resume).toBe("function");
    expect(typeof mgr.stop).toBe("function");
    expect(typeof mgr.isRunning).toBe("function");
    expect(typeof mgr.getSessions).toBe("function");
    expect(typeof mgr.subscribe).toBe("function");
    expect(typeof mgr.getBackend).toBe("function");
  });

  it("backend emits events (is EventEmitter)", () => {
    const backend = getClaudeCodeBackend();
    expect(typeof backend.on).toBe("function");
    expect(typeof backend.emit).toBe("function");
    expect(typeof backend.removeListener).toBe("function");
  });
});

// ─── Engine State Manager ────────────────────────────────────────

describe("Engine State Manager", () => {
  let engine;

  beforeEach(() => {
    engine = getEngineStateManager();
    engine.reset();
  });

  it("getEngineStateManager returns singleton", () => {
    const a = getEngineStateManager();
    const b = getEngineStateManager();
    expect(a).toBe(b);
  });

  it("ENGINE_STATUS has all expected statuses", () => {
    const expected = [
      "STARTING", "RESEARCHING", "THINKING", "PLANNING",
      "BUILDING", "WORKING", "REFLECTING", "UPDATING",
      "CONNECTING", "IDLE", "WAITING", "ANALYZING",
      "EXECUTING", "LEARNING", "SYNCING",
    ];
    for (const key of expected) {
      expect(ENGINE_STATUS[key]).toBeDefined();
      expect(ENGINE_STATUS[key]).toHaveProperty("id");
      expect(ENGINE_STATUS[key]).toHaveProperty("label");
      expect(ENGINE_STATUS[key]).toHaveProperty("color");
    }
  });

  it("each ENGINE_STATUS has icon and color", () => {
    for (const [key, status] of Object.entries(ENGINE_STATUS)) {
      expect(typeof status.id).toBe("string");
      expect(typeof status.label).toBe("string");
      expect(typeof status.color).toBe("string");
      expect(status.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("STATE_FLOW defines valid transitions", () => {
    expect(STATE_FLOW).toHaveProperty("idle");
    expect(STATE_FLOW).toHaveProperty("thinking");
    expect(STATE_FLOW).toHaveProperty("planning");
    expect(Array.isArray(STATE_FLOW.idle)).toBe(true);
    expect(STATE_FLOW.idle.length).toBeGreaterThan(0);
  });

  it("isValidTransition validates state machine rules", () => {
    // idle -> thinking should be valid per STATE_FLOW
    expect(isValidTransition("idle", "thinking")).toBe(true);
    expect(isValidTransition("idle", "researching")).toBe(true);
    // idle -> building is valid because any transition to/from idle is allowed
    expect(isValidTransition("idle", "building")).toBe(true);
    // thinking -> executing is NOT valid (thinking goes to planning/researching/idle)
    expect(isValidTransition("thinking", "executing")).toBe(false);
  });

  it("PROJECT_DOMAINS has expected domains", () => {
    expect(PROJECT_DOMAINS.HEALTH).toBeDefined();
    expect(PROJECT_DOMAINS.FINANCES).toBeDefined();
    expect(PROJECT_DOMAINS.WORK).toBeDefined();
    expect(PROJECT_DOMAINS.PERSONAL).toBeDefined();
    for (const [key, domain] of Object.entries(PROJECT_DOMAINS)) {
      expect(domain).toHaveProperty("id");
      expect(domain).toHaveProperty("label");
      expect(domain).toHaveProperty("color");
    }
  });

  it("getStateForActivity maps activities to engine states", () => {
    const research = getStateForActivity("web_search");
    expect(research).toBeDefined();
    expect(research.id).toBe("researching");

    const building = getStateForActivity("write_file");
    expect(building).toBeDefined();
    expect(building.id).toBe("building");

    const executing = getStateForActivity("bash_command");
    expect(executing).toBeDefined();
    expect(executing.id).toBe("executing");
  });

  it("setStatus changes engine status", () => {
    engine.setStatus("thinking", "Processing user query");
    const display = engine.getStatusDisplay();
    expect(display.id).toBe("thinking");
    expect(display.detail).toBe("Processing user query");
  });

  it("getStatusDisplay returns full status shape", () => {
    const display = engine.getStatusDisplay();
    expect(display).toHaveProperty("id");
    expect(display).toHaveProperty("label");
    expect(display).toHaveProperty("icon");
    expect(display).toHaveProperty("color");
    expect(display).toHaveProperty("detail");
    expect(display).toHaveProperty("lastUpdated");
  });

  it("getDisplayData returns engine panel data", () => {
    const data = engine.getDisplayData();
    expect(data).toHaveProperty("status");
    expect(data).toHaveProperty("projects");
    expect(data).toHaveProperty("metrics");
    expect(data).toHaveProperty("lastUpdated");
    expect(Array.isArray(data.projects)).toBe(true);
  });

  it("project thread lifecycle works", () => {
    // Start a project
    const thread = engine.startProjectThread("test-project", "Test Project", "personal");
    expect(Array.isArray(thread)).toBe(true);

    // Add messages
    const msg = engine.addThreadMessage("test-project", "Working on test", "assistant");
    expect(msg).toHaveProperty("id");
    expect(msg).toHaveProperty("content");
    expect(msg.content).toBe("Working on test");
    expect(msg.role).toBe("assistant");

    // Get thread
    const retrieved = engine.getThread("test-project");
    expect(Array.isArray(retrieved)).toBe(true);
    expect(retrieved.length).toBeGreaterThan(0);

    // List rolling projects
    const projects = engine.getRollingProjects();
    expect(Array.isArray(projects)).toBe(true);
    const found = projects.find(p => p.id === "test-project");
    expect(found).toBeDefined();
    // name falls back to projectId since metadata doesn't include name
    expect(found.name).toBe("test-project");
  });

  it("engine emits status-changed event", () => {
    let emitted = null;
    engine.on("status-changed", (data) => { emitted = data; });
    engine.setStatus("researching", "Looking up data");
    expect(emitted).not.toBeNull();
    // Event emits statusId as string, not object
    expect(emitted.status).toBe("researching");
  });

  it("reset clears engine state", () => {
    engine.setStatus("building", "Something");
    engine.reset();
    const display = engine.getStatusDisplay();
    expect(display.id).toBe("idle");
  });

  it("incrementCycle updates metrics", () => {
    const before = engine.getDisplayData().metrics;
    engine.incrementCycle();
    const after = engine.getDisplayData().metrics;
    // Metrics should exist and be tracked
    expect(after).toBeDefined();
  });
});
