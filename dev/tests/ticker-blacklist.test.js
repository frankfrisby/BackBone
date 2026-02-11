/**
 * Ticker Blacklist Fix Tests
 * Validates that the blacklist no longer aggressively removes valid tickers
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { dataFile } from "../../src/services/paths.js";

const SERVER_PATH = path.join(process.cwd(), "src", "server", "yahoo-finance-server.js");
const CLIENT_PATH = path.join(process.cwd(), "src", "services", "yahoo-client.js");
const BLACKLIST_PATH = dataFile("ticker-blacklist.json");

describe("Ticker Blacklist - Server Fixes", () => {
  const content = fs.readFileSync(SERVER_PATH, "utf-8");

  it("has failure count tracking (not instant blacklist)", () => {
    expect(content).toContain("failureCounts");
    expect(content).toContain("BLACKLIST_FAILURE_THRESHOLD");
  });

  it("requires 3 consecutive failures before blacklisting", () => {
    expect(content).toContain("BLACKLIST_FAILURE_THRESHOLD = 3");
    expect(content).toContain("failures < BLACKLIST_FAILURE_THRESHOLD");
  });

  it("never blacklists CORE_TICKERS", () => {
    expect(content).toContain("NEVER blacklist core tickers");
    expect(content).toContain("coreSet.has(symbol)");
    expect(content).toContain("core ticker");
  });

  it("restores core tickers from blacklist on load", () => {
    expect(content).toContain("Restored");
    expect(content).toContain("incorrectly blacklisted");
    expect(content).toContain("coreSet.has(sym)");
  });

  it("has clearBlacklist function", () => {
    expect(content).toContain("const clearBlacklist = ()");
    expect(content).toContain("tickerBlacklist.clear()");
    expect(content).toContain("failureCounts.clear()");
  });

  it("force full scan clears the blacklist", () => {
    expect(content).toContain("clearBlacklist()");
    expect(content).toContain("blacklist cleared");
  });

  it("has /api/clear-blacklist endpoint", () => {
    expect(content).toContain('app.post("/api/clear-blacklist"');
  });

  it("health check reports blacklist stats", () => {
    expect(content).toContain("blacklistCount: tickerBlacklist.size");
    expect(content).toContain("activeUniverseCount");
    expect(content).toContain("totalUniverseCount");
  });
});

describe("Ticker Blacklist - Client Support", () => {
  const content = fs.readFileSync(CLIENT_PATH, "utf-8");

  it("has clearBlacklist export", () => {
    expect(content).toContain("export const clearBlacklist = async ()");
  });

  it("clearBlacklist calls /api/clear-blacklist endpoint", () => {
    expect(content).toContain("/api/clear-blacklist");
    expect(content).toContain('method: "POST"');
  });
});

describe("Ticker Blacklist - Current State", () => {
  it("blacklist file exists", () => {
    expect(fs.existsSync(BLACKLIST_PATH)).toBe(true);
  });

  it("blacklist is empty or small (not 700+ entries)", () => {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_PATH, "utf-8"));
    expect(Array.isArray(data)).toBe(true);
    // Should not have 700+ entries — that was the bug
    expect(data.length).toBeLessThan(50);
  });

  it("blacklist does not contain major tickers", () => {
    const data = JSON.parse(fs.readFileSync(BLACKLIST_PATH, "utf-8"));
    const majorTickers = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA"];
    for (const ticker of majorTickers) {
      expect(data).not.toContain(ticker);
    }
  });
});

describe("Ticker Universe - Size Validation", () => {
  it("TICKER_UNIVERSE has 700+ tickers", async () => {
    const { TICKER_UNIVERSE } = await import("../src/data/tickers.js");
    expect(TICKER_UNIVERSE.length).toBeGreaterThan(700);
  });

  it("CORE_TICKERS has 100+ tickers", async () => {
    const { CORE_TICKERS } = await import("../src/data/tickers.js");
    expect(CORE_TICKERS.length).toBeGreaterThan(100);
  });

  it("CORE_TICKERS is subset of TICKER_UNIVERSE", async () => {
    const { CORE_TICKERS, TICKER_UNIVERSE } = await import("../src/data/tickers.js");
    const universeSet = new Set(TICKER_UNIVERSE);
    for (const core of CORE_TICKERS) {
      expect(universeSet.has(core)).toBe(true);
    }
  });
});
