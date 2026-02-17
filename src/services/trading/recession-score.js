/**
 * Recession Score Service
 *
 * Calculates a recession probability score from 0-10 using REAL macro data:
 *
 * BACKWARD-LOOKING (market data — 40% weight):
 *   - SPY daily/trend performance
 *   - Market breadth (% declining)
 *   - VIX (actual, not estimated)
 *   - Credit stress (HYG vs LQD)
 *
 * FORWARD-LOOKING (macro indicators — 60% weight):
 *   - Yield curve (3m-10y spread, inversion)
 *   - Fed funds rate level
 *   - Consumer sentiment (Michigan)
 *   - Unemployment + jobless claims
 *   - ISM/PMI manufacturing
 *   - CPI inflation
 *   - Consumer debt levels
 *   - Housing starts
 *   - Flight to safety (TLT vs HYG)
 *   - Dollar strength
 *
 * Scale:
 *   0-1  = Strong growth, minimal risk
 *   2-3  = Normal expansion, low risk
 *   4-5  = Caution, mixed signals
 *   6-7  = Elevated risk, recession likely
 *   8-10 = Severe downturn / active recession
 *
 * Impact on individual stocks:
 *   - Defensive sectors → higher scores in recession
 *   - Growth/cyclical → lower scores in recession
 *   - Inverse ETFs → much higher scores in recession
 */

import fs from "fs";
import path from "path";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
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
 * Calculate recession score from all available data sources.
 *
 * BACKWARD-LOOKING (market data) — 40% of total
 * FORWARD-LOOKING (macro/economic) — 60% of total
 *
 * Each component scores 0-10, then weights are applied.
 */
