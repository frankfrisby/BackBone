import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { getAlpacaConfig, fetchAccount } from "./alpaca.js";
import { TRADING_CONFIG, TRADING_RULES, isGoodMomentum, isProtectedPosition, getActionFromScore } from "./trading-algorithms.js";
import { SCORE_THRESHOLDS, getSignalFromScore } from "./score-engine.js";
import { showNotificationTitle } from "./terminal-resize.js";

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
 * Check SPY direction using multi-timeframe intraday analysis.
 * When SPY daily is green → always allow.
 * When SPY daily is red → check intraday timeframes for recovery.
 *
 * @param {number} dailyChangePercent - SPY daily change %
 * @returns {{ allow: boolean, reason: string, details: object }}
 */
const checkSpyDirection = async (dailyChangePercent) => {
  // If SPY daily is green, always allow
  if (dailyChangePercent >= 0) {
    return {
      allow: true,
      reason: `SPY +${dailyChangePercent.toFixed(2)}% (green)`,
      details: { daily: dailyChangePercent, method: "daily_green" }
    };
  }

  // SPY is red — check intraday timeframes
  const bars = await fetchSpyIntradayBars();
  if (!bars || bars.length < 5) {
    // Can't get intraday data — allow (fail open)
    return {
      allow: true,
      reason: `SPY ${dailyChangePercent.toFixed(2)}% (no intraday data, allowing)`,
      details: { daily: dailyChangePercent, method: "no_data_allow" }
    };
  }

  // Calculate minutes since market open (9:30 AM ET)
  const { hours, minutes } = getEasternTime();
  const minutesSinceOpen = (hours * 60 + minutes) - (9 * 60 + 30);

  if (minutesSinceOpen < 5) {
    // Too early to judge
    return {
      allow: true,
      reason: `SPY ${dailyChangePercent.toFixed(2)}% (too early, ${minutesSinceOpen}m since open)`,
      details: { daily: dailyChangePercent, method: "too_early" }
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

  if (weightedAvg >= -0.05) {
    allow = true;
    reason = `SPY ${dailyChangePercent.toFixed(2)}% daily but intraday flat/positive (wAvg ${weightedAvg >= 0 ? "+" : ""}${weightedAvg.toFixed(3)}%)`;
  } else if (isRecovering) {
    allow = true;
    reason = `SPY ${dailyChangePercent.toFixed(2)}% daily, recovering (range ${(rangePosition * 100).toFixed(0)}%, 5m +${fiveMinChange.toFixed(2)}%)`;
  } else {
    allow = false;
    reason = `SPY ${dailyChangePercent.toFixed(2)}% daily, intraday weak (wAvg ${weightedAvg.toFixed(3)}%, range ${(rangePosition * 100).toFixed(0)}%)`;
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

const DATA_DIR = path.join(process.cwd(), "data");
const TRADES_LOG = path.join(DATA_DIR, "trades-log.json");
const CONFIG_FILE = path.join(DATA_DIR, "trading-config.json");

// Trading thresholds (0-10 scale) - aligned with BackBoneApp
const DEFAULT_CONFIG = {
  enabled: true,                    // Auto-trading enabled by default
  mode: "paper",                    // paper or live
  buyThreshold: 8.0,                // Score >= this triggers buy evaluation (SPY negative)
  buyThresholdSPYPositive: 7.1,     // Lower threshold when SPY is positive
  sellThreshold: 4.0,               // Score <= this triggers sell evaluation
  extremeBuyThreshold: 9.0,         // Auto-execute buy immediately
  extremeSellThreshold: 1.5,        // Auto-execute sell immediately
  technicalOverrideThreshold: 2.7,  // Sell protected positions if technicals drop here
  goodMomentumPercent: 5.0,         // +5% or better = good momentum
  protectedPositionPercent: 8.0,    // +8% = protected from interruption
  requireBullishMACD: false,        // Don't require bullish MACD (rely on score)
  requireBearishMACD: false,        // Don't require bearish MACD (rely on score)
  requireHighVolume: false,         // Require above-average volume
  maxPositionSize: 1000,            // Max $ per position
  maxTotalPositions: 2,             // Max number of positions (BackBoneApp: 2)
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

// In-memory state
let config = { ...DEFAULT_CONFIG };
let tradesLog = [];
let lastTradeTime = {};
let dailyTradeCount = 0;
let lastTradeDate = null;

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

  // Check MACD if required
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
 * Execute buy order via Alpaca
 * Enforces market hours (9:30 AM - 4:00 PM ET)
 */
export const executeBuy = async (symbol, price, reason) => {
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

  // Calculate quantity based on max position size
  let quantity = Math.floor(config.maxPositionSize / price);
  if (quantity < 1) {
    return { success: false, error: "Position size too small" };
  }

  // Check buying power before placing order
  try {
    const account = await fetchAccount(alpacaConfig);
    const buyingPower = parseFloat(account.buying_power) || 0;
    const orderCost = quantity * price;

    if (buyingPower < price) {
      return { success: false, error: `Insufficient buying power ($${buyingPower.toFixed(2)} available, need $${price.toFixed(2)} minimum)` };
    }

    // Reduce quantity to fit buying power (leave $10 buffer)
    if (orderCost > buyingPower - 10) {
      quantity = Math.floor((buyingPower - 10) / price);
      if (quantity < 1) {
        return { success: false, error: `Insufficient buying power ($${buyingPower.toFixed(2)} available, order would cost $${orderCost.toFixed(2)})` };
      }
    }
  } catch (acctErr) {
    return { success: false, error: `Failed to check buying power: ${acctErr.message}` };
  }

  try {
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
        type: "market",
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
 * Execute sell order via Alpaca
 * Enforces market hours (9:30 AM - 4:00 PM ET)
 */
export const executeSell = async (symbol, price, quantity, reason) => {
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
        type: "market",
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
      side: "sell",
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

  // Get SPY data from tickers array
  const spyTicker = tickers.find(t => t.symbol === "SPY");
  const spyChange = spyTicker?.changePercent || 0;

  // Run multi-timeframe SPY direction check
  const spyCheck = await checkSpyDirection(spyChange);
  const spyPositive = spyCheck.allow;

  // Determine buy threshold based on SPY direction
  const effectiveBuyThreshold = spyPositive ? config.buyThresholdSPYPositive : config.buyThreshold;

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
    reasoning: []   // Human-readable explanation of every decision
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
  try {
    const md = await getMomentumDrift();
    const driftAnalysis = md.getPositionsWithMomentumDrift(positions, sortedTickers);

    for (const drift of driftAnalysis) {
      // Skip if already sold via trailing stop
      const alreadySold = results.executed.some(t => t.side === "sell" && t.symbol === drift.symbol);
      if (alreadySold) continue;

      const position = positions.find(p => p.symbol === drift.symbol);
      if (!position) continue;

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

  // STEP 0.6: Check for stagnant tickers (<0.25% range over 60min, near-zero change)
  // These are positions that aren't moving and tying up capital
  try {
    const md = await getMomentumDrift();

    for (const position of positions) {
      // Skip if already sold
      const alreadySold = results.executed.some(t => t.side === "sell" && t.symbol === position.symbol);
      if (alreadySold) continue;

      const ticker = sortedTickers.find(t => t.symbol === position.symbol);
      if (!ticker) continue;

      // Check if stagnant AND score is not strong (< 7.0)
      // Don't sell stagnant tickers with high scores - they might be consolidating before a move
      if (md.isStagnantTicker(ticker) && ticker.score < 7.0) {
        results.sellSignals.push({
          action: "STAGNANT",
          symbol: position.symbol,
          score: ticker.score,
          signals: ["STAGNANT: <0.25% range over 60min, capital locked"],
          isStagnant: true
        });

        const sellResult = await executeSell(
          position.symbol,
          ticker.price || position.current_price || position.currentPrice,
          parseFloat(position.qty || position.shares),
          `STAGNANT: <0.25% movement, score ${ticker.score?.toFixed(1)} - freeing capital`
        );

        if (sellResult.success) {
          results.executed.push(sellResult.trade);
          results.reasoning.push(`EXECUTED SELL ${position.symbol}: stagnant (<0.25% range), score ${ticker.score?.toFixed(1)}`);
        } else {
          results.skipped.push({ symbol: position.symbol, reason: sellResult.error });
          results.reasoning.push(`FAILED SELL ${position.symbol} (stagnant): ${sellResult.error}`);
        }
      }
    }
  } catch (error) {
    console.error("Stagnant ticker check error:", error.message);
  }

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

  // STEP 2: Evaluate top 3 for buy signals (only if SPY allows)
  if (spyCheck.allow) {
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
            `${buyEval.isExtreme ? "EXTREME: " : ""}Top ${top3BuyTickers.indexOf(ticker.symbol) + 1}: ${buyEval.signals.join(", ")}`
          );

          if (buyResult.success) {
            results.executed.push(buyResult.trade);
            results.reasoning.push(`EXECUTED BUY ${ticker.symbol}: ${buyEval.signals.join(", ")}`);
            buyCount++;
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
    // SPY blocked — skip all buys
    results.reasoning.push(`SPY BLOCK: ${spyCheck.reason} — all buys skipped`);
    if (top3BuyTickers.length > 0) {
      results.reasoning.push(`Blocked candidates: ${top3BuyTickers.join(", ")}`);
    }
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

  return results;
};

/**
 * Get trading status including market hours
 */
export const getTradingStatus = () => {
  loadConfig();
  const marketStatus = isMarketOpen();
  const nextEval = getNextEvaluationTime();

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

// Initialize on load
loadConfig();
loadTradesLog();
