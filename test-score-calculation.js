/**
 * Test Score Calculation
 * Shows step-by-step calculation for a real ticker using BackBoneApp formula
 */

import fetch from "node-fetch";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// ============================================================================
// SCORE CALCULATION FUNCTIONS (from BackBoneApp score-engine.ts)
// ============================================================================

/**
 * Calculate MACD slope and direction from 6-day histogram trend
 * Uses linear regression
 */
function calculateMacdSlopeAndDirection(histogramArray) {
  if (!histogramArray || histogramArray.length < 6) {
    return { slope: 0, direction: 'neutral', magnitude: 0, isValid: false };
  }

  // Filter out null values and track which indices are valid
  const validPoints = [];
  histogramArray.slice(-6).forEach((value, index) => {
    if (value !== null && value !== undefined) {
      validPoints.push({ x: 5 - index, y: value });
    }
  });

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

  const rawSlope = numerator / denominator;
  const slope = -rawSlope; // Invert so positive = upward trend

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
 * Calculate EMA
 */
function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculate MACD with full history
 */
function calculateMACD(closes) {
  if (!closes || closes.length < 35) {
    return { macd: null, signal: null, histogram: null, histogramArray: [], trend: "neutral" };
  }

  // Calculate MACD line for each point
  const macdHistory = [];
  for (let i = 26; i <= closes.length; i++) {
    const shortEMA = calculateEMA(closes.slice(0, i), 12);
    const longEMA = calculateEMA(closes.slice(0, i), 26);
    if (shortEMA && longEMA) macdHistory.push(shortEMA - longEMA);
  }

  // Calculate signal line and histogram for each point
  const histogramArray = [];
  for (let i = 9; i <= macdHistory.length; i++) {
    const signal = calculateEMA(macdHistory.slice(0, i), 9);
    const macd = macdHistory[i - 1];
    if (signal) histogramArray.push(macd - signal);
  }

  const currentMACD = macdHistory[macdHistory.length - 1];
  const currentSignal = calculateEMA(macdHistory, 9);
  const currentHistogram = currentMACD - currentSignal;

  let trend = "neutral";
  if (currentMACD > currentSignal && currentHistogram > 0) trend = "bullish";
  else if (currentMACD < currentSignal && currentHistogram < 0) trend = "bearish";

  return {
    macd: currentMACD,
    signal: currentSignal,
    histogram: currentHistogram,
    histogramArray: histogramArray.slice(-16), // Last 16 days
    trend
  };
}

/**
 * Calculate RSI
 */
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return 50;

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
}

/**
 * Calculate psychological adjustment with breaking points at 15%/25%
 */
function calculatePsychologicalAdjustment(percentChange) {
  const absPercent = Math.abs(percentChange);
  const isPositive = percentChange > 0;

  // Zone 1: Normal momentum (0-15%)
  if (absPercent <= 15) {
    const adjustment = (absPercent / 2) * 0.5;
    return isPositive ? -adjustment : adjustment;
  }

  // Zone 2: First reversal (15-25%)
  else if (absPercent <= 25) {
    const first15Adjustment = (15 / 2) * 0.5; // 3.75
    const beyondAdjustment = ((absPercent - 15) / 2) * 0.5;

    if (isPositive) {
      return -first15Adjustment + beyondAdjustment;
    } else {
      return first15Adjustment - beyondAdjustment;
    }
  }

  // Zone 3: Second reversal (>25%)
  else {
    const first15Adjustment = (15 / 2) * 0.5;
    const next10Adjustment = (10 / 2) * 0.5;
    const beyondAdjustment = ((absPercent - 25) / 2) * 0.5;

    if (isPositive) {
      return -first15Adjustment + next10Adjustment - beyondAdjustment;
    } else {
      return first15Adjustment - next10Adjustment + beyondAdjustment;
    }
  }
}

/**
 * Calculate price movement penalty
 */
