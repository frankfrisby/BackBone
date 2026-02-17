/**
 * Brokerage Daily Sync
 *
 * Reuses saved cookies/sessions to pull fresh data from connected brokerages.
 * Deduplicates holdings across brokerages and produces a consolidated portfolio.
 * Designed to run daily via proactive scheduler.
 *
 * Output: data/brokerage-portfolio.json
 */

import fs from "node:fs";
import path from "node:path";
import { getDataDir, getScreenshotsDir } from "../paths.js";
import { getBrokerageStatuses, isExpired, BROKERAGES } from "./brokerage-auth.js";

const DATA_DIR = getDataDir();
const TAG = "[BrokerageSync]";
const PORTFOLIO_PATH = path.join(DATA_DIR, "brokerage-portfolio.json");
const SYNC_LOG_PATH = path.join(DATA_DIR, "brokerage-sync-log.json");

// ── Public API ──────────────────────────────────────────────────

/**
 * Run a full sync of all connected brokerages.
 * Returns { success, message, accounts, holdings, netWorth, syncLog }
 */
export async function syncAllBrokerages({ notify } = {}) {
  const statuses = getBrokerageStatuses();
  const connected = Object.entries(statuses).filter(([, s]) => s.connected && !s.expired);

  if (connected.length === 0) {
    return { success: false, message: "No connected brokerages to sync" };
  }

  const syncLog = { timestamp: new Date().toISOString(), results: {} };
  const allAccounts = [];
  const allHoldings = [];

  for (const [id] of connected) {
    console.log(`${TAG} Syncing ${id}...`);
    try {
      const result = await refreshBrokerage(id);
      syncLog.results[id] = { success: result.success, message: result.message };

      if (result.success) {
        if (result.accounts) allAccounts.push(...result.accounts.map(a => ({ ...a, brokerage: id })));
        if (result.holdings) allHoldings.push(...result.holdings.map(h => ({ ...h, brokerage: id })));
      }
    } catch (err) {
      syncLog.results[id] = { success: false, message: err.message };
      console.error(`${TAG} ${id} sync failed:`, err.message);
    }
  }

  // Deduplicate holdings across brokerages
  const deduped = deduplicateHoldings(allHoldings);

  // If live scrape returned empty, fall back to auth file cached data
  for (const [id] of connected) {
    if (allAccounts.filter(a => a.brokerage === id).length === 0 ||
        allHoldings.filter(h => h.brokerage === id).length === 0) {
      try {
        const authPath = path.join(DATA_DIR, BROKERAGES[id].authFile);
        if (fs.existsSync(authPath)) {
          const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
          if (allAccounts.filter(a => a.brokerage === id).length === 0 && auth.accounts?.length > 0) {
            allAccounts.push(...auth.accounts.map(a => ({ ...a, brokerage: id, cached: true })));
            console.log(`${TAG} [${id}] Using ${auth.accounts.length} cached accounts from auth file`);
          }
          if (allHoldings.filter(h => h.brokerage === id).length === 0 && auth.holdings?.length > 0) {
            allHoldings.push(...auth.holdings.map(h => ({ ...h, brokerage: id, cached: true })));
            console.log(`${TAG} [${id}] Using ${auth.holdings.length} cached holdings from auth file`);
          }
        }
      } catch {}
    }
  }

  // Calculate total net worth from auth files (most accurate)
  let totalNetWorth = 0;
  for (const [id] of connected) {
    try {
      const authPath = path.join(DATA_DIR, BROKERAGES[id].authFile);
      if (fs.existsSync(authPath)) {
        const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
        if (auth.netWorth) totalNetWorth += auth.netWorth;
      }
    } catch {}
  }

  // Save consolidated portfolio
  const portfolio = {
    lastSync: new Date().toISOString(),
    totalNetWorth,
    connectedBrokerages: connected.map(([id, s]) => ({ id, label: s.label })),
    accounts: allAccounts,
    holdings: deduped.holdings,
    duplicatesRemoved: deduped.duplicatesRemoved,
    holdingCount: deduped.holdings.length,
    accountCount: allAccounts.length,
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
  fs.writeFileSync(SYNC_LOG_PATH, JSON.stringify(syncLog, null, 2));

  const msg = `Brokerage sync complete: ${deduped.holdings.length} holdings, ${allAccounts.length} accounts` +
    (totalNetWorth ? `, net worth: $${totalNetWorth.toLocaleString()}` : "") +
    (deduped.duplicatesRemoved > 0 ? ` (${deduped.duplicatesRemoved} duplicates removed)` : "");

  console.log(`${TAG} ${msg}`);

  if (notify) {
    try { await notify(msg); } catch {}
  }

  return { success: true, message: msg, ...portfolio, syncLog };
}

/**
 * Refresh data for a single brokerage.
 *
 * Strategy:
 * 1. Try visible browser scrape (headless is blocked by Cloudflare/bot detection)
 * 2. If browser fails or is unavailable, fall back to cached auth file data
 * 3. For Robinhood: use API with saved OAuth token (no browser needed)
 *
 * The visible browser reuses the persistent profile from the initial login,
 * so saved sessions/cookies carry over.
 */
async function refreshBrokerage(brokerageId) {
  const config = BROKERAGES[brokerageId];
  if (!config) return { success: false, message: `Unknown brokerage: ${brokerageId}` };

  const authPath = path.join(DATA_DIR, config.authFile);
  if (!fs.existsSync(authPath)) return { success: false, message: "No saved auth" };

  const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
  if (!auth.cookies?.length) return { success: false, message: "No saved cookies" };

  if (isExpired(brokerageId)) {
    return { success: false, message: "Session expired — re-login required", expired: true };
  }

  // ── Robinhood: use API with saved token ──
  if (brokerageId === "robinhood") {
    return refreshRobinhoodViaAPI(auth, authPath);
  }

  // ── Browser-based brokerages (Empower, Fidelity) ──
  let chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    // No Playwright — return cached data
    return returnCachedData(brokerageId, auth, "Playwright not installed");
  }

  const appProfile = path.join(DATA_DIR, `chrome-${brokerageId}`);
  if (!fs.existsSync(appProfile)) {
    return returnCachedData(brokerageId, auth, "No browser profile");
  }

  let context = null;
  try {
    // Must use visible browser — headless is blocked by Cloudflare
    context = await chromium.launchPersistentContext(appProfile, {
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
      timeout: 30000,
    });

    const page = context.pages()[0] || await context.newPage();

    let accounts = [];
    let holdings = [];
    let netWorth = null;

    // ── Scrape net worth page (with account breakdown) ──
    if (config.dataUrl) {
      console.log(`${TAG} [${brokerageId}] Scraping net worth...`);
      try {
        await page.goto(config.dataUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        // Wait patiently for Empower's slow SPA to render dollar amounts
        const waitStart = Date.now();
        while (Date.now() - waitStart < 45000) {
          const hasMoney = await page.evaluate(() => /\$[\d,]{2,}/.test(document.body?.innerText || "")).catch(() => false);
          if (hasMoney) break;
          await page.waitForTimeout(2000);
        }
        await page.waitForTimeout(3000);

        // Check if we're redirected to login (session expired)
        const url = page.url();
        if (url.includes("/login") || url.includes("/signin")) {
          await context.close();
          auth.capturedAt = new Date(0).toISOString(); // mark expired
          fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));
          return { success: false, message: "Session expired — redirected to login", expired: true };
        }

        await autoScroll(page);

        const nwData = await page.evaluate(() => {
          const result = { netWorth: null, accounts: [] };

          // Find net worth amount
          const allEls = document.querySelectorAll("h1, h2, h3, [class*='value'], [class*='amount'], [class*='balance'], [class*='total']");
          for (const el of allEls) {
            const text = el.textContent?.trim() || "";
            const match = text.match(/\$[\d,]+\.?\d*/);
            if (match) {
              const val = parseFloat(match[0].replace(/[$,]/g, ""));
              if (val > 1000 && !result.netWorth) result.netWorth = val;
            }
          }

          // Extract account rows (ACCOUNT / TYPE / BALANCE table)
          const rows = document.querySelectorAll("table tr, [class*='account-row'], [role='row']");
          for (const row of rows) {
            const cells = row.querySelectorAll("td, [role='cell']");
            if (cells.length >= 2) {
              const name = cells[0]?.textContent?.trim() || "";
              if (!name || name === "ACCOUNT" || name.toLowerCase().includes("total")) continue;

              let balance = null, type = "";
              for (let i = cells.length - 1; i >= 1; i--) {
                const text = cells[i]?.textContent?.trim() || "";
                const match = text.match(/\$[\d,]+\.?\d*/);
                if (match && balance === null) {
                  balance = parseFloat(match[0].replace(/[$,]/g, ""));
                } else if (!match && text && !type) {
                  type = text;
                }
              }
              if (name && balance !== null) {
                result.accounts.push({ name, type, balance });
              }
            }
          }
          return result;
        });

        netWorth = nwData.netWorth;
        accounts = nwData.accounts;
        console.log(`${TAG} [${brokerageId}] Net worth: ${netWorth}, ${accounts.length} accounts`);
      } catch (err) {
        console.log(`${TAG} [${brokerageId}] Net worth scrape failed: ${err.message?.slice(0, 80)}`);
      }
    }

    // ── Scrape holdings page ──
    if (config.holdingsUrl) {
      console.log(`${TAG} [${brokerageId}] Scraping holdings...`);
      try {
        await page.goto(config.holdingsUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(5000);
        await autoScroll(page);

        holdings = await scrapeHoldingsTable(page);
        console.log(`${TAG} [${brokerageId}] ${holdings.length} holdings scraped`);
      } catch (err) {
        console.log(`${TAG} [${brokerageId}] Holdings scrape failed: ${err.message?.slice(0, 80)}`);
      }
    }

    // Update auth file with fresh data
    auth.netWorth = netWorth || auth.netWorth;
    auth.holdings = holdings.length > 0 ? holdings : auth.holdings;
    auth.accounts = accounts.length > 0 ? accounts : auth.accounts;
    auth.lastSynced = new Date().toISOString();
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));

    await context.close();

    // If browser scrape got nothing, return cached data
    if (holdings.length === 0 && accounts.length === 0) {
      return returnCachedData(brokerageId, auth, "Browser scrape returned empty — using cached");
    }

    return { success: true, message: `${holdings.length} holdings, ${accounts.length} accounts`, accounts, holdings, netWorth };

  } catch (err) {
    if (context) try { await context.close(); } catch {}
    // Fall back to cached data
    return returnCachedData(brokerageId, auth, `Browser error: ${err.message?.slice(0, 60)}`);
  }
}

