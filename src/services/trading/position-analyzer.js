/**
 * Position Analyzer - Analyzes positions and explains trading decisions
 *
 * Provides:
 * - Position hold time tracking
 * - Explanation of why positions are held or sold
 * - Score-based decision analysis
 * - Context for AI to answer user questions about positions
 */

import fs from "fs";
import path from "path";
import { getAlpacaConfig, fetchPositions } from "./alpaca.js";
import { evaluateSellSignal, getTradingStatus } from "./auto-trader.js";
import { SCORE_THRESHOLDS } from "./score-engine.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const POSITION_HISTORY_FILE = path.join(DATA_DIR, "position-history.json");

// Cache for position entry dates
let positionHistory = {};

/**
 * Load position history from file
 */
const loadPositionHistory = () => {
  try {
    if (fs.existsSync(POSITION_HISTORY_FILE)) {
      positionHistory = JSON.parse(fs.readFileSync(POSITION_HISTORY_FILE, "utf-8"));
    }
  } catch (error) {
    positionHistory = {};
  }
  return positionHistory;
};

/**
 * Save position history to file
 */
const savePositionHistory = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(POSITION_HISTORY_FILE, JSON.stringify(positionHistory, null, 2));
  } catch (error) {
    console.error("Error saving position history:", error.message);
  }
};

/**
 * Track when a position was entered
 * Call this when a buy order is executed
 */
export const trackPositionEntry = (symbol, entryPrice, quantity, timestamp = new Date().toISOString()) => {
  if (!positionHistory[symbol]) {
    positionHistory[symbol] = {
      symbol,
      entryDate: timestamp,
      entryPrice,
      quantity,
      updates: []
    };
  }
  positionHistory[symbol].updates.push({
    action: "entry",
    price: entryPrice,
    quantity,
    timestamp
  });
  savePositionHistory();
};

/**
 * Track when a position is exited
 */
export const trackPositionExit = (symbol, exitPrice, quantity, reason, timestamp = new Date().toISOString()) => {
  if (positionHistory[symbol]) {
    positionHistory[symbol].exitDate = timestamp;
    positionHistory[symbol].exitPrice = exitPrice;
    positionHistory[symbol].exitReason = reason;
    positionHistory[symbol].updates.push({
      action: "exit",
      price: exitPrice,
      quantity,
      reason,
      timestamp
    });
    savePositionHistory();
  }
};

/**
 * Calculate how long a position has been held
 * @param {string} symbol - Ticker symbol
 * @returns {Object} Hold time info
 */
export const getHoldTime = (symbol) => {
  const entry = positionHistory[symbol];
  if (!entry || !entry.entryDate) {
    return { days: null, hours: null, formatted: "Unknown", entryDate: null };
  }

  const entryDate = new Date(entry.entryDate);
  const now = new Date();
  const diffMs = now - entryDate;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  let formatted;
  if (diffDays >= 1) {
    formatted = `${Math.floor(diffDays)} day${Math.floor(diffDays) !== 1 ? "s" : ""}`;
    if (diffDays < 7) {
      const remainingHours = Math.floor(diffHours % 24);
      if (remainingHours > 0) {
        formatted += ` ${remainingHours}h`;
      }
    }
  } else {
    formatted = `${Math.floor(diffHours)} hour${Math.floor(diffHours) !== 1 ? "s" : ""}`;
  }

  return {
    days: diffDays,
    hours: diffHours,
    formatted,
    entryDate: entry.entryDate,
    entryPrice: entry.entryPrice
  };
};

/**
 * Analyze why a position is being held or would be sold
 * @param {Object} ticker - Ticker data with score
 * @param {Object} position - Position data from Alpaca
 * @returns {Object} Analysis with reasons
 */
