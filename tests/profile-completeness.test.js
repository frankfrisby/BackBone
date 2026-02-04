/**
 * Profile Completeness Tests
 * Validates that data completeness is calculated and displayed in the header
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "src");
const APP_PATH = path.join(SRC_DIR, "app.js");

// === DATA COMPLETENESS CALCULATION ===

describe("Data Completeness - Calculation", () => {
  it("calculateDataCompleteness exists and returns expected shape", async () => {
    const { calculateDataCompleteness } = await import("../src/services/thinking-engine.js");
    expect(typeof calculateDataCompleteness).toBe("function");
    const result = calculateDataCompleteness();
    expect(result).toHaveProperty("percentage");
    expect(result).toHaveProperty("total");
    expect(typeof result.percentage).toBe("number");
    expect(result.percentage).toBeGreaterThanOrEqual(0);
    expect(result.percentage).toBeLessThanOrEqual(100);
  });

  it("returns scores breakdown by domain", async () => {
    const { calculateDataCompleteness } = await import("../src/services/thinking-engine.js");
    const result = calculateDataCompleteness();
    expect(result).toHaveProperty("scores");
    expect(typeof result.scores).toBe("object");
  });
});

// === HEADER DISPLAY ===

describe("Profile Completeness - Header Display", () => {
  const content = fs.readFileSync(APP_PATH, "utf-8");

  it("header uses dataCompletenessRef for percentage", () => {
    expect(content).toContain("dataCompletenessRef.current?.percentage");
  });

  it("header renders completeness bar with filled blocks", () => {
    // Uses filled █ and empty ░ characters for the bar
    expect(content).toContain('"█".repeat(filled)');
    expect(content).toContain('"░".repeat(empty)');
  });

  it("header shows percentage value", () => {
    // Renders the numeric percentage
    expect(content).toContain("` ${pct}%`");
  });

  it("bar color changes based on completeness level", () => {
    // Green >= 70%, Yellow >= 40%, Red < 40%
    expect(content).toContain('pct >= 70 ? "#22c55e"');
    expect(content).toContain('pct >= 40 ? "#eab308"');
    expect(content).toContain(': "#ef4444"');
  });

  it("completeness bar is to the left of username (separated by pipe)", () => {
    // Bar should come before the username, separated by │
    const barIndex = content.indexOf("dataCompletenessRef.current?.percentage");
    const usernameIndex = content.indexOf('linkedInProfile?.name?.split(" ")[0]', barIndex);
    expect(barIndex).toBeLessThan(usernameIndex);
  });

  it("dataCompletenessRef refreshes every 60 seconds", () => {
    expect(content).toContain("setInterval(refresh, 60000)");
  });
});
