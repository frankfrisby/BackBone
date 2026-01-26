/**
 * Trailing Stop Manager
 *
 * Implements trailing stop loss logic from BackBoneApp:
 * - Stop Loss = 50% of unrealized gain
 * - Uses discrete 2% thresholds (2%, 4%, 6%, 8%...)
 * - Minimum stop of 1%
 * - Updates at 9 AM daily + hourly during market hours
 * - Auto-applies to all positions
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getAlpacaConfig } from "./alpaca.js";
import { isMarketOpen } from "./auto-trader.js";

const DATA_DIR = path.join(process.cwd(), "data");
const STOPS_FILE = path.join(DATA_DIR, "trailing-stops.json");

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load saved trailing stops
 */
export const loadTrailingStops = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(STOPS_FILE)) {
      return JSON.parse(fs.readFileSync(STOPS_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load trailing stops:", error.message);
  }
  return {};
};

/**
 * Save trailing stops to disk
 */
export const saveTrailingStops = (stops) => {
  try {
    ensureDataDir();
    fs.writeFileSync(STOPS_FILE, JSON.stringify(stops, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save trailing stops:", error.message);
    return false;
  }
};

/**
 * Calculate stop loss percentage using 50% of gain with discrete 2% thresholds
 *
 * Formula:
 * - stopLossPercent = floor(gainPercent / 2 / 2) * 2
 * - This gives discrete steps: 0%, 2%, 4%, 6%, 8%, etc.
 * - Minimum stop is 1%
 *
 * Examples:
 * - 3% gain -> 50% = 1.5% -> floor(1.5/2)*2 = 0% -> use min 1%
 * - 5% gain -> 50% = 2.5% -> floor(2.5/2)*2 = 2%
 * - 8% gain -> 50% = 4% -> floor(4/2)*2 = 4%
 * - 12% gain -> 50% = 6% -> floor(6/2)*2 = 6%
 * - 20% gain -> 50% = 10% -> floor(10/2)*2 = 10%
 *
 * @param {number} gainPercent - Current unrealized gain percentage
 * @returns {number} Stop loss percentage (positive number)
 */
export const calculateStopLossPercent = (gainPercent) => {
  // Only apply trailing stop if we have a gain
  if (gainPercent <= 0) {
    return 0; // No trailing stop for losing positions
  }

  // 50% of gain
  const halfGain = gainPercent / 2;

  // Discrete 2% thresholds: floor to nearest 2%
  const discreteStop = Math.floor(halfGain / 2) * 2;

  // Minimum stop of 1%
  return Math.max(1, discreteStop);
};

/**
 * Calculate stop loss price from entry price and stop percentage
 *
 * @param {number} entryPrice - Position entry/average cost
 * @param {number} stopLossPercent - Stop loss percentage (e.g., 4 for 4%)
 * @returns {number} Stop loss price
 */
export const calculateStopPrice = (entryPrice, stopLossPercent) => {
  if (!entryPrice || stopLossPercent <= 0) return 0;

  // Stop price = entry * (1 - stopPercent/100)
  // But since we're locking in gains, stop should be ABOVE entry
  // Stop price = entry * (1 + lockInGain/100)
  // Where lockInGain = gainPercent - stopLossPercent

  // Actually for trailing stop: stop price = currentPrice * (1 - trailingPercent/100)
  // But we want to lock in gains, so:
  // Stop price = entryPrice * (1 + (gainPercent - stopLossPercent) / 100)

  // Simplified: if we have 10% gain and 4% stop, we lock in 6% gain
  // Stop price = entry * 1.06

  // For now, return the stop as a percentage above entry that gets locked in
  // The actual stop execution would use: entryPrice * (1 + stopLossPercent/100)
  return entryPrice * (1 + stopLossPercent / 100);
};

/**
 * Get Eastern time info for scheduling
 */
const getEasternTimeInfo = () => {
  const now = new Date();
  const options = {
    timeZone: "America/New_York",
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  };
  const etString = now.toLocaleString('en-US', options);
  const [time] = etString.split(', ');
  const [hours, minutes] = time.split(':').map(Number);

  return { hours, minutes, date: now };
};

/**
 * Check if it's time to update trailing stops (9 AM or top of each hour)
 *
 * @returns {boolean} True if stops should be updated
 */
export const shouldUpdateStops = () => {
  const { hours, minutes } = getEasternTimeInfo();
  const marketStatus = isMarketOpen();

  // Not during market hours means no updates
  if (!marketStatus.open) {
    return false;
  }

  // Update at 9 AM ET (pre-market prep)
  if (hours === 9 && minutes < 5) {
    return true;
  }

  // Update at top of each hour during market hours
  if (minutes < 5) {
    return true;
  }

  return false;
};

/**
 * Calculate trailing stop for a position
 *
 * @param {Object} position - Position from Alpaca
 * @returns {Object} Trailing stop info
 */
export const calculateTrailingStop = (position) => {
  const symbol = position.symbol;
  const entryPrice = parseFloat(position.avg_entry_price || position.avgEntryPrice || 0);
  const currentPrice = parseFloat(position.current_price || position.currentPrice || position.lastPrice || 0);
  const qty = parseFloat(position.qty || position.shares || 0);

  if (!entryPrice || !currentPrice || !qty) {
    return {
      symbol,
      hasStop: false,
      reason: "Missing price data"
    };
  }

  // Calculate gain percentage
  const gainPercent = ((currentPrice - entryPrice) / entryPrice) * 100;

  // Calculate stop loss percentage
  const stopLossPercent = calculateStopLossPercent(gainPercent);

  // No trailing stop for positions at a loss or minimal gain
  if (stopLossPercent === 0 || gainPercent < 2) {
    return {
      symbol,
      entryPrice,
      currentPrice,
      gainPercent,
      hasStop: false,
      reason: gainPercent <= 0 ? "Position at loss" : "Gain too small for trailing stop"
    };
  }

  // Calculate stop price (price at which we'd sell)
  // Lock in: gainPercent - stopLossPercent above entry
  const lockedInGain = gainPercent - stopLossPercent;
  const stopPrice = entryPrice * (1 + lockedInGain / 100);

  // Calculate how much we're protecting
  const protectedGainPercent = lockedInGain;
  const potentialLossFromCurrent = ((stopPrice - currentPrice) / currentPrice) * 100;

  return {
    symbol,
    entryPrice,
    currentPrice,
    qty,
    gainPercent: +gainPercent.toFixed(2),
    stopLossPercent,
    stopPrice: +stopPrice.toFixed(2),
    protectedGainPercent: +protectedGainPercent.toFixed(2),
    potentialLossFromCurrent: +potentialLossFromCurrent.toFixed(2),
    hasStop: true,
    formula: `50% of ${gainPercent.toFixed(1)}% = ${(gainPercent/2).toFixed(1)}% -> discrete 2% = ${stopLossPercent}%`
  };
};

/**
 * Update all trailing stops for current positions
 *
 * @param {Array} positions - Array of positions from Alpaca
 * @returns {Object} Updated stops info
 */
export const updateAllTrailingStops = (positions = []) => {
  const existingStops = loadTrailingStops();
  const updatedStops = {};
  const results = {
    updated: [],
    removed: [],
    noChange: [],
    errors: []
  };

  // Calculate stops for each position
  for (const position of positions) {
    try {
      const stopInfo = calculateTrailingStop(position);

      if (stopInfo.hasStop) {
        const previousStop = existingStops[stopInfo.symbol];

        // Only update if new stop is higher (more protective)
        if (!previousStop || stopInfo.stopPrice > previousStop.stopPrice) {
          updatedStops[stopInfo.symbol] = {
            ...stopInfo,
            updatedAt: new Date().toISOString(),
            previousStopPrice: previousStop?.stopPrice || null
          };
          results.updated.push({
            symbol: stopInfo.symbol,
            newStop: stopInfo.stopPrice,
            previousStop: previousStop?.stopPrice || null,
            gain: stopInfo.gainPercent
          });
        } else {
          // Keep existing higher stop
          updatedStops[stopInfo.symbol] = previousStop;
          results.noChange.push(stopInfo.symbol);
        }
      }
    } catch (error) {
      results.errors.push({
        symbol: position.symbol,
        error: error.message
      });
    }
  }

  // Find removed positions (sold)
  const currentSymbols = new Set(positions.map(p => p.symbol));
  for (const symbol of Object.keys(existingStops)) {
    if (!currentSymbols.has(symbol)) {
      results.removed.push(symbol);
    }
  }

  // Save updated stops
  saveTrailingStops(updatedStops);

  return {
    stops: updatedStops,
    results,
    timestamp: new Date().toISOString()
  };
};

/**
 * Check if any positions have hit their trailing stop
 *
 * @param {Array} positions - Current positions
 * @returns {Array} Positions that should be sold
 */
export const checkStopTriggers = (positions = []) => {
  const stops = loadTrailingStops();
  const triggered = [];

  for (const position of positions) {
    const symbol = position.symbol;
    const stopInfo = stops[symbol];

    if (!stopInfo || !stopInfo.hasStop) continue;

    const currentPrice = parseFloat(
      position.current_price || position.currentPrice || position.lastPrice || 0
    );

    if (currentPrice && currentPrice <= stopInfo.stopPrice) {
      triggered.push({
        symbol,
        currentPrice,
        stopPrice: stopInfo.stopPrice,
        entryPrice: stopInfo.entryPrice,
        qty: parseFloat(position.qty || position.shares || 0),
        reason: `Price $${currentPrice.toFixed(2)} hit stop at $${stopInfo.stopPrice.toFixed(2)}`,
        protectedGain: stopInfo.protectedGainPercent
      });
    }
  }

  return triggered;
};

/**
 * Get trailing stop status for display
 */
export const getTrailingStopStatus = () => {
  const stops = loadTrailingStops();
  const { hours, minutes } = getEasternTimeInfo();
  const marketStatus = isMarketOpen();

  // Calculate next update time
  let nextUpdate;
  if (!marketStatus.open) {
    nextUpdate = "Market closed";
  } else if (minutes >= 55) {
    nextUpdate = `${(hours + 1) % 24}:00 ET`;
  } else {
    const nextHour = hours;
    nextUpdate = `${nextHour}:00 ET (${60 - minutes}m)`;
  }

  return {
    activeStops: Object.keys(stops).length,
    stops,
    nextUpdate,
    marketOpen: marketStatus.open
  };
};

/**
 * Submit trailing stop order to Alpaca
 * Note: Alpaca supports native trailing stop orders
 *
 * @param {string} symbol - Stock symbol
 * @param {number} qty - Quantity to sell
 * @param {number} trailPercent - Trailing percentage
 */
export const submitTrailingStopOrder = async (symbol, qty, trailPercent) => {
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
        qty: qty.toString(),
        side: "sell",
        type: "trailing_stop",
        trail_percent: trailPercent.toString(),
        time_in_force: "gtc" // Good till cancelled
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const order = await response.json();
    return { success: true, order };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Apply trailing stops to all positions
 * This submits actual trailing stop orders to Alpaca
 *
 * @param {Array} positions - Current positions
 * @returns {Object} Results of applying stops
 */
export const applyTrailingStops = async (positions = []) => {
  const results = {
    applied: [],
    skipped: [],
    errors: []
  };

  for (const position of positions) {
    const stopInfo = calculateTrailingStop(position);

    if (!stopInfo.hasStop) {
      results.skipped.push({
        symbol: position.symbol,
        reason: stopInfo.reason
      });
      continue;
    }

    // For Alpaca trailing stop orders, we use the stopLossPercent directly
    // Alpaca will track from the high water mark
    const orderResult = await submitTrailingStopOrder(
      stopInfo.symbol,
      stopInfo.qty,
      stopInfo.stopLossPercent
    );

    if (orderResult.success) {
      results.applied.push({
        symbol: stopInfo.symbol,
        trailPercent: stopInfo.stopLossPercent,
        orderId: orderResult.order.id
      });
    } else {
      results.errors.push({
        symbol: stopInfo.symbol,
        error: orderResult.error
      });
    }
  }

  return results;
};

export default {
  calculateStopLossPercent,
  calculateStopPrice,
  calculateTrailingStop,
  updateAllTrailingStops,
  checkStopTriggers,
  getTrailingStopStatus,
  submitTrailingStopOrder,
  applyTrailingStops,
  shouldUpdateStops,
  loadTrailingStops,
  saveTrailingStops
};
