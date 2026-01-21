import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/**
 * Yahoo Finance Background Server
 * Runs as a local server to fetch stock data
 * Caches data and serves to BACKBONE app
 */

const app = express();
const PORT = process.env.YAHOO_SERVER_PORT || 3001;

// Data cache
let tickerCache = {
  tickers: [],
  lastUpdate: null,
  updating: false
};

const YAHOO_FINANCE_BASE = "https://query1.finance.yahoo.com/v8/finance";
const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const REFRESH_INTERVAL = 180000; // 3 minutes

// Default tickers to track
const DEFAULT_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK-B",
  "JPM", "V", "UNH", "XOM", "MA", "HD", "PG", "JNJ", "COST", "ABBV",
  "MRK", "CVX", "AMD", "NFLX", "CRM", "PEP", "KO", "ORCL", "WMT", "DIS",
  "ADBE", "INTC", "CSCO", "VZ", "NKE", "MCD", "IBM", "QCOM", "TXN", "AVGO"
];

/**
 * Fetch quote for a single ticker
 */
const fetchQuote = async (symbol) => {
  try {
    const url = `${YAHOO_FINANCE_BASE}/quote?symbols=${symbol}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) return null;

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
      marketState: quote.marketState
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
};

/**
 * Fetch quote using chart API (more reliable)
 */
const fetchQuoteFromChart = async (symbol) => {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;

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
    const volumes = quotes.volume?.filter(v => v !== null) || [];

    // Get previous close for change calculation
    const previousClose = closes.length > 1 ? closes[closes.length - 2] : meta.chartPreviousClose;
    const currentPrice = meta.regularMarketPrice;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: meta.symbol,
      shortName: meta.shortName,
      longName: meta.longName,
      regularMarketPrice: currentPrice,
      regularMarketPreviousClose: previousClose,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      regularMarketVolume: meta.regularMarketVolume,
      regularMarketDayHigh: meta.regularMarketDayHigh,
      regularMarketDayLow: meta.regularMarketDayLow,
      averageDailyVolume10Day: volumes.length > 0
        ? volumes.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, volumes.length)
        : null,
      marketCap: meta.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      // Include historical for MACD
      historicalCloses: closes,
      historicalVolumes: volumes
    };
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
};

/**
 * Fetch quotes for multiple tickers
 */
const fetchQuotes = async (symbols) => {
  const results = [];

  // Fetch in parallel batches of 5
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(fetchQuoteFromChart));
    results.push(...batchResults.filter(Boolean));

    // Small delay between batches
    if (i + 5 < symbols.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return results;
};

/**
 * Fetch historical data for MACD calculation
 */
const fetchHistorical = async (symbol) => {
  try {
    const url = `${YAHOO_CHART_BASE}/${symbol}?range=1mo&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};

    return timestamps.map((timestamp, i) => ({
      timestamp,
      close: quotes.close?.[i],
      volume: quotes.volume?.[i]
    })).filter(bar => bar.close !== null);
  } catch (error) {
    return null;
  }
};

/**
 * Calculate EMA
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
 * Calculate MACD
 */
