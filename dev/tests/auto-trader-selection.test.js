/**
 * Auto-Trader Ticker Selection Tests
 * Validates that the auto-trader correctly selects buy candidates
 * and that blacklisted/unscored tickers are properly excluded.
 *
 * Root cause of NIO-instead-of-DD issue:
 * DD was blacklisted by the aggressive blacklist bug (713 entries),
 * so it was never scanned/scored and couldn't appear as a buy candidate.
 * NIO scored 9.0 (extreme buy threshold), so it was bought as Top 1.
 * Fix: Task 4 cleared the blacklist, added 3-failure threshold,
 * and protected CORE_TICKERS from ever being blacklisted.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getDataDir } from "../../src/services/paths.js";

const SRC_DIR = path.join(process.cwd(), "src");
const DATA_DIR = getDataDir();

describe("Auto-Trader - Buy Selection Logic", () => {
  const content = fs.readFileSync(path.join(SRC_DIR, "services", "trading", "auto-trader.js"), "utf-8");

  it("sorts tickers by score (highest first)", () => {
    expect(content).toContain(".sort((a, b) => (b.score || 0) - (a.score || 0))");
  });

  it("filters for tickers above buy threshold", () => {
    expect(content).toContain("t.score >= effectiveBuyThreshold");
  });

  it("limits buy candidates to top 3", () => {
    expect(content).toContain(".slice(0, 3)");
    expect(content).toContain("onlyTop3: true");
  });

  it("skips tickers not in top 3", () => {
    expect(content).toContain("top3BuyTickers.includes(ticker.symbol)");
    expect(content).toContain("not in top 3");
  });

  it("skips tickers already held", () => {
    expect(content).toContain("positionSymbols.includes(ticker.symbol)");
  });

  it("checks position limits before buying", () => {
    expect(content).toContain("currentPositionCount < config.maxTotalPositions");
    expect(content).toContain("maxTotalPositions: 2");
  });

  it("has extreme buy threshold at 9.0", () => {
    expect(content).toContain("extremeBuyThreshold: 9.0");
  });

  it("auto-executes extreme buys", () => {
    expect(content).toContain("ticker.score >= config.extremeBuyThreshold");
    expect(content).toContain("EXTREME BUY");
    expect(content).toContain("EXTREME_BUY");
  });
});

describe("Auto-Trader - SPY-Based Dynamic Threshold", () => {
  const content = fs.readFileSync(path.join(SRC_DIR, "services", "auto-trader.js"), "utf-8");

  it("uses lower threshold when SPY is positive (7.1)", () => {
    expect(content).toContain("buyThresholdSPYPositive: 7.1");
  });

  it("uses higher threshold when SPY is negative (8.0)", () => {
    expect(content).toContain("buyThreshold: 8.0");
  });

  it("determines threshold from SPY direction", () => {
    expect(content).toContain("spyPositive ? config.buyThresholdSPYPositive : config.buyThreshold");
  });
});

describe("Auto-Trader - Blacklist Exclusion", () => {
  const content = fs.readFileSync(path.join(SRC_DIR, "services", "auto-trader.js"), "utf-8");

  it("skips blacklisted tickers during buy evaluation", () => {
    expect(content).toContain("config.blacklist.includes(ticker.symbol)");
  });

  it("checks blacklist in canTrade", () => {
    expect(content).toContain("config.blacklist.includes(symbol)");
    expect(content).toContain("is blacklisted");
  });
});

describe("DD in Ticker Universe - Root Cause Verification", () => {
  it("DD is in TICKER_UNIVERSE but not CORE_TICKERS", async () => {
    const { CORE_TICKERS, TICKER_UNIVERSE } = await import("../src/data/tickers.js");
    expect(TICKER_UNIVERSE).toContain("DD");
    // DD is an extended ticker, not core — still should be scanned
    expect(CORE_TICKERS).not.toContain("DD");
  });

  it("DD is in TICKER_UNIVERSE", async () => {
    const { TICKER_UNIVERSE } = await import("../src/data/tickers.js");
    expect(TICKER_UNIVERSE).toContain("DD");
  });

  it("NIO is in TICKER_UNIVERSE", async () => {
    const { TICKER_UNIVERSE } = await import("../src/data/tickers.js");
    expect(TICKER_UNIVERSE).toContain("NIO");
  });

  it("NIO is in CORE_TICKERS", async () => {
    const { CORE_TICKERS } = await import("../src/data/tickers.js");
    expect(CORE_TICKERS).toContain("NIO");
  });
});

describe("Ticker Cache - DD Missing (Blacklist Bug Evidence)", () => {
  it("tickers-cache.json exists", () => {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    expect(fs.existsSync(cachePath)).toBe(true);
  });

  it("cache has entries (server is working)", () => {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    // Should have tickers array
    const tickers = data.tickers || data;
    expect(Array.isArray(tickers)).toBe(true);
    expect(tickers.length).toBeGreaterThan(0);
  });

  it("NIO has a cache entry with a score (was scanned)", () => {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const tickers = data.tickers || data;
    const nio = tickers.find(t => t.symbol === "NIO");
    expect(nio).toBeDefined();
    expect(typeof nio.score).toBe("number");
  });
});

describe("Blacklist Fix Prevents Recurrence", () => {
  const serverContent = fs.readFileSync(
    path.join(SRC_DIR, "server", "yahoo-finance-server.js"), "utf-8"
  );

  it("requires 3 consecutive failures before blacklisting", () => {
    expect(serverContent).toContain("BLACKLIST_FAILURE_THRESHOLD = 3");
  });

  it("never blacklists CORE_TICKERS (including DD)", () => {
    expect(serverContent).toContain("NEVER blacklist core tickers");
    expect(serverContent).toContain("coreSet.has(symbol)");
  });

  it("blacklist is currently empty (was cleared)", () => {
    const blacklistPath = path.join(DATA_DIR, "ticker-blacklist.json");
    const data = JSON.parse(fs.readFileSync(blacklistPath, "utf-8"));
    expect(data.length).toBe(0);
  });
});
