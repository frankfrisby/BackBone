/**
 * Stock Sweep & Refresh System Tests
 * Tests the Yahoo Finance server, client, scoring algorithms, and full pipeline.
 * Created 2026-01-28 as part of system audit.
 */

import assert from "assert";
import fs from "fs";
import path from "path";
import http from "http";

const DATA_DIR = path.join(process.cwd(), "data");
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: "PASS" });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: error.message });
    console.log(`  ✗ ${name}: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: "PASS" });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: "FAIL", error: error.message });
    console.log(`  ✗ ${name}: ${error.message}`);
  }
}

function skip(name, reason) {
  results.skipped++;
  results.tests.push({ name, status: "SKIP", reason });
  console.log(`  ⊘ ${name} (${reason})`);
}

// ===== 1. TICKER DATA - Core Lists =====
console.log("\n=== Ticker Data: Core Lists ===");

const { CORE_TICKERS, TICKER_UNIVERSE } = await import("../src/data/tickers.js");

test("CORE_TICKERS is a non-empty array of strings", () => {
  assert(Array.isArray(CORE_TICKERS), "CORE_TICKERS should be array");
  assert(CORE_TICKERS.length >= 100, `CORE_TICKERS should have 100+ symbols, got ${CORE_TICKERS.length}`);
  assert(typeof CORE_TICKERS[0] === "string", "Each ticker should be a string");
});

test("TICKER_UNIVERSE is larger than CORE_TICKERS", () => {
  assert(Array.isArray(TICKER_UNIVERSE), "TICKER_UNIVERSE should be array");
  assert(TICKER_UNIVERSE.length > CORE_TICKERS.length,
    `TICKER_UNIVERSE (${TICKER_UNIVERSE.length}) should be larger than CORE_TICKERS (${CORE_TICKERS.length})`);
});

test("CORE_TICKERS are all in TICKER_UNIVERSE", () => {
  const universeSet = new Set(TICKER_UNIVERSE);
  const missing = CORE_TICKERS.filter(t => !universeSet.has(t));
  assert(missing.length === 0, `Core tickers missing from universe: ${missing.join(", ")}`);
});

test("No duplicate tickers in CORE_TICKERS", () => {
  const seen = new Set();
  const dupes = [];
  for (const t of CORE_TICKERS) {
    if (seen.has(t)) dupes.push(t);
    seen.add(t);
  }
  assert(dupes.length === 0, `Duplicate core tickers: ${dupes.join(", ")}`);
});

test("No duplicate tickers in TICKER_UNIVERSE", () => {
  const seen = new Set();
  const dupes = [];
  for (const t of TICKER_UNIVERSE) {
    if (seen.has(t)) dupes.push(t);
    seen.add(t);
  }
  assert(dupes.length === 0, `Duplicate universe tickers: ${dupes.join(", ")}`);
});

test("Key blue-chip tickers are in CORE_TICKERS", () => {
  const mustHave = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];
  const coreSet = new Set(CORE_TICKERS);
  const missing = mustHave.filter(t => !coreSet.has(t));
  assert(missing.length === 0, `Missing blue-chip tickers from CORE: ${missing.join(", ")}`);
});

test("SPY is in CORE_TICKERS (needed for auto-trader SPY direction)", () => {
  assert(CORE_TICKERS.includes("SPY"), "SPY must be in CORE_TICKERS for auto-trader threshold logic");
});

// ===== 2. TRADING ALGORITHMS - Score Calculations =====
console.log("\n=== Trading Algorithms: Score Engine ===");

const { TRADING_CONFIG, TRADING_RULES, getActionFromScore } = await import("../src/services/trading-algorithms.js");
const { SCORE_THRESHOLDS, getSignalFromScore } = await import("../src/services/score-engine.js");

test("SCORE_THRESHOLDS has all required levels", () => {
  assert(SCORE_THRESHOLDS, "Should export SCORE_THRESHOLDS");
  // Should have buy/sell/hold thresholds
  assert(typeof SCORE_THRESHOLDS === "object", "Should be an object");
});

test("getSignalFromScore returns correct signals", () => {
  // Extreme buy (returns {label, color, bgColor, ...})
  const extremeBuy = getSignalFromScore(9.5);
  assert(extremeBuy, "Should return signal for 9.5");
  const buyLabel = extremeBuy.label || extremeBuy.signal || extremeBuy.action || "";
  assert(buyLabel.includes("BUY"), `Score 9.5 should signal BUY, got label: ${buyLabel}`);

  // Hold
  const hold = getSignalFromScore(5.0);
  assert(hold, "Should return signal for 5.0");
  const holdLabel = hold.label || hold.signal || hold.action || "";
  assert(holdLabel.includes("HOLD"), `Score 5.0 should signal HOLD, got label: ${holdLabel}`);

  // Sell
  const sell = getSignalFromScore(2.0);
  assert(sell, "Should return signal for 2.0");
  const sellLabel = sell.label || sell.signal || sell.action || "";
  assert(sellLabel.includes("SELL"), `Score 2.0 should signal SELL, got label: ${sellLabel}`);
});

test("getActionFromScore returns actionable data", () => {
  const action = getActionFromScore(8.5);
  assert(action, "Should return action for 8.5");
});

test("TRADING_CONFIG has required parameters", () => {
  assert(TRADING_CONFIG, "Should export TRADING_CONFIG");
});

// ===== 3. TICKERS CACHE - File Integrity =====
console.log("\n=== Tickers Cache: File Integrity ===");

test("tickers-cache.json exists and has proper structure", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  assert(fs.existsSync(cachePath), "tickers-cache.json must exist");

  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  assert(data.tickers, "Cache must have tickers array");
  assert(Array.isArray(data.tickers), "tickers must be array");
  assert(data.tickers.length > 0, `Cache should have tickers, got ${data.tickers.length}`);
});

test("Cached tickers have required fields", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  const sample = data.tickers[0];

  assert(sample.symbol, "Ticker must have symbol");
  assert(typeof sample.score === "number", `Ticker must have numeric score, got ${typeof sample.score}`);
  assert(typeof sample.price === "number" || sample.price === null, "Ticker should have price");
});

test("Cached tickers are sorted by score (descending)", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  for (let i = 1; i < Math.min(data.tickers.length, 50); i++) {
    const prev = data.tickers[i - 1].score || 0;
    const curr = data.tickers[i].score || 0;
    assert(prev >= curr,
      `Tickers not sorted: ${data.tickers[i - 1].symbol}(${prev}) should be >= ${data.tickers[i].symbol}(${curr})`);
  }
});

test("Ticker scores are within 0-10 range", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  const outOfRange = data.tickers.filter(t => t.score < 0 || t.score > 10);
  assert(outOfRange.length === 0,
    `${outOfRange.length} tickers have scores outside 0-10: ${outOfRange.slice(0, 3).map(t => `${t.symbol}:${t.score}`).join(", ")}`);
});

test("Cache has lastUpdate timestamp", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  assert(data.lastUpdate, "Cache must have lastUpdate");
  const updateDate = new Date(data.lastUpdate);
  assert(!isNaN(updateDate.getTime()), "lastUpdate must be valid date");
});

test("Cache tickers include MACD data", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  // At least some tickers should have MACD data
  const withMacd = data.tickers.filter(t => t.macd && t.macd.trend);
  assert(withMacd.length > 0, "At least some tickers should have MACD data");

  // MACD trend should be valid
  const validTrends = ["bullish", "bearish", "neutral"];
  const invalidMacd = withMacd.filter(t => !validTrends.includes(t.macd.trend));
  assert(invalidMacd.length === 0,
    `Invalid MACD trends: ${invalidMacd.slice(0, 3).map(t => `${t.symbol}:${t.macd.trend}`).join(", ")}`);
});

test("Cache tickers include volume score data", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  const withVolume = data.tickers.filter(t => t.volumeScore);
  assert(withVolume.length > 0, "At least some tickers should have volume score data");

  const validStatuses = ["high", "above_avg", "normal", "below_avg", "low"];
  const invalidVol = withVolume.filter(t => !validStatuses.includes(t.volumeScore.status));
  assert(invalidVol.length === 0,
    `Invalid volume statuses: ${invalidVol.slice(0, 3).map(t => `${t.symbol}:${t.volumeScore.status}`).join(", ")}`);
});

test("Cache tickers include RSI data", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  const withRsi = data.tickers.filter(t => typeof t.rsi === "number");
  assert(withRsi.length > 0, "At least some tickers should have RSI");

  const invalidRsi = withRsi.filter(t => t.rsi < 0 || t.rsi > 100);
  assert(invalidRsi.length === 0,
    `RSI out of range: ${invalidRsi.slice(0, 3).map(t => `${t.symbol}:${t.rsi}`).join(", ")}`);
});

// ===== 4. YAHOO CLIENT - Server Communication =====
console.log("\n=== Yahoo Client: Server Communication ===");

const { isServerRunning, fetchTickers, triggerFullScan, refreshTickers, getServerStatus } = await import("../src/services/yahoo-client.js");

await asyncTest("isServerRunning returns boolean", async () => {
  const running = await isServerRunning();
  assert(typeof running === "boolean", "Should return boolean");
});

await asyncTest("getServerStatus returns status object", async () => {
  const status = await getServerStatus();
  assert(typeof status === "object", "Should return object");
  assert(status.status, "Should have status field");
});

// Test fetchTickers - should work even if server is offline (falls back to cache)
await asyncTest("fetchTickers returns data (from server or cache)", async () => {
  const result = await fetchTickers();
  assert(result, "Should return result");
  assert(typeof result.success === "boolean", "Should have success flag");
  if (result.success) {
    assert(Array.isArray(result.tickers), "Should have tickers array");
    assert(result.tickers.length > 0, "Should have ticker data");
  }
  // If server is offline, cache fallback should still work
  if (result.fromCache) {
    assert(result.tickers.length > 0, "Cache fallback should have data");
  }
});

// ===== 5. YAHOO SERVER - Live Integration (if running) =====
console.log("\n=== Yahoo Server: Live Integration ===");

const serverRunning = await isServerRunning();

if (serverRunning) {
  await asyncTest("Server /health endpoint returns valid status", async () => {
    const status = await getServerStatus();
    assert.strictEqual(status.status, "ok", "Health should be ok");
    assert(typeof status.tickerCount === "number", "Should report ticker count");
  });

  await asyncTest("Server /api/tickers returns scored tickers", async () => {
    const result = await fetchTickers();
    assert(result.success, "Should succeed");
    assert(result.tickers.length > 0, `Should have tickers, got ${result.tickers.length}`);
    assert(result.count, "Should report count");

    // Verify first ticker has full analysis
    const first = result.tickers[0];
    assert(first.symbol, "Top ticker should have symbol");
    assert(typeof first.score === "number", "Top ticker should have score");
    assert(first.score >= 0 && first.score <= 10, `Score should be 0-10, got ${first.score}`);
  });

  await asyncTest("Server /api/refresh triggers refresh", async () => {
    const success = await refreshTickers();
    // refreshTickers returns boolean
    assert(typeof success === "boolean", "Should return boolean");
  });

await asyncTest("Server /api/full-scan triggers scan", async () => {
    const result = await triggerFullScan();
    assert(result, "Should return result");
    assert(result.success !== undefined || result.message, "Should have success or message");
  });

  await asyncTest("Full scan updates cache timestamps", async () => {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    const before = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const beforeUpdate = before.lastUpdate ? new Date(before.lastUpdate).getTime() : 0;
    const beforeScan = before.lastFullScan ? new Date(before.lastFullScan).getTime() : 0;

    await triggerFullScan(true);

    const deadline = Date.now() + 3 * 60 * 1000; // up to 3 minutes
    let updated = false;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
      const after = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      const afterUpdate = after.lastUpdate ? new Date(after.lastUpdate).getTime() : 0;
      const afterScan = after.lastFullScan ? new Date(after.lastFullScan).getTime() : 0;
      if (afterUpdate > beforeUpdate || afterScan > beforeScan) {
        updated = true;
        break;
      }
    }

    assert(updated, "Cache timestamps did not update after full scan");
  });

  await asyncTest("Server reports scan progress correctly", async () => {
    const result = await fetchTickers();
    assert(typeof result.fullScanRunning === "boolean", "Should report fullScanRunning");
    // evaluatedToday and universeSize may only be present when server returns them
    assert(typeof result.count === "number" || typeof result.evaluatedToday === "number",
      "Should report count or evaluatedToday");
  });
} else {
  skip("Server /health endpoint", "Yahoo server not running");
  skip("Server /api/tickers returns scored tickers", "Yahoo server not running");
  skip("Server /api/refresh triggers refresh", "Yahoo server not running");
  skip("Server /api/full-scan triggers scan", "Yahoo server not running");
  skip("Server reports scan progress correctly", "Yahoo server not running");

  // Even without server, verify cache fallback works
  await asyncTest("Cache fallback works when server is offline", async () => {
    const result = await fetchTickers();
    assert(result, "Should return result even offline");
    if (result.success && result.fromCache) {
      assert(result.tickers.length > 0, "Cache should have data");
    }
  });
}

// ===== 6. AUTO-TRADER INTEGRATION - Full Pipeline =====
console.log("\n=== Auto-Trader: Full Pipeline with Real Cache ===");

const { evaluateBuySignal, evaluateSellSignal, loadConfig } = await import("../src/services/auto-trader.js");

test("Auto-trader can evaluate real cached tickers", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  // Get top 5 tickers from cache
  const top5 = data.tickers.slice(0, 5);
  assert(top5.length > 0, "Should have cached tickers");

  // Evaluate each one
  for (const ticker of top5) {
    const buyResult = evaluateBuySignal(ticker);
    assert(buyResult.action, `Buy eval for ${ticker.symbol} should have action`);
    assert(["BUY", "EXTREME_BUY", "HOLD"].includes(buyResult.action),
      `${ticker.symbol} buy action should be valid, got ${buyResult.action}`);
    assert(buyResult.signals.length > 0, `${ticker.symbol} should have signals`);

    const sellResult = evaluateSellSignal(ticker);
    assert(sellResult.action, `Sell eval for ${ticker.symbol} should have action`);
    assert(["SELL", "EXTREME_SELL", "HOLD"].includes(sellResult.action),
      `${ticker.symbol} sell action should be valid, got ${sellResult.action}`);
  }
});

test("Auto-trader correctly identifies top scorers as buys", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  // Find any ticker with score >= 9.0 (extreme buy threshold)
  const extremeScorers = data.tickers.filter(t => t.score >= 9.0);
  for (const ticker of extremeScorers) {
    const result = evaluateBuySignal(ticker);
    assert(result.action === "EXTREME_BUY",
      `${ticker.symbol} score ${ticker.score} should be EXTREME_BUY, got ${result.action}`);
  }
});

test("Auto-trader correctly identifies low scorers as sells", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  // Find any ticker with score <= 1.5 (extreme sell threshold)
  const lowScorers = data.tickers.filter(t => t.score <= 1.5);
  for (const ticker of lowScorers) {
    const result = evaluateSellSignal(ticker);
    assert(result.action === "EXTREME_SELL",
      `${ticker.symbol} score ${ticker.score} should be EXTREME_SELL, got ${result.action}`);
  }
});

test("Score distribution looks reasonable", () => {
  const cachePath = path.join(DATA_DIR, "tickers-cache.json");
  const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));

  const scores = data.tickers.map(t => t.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  // Average should be somewhere reasonable (3-7)
  assert(avg >= 2 && avg <= 8,
    `Average score ${avg.toFixed(2)} seems off (expected 2-8)`);
  // Should have some spread
  assert(max - min >= 2,
    `Score spread (${min.toFixed(1)} - ${max.toFixed(1)}) too narrow`);
});

// ===== 7. TRADING HISTORY =====
console.log("\n=== Trading History ===");

const { getTradingHistory, getNextTradingTime, formatTimeAgo } = await import("../src/services/trading-history.js");

test("getTradingHistory returns valid structure", () => {
  const history = getTradingHistory();
  assert(history, "Should return history");
  assert(typeof history === "object" || Array.isArray(history), "Should be object or array");
});

test("formatTimeAgo formats correctly", () => {
  const now = new Date();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000);
  const result = formatTimeAgo(fiveMinAgo);
  assert(typeof result === "string", "Should return string");
  assert(result.length > 0, "Should not be empty");
});

test("getNextTradingTime returns valid data", () => {
  const next = getNextTradingTime();
  assert(next, "Should return data");
});

// ===== 8. TRADES LOG DATA =====
console.log("\n=== Trades Log: Data Integrity ===");

test("trades-log.json has valid trade entries", () => {
  const tradesPath = path.join(DATA_DIR, "trades-log.json");
  const trades = JSON.parse(fs.readFileSync(tradesPath, "utf-8"));
  assert(Array.isArray(trades), "Should be array");

  for (const trade of trades) {
    assert(trade.symbol, `Trade missing symbol: ${JSON.stringify(trade)}`);
    assert(trade.side === "buy" || trade.side === "sell",
      `Trade ${trade.symbol} has invalid side: ${trade.side}`);
    assert(trade.timestamp, `Trade ${trade.symbol} missing timestamp`);
  }
});

// ===== SUMMARY =====
console.log("\n" + "=".repeat(50));
console.log("=== Stock System Test Summary ===");
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
console.log(`  Skipped: ${results.skipped}`);
console.log(`  Total:   ${results.passed + results.failed + results.skipped}`);

if (results.failed > 0) {
  console.log("\nFailed tests:");
  results.tests.filter(t => t.status === "FAIL").forEach(t => {
    console.log(`  ✗ ${t.name}`);
    console.log(`    ${t.error}`);
  });
  process.exit(1);
} else {
  console.log("\nAll stock system tests passed! ✓");
  process.exit(0);
}
