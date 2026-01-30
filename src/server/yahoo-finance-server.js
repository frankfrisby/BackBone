import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Yahoo Finance Background Server
 * Runs as a local server to fetch stock data
 * Caches data and serves to BACKBONE app
 */

const app = express();
const PORT = process.env.YAHOO_SERVER_PORT || 3001;

// Data cache
let tickerCache = {
  tickers: [],
  lastUpdate: null,
  updating: false,
  fullScanRunning: false,
  lastFullScan: null,
  scanProgress: 0,
  scanTotal: 0
};

const YAHOO_FINANCE_BASE = "https://query1.finance.yahoo.com/v8/finance";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const REFRESH_INTERVAL = 180000; // 3 minutes

/**
 * Check if a timestamp falls within the current "ticker day" (4 AM to 4 AM).
 * A ticker day starts at 4:00 AM and ends at 3:59 AM the next day.
 */
const isTickerToday = (timestamp) => {
  if (!timestamp) return false;
  const now = new Date();
  const ts = new Date(timestamp);
  const tickerDayStart = new Date(now);
  tickerDayStart.setHours(4, 0, 0, 0);
  if (now < tickerDayStart) {
    tickerDayStart.setDate(tickerDayStart.getDate() - 1);
  }
  return ts >= tickerDayStart;
};

// Import ticker lists from shared data
// CORE_TICKERS (150) = regular refresh, TICKER_UNIVERSE (800+) = full scan
import { CORE_TICKERS, TICKER_UNIVERSE } from "../data/tickers.js";

/**
 * Fetch quote for a single ticker
 */
const fetchQuote = async (symbol) => {
  try {
    const url = `${YAHOO_FINANCE_BASE}/quote?symbols=${symbol}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const quote = data.quoteResponse?.result?.[0];
    if (!quote) return null;

    return {
      symbol: quote.symbol,
      shortName: quote.shortName,
      longName: quote.longName,
      price: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose,
      open: quote.regularMarketOpen,
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      volume: quote.regularMarketVolume,
      avgVolume: quote.averageDailyVolume10Day,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      marketState: quote.marketState
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
};

/**
 * Load Alpaca config for fallback data fetching
 */
let alpacaConfig = null;
const loadAlpacaConfig = () => {
  if (alpacaConfig !== null) return alpacaConfig;
  try {
    const configPath = path.join(process.cwd(), "data", "alpaca-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const key = config.apiKey && !config.apiKey.includes("PASTE") ? config.apiKey : null;
      const secret = config.apiSecret && !config.apiSecret.includes("PASTE") ? config.apiSecret : null;
      if (key && secret) {
        alpacaConfig = { key, secret };
        return alpacaConfig;
      }
    }
  } catch { /* ignore */ }
  alpacaConfig = false; // Mark as checked but unavailable
  return false;
};

/**
 * Fetch quote from Alpaca bars API (fallback when Yahoo fails)
 */
const fetchQuoteFromAlpaca = async (symbol) => {
  const config = loadAlpacaConfig();
  if (!config) return null;

  try {
    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&limit=65&feed=iex`;
    const response = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": config.key,
        "APCA-API-SECRET-KEY": config.secret
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const bars = data.bars;
    if (!bars || bars.length === 0) return null;

    const closes = bars.map(b => b.c);
    const volumes = bars.map(b => b.v);
    const lastBar = bars[bars.length - 1];
    const prevClose = bars.length > 1 ? bars[bars.length - 2].c : lastBar.o;
    const change = lastBar.c - prevClose;
    const changePercent = (change / prevClose) * 100;

    console.log(`[Alpaca fallback] ${symbol}: $${lastBar.c.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%)`);

    return {
      symbol,
      shortName: symbol,
      longName: symbol,
      regularMarketPrice: lastBar.c,
      regularMarketPreviousClose: prevClose,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketVolume: lastBar.v,
      regularMarketDayHigh: lastBar.h,
      regularMarketDayLow: lastBar.l,
      averageDailyVolume10Day: volumes.length > 0
        ? volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, volumes.length)
        : null,
      marketCap: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      historicalCloses: closes,
      historicalVolumes: volumes
    };
  } catch (error) {
    console.error(`[Alpaca fallback] Error fetching ${symbol}:`, error.message);
    return null;
  }
};

