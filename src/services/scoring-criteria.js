/**
 * Advanced Scoring Criteria for BACKBONE
 * Based on technical analysis patterns from CofounderAGI
 *
 * Score components:
 * - MACD: Moving Average Convergence Divergence (histogram trend)
 * - RSI: Relative Strength Index (overbought/oversold)
 * - Volume Sigma: Standard deviation from average volume
 * - Momentum: Price change velocity
 * - Sentiment: News/filing sentiment score
 */

/**
 * Scoring thresholds for buy/sell signals
 */
export const THRESHOLDS = {
  // Score thresholds
  STRONG_BUY: 85,
  BUY: 75,
  HOLD: 50,
  SELL: 35,
  STRONG_SELL: 25,

  // RSI thresholds
  RSI_OVERBOUGHT: 70,
  RSI_OVERSOLD: 30,

  // MACD histogram thresholds
  MACD_BULLISH: 0.5,
  MACD_BEARISH: -0.5,

  // Volume sigma thresholds
  SIGMA_HIGH: 2.0,
  SIGMA_MODERATE: 1.5,
  SIGMA_THRESHOLD: 1.0
};

/**
 * Weight configurations for different risk profiles
 */
export const WEIGHT_PROFILES = {
  conservative: {
    momentum: 0.25,
    volume: 0.20,
    volatility: 0.25,
    sentiment: 0.15,
    macd: 0.10,
    rsi: 0.05
  },
  risky: {
    momentum: 0.35,
    volume: 0.15,
    volatility: 0.10,
    sentiment: 0.15,
    macd: 0.15,
    rsi: 0.10
  }
};

/**
 * Calculate comprehensive ticker score
 */
export const calculateComprehensiveScore = (data, riskProfile = "conservative") => {
  const weights = WEIGHT_PROFILES[riskProfile] || WEIGHT_PROFILES.conservative;

  const {
    momentum = 50,
    volume = 50,
    volatility = 50,
    sentiment = 50,
    macd = null,
    rsi = null,
    volumeSigma = 1.0
  } = data;

  // Calculate MACD score (0-100)
  let macdScore = 50;
  if (macd !== null) {
    if (macd.histogram > THRESHOLDS.MACD_BULLISH) {
      macdScore = 70 + Math.min(30, macd.histogram * 15);
    } else if (macd.histogram < THRESHOLDS.MACD_BEARISH) {
      macdScore = 30 - Math.min(30, Math.abs(macd.histogram) * 15);
    } else {
      macdScore = 50 + macd.histogram * 20;
    }
  }

  // Calculate RSI score (0-100)
  let rsiScore = 50;
  if (rsi !== null) {
    if (rsi > THRESHOLDS.RSI_OVERBOUGHT) {
      // Overbought = potential sell (lower score for buyers)
      rsiScore = 100 - rsi;
    } else if (rsi < THRESHOLDS.RSI_OVERSOLD) {
      // Oversold = potential buy (higher score for buyers)
      rsiScore = 100 - rsi;
    } else {
      rsiScore = 50 + (50 - rsi) * 0.5;
    }
  }

  // Apply sigma bonus for volume anomalies
  let sigmaBonus = 0;
  if (volumeSigma >= THRESHOLDS.SIGMA_HIGH) {
    sigmaBonus = 15;
  } else if (volumeSigma >= THRESHOLDS.SIGMA_MODERATE) {
    sigmaBonus = 10;
  } else if (volumeSigma >= THRESHOLDS.SIGMA_THRESHOLD) {
    sigmaBonus = 5;
  }

  // Weighted score calculation
  const rawScore =
    momentum * weights.momentum +
    volume * weights.volume +
    volatility * weights.volatility +
    sentiment * weights.sentiment +
    macdScore * weights.macd +
    rsiScore * weights.rsi +
    sigmaBonus;

  return Math.round(Math.max(0, Math.min(100, rawScore)));
};

/**
 * Generate buy/sell signal from score
 */
