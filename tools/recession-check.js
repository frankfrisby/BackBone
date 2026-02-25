/**
 * Tool: Recession Check
 *
 * Get the current recession probability score (0-10).
 */

import fs from "fs";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "recession-check",
  name: "Recession Check",
  description: "Get current recession probability score (0-10) with component breakdown",
  category: "trading"
};

export async function execute() {
  try {
    const { default: getRecessionScore } = await import("../src/services/trading/recession-score.js");
    const result = await getRecessionScore();

    return {
      success: true,
      score: result.score,
      label: result.label || (result.score <= 3 ? "Low" : result.score <= 6 ? "Moderate" : "High"),
      components: result.components || result.breakdown,
      lastUpdated: result.lastUpdated || result.timestamp,
      projection: result.projection || null
    };
  } catch (error) {
    // Fallback: try cached file
    try {
      const cachePath = dataFile("recession-score.json");
      if (fs.existsSync(cachePath)) {
        const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        return { success: true, score: cached.score, label: cached.label, cached: true, lastUpdated: cached.timestamp };
      }
    } catch (_) { /* ignore */ }
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
