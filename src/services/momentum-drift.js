/**
 * Momentum Drift Service
 *
 * Evaluates positions for momentum drift (declining momentum) that warrants selling.
 * Based on BackBoneApp ticker rotation logic:
 * - Average of yesterday, 4h, 1h, 30m change < -0.75% = negative momentum drift
 * - Positions with momentum drift should be considered for sale
 *
 * Buy Rank Logic:
 * - Rank 1: First qualified ticker to buy
 * - Rank 2: Second qualified ticker
 * - Rank 3: Third qualified ticker
 * - Unowned tickers with extreme buy (score >= 9.0) take priority over owned
 */

import fs from "fs";
import path from "path";

import { getDataDir } from "./paths.js";
const DATA_DIR = getDataDir();
const MOMENTUM_FILE = path.join(DATA_DIR, "momentum-history.json");

// Configuration
const MOMENTUM_CONFIG = {
  driftThreshold: -0.75,  // Average change < -0.75% = momentum drift
  extremeBuyThreshold: 9.0,
  buyThreshold: 8.0,
  sellThreshold: 4.0,
  maxBuyRank: 3  // Only consider top 3 tickers for buying
};

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load momentum history
 */
export const loadMomentumHistory = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(MOMENTUM_FILE)) {
      return JSON.parse(fs.readFileSync(MOMENTUM_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load momentum history:", error.message);
  }
  return {};
};

/**
 * Save momentum history
 */
export const saveMomentumHistory = (history) => {
  try {
    ensureDataDir();
    fs.writeFileSync(MOMENTUM_FILE, JSON.stringify(history, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save momentum history:", error.message);
    return false;
  }
};

/**
 * Record current momentum data point
 * Called periodically to build momentum history
 *
 * @param {Array} tickers - Array of ticker objects with changePercent
 */
export const recordMomentumSnapshot = (tickers = []) => {
  const history = loadMomentumHistory();
  const timestamp = new Date().toISOString();
  const hour = new Date().getHours();

  for (const ticker of tickers) {
    if (!ticker || !ticker.symbol) continue;

    if (!history[ticker.symbol]) {
      history[ticker.symbol] = {
        snapshots: [],
        dailyChanges: []
      };
    }

    // Add snapshot (keep last 48 hourly snapshots = 2 days)
    history[ticker.symbol].snapshots.push({
      timestamp,
      hour,
      price: ticker.price || ticker.lastPrice,
      changePercent: ticker.changePercent || ticker.change || 0
    });

    // Keep only last 48 snapshots
    if (history[ticker.symbol].snapshots.length > 48) {
      history[ticker.symbol].snapshots = history[ticker.symbol].snapshots.slice(-48);
    }

    // Record daily close (at market close ~4 PM ET)
    if (hour >= 16 && hour < 17) {
      const today = new Date().toISOString().split('T')[0];
      const existingToday = history[ticker.symbol].dailyChanges.find(d => d.date === today);

      if (!existingToday) {
        history[ticker.symbol].dailyChanges.push({
          date: today,
          closePrice: ticker.price || ticker.lastPrice,
          changePercent: ticker.changePercent || ticker.change || 0
        });

        // Keep only last 30 days
        if (history[ticker.symbol].dailyChanges.length > 30) {
          history[ticker.symbol].dailyChanges = history[ticker.symbol].dailyChanges.slice(-30);
        }
      }
    }
  }

  saveMomentumHistory(history);
  return history;
};

/**
 * Calculate momentum drift for a ticker
 * Uses available data: current change, and historical snapshots if available
 *
 * Ideal calculation (when all data available):
 * - yesterday: Previous day's change
 * - 4h: Change over last 4 hours
 * - 1h: Change over last hour
 * - 30m: Change over last 30 minutes (use current change as proxy)
 *
 * Average of all available timeframes < -0.75% = momentum drift
 *
 * @param {Object} ticker - Ticker with current data
 * @param {Object} history - Historical momentum data
 * @returns {Object} Momentum drift analysis
 */
export const calculateMomentumDrift = (ticker, history = null) => {
  const symbol = ticker.symbol;
  const currentChange = ticker.changePercent || ticker.change || 0;

  // Get historical data if available
  const tickerHistory = history?.[symbol] || loadMomentumHistory()[symbol];

  const changes = {
    current: currentChange,
    yesterday: null,
    hour4: null,
    hour1: null,
    min30: currentChange  // Use current change as 30m proxy
  };

  if (tickerHistory) {
    // Get yesterday's change
    if (tickerHistory.dailyChanges && tickerHistory.dailyChanges.length >= 2) {
      changes.yesterday = tickerHistory.dailyChanges[tickerHistory.dailyChanges.length - 2].changePercent;
    }

    // Get hourly changes from snapshots
    const now = Date.now();
    const snapshots = tickerHistory.snapshots || [];

    // Find 4-hour ago snapshot
    const fourHoursAgo = now - (4 * 60 * 60 * 1000);
    const snapshot4h = snapshots.find(s => new Date(s.timestamp).getTime() <= fourHoursAgo);
    if (snapshot4h && ticker.price) {
      changes.hour4 = ((ticker.price - snapshot4h.price) / snapshot4h.price) * 100;
    }

    // Find 1-hour ago snapshot
    const oneHourAgo = now - (60 * 60 * 1000);
    const snapshot1h = snapshots.find(s => new Date(s.timestamp).getTime() <= oneHourAgo);
    if (snapshot1h && ticker.price) {
      changes.hour1 = ((ticker.price - snapshot1h.price) / snapshot1h.price) * 100;
    }
  }

  // Calculate average of available changes
  const availableChanges = Object.values(changes).filter(c => c !== null);
  const avgChange = availableChanges.length > 0
    ? availableChanges.reduce((sum, c) => sum + c, 0) / availableChanges.length
    : currentChange;

  const hasDrift = avgChange < MOMENTUM_CONFIG.driftThreshold;

  return {
    symbol,
    currentChange,
    changes,
    avgChange: +avgChange.toFixed(2),
    driftThreshold: MOMENTUM_CONFIG.driftThreshold,
    hasMomentumDrift: hasDrift,
    dataPoints: availableChanges.length,
    recommendation: hasDrift ? "SELL" : "HOLD"
  };
};

/**
 * Get buy rank for a ticker
 * Ranks qualified tickers 1-3 based on score
 *
 * @param {Object} ticker - Ticker with score
 * @param {Array} allTickers - All tickers sorted by score descending
 * @param {number} buyThreshold - Minimum score for buy consideration
 * @returns {number|null} Buy rank (1-3) or null if not qualified
 */
export const getBuyRank = (ticker, allTickers, buyThreshold = MOMENTUM_CONFIG.buyThreshold) => {
  const qualified = allTickers
    .filter(t => t && t.score >= buyThreshold)
    .slice(0, 3)
    .map(t => t.symbol);

  const rank = qualified.indexOf(ticker.symbol);
  return rank >= 0 ? rank + 1 : null;
};

/**
 * Evaluate ticker rotation - should we sell owned positions to buy better ones?
 *
 * Logic:
 * 1. Check if owned positions have momentum drift
 * 2. Check if there are unowned tickers with better scores
 * 3. Prioritize extreme buy (9.0+) unowned over owned with drift
 *
 * @param {Array} positions - Current positions
 * @param {Array} tickers - All tickers with scores
 * @returns {Object} Rotation recommendations
 */
export const evaluateTickerRotation = (positions = [], tickers = []) => {
  const history = loadMomentumHistory();

  // Sort tickers by score
  const sortedTickers = [...tickers]
    .filter(t => t && typeof t.score === "number")
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  const positionSymbols = new Set(positions.map(p => p.symbol));

  const result = {
    sellRecommendations: [],
    buyRecommendations: [],
    rotationNeeded: false,
    analysis: []
  };

  // Analyze each position for momentum drift
  for (const position of positions) {
    const ticker = sortedTickers.find(t => t.symbol === position.symbol);
    if (!ticker) continue;

    const driftAnalysis = calculateMomentumDrift(ticker, history);
    const buyRank = getBuyRank(ticker, sortedTickers);

    const analysis = {
      symbol: position.symbol,
      score: ticker.score,
      buyRank,
      ...driftAnalysis
    };

    result.analysis.push(analysis);

    // Recommend sell if:
    // 1. Has momentum drift AND score < 6.5 (not a strong hold)
    // 2. OR score dropped below sell threshold
    if ((driftAnalysis.hasMomentumDrift && ticker.score < 6.5) ||
        ticker.score <= MOMENTUM_CONFIG.sellThreshold) {
      result.sellRecommendations.push({
        symbol: position.symbol,
        reason: driftAnalysis.hasMomentumDrift
          ? `Momentum drift: avg ${driftAnalysis.avgChange}% < ${MOMENTUM_CONFIG.driftThreshold}%`
          : `Score dropped to ${ticker.score}`,
        score: ticker.score,
        avgChange: driftAnalysis.avgChange
      });
    }
  }

  // Find better unowned tickers
  const unownedTopTickers = sortedTickers
    .filter(t => !positionSymbols.has(t.symbol))
    .slice(0, 5);

  for (const ticker of unownedTopTickers) {
    const buyRank = getBuyRank(ticker, sortedTickers);

    if (buyRank && buyRank <= 3) {
      // Check if this is extreme buy and should take priority
      const isExtremeBuy = ticker.score >= MOMENTUM_CONFIG.extremeBuyThreshold;

      result.buyRecommendations.push({
        symbol: ticker.symbol,
        score: ticker.score,
        buyRank,
        isExtremeBuy,
        priority: isExtremeBuy ? "HIGH" : "NORMAL"
      });
    }
  }

  // Rotation is needed if we have sell recommendations and better buy opportunities
  result.rotationNeeded = result.sellRecommendations.length > 0 &&
                          result.buyRecommendations.length > 0;

  return result;
};

/**
 * Get positions that should be sold due to momentum drift
 *
 * @param {Array} positions - Current positions
 * @param {Array} tickers - All tickers with scores
 * @returns {Array} Positions to sell
 */
export const getPositionsWithMomentumDrift = (positions = [], tickers = []) => {
  const rotation = evaluateTickerRotation(positions, tickers);
  return rotation.sellRecommendations;
};

/**
 * Check if ticker is stagnant (not moving)
 * A stagnant ticker has < 0.25% range AND near-zero change over 60 minutes
 *
 * @param {Object} ticker - Ticker with price data
 * @param {Object} history - Historical data
 * @returns {boolean} True if stagnant
 */
export const isStagnantTicker = (ticker, history = null) => {
  const symbol = ticker.symbol;
  const currentChange = Math.abs(ticker.changePercent || ticker.change || 0);

  // If current change is significant, not stagnant
  if (currentChange >= 0.25) return false;

  // Check historical movement
  const tickerHistory = history?.[symbol] || loadMomentumHistory()[symbol];

  if (tickerHistory && tickerHistory.snapshots && tickerHistory.snapshots.length >= 2) {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Get snapshots from last hour
    const recentSnapshots = tickerHistory.snapshots.filter(
      s => new Date(s.timestamp).getTime() >= oneHourAgo
    );

    if (recentSnapshots.length >= 2) {
      const prices = recentSnapshots.map(s => s.price).filter(p => p);
      if (prices.length >= 2) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const rangePercent = ((maxPrice - minPrice) / minPrice) * 100;

        // Stagnant if range < 0.25%
        return rangePercent < 0.25;
      }
    }
  }

  // Default: stagnant if current change is very small
  return currentChange < 0.1;
};

export default {
  recordMomentumSnapshot,
  calculateMomentumDrift,
  getBuyRank,
  evaluateTickerRotation,
  getPositionsWithMomentumDrift,
  isStagnantTicker,
  loadMomentumHistory,
  saveMomentumHistory,
  MOMENTUM_CONFIG
};
