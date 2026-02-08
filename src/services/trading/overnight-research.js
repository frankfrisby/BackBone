/**
 * Overnight Research Service
 *
 * Runs continuous research from 8 PM to 4 AM when markets are closed.
 * - Researches ALL tickers (700+) each night with detailed evaluations
 * - Each ticker gets: prediction score, datetime, 4-8 sentence WHY analysis
 * - Builds macro knowledge (consumer health, employment, Fed policy, etc.)
 * - Updates recession score with real-world data
 *
 * Philosophy: There's no reason to stop. Deep fundamental knowledge
 * compounds - knowing "consumers are about to lose jobs" is knowledge
 * that applies to dozens of stocks simultaneously.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getTickerPredictionResearch } from "./ticker-prediction-research.js";
import { loadParsedGoals } from "../goals/core-goals-parser.js";

import { getDataDir, getBackboneHome } from "../paths.js";
const DATA_DIR = getDataDir();
const MACRO_KNOWLEDGE_PATH = path.join(DATA_DIR, "macro-knowledge.json");
const OVERNIGHT_STATE_PATH = path.join(DATA_DIR, "overnight-research-state.json");

// Configuration
const CONFIG = {
  // Operating hours (24-hour format)
  START_HOUR: 20,        // 8 PM - after market close
  END_HOUR: 4,           // 4 AM - before market open

  // Research settings
  TICKER_DELAY_MS: 500,         // Delay between ticker research (reduced for full coverage)
  MACRO_INTERVAL_MIN: 30,       // Research macro themes every 30 min
  MAX_TICKERS_PER_CYCLE: null,  // No limit - research ALL tickers in overnight window
  CYCLE_PAUSE_MIN: 5,           // Pause between cycles

  // Macro themes to research
  MACRO_THEMES: [
    {
      id: "consumer_health",
      name: "Consumer Health",
      keywords: ["consumer spending", "retail sales", "consumer confidence", "credit card debt"],
      affectedSectors: ["XLY", "XLP", "WMT", "TGT", "AMZN", "COST", "HD", "LOW"],
      recessionWeight: 0.20
    },
    {
      id: "employment",
      name: "Employment",
      keywords: ["unemployment", "jobless claims", "layoffs", "hiring freeze", "job market"],
      affectedSectors: ["XLY", "XLF", "XLI", "UBER", "LYFT", "ABNB"],
      recessionWeight: 0.25
    },
    {
      id: "fed_policy",
      name: "Fed Policy",
      keywords: ["Federal Reserve", "interest rates", "rate cut", "rate hike", "FOMC", "Powell"],
      affectedSectors: ["XLF", "XLK", "REIT", "TLT", "GLD"],
      recessionWeight: 0.20
    },
    {
      id: "housing",
      name: "Housing Market",
      keywords: ["housing market", "home sales", "mortgage rates", "housing prices", "real estate"],
      affectedSectors: ["XHB", "HD", "LOW", "DHI", "LEN", "TOL"],
      recessionWeight: 0.15
    },
    {
      id: "manufacturing",
      name: "Manufacturing & Industry",
      keywords: ["manufacturing PMI", "industrial production", "factory orders", "supply chain"],
      affectedSectors: ["XLI", "CAT", "DE", "BA", "GE", "MMM"],
      recessionWeight: 0.10
    },
    {
      id: "tech_spending",
      name: "Tech & Enterprise Spending",
      keywords: ["enterprise spending", "IT budget", "cloud spending", "tech layoffs", "AI investment"],
      affectedSectors: ["XLK", "MSFT", "AMZN", "GOOGL", "CRM", "ORCL", "NOW", "SNOW"],
      recessionWeight: 0.05
    },
    {
      id: "energy",
      name: "Energy & Commodities",
      keywords: ["oil prices", "energy demand", "OPEC", "natural gas", "commodity prices"],
      affectedSectors: ["XLE", "XOM", "CVX", "COP", "SLB", "HAL"],
      recessionWeight: 0.05
    }
  ],

  // Goal-specific research themes (loaded dynamically from parsed goals)
  GOAL_RESEARCH_INTERVAL_MIN: 60, // Research goal themes every 60 min
  GOAL_RESEARCH_THEMES: {
    wealth: [
      "portfolio growth strategies",
      "compound investing small accounts",
      "stock selection criteria high growth",
      "risk management position sizing",
      "momentum trading strategies"
    ],
    income: [
      "passive income product ideas",
      "SaaS micro products solo founder",
      "automated service businesses",
      "recurring revenue models",
      "digital product business"
    ],
    career: [
      "space robotics companies hiring",
      "AI in aerospace applications",
      "space industry career paths",
      "robotics skills for space industry",
      "NASA commercial partnerships",
      "SpaceX careers requirements"
    ]
  }
};

/**
 * Macro knowledge entry
 * @typedef {Object} MacroInsight
 * @property {string} themeId
 * @property {string} insight - Key finding
 * @property {number} sentiment - -1 to +1 (bearish to bullish)
 * @property {number} confidence - 0 to 1
 * @property {string[]} sources - Where this came from
 * @property {string} timestamp
 */

