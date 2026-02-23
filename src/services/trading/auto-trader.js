import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { getAlpacaConfig, fetchAccount, getTradingSettings } from "./alpaca.js";
import { TRADING_CONFIG, TRADING_RULES, isGoodMomentum, isProtectedPosition, getActionFromScore } from "./trading-algorithms.js";
import { SCORE_THRESHOLDS, getSignalFromScore } from "./score-engine.js";
import { showNotificationTitle } from "../ui/terminal-resize.js";
import { loadParsedGoals, getGoalsWithProgress } from "../goals/core-goals-parser.js";
import { getTickerGoalBoost, checkGoalGuardrails } from "../goals/goal-alignment-scorer.js";

import { getDataDir } from "../paths.js";
// Note: Trailing stop manager is imported dynamically to avoid circular dependency
let trailingStopManager = null;
const getTrailingStopManager = async () => {
  if (!trailingStopManager) {
    trailingStopManager = await import("./trailing-stop-manager.js");
  }
  return trailingStopManager;
};

// Note: Momentum drift is imported dynamically to avoid circular dependency
let momentumDriftModule = null;
const getMomentumDrift = async () => {
  if (!momentumDriftModule) {
    momentumDriftModule = await import("./momentum-drift.js");
  }
  return momentumDriftModule;
};

// SPY intraday bars cache (2-minute TTL)
let spyIntradayCache = { bars: null, timestamp: 0 };
const SPY_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Per-ticker price cache (8-second TTL for observation polling)
const tickerPriceCache = {};
const TICKER_PRICE_CACHE_TTL = 8 * 1000; // 8 seconds

// --- Market-Open Price Stabilization ---
// Observation buffer: { SYMBOL: [{ price, time }, ...] }
const observationBuffer = {};
// Track which tickers we've already bought via observation (reset daily)
const observationBuysExecuted = new Set();
let observationBuysDate = null;
// Observation sampler interval handle
let observationSamplerInterval = null;
// Tickers currently being observed
let observationTargets = [];

// Observation config
const OBSERVATION_WINDOW = {
  startMinutesSinceOpen: 5,   // Start sampling at 9:35 (let market settle first 5 min)
  minMinutesBeforeBuy: 15,    // Earliest buy at 9:45 (15 min of data)
  endMinutesSinceOpen: 20,    // Stop observation mode at 9:50
  sampleIntervalMs: 10 * 1000, // Sample every 10 seconds
  shortMaSamples: 6,          // Last 6 samples (~1 min) for short MA
  // Buy triggers
  bounceDropPercent: 1.5,     // Price must drop 1.5% from initial to count as dip
  bounceRecoverPercent: 0.3,  // Must recover 0.3% from low to trigger bounce buy
  timeoutNearLowPercent: 0.5, // At timeout, buy if within 0.5% of observation low
};

// Sector mapping for correlation guard — don't hold 2 positions in the same sector
// This prevents concentrated risk (e.g., both NVDA and AMD tanking together)
const SECTOR_MAP = {
  // Semiconductors
  NVDA: "semis", AMD: "semis", INTC: "semis", AVGO: "semis", QCOM: "semis", MU: "semis", MRVL: "semis", SOXL: "semis", SOXS: "semis",
  // Big Tech
  AAPL: "big-tech", MSFT: "big-tech", GOOG: "big-tech", GOOGL: "big-tech", META: "big-tech", AMZN: "big-tech",
  // Cloud/SaaS
  SNOW: "cloud", CRM: "cloud", DDOG: "cloud", CFLT: "cloud", NET: "cloud", ZS: "cloud", PLTR: "cloud",
  // EV/Auto
  TSLA: "ev", RIVN: "ev", NIO: "ev", LCID: "ev", XPEV: "ev",
  // E-commerce/Retail
  CHWY: "ecom", W: "ecom", MELI: "ecom", JMIA: "ecom", CVNA: "ecom", ETSY: "ecom", SHOP: "ecom",
  // Streaming/Media
  NFLX: "media", ROKU: "media", SPOT: "media", PINS: "media", SNAP: "media", ZM: "media",
  // Fintech
  COIN: "fintech", HOOD: "fintech", SOFI: "fintech", UPST: "fintech", SQ: "fintech", PYPL: "fintech",
  // Crypto-adjacent
  MARA: "crypto", RIOT: "crypto", CLSK: "crypto", BITF: "crypto", MSTR: "crypto",
  // Biotech
  CRSP: "biotech", MRNA: "biotech",
  // Solar
  FSLR: "solar", ENPH: "solar", SPWR: "solar",
  // Meme/Speculative
  AMC: "meme", GME: "meme", CLOV: "meme", SNDL: "meme",
  // Aerospace
  RKLB: "aero", BA: "aero",
  // AI
  AI: "ai-sw", BBAI: "ai-sw",
};

const getSector = (symbol) => SECTOR_MAP[symbol] || null;

// Bad market items - inverse ETFs and defensive positions that DO WELL when market is DOWN
// These are the ONLY items allowed to be bought when SPY is negative
const BAD_MARKET_ITEMS = [
  "SH",    // ProShares Short S&P 500
  "SDS",   // ProShares UltraShort S&P 500 (2x)
  "SPXU",  // ProShares UltraPro Short S&P 500 (3x)
  "SQQQ",  // ProShares UltraPro Short QQQ (3x)
  "PSQ",   // ProShares Short QQQ
  "QID",   // ProShares UltraShort QQQ (2x)
  "DOG",   // ProShares Short Dow 30
  "DXD",   // ProShares UltraShort Dow 30 (2x)
  "SDOW",  // ProShares UltraPro Short Dow 30 (3x)
  "RWM",   // ProShares Short Russell 2000
  "TWM",   // ProShares UltraShort Russell 2000 (2x)
  "SRTY",  // ProShares UltraPro Short Russell 2000 (3x)
  "VIXY",  // ProShares VIX Short-Term Futures
  "UVXY",  // ProShares Ultra VIX Short-Term Futures (1.5x)
  "VXX",   // iPath Series B S&P 500 VIX Short-Term Futures
  "TZA",   // Direxion Daily Small Cap Bear 3X
  "FAZ",   // Direxion Daily Financial Bear 3X
  "SOXS",  // Direxion Daily Semiconductor Bear 3X
  "LABD",  // Direxion Daily S&P Biotech Bear 3X
  "EDZ",   // Direxion Daily Emerging Markets Bear 3X
];

// Pending buy orders - queue with 5-minute delay
// Structure: { symbol, price, reason, queuedAt, executeAfter }
let pendingBuys = [];
const BUY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a symbol is a "bad market item" (inverse/defensive)
 */
const isBadMarketItem = (symbol) => {
  return BAD_MARKET_ITEMS.includes(symbol?.toUpperCase());
};

/**
 * Get wealth goal context for trading decisions
 * Returns timeline-based risk tolerance and required growth rate
 */
const getWealthGoalContext = () => {
  try {
    const goalsWithProgress = getGoalsWithProgress();
    const wealthGoal = goalsWithProgress.find(g => g.id === "wealth" || g.type === "financial");

    if (!wealthGoal) {
      return { hasWealthGoal: false };
    }

    const details = wealthGoal.progressDetails || {};
    const daysRemaining = details.daysRemaining || 730; // Default 2 years

    // Risk tolerance based on timeline and required growth
    // If required daily growth is very high (>1%), need aggressive approach
    const requiredDailyPercent = details.requiredDailyPercent || 0;
    let riskTolerance = "moderate";

    if (requiredDailyPercent > 1.0) {
      // Need >1%/day - aggressive is necessary but may not be realistic
      riskTolerance = "aggressive";
    } else if (daysRemaining > 365) {
      riskTolerance = "aggressive"; // More than a year = aggressive
    } else if (daysRemaining > 180) {
      riskTolerance = "moderate";   // 6-12 months = moderate
    } else {
      riskTolerance = "conservative"; // < 6 months = conservative
    }

    return {
      hasWealthGoal: true,
      currentEquity: details.current || 0,
      targetEquity: details.target || 1000000,
      daysRemaining,
      requiredDailyGrowth: details.requiredDaily || 0,
      requiredDailyPercent: requiredDailyPercent,
      progress: wealthGoal.progress || 0,
      riskTolerance
    };
  } catch (error) {
    console.error("[AutoTrader] Wealth goal context error:", error.message);
    return { hasWealthGoal: false };
  }
};

/**
 * Queue a buy order with 5-minute delay
 */
const queueBuy = (symbol, price, reason, spyPositive) => {
  const now = Date.now();
  const executeAfter = now + BUY_DELAY_MS;

  // Check if already queued
  const existing = pendingBuys.find(p => p.symbol === symbol);
  if (existing) {
    console.log(`[AutoTrader] ${symbol} already queued, skipping duplicate`);
    return { queued: false, reason: "Already in queue" };
  }

  pendingBuys.push({
    symbol,
    price,
    reason,
    spyPositive,
    queuedAt: now,
    executeAfter
  });

  console.log(`[AutoTrader] Queued BUY ${symbol} @ $${price.toFixed(2)} — will execute in 5 minutes`);
  return { queued: true, executeAfter };
};

/**
 * Process pending buys that have passed the 5-minute delay
 */
export const processPendingBuys = async () => {
  const now = Date.now();
  const ready = pendingBuys.filter(p => now >= p.executeAfter);

  if (ready.length === 0) {
    return { processed: 0, results: [] };
  }

  const results = [];

  for (const pending of ready) {
    console.log(`[AutoTrader] Processing delayed buy: ${pending.symbol}`);

    // Re-check market conditions before executing
    const currentSpyData = await fetchSpyIntradayBars();
    const currentSpyPositive = currentSpyData ?
      (currentSpyData[currentSpyData.length - 1]?.c > currentSpyData[0]?.c) : pending.spyPositive;

    // If market turned bad and this isn't a bad market item, cancel
    if (!currentSpyPositive && !isBadMarketItem(pending.symbol)) {
      console.log(`[AutoTrader] Cancelling ${pending.symbol} — market turned negative`);
      results.push({ symbol: pending.symbol, success: false, reason: "Market turned negative" });
      continue;
    }

    // Execute the buy
    const result = await executeBuyImmediate(pending.symbol, pending.price, pending.reason);
    results.push({ symbol: pending.symbol, ...result });
  }

  // Remove processed items from queue
  pendingBuys = pendingBuys.filter(p => now < p.executeAfter);

  return { processed: results.length, results };
};

/**
 * Get pending buys status
 */
export const getPendingBuys = () => {
  const now = Date.now();
  return pendingBuys.map(p => ({
    ...p,
    remainingMs: Math.max(0, p.executeAfter - now),
    remainingSeconds: Math.max(0, Math.round((p.executeAfter - now) / 1000))
  }));
};

/**
 * Cancel a pending buy
 */
export const cancelPendingBuy = (symbol) => {
  const before = pendingBuys.length;
  pendingBuys = pendingBuys.filter(p => p.symbol !== symbol);
  return before > pendingBuys.length;
};

/**
 * Fetch SPY 1-minute intraday bars from Yahoo Finance
 * Returns array of { t, c, h, l, v } (timestamp, close, high, low, volume)
 */
