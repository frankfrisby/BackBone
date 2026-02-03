/**
 * TRADING ALGORITHMS REFERENCE
 * Extracted from BackBoneApp server (https://github.com/frankfrisby/BackBoneApp.git)
 *
 * This file contains all the scoring, trading, and technical analysis algorithms
 * used by the trading engine for ticker evaluation and trade execution.
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

export const TRADING_CONFIG = {
  // Position & Trade Limits
  maxPositions: 2,
  maxDayTrades: 3,
  dayTradeWindow: 5, // 5 day rolling window

  // Score Thresholds
  buyScoreThreshold: 8.0,       // Minimum score for buy consideration
  buyScoreThresholdSPYNegative: 8.0, // Higher threshold when SPY is negative
  buyScoreThresholdSPYPositive: 7.1, // Lower threshold when SPY is positive
  extremeBuyThreshold: 9.0,     // Auto-execute buy
  extremeSellThreshold: 1.5,    // Auto-execute sell
  technicalOverrideThreshold: 2.7, // Sell protected positions if technicals drop here

  // Momentum Protection
  goodMomentumPercent: 5.0,     // +5% or better = good momentum
  protectedPositionPercent: 8.0, // +8% = protected from interruption

  // Price Movement Penalties
  downPenaltyStart: 12,         // Start penalty at -12%
  upPenaltyStart: 12,           // Start penalty at +12%

  // Volume Analysis
  minDailyVolume: 10000000,     // 10M shares minimum for options

  // Options Trading
  options: {
    maxPortfolioPercent: 15,
    stopLossPercent: 10,
    trailingStopPercent: 7,
    takeProfitPercent: 30,
    minDTE: 3,
    maxDTE: 7,
    minDelta: 0.45,
    maxDelta: 0.65,
    minScoreForOptions: 8.2
  },

  // Crypto Score Thresholds
  crypto: {
    longTermSell: 3.5,
    mediumTermSell: 4.0,
    shortTermSell: 4.5,
    neutralMin: 4.5,
    neutralMax: 8.0,
    mediumTermBuy: 8.0,
    longTermBuy: 8.5
  }
};

// ============================================================================
// MACD CALCULATIONS
// ============================================================================

/**
 * Calculate MACD slope and direction from 6-day histogram trend
 * Uses linear regression to compute the actual trend across days [5, 4, 3, 2, 1, 0]
 *
 * Formula: slope = Σ((x - x̄)(y - ȳ)) / Σ((x - x̄)²)
 *
 * @param {(number|null)[]} histogramArray - Array of 6 histogram values [day5, day4, day3, day2, day1, day0]
 * @returns {{slope: number, direction: string, magnitude: number, isValid: boolean}}
 */