const fetchQuoteFromChart = async (symbol) => {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      // Yahoo failed — try Alpaca fallback
      return await fetchQuoteFromAlpaca(symbol);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      return await fetchQuoteFromAlpaca(symbol);
    }

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0] || {};
    const closes = quotes.close?.filter(c => c !== null) || [];
    const volumes = quotes.volume?.filter(v => v !== null) || [];

    // Get previous close for change calculation
    const previousClose = closes.length > 1 ? closes[closes.length - 2] : meta.chartPreviousClose;
    const currentPrice = meta.regularMarketPrice;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: meta.symbol,
      shortName: meta.shortName,
      longName: meta.longName,
      regularMarketPrice: currentPrice,
      regularMarketPreviousClose: previousClose,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketVolume: meta.regularMarketVolume,
      regularMarketDayHigh: meta.regularMarketDayHigh,
      regularMarketDayLow: meta.regularMarketDayLow,
      averageDailyVolume10Day: volumes.length > 0
        ? volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, volumes.length)
        : null,
      marketCap: meta.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      exchange: meta.exchangeName || meta.fullExchangeName || null,
      currency: meta.currency || null,
      instrumentType: meta.instrumentType || null,
      // Include historical for MACD
      historicalCloses: closes,
      historicalVolumes: volumes
    };
  } catch (error) {
    console.error(`Error fetching ${symbol} from Yahoo:`, error.message);
    // Yahoo threw — try Alpaca fallback
    return await fetchQuoteFromAlpaca(symbol);
  }
};

/**
 * Fetch quotes for multiple tickers
 */
const fetchQuotes = async (symbols) => {
  const results = [];

  // Fetch in parallel batches of 5
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(fetchQuoteFromChart));
    results.push(...batchResults.filter(Boolean));

    // Small delay between batches
    if (i + 5 < symbols.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
};

/**
 * Fetch historical data for MACD calculation
 */
