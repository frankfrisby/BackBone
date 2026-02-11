/**
 * Macro Economic Research Service
 *
 * Fetches real forward-looking economic data for recession probability:
 *
 * Hard data (from Yahoo Finance):
 *   - Treasury yields: 2Y, 5Y, 10Y, 30Y → yield curve shape
 *   - VIX: actual volatility index
 *   - Credit ETFs: HYG (high yield), LQD (investment grade) → credit spreads
 *   - TLT (long bonds) → flight to safety signal
 *   - DXY/UUP (dollar strength) → stress indicator
 *
 * Soft data (from web research, cached):
 *   - Consumer sentiment (Michigan/Conference Board)
 *   - Initial jobless claims
 *   - ISM/PMI manufacturing
 *   - Housing starts
 *   - Fed funds rate expectations
 *   - Consumer/corporate debt levels
 *
 * Output: macro-knowledge.json with structured data for recession-score.js
 */

import fs from "fs";
import path from "path";
import { getDataDir, dataFile } from "../paths.js";

const MACRO_CACHE_PATH = dataFile("macro-knowledge.json");
const MACRO_CACHE_MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours for hard data
const SOFT_DATA_MAX_AGE = 24 * 60 * 60 * 1000;   // 24 hours for soft data (changes slowly)

// Yahoo Finance macro tickers
const MACRO_TICKERS = {
  // Treasury yields (Yahoo uses ^TNX format, price = yield %)
  "^IRX": "yield_3m",    // 3-month T-bill
  "^FVX": "yield_5y",    // 5-year Treasury
  "^TNX": "yield_10y",   // 10-year Treasury
  "^TYX": "yield_30y",   // 30-year Treasury
  // Volatility
  "^VIX": "vix",
  // Credit / Bond ETFs
  "HYG":  "hyg",         // iShares High Yield Corporate Bond
  "LQD":  "lqd",         // iShares Investment Grade Corporate Bond
  "TLT":  "tlt",         // iShares 20+ Year Treasury Bond
  // Dollar
  "UUP":  "dollar",      // Invesco DB US Dollar Index
  // Market breadth
  "SPY":  "spy",
  "RSP":  "rsp",         // Equal-weight S&P 500 (breadth indicator)
};

/**
 * Fetch a single ticker directly from Yahoo Finance chart API.
 * Bypasses the local server which only tracks stock/ETF universe.
 * Works for indices (^VIX, ^TNX) and ETFs (HYG, TLT).
 */
async function fetchFromYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  if (!response.ok) return null;

  const data = await response.json();
  const result = data.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = quotes.close?.filter(c => c !== null) || [];
  const highs = quotes.high?.filter(h => h !== null) || [];
  const lows = quotes.low?.filter(l => l !== null) || [];

  const previousClose = closes.length > 1 ? closes[closes.length - 2] : meta.chartPreviousClose;
  const currentPrice = meta.regularMarketPrice;
  const change = currentPrice - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  // Calculate 52-week high/low from ~3 months of data (approximation)
  const high52w = highs.length > 0 ? Math.max(...highs) : null;
  const low52w = lows.length > 0 ? Math.min(...lows) : null;

  return {
    symbol: meta.symbol,
    price: currentPrice,
    change,
    changePercent,
    previousClose,
    high52w,
    low52w,
  };
}

/**
 * Fetch macro tickers directly from Yahoo Finance API.
 * Uses direct API calls (not the local server) so indices like ^VIX, ^TNX work.
 */
