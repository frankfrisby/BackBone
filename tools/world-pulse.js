/**
 * Tool: World Pulse
 *
 * Get a real-time snapshot of what's happening in the world:
 * - Market conditions (SPY, major indices, top movers)
 * - Breaking news and headlines
 * - Economic indicators
 * - Sector performance
 *
 * This is the AI's "eyes on the world" - run this frequently to stay informed.
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getDataDir, dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "world-pulse",
  name: "World Pulse",
  description: "Get real-time snapshot of markets, news, and world events",
  category: "world"
};

const DATA_DIR = getDataDir();
const PULSE_CACHE_PATH = dataFile("world-pulse-cache.json");

/**
 * Execute the tool
 * @param {Object} inputs - { focus: "markets" | "news" | "all" }
 * @returns {Promise<Object>} World pulse data
 */
export async function execute(inputs = {}) {
  const { focus = "all" } = inputs;

  const pulse = {
    success: true,
    timestamp: new Date().toISOString(),
    focus
  };

  // Get market data
  if (focus === "all" || focus === "markets") {
    pulse.markets = await getMarketPulse();
  }

  // Get news
  if (focus === "all" || focus === "news") {
    pulse.news = await getNewsPulse();
  }

  // Get ticker signals
  if (focus === "all" || focus === "markets") {
    pulse.signals = await getTickerSignals();
  }

  // Build summary
  pulse.summary = buildPulseSummary(pulse);

  // Cache the pulse
  try {
    fs.writeFileSync(PULSE_CACHE_PATH, JSON.stringify(pulse, null, 2));
  } catch { /* ignore */ }

  return pulse;
}

async function getMarketPulse() {
  try {
    // Fetch SPY for market direction
    const spyUrl = "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=5d";
    const spyRes = await fetch(spyUrl, { headers: { "User-Agent": "Mozilla/5.0" } });

    if (!spyRes.ok) throw new Error("SPY fetch failed");

    const spyData = await spyRes.json();
    const result = spyData?.chart?.result?.[0];
    const quotes = result?.indicators?.quote?.[0];
    const meta = result?.meta;

    const currentPrice = meta?.regularMarketPrice || quotes?.close?.at(-1);
    const prevClose = meta?.previousClose || meta?.chartPreviousClose;
    const change = currentPrice && prevClose ? currentPrice - prevClose : 0;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    // Determine market mood
    let mood = "neutral";
    if (changePercent > 1) mood = "bullish";
    else if (changePercent > 0.3) mood = "slightly bullish";
    else if (changePercent < -1) mood = "bearish";
    else if (changePercent < -0.3) mood = "slightly bearish";

    return {
      spy: {
        price: currentPrice?.toFixed(2),
        change: change?.toFixed(2),
        changePercent: changePercent?.toFixed(2) + "%",
        mood
      },
      tradingHours: isMarketOpen(),
      lastUpdate: new Date().toISOString()
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function getNewsPulse() {
  try {
    // Check news cache
    const newsPath = path.join(DATA_DIR, "news-cache.json");
    if (fs.existsSync(newsPath)) {
      const news = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
      const articles = news.articles || [];

      // Get recent articles (last 24 hours)
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const recent = articles
        .filter(a => new Date(a.publishedAt || a.date).getTime() > cutoff)
        .slice(0, 10);

      return {
        headlines: recent.map(a => ({
          title: a.title,
          source: a.source?.name || a.source,
          category: a.category || "general",
          time: a.publishedAt || a.date
        })),
        count: recent.length,
        lastFetched: news.lastFetched
      };
    }

    return { headlines: [], count: 0, note: "No news cache available" };
  } catch (error) {
    return { error: error.message };
  }
}

async function getTickerSignals() {
  try {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    if (!fs.existsSync(cachePath)) {
      return { signals: [], note: "No ticker data" };
    }

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const tickers = cache.tickers || [];

    // Get extreme signals
    const extremeBuys = tickers.filter(t => t.score >= 9).slice(0, 5);
    const buys = tickers.filter(t => t.score >= 7 && t.score < 9).slice(0, 5);
    const sells = tickers.filter(t => t.score <= 3).slice(0, 5);

    // Top movers
    const topGainers = [...tickers]
      .filter(t => t.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);

    const topLosers = [...tickers]
      .filter(t => t.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);

    return {
      extremeBuys: extremeBuys.map(t => ({ symbol: t.symbol, score: t.score, change: t.changePercent?.toFixed(2) + "%" })),
      buys: buys.map(t => ({ symbol: t.symbol, score: t.score, change: t.changePercent?.toFixed(2) + "%" })),
      sells: sells.map(t => ({ symbol: t.symbol, score: t.score, change: t.changePercent?.toFixed(2) + "%" })),
      topGainers: topGainers.map(t => ({ symbol: t.symbol, change: t.changePercent?.toFixed(2) + "%" })),
      topLosers: topLosers.map(t => ({ symbol: t.symbol, change: t.changePercent?.toFixed(2) + "%" })),
      totalScored: tickers.length
    };
  } catch (error) {
    return { error: error.message };
  }
}

function isMarketOpen() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour * 60 + minute;

  // Weekend
  if (day === 0 || day === 6) return { open: false, reason: "Weekend" };

  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30;  // 9:30 AM
  const marketClose = 16 * 60;      // 4:00 PM

  // Adjust for timezone (assuming local time matches ET for simplicity)
  if (time < marketOpen) return { open: false, reason: "Pre-market", opensIn: `${Math.floor((marketOpen - time) / 60)}h ${(marketOpen - time) % 60}m` };
  if (time >= marketClose) return { open: false, reason: "After-hours" };

  return { open: true, closesIn: `${Math.floor((marketClose - time) / 60)}h ${(marketClose - time) % 60}m` };
}

function buildPulseSummary(pulse) {
  const parts = [];

  if (pulse.markets?.spy) {
    const spy = pulse.markets.spy;
    parts.push(`SPY ${spy.changePercent} (${spy.mood})`);
  }

  if (pulse.signals?.extremeBuys?.length > 0) {
    parts.push(`${pulse.signals.extremeBuys.length} extreme buy signals`);
  }

  if (pulse.news?.count > 0) {
    parts.push(`${pulse.news.count} recent headlines`);
  }

  if (pulse.markets?.tradingHours && !pulse.markets.tradingHours.open) {
    parts.push(`Market: ${pulse.markets.tradingHours.reason}`);
  }

  return parts.join(" | ") || "No significant updates";
}

export default { metadata, execute };
