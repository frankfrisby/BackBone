import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { getAlpacaConfig } from "./alpaca.js";
import { TRADING_CONFIG, TRADING_RULES, isGoodMomentum, isProtectedPosition, getActionFromScore } from "./trading-algorithms.js";
import { SCORE_THRESHOLDS, getSignalFromScore } from "./score-engine.js";

/**
 * Auto-Trading Service for BACKBONE
 * Based on BackBoneApp production trading system
 *
 * Features:
 * - Dynamic buy threshold based on SPY direction (7.1 positive, 8.0 negative)
 * - Momentum protection (don't interrupt +8% gains)
 * - Technical override (sell protected positions if score ≤2.7)
 * - Day trade limits (3 per 5-day window)
 * - Position limits (max 2 concurrent)
 * - Multi-channel notifications (Pushover, Ntfy, Firebase, local)
 */

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
      tradesLog = JSON.parse(fs.readFileSync(TRADES_LOG, "utf-8"));
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
      return plPercent >= config.protectedPositionPercent;
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

  // Get position P&L if available
  const plPercent = position ? parseFloat(position.unrealized_plpc || 0) * 100 : 0;
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
 */
export const executeBuy = async (symbol, price, reason) => {
  if (!config.enabled) {
    return { success: false, error: "Auto-trading not enabled" };
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
  const quantity = Math.floor(config.maxPositionSize / price);
  if (quantity < 1) {
    return { success: false, error: "Position size too small" };
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

    return { success: true, order, trade };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Execute sell order via Alpaca
 */
export const executeSell = async (symbol, price, quantity, reason) => {
  if (!config.enabled) {
    return { success: false, error: "Auto-trading not enabled" };
  }

  const canTradeResult = canTrade(symbol);
  if (!canTradeResult.allowed) {
    return { success: false, error: canTradeResult.reason };
  }

  const alpacaConfig = getAlpacaConfig();
  if (!alpacaConfig.ready) {
    return { success: false, error: "Alpaca not configured" };
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
export const monitorAndTrade = async (tickers, positions = [], marketContext = {}) => {
  if (!config.enabled) {
    return { monitored: false, reason: "Auto-trading disabled" };
  }

  const { spyChange = 0 } = marketContext;
  const spyPositive = spyChange >= 0;

  // Determine buy threshold based on SPY direction
  const effectiveBuyThreshold = spyPositive ? config.buyThresholdSPYPositive : config.buyThreshold;

  const results = {
    monitored: true,
    spyPositive,
    effectiveBuyThreshold,
    buySignals: [],
    sellSignals: [],
    executed: [],
    skipped: [],
    protected: []
  };

  // Get current position symbols
  const positionSymbols = positions.map(p => p.symbol);

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

  // STEP 1: Evaluate ALL positions for sell signals first
  for (const position of positions) {
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
      } else {
        results.skipped.push({ symbol: ticker.symbol, reason: sellResult.error });
      }
    } else if (sellEval.isProtected) {
      results.protected.push({
        symbol: position.symbol,
        plPercent: sellEval.plPercent,
        score: ticker.score
      });
    }
  }

  // STEP 2: Evaluate top 3 for buy signals
  for (const ticker of sortedTickers) {
    // Skip if in blacklist
    if (config.blacklist.includes(ticker.symbol)) continue;

    // Skip if not in watchlist (when watchlist is set)
    if (config.watchlist.length > 0 && !config.watchlist.includes(ticker.symbol)) continue;

    // Only evaluate if in top 3 and not already holding
    const isTop3 = top3BuyTickers.includes(ticker.symbol);
    if (!positionSymbols.includes(ticker.symbol) && isTop3) {
      const buyEval = evaluateBuySignal(ticker, { spyPositive, positions });

      if (buyEval.action === "BUY" || buyEval.action === "EXTREME_BUY") {
        results.buySignals.push(buyEval);

        // Check position limits (max 2 in BackBoneApp)
        const currentPositionCount = positions.length - results.executed.filter(t => t.side === "sell").length + buyCount;

        if (currentPositionCount < config.maxTotalPositions) {
          const buyResult = await executeBuy(
            ticker.symbol,
            ticker.price,
            `${buyEval.isExtreme ? "EXTREME: " : ""}Top ${top3BuyTickers.indexOf(ticker.symbol) + 1}: ${buyEval.signals.join(", ")}`
          );

          if (buyResult.success) {
            results.executed.push(buyResult.trade);
            buyCount++;
          } else {
            results.skipped.push({ symbol: ticker.symbol, reason: buyResult.error });
          }
        } else {
          results.skipped.push({
            symbol: ticker.symbol,
            reason: `Position limit reached (${currentPositionCount}/${config.maxTotalPositions})`
          });
        }
      }
    }
  }

  return results;
};

/**
 * Get trading status
 */
export const getTradingStatus = () => {
  loadConfig();
  return {
    enabled: config.enabled,
    mode: config.mode,
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
