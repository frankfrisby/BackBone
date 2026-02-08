/**
 * Tool: Add Research Conviction
 *
 * Adds a high-conviction ticker based on research.
 * Boosts the ticker's prediction score for 2 weeks.
 */

import { addConviction } from "../src/services/trading/yahoo-client.js";

export const metadata = {
  id: "add-conviction",
  name: "Add Research Conviction",
  description: "Add a high-conviction ticker based on research",
  category: "trading"
};

/**
 * Execute the tool
 * @param {Object} inputs - { symbol, conviction, reason }
 * @returns {Promise<Object>} Result
 */
export async function execute(inputs) {
  const { symbol, conviction, reason } = inputs;

  if (!symbol) {
    return { success: false, error: "Symbol is required" };
  }

  if (conviction === undefined || conviction < 0.1 || conviction > 1.0) {
    return { success: false, error: "Conviction must be between 0.1 and 1.0" };
  }

  if (!reason) {
    return { success: false, error: "Reason is required — explain your research" };
  }

  const result = await addConviction(symbol, conviction, reason, {
    source: "tool"
  });

  if (result.success) {
    return {
      success: true,
      message: `Added conviction for ${symbol.toUpperCase()}`,
      symbol: symbol.toUpperCase(),
      conviction,
      effectiveBoost: result.effectiveBoost,
      expiresIn: "14 days"
    };
  }

  return result;
}

export default { metadata, execute };
