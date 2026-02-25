/**
 * MCP Direct — In-process MCP tool caller
 *
 * Instead of spawning Claude Code CLI and hoping it calls the right MCP tool,
 * call the handler function directly. This makes quick_answer responses < 2 seconds.
 *
 * Usage:
 *   const result = await callTool("backbone-trading", "get_portfolio", {});
 *   const result = await callTool("backbone-health", "get_health_summary", {});
 */

const TAG = "[MCP-Direct]";

// Lazy-loaded server modules
const serverCache = {};

/**
 * Server registry — maps server names to lazy-load functions that return
 * a handleTool(name, args) dispatcher.
 */
const SERVER_REGISTRY = {
  "backbone-brokerage": async () => {
    const mod = await import("../mcp/brokerage-server.js");
    // brokerage-server exports handleTool directly
    if (mod.handleTool) return mod.handleTool;
    throw new Error("brokerage-server missing handleTool export");
  },

  "backbone-trading": async () => {
    // Trading server wraps Alpaca API calls in local functions.
    // We replicate the key ones here using the same Alpaca config.
    const { getAlpacaConfig, fetchAccount, fetchPositions, submitOrder } = await import("./trading/alpaca.js");
    const { fetchTicker, addConviction, getConvictions, removeConviction } = await import("./trading/yahoo-client.js");
    const scoreEngine = await import("./trading/score-engine.js");
    const { getTickerPredictionResearch } = await import("./trading/ticker-prediction-research.js");
    const getRecessionScore = (await import("./trading/recession-score.js")).default;

    return async (name, args) => {
      const config = getAlpacaConfig();
      switch (name) {
        case "get_portfolio": {
          const account = await fetchAccount(config);
          const equity = parseFloat(account.equity);
          const cash = parseFloat(account.cash);
          const positionsValue = parseFloat(account.portfolio_value) || (equity - cash);
          const lastEquity = parseFloat(account.last_equity);
          return {
            totalAccountValue: equity,
            _note: "totalAccountValue = cash + positionsValue. Do NOT add cash on top.",
            cash, positionsValue, buyingPower: parseFloat(account.buying_power),
            dayChange: +(equity - lastEquity).toFixed(2),
            dayChangePercent: lastEquity ? +((equity - lastEquity) / lastEquity * 100).toFixed(2) : 0,
            status: account.status, tradingBlocked: account.trading_blocked,
            mode: config.baseUrl?.includes("paper") ? "paper" : "live",
          };
        }
        case "get_positions": {
          const positions = await fetchPositions(config);
          return positions.map(p => ({
            symbol: p.symbol, qty: parseFloat(p.qty),
            avgEntryPrice: parseFloat(p.avg_entry_price),
            marketValue: parseFloat(p.market_value),
            currentPrice: parseFloat(p.current_price),
            unrealizedPL: parseFloat(p.unrealized_pl),
            unrealizedPLPercent: parseFloat(p.unrealized_plpc) * 100,
            side: p.side,
          }));
        }
        case "get_stock_quote": {
          const ticker = await fetchTicker(args.symbol);
          return ticker;
        }
        case "get_top_tickers": return scoreEngine.getTopTickers?.(args.count || 10) || [];
        case "get_worst_tickers": return scoreEngine.getWorstTickers?.(args.count || 10) || [];
        case "get_ticker_score_breakdown": return scoreEngine.getTickerScoreBreakdown?.(args.symbol);
        case "get_ticker_research": return getTickerPredictionResearch?.(args.symbol);
        case "get_research_convictions": return getConvictions?.() || [];
        case "add_research_conviction": return addConviction?.(args.symbol, args.conviction, args.reason);
        case "remove_research_conviction": return removeConviction?.(args.symbol);
        case "get_recession_score": return getRecessionScore?.();
        case "get_trade_history": {
          const fs = await import("fs");
          const { dataFile } = await import("./paths.js");
          try {
            const trades = JSON.parse(fs.readFileSync(dataFile("trades-log.json"), "utf-8"));
            return (Array.isArray(trades) ? trades : []).slice(-(args.limit || 20));
          } catch { return []; }
        }
        case "get_trading_signals": {
          const scores = scoreEngine.loadTickerScores?.();
          if (!scores) return { buys: [], sells: [], total: 0 };
          const ranked = scoreEngine.rankTickers?.(scores) || [];
          const buys = ranked.filter(t => t.effectiveScore >= (scoreEngine.SCORE_THRESHOLDS?.BUY || 7));
          const sells = ranked.filter(t => t.effectiveScore <= (scoreEngine.SCORE_THRESHOLDS?.SELL || 3));
          return { buys: buys.slice(0, 10), sells: sells.slice(0, 10), total: ranked.length };
        }
        case "get_prediction_stats": return scoreEngine.getPredictionStats?.() || {};
        case "get_ticker_analysis": {
          if (!args.symbol) throw new Error("symbol required");
          const breakdown = scoreEngine.getTickerScoreBreakdown?.(args.symbol);
          return breakdown || { error: `No data for ${args.symbol}` };
        }
        case "analyze_position":
        case "explain_why_position_held": {
          if (!args.symbol) throw new Error("symbol required");
          // Provide score breakdown + position info as analysis
          const pos = (await fetchPositions(config)).find(p => p.symbol === args.symbol);
          const bd = scoreEngine.getTickerScoreBreakdown?.(args.symbol);
          return {
            symbol: args.symbol,
            position: pos ? { qty: parseFloat(pos.qty), avgEntry: parseFloat(pos.avg_entry_price), unrealizedPL: parseFloat(pos.unrealized_pl), unrealizedPLPercent: parseFloat(pos.unrealized_plpc) * 100 } : null,
            scoreBreakdown: bd || null,
            note: pos ? `Held because effective score (${bd?.effectiveScore?.toFixed(1) || "?"}) is above sell threshold` : "No position found",
          };
        }
        case "enable_auto_trading":
          throw new Error("enable_auto_trading requires user confirmation — use MCP or auto-trader directly");
        default: throw new Error(`Unknown trading tool: ${name}`);
      }
    };
  },

  "backbone-health": async () => {
    // Health server functions aren't exported — read cached Oura data directly
    const fs = await import("fs");
    const { dataFile } = await import("./paths.js");

    const loadOuraData = () => {
      try {
        return JSON.parse(fs.readFileSync(dataFile("oura-data.json"), "utf-8"));
      } catch { return null; }
    };

    return async (name, args) => {
      const data = loadOuraData();
      if (!data?.latest) throw new Error("No Oura data cached — health server needs to fetch first");

      switch (name) {
        case "get_health_summary": return {
          sleep: data.latest.sleep?.at(-1) || null,
          readiness: data.latest.readiness?.at(-1) || null,
          activity: data.latest.activity?.at(-1) || null,
        };
        case "get_sleep_data": return data.latest.sleep || [];
        case "get_readiness_score": return data.latest.readiness?.at(-1) || null;
        case "get_activity_data": return data.latest.activity || [];
        default: throw new Error(`Unknown health tool: ${name}`);
      }
    };
  },

  "backbone-life": async () => {
    // Read life data directly from files — don't import the MCP server
    const fs = await import("fs");
    const { dataFile, memoryFile } = await import("./paths.js");

    return async (name, args) => {
      switch (name) {
        case "get_goals": {
          try {
            const raw = JSON.parse(fs.readFileSync(dataFile("goals.json"), "utf-8"));
            let goals = Array.isArray(raw) ? raw : (raw?.goals || []);
            if (args?.status) goals = goals.filter(g => g.status === args.status);
            if (args?.category) goals = goals.filter(g => g.category === args.category);
            return goals;
          } catch { return []; }
        }
        case "get_beliefs": {
          try { return JSON.parse(fs.readFileSync(dataFile("core-beliefs.json"), "utf-8")); }
          catch { return []; }
        }
        case "get_life_scores": {
          try { return JSON.parse(fs.readFileSync(dataFile("life-scores.json"), "utf-8")); }
          catch { return {}; }
        }
        case "get_thesis": {
          try { return { thesis: fs.readFileSync(memoryFile("thesis.md"), "utf-8") }; }
          catch { return { thesis: "No thesis yet." }; }
        }
        case "get_backlog": {
          try {
            const raw = JSON.parse(fs.readFileSync(dataFile("backlog.json"), "utf-8"));
            let items = raw?.items || [];
            if (args?.minScore) items = items.filter(i => (i.score || 0) >= args.minScore);
            if (args?.source) items = items.filter(i => i.source === args.source);
            return items.slice(0, args?.limit || 20);
          } catch { return []; }
        }
        default: throw new Error(`Unknown life tool: ${name}`);
      }
    };
  },

  // These servers are less commonly needed for quick_answer.
  // They throw a clear error directing to use the full MCP server instead.
  "backbone-google": async () => {
    // Try to delegate to the google MCP server's handler
    try {
      const mod = await import("../mcp/google-mail-calendar-server.js");
      if (mod.handleTool) return mod.handleTool;
    } catch {}
    return async (name, args) => {
      throw new Error(`Google tool "${name}" requires full MCP server`);
    };
  },
  "backbone-contacts": async () => {
    const fs = await import("fs");
    const { dataFile } = await import("./paths.js");
    return async (name, args) => {
      const contactsFile = dataFile("contacts.json");
      const loadContacts = () => {
        try {
          const raw = JSON.parse(fs.readFileSync(contactsFile, "utf-8"));
          return Array.isArray(raw) ? raw : (raw?.contacts || []);
        } catch { return []; }
      };
      switch (name) {
        case "get_contacts": {
          let list = loadContacts();
          if (args?.category) list = list.filter(c => c.category === args.category);
          return list.slice(0, args?.limit || 50);
        }
        case "search_contacts": {
          const q = (args?.query || "").toLowerCase();
          return loadContacts().filter(c =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.company || "").toLowerCase().includes(q)
          );
        }
        default: throw new Error(`Contacts tool "${name}" requires full MCP server`);
      }
    };
  },
  "backbone-news": async () => {
    const fs = await import("fs");
    const { dataFile } = await import("./paths.js");
    return async (name, args) => {
      switch (name) {
        case "get_market_summary": {
          try {
            const cached = JSON.parse(fs.readFileSync(dataFile("news-cache.json"), "utf-8"));
            return cached?.marketSummary || cached;
          } catch { return { error: "No cached news" }; }
        }
        default: throw new Error(`News tool "${name}" requires full MCP server for active fetching`);
      }
    };
  },
  "backbone-projects": async () => {
    const fs = await import("fs");
    const path = await import("path");
    const { getProjectsDir } = await import("./paths.js");
    return async (name, args) => {
      switch (name) {
        case "list_projects": {
          const dir = getProjectsDir();
          if (!fs.existsSync(dir)) return [];
          return fs.readdirSync(dir).filter(d =>
            fs.existsSync(path.join(dir, d, "PROJECT.md"))
          ).map(d => ({ name: d }));
        }
        default: throw new Error(`Projects tool "${name}" requires full MCP server`);
      }
    };
  },
  "backbone-linkedin": async () => {
    return async (name, args) => {
      throw new Error(`LinkedIn tool "${name}" requires full MCP server`);
    };
  },
  "backbone-whatsapp": async () => {
    return async (name, args) => {
      throw new Error(`WhatsApp tool "${name}" requires full MCP server`);
    };
  },
  "backbone-youtube": async () => {
    return async (name, args) => {
      throw new Error(`YouTube tool "${name}" requires full MCP server`);
    };
  },
};

