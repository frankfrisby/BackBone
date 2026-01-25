/**
 * Polymarket Service
 *
 * Fetches prediction market data from Polymarket.com to get probabilities
 * of various events happening. This helps the AI assess risks and plan accordingly.
 *
 * Fetches every 2 days to stay informed about:
 * - Political events
 * - Economic events
 * - Natural disasters
 * - Technology/AI developments
 * - Health/pandemic risks
 */

import fs from "fs";
import path from "path";
import https from "https";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "polymarket_cache.json");
const MARKDOWN_FILE = path.join(DATA_DIR, "polymarkets.md");

// Categories we care about for life management
const RELEVANT_CATEGORIES = [
  "politics",
  "economics",
  "crypto",
  "science",
  "sports",
  "pop-culture",
  "business"
];

// Keywords that indicate relevance to user's life
const RELEVANCE_KEYWORDS = {
  financial: ["recession", "inflation", "stock", "market", "economy", "fed", "interest rate", "layoff", "unemployment"],
  disaster: ["hurricane", "earthquake", "flood", "wildfire", "storm", "disaster", "emergency"],
  health: ["pandemic", "covid", "virus", "outbreak", "vaccine", "health"],
  political: ["election", "president", "congress", "policy", "regulation", "tax"],
  technology: ["ai", "artificial intelligence", "tech", "crypto", "bitcoin"]
};

/**
 * Fetch data from a URL
 */
const fetchUrl = (url) => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
      }
    }, (response) => {
      let data = "";
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error("Request timeout"));
    });
  });
};

/**
 * Determine relevance category for a market
 */
