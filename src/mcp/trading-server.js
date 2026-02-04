import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import {
  getTradingStatus,
  setTradingEnabled,
  evaluateBuySignal,
  evaluateSellSignal,
  executeBuy,
  executeSell,
  loadConfig,
  saveConfig,
} from "../services/auto-trader.js";
import {
  analyzePosition,
  getHoldTime,
  explainWhyHeld,
} from "../services/position-analyzer.js";
import { getAlpacaConfig } from "../services/alpaca.js";

/**
 * BACKBONE Trading MCP Server
 * Provides tools for portfolio management and auto-trading via Alpaca
 */

const getAlpacaHeaders = () => {
  const config = getAlpacaConfig();
  return {
    "APCA-API-KEY-ID": config.key,
    "APCA-API-SECRET-KEY": config.secret,
    "Content-Type": "application/json",
  };
};

const getBaseUrl = () => {
  const config = getAlpacaConfig();
  return config.baseUrl;
};

// Tool definitions
const TOOLS = [
  {
    name: "get_portfolio",
    description: "Get current portfolio summary including equity, buying power, and P&L",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_positions",
    description: "Get all current stock positions with details",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "buy_stock",
    description: "Buy a stock using market order",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol" },
        quantity: { type: "number", description: "Number of shares to buy" },
        reason: { type: "string", description: "Reason for the trade" },
      },
      required: ["symbol", "quantity"],
    },
  },
  {
    name: "sell_stock",
    description: "Sell a stock using market order",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol" },
        quantity: { type: "number", description: "Number of shares to sell" },
        reason: { type: "string", description: "Reason for the trade" },
      },
      required: ["symbol", "quantity"],
    },
  },
  {
    name: "get_ticker_analysis",
    description: "Analyze a ticker for buy/sell signals based on scoring algorithm",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol" },
        score: { type: "number", description: "Current ticker score (0-100)" },
        price: { type: "number", description: "Current price" },
        macdTrend: { type: "string", description: "MACD trend (bullish/bearish/neutral)" },
      },
      required: ["symbol", "score", "price"],
    },
  },
  {
    name: "get_trading_signals",
    description: "Get current buy/sell signals based on ticker scores",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "enable_auto_trading",
    description: "Enable or disable auto-trading",
    inputSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "Whether to enable auto-trading" },
        mode: { type: "string", enum: ["paper", "live"], description: "Trading mode" },
      },
      required: ["enabled"],
    },
  },
  {
    name: "get_trade_history",
    description: "Get recent trade history",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of trades to return (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "analyze_position",
    description: "Analyze why a position is being held or would be sold. Provides detailed reasoning about the trading algorithm's decision.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol (e.g., SH, NVDA)" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "explain_why_position_held",
    description: "Get a natural language explanation of why a specific position hasn't been sold. Use this when user asks 'why hasn't X sold?' or 'why is X still held?'",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol" },
      },
      required: ["symbol"],
    },
  },
];

// Tool implementations
async function getPortfolio() {
  try {
    const response = await fetch(`${getBaseUrl()}/v2/account`, {
      headers: getAlpacaHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status}`);
    }

    const account = await response.json();
    return {
      equity: parseFloat(account.equity),
      buyingPower: parseFloat(account.buying_power),
      cash: parseFloat(account.cash),
      portfolioValue: parseFloat(account.portfolio_value),
      dayChange: parseFloat(account.equity) - parseFloat(account.last_equity),
      dayChangePercent: ((parseFloat(account.equity) - parseFloat(account.last_equity)) / parseFloat(account.last_equity) * 100).toFixed(2),
      status: account.status,
      tradingBlocked: account.trading_blocked,
      mode: loadConfig().mode,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function getPositions() {
  try {
    const response = await fetch(`${getBaseUrl()}/v2/positions`, {
      headers: getAlpacaHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status}`);
    }

    const positions = await response.json();
    return positions.map(p => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avgEntryPrice: parseFloat(p.avg_entry_price),
      marketValue: parseFloat(p.market_value),
      currentPrice: parseFloat(p.current_price),
      unrealizedPL: parseFloat(p.unrealized_pl),
      unrealizedPLPercent: parseFloat(p.unrealized_plpc) * 100,
      side: p.side,
    }));
  } catch (error) {
    return { error: error.message };
  }
}