/**
 * Get or lazy-load a server's tool handler.
 */
async function getHandler(server) {
  if (!serverCache[server]) {
    const factory = SERVER_REGISTRY[server];
    if (!factory) throw new Error(`Unknown MCP server: ${server}`);
    serverCache[server] = await factory();
  }
  return serverCache[server];
}

/**
 * Call an MCP tool directly (in-process, no CLI spawn).
 *
 * @param {string} server - Server name (e.g. "backbone-trading")
 * @param {string} toolName - Tool name (e.g. "get_portfolio")
 * @param {object} params - Tool parameters
 * @returns {any} The tool result (JSON-serializable)
 */
export async function callTool(server, toolName, params = {}) {
  const start = Date.now();
  try {
    const handler = await getHandler(server);
    const result = await handler(toolName, params);
    const elapsed = Date.now() - start;
    console.log(`${TAG} ${server}.${toolName} → ${elapsed}ms`);
    return result;
  } catch (err) {
    console.error(`${TAG} ${server}.${toolName} failed:`, err.message);
    throw err;
  }
}

/**
 * Quick tool lookup — maps natural queries to the right server + tool.
 * Used by intake.js to resolve quick_answer classifications.
 */
export const TOOL_MAP = {
  // Brokerage / Net worth
  "empower_get_networth": { server: "backbone-brokerage", tool: "empower_get_networth" },
  "empower_get_accounts": { server: "backbone-brokerage", tool: "empower_get_accounts" },
  "empower_get_holdings": { server: "backbone-brokerage", tool: "empower_get_holdings" },
  "empower_get_overview": { server: "backbone-brokerage", tool: "empower_get_overview" },
  "get_total_brokerage_value": { server: "backbone-brokerage", tool: "get_total_brokerage_value" },
  "get_all_brokerage_positions": { server: "backbone-brokerage", tool: "get_all_brokerage_positions" },
  "get_brokerage_status": { server: "backbone-brokerage", tool: "get_brokerage_status" },

  // Trading
  "get_portfolio": { server: "backbone-trading", tool: "get_portfolio" },
  "get_positions": { server: "backbone-trading", tool: "get_positions" },
  "get_trading_signals": { server: "backbone-trading", tool: "get_trading_signals" },
  "get_top_tickers": { server: "backbone-trading", tool: "get_top_tickers" },
  "get_stock_quote": { server: "backbone-trading", tool: "get_stock_quote" },
  "get_trade_history": { server: "backbone-trading", tool: "get_trade_history" },
  "get_recession_score": { server: "backbone-trading", tool: "get_recession_score" },

  // Health
  "get_health_summary": { server: "backbone-health", tool: "get_health_summary" },
  "get_sleep_data": { server: "backbone-health", tool: "get_sleep_data" },
  "get_readiness_score": { server: "backbone-health", tool: "get_readiness_score" },
  "get_activity_data": { server: "backbone-health", tool: "get_activity_data" },

  // Life
  "get_goals": { server: "backbone-life", tool: "get_goals" },
  "get_beliefs": { server: "backbone-life", tool: "get_beliefs" },
  "get_life_scores": { server: "backbone-life", tool: "get_life_scores" },
  "get_thesis": { server: "backbone-life", tool: "get_thesis" },

  // Calendar
  "get_today_events": { server: "backbone-google", tool: "get_today_events" },
  "get_upcoming_events": { server: "backbone-google", tool: "get_upcoming_events" },
  "get_unread_count": { server: "backbone-google", tool: "get_unread_count" },
  "get_recent_emails": { server: "backbone-google", tool: "get_recent_emails" },
};

export default { callTool, TOOL_MAP };