class OvernightResearch extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.currentCycle = 0;
    this.macroKnowledge = {};
    this.state = {};
    this._loadMacroKnowledge();
    this._loadState();
  }

  /**
   * Load macro knowledge from disk
   */
  _loadMacroKnowledge() {
    try {
      if (fs.existsSync(MACRO_KNOWLEDGE_PATH)) {
        this.macroKnowledge = JSON.parse(fs.readFileSync(MACRO_KNOWLEDGE_PATH, "utf-8"));
      }
    } catch {
      this.macroKnowledge = { themes: {}, lastUpdated: null };
    }
  }

  /**
   * Save macro knowledge to disk
   */
  _saveMacroKnowledge() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      this.macroKnowledge.lastUpdated = new Date().toISOString();
      fs.writeFileSync(MACRO_KNOWLEDGE_PATH, JSON.stringify(this.macroKnowledge, null, 2));
    } catch (error) {
      console.error("[OvernightResearch] Save macro error:", error.message);
    }
  }

  /**
   * Load state from disk
   */
  _loadState() {
    try {
      if (fs.existsSync(OVERNIGHT_STATE_PATH)) {
        this.state = JSON.parse(fs.readFileSync(OVERNIGHT_STATE_PATH, "utf-8"));
      }
    } catch {
      this.state = {};
    }
  }

  /**
   * Save state to disk
   */
  _saveState() {
    try {
      fs.writeFileSync(OVERNIGHT_STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch { /* ignore */ }
  }

  /**
   * Check if we're in overnight hours
   */
  isOvernightHours() {
    const hour = new Date().getHours();
    // 8 PM (20) to midnight OR midnight to 4 AM
    return hour >= CONFIG.START_HOUR || hour < CONFIG.END_HOUR;
  }

  /**
   * Get all tickers from cache
   */
  _getAllTickers() {
    try {
      const cachePath = path.join(DATA_DIR, "tickers-cache.json");
      if (!fs.existsSync(cachePath)) return [];
      const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      return Array.isArray(cache) ? cache : (cache.tickers || []);
    } catch {
      return [];
    }
  }

  /**
   * Get tickers that need research (stalest first)
   * If limit is null, returns ALL tickers sorted by staleness
   */
  _getTickersToResearch(allTickers, limit = CONFIG.MAX_TICKERS_PER_CYCLE) {
    const predictionService = getTickerPredictionResearch();
    const now = Date.now();

    const withStaleness = allTickers.map(t => {
      const symbol = t.symbol || t;
      const prediction = predictionService.getPrediction(symbol);
      let hoursSinceResearch = 999; // Default: never researched

      if (prediction?.lastResearched) {
        hoursSinceResearch = (now - new Date(prediction.lastResearched)) / (1000 * 60 * 60);
      }

      return {
        ticker: t,
        symbol,
        hoursSinceResearch,
        score: prediction?.predictionScore || 5
      };
    });

    // Sort by staleness (oldest first)
    withStaleness.sort((a, b) => b.hoursSinceResearch - a.hoursSinceResearch);

    // Return all tickers if no limit, otherwise respect limit
    if (limit === null) {
      return withStaleness.map(w => w.ticker);
    }
    return withStaleness.slice(0, limit).map(w => w.ticker);
  }

  /**
   * Research macro themes using news and web data
   */
  async researchMacroTheme(theme) {
    console.log(`[OvernightResearch] Researching macro theme: ${theme.name}`);

    try {
      // Load news cache
      const newsPath = path.join(DATA_DIR, "news-cache.json");
      let articles = [];

      if (fs.existsSync(newsPath)) {
        const news = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
        articles = news.articles || [];
      }

      // Filter articles related to this theme
      const relevantArticles = articles.filter(a => {
        const text = `${a.title || ""} ${a.description || ""}`.toLowerCase();
        return theme.keywords.some(kw => text.includes(kw.toLowerCase()));
      });

      // Analyze sentiment from articles
      let sentiment = 0;
      let confidence = 0.3;
      const insights = [];
      const sources = [];

      for (const article of relevantArticles.slice(0, 10)) {
        const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
        sources.push(article.source?.name || "Unknown");

        // Simple sentiment analysis
        const bullishWords = ["growth", "strong", "increase", "surge", "beat", "optimism", "recovery", "expansion", "hiring"];
        const bearishWords = ["decline", "weak", "layoff", "concern", "warning", "risk", "slowdown", "recession", "cut", "drop"];

        let articleSentiment = 0;
        for (const word of bullishWords) {
          if (text.includes(word)) articleSentiment += 0.15;
        }
        for (const word of bearishWords) {
          if (text.includes(word)) articleSentiment -= 0.15;
        }

        sentiment += Math.max(-1, Math.min(1, articleSentiment));

        // Extract key insights
        if (Math.abs(articleSentiment) > 0.2) {
          insights.push(article.title?.slice(0, 100));
        }
      }

      // Normalize sentiment
      if (relevantArticles.length > 0) {
        sentiment = sentiment / relevantArticles.length;
        confidence = Math.min(0.9, 0.3 + (relevantArticles.length * 0.05));
      }

      // Create macro insight
      const insight = {
        themeId: theme.id,
        themeName: theme.name,
        sentiment: Math.round(sentiment * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        recessionWeight: theme.recessionWeight,
        articleCount: relevantArticles.length,
        insights: insights.slice(0, 5),
        sources: [...new Set(sources)].slice(0, 5),
        affectedSectors: theme.affectedSectors,
        timestamp: new Date().toISOString()
      };

      // Store in macro knowledge
      if (!this.macroKnowledge.themes) {
        this.macroKnowledge.themes = {};
      }
      this.macroKnowledge.themes[theme.id] = insight;
      this._saveMacroKnowledge();

      console.log(`[OvernightResearch] ${theme.name}: sentiment ${insight.sentiment.toFixed(2)}, ${insight.articleCount} articles`);

      return insight;
    } catch (error) {
      console.error(`[OvernightResearch] Macro research error for ${theme.name}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate recession adjustment from macro knowledge
   * Returns a modifier for the recession score
   */
  getRecessionAdjustmentFromMacro() {
    if (!this.macroKnowledge.themes) return 0;

    let adjustment = 0;
    let totalWeight = 0;

    for (const theme of CONFIG.MACRO_THEMES) {
      const insight = this.macroKnowledge.themes[theme.id];
      if (!insight) continue;

      // Check if insight is recent (less than 24 hours old)
      const age = Date.now() - new Date(insight.timestamp);
      if (age > 24 * 60 * 60 * 1000) continue;

      // Negative sentiment = higher recession risk
      // Sentiment: -1 (bearish) to +1 (bullish)
      // Adjustment: -sentiment * weight (so bearish sentiment increases recession score)
      adjustment += (-insight.sentiment) * insight.recessionWeight * insight.confidence;
      totalWeight += insight.recessionWeight;
    }

    // Scale to -2 to +2 range
    if (totalWeight > 0) {
      return Math.max(-2, Math.min(2, (adjustment / totalWeight) * 3));
    }

    return 0;
  }

  /**
   * Get prediction boost for a symbol from macro knowledge
   * Returns a score adjustment based on sector correlation
   */
  getPredictionBoostFromMacro(symbol) {
    if (!this.macroKnowledge.themes) return 0;

    const normalized = symbol.toUpperCase();
    let totalBoost = 0;
    let relevantThemes = 0;

    for (const themeId in this.macroKnowledge.themes) {
      const insight = this.macroKnowledge.themes[themeId];

      // Check if this symbol is in the affected sectors
      if (insight.affectedSectors?.includes(normalized)) {
        // Positive sentiment = positive boost for affected stocks
        totalBoost += insight.sentiment * insight.confidence * 0.5;
        relevantThemes++;
      }
    }

    // Average the boost if multiple themes apply
    if (relevantThemes > 0) {
      return Math.max(-1, Math.min(1, totalBoost / relevantThemes));
    }

    return 0;
  }

  /**
   * Research goal-specific themes and update world view documents
   * Called periodically during overnight hours
   */
  async researchGoalThemes() {
    const parsedGoals = loadParsedGoals();
    if (!parsedGoals?.goals) {
      console.log("[OvernightResearch] No parsed goals, skipping goal research");
      return { researched: 0 };
    }

    console.log("[OvernightResearch] Researching goal-specific themes");
    let researched = 0;

    for (const goal of parsedGoals.goals) {
      const themes = CONFIG.GOAL_RESEARCH_THEMES[goal.id];
      if (!themes || themes.length === 0) continue;

      try {
        // Load news cache for relevant keywords
        const newsPath = path.join(DATA_DIR, "news-cache.json");
        let articles = [];
        if (fs.existsSync(newsPath)) {
          const news = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
          articles = news.articles || [];
        }

        // Find articles relevant to this goal
        const relevantArticles = articles.filter(a => {
          const text = `${a.title || ""} ${a.description || ""}`.toLowerCase();
          return themes.some(theme => {
            const keywords = theme.toLowerCase().split(" ");
            return keywords.some(kw => text.includes(kw));
          });
        });

        // Extract insights
        const insights = relevantArticles.slice(0, 5).map(a => ({
          title: a.title?.slice(0, 100),
          source: a.source?.name,
          date: a.publishedAt
        }));

        // Update world view file if it exists
        if (goal.worldViewFile && insights.length > 0) {
          const worldViewPath = path.join(getBackboneHome(), goal.worldViewFile);
          if (fs.existsSync(worldViewPath)) {
            let content = fs.readFileSync(worldViewPath, "utf-8");

            // Update the "Last updated" line
            const now = new Date().toISOString().split("T")[0];
            content = content.replace(
              /_Last updated: .*_/,
              `_Last updated: ${now}_`
            );

            // Add recent findings section if not present
            if (!content.includes("## Recent Findings")) {
              content += `\n\n## Recent Findings\n`;
            }

            // Append new insights (keep it brief)
            const insightText = insights.slice(0, 3).map(i =>
              `- ${i.title} (${i.source})`
            ).join("\n");

            // Find and update Recent Findings section
            const findingsMatch = content.match(/## Recent Findings\n([\s\S]*?)(?=\n## |$)/);
            if (findingsMatch) {
              const existingFindings = findingsMatch[1];
              const newFindings = `${insightText}\n${existingFindings}`.split("\n").slice(0, 10).join("\n");
              content = content.replace(
                /## Recent Findings\n[\s\S]*?(?=\n## |$)/,
                `## Recent Findings\n${newFindings}\n`
              );
            }

            fs.writeFileSync(worldViewPath, content);
            console.log(`[OvernightResearch] Updated world view for ${goal.id} goal`);
          }
        }

        researched++;
        await this._sleep(1000);
      } catch (error) {
        console.error(`[OvernightResearch] Goal research error for ${goal.id}:`, error.message);
      }
    }

    return { researched };
  }

  /**
   * Run a research cycle
   */
  async runCycle() {
    if (!this.isOvernightHours()) {
      console.log("[OvernightResearch] Not in overnight hours, skipping");
      return { skipped: true, reason: "not overnight hours" };
    }

    this.currentCycle++;
    const cycleStart = Date.now();
    console.log(`[OvernightResearch] Starting cycle ${this.currentCycle}`);

    const results = {
      cycle: this.currentCycle,
      tickersResearched: 0,
      macroThemesResearched: 0,
      goalThemesResearched: 0,
      errors: []
    };

    try {
      // 1. Research macro themes (every 30 minutes)
      const lastMacroResearch = this.state.lastMacroResearch
        ? new Date(this.state.lastMacroResearch)
        : new Date(0);
      const minutesSinceMacro = (Date.now() - lastMacroResearch) / (1000 * 60);

      if (minutesSinceMacro >= CONFIG.MACRO_INTERVAL_MIN) {
        console.log("[OvernightResearch] Running macro theme research...");

        for (const theme of CONFIG.MACRO_THEMES) {
          const insight = await this.researchMacroTheme(theme);
          if (insight) {
            results.macroThemesResearched++;
          }
          await this._sleep(1000); // Brief pause between themes
        }

        this.state.lastMacroResearch = new Date().toISOString();
        this._saveState();
      }

      // 1b. Research goal-specific themes (every 60 minutes)
      const lastGoalResearch = this.state.lastGoalResearch
        ? new Date(this.state.lastGoalResearch)
        : new Date(0);
      const minutesSinceGoal = (Date.now() - lastGoalResearch) / (1000 * 60);

      if (minutesSinceGoal >= CONFIG.GOAL_RESEARCH_INTERVAL_MIN) {
        console.log("[OvernightResearch] Running goal theme research...");
        const goalResult = await this.researchGoalThemes();
        results.goalThemesResearched = goalResult.researched;
        this.state.lastGoalResearch = new Date().toISOString();
        this._saveState();
      }

      // 2. Research tickers
      const allTickers = this._getAllTickers();
      if (allTickers.length === 0) {
        console.log("[OvernightResearch] No tickers available");
        return results;
      }

      const tickersToResearch = this._getTickersToResearch(allTickers);
      const predictionService = getTickerPredictionResearch();

      console.log(`[OvernightResearch] Researching ${tickersToResearch.length} tickers`);

      for (const ticker of tickersToResearch) {
        try {
          const result = await predictionService.researchTicker(ticker);
          if (result.success) {
            results.tickersResearched++;

            // Apply macro boost to the prediction
            const macroBoost = this.getPredictionBoostFromMacro(result.symbol);
            if (macroBoost !== 0) {
              const current = predictionService.getPrediction(result.symbol);
              if (current) {
                const newScore = Math.max(0, Math.min(10, current.predictionScore + macroBoost));
                predictionService.setPrediction(result.symbol, newScore, {
                  ...current.research,
                  macroBoost: Math.round(macroBoost * 100) / 100
                });
              }
            }
          }
        } catch (error) {
          results.errors.push({ symbol: ticker.symbol || ticker, error: error.message });
        }

        await this._sleep(CONFIG.TICKER_DELAY_MS);
      }

      // Update state
      this.state.lastCycle = this.currentCycle;
      this.state.lastCycleTime = new Date().toISOString();
      this.state.lastCycleResults = results;
      this._saveState();

      const elapsed = Date.now() - cycleStart;
      console.log(`[OvernightResearch] Cycle ${this.currentCycle} complete: ${results.tickersResearched} tickers, ${results.macroThemesResearched} macro themes (${elapsed}ms)`);

      this.emit("cycle-complete", results);
      return results;

    } catch (error) {
      console.error("[OvernightResearch] Cycle error:", error.message);
      results.error = error.message;
      return results;
    }
  }

  /**
   * Start continuous overnight research
   */
  async start() {
    if (this.isRunning) {
      console.log("[OvernightResearch] Already running");
      return;
    }

    this.isRunning = true;
    console.log("[OvernightResearch] Starting overnight research service");

    while (this.isRunning) {
      if (this.isOvernightHours()) {
        await this.runCycle();

        // Pause between cycles
        console.log(`[OvernightResearch] Pausing ${CONFIG.CYCLE_PAUSE_MIN} minutes until next cycle`);
        await this._sleep(CONFIG.CYCLE_PAUSE_MIN * 60 * 1000);
      } else {
        // Not overnight hours - check every 15 minutes
        console.log("[OvernightResearch] Outside overnight hours, checking again in 15 minutes");
        await this._sleep(15 * 60 * 1000);
      }
    }
  }

  /**
   * Stop the service
   */
  stop() {
    console.log("[OvernightResearch] Stopping overnight research");
    this.isRunning = false;
  }

  /**
   * Get current status
   */
  getStatus() {
    const allTickers = this._getAllTickers();
    return {
      isRunning: this.isRunning,
      isOvernightHours: this.isOvernightHours(),
      currentCycle: this.currentCycle,
      lastCycleTime: this.state.lastCycleTime,
      lastMacroResearch: this.state.lastMacroResearch,
      macroThemeCount: Object.keys(this.macroKnowledge.themes || {}).length,
      recessionAdjustment: this.getRecessionAdjustmentFromMacro(),
      totalTickers: allTickers.length,
      config: {
        startHour: CONFIG.START_HOUR,
        endHour: CONFIG.END_HOUR,
        tickersPerCycle: CONFIG.MAX_TICKERS_PER_CYCLE === null ? "ALL" : CONFIG.MAX_TICKERS_PER_CYCLE,
        macroIntervalMin: CONFIG.MACRO_INTERVAL_MIN,
        researchWindow: `${CONFIG.START_HOUR}:00 - ${CONFIG.END_HOUR}:00`
      }
    };
  }

  /**
   * Get macro knowledge summary
   */
  getMacroSummary() {
    if (!this.macroKnowledge.themes) return [];

    return Object.values(this.macroKnowledge.themes).map(insight => ({
      theme: insight.themeName,
      sentiment: insight.sentiment,
      confidence: insight.confidence,
      articles: insight.articleCount,
      topInsight: insight.insights?.[0] || null,
      affectedSectors: insight.affectedSectors,
      age: insight.timestamp
        ? Math.round((Date.now() - new Date(insight.timestamp)) / (1000 * 60 * 60)) + "h"
        : "unknown"
    }));
  }

  /**
   * Helper: Sleep
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let instance = null;

export const getOvernightResearch = () => {
  if (!instance) {
    instance = new OvernightResearch();
  }
  return instance;
};

export const startOvernightResearch = async () => {
  return getOvernightResearch().start();
};

export const stopOvernightResearch = () => {
  return getOvernightResearch().stop();
};

export const runResearchCycle = async () => {
  return getOvernightResearch().runCycle();
};

export const getRecessionAdjustmentFromMacro = () => {
  return getOvernightResearch().getRecessionAdjustmentFromMacro();
};

export const getPredictionBoostFromMacro = (symbol) => {
  return getOvernightResearch().getPredictionBoostFromMacro(symbol);
};

export default getOvernightResearch;
