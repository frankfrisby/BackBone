/**
 * backbone empower — Empower financial dashboard from the CLI
 *
 * Usage:
 *   backbone empower              — Show cached net worth + accounts
 *   backbone empower scrape       — Fresh browser scrape (opens Chrome)
 *   backbone empower login        — Login flow (visible browser)
 *   backbone empower accounts     — Show all accounts by category
 *   backbone empower holdings     — Show investment holdings
 *   backbone empower networth     — Show net worth breakdown
 */

import { theme, ok, fail, warn, info } from "./theme.js";

const HELP = `
backbone empower — Empower (Personal Capital) financial data

Usage: backbone empower [command]

Commands:
  (none)        Show net worth summary (cached)
  scrape        Fresh browser scrape — opens Chrome, logs in, pulls live data
  login         Login flow only (visible Chrome, handles 2FA)
  accounts      Show all accounts grouped by category
  holdings      Show investment holdings
  networth      Net worth breakdown with categories
  refresh       Force API refresh (requires existing session)

Options:
  --help        Show this help
`;

async function getService() {
  const { getPersonalCapitalService } = await import("../services/integrations/personal-capital.js");
  return getPersonalCapitalService();
}

function formatMoney(n) {
  if (n == null || isNaN(n)) return "$0.00";
  const neg = n < 0;
  const abs = Math.abs(n);
  const formatted = "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? `-${formatted}` : formatted;
}

