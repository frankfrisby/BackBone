/**
 * Tool: Market Monitor
 *
 * Monitor market conditions and detect significant events:
 * - Large SPY moves (>1%)
 * - Extreme ticker signals
 * - Unusual volume
 * - Position-affecting news
 *
 * Returns alerts that should be sent to the user.
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getDataDir, dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "market-monitor",
  name: "Market Monitor",
  description: "Monitor markets for significant events and generate alerts",
  category: "world"
};

const DATA_DIR = getDataDir();
const MONITOR_STATE_PATH = dataFile("market-monitor-state.json");

// Alert thresholds
const THRESHOLDS = {
  SPY_MOVE_PERCENT: 1.0,           // Alert if SPY moves more than 1%
  EXTREME_BUY_SCORE: 9.0,          // Extreme buy signal
  EXTREME_SELL_SCORE: 2.0,         // Extreme sell signal
  POSITION_MOVE_PERCENT: 5.0,      // Alert if held position moves 5%
  VOLUME_SPIKE_RATIO: 3.0          // Alert if volume 3x average
};

/**
 * Execute the tool
 * @param {Object} inputs - { checkPositions: boolean, threshold: string }
 * @returns {Promise<Object>} Alerts and market status
 */
export async function execute(inputs = {}) {
  const { checkPositions = true, threshold = "normal" } = inputs;

  const alerts = [];
  const state = loadState();

  // 1. Check SPY movement
  const spyAlert = await checkSpyMovement(state);
  if (spyAlert) alerts.push(spyAlert);

  // 2. Check for extreme signals
  const signalAlerts = await checkExtremeSignals(state);
  alerts.push(...signalAlerts);

  // 3. Check positions if requested
  if (checkPositions) {
    const positionAlerts = await checkPositionMovements(state);
    alerts.push(...positionAlerts);
  }

  // 4. Check for breaking news affecting positions
  const newsAlerts = await checkNewsImpact(state);
  alerts.push(...newsAlerts);

  // Save state
  state.lastCheck = new Date().toISOString();
  state.alertCount = (state.alertCount || 0) + alerts.length;
  saveState(state);

  return {
    success: true,
    timestamp: new Date().toISOString(),
    alertCount: alerts.length,
    alerts: alerts.map(a => ({
      type: a.type,
      severity: a.severity,
      message: a.message,
      data: a.data
    })),
    summary: alerts.length > 0
      ? `${alerts.length} alert${alerts.length > 1 ? "s" : ""}: ${alerts.map(a => a.type).join(", ")}`
      : "No significant market events"
  };
}

