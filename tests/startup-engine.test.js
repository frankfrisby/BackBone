/**
 * Tests for Startup Engine
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStartupEngine } from "../src/services/startup-engine.js";

// Mock dependencies
vi.mock("../src/services/claude-code-cli.js", () => ({
  getClaudeCodeStatus: vi.fn(() => Promise.resolve({ ready: true, installed: true, loggedIn: true })),
  runClaudeCodeStreaming: vi.fn(() => ({
    on: vi.fn()
  }))
}));

vi.mock("../src/services/activity-narrator.js", () => ({
  getActivityNarrator: vi.fn(() => ({
    setState: vi.fn(),
    setClaudeCodeActive: vi.fn()
  }))
}));

vi.mock("../src/services/activity-tracker.js", () => ({
  getActivityTracker: vi.fn(() => ({
    setState: vi.fn(),
    log: vi.fn()
  }))
}));

vi.mock("../src/services/idle-processor.js", () => ({
  getIdleProcessor: vi.fn(() => ({
    forceWork: vi.fn(() => Promise.resolve()),
    recordUserActivity: vi.fn()
  }))
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ""),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => [])
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ""),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => [])
}));

describe("StartupEngine", () => {
  let engine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = getStartupEngine();
  });

  describe("getStatus", () => {
    it("should return valid status object", () => {
      const status = engine.getStatus();

      expect(status).toHaveProperty("phase");
      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("startupComplete");
      expect(status).toHaveProperty("priorities");
      expect(status).toHaveProperty("startupCount");
    });
  });

  describe("phases", () => {
    it("should start in initializing phase", () => {
      expect(engine.phase).toBe("initializing");
    });

    it("should emit phase-changed events", async () => {
      const phaseChanges = [];
      engine.on("phase-changed", (phase) => {
        phaseChanges.push(phase);
      });

      // Don't actually run - just verify event emission works
      engine.setPhase("context_assessment");

      expect(phaseChanges).toContain("context_assessment");
    });
  });

  describe("context assessment", () => {
    it("should load context without errors", async () => {
      await engine.assessContext();

      expect(engine.context).toHaveProperty("profile");
      expect(engine.context).toHaveProperty("beliefs");
      expect(engine.context).toHaveProperty("goals");
    });
  });

  describe("work assessment", () => {
    it("should assess work without errors", async () => {
      engine.context = {
        work: { backlog: { items: [] }, lastWork: null }
      };

      await engine.assessWork();

      expect(engine.context.work).toHaveProperty("backlog");
      expect(engine.context.work).toHaveProperty("projects");
    });
  });

  describe("priority determination", () => {
    it("should determine priorities from backlog", async () => {
      engine.context = {
        work: {
          backlog: {
            total: 2,
            highImpact: 1,
            items: [
              { id: "1", title: "Test item", impactScore: 80, urgency: "high" },
              { id: "2", title: "Low item", impactScore: 40, urgency: "low" }
            ]
          },
          projects: { list: [] },
          lastWork: null
        },
        beliefs: { beliefs: [] }
      };

      await engine.determinePriorities();

      expect(engine.priorities.length).toBeGreaterThan(0);
      expect(engine.priorities[0].score).toBeGreaterThan(engine.priorities[1]?.score || 0);
    });
  });
});
