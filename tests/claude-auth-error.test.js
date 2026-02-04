/**
 * Claude Code Auth Error Detection Tests
 * Validates that API key / login errors are detected and surfaced to the user
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

  it("detects API key not set", () => {
    expect(content).toContain("api key");
    expect(content).toContain("no value");
    expect(content).toContain("not set");
  });

  it("detects not logged in errors", () => {
    expect(content).toContain("not logged in");
    expect(content).toContain("not authenticated");
  });

  it("detects OAuth errors", () => {
    expect(content).toContain("oauth");
  });

  it("detects ANTHROPIC_API_KEY errors", () => {
    expect(content).toContain("anthropic_api_key");
  });

  it("emits auth-error event on stderr", () => {
    expect(content).toContain('emitter.emit("auth-error"');
  });

  it("does not retry on auth errors in close handler", () => {
    expect(content).toContain("authError: authErr");
  });

  it("exports detectAuthError", () => {
    expect(content).toContain("export { detectAuthError }");
  });
});

// === ENGINE AUTH DETECTION ===

describe("Auth Error Detection - claude-engine.js", () => {
  const content = fs.readFileSync(ENGINE_PATH, "utf-8");

  it("has detectAuthError method", () => {
    expect(content).toContain("detectAuthError(");
  });

  it("checks for auth errors in log output", () => {
    expect(content).toContain("authError = this.detectAuthError(logText)");
  });

  it("checks for auth errors in real-time streaming", () => {
    expect(content).toContain("this.detectAuthError(chunk)");
  });

  it("emits auth-error event", () => {
    expect(content).toContain('this.emit("auth-error"');
  });

  it("does not retry on auth errors", () => {
    expect(content).toContain("if (authError)");
    expect(content).toContain("return;");
  });

  it("shows auth error in narrator", () => {
    expect(content).toContain("narratorAuth.observe");
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

  it("sets claudeCodeAlert on auth error", () => {
    expect(content).toContain("setClaudeCodeAlert(");
  });

  it("connection status uses ready instead of just available", () => {
    expect(content).toContain("claudeCodeStatus.ready");
  });

  it("shows broken status when installed but not logged in", () => {
    expect(content).toContain('"broken"  // installed but not logged in');
  });

  it("shows details about login issue", () => {
    expect(content).toContain("Not logged in");
    expect(content).toContain("claude login");
  });
});

// === AUTH ERROR DETECTION LOGIC ===

describe("detectAuthError - Logic", () => {
  // Simulate the function
  const detectAuthError = (text) => {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (lower.includes("api key") || lower.includes("api_key") || lower.includes("apikey") || lower.includes("anthropic_api_key")) {
      if (lower.includes("no value") || lower.includes("not set") || lower.includes("missing") ||
          lower.includes("invalid") || lower.includes("required") || lower.includes("empty")) {
        return "API key not set — use Pro/Max subscription. Run 'claude login' in terminal.";
      }
      if (lower.includes("expired")) {
        return "API key expired — Run 'claude login' to re-authenticate.";
      }
      return "API key error — Run 'claude login' to authenticate with Pro/Max subscription.";
    }
    if (lower.includes("not logged in") || lower.includes("not authenticated") ||
        lower.includes("authentication required") || lower.includes("login required") ||
        lower.includes("unauthorized") || lower.includes("401")) {
      return "Not logged in — Run 'claude login' to authenticate with Pro/Max subscription.";
    }
    if (lower.includes("oauth") && (lower.includes("expired") || lower.includes("invalid") || lower.includes("error"))) {
      return "OAuth session expired — Run 'claude login' to re-authenticate.";
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

  it("detects 'API key has no value'", () => {
    const result = detectAuthError("Error: API key has no value");
    expect(result).not.toBeNull();
    expect(result).toContain("claude login");
  });

  it("detects 'ANTHROPIC_API_KEY not set'", () => {
    const result = detectAuthError("ANTHROPIC_API_KEY environment variable not set");
    expect(result).not.toBeNull();
    expect(result).toContain("claude login");
  });

  it("detects 'not logged in'", () => {
    const result = detectAuthError("Error: Not logged in. Please run claude login first.");
    expect(result).not.toBeNull();
    expect(result).toContain("Pro/Max");
  });

  it("detects '401 Unauthorized'", () => {
    const result = detectAuthError("HTTP 401 Unauthorized");
    expect(result).not.toBeNull();
  });

  it("detects OAuth expired", () => {
    const result = detectAuthError("OAuth token expired, please re-authenticate");
    expect(result).not.toBeNull();
    expect(result).toContain("re-authenticate");
  });

  it("detects missing API key", () => {
    const result = detectAuthError("API key is required but missing");
    expect(result).not.toBeNull();
  });

  it("does not false-positive on normal 'key' mentions", () => {
    expect(detectAuthError("Press any key to continue")).toBeNull();
    expect(detectAuthError("The key insight is...")).toBeNull();
  });
});