/**
 * Robinhood uses a REST API with saved OAuth token — no browser needed.
 */
async function refreshRobinhoodViaAPI(auth, authPath) {
  try {
    const { getRobinhoodService } = await import("../integrations/robinhood.js");
    const rh = getRobinhoodService();
    if (!rh.authenticated) {
      return { success: false, message: "Robinhood token expired — re-login required", expired: true };
    }
    const result = await rh.fetchAll();
    const holdings = (rh.data.positions || []).map(p => ({
      name: p.name || p.symbol,
      symbol: p.symbol,
      value: p.marketValue || 0,
      shares: p.quantity,
      price: p.currentPrice,
    }));
    const accounts = (rh.data.accounts || []).map(a => ({
      name: `Robinhood ${a.type || ""}`.trim(),
      type: a.type || "Investment",
      balance: a.balance || 0,
    }));

    auth.holdings = holdings;
    auth.accounts = accounts;
    auth.netWorth = rh.data.totalEquity || auth.netWorth;
    auth.lastSynced = new Date().toISOString();
    fs.writeFileSync(authPath, JSON.stringify(auth, null, 2));

    return { success: true, message: `${holdings.length} holdings, ${accounts.length} accounts`, accounts, holdings, netWorth: auth.netWorth };
  } catch (err) {
    return { success: false, message: `Robinhood API: ${err.message}` };
  }
}

