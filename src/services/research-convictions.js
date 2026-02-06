/**
 * Research Convictions Service
 *
 * Manages high-conviction tickers identified through research and data analysis.
 * These tickers receive a temporary boost to their prediction score in the
 * scoring algorithm.
 *
 * Features:
 * - Add tickers with conviction level (0-1) and research notes
 * - Conviction boost decays linearly over 2 weeks
 * - Auto-expires after 2 weeks (returns to baseline)
 * - Boosts are applied to the prediction score component
 *
 * Conviction Levels:
 * - 1.0 = Maximum conviction (adds up to +5 to prediction score)
 * - 0.75 = High conviction (adds up to +3.75)
 * - 0.5 = Moderate conviction (adds up to +2.5)
 * - 0.25 = Low conviction (adds up to +1.25)
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const CONVICTIONS_PATH = path.join(DATA_DIR, "research-convictions.json");

// Configuration
const CONFIG = {
  MAX_CONVICTION: 1.0,           // Maximum conviction level
  MIN_CONVICTION: 0.1,           // Minimum meaningful conviction
  DECAY_DAYS: 14,                // Days until conviction expires (2 weeks)
  MAX_BOOST: 5.0,                // Maximum boost to prediction score at conviction=1.0
  MAX_ACTIVE_CONVICTIONS: 20,    // Maximum active convictions at any time
};

/**
 * Conviction entry structure
 * @typedef {Object} Conviction
 * @property {string} symbol - Ticker symbol
 * @property {number} conviction - Conviction level (0-1)
 * @property {string} reason - Research notes/reason for conviction
 * @property {string} source - Where the conviction came from (manual, ai, news, etc.)
 * @property {string} createdAt - ISO timestamp when added
 * @property {string} expiresAt - ISO timestamp when it expires
 * @property {string} [updatedAt] - Last update timestamp
 * @property {Object} [research] - Additional research data
 */

class ResearchConvictions extends EventEmitter {
  constructor() {
    super();
    this.convictions = new Map(); // symbol -> Conviction
    this._load();
  }

  /**
   * Load convictions from disk
   */
  _load() {
    try {
      if (fs.existsSync(CONVICTIONS_PATH)) {
        const data = JSON.parse(fs.readFileSync(CONVICTIONS_PATH, "utf-8"));
        if (data.convictions && Array.isArray(data.convictions)) {
          data.convictions.forEach(c => {
            this.convictions.set(c.symbol, c);
          });
        }
        this._cleanExpired();
      }
    } catch (error) {
      console.error("[ResearchConvictions] Load error:", error.message);
    }
  }

  /**
   * Save convictions to disk
   */
  _save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const data = {
        convictions: Array.from(this.convictions.values()),
        lastUpdated: new Date().toISOString(),
        config: CONFIG
      };