const categorizeRelevance = (title, description = "") => {
  const text = `${title} ${description}`.toLowerCase();

  for (const [category, keywords] of Object.entries(RELEVANCE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }
  return "general";
};

/**
 * Calculate impact score (how much this affects user's life)
 */
const calculateImpactScore = (market) => {
  let score = 0;
  const text = `${market.title || ""} ${market.description || ""}`.toLowerCase();

  // High impact keywords
  if (text.includes("recession")) score += 30;
  if (text.includes("pandemic")) score += 30;
  if (text.includes("war")) score += 25;
  if (text.includes("inflation")) score += 20;
  if (text.includes("unemployment")) score += 20;
  if (text.includes("disaster")) score += 20;

  // Medium impact
  if (text.includes("election")) score += 15;
  if (text.includes("interest rate")) score += 15;
  if (text.includes("market")) score += 10;
  if (text.includes("policy")) score += 10;

  // Volume indicates market confidence
  if (market.volume > 1000000) score += 15;
  else if (market.volume > 100000) score += 10;
  else if (market.volume > 10000) score += 5;

  return Math.min(100, score);
};

class PolymarketService {
  constructor() {
    this.cache = this.loadCache();
    this.lastFetch = this.cache.lastFetch || null;
  }

  /**
   * Load cached data
   */
  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      }
    } catch (err) {
      console.error("Failed to load polymarket cache:", err.message);
    }
    return { markets: [], lastFetch: null, summary: null };
  }

  /**
   * Save cache
   */
  saveCache() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2));
    } catch (err) {
      console.error("Failed to save polymarket cache:", err.message);
    }
  }

  /**
   * Check if we should fetch new data (every 2 days)
   */
  shouldFetch() {
    if (!this.lastFetch) return true;
    const lastFetchDate = new Date(this.lastFetch);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    return lastFetchDate < twoDaysAgo;
  }

  /**
   * Fetch markets from Polymarket API
   */
  async fetchMarkets() {
    try {
      // Polymarket's public API endpoint for active markets
      // Note: This may need adjustment based on their actual API
      const response = await fetchUrl("https://gamma-api.polymarket.com/markets?closed=false&limit=100");

      if (Array.isArray(response)) {
        return response;
      } else if (response.markets) {
        return response.markets;
      }
      return [];
    } catch (err) {
      console.error("Failed to fetch Polymarket data:", err.message);
      return [];
    }
  }

  /**
   * Process and filter markets for relevance
   */
  processMarkets(rawMarkets) {
    const processed = [];

    for (const market of rawMarkets) {
      const relevance = categorizeRelevance(market.question || market.title, market.description);
      const impactScore = calculateImpactScore({
        title: market.question || market.title,
        description: market.description,
        volume: parseFloat(market.volume) || 0
      });

      // Only keep markets with some relevance or high impact
      if (relevance !== "general" || impactScore > 20) {
        processed.push({
          id: market.id || market.conditionId,
          title: market.question || market.title,
          description: market.description,
          probability: parseFloat(market.outcomePrices?.[0]) || parseFloat(market.probability) || 0.5,
          volume: parseFloat(market.volume) || 0,
          category: market.category || "general",
          relevance,
          impactScore,
          endDate: market.endDate || market.end_date_iso,
          url: `https://polymarket.com/event/${market.slug || market.id}`
        });
      }
    }

    // Sort by impact score
    processed.sort((a, b) => b.impactScore - a.impactScore);

    return processed.slice(0, 50); // Keep top 50
  }

  /**
   * Generate summary of key insights
   */
  generateSummary(markets) {
    const lines = [];

    // Group by relevance category
    const byCategory = {};
    for (const market of markets) {
      if (!byCategory[market.relevance]) {
        byCategory[market.relevance] = [];
      }
      byCategory[market.relevance].push(market);
    }

    // Summarize each category
    for (const [category, categoryMarkets] of Object.entries(byCategory)) {
      if (categoryMarkets.length === 0) continue;

      const topMarket = categoryMarkets[0];
      const avgProb = categoryMarkets.reduce((sum, m) => sum + m.probability, 0) / categoryMarkets.length;

      lines.push(`**${category.charAt(0).toUpperCase() + category.slice(1)}**: ${categoryMarkets.length} active markets`);
      lines.push(`  - Top: "${topMarket.title}" (${(topMarket.probability * 100).toFixed(0)}% probability)`);
    }

    // High probability events (>70%)
    const highProb = markets.filter(m => m.probability > 0.7 && m.impactScore > 30);
    if (highProb.length > 0) {
      lines.push("");
      lines.push("**High Probability Events to Watch:**");
      for (const market of highProb.slice(0, 5)) {
        lines.push(`  - ${market.title}: ${(market.probability * 100).toFixed(0)}%`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Main fetch and process function
   */
  async refresh(force = false) {
    if (!force && !this.shouldFetch()) {
      return this.cache;
    }

    try {
      const rawMarkets = await this.fetchMarkets();
      const processed = this.processMarkets(rawMarkets);
      const summary = this.generateSummary(processed);

      this.cache = {
        markets: processed,
        lastFetch: new Date().toISOString(),
        summary,
        rawCount: rawMarkets.length,
        processedCount: processed.length
      };

      this.lastFetch = this.cache.lastFetch;
      this.saveCache();
      this.saveMarkdown();

      return this.cache;
    } catch (err) {
      console.error("Polymarket refresh failed:", err.message);
      return this.cache;
    }
  }

  /**
   * Save to markdown file
   */
  saveMarkdown() {
    const lines = [
      "# Polymarket Prediction Markets",
      "",
      `**Last Updated:** ${this.cache.lastFetch || "Never"}`,
      `**Markets Tracked:** ${this.cache.processedCount || 0}`,
      "",
      "---",
      "",
      "## Summary",
      "",
      this.cache.summary || "No data available.",
      "",
      "---",
      "",
      "## Top Markets by Impact",
      ""
    ];

    const topMarkets = (this.cache.markets || []).slice(0, 20);
    for (const market of topMarkets) {
      const prob = (market.probability * 100).toFixed(0);
      const volume = market.volume > 1000000
        ? `$${(market.volume / 1000000).toFixed(1)}M`
        : market.volume > 1000
          ? `$${(market.volume / 1000).toFixed(0)}K`
          : `$${market.volume.toFixed(0)}`;

      lines.push(`### ${market.title}`);
      lines.push(`- **Probability:** ${prob}%`);
      lines.push(`- **Volume:** ${volume}`);
      lines.push(`- **Category:** ${market.relevance}`);
      lines.push(`- **Impact Score:** ${market.impactScore}/100`);
      if (market.endDate) {
        lines.push(`- **End Date:** ${new Date(market.endDate).toLocaleDateString()}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push("## How to Use This Data");
    lines.push("");
    lines.push("1. **Financial Planning**: Watch recession/inflation probabilities");
    lines.push("2. **Disaster Prep**: Monitor natural disaster predictions");
    lines.push("3. **Career**: Track industry-specific risks");
    lines.push("4. **Investments**: Consider market predictions in portfolio");
    lines.push("");
    lines.push("*Data refreshes every 2 days from polymarket.com*");

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(MARKDOWN_FILE, lines.join("\n"));
    } catch (err) {
      console.error("Failed to save polymarket markdown:", err.message);
    }
  }

  /**
   * Get markets by category
   */
  getByCategory(category) {
    return (this.cache.markets || []).filter(m => m.relevance === category);
  }

  /**
   * Get high-impact markets
   */
  getHighImpact(minScore = 50) {
    return (this.cache.markets || []).filter(m => m.impactScore >= minScore);
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      lastFetch: this.cache.lastFetch,
      marketCount: this.cache.processedCount || 0,
      topMarkets: (this.cache.markets || []).slice(0, 5),
      summary: this.cache.summary
    };
  }
}

// Singleton
let instance = null;

export const getPolymarketService = () => {
  if (!instance) {
    instance = new PolymarketService();
  }
  return instance;
};

export default PolymarketService;
