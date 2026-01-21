import fetch from "node-fetch";

/**
 * Yahoo Finance Service for BACKBONE
 * Fetches real stock data with 3-minute refresh interval
 */

const YAHOO_FINANCE_BASE = "https://query1.finance.yahoo.com/v8/finance";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

// Cache for rate limiting
let lastFetchTime = 0;
const MIN_FETCH_INTERVAL = 180000; // 3 minutes in milliseconds
const cache = {
  quotes: {},
  lastUpdate: null
};

/**
 * Get Yahoo Finance configuration
 */
export const getYahooFinanceConfig = () => {
  return {
    refreshInterval: parseInt(process.env.YAHOO_REFRESH_INTERVAL) || 180000, // 3 minutes default
    maxTickers: parseInt(process.env.YAHOO_MAX_TICKERS) || 100,
    enabled: process.env.YAHOO_FINANCE_ENABLED !== "false"
  };
};

/**
 * Check if we can fetch (rate limiting)
 */
const canFetch = () => {
  const now = Date.now();
  return now - lastFetchTime >= MIN_FETCH_INTERVAL;
};

/**
 * Fetch quote for a single ticker
 */
export const fetchQuote = async (symbol) => {
  try {
    const url = `${YAHOO_FINANCE_BASE}/quote?symbols=${symbol}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "BACKBONE/2.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance error: ${response.status}`);
    }

    const data = await response.json();
    const quote = data.quoteResponse?.result?.[0];

    if (!quote) return null;

    return {
      symbol: quote.symbol,
      shortName: quote.shortName,
      longName: quote.longName,
      price: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose,
      open: quote.regularMarketOpen,
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      volume: quote.regularMarketVolume,
      avgVolume: quote.averageDailyVolume10Day,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      marketCap: quote.marketCap,
      fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      marketState: quote.marketState,
      exchange: quote.exchange,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Yahoo Finance quote error for ${symbol}:`, error.message);
    return null;
  }
};

/**
 * Fetch quotes for multiple tickers
 */
export const fetchQuotes = async (symbols) => {
  if (!symbols || symbols.length === 0) return {};

  // Rate limiting check
  if (!canFetch()) {
    console.log("Yahoo Finance: Using cached data (rate limited)");
    return cache.quotes;
  }

  try {
    const symbolsStr = symbols.join(",");
    const url = `${YAHOO_FINANCE_BASE}/quote?symbols=${symbolsStr}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "BACKBONE/2.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance error: ${response.status}`);
    }

    const data = await response.json();
    const quotes = data.quoteResponse?.result || [];

    const result = {};
    quotes.forEach((quote) => {
      result[quote.symbol] = {
        symbol: quote.symbol,
        shortName: quote.shortName,
        price: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        volume: quote.regularMarketVolume,
        avgVolume: quote.averageDailyVolume10Day,
        marketCap: quote.marketCap,
        high: quote.regularMarketDayHigh,
        low: quote.regularMarketDayLow
      };
    });

    // Update cache
    cache.quotes = result;
    cache.lastUpdate = new Date().toISOString();
    lastFetchTime = Date.now();

    return result;
  } catch (error) {
    console.error("Yahoo Finance quotes error:", error.message);
    return cache.quotes; // Return cached data on error
  }
};

/**
 * Fetch historical data for MACD calculation
 */