const fetchHistorical = async (symbol) => {
  try {
    const url = `${YAHOO_CHART_BASE}/${symbol}?range=3mo&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    return timestamps.map((timestamp, i) => ({
      timestamp,
      close: quotes.close?.[i],
      volume: quotes.volume?.[i]
    })).filter(bar => bar.close !== null);
  } catch (error) {
    return null;
  }
};

/**
 * Calculate EMA
 */
const calculateEMA = (prices, period) => {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

/**
 * Calculate MACD
 */
const calculateMACD = (bars) => {
  if (!bars || bars.length < 35) {
    return { macd: null, signal: null, histogram: null, trend: "neutral" };
  }

  const closes = bars.map(b => b.close);
  const shortEMA = calculateEMA(closes, 12);
  const longEMA = calculateEMA(closes, 26);

  if (!shortEMA || !longEMA) {
    return { macd: null, signal: null, histogram: null, trend: "neutral" };
  }

  const macd = shortEMA - longEMA;
  const macdHistory = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = calculateEMA(closes.slice(0, i), 12);
    const l = calculateEMA(closes.slice(0, i), 26);
    if (s && l) macdHistory.push(s - l);
  }

  const signal = macdHistory.length >= 9 ? calculateEMA(macdHistory, 9) : macd;
  const histogram = macd - signal;

  let trend = "neutral";
  if (macd > signal && histogram > 0) trend = "bullish";
  else if (macd < signal && histogram < 0) trend = "bearish";

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    trend
  };
};

/**
 * Calculate volume score
 */
const calculateVolumeScore = (bars) => {
  if (!bars || bars.length < 2) return { score: 50, ratio: 1, status: "normal" };

  const volumes = bars.map(b => b.volume).filter(v => v);
  if (volumes.length < 2) return { score: 50, ratio: 1, status: "normal" };

  const current = volumes[volumes.length - 1];
  const avg = volumes.slice(0, -1).reduce((s, v) => s + v, 0) / (volumes.length - 1);
  if (!avg) return { score: 50, ratio: 1, status: "normal" };

  const ratio = current / avg;
  const score = Math.min(100, Math.max(0, 50 + (ratio - 1) * 50));

  let status = "normal";
  if (ratio >= 1.5) status = "high";
  else if (ratio >= 1.2) status = "above_avg";
  else if (ratio <= 0.5) status = "low";
  else if (ratio <= 0.8) status = "below_avg";

  return { score: Math.round(score), ratio: Math.round(ratio * 100) / 100, status };
};

/**
 * Calculate RSI from price history
 */
const calculateRSI = (prices, period = 14) => {
  if (!prices || prices.length < period + 1) {
    return 50; // Neutral
  }

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter(c => c > 0);
  const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;

  const rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
};

/**
 * Calculate price position in 60-day range (-1.5 to +1.5)
 */
const calculatePricePosition = (currentPrice, prices) => {
  if (!prices || prices.length < 5) return 0;

  const validPrices = prices.filter(p => p !== null && p !== undefined);
  const min60d = Math.min(...validPrices);
  const max60d = Math.max(...validPrices);

  if (max60d === min60d) return 0;

  const position = (currentPrice - min60d) / (max60d - min60d);

  // Oversold (bullish) vs overbought (bearish)
  if (position <= 0.1) return 1.5;  // Deeply oversold - bullish
  if (position >= 0.9) return -1.5; // Deeply overbought - bearish

  // Linear interpolation
  return 1.5 - (position * 3);
};

/**
 * Calculate psychological adjustment from price momentum
 * Matches BackBoneApp reference algorithm with breaking points
 *
 * Rules (mean-reversion logic):
 * - Zone 1 (0-15%): Down INCREASES score (buying opportunity), Up DECREASES score
 * - Zone 2 (15-25%): First reversal - momentum energy reversal
 * - Zone 3 (>25%): Second reversal
 *
 * Formula: For every 2% change, adjust by 0.5 points
 */
const calculatePsychological = (percentChange) => {
  if (!percentChange) return 0;

  const absPercent = Math.abs(percentChange);
  const isPositive = percentChange > 0;

  // Zone 1: Normal momentum (0-15%)
  if (absPercent <= 15) {
    const adjustment = (absPercent / 2) * 0.5;
    // Up = decrease score (overbought), Down = increase score (buying opportunity)
    return isPositive ? -adjustment : adjustment;
  }

  // Zone 2: First reversal (15-25%) - momentum energy reversal
  if (absPercent <= 25) {
    const first15Adjustment = (15 / 2) * 0.5; // 3.75
    const beyondAdjustment = ((absPercent - 15) / 2) * 0.5;

    if (isPositive) {
      // Up: first 15% decreases, beyond 15% increases (reversal)
      return -first15Adjustment + beyondAdjustment;
    } else {
      // Down: first 15% increases, beyond 15% decreases (reversal)
      return first15Adjustment - beyondAdjustment;
    }
  }

  // Zone 3: Second reversal (>25%) - reverses again
  const first15Adjustment = (15 / 2) * 0.5; // 3.75
  const next10Adjustment = (10 / 2) * 0.5;  // 2.5 (from 15% to 25%)
  const beyondAdjustment = ((absPercent - 25) / 2) * 0.5;

  if (isPositive) {
    // Up: first 15% decreases, 15-25% increases, beyond 25% decreases again
    return -first15Adjustment + next10Adjustment - beyondAdjustment;
  } else {
    // Down: first 15% increases, 15-25% decreases, beyond 25% increases again
    return first15Adjustment - next10Adjustment + beyondAdjustment;
  }
};

/**
 * Calculate MACD adjustment score (-1.5 to +1.5)
 * Reduced from reference (-2.5 to +2.5) since we lack multi-timeframe analysis
 *
 * Without the sophisticated 15d/5d/2d weighted analysis from reference,
 * we use a simpler histogram-based approach with reduced weight.
 */
const calculateMACDScore = (macdData) => {
  if (!macdData || macdData.histogram === null) return 0;

  const { histogram, macd, signal, trend } = macdData;

  let score = 0;
  if (histogram > 0.5) {
    score = Math.min(1, histogram / 2);
  } else if (histogram < -0.5) {
    score = Math.max(-1, histogram / 2);
  } else {
    score = histogram / 0.5 * 0.5;
  }

  // Trend confirmation bonus
  if (trend === "bullish" && macd > signal) {
    score += 0.25;
  } else if (trend === "bearish" && macd < signal) {
    score -= 0.25;
  }

  // Reduced weight: 1.5 instead of 2.5 since we lack multi-timeframe analysis
  return Math.max(-1.5, Math.min(1.5, score * 1.5));
};

/**
 * Calculate price movement penalty for extreme moves (always <= 0)
 * Matches BackBoneApp reference algorithm
 *
 * DOWN movements (negative %):
 * - -1 point at -12%
 * - -2 points at -20%
 * - Continues at -1 per 10%
 *
 * UP movements (positive %):
 * - -0.5 points at +12%
 * - -1 point at +20%
 * - Continues at half the down rate
 */
const calculatePriceMovementPenalty = (percentChange) => {
  if (!percentChange) return 0;

  const absPercent = Math.abs(percentChange);
  const isNegative = percentChange < 0;

  // No penalty if movement is less than 12%
  if (absPercent < 12) return 0;

  if (isNegative) {
    // DOWN: -1 point at 12%, -2 at 20%, continues every 10%
    const excessPercent = absPercent - 12;
    return -1.0 - (excessPercent / 10);
  } else {
    // UP: -0.5 points at 12%, -1 at 20% (half rate)
    const excessPercent = absPercent - 12;
    return -0.5 - (excessPercent / 20);
  }
};

/**
 * Calculate volume sigma score (-1.5 to +1.5)
 * Matches BackBoneApp reference: Force NEGATIVE when stock declining
 *
 * Direction Validation:
 * - If stock declining (< -0.05%): force NEGATIVE volume score
 * - This prevents misleading pump signals on declining stocks
 */
const calculateVolumeSigmaScore = (sigma, priceDirection = 0) => {
  if (!sigma || sigma === 1) return 0;

  const DECLINE_THRESHOLD = -0.05;
  let score = 2.5 * ((sigma - 1) / 10) - 1;

  // CRITICAL: Force negative if stock is declining
  // This prevents high volume on a falling stock from boosting score
  if (priceDirection < DECLINE_THRESHOLD) {
    score = -Math.abs(score);
  } else {
    score = Math.abs(score);
  }

  return Math.max(-1.5, Math.min(1.5, score));
};

// Major US exchanges — reject OTC, pink sheets, foreign exchanges, etc.
const ALLOWED_EXCHANGES = new Set([
  "NYSE", "NMS", "NGM", "NCM", "NYQ", "NAS", "NASDAQ", "NYMEX", "NYSEARCA", "AMEX",
  "BATS", "ARCA", "PCX", "BTS", "CBO", "NYSEArca"
]);

// OTC / pink sheet / foreign exchange keywords to reject
const REJECTED_EXCHANGES = ["OTC", "PINK", "GREY", "OTHER OTC", "OTCBB", "TSXV", "TSX", "LSE", "HKSE"];

const isMajorExchange = (exchange) => {
  if (!exchange) return true; // If unknown (e.g. Alpaca fallback), allow through
  const upper = exchange.toUpperCase();
  // Reject known bad exchanges
  if (REJECTED_EXCHANGES.some(r => upper.includes(r))) return false;
  return ALLOWED_EXCHANGES.has(upper) ||
    upper.includes("NYSE") ||
    upper.includes("NASDAQ") ||
    upper.includes("NMS") ||
    upper.includes("AMEX") ||
    upper.includes("BATS") ||
    upper.includes("ARCA");
};

/**
 * Check if a ticker is actively trading on a major US exchange.
 * Rejects: delisted, OTC, penny stocks under $0.50, no volume, non-USD, non-equity.
 */
const isActiveTicker = (analysis) => {
  // Must be on a major exchange
  if (!isMajorExchange(analysis.exchange)) return { valid: false, reason: `exchange: ${analysis.exchange}` };
  // Must be USD
  if (analysis.currency && analysis.currency !== "USD") return { valid: false, reason: `currency: ${analysis.currency}` };
  // Must be equity (not warrant, option, etc.)
  if (analysis.instrumentType && analysis.instrumentType !== "EQUITY" && analysis.instrumentType !== "ETF") {
    return { valid: false, reason: `type: ${analysis.instrumentType}` };
  }
  // Must have a real price (not delisted penny stock)
  if (!analysis.price || analysis.price < 0.50) return { valid: false, reason: `price: $${analysis.price || 0}` };
  // Must have some trading volume
  if (analysis.avgVolume !== null && analysis.avgVolume !== undefined && analysis.avgVolume < 1000) {
    return { valid: false, reason: `avg volume: ${analysis.avgVolume}` };
  }
  return { valid: true };
};

/**
 * Build full ticker analysis with comprehensive scoring
 */
const buildTickerAnalysis = async (symbol, quote) => {
  // Use historical data already fetched with quote
  const bars = quote.historicalCloses?.map((close, i) => ({
    close,
    volume: quote.historicalVolumes?.[i]
  })) || [];

  const closes = bars.map(b => b.close).filter(c => c !== null);
  const macd = calculateMACD(bars);
  const volumeScoreData = calculateVolumeScore(bars);

  // Calculate RSI
  const rsi = calculateRSI(closes);

  // Calculate volume sigma
  let volumeSigma = 1.0;
  if (volumeScoreData.ratio) {
    volumeSigma = Math.round(volumeScoreData.ratio * 100) / 100;
  }

  // === DATA QUALITY CHECK ===
  // Tickers with missing critical data (no change%, no volume, insufficient history)
  // get penalized heavily — they're likely dead, delisted, or have stale data
  const hasChangePercent = quote.regularMarketChangePercent !== null && quote.regularMarketChangePercent !== undefined;
  const hasVolume = quote.averageDailyVolume10Day !== null && quote.averageDailyVolume10Day !== undefined && quote.averageDailyVolume10Day > 0;
  const hasHistory = closes.length >= 5;
  const isMissingData = !hasChangePercent || !hasVolume || !hasHistory;

  // === COMPREHENSIVE SCORING (matching score-engine.js) ===

  // 1. Technical Score (0-10) from RSI
  const technicalScore = (100 - Math.abs(50 - rsi)) / 10;

  // 2. MACD Score (-2.5 to +2.5)
  const macdScore = calculateMACDScore(macd);

  // 3. Volume Sigma Score (-1.5 to +1.5)
  const volumeScore = calculateVolumeSigmaScore(volumeSigma, quote.regularMarketChangePercent);

  // 4. Price Position Score (-1.5 to +1.5)
  const pricePositionScore = calculatePricePosition(quote.regularMarketPrice, closes);

  // 5. Psychological Adjustment (-3.5 to +3.5)
  const psychologicalScore = calculatePsychological(quote.regularMarketChangePercent);

  // 6. Price Movement Penalty (for extreme moves)
  const priceMovementPenalty = calculatePriceMovementPenalty(quote.regularMarketChangePercent);

  // Base score: average of technical and a neutral prediction (5.5) plus psychological
  const baseScore = (technicalScore + 5.5 + psychologicalScore) / 2;

  // Apply adjustments (matching BackBoneApp formula)
  let rawScore = baseScore +
    macdScore +
    volumeScore +
    (pricePositionScore * 1.25) +
    priceMovementPenalty;  // Add extreme movement penalty

  // Debug logging for score breakdown
  if (quote.symbol === "ZS" || rawScore >= 9.5) {
    console.log(`[Score Debug] ${quote.symbol}: tech=${technicalScore.toFixed(2)}, psych=${psychologicalScore.toFixed(2)}, base=${baseScore.toFixed(2)}, macd=${macdScore.toFixed(2)}, vol=${volumeScore.toFixed(2)}, pos=${pricePositionScore.toFixed(2)}, penalty=${priceMovementPenalty.toFixed(2)}, raw=${rawScore.toFixed(2)}`);
  }

  // Penalize tickers with missing data — they shouldn't rank high
  if (isMissingData) {
    rawScore = Math.min(rawScore, 2.0);
  }

  // Clamp to 0-10 with 1 decimal
  const score = Math.round(Math.max(0, Math.min(10, rawScore)) * 10) / 10;

  return {
    symbol: quote.symbol,
    name: quote.shortName || quote.longName,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange,
    changePercent: quote.regularMarketChangePercent,
    volume: quote.regularMarketVolume,
    avgVolume: quote.averageDailyVolume10Day,
    marketCap: quote.marketCap,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    exchange: quote.exchange || null,
    currency: quote.currency || null,
    instrumentType: quote.instrumentType || null,
    macd,
    macdValue: macd?.macd ?? null,
    macdTrend: macd?.trend || "neutral",
    volumeScore: volumeScoreData,
    volumeSigma,
    rsi,
    score,
    scoredAt: new Date().toISOString(),
    historyDays: closes.length
  };
};

/**
 * Update core tickers (top 150 — quick refresh every 3 minutes)
 * Merges into existing cache so full-scan tickers aren't lost
 */
const updateTickers = async () => {
  if (tickerCache.updating) return;
  tickerCache.updating = true;

  console.log(`[${new Date().toISOString()}] Refreshing ${CORE_TICKERS.length} core tickers...`);

  try {
    const quotes = await fetchQuotes(CORE_TICKERS);

    if (quotes.length === 0) {
      console.log("No quotes received from Yahoo Finance");
      tickerCache.updating = false;
      return;
    }

    const nowISO = new Date().toISOString();

    // Build map of existing tickers so we merge, not replace
    const existingMap = new Map();
    for (const t of tickerCache.tickers) {
      existingMap.set(t.symbol, t);
    }

    // Process quotes into analyses
    for (let i = 0; i < quotes.length; i += 5) {
      const batch = quotes.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(quote => buildTickerAnalysis(quote.symbol, quote))
      );
      for (const analysis of batchResults) {
        const check = isActiveTicker(analysis);
        if (!check.valid) {
          console.log(`[Skip] ${analysis.symbol} — ${check.reason}`);
          existingMap.delete(analysis.symbol);
          continue;
        }
        analysis.lastEvaluated = nowISO;
        existingMap.set(analysis.symbol, analysis);
      }

      if (i + 5 < quotes.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Rebuild sorted list
    const sorted = Array.from(existingMap.values()).sort((a, b) => b.score - a.score);

    tickerCache.tickers = sorted;
    tickerCache.lastUpdate = nowISO;

    console.log(`[${new Date().toISOString()}] Refreshed ${quotes.length} core tickers (${sorted.length} total in cache). Top: ${sorted[0]?.symbol} (${sorted[0]?.score})`);

    // Save to file for persistence
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "tickers-cache.json"),
      JSON.stringify(tickerCache, null, 2)
    );

  } catch (error) {
    console.error("Error updating tickers:", error.message);
  }

  tickerCache.updating = false;
};

// API Routes
app.use(express.json());

// Get all tickers
app.get("/api/tickers", (req, res) => {
  res.json({
    success: true,
    tickers: tickerCache.tickers,
    lastUpdate: tickerCache.lastUpdate,
    count: tickerCache.tickers.length,
    fullScanRunning: tickerCache.fullScanRunning,
    lastFullScan: tickerCache.lastFullScan,
    scanProgress: tickerCache.scanProgress,
    scanTotal: tickerCache.scanTotal,
    evaluatedToday: tickerCache.tickers.filter(t => isTickerToday(t.lastEvaluated)).length,
    universeSize: TICKER_UNIVERSE.length
  });
});

// Get single ticker
app.get("/api/ticker/:symbol", (req, res) => {
  const ticker = tickerCache.tickers.find(t => t.symbol === req.params.symbol.toUpperCase());
  if (ticker) {
    res.json({ success: true, ticker });
  } else {
    res.status(404).json({ success: false, error: "Ticker not found" });
  }
});

// Force refresh
app.post("/api/refresh", async (req, res) => {
  await updateTickers();
  res.json({ success: true, message: "Refresh started" });
});

// Full scan - scans ALL TICKER_UNIVERSE (800+ real symbols, returns immediately, runs in background)
app.post("/api/full-scan", (req, res) => {
  if (tickerCache.fullScanRunning) {
    return res.json({ success: true, message: "Full scan already running" });
  }

  res.json({ success: true, message: `Full scan started for ${TICKER_UNIVERSE.length} tickers` });
  runFullScan();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    lastUpdate: tickerCache.lastUpdate,
    tickerCount: tickerCache.tickers.length,
    fullScanRunning: tickerCache.fullScanRunning,
    lastFullScan: tickerCache.lastFullScan
  });
});

// Load cached data on startup
const loadCache = () => {
  try {
    const cachePath = path.join(process.cwd(), "data", "tickers-cache.json");
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      // Restore data but reset runtime flags (may be stale from killed process)
      const rawTickers = data.tickers || [];
      // Purge orphan tickers, non-major exchanges, delisted, penny stocks
      const universeSet = new Set(TICKER_UNIVERSE);
      tickerCache.tickers = rawTickers.filter(t => {
        if (!universeSet.has(t.symbol)) return false;
        const check = isActiveTicker(t);
        if (!check.valid) {
          console.log(`[Cache purge] ${t.symbol} — ${check.reason}`);
          return false;
        }
        return true;
      });
      const purged = rawTickers.length - tickerCache.tickers.length;
      tickerCache.lastUpdate = data.lastUpdate || null;
      tickerCache.lastFullScan = data.lastFullScan || null;
      tickerCache.updating = false;
      tickerCache.fullScanRunning = false;
      console.log(`Loaded ${tickerCache.tickers.length} cached tickers from ${tickerCache.lastUpdate} (lastFullScan: ${tickerCache.lastFullScan || "never"})${purged > 0 ? ` — purged ${purged} orphan tickers` : ""}`);
    }
  } catch (error) {
    console.log("No cache found, starting fresh");
  }
};

/**
 * Run full scan of entire TICKER_UNIVERSE (800+ real tickers)
 * Stores per-ticker lastEvaluated timestamps so restarts pick up where they left off
 */
const runFullScan = async () => {
  if (tickerCache.fullScanRunning) {
    console.log("Full scan already running, skipping");
    return;
  }

  tickerCache.fullScanRunning = true;
  tickerCache.scanProgress = 0;
  const totalCount = TICKER_UNIVERSE.length;
  console.log(`[${new Date().toISOString()}] FULL SCAN started — ${totalCount} real tickers...`);

  try {
    // Build map of existing tickers for merging
    const existingMap = new Map();
    for (const t of tickerCache.tickers) {
      existingMap.set(t.symbol, t);
    }

    // Figure out which tickers need evaluation (not evaluated in current ticker day, 4 AM to 4 AM)
    const needsEval = TICKER_UNIVERSE.filter(sym => {
      const existing = existingMap.get(sym);
      if (!existing || !existing.lastEvaluated) return true;
      return !isTickerToday(existing.lastEvaluated);
    });

    console.log(`[${new Date().toISOString()}] ${needsEval.length} tickers need evaluation (${totalCount - needsEval.length} already done today)`);

    tickerCache.scanTotal = needsEval.length;

    if (needsEval.length === 0) {
      console.log("All tickers already evaluated today — full scan complete");
      tickerCache.lastFullScan = new Date().toISOString();
      tickerCache.fullScanRunning = false;
      tickerCache.scanProgress = 0;
      tickerCache.scanTotal = 0;
      return;
    }

    // Fetch in batches of 5
    let evaluated = 0;
    for (let i = 0; i < needsEval.length; i += 5) {
      const batch = needsEval.slice(i, i + 5);
      const batchQuotes = await Promise.all(batch.map(fetchQuoteFromChart));

      for (const quote of batchQuotes) {
        if (!quote) continue;
        try {
          const analysis = await buildTickerAnalysis(quote.symbol, quote);
          const check = isActiveTicker(analysis);
          if (!check.valid) {
            console.log(`[Skip] ${analysis.symbol} — ${check.reason}`);
            existingMap.delete(analysis.symbol);
            evaluated++;
            tickerCache.scanProgress = evaluated;
            continue;
          }
          analysis.lastEvaluated = new Date().toISOString();
          existingMap.set(analysis.symbol, analysis);
          evaluated++;
          tickerCache.scanProgress = evaluated;
        } catch (err) {
          console.error(`Error analyzing ${quote.symbol}:`, err.message);
        }
      }

      // Log progress every 50 tickers
      if (evaluated > 0 && evaluated % 50 < 5) {
        console.log(`[Full scan] ${evaluated}/${needsEval.length} evaluated...`);
      }

      // Small delay between batches to avoid rate limits
      if (i + 5 < needsEval.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Rebuild sorted list from all tickers
    const allTickers = Array.from(existingMap.values()).sort((a, b) => b.score - a.score);
    tickerCache.tickers = allTickers;
    tickerCache.lastUpdate = new Date().toISOString();
    tickerCache.lastFullScan = new Date().toISOString();

    console.log(`[${new Date().toISOString()}] FULL SCAN complete — ${allTickers.length} total tickers (${evaluated} newly evaluated). Top: ${allTickers[0]?.symbol} (${allTickers[0]?.score})`);

    // Persist
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "tickers-cache.json"),
      JSON.stringify(tickerCache, null, 2)
    );
  } catch (error) {
    console.error("Full scan error:", error.message);
  } finally {
    tickerCache.fullScanRunning = false;
    tickerCache.scanProgress = 0;
    tickerCache.scanTotal = 0;
  }
};

/**
 * Schedule a function to run at a specific hour (24h format)
 * Returns the timeout ID
 */
const scheduleAt = (hour, minute, fn, label = "task") => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  // If time already passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const msUntil = next.getTime() - now.getTime();
  const hoursUntil = (msUntil / 1000 / 60 / 60).toFixed(1);
  console.log(`[Scheduler] ${label} scheduled for ${next.toLocaleString()} (in ${hoursUntil}h)`);

  return setTimeout(() => {
    console.log(`[Scheduler] Running ${label}...`);
    fn();
    // Reschedule for next day
    scheduleAt(hour, minute, fn, label);
  }, msUntil);
};

/**
 * Reset ticker sweep at 4am
 * Clears the "evaluated today" status so count goes to 0/772
 */
const reset4amSweep = () => {
  console.log(`[${new Date().toISOString()}] 4AM RESET — Clearing lastFullScan to reset sweep counter`);

  // Clear the lastFullScan timestamp so UI shows 0/772
  tickerCache.lastFullScan = null;

  // Clear all lastEvaluated timestamps so evaluatedToday becomes 0
  for (const ticker of tickerCache.tickers) {
    // Keep the ticker data but mark as not evaluated today
    // The isTickerToday check will now return false for all
    // We don't clear lastEvaluated entirely, just let isTickerToday handle the day boundary
  }

  // Persist the reset state
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "tickers-cache.json"),
    JSON.stringify(tickerCache, null, 2)
  );

  console.log(`[${new Date().toISOString()}] 4AM RESET complete — sweep counter now 0/${TICKER_UNIVERSE.length}`);

  // Optionally start the full scan automatically at 4am
  // Uncomment if you want auto-scan at 4am:
  // runFullScan();
};

// Start server
const startServer = () => {
  loadCache();

  app.listen(PORT, () => {
    console.log(`Yahoo Finance Server running on http://localhost:${PORT}`);
    console.log(`Ticker universe: ${TICKER_UNIVERSE.length} real symbols`);
    console.log(`Endpoints:`);
    console.log(`  GET  /api/tickers - Get all tickers`);
    console.log(`  GET  /api/ticker/:symbol - Get single ticker`);
    console.log(`  POST /api/refresh - Force refresh (top ${CORE_TICKERS.length})`);
    console.log(`  POST /api/full-scan - Full scan all ${TICKER_UNIVERSE.length} tickers`);
    console.log(`  GET  /health - Health check`);
  });

  // Schedule 4am reset of ticker sweep counter
  scheduleAt(4, 0, reset4amSweep, "4AM ticker sweep reset");

  // Schedule 5:30am full ticker sweep
  scheduleAt(5, 30, () => {
    console.log(`[${new Date().toISOString()}] 5:30AM scheduled full sweep starting...`);
    runFullScan();
  }, "5:30AM full ticker sweep");

  // Check if full scan was done in current ticker day (4 AM to 4 AM)
  const lastScanToday = tickerCache.lastFullScan && isTickerToday(tickerCache.lastFullScan);

  if (lastScanToday) {
    console.log(`Full scan already done today (${tickerCache.lastFullScan}) — running core refresh only`);
    updateTickers();
  } else {
    console.log("Full scan NOT done today — starting full scan automatically");
    runFullScan();
  }

  // Schedule core ticker refresh every 3 minutes (top 150, fast)
  setInterval(updateTickers, REFRESH_INTERVAL);
};

startServer();