export function calculateMacdSlopeAndDirection(histogramArray) {
  if (!histogramArray || histogramArray.length !== 6) {
    return { slope: 0, direction: 'neutral', magnitude: 0, isValid: false };
  }

  // Filter out null values and track which indices are valid
  const validPoints = [];
  histogramArray.forEach((value, index) => {
    if (value !== null && value !== undefined) {
      validPoints.push({ x: 5 - index, y: value });
    }
  });

  // Need at least 3 valid points for meaningful slope
  if (validPoints.length < 3) {
    return { slope: 0, direction: 'neutral', magnitude: 0, isValid: false };
  }

  // Calculate means
  const n = validPoints.length;
  const xMean = validPoints.reduce((sum, p) => sum + p.x, 0) / n;
  const yMean = validPoints.reduce((sum, p) => sum + p.y, 0) / n;

  // Calculate slope using linear regression
  let numerator = 0;
  let denominator = 0;

  for (const point of validPoints) {
    const xDiff = point.x - xMean;
    const yDiff = point.y - yMean;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  if (denominator === 0) {
    return { slope: 0, direction: 'neutral', magnitude: 0, isValid: false };
  }

  // Invert slope so positive = upward trend (bullish)
  const rawSlope = numerator / denominator;
  const slope = -rawSlope;

  let direction = 'neutral';
  if (Math.abs(slope) > 0.01) {
    direction = slope > 0 ? 'positive' : 'negative';
  }

  return {
    slope,
    direction,
    magnitude: Math.abs(slope),
    isValid: true
  };
}

/**
 * DERIVATIVE-BASED MACD SCORING (Momentum & Inflection Detection)
 *
 * Scores based on histogram's rate of change toward zero:
 * - Negative histogram approaching zero (concave up) = BULLISH = Score 0→2
 * - Positive histogram approaching zero (concave down) = BEARISH = Score 0→-2
 * - At local peaks/mins (inflection points) = Score 0
 *
 * Uses multi-timeframe analysis: 15d (9%), 5d (23%), 2d (68%)
 *
 * @param {number[]} hist - Last 16 MACD histogram values [day15...day0]
 * @param {number[]} macdSeries - Last 30 MACD line values
 * @returns {number} Score in range [-2, 2]
 */
export function macdDirectionalScore(hist, macdSeries) {
  if (hist.length < 3 || macdSeries.length < 5) return 0;

  const lastHist = hist[hist.length - 1];
  const prevHist = hist[hist.length - 2];

  // Multi-timeframe slope analysis
  let slope2d = 0, slope5d = 0, slope15d = 0;

  if (hist.length >= 2) {
    const recent2 = hist.slice(-2);
    slope2d = recent2[1] - recent2[0];
  }

  if (hist.length >= 5) {
    const recent5 = hist.slice(-5);
    const slopes = [];
    for (let i = 1; i < recent5.length; i++) slopes.push(recent5[i] - recent5[i - 1]);
    slope5d = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  }

  if (hist.length >= 15) {
    const recent15 = hist.slice(-15);
    const slopes = [];
    for (let i = 1; i < recent15.length; i++) slopes.push(recent15[i] - recent15[i - 1]);
    slope15d = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  }

  // Weighted combined slope (9%/23%/68%)
  const combinedSlope = (slope15d * (2/22)) + (slope5d * (5/22)) + (slope2d * (15/22));

  // Check for crossovers (instant max signals)
  if (prevHist < 0 && lastHist >= 0) return 2.0;  // Bullish crossover
  if (prevHist > 0 && lastHist <= 0) return -2.0; // Bearish crossover

  const histMin = Math.min(...hist);
  const histMax = Math.max(...hist);

  let score = 0;

  // CASE 1: Histogram is NEGATIVE
  if (lastHist < 0) {
    if (combinedSlope > 0) {
      // Moving toward zero = BULLISH
      const totalRange = Math.abs(histMin);
      const proximityToZero = 1 - (Math.abs(lastHist) / totalRange);
      score = proximityToZero * 1.9;
    }
  }
  // CASE 2: Histogram is POSITIVE
  else if (lastHist > 0) {
    if (combinedSlope < 0) {
      // Moving toward zero = BEARISH
      const totalRange = Math.abs(histMax);
      const proximityToZero = 1 - (Math.abs(lastHist) / totalRange);
      score = -proximityToZero * 1.9;
    }
  }

  return Math.max(-2, Math.min(2, score));
}

/**
 * Calculate effective MACD score with position-in-range factor
 *
 * Formula (INVERTED - rewards mid-range positions):
 * - Mid = (max + min) / 2
 * - F = 1.5 - abs(current - mid) / (max - min)
 * - effectiveMacdScore = rawMacdAdjustment * F
 *
 * Factor F ranges from 0.5 to 1.5:
 * - At midpoint: F = 1.5 (maximum impact)
 * - At boundaries: F = 1.0 (normal impact)
 *
 * @param {number} rawMacdAdjustment - Base MACD adjustment score
 * @param {number|null} macdLine - Current MACD line value
 * @param {number|null} macdLineMin120d - 120-day minimum
 * @param {number|null} macdLineMax120d - 120-day maximum
 * @returns {number} Final effective MACD score
 */
export function calculateEffectiveMacdScore(rawMacdAdjustment, macdLine, macdLineMin120d, macdLineMax120d) {
  if (macdLine == null || macdLineMin120d == null || macdLineMax120d == null) {
    return rawMacdAdjustment;
  }

  const mid = (macdLineMax120d + macdLineMin120d) / 2;
  const range = macdLineMax120d - macdLineMin120d;

  if (range === 0) return rawMacdAdjustment;

  const factor = 1.5 - Math.abs(macdLine - mid) / range;
  return rawMacdAdjustment * factor;
}

/**
 * Compute final MACD composite direction score using weighted multi-timescale fusion
 *
 * Weights:
 * - 15-day window: 9%  (long-term context)
 * - 5-day window: 23%  (current trend)
 * - 2-day window: 68%  (immediate momentum)
 *
 * @param {number[]} macdSeries - MACD line values (oldest first), needs ≥30
 * @param {number[]|{date: string, value: number}[]} histSeries - Histogram values, needs ≥15
 * @returns {number} Final composite score [-1, 1]
 */
export function computeFinalMacdScore(macdSeries, histSeries) {
  const clamp11 = (x) => Math.max(-1, Math.min(1, x));

  // Parse histogram data if it contains dates
  let histValues = histSeries;
  if (histSeries.length > 0 && typeof histSeries[0] === 'object') {
    const sorted = [...histSeries].sort((a, b) => a.date.localeCompare(b.date));
    histValues = sorted.map(item => item.value);
  }

  if (macdSeries.length < 30 || histValues.length < 15) return 0;

  const s15 = windowScore(histValues.slice(-15), macdSeries.slice(-30));
  const s5 = windowScore(histValues.slice(-5), macdSeries.slice(-15));
  const s2 = windowScore(histValues.slice(-2), macdSeries.slice(-5));

  const final = (2/22) * s15 + (5/22) * s5 + (15/22) * s2;
  return clamp11(+final.toFixed(3));
}

// Helper for computeFinalMacdScore
function windowScore(hist, macd) {
  const EPS = 1e-9;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const clamp11 = (x) => Math.max(-1, Math.min(1, x));

  if (hist.length < 2 || macd.length < 2) return 0;

  // Calculate average slope
  const slopes = [];
  for (let i = 1; i < hist.length; i++) {
    slopes.push(hist[i] - hist[i - 1]);
  }
  const avgSlope = slopes.reduce((sum, s) => sum + s, 0) / slopes.length;

  const histMin = Math.min(...hist);
  const histMax = Math.max(...hist);
  const range = histMax - histMin;
  const normalizedSlope = range > EPS ? avgSlope / range : avgSlope;

  const prev = hist[hist.length - 2];
  const curr = hist[hist.length - 1];

  let base;

  // Zero-cross overrides
  if (prev < 0 && curr >= 0) {
    base = 1; // bullish cross
  } else if (prev > 0 && curr <= 0) {
    base = -1; // bearish cross
  } else {
    const posSide = curr > 0;
    const localMax = Math.max(...hist);
    const localMin = Math.min(...hist);

    if (posSide) {
      if (normalizedSlope < 0) {
        const peak = Math.max(localMax, curr);
        const progress = clamp01((peak - curr) / (peak + EPS));
        base = -progress;
      } else {
        const away = clamp01(curr / (localMax + EPS));
        base = 0.2 * Math.tanh(5 * normalizedSlope) * (0.3 + 0.7 * away);
      }
    } else if (curr < 0) {
      if (normalizedSlope > 0) {
        const valley = Math.min(localMin, curr);
        const progress = clamp01((curr - valley) / (0 - valley + EPS));
        base = +progress;
      } else {
        const away = clamp01(Math.abs(curr) / (Math.abs(localMin) + EPS));
        base = -0.2 * Math.tanh(5 * Math.abs(normalizedSlope)) * (0.3 + 0.7 * away);
      }
    } else {
      base = 0.3 * Math.tanh(8 * normalizedSlope);
    }
  }

  // Slope boost
  const slopeBoost = 0.15 * Math.tanh(6 * normalizedSlope);
  base = clamp11(base + slopeBoost);

  // MACD context damping
  const macdMin = Math.min(...macd);
  const macdMax = Math.max(...macd);
  const macdPct = (macd[macd.length - 1] - macdMin) / (macdMax - macdMin || 1);

  const alpha = 0.30;
  const gamma = 1.20;
  let weight;

  if (base >= 0) {
    weight = 1 - alpha * Math.pow(macdPct, gamma);
  } else {
    weight = 1 - alpha * Math.pow(1 - macdPct, gamma);
  }

  return clamp11(base * weight);
}


/**
 * MACD score based on 5-day change and proximity to zero (cycle-aware).
 * Uses previous vs current histogram values (x=5d ago, y=today).
 * Returns a signed score in [-1, 1].
 */
export function calculateMacdScore(x, y) {
  if (x == null || y == null || isNaN(x) || isNaN(y)) return 0;
  const t = Math.abs(y);
  const g = Math.max(0.0, -5.0 * (t ** 2) - 2.5 * t + 1.0);
  let s = Math.sign(y - x) * g;
  if (x === y) s = 0.0;
  return Math.max(-1.0, Math.min(1.0, s));
}
// ============================================================================
// PSYCHOLOGICAL ADJUSTMENTS
// ============================================================================

/**
 * Calculate percentage-based score adjustment with psychological breaking points
 *
 * Zones:
 * - 0-15%: Normal momentum (up decreases, down increases score)
 * - 15-25%: First reversal - momentum energy reversal
 * - >25%: Second reversal
 *
 * @param {number} percentChange - Percentage change from base price
 * @returns {number} Adjustment to apply to score
 */
export function calculatePsychologicalAdjustment(percentChange) {
  const absPercent = Math.abs(percentChange);
  const isPositive = percentChange > 0;

  // Zone 1: Normal momentum (0-15%)
  if (absPercent <= 15) {
    const adjustment = (absPercent / 2) * 0.5;
    return isPositive ? -adjustment : adjustment;
  }

  // Zone 2: First reversal (15-25%)
  if (absPercent <= 25) {
    const first15Adjustment = (15 / 2) * 0.5; // 3.75
    const beyondAdjustment = ((absPercent - 15) / 2) * 0.5;

    if (isPositive) {
      return -first15Adjustment + beyondAdjustment;
    } else {
      return first15Adjustment - beyondAdjustment;
    }
  }

  // Zone 3: Second reversal (>25%)
  const first15Adjustment = (15 / 2) * 0.5;
  const next10Adjustment = (10 / 2) * 0.5;
  const beyondAdjustment = ((absPercent - 25) / 2) * 0.5;

  if (isPositive) {
    return -first15Adjustment + next10Adjustment - beyondAdjustment;
  } else {
    return first15Adjustment - next10Adjustment + beyondAdjustment;
  }
}

/**
 * Calculate price movement penalty based on today's percent change
 *
 * - DOWN movements: -1 point at -12%, -2 at -20%, continuing every 10%
 * - UP movements: -0.5 points at +12%, -1 at +20% (half rate)
 *
 * @param {number} percentChange - Today's percent change
 * @returns {number} Penalty value (always negative or zero)
 */
export function calculatePriceMovementPenalty(percentChange) {
  const absPercent = Math.abs(percentChange);
  const isNegative = percentChange < 0;

  if (absPercent < 12) return 0;

  if (isNegative) {
    const excessPercent = absPercent - 12;
    return -1.0 - (excessPercent / 10);
  } else {
    const excessPercent = absPercent - 12;
    return -0.5 - (excessPercent / 20);
  }
}

// ============================================================================
// EARNINGS & PRICE POSITION
// ============================================================================

/**
 * Calculate earnings proximity score with exponential boost
 *
 * Formula (for earnings within 30 days):
 * - earningsScore = ((30 - t) / 30)^2
 *
 * Post-earnings penalty: NEGATIVE score for 0-3 days after earnings
 *
 * @param {Date|string|null} earningsDate - Next earnings announcement date
 * @returns {number} Score between -1 and 1
 */
export function calculateEarningsScore(earningsDate) {
  if (!earningsDate) return 0;

  try {
    const earnings = new Date(earningsDate);
    const now = new Date();

    // Get Eastern Time hour (simplified)
    const currentHourET = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();

    let daysUntilEarnings = (earnings.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Time-of-day adjustment (before 4 PM ET)
    const timeAdjustment = currentHourET < 16 ? 0.5 : 0;
    daysUntilEarnings -= timeAdjustment;

    // Post-earnings penalty
    if (daysUntilEarnings < 0) {
      const daysAgo = Math.abs(daysUntilEarnings);

      if (daysAgo <= 3) {
        const hypotheticalScore = Math.pow((30 - Math.abs(daysUntilEarnings)) / 30, 2);
        const fadeFactor = 1 - (daysAgo / 3);
        return -hypotheticalScore * fadeFactor;
      }
      return 0;
    }

    if (daysUntilEarnings > 30) return 0;

    const score = Math.pow((30 - daysUntilEarnings) / 30, 2);
    return Math.max(0, Math.min(1, score));

  } catch (error) {
    return 0;
  }
}

/**
 * Calculate 60-day price position score
 *
 * - Near 60-day low (0-10%): +1.5 (oversold, bullish)
 * - Near 60-day high (90-100%): -1.5 (overbought, bearish)
 * - Linear scaling in between
 *
 * @param {number|null} currentPrice - Current stock price
 * @param {number|null} min60d - Minimum price over last 60 days
 * @param {number|null} max60d - Maximum price over last 60 days
 * @returns {number} Score between -1.5 and +1.5
 */
export function calculatePricePositionScore(currentPrice, min60d, max60d) {
  if (currentPrice == null || min60d == null || max60d == null) return 0;

  const range = max60d - min60d;
  if (range === 0) return 0;

  const position = (currentPrice - min60d) / range;

  if (position <= 0.1) return 1.5;   // Oversold
  if (position >= 0.9) return -1.5;  // Overbought

  // Linear interpolation between 0.1 and 0.9
  const normalizedPosition = (position - 0.1) / 0.8;
  return (1.0 - (normalizedPosition * 2.0)) * 1.5;
}

// ============================================================================
// VOLUME SCORING
// ============================================================================

/**
 * Calculate volume score contribution with intraday enhancement
 *
 * @param {number} sigmaScore - 1-10 scale sigma score from volume analysis
 * @param {number} intradayVolumeMultiplier - Magnitude × direction
 * @param {number} recentPriceChange - % change for direction validation
 * @returns {number} Volume score [-1.5, 1.5]
 */
export function calculateVolumeScore(sigmaScore, intradayVolumeMultiplier = 0, recentPriceChange = 0) {
  const DECLINE_THRESHOLD = -0.05;

  const enhancedSigma = sigmaScore * (1 + intradayVolumeMultiplier);
  let volumeScore = 2.5 * ((enhancedSigma - 1) / 10) - 1;

  // Force negative if stock is declining
  if (recentPriceChange < DECLINE_THRESHOLD) {
    volumeScore = -Math.abs(volumeScore);
  } else {
    volumeScore = Math.abs(volumeScore);
  }

  return Math.max(-1.5, Math.min(1.5, volumeScore));
}

// ============================================================================
// UNIFIED SCORE CALCULATION
// ============================================================================

/**
 * UNIFIED EFFECTIVE SCORE CALCULATION ENGINE
 *
 * Formula:
 * (tech + pred)/2 + psych + dir + pos - decay + macd + volume + (pricePos x 1.25) + (earnings x 2.0) + movementPenalty
 *
 * @param {Object} inputs - Score calculation inputs
 * @returns {Object} Score breakdown with all components
 */
export function calculateEffectiveScore(inputs) {
  const sanitize = (val, def = 0) => (val == null || isNaN(val)) ? def : val;

  const technicalScore = sanitize(inputs.technicalScore);
  const predictionScore = sanitize(inputs.predictionScore, 0.5);
  const percentChange = sanitize(inputs.percentChange);
  const avgDirectional = sanitize(inputs.avgDirectional);
  const avgPositive = sanitize(inputs.avgPositive);
  const sigmaScore = sanitize(inputs.sigmaScore, 1);

  // STEP 1: Adjust base scores (technical 0 becomes default)
  const adjustedTechnicalScore = technicalScore === 0 ? 6.0 : technicalScore;
  const adjustedPredictionScore = predictionScore;

  // STEP 2: Psychological adjustment
  const psychologicalAdjustment = calculatePsychologicalAdjustment(percentChange);

  // STEP 3: Historical bonuses (capped at ±1.0)
  const directionalBonus = Math.max(-1.0, Math.min(1.0, avgDirectional * 0.2));
  const positiveBonus = Math.max(-1.0, Math.min(1.0, avgPositive * 0.2));

  // STEP 4: Time decay penalty
  let timeDecayPenalty = 0;
  let daysOld = 0;
  if (inputs.predictionDate) {
    const predDate = new Date(inputs.predictionDate);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - predDate.getTime()) / (1000 * 60 * 60 * 24));
    daysOld = Math.max(0, Math.min(7, daysDiff));
    timeDecayPenalty = daysOld * 0.6;
  }

  // STEP 5: MACD adjustment (priority: weighted > improved > slope > legacy)
  let macdAdjustment = 0;

  if (inputs.macdWeightedScore != null) {
    macdAdjustment = inputs.macdWeightedScore * 2.5;
  } else if (inputs.improvedMacdScore != null) {
    macdAdjustment = inputs.improvedMacdScore * 2.5;
  } else if (inputs.macdHistogramArray && inputs.macdHistogramArray.length >= 6) {
    const hist = inputs.macdHistogramArray.filter(h => h != null);
    const x = hist.length >= 6 ? hist[hist.length - 6] : null;
    const y = hist.length >= 2 ? hist[hist.length - 1] : null;
    const rawMacd = calculateMacdScore(x, y);

    const eff30d = calculateEffectiveMacdScore(rawMacd, inputs.macdLine, inputs.macdLineMin30d, inputs.macdLineMax30d);
    const eff120d = calculateEffectiveMacdScore(rawMacd, inputs.macdLine, inputs.macdLineMin120d, inputs.macdLineMax120d);
    macdAdjustment = (eff30d + eff120d) / 2;
  } else if (inputs.macd != null && inputs.macd5dAgo != null) {
    const histogram0 = inputs.macd;
    const histogram5 = inputs.macd5dAgo;

    const histogramMax = Math.max(Math.abs(histogram0), Math.abs(histogram5));
    const histogramMin = -histogramMax;

    let ratio0 = 0;
    let ratio5 = 0;

    const isPositiveTerritory = histogram5 > 0 || histogram0 > 0;
    const isNegativeTerritory = histogram5 < 0 || histogram0 < 0;

    if (isPositiveTerritory && histogram0 >= 0 && histogram5 >= 0) {
      ratio5 = -(histogram5 / histogramMax);
      ratio0 = -(histogram0 / histogramMax);
      const cosValue = Math.cos(ratio0);
      macdAdjustment = -cosValue;
    } else if (isNegativeTerritory && histogram0 <= 0 && histogram5 <= 0) {
      ratio5 = -(histogram5 / histogramMin);
      ratio0 = -(histogram0 / histogramMin);
      const cosValue = Math.cos(ratio0);
      macdAdjustment = cosValue;
    } else {
      const delta = histogram0 - histogram5;
      const normalizedDelta = Math.max(-1, Math.min(1, delta / histogramMax));
      macdAdjustment = normalizedDelta * 0.5;
    }

    macdAdjustment = Math.max(-1, Math.min(1, macdAdjustment));

    const rawMacd = macdAdjustment;
    const eff30d = calculateEffectiveMacdScore(rawMacd, inputs.macdLine, inputs.macdLineMin30d, inputs.macdLineMax30d);
    const eff120d = calculateEffectiveMacdScore(rawMacd, inputs.macdLine, inputs.macdLineMin120d, inputs.macdLineMax120d);
    macdAdjustment = (eff30d + eff120d) / 2;
  } else if (inputs.effectiveMacdScore != null) {
    macdAdjustment = Math.max(-1, Math.min(1, inputs.effectiveMacdScore));
  }

  const macdLine = inputs.macdLine ?? null;
  const macdSignal = inputs.macdSignal ?? null;
  const macdMin60d = inputs.macdLineMin60d ?? null;
  const macdMax60d = inputs.macdLineMax60d ?? null;

  // Crossover-based MACD score: after crossover, score ramps toward +/-1 as MACD approaches 0.
  if (macdLine != null && macdSignal != null && macdMin60d != null && macdMax60d != null) {
    if (macdLine < 0 && macdSignal < 0 && macdLine > macdSignal) {
      const denom = Math.abs(macdMin60d);
      if (denom > 0) {
        const ratio = Math.max(0, Math.min(1, 1 - (Math.abs(macdLine) / denom)));
        macdAdjustment = Math.max(0, Math.min(1, ratio));
      }
    } else if (macdLine > 0 && macdSignal > 0 && macdLine < macdSignal) {
      const denom = Math.abs(macdMax60d);
      if (denom > 0) {
        const ratio = Math.max(0, Math.min(1, 1 - (Math.abs(macdLine) / denom)));
        macdAdjustment = -Math.max(0, Math.min(1, ratio));
      }
    }
  }

  // STEP 6: Volume score
  const intradayMultiplier = sanitize(inputs.intradayVolumeMultiplier);
  const recentTrend = inputs.recentPriceChange30min ?? percentChange;
  const volumeScore = calculateVolumeScore(sigmaScore, intradayMultiplier, recentTrend);

  // STEP 7: Price position score
  const pricePositionScore = calculatePricePositionScore(
    inputs.currentPrice ?? null,
    inputs.price60dMin ?? null,
    inputs.price60dMax ?? null
  );

  // STEP 8: Earnings score
  const earningsScore = calculateEarningsScore(inputs.earningsDate ?? null);

  // STEP 9: Price movement penalty
  const priceMovementPenalty = calculatePriceMovementPenalty(percentChange);

  // STEP 10: Final calculation
  const effectiveScore = Math.max(0, Math.min(10,
    (adjustedTechnicalScore + adjustedPredictionScore) / 2 +
    psychologicalAdjustment +
    directionalBonus +
    positiveBonus -
    timeDecayPenalty +
    macdAdjustment +
    volumeScore +
    (pricePositionScore * 1.25) +
    (earningsScore * 2.0) +
    priceMovementPenalty
  ));

  return {
    adjustedTechnicalScore,
    adjustedPredictionScore,
    psychologicalAdjustment,
    directionalBonus,
    positiveBonus,
    timeDecayPenalty,
    macdAdjustment,
    volumeScore,
    pricePositionScore,
    earningsScore,
    priceMovementPenalty,
    daysOld,
    effectiveScore,
    formula: `(${adjustedTechnicalScore.toFixed(1)} + ${adjustedPredictionScore.toFixed(1)}) / 2 + ${psychologicalAdjustment.toFixed(2)} + ${directionalBonus.toFixed(2)} + ${positiveBonus.toFixed(2)} - ${timeDecayPenalty.toFixed(1)} + ${macdAdjustment.toFixed(1)} + ${volumeScore.toFixed(2)} + (${pricePositionScore.toFixed(2)} x 1.25) + (${earningsScore.toFixed(4)} x 2.0) + ${priceMovementPenalty.toFixed(2)} = ${effectiveScore.toFixed(2)}`
  };
}

