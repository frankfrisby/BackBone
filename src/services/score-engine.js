/**
 * Comprehensive Score Engine for BACKBONE
 * Based on BackBoneApp production scoring system (https://github.com/frankfrisby/BackBoneApp)
 *
 * Score Range: 0-10 (not 0-100)
 *
 * Components:
 * - Technical Score (RSI, volatility)
 * - Prediction Score (AI model output)
 * - MACD Score (multi-timeframe momentum with slope analysis)
 * - Volume Score (sigma-based anomaly detection with direction validation)
 * - Price Position Score (60-day range - overbought/oversold)
 * - Psychological Adjustment (price momentum with breaking points at 15%/25%)
 * - Time Decay (staleness penalty - 0.6 per day, max 7 days)
 * - Earnings Proximity Boost (exponential as earnings approach)
 * - Price Movement Penalty (extreme moves -12%/-20%)
 */

import fs from "fs";
import path from "path";

// Import BackBoneApp algorithms
import {
  calculateMacdSlopeAndDirection,
  calculateEffectiveMacdScore as calcEffectiveMacdScore,
  computeFinalMacdScore,
  calculatePsychologicalAdjustment as calcPsychAdjustment,
  calculatePriceMovementPenalty as calcMovementPenalty,
  calculateEarningsScore as calcEarningsScore,
  calculatePricePositionScore as calcPricePositionScore,
  calculateVolumeScore as calcVolumeScore,
  calculateEffectiveScore as calcEffectiveScoreFull,
  TRADING_CONFIG
} from "./trading-algorithms.js";

const DATA_DIR = path.join(process.cwd(), "data");
const SCORES_PATH = path.join(DATA_DIR, "ticker-scores.json");

// Score thresholds (0-10 scale) - aligned with BackBoneApp
export const SCORE_THRESHOLDS = {
  EXTREME_BUY: 9.0,              // Auto-execute buy
  BUY: 8.0,                       // High confidence buy (SPY positive: 7.1, SPY negative: 8.0)
  BUY_SPY_POSITIVE: 7.1,          // Buy threshold when SPY is positive
  BUY_SPY_NEGATIVE: 8.0,          // Buy threshold when SPY is negative
  MODERATE_BUY: 6.5,              // Moderate buy
  HOLD_HIGH: 5.0,                 // Upper hold
  HOLD_LOW: 4.0,                  // Lower hold
  SELL: 3.0,                      // Sell signal
  TECHNICAL_OVERRIDE: 2.7,        // Sell protected positions if technicals drop here
  EXTREME_SELL: 1.5               // Auto-execute sell
};

// Signal labels and colors
export const SIGNALS = {
  EXTREME_BUY: { label: "BUY++", color: "#22c55e", bgColor: "#166534" },
  BUY: { label: "BUY", color: "#4ade80", bgColor: "#15803d" },
  MODERATE_BUY: { label: "BUY-", color: "#86efac", bgColor: null },
  HOLD: { label: "HOLD", color: "#eab308", bgColor: null },
  SELL: { label: "SELL", color: "#f97316", bgColor: null },
  EXTREME_SELL: { label: "SELL--", color: "#ef4444", bgColor: "#991b1b" }
};

/**
 * Get signal from score
 */
export const getSignalFromScore = (score) => {
  if (score >= SCORE_THRESHOLDS.EXTREME_BUY) return { ...SIGNALS.EXTREME_BUY, isTop3: true };
  if (score >= SCORE_THRESHOLDS.BUY) return { ...SIGNALS.BUY, isTop3: true };
  if (score >= SCORE_THRESHOLDS.MODERATE_BUY) return { ...SIGNALS.MODERATE_BUY, isTop3: true };
  if (score >= SCORE_THRESHOLDS.HOLD_LOW) return { ...SIGNALS.HOLD, isTop3: false };
  if (score >= SCORE_THRESHOLDS.SELL) return { ...SIGNALS.SELL, isTop3: false };
  return { ...SIGNALS.EXTREME_SELL, isTop3: false };
};

/**
 * Check if ticker qualifies as top 3 (meets buy threshold)
 */
export const isTop3Candidate = (score) => {
  return score >= SCORE_THRESHOLDS.MODERATE_BUY;
};

/**
 * Calculate Effective Score (0-10)
 * Main scoring formula from BackBoneApp production system
 *
 * Formula:
 * (tech + pred + psych)/2 + (dir × 0.2) + (pos × 0.2) - (days × 0.6)
 * + macdAdj + volumeScore + (pricePos × 1.25) + (earnings × 2.0) + movementPenalty
 */