function ageString(dateStr) {
  if (!dateStr) return "unknown";
  const h = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ── Commands ─────────────────────────────────────────────────

async function showSummary() {
  const svc = await getService();
  const nw = svc.data.netWorth;
  const updated = svc.data.lastUpdated;

  console.log(theme.heading("\n  Empower Financial Summary\n"));

  if (!nw && !svc.data.accounts?.length) {
    console.log(`  ${theme.warn("No data cached.")} Run: ${theme.info("backbone empower scrape")}`);
    console.log("");
    return;
  }

  if (nw) {
    console.log(`  ${theme.muted("Net Worth:")}    ${theme.success(formatMoney(nw.total))}`);
    if (nw.categories) {
      const cats = nw.categories;
      if (cats.investments) console.log(`  ${theme.muted("Investments:")}  ${formatMoney(cats.investments)}`);
      if (cats.cash) console.log(`  ${theme.muted("Cash:")}          ${formatMoney(cats.cash)}`);
      if (cats.assets) console.log(`  ${theme.muted("Assets:")}        ${formatMoney(cats.assets)}`);
      if (cats.creditCards) console.log(`  ${theme.muted("Credit Cards:")} ${theme.warn(formatMoney(-Math.abs(cats.creditCards)))}`);
      if (cats.loans) console.log(`  ${theme.muted("Loans:")}         ${theme.warn(formatMoney(-Math.abs(cats.loans)))}`);
      if (cats.liabilities) console.log(`  ${theme.muted("Liabilities:")}  ${theme.warn(formatMoney(-Math.abs(cats.liabilities)))}`);
    }
  }

  console.log(`  ${theme.muted("Last updated:")} ${ageString(updated)}`);

  const h = updated ? (Date.now() - new Date(updated).getTime()) / 3600000 : 999;
  if (h > 6) {
    console.log(`\n  ${theme.warn("Data is stale.")} Run: ${theme.info("backbone empower scrape")}`);
  }
  console.log("");
}

async function showAccounts() {
  const svc = await getService();
  const accounts = svc.data.accounts || [];

  console.log(theme.heading("\n  Empower Accounts\n"));

  if (!accounts.length) {
    console.log(`  ${theme.warn("No accounts cached.")} Run: ${theme.info("backbone empower scrape")}`);
    console.log("");
    return;
  }

  // Group by type/institution
  const groups = {};
  for (const acc of accounts) {
    // Skip DOM duplicates
    if (acc.source === "dom") continue;
    const cat = (typeof acc.type === "string" && acc.type) || "Other";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(acc);
  }

  for (const [cat, accs] of Object.entries(groups)) {
    const total = accs.reduce((s, a) => s + (a.balance || 0), 0);
    console.log(`  ${theme.info(cat)} ${theme.muted("(" + formatMoney(total) + ")")}`);
    for (const acc of accs) {
      const bal = formatMoney(acc.balance);
      const inst = acc.institution ? theme.muted(` · ${acc.institution}`) : "";
      console.log(`    ${acc.name.slice(0, 50).padEnd(52)} ${bal.padStart(14)}${inst}`);
    }
    console.log("");
  }

  console.log(`  ${theme.muted("Last updated:")} ${ageString(svc.data.lastUpdated)}`);
  console.log("");
}

async function showHoldings() {
  const svc = await getService();
  const holdings = svc.data.holdings || [];

  console.log(theme.heading("\n  Empower Holdings\n"));

  if (!holdings.length) {
    console.log(`  ${theme.warn("No holdings cached.")} Run: ${theme.info("backbone empower scrape")}`);
    console.log("");
    return;
  }

  // Header
  console.log(`  ${"Ticker".padEnd(8)} ${"Name".padEnd(30)} ${"Shares".padStart(10)} ${"Price".padStart(12)} ${"Value".padStart(14)}`);
  console.log(`  ${"-".repeat(8)} ${"-".repeat(30)} ${"-".repeat(10)} ${"-".repeat(12)} ${"-".repeat(14)}`);

  let totalValue = 0;
  // Sort by value descending
  const sorted = [...holdings].sort((a, b) => (b.value || 0) - (a.value || 0));

  for (const h of sorted) {
    const ticker = (h.ticker || h.symbol || "").padEnd(8);
    const name = (h.name || "").slice(0, 30).padEnd(30);
    const shares = h.quantity ? h.quantity.toFixed(2).padStart(10) : "".padStart(10);
    const price = h.price ? formatMoney(h.price).padStart(12) : "".padStart(12);
    const value = h.value ? formatMoney(h.value).padStart(14) : "".padStart(14);
    totalValue += h.value || 0;
    console.log(`  ${ticker} ${name} ${shares} ${price} ${value}`);
  }

  console.log(`  ${"-".repeat(8)} ${"-".repeat(30)} ${"-".repeat(10)} ${"-".repeat(12)} ${"-".repeat(14)}`);
  console.log(`  ${"".padEnd(8)} ${"TOTAL".padEnd(30)} ${"".padStart(10)} ${"".padStart(12)} ${formatMoney(totalValue).padStart(14)}`);
  console.log(`\n  ${theme.muted("Last updated:")} ${ageString(svc.data.lastUpdated)}`);
  console.log("");
}

async function runScrape() {
  console.log(theme.heading("\n  Empower Scrape\n"));
  console.log(`  ${theme.info("Opening Chrome and navigating to Empower...")}`);
  console.log(`  ${theme.muted("This will log in, handle 2FA if needed, and scrape your data.")}`);
  console.log(`  ${theme.muted("URL: https://participant.empower-retirement.com/participant/#/login?accu=MYERIRA")}`);
  console.log("");

  const svc = await getService();
  const result = await svc.scrapeWithBrowser({ headless: false });

  console.log("");
  if (result.success) {
    console.log(`  ${theme.success("✓")} ${result.message}`);
    if (result.netWorth) {
      console.log(`  ${theme.muted("Net Worth:")} ${theme.success(formatMoney(result.netWorth))}`);
    }
    console.log(`  ${theme.muted("Accounts:")} ${result.accounts?.length || 0}`);
    console.log(`  ${theme.muted("Holdings:")} ${result.holdings?.length || 0}`);
    if (result.screenshot) {
      console.log(`  ${theme.muted("Screenshot:")} ${result.screenshot}`);
    }
    if (result.dataSources) {
      const ds = result.dataSources;
      console.log(`  ${theme.muted("Sources:")} API(${ds.api?.responses || 0} calls, ${ds.api?.accounts || 0} accts), DOM(${ds.dom?.accounts || 0} accts), Text(${ds.text?.accounts || 0} accts)`);
    }
  } else {
    console.log(`  ${theme.error("✗")} ${result.message || "Scrape failed"}`);
    if (result.needs2FA) {
      console.log(`  ${theme.info("2FA required.")} Check your phone for the code.`);
    }
    if (result.needsLogin) {
      console.log(`  ${theme.info("No credentials found.")} Run: ${theme.info("backbone empower login")}`);
    }
    if (result.screenshot) {
      console.log(`  ${theme.muted("Screenshot:")} ${result.screenshot}`);
    }
  }
  console.log("");
}

async function runLogin() {
  console.log(theme.heading("\n  Empower Login\n"));
  console.log(`  ${theme.info("Opening visible Chrome for login...")}`);
  console.log(`  ${theme.muted("Log in manually if credentials aren't saved.")}`);
  console.log("");

  const svc = await getService();
  const result = await svc.scrapeWithBrowser({ headless: false });

  if (result.success) {
    console.log(`  ${theme.success("✓")} Logged in and scraped data.`);
    if (result.netWorth) console.log(`  ${theme.muted("Net Worth:")} ${formatMoney(result.netWorth)}`);
  } else {
    console.log(`  ${theme.error("✗")} ${result.message}`);
    if (result.needs2FA) console.log(`  ${theme.info("2FA required — check your phone.")}`);
  }
  console.log("");
}

// ── Main entry ───────────────────────────────────────────────

export async function runEmpower(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  const cmd = (args[0] || "").toLowerCase();

  try {
    switch (cmd) {
      case "scrape":
        await runScrape();
        break;
      case "login":
        await runLogin();
        break;
      case "accounts":
      case "account":
        await showAccounts();
        break;
      case "holdings":
      case "positions":
        await showHoldings();
        break;
      case "networth":
      case "net-worth":
      case "nw":
        await showSummary();
        break;
      case "refresh":
        console.log(theme.heading("\n  Empower Refresh\n"));
        console.log(`  ${theme.info("Forcing API refresh...")}`);
        const svc = await getService();
        const result = await svc.scrapeWithBrowser({ headless: false });
        if (result.success) console.log(`  ${theme.success("✓")} ${result.message}`);
        else console.log(`  ${theme.error("✗")} ${result.message}`);
        console.log("");
        break;
      default:
        await showSummary();
    }
  } catch (err) {
    console.error(theme.error(`\n  Error: ${err.message}\n`));
  }
}
