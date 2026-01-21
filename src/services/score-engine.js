/**
 * Comprehensive Score Engine for BACKBONE
 * Based on CofounderAGI production scoring system
 *
 * Score Range: 0-10 (not 0-100)
 *
 * Components:
 * - Technical Score (RSI, volatility)
 * - Prediction Score (AI model output)
 * - MACD Score (multi-timeframe momentum)
 * - Volume Score (sigma-based anomaly detection)
 * - Price Position Score (60-day range)
 * - Psychological Adjustment (price momentum)
 * - Time Decay (staleness penalty)
 * - Earnings Proximity Boost
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SCORES_PATH = path.join(DATA_DIR, "ticker-scores.json");

// Score thresholds (0-10 scale)
export const SCORE_THRESHOLDS = {
  EXTREME_BUY: 9.0,    // Auto-execute buy
  BUY: 7.0,            // High confidence buy
  MODERATE_BUY: 6.0,   // Moderate buy
  HOLD_HIGH: 5.0,      // Upper hold
  HOLD_LOW: 4.0,       // Lower hold
  SELL: 3.0,           // Sell signal
  EXTREME_SELL: 1.5    // Auto-execute sell
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
 * Main scoring formula from CofounderAGI
 */
export const calculateEffectiveScore = ({
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
}) => {
  // Base score from technical + prediction + psychological
  const baseScore = (technicalScore + predictionScore + psychologicalAdjustment) / 2;

  // Apply all adjustments
  const rawScore = baseScore +
    (directionalBonus * 0.2) +
    (positiveBonus * 0.2) -
    (timeDecayPenalty * 0.6) +
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
 * Multi-timeframe weighted analysis
 */
export const calculateMACDScore = (macdData) => {
  if (!macdData || macdData.histogram === null) return 0;

  const { histogram, macd, signal, trend } = macdData;

  // Base MACD score from histogram
  let score = 0;

  // Histogram-based scoring
  if (histogram > 0.5) {
    score = Math.min(1, histogram / 2); // Cap at 1
  } else if (histogram < -0.5) {
    score = Math.max(-1, histogram / 2); // Cap at -1
  } else {
    score = histogram / 0.5 * 0.5; // Scale smaller values
  }

  // Trend confirmation bonus
  if (trend === "bullish" && macd > signal) {
    score += 0.25;
  } else if (trend === "bearish" && macd < signal) {
    score -= 0.25;
  }

  // Multiply by 2.5 for final range
  return Math.max(-2.5, Math.min(2.5, score * 2.5));
};

/**
 * Calculate Volume Sigma Score (-1.5 to +1.5)
 */
export const calculateVolumeSigmaScore = (sigma, priceDirection = 0) => {
  if (!sigma || sigma === 1) return 0;

  // Base formula: 2.5 × (sigma - 1) / 10 - 1
  let score = 2.5 * (sigma - 1) / 10;

  // Validation: Only positive if not declining
  if (score > 0 && priceDirection < 0) {
    score = score * 0.3; // Dampen positive volume on declining price
  }

  return Math.max(-1.5, Math.min(1.5, score));
};

/**
 * Calculate Price Position Score (-1.5 to +1.5)
 * Based on 60-day price range
 */
export const calculatePricePositionScore = (currentPrice, min60d, max60d) => {
  if (!currentPrice || !min60d || !max60d || max60d === min60d) return 0;

  const position = (currentPrice - min60d) / (max60d - min60d);

  // Oversold (bullish) vs overbought (bearish)
  if (position <= 0.1) return 1.5;  // Deeply oversold - bullish
  if (position >= 0.9) return -1.5; // Deeply overbought - bearish

  // Linear interpolation between
  return 1.5 - (position * 3);
};

/**
 * Calculate Psychological Adjustment (-3.5 to +3.5)
 * Based on price momentum
 */
export const calculatePsychologicalAdjustment = (percentChange) => {
  if (!percentChange) return 0;

  const absPercent = Math.abs(percentChange);
  const direction = percentChange >= 0 ? 1 : -1;

  let adjustment = 0;
  if (absPercent < 1) adjustment = 0;
  else if (absPercent < 3) adjustment = (absPercent - 1) / 2 * 1.5;
  else if (absPercent < 5) adjustment = 1.5;
  else if (absPercent < 10) adjustment = 2.0;
  else if (absPercent < 15) adjustment = 3.0;
  else adjustment = 3.5;

  return adjustment * direction;
};

/**
 * Calculate Time Decay Penalty (0 to 4.2)
 */
export const calculateTimeDecayPenalty = (daysOld) => {
  if (!daysOld || daysOld <= 0) return 0;
  return Math.min(7, daysOld) * 0.6;
};

/**
 * Calculate Earnings Score (0 to 1)
 */
export const calculateEarningsScore = (daysUntilEarnings) => {
  if (daysUntilEarnings === null || daysUntilEarnings === undefined) return 0;
  if (daysUntilEarnings > 30) return 0;
  if (daysUntilEarnings < 0 && daysUntilEarnings >= -3) {
    // Post-earnings penalty (fades out)
    return (daysUntilEarnings / 3) * 0.5;
  }
  if (daysUntilEarnings < 0) return 0;

  // Exponential approach as earnings near
  return Math.pow((30 - daysUntilEarnings) / 30, 2);
};

/**
 * Calculate Price Movement Penalty (-3 to 0)
 */
export const calculatePriceMovementPenalty = (percentChange) => {
  if (!percentChange) return 0;

  const absPercent = Math.abs(percentChange);

  if (absPercent < 12) return 0;

  if (percentChange < 0) {
    // Down movements (starting at 12% decline)
    return Math.max(-3, -1 - (absPercent - 12) / 10);
  } else {
    // Up movements (half the rate)
    return Math.max(-1.5, -0.5 - (absPercent - 12) / 20);
  }
};

/**
 * Calculate comprehensive ticker score with all components
 */
export const calculateTickerScore = (ticker) => {
  const {
    price,
    change,
    changePercent,
    volume,
    avgVolume,
    volumeSigma,
    macd,
    rsi,
    min60d,
    max60d,
    predictionScore,
    daysUntilEarnings,
    predictionAge
  } = ticker;

  // Calculate individual components
  const technicalScore = rsi ? (100 - Math.abs(50 - rsi)) / 10 : 5.0;
  const macdAdjustment = calculateMACDScore(macd);
  const volumeScore = calculateVolumeSigmaScore(volumeSigma, changePercent);
  const pricePositionScore = calculatePricePositionScore(price, min60d, max60d);
  const psychologicalAdjustment = calculatePsychologicalAdjustment(changePercent);
  const timeDecayPenalty = calculateTimeDecayPenalty(predictionAge);
  const earningsScore = calculateEarningsScore(daysUntilEarnings);
  const priceMovementPenalty = calculatePriceMovementPenalty(changePercent);

  // Calculate effective score
  const score = calculateEffectiveScore({
    technicalScore,
    predictionScore: predictionScore || 5.5,
    macdAdjustment,
    volumeScore,
    pricePositionScore,
    psychologicalAdjustment,
    timeDecayPenalty,
    earningsScore,
    priceMovementPenalty
  });

  // Get signal
  const signal = getSignalFromScore(score);

  return {
    score,
    signal,
    components: {
      technical: Math.round(technicalScore * 100) / 100,
      macd: Math.round(macdAdjustment * 100) / 100,
      volume: Math.round(volumeScore * 100) / 100,
      pricePosition: Math.round(pricePositionScore * 100) / 100,
      psychological: Math.round(psychologicalAdjustment * 100) / 100,
      earnings: Math.round(earningsScore * 100) / 100,
      penalty: Math.round(priceMovementPenalty * 100) / 100
    }
  };
};

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