// ============================================================================
// TECHNICAL ANALYSIS INDICATORS
// ============================================================================

/**
 * Calculate RSI (Relative Strength Index)
 * @param {number[]} prices - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {number} RSI value 0-100
 */
export function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate EMA (Exponential Moving Average)
 * @param {number[]} prices - Array of prices
 * @param {number} period - EMA period
 * @returns {number} EMA value
 */
export function calculateEMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }

  return ema;
}

/**
 * Calculate SMA (Simple Moving Average)
 * @param {number[]} prices - Array of prices
 * @param {number} period - SMA period
 * @returns {number} SMA value
 */
export function calculateSMA(prices, period) {
  if (prices.length < period) return prices[prices.length - 1];
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + price, 0) / period;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param {number[]} prices - Array of closing prices
 * @returns {{macd: number, signal: number, histogram: number}}
 */
export function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macd = ema12 - ema26;

  // Calculate MACD history for signal line
  const macdHistory = [];
  for (let i = 25; i < prices.length; i++) {
    const ema12_i = calculateEMA(prices.slice(0, i + 1), 12);
    const ema26_i = calculateEMA(prices.slice(0, i + 1), 26);
    macdHistory.push(ema12_i - ema26_i);
  }

  const signal = calculateEMA(macdHistory, 9);
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