function calculateRecessionScore(marketData = {}, macroKnowledge = null) {
  const components = {};

  // ─── BACKWARD-LOOKING: Market Data (40% weight) ───────────────

  const {
    spyChange = 0,
    decliningPct = 50,
    avgDecline = 0,
    vixLevel = null,    // null = unknown
    creditStress = 0,
    flightToSafety = false,
    hygFrom52wHigh = 0,
  } = marketData;

  // 1. VIX — actual fear gauge (0-10)
  let vixScore = 3; // default if unknown
  const vix = vixLevel ?? macroKnowledge?.hardData?.vix ?? null;
  if (vix != null) {
    if (vix >= 40) vixScore = 10;
    else if (vix >= 35) vixScore = 9;
    else if (vix >= 30) vixScore = 8;
    else if (vix >= 25) vixScore = 7;
    else if (vix >= 22) vixScore = 6;
    else if (vix >= 20) vixScore = 5;
    else if (vix >= 18) vixScore = 4;
    else if (vix >= 15) vixScore = 3;
    else if (vix >= 12) vixScore = 2;
    else vixScore = 1;
  }
  components.vix = { score: vixScore, weight: 0.10, value: vix };

  // 2. SPY daily trend (0-10)
  let spyScore = 3;
  if (spyChange <= -4) spyScore = 10;
  else if (spyChange <= -3) spyScore = 9;
  else if (spyChange <= -2) spyScore = 7.5;
  else if (spyChange <= -1) spyScore = 6;
  else if (spyChange <= -0.5) spyScore = 5;
  else if (spyChange <= 0) spyScore = 3.5;
  else if (spyChange <= 0.5) spyScore = 3;
  else if (spyChange <= 1) spyScore = 2;
  else spyScore = 1;
  components.spyDaily = { score: spyScore, weight: 0.08, value: spyChange };

  // 3. Market breadth (0-10)
  let breadthScore = 4;
  if (decliningPct >= 85) breadthScore = 10;
  else if (decliningPct >= 75) breadthScore = 8.5;
  else if (decliningPct >= 65) breadthScore = 7;
  else if (decliningPct >= 60) breadthScore = 6;
  else if (decliningPct >= 55) breadthScore = 5;
  else if (decliningPct >= 50) breadthScore = 4;
  else if (decliningPct >= 45) breadthScore = 3;
  else if (decliningPct >= 35) breadthScore = 2;
  else breadthScore = 1;
  components.breadth = { score: breadthScore, weight: 0.08, value: decliningPct };

  // 4. Credit conditions (0-10)
  let creditScore = 3;
  const cs = creditStress || macroKnowledge?.hardData?.creditConditions?.creditStress || 0;
  const hygDrop = hygFrom52wHigh || macroKnowledge?.hardData?.creditConditions?.hygFrom52wHigh || 0;
  const fts = flightToSafety || macroKnowledge?.hardData?.creditConditions?.flightToSafety || false;

  if (hygDrop <= -15) creditScore = 10;
  else if (hygDrop <= -10) creditScore = 8;
  else if (hygDrop <= -5) creditScore = 6;
  else if (hygDrop <= -3) creditScore = 5;
  else if (hygDrop <= -1) creditScore = 3.5;
  else creditScore = 2;
  if (fts) creditScore = Math.min(10, creditScore + 1.5);
  if (cs > 1) creditScore = Math.min(10, creditScore + 1);
  components.credit = { score: creditScore, weight: 0.08, value: { cs, hygDrop, fts } };

  // 5. Decline severity (0-10)
  let severityScore = 2;
  if (avgDecline <= -8) severityScore = 10;
  else if (avgDecline <= -5) severityScore = 8;
  else if (avgDecline <= -3) severityScore = 6;
  else if (avgDecline <= -2) severityScore = 4.5;
  else if (avgDecline <= -1) severityScore = 3;
  else severityScore = 2;
  components.severity = { score: severityScore, weight: 0.06, value: avgDecline };

  // ─── FORWARD-LOOKING: Macro Indicators (60% weight) ──────────

  const soft = macroKnowledge?.softIndicators || {};
  const hard = macroKnowledge?.hardData || {};

  // 6. Yield curve — most reliable recession predictor (0-10)
  let yieldScore = 4; // default neutral
  const yc = hard.yieldCurve;
  if (yc) {
    const spread = yc.spreads?.["3m_10y"];
    if (spread != null) {
      if (spread <= -1.5) yieldScore = 10;       // Deeply inverted
      else if (spread <= -1.0) yieldScore = 9;
      else if (spread <= -0.5) yieldScore = 8;
      else if (spread <= -0.2) yieldScore = 7;
      else if (spread <= 0) yieldScore = 6;       // Flat/barely inverted
      else if (spread <= 0.3) yieldScore = 5;
      else if (spread <= 0.75) yieldScore = 4;
      else if (spread <= 1.5) yieldScore = 2.5;
      else yieldScore = 1;                        // Steep positive = growth
    }
  }
  components.yieldCurve = { score: yieldScore, weight: 0.15, value: yc?.spreads?.["3m_10y"] };

  // 7. Fed funds rate — higher = more restrictive (0-10)
  let fedScore = 4;
  const fedRate = soft.fedFundsRate;
  if (fedRate != null) {
    if (fedRate >= 6.0) fedScore = 9;
    else if (fedRate >= 5.5) fedScore = 8;
    else if (fedRate >= 5.0) fedScore = 7;
    else if (fedRate >= 4.5) fedScore = 6;
    else if (fedRate >= 4.0) fedScore = 5;
    else if (fedRate >= 3.0) fedScore = 4;
    else if (fedRate >= 2.0) fedScore = 3;
    else if (fedRate >= 1.0) fedScore = 2;
    else fedScore = 1;
  }
  components.fedRate = { score: fedScore, weight: 0.10, value: fedRate };

  // 8. Consumer sentiment — lower = more pessimistic (0-10)
  let sentimentScore = 4;
  const sentiment = soft.consumerSentiment;
  if (sentiment != null) {
    if (sentiment <= 50) sentimentScore = 10;
    else if (sentiment <= 55) sentimentScore = 8.5;
    else if (sentiment <= 60) sentimentScore = 7;
    else if (sentiment <= 65) sentimentScore = 6;
    else if (sentiment <= 70) sentimentScore = 5;
    else if (sentiment <= 80) sentimentScore = 3.5;
    else if (sentiment <= 90) sentimentScore = 2;
    else sentimentScore = 1;
  }
  components.consumerSentiment = { score: sentimentScore, weight: 0.08, value: sentiment };

  // 9. Unemployment + jobless claims (0-10)
  let jobsScore = 3;
  const unemployment = soft.unemploymentRate;
  const claims = soft.initialJoblessClaims;
  if (unemployment != null) {
    if (unemployment >= 7.0) jobsScore = 10;
    else if (unemployment >= 6.0) jobsScore = 8.5;
    else if (unemployment >= 5.0) jobsScore = 7;
    else if (unemployment >= 4.5) jobsScore = 5.5;
    else if (unemployment >= 4.0) jobsScore = 4;
    else if (unemployment >= 3.5) jobsScore = 3;
    else jobsScore = 2;
  }
  if (claims != null) {
    if (claims >= 350000) jobsScore = Math.min(10, jobsScore + 2);
    else if (claims >= 300000) jobsScore = Math.min(10, jobsScore + 1.5);
    else if (claims >= 250000) jobsScore = Math.min(10, jobsScore + 0.5);
  }
  components.employment = { score: jobsScore, weight: 0.08, value: { unemployment, claims } };

  // 10. ISM Manufacturing PMI (0-10) — below 50 = contraction
  let pmiScore = 4;
  const pmi = soft.ismManufacturing;
  if (pmi != null) {
    if (pmi <= 42) pmiScore = 10;
    else if (pmi <= 45) pmiScore = 8;
    else if (pmi <= 47) pmiScore = 7;
    else if (pmi <= 49) pmiScore = 6;
    else if (pmi <= 50) pmiScore = 5;
    else if (pmi <= 52) pmiScore = 4;
    else if (pmi <= 55) pmiScore = 2.5;
    else pmiScore = 1;
  }
  components.manufacturing = { score: pmiScore, weight: 0.06, value: pmi };

  // 11. CPI / Inflation (0-10) — high inflation erodes growth
  let inflationScore = 3;
  const cpi = soft.cpiYoY;
  if (cpi != null) {
    if (cpi >= 8) inflationScore = 9;
    else if (cpi >= 6) inflationScore = 7.5;
    else if (cpi >= 5) inflationScore = 6;
    else if (cpi >= 4) inflationScore = 5;
    else if (cpi >= 3) inflationScore = 4;
    else if (cpi >= 2) inflationScore = 2.5;
    else inflationScore = 2; // Deflation risk
  }
  components.inflation = { score: inflationScore, weight: 0.05, value: cpi };

  // 12. Housing (0-10)
  let housingScore = 4;
  const housing = soft.housingStarts;
  if (housing != null) {
    if (housing <= 800) housingScore = 10;
    else if (housing <= 1000) housingScore = 8;
    else if (housing <= 1100) housingScore = 6;
    else if (housing <= 1200) housingScore = 5;
    else if (housing <= 1400) housingScore = 3.5;
    else if (housing <= 1600) housingScore = 2;
    else housingScore = 1;
  }
  components.housing = { score: housingScore, weight: 0.05, value: housing };

  // 13. Consumer debt (0-10) — higher = more fragile
  let debtScore = 4;
  const debt = soft.consumerDebtTrillion;
  if (debt != null) {
    if (debt >= 20) debtScore = 9;
    else if (debt >= 18) debtScore = 7;
    else if (debt >= 17) debtScore = 6;
    else if (debt >= 16) debtScore = 5;
    else if (debt >= 14) debtScore = 3.5;
    else debtScore = 2;
  }
  components.consumerDebt = { score: debtScore, weight: 0.05, value: debt };

  // 14. Dollar strength (0-10) — rising dollar = stress
  let dollarScore = 3;
  const dollarChg = hard.dollarChange || 0;
  if (dollarChg >= 2) dollarScore = 8;
  else if (dollarChg >= 1) dollarScore = 6;
  else if (dollarChg >= 0.3) dollarScore = 4.5;
  else if (dollarChg >= 0) dollarScore = 3;
  else if (dollarChg >= -0.5) dollarScore = 2.5;
  else dollarScore = 2;
  components.dollar = { score: dollarScore, weight: 0.03, value: dollarChg };

  // ─── WEIGHTED AVERAGE ─────────────────────────────────────────

  let totalScore = 0;
  let totalWeight = 0;
  for (const key of Object.keys(components)) {
    const c = components[key];
    totalScore += c.score * c.weight;
    totalWeight += c.weight;
  }

  // Normalize (weights should sum to ~1.0 but normalize just in case)
  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 4.0;

  return {
    score: Math.max(0, Math.min(10, Math.round(finalScore * 10) / 10)),
    components,
    totalWeight: Math.round(totalWeight * 100) / 100,
  };
}