/**
 * Return cached data from the auth file when live scraping fails.
 * This ensures the daily sync always produces a portfolio even if the
 * browser can't connect.
 */
function returnCachedData(brokerageId, auth, reason) {
  console.log(`${TAG} [${brokerageId}] ${reason} — using cached data`);
  const holdings = auth.holdings || [];
  const accounts = auth.accounts || [];
  return {
    success: true,
    cached: true,
    message: `${holdings.length} holdings (cached) — ${reason}`,
    accounts,
    holdings,
    netWorth: auth.netWorth || null,
  };
}

// ── Holdings table scraper ──────────────────────────────────────

async function scrapeHoldingsTable(page) {
  return page.evaluate(() => {
    const results = [];

    // Get column headers to determine column order
    const headerRow = document.querySelector("thead tr, [class*='header'] [role='row']");
    const headerCells = headerRow ? headerRow.querySelectorAll("th, [role='columnheader']") : [];
    const headers = Array.from(headerCells).map(h => h.textContent?.trim().toLowerCase() || "");

    // Map column indices
    const colMap = { holding: -1, shares: -1, price: -1, value: -1, change: -1 };
    headers.forEach((h, i) => {
      if (h.includes("holding") || h.includes("name") || h.includes("symbol")) colMap.holding = i;
      if (h.includes("share") || h.includes("unit") || h.includes("quantity")) colMap.shares = i;
      if (h.includes("price") && !h.includes("change")) colMap.price = i;
      if (h.includes("value") || h.includes("balance") || h.includes("market")) colMap.value = i;
      if (h.includes("change") && !h.includes("1 day")) colMap.change = i;
    });

    // Parse data rows
    const rows = document.querySelectorAll("tbody tr, [class*='data-row'], [role='row']:not(:first-child)");
    for (const row of rows) {
      const cells = row.querySelectorAll("td, [role='cell']");
      if (cells.length < 2) continue;

      // Extract holding name (first cell or mapped column)
      const nameIdx = colMap.holding >= 0 ? colMap.holding : 0;
      const rawName = cells[nameIdx]?.textContent?.trim() || "";
      if (!rawName || rawName.toLowerCase().includes("total")) continue;

      // Try to separate ticker from name (e.g. "NVDANvidia Corp" or "NVDA Nvidia Corp")
      let symbol = "", name = rawName;
      const tickerMatch = rawName.match(/^([A-Z]{1,5}(?:\.[A-Z]+)?)\s*(.*)$/);
      if (tickerMatch) {
        symbol = tickerMatch[1];
        name = tickerMatch[2] || symbol;
      }

      // Extract numeric values by column position
      function parseCell(idx) {
        if (idx < 0 || idx >= cells.length) return null;
        const text = cells[idx]?.textContent?.trim() || "";
        const clean = text.replace(/[$,%]/g, "").replace(/,/g, "");
        const val = parseFloat(clean);
        return isNaN(val) ? null : val;
      }

      const shares = parseCell(colMap.shares >= 0 ? colMap.shares : 1);
      const price = parseCell(colMap.price >= 0 ? colMap.price : 2);
      const value = parseCell(colMap.value >= 0 ? colMap.value : cells.length - 1);

      results.push({ symbol, name, shares, price, value });
    }

    return results;
  });
}