// ============================================================================
// TECHNICAL SCORING (0-10 scale)
// ============================================================================

/**
 * Score RSI on 0-10 scale
 * @param {number} rsi - RSI value
 * @returns {number} Score 0-10
 */
export function scoreRSI(rsi) {
  if (rsi < 20) return 10;
  if (rsi < 30) return 8.5;
  if (rsi < 40) return 7;
  if (rsi < 60) return 5.5;
  if (rsi < 70) return 6;
  if (rsi < 80) return 3.5;
  return 2;
}

/**
 * Score MACD on 0-10 scale (with 2x weight in overall score)
 * @param {{macd: number, signal: number, histogram: number}} macdData
 * @returns {number} Score 0-10
 */
export function scoreMACD(macdData) {
  let score = 5;

  // Zero-line crossover
  if (macdData.macd > 0 && macdData.macd < 0.5) {
    score += 4; // Just crossed above zero
  } else if (macdData.macd < 0 && macdData.macd > -0.5) {
    score -= 3; // Just crossed below zero
  } else if (macdData.macd > 0.5) {
    score += 2;
  } else if (macdData.macd < -0.5) {
    score -= 2;
  }

  // Signal line crossover
  const crossoverStrength = Math.abs(macdData.macd - macdData.signal);
  if (macdData.macd > macdData.signal) {
    if (crossoverStrength > 0.3) score += 2;
    else if (crossoverStrength > 0.1) score += 1.5;
    else score += 0.5;
  } else {
    if (crossoverStrength > 0.3) score -= 2;
    else if (crossoverStrength > 0.1) score -= 1;
    else score -= 0.5;
  }

  // Histogram strength
  const histStrength = Math.abs(macdData.histogram);
  if (macdData.histogram > 0) {
    if (histStrength > 0.5) score += 1.5;
    else if (histStrength > 0.2) score += 1;
    else score += 0.5;
  } else {
    if (histStrength > 0.5) score -= 1;
    else if (histStrength > 0.2) score -= 0.5;
  }

  return Math.max(0, Math.min(10, score));
}

