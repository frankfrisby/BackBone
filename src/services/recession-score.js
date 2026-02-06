/**
 * Recession Score Service
 *
 * Calculates a recession probability score from 0-10:
 * - 0.0 = Booming market (strong growth, low risk)
 * - 5.0 = Recession likely (mixed signals, caution warranted)
 * - 10.0 = Full recession (severe downturn, defensive mode)
 *
 * Factors:
 * - SPY trend (30-day performance)
 * - Market breadth (% of tickers declining)
 * - Volatility (VIX proxy via large moves)
 * - Sector rotation (defensive vs growth)
 * - Volume patterns (panic selling indicators)
 *
 * Impact on stocks:
 * - Defensive sectors (utilities, healthcare, consumer staples) → higher scores in recession
 * - Growth/cyclical (tech, consumer discretionary) → lower scores in recession
 * - Inverse ETFs (SH, SQQQ) → much higher scores in recession
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const RECESSION_CACHE_PATH = path.join(DATA_DIR, "recession-score.json");

// Sector classifications
const SECTOR_CLASSIFICATIONS = {
  // Defensive - do well in recession
  defensive: [
    "XLU", "XLV", "XLP", "VZ", "T", "JNJ", "PG", "KO", "PEP", "MO", "PM",
    "CL", "GIS", "K", "SJM", "MRK", "PFE", "ABBV", "LLY", "UNH", "WMT",
    "COST", "DG", "DLTR", "ED", "DUK", "SO", "NEE", "AEP", "XEL"
  ],
  // Inverse ETFs - profit from decline
  inverse: [
    "SH", "SDS", "SPXU", "SQQQ", "QID", "PSQ", "DOG", "DXD", "SDOW",
    "TZA", "FAZ", "SPXS", "SRTY", "HIBS"
  ],
  // Growth/Cyclical - suffer in recession
  cyclical: [
    "AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NVDA", "TSLA",
    "AMD", "NFLX", "CRM", "ADBE", "SHOP", "SQ", "PYPL", "ROKU", "UBER",
    "LYFT", "ABNB", "COIN", "HOOD", "PLTR", "SNOW", "DDOG", "NET",
    "XLY", "XLK", "XLF", "XLI", "XLB", "HD", "LOW", "NKE", "SBUX",
    "MCD", "DIS", "BA", "CAT", "DE", "F", "GM"
  ],
  // Highly speculative - very sensitive to recession
  speculative: [
    "MARA", "RIOT", "CLSK", "HUT", "BITF", "IONQ", "RGTI", "QUBT",
    "MSTR", "SMCI", "UPST", "SOFI", "AFRM", "LCID", "RIVN", "JOBY",
    "LILM", "GME", "AMC", "BBBY", "SPCE", "PLUG", "FCEL", "BLNK"
  ]
};

/**
 * Calculate recession score from market data
 */