export const calculateEffectiveScore = (inputs) => {
  // If full inputs object provided, use the comprehensive calculation
  if (inputs && typeof inputs === 'object' && 'technicalScore' in inputs) {
    return calcEffectiveScoreFull(inputs);
  }

  // Legacy parameter format for backwards compatibility
  const {
    technicalScore = 5.0,
    predictionScore = 5.5,
    macdAdjustment = 0,
    volumeScore = 0,
    pricePositionScore = 0,
    psychologicalAdjustment = 0,
    directionalBonus = 0,
    positiveBonus = 0,
    timeDecayPenalty = 0,
    earningsScore = 0,
    priceMovementPenalty = 0
  } = inputs || {};

  // Apply defaults for 0 values (per BackBoneApp logic)
  const adjTechnical = technicalScore === 0 ? 6.0 : technicalScore;
  const adjPrediction = predictionScore === 0 ? 5.5 : predictionScore;

  // Base score from technical + prediction + psychological
  const baseScore = (adjTechnical + adjPrediction + psychologicalAdjustment) / 2;

  // Apply all adjustments with BackBoneApp weights
  const rawScore = baseScore +
    Math.max(-1.0, Math.min(1.0, directionalBonus * 0.2)) +
    Math.max(-1.0, Math.min(1.0, positiveBonus * 0.2)) -
    (Math.min(7, timeDecayPenalty) * 0.6) +
    macdAdjustment +
    volumeScore +
    (pricePositionScore * 1.25) +
    (earningsScore * 2.0) +
    priceMovementPenalty;

  // Clamp to 0-10
  return Math.max(0, Math.min(10, Math.round(rawScore * 100) / 100));
};

/**
 * Calculate MACD Score (-2.5 to +2.5)
 * Multi-timeframe weighted analysis using BackBoneApp algorithms
 *
 * Supports:
 * - 6-day histogram array for slope analysis
 * - Multi-timeframe weighted score (weekly/daily/4hr)
 * - Position-in-range factor (rewards mid-range MACD positions)
 */
export const calculateMACDScore = (macdData) => {
  if (!macdData) return 0;

  // If we have histogram array, use slope-based analysis
  if (macdData.histogramArray && macdData.histogramArray.length >= 6) {
    const slopeAnalysis = calculateMacdSlopeAndDirection(macdData.histogramArray);

    if (slopeAnalysis.isValid) {
      const directionMultiplier = slopeAnalysis.direction === 'positive' ? 1 :
                                   slopeAnalysis.direction === 'negative' ? -1 : 0;
      const scaledMagnitude = Math.min(1, slopeAnalysis.magnitude * 10);
      const rawMacdAdj = directionMultiplier * scaledMagnitude;

      // Apply position-in-range factor if we have MACD line range data
      if (macdData.macdLine != null && macdData.macdLineMin != null && macdData.macdLineMax != null) {
        return calcEffectiveMacdScore(rawMacdAdj, macdData.macdLine, macdData.macdLineMin, macdData.macdLineMax);
      }

      return Math.max(-2.5, Math.min(2.5, rawMacdAdj * 2.5));
    }
  }

  // If we have weighted multi-timeframe score
  if (macdData.weightedScore != null) {
    return macdData.weightedScore * 2.5;
  }

  // Fallback to simple histogram-based scoring
  const { histogram, macd, signal, trend } = macdData;

  if (histogram == null) return 0;

  // Base MACD score from histogram
  let score = 0;

  // Histogram-based scoring
  if (histogram > 0.5) {
    score = Math.min(1, histogram / 2);
  } else if (histogram < -0.5) {
    score = Math.max(-1, histogram / 2);
  } else {
    score = histogram / 0.5 * 0.5;
  }

  // Trend confirmation bonus
  if (trend === "bullish" && macd > signal) {
    score += 0.25;
  } else if (trend === "bearish" && macd < signal) {
    score -= 0.25;
  }

  return Math.max(-2.5, Math.min(2.5, score * 2.5));
};

/**
 * Calculate Volume Sigma Score (-1.5 to +1.5)
 * Uses BackBoneApp algorithm with direction validation:
 *
 * Formula:
 * - Base: 2.5 × (enhancedSigma - 1) / 10 - 1
 * - Enhanced sigma = sigma × (1 + intradayMultiplier)
 *
 * Direction Validation:
 * - If stock declining in last 30 min (< -0.05%): force NEGATIVE volume score
 * - This prevents misleading pump signals on declining stocks
 *
 * @param {number} sigma - Volume sigma (standard deviations from mean)
 * @param {number} priceDirection - Recent price change for direction validation
 * @param {number} intradayMultiplier - Intraday volume multiplier (optional)
 */