async function fetchMacroTickers() {
  const results = {};
  const symbols = Object.keys(MACRO_TICKERS);

  // Fetch all in parallel batches of 4 (rate limit friendly)
  for (let i = 0; i < symbols.length; i += 4) {
    const batch = symbols.slice(i, i + 4);
    const promises = batch.map(async (sym) => {
      try {
        const data = await fetchFromYahoo(sym);
        if (data) {
          const key = MACRO_TICKERS[sym];
          results[key] = {
            symbol: sym,
            price: data.price,
            change: data.change,
            changePercent: data.changePercent,
            previousClose: data.previousClose,
            high52w: data.high52w,
            low52w: data.low52w,
            fetchedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.error(`[MacroResearch] Failed to fetch ${sym}:`, err.message);
      }
    });
    await Promise.all(promises);

    // Small delay between batches to avoid rate limiting
    if (i + 4 < symbols.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Calculate yield curve metrics from treasury data
 */
function analyzeYieldCurve(macroData) {
  const y3m = macroData.yield_3m?.price;
  const y5y = macroData.yield_5y?.price;
  const y10y = macroData.yield_10y?.price;
  const y30y = macroData.yield_30y?.price;

  if (!y10y) return null;

  // 2Y not directly available from Yahoo as ^TNX is 10Y
  // Use 3M-10Y spread (more predictive of recession than 2-10)
  const spread_3m_10y = y3m != null ? (y10y - y3m) : null;
  const spread_10y_30y = y30y != null ? (y30y - y10y) : null;
  const spread_5y_30y = (y5y != null && y30y != null) ? (y30y - y5y) : null;

  // Inverted yield curve = recession signal
  const isInverted = spread_3m_10y != null && spread_3m_10y < 0;
  const inversionDepth = spread_3m_10y != null ? Math.min(0, spread_3m_10y) : 0;

  return {
    yields: { y3m, y5y, y10y, y30y },
    spreads: {
      "3m_10y": spread_3m_10y != null ? Math.round(spread_3m_10y * 100) / 100 : null,
      "10y_30y": spread_10y_30y != null ? Math.round(spread_10y_30y * 100) / 100 : null,
      "5y_30y": spread_5y_30y != null ? Math.round(spread_5y_30y * 100) / 100 : null,
    },
    isInverted,
    inversionDepth: Math.round(inversionDepth * 100) / 100,
  };
}

/**
 * Analyze credit conditions from bond ETFs
 */
function analyzeCreditConditions(macroData) {
  const hyg = macroData.hyg;  // High yield (junk bonds)
  const lqd = macroData.lqd;  // Investment grade
  const tlt = macroData.tlt;  // Long treasuries

  if (!hyg || !lqd) return null;

  // HYG falling while TLT rising = flight to safety (recession signal)
  const hygChange = hyg.changePercent || 0;
  const lqdChange = lqd.changePercent || 0;
  const tltChange = tlt?.changePercent || 0;

  // Credit stress: HYG underperforming LQD means junk bonds selling off
  const creditStress = lqdChange - hygChange;

  // Flight to safety: TLT rising while HYG falling
  const flightToSafety = tltChange > 0 && hygChange < 0;

  // HYG distance from 52-week high (bigger drop = more stress)
  const hygFrom52wHigh = hyg.high52w ? ((hyg.price - hyg.high52w) / hyg.high52w) * 100 : 0;

  return {
    hygChange: Math.round(hygChange * 100) / 100,
    lqdChange: Math.round(lqdChange * 100) / 100,
    tltChange: Math.round(tltChange * 100) / 100,
    creditStress: Math.round(creditStress * 100) / 100,
    flightToSafety,
    hygFrom52wHigh: Math.round(hygFrom52wHigh * 10) / 10,
  };
}

/**
 * Fetch a FRED series value (Federal Reserve Economic Data).
 * Requires API key stored in data/fred-config.json.
 * Free keys: https://fred.stlouisfed.org/docs/api/api_key.html
 */
async function fetchFredSeries(seriesId, apiKey) {
  if (!apiKey) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&file_type=json&api_key=${apiKey}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "BACKBONE-Engine/1.0" }
    });
    if (!response.ok) return null;
    const data = await response.json();
    const val = data.observations?.[0]?.value;
    return val && val !== "." ? parseFloat(val) : null;
  } catch {
    return null;
  }
}

/**
 * Load FRED API key from config
 */
function getFredApiKey() {
  try {
    const configPath = path.join(getDataDir(), "fred-config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return config.apiKey || null;
    }
  } catch {}
  return null;
}

/**
 * Fetch soft economic indicators using a three-tier strategy:
 *
 * 1. FRED API (if API key configured in data/fred-config.json)
 * 2. Derive from hard data (fed rate from 3m T-bill yield)
 * 3. Claude Code CLI web research (when running inside CLI)
 *
 * These change slowly (weekly/monthly) so we cache for 24 hours.
 */
async function fetchSoftIndicators(existingData, forceRefresh = false) {
  // Check if soft data is still fresh (skip check if forceRefresh or if data has all nulls)
  if (!forceRefresh && existingData?.softIndicators?.fetchedAt) {
    const age = Date.now() - new Date(existingData.softIndicators.fetchedAt).getTime();
    const hasData = Object.entries(existingData.softIndicators)
      .some(([k, v]) => k !== "fetchedAt" && v != null);
    if (age < SOFT_DATA_MAX_AGE && hasData) {
      return existingData.softIndicators;
    }
  }

  const indicators = {
    fetchedAt: new Date().toISOString(),
    consumerSentiment: null,
    initialJoblessClaims: null,
    ismManufacturing: null,
    fedFundsRate: null,
    cpiYoY: null,
    unemploymentRate: null,
    consumerDebtTrillion: null,
    housingStarts: null,
  };

  // ── Tier 1: FRED API (if key available) ──────────────────────
  const fredKey = getFredApiKey();
  if (fredKey) {
    console.log("[MacroResearch] Fetching soft indicators from FRED API...");
    const [sentiment, claims, fedRate, unemployment, housing, consumerCredit] = await Promise.all([
      fetchFredSeries("UMCSENT", fredKey),
      fetchFredSeries("ICSA", fredKey),
      fetchFredSeries("FEDFUNDS", fredKey),
      fetchFredSeries("UNRATE", fredKey),
      fetchFredSeries("HOUST", fredKey),
      fetchFredSeries("TOTALSL", fredKey),
    ]);

    if (sentiment != null) indicators.consumerSentiment = sentiment;
    if (claims != null) indicators.initialJoblessClaims = claims * 1000;
    if (fedRate != null) indicators.fedFundsRate = fedRate;
    if (unemployment != null) indicators.unemploymentRate = unemployment;
    if (housing != null) indicators.housingStarts = housing;
    if (consumerCredit != null) indicators.consumerDebtTrillion = Math.round(consumerCredit / 100) / 10;

    const fredHits = [sentiment, claims, fedRate, unemployment, housing, consumerCredit].filter(v => v != null).length;
    console.log(`[MacroResearch] FRED returned ${fredHits}/6 indicators`);
  }

  // ── Tier 2: Derive from hard data ───────────────────────────
  // The 3-month T-bill yield closely tracks the fed funds rate
  if (indicators.fedFundsRate == null) {
    try {
      const macroPath = path.join(getDataDir(), "macro-knowledge.json");
      if (fs.existsSync(macroPath)) {
        const cached = JSON.parse(fs.readFileSync(macroPath, "utf-8"));
        const y3m = cached.rawTickers?.yield_3m?.price;
        if (y3m != null) {
          // T-bill yield is very close to effective fed funds rate
          indicators.fedFundsRate = Math.round(y3m * 100) / 100;
          console.log(`[MacroResearch] Derived fed rate from 3m T-bill: ${indicators.fedFundsRate}%`);
        }
      }
    } catch {}
  }

  // ── Tier 3: Claude Code CLI for remaining gaps ──────────────
  try {
    const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");
    const missing = [];
    if (indicators.consumerSentiment == null) missing.push('"consumerSentiment": <University of Michigan Consumer Sentiment Index, number>');
    if (indicators.ismManufacturing == null) missing.push('"ismManufacturing": <ISM Manufacturing PMI, number>');
    if (indicators.cpiYoY == null) missing.push('"cpiYoY": <CPI year-over-year %, number>');
    if (indicators.unemploymentRate == null) missing.push('"unemploymentRate": <unemployment rate %, number>');
    if (indicators.initialJoblessClaims == null) missing.push('"initialJoblessClaims": <weekly initial jobless claims, number>');
    if (indicators.housingStarts == null) missing.push('"housingStarts": <housing starts in thousands SAAR, number>');
    if (indicators.consumerDebtTrillion == null) missing.push('"consumerDebtTrillion": <total US consumer debt in trillions, number>');

    if (missing.length > 0) {
      console.log(`[MacroResearch] Asking CLI for ${missing.length} missing indicators...`);
      const prompt = `Return ONLY valid JSON with these current US economic indicators (most recently published values). No explanation, just JSON:\n{\n  ${missing.join(",\n  ")}\n}`;
      const result = await runClaudeCodePrompt(prompt, { timeout: 45000 });
      if (result.success && result.output) {
        const jsonMatch = result.output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const [k, v] of Object.entries(parsed)) {
            if (v != null && typeof v === "number" && indicators[k] == null) {
              indicators[k] = v;
            }
          }
        }
      }
    }
  } catch {
    // Claude Code CLI not available outside CLI environment — expected
  }

  // Log final state
  const filled = Object.entries(indicators).filter(([k, v]) => k !== "fetchedAt" && v != null).length;
  const total = Object.keys(indicators).length - 1; // exclude fetchedAt
  console.log(`[MacroResearch] Soft indicators: ${filled}/${total} populated`);

  return indicators;
}

