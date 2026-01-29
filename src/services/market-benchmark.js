/**
 * Market Benchmark Service
 *
 * Tracks major market indices (S&P 500, NASDAQ, DOW) and provides
 * benchmark context for portfolio performance.
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const BENCHMARK_CACHE_FILE = path.join(DATA_DIR, "market-benchmarks.json");

// Major benchmark symbols
const BENCHMARKS = {
  SP500: {
    symbol: "SPY",     // S&P 500 ETF (most liquid)
    name: "S&P 500",
    description: "Standard & Poor's 500 Index"
  },
  NASDAQ: {
    symbol: "QQQ",     // NASDAQ-100 ETF
    name: "NASDAQ",
    description: "NASDAQ Composite"
  },
  DOW: {
    symbol: "DIA",     // Dow Jones ETF
    name: "DOW",
    description: "Dow Jones Industrial Average"
  },
  VIX: {
    symbol: "VXX",     // VIX ETN (volatility proxy)
    name: "VIX",
    description: "CBOE Volatility Index"
  },
  BONDS: {
    symbol: "TLT",     // 20+ Year Treasury ETF
    name: "BONDS",
    description: "20+ Year Treasury Bonds"
  }
};

/**
 * Read JSON helper
 */
function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Write JSON helper
 */
function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

class MarketBenchmarkService extends EventEmitter {
  constructor() {
    super();
    this.benchmarks = new Map();
    this.lastUpdate = null;
    this.config = null;
    this.updateInterval = null;
    this.initialized = false;
  }

  /**
   * Initialize with Alpaca config
   */
  async initialize(alpacaConfig) {
    this.config = alpacaConfig;

    // Load cached data
    const cached = readJson(BENCHMARK_CACHE_FILE);
    if (cached) {
      for (const [key, data] of Object.entries(cached.benchmarks || {})) {
        this.benchmarks.set(key, data);
      }
      this.lastUpdate = cached.lastUpdate;
    }

    this.initialized = true;
    console.log("[MarketBenchmark] Initialized");

    // Initial fetch if config is ready
    if (this.config?.ready) {
      await this.fetchBenchmarks();
    }

    return this;
  }

  /**
   * Fetch latest benchmark data from Alpaca
   */
  async fetchBenchmarks() {
    if (!this.config?.ready) {
      console.log("[MarketBenchmark] Alpaca not configured, skipping fetch");
      return;
    }

    try {
      const { fetchLatestBars } = await import("./alpaca.js");

      const symbols = Object.values(BENCHMARKS).map(b => b.symbol);
      const bars = await fetchLatestBars(this.config, symbols);

      for (const [key, info] of Object.entries(BENCHMARKS)) {
        const symbolBars = bars[info.symbol];

        if (symbolBars && symbolBars.length >= 2) {
          const prevBar = symbolBars[symbolBars.length - 2];
          const currBar = symbolBars[symbolBars.length - 1];

          const change = ((currBar.c - prevBar.c) / prevBar.c) * 100;
          const dayRange = ((currBar.h - currBar.l) / currBar.l) * 100;

          this.benchmarks.set(key, {
            key,
            symbol: info.symbol,
            name: info.name,
            description: info.description,
            price: currBar.c,
            open: currBar.o,
            high: currBar.h,
            low: currBar.l,
            close: currBar.c,
            volume: currBar.v,
            change,
            changePercent: change.toFixed(2),
            dayRange: dayRange.toFixed(2),
            previousClose: prevBar.c,
            timestamp: currBar.t,
            lastUpdated: new Date().toISOString()
          });
        }
      }

      this.lastUpdate = new Date().toISOString();
      this.saveCache();
      this.emit("benchmarks-updated", this.getAll());

    } catch (err) {
      console.error("[MarketBenchmark] Fetch error:", err.message);
    }
  }

  /**
   * Get S&P 500 data specifically
   */
  getSP500() {
    return this.benchmarks.get("SP500") || null;
  }

  /**
   * Get all benchmarks
   */
  getAll() {
    return Object.fromEntries(this.benchmarks);
  }

