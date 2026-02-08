/**
 * Trailing Stop Manager
 *
 * Implements trailing stop loss using REAL Alpaca trailing_stop orders.
 * Alpaca tracks the high watermark server-side — no local polling needed.
 *
 * Formula (matches reference BackBoneApp):
 *   gainThreshold = floor(gain / 2) * 2    // discrete 2% steps on raw gain
 *   stopPercent   = gainThreshold * 0.5     // 50% of the threshold
 *   minimum 1% for winners, 2% base stop for losers
 *
 * Schedule:
 *   - Immediately after every buy → apply trailing stop
 *   - On app startup → apply stops to all unprotected positions
 *   - Hourly during market hours → re-evaluate all positions
 */

import { getAlpacaConfig, fetchPositions, getOrders, cancelOrder, submitOrder } from "./alpaca.js";
import { isMarketOpen } from "./auto-trader.js";

/**
 * Calculate stop loss percentage using reference algorithm:
 *   1. Discretize raw gain to 2% steps: floor(gain / 2) * 2
 *   2. Take 50% of that threshold
 *   3. Minimum 1% for winners, 2% base stop for losers
 *
 * Examples (gain → threshold → stop):
 *   -5%  → 0  → 2% (base stop for losers)
 *    0%  → 0  → 2% (base stop)
 *    1%  → 0  → 2% (base stop, gain < threshold step)
 *    2%  → 2  → 1%
 *    3%  → 2  → 1%
 *    4%  → 4  → 2%
 *    5%  → 4  → 2%
 *    8%  → 8  → 4%
 *   12%  → 12 → 6%
 *   20%  → 20 → 10%
 *
 * @param {number} gainPercent - Current unrealized gain percentage
 * @returns {number} Trailing stop percentage (always >= 1 for winners, 2 for losers)
 */
export const calculateStopLossPercent = (gainPercent) => {
  // Base 2% stop for losing or flat positions
  if (gainPercent <= 0) {
    return 2;
  }

  // Discretize raw gain to 2% steps, then take 50%
  const gainThreshold = Math.floor(gainPercent / 2) * 2;
  const stopPercent = gainThreshold * 0.5;

  // Minimum 1% for any winning position
  return Math.max(1, stopPercent);
};

/**
 * Get Eastern time info for scheduling
 */
const getEasternTimeInfo = () => {
  const now = new Date();
  const options = {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  };
  const etString = now.toLocaleString("en-US", options);
  const [time] = etString.split(", ");
  const [hours, minutes] = time.split(":").map(Number);

  return { hours, minutes, date: now };
};

/**
 * Check if it's time to update trailing stops (top of each hour during market hours)
 */
export const shouldUpdateStops = () => {
  const { minutes } = getEasternTimeInfo();
  const marketStatus = isMarketOpen();

  if (!marketStatus.open) {
    return false;
  }

  // Update at top of each hour during market hours
  if (minutes < 5) {
    return true;
  }

  return false;
};

/**
 * Apply a trailing stop to a single position via real Alpaca order.
 *
 * - Calculates the correct trail percent from gain
 * - Checks existing open trailing_stop orders for this symbol
 * - If existing order matches → keeps it (no-op)
 * - If existing order differs → cancels it, creates new one
 * - If no existing order → creates one
 *
 * @param {string} symbol - Ticker symbol
 * @param {number} qty - Share quantity
 * @param {number} entryPrice - Average entry price
 * @param {number} currentPrice - Current market price
 * @param {Array} [existingOrders] - Pre-fetched open orders (avoids extra API call)
 * @returns {Object} Result: { action, symbol, trailPercent, orderId?, error? }
 */
