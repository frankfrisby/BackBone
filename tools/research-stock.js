/**
 * Tool: Research Stock
 *
 * Deep research a stock using available data sources.
 * Returns structured findings that can inform conviction decisions.
 */

import { fetchTicker } from "../src/services/trading/yahoo-client.js";
import { getResearchConvictions } from "../src/services/trading/research-convictions.js";
import fs from "fs";
import path from "path";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "research-stock",
  name: "Research Stock",
  description: "Deep research a stock using web search, news, and financial data",
  category: "research"
};

/**
 * Execute the tool
 * @param {Object} inputs - { symbol, depth }
 * @returns {Promise<Object>} Result
 */
export async function execute(inputs) {
  const { symbol, depth = "standard" } = inputs;

  if (!symbol) {
    return { success: false, error: "Symbol is required" };
  }

  const sym = symbol.toUpperCase();

  try {
    // Get current ticker data
    const ticker = await fetchTicker(sym);

    // Get any existing conviction
    const convictions = getResearchConvictions();
    const existingConviction = convictions.getConviction(sym);

    // Build research report
    const report = {
      success: true,
      symbol: sym,
      timestamp: new Date().toISOString(),
      depth,

      // Current market data
      marketData: ticker ? {
        price: ticker.price,
        change: ticker.change,
        changePercent: ticker.changePercent,
        volume: ticker.volume,
        avgVolume: ticker.avgVolume,
        marketCap: ticker.marketCap
      } : null,

      // Technical analysis
      technicals: ticker ? {
        score: ticker.score,
        signal: getSignal(ticker.score),
        rsi: ticker.rsi,
        macdTrend: ticker.macdTrend,
        volumeSigma: ticker.volumeSigma
      } : null,

      // Existing conviction
      existingConviction: existingConviction ? {
        level: existingConviction.conviction,
        boost: convictions.getEffectiveBoost(sym),
        reason: existingConviction.reason,
        daysRemaining: Math.ceil((new Date(existingConviction.expiresAt) - new Date()) / (24 * 60 * 60 * 1000))
      } : null,

      // Research prompts for AI to investigate
      researchPrompts: generateResearchPrompts(sym, ticker, depth),

      // Conviction suggestion based on current data
      convictionSuggestion: generateConvictionSuggestion(ticker)
    };

    // Add news cache if available
    try {
      const newsCache = JSON.parse(fs.readFileSync(dataFile("news-cache.json"), "utf-8"));
      const relevantNews = (newsCache.articles || [])
        .filter(a => a.title?.toLowerCase().includes(sym.toLowerCase()) ||
                     a.description?.toLowerCase().includes(sym.toLowerCase()))
        .slice(0, 5);

      if (relevantNews.length > 0) {
        report.recentNews = relevantNews.map(n => ({
          title: n.title,
          source: n.source?.name || n.source,
          date: n.publishedAt
        }));
      }
    } catch { /* no news cache */ }

    return report;
  } catch (error) {
    return { success: false, error: error.message, symbol: sym };
  }
}

function getSignal(score) {
  if (score >= 9) return "EXTREME BUY";
  if (score >= 8) return "BUY";
  if (score >= 6.5) return "MODERATE BUY";
  if (score >= 4) return "HOLD";
  if (score >= 3) return "SELL";
  return "EXTREME SELL";
}

function generateResearchPrompts(symbol, ticker, depth) {
  const prompts = [
    `What are the key catalysts for ${symbol} in the next 30 days?`,
    `What is ${symbol}'s competitive position in its industry?`,
    `Are there any upcoming earnings or events for ${symbol}?`
  ];

  if (depth === "deep") {
    prompts.push(
      `What are analysts' price targets for ${symbol}?`,
      `What are the main risks for ${symbol}?`,
      `How does ${symbol}'s valuation compare to peers?`,
      `What is institutional ownership trend for ${symbol}?`
    );
  }

  if (ticker) {
    if (ticker.score >= 8) {
      prompts.push(`${symbol} has a high score (${ticker.score}). What fundamentals support this?`);
    }
    if (ticker.score <= 3) {
      prompts.push(`${symbol} has a low score (${ticker.score}). Is this a buying opportunity or value trap?`);
    }
    if (ticker.changePercent && Math.abs(ticker.changePercent) > 5) {
      prompts.push(`${symbol} moved ${ticker.changePercent.toFixed(1)}% today. What drove this move?`);
    }
  }

  return prompts;
}

function generateConvictionSuggestion(ticker) {
  if (!ticker) {
    return { suggested: false, reason: "No ticker data available" };
  }

  // High score + good momentum = suggest conviction
  if (ticker.score >= 8) {
    return {
      suggested: true,
      level: Math.min(1.0, ticker.score / 10),
      reason: `High score (${ticker.score}) indicates strong technical setup`,
      confidence: "high"
    };
  }

  // Moderate score with positive momentum
  if (ticker.score >= 6.5 && ticker.macdTrend === "bullish") {
    return {
      suggested: true,
      level: 0.5,
      reason: `Moderate score with bullish MACD trend`,
      confidence: "medium"
    };
  }

  // Low score but possible turnaround
  if (ticker.score <= 4 && ticker.rsi < 30) {
    return {
      suggested: true,
      level: 0.3,
      reason: `Oversold (RSI ${ticker.rsi}) — potential mean reversion`,
      confidence: "speculative"
    };
  }

  return {
    suggested: false,
    reason: `Current score (${ticker.score}) doesn't warrant conviction. Research fundamentals first.`
  };
}

export default { metadata, execute };
