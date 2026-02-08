/**
 * Goal Ethics Guard Tests
 * Validates ethical guardrails, specificity requirements, and reputation safety
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "src");
const SERVICES_DIR = path.join(SRC_DIR, "services");

// === SERVICE STRUCTURE ===

describe("Goal Ethics Guard - Structure", () => {
  const filePath = path.join(SERVICES_DIR, "goal-ethics-guard.js");

  it("service file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports validateGoalEthics", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function validateGoalEthics(item)");
  });

  it("exports improveDescription", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function improveDescription(item)");
  });

  it("exports sanitizeGoal", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export function sanitizeGoal(item)");
  });

  it("exports ETHICS_PROMPT_SECTION", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const ETHICS_PROMPT_SECTION");
  });

  it("exports REJECTION_CATEGORIES", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("REJECTION_CATEGORIES");
    expect(content).toContain("ILLEGAL");
    expect(content).toContain("HARMFUL");
    expect(content).toContain("DECEPTIVE");
    expect(content).toContain("EXPLOITATIVE");
    expect(content).toContain("REPUTATION_RISK");
    expect(content).toContain("VAGUE");
  });
});

// === PATTERN DETECTION ===

describe("Goal Ethics Guard - Harmful Pattern Detection", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "goal-ethics-guard.js"), "utf-8");

  it("detects hacking/unauthorized access", () => {
    expect(content).toContain("hack|exploit|crack|breach|phish|ddos");
  });

  it("detects theft/fraud", () => {
    expect(content).toContain("steal|theft|rob|embezzle|launder");
  });

  it("detects insider trading/market manipulation", () => {
    expect(content).toContain("insider\\s+trad");
    expect(content).toContain("pump\\s+and\\s+dump");
    expect(content).toContain("market\\s+manipulat");
  });

  it("detects harassment/stalking", () => {
    expect(content).toContain("doxx|harass|stalk|bully|intimidat|threaten");
  });

  it("detects scams/deception", () => {
    expect(content).toContain("scam|defraud|swindle|con\\s+(people|someone|them)");
  });

  it("detects pyramid schemes", () => {
    expect(content).toContain("pyramid\\s+scheme|ponzi|mlm.*recruit");
  });

  it("detects plagiarism", () => {
    expect(content).toContain("plagiari");
  });

  it("detects resume/credential fraud", () => {
    expect(content).toContain("lie\\s+(to|on)\\s+(resume|cv|linkedin|application)");
  });
});

// === FUNCTIONAL TESTS ===

describe("Goal Ethics Guard - validateGoalEthics", () => {
  let validateGoalEthics;

  it("can import the module", async () => {
    const mod = await import("../src/services/goal-ethics-guard.js");
    validateGoalEthics = mod.validateGoalEthics;
    expect(typeof validateGoalEthics).toBe("function");
  });

  it("rejects goals with no title", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({});
    expect(result.valid).toBe(false);
  });

  it("accepts a specific, ethical goal", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({
      title: "Increase portfolio value by 5% this quarter",
      description: "Use disciplined score-based trading to grow the portfolio by 5% this quarter through careful analysis and diversification."
    });
    expect(result.valid).toBe(true);
    expect(result.hardReject).toBe(false);
  });

  it("rejects a hacking goal", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({
      title: "Hack into competitor's server to steal data",
      description: "Gain unauthorized access to their network and extract customer database."
    });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
  });

  it("rejects insider trading goals", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({
      title: "Use insider trading information to buy stock",
      description: "Get insider tips from the CFO before earnings release."
    });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
  });

  it("rejects scam/fraud goals", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({
      title: "Scam people with fake investment scheme",
      description: "Set up a fraudulent scheme to defraud investors."
    });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(true);
  });

  it("flags vague goals but doesn't hard-reject", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({
      title: "make money",
      description: ""
    });
    expect(result.valid).toBe(false);
    expect(result.hardReject).toBe(false);
    expect(result.issues.some(i => i.category === "vague")).toBe(true);
  });

  it("flags goals with no description", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({
      title: "Learn Spanish"
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.category === "vague")).toBe(true);
  });

  it("flags goals where description repeats title", async () => {
    const { validateGoalEthics } = await import("../src/services/goal-ethics-guard.js");
    const result = validateGoalEthics({
      title: "Learn Spanish",
      description: "Learn Spanish"
    });
    expect(result.valid).toBe(false);
  });
});

describe("Goal Ethics Guard - sanitizeGoal", () => {
  it("throws error for hard-rejected goals", async () => {
    const { sanitizeGoal } = await import("../src/services/goal-ethics-guard.js");
    expect(() => sanitizeGoal({
      title: "Hack into bank account to steal money",
      description: "Use phishing to breach the bank's system"
    })).toThrow("Goal rejected");
  });

  it("improves vague descriptions instead of rejecting", async () => {
    const { sanitizeGoal } = await import("../src/services/goal-ethics-guard.js");
    const result = sanitizeGoal({
      title: "Learn to cook Italian food",
      description: ""
    });
    expect(result.item.description.length).toBeGreaterThan(20);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("passes through good goals unchanged", async () => {
    const { sanitizeGoal } = await import("../src/services/goal-ethics-guard.js");
    const originalDesc = "Complete the React certification course on Udemy by end of month, spending 2 hours daily on practice.";
    const result = sanitizeGoal({
      title: "Complete React certification",
      description: originalDesc
    });
    expect(result.item.description).toBe(originalDesc);
    expect(result.warnings.length).toBe(0);
  });
});

// === THINKING ENGINE INTEGRATION ===

describe("Thinking Engine - Ethics Integration", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "thinking-engine.js"), "utf-8");

  it("includes ethics guardrails in the prompt", () => {
    expect(content).toContain("ETHICS & REPUTATION GUARDRAILS");
  });

  it("requires specificity in goals", () => {
    expect(content).toContain("Specific");
    expect(content).toContain("measurable");
  });

  it("prohibits illegal activities", () => {
    expect(content).toContain("illegal");
    expect(content).toContain("fraud");
    expect(content).toContain("insider trading");
  });

  it("includes reputation safety check", () => {
    expect(content).toContain("Reputation-safe");
    expect(content).toContain("proud");
  });

  it("requires good faith principle", () => {
    expect(content).toContain("good faith");
    expect(content).toContain("Ethical");
  });
});

// === GOAL MANAGER INTEGRATION ===

describe("Goal Manager - Ethics Integration", () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, "goal-manager.js"), "utf-8");

  it("imports sanitizeGoal", () => {
    expect(content).toContain('import { sanitizeGoal } from "./goal-ethics-guard.js"');
  });

  it("validates ethics before creating goal", () => {
    expect(content).toContain("sanitizeGoal(goal)");
  });

  it("emits goal-rejected event for unethical goals", () => {
    expect(content).toContain('"goal-rejected"');
  });

  it("returns null for rejected goals", () => {
    expect(content).toContain("return null");
    expect(content).toContain("Goal rejected");
  });
});
