/**
 * Ticker Prediction Research Service
 *
 * Automated research-based prediction scoring system.
 * - Evaluates ALL 700+ tickers during overnight hours (8 PM - 4 AM)
 * - Each ticker gets: prediction score, datetime ran, 4-8 sentence evaluation
 * - Evaluation explains WHY the ticker might do well or poorly
 * - Researches using news cache, technicals, recession data, macro knowledge
 * - Computes prediction scores (0-10) based on research findings
 *
 * Key Concepts:
 * - Group A (even days): tickers with even hash
 * - Group B (odd days): tickers with odd hash
 * - Stalest tickers prioritized first
 * - Scores stored in prediction-cache.json with full evaluation text
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getRecessionScore, getRecessionAdjustment } from "./recession-score.js";

const DATA_DIR = path.join(process.cwd(), "data");
const PREDICTION_CACHE_PATH = path.join(DATA_DIR, "prediction-cache.json");
const RESEARCH_STATE_PATH = path.join(DATA_DIR, "prediction-research-state.json");

// Configuration
const CONFIG = {
  // Research settings
  MAX_TICKERS_PER_RUN: null,       // No limit - research ALL tickers in overnight window (8 PM - 4 AM)
  RESEARCH_TIMEOUT_MS: 30000,      // Timeout per ticker research
  MIN_SCORE: 0,
  MAX_SCORE: 10,
  DEFAULT_SCORE: 5.0,              // Neutral prediction

  // Staleness
  STALE_HOURS: 48,                 // Consider prediction stale after 48 hours
  URGENT_HOURS: 72,                // Prioritize if not researched in 72 hours

  // Score weights
  WEIGHTS: {
    sentiment: 2.0,                // Sentiment analysis weight
    catalyst: 1.5,                 // Catalyst/news weight
    momentum: 1.0,                 // Price momentum weight
    volume: 0.5,                   // Volume trend weight
    earnings: 1.5                  // Earnings proximity weight
  }
};

/**
 * Prediction entry structure
 * @typedef {Object} PredictionEntry
 * @property {string} symbol
 * @property {number} predictionScore - 0-10 score
 * @property {number} confidence - 0-1 confidence level
 * @property {string} lastResearched - ISO timestamp
 * @property {string} group - 'A' or 'B'
 * @property {Object} research - Research data
 */

class TickerPredictionResearch extends EventEmitter {
  constructor() {
    super();
    this.predictions = new Map(); // symbol -> PredictionEntry
    this.state = {};
    this._loadCache();
    this._loadState();
  }

  /**
   * Load prediction cache from disk
   */
  _loadCache() {
    try {
      if (fs.existsSync(PREDICTION_CACHE_PATH)) {
        const data = JSON.parse(fs.readFileSync(PREDICTION_CACHE_PATH, "utf-8"));
        if (data.predictions && Array.isArray(data.predictions)) {
          data.predictions.forEach(p => {
            this.predictions.set(p.symbol, p);
          });
        }
      }
    } catch (error) {
      console.error("[PredictionResearch] Load cache error:", error.message);
    }
  }

  /**
   * Save prediction cache to disk
   */
  _saveCache() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const data = {
        predictions: Array.from(this.predictions.values()),
        lastUpdated: new Date().toISOString(),
        config: CONFIG
      };