/**
 * Score volume on 0-10 scale
 * @param {number} volumeRatio - Current volume / 20-day average
 * @returns {number} Score 0-10
 */
export function scoreVolume(volumeRatio) {
  if (volumeRatio > 2) return 9;
  if (volumeRatio > 1.5) return 7.5;
  if (volumeRatio > 1.2) return 6.5;
  if (volumeRatio > 0.8) return 5;
  if (volumeRatio > 0.5) return 3.5;
  return 2;
}

/**
 * Score momentum on 0-10 scale
 * @param {number} momentum - 10-day price change percentage
 * @returns {number} Score 0-10
 */
export function scoreMomentum(momentum) {
  if (momentum > 10) return 9;
  if (momentum > 5) return 7.5;
  if (momentum > 2) return 6.5;
  if (momentum > -2) return 5;
  if (momentum > -5) return 3.5;
  if (momentum > -10) return 2.5;
  return 1;
}

// ============================================================================
// TRADING RULES
// ============================================================================

/**
 * Trading rules configuration
 */
export const TRADING_RULES = {
  maxPositions: 2,
  maxDayTrades: 3,
  dayTradeWindow: 5,
  onlyOneTradePerTickerPerDay: true,
  sellOnlyInBadRange: true,
  protectMomentum: true
};