export const applyStopToPosition = async (symbol, qty, entryPrice, currentPrice, existingOrders = null) => {
  const config = getAlpacaConfig();
  if (!config.ready) {
    return { action: "skip", symbol, error: "Alpaca not configured" };
  }

  if (!qty || qty <= 0 || !entryPrice || entryPrice <= 0) {
    return { action: "skip", symbol, error: "Invalid qty or entryPrice" };
  }

  // Calculate gain and needed trail percent
  const gainPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const neededTrailPercent = calculateStopLossPercent(gainPercent);

  // Get existing trailing stop orders for this symbol
  let orders = existingOrders;
  if (!orders) {
    try {
      orders = await getOrders(config, "open");
    } catch (err) {
      return { action: "error", symbol, error: `Failed to fetch orders: ${err.message}` };
    }
  }

  const existingStop = orders.find(
    (o) => o.symbol === symbol && o.type === "trailing_stop" && o.side === "sell"
  );

  if (existingStop) {
    const existingPercent = parseFloat(existingStop.trail_percent);

    // If existing order matches needed percent → keep it
    if (Math.abs(existingPercent - neededTrailPercent) < 0.01) {
      return {
        action: "keep",
        symbol,
        trailPercent: neededTrailPercent,
        orderId: existingStop.id,
        gainPercent: +gainPercent.toFixed(2),
      };
    }

    // Different percent → cancel old, create new
    try {
      await cancelOrder(config, existingStop.id);
    } catch (err) {
      return { action: "error", symbol, error: `Failed to cancel old stop: ${err.message}` };
    }
  }

  // Submit new trailing stop order
  try {
    const order = await submitOrder(config, {
      symbol,
      qty: Math.abs(qty),
      side: "sell",
      type: "trailing_stop",
      trail_percent: neededTrailPercent,
      time_in_force: "gtc",
    });

    return {
      action: existingStop ? "replaced" : "created",
      symbol,
      trailPercent: neededTrailPercent,
      orderId: order.id,
      gainPercent: +gainPercent.toFixed(2),
    };
  } catch (err) {
    return { action: "error", symbol, error: `Failed to submit stop order: ${err.message}` };
  }
};

/**
 * Apply trailing stops to ALL positions.
 * Fetches positions and open orders from Alpaca, then ensures each position
 * has a correctly-sized trailing stop order.
 *
 * Called: on startup, hourly, and at 9 AM ET.
 *
 * @returns {Object} Summary: { results[], created, replaced, kept, errors }
 */
export const applyStopsToAllPositions = async () => {
  const config = getAlpacaConfig();
  if (!config.ready) {
    return { results: [], error: "Alpaca not configured" };
  }

  let positions, openOrders;
  try {
    [positions, openOrders] = await Promise.all([
      fetchPositions(config),
      getOrders(config, "open"),
    ]);
  } catch (err) {
    return { results: [], error: `Failed to fetch data: ${err.message}` };
  }

  if (!positions || positions.length === 0) {
    return { results: [], message: "No positions" };
  }

  const results = [];
  let created = 0, replaced = 0, kept = 0, errors = 0;

  for (const pos of positions) {
    const symbol = pos.symbol;
    const qty = parseFloat(pos.qty || 0);
    const entryPrice = parseFloat(pos.avg_entry_price || 0);
    const currentPrice = parseFloat(pos.current_price || 0);

    if (!qty || !entryPrice || !currentPrice) {
      results.push({ action: "skip", symbol, error: "Missing price data" });
      continue;
    }

    const result = await applyStopToPosition(symbol, qty, entryPrice, currentPrice, openOrders);
    results.push(result);

    if (result.action === "created") created++;
    else if (result.action === "replaced") replaced++;
    else if (result.action === "keep") kept++;
    else if (result.action === "error") errors++;
  }

  return {
    results,
    summary: { total: positions.length, created, replaced, kept, errors },
    timestamp: new Date().toISOString(),
  };
};

/**
 * Get trailing stop status for display.
 * Reads from Alpaca open orders (source of truth) instead of local JSON.
 */
export const getTrailingStopStatus = async () => {
  const config = getAlpacaConfig();
  const { hours, minutes } = getEasternTimeInfo();
  const marketStatus = isMarketOpen();

  let stops = {};
  if (config.ready) {
    try {
      const orders = await getOrders(config, "open");
      for (const o of orders) {
        if (o.type === "trailing_stop" && o.side === "sell") {
          stops[o.symbol] = {
            orderId: o.id,
            trailPercent: parseFloat(o.trail_percent),
            qty: parseFloat(o.qty),
            status: o.status,
            createdAt: o.created_at,
          };
        }
      }
    } catch {
      // If we can't reach Alpaca, return empty
    }
  }

  let nextUpdate;
  if (!marketStatus.open) {
    nextUpdate = "Market closed";
  } else if (minutes >= 55) {
    nextUpdate = `${(hours + 1) % 24}:00 ET`;
  } else {
    nextUpdate = `${hours}:00 ET (${60 - minutes}m)`;
  }

  return {
    activeStops: Object.keys(stops).length,
    stops,
    nextUpdate,
    marketOpen: marketStatus.open,
  };
};

export default {
  calculateStopLossPercent,
  shouldUpdateStops,
  applyStopToPosition,
  applyStopsToAllPositions,
  getTrailingStopStatus,
};