/**
 * Run full macro research cycle
 * Returns structured macro knowledge
 */
export async function runMacroResearch(options = {}) {
  const { forceRefresh = false } = options;

  console.log("[MacroResearch] Starting macro research cycle...");

  // Load existing data
  let existing = null;
  try {
    if (fs.existsSync(MACRO_CACHE_PATH)) {
      existing = JSON.parse(fs.readFileSync(MACRO_CACHE_PATH, "utf-8"));

      // Check if hard data is still fresh
      if (!forceRefresh && existing.fetchedAt) {
        const age = Date.now() - new Date(existing.fetchedAt).getTime();
        if (age < MACRO_CACHE_MAX_AGE) {
          console.log("[MacroResearch] Cache is fresh, skipping hard data refresh");
          // Still try soft indicators
          if (!existing.softIndicators?.fetchedAt ||
              (Date.now() - new Date(existing.softIndicators.fetchedAt).getTime()) > SOFT_DATA_MAX_AGE) {
            existing.softIndicators = await fetchSoftIndicators(existing);
            saveMacroData(existing);
          }
          return existing;
        }
      }
    }
  } catch {}

  // 1. Fetch hard data from Yahoo Finance
  console.log("[MacroResearch] Fetching macro tickers from Yahoo Finance...");
  const macroData = await fetchMacroTickers();

  // 2. Analyze yield curve
  const yieldCurve = analyzeYieldCurve(macroData);
  console.log("[MacroResearch] Yield curve:", yieldCurve ?
    `3m-10y spread: ${yieldCurve.spreads["3m_10y"]}%, inverted: ${yieldCurve.isInverted}` :
    "no data");

  // 3. Analyze credit conditions
  const creditConditions = analyzeCreditConditions(macroData);
  console.log("[MacroResearch] Credit:", creditConditions ?
    `stress: ${creditConditions.creditStress}, flight-to-safety: ${creditConditions.flightToSafety}` :
    "no data");

  // 4. Get VIX
  const vix = macroData.vix?.price || null;
  console.log("[MacroResearch] VIX:", vix);

  // 5. Market breadth (SPY vs RSP divergence)
  const spyChange = macroData.spy?.changePercent || 0;
  const rspChange = macroData.rsp?.changePercent || 0;
  const breadthDivergence = spyChange - rspChange; // Positive = large caps leading (narrow breadth)

  // 6. Dollar strength
  const dollarChange = macroData.dollar?.changePercent || 0;

  // 7. Fetch soft indicators (cached 24h)
  console.log("[MacroResearch] Fetching soft economic indicators...");
  const softIndicators = await fetchSoftIndicators(existing, forceRefresh);

  const result = {
    fetchedAt: new Date().toISOString(),
    hardData: {
      yieldCurve,
      creditConditions,
      vix,
      spyChange: Math.round(spyChange * 100) / 100,
      rspChange: Math.round(rspChange * 100) / 100,
      breadthDivergence: Math.round(breadthDivergence * 100) / 100,
      dollarChange: Math.round(dollarChange * 100) / 100,
    },
    softIndicators,
    rawTickers: macroData,
  };

  // Save to cache
  saveMacroData(result);
  console.log("[MacroResearch] Macro research complete. Saved to macro-knowledge.json");

  return result;
}

/**
 * Save macro data to cache file
 */
function saveMacroData(data) {
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MACRO_CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[MacroResearch] Save failed:", err.message);
  }
}

/**
 * Load cached macro data
 */
export function loadMacroData() {
  try {
    if (fs.existsSync(MACRO_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(MACRO_CACHE_PATH, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Check if macro data needs refresh
 */
export function needsRefresh() {
  const data = loadMacroData();
  if (!data?.fetchedAt) return true;
  const age = Date.now() - new Date(data.fetchedAt).getTime();
  return age > MACRO_CACHE_MAX_AGE;
}

export default runMacroResearch;