async function buyStock(symbol, quantity, reason = "Manual buy") {
  try {
    const response = await fetch(`${getBaseUrl()}/v2/orders`, {
      method: "POST",
      headers: getAlpacaHeaders(),
      body: JSON.stringify({
        symbol,
        qty: quantity.toString(),
        side: "buy",
        type: "market",
        time_in_force: "day",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const order = await response.json();
    return {
      success: true,
      orderId: order.id,
      symbol: order.symbol,
      qty: order.qty,
      side: order.side,
      status: order.status,
      reason,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function sellStock(symbol, quantity, reason = "Manual sell") {
  try {
    const response = await fetch(`${getBaseUrl()}/v2/orders`, {
      method: "POST",
      headers: getAlpacaHeaders(),
      body: JSON.stringify({
        symbol,
        qty: quantity.toString(),
        side: "sell",
        type: "market",
        time_in_force: "day",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    const order = await response.json();
    return {
      success: true,
      orderId: order.id,
      symbol: order.symbol,
      qty: order.qty,
      side: order.side,
      status: order.status,
      reason,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function analyzeTickerSignals(symbol, score, price, macdTrend = "neutral") {
  const ticker = {
    symbol,
    score,
    price,
    macd: { trend: macdTrend },
  };

  const buyEval = evaluateBuySignal(ticker);
  const sellEval = evaluateSellSignal(ticker);

  return {
    symbol,
    score,
    price,
    buySignal: buyEval,
    sellSignal: sellEval,
    recommendation: buyEval.action === "BUY" ? "BUY" : sellEval.action === "SELL" ? "SELL" : "HOLD",
  };
}

async function getTradingSignals() {
  try {
    // Fetch tickers from Yahoo Finance server
    const response = await fetch("http://localhost:3001/api/tickers");
    if (!response.ok) {
      throw new Error("Yahoo Finance server not running");
    }

    const { tickers } = await response.json();
    const positions = await getPositions();
    const positionSymbols = Array.isArray(positions) ? positions.map(p => p.symbol) : [];

    const signals = {
      buySignals: [],
      sellSignals: [],
      positions: positionSymbols,
    };

    for (const ticker of tickers) {
      const buyEval = evaluateBuySignal(ticker);
      const sellEval = evaluateSellSignal(ticker);

      if (buyEval.action === "BUY" && !positionSymbols.includes(ticker.symbol)) {
        signals.buySignals.push(buyEval);
      }

      if (sellEval.action === "SELL" && positionSymbols.includes(ticker.symbol)) {
        signals.sellSignals.push(sellEval);
      }
    }

    return signals;
  } catch (error) {
    return { error: error.message };
  }
}

function enableAutoTrading(enabled, mode) {
  const updates = { enabled };
  if (mode) updates.mode = mode;

  saveConfig(updates);
  return getTradingStatus();
}

function getTradeHistory(limit = 20) {
  const status = getTradingStatus();
  return {
    trades: status.recentTrades.slice(-limit),
    totalTrades: status.recentTrades.length,
    dailyTradeCount: status.dailyTradeCount,
    maxDailyTrades: status.maxDailyTrades,
  };
}

/**
 * Analyze a position - why it's held or would be sold
 */
async function analyzePositionTool(symbol) {
  try {
    // Get position data
    const positions = await getPositions();
    if (positions.error) {
      return { error: positions.error };
    }

    const position = positions.find(p => p.symbol.toUpperCase() === symbol.toUpperCase());
    if (!position) {
      return { error: `No position found for ${symbol}` };
    }

    // Get ticker data from Yahoo Finance server
    let ticker = null;
    try {
      const response = await fetch("http://localhost:3001/api/tickers");
      if (response.ok) {
        const { tickers } = await response.json();
        ticker = tickers.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
      }
    } catch {
      // Yahoo Finance server not running, use basic data
    }

    if (!ticker) {
      // Create basic ticker with current price
      ticker = {
        symbol: symbol.toUpperCase(),
        score: null,
        price: position.currentPrice
      };
    }

    // Build position object in format expected by analyzer
    const positionData = {
      symbol: position.symbol,
      qty: position.qty,
      unrealized_plpc: position.unrealizedPLPercent / 100, // Convert back to decimal
      current_price: position.currentPrice,
      avg_entry_price: position.avgEntryPrice,
      market_value: position.marketValue
    };

    const analysis = analyzePosition(ticker, positionData);
    const holdTime = getHoldTime(symbol);

    return {
      symbol: position.symbol,
      score: ticker.score,
      currentPrice: position.currentPrice,
      avgEntryPrice: position.avgEntryPrice,
      quantity: position.qty,
      marketValue: position.marketValue,
      unrealizedPL: position.unrealizedPL,
      unrealizedPLPercent: position.unrealizedPLPercent,
      holdTime: holdTime.formatted,
      holdDays: holdTime.days,
      decision: analysis.decision,
      isProtected: analysis.isProtected,
      isGoodMomentum: analysis.isGoodMomentum,
      explanation: analysis.explanation,
      reasons: analysis.reasons,
      thresholds: analysis.thresholds
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get natural language explanation for why a position is held
 */
async function explainWhyPositionHeld(symbol) {
  const analysis = await analyzePositionTool(symbol);

  if (analysis.error) {
    return { error: analysis.error, explanation: `Unable to analyze ${symbol}: ${analysis.error}` };
  }

  let explanation = `## ${symbol} Position Analysis\n\n`;
  explanation += `**Current Status:**\n`;
  explanation += `- Score: ${analysis.score !== null ? analysis.score.toFixed(1) + "/10" : "Unknown"}\n`;
  explanation += `- P&L: ${analysis.unrealizedPLPercent >= 0 ? "+" : ""}${analysis.unrealizedPLPercent.toFixed(2)}%\n`;
  explanation += `- Market Value: $${analysis.marketValue.toFixed(2)}\n`;
  explanation += `- Held For: ${analysis.holdTime || "Unknown"}\n`;
  explanation += `- Status: ${analysis.isProtected ? "PROTECTED (+8%+)" : analysis.isGoodMomentum ? "GOOD MOMENTUM (+5%+)" : "NORMAL"}\n\n`;

  explanation += `**Decision: ${analysis.decision}**\n\n`;
  explanation += `**Why:**\n${analysis.explanation}\n\n`;

  if (analysis.reasons && analysis.reasons.length > 0) {
    explanation += `**Detailed Reasons:**\n`;
    for (const reason of analysis.reasons) {
      explanation += `- ${reason}\n`;
    }
  }

  explanation += `\n**Sell Thresholds:**\n`;
  explanation += `- Regular Sell: Score ≤ ${analysis.thresholds?.sell || 4.0}\n`;
  explanation += `- Technical Override: Score ≤ ${analysis.thresholds?.technicalOverride || 2.7} (overrides protection)\n`;
  explanation += `- Extreme Sell: Score ≤ ${analysis.thresholds?.extremeSell || 1.5} (always sells)\n`;
  explanation += `- Protection Threshold: P&L ≥ ${analysis.thresholds?.protected || 8.0}%\n`;

  return {
    symbol: analysis.symbol,
    explanation,
    decision: analysis.decision,
    score: analysis.score,
    plPercent: analysis.unrealizedPLPercent,
    isProtected: analysis.isProtected
  };
}

// Create server
const server = new Server(
  {
    name: "backbone-trading",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result;

  switch (name) {
    case "get_portfolio":
      result = await getPortfolio();
      break;
    case "get_positions":
      result = await getPositions();
      break;
    case "buy_stock":
      result = await buyStock(args.symbol, args.quantity, args.reason);
      break;
    case "sell_stock":
      result = await sellStock(args.symbol, args.quantity, args.reason);
      break;
    case "get_ticker_analysis":
      result = analyzeTickerSignals(args.symbol, args.score, args.price, args.macdTrend);
      break;
    case "get_trading_signals":
      result = await getTradingSignals();
      break;
    case "enable_auto_trading":
      result = enableAutoTrading(args.enabled, args.mode);
      break;
    case "get_trade_history":
      result = getTradeHistory(args.limit);
      break;
    case "analyze_position":
      result = await analyzePositionTool(args.symbol);
      break;
    case "explain_why_position_held":
      result = await explainWhyPositionHeld(args.symbol);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Trading MCP Server running");
}

main().catch(console.error);