/**
 * Determine if a position has good momentum
 * @param {number} unrealizedPLPercent - Unrealized P&L percentage
 * @returns {boolean}
 */
export function isGoodMomentum(unrealizedPLPercent) {
  return unrealizedPLPercent >= 5.0;
}

/**
 * Determine if a position is protected from selling
 * @param {number} unrealizedPLPercent - Unrealized P&L percentage
 * @returns {boolean}
 */
export function isProtectedPosition(unrealizedPLPercent) {
  return unrealizedPLPercent >= 8.0;
}

/**
 * Get action label based on score
 * @param {number} score - Effective score 0-10
 * @returns {string} Action label
 */
export function getActionFromScore(score) {
  if (score >= 9.0) return 'EXTREME BUY';
  if (score >= 6.5) return 'BUY';
  if (score >= 3.5) return 'HOLD';
  if (score <= 1.5) return 'EXTREME SELL';
  return 'SELL';
}

// ============================================================================
// MULTI-TIMEFRAME MACD
// ============================================================================

/**
 * Calculate multi-timeframe MACD score
 * Weights: 25% weekly + 50% daily + 25% 4-hour
 *
 * @param {number|null} weeklyScore - Weekly MACD score
 * @param {number|null} dailyScore - Daily MACD score
 * @param {number|null} fourHourScore - 4-hour MACD score
 * @returns {{weightedScore: number, alignmentScore: number}}
 */