  /**
   * Get market sentiment based on benchmarks
   */
  getMarketSentiment() {
    const sp500 = this.getSP500();
    const vix = this.benchmarks.get("VIX");

    if (!sp500) {
      return { sentiment: "unknown", confidence: 0 };
    }

    let sentiment = "neutral";
    let confidence = 50;
    const signals = [];

    // S&P 500 change analysis
    if (sp500.change > 1) {
      sentiment = "bullish";
      confidence += 20;
      signals.push("S&P 500 up over 1%");
    } else if (sp500.change > 0.5) {
      sentiment = "slightly_bullish";
      confidence += 10;
      signals.push("S&P 500 positive");
    } else if (sp500.change < -1) {
      sentiment = "bearish";
      confidence += 20;
      signals.push("S&P 500 down over 1%");
    } else if (sp500.change < -0.5) {
      sentiment = "slightly_bearish";
      confidence += 10;
      signals.push("S&P 500 negative");
    }

    // VIX analysis (fear gauge)
    if (vix) {
      if (vix.change > 10) {
        if (sentiment.includes("bullish")) sentiment = "neutral";
        signals.push("VIX spiking (fear rising)");
        confidence -= 10;
      } else if (vix.change < -5) {
        signals.push("VIX falling (fear declining)");
        confidence += 5;
      }
    }

    return {
      sentiment,
      confidence: Math.min(100, Math.max(0, confidence)),
      signals,
      sp500Change: sp500.changePercent,
      vixChange: vix?.changePercent || null,
      lastUpdated: this.lastUpdate
    };
  }

  /**
   * Compare portfolio performance to benchmark
   */
  compareToBenchmark(portfolioReturn, benchmarkKey = "SP500") {
    const benchmark = this.benchmarks.get(benchmarkKey);

    if (!benchmark) {
      return { alpha: null, error: "Benchmark data not available" };
    }

    const alpha = portfolioReturn - benchmark.change;

    return {
      portfolioReturn: portfolioReturn.toFixed(2),
      benchmarkReturn: benchmark.changePercent,
      alpha: alpha.toFixed(2),
      outperforming: alpha > 0,
      benchmark: benchmark.name
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const sp500 = this.getSP500();
    const nasdaq = this.benchmarks.get("NASDAQ");
    const dow = this.benchmarks.get("DOW");
    const vix = this.benchmarks.get("VIX");

    const formatBenchmark = (b) => {
      if (!b) return null;
      return {
        name: b.name,
        price: b.price?.toFixed(2),
        change: b.change?.toFixed(2),
        changeSign: b.change >= 0 ? "+" : "",
        color: b.change >= 0 ? "#22c55e" : "#ef4444"
      };
    };

    return {
      sp500: formatBenchmark(sp500),
      nasdaq: formatBenchmark(nasdaq),
      dow: formatBenchmark(dow),
      vix: formatBenchmark(vix),
      sentiment: this.getMarketSentiment(),
      lastUpdated: this.lastUpdate
    };
  }

  /**
   * Get compact display for header/status bar
   */
  getCompactDisplay() {
    const sp500 = this.getSP500();

    if (!sp500) {
      return {
        text: "S&P: --",
        color: "#64748b"
      };
    }

    const sign = sp500.change >= 0 ? "+" : "";
    const color = sp500.change >= 0 ? "#22c55e" : "#ef4444";

    return {
      text: `S&P: ${sp500.price?.toFixed(2)} (${sign}${sp500.changePercent}%)`,
      color,
      price: sp500.price,
      change: sp500.change,
      changePercent: sp500.changePercent
    };
  }

  /**
   * Start automatic updates
   */
  startAutoUpdate(intervalMs = 60000) {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.fetchBenchmarks();
    }, intervalMs);

    console.log(`[MarketBenchmark] Auto-update started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop auto updates
   */
  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Save to cache
   */
  saveCache() {
    writeJson(BENCHMARK_CACHE_FILE, {
      benchmarks: Object.fromEntries(this.benchmarks),
      lastUpdate: this.lastUpdate
    });
  }
}

// Singleton
let instance = null;

export const getMarketBenchmarkService = () => {
  if (!instance) {
    instance = new MarketBenchmarkService();
  }
  return instance;
};

export { BENCHMARKS };
export default MarketBenchmarkService;