/**
 * Calculate recession score from current ticker cache + macro knowledge
 */
function calculateFromTickerCache() {
  try {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    if (!fs.existsSync(cachePath)) return { score: 4.0, source: "default" };

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const tickers = Array.isArray(cache) ? cache : (cache.tickers || []);

    if (tickers.length === 0) return { score: 4.0, source: "default" };

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

    // Load macro knowledge (from macro-research.js)
    let macroKnowledge = null;
    try {
      const macroPath = path.join(DATA_DIR, "macro-knowledge.json");
      if (fs.existsSync(macroPath)) {
        macroKnowledge = JSON.parse(fs.readFileSync(macroPath, "utf-8"));
      }
    } catch {}

    const marketData = {
      spyChange,
      decliningPct,
      avgDecline,
      vixLevel: null, // Let calculateRecessionScore read from macroKnowledge
    };

    const result = calculateRecessionScore(marketData, macroKnowledge);

    return {
      score: result.score,
      source: macroKnowledge ? "tickers+macro" : "tickers-only",
      components: result.components,
      data: {
        spyChange: Math.round(spyChange * 100) / 100,
        decliningPct: Math.round(decliningPct),
        avgDecline: Math.round(avgDecline * 100) / 100,
        vix: macroKnowledge?.hardData?.vix || null,
        hasMacroData: !!macroKnowledge,
        macroAge: macroKnowledge?.fetchedAt ? Math.round((Date.now() - new Date(macroKnowledge.fetchedAt).getTime()) / 60000) + "m" : null,
        softDataAge: macroKnowledge?.softIndicators?.fetchedAt ? Math.round((Date.now() - new Date(macroKnowledge.softIndicators.fetchedAt).getTime()) / 60000) + "m" : null,
        tickerCount: tickers.length
      },
      calculatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("[RecessionScore] Calculation error:", error.message);
    return { score: 4.0, source: "error" };
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

// ─── RECESSION HISTORY + FORWARD PROJECTION ─────────────────────

const RECESSION_HISTORY_PATH = path.join(DATA_DIR, "recession-history.json");
const MAX_HISTORY = 90; // Keep 90 data points (~90 calculations over days)

/**
 * Load recession score history
 */
function loadHistory() {
  try {
    if (fs.existsSync(RECESSION_HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(RECESSION_HISTORY_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * Append a score to history (deduplicated by hour)
 */
function appendHistory(score, calculatedAt) {
  try {
    const history = loadHistory();
    const hourKey = new Date(calculatedAt).toISOString().slice(0, 13); // "2026-02-12T23"

    // Don't duplicate the same hour
    if (history.length > 0) {
      const lastHour = new Date(history[history.length - 1].at).toISOString().slice(0, 13);
      if (lastHour === hourKey) return;
    }

    history.push({ score, at: calculatedAt });

    // Trim to max
    while (history.length > MAX_HISTORY) history.shift();

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RECESSION_HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch { /* ignore */ }
}

/**
 * Calculate recession trend and forward projection.
 *
 * Uses linear regression on recent history to determine:
 * - trend: "improving" | "worsening" | "stable"
 * - velocity: rate of change per day
 * - projection30d: projected score in 30 days
 * - projectionArrow: ↓ ↘ → ↗ ↑ based on projected direction
 */
function calculateProjection() {
  const history = loadHistory();
  if (history.length < 3) return null; // Need at least 3 data points

  // Use last 14 data points (roughly 2 weeks)
  const recent = history.slice(-14);
  const n = recent.length;

  // Linear regression: score = a + b*t (t in days from first point)
  const t0 = new Date(recent[0].at).getTime();
  const points = recent.map(h => ({
    t: (new Date(h.at).getTime() - t0) / (24 * 60 * 60 * 1000), // days
    score: h.score,
  }));

  const sumT = points.reduce((s, p) => s + p.t, 0);
  const sumS = points.reduce((s, p) => s + p.score, 0);
  const sumTS = points.reduce((s, p) => s + p.t * p.score, 0);
  const sumT2 = points.reduce((s, p) => s + p.t * p.t, 0);

  const meanT = sumT / n;
  const meanS = sumS / n;

  const denom = sumT2 - n * meanT * meanT;
  if (Math.abs(denom) < 0.001) {
    // Flat — no slope
    return {
      trend: "stable",
      velocity: 0,
      currentScore: recent[recent.length - 1].score,
      projection30d: recent[recent.length - 1].score,
      projectionArrow: "→",
      dataPoints: n,
    };
  }

  const slope = (sumTS - n * meanT * meanS) / denom; // score change per day
  const currentScore = recent[recent.length - 1].score;

  // Project 30 days forward (clamped 0-10)
  const projected = Math.max(0, Math.min(10, currentScore + slope * 30));
  const delta = projected - currentScore;

  let trend = "stable";
  if (delta >= 0.5) trend = "worsening";
  else if (delta <= -0.5) trend = "improving";

  // Arrow: recession risk direction (higher = worse, so ↑ = worsening)
  let arrow = "→";
  if (delta >= 1.5) arrow = "↑";       // risk rising fast
  else if (delta >= 0.5) arrow = "↗";  // risk rising
  else if (delta <= -1.5) arrow = "↓"; // risk falling fast
  else if (delta <= -0.5) arrow = "↘"; // risk falling

  return {
    trend,
    velocity: Math.round(slope * 1000) / 1000, // score/day
    currentScore,
    projection30d: Math.round(projected * 10) / 10,
    projectionArrow: arrow,
    dataPoints: n,
  };
}


/**
 * Get current recession score (cached or fresh)
 * Macro data is now integrated directly into calculateRecessionScore()
 * via the macroKnowledge parameter loaded in calculateFromTickerCache().
 */
function getRecessionScore() {
  // Check cache first
  const cached = loadCachedScore();
  if (cached) return cached;

  // Calculate fresh from ticker cache + macro knowledge
  const fresh = calculateFromTickerCache();

  // Track history for forward projection
  appendHistory(fresh.score, fresh.calculatedAt || new Date().toISOString());

  // Add forward projection
  const projection = calculateProjection();
  if (projection) {
    fresh.projection = projection;
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
  calculateProjection,
  SECTOR_CLASSIFICATIONS
};

export default getRecessionScore;