export function calculateMultiTimeframeMacdScore(weeklyScore, dailyScore, fourHourScore) {
  let weightedScore = 0;
  let totalWeight = 0;

  if (weeklyScore !== null) {
    weightedScore += weeklyScore * 0.25;
    totalWeight += 0.25;
  }
  if (dailyScore !== null) {
    weightedScore += dailyScore * 0.50;
    totalWeight += 0.50;
  }
  if (fourHourScore !== null) {
    weightedScore += fourHourScore * 0.25;
    totalWeight += 0.25;
  }

  if (totalWeight > 0) {
    weightedScore = weightedScore / totalWeight;
  }

  // Calculate alignment score
  let alignmentScore = 0;
  const availableScores = [];
  if (weeklyScore !== null) availableScores.push(weeklyScore);
  if (dailyScore !== null) availableScores.push(dailyScore);
  if (fourHourScore !== null) availableScores.push(fourHourScore);

  if (availableScores.length >= 2) {
    const mean = availableScores.reduce((sum, s) => sum + s, 0) / availableScores.length;
    const variance = availableScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / availableScores.length;
    const stdDev = Math.sqrt(variance);
    alignmentScore = Math.max(0, 1 - (stdDev / 2));
  } else if (availableScores.length === 1) {
    alignmentScore = 1.0;
  }

  return { weightedScore, alignmentScore };
}

