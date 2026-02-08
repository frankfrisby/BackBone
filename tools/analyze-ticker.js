/**
 * Tool: Analyze Ticker
 *
 * Get comprehensive analysis of a ticker including score breakdown,
 * technicals, and conviction status.
 */

import { fetchTicker } from "../src/services/trading/yahoo-client.js";
import { getResearchConvictions } from "../src/services/trading/research-convictions.js";

export const metadata = {
  id: "analyze-ticker",
  name: "Analyze Ticker",
  description: "Get comprehensive analysis of a ticker",
  category: "trading"
};

/**
 * Execute the tool
 * @param {Object} inputs - { symbol }
 * @returns {Promise<Object>} Result
 */
export async function execute(inputs) {
  const { symbol } = inputs;

  if (!symbol) {
    return { success: false, error: "Symbol is required" };
  }

  const ticker = await fetchTicker(symbol.toUpperCase());

  if (!ticker) {
    return {
      success: false,
      error: `Ticker ${symbol.toUpperCase()} not found or not yet scored`
    };
  }

  // Get conviction info
  const convictions = getResearchConvictions();
  const conviction = convictions.getConviction(symbol.toUpperCase());
  const convictionBoost = convictions.getEffectiveBoost(symbol.toUpperCase());

  // Build analysis
  const analysis = {
    success: true,
    symbol: ticker.symbol,
    name: ticker.name,
    price: ticker.price,
    change: ticker.change,
    changePercent: ticker.changePercent,

    // Score breakdown
    score: ticker.score,
    signal: getSignal(ticker.score),
    scoreBreakdown: {
      macdAdjustment: ticker.macdAdjustment,
      convictionBoost: convictionBoost || 0
    },

    // Technicals
    technicals: {
      rsi: ticker.rsi,
      macdTrend: ticker.macdTrend,
      volumeSigma: ticker.volumeSigma,
      volumeStatus: ticker.volumeScore?.status
    },

    // Conviction status
    conviction: conviction ? {
      level: conviction.conviction,
      effectiveBoost: convictionBoost,
      reason: conviction.reason,
      daysRemaining: Math.ceil((new Date(conviction.expiresAt) - new Date()) / (24 * 60 * 60 * 1000))
    } : null,

    // Metadata
    lastScored: ticker.scoredAt,
    exchange: ticker.exchange
  };

  // Add recommendation
  if (ticker.score >= 9) {
    analysis.recommendation = "STRONG BUY — Extreme score indicates high opportunity";
  } else if (ticker.score >= 7) {
    analysis.recommendation = "BUY — Score above buy threshold";
  } else if (ticker.score >= 5) {
    analysis.recommendation = "HOLD — Moderate score, wait for better entry";
  } else if (ticker.score >= 3) {
    analysis.recommendation = "SELL — Below hold threshold";
  } else {
    analysis.recommendation = "STRONG SELL — Very low score";
  }

  return analysis;
}

function getSignal(score) {
  if (score >= 9) return "EXTREME BUY";
  if (score >= 8) return "BUY";
  if (score >= 6.5) return "MODERATE BUY";
  if (score >= 4) return "HOLD";
  if (score >= 3) return "SELL";
  return "EXTREME SELL";
}

export default { metadata, execute };
