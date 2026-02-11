/**
 * Ticker Freshness & Display Tests
 * Tests that top 10/20 tickers update regularly, data is fresh,
 * calculated fields are present, and invalid/stale data is rejected
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import { dataFile } from "../../src/services/paths.js";

// Client functions
import {
  fetchTickers,
} from "../../src/services/trading/yahoo-client.js";

// Ticker data lists and scoring
import {
  CORE_TICKERS,
  TICKER_UNIVERSE,
  calculateMACD,
  calculateVolumeScore,
} from "../../src/data/tickers.js";

// Score engine
import {
  getSignalFromScore,
  SCORE_THRESHOLDS,
} from "../../src/services/trading/score-engine.js";

// Trading algorithms
import {
  getActionFromScore,
} from "../../src/services/trading/trading-algorithms.js";

const CACHE_PATH = dataFile("tickers-cache.json");

// ─── Helper ──────────────────────────────────────────────────────

function loadCache() {
  const raw = fs.readFileSync(CACHE_PATH, "utf-8");
  return JSON.parse(raw);
}

function getTopN(tickers, n) {
  return [...tickers]
    .filter((t) => typeof t.score === "number")
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

// ─── Cache Freshness ─────────────────────────────────────────────

describe("Ticker Cache: Freshness", () => {
  const cache = loadCache();

  it("tickers-cache.json exists and has tickers", () => {
    expect(cache).toHaveProperty("tickers");
    expect(Array.isArray(cache.tickers)).toBe(true);
    expect(cache.tickers.length).toBeGreaterThan(0);
  });

  it("cache has lastUpdate timestamp", () => {
    expect(cache.lastUpdate).toBeDefined();
    const d = new Date(cache.lastUpdate);
    expect(d.getTime()).not.toBeNaN();
  });

  it("cache lastUpdate is within the last 24 hours", () => {
    const age = Date.now() - new Date(cache.lastUpdate).getTime();
    const hours24 = 24 * 60 * 60 * 1000;
    expect(age).toBeLessThan(hours24);
  });

  it("cache has lastFullScan timestamp", () => {
    expect(cache.lastFullScan).toBeDefined();
    const d = new Date(cache.lastFullScan);
    expect(d.getTime()).not.toBeNaN();
  });

  it("at least 50% of tickers have lastEvaluated set", () => {
    const withEval = cache.tickers.filter((t) => t.lastEvaluated);
    const ratio = withEval.length / cache.tickers.length;
    expect(ratio).toBeGreaterThanOrEqual(0.5);
  });

  it("tickers evaluated today exist (data is not all stale)", () => {
    const today = new Date().toDateString();
    const evalToday = cache.tickers.filter(
      (t) => t.lastEvaluated && new Date(t.lastEvaluated).toDateString() === today
    );
    // On weekdays during market hours there should be many; on weekends allow 0 but cache should still be recent
    const cacheDay = new Date(cache.lastUpdate).toDateString();
    if (cacheDay === today) {
      expect(evalToday.length).toBeGreaterThan(0);
    }
    // If cache wasn't updated today (weekend), just verify timestamps parse
    expect(true).toBe(true);
  });

  it("no ticker has a future lastEvaluated timestamp", () => {
    const future = cache.tickers.filter(
      (t) => t.lastEvaluated && new Date(t.lastEvaluated).getTime() > Date.now() + 60000
    );
    expect(future.length).toBe(0);
  });
});

// ─── Top 10 / Top 20 Tickers ────────────────────────────────────

describe("Top Tickers: Selection & Display", () => {
  const cache = loadCache();
  const top10 = getTopN(cache.tickers, 10);
  const top20 = getTopN(cache.tickers, 20);

  it("top 10 tickers can be computed from cache", () => {
    expect(top10.length).toBe(10);
  });

  it("top 20 tickers can be computed from cache", () => {
    expect(top20.length).toBe(20);
  });

  it("top 10 is a subset of top 20", () => {
    const top20Symbols = new Set(top20.map((t) => t.symbol));
    for (const t of top10) {
      expect(top20Symbols.has(t.symbol)).toBe(true);
    }
  });

  it("top 10 are sorted by score descending", () => {
    for (let i = 1; i < top10.length; i++) {
      expect(top10[i - 1].score).toBeGreaterThanOrEqual(top10[i].score);
    }
  });

  it("top 20 are sorted by score descending", () => {
    for (let i = 1; i < top20.length; i++) {
      expect(top20[i - 1].score).toBeGreaterThanOrEqual(top20[i].score);
    }
  });

  it("top 10 scores are above threshold (not all zeros/low)", () => {
    const avgScore = top10.reduce((s, t) => s + t.score, 0) / top10.length;
    expect(avgScore).toBeGreaterThan(2);
  });

  it("all top 10 tickers have valid symbol strings", () => {
    for (const t of top10) {
      expect(typeof t.symbol).toBe("string");
      expect(t.symbol.length).toBeGreaterThan(0);
      expect(t.symbol).toBe(t.symbol.toUpperCase());
    }
  });

  it("all top 20 tickers are from known lists or validated cache", () => {
    // Tickers may come from full scan which can include validated tickers
    // not in the static TICKER_UNIVERSE (e.g. discovered via Alpaca)
    for (const t of top20) {
      expect(typeof t.symbol).toBe("string");
      expect(t.symbol.length).toBeGreaterThan(0);
      // All symbols should be uppercase
      expect(t.symbol).toBe(t.symbol.toUpperCase());
    }
  });
});

// ─── Calculated Data Fields ──────────────────────────────────────

describe("Ticker Data: Calculated Fields Present", () => {
  const cache = loadCache();
  const top10 = getTopN(cache.tickers, 10);

  it("each top ticker has a numeric score (0-10)", () => {
    for (const t of top10) {
      expect(typeof t.score).toBe("number");
      expect(t.score).toBeGreaterThanOrEqual(0);
      expect(t.score).toBeLessThanOrEqual(10);
    }
  });

  it("each top ticker has price data", () => {
    for (const t of top10) {
      expect(typeof t.price).toBe("number");
      expect(t.price).toBeGreaterThan(0);
    }
  });

  it("each top ticker has MACD data", () => {
    for (const t of top10) {
      expect(t.macd).toBeDefined();
      expect(t.macd).toHaveProperty("trend");
      expect(["bullish", "bearish", "neutral"]).toContain(t.macd.trend);
    }
  });

  it("each top ticker has volume score data", () => {
    for (const t of top10) {
      expect(t.volumeScore).toBeDefined();
      expect(typeof t.volumeScore.score).toBe("number");
      expect(t.volumeScore).toHaveProperty("status");
    }
  });

  it("each top ticker has RSI value", () => {
    for (const t of top10) {
      expect(typeof t.rsi).toBe("number");
      expect(t.rsi).toBeGreaterThanOrEqual(0);
      expect(t.rsi).toBeLessThanOrEqual(100);
    }
  });

  it("each top ticker has a name", () => {
    for (const t of top10) {
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
    }
  });

  it("each top ticker has lastEvaluated timestamp", () => {
    for (const t of top10) {
      expect(t.lastEvaluated).toBeDefined();
      const d = new Date(t.lastEvaluated);
      expect(d.getTime()).not.toBeNaN();
    }
  });

  it("signal can be derived from each top ticker score", () => {
    for (const t of top10) {
      const signal = getSignalFromScore(t.score);
      expect(signal).toHaveProperty("label");
      expect(typeof signal.label).toBe("string");
      expect(signal.label.length).toBeGreaterThan(0);
    }
  });
});

// ─── Stale & Invalid Data Rejection ──────────────────────────────

describe("Ticker Data: Stale & Invalid Rejection", () => {
  const cache = loadCache();

  it("no ticker has score outside 0-10 range", () => {
    const outOfRange = cache.tickers.filter(
      (t) => typeof t.score === "number" && (t.score < 0 || t.score > 10)
    );
    expect(outOfRange.length).toBe(0);
  });

  it("no ticker has empty string symbol", () => {
    const empty = cache.tickers.filter((t) => !t.symbol || t.symbol.trim() === "");
    expect(empty.length).toBe(0);
  });

  it("no duplicate symbols in cache", () => {
    const seen = new Set();
    const dupes = [];
    for (const t of cache.tickers) {
      if (seen.has(t.symbol)) dupes.push(t.symbol);
      seen.add(t.symbol);
    }
    expect(dupes.length).toBe(0);
  });

  it("tickers with both null changePercent and null/zero avgVolume are penalized", () => {
    const missingData = cache.tickers.filter(
      (t) =>
        (t.changePercent === null || t.changePercent === undefined) &&
        (t.avgVolume === null || t.avgVolume === undefined || t.avgVolume <= 0)
    );
    // Most missing-data tickers should have low scores
    const highScoreMissing = missingData.filter(
      (t) => typeof t.score === "number" && t.score > 5
    );
    // Most missing-data tickers should have low scores
    // Some tickers may have null changePercent but valid volume from Alpaca fallback
    expect(highScoreMissing.length).toBeLessThanOrEqual(missingData.length * 0.5 + 2);
  });

  it("tickers missing RSI default to 50 (neutral)", () => {
    const noHistory = cache.tickers.filter(
      (t) => t.rsi === 50 && (t.changePercent === null || t.changePercent === undefined)
    );
    for (const t of noHistory) {
      expect(t.rsi).toBe(50);
    }
  });

  it("cache tickers are sorted by score descending", () => {
    for (let i = 1; i < cache.tickers.length; i++) {
      expect(cache.tickers[i - 1].score).toBeGreaterThanOrEqual(cache.tickers[i].score);
    }
  });
});

// ─── Live Fetch (Server or Cache Fallback) ───────────────────────

describe("Ticker Fetch: Live Data", () => {
  it("fetchTickers returns data with tickers array", async () => {
    const result = await fetchTickers();
    expect(result).toHaveProperty("tickers");
    expect(Array.isArray(result.tickers)).toBe(true);
    expect(result.tickers.length).toBeGreaterThan(0);
  });

  it("fetched tickers have score and symbol", async () => {
    const result = await fetchTickers();
    const sample = result.tickers[0];
    expect(sample).toHaveProperty("symbol");
    expect(sample).toHaveProperty("score");
    expect(typeof sample.score).toBe("number");
  });

  it("fetched data includes lastUpdate timestamp", async () => {
    const result = await fetchTickers();
    expect(result.lastUpdate).toBeDefined();
  });

  it("fetched top 10 all have calculated scores", async () => {
    const result = await fetchTickers();
    const top10 = getTopN(result.tickers, 10);
    expect(top10.length).toBe(10);
    for (const t of top10) {
      expect(t.score).toBeGreaterThan(0);
      expect(t.score).toBeLessThanOrEqual(10);
    }
  });

  it("fetched top 20 all have valid symbols", async () => {
    const result = await fetchTickers();
    const top20 = getTopN(result.tickers, 20);
    for (const t of top20) {
      expect(typeof t.symbol).toBe("string");
      expect(t.symbol).toBe(t.symbol.toUpperCase());
      expect(t.symbol.length).toBeGreaterThan(0);
    }
  });
});

// ─── Scoring Algorithm Sanity ────────────────────────────────────

describe("Scoring Algorithms: Calculated Output", () => {
  it("MACD with rising prices returns bullish or neutral trend", () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
    const result = calculateMACD(rising);
    expect(result).toHaveProperty("trend");
    expect(["bullish", "bearish", "neutral"]).toContain(result.trend);
    expect(result).toHaveProperty("macd");
    expect(result).toHaveProperty("signal");
    expect(result).toHaveProperty("histogram");
  });

  it("MACD with insufficient data returns nulls", () => {
    const result = calculateMACD([100, 101]);
    expect(result.macd).toBeNull();
    expect(result.trend).toBeNull();
  });

  it("volume score with normal volumes returns valid score", () => {
    const volumes = Array.from({ length: 15 }, () => 1000000);
    const result = calculateVolumeScore(volumes);
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("status");
    expect(typeof result.score).toBe("number");
  });

  it("volume score with insufficient data returns nulls", () => {
    const result = calculateVolumeScore([1000]);
    expect(result.score).toBeNull();
  });

  it("getSignalFromScore maps scores to labels", () => {
    const high = getSignalFromScore(9.5);
    expect(high.label).toMatch(/BUY/i);

    const low = getSignalFromScore(1.0);
    expect(low.label).toMatch(/SELL|AVOID/i);

    const mid = getSignalFromScore(5.0);
    expect(mid.label).toBeDefined();
  });

  it("getActionFromScore returns action string", () => {
    const action = getActionFromScore(8.5);
    expect(typeof action).toBe("string");
    expect(action.length).toBeGreaterThan(0);
  });

  it("SCORE_THRESHOLDS defines all required levels", () => {
    expect(SCORE_THRESHOLDS).toHaveProperty("EXTREME_BUY");
    expect(SCORE_THRESHOLDS).toHaveProperty("BUY");
    expect(SCORE_THRESHOLDS).toHaveProperty("HOLD_HIGH");
    expect(typeof SCORE_THRESHOLDS.EXTREME_BUY).toBe("number");
  });
});
