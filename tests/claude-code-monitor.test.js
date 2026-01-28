/**
 * Tests for Claude Code Connection Monitor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getClaudeCodeMonitor } from "../src/services/claude-code-monitor.js";

// Mock the dependencies
vi.mock("../src/services/claude-code-cli.js", () => ({
  getClaudeCodeStatus: vi.fn()
}));

vi.mock("../src/services/whatsapp-service.js", () => ({
  getWhatsAppService: vi.fn(() => ({
    initialized: false,
    sendTextMessage: vi.fn()
  }))
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));

describe("ClaudeCodeMonitor", () => {
  let monitor;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton for each test
    monitor = getClaudeCodeMonitor();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  describe("getDisplayStatus", () => {
    it("should return status object with required fields", () => {
      const status = monitor.getDisplayStatus();

      expect(status).toHaveProperty("isConnected");
      expect(status).toHaveProperty("wasConnected");
      expect(status).toHaveProperty("statusMessage");
      expect(status).toHaveProperty("lastStatus");
      expect(status).toHaveProperty("stats");
      expect(status.stats).toHaveProperty("disconnectionCount");
      expect(status.stats).toHaveProperty("notificationsSent");
    });
  });

  describe("connection state tracking", () => {
    it("should emit connected event when status changes to connected", async () => {
      const { getClaudeCodeStatus } = await import("../src/services/claude-code-cli.js");

      // Start disconnected
      getClaudeCodeStatus.mockResolvedValueOnce({ ready: false, installed: true, loggedIn: false });
      await monitor.checkConnection();

      // Now connect
      getClaudeCodeStatus.mockResolvedValueOnce({ ready: true, installed: true, loggedIn: true });

      const connectedPromise = new Promise(resolve => {
        monitor.once("connected", resolve);
      });

      await monitor.checkConnection();
      const event = await connectedPromise;

      expect(event.ready).toBe(true);
      expect(monitor.isConnected).toBe(true);
    });

    it("should set status message when disconnected", async () => {
      const { getClaudeCodeStatus } = await import("../src/services/claude-code-cli.js");

      // First connect
      getClaudeCodeStatus.mockResolvedValueOnce({ ready: true, installed: true, loggedIn: true });
      await monitor.checkConnection();

      // Then disconnect
      getClaudeCodeStatus.mockResolvedValueOnce({ ready: false, installed: true, loggedIn: false });
      await monitor.checkConnection();

      const status = monitor.getDisplayStatus();
      expect(status.statusMessage).toContain("disconnected");
    });

    it("should have status message when not ready", async () => {
      const { getClaudeCodeStatus } = await import("../src/services/claude-code-cli.js");

      getClaudeCodeStatus.mockResolvedValueOnce({ ready: false, installed: false, loggedIn: false });
      await monitor.checkConnection();

      const status = monitor.getDisplayStatus();
      // Should have some status message when not ready (either not installed, not logged in, or disconnected)
      expect(status.statusMessage).toBeTruthy();
      expect(status.isConnected).toBe(false);
    });
  });

  describe("forceCheck", () => {
    it("should trigger immediate status check", async () => {
      const { getClaudeCodeStatus } = await import("../src/services/claude-code-cli.js");

      getClaudeCodeStatus.mockResolvedValueOnce({ ready: true, installed: true, loggedIn: true });

      await monitor.forceCheck();

      expect(getClaudeCodeStatus).toHaveBeenCalled();
      expect(monitor.isConnected).toBe(true);
    });
  });
});