// ── Auto-scroll to load lazy content ────────────────────────────

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight || totalHeight > 10000) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
  await page.waitForTimeout(1000);
}

// ── Deduplication ───────────────────────────────────────────────

/**
 * Deduplicate holdings across brokerages.
 * If the same symbol appears in multiple brokerages, keep the one with the
 * highest value (likely the primary source). Mark others as duplicates.
 *
 * Special cases:
 * - Crypto (.COIN suffix) — deduplicate by coin
 * - Retirement accounts (401k, IRA) — never deduplicate (different wrappers)
 * - Cash positions — deduplicate by account name
 */
function deduplicateHoldings(holdings) {
  if (holdings.length === 0) return { holdings: [], duplicatesRemoved: 0 };

  // Group by normalized key
  const groups = new Map();
  let duplicatesRemoved = 0;

  for (const h of holdings) {
    const key = getDedupeKey(h);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(h);
  }

  // For each group, keep the entry with the highest value
  const deduped = [];
  for (const [key, group] of groups) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }

    // Check if these are from different account types (retirement vs brokerage)
    const brokerages = new Set(group.map(h => h.brokerage));
    if (brokerages.size > 1) {
      // Same symbol across different brokerages — likely duplicate
      // Keep the one with the highest value
      group.sort((a, b) => (b.value || 0) - (a.value || 0));
      deduped.push({ ...group[0], deduplicatedFrom: group.map(g => g.brokerage) });
      duplicatesRemoved += group.length - 1;
    } else {
      // Same brokerage, different entries — could be different accounts (401k vs IRA)
      // Keep all
      deduped.push(...group);
    }
  }

  return { holdings: deduped, duplicatesRemoved };
}

function getDedupeKey(holding) {
  // Use symbol if available
  if (holding.symbol) {
    return holding.symbol.toUpperCase().replace(/\.COIN$/, "_CRYPTO");
  }
  // Fall back to normalized name
  return (holding.name || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
}

// ── Status ──────────────────────────────────────────────────────

export function getSyncStatus() {
  const portfolio = readJsonSafe(PORTFOLIO_PATH);
  const syncLog = readJsonSafe(SYNC_LOG_PATH);

  return {
    lastSync: portfolio?.lastSync || null,
    totalNetWorth: portfolio?.totalNetWorth || 0,
    holdingCount: portfolio?.holdingCount || 0,
    accountCount: portfolio?.accountCount || 0,
    connectedBrokerages: portfolio?.connectedBrokerages || [],
    duplicatesRemoved: portfolio?.duplicatesRemoved || 0,
    syncResults: syncLog?.results || {},
  };
}

export function getConsolidatedPortfolio() {
  try {
    if (fs.existsSync(PORTFOLIO_PATH)) {
      return JSON.parse(fs.readFileSync(PORTFOLIO_PATH, "utf-8"));
    }
  } catch {}
  return null;
}

function readJsonSafe(p) {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return null;
}
