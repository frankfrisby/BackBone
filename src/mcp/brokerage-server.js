import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { getDataDir } from "../services/paths.js";

const DATA_DIR = getDataDir();

// ─── Config Helpers ──────────────────────────────────────────

const loadConfig = (name) => {
  try {
    const p = path.join(DATA_DIR, `${name}-config.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return {};
};

const loadCachedData = (name) => {
  try {
    const p = path.join(DATA_DIR, `${name}.json`);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return null;
};

// ─── Adaptive Freshness Tracker ─────────────────────────────
// Tracks user check frequency and adjusts staleness threshold.
//
// Rules:
//   - Default (cold): 24h staleness
//   - After first check: drops to 6h
//   - Subsequent checks within window: tighten by 25% (min 1h)
//   - No checks for 2x current threshold: relax by 50% (max 24h)
//   - User explicitly asks for refresh: bypass staleness, fetch now
//
// State persisted to data/brokerage-freshness.json

const FRESHNESS_PATH = path.join(DATA_DIR, "brokerage-freshness.json");
const DEFAULT_THRESHOLD_H = 24;
const MIN_THRESHOLD_H = 1;
const MAX_THRESHOLD_H = 24;
const ENGAGED_THRESHOLD_H = 6; // first check drops to this

const loadFreshness = () => {
  try {
    if (fs.existsSync(FRESHNESS_PATH)) return JSON.parse(fs.readFileSync(FRESHNESS_PATH, "utf-8"));
  } catch {}
  return { thresholdH: DEFAULT_THRESHOLD_H, checks: [], lastRefresh: null };
};

const saveFreshness = (state) => {
  try {
    fs.writeFileSync(FRESHNESS_PATH, JSON.stringify(state, null, 2));
  } catch {}
};

/**
 * Record a user check and return current staleness info.
 * @param {string|null} dataTimestamp - ISO timestamp of cached data
 * @param {boolean} forceRefresh - user explicitly asked for fresh data
 * @returns {{ ageHours, stale, thresholdH, shouldRefresh, hint }}
 */
const checkFreshness = (dataTimestamp, forceRefresh = false) => {
  const state = loadFreshness();
  const now = Date.now();

  // Prune checks older than 48h
  state.checks = (state.checks || []).filter(t => now - t < 48 * 3600000);

  // Record this check
  state.checks.push(now);

  // Adapt threshold based on engagement
  if (state.checks.length === 1 && state.thresholdH === DEFAULT_THRESHOLD_H) {
    // First ever check — drop to engaged threshold
    state.thresholdH = ENGAGED_THRESHOLD_H;
  } else if (state.checks.length >= 2) {
    // Look at gap between last two checks
    const sorted = [...state.checks].sort((a, b) => a - b);
    const lastGapH = (sorted[sorted.length - 1] - sorted[sorted.length - 2]) / 3600000;

    if (lastGapH <= state.thresholdH) {
      // User checked again within window — tighten by 25%
      state.thresholdH = Math.max(MIN_THRESHOLD_H, Math.round(state.thresholdH * 0.75 * 10) / 10);
    } else if (lastGapH > state.thresholdH * 2) {
      // User went quiet for 2x threshold — relax by 50%
      state.thresholdH = Math.min(MAX_THRESHOLD_H, Math.round(state.thresholdH * 1.5 * 10) / 10);
    }
  }

  // Calculate data age
  const ageMs = dataTimestamp ? now - new Date(dataTimestamp).getTime() : null;
  const ageHours = ageMs != null ? Math.round(ageMs / 3600000 * 10) / 10 : null;
  const stale = ageHours == null || ageHours > state.thresholdH;
  const shouldRefresh = forceRefresh || stale;

  saveFreshness(state);

  return {
    ageHours,
    stale,
    thresholdH: state.thresholdH,
    shouldRefresh,
    recentChecks: state.checks.length,
    hint: forceRefresh
      ? "Force refresh requested."
      : stale
        ? `Data is ${ageHours ?? "unknown"}h old (threshold: ${state.thresholdH}h). Recommend running empower_scrape or empower_refresh.`
        : undefined,
  };
};

// ─── Lazy-loaded Services ────────────────────────────────────

let _empower, _robinhood, _fidelity;

const getEmpower = async () => {
  if (!_empower) {
    const { getPersonalCapitalService } = await import("../services/integrations/personal-capital.js");
    _empower = getPersonalCapitalService();
  }
  return _empower;
};

const getRobinhood = async () => {
  if (!_robinhood) {
    const { getRobinhoodService } = await import("../services/integrations/robinhood.js");
    _robinhood = getRobinhoodService();
  }
  return _robinhood;
};

const getFidelity = async () => {
  if (!_fidelity) {
    const { getFidelityService } = await import("../services/integrations/fidelity.js");
    _fidelity = getFidelityService();
  }
  return _fidelity;
};

// ─── Tools ───────────────────────────────────────────────────

const TOOLS = [
  // ── Status ──
  {
    name: "get_brokerage_status",
    description: "Get connection status for all brokerages (Empower, Robinhood, Fidelity) including adaptive freshness info",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ── Empower / Personal Capital ──
  {
    name: "empower_login",
    description: "Login to Empower via browser. Opens a visible Chrome window where the user logs in manually. Captures session and scrapes data automatically after login. This is the recommended login method — no credentials needed.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "Optional: Empower email for auto-fill" },
        password: { type: "string", description: "Optional: Empower password for auto-fill" },
      },
      required: [],
    },
  },
  {
    name: "empower_submit_mfa",
    description: "Submit 2FA code for Empower login",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["sms", "email"], description: "2FA method" },
        code: { type: "string", description: "2FA code" },
      },
      required: ["method", "code"],
    },
  },
  {
    name: "empower_get_accounts",
    description: "Get all Empower accounts grouped by category: cash, investments, credit cards, loans, assets. Returns cached data with freshness info.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "empower_get_networth",
    description: "Get Empower net worth breakdown. Returns cached data with adaptive freshness — if stale, the response will recommend refreshing. If user asked for 'latest' or 'updated' data, call empower_refresh or empower_scrape instead.",
    inputSchema: {
      type: "object",
      properties: {
        forceRefresh: { type: "boolean", description: "Set true if user explicitly asked for latest/updated data. Will auto-trigger a refresh." },
      },
      required: [],
    },
  },
  {
    name: "empower_get_holdings",
    description: "Get Empower investment holdings (stocks, funds, ETFs across all investment accounts)",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "empower_get_overview",
    description: "Get full Empower financial overview: net worth, accounts by category, top holdings. Includes freshness metadata.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "empower_refresh",
    description: "Force refresh all Empower data via API (accounts, holdings, net worth). Use when data is stale or user asks for latest.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "empower_scrape",
    description: "Scrape Empower dashboard using browser automation (Playwright + Chrome profile). Works without API credentials — uses existing Chrome login session. Returns net worth, accounts, and a screenshot. Use when user asks for latest data or when API auth isn't set up.",
    inputSchema: {
      type: "object",
      properties: {
        headless: { type: "boolean", description: "Run headless (default: true)", default: true },
      },
      required: [],
    },
  },

  // ── Robinhood ──
  {
    name: "robinhood_login",
    description: "Login to Robinhood. Returns needsMfa if TOTP code required.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Robinhood email" },
        password: { type: "string", description: "Robinhood password" },
        mfaCode: { type: "string", description: "TOTP authenticator code (if MFA required)" },
      },
      required: ["username", "password"],
    },
  },
  {
    name: "robinhood_get_accounts",
    description: "Get all Robinhood accounts with balances, buying power, and cash",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "robinhood_get_positions",
    description: "Get Robinhood positions grouped by account with current prices",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "Optional: filter to a specific account ID" },
      },
      required: [],
    },
  },
  {
    name: "robinhood_get_balances",
    description: "Get Robinhood total equity and per-account balances",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "robinhood_refresh",
    description: "Refresh all Robinhood data (accounts, balances, positions)",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ── Fidelity ──
  {
    name: "fidelity_import_csv",
    description: "Import Fidelity positions from CSV file exported from Fidelity.com",
    inputSchema: {
      type: "object",
      properties: {
        csvPath: { type: "string", description: "Optional custom path to CSV file. Defaults to data/fidelity-import/positions.csv" },
      },
      required: [],
    },
  },
  {
    name: "fidelity_get_accounts",
    description: "Get all Fidelity accounts with balances and position counts",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "fidelity_get_positions",
    description: "Get Fidelity positions grouped by account",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string", description: "Optional: filter to a specific account name" },
      },
      required: [],
    },
  },
  {
    name: "fidelity_get_balances",
    description: "Get Fidelity total value and per-account balances",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "fidelity_setup_instructions",
    description: "Get instructions for setting up Fidelity CSV import",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ── Aggregate ──
  {
    name: "get_all_brokerage_positions",
    description: "Get combined positions across all connected brokerages (Empower + Robinhood + Fidelity)",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_total_brokerage_value",
    description: "Get total portfolio value across all connected brokerages with adaptive freshness info",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────

async function handleTool(name, args) {
  switch (name) {
    // ── Status ──
    case "get_brokerage_status": {
      const empower = await getEmpower();
      const robinhood = await getRobinhood();
      const fidelity = await getFidelity();
      const freshness = loadFreshness();
      return {
        empower: empower.getConfig?.() || { connected: false },
        robinhood: robinhood.getConfig?.() || { connected: false },
        fidelity: fidelity.getConfig?.() || { connected: false },
        freshness: { thresholdH: freshness.thresholdH, recentChecks: (freshness.checks || []).length },
      };
    }

    // ── Empower ──
    case "empower_login": {
      const svc = await getEmpower();
      // If email+password provided, save them to env for the scraper
      if (args.email) process.env.EMPOWER_EMAIL = args.email;
      if (args.password) process.env.EMPOWER_PASSWORD = args.password;
      // Use browser login — opens visible Chrome for user to log in
      const result = await svc.scrapeWithBrowser({ headless: false });
      if (result.success) {
        // Save credentials to .env if provided
        if (args.email && args.password) {
          try {
            const os = await import("os");
            const envPath = path.join(os.default.homedir(), ".backbone", ".env");
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";
            // Update or add EMPOWER_EMAIL
            if (envContent.includes("EMPOWER_EMAIL=")) {
              envContent = envContent.replace(/EMPOWER_EMAIL=.*/, `EMPOWER_EMAIL=${args.email}`);
            } else {
              envContent += `\nEMPOWER_EMAIL=${args.email}`;
            }
            // Update or add EMPOWER_PASSWORD
            if (envContent.includes("EMPOWER_PASSWORD=")) {
              envContent = envContent.replace(/EMPOWER_PASSWORD=.*/, `EMPOWER_PASSWORD=${args.password}`);
            } else {
              envContent += `\nEMPOWER_PASSWORD=${args.password}`;
            }
            fs.writeFileSync(envPath, envContent);
          } catch {}
        }
      }
      return result;
    }
    case "empower_submit_mfa": {
      const svc = await getEmpower();
      return await svc.completeTwoFactor(args.code);
    }
    case "empower_get_accounts": {
      const svc = await getEmpower();
      const accounts = svc.data.accounts || [];
      const freshness = checkFreshness(svc.data.lastUpdated);
      // Group by category
      const categories = { cash: [], investments: [], creditCards: [], loans: [], assets: [], other: [] };
      for (const acc of accounts) {
        const type = (acc.type || "").toLowerCase();
        if (type.includes("cash") || type.includes("checking") || type.includes("saving")) categories.cash.push(acc);
        else if (type.includes("invest") || type.includes("401k") || type.includes("ira") || type.includes("brokerage") || type.includes("retirement")) categories.investments.push(acc);
        else if (type.includes("credit")) categories.creditCards.push(acc);
        else if (type.includes("loan") || type.includes("mortgage") || type.includes("debt")) categories.loans.push(acc);
        else if (type.includes("asset") || type.includes("property") || type.includes("home") || type.includes("vehicle")) categories.assets.push(acc);
        else categories.other.push(acc);
      }
      const summary = {};
      for (const [cat, accs] of Object.entries(categories)) {
        if (accs.length > 0) {
          summary[cat] = { accounts: accs, total: accs.reduce((s, a) => s + (a.balance || 0), 0), count: accs.length };
        }
      }
      return { categories: summary, totalAccounts: accounts.length, lastUpdated: svc.data.lastUpdated, ...freshness };
    }
    case "empower_get_networth": {
      const svc = await getEmpower();
      const forceRefresh = args.forceRefresh === true;

      // If force refresh, try to scrape/refresh first
      if (forceRefresh) {
        if (svc.authenticated) {
          try { await svc.fetchAll(); } catch {}
        } else {
          try { await svc.scrapeWithBrowser({ headless: true }); } catch {}
        }
      }

      const nw = svc.data.netWorth;
      if (!nw) return { error: "No net worth data cached. Run empower_scrape or empower_refresh to fetch initial data." };

      const freshness = checkFreshness(nw.date, forceRefresh);
      return { ...nw, ...freshness };
    }
    case "empower_get_holdings": {
      const svc = await getEmpower();
      const holdings = svc.data.holdings || [];
      const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0);
      const totalGain = holdings.reduce((s, h) => s + (h.gain || 0), 0);
      const freshness = checkFreshness(svc.data.lastUpdated);
      return { holdings, totalValue, totalGain, count: holdings.length, lastUpdated: svc.data.lastUpdated, ...freshness };
    }
    case "empower_get_overview": {
      const svc = await getEmpower();
      const display = svc.getDisplayData?.() || svc.data || { error: "No data available" };
      const freshness = checkFreshness(svc.data.lastUpdated);
      return { ...display, ...freshness };
    }
    case "empower_refresh": {
      const svc = await getEmpower();
      if (!svc.authenticated) return { error: "Not authenticated. Call empower_login or empower_scrape first." };
      const result = await svc.fetchAll();
      // Record the refresh
      const state = loadFreshness();
      state.lastRefresh = new Date().toISOString();
      saveFreshness(state);
      return result;
    }
    case "empower_scrape": {
      const svc = await getEmpower();
      const result = await svc.scrapeWithBrowser({ headless: args.headless !== false });
      if (result.success) {
        const state = loadFreshness();
        state.lastRefresh = new Date().toISOString();
        saveFreshness(state);
      }
      return result;
    }

    // ── Robinhood ──
    case "robinhood_login": {
      const svc = await getRobinhood();
      return await svc.login(args.username, args.password, args.mfaCode || null);
    }
    case "robinhood_get_accounts": {
      const svc = await getRobinhood();
      const accounts = (svc.data.accounts || []).map(a => ({
        id: a.id, type: a.type, balance: a.balance, buyingPower: a.buyingPower,
        cash: a.cash, positionCount: (a.positions || []).length
      }));
      return { accounts, count: accounts.length, lastUpdated: svc.data.lastUpdated };
    }
    case "robinhood_get_positions": {
      const svc = await getRobinhood();
      if (args.accountId) {
        const acc = (svc.data.accounts || []).find(a => a.id === args.accountId);
        if (!acc) return { error: `Account ${args.accountId} not found` };
        return { accountId: acc.id, type: acc.type, balance: acc.balance, positions: acc.positions || [] };
      }
      return svc.getDisplayData?.() || { error: "No data available" };
    }
    case "robinhood_get_balances": {
      const svc = await getRobinhood();
      const perAccount = (svc.data.accounts || []).map(a => ({
        id: a.id, type: a.type, equity: a.balance, buyingPower: a.buyingPower, cash: a.cash
      }));
      return { totalEquity: svc.data.totalEquity || 0, accounts: perAccount, lastUpdated: svc.data.lastUpdated };
    }
    case "robinhood_refresh": {
      const svc = await getRobinhood();
      if (!svc.authenticated) return { error: "Not authenticated. Call robinhood_login first." };
      return await svc.fetchAll();
    }

    // ── Fidelity ──
    case "fidelity_import_csv": {
      const svc = await getFidelity();
      return await svc.importFromCSV(args.csvPath || null);
    }
    case "fidelity_get_accounts": {
      const svc = await getFidelity();
      const accounts = svc.data.accounts || [];
      return { accounts, count: accounts.length, totalValue: svc.data.totalValue, lastUpdated: svc.data.lastUpdated };
    }
    case "fidelity_get_positions": {
      const svc = await getFidelity();
      const display = svc.getDisplayData?.() || {};
      if (args.account) {
        const acc = (display.accounts || []).find(a => a.name.toLowerCase().includes(args.account.toLowerCase()));
        if (!acc) return { error: `Account "${args.account}" not found` };
        return acc;
      }
      return display;
    }
    case "fidelity_get_balances": {
      const svc = await getFidelity();
      const accounts = svc.data.accounts || [];
      return { totalValue: svc.data.totalValue || 0, accounts, lastUpdated: svc.data.lastUpdated };
    }
    case "fidelity_setup_instructions": {
      const svc = await getFidelity();
      return { instructions: svc.getSetupInstructions() };
    }

    // ── Aggregate ──
    case "get_all_brokerage_positions": {
      const [empower, robinhood, fidelity] = await Promise.all([getEmpower(), getRobinhood(), getFidelity()]);
      const freshness = checkFreshness(empower.data.lastUpdated);
      return {
        empower: empower.getDisplayData?.() || { connected: false },
        robinhood: robinhood.getDisplayData?.() || { connected: false },
        fidelity: fidelity.getDisplayData?.() || { connected: false },
        ...freshness,
      };
    }
    case "get_total_brokerage_value": {
      const [empower, robinhood, fidelity] = await Promise.all([getEmpower(), getRobinhood(), getFidelity()]);
      const eData = empower.getFinanceData?.() || {};
      const rData = robinhood.getFinanceData?.() || {};
      const fData = fidelity.getFinanceData?.() || {};
      const total = (eData.equity || 0) + (rData.equity || 0) + (fData.equity || 0);
      const timestamps = [eData.lastUpdated, rData.lastUpdated, fData.lastUpdated].filter(Boolean);
      const mostRecent = timestamps.length ? timestamps.sort().pop() : null;
      const freshness = checkFreshness(mostRecent);
      return {
        total,
        breakdown: {
          empower: eData.equity || 0,
          robinhood: rData.equity || 0,
          fidelity: fData.equity || 0,
        },
        connectedCount: [eData.equity, rData.equity, fData.equity].filter(v => v > 0).length,
        lastUpdated: mostRecent,
        ...freshness,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Server Setup ────────────────────────────────────────────

const server = new Server(
  { name: "backbone-brokerage", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: JSON.stringify({ error: err.message }, null, 2) }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Brokerage MCP Server running");
}

main().catch(console.error);