export const analyzePosition = (ticker, position) => {
  if (!ticker || !position) {
    return { error: "Missing ticker or position data" };
  }

  const { score } = ticker;
  const plPercent = parseFloat(position.unrealized_plpc || 0) * 100;
  const { config } = getTradingStatus();

  // Get sell evaluation
  const sellEval = evaluateSellSignal(ticker, position);

  // Get hold time
  const holdTime = getHoldTime(position.symbol);

  // Determine thresholds
  const isProtected = plPercent >= config.protectedPositionPercent;
  const isGoodMomentum = plPercent >= config.goodMomentumPercent;

  // Build explanation
  const reasons = [];
  let decision = "HOLD";
  let explanation = "";

  if (score <= config.extremeSellThreshold) {
    decision = "EXTREME_SELL";
    reasons.push(`Score ${score.toFixed(2)} is extremely low (≤ ${config.extremeSellThreshold})`);
    reasons.push("This triggers an automatic sell regardless of profit");
    explanation = `${position.symbol} has an extremely low score of ${score.toFixed(2)}, which indicates severe technical deterioration. The system will sell immediately to prevent further losses.`;
  } else if (score <= config.technicalOverrideThreshold && isProtected) {
    decision = "TECHNICAL_OVERRIDE";
    reasons.push(`Score ${score.toFixed(2)} is very low (≤ ${config.technicalOverrideThreshold})`);
    reasons.push(`Position is profitable (+${plPercent.toFixed(1)}%) but technicals are deteriorating`);
    reasons.push("Technical override activates to lock in gains before reversal");
    explanation = `${position.symbol} is up ${plPercent.toFixed(1)}% but the score of ${score.toFixed(2)} indicates the stock is weakening. The system will sell to lock in profits before a potential reversal.`;
  } else if (score <= config.sellThreshold) {
    if (isProtected && config.protectMomentum) {
      decision = "HOLD (PROTECTED)";
      reasons.push(`Score ${score.toFixed(2)} is below sell threshold (≤ ${config.sellThreshold})`);
      reasons.push(`However, position is UP ${plPercent.toFixed(1)}% (protected at +${config.protectedPositionPercent}%)`);
      reasons.push("Momentum protection prevents selling winning positions");
      reasons.push("Will only sell if score drops to technical override (≤ 2.7) or extreme (≤ 1.5)");
      explanation = `${position.symbol} has a low score of ${score.toFixed(2)} which normally triggers a sell, BUT the position is up ${plPercent.toFixed(1)}% which activates momentum protection. The system won't interrupt a winning trade unless the score drops to extreme levels (≤ 2.7). This prevents selling winners too early.`;
    } else {
      decision = "SELL";
      reasons.push(`Score ${score.toFixed(2)} is below sell threshold (≤ ${config.sellThreshold})`);
      reasons.push(`Position P&L: ${plPercent >= 0 ? "+" : ""}${plPercent.toFixed(1)}% (not protected)`);
      explanation = `${position.symbol}'s score of ${score.toFixed(2)} is below the sell threshold of ${config.sellThreshold}. Since the position is only ${plPercent >= 0 ? "up" : "down"} ${Math.abs(plPercent).toFixed(1)}%, it's not protected and will be sold.`;
    }
  } else {
    decision = "HOLD";
    reasons.push(`Score ${score.toFixed(2)} is above sell threshold (> ${config.sellThreshold})`);
    if (isGoodMomentum) {
      reasons.push(`Position has good momentum (+${plPercent.toFixed(1)}%)`);
    }
    if (score >= 7.0) {
      reasons.push("Score indicates the stock is still technically healthy");
    }
    explanation = `${position.symbol}'s score of ${score.toFixed(2)} is healthy (above ${config.sellThreshold}). The position is ${plPercent >= 0 ? "up" : "down"} ${Math.abs(plPercent).toFixed(1)}%. No sell signal is triggered.`;
  }

  return {
    symbol: position.symbol,
    decision,
    score,
    plPercent,
    isProtected,
    isGoodMomentum,
    holdTime,
    reasons,
    explanation,
    thresholds: {
      extremeSell: config.extremeSellThreshold,
      technicalOverride: config.technicalOverrideThreshold,
      sell: config.sellThreshold,
      protected: config.protectedPositionPercent,
      goodMomentum: config.goodMomentumPercent
    },
    sellEvaluation: sellEval
  };
};

/**
 * Get analysis for all current positions
 * @param {Array} tickers - All tickers with scores
 * @param {Array} positions - Current positions from Alpaca
 * @returns {Array} Analysis for each position
 */
export const analyzeAllPositions = (tickers, positions) => {
  const tickerMap = {};
  for (const t of tickers) {
    if (t && t.symbol) {
      tickerMap[t.symbol] = t;
    }
  }

  return positions.map(position => {
    const ticker = tickerMap[position.symbol];
    if (!ticker) {
      return {
        symbol: position.symbol,
        error: "No ticker data available",
        plPercent: parseFloat(position.unrealized_plpc || 0) * 100,
        holdTime: getHoldTime(position.symbol)
      };
    }
    return analyzePosition(ticker, position);
  });
};

/**
 * Get a human-readable summary of a position for the AI
 * @param {string} symbol - Ticker symbol
 * @param {Object} ticker - Ticker data
 * @param {Object} position - Position data
 * @returns {string} Summary text
 */
