/**
 * Tool: Life Scores
 *
 * Get current life dimension scores (health, wealth, career, etc.).
 */

import fs from "fs";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "life-scores",
  name: "Life Scores",
  description: "Get life dimension scores (health, wealth, career, relationships, etc.)",
  category: "health"
};

export async function execute() {
  try {
    const scoresPath = dataFile("life-scores.json");
    if (!fs.existsSync(scoresPath)) {
      return { success: false, error: "No life scores data available" };
    }

    const data = JSON.parse(fs.readFileSync(scoresPath, "utf-8"));
    const scores = data.scores || data.dimensions || data;

    // Calculate overall average if not present
    let overall = data.overall;
    if (!overall && typeof scores === "object") {
      const vals = Object.values(scores).filter(v => typeof v === "number" || typeof v?.score === "number");
      if (vals.length > 0) {
        const sum = vals.reduce((a, v) => a + (typeof v === "number" ? v : v.score), 0);
        overall = Math.round(sum / vals.length);
      }
    }

    return {
      success: true,
      scores,
      overall,
      lastUpdated: data.lastUpdated || data.timestamp
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