function calculatePriceMovementPenalty(percentChange) {
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

/**
 * Calculate 60-day price position score
 */
function calculatePricePositionScore(currentPrice, min60d, max60d) {
  if (!currentPrice || !min60d || !max60d) return 0;

  const range = max60d - min60d;
  if (range === 0) return 0;

  const position = (currentPrice - min60d) / range;

  if (position <= 0.1) return 1.5;  // Oversold
  if (position >= 0.9) return -1.5; // Overbought

  const normalizedPosition = (position - 0.1) / 0.8;
  return (1.0 - (normalizedPosition * 2.0)) * 1.5;
}

/**
 * Calculate volume score with direction validation
 */
function calculateVolumeScore(currentVolume, avgVolume, priceChange) {
  if (!currentVolume || !avgVolume) return 0;

  const ratio = currentVolume / avgVolume;
  let score = 2.5 * ((ratio - 1) / 10);

  // Only allow positive volume score if price is rising
  if (priceChange < -0.05) {
    score = -Math.abs(score);
  } else {
    score = Math.abs(score);
  }

  return Math.max(-1.5, Math.min(1.5, score));
}

/**
 * Calculate MACD adjustment using multi-timeframe analysis
 */
function calculateMacdAdjustment(histogramArray, macdLine, macdMin, macdMax) {
  if (!histogramArray || histogramArray.length < 6) return 0;

  const slopeAnalysis = calculateMacdSlopeAndDirection(histogramArray);

  if (!slopeAnalysis.isValid) return 0;

  const directionMultiplier = slopeAnalysis.direction === 'positive' ? 1 :
                              slopeAnalysis.direction === 'negative' ? -1 : 0;

  const scaledMagnitude = Math.min(1, slopeAnalysis.magnitude * 10);
  let rawAdjustment = directionMultiplier * scaledMagnitude;

  // Apply position-in-range factor if we have MACD line data
  if (macdLine !== null && macdMin !== null && macdMax !== null) {
    const mid = (macdMax + macdMin) / 2;
    const range = macdMax - macdMin;
    if (range > 0) {
      const factor = 1.5 - Math.abs(macdLine - mid) / range;
      rawAdjustment = rawAdjustment * factor;
    }
  }

  return Math.max(-2.5, Math.min(2.5, rawAdjustment));
}

/**
 * MAIN: Calculate effective score using BackBoneApp formula
 */
function calculateEffectiveScore(inputs) {
  const {
    technicalScore = 5.0,
    predictionScore = 5.5,
    percentChange = 0,
    avgDirectional = 0,
    avgPositive = 0,
    daysOld = 0,
    macdHistogramArray = [],
    macdLine = null,
    macdLineMin = null,
    macdLineMax = null,
    currentPrice = null,
    price60dMin = null,
    price60dMax = null,
    volumeRatio = 1,
    earningsScore = 0
  } = inputs;

  // Step 1: Adjust base scores (0 becomes default)
  const adjTechnical = technicalScore === 0 ? 6.0 : technicalScore;
  const adjPrediction = predictionScore === 0 ? 5.5 : predictionScore;

  // Step 2: Psychological adjustment
  const psychAdj = calculatePsychologicalAdjustment(percentChange);

  // Step 3: Historical bonuses (capped at ±1.0)
  const dirBonus = Math.max(-1.0, Math.min(1.0, avgDirectional * 0.2));
  const posBonus = Math.max(-1.0, Math.min(1.0, avgPositive * 0.2));

  // Step 4: Time decay (-0.6 per day, max 7 days)
  const timeDecay = Math.min(7, daysOld) * 0.6;

  // Step 5: MACD adjustment
  const macdAdj = calculateMacdAdjustment(macdHistogramArray, macdLine, macdLineMin, macdLineMax);

  // Step 6: Volume score
  const volScore = calculateVolumeScore(volumeRatio, 1, percentChange);

  // Step 7: Price position score
  const pricePos = calculatePricePositionScore(currentPrice, price60dMin, price60dMax);

  // Step 8: Price movement penalty
  const movePenalty = calculatePriceMovementPenalty(percentChange);

  // Step 9: Apply formula
  const rawScore =
    (adjTechnical + adjPrediction + psychAdj) / 2 +
    dirBonus +
    posBonus -
    timeDecay +
    macdAdj +
    volScore +
    (pricePos * 1.25) +
    (earningsScore * 2.0) +
    movePenalty;

  const effectiveScore = Math.max(0, Math.min(10, rawScore));

  return {
    effectiveScore,
    breakdown: {
      adjTechnical,
      adjPrediction,
      psychAdj,
      dirBonus,
      posBonus,
      timeDecay,
      macdAdj,
      volScore,
      pricePos,
      earningsScore,
      movePenalty
    }
  };
}

// ============================================================================
// FETCH DATA AND RUN TEST
// ============================================================================

async function fetchTickerData(symbol) {
  try {
    // Fetch 3 months of data for proper MACD calculation
    const url = `${YAHOO_CHART_URL}/${symbol}?interval=1d&range=3mo`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) throw new Error("No data returned");

    const meta = result.meta;
    const quotes = result.indicators?.quote?.[0] || {};
    const closes = quotes.close?.filter(c => c !== null) || [];
    const volumes = quotes.volume?.filter(v => v !== null) || [];

    return {
      symbol: meta.symbol,
      name: meta.shortName,
      currentPrice: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose,
      volume: meta.regularMarketVolume,
      closes,
      volumes
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
}

async function runScoreCalculation(symbol) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`SCORE CALCULATION FOR: ${symbol}`);
  console.log(`${"=".repeat(70)}\n`);

  // Fetch data
  console.log("1. FETCHING DATA...\n");
  const data = await fetchTickerData(symbol);

  if (!data) {
    console.log("Failed to fetch data");
    return;
  }

  console.log(`   Symbol: ${data.symbol}`);
  console.log(`   Name: ${data.name}`);
  console.log(`   Current Price: $${data.currentPrice?.toFixed(2)}`);
  console.log(`   Previous Close: $${data.previousClose?.toFixed(2)}`);
  console.log(`   Data Points: ${data.closes.length} days`);

  // Calculate percent change
  const percentChange = ((data.currentPrice - data.previousClose) / data.previousClose) * 100;
  console.log(`   Today's Change: ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`);

  // Calculate technical indicators
  console.log("\n2. CALCULATING TECHNICAL INDICATORS...\n");

  // RSI
  const rsi = calculateRSI(data.closes);
  console.log(`   RSI (14-day): ${rsi}`);

  // Technical score from RSI (0-10 scale)
  const technicalScore = (100 - Math.abs(50 - rsi)) / 10;
  console.log(`   Technical Score: ${technicalScore.toFixed(2)} (derived from RSI)`);

  // MACD
  const macd = calculateMACD(data.closes);
  console.log(`\n   MACD Line: ${macd.macd?.toFixed(4) || 'N/A'}`);
  console.log(`   Signal Line: ${macd.signal?.toFixed(4) || 'N/A'}`);
  console.log(`   Histogram: ${macd.histogram?.toFixed(4) || 'N/A'}`);
  console.log(`   Trend: ${macd.trend.toUpperCase()}`);

  if (macd.histogramArray.length >= 6) {
    const last6 = macd.histogramArray.slice(-6);
    console.log(`   Last 6 Histogram Values: [${last6.map(h => h?.toFixed(4)).join(', ')}]`);

    const slopeAnalysis = calculateMacdSlopeAndDirection(last6);
    console.log(`   MACD Slope: ${slopeAnalysis.slope.toFixed(4)} (${slopeAnalysis.direction.toUpperCase()})`);
    console.log(`   Slope Magnitude: ${slopeAnalysis.magnitude.toFixed(4)}`);
  }

  // 60-day price range
  const closes60d = data.closes.slice(-60);
  const min60d = Math.min(...closes60d);
  const max60d = Math.max(...closes60d);
  const pricePosition = ((data.currentPrice - min60d) / (max60d - min60d)) * 100;
  console.log(`\n   60-Day Low: $${min60d.toFixed(2)}`);
  console.log(`   60-Day High: $${max60d.toFixed(2)}`);
  console.log(`   Price Position: ${pricePosition.toFixed(1)}% of range`);

  // Volume
  const avgVolume = data.volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const volumeRatio = data.volume / avgVolume;
  console.log(`\n   Current Volume: ${(data.volume / 1000000).toFixed(2)}M`);
  console.log(`   Avg Volume (10d): ${(avgVolume / 1000000).toFixed(2)}M`);
  console.log(`   Volume Ratio: ${volumeRatio.toFixed(2)}x`);

  // Calculate each score component
  console.log("\n3. CALCULATING SCORE COMPONENTS...\n");

  const inputs = {
    technicalScore,
    predictionScore: 5.5, // Default prediction score
    percentChange,
    avgDirectional: 0,
    avgPositive: 0,
    daysOld: 0,
    macdHistogramArray: macd.histogramArray,
    macdLine: macd.macd,
    macdLineMin: Math.min(...macd.histogramArray.filter(h => h !== null)),
    macdLineMax: Math.max(...macd.histogramArray.filter(h => h !== null)),
    currentPrice: data.currentPrice,
    price60dMin: min60d,
    price60dMax: max60d,
    volumeRatio,
    earningsScore: 0
  };

  const result = calculateEffectiveScore(inputs);
  const b = result.breakdown;

  console.log(`   a) Adjusted Technical Score: ${b.adjTechnical.toFixed(2)}`);
  console.log(`   b) Adjusted Prediction Score: ${b.adjPrediction.toFixed(2)}`);
  console.log(`   c) Psychological Adjustment: ${b.psychAdj >= 0 ? '+' : ''}${b.psychAdj.toFixed(3)}`);
  console.log(`      (Based on ${percentChange.toFixed(2)}% daily change)`);
  console.log(`   d) Directional Bonus: ${b.dirBonus >= 0 ? '+' : ''}${b.dirBonus.toFixed(3)}`);
  console.log(`   e) Positive Bonus: ${b.posBonus >= 0 ? '+' : ''}${b.posBonus.toFixed(3)}`);
  console.log(`   f) Time Decay Penalty: -${b.timeDecay.toFixed(2)}`);
  console.log(`   g) MACD Adjustment: ${b.macdAdj >= 0 ? '+' : ''}${b.macdAdj.toFixed(3)}`);
  console.log(`   h) Volume Score: ${b.volScore >= 0 ? '+' : ''}${b.volScore.toFixed(3)}`);
  console.log(`   i) Price Position Score: ${b.pricePos >= 0 ? '+' : ''}${b.pricePos.toFixed(3)}`);
  console.log(`      (x1.25 multiplier = ${(b.pricePos * 1.25).toFixed(3)})`);
  console.log(`   j) Earnings Score: ${b.earningsScore.toFixed(3)}`);
  console.log(`      (x2.0 multiplier = ${(b.earningsScore * 2.0).toFixed(3)})`);
  console.log(`   k) Price Movement Penalty: ${b.movePenalty.toFixed(3)}`);

  // Show formula
  console.log("\n4. FORMULA BREAKDOWN...\n");
  console.log(`   Base = (${b.adjTechnical.toFixed(2)} + ${b.adjPrediction.toFixed(2)} + ${b.psychAdj.toFixed(3)}) / 2`);
  console.log(`        = ${((b.adjTechnical + b.adjPrediction + b.psychAdj) / 2).toFixed(3)}`);
  console.log("");
  console.log(`   Score = Base + dirBonus + posBonus - timeDecay + macdAdj + volScore + (pricePos × 1.25) + (earnings × 2.0) + penalty`);
  console.log(`        = ${((b.adjTechnical + b.adjPrediction + b.psychAdj) / 2).toFixed(3)} + ${b.dirBonus.toFixed(3)} + ${b.posBonus.toFixed(3)} - ${b.timeDecay.toFixed(2)} + ${b.macdAdj.toFixed(3)} + ${b.volScore.toFixed(3)} + ${(b.pricePos * 1.25).toFixed(3)} + ${(b.earningsScore * 2.0).toFixed(3)} + ${b.movePenalty.toFixed(3)}`);

  // Final score
  console.log("\n5. FINAL SCORE...\n");
  console.log(`   ${"*".repeat(40)}`);
  console.log(`   *  ${symbol} EFFECTIVE SCORE: ${result.effectiveScore.toFixed(2)} / 10  *`);
  console.log(`   ${"*".repeat(40)}`);

  // Signal interpretation
  let signal, color;
  if (result.effectiveScore >= 8.5) { signal = "STRONG BUY"; color = "GREEN"; }
  else if (result.effectiveScore >= 7.5) { signal = "BUY"; color = "GREEN"; }
  else if (result.effectiveScore >= 5.0) { signal = "HOLD"; color = "YELLOW"; }
  else if (result.effectiveScore >= 3.5) { signal = "SELL"; color = "RED"; }
  else { signal = "STRONG SELL"; color = "RED"; }

  console.log(`\n   Signal: ${signal} (${color})`);
  console.log(`\n${"=".repeat(70)}\n`);

  return result;
}

// Run tests for multiple tickers
async function main() {
  const tickers = ["NVDA", "AAPL", "TSLA"];

  console.log("\n");
  console.log("######################################################");
  console.log("#  BACKBONE SCORE CALCULATION TEST                   #");
  console.log("#  Using BackBoneApp Formula                         #");
  console.log("######################################################");

  for (const ticker of tickers) {
    await runScoreCalculation(ticker);
  }
}

main().catch(console.error);