const calculateMACD = (bars) => {
  if (!bars || bars.length < 35) {
    return { macd: null, signal: null, histogram: null, trend: "neutral" };
  }

  const closes = bars.map(b => b.close);
  const shortEMA = calculateEMA(closes, 12);
  const longEMA = calculateEMA(closes, 26);

  if (!shortEMA || !longEMA) {
    return { macd: null, signal: null, histogram: null, trend: "neutral" };
  }

  const macd = shortEMA - longEMA;
  const macdHistory = [];
  for (let i = 26; i <= closes.length; i++) {
    const s = calculateEMA(closes.slice(0, i), 12);
    const l = calculateEMA(closes.slice(0, i), 26);
    if (s && l) macdHistory.push(s - l);
  }

  const signal = macdHistory.length >= 9 ? calculateEMA(macdHistory, 9) : macd;
  const histogram = macd - signal;

  let trend = "neutral";
  if (macd > signal && histogram > 0) trend = "bullish";
  else if (macd < signal && histogram < 0) trend = "bearish";

  return {
    macd: Math.round(macd * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    trend
  };
};

/**
 * Calculate volume score
 */
const calculateVolumeScore = (bars) => {
  if (!bars || bars.length < 2) return { score: 50, ratio: 1, status: "normal" };

  const volumes = bars.map(b => b.volume).filter(v => v);
  if (volumes.length < 2) return { score: 50, ratio: 1, status: "normal" };

  const current = volumes[volumes.length - 1];
  const avg = volumes.slice(0, -1).reduce((s, v) => s + v, 0) / (volumes.length - 1);
  if (!avg) return { score: 50, ratio: 1, status: "normal" };

  const ratio = current / avg;
  const score = Math.min(100, Math.max(0, 50 + (ratio - 1) * 50));

  let status = "normal";
  if (ratio >= 1.5) status = "high";
  else if (ratio >= 1.2) status = "above_avg";
  else if (ratio <= 0.5) status = "low";
  else if (ratio <= 0.8) status = "below_avg";

  return { score: Math.round(score), ratio: Math.round(ratio * 100) / 100, status };
};

/**
 * Build full ticker analysis
 */
const buildTickerAnalysis = async (symbol, quote) => {
  // Use historical data already fetched with quote
  const bars = quote.historicalCloses?.map((close, i) => ({
    close,
    volume: quote.historicalVolumes?.[i]
  })) || [];

  const macd = calculateMACD(bars);
  const volumeScore = calculateVolumeScore(bars);

  // Calculate overall score
  let score = 50;
  if (macd.trend === "bullish") score += 15;
  else if (macd.trend === "bearish") score -= 15;
  if (volumeScore.score) score += (volumeScore.score - 50) * 0.3;
  if (quote.changePercent) score += Math.min(15, Math.max(-15, quote.changePercent * 3));
  score = Math.min(100, Math.max(0, score));

  return {
    symbol: quote.symbol,
    name: quote.shortName || quote.longName,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange,
    changePercent: quote.regularMarketChangePercent,
    volume: quote.regularMarketVolume,
    avgVolume: quote.averageDailyVolume10Day,
    marketCap: quote.marketCap,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    macd,
    volumeScore,
    score: Math.round(score)
  };
};

/**
 * Update all tickers
 */
const updateTickers = async () => {
  if (tickerCache.updating) return;
  tickerCache.updating = true;

  console.log(`[${new Date().toISOString()}] Updating tickers...`);

  try {
    const quotes = await fetchQuotes(DEFAULT_TICKERS);

    if (quotes.length === 0) {
      console.log("No quotes received from Yahoo Finance");
      tickerCache.updating = false;
      return;
    }

    const analyses = [];

    // Process in batches of 5 to avoid rate limiting
    for (let i = 0; i < quotes.length; i += 5) {
      const batch = quotes.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(quote => buildTickerAnalysis(quote.symbol, quote))
      );
      analyses.push(...batchResults);

      // Small delay between batches
      if (i + 5 < quotes.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Sort by score
    const sorted = analyses.sort((a, b) => b.score - a.score);

    tickerCache.tickers = sorted;
    tickerCache.lastUpdate = new Date().toISOString();

    console.log(`[${new Date().toISOString()}] Updated ${sorted.length} tickers. Top: ${sorted[0]?.symbol} (${sorted[0]?.score})`);

    // Save to file for persistence
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "tickers-cache.json"),
      JSON.stringify(tickerCache, null, 2)
    );

  } catch (error) {
    console.error("Error updating tickers:", error.message);
  }

  tickerCache.updating = false;
};

// API Routes
app.use(express.json());

// Get all tickers
app.get("/api/tickers", (req, res) => {
  res.json({
    success: true,
    tickers: tickerCache.tickers,
    lastUpdate: tickerCache.lastUpdate,
    count: tickerCache.tickers.length
  });
});

// Get single ticker
app.get("/api/ticker/:symbol", (req, res) => {
  const ticker = tickerCache.tickers.find(t => t.symbol === req.params.symbol.toUpperCase());
  if (ticker) {
    res.json({ success: true, ticker });
  } else {
    res.status(404).json({ success: false, error: "Ticker not found" });
  }
});

// Force refresh
app.post("/api/refresh", async (req, res) => {
  await updateTickers();
  res.json({ success: true, message: "Refresh started" });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    lastUpdate: tickerCache.lastUpdate,
    tickerCount: tickerCache.tickers.length
  });
});

// Load cached data on startup
const loadCache = () => {
  try {
    const cachePath = path.join(process.cwd(), "data", "tickers-cache.json");
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      tickerCache = data;
      console.log(`Loaded ${data.tickers.length} cached tickers from ${data.lastUpdate}`);
    }
  } catch (error) {
    console.log("No cache found, starting fresh");
  }
};

// Start server
const startServer = () => {
  loadCache();

  app.listen(PORT, () => {
    console.log(`Yahoo Finance Server running on http://localhost:${PORT}`);
    console.log(`Endpoints:`);
    console.log(`  GET  /api/tickers - Get all tickers`);
    console.log(`  GET  /api/ticker/:symbol - Get single ticker`);
    console.log(`  POST /api/refresh - Force refresh`);
    console.log(`  GET  /health - Health check`);
  });

  // Initial update
  updateTickers();

  // Schedule updates every 3 minutes
  setInterval(updateTickers, REFRESH_INTERVAL);
};

startServer();
