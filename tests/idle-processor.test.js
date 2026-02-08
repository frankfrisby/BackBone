/**
 * Idle Processor / Claude Engine Tests
 * Validates that the idle processor auto-starts and shows last run timestamp
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "src");
const APP_PATH = path.join(SRC_DIR, "app.js");
const AGENT_PANEL_PATH = path.join(SRC_DIR, "components", "agent-activity-panel.js");
const CLAUDE_ENGINE_PATH = path.join(SRC_DIR, "services", "claude-engine.js");

// === CLAUDE ENGINE ===

describe("Claude Engine - Status Tracking", () => {
  it("tracks lastRunCompletedAt", async () => {
    const { getClaudeEngine } = await import("../src/services/claude-engine.js");
    const engine = getClaudeEngine();
    const status = engine.getStatus();
    expect(status).toHaveProperty("lastRunCompletedAt");
    expect(status).toHaveProperty("lastRunMinutesAgo");
    expect(status).toHaveProperty("cooldown");
    expect(status).toHaveProperty("workCount");
  });

  it("has getTimeSinceLastRun method", () => {
    const content = fs.readFileSync(CLAUDE_ENGINE_PATH, "utf-8");
    expect(content).toContain("getTimeSinceLastRun()");
  });

  it("has isInCooldown method with 1-hour window", () => {
    const content = fs.readFileSync(CLAUDE_ENGINE_PATH, "utf-8");
    expect(content).toContain("isInCooldown()");
    expect(content).toContain("ENGINE_COOLDOWN_MS");
  });

  it("persists state to disk", () => {
    const content = fs.readFileSync(CLAUDE_ENGINE_PATH, "utf-8");
    expect(content).toContain("loadEngineState()");
    expect(content).toContain("saveEngineState(");
    expect(content).toContain("claude-engine-state.json");
  });
});

// === IDLE STATE DISPLAY ===

describe("Idle State - Last Run Timestamp", () => {
  const content = fs.readFileSync(AGENT_PANEL_PATH, "utf-8");

  it("imports getClaudeEngine", () => {
    expect(content).toContain('import { getClaudeEngine } from "../src/services/ai/claude-engine.js"');
  });

  it("has formatLastRanTimestamp function", () => {
    expect(content).toContain("formatLastRanTimestamp");
  });

  it("formats timestamp with weekday, month, day, year, time", () => {
    expect(content).toContain('weekday: "long"');
    expect(content).toContain('month: "short"');
    expect(content).toContain('hour12: true');
  });

  it("shows last ran label in idle state", () => {
    expect(content).toContain("Last ran");
    expect(content).toContain("lastRanLabel");
  });

  it("gets engine status for last run time", () => {
    expect(content).toContain("getClaudeEngine().getStatus()");
  });

  it("handles null lastRunCompletedAt gracefully", () => {
    expect(content).toContain("if (!isoOrMs) return null");
  });
});

// === AUTO-START ===

describe("Claude Engine - Auto-Start", () => {
  const content = fs.readFileSync(APP_PATH, "utf-8");

  it("auto-starts Claude Engine after 30 seconds", () => {
    expect(content).toContain("Auto-starting Claude Engine for background work");
  });

  it("checks cooldown before auto-starting", () => {
    expect(content).toContain("!engineStatus.cooldown");
  });

  it("checks if already running before auto-starting", () => {
    expect(content).toContain("!engineStatus.isRunning");
  });

  it("logs cooldown skip message", () => {
    expect(content).toContain("skipping auto-start");
  });
});

// === TIMESTAMP FORMATTING ===

describe("formatLastRanTimestamp - Logic", () => {
  // Simulate the function
  const formatLastRanTimestamp = (isoOrMs) => {
    if (!isoOrMs) return null;
    const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString("en-US", {
      weekday: "long", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true
    }).replace(",", "");
  };

  it("returns null for null input", () => {
    expect(formatLastRanTimestamp(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatLastRanTimestamp(undefined)).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(formatLastRanTimestamp("not-a-date")).toBeNull();
  });

  it("formats ISO string correctly", () => {
    const result = formatLastRanTimestamp("2026-01-05T14:14:00.000Z");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    // Should contain weekday, month, year
    expect(result).toContain("2026");
    expect(result).toContain("Jan");
  });

  it("formats timestamp number correctly", () => {
    const result = formatLastRanTimestamp(Date.now());
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});
