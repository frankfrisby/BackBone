/**
 * Tool: Portfolio Summary
 *
 * Get current portfolio status including positions, P&L, and signals.
 */

import fs from "fs";
import path from "path";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "portfolio-summary",
  name: "Portfolio Summary",
  description: "Get current portfolio status",
  category: "trading"
};

/**
 * Execute the tool
 * @returns {Promise<Object>} Result
 */
export async function execute() {
  try {
    // Load from alpaca cache
    const cachePath = dataFile("alpaca-cache.json");

    if (!fs.existsSync(cachePath)) {
      return { success: false, error: "No portfolio data available — run the engine first" };
    }

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const account = cache.account || {};
    const positions = cache.positions || [];

    const equity = parseFloat(account.equity) || 0;
    const lastEquity = parseFloat(account.last_equity) || equity;
    const buyingPower = parseFloat(account.buying_power) || 0;
    const cash = parseFloat(account.cash) || 0;

    const dayPL = equity - lastEquity;
    const dayPLPercent = lastEquity > 0 ? (dayPL / lastEquity) * 100 : 0;

    // Filter out zero-value positions (like CVRs)
    const activePositions = positions.filter(p => parseFloat(p.market_value) > 0);

    return {
      success: true,
      summary: {
        equity: equity.toFixed(2),
        buyingPower: buyingPower.toFixed(2),
        cash: cash.toFixed(2),
        dayPL: dayPL.toFixed(2),
        dayPLPercent: dayPLPercent.toFixed(2) + "%",
        positionCount: activePositions.length
      },
      positions: activePositions.map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        avgCost: parseFloat(p.avg_entry_price).toFixed(2),
        currentPrice: parseFloat(p.current_price).toFixed(2),
        marketValue: parseFloat(p.market_value).toFixed(2),
        unrealizedPL: parseFloat(p.unrealized_pl).toFixed(2),
        unrealizedPLPercent: (parseFloat(p.unrealized_plpc) * 100).toFixed(2) + "%"
      })),
      lastUpdated: cache.lastFetched || new Date().toISOString()
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