export const getSignal = (score) => {
  if (score >= THRESHOLDS.STRONG_BUY) return { signal: "STRONG_BUY", color: "#22c55e", icon: "▲▲" };
  if (score >= THRESHOLDS.BUY) return { signal: "BUY", color: "#22c55e", icon: "▲" };
  if (score >= THRESHOLDS.HOLD) return { signal: "HOLD", color: "#eab308", icon: "●" };
  if (score >= THRESHOLDS.SELL) return { signal: "SELL", color: "#ef4444", icon: "▼" };
  return { signal: "STRONG_SELL", color: "#ef4444", icon: "▼▼" };
};

/**
 * Calculate MACD from price history
 * Standard: 12-day EMA, 26-day EMA, 9-day signal
 */
export const calculateMACD = (prices, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) => {
  if (!prices || prices.length < longPeriod) {
    // Use adjusted periods for limited data
    const adjustedShort = Math.min(3, prices?.length - 1 || 2);
    const adjustedLong = Math.min(6, prices?.length || 3);
    const adjustedSignal = 2;

    if (!prices || prices.length < adjustedLong) {
      return { macd: 0, signal: 0, histogram: 0, trend: "neutral" };
    }

    shortPeriod = adjustedShort;
    longPeriod = adjustedLong;
    signalPeriod = adjustedSignal;
  }

  const calculateEMA = (data, period) => {
    if (data.length < period) return data[data.length - 1];
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  };

  const shortEMA = calculateEMA(prices, shortPeriod);
  const longEMA = calculateEMA(prices, longPeriod);
  const macdLine = shortEMA - longEMA;

  // Calculate MACD history for signal line
  const macdHistory = [];
  for (let i = longPeriod; i <= prices.length; i++) {
    const shortE = calculateEMA(prices.slice(0, i), shortPeriod);
    const longE = calculateEMA(prices.slice(0, i), longPeriod);
    macdHistory.push(shortE - longE);
  }

  const signalLine = macdHistory.length >= signalPeriod
    ? calculateEMA(macdHistory, signalPeriod)
    : macdLine;

  const histogram = macdLine - signalLine;

  let trend = "neutral";
  if (macdLine > signalLine && histogram > 0) trend = "bullish";
  else if (macdLine < signalLine && histogram < 0) trend = "bearish";

  return {
    macd: Math.round(macdLine * 100) / 100,
    signal: Math.round(signalLine * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    trend
  };
};

/**
 * Calculate RSI from price history
 * Standard: 14-period RSI
 */
export const calculateRSI = (prices, period = 14) => {
  if (!prices || prices.length < period + 1) {
    period = Math.max(2, (prices?.length || 2) - 1);
    if (!prices || prices.length < 3) return 50;
  }

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter(c => c > 0);
  const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;

  const rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
};

/**
 * Calculate volume sigma (standard deviations from mean)
 */
export const calculateVolumeSigma = (volumes) => {
  if (!volumes || volumes.length < 2) return 1.0;

  const currentVolume = volumes[volumes.length - 1];
  const historicalVolumes = volumes.slice(0, -1);

  const mean = historicalVolumes.reduce((a, b) => a + b, 0) / historicalVolumes.length;
  const variance = historicalVolumes.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / historicalVolumes.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 1.0;

  const sigma = (currentVolume - mean) / stdDev;
  return Math.round(sigma * 100) / 100;
};

/**
 * Sectors for risky mode (AI/Tech/Biotech focus)
 */
export const RISKY_SECTORS = [
  "Technology",
  "Artificial Intelligence",
  "Biotechnology",
  "Semiconductors",
  "Software",
  "Healthcare Technology",
  "Fintech",
  "Clean Energy",
  "Quantum Computing",
  "Robotics"
];

/**
 * Check if a ticker qualifies for risky mode
 */
export const isRiskySector = (sector) => {
  if (!sector) return false;
  return RISKY_SECTORS.some(s => sector.toLowerCase().includes(s.toLowerCase()));
};

export default {
  THRESHOLDS,
  WEIGHT_PROFILES,
  calculateComprehensiveScore,
  getSignal,
  calculateMACD,
  calculateRSI,
  calculateVolumeSigma,
  RISKY_SECTORS,
  isRiskySector
};