export const calculateVolumeSigmaScore = (sigma, priceDirection = 0, intradayMultiplier = 0) => {
  return calcVolumeScore(sigma || 1, intradayMultiplier, priceDirection);
};

/**
 * Calculate 60-day Price Position Score (-1.5 to +1.5)
 * Uses BackBoneApp algorithm:
 *
 * - Near 60-day low (0-10%): +1.5 (oversold, bullish)
 * - Near 60-day high (90-100%): -1.5 (overbought, bearish)
 * - Linear interpolation between 10% and 90%
 *
 * Multiplied by 1.25 in final formula for moderate influence
 */
export const calculatePricePositionScore = (currentPrice, min60d, max60d) => {
  return calcPricePositionScore(currentPrice, min60d, max60d);
};

/**
 * Calculate Psychological Adjustment with Breaking Points
 * Uses BackBoneApp psychological zones:
 *
 * Zone 1 (0-15%): Normal momentum
 *   - Up decreases score, Down increases score
 *   - Adjustment: (absPercent / 2) × 0.5
 *
 * Zone 2 (15-25%): First reversal (momentum energy)
 *   - Beyond 15%, the effect reverses
 *
 * Zone 3 (>25%): Second reversal
 *   - Beyond 25%, reverses again
 *
 * @param {number} percentChange - Price change percentage
 * @returns {number} Adjustment value
 */
export const calculatePsychologicalAdjustment = (percentChange) => {
  return calcPsychAdjustment(percentChange || 0);
};

/**
 * Calculate Time Decay Penalty (0 to 4.2)
 */
export const calculateTimeDecayPenalty = (daysOld) => {
  if (!daysOld || daysOld <= 0) return 0;
  return Math.min(7, daysOld) * 0.6;
};

/**
 * Calculate Earnings Proximity Score (0 to 1, can be negative post-earnings)
 * Uses BackBoneApp algorithm:
 *
 * Formula (for earnings within 30 days):
 * - earningsScore = ((30 - t) / 30)^2
 *
 * Post-earnings penalty:
 * - 0-3 days after: NEGATIVE score (fades out linearly)
 *
 * Time-of-day adjustment:
 * - Before 4 PM ET: subtract 0.5 days (earnings today scores higher in morning)
 *
 * Multiplied by 2.0 in final formula for strong influence (up to +2 points)
 */
export const calculateEarningsScore = (earningsDate) => {
  // If passed as days until, convert to date
  if (typeof earningsDate === 'number') {
    const date = new Date();
    date.setDate(date.getDate() + earningsDate);
    return calcEarningsScore(date);
  }
  return calcEarningsScore(earningsDate);
};

/**
 * Calculate Price Movement Penalty (always ≤ 0)
 * Uses BackBoneApp algorithm:
 *
 * DOWN movements (negative %):
 * - -1 point at -12%
 * - -2 points at -20%
 * - Continues at -1 per 10%
 *
 * UP movements (positive %):
 * - -0.5 points at +12%
 * - -1 point at +20%
 * - Continues at half the down rate
 *
 * Examples:
 * - -5%: 0 (no penalty)
 * - -12%: -1.0
 * - -20%: -2.0
 * - +12%: -0.5
 * - +20%: -1.0
 */
export const calculatePriceMovementPenalty = (percentChange) => {
  return calcMovementPenalty(percentChange || 0);
};

/**
 * Calculate comprehensive ticker score with all components
 * Uses full BackBoneApp algorithm suite
 *
 * Inputs can include:
 * - Basic: price, changePercent, volumeSigma, macd, rsi, predictionScore
 * - Advanced: macdHistogramArray, macdLine, macdLineMin/Max, earningsDate
 * - Multi-timeframe: macdWeightedScore, macdAlignmentScore
 *
 * @param {Object} ticker - Ticker data with all available fields
 * @returns {Object} Score result with breakdown
 */