      fs.writeFileSync(PREDICTION_CACHE_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[PredictionResearch] Save cache error:", error.message);
    }
  }

  /**
   * Load research state
   */
  _loadState() {
    try {
      if (fs.existsSync(RESEARCH_STATE_PATH)) {
        this.state = JSON.parse(fs.readFileSync(RESEARCH_STATE_PATH, "utf-8"));
      }
    } catch {
      this.state = {};
    }
  }

  /**
   * Save research state
   */
  _saveState() {
    try {
      fs.writeFileSync(RESEARCH_STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch { /* ignore */ }
  }

  /**
   * Determine which group a ticker belongs to (A or B)
   * Uses hash of symbol to split evenly
   */
  getTickerGroup(symbol) {
    const hash = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return hash % 2 === 0 ? "A" : "B";
  }

  /**
   * Get today's group (A on even days, B on odd days)
   */
  getTodaysGroup() {
    const dayOfYear = this._getDayOfYear();
    return dayOfYear % 2 === 0 ? "A" : "B";
  }

  _getDayOfYear() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Check if research ran successfully today
   */
  didRunToday() {
    const today = new Date().toISOString().split("T")[0];
    return this.state.lastRunDate === today && this.state.lastRunSuccess;
  }

  /**
   * Check if we need to run the fallback (4 AM check)
   */
  needsFallbackRun() {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // If didn't run today and it's past midnight, need fallback
    if (this.state.lastRunDate !== today) {
      return true;
    }

    return false;
  }

  /**
   * Get tickers that need research today
   */
  getTickersForToday(allTickers) {
    const todaysGroup = this.getTodaysGroup();
    const now = new Date();

    // Filter to today's group
    const groupTickers = allTickers.filter(t =>
      this.getTickerGroup(t.symbol || t) === todaysGroup
    );

    // Prioritize by staleness
    const withStaleness = groupTickers.map(t => {
      const symbol = t.symbol || t;
      const existing = this.predictions.get(symbol);
      let staleness = CONFIG.URGENT_HOURS; // Max staleness if never researched

      if (existing?.lastResearched) {
        const hoursSince = (now - new Date(existing.lastResearched)) / (1000 * 60 * 60);
        staleness = hoursSince;
      }

      return { ticker: t, symbol, staleness };
    });

    // Sort by staleness (most stale first)
    withStaleness.sort((a, b) => b.staleness - a.staleness);

    // Return all tickers if no limit, otherwise respect limit
    if (CONFIG.MAX_TICKERS_PER_RUN === null) {
      return withStaleness.map(w => w.ticker);
    }
    return withStaleness.slice(0, CONFIG.MAX_TICKERS_PER_RUN).map(w => w.ticker);
  }

  /**
   * Get prediction score for a symbol
   */
  getPrediction(symbol) {
    const normalized = symbol.toUpperCase().trim();
    return this.predictions.get(normalized) || null;
  }

  /**
   * Get prediction score value (0-10) for use in scoring
   */
  getPredictionScore(symbol) {
    const prediction = this.getPrediction(symbol);
    if (!prediction) return CONFIG.DEFAULT_SCORE;

    // Check if stale
    if (prediction.lastResearched) {
      const hoursSince = (Date.now() - new Date(prediction.lastResearched)) / (1000 * 60 * 60);
      if (hoursSince > CONFIG.STALE_HOURS) {
        // Decay towards neutral the more stale it is
        const decayFactor = Math.max(0, 1 - (hoursSince - CONFIG.STALE_HOURS) / 48);
        const deviation = prediction.predictionScore - CONFIG.DEFAULT_SCORE;
        return CONFIG.DEFAULT_SCORE + (deviation * decayFactor);
      }
    }

    return prediction.predictionScore;
  }

  /**
   * Get all predictions as a map { symbol: score }
   */
  getPredictionMap() {
    const map = {};
    for (const [symbol, prediction] of this.predictions) {
      map[symbol] = this.getPredictionScore(symbol);
    }
    return map;
  }

  /**
   * Set prediction for a symbol (from research results)
   */
  setPrediction(symbol, score, research = {}) {
    const normalized = symbol.toUpperCase().trim();
    const clampedScore = Math.max(CONFIG.MIN_SCORE, Math.min(CONFIG.MAX_SCORE, score));

    const entry = {
      symbol: normalized,
      predictionScore: Math.round(clampedScore * 100) / 100,
      confidence: research.confidence || 0.5,
      lastResearched: new Date().toISOString(),
      group: this.getTickerGroup(normalized),
      research: {
        sources: research.sources || [],
        sentiment: research.sentiment || "neutral",
        sentimentScore: research.sentimentScore || 0,
        catalysts: research.catalysts || [],
        risks: research.risks || [],
        summary: research.summary || "",
        evaluation: research.summary || "",  // Detailed 4-8 sentence WHY analysis
        newsCount: research.newsCount || 0,
        youtubeVideos: research.youtubeVideos || 0,
        recessionScore: research.recessionScore || null,
        recessionAdjustment: research.recessionAdjustment || null,
        macroBoost: research.macroBoost || null
      }
    };

    this.predictions.set(normalized, entry);
    this._saveCache();

    this.emit("prediction-updated", entry);
    return entry;
  }

  /**
   * Research a single ticker and compute prediction
   * This is the core research function that uses available data sources
   */
  async researchTicker(ticker, options = {}) {
    const symbol = ticker.symbol || ticker;
    const startTime = Date.now();

    try {
      console.log(`[PredictionResearch] Researching ${symbol}...`);

      // Gather data from available sources
      const research = {
        sources: [],
        sentiment: "neutral",
        sentimentScore: 0,
        catalysts: [],
        risks: [],
        newsCount: 0,
        youtubeVideos: 0,
        confidence: 0.3 // Base confidence
      };

      // 1. Check news cache for this symbol
      const newsData = this._getNewsForSymbol(symbol);
      if (newsData.articles.length > 0) {
        research.sources.push("news");
        research.newsCount = newsData.articles.length;
        research.confidence += 0.1;

        // Simple sentiment from news titles
        const sentiment = this._analyzeSentiment(newsData.articles.map(a => a.title).join(" "));
        research.sentimentScore += sentiment.score * 0.3;

        if (sentiment.catalysts.length > 0) {
          research.catalysts.push(...sentiment.catalysts);
        }
        if (sentiment.risks.length > 0) {
          research.risks.push(...sentiment.risks);
        }
      }

      // 2. Check ticker cache for technical data
      const tickerData = this._getTickerData(symbol);
      if (tickerData) {
        research.sources.push("technicals");
        research.confidence += 0.2;

        // Factor in momentum
        const momentum = tickerData.changePercent || 0;
        if (momentum < -5) {
          research.sentimentScore += 1.5; // Oversold = bullish for contrarian
          research.catalysts.push("Oversold bounce potential");
        } else if (momentum > 5) {
          research.sentimentScore -= 0.5; // Overbought = cautious
          research.risks.push("Overbought conditions");
        }

        // Factor in volume
        if (tickerData.volumeSigma && tickerData.volumeSigma > 2) {
          research.sentimentScore += 0.5;
          research.catalysts.push("Unusual volume activity");
        }

        // Factor in RSI
        if (tickerData.rsi) {
          if (tickerData.rsi < 30) {
            research.sentimentScore += 1.0;
            research.catalysts.push("RSI oversold");
          } else if (tickerData.rsi > 70) {
            research.sentimentScore -= 0.5;
            research.risks.push("RSI overbought");
          }
        }

        // Earnings proximity
        if (tickerData.earningsDate || tickerData.daysUntilEarnings != null) {
          const daysUntil = tickerData.daysUntilEarnings ||
            (tickerData.earningsDate ? Math.ceil((new Date(tickerData.earningsDate) - Date.now()) / (1000 * 60 * 60 * 24)) : null);

          if (daysUntil != null && daysUntil >= 0 && daysUntil <= 14) {
            research.sentimentScore += 0.5;
            research.catalysts.push(`Earnings in ${daysUntil} days`);
          }
        }
      }

      // 3. Check for existing conviction/research data
      const existingResearch = this._getExistingResearch(symbol);
      if (existingResearch) {
        research.sources.push("prior-research");
        research.confidence += 0.1;
        // Carry forward some of the prior research
        if (existingResearch.catalysts) {
          research.catalysts.push(...existingResearch.catalysts.slice(0, 2));
        }
      }

      // Calculate final prediction score
      // Base: 5.0 (neutral)
      // Sentiment adjustment: -2.5 to +2.5
      // Catalyst bonus: up to +1.5
      // Risk penalty: up to -1.5
      // Recession adjustment: -2 to +3 (based on sector)

      let predictionScore = CONFIG.DEFAULT_SCORE;

      // Sentiment contribution (clamped)
      const sentimentContrib = Math.max(-2.5, Math.min(2.5, research.sentimentScore));
      predictionScore += sentimentContrib;

      // Catalyst bonus
      const catalystBonus = Math.min(1.5, research.catalysts.length * 0.3);
      predictionScore += catalystBonus;

      // Risk penalty
      const riskPenalty = Math.min(1.5, research.risks.length * 0.3);
      predictionScore -= riskPenalty;

      // 4. Apply recession adjustment
      // Defensive stocks get boosted in recession, cyclicals get penalized
      try {
        const recessionData = getRecessionScore();
        const recessionAdj = getRecessionAdjustment(symbol, recessionData.score);
        predictionScore += recessionAdj;
        research.sources.push("recession");
        research.recessionScore = recessionData.score;
        research.recessionAdjustment = Math.round(recessionAdj * 100) / 100;

        // Add recession-related catalyst/risk
        if (recessionAdj >= 1) {
          research.catalysts.push(`Recession hedge (Reces: ${recessionData.score.toFixed(1)})`);
        } else if (recessionAdj <= -1) {
          research.risks.push(`Recession risk (Reces: ${recessionData.score.toFixed(1)})`);
        }
      } catch { /* ignore recession adjustment errors */ }

      // Determine sentiment label
      if (predictionScore >= 7) research.sentiment = "bullish";
      else if (predictionScore >= 6) research.sentiment = "slightly bullish";
      else if (predictionScore <= 3) research.sentiment = "bearish";
      else if (predictionScore <= 4) research.sentiment = "slightly bearish";
      else research.sentiment = "neutral";

      // Build summary
      research.summary = this._buildSummary(symbol, research, predictionScore);

      // Save prediction
      const entry = this.setPrediction(symbol, predictionScore, research);

      const elapsed = Date.now() - startTime;
      console.log(`[PredictionResearch] ${symbol}: score ${predictionScore.toFixed(2)} (${elapsed}ms)`);

      return {
        success: true,
        symbol,
        predictionScore: entry.predictionScore,
        research: entry.research,
        elapsed
      };

    } catch (error) {
      console.error(`[PredictionResearch] Error researching ${symbol}:`, error.message);
      return {
        success: false,
        symbol,
        error: error.message
      };
    }
  }

  /**
   * Run research for today's batch of tickers
   */
  async runDailyResearch(allTickers = null) {
    const startTime = Date.now();
    const today = new Date().toISOString().split("T")[0];

    console.log(`[PredictionResearch] Starting daily research run for ${this.getTodaysGroup()} group`);

    // Get tickers if not provided
    if (!allTickers) {
      allTickers = this._getAllTickers();
    }

    if (allTickers.length === 0) {
      console.log("[PredictionResearch] No tickers to research");
      return { success: false, error: "No tickers available" };
    }

    // Get today's batch
    const batch = this.getTickersForToday(allTickers);
    console.log(`[PredictionResearch] Researching ${batch.length} tickers`);

    const results = {
      total: batch.length,
      success: 0,
      failed: 0,
      errors: []
    };

    // Research each ticker
    for (const ticker of batch) {
      const result = await this.researchTicker(ticker);

      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({ symbol: result.symbol, error: result.error });
      }

      // Small delay between tickers to avoid rate limiting
      await this._sleep(100);
    }

    // Update state
    this.state = {
      lastRunDate: today,
      lastRunTime: new Date().toISOString(),
      lastRunSuccess: results.failed < results.total * 0.5, // Success if less than 50% failed
      lastRunStats: results,
      group: this.getTodaysGroup()
    };
    this._saveState();

    const elapsed = Date.now() - startTime;
    console.log(`[PredictionResearch] Completed: ${results.success}/${results.total} success (${elapsed}ms)`);

    this.emit("research-complete", {
      ...results,
      elapsed,
      group: this.getTodaysGroup()
    });

    return {
      success: true,
      ...results,
      elapsed
    };
  }

  /**
   * Helper: Get news for a symbol from cache
   */
  _getNewsForSymbol(symbol) {
    try {
      const newsPath = path.join(DATA_DIR, "news-cache.json");
      if (!fs.existsSync(newsPath)) return { articles: [] };

      const news = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
      const articles = (news.articles || []).filter(a => {
        const text = `${a.title || ""} ${a.description || ""}`.toLowerCase();
        return text.includes(symbol.toLowerCase());
      });

      return { articles };
    } catch {
      return { articles: [] };
    }
  }

  /**
   * Helper: Get ticker data from cache
   */
  _getTickerData(symbol) {
    try {
      const cachePath = path.join(DATA_DIR, "tickers-cache.json");
      if (!fs.existsSync(cachePath)) return null;

      const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      const tickers = Array.isArray(cache) ? cache : (cache.tickers || []);

      return tickers.find(t => t.symbol?.toUpperCase() === symbol.toUpperCase()) || null;
    } catch {
      return null;
    }
  }

  /**
   * Helper: Get all tickers from cache
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
   * Helper: Get existing research/conviction data
   */
  _getExistingResearch(symbol) {
    try {
      const convictionsPath = path.join(DATA_DIR, "research-convictions.json");
      if (!fs.existsSync(convictionsPath)) return null;

      const data = JSON.parse(fs.readFileSync(convictionsPath, "utf-8"));
      const conviction = (data.convictions || []).find(c =>
        c.symbol?.toUpperCase() === symbol.toUpperCase()
      );

      return conviction?.research || null;
    } catch {
      return null;
    }
  }

  /**
   * Helper: Simple sentiment analysis from text
   */
  _analyzeSentiment(text) {
    const lower = text.toLowerCase();
    let score = 0;
    const catalysts = [];
    const risks = [];

    // Bullish keywords
    const bullishWords = [
      "surge", "rally", "beat", "exceeds", "growth", "strong", "record",
      "upgrade", "buy", "bullish", "breakout", "momentum", "outperform",
      "earnings beat", "revenue up", "profit", "expansion", "opportunity"
    ];

    // Bearish keywords
    const bearishWords = [
      "plunge", "crash", "miss", "weak", "decline", "downgrade", "sell",
      "bearish", "breakdown", "warning", "concern", "risk", "loss",
      "underperform", "cut", "layoff", "investigation", "lawsuit"
    ];

    for (const word of bullishWords) {
      if (lower.includes(word)) {
        score += 0.3;
        if (["surge", "rally", "beat", "record", "breakout"].includes(word)) {
          catalysts.push(word.charAt(0).toUpperCase() + word.slice(1) + " momentum");
        }
      }
    }

    for (const word of bearishWords) {
      if (lower.includes(word)) {
        score -= 0.3;
        if (["plunge", "crash", "miss", "warning", "lawsuit"].includes(word)) {
          risks.push(word.charAt(0).toUpperCase() + word.slice(1) + " concern");
        }
      }
    }

    return { score, catalysts, risks };
  }

  /**
   * Helper: Build detailed research evaluation
   * Generates a 4-8 sentence analysis explaining WHY the ticker might do well or poorly
   */
  _buildSummary(symbol, research, score) {
    const sentences = [];
    const tickerData = this._getTickerData(symbol);
    const companyName = tickerData?.name || symbol;

    // Sentence 1: Overall assessment with score context
    if (score >= 8) {
      sentences.push(`${symbol} shows strong bullish signals with a prediction score of ${score.toFixed(1)}/10, suggesting high potential for near-term upside.`);
    } else if (score >= 6.5) {
      sentences.push(`${symbol} has a moderately bullish outlook with a score of ${score.toFixed(1)}/10, indicating favorable but not exceptional conditions.`);
    } else if (score <= 3) {
      sentences.push(`${symbol} faces significant headwinds with a bearish prediction score of ${score.toFixed(1)}/10, suggesting caution is warranted.`);
    } else if (score <= 4.5) {
      sentences.push(`${symbol} shows slightly bearish signals with a score of ${score.toFixed(1)}/10, indicating some near-term weakness.`);
    } else {
      sentences.push(`${symbol} is in neutral territory with a prediction score of ${score.toFixed(1)}/10, lacking strong directional signals.`);
    }

    // Sentence 2-3: Primary catalysts with explanation
    if (research.catalysts.length > 0) {
      const topCatalysts = research.catalysts.slice(0, 3);
      if (topCatalysts.length === 1) {
        sentences.push(`The key bullish driver is ${topCatalysts[0].toLowerCase()}, which could propel the stock higher.`);
      } else if (topCatalysts.length === 2) {
        sentences.push(`Two positive catalysts stand out: ${topCatalysts[0].toLowerCase()} and ${topCatalysts[1].toLowerCase()}, both of which support upward momentum.`);
      } else {
        sentences.push(`Multiple bullish catalysts are present: ${topCatalysts.join(", ").toLowerCase()}. These factors combined suggest favorable conditions for appreciation.`);
      }
    }

    // Sentence 3-4: Risk factors with explanation
    if (research.risks.length > 0) {
      const topRisks = research.risks.slice(0, 3);
      if (topRisks.length === 1) {
        sentences.push(`However, ${topRisks[0].toLowerCase()} presents a notable risk that could limit upside or cause downward pressure.`);
      } else {
        sentences.push(`Risk factors to monitor include ${topRisks.join(" and ").toLowerCase()}, which could weigh on the stock if they materialize.`);
      }
    } else if (score >= 6) {
      sentences.push(`No significant near-term risks were identified in the current research, providing a cleaner setup.`);
    }

    // Sentence 4-5: Technical/momentum context
    if (tickerData) {
      const change = tickerData.changePercent || 0;
      const rsi = tickerData.rsi;
      const volumeSigma = tickerData.volumeSigma;

      if (change < -5) {
        sentences.push(`The stock is down ${Math.abs(change).toFixed(1)}% recently, creating a potential oversold bounce opportunity for contrarian investors.`);
      } else if (change > 5) {
        sentences.push(`With a ${change.toFixed(1)}% recent gain, the stock has strong momentum but may be extended in the short term.`);
      }

      if (rsi && rsi < 35) {
        sentences.push(`RSI at ${rsi.toFixed(0)} indicates oversold conditions, which historically precedes rebounds.`);
      } else if (rsi && rsi > 65) {
        sentences.push(`RSI at ${rsi.toFixed(0)} suggests overbought conditions, warranting caution on new entries.`);
      }

      if (volumeSigma && volumeSigma > 1.5) {
        sentences.push(`Unusual volume activity (${volumeSigma.toFixed(1)}σ above average) signals increased institutional interest.`);
      }
    }

    // Sentence 5-6: News/sentiment context
    if (research.newsCount > 5) {
      sentences.push(`High news volume with ${research.newsCount} recent articles suggests the stock is in focus, with ${research.sentiment} sentiment dominating headlines.`);
    } else if (research.newsCount > 0) {
      sentences.push(`Recent news coverage (${research.newsCount} articles) reflects ${research.sentiment} sentiment from the media.`);
    }

    // Sentence 6-7: Recession/macro context if relevant
    if (research.recessionAdjustment && Math.abs(research.recessionAdjustment) >= 0.5) {
      if (research.recessionAdjustment > 0) {
        sentences.push(`Given current recession risk (score: ${research.recessionScore?.toFixed(1) || "N/A"}), this stock benefits from defensive positioning, adding ${research.recessionAdjustment.toFixed(1)} points to the score.`);
      } else {
        sentences.push(`Elevated recession risk (score: ${research.recessionScore?.toFixed(1) || "N/A"}) weighs on this cyclical stock, deducting ${Math.abs(research.recessionAdjustment).toFixed(1)} points from the score.`);
      }
    }

    // Sentence 7-8: Earnings proximity if applicable
    const daysUntilEarnings = tickerData?.daysUntilEarnings;
    if (daysUntilEarnings != null && daysUntilEarnings >= 0 && daysUntilEarnings <= 14) {
      sentences.push(`Earnings are ${daysUntilEarnings} days away, which could drive significant volatility and should be factored into position sizing.`);
    }

    // Sentence 8: Confidence/data quality note
    if (research.confidence >= 0.7) {
      sentences.push(`Research confidence is high (${(research.confidence * 100).toFixed(0)}%) based on multiple data sources: ${research.sources.join(", ")}.`);
    } else if (research.confidence <= 0.4) {
      sentences.push(`Limited data availability (confidence: ${(research.confidence * 100).toFixed(0)}%) means this prediction should be weighted accordingly.`);
    }

    // Ensure we have at least 4 sentences, pad if needed
    if (sentences.length < 4) {
      if (score >= 5.5) {
        sentences.push(`On balance, the data suggests ${symbol} is positioned for potential gains, though investors should monitor for changing conditions.`);
      } else {
        sentences.push(`Overall, ${symbol} warrants caution until clearer positive signals emerge from price action or fundamentals.`);
      }
    }

    // Truncate to max 8 sentences
    return sentences.slice(0, 8).join(" ");
  }

  /**
   * Helper: Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   */
  getStats() {
    const predictions = Array.from(this.predictions.values());
    const now = Date.now();

    const stale = predictions.filter(p => {
      const hoursSince = (now - new Date(p.lastResearched)) / (1000 * 60 * 60);
      return hoursSince > CONFIG.STALE_HOURS;
    });

    const groupA = predictions.filter(p => p.group === "A");
    const groupB = predictions.filter(p => p.group === "B");

    return {
      totalPredictions: predictions.length,
      staleCount: stale.length,
      groupA: groupA.length,
      groupB: groupB.length,
      todaysGroup: this.getTodaysGroup(),
      avgScore: predictions.length > 0
        ? (predictions.reduce((s, p) => s + p.predictionScore, 0) / predictions.length).toFixed(2)
        : 0,
      highScores: predictions.filter(p => p.predictionScore >= 7).length,
      lowScores: predictions.filter(p => p.predictionScore <= 3).length,
      lastRun: this.state.lastRunTime || null,
      lastRunSuccess: this.state.lastRunSuccess || false
    };
  }

  /**
   * Clear all predictions
   */
  clearAll() {
    const count = this.predictions.size;
    this.predictions.clear();
    this._saveCache();
    return { success: true, cleared: count };
  }
}

// Singleton instance
let instance = null;

export const getTickerPredictionResearch = () => {
  if (!instance) {
    instance = new TickerPredictionResearch();
  }
  return instance;
};

export const getPredictionScore = (symbol) => {
  return getTickerPredictionResearch().getPredictionScore(symbol);
};

export const getPredictionMap = () => {
  return getTickerPredictionResearch().getPredictionMap();
};

export const runDailyPredictionResearch = async () => {
  return getTickerPredictionResearch().runDailyResearch();
};

export default getTickerPredictionResearch;
