#!/usr/bin/env node
/**
 * BACKBONE Unified CLI Gateway
 *
 * Single-entry CLI for ALL BACKBONE domains. Designed for the autonomous engine
 * to call via Bash instead of using MCP servers (saves ~15K tokens/request).
 *
 * Usage:
 *   node tools/backbone-cli.js <domain> <action> [--key=value ...]
 *
 * Domains:
 *   trading   portfolio | positions | signals | buy | sell | quote | top | worst
 *             score | research | convictions | add-conviction | remove-conviction
 *             recession | history | prediction-stats
 *   health    summary | sleep | readiness | activity
 *   life      goals | beliefs | backlog | scores | thesis | add-goal
 *   portfolio networth | accounts | holdings | overview | status
 *   news      latest | market | research | beliefs | correlate
 *   projects  list | create | archive | restore | archived | status
 *   messaging send | notify | schedule | scheduled | cancel-scheduled | status
 *   contacts  list | search | add | profile | update
 *   calendar  today | upcoming | create
 *   email     recent | unread | search | body | draft
 *
 * All output is JSON to stdout.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bootstrap paths.js from backbone root
const backboneRoot = path.resolve(__dirname, "..");

// Helper: convert Windows path to file:// URL for dynamic import()
function toImportPath(p) {
  return pathToFileURL(p).href;
}

// Parse CLI args
const args = process.argv.slice(2);
const domain = args[0];
const action = args[1];

// Parse --key=value flags
function parseFlags(args) {
  const flags = {};
  for (const arg of args.slice(2)) {
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx > 0) {
        const key = arg.slice(2, eqIdx);
        let value = arg.slice(eqIdx + 1);
        // Auto-parse numbers and booleans
        if (value === "true") value = true;
        else if (value === "false") value = false;
        else if (/^\d+(\.\d+)?$/.test(value)) value = parseFloat(value);
        flags[key] = value;
      } else {
        flags[arg.slice(2)] = true;
      }
    }
  }
  return flags;
}

const flags = parseFlags(args);

// Output JSON result
function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function error(msg) {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

if (!domain) {
  error("Usage: node tools/backbone-cli.js <domain> <action> [--key=value ...]");
}

// Lazy-load paths.js
let _paths = null;
async function getPaths() {
  if (!_paths) {
    _paths = await import(toImportPath(path.join(backboneRoot, "src/services/paths.js")));
  }
  return _paths;
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// DOMAIN HANDLERS
// ══════════════════════════════════════════════════════════════

async function handleTrading() {
  const { getAlpacaConfig, fetchAccount, fetchPositions, submitOrder } =
    await import(toImportPath(path.join(backboneRoot, "src/services/trading/alpaca.js")));
  const { fetchTicker, addConviction, getConvictions, removeConviction } =
    await import(toImportPath(path.join(backboneRoot, "src/services/trading/yahoo-client.js")));
  const scoreEngine = await import(toImportPath(path.join(backboneRoot, "src/services/trading/score-engine.js")));
  const { getTickerPredictionResearch } = await import(toImportPath(path.join(backboneRoot, "src/services/trading/ticker-prediction-research.js")));
  const getRecessionScore = (await import(toImportPath(path.join(backboneRoot, "src/services/trading/recession-score.js")))).default;
  const { dataFile } = await getPaths();

  const config = getAlpacaConfig();

  switch (action) {
    case "portfolio": {
      const account = await fetchAccount(config);
      const equity = parseFloat(account.equity);
      const cash = parseFloat(account.cash);
      return output({
        totalAccountValue: equity,
        _note: "totalAccountValue = cash + positionsValue. Do NOT add cash on top.",
        cash,
        positionsValue: parseFloat(account.portfolio_value) || (equity - cash),
        buyingPower: parseFloat(account.buying_power),
        dayChange: +(equity - parseFloat(account.last_equity)).toFixed(2),
        dayChangePercent: account.last_equity ? +((equity - parseFloat(account.last_equity)) / parseFloat(account.last_equity) * 100).toFixed(2) : 0,
        status: account.status,
        mode: config.baseUrl?.includes("paper") ? "paper" : "live",
      });
    }
    case "positions": {
      const positions = await fetchPositions(config);
      return output(positions.map(p => ({
        symbol: p.symbol, qty: parseFloat(p.qty),
        avgEntryPrice: parseFloat(p.avg_entry_price),
        marketValue: parseFloat(p.market_value),
        currentPrice: parseFloat(p.current_price),
        unrealizedPL: parseFloat(p.unrealized_pl),
        unrealizedPLPercent: parseFloat(p.unrealized_plpc) * 100,
        side: p.side,
      })));
    }
    case "quote": {
      const sym = flags.symbol || args[2];
      if (!sym) error("Usage: trading quote --symbol=NVDA");
      return output(await fetchTicker(sym));
    }
    case "buy": {
      if (!flags.symbol || !flags.quantity) error("Usage: trading buy --symbol=NVDA --quantity=10");
      const order = await submitOrder(config, {
        symbol: flags.symbol, qty: flags.quantity, side: "buy",
        type: "market", time_in_force: "day",
      });
      return output(order);
    }
    case "sell": {
      if (!flags.symbol || !flags.quantity) error("Usage: trading sell --symbol=NVDA --quantity=10");
      const order = await submitOrder(config, {
        symbol: flags.symbol, qty: flags.quantity, side: "sell",
        type: "market", time_in_force: "day",
      });
      return output(order);
    }
    case "top": return output(scoreEngine.getTopTickers?.(flags.count || 10) || []);
    case "worst": return output(scoreEngine.getWorstTickers?.(flags.count || 10) || []);
    case "score": {
      const sym = flags.symbol || args[2];
      if (!sym) error("Usage: trading score --symbol=NVDA");
      return output(scoreEngine.getTickerScoreBreakdown?.(sym));
    }
    case "research": {
      const sym = flags.symbol || args[2];
      if (!sym) error("Usage: trading research --symbol=NVDA");
      return output(await getTickerPredictionResearch?.(sym));
    }
    case "convictions": return output(await getConvictions?.() || []);
    case "add-conviction": {
      if (!flags.symbol || !flags.conviction) error("Usage: trading add-conviction --symbol=NVDA --conviction=0.9 --reason='...'");
      return output(await addConviction(flags.symbol, flags.conviction, flags.reason || ""));
    }
    case "remove-conviction": {
      if (!flags.symbol) error("Usage: trading remove-conviction --symbol=NVDA");
      return output(await removeConviction(flags.symbol));
    }
    case "recession": return output(await getRecessionScore?.());
    case "history": {
      try {
        const trades = JSON.parse(fs.readFileSync(dataFile("trades-log.json"), "utf-8"));
        return output((Array.isArray(trades) ? trades : []).slice(-(flags.limit || 20)));
      } catch { return output([]); }
    }
    case "signals": {
      // Load scores and compute signals
      const scores = scoreEngine.loadTickerScores?.();
      if (!scores) return output({ error: "No ticker scores loaded" });
      const ranked = scoreEngine.rankTickers?.(scores) || [];
      const buys = ranked.filter(t => t.effectiveScore >= scoreEngine.SCORE_THRESHOLDS?.BUY);
      const sells = ranked.filter(t => t.effectiveScore <= scoreEngine.SCORE_THRESHOLDS?.SELL);
      return output({ buys: buys.slice(0, 10), sells: sells.slice(0, 10), total: ranked.length });
    }
    case "prediction-stats": return output(scoreEngine.getPredictionStats?.() || {});
    default: error(`Unknown trading action: ${action}. Try: portfolio, positions, quote, top, worst, score, signals, convictions`);
  }
}

async function handleHealth() {
  const { dataFile } = await getPaths();
  const data = readJsonFile(dataFile("oura-data.json"));
  if (!data?.latest) error("No Oura data cached");

  switch (action) {
    case "summary": return output({
      sleep: data.latest.sleep?.at(-1) || null,
      readiness: data.latest.readiness?.at(-1) || null,
      activity: data.latest.activity?.at(-1) || null,
    });
    case "sleep": return output(data.latest.sleep || []);
    case "readiness": return output(data.latest.readiness?.at(-1) || null);
    case "activity": return output(data.latest.activity || []);
    default: error(`Unknown health action: ${action}. Try: summary, sleep, readiness, activity`);
  }
}

async function handleLife() {
  const { dataFile, memoryFile } = await getPaths();

  switch (action) {
    case "goals": {
      const raw = readJsonFile(dataFile("goals.json"));
      let goals = Array.isArray(raw) ? raw : (raw?.goals || []);
      if (flags.status) goals = goals.filter(g => g.status === flags.status);
      if (flags.category) goals = goals.filter(g => g.category === flags.category);
      return output(goals);
    }
    case "beliefs": return output(readJsonFile(dataFile("core-beliefs.json")) || []);
    case "scores": return output(readJsonFile(dataFile("life-scores.json")) || {});
    case "thesis": {
      try { return output({ thesis: fs.readFileSync(memoryFile("thesis.md"), "utf-8") }); }
      catch { return output({ thesis: "No thesis yet." }); }
    }
    case "backlog": {
      const raw = readJsonFile(dataFile("backlog.json"));
      let items = raw?.items || [];
      if (flags.minScore) items = items.filter(i => (i.score || 0) >= flags.minScore);
      if (flags.source) items = items.filter(i => i.source === flags.source);
      return output(items.slice(0, flags.limit || 20));
    }
    case "add-goal": {
      if (!flags.title || !flags.category) error("Usage: life add-goal --title='...' --category=health");
      const goals = readJsonFile(dataFile("goals.json")) || [];
      const goalList = Array.isArray(goals) ? goals : (goals?.goals || []);
      const newGoal = {
        id: `goal_${flags.category}_${Date.now()}`,
        title: flags.title,
        category: flags.category,
        priority: flags.priority || 3,
        status: "active",
        createdAt: new Date().toISOString(),
        progress: 0,
      };
      goalList.push(newGoal);
      fs.writeFileSync(dataFile("goals.json"), JSON.stringify(goalList, null, 2));
      return output(newGoal);
    }
    default: error(`Unknown life action: ${action}. Try: goals, beliefs, scores, thesis, backlog, add-goal`);
  }
}

async function handlePortfolio() {
  // Brokerage server has handleTool export
  const { handleTool } = await import(toImportPath(path.join(backboneRoot, "src/mcp/brokerage-server.js")));

  const toolMap = {
    "networth": "empower_get_networth",
    "accounts": "empower_get_accounts",
    "holdings": "empower_get_holdings",
    "overview": "empower_get_overview",
    "status": "get_brokerage_status",
    "total": "get_total_brokerage_value",
    "all-positions": "get_all_brokerage_positions",
  };

  const toolName = toolMap[action];
  if (!toolName) error(`Unknown portfolio action: ${action}. Try: networth, accounts, holdings, overview, status, total`);

  const result = await handleTool(toolName, flags);
  return output(result);
}

async function handleNews() {
  // News server doesn't export handleTool — import the underlying modules
  const { dataFile } = await getPaths();

  switch (action) {
    case "latest": {
      // Try cached news first
      const cached = readJsonFile(dataFile("news-cache.json"));
      if (cached) return output(cached);
      error("No cached news. Run the news MCP server to fetch.");
    }
    case "market": {
      const cached = readJsonFile(dataFile("market-summary.json"));
      if (cached) return output(cached);
      const news = readJsonFile(dataFile("news-cache.json"));
      if (news?.marketSummary) return output(news.marketSummary);
      error("No market summary cached.");
    }
    case "research": {
      if (!flags.topic) error("Usage: news research --topic='AI chips'");
      // Fall through to MCP for active research
      error("News research requires active web search. Use WebSearch tool directly or MCP server.");
    }
    case "beliefs": {
      const cached = readJsonFile(dataFile("news-beliefs.json"));
      if (cached) return output(cached);
      error("No belief-correlated news cached.");
    }
    case "correlate": {
      error("Portfolio-news correlation requires active analysis. Use MCP server.");
    }
    default: error(`Unknown news action: ${action}. Try: latest, market, research, beliefs`);
  }
}

async function handleProjects() {
  const { getProjectsDir, dataFile } = await getPaths();
  const projectsDir = getProjectsDir();

  switch (action) {
    case "list": {
      if (!fs.existsSync(projectsDir)) return output([]);
      const dirs = fs.readdirSync(projectsDir).filter(d => {
        const projectMd = path.join(projectsDir, d, "PROJECT.md");
        return fs.existsSync(projectMd);
      });
      return output(dirs.map(d => {
        const projectMd = path.join(projectsDir, d, "PROJECT.md");
        const content = fs.readFileSync(projectMd, "utf-8").slice(0, 200);
        const titleMatch = content.match(/^#\s+(.+)/m);
        return { name: d, title: titleMatch?.[1] || d };
      }));
    }
    case "create": {
      if (!flags.name) error("Usage: projects create --name=my-project");
      const dir = path.join(projectsDir, flags.name);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const projectMd = path.join(dir, "PROJECT.md");
      if (!fs.existsSync(projectMd)) {
        fs.writeFileSync(projectMd, `# ${flags.name}\n\nCreated: ${new Date().toISOString()}\n\n## Objectives\n\n## Progress\n`);
      }
      return output({ name: flags.name, created: true, path: dir });
    }
    case "status": {
      if (!fs.existsSync(projectsDir)) return output({ active: 0, archived: 0 });
      const active = fs.readdirSync(projectsDir).filter(d =>
        fs.existsSync(path.join(projectsDir, d, "PROJECT.md"))
      ).length;
      const archiveDir = path.join(projectsDir, ".archive");
      const archived = fs.existsSync(archiveDir) ? fs.readdirSync(archiveDir).length : 0;
      return output({ active, archived });
    }
    default: error(`Unknown projects action: ${action}. Try: list, create, status`);
  }
}

async function handleMessaging() {
  switch (action) {
    case "send": {
      if (!flags.message) error("Usage: messaging send --message='Hello'");
      const { getBaileysWhatsApp } = await import(toImportPath(path.join(backboneRoot, "src/services/messaging/baileys-whatsapp.js")));
      const wa = getBaileysWhatsApp();
      const result = await wa.sendMessage(flags.message, flags.to);
      return output(result);
    }
    case "notify": {
      if (!flags.type || !flags.message) error("Usage: messaging notify --type=alert --message='...'");
      const { getBaileysWhatsApp } = await import(toImportPath(path.join(backboneRoot, "src/services/messaging/baileys-whatsapp.js")));
      const wa = getBaileysWhatsApp();
      const result = await wa.sendNotification?.(flags.type, flags.message);
      return output(result || { sent: true });
    }
    case "status": {
      const { getBaileysWhatsApp } = await import(toImportPath(path.join(backboneRoot, "src/services/messaging/baileys-whatsapp.js")));
      const wa = getBaileysWhatsApp();
      return output({ initialized: wa.isInitialized?.() || false });
    }
    default: error(`Unknown messaging action: ${action}. Try: send, notify, status`);
  }
}

async function handleContacts() {
  const { dataFile } = await getPaths();
  const contactsFile = dataFile("contacts.json");

  switch (action) {
    case "list": {
      const contacts = readJsonFile(contactsFile) || [];
      let result = Array.isArray(contacts) ? contacts : (contacts?.contacts || []);
      if (flags.category) result = result.filter(c => c.category === flags.category);
      return output(result.slice(0, flags.limit || 50));
    }
    case "search": {
      const q = (flags.query || args[2] || "").toLowerCase();
      if (!q) error("Usage: contacts search --query=john");
      const contacts = readJsonFile(contactsFile) || [];
      const list = Array.isArray(contacts) ? contacts : (contacts?.contacts || []);
      const results = list.filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.role || "").toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q)
      );
      return output(results);
    }
    case "add": {
      if (!flags.name || !flags.category) error("Usage: contacts add --name='John' --category=friends");
      const contacts = readJsonFile(contactsFile) || [];
      const list = Array.isArray(contacts) ? contacts : (contacts?.contacts || []);
      const newContact = {
        id: `contact_${Date.now()}`,
        name: flags.name,
        category: flags.category,
        company: flags.company || "",
        role: flags.role || "",
        email: flags.email || "",
        phone: flags.phone || "",
        notes: flags.notes || "",
        createdAt: new Date().toISOString(),
      };
      list.push(newContact);
      fs.writeFileSync(contactsFile, JSON.stringify(list, null, 2));
      return output(newContact);
    }
    case "profile": {
      const name = flags.name || args[2];
      if (!name) error("Usage: contacts profile --name=John");
      const contacts = readJsonFile(contactsFile) || [];
      const list = Array.isArray(contacts) ? contacts : (contacts?.contacts || []);
      const match = list.find(c => (c.name || "").toLowerCase().includes(name.toLowerCase()));
      if (!match) error(`Contact not found: ${name}`);
      return output(match);
    }
    default: error(`Unknown contacts action: ${action}. Try: list, search, add, profile`);
  }
}

async function handleCalendar() {
  // Calendar requires Google OAuth — delegate to the MCP server's underlying functions
  // For now, read cached calendar data if available
  const { dataFile } = await getPaths();

  switch (action) {
    case "today":
    case "upcoming": {
      // Try to use the google module directly
      try {
        const googleMod = await import(toImportPath(path.join(backboneRoot, "src/mcp/google-mail-calendar-server.js")));
        if (googleMod.handleTool) {
          const toolName = action === "today" ? "get_today_events" : "get_upcoming_events";
          const result = await googleMod.handleTool(toolName, flags);
          return output(result);
        }
      } catch {}
      error("Calendar requires Google OAuth. Use the google MCP server.");
    }
    default: error(`Unknown calendar action: ${action}. Try: today, upcoming`);
  }
}

async function handleEmail() {
  const { dataFile } = await getPaths();

  switch (action) {
    case "recent":
    case "unread":
    case "search": {
      try {
        const googleMod = await import(toImportPath(path.join(backboneRoot, "src/mcp/google-mail-calendar-server.js")));
        if (googleMod.handleTool) {
          const toolMap = { recent: "get_recent_emails", unread: "get_unread_count", search: "search_emails" };
          const result = await googleMod.handleTool(toolMap[action], flags);
          return output(result);
        }
      } catch {}
      error("Email requires Google OAuth. Use the google MCP server.");
    }
    default: error(`Unknown email action: ${action}. Try: recent, unread, search`);
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN DISPATCH
// ══════════════════════════════════════════════════════════════

async function main() {
  try {
    switch (domain) {
      case "trading": return await handleTrading();
      case "health": return await handleHealth();
      case "life": return await handleLife();
      case "portfolio": return await handlePortfolio();
      case "news": return await handleNews();
      case "projects": return await handleProjects();
      case "messaging": return await handleMessaging();
      case "contacts": return await handleContacts();
      case "calendar": return await handleCalendar();
      case "email": return await handleEmail();
      case "help": {
        output({
          domains: ["trading", "health", "life", "portfolio", "news", "projects", "messaging", "contacts", "calendar", "email"],
          usage: "node tools/backbone-cli.js <domain> <action> [--key=value ...]",
          examples: [
            "node tools/backbone-cli.js trading portfolio",
            "node tools/backbone-cli.js trading quote --symbol=NVDA",
            "node tools/backbone-cli.js health summary",
            "node tools/backbone-cli.js life goals --status=active",
            "node tools/backbone-cli.js portfolio networth",
            "node tools/backbone-cli.js messaging send --message='Hello'",
          ],
        });
        return;
      }
      default: error(`Unknown domain: ${domain}. Try: trading, health, life, portfolio, news, projects, messaging, contacts, calendar, email`);
    }
  } catch (err) {
    error(err.message || String(err));
  }
}

main();
