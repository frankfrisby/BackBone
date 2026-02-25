/**
 * Tool: Net Worth
 *
 * Quick net worth snapshot from Empower cached data.
 */

import fs from "fs";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "net-worth",
  name: "Net Worth Snapshot",
  description: "Get net worth breakdown from Empower (cash, investment, credit, loan)",
  category: "finance"
};

export async function execute() {
  try {
    const authPath = dataFile("empower-auth.json");
    const portfolioPath = dataFile("brokerage-portfolio.json");

    let data = null;
    let source = null;

    if (fs.existsSync(portfolioPath)) {
      data = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
      source = "brokerage-portfolio";
    } else if (fs.existsSync(authPath)) {
      data = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      source = "empower-auth";
    }

    if (!data) {
      return { success: false, error: "No Empower data available. Run empower_scrape to fetch." };
    }

    const lastUpdated = data.lastUpdated || data.scrapedAt || data.timestamp;
    const staleMs = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : null;
    const stale = staleMs ? staleMs > 4 * 60 * 60 * 1000 : true;

    return {
      success: true,
      source,
      netWorth: data.netWorth || data.totalNetWorth,
      categories: data.categories || data.accountsByCategory || null,
      accountCount: data.accounts?.length || null,
      lastUpdated,
      stale,
      staleness: staleMs ? `${Math.round(staleMs / 3600000)}h ago` : "unknown"
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
