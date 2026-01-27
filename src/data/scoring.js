/**
 * Scoring Engine for BACKBONE
 * Scores are on 0-10 scale (not 0-100)
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const randomBetween = (min, max) => min + Math.random() * (max - min);

export const buildDefaultWeights = () => ({
  momentum: 0.4,
  volume: 0.25,
  volatility: 0.2,
  sentiment: 0.15
});

export const normalizeWeights = (weights) => {
  const safeWeights = {
    momentum: Math.max(0, weights.momentum || 0),
    volume: Math.max(0, weights.volume || 0),
    volatility: Math.max(0, weights.volatility || 0),
    sentiment: Math.max(0, weights.sentiment || 0)
  };

  const sum =
    safeWeights.momentum +
    safeWeights.volume +
    safeWeights.volatility +
    safeWeights.sentiment;

  if (sum === 0) {
    return buildDefaultWeights();
  }

  return {
    momentum: safeWeights.momentum / sum,
    volume: safeWeights.volume / sum,
    volatility: safeWeights.volatility / sum,
    sentiment: safeWeights.sentiment / sum
  };
};

/**
 * Build score on 0-10 scale
 * Signals are 0-100 internally, converted to 0-10 output
 */
export const buildScore = ({ momentum, volume, volatility, sentiment }, weights) => {
  // Calculate weighted average (0-100 internally)
  const raw =
    momentum * weights.momentum +
    volume * weights.volume +
    volatility * weights.volatility +
    sentiment * weights.sentiment;

  // Convert to 0-10 scale and round to 1 decimal
  const score = clamp(raw / 10, 0, 10);
  return Math.round(score * 10) / 10;
};

/**
 * Build mock signals (internal 0-100 scale)
 */
export const buildMockSignals = () => {
  return {
    momentum: randomBetween(30, 95),
    volume: randomBetween(25, 90),
    volatility: randomBetween(20, 85),
    sentiment: randomBetween(30, 90)
  };
};

export const buildScoringEngine = (weightsInput) => {
  const weights = normalizeWeights(weightsInput || buildDefaultWeights());

  return {
    weights,
    score: (signals) => buildScore(signals, weights)
  };
};
