/**
 * Claude Code Auth Error Detection Tests
 * Validates that API key / login errors are detected and surfaced to the user
 * WITHOUT false positives from Claude's actual response content
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CLI_PATH = path.join(process.cwd(), "src", "services", "claude-code-cli.js");
const ENGINE_PATH = path.join(process.cwd(), "src", "services", "claude-engine.js");
const APP_PATH = path.join(process.cwd(), "src", "app.js");

// === AUTH ERROR DETECTION FUNCTION ===

describe("Auth Error Detection - claude-code-cli.js", () => {
  const content = fs.readFileSync(CLI_PATH, "utf-8");

  it("has detectAuthError function", () => {
    expect(content).toContain("const detectAuthError");
  });

  it("only checks first 500 chars to avoid false positives", () => {
    expect(content).toContain("text.slice(0, 500)");
  });

  it("detects ANTHROPIC_API_KEY errors", () => {
    expect(content).toContain("anthropic_api_key");
  });

  it("requires error/fatal prefix for generic API key detection", () => {
    expect(content).toContain('lower.includes("error") || lower.includes("fatal")');
  });

  it("emits auth-error event on stderr", () => {
    expect(content).toContain('emitter.emit("auth-error"');
  });

  it("exports detectAuthError", () => {
    expect(content).toContain("export { detectAuthError }");
  });
});

// === ENGINE AUTH DETECTION ===

describe("Auth Error Detection - claude-engine.js", () => {
  const content = fs.readFileSync(ENGINE_PATH, "utf-8");

  it("has detectAuthError method with first-500-chars check", () => {
    expect(content).toContain("text.slice(0, 500)");
  });

  it("only checks for auth errors in first 15 seconds of streaming", () => {
    expect(content).toContain("elapsed < 15000");
  });

  it("emits auth-error event", () => {
    expect(content).toContain('this.emit("auth-error"');
  });

  it("does not set cooldown on failed runs", () => {
    expect(content).toContain("wasSuccessful || wasNormalExit");
  });
});

// === APP AUTH ERROR HANDLING ===

describe("Auth Error Handling - app.js", () => {
  const content = fs.readFileSync(APP_PATH, "utf-8");

  it("listens for auth-error events from engine", () => {
    expect(content).toContain('"auth-error", onAuthError');
  });

  it("shows auth error in action streaming", () => {
    expect(content).toContain('setActionStreamingTitle("Auth Error")');
  });

  it("connection status uses ready instead of just available", () => {
    expect(content).toContain("claudeCodeStatus.ready");
  });

  it("shows broken status when installed but not logged in", () => {
    expect(content).toContain('"broken"  // installed but not logged in');
  });
});

// === AUTH ERROR DETECTION LOGIC (updated — tighter matching) ===

describe("detectAuthError - Logic", () => {
  // Simulate the updated function (only checks first 500 chars, requires error prefix)
  const detectAuthError = (text) => {
    if (!text) return null;
    const lower = text.slice(0, 500).toLowerCase();

    if (lower.includes("anthropic_api_key")) {
      return "ANTHROPIC_API_KEY not set — Claude Code should use Pro/Max login. Run 'claude login'.";
    }
    if ((lower.includes("error") || lower.includes("fatal")) &&
        (lower.includes("api key") || lower.includes("api_key"))) {
      return "API key error — Run 'claude login' to authenticate with Pro/Max subscription.";
    }
    if (lower.includes("not logged in") || lower.includes("authentication required") ||
        lower.includes("login required")) {
      return "Not logged in — Run 'claude login' to authenticate with Pro/Max subscription.";
    }
    if (lower.includes("oauth") && (lower.includes("expired") || lower.includes("invalid"))) {
      return "OAuth session expired — Run 'claude login' to re-authenticate.";
    }
    if (lower.includes("credit balance") || lower.includes("billing_error") ||
        lower.includes("insufficient_credit") || lower.includes("billing error")) {
      return "API credit balance too low — ANTHROPIC_API_KEY is being used instead of Pro/Max subscription. Restarting without API key.";
    }
    return null;
  };

  it("returns null for normal output", () => {
    expect(detectAuthError("Claude is working on your task")).toBeNull();
    expect(detectAuthError("Reading files...")).toBeNull();
  });

  it("returns null for null/empty input", () => {
    expect(detectAuthError(null)).toBeNull();
    expect(detectAuthError("")).toBeNull();
  });

  // === TRUE POSITIVES ===

  it("detects 'Error: API key has no value'", () => {
    const result = detectAuthError("Error: API key has no value");
    expect(result).not.toBeNull();
    expect(result).toContain("claude login");
  });

  it("detects 'ANTHROPIC_API_KEY not set'", () => {
    const result = detectAuthError("ANTHROPIC_API_KEY environment variable not set");
    expect(result).not.toBeNull();
  });

  it("detects 'not logged in'", () => {
    const result = detectAuthError("Error: Not logged in. Please run claude login first.");
    expect(result).not.toBeNull();
  });

  it("detects OAuth expired", () => {
    const result = detectAuthError("OAuth token expired, please re-authenticate");
    expect(result).not.toBeNull();
  });

  it("detects fatal API key error", () => {
    const result = detectAuthError("Fatal: API key is invalid");
    expect(result).not.toBeNull();
  });

  it("detects 'Credit balance is too low'", () => {
    const result = detectAuthError('{"error":"billing_error","result":"Credit balance is too low"}');
    expect(result).not.toBeNull();
    expect(result).toContain("credit");
  });

  it("detects billing_error", () => {
    const result = detectAuthError('billing_error');
    expect(result).not.toBeNull();
  });

  // === FALSE POSITIVE PREVENTION ===

  it("does NOT trigger on 'Press any key'", () => {
    expect(detectAuthError("Press any key to continue")).toBeNull();
  });

  it("does NOT trigger on 'The key insight'", () => {
    expect(detectAuthError("The key insight is that API integration works")).toBeNull();
  });

  it("does NOT trigger on Alpaca API key discussion", () => {
    expect(detectAuthError("The Alpaca API key is configured correctly in the trading module")).toBeNull();
  });

  it("does NOT trigger on discussing API keys in responses", () => {
    // This was the false positive — Claude discussing API keys in its work output
    expect(detectAuthError("I checked the API key configuration for the trading service")).toBeNull();
  });

  it("does NOT trigger on '401' in response content", () => {
    expect(detectAuthError("The HTTP status code 401 means unauthorized access")).toBeNull();
  });

  it("does NOT trigger on long text with API key mentioned later", () => {
    // Auth errors happen in first 500 chars; API key discussion after that shouldn't match
    const longText = "x".repeat(600) + "Error: API key has no value";
    expect(detectAuthError(longText)).toBeNull();
  });
});