// ============================================================================
// MARKET ANALYSIS
// ============================================================================

/**
 * Market movement weights for real-time analysis
 */
export const MARKET_WEIGHTS = {
  SPY: 0.50,
  BTC: 0.40,
  NVDA: 0.10
};

/**
 * Calculate weighted market movement
 * @param {number} spyChange - SPY % change
 * @param {number} btcChange - BTC % change
 * @param {number} nvdaChange - NVDA % change
 * @returns {number} Weighted market movement
 */
export function calculateWeightedMarketMovement(spyChange, btcChange, nvdaChange) {
  return (spyChange * MARKET_WEIGHTS.SPY) +
         (btcChange * MARKET_WEIGHTS.BTC) +
         (nvdaChange * MARKET_WEIGHTS.NVDA);
}

// ============================================================================
// DEFAULT EXPORT (for convenience)
// ============================================================================

export default {
  TRADING_CONFIG,
  TRADING_RULES,
  MARKET_WEIGHTS,
  calculateMacdSlopeAndDirection,
  macdDirectionalScore,
  calculateEffectiveMacdScore,
  computeFinalMacdScore,
  calculateMultiTimeframeMacdScore,
  calculatePsychologicalAdjustment,
  calculatePriceMovementPenalty,
  calculateEarningsScore,
  calculatePricePositionScore,
  calculateVolumeScore,
  calculateEffectiveScore,
  calculateRSI,
  calculateEMA,
  calculateSMA,
  calculateMACD,
  scoreRSI,
  scoreMACD,
  scoreVolume,
  scoreMomentum,
  isGoodMomentum,
  isProtectedPosition,
  getActionFromScore,
  calculateWeightedMarketMovement
};
