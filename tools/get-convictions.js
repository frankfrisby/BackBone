/**
 * Tool: Get Research Convictions
 *
 * Lists all active research convictions with their effective boosts.
 */

import { getConvictions } from "../src/services/trading/yahoo-client.js";

export const metadata = {
  id: "get-convictions",
  name: "Get Research Convictions",
  description: "List all active research convictions",
  category: "trading"
};

/**
 * Execute the tool
 * @returns {Promise<Object>} Result
 */
export async function execute() {
  const result = await getConvictions();

  if (result.success) {
    const convictions = result.convictions || [];

    return {
      success: true,
      count: convictions.length,
      convictions: convictions.map(c => ({
        symbol: c.symbol,
        conviction: c.conviction,
        effectiveBoost: c.effectiveBoost,
        daysRemaining: c.daysRemaining,
        reason: c.reason,
        source: c.source
      })),
      stats: result.stats,
      summary: convictions.length > 0
        ? `${convictions.length} active convictions. Top: ${convictions.slice(0, 3).map(c => `${c.symbol} (+${c.effectiveBoost})`).join(", ")}`
        : "No active convictions"
    };
  }

  return result;
}

export default { metadata, execute };