      fs.writeFileSync(CONVICTIONS_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[ResearchConvictions] Save error:", error.message);
    }
  }

  /**
   * Remove expired convictions
   */
  _cleanExpired() {
    const now = new Date();
    let removed = 0;

    for (const [symbol, conviction] of this.convictions) {
      if (new Date(conviction.expiresAt) <= now) {
        this.convictions.delete(symbol);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[ResearchConvictions] Cleaned ${removed} expired convictions`);
      this._save();
    }
  }

  /**
   * Add or update a conviction
   *
   * @param {string} symbol - Ticker symbol
   * @param {number} conviction - Conviction level (0-1)
   * @param {string} reason - Research notes/reason
   * @param {Object} [options] - Additional options
   * @param {string} [options.source] - Source of conviction (manual, ai, news)
   * @param {Object} [options.research] - Additional research data
   * @param {number} [options.expiryDays] - Custom expiry in days (default: 14)
   */
  addConviction(symbol, conviction, reason, options = {}) {
    if (!symbol || typeof symbol !== "string") {
      return { success: false, error: "Invalid symbol" };
    }

    const normalizedSymbol = symbol.toUpperCase().trim();
    const normalizedConviction = Math.max(CONFIG.MIN_CONVICTION, Math.min(CONFIG.MAX_CONVICTION, conviction));

    // Check max active convictions
    if (!this.convictions.has(normalizedSymbol) && this.convictions.size >= CONFIG.MAX_ACTIVE_CONVICTIONS) {
      // Remove the weakest/oldest conviction to make room
      const sorted = Array.from(this.convictions.values())
        .sort((a, b) => this.getEffectiveBoost(a.symbol) - this.getEffectiveBoost(b.symbol));
      if (sorted.length > 0) {
        this.convictions.delete(sorted[0].symbol);
      }
    }

    const now = new Date();
    const expiryDays = options.expiryDays || CONFIG.DECAY_DAYS;
    const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

    const existing = this.convictions.get(normalizedSymbol);
    const entry = {
      symbol: normalizedSymbol,
      conviction: normalizedConviction,
      reason: reason || "Research-based conviction",
      source: options.source || "manual",
      createdAt: existing?.createdAt || now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      updatedAt: now.toISOString(),
      research: options.research || existing?.research || null
    };

    this.convictions.set(normalizedSymbol, entry);
    this._save();

    this.emit("conviction-added", entry);
    console.log(`[ResearchConvictions] Added ${normalizedSymbol} with conviction ${normalizedConviction.toFixed(2)} — expires in ${expiryDays} days`);

    return {
      success: true,
      conviction: entry,
      effectiveBoost: this.getEffectiveBoost(normalizedSymbol)
    };
  }

  /**
   * Remove a conviction
   */
  removeConviction(symbol) {
    const normalizedSymbol = symbol.toUpperCase().trim();
    const existed = this.convictions.has(normalizedSymbol);

    if (existed) {
      this.convictions.delete(normalizedSymbol);
      this._save();
      this.emit("conviction-removed", { symbol: normalizedSymbol });
    }

    return { success: existed, symbol: normalizedSymbol };
  }

  /**
   * Get a conviction entry
   */
  getConviction(symbol) {
    const normalizedSymbol = symbol.toUpperCase().trim();
    return this.convictions.get(normalizedSymbol) || null;
  }

  /**
   * Get the effective boost for a symbol (with time decay)
   *
   * The boost decays linearly from full value to 0 over the decay period.
   * At day 0: full boost
   * At day 14: 0 boost (expired)
   *
   * @param {string} symbol - Ticker symbol
   * @returns {number} Effective boost to prediction score (0 to MAX_BOOST)
   */
  getEffectiveBoost(symbol) {
    const conviction = this.getConviction(symbol);
    if (!conviction) return 0;

    const now = new Date();
    const createdAt = new Date(conviction.createdAt);
    const expiresAt = new Date(conviction.expiresAt);

    // Check if expired
    if (now >= expiresAt) {
      this._cleanExpired();
      return 0;
    }

    // Calculate decay factor (1.0 at creation, 0.0 at expiry)
    const totalMs = expiresAt.getTime() - createdAt.getTime();
    const elapsedMs = now.getTime() - createdAt.getTime();
    const decayFactor = Math.max(0, 1 - (elapsedMs / totalMs));

    // Calculate boost: conviction × decayFactor × MAX_BOOST
    const boost = conviction.conviction * decayFactor * CONFIG.MAX_BOOST;

    return Math.round(boost * 100) / 100;
  }

  /**
   * Get all active convictions with their effective boosts
   */
  getActiveConvictions() {
    this._cleanExpired();

    return Array.from(this.convictions.values())
      .map(c => ({
        ...c,
        effectiveBoost: this.getEffectiveBoost(c.symbol),
        daysRemaining: Math.max(0, Math.ceil((new Date(c.expiresAt) - new Date()) / (24 * 60 * 60 * 1000)))
      }))
      .sort((a, b) => b.effectiveBoost - a.effectiveBoost);
  }

  /**
   * Get conviction boost map for batch scoring
   * Returns { symbol: boost } for all active convictions
   */
  getBoostMap() {
    const map = {};
    for (const [symbol] of this.convictions) {
      const boost = this.getEffectiveBoost(symbol);
      if (boost > 0) {
        map[symbol] = boost;
      }
    }
    return map;
  }

  /**
   * Bulk add convictions from research data
   *
   * @param {Array} tickers - Array of { symbol, conviction, reason }
   * @param {string} source - Source identifier
   */
  bulkAdd(tickers, source = "ai-research") {
    const results = [];

    for (const ticker of tickers) {
      if (ticker.symbol && ticker.conviction) {
        const result = this.addConviction(
          ticker.symbol,
          ticker.conviction,
          ticker.reason || "Bulk research import",
          { source, research: ticker.research }
        );
        results.push({ symbol: ticker.symbol, ...result });
      }
    }

    return {
      success: true,
      added: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Update conviction level for existing entry
   */
  updateConviction(symbol, newConviction, additionalReason = null) {
    const existing = this.getConviction(symbol);
    if (!existing) {
      return { success: false, error: "Conviction not found" };
    }

    const reason = additionalReason
      ? `${existing.reason}; Update: ${additionalReason}`
      : existing.reason;

    return this.addConviction(symbol, newConviction, reason, {
      source: existing.source,
      research: existing.research
    });
  }

  /**
   * Get summary statistics
   */
  getStats() {
    const active = this.getActiveConvictions();
    const boosts = active.map(c => c.effectiveBoost);

    return {
      activeCount: active.length,
      maxConvictions: CONFIG.MAX_ACTIVE_CONVICTIONS,
      avgBoost: boosts.length > 0 ? (boosts.reduce((s, b) => s + b, 0) / boosts.length).toFixed(2) : 0,
      maxBoost: boosts.length > 0 ? Math.max(...boosts).toFixed(2) : 0,
      totalBoostPotential: boosts.reduce((s, b) => s + b, 0).toFixed(2),
      topConvictions: active.slice(0, 5).map(c => ({
        symbol: c.symbol,
        boost: c.effectiveBoost,
        daysRemaining: c.daysRemaining
      }))
    };
  }

  /**
   * Clear all convictions
   */
  clearAll() {
    const count = this.convictions.size;
    this.convictions.clear();
    this._save();
    return { success: true, cleared: count };
  }
}

// Singleton instance
let instance = null;

export const getResearchConvictions = () => {
  if (!instance) {
    instance = new ResearchConvictions();
  }
  return instance;
};

export const addResearchConviction = (symbol, conviction, reason, options) => {
  return getResearchConvictions().addConviction(symbol, conviction, reason, options);
};

export const getConvictionBoost = (symbol) => {
  return getResearchConvictions().getEffectiveBoost(symbol);
};

export const getConvictionBoostMap = () => {
  return getResearchConvictions().getBoostMap();
};

export default getResearchConvictions;
