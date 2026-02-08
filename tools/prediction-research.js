/**
 * Tool: Prediction Research
 *
 * Manage the automated ticker prediction research system.
 * - Run research manually
 * - Check status and stats
 * - Research specific tickers
 */

import { getTickerPredictionResearch } from "../src/services/trading/ticker-prediction-research.js";

export const metadata = {
  id: "prediction-research",
  name: "Prediction Research",
  description: "Manage automated ticker prediction research system",
  category: "trading"
};

/**
 * Execute the tool
 * @param {Object} inputs - { action, symbol }
 * @returns {Promise<Object>} Result
 */
export async function execute(inputs = {}) {
  const { action = "status", symbol } = inputs;
  const service = getTickerPredictionResearch();

  switch (action) {
    case "status": {
      const stats = service.getStats();
      return {
        success: true,
        action: "status",
        stats,
        todaysGroup: service.getTodaysGroup(),
        didRunToday: service.didRunToday(),
        needsFallback: service.needsFallbackRun()
      };
    }

    case "run": {
      console.log("[PredictionResearch Tool] Starting daily research run...");
      const result = await service.runDailyResearch();
      return {
        success: result.success,
        action: "run",
        ...result
      };
    }

    case "research": {
      if (!symbol) {
        return { success: false, error: "Symbol required for research action" };
      }
      console.log(`[PredictionResearch Tool] Researching ${symbol}...`);
      const result = await service.researchTicker(symbol);
      return {
        success: result.success,
        action: "research",
        ...result
      };
    }

    case "get": {
      if (!symbol) {
        return { success: false, error: "Symbol required for get action" };
      }
      const prediction = service.getPrediction(symbol);
      const score = service.getPredictionScore(symbol);
      return {
        success: true,
        action: "get",
        symbol: symbol.toUpperCase(),
        prediction,
        currentScore: score,
        isStale: prediction ? !service.didRunToday() : true
      };
    }

    case "clear": {
      const result = service.clearAll();
      return {
        success: true,
        action: "clear",
        ...result
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}`,
        validActions: ["status", "run", "research", "get", "clear"]
      };
  }
}

export default { metadata, execute };