export const calculateTickerScore = (ticker) => {
  const {
    // Price data
    price,
    currentPrice,
    change,
    changePercent,

    // Volume
    volume,
    avgVolume,
    volumeSigma,
    sigmaScore,
    intradayVolumeMultiplier,
    recentPriceChange30min,

    // MACD - Basic
    macd,

    // MACD - Advanced (from BackBoneApp)
    macdHistogramArray,
    macdLine,
    macdLineMin30d,
    macdLineMax30d,
    macdLineMin120d,
    macdLineMax120d,
    improvedMacdScore,
    macdWeightedScore,
    macdAlignmentScore,

    // Technical
    rsi,

    // Price range
    min60d,
    max60d,
    price60dMin,
    price60dMax,

    // Prediction
    predictionScore,
    technicalScore: rawTechnicalScore,
    predictionDate,
    predictionAge,

    // Historical averages
    avgDirectional,
    avgPositive,

    // Earnings
    earningsDate,
    daysUntilEarnings
  } = ticker;

  // Calculate technical score from RSI if not provided
  const technicalScore = rawTechnicalScore || (rsi ? (100 - Math.abs(50 - rsi)) / 10 : 5.0);

  // Build comprehensive inputs for BackBoneApp algorithm
  const inputs = {
    technicalScore,
    predictionScore: predictionScore || 5.5,
    percentChange: changePercent || change || 0,
    avgDirectional: avgDirectional || 0,
    avgPositive: avgPositive || 0,
    predictionDate: predictionDate,
    sigmaScore: sigmaScore || volumeSigma || 1,
    intradayVolumeMultiplier: intradayVolumeMultiplier || 0,
    recentPriceChange30min: recentPriceChange30min,

    // MACD inputs (priority: multi-timeframe > improved > array > basic)
    macdWeightedScore: macdWeightedScore,
    macdAlignmentScore: macdAlignmentScore,
    improvedMacdScore: improvedMacdScore,
    macdHistogramArray: macdHistogramArray,
    macdLine: macdLine || macd?.macd,
    macdLineMin30d: macdLineMin30d,
    macdLineMax30d: macdLineMax30d,
    macdLineMin120d: macdLineMin120d,
    macdLineMax120d: macdLineMax120d,
    macd: macd?.histogram,
    macd5dAgo: macd?.histogram5dAgo,
    effectiveMacdScore: macd?.effectiveScore,

    // Price position
    currentPrice: currentPrice || price,
    price60dMin: price60dMin || min60d,
    price60dMax: price60dMax || max60d,

    // Earnings
    earningsDate: earningsDate || (daysUntilEarnings != null ? addDays(new Date(), daysUntilEarnings) : null)
  };

  // Calculate using full BackBoneApp algorithm
  const result = calcEffectiveScoreFull(inputs);

  // Get signal
  const signal = getSignalFromScore(result.effectiveScore);

  return {
    score: result.effectiveScore,
    signal,
    components: {
      technical: Math.round(result.adjustedTechnicalScore * 100) / 100,
      prediction: Math.round(result.adjustedPredictionScore * 100) / 100,
      macd: Math.round(result.macdAdjustment * 100) / 100,
      volume: Math.round(result.volumeScore * 100) / 100,
      pricePosition: Math.round(result.pricePositionScore * 100) / 100,
      psychological: Math.round(result.psychologicalAdjustment * 100) / 100,
      earnings: Math.round(result.earningsScore * 1000) / 1000,
      penalty: Math.round(result.priceMovementPenalty * 100) / 100,
      directional: Math.round(result.directionalBonus * 100) / 100,
      positive: Math.round(result.positiveBonus * 100) / 100,
      timeDecay: Math.round(result.timeDecayPenalty * 100) / 100
    },
    formula: result.formula,
    daysOld: result.daysOld
  };
};

// Helper function for date calculation
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Load saved ticker scores
 */
export const loadTickerScores = () => {
  try {
    if (fs.existsSync(SCORES_PATH)) {
      return JSON.parse(fs.readFileSync(SCORES_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load ticker scores:", error.message);
  }
  return {};
};

/**
 * Save ticker scores
 */
export const saveTickerScores = (scores) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SCORES_PATH, JSON.stringify(scores, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save ticker scores:", error.message);
    return false;
  }
};

/**
 * Rank tickers by score and identify top 3
 */
export const rankTickers = (tickers) => {
  // Sort by score descending
  const sorted = [...tickers].sort((a, b) => (b.score || 0) - (a.score || 0));

  // Mark top 3 candidates (must meet buy threshold)
  const top3 = sorted.filter(t => isTop3Candidate(t.score)).slice(0, 3);
  const top3Symbols = new Set(top3.map(t => t.symbol));

  return sorted.map((ticker, index) => ({
    ...ticker,
    rank: index + 1,
    isTop3: top3Symbols.has(ticker.symbol),
    signal: getSignalFromScore(ticker.score)
  }));
};

export default {
  SCORE_THRESHOLDS,
  SIGNALS,
  getSignalFromScore,
  isTop3Candidate,
  calculateEffectiveScore,
  calculateMACDScore,
  calculateVolumeSigmaScore,
  calculatePricePositionScore,
  calculatePsychologicalAdjustment,
  calculateTimeDecayPenalty,
  calculateEarningsScore,
  calculatePriceMovementPenalty,
  calculateTickerScore,
  loadTickerScores,
  saveTickerScores,
  rankTickers
};