export const fetchHistoricalData = async (symbol, period = "1mo", interval = "1d") => {
  try {
    const url = `${YAHOO_CHART_BASE}/${symbol}?range=${period}&interval=${interval}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "BACKBONE/2.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance chart error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    const bars = timestamps.map((timestamp, i) => ({
      timestamp: new Date(timestamp * 1000).toISOString(),
      open: quotes.open?.[i],
      high: quotes.high?.[i],
      low: quotes.low?.[i],
      close: quotes.close?.[i],
      volume: quotes.volume?.[i]
    })).filter(bar => bar.close !== null);

    return {
      symbol,
      bars,
      meta: {
        currency: result.meta?.currency,
        exchangeName: result.meta?.exchangeName,
        instrumentType: result.meta?.instrumentType
      }
    };
  } catch (error) {
    console.error(`Yahoo Finance historical error for ${symbol}:`, error.message);
    return null;
  }
};

/**
 * Calculate EMA (Exponential Moving Average)
 */
const calculateEMA = (prices, period) => {
  if (prices.length < period) return null;

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
};

/**
 * Calculate MACD from historical data
 */
export const calculateMACD = (bars, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) => {
  if (!bars || bars.length < longPeriod + signalPeriod) {
    return { macd: null, signal: null, histogram: null, trend: null };
  }

  const closePrices = bars.map((b) => b.close).filter((p) => p !== null);

  const shortEMA = calculateEMA(closePrices, shortPeriod);
  const longEMA = calculateEMA(closePrices, longPeriod);

  if (shortEMA === null || longEMA === null) {
    return { macd: null, signal: null, histogram: null, trend: null };
  }

  const macd = shortEMA - longEMA;

  // Calculate MACD line history for signal
  const macdHistory = [];
  for (let i = longPeriod; i <= closePrices.length; i++) {
    const shortE = calculateEMA(closePrices.slice(0, i), shortPeriod);
    const longE = calculateEMA(closePrices.slice(0, i), longPeriod);
    if (shortE !== null && longE !== null) {
      macdHistory.push(shortE - longE);
    }
  }

  const signal = macdHistory.length >= signalPeriod ? calculateEMA(macdHistory, signalPeriod) : macd;
  const histogram = macd - signal;

  // Determine trend (using corrected formula: histogram = signal - macd for display)
  let trend = "neutral";
  if (macd > signal && histogram > 0) {
    trend = "bullish";
  } else if (macd < signal && histogram < 0) {
    trend = "bearish";
  }

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    trend
  };
};

/**
 * Calculate Volume Score
 */
export const calculateVolumeScore = (bars) => {
  if (!bars || bars.length < 2) {
    return { score: null, ratio: null, status: null };
  }

  const volumes = bars.map((b) => b.volume).filter((v) => v !== null);
  if (volumes.length < 2) {
    return { score: null, ratio: null, status: null };
  }

  const currentVolume = volumes[volumes.length - 1];
  const avgVolume = volumes.slice(0, -1).reduce((sum, v) => sum + v, 0) / (volumes.length - 1);

  if (avgVolume === 0) {
    return { score: null, ratio: null, status: null };
  }

  const ratio = currentVolume / avgVolume;
  const score = Math.min(100, Math.max(0, 50 + (ratio - 1) * 50));

  let status = "normal";
  if (ratio >= 1.5) status = "high";
  else if (ratio >= 1.2) status = "above_avg";
  else if (ratio <= 0.5) status = "low";
  else if (ratio <= 0.8) status = "below_avg";

  return {
    score: Math.round(score),
    ratio: Math.round(ratio * 100) / 100,
    status
  };
};

/**
 * Build comprehensive ticker analysis from Yahoo Finance
 */
export const buildTickerAnalysis = async (symbol) => {
  const [quote, historical] = await Promise.all([
    fetchQuote(symbol),
    fetchHistoricalData(symbol, "1mo", "1d")
  ]);

  if (!quote) return null;

  const macd = historical ? calculateMACD(historical.bars) : null;
  const volumeScore = historical ? calculateVolumeScore(historical.bars) : null;

  // Calculate overall score based on multiple factors
  let score = 50; // Base score

  // MACD contribution
  if (macd?.trend === "bullish") score += 15;
  else if (macd?.trend === "bearish") score -= 15;

  // Volume contribution
  if (volumeScore?.score) {
    score += (volumeScore.score - 50) * 0.3;
  }

  // Momentum contribution (change percent)
  if (quote.changePercent) {
    score += Math.min(15, Math.max(-15, quote.changePercent * 3));
  }

  // Clamp score to 0-100
  score = Math.min(100, Math.max(0, score));

  return {
    symbol: quote.symbol,
    name: quote.shortName || quote.longName,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume,
    avgVolume: quote.avgVolume,
    marketCap: quote.marketCap,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    macd,
    volumeScore,
    score: Math.round(score),
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Build analysis for multiple tickers
 */
export const buildTickersAnalysis = async (symbols, maxConcurrent = 5) => {
  const results = {};

  // Process in batches to avoid rate limiting
  for (let i = 0; i < symbols.length; i += maxConcurrent) {
    const batch = symbols.slice(i, i + maxConcurrent);
    const analyses = await Promise.all(batch.map((s) => buildTickerAnalysis(s)));

    analyses.forEach((analysis, idx) => {
      if (analysis) {
        results[batch[idx]] = analysis;
      }
    });

    // Small delay between batches
    if (i + maxConcurrent < symbols.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
};

/**
 * Get cache status
 */
export const getCacheStatus = () => {
  return {
    lastUpdate: cache.lastUpdate,
    tickerCount: Object.keys(cache.quotes).length,
    canFetch: canFetch(),
    nextFetchAllowed: new Date(lastFetchTime + MIN_FETCH_INTERVAL).toISOString()
  };
};