export const getPositionSummary = (symbol, ticker, position) => {
  const analysis = analyzePosition(ticker, position);

  if (analysis.error) {
    return `Unable to analyze ${symbol}: ${analysis.error}`;
  }

  let summary = `**${symbol} Position Analysis**\n\n`;
  summary += `- Current Score: ${analysis.score.toFixed(2)}/10\n`;
  summary += `- P&L: ${analysis.plPercent >= 0 ? "+" : ""}${analysis.plPercent.toFixed(2)}%\n`;
  summary += `- Hold Time: ${analysis.holdTime.formatted}\n`;
  summary += `- Status: ${analysis.isProtected ? "PROTECTED" : analysis.isGoodMomentum ? "GOOD MOMENTUM" : "NORMAL"}\n`;
  summary += `- Decision: ${analysis.decision}\n\n`;
  summary += `**Why?**\n${analysis.explanation}\n\n`;
  summary += `**Thresholds:**\n`;
  summary += `- Sell: Score ≤ ${analysis.thresholds.sell}\n`;
  summary += `- Technical Override: Score ≤ ${analysis.thresholds.technicalOverride} (sells even protected)\n`;
  summary += `- Extreme Sell: Score ≤ ${analysis.thresholds.extremeSell} (always sells)\n`;
  summary += `- Protection: Profit ≥ ${analysis.thresholds.protected}%\n`;

  return summary;
};

/**
 * Get context for the AI about all positions
 * This is what the AI uses to answer questions about positions
 */
export const getPositionContext = async (tickers = []) => {
  const config = getAlpacaConfig();
  if (!config.ready) {
    return {
      connected: false,
      error: "Alpaca not connected",
      positions: []
    };
  }

  try {
    const positions = await fetchPositions(config);
    const analyses = analyzeAllPositions(tickers, positions);

    // Build context object for AI
    const context = {
      connected: true,
      positionCount: positions.length,
      positions: analyses.map(a => ({
        symbol: a.symbol,
        score: a.score,
        plPercent: a.plPercent,
        holdTime: a.holdTime,
        decision: a.decision,
        isProtected: a.isProtected,
        explanation: a.explanation,
        reasons: a.reasons
      })),
      tradingConfig: getTradingStatus().config,
      summary: analyses.map(a =>
        `${a.symbol}: Score ${a.score?.toFixed(1) || "?"}, P&L ${a.plPercent?.toFixed(1) || "?"}%, ` +
        `Held ${a.holdTime?.formatted || "?"}, Decision: ${a.decision}`
      ).join("\n")
    };

    return context;
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      positions: []
    };
  }
};

/**
 * Answer a specific question about why a position is held
 * @param {string} symbol - Ticker symbol
 * @param {Object} ticker - Ticker data with score
 * @param {Object} position - Position data
 * @returns {string} Natural language answer
 */
export const explainWhyHeld = (symbol, ticker, position) => {
  if (!ticker || !position) {
    return `I don't have enough data about ${symbol} to explain why it's being held.`;
  }

  const analysis = analyzePosition(ticker, position);
  const holdTime = analysis.holdTime;

  let answer = `${symbol} has been held for ${holdTime.formatted}. `;

  if (analysis.decision === "HOLD (PROTECTED)") {
    answer += `The position is up ${analysis.plPercent.toFixed(1)}%, which triggers momentum protection. `;
    answer += `Even though the score (${analysis.score.toFixed(1)}) is below the normal sell threshold (${analysis.thresholds.sell}), `;
    answer += `the system won't sell a winning position unless the score drops to extreme levels (≤ ${analysis.thresholds.technicalOverride}). `;
    answer += `This is to avoid cutting winners short.`;
  } else if (analysis.decision === "HOLD") {
    answer += `The score of ${analysis.score.toFixed(1)} is above the sell threshold of ${analysis.thresholds.sell}, `;
    answer += `so there's no sell signal. `;
    if (analysis.isGoodMomentum) {
      answer += `The position is up ${analysis.plPercent.toFixed(1)}% and showing good momentum.`;
    }
  } else if (analysis.decision === "SELL" || analysis.decision === "EXTREME_SELL") {
    answer += `Actually, this position SHOULD be sold based on the current score of ${analysis.score.toFixed(1)}. `;
    answer += analysis.explanation;
  }

  return answer;
};

// Initialize on load
loadPositionHistory();

export default {
  trackPositionEntry,
  trackPositionExit,
  getHoldTime,
  analyzePosition,
  analyzeAllPositions,
  getPositionSummary,
  getPositionContext,
  explainWhyHeld
};