function loadState() {
  try {
    if (fs.existsSync(MONITOR_STATE_PATH)) {
      return JSON.parse(fs.readFileSync(MONITOR_STATE_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {
    lastSpyPrice: null,
    lastSpyAlert: null,
    alertedSignals: [],
    alertedPositions: [],
    lastCheck: null
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(MONITOR_STATE_PATH, JSON.stringify(state, null, 2));
  } catch { /* ignore */ }
}

async function checkSpyMovement(state) {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=2d";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });

    if (!res.ok) return null;

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;

    const currentPrice = meta?.regularMarketPrice;
    const prevClose = meta?.previousClose || meta?.chartPreviousClose;

    if (!currentPrice || !prevClose) return null;

    const changePercent = ((currentPrice - prevClose) / prevClose) * 100;

    // Check if significant move
    if (Math.abs(changePercent) >= THRESHOLDS.SPY_MOVE_PERCENT) {
      // Don't alert again within 2 hours for same direction
      const lastAlert = state.lastSpyAlert;
      if (lastAlert) {
        const hoursSince = (Date.now() - new Date(lastAlert.time).getTime()) / (1000 * 60 * 60);
        const sameDirection = (lastAlert.direction === "up" && changePercent > 0) ||
                             (lastAlert.direction === "down" && changePercent < 0);
        if (hoursSince < 2 && sameDirection) return null;
      }

      state.lastSpyAlert = {
        time: new Date().toISOString(),
        direction: changePercent > 0 ? "up" : "down",
        percent: changePercent
      };

      const direction = changePercent > 0 ? "UP" : "DOWN";
      const emoji = changePercent > 0 ? "📈" : "📉";

      return {
        type: "market_move",
        severity: Math.abs(changePercent) >= 2 ? "high" : "medium",
        message: `${emoji} SPY ${direction} ${Math.abs(changePercent).toFixed(2)}%`,
        data: {
          symbol: "SPY",
          price: currentPrice.toFixed(2),
          change: changePercent.toFixed(2) + "%"
        }
      };
    }

    state.lastSpyPrice = currentPrice;
    return null;
  } catch {
    return null;
  }
}

async function checkExtremeSignals(state) {
  const alerts = [];

  try {
    const cachePath = path.join(DATA_DIR, "tickers-cache.json");
    if (!fs.existsSync(cachePath)) return alerts;

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const tickers = cache.tickers || [];

    // Check for new extreme buy signals
    const extremeBuys = tickers.filter(t => t.score >= THRESHOLDS.EXTREME_BUY_SCORE);

    for (const ticker of extremeBuys) {
      // Skip if already alerted today
      const alertKey = `${ticker.symbol}_buy_${new Date().toISOString().split("T")[0]}`;
      if (state.alertedSignals?.includes(alertKey)) continue;

      alerts.push({
        type: "extreme_buy",
        severity: "high",
        message: `🚀 EXTREME BUY: ${ticker.symbol} (Score: ${ticker.score})`,
        data: {
          symbol: ticker.symbol,
          score: ticker.score,
          price: ticker.price,
          change: ticker.changePercent?.toFixed(2) + "%"
        }
      });

      state.alertedSignals = state.alertedSignals || [];
      state.alertedSignals.push(alertKey);
    }

    // Keep alertedSignals clean (last 100)
    if (state.alertedSignals?.length > 100) {
      state.alertedSignals = state.alertedSignals.slice(-50);
    }
  } catch { /* ignore */ }

  return alerts;
}

async function checkPositionMovements(state) {
  const alerts = [];

  try {
    const cachePath = path.join(DATA_DIR, "alpaca-cache.json");
    if (!fs.existsSync(cachePath)) return alerts;

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    const positions = cache.positions || [];

    for (const pos of positions) {
      const symbol = pos.symbol;
      const plPercent = parseFloat(pos.unrealized_plpc) * 100;

      // Check for significant moves
      if (Math.abs(plPercent) >= THRESHOLDS.POSITION_MOVE_PERCENT) {
        const alertKey = `${symbol}_move_${Math.floor(plPercent / 5) * 5}`;
        if (state.alertedPositions?.includes(alertKey)) continue;

        const direction = plPercent > 0 ? "UP" : "DOWN";
        const emoji = plPercent > 0 ? "💰" : "⚠️";

        alerts.push({
          type: "position_move",
          severity: Math.abs(plPercent) >= 10 ? "high" : "medium",
          message: `${emoji} ${symbol} ${direction} ${Math.abs(plPercent).toFixed(1)}% (P&L: $${parseFloat(pos.unrealized_pl).toFixed(2)})`,
          data: {
            symbol,
            plPercent: plPercent.toFixed(2) + "%",
            plDollars: parseFloat(pos.unrealized_pl).toFixed(2),
            currentPrice: parseFloat(pos.current_price).toFixed(2)
          }
        });

        state.alertedPositions = state.alertedPositions || [];
        state.alertedPositions.push(alertKey);
      }
    }

    // Clean up old alerts daily
    const today = new Date().toISOString().split("T")[0];
    if (state.lastPositionCleanup !== today) {
      state.alertedPositions = [];
      state.lastPositionCleanup = today;
    }
  } catch { /* ignore */ }

  return alerts;
}

async function checkNewsImpact(state) {
  const alerts = [];

  try {
    // Get held positions
    const alpacaPath = path.join(DATA_DIR, "alpaca-cache.json");
    if (!fs.existsSync(alpacaPath)) return alerts;

    const alpaca = JSON.parse(fs.readFileSync(alpacaPath, "utf-8"));
    const heldSymbols = (alpaca.positions || []).map(p => p.symbol.toLowerCase());

    if (heldSymbols.length === 0) return alerts;

    // Check news cache for position-relevant news
    const newsPath = path.join(DATA_DIR, "news-cache.json");
    if (!fs.existsSync(newsPath)) return alerts;

    const news = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
    const articles = news.articles || [];

    // Find news mentioning held positions (last 6 hours)
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    const recent = articles.filter(a =>
      new Date(a.publishedAt || a.date).getTime() > cutoff
    );

    for (const article of recent) {
      const title = (article.title || "").toLowerCase();
      const desc = (article.description || "").toLowerCase();

      for (const symbol of heldSymbols) {
        if (title.includes(symbol) || desc.includes(symbol)) {
          const alertKey = `news_${symbol}_${article.title?.slice(0, 30)}`;
          if (state.alertedNews?.includes(alertKey)) continue;

          alerts.push({
            type: "news_impact",
            severity: "medium",
            message: `📰 News on ${symbol.toUpperCase()}: ${article.title?.slice(0, 60)}...`,
            data: {
              symbol: symbol.toUpperCase(),
              headline: article.title,
              source: article.source?.name || article.source
            }
          });

          state.alertedNews = state.alertedNews || [];
          state.alertedNews.push(alertKey);
          break; // One alert per article
        }
      }
    }

    // Clean news alerts daily
    const today = new Date().toISOString().split("T")[0];
    if (state.lastNewsCleanup !== today) {
      state.alertedNews = [];
      state.lastNewsCleanup = today;
    }
  } catch { /* ignore */ }

  return alerts;
}

export default { metadata, execute };