const fetchSpyIntradayBars = async () => {
  const now = Date.now();
  if (spyIntradayCache.bars && (now - spyIntradayCache.timestamp) < SPY_CACHE_TTL) {
    return spyIntradayCache.bars;
  }

  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1m&range=1d";
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!response.ok) {
      console.error(`[SPY Intraday] Yahoo fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) {
      return null;
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const bars = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] != null) {
        bars.push({
          t: timestamps[i],
          c: quote.close[i],
          h: quote.high[i] || quote.close[i],
          l: quote.low[i] || quote.close[i],
          v: quote.volume[i] || 0
        });
      }
    }

    spyIntradayCache = { bars, timestamp: now };
    return bars;
  } catch (error) {
    console.error("[SPY Intraday] Fetch error:", error.message);
    return null;
  }
};

/**
 * Fetch current price for a single ticker from Yahoo Finance.
 * Per-symbol cache with 8-second TTL (we poll every 10s).
 */
const fetchTickerPrice = async (symbol) => {
  const now = Date.now();
  const cached = tickerPriceCache[symbol];
  if (cached && (now - cached.timestamp) < TICKER_PRICE_CACHE_TTL) {
    return cached.price;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const quotes = result?.indicators?.quote?.[0];
    if (!quotes?.close) return null;

    // Get the most recent non-null close
    for (let i = quotes.close.length - 1; i >= 0; i--) {
      if (quotes.close[i] != null) {
        const price = quotes.close[i];
        tickerPriceCache[symbol] = { price, timestamp: now };
        return price;
      }
    }
    return null;
  } catch (error) {
    console.error(`[ObservePrice] ${symbol} fetch error:`, error.message);
    return null;
  }
};

/**
 * Check if we're in the market-open observation window.
 * Returns { inWindow, minutesSinceOpen, canBuy }
 */
const getObservationWindowStatus = () => {
  const { hours, minutes, dayOfWeek } = getEasternTime();
  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') {
    return { inWindow: false, minutesSinceOpen: -1, canBuy: false };
  }
  const minutesSinceOpen = (hours * 60 + minutes) - (9 * 60 + 30);
  const inWindow = minutesSinceOpen >= OBSERVATION_WINDOW.startMinutesSinceOpen
    && minutesSinceOpen < OBSERVATION_WINDOW.endMinutesSinceOpen;
  const canBuy = minutesSinceOpen >= OBSERVATION_WINDOW.minMinutesBeforeBuy;
  return { inWindow, minutesSinceOpen, canBuy };
};

/**
 * Start the background price sampler for market-open observation.
 * Called when monitorAndTrade detects we're in the observation window.
 * Samples all observationTargets every 10s and stores in observationBuffer.
 */
const startObservationSampler = (targets) => {
  // Reset daily tracking
  const today = new Date().toDateString();
  if (observationBuysDate !== today) {
    observationBuysExecuted.clear();
    observationBuysDate = today;
  }

  observationTargets = targets;

  // Don't start if already running
  if (observationSamplerInterval) return;

  console.log(`[Observation] Starting price sampler for: ${targets.join(", ")}`);

  // Sample immediately, then every 10s
  const sample = async () => {
    for (const symbol of observationTargets) {
      const price = await fetchTickerPrice(symbol);
      if (price != null) {
        if (!observationBuffer[symbol]) observationBuffer[symbol] = [];
        observationBuffer[symbol].push({ price, time: Date.now() });
      }
    }
  };

  sample(); // first sample now
  observationSamplerInterval = setInterval(sample, OBSERVATION_WINDOW.sampleIntervalMs);
};

/**
 * Stop the observation sampler (called when window ends or all buys done).
 */
const stopObservationSampler = () => {
  if (observationSamplerInterval) {
    clearInterval(observationSamplerInterval);
    observationSamplerInterval = null;
    console.log("[Observation] Stopped price sampler");
  }
};

/**
 * Analyze observation buffer for a ticker and determine if it's time to buy.
 * Returns { shouldBuy, price, reason } or { shouldBuy: false, reason }
 *
 * Buy triggers:
 * 1. Short MA crosses above long MA (golden cross on micro scale)
 * 2. Price dropped 1.5%+ from initial then recovered 0.3%+ (bounce from bottom)
 * 3. At window end: buy if price is within 0.5% of observation low
 */
const analyzeObservation = (symbol, isWindowEnding) => {
  const samples = observationBuffer[symbol];
  if (!samples || samples.length < 3) {
    return { shouldBuy: false, reason: `Only ${samples?.length || 0} samples — need more data` };
  }

  const prices = samples.map(s => s.price);
  const initialPrice = prices[0];
  const currentPrice = prices[prices.length - 1];
  const observationLow = Math.min(...prices);
  const observationHigh = Math.max(...prices);

  // Compute short MA (last ~1 min = 6 samples) and long MA (all samples)
  const shortWindow = Math.min(OBSERVATION_WINDOW.shortMaSamples, prices.length);
  const shortSlice = prices.slice(-shortWindow);
  const shortMa = shortSlice.reduce((a, b) => a + b, 0) / shortSlice.length;
  const longMa = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Previous short MA (shift back 1 sample) for crossover detection
  let prevShortMa = null;
  if (prices.length > shortWindow) {
    const prevShortSlice = prices.slice(-(shortWindow + 1), -1);
    prevShortMa = prevShortSlice.reduce((a, b) => a + b, 0) / prevShortSlice.length;
  }

  // Previous long MA (all but last)
  let prevLongMa = null;
  if (prices.length > 1) {
    const prevAll = prices.slice(0, -1);
    prevLongMa = prevAll.reduce((a, b) => a + b, 0) / prevAll.length;
  }

  const dropFromInitial = ((initialPrice - observationLow) / initialPrice) * 100;
  const recoveryFromLow = ((currentPrice - observationLow) / observationLow) * 100;
  const distFromLow = ((currentPrice - observationLow) / observationLow) * 100;

  // Trigger 1: Short MA crosses above Long MA (golden cross)
  if (prevShortMa !== null && prevLongMa !== null) {
    const wasBelowOrEqual = prevShortMa <= prevLongMa;
    const isAbove = shortMa > longMa;
    if (wasBelowOrEqual && isAbove) {
      return {
        shouldBuy: true,
        price: currentPrice,
        reason: `MA crossover (short ${shortMa.toFixed(2)} > long ${longMa.toFixed(2)}) after ${samples.length} samples, ${((Date.now() - samples[0].time) / 60000).toFixed(1)}min`
      };
    }
  }

  // Trigger 2: Bounce from bottom — dropped 1.5%+ then recovered 0.3%+
  if (dropFromInitial >= OBSERVATION_WINDOW.bounceDropPercent
    && recoveryFromLow >= OBSERVATION_WINDOW.bounceRecoverPercent) {
    return {
      shouldBuy: true,
      price: currentPrice,
      reason: `Bounce detected: dropped ${dropFromInitial.toFixed(2)}% from open, recovered ${recoveryFromLow.toFixed(2)}% from low $${observationLow.toFixed(2)}`
    };
  }

  // Trigger 3: Window ending — buy if near the low
  if (isWindowEnding) {
    if (distFromLow <= OBSERVATION_WINDOW.timeoutNearLowPercent) {
      return {
        shouldBuy: true,
        price: currentPrice,
        reason: `Window ending, price $${currentPrice.toFixed(2)} within ${distFromLow.toFixed(2)}% of low $${observationLow.toFixed(2)} — buying near bottom`
      };
    } else {
      return {
        shouldBuy: false,
        reason: `Window ending but price $${currentPrice.toFixed(2)} is ${distFromLow.toFixed(2)}% above low $${observationLow.toFixed(2)} — skipping (too far from bottom)`
      };
    }
  }

  return {
    shouldBuy: false,
    reason: `Observing: ${samples.length} samples, short MA ${shortMa.toFixed(2)} ${shortMa > longMa ? ">" : "<="} long MA ${longMa.toFixed(2)}, drop ${dropFromInitial.toFixed(2)}%`
  };
};

/**
 * Check SPY direction using multi-timeframe intraday analysis.
 * When SPY daily is green → always allow.
 * When SPY daily is red → check intraday timeframes for recovery.
 *
 * @param {number} dailyChangePercent - SPY daily change %
 * @returns {{ allow: boolean, reason: string, details: object }}
 */
const checkSpyDirection = async (dailyChangePercent) => {
  // If SPY daily is green — still check it's not rolling over
  if (dailyChangePercent >= 0) {
    // Even on green days, check short-term trend isn't collapsing
    const bars = await fetchSpyIntradayBars();
    if (bars && bars.length > 10) {
      const currentPrice = bars[bars.length - 1].c;
      const fiveMinAgo = bars[Math.max(0, bars.length - 6)].c;
      const tenMinAgo = bars[Math.max(0, bars.length - 11)].c;
      const fiveMinChg = ((currentPrice - fiveMinAgo) / fiveMinAgo) * 100;
      const tenMinChg = ((currentPrice - tenMinAgo) / tenMinAgo) * 100;

      // If both 5m and 10m are negative AND dropping more than -0.15%, market is rolling over
      if (fiveMinChg < -0.15 && tenMinChg < -0.15) {
        return {
          allow: false,
          reason: `SPY +${dailyChangePercent.toFixed(2)}% daily but ROLLING OVER (5m:${fiveMinChg.toFixed(2)}%, 10m:${tenMinChg.toFixed(2)}%) — wait for stabilization`,
          details: { daily: dailyChangePercent, fiveMinChg, tenMinChg, method: "green_rollover_block" }
        };
      }
    }

    return {
      allow: true,
      reason: `SPY +${dailyChangePercent.toFixed(2)}% (green, stable)`,
      details: { daily: dailyChangePercent, method: "daily_green" }
    };
  }

  // SPY is red — check intraday timeframes
  const bars = await fetchSpyIntradayBars();
  if (!bars || bars.length < 5) {
    // Can't get intraday data — BLOCK buys (fail safe, not fail open)
    return {
      allow: false,
      reason: `SPY ${dailyChangePercent.toFixed(2)}% and no intraday data — blocking buys (fail safe)`,
      details: { daily: dailyChangePercent, method: "no_data_block" }
    };
  }

  // Calculate minutes since market open (9:30 AM ET)
  const { hours, minutes } = getEasternTime();
  const minutesSinceOpen = (hours * 60 + minutes) - (9 * 60 + 30);

  if (minutesSinceOpen < 15) {
    // Too early — market hasn't settled, don't buy into negative momentum
    return {
      allow: false,
      reason: `SPY ${dailyChangePercent.toFixed(2)}% — too early to buy (${minutesSinceOpen}m since open, need 15m)`,
      details: { daily: dailyChangePercent, method: "too_early_block" }
    };
  }

  const currentPrice = bars[bars.length - 1].c;
  const dayHigh = Math.max(...bars.map(b => b.h));
  const dayLow = Math.min(...bars.map(b => b.l));

  // Available timeframes based on minutes since open
  const timeframeDefs = [
    { name: "5m", minutes: 5, weight: 6 },
    { name: "10m", minutes: 10, weight: 5 },
    { name: "15m", minutes: 15, weight: 4 },
    { name: "30m", minutes: 30, weight: 3 },
    { name: "1h", minutes: 60, weight: 2 },
    { name: "4h", minutes: 240, weight: 1 },
  ];

  const availableTimeframes = timeframeDefs.filter(tf => minutesSinceOpen >= tf.minutes);

  let weightedSum = 0;
  let totalWeight = 0;
  const tfDetails = {};

  for (const tf of availableTimeframes) {
    const barsAgo = Math.min(tf.minutes, bars.length - 1);
    const pastIdx = bars.length - 1 - barsAgo;
    if (pastIdx < 0) continue;

    const pastPrice = bars[pastIdx].c;
    const change = ((currentPrice - pastPrice) / pastPrice) * 100;

    tfDetails[tf.name] = +change.toFixed(3);
    weightedSum += change * tf.weight;
    totalWeight += tf.weight;
  }

  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Recovery check: range position and short-term trend
  const range = dayHigh - dayLow;
  const rangePosition = range > 0 ? (currentPrice - dayLow) / range : 0.5;
  const fiveMinChange = tfDetails["5m"] || 0;
  const isRecovering = rangePosition > 0.35 && fiveMinChange > 0;

  const tfSummary = Object.entries(tfDetails).map(([k, v]) => `${k}:${v >= 0 ? "+" : ""}${v.toFixed(2)}%`).join(", ");

  let allow, reason;

  // Count positive timeframes for "consistent uptrend" check
  const positiveTimeframes = Object.values(tfDetails).filter(v => v > 0).length;
  const totalTimeframes = Object.keys(tfDetails).length;
  const isConsistentlyUp = positiveTimeframes >= Math.ceil(totalTimeframes * 0.6); // 60%+ of timeframes positive

  // STRICT RULE: SPY negative daily → only allow if STRONGLY and CONSISTENTLY recovering
  // Requirements for allowing buys when SPY is negative:
  // 1. Weighted average must be clearly positive (> 0.10%, not just barely above zero)
  // 2. ALL short timeframes (5m, 10m) must be positive (market actively moving up)
  // 3. At least 70% of all timeframes must be positive
  // 4. Range position must be in upper half (price near day high, not near low)
  const tenMinChange = tfDetails["10m"] || 0;
  const shortTermsPositive = fiveMinChange > 0 && tenMinChange > 0;
  const strongConsistency = positiveTimeframes >= Math.ceil(totalTimeframes * 0.7); // 70%+ positive

  // SPY is negative for the day — block buys unless barely red and strongly recovering
  // Hard block when SPY < -0.3% (meaningful red day)
  // Barely red (-0.3% to 0%): allow only if ALL recovery conditions are met
  if (dailyChangePercent < -0.3) {
    // Meaningful red day — hard block, no exceptions
    allow = false;
    reason = `SPY ${dailyChangePercent.toFixed(2)}% daily — BLOCKED: market is red (> -0.3%), no buys until SPY turns positive`;
  } else if (weightedAvg > 0.15 && shortTermsPositive && strongConsistency && rangePosition > 0.6) {
    // Barely red (-0.3% to 0%) AND strongly recovering on all timeframes — allow cautiously
    allow = true;
    reason = `SPY ${dailyChangePercent.toFixed(2)}% daily, barely red — ALLOWING (strong recovery: wAvg:+${weightedAvg.toFixed(3)}%, range:${(rangePosition * 100).toFixed(0)}%, ${positiveTimeframes}/${totalTimeframes} TFs up)`;
  } else {
    allow = false;
    reason = `SPY ${dailyChangePercent.toFixed(2)}% daily — BLOCKED: barely red but recovery not convincing (wAvg:${weightedAvg >= 0 ? "+" : ""}${weightedAvg.toFixed(3)}%, range:${(rangePosition * 100).toFixed(0)}%)`;
  }

  return {
    allow,
    reason,
    details: {
      daily: dailyChangePercent,
      weightedAvg: +weightedAvg.toFixed(4),
      rangePosition: +rangePosition.toFixed(3),
      isRecovering,
      timeframes: tfDetails,
      timeframeSummary: tfSummary,
      method: allow ? (weightedAvg >= -0.05 ? "intraday_flat" : "recovering") : "blocked"
    }
  };
};

/**
 * Auto-Trading Service for BACKBONE
 * Based on BackBoneApp production trading system
 *
 * Features:
 * - Market hours enforcement (9:30 AM - 4:00 PM ET)
 * - Trailing stop loss management (50% of gain, 2% discrete thresholds)
 * - Dynamic buy threshold based on SPY direction (7.1 positive, 8.0 negative)
 * - Momentum protection (don't interrupt +8% gains)
 * - Technical override (sell protected positions if score ≤2.7)
 * - Day trade limits (3 per 5-day window)
 * - Position limits (max 2 concurrent)
 * - Multi-channel notifications (Pushover, Ntfy, Firebase, local)
 * - Scheduled evaluations every 10 minutes during market hours
 */

/**
 * Market Hours Configuration (Eastern Time)
 */
const MARKET_HOURS = {
  open: { hour: 9, minute: 30 },   // 9:30 AM ET
  close: { hour: 16, minute: 0 },  // 4:00 PM ET
  preMarketStart: { hour: 5, minute: 30 }, // 5:30 AM ET for ticker updates
  timezone: "America/New_York"
};

/**
 * Get current time in Eastern timezone
 */
const getEasternTime = () => {
  const now = new Date();
  const options = {
    timeZone: MARKET_HOURS.timezone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  };
  const etString = now.toLocaleString('en-US', options);
  const [time] = etString.split(', ');
  const [hours, minutes, seconds] = time.split(':').map(Number);

  // Also get the day of week (0 = Sunday, 6 = Saturday)
  const dayOptions = { timeZone: MARKET_HOURS.timezone, weekday: 'short' };
  const dayOfWeek = now.toLocaleString('en-US', dayOptions);

  return { hours, minutes, seconds, dayOfWeek, date: now };
};

/**
 * Check if market is currently open
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 */
export const isMarketOpen = () => {
  const { hours, minutes, dayOfWeek } = getEasternTime();

  // Weekend check
  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') {
    return { open: false, reason: 'Weekend - market closed' };
  }

  // Convert to minutes since midnight for easier comparison
  const currentMinutes = hours * 60 + minutes;
  const openMinutes = MARKET_HOURS.open.hour * 60 + MARKET_HOURS.open.minute;
  const closeMinutes = MARKET_HOURS.close.hour * 60 + MARKET_HOURS.close.minute;

  if (currentMinutes < openMinutes) {
    const minutesUntilOpen = openMinutes - currentMinutes;
    const hoursUntil = Math.floor(minutesUntilOpen / 60);
    const minsUntil = minutesUntilOpen % 60;
    return {
      open: false,
      reason: `Pre-market - opens in ${hoursUntil}h ${minsUntil}m`,
      nextOpen: getNextMarketOpen()
    };
  }

  if (currentMinutes >= closeMinutes) {
    return {
      open: false,
      reason: 'After hours - market closed',
      nextOpen: getNextMarketOpen()
    };
  }

  const minutesUntilClose = closeMinutes - currentMinutes;
  const hoursUntil = Math.floor(minutesUntilClose / 60);
  const minsUntil = minutesUntilClose % 60;

  return {
    open: true,
    reason: `Market open - closes in ${hoursUntil}h ${minsUntil}m`,
    closesAt: `${MARKET_HOURS.close.hour}:${String(MARKET_HOURS.close.minute).padStart(2, '0')} ET`
  };
};

/**
 * Check if it's pre-market hours (5:30 AM ET onwards) for ticker updates
 */
export const isPreMarketTime = () => {
  const { hours, minutes, dayOfWeek } = getEasternTime();

  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') {
    return false;
  }

  const currentMinutes = hours * 60 + minutes;
  const preMarketMinutes = MARKET_HOURS.preMarketStart.hour * 60 + MARKET_HOURS.preMarketStart.minute;
  const closeMinutes = MARKET_HOURS.close.hour * 60 + MARKET_HOURS.close.minute;

  return currentMinutes >= preMarketMinutes && currentMinutes < closeMinutes;
};

/**
 * Get next market open time
 */
export const getNextMarketOpen = () => {
  const { hours, minutes, dayOfWeek, date } = getEasternTime();
  const currentMinutes = hours * 60 + minutes;
  const openMinutes = MARKET_HOURS.open.hour * 60 + MARKET_HOURS.open.minute;

  let daysToAdd = 0;

  // If it's before market open today (and weekday), it opens today
  if (dayOfWeek !== 'Sat' && dayOfWeek !== 'Sun' && currentMinutes < openMinutes) {
    daysToAdd = 0;
  }
  // If it's Saturday, next open is Monday
  else if (dayOfWeek === 'Sat') {
    daysToAdd = 2;
  }
  // If it's Sunday, next open is Monday
  else if (dayOfWeek === 'Sun') {
    daysToAdd = 1;
  }
  // Otherwise (after hours on weekday), it opens tomorrow (or Monday if Friday)
  else if (dayOfWeek === 'Fri') {
    daysToAdd = 3;
  }
  else {
    daysToAdd = 1;
  }

  const nextOpen = new Date(date);
  nextOpen.setDate(nextOpen.getDate() + daysToAdd);

  return {
    date: nextOpen.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: `${MARKET_HOURS.open.hour}:${String(MARKET_HOURS.open.minute).padStart(2, '0')} ET`,
    daysAway: daysToAdd
  };
};

/**
 * Get next evaluation time (every 10 minutes during market hours)
 */
export const getNextEvaluationTime = () => {
  const { hours, minutes, dayOfWeek } = getEasternTime();
  const marketStatus = isMarketOpen();

  if (!marketStatus.open) {
    const nextOpen = getNextMarketOpen();
    return {
      nextEval: `${nextOpen.date} ${nextOpen.time}`,
      reason: marketStatus.reason,
      marketOpen: false
    };
  }

  // Round up to next 10-minute mark
  const currentMinutes = hours * 60 + minutes;
  const nextEvalMinutes = Math.ceil((currentMinutes + 1) / 10) * 10;
  const nextHour = Math.floor(nextEvalMinutes / 60);
  const nextMin = nextEvalMinutes % 60;

  // Check if next eval would be after market close
  const closeMinutes = MARKET_HOURS.close.hour * 60 + MARKET_HOURS.close.minute;
  if (nextEvalMinutes >= closeMinutes) {
    const nextOpen = getNextMarketOpen();
    return {
      nextEval: `${nextOpen.date} ${nextOpen.time}`,
      reason: 'Market closing soon',
      marketOpen: false
    };
  }

  const minutesUntil = nextEvalMinutes - currentMinutes;

  return {
    nextEval: `${nextHour}:${String(nextMin).padStart(2, '0')} ET`,
    minutesUntil,
    reason: `Next evaluation in ${minutesUntil} minutes`,
    marketOpen: true
  };
};

const DATA_DIR = getDataDir();
const TRADES_LOG = path.join(DATA_DIR, "trades-log.json");
const CONFIG_FILE = path.join(DATA_DIR, "trading-config.json");

// Trading thresholds (0-10 scale) - aligned with BackBoneApp
const DEFAULT_CONFIG = {
  enabled: true,                    // Auto-trading enabled by default
  mode: "paper",                    // paper or live
  buyThreshold: 8.0,                // Score >= this triggers buy evaluation (SPY negative)
  buyThresholdSPYPositive: 7.1,     // Lower threshold when SPY is positive
  sellThreshold: 4.5,               // Score <= this triggers sell evaluation (was 4.0, too lenient — held losers too long)
  extremeBuyThreshold: 9.0,         // Auto-execute buy immediately
  extremeSellThreshold: 1.5,        // Auto-execute sell immediately
  technicalOverrideThreshold: 2.7,  // Sell protected positions if technicals drop here
  goodMomentumPercent: 5.0,         // +5% or better = good momentum
  protectedPositionPercent: 8.0,    // +8% = protected from interruption
  requireBullishMACD: false,        // Don't require bullish MACD (rely on score)
  requireBearishMACD: false,        // Don't require bearish MACD (rely on score)
  requireHighVolume: false,         // Require above-average volume
  maxPositionSize: 1000,            // Max $ per position (fallback if equity unknown)
  maxPositionPercent: 0.30,         // 30% of account equity per position (dynamic sizing)
  maxTotalPositions: 3,             // Max number of positions (was 2 — too few, idle capital)
  maxDailyTrades: 10,               // Max trades per day
  maxDayTrades: 3,                  // Max day trades in 5-day window (PDT rule)
  dayTradeWindow: 5,                // 5-day rolling window for day trades
  cooldownMinutes: 30,              // Minutes between trades on same ticker
  notifyOnTrade: true,              // Send phone notification
  notifyOnSignal: false,            // Send notification on strong signals
  watchlist: [],                    // Specific tickers to watch (empty = all)
  blacklist: [],                    // Tickers to never trade
  onlyTop3: true,                   // Only buy tickers that are in the top 3 by score
  protectMomentum: true,            // Don't interrupt good performers
  onlyOneTradePerTickerPerDay: true, // One trade per ticker per day
};

// Anti-churning: minimum hold period (in milliseconds)
// Positions must be held for at least 3 calendar days before selling
// Exception: EXTREME_SELL (score <= 1.5) and trailing stops bypass this
const MIN_HOLD_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days = 72 hours
const MAX_ROTATIONS_PER_WEEK = 4; // Max sell+buy cycles in a 7-day window

// Wash sale prevention: 30-day window (IRS rule)
// If a stock was sold at a loss within the last 30 days, do NOT rebuy it
// A wash sale disallows the tax deduction on the loss, effectively making you pay MORE taxes
const WASH_SALE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 calendar days

// Repeat loser detection: if a symbol has lost money N+ times in the last 60 days, auto-blacklist it
// CHWY lost 7/7 trades, HOOD lost 10/10 — the system kept going back to the same bad stocks
const REPEAT_LOSER_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const REPEAT_LOSER_THRESHOLD = 2; // 2+ consecutive losses = blocked
const REPEAT_LOSER_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // Block for 90 days after repeat losses

// In-memory state
let config = { ...DEFAULT_CONFIG };
let tradesLog = [];
let lastTradeTime = {};
let dailyTradeCount = 0;
let lastTradeDate = null;

// Daily drawdown circuit breaker
// If the account drops more than this % in a single day, pause all new buys
const MAX_DAILY_DRAWDOWN_PERCENT = 3.0;
let dailyStartEquity = null;
let dailyStartDate = null;
let drawdownBreaker = false;

/**
 * Load configuration
 */
export const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      config = { ...DEFAULT_CONFIG, ...saved };
    }
  } catch (error) {
    console.error("Error loading trading config:", error.message);
  }
  return config;
};

/**
 * Save configuration
 */
export const saveConfig = (newConfig) => {
  config = { ...config, ...newConfig };
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving trading config:", error.message);
  }
  return config;
};

/**
 * Load trades log
 */
export const loadTradesLog = () => {
  try {
    if (fs.existsSync(TRADES_LOG)) {
      const parsed = JSON.parse(fs.readFileSync(TRADES_LOG, "utf-8"));
      tradesLog = Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    tradesLog = [];
  }
  return tradesLog;
};

/**
 * Save trade to log
 */
const logTrade = (trade) => {
  tradesLog.push(trade);
  try {
    fs.writeFileSync(TRADES_LOG, JSON.stringify(tradesLog, null, 2));
  } catch (error) {
    console.error("Error saving trade log:", error.message);
  }
};

/**
 * Check if a position has been held long enough to sell (anti-churning)
 * Returns { canSell, holdTimeMs, holdDays, reason }
 *
 * Looks at trades-log.json for the most recent BUY of this symbol.
 * If bought less than MIN_HOLD_PERIOD_MS ago, blocks the sell.
 *
 * Exceptions (always allowed to sell):
 * - EXTREME_SELL signals (score <= 1.5) — emergency exit
 * - Trailing stop triggers — capital preservation
 */
const checkHoldPeriod = (symbol, isExtremeSell = false, isTrailingStop = false) => {
  // Emergency exits always allowed
  if (isExtremeSell || isTrailingStop) {
    return {
      canSell: true,
      reason: isExtremeSell ? "Extreme sell override" : "Trailing stop override",
      holdTimeMs: 0,
      holdDays: 0
    };
  }

  // Find the most recent buy for this symbol
  const recentBuy = [...tradesLog]
    .reverse()
    .find(t => t.symbol === symbol && t.side === "buy");

  if (!recentBuy) {
    // No buy record found — allow sell (position may predate logging)
    return { canSell: true, reason: "No buy record found", holdTimeMs: 0, holdDays: 0 };
  }

  const buyTime = new Date(recentBuy.timestamp).getTime();
  const holdTimeMs = Date.now() - buyTime;
  const holdDays = holdTimeMs / (24 * 60 * 60 * 1000);

  if (holdTimeMs < MIN_HOLD_PERIOD_MS) {
    const remainingHours = ((MIN_HOLD_PERIOD_MS - holdTimeMs) / (60 * 60 * 1000)).toFixed(1);
    return {
      canSell: false,
      reason: `Hold period: ${holdDays.toFixed(1)} days (min 3.0). ${remainingHours}h remaining`,
      holdTimeMs,
      holdDays
    };
  }

  return { canSell: true, reason: `Held ${holdDays.toFixed(1)} days (>= 3.0)`, holdTimeMs, holdDays };
};

/**
 * Check rotation frequency (anti-churning)
 * Counts sell+buy pairs in the last 7 days.
 * If >= MAX_ROTATIONS_PER_WEEK, blocks new buys (not sells).
 */
const checkRotationFrequency = () => {
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const recentSells = tradesLog.filter(t =>
    t.side === "sell" && new Date(t.timestamp).getTime() > oneWeekAgo
  );

  if (recentSells.length >= MAX_ROTATIONS_PER_WEEK) {
    return {
      allowed: false,
      reason: `Rotation limit: ${recentSells.length} sells in last 7 days (max ${MAX_ROTATIONS_PER_WEEK}). Slow down.`,
      rotations: recentSells.length
    };
  }

  return { allowed: true, rotations: recentSells.length };
};

/**
 * Check wash sale rule — blocks buying a ticker that was sold at a loss within 30 days.
 * IRS wash sale rule: if you sell at a loss and rebuy within 30 days, the loss is DISALLOWED
 * for tax purposes. This means you effectively pay MORE taxes than you should.
 *
 * @param {string} symbol - Ticker to check
 * @returns {{ allowed: boolean, reason: string, lastLossSale?: object }}
 */
const checkWashSale = (symbol) => {
  const thirtyDaysAgo = Date.now() - WASH_SALE_WINDOW_MS;

  // Find all sells of this symbol in the last 30 days
  const recentSells = tradesLog.filter(t =>
    t.symbol === symbol &&
    t.side === "sell" &&
    new Date(t.timestamp).getTime() > thirtyDaysAgo
  );

  if (recentSells.length === 0) {
    return { allowed: true, reason: "No recent sells" };
  }

  // For each recent sell, check if it was at a loss
  // We determine loss by finding the corresponding buy and comparing prices
  for (const sell of recentSells) {
    const sellPrice = parseFloat(sell.price) || 0;
    const sellTime = new Date(sell.timestamp).getTime();

    // Find the most recent buy BEFORE this sell
    const correspondingBuy = [...tradesLog]
      .reverse()
      .find(t =>
        t.symbol === symbol &&
        t.side === "buy" &&
        new Date(t.timestamp).getTime() < sellTime
      );

    if (correspondingBuy) {
      const buyPrice = parseFloat(correspondingBuy.price) || 0;

      if (sellPrice < buyPrice) {
        // This was a LOSS sale — wash sale risk!
        const lossAmount = (buyPrice - sellPrice) * (parseFloat(sell.quantity) || 1);
        const lossPercent = ((sellPrice - buyPrice) / buyPrice * 100).toFixed(1);
        const daysAgo = ((Date.now() - sellTime) / (24 * 60 * 60 * 1000)).toFixed(0);
        const daysUntilClear = Math.ceil((sellTime + WASH_SALE_WINDOW_MS - Date.now()) / (24 * 60 * 60 * 1000));

        return {
          allowed: false,
          reason: `WASH SALE BLOCK: ${symbol} sold at loss (${lossPercent}%, -$${lossAmount.toFixed(2)}) ${daysAgo} days ago. Cannot rebuy for ${daysUntilClear} more days.`,
          lastLossSale: {
            sellPrice,
            buyPrice,
            lossPercent: parseFloat(lossPercent),
            lossAmount,
            sellDate: sell.timestamp,
            daysUntilClear
          }
        };
      }
    }
  }

  return { allowed: true, reason: "Recent sells were not at a loss" };
};

/**
 * Check repeat loser rule — blocks buying a ticker that has lost money 2+ times recently.
 * Backtesting showed CHWY (7 losses), HOOD (10 losses), TSLA (5 losses) etc. — the system
 * kept going back to the same losing stocks. After 2+ consecutive losses on a symbol,
 * block it for 90 days to break the cycle.
 *
 * @param {string} symbol - Ticker to check
 * @returns {{ allowed: boolean, reason: string }}
 */
const checkRepeatLoser = (symbol) => {
  const lookbackMs = REPEAT_LOSER_WINDOW_MS;
  const cutoff = Date.now() - lookbackMs;

  // Get all completed round-trips for this symbol (buy followed by sell)
  const symbolTrades = tradesLog.filter(t =>
    t.symbol === symbol &&
    new Date(t.timestamp).getTime() > cutoff
  );

  // Count consecutive losses (most recent first)
  const sells = symbolTrades
    .filter(t => t.side === "sell")
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  let consecutiveLosses = 0;
  let lastLossDate = null;

  for (const sell of sells) {
    const sellPrice = parseFloat(sell.price) || 0;
    const buyPrice = parseFloat(sell.buyPrice) || 0;

    // If we have explicit buyPrice (new format), use it
    if (buyPrice > 0) {
      if (sellPrice < buyPrice) {
        consecutiveLosses++;
        if (!lastLossDate) lastLossDate = new Date(sell.timestamp);
      } else {
        break; // A win breaks the streak
      }
    } else {
      // Old format: find corresponding buy
      const sellTime = new Date(sell.timestamp).getTime();
      const correspondingBuy = [...tradesLog]
        .reverse()
        .find(t => t.symbol === symbol && t.side === "buy" && new Date(t.timestamp).getTime() < sellTime);

      if (correspondingBuy) {
        const cbPrice = parseFloat(correspondingBuy.price) || 0;
        if (sellPrice < cbPrice) {
          consecutiveLosses++;
          if (!lastLossDate) lastLossDate = new Date(sell.timestamp);
        } else {
          break; // A win breaks the streak
        }
      }
    }
  }

  if (consecutiveLosses >= REPEAT_LOSER_THRESHOLD) {
    const daysUntilClear = lastLossDate
      ? Math.ceil((lastLossDate.getTime() + REPEAT_LOSER_COOLDOWN_MS - Date.now()) / (24 * 60 * 60 * 1000))
      : 90;

    if (daysUntilClear > 0) {
      return {
        allowed: false,
        reason: `REPEAT LOSER: ${symbol} has ${consecutiveLosses} consecutive losses in the last 60 days. Blocked for ${daysUntilClear} more days.`
      };
    }
  }

  return { allowed: true, reason: "No repeat loser pattern" };
};

/**
 * Check if trade is allowed (cooldown, daily limit)
 */
const canTrade = (symbol) => {
  // Check daily limit
  const today = new Date().toDateString();
  if (lastTradeDate !== today) {
    lastTradeDate = today;
    dailyTradeCount = 0;
  }

  if (dailyTradeCount >= config.maxDailyTrades) {
    return { allowed: false, reason: "Daily trade limit reached" };
  }

  // Check cooldown
  const lastTrade = lastTradeTime[symbol];
  if (lastTrade) {
    const cooldownMs = config.cooldownMinutes * 60 * 1000;
    if (Date.now() - lastTrade < cooldownMs) {
      return { allowed: false, reason: `Cooldown active for ${symbol}` };
    }
  }

  // Check blacklist
  if (config.blacklist.includes(symbol)) {
    return { allowed: false, reason: `${symbol} is blacklisted` };
  }

  // Check watchlist
  if (config.watchlist.length > 0 && !config.watchlist.includes(symbol)) {
    return { allowed: false, reason: `${symbol} not in watchlist` };
  }

  return { allowed: true };
};

/**
 * Evaluate if ticker meets buy criteria
 * Uses BackBoneApp thresholds:
 * - SPY Positive: Score >= 7.1
 * - SPY Negative: Score >= 8.0
 * - Extreme Buy: Score >= 9.0 (auto-execute)
 *
 * @param {Object} ticker - Ticker with score and other data
 * @param {Object} options - Additional options (spyPositive, positions)
 */
export const evaluateBuySignal = (ticker, options = {}) => {
  const { spyPositive = false, positions = [] } = options;
  const signals = [];
  let shouldBuy = true;
  let isExtreme = false;

  // Determine threshold based on SPY direction
  const threshold = spyPositive ? config.buyThresholdSPYPositive : config.buyThreshold;

  // Check for extreme buy (auto-execute)
  if (ticker.score >= config.extremeBuyThreshold) {
    signals.push(`EXTREME BUY: Score ${ticker.score.toFixed(2)} >= ${config.extremeBuyThreshold}`);
    isExtreme = true;
  }
  // Check regular buy threshold
  else if (ticker.score >= threshold) {
    signals.push(`Score ${ticker.score.toFixed(2)} >= ${threshold} (SPY ${spyPositive ? "positive" : "negative"})`);
  } else {
    shouldBuy = false;
    signals.push(`Score ${ticker.score.toFixed(2)} < ${threshold}`);
  }

  // Check momentum protection (don't buy if we have protected positions)
  if (config.protectMomentum && positions.length > 0) {
    const protectedPositions = positions.filter(p => {
      const plPercent = parseFloat(p.unrealized_plpc || 0) * 100;
      return !isNaN(plPercent) && plPercent >= config.protectedPositionPercent;
    });

    if (protectedPositions.length > 0) {
      shouldBuy = false;
      const protectedList = protectedPositions.map(p =>
        `${p.symbol} (+${(parseFloat(p.unrealized_plpc) * 100).toFixed(1)}%)`
      ).join(", ");
      signals.push(`Momentum protection: ${protectedList}`);
    }
  }

  // Check wash sale rule — don't rebuy a ticker sold at a loss within 30 days
  const washCheck = checkWashSale(ticker.symbol);
  if (!washCheck.allowed) {
    shouldBuy = false;
    isExtreme = false;
    signals.push(washCheck.reason);
  }

  // Check repeat loser — don't keep buying the same losing stock
  const repeatCheck = checkRepeatLoser(ticker.symbol);
  if (!repeatCheck.allowed) {
    shouldBuy = false;
    isExtreme = false;
    signals.push(repeatCheck.reason);
  }

  // MACD sanity check: don't buy into actively bearish MACD unless extreme
  // Many losing trades had bearish MACD at entry — the score was high but momentum was wrong
  if (ticker.macd?.trend === "bearish" && !isExtreme) {
    shouldBuy = false;
    signals.push(`MACD bearish (${ticker.macd?.trend}) — not buying against momentum`);
  }

  // Check MACD if required (legacy config option)
  if (config.requireBullishMACD) {
    if (ticker.macd?.trend === "bullish") {
      signals.push("MACD bullish");
    } else {
      shouldBuy = false;
      signals.push(`MACD not bullish (${ticker.macd?.trend || "unknown"})`);
    }
  }

  // Check volume if required
  if (config.requireHighVolume) {
    if (ticker.volumeScore?.status === "high" || ticker.volumeScore?.status === "above_avg") {
      signals.push(`Volume ${ticker.volumeScore.status}`);
    } else {
      shouldBuy = false;
      signals.push(`Volume not high (${ticker.volumeScore?.status || "unknown"})`);
    }
  }

  return {
    action: shouldBuy ? (isExtreme ? "EXTREME_BUY" : "BUY") : "HOLD",
    symbol: ticker.symbol,
    score: ticker.score,
    price: ticker.price,
    signals,
    isExtreme,
    timestamp: new Date().toISOString()
  };
};

/**
 * Evaluate if ticker meets sell criteria
 * Uses BackBoneApp logic:
 * - Extreme Sell: Score <= 1.5 (auto-execute)
 * - Regular Sell: Score <= 4.0
 * - Technical Override: Score <= 2.7 sells protected positions (+8%)
 *
 * @param {Object} ticker - Ticker with score and other data
 * @param {Object} position - Current position data (if holding)
 */
export const evaluateSellSignal = (ticker, position = null) => {
  const signals = [];
  let shouldSell = true;
  let isExtreme = false;
  let isTechnicalOverride = false;

  // Get position P&L if available (guard against NaN from bad API data)
  const plPercentRaw = position ? parseFloat(position.unrealized_plpc || 0) * 100 : 0;
  const plPercent = isNaN(plPercentRaw) ? 0 : plPercentRaw;
  const isProtected = plPercent >= config.protectedPositionPercent;
  const isGoodMomentum = plPercent >= config.goodMomentumPercent;

  // Check for extreme sell (auto-execute)
  if (ticker.score <= config.extremeSellThreshold) {
    signals.push(`EXTREME SELL: Score ${ticker.score.toFixed(2)} <= ${config.extremeSellThreshold}`);
    isExtreme = true;
    shouldSell = true;
  }
  // Check technical override (sell protected positions with poor technicals)
  else if (ticker.score <= config.technicalOverrideThreshold && isProtected) {
    signals.push(`TECHNICAL OVERRIDE: Score ${ticker.score.toFixed(2)} <= ${config.technicalOverrideThreshold} (position +${plPercent.toFixed(1)}%)`);
    isTechnicalOverride = true;
    shouldSell = true;
  }
  // Check regular sell threshold
  else if (ticker.score <= config.sellThreshold) {
    signals.push(`Score ${ticker.score.toFixed(2)} <= ${config.sellThreshold}`);

    // Don't sell protected positions (unless extreme or technical override)
    if (isProtected && config.protectMomentum) {
      shouldSell = false;
      signals.push(`Protected position (+${plPercent.toFixed(1)}%) - momentum protection active`);
    }
  } else {
    shouldSell = false;
    signals.push(`Score ${ticker.score.toFixed(2)} > ${config.sellThreshold}`);
  }

  // Check MACD if required
  if (config.requireBearishMACD && !isExtreme && !isTechnicalOverride) {
    if (ticker.macd?.trend === "bearish") {
      signals.push("MACD bearish");
    } else {
      shouldSell = false;
      signals.push(`MACD not bearish (${ticker.macd?.trend || "unknown"})`);
    }
  }

  // Add position info to signals
  if (position) {
    signals.push(`Position: ${plPercent >= 0 ? "+" : ""}${plPercent.toFixed(2)}%`);
    if (isGoodMomentum) signals.push("Good momentum (+5%+)");
    if (isProtected) signals.push("Protected (+8%+)");
  }

  return {
    action: shouldSell ? (isExtreme ? "EXTREME_SELL" : "SELL") : "HOLD",
    symbol: ticker.symbol,
    score: ticker.score,
    price: ticker.price,
    signals,
    isExtreme,
    isTechnicalOverride,
    plPercent,
    isProtected,
    isGoodMomentum,
    timestamp: new Date().toISOString()
  };
};

/**
 * Execute buy order via Alpaca (IMMEDIATE - no delay)
 * Used internally after 5-minute queue delay passes
 * Enforces market hours (9:30 AM - 4:00 PM ET)
 */
const executeBuyImmediate = async (symbol, price, reason) => {
  if (!config.enabled) {
    return { success: false, error: "Auto-trading not enabled" };
  }

  // Enforce market hours — NO pre-market orders
  const marketStatus = isMarketOpen();
  if (!marketStatus.open) {
    return { success: false, error: `Market closed — no pre-market orders: ${marketStatus.reason}` };
  }

  // Double-check SPY before executing — market could have turned since queueing
  const isDefensive = isBadMarketItem(symbol);
  if (!isDefensive) {
    const spyBars = await fetchSpyIntradayBars();
    if (spyBars && spyBars.length > 1) {
      const spyDailyChange = ((spyBars[spyBars.length - 1]?.c - spyBars[0]?.c) / spyBars[0]?.c) * 100;
      const spyDir = await checkSpyDirection(spyDailyChange);
      if (!spyDir.allow) {
        console.log(`[AutoTrader] BLOCKED at execution: ${symbol} — SPY negative: ${spyDir.reason}`);
        return { success: false, error: `SPY check failed at execution: ${spyDir.reason}` };
      }
    }
  }

  const canTradeResult = canTrade(symbol);
  if (!canTradeResult.allowed) {
    return { success: false, error: canTradeResult.reason };
  }

  const alpacaConfig = getAlpacaConfig();
  if (!alpacaConfig.ready) {
    return { success: false, error: "Alpaca not configured" };
  }

  // Dynamic position sizing: use % of equity, fall back to fixed maxPositionSize
  let positionBudget = config.maxPositionSize; // fallback
  let quantity;

  try {
    const account = await fetchAccount(alpacaConfig);
    const equity = parseFloat(account.equity) || 0;
    const buyingPower = parseFloat(account.buying_power) || 0;

    if (buyingPower < price) {
      return { success: false, error: `Insufficient buying power ($${buyingPower.toFixed(2)} available, need $${price.toFixed(2)} minimum)` };
    }

    // Dynamic sizing: maxPositionPercent of total equity (e.g., 30%)
    if (equity > 0 && config.maxPositionPercent) {
      positionBudget = Math.min(equity * config.maxPositionPercent, buyingPower - 10);
      positionBudget = Math.max(positionBudget, 100); // minimum $100
    }

    quantity = Math.floor(positionBudget / price);
    if (quantity < 1) {
      return { success: false, error: `Position size too small (budget $${positionBudget.toFixed(2)}, price $${price.toFixed(2)})` };
    }

    // Final buying power check
    const orderCost = quantity * price;
    if (orderCost > buyingPower - 10) {
      quantity = Math.floor((buyingPower - 10) / price);
      if (quantity < 1) {
        return { success: false, error: `Insufficient buying power ($${buyingPower.toFixed(2)} available, order would cost $${orderCost.toFixed(2)})` };
      }
    }

    // MINIMUM QUANTITY: Don't buy just 1 share — the risk/reward is terrible
    // (1 share of a $200 stock = $200 position, if it drops 3% you lose $6, if it rises 3% you gain $6)
    // Need at least 2 shares OR position size >= $100 for meaningful gains
    if (quantity < 2 && price > 50) {
      return { success: false, error: `Position too small: only ${quantity} share of $${price.toFixed(2)} stock (need 2+ shares or cheaper entry)` };
    }
  } catch (acctErr) {
    return { success: false, error: `Failed to check buying power: ${acctErr.message}` };
  }

  try {
    // Use LIMIT orders instead of market orders to reduce slippage
    // Set limit price 0.1% above current price — gets filled almost always but avoids bad fills
    const limitPrice = +(price * 1.001).toFixed(2);

    const response = await fetch(`${alpacaConfig.baseUrl}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": alpacaConfig.key,
        "APCA-API-SECRET-KEY": alpacaConfig.secret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        symbol,
        qty: quantity.toString(),
        side: "buy",
        type: "limit",
        limit_price: limitPrice.toString(),
        time_in_force: "day"
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const order = await response.json();

    // Log trade
    const trade = {
      id: order.id,
      symbol,
      side: "buy",
      quantity,
      price,
      reason,
      status: order.status,
      timestamp: new Date().toISOString(),
      mode: alpacaConfig.mode
    };
    logTrade(trade);

    // Update tracking
    lastTradeTime[symbol] = Date.now();
    dailyTradeCount++;

    // Send notification
    if (config.notifyOnTrade) {
      await sendTradeNotification(trade);
    }

    // Show trade notification in terminal title (30 seconds)
    showNotificationTitle("trade", `BUY ${symbol} x${quantity} @ $${price.toFixed(2)}`, 30000);

    // Immediately apply trailing stop to the new position
    try {
      const tsm = await getTrailingStopManager();
      await tsm.applyStopToPosition(symbol, quantity, price, price);
    } catch (err) {
      console.error(`Failed to apply trailing stop for ${symbol}:`, err.message);
    }

    return { success: true, order, trade };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Execute buy order with market condition check and 5-minute delay
 *
 * Rules:
 * 1. If market is bad (SPY negative), ONLY allow buying bad market items (inverse ETFs)
 * 2. All buys are queued with a 5-minute delay to confirm signal persistence
 * 3. Re-checks market conditions before executing after delay
 */
export const executeBuy = async (symbol, price, reason, options = {}) => {
  const { spyPositive = null, skipDelay = false, fromObservation = false } = options;

  // RULE: Market must be OPEN — no pre-market orders, no after-hours orders
  const marketStatus = isMarketOpen();
  if (!marketStatus.open) {
    console.log(`[AutoTrader] BLOCKED PRE-MARKET BUY: ${symbol} — ${marketStatus.reason}`);
    return {
      success: false,
      blocked: true,
      error: `No pre-market orders. ${marketStatus.reason}`
    };
  }

  // RULE: No buying before 10:00 AM ET — let morning volatility settle
  // Backtesting showed 8-9 AM buys have 36% win rate and lost $431.
  // 10 AM+ buys have 51-67% win rates and are profitable.
  // Exception: observation system handles the open window separately
  const { hours, minutes: mins } = getEasternTime();
  const minutesSinceOpen = (hours * 60 + mins) - (9 * 60 + 30);
  if (minutesSinceOpen < 30 && !fromObservation) {
    console.log(`[AutoTrader] BLOCKED EARLY BUY: ${symbol} — only ${minutesSinceOpen}m since open, need 30m (10:00 AM ET)`);
    return {
      success: false,
      blocked: true,
      error: `Too early to buy — ${minutesSinceOpen}m since open, waiting until 10:00 AM ET (morning buys lose money)`
    };
  }

  // Check if this is a bad market item
  const isDefensive = isBadMarketItem(symbol);

  // Get current SPY direction if not provided — use full checkSpyDirection (strict)
  let marketPositive = spyPositive;
  if (marketPositive === null) {
    const spyBars = await fetchSpyIntradayBars();
    if (spyBars && spyBars.length > 1) {
      const spyDailyChange = ((spyBars[spyBars.length - 1]?.c - spyBars[0]?.c) / spyBars[0]?.c) * 100;
      const spyDir = await checkSpyDirection(spyDailyChange);
      marketPositive = spyDir.allow;
    } else {
      marketPositive = false; // Default to BLOCK if can't determine (fail safe)
    }
  }

  // CIRCUIT BREAKER: Account drawdown limit
  if (drawdownBreaker && !isBadMarketItem(symbol)) {
    console.log(`[AutoTrader] CIRCUIT BREAKER: ${symbol} — account drawdown limit hit, no new buys today`);
    return {
      success: false,
      blocked: true,
      error: `Daily drawdown circuit breaker active (-${MAX_DAILY_DRAWDOWN_PERCENT}%+ today). No new buys except inverse ETFs.`
    };
  }

  // WASH SALE CHECK: Don't rebuy a ticker sold at a loss within 30 days
  const washCheck = checkWashSale(symbol);
  if (!washCheck.allowed) {
    console.log(`[AutoTrader] WASH SALE BLOCKED: ${symbol} — ${washCheck.reason}`);
    return { success: false, blocked: true, error: washCheck.reason };
  }

  // REPEAT LOSER CHECK: Don't keep buying the same losing stock
  const repeatCheck = checkRepeatLoser(symbol);
  if (!repeatCheck.allowed) {
    console.log(`[AutoTrader] REPEAT LOSER BLOCKED: ${symbol} — ${repeatCheck.reason}`);
    return { success: false, blocked: true, error: repeatCheck.reason };
  }

  // SECTOR CORRELATION: Don't hold 2 positions in the same sector
  // This is basic portfolio diversification — if semis crash, you lose on both NVDA and AMD
  const buySector = getSector(symbol);
  if (buySector) {
    try {
      const alpCfg = getAlpacaConfig();
      if (alpCfg.ready) {
        const posResp = await fetch(`${alpCfg.baseUrl}/v2/positions`, {
          headers: { "APCA-API-KEY-ID": alpCfg.key, "APCA-API-SECRET-KEY": alpCfg.secret }
        });
        if (posResp.ok) {
          const currentPositions = await posResp.json();
          const sameSecPos = currentPositions.find(p => getSector(p.symbol) === buySector);
          if (sameSecPos) {
            console.log(`[AutoTrader] SECTOR BLOCKED: ${symbol} (${buySector}) — already holding ${sameSecPos.symbol} in same sector`);
            return {
              success: false,
              blocked: true,
              error: `Sector concentration: already holding ${sameSecPos.symbol} in ${buySector} sector. Diversify.`
            };
          }
        }
      }
    } catch (err) {
      // Don't let sector check failure block trading
    }
  }

  // RULE: In bad market, only allow defensive positions
  if (!marketPositive && !isDefensive) {
    console.log(`[AutoTrader] BLOCKED: ${symbol} — market is negative, only inverse/defensive ETFs allowed`);
    return {
      success: false,
      blocked: true,
      error: `Market is negative — only defensive positions (SH, SQQQ, etc.) allowed. ${symbol} is not a defensive ETF.`
    };
  }

  // During observation window (9:30-9:40 ET), redirect to observation unless
  // this call already came from the observation system
  if (!fromObservation && !skipDelay) {
    const obsStatus = getObservationWindowStatus();
    if (obsStatus.inWindow) {
      // Add to observation targets if not already there
      if (!observationTargets.includes(symbol)) {
        observationTargets.push(symbol);
      }
      console.log(`[AutoTrader] ${symbol} redirected to observation (${obsStatus.minutesSinceOpen}min since open)`);
      return {
        success: true,
        queued: true,
        observing: true,
        message: `BUY ${symbol} deferred to observation — watching for price stabilization`
      };
    }
  }

  // If skipDelay is true, execute immediately (for manual overrides)
  if (skipDelay) {
    console.log(`[AutoTrader] Executing ${symbol} immediately (skipDelay=true)`);
    return await executeBuyImmediate(symbol, price, reason);
  }

  // If coming from observation, execute immediately (already waited)
  if (fromObservation) {
    console.log(`[AutoTrader] Executing ${symbol} immediately (observation trigger)`);
    return await executeBuyImmediate(symbol, price, reason);
  }

  // Queue the buy with 5-minute delay
  const queueResult = queueBuy(symbol, price, reason, marketPositive);

  if (queueResult.queued) {
    const executeTime = new Date(queueResult.executeAfter).toLocaleTimeString();
    return {
      success: true,
      queued: true,
      message: `BUY ${symbol} queued — will execute at ${executeTime} (5-minute delay)`,
      executeAfter: queueResult.executeAfter
    };
  } else {
    return {
      success: false,
      error: queueResult.reason
    };
  }
};

/**
 * Execute sell order via Alpaca
 * Enforces market hours (9:30 AM - 4:00 PM ET)
 */
export const executeSell = async (symbol, price, quantity, reason, options = {}) => {
  const { costBasis = null } = options;
  if (!config.enabled) {
    return { success: false, error: "Auto-trading not enabled" };
  }

  // Enforce market hours
  const marketStatus = isMarketOpen();
  if (!marketStatus.open) {
    return { success: false, error: `Market closed: ${marketStatus.reason}` };
  }

  const canTradeResult = canTrade(symbol);
  if (!canTradeResult.allowed) {
    return { success: false, error: canTradeResult.reason };
  }

  const alpacaConfig = getAlpacaConfig();
  if (!alpacaConfig.ready) {
    return { success: false, error: "Alpaca not configured" };
  }

  // Validate quantity is a valid positive number
  const qty = parseInt(quantity, 10);
  if (!qty || qty < 1 || isNaN(qty)) {
    return { success: false, error: `Invalid sell quantity: ${quantity}` };
  }

  try {
    // Use LIMIT orders for sells too — set 0.1% below current price to avoid bad fills
    // while still getting executed quickly
    const limitPrice = +(price * 0.999).toFixed(2);

    const response = await fetch(`${alpacaConfig.baseUrl}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": alpacaConfig.key,
        "APCA-API-SECRET-KEY": alpacaConfig.secret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        symbol,
        qty: qty.toString(),
        side: "sell",
        type: "limit",
        limit_price: limitPrice.toString(),
        time_in_force: "day"
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const order = await response.json();

    // Determine cost basis for wash sale tracking
    let buyPrice = costBasis;
    if (!buyPrice) {
      // Look up the buy price from trades log
      const correspondingBuy = [...tradesLog].reverse().find(t => t.symbol === symbol && t.side === "buy");
      if (correspondingBuy) buyPrice = parseFloat(correspondingBuy.price) || null;
    }

    const isLoss = buyPrice ? price < buyPrice : false;

    // Log trade (include buyPrice so wash sale checker can determine loss)
    const trade = {
      id: order.id,
      symbol,
      side: "sell",
      quantity,
      price,
      buyPrice: buyPrice || undefined,
      pnl: buyPrice ? +((price - buyPrice) * quantity).toFixed(2) : undefined,
      isLoss,
      reason,
      status: order.status,
      timestamp: new Date().toISOString(),
      mode: alpacaConfig.mode
    };
    logTrade(trade);

    // Update tracking
    lastTradeTime[symbol] = Date.now();
    dailyTradeCount++;

    // Send notification
    if (config.notifyOnTrade) {
      await sendTradeNotification(trade);
    }

    // Show trade notification in terminal title (30 seconds)
    showNotificationTitle("trade", `SELL ${symbol} x${quantity} @ $${price.toFixed(2)}`, 30000);

    return { success: true, order, trade };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Send trade notification to phone
 */
export const sendTradeNotification = async (trade) => {
  // Try multiple notification methods

  // 0. WhatsApp (if configured) - highest priority
  try {
    const { getWhatsAppNotifications } = await import("./whatsapp-notifications.js");
    const whatsappNotifier = getWhatsAppNotifications();
    // Auto-initialize if not yet enabled
    if (!whatsappNotifier.enabled) {
      try { await whatsappNotifier.initialize("default"); } catch {}
    }
    if (whatsappNotifier.enabled) {
      await whatsappNotifier.notifyTrade({
        symbol: trade.symbol,
        action: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        total: trade.quantity * trade.price,
        reason: trade.reason
      });
    }
  } catch (err) {
    // WhatsApp notification is optional - don't fail the whole function
    console.error("[AutoTrader] WhatsApp notification failed:", err.message);
  }

  // 1. Pushover (if configured)
  if (process.env.PUSHOVER_USER_KEY && process.env.PUSHOVER_APP_TOKEN) {
    try {
      await fetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: process.env.PUSHOVER_APP_TOKEN,
          user: process.env.PUSHOVER_USER_KEY,
          title: `BACKBONE ${trade.side.toUpperCase()} ${trade.symbol}`,
          message: `${trade.side.toUpperCase()} ${trade.quantity} ${trade.symbol} @ $${trade.price}\nReason: ${trade.reason}`,
          priority: 1
        })
      });
      return { sent: true, method: "pushover" };
    } catch (error) {
      console.error("Pushover notification failed:", error.message);
    }
  }

  // 2. Ntfy (free, no account needed)
  if (process.env.NTFY_TOPIC) {
    try {
      await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
        method: "POST",
        headers: {
          "Title": `BACKBONE ${trade.side.toUpperCase()} ${trade.symbol}`,
          "Priority": "high",
          "Tags": trade.side === "buy" ? "chart_with_upwards_trend" : "chart_with_downwards_trend"
        },
        body: `${trade.side.toUpperCase()} ${trade.quantity} ${trade.symbol} @ $${trade.price}\nReason: ${trade.reason}`
      });
      return { sent: true, method: "ntfy" };
    } catch (error) {
      console.error("Ntfy notification failed:", error.message);
    }
  }

  // 3. Cloud sync (if configured) - for phone app to pick up
  const cloudConfig = {
    provider: process.env.CLOUD_SYNC_PROVIDER,
    apiKey: process.env.CLOUD_SYNC_API_KEY,
    projectId: process.env.CLOUD_SYNC_PROJECT_ID,
    userId: process.env.CLOUD_SYNC_USER_ID
  };

  if (cloudConfig.provider === "firebase" && cloudConfig.apiKey) {
    try {
      const notificationPath = `notifications/${cloudConfig.userId}/${Date.now()}`;
      await fetch(
        `https://${cloudConfig.projectId}-default-rtdb.firebaseio.com/${notificationPath}.json?auth=${cloudConfig.apiKey}`,
        {
          method: "PUT",
          body: JSON.stringify({
            type: "trade",
            ...trade,
            read: false
          })
        }
      );
      return { sent: true, method: "firebase" };
    } catch (error) {
      console.error("Firebase notification failed:", error.message);
    }
  }

  // Save to local notifications file for the app to display
  const notificationsFile = path.join(DATA_DIR, "notifications.json");
  try {
    let notifications = [];
    if (fs.existsSync(notificationsFile)) {
      notifications = JSON.parse(fs.readFileSync(notificationsFile, "utf-8"));
    }
    notifications.unshift({
      id: Date.now(),
      type: "trade",
      ...trade,
      read: false
    });
    // Keep last 100 notifications
    notifications = notifications.slice(0, 100);
    fs.writeFileSync(notificationsFile, JSON.stringify(notifications, null, 2));
    return { sent: true, method: "local" };
  } catch (error) {
    console.error("Local notification save failed:", error.message);
  }

  return { sent: false };
};

/**
 * Monitor tickers and execute trades
 * Uses BackBoneApp trading logic:
 * - Market hours enforcement (9:30 AM - 4:00 PM ET)
 * - Only buys from top 3 qualified tickers
 * - Dynamic threshold based on SPY direction
 * - Momentum protection for +8% positions
 * - Technical override for poor technicals
 * - Position limits (max 2)
 * - Day trade limits (3 per 5-day window)
 *
 * @param {Array} tickers - All tickers with scores
 * @param {Array} positions - Current positions
 * @param {Object} marketContext - Market context (spyChange, etc.)
 */
export const monitorAndTrade = async (tickers, positions = []) => {
  if (!config.enabled) {
    return { monitored: false, reason: "Auto-trading disabled" };
  }

  // Check market hours
  const marketStatus = isMarketOpen();
  const nextEval = getNextEvaluationTime();

  if (!marketStatus.open) {
    return {
      monitored: false,
      reason: marketStatus.reason,
      marketOpen: false,
      nextEvaluation: nextEval.nextEval,
      nextMarketOpen: marketStatus.nextOpen,
      reasoning: [`Market closed: ${marketStatus.reason}`]
    };
  }

  // Daily drawdown circuit breaker — track account equity at start of day
  try {
    const today = new Date().toDateString();
    if (dailyStartDate !== today) {
      // New day — reset breaker and record starting equity
      const alpacaConfig = getAlpacaConfig();
      if (alpacaConfig.ready) {
        const acct = await fetchAccount(alpacaConfig);
        dailyStartEquity = parseFloat(acct.equity) || null;
        dailyStartDate = today;
        drawdownBreaker = false;
      }
    } else if (dailyStartEquity && !drawdownBreaker) {
      // Check current equity vs start of day
      const alpacaConfig = getAlpacaConfig();
      if (alpacaConfig.ready) {
        const acct = await fetchAccount(alpacaConfig);
        const currentEquity = parseFloat(acct.equity) || 0;
        const drawdownPercent = ((dailyStartEquity - currentEquity) / dailyStartEquity) * 100;
        if (drawdownPercent >= MAX_DAILY_DRAWDOWN_PERCENT) {
          drawdownBreaker = true;
          console.log(`[AutoTrader] CIRCUIT BREAKER: Account down ${drawdownPercent.toFixed(1)}% today ($${dailyStartEquity.toFixed(0)} → $${currentEquity.toFixed(0)}). No new buys.`);
        }
      }
    }
  } catch (err) {
    // Don't let drawdown check failure block trading
  }

  // Process any pending buys that have passed the 5-minute delay
  const pendingBuysResult = await processPendingBuys();
  if (pendingBuysResult.processed > 0) {
    console.log(`[AutoTrader] Processed ${pendingBuysResult.processed} delayed buy(s)`);
  }

  // Get SPY data from tickers array
  const spyTicker = tickers.find(t => t.symbol === "SPY");
  const spyChange = spyTicker?.changePercent || 0;

  // Run multi-timeframe SPY direction check
  const spyCheck = await checkSpyDirection(spyChange);
  const spyPositive = spyCheck.allow;

  // Determine buy threshold based on SPY direction
  const effectiveBuyThreshold = spyPositive ? config.buyThresholdSPYPositive : config.buyThreshold;

  // Get wealth goal context for trading decisions
  const wealthContext = getWealthGoalContext();

  const results = {
    monitored: true,
    marketOpen: true,
    marketStatus: marketStatus.reason,
    nextEvaluation: nextEval.nextEval,
    spyPositive,
    spyBlocked: !spyCheck.allow,
    spyDirection: spyCheck,
    spyChange,
    effectiveBuyThreshold,
    buySignals: [],
    sellSignals: [],
    executed: [],
    skipped: [],
    protected: [],
    reasoning: [],   // Human-readable explanation of every decision
    wealthGoal: wealthContext.hasWealthGoal ? {
      progress: wealthContext.progress,
      requiredDaily: wealthContext.requiredDailyGrowth,
      riskTolerance: wealthContext.riskTolerance
    } : null
  };

  // Filter out CVR positions (corporate actions/rights - don't count toward limit)
  const tradablePositions = positions.filter(p => p.symbol && !p.symbol.includes('CVR'));

  // Get current position symbols
  const positionSymbols = tradablePositions.map(p => p.symbol);

  // Sort tickers by score (highest first) and get top 3 qualified for buying
  const sortedTickers = [...tickers]
    .filter(t => t && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  // Top 3 qualified tickers (score >= effectiveBuyThreshold)
  const top3BuyTickers = sortedTickers
    .filter(t => t.score >= effectiveBuyThreshold)
    .slice(0, 3)
    .map(t => t.symbol);

  // Track executed buys for position limit check
  let buyCount = results.executed.filter(t => t.side === "buy").length;

  // --- REASONING: Market context ---
  if (spyCheck.details?.timeframeSummary) {
    results.reasoning.push(`SPY ${spyChange >= 0 ? "+" : ""}${spyChange.toFixed(2)}% daily | Intraday: ${spyCheck.details.timeframeSummary}`);
    results.reasoning.push(`SPY direction: ${spyCheck.reason} → ${spyCheck.allow ? "ALLOW" : "BLOCK"} buys (threshold = ${effectiveBuyThreshold})`);
  } else {
    results.reasoning.push(`SPY ${spyPositive ? "positive" : "negative"} (${spyChange >= 0 ? "+" : ""}${spyChange.toFixed(2)}%) → buy threshold = ${effectiveBuyThreshold}`);
  }
  results.reasoning.push(`Positions: ${tradablePositions.length}/${config.maxTotalPositions} (${positionSymbols.join(", ") || "none"})`);

  // --- REASONING: Wealth goal context ---
  if (wealthContext.hasWealthGoal) {
    const dailyReq = wealthContext.requiredDailyGrowth || 0;
    results.reasoning.push(`WEALTH GOAL: $${Math.round(wealthContext.currentEquity).toLocaleString()} → $${Math.round(wealthContext.targetEquity).toLocaleString()} (${wealthContext.progress.toFixed(1)}%)`);
    results.reasoning.push(`Required: $${Math.round(dailyReq).toLocaleString()}/day | Risk tolerance: ${wealthContext.riskTolerance}`);
  }

  // Top scorers summary
  const topSummary = sortedTickers.slice(0, 5).map(t =>
    `${t.symbol} ${t.score.toFixed(1)}${positionSymbols.includes(t.symbol) ? " (held)" : ""}`
  ).join(", ");
  results.reasoning.push(`Top scores: ${topSummary}`);

  if (top3BuyTickers.length > 0) {
    results.reasoning.push(`Buy candidates (score >= ${effectiveBuyThreshold}): ${top3BuyTickers.join(", ")}`);
  } else {
    results.reasoning.push(`No tickers above buy threshold ${effectiveBuyThreshold} — no buys possible`);
  }

  // STEP 0: Trailing stops are handled server-side by Alpaca trailing_stop orders.
  // No client-side polling needed — Alpaca triggers the sell automatically.

  // STEP 0.5: Check for momentum drift (avg of timeframes < -0.75%)
  // ANTI-CHURN: Momentum drift sells are subject to hold period check
  try {
    const md = await getMomentumDrift();
    const driftAnalysis = md.getPositionsWithMomentumDrift(positions, sortedTickers);

    for (const drift of driftAnalysis) {
      // Skip if already sold via trailing stop
      const alreadySold = results.executed.some(t => t.side === "sell" && t.symbol === drift.symbol);
      if (alreadySold) continue;

      const position = positions.find(p => p.symbol === drift.symbol);
      if (!position) continue;

      // ANTI-CHURN: Check hold period before drift sell
      const holdCheck = checkHoldPeriod(drift.symbol, false, false);
      if (!holdCheck.canSell) {
        results.reasoning.push(`HOLD ${drift.symbol}: momentum drift detected BUT ${holdCheck.reason}`);
        continue;
      }

      results.sellSignals.push({
        action: "MOMENTUM_DRIFT",
        symbol: drift.symbol,
        score: drift.score,
        avgChange: drift.avgChange,
        signals: [`MOMENTUM DRIFT: ${drift.reason}`],
        isMomentumDrift: true
      });

      const sellResult = await executeSell(
        drift.symbol,
        position.current_price || position.currentPrice || position.lastPrice,
        parseFloat(position.qty || position.shares),
        `MOMENTUM DRIFT: ${drift.reason}`
      );

      if (sellResult.success) {
        results.executed.push(sellResult.trade);
        results.reasoning.push(`EXECUTED SELL ${drift.symbol}: momentum drift — ${drift.reason}`);
      } else {
        results.skipped.push({ symbol: drift.symbol, reason: sellResult.error });
        results.reasoning.push(`FAILED SELL ${drift.symbol} (drift): ${sellResult.error}`);
      }
    }
  } catch (error) {
    // Continue even if momentum drift check fails
    console.error("Momentum drift check error:", error.message);
  }

  // STEP 0.6: Stagnant ticker check — DISABLED
  // Selling stocks for low intraday movement causes unnecessary churn, wash sales,
  // and kills positions that are consolidating before breakouts. Midday (11am-2pm)
  // naturally has low range. Let score-based sells and trailing stops handle exits.

  // STEP 1: Evaluate ALL positions for sell signals first
  // Skip positions already sold via trailing stop, momentum drift, or stagnant
  const soldViaTrailingStop = new Set(
    results.executed.filter(t => t.side === "sell").map(t => t.symbol)
  );

  for (const position of positions) {
    // Skip if already sold via trailing stop
    if (soldViaTrailingStop.has(position.symbol)) continue;

    const ticker = sortedTickers.find(t => t.symbol === position.symbol);
    if (!ticker) continue;

    const sellEval = evaluateSellSignal(ticker, position);

    if (sellEval.action === "SELL" || sellEval.action === "EXTREME_SELL") {
      // ANTI-CHURN: Check hold period (extreme sells bypass)
      const holdCheck = checkHoldPeriod(
        ticker.symbol,
        sellEval.isExtreme,  // Extreme sells always allowed
        false                // Not a trailing stop
      );

      if (!holdCheck.canSell) {
        results.reasoning.push(`HOLD ${ticker.symbol}: sell signal (score ${ticker.score.toFixed(1)}) BUT ${holdCheck.reason}`);
        continue;
      }

      results.sellSignals.push(sellEval);

      const sellResult = await executeSell(
        ticker.symbol,
        ticker.price,
        parseFloat(position.qty || position.shares),
        `${sellEval.isExtreme ? "EXTREME: " : ""}${sellEval.isTechnicalOverride ? "TECH OVERRIDE: " : ""}${sellEval.signals.join(", ")}`
      );

      if (sellResult.success) {
        results.executed.push(sellResult.trade);
        results.reasoning.push(`EXECUTED SELL ${ticker.symbol}: ${sellEval.signals.join(", ")}`);
      } else {
        results.skipped.push({ symbol: ticker.symbol, reason: sellResult.error });
        results.reasoning.push(`FAILED SELL ${ticker.symbol}: ${sellResult.error}`);
      }
    } else if (sellEval.isProtected) {
      results.protected.push({
        symbol: position.symbol,
        plPercent: sellEval.plPercent,
        score: ticker.score
      });
      results.reasoning.push(`HOLD ${position.symbol}: protected position (+${sellEval.plPercent.toFixed(1)}%), score ${ticker.score.toFixed(1)}`);
    } else {
      // Position held — explain why no sell
      const plPercent = position ? parseFloat(position.unrealized_plpc || 0) * 100 : 0;
      results.reasoning.push(`HOLD ${position.symbol}: score ${ticker.score.toFixed(1)} > sell threshold ${config.sellThreshold} (P/L ${plPercent >= 0 ? "+" : ""}${plPercent.toFixed(1)}%)`);
    }
  }

  // ANTI-CHURN: Check rotation frequency before allowing buys
  const rotationCheck = checkRotationFrequency();
  if (!rotationCheck.allowed) {
    results.reasoning.push(`ROTATION LIMIT: ${rotationCheck.reason}`);
  }

  // --- MARKET-OPEN OBSERVATION WINDOW ---
  const obsStatus = getObservationWindowStatus();
  if (obsStatus.inWindow && spyCheck.allow && rotationCheck.allowed) {
    const isWindowEnding = obsStatus.minutesSinceOpen >= (OBSERVATION_WINDOW.endMinutesSinceOpen - 1);

    // Start/update the observation sampler with current top buy candidates
    const obsCandidates = top3BuyTickers.filter(s => !positionSymbols.includes(s) && !observationBuysExecuted.has(s));
    if (obsCandidates.length > 0) {
      startObservationSampler(obsCandidates);
    }

    if (!obsStatus.canBuy) {
      // Before 9:35 — just observe, no buys yet
      results.reasoning.push(`OBSERVATION WINDOW: ${obsStatus.minutesSinceOpen}min since open — sampling prices, buy allowed after ${OBSERVATION_WINDOW.minMinutesBeforeBuy}min`);
      for (const sym of obsCandidates) {
        const buf = observationBuffer[sym];
        if (buf && buf.length > 0) {
          results.reasoning.push(`  ${sym}: ${buf.length} samples, latest $${buf[buf.length - 1].price.toFixed(2)}`);
        }
      }
    } else {
      // 9:35-9:40 — check each candidate for buy trigger
      results.reasoning.push(`OBSERVATION WINDOW: ${obsStatus.minutesSinceOpen}min since open — evaluating for entry${isWindowEnding ? " (window ending)" : ""}`);

      const currentPositionCount = tradablePositions.length - results.executed.filter(t => t.side === "sell").length + buyCount;

      for (const symbol of obsCandidates) {
        if (currentPositionCount + buyCount >= config.maxTotalPositions) {
          results.reasoning.push(`  ${symbol}: position limit reached — skipping`);
          break;
        }

        const analysis = analyzeObservation(symbol, isWindowEnding);
        results.reasoning.push(`  ${symbol}: ${analysis.reason}`);

        if (analysis.shouldBuy) {
          const ticker = sortedTickers.find(t => t.symbol === symbol);
          const buyResult = await executeBuy(
            symbol,
            analysis.price,
            `OPEN OBSERVATION: ${analysis.reason}`,
            { spyPositive, fromObservation: true }
          );

          if (buyResult.success && buyResult.trade) {
            results.executed.push(buyResult.trade);
            results.reasoning.push(`  EXECUTED BUY ${symbol} @ $${analysis.price.toFixed(2)} via observation`);
            observationBuysExecuted.add(symbol);
            buyCount++;
          } else {
            results.reasoning.push(`  FAILED BUY ${symbol}: ${buyResult.error || "unknown"}`);
          }
        }
      }

      // If all candidates bought or window ending, stop sampler
      if (obsCandidates.every(s => observationBuysExecuted.has(s)) || isWindowEnding) {
        stopObservationSampler();
        // Clear buffers
        for (const sym of Object.keys(observationBuffer)) {
          delete observationBuffer[sym];
        }
      }
    }

    // During observation window, skip the normal buy logic below
    // (sells still happen normally above)
    results.reasoning.push("Normal buy evaluation deferred — observation window active");

    // --- REASONING: Final summary ---
    if (results.executed.length === 0) {
      results.reasoning.push("RESULT: No trades — observation in progress or no signals");
    } else {
      results.reasoning.push(`RESULT: Executed ${results.executed.length} trade(s) — ${results.executed.map(t => `${t.side.toUpperCase()} ${t.symbol}`).join(", ")}`);
    }

    return results;
  }

  // Stop observation sampler if we've left the window
  if (!obsStatus.inWindow && observationSamplerInterval) {
    stopObservationSampler();
    for (const sym of Object.keys(observationBuffer)) {
      delete observationBuffer[sym];
    }
  }

  // STEP 2: Evaluate top 3 for buy signals (only if SPY allows)
  if (spyCheck.allow && rotationCheck.allowed) {
    for (const ticker of sortedTickers) {
      // Skip if in blacklist
      if (config.blacklist.includes(ticker.symbol)) {
        if (ticker.score >= effectiveBuyThreshold) {
          results.reasoning.push(`SKIP ${ticker.symbol}: blacklisted (score ${ticker.score.toFixed(1)})`);
        }
        continue;
      }

      // Skip if not in watchlist (when watchlist is set)
      if (config.watchlist.length > 0 && !config.watchlist.includes(ticker.symbol)) continue;

      // Only evaluate if in top 3 and not already holding
      const isTop3 = top3BuyTickers.includes(ticker.symbol);
      if (positionSymbols.includes(ticker.symbol)) {
        // Already holding — already explained in sell section
        continue;
      }
      if (!isTop3) {
        // Not in top 3 — skip but note if it was close
        if (ticker.score >= effectiveBuyThreshold) {
          results.reasoning.push(`SKIP BUY ${ticker.symbol}: score ${ticker.score.toFixed(1)} qualifies but not in top 3`);
        }
        continue;
      }

      const buyEval = evaluateBuySignal(ticker, { spyPositive, positions });

      if (buyEval.action === "BUY" || buyEval.action === "EXTREME_BUY") {
        results.buySignals.push(buyEval);

        // Check position limits (max 2 in BackBoneApp)
        // Use tradablePositions (excludes CVR) for accurate count
        const currentPositionCount = tradablePositions.length - results.executed.filter(t => t.side === "sell").length + buyCount;

        if (currentPositionCount < config.maxTotalPositions) {
          const buyResult = await executeBuy(
            ticker.symbol,
            ticker.price,
            `${buyEval.isExtreme ? "EXTREME: " : ""}Top ${top3BuyTickers.indexOf(ticker.symbol) + 1}: ${buyEval.signals.join(", ")}`,
            { spyPositive }
          );

          if (buyResult.success) {
            if (buyResult.queued) {
              // Buy is queued with 5-minute delay
              results.reasoning.push(`QUEUED BUY ${ticker.symbol}: ${buyResult.message}`);
            } else if (buyResult.trade) {
              // Immediate execution (rare - only with skipDelay)
              results.executed.push(buyResult.trade);
              results.reasoning.push(`EXECUTED BUY ${ticker.symbol}: ${buyEval.signals.join(", ")}`);
              buyCount++;
            }
          } else if (buyResult.blocked) {
            // Blocked due to bad market conditions
            results.skipped.push({ symbol: ticker.symbol, reason: buyResult.error });
            results.reasoning.push(`BLOCKED BUY ${ticker.symbol}: ${buyResult.error}`);
          } else {
            results.skipped.push({ symbol: ticker.symbol, reason: buyResult.error });
            results.reasoning.push(`FAILED BUY ${ticker.symbol}: ${buyResult.error}`);
          }
        } else {
          results.skipped.push({
            symbol: ticker.symbol,
            reason: `Position limit reached (${currentPositionCount}/${config.maxTotalPositions})`
          });
          results.reasoning.push(`SKIP BUY ${ticker.symbol}: position limit ${currentPositionCount}/${config.maxTotalPositions} (score ${ticker.score.toFixed(1)})`);
        }
      } else {
        results.reasoning.push(`NO BUY ${ticker.symbol}: ${buyEval.signals.join(", ")}`);
      }
    }
  } else {
    // SPY blocked or rotation limit hit — skip all buys
    if (!spyCheck.allow) {
      results.reasoning.push(`SPY BLOCK: ${spyCheck.reason} — all buys skipped`);
    }
    if (!rotationCheck.allowed) {
      results.reasoning.push(`ROTATION BLOCK: ${rotationCheck.reason} — all buys skipped`);
    }
    if (top3BuyTickers.length > 0) {
      results.reasoning.push(`Blocked candidates: ${top3BuyTickers.join(", ")}`);
    }
  }

  // STEP 3: Options trading (if strategy includes options)
  try {
    const tradingSettings = getTradingSettings();
    if (tradingSettings.strategy === "options" || tradingSettings.strategy === "both") {
      const { evaluateOptionsOpportunities, manageOptionPositions } = await import("./options-trader.js");

      const alpacaConfig = getAlpacaConfig();
      let equity = 0;
      if (alpacaConfig.ready) {
        try {
          const acct = await fetchAccount(alpacaConfig);
          equity = parseFloat(acct.equity) || 0;
        } catch {}
      }

      if (equity > 0) {
        // Manage existing positions first (exits)
        const exitResults = await manageOptionPositions(alpacaConfig, sortedTickers);
        for (const exit of exitResults.exits) {
          results.executed.push({ side: "sell", symbol: exit.symbol, type: "option", reason: exit.reason });
          results.reasoning.push(`OPTIONS EXIT ${exit.underlying}: ${exit.reason}`);
        }

        // Evaluate new opportunities (only if SPY allows and no drawdown breaker)
        if (spyCheck.allow && !drawdownBreaker) {
          const optResults = await evaluateOptionsOpportunities(sortedTickers, equity, positions, spyCheck);
          results.reasoning.push(...optResults.reasoning);
          for (const buy of optResults.bought) {
            results.executed.push({ side: "buy", symbol: buy.symbol, type: "option", reason: buy.reason });
          }
        } else {
          results.reasoning.push("OPTIONS: Skipped new buys — SPY blocked or drawdown breaker active");
        }
      }
    }
  } catch (optErr) {
    console.error("[AutoTrader] Options error:", optErr.message);
    results.reasoning.push(`OPTIONS ERROR: ${optErr.message}`);
  }

  // --- REASONING: Final summary ---
  if (results.executed.length === 0) {
    const sellCount = results.sellSignals.length;
    const buyCount2 = results.buySignals.length;
    if (sellCount === 0 && buyCount2 === 0) {
      results.reasoning.push("RESULT: No trades — no signals met buy/sell thresholds");
    } else if (buyCount2 > 0 && results.executed.length === 0) {
      results.reasoning.push("RESULT: Buy signals detected but execution blocked (position limit, cooldown, or order failed)");
    }
  } else {
    results.reasoning.push(`RESULT: Executed ${results.executed.length} trade(s) — ${results.executed.map(t => `${t.side.toUpperCase()} ${t.symbol}`).join(", ")}`);
  }

  // ── LIVE MARKET ALERTS — notify user of big moves ──
  try {
    const { checkMarketAlerts } = await import("../messaging/live-alerts.js");
    const account = positions[0]?.account || {};
    const dayPL = positions.reduce((sum, p) => sum + parseFloat(p.unrealized_intraday_pl || 0), 0);
    const totalEquity = positions.reduce((sum, p) => sum + parseFloat(p.market_value || 0), 0);
    const dayPLPercent = totalEquity > 0 ? (dayPL / totalEquity) * 100 : 0;
    await checkMarketAlerts({ positions, dayPLPercent, totalEquity });
  } catch {}

  return results;
};

/**
 * Get trading status including market hours
 */
export const getTradingStatus = () => {
  loadConfig();
  const marketStatus = isMarketOpen();
  const nextEval = getNextEvaluationTime();
  const rotationCheck = checkRotationFrequency();

  const obsStatus = getObservationWindowStatus();

  return {
    enabled: config.enabled,
    mode: config.mode,
    marketOpen: marketStatus.open,
    marketStatus: marketStatus.reason,
    nextEvaluation: nextEval.nextEval,
    nextMarketOpen: marketStatus.nextOpen,
    buyThreshold: config.buyThreshold,
    sellThreshold: config.sellThreshold,
    dailyTradeCount,
    maxDailyTrades: config.maxDailyTrades,
    observationWindow: {
      active: obsStatus.inWindow,
      minutesSinceOpen: obsStatus.minutesSinceOpen,
      canBuy: obsStatus.canBuy,
      samplerRunning: !!observationSamplerInterval,
      targets: observationTargets,
      samplesCollected: Object.fromEntries(
        Object.entries(observationBuffer).map(([k, v]) => [k, v.length])
      ),
      buysExecuted: [...observationBuysExecuted]
    },
    antiChurn: {
      minHoldPeriodDays: MIN_HOLD_PERIOD_MS / (24 * 60 * 60 * 1000),
      maxRotationsPerWeek: MAX_ROTATIONS_PER_WEEK,
      currentRotations: rotationCheck.rotations,
      rotationLimitHit: !rotationCheck.allowed
    },
    recentTrades: tradesLog.slice(-10),
    config
  };
};

/**
 * Enable/disable auto-trading
 */
export const setTradingEnabled = (enabled) => {
  saveConfig({ enabled });
  return { enabled };
};

/**
 * Get hold period status for a position (exported for MCP/UI)
 */
export { checkHoldPeriod, checkRotationFrequency, checkWashSale, checkRepeatLoser };

/**
 * Get observation window status (exported for MCP/UI)
 */
export { getObservationWindowStatus, observationBuffer, stopObservationSampler };

// Initialize on load
loadConfig();
loadTradesLog();