function calculateRecessionScore(marketData = {}) {
  const {
    spyChange = 0,          // SPY daily change %
    spy30dChange = 0,       // SPY 30-day change %
    decliningPct = 50,      // % of tickers declining today
    avgDecline = 0,         // Average decline of declining tickers
    volatility = 1,         // Volatility multiplier (1 = normal)
    vixLevel = 20,          // VIX or proxy
    defensiveOutperform = 0 // Defensive sector outperformance vs market
  } = marketData;

  let score = 0;

  // 1. SPY daily move (0-2 points)
  // Large down moves = higher recession score
  if (spyChange <= -3) score += 2.0;
  else if (spyChange <= -2) score += 1.5;
  else if (spyChange <= -1) score += 1.0;
  else if (spyChange <= -0.5) score += 0.5;
  else if (spyChange >= 2) score -= 0.5;
  else if (spyChange >= 1) score -= 0.25;

  // 2. SPY 30-day trend (0-2.5 points)
  // Sustained decline = higher recession score
  if (spy30dChange <= -15) score += 2.5;
  else if (spy30dChange <= -10) score += 2.0;
  else if (spy30dChange <= -5) score += 1.5;
  else if (spy30dChange <= -2) score += 0.75;
  else if (spy30dChange >= 5) score -= 0.5;
  else if (spy30dChange >= 2) score -= 0.25;

  // 3. Market breadth (0-2 points)
  // More declining tickers = higher recession score
  if (decliningPct >= 80) score += 2.0;
  else if (decliningPct >= 70) score += 1.5;
  else if (decliningPct >= 60) score += 1.0;
  else if (decliningPct >= 55) score += 0.5;
  else if (decliningPct <= 30) score -= 0.5;

  // 4. Volatility / VIX (0-2 points)
  if (vixLevel >= 40) score += 2.0;
  else if (vixLevel >= 30) score += 1.5;
  else if (vixLevel >= 25) score += 1.0;
  else if (vixLevel >= 20) score += 0.5;
  else if (vixLevel <= 15) score -= 0.5;

  // 5. Severity of declines (0-1.5 points)
  // If declining stocks are down big, more concerning
  if (avgDecline <= -5) score += 1.5;
  else if (avgDecline <= -3) score += 1.0;
  else if (avgDecline <= -2) score += 0.5;

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

/**
 * Calculate recession score from current ticker cache
 */
function calculateFromTickerCache() {
  try {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    if (!fs.existsSync(cachePath)) return { score: 5.0, source: "default" };

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const tickers = Array.isArray(cache) ? cache : (cache.tickers || []);

    if (tickers.length === 0) return { score: 5.0, source: "default" };

    // Find SPY
    const spy = tickers.find(t => t.symbol === "SPY");
    const spyChange = spy?.changePercent || 0;

    // Calculate breadth
    const declining = tickers.filter(t => (t.changePercent || 0) < 0);
    const decliningPct = (declining.length / tickers.length) * 100;

    // Average decline
    const avgDecline = declining.length > 0
      ? declining.reduce((sum, t) => sum + (t.changePercent || 0), 0) / declining.length
      : 0;

    // Estimate volatility from extreme moves
    const extremeMoves = tickers.filter(t => Math.abs(t.changePercent || 0) > 5).length;
    const volatilityRatio = extremeMoves / tickers.length;
    const vixEstimate = 15 + volatilityRatio * 50; // Rough VIX proxy

    const marketData = {
      spyChange,
      spy30dChange: spyChange * 5, // Rough estimate (multiply daily by factor)
      decliningPct,
      avgDecline,
      vixLevel: vixEstimate
    };

    const score = calculateRecessionScore(marketData);

    return {
      score,
      source: "tickers-cache",
      data: {
        spyChange: Math.round(spyChange * 100) / 100,
        decliningPct: Math.round(decliningPct),
        avgDecline: Math.round(avgDecline * 100) / 100,
        vixEstimate: Math.round(vixEstimate),
        tickerCount: tickers.length
      },
      calculatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("[RecessionScore] Calculation error:", error.message);
    return { score: 5.0, source: "error" };
  }
}

/**
 * Get recession adjustment for a symbol
 * Returns a score modifier based on sector classification
 *
 * @param {string} symbol - Ticker symbol
 * @param {number} recessionScore - Current recession score (0-10)
 * @returns {number} Score adjustment (-2 to +2)
 */
function getRecessionAdjustment(symbol, recessionScore) {
  const normalized = symbol.toUpperCase();

  // Inverse ETFs benefit strongly from recession
  if (SECTOR_CLASSIFICATIONS.inverse.includes(normalized)) {
    // At recession 10, add +3; at recession 0, subtract -1
    return (recessionScore / 10) * 4 - 1;
  }

  // Defensive stocks benefit moderately from recession
  if (SECTOR_CLASSIFICATIONS.defensive.includes(normalized)) {
    // At recession 10, add +1.5; at recession 0, no change
    return (recessionScore / 10) * 1.5;
  }

  // Speculative stocks suffer heavily in recession
  if (SECTOR_CLASSIFICATIONS.speculative.includes(normalized)) {
    // At recession 10, subtract -2; at recession 0, no change
    return -(recessionScore / 10) * 2;
  }

  // Cyclical stocks suffer in recession
  if (SECTOR_CLASSIFICATIONS.cyclical.includes(normalized)) {
    // At recession 10, subtract -1.5; at recession 0, add +0.5 (growth premium)
    const baseBonus = 0.5; // Growth premium in good times
    const recessionPenalty = (recessionScore / 10) * 2;
    return baseBonus - recessionPenalty;
  }

  // Neutral/unknown stocks - slight negative in recession
  return -(recessionScore / 10) * 0.5;
}

/**
 * Get recession score color for display
 */
function getRecessionColor(score) {
  if (score >= 8) return "#ef4444";      // Red - full recession
  if (score >= 6) return "#f97316";      // Orange - likely recession
  if (score >= 4) return "#eab308";      // Yellow - caution
  if (score >= 2) return "#84cc16";      // Light green - mild concern
  return "#22c55e";                       // Green - booming
}

/**
 * Get recession label
 */
function getRecessionLabel(score) {
  if (score >= 8) return "RECESSION";
  if (score >= 6) return "LIKELY";
  if (score >= 4) return "CAUTION";
  if (score >= 2) return "WATCH";
  return "GROWTH";
}

/**
 * Load cached recession score
 */
function loadCachedScore() {
  try {
    if (fs.existsSync(RECESSION_CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(RECESSION_CACHE_PATH, "utf-8"));
      // Check if stale (older than 15 minutes)
      if (data.calculatedAt) {
        const age = Date.now() - new Date(data.calculatedAt).getTime();
        if (age < 15 * 60 * 1000) {
          return data;
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Save recession score to cache
 */
function saveScore(scoreData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(RECESSION_CACHE_PATH, JSON.stringify(scoreData, null, 2));
  } catch { /* ignore */ }
}

/**
 * Get macro adjustment from overnight research
 */
function getMacroAdjustment() {
  try {
    const macroPath = path.join(DATA_DIR, "macro-knowledge.json");
    if (!fs.existsSync(macroPath)) return 0;

    const macroKnowledge = JSON.parse(fs.readFileSync(macroPath, "utf-8"));
    if (!macroKnowledge.themes) return 0;

    // Macro themes with recession weights
    const themeWeights = {
      consumer_health: 0.20,
      employment: 0.25,
      fed_policy: 0.20,
      housing: 0.15,
      manufacturing: 0.10,
      tech_spending: 0.05,
      energy: 0.05
    };

    let adjustment = 0;
    let totalWeight = 0;

    for (const themeId in macroKnowledge.themes) {
      const insight = macroKnowledge.themes[themeId];
      const weight = themeWeights[themeId] || 0.05;

      // Check if insight is recent (less than 24 hours)
      const age = Date.now() - new Date(insight.timestamp);
      if (age > 24 * 60 * 60 * 1000) continue;

      // Negative sentiment = higher recession risk
      adjustment += (-insight.sentiment) * weight * insight.confidence;
      totalWeight += weight;
    }

    // Scale to -2 to +2 range
    if (totalWeight > 0) {
      return Math.max(-2, Math.min(2, (adjustment / totalWeight) * 3));
    }

    return 0;
  } catch {
    return 0;
  }
}

/**
 * Get current recession score (cached or fresh)
 */
function getRecessionScore() {
  // Check cache first
  const cached = loadCachedScore();
  if (cached) return cached;

  // Calculate fresh from ticker cache
  const fresh = calculateFromTickerCache();

  // Apply macro adjustment from overnight research
  const macroAdj = getMacroAdjustment();
  if (macroAdj !== 0) {
    fresh.score = Math.max(0, Math.min(10, fresh.score + macroAdj));
    fresh.macroAdjustment = Math.round(macroAdj * 100) / 100;
  }

  saveScore(fresh);
  return fresh;
}

// Exports
export {
  getRecessionScore,
  getRecessionAdjustment,
  getRecessionColor,
  getRecessionLabel,
  calculateRecessionScore,
  calculateFromTickerCache,
  SECTOR_CLASSIFICATIONS
};

export default getRecessionScore;
