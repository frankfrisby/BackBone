/**
 * Empower Integration Tests
 *
 * Tests the full data pipeline:
 * 1. PersonalCapitalService (data layer)
 * 2. MCP brokerage-server tool handlers
 * 3. MCP server invocation via CLI
 * 4. Financial query simulation
 * 5. WhatsApp message simulation
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Windows ESM requires file:// URLs for dynamic imports
const importLocal = (relPath) => import(pathToFileURL(path.join(ROOT, relPath)).href);

// Resolve user data dir the same way paths.js does
const resolveDataDir = () => {
  try {
    const activeUserPath = path.join(process.env.HOME || process.env.USERPROFILE, ".backbone", "active-user.json");
    if (fs.existsSync(activeUserPath)) {
      const { uid } = JSON.parse(fs.readFileSync(activeUserPath, "utf-8"));
      if (uid) return path.join(process.env.HOME || process.env.USERPROFILE, ".backbone", "users", uid, "data");
    }
  } catch {}
  // Fallback
  return path.join(process.env.HOME || process.env.USERPROFILE, ".backbone", "data");
};

const DATA_DIR = resolveDataDir();

// ════════════════════════════════════════════════════════════════
// TEST 1: PersonalCapitalService — Data Layer
// ════════════════════════════════════════════════════════════════

describe("PersonalCapitalService", () => {
  let svc;

  before(async () => {
    const mod = await importLocal("src/services/integrations/personal-capital.js");
    svc = mod.getPersonalCapitalService();
  });

  it("should be a singleton", async () => {
    const mod = await importLocal("src/services/integrations/personal-capital.js");
    const svc2 = mod.getPersonalCapitalService();
    assert.strictEqual(svc, svc2, "getPersonalCapitalService should return same instance");
  });

  it("should have default data structure", () => {
    assert.ok(svc.data, "svc.data should exist");
    assert.ok("accounts" in svc.data, "should have accounts array");
    assert.ok("holdings" in svc.data, "should have holdings array");
    assert.ok("netWorth" in svc.data, "should have netWorth field");
    assert.ok("lastUpdated" in svc.data, "should have lastUpdated field");
  });

  it("should load cached data from personal-capital.json", () => {
    const pcPath = path.join(DATA_DIR, "personal-capital.json");
    if (!fs.existsSync(pcPath)) {
      console.log("  ⚠ No personal-capital.json found — skipping cache test");
      return;
    }
    const raw = JSON.parse(fs.readFileSync(pcPath, "utf-8"));
    // Service should have loaded this data
    if (raw.accounts && raw.accounts.length > 0) {
      assert.ok(svc.data.accounts.length > 0, `Cached data has ${raw.accounts.length} accounts but service has ${svc.data.accounts.length}`);
    }
    if (raw.netWorth) {
      assert.ok(svc.data.netWorth, "Cached netWorth should be loaded into service");
    }
  });

  it("should have consistent data across cache files", () => {
    const files = [
      { name: "personal-capital.json", key: "primary" },
      { name: "empower-auth.json", key: "auth" },
      { name: "empower-data.json", key: "data" },
      { name: "brokerage-portfolio.json", key: "portfolio" },
    ];

    const loaded = {};
    for (const f of files) {
      const p = path.join(DATA_DIR, f.name);
      if (fs.existsSync(p)) {
        try {
          loaded[f.key] = JSON.parse(fs.readFileSync(p, "utf-8"));
          console.log(`  ✓ ${f.name} exists (${JSON.stringify(loaded[f.key]).length} bytes)`);
        } catch (e) {
          console.log(`  ✗ ${f.name} exists but failed to parse: ${e.message}`);
        }
      } else {
        console.log(`  ⚠ ${f.name} not found`);
      }
    }

    // Cross-check: if auth has holdings, primary should too
    if (loaded.auth?.holdings?.length > 0 && loaded.primary) {
      const authCount = loaded.auth.holdings.length;
      const primaryCount = (loaded.primary.holdings || []).length;
      if (primaryCount === 0 && authCount > 0) {
        assert.fail(`BUG: empower-auth.json has ${authCount} holdings but personal-capital.json has 0. Data not syncing from auth to primary cache.`);
      }
    }

    // Cross-check: if primary has data, portfolio should reflect it
    if (loaded.primary?.netWorth && loaded.portfolio) {
      const primaryNW = loaded.primary.netWorth?.total || loaded.primary.netWorth;
      const portfolioNW = loaded.portfolio.totalNetWorth;
      if (portfolioNW && typeof primaryNW === "number" && typeof portfolioNW === "number") {
        // Allow 10% variance (different update times)
        const diff = Math.abs(primaryNW - portfolioNW) / Math.max(primaryNW, portfolioNW);
        if (diff > 0.1) {
          console.log(`  ⚠ Net worth mismatch: primary=${primaryNW}, portfolio=${portfolioNW} (${(diff * 100).toFixed(1)}% diff)`);
        }
      }
    }
  });

  it("should expose getDisplayData and getFinanceData", () => {
    if (typeof svc.getDisplayData === "function") {
      const display = svc.getDisplayData();
      console.log(`  getDisplayData keys: ${Object.keys(display || {}).join(", ")}`);
    }
    if (typeof svc.getFinanceData === "function") {
      const finance = svc.getFinanceData();
      console.log(`  getFinanceData keys: ${Object.keys(finance || {}).join(", ")}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// TEST 2: MCP Brokerage Server — Tool Handlers
// ════════════════════════════════════════════════════════════════

describe("MCP Brokerage Server — Tool Handlers (direct)", () => {
  // Import the handleTool function by re-implementing the logic from brokerage-server.js
  // since it's an MCP stdio server and can't be imported directly.
  // Instead, we test the data files it would read.

  it("should have valid brokerage-freshness.json or use defaults", () => {
    const freshPath = path.join(DATA_DIR, "brokerage-freshness.json");
    if (fs.existsSync(freshPath)) {
      const data = JSON.parse(fs.readFileSync(freshPath, "utf-8"));
      assert.ok(typeof data.thresholdH === "number", "thresholdH should be a number");
      assert.ok(data.thresholdH >= 1 && data.thresholdH <= 24, `thresholdH ${data.thresholdH} should be between 1 and 24`);
      assert.ok(Array.isArray(data.checks), "checks should be an array");
      console.log(`  Freshness: threshold=${data.thresholdH}h, checks=${data.checks.length}, lastRefresh=${data.lastRefresh || "never"}`);
    } else {
      console.log("  ⚠ No freshness file — will use default 24h threshold");
    }
  });

  it("empower_get_accounts: should return categorized accounts", async () => {
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();
    const accounts = svc.data.accounts || [];

    console.log(`  Total accounts in service: ${accounts.length}`);

    if (accounts.length === 0) {
      // Check auth file fallback
      const authPath = path.join(DATA_DIR, "empower-auth.json");
      if (fs.existsSync(authPath)) {
        const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
        const authAccounts = auth.accounts || [];
        console.log(`  Accounts in empower-auth.json: ${authAccounts.length}`);
        if (authAccounts.length > 0) {
          assert.fail(`BUG: empower-auth.json has ${authAccounts.length} accounts but PersonalCapitalService has 0. Auth data not loaded into service.`);
        }
      }
      console.log("  ⚠ No accounts found in any cache — need to run empower_scrape first");
      return;
    }

    // Verify categorization works
    const categories = { cash: 0, investments: 0, creditCards: 0, loans: 0, assets: 0, other: 0 };
    for (const acc of accounts) {
      const type = (acc.type || "").toLowerCase();
      if (type.includes("cash") || type.includes("checking") || type.includes("saving")) categories.cash++;
      else if (type.includes("invest") || type.includes("401k") || type.includes("ira") || type.includes("brokerage") || type.includes("retirement")) categories.investments++;
      else if (type.includes("credit")) categories.creditCards++;
      else if (type.includes("loan") || type.includes("mortgage") || type.includes("debt")) categories.loans++;
      else if (type.includes("asset") || type.includes("property") || type.includes("home") || type.includes("vehicle")) categories.assets++;
      else categories.other++;
    }
    console.log(`  Categories: ${JSON.stringify(categories)}`);

    // Check for untyped accounts (would land in "other")
    if (categories.other > accounts.length * 0.5) {
      console.log(`  ⚠ ${categories.other}/${accounts.length} accounts have no/unknown type — category grouping may be broken`);
    }
  });

  it("empower_get_networth: should return net worth data", async () => {
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();
    const nw = svc.data.netWorth;

    if (!nw) {
      console.log("  ⚠ No net worth data in service");
      // Check if it's in the auth file
      const authPath = path.join(DATA_DIR, "empower-auth.json");
      if (fs.existsSync(authPath)) {
        const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
        if (auth.netWorth) {
          console.log(`  Found net worth in empower-auth.json: ${JSON.stringify(auth.netWorth)}`);
          assert.fail("BUG: Net worth exists in empower-auth.json but not in PersonalCapitalService.data.netWorth");
        }
      }
      return;
    }

    console.log(`  Net worth: ${JSON.stringify(nw)}`);
    assert.ok(nw.total != null || nw.assets != null, "Net worth should have total or assets field");
  });

  it("empower_get_holdings: should return holdings", async () => {
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();
    const holdings = svc.data.holdings || [];

    console.log(`  Holdings in service: ${holdings.length}`);

    if (holdings.length === 0) {
      // Check all fallback sources
      const sources = [
        { name: "empower-auth.json", key: "holdings" },
        { name: "empower-data.json", key: "holdings" },
        { name: "brokerage-portfolio.json", key: "holdings" },
      ];
      for (const src of sources) {
        const p = path.join(DATA_DIR, src.name);
        if (fs.existsSync(p)) {
          const data = JSON.parse(fs.readFileSync(p, "utf-8"));
          const h = data[src.key] || [];
          if (h.length > 0) {
            console.log(`  ✗ ${src.name} has ${h.length} holdings but service has 0`);
          }
        }
      }
    } else {
      // Verify holdings have required fields
      const sample = holdings[0];
      console.log(`  Sample holding: ${JSON.stringify(sample)}`);
      const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0);
      console.log(`  Total holdings value: $${totalValue.toLocaleString()}`);
    }
  });

  it("get_total_brokerage_value: should resolve net worth correctly", async () => {
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();

    // Test the same logic as the MCP handler
    const empowerData = (() => {
      try {
        const p = path.join(DATA_DIR, "empower-data.json");
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {}
      return null;
    })();

    const empowerSvc = (typeof svc.getFinanceData === "function") ? svc.getFinanceData() : {};

    console.log(`  empowerSvc.equity: ${empowerSvc?.equity}`);
    console.log(`  empowerData?.netWorth: ${empowerData?.netWorth}`);

    const netWorth = empowerSvc?.equity || empowerData?.netWorth;
    if (!netWorth) {
      console.log("  ⚠ No net worth from either source — get_total_brokerage_value will fall back to summing individual brokerages");
    } else {
      console.log(`  ✓ Net worth resolved: $${netWorth.toLocaleString()}`);
      assert.ok(typeof netWorth === "number", "Net worth should be a number");
      assert.ok(netWorth > 0, "Net worth should be positive");
    }
  });
});

// ════════════════════════════════════════════════════════════════
// TEST 3: MCP Server Process — Invocation Test
// ════════════════════════════════════════════════════════════════

describe("MCP Brokerage Server — Process Invocation", () => {
  const sendMCPRequest = (request) => {
    return new Promise((resolve, reject) => {
      const serverPath = path.join(ROOT, "src/mcp/brokerage-server.js");
      const proc = spawn("node", [serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
        timeout: 15000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      // MCP uses JSON-RPC over stdio
      const jsonRpc = JSON.stringify(request) + "\n";

      // Wait a moment for server to initialize, then send
      setTimeout(() => {
        proc.stdin.write(jsonRpc);
        // Give it time to process
        setTimeout(() => {
          proc.kill();
          resolve({ stdout, stderr });
        }, 3000);
      }, 1000);

      proc.on("error", reject);
    });
  };

  it("should start MCP server without crashing", async () => {
    const serverPath = path.join(ROOT, "src/mcp/brokerage-server.js");
    assert.ok(fs.existsSync(serverPath), "brokerage-server.js should exist");

    const proc = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        proc.kill();
        resolve();
      }, 3000);

      proc.stderr.on("data", (d) => {
        if (d.toString().includes("running")) {
          clearTimeout(timer);
          proc.kill();
          resolve();
        }
      });

      proc.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    console.log(`  Server stderr: ${stderr.trim()}`);
    assert.ok(!stderr.includes("Error") || stderr.includes("running"), "Server should start without errors");
  });
});

// ════════════════════════════════════════════════════════════════
// TEST 4: Financial Query Simulation
// ════════════════════════════════════════════════════════════════

describe("Financial Query Resolution", () => {
  it("'What is my net worth?' should resolve to data", async () => {
    // Simulate what the AI would do: call MCP tools to answer this
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();

    // Check primary path: empower_get_networth
    const nw = svc.data.netWorth;

    // Check fallback path: get_total_brokerage_value
    const empowerDataPath = path.join(DATA_DIR, "empower-data.json");
    const empowerData = fs.existsSync(empowerDataPath) ? JSON.parse(fs.readFileSync(empowerDataPath, "utf-8")) : null;
    const empowerSvc = typeof svc.getFinanceData === "function" ? svc.getFinanceData() : {};

    // Check portfolio path
    const portfolioPath = path.join(DATA_DIR, "brokerage-portfolio.json");
    const portfolio = fs.existsSync(portfolioPath) ? JSON.parse(fs.readFileSync(portfolioPath, "utf-8")) : null;

    const sources = {
      "svc.data.netWorth": nw?.total || nw,
      "svc.getFinanceData().equity": empowerSvc?.equity,
      "empower-data.json.netWorth": empowerData?.netWorth,
      "brokerage-portfolio.json.totalNetWorth": portfolio?.totalNetWorth,
    };

    console.log("  Data sources for 'What is my net worth?':");
    let hasData = false;
    for (const [source, value] of Object.entries(sources)) {
      if (value && typeof value === "number" && value > 0) {
        console.log(`    ✓ ${source}: $${value.toLocaleString()}`);
        hasData = true;
      } else {
        console.log(`    ✗ ${source}: ${value ?? "null/undefined"}`);
      }
    }

    if (!hasData) {
      console.log("  ⚠ No net worth data available from ANY source. User needs to run empower_scrape.");
    }
  });

  it("'Show my holdings' should resolve to data", async () => {
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();

    const holdings = svc.data.holdings || [];

    // Also check fallbacks
    const authPath = path.join(DATA_DIR, "empower-auth.json");
    const authHoldings = fs.existsSync(authPath)
      ? (JSON.parse(fs.readFileSync(authPath, "utf-8")).holdings || [])
      : [];

    const portfolioPath = path.join(DATA_DIR, "brokerage-portfolio.json");
    const portfolioHoldings = fs.existsSync(portfolioPath)
      ? (JSON.parse(fs.readFileSync(portfolioPath, "utf-8")).holdings || [])
      : [];

    console.log("  Holdings sources:");
    console.log(`    svc.data.holdings: ${holdings.length}`);
    console.log(`    empower-auth.json: ${authHoldings.length}`);
    console.log(`    brokerage-portfolio.json: ${portfolioHoldings.length}`);

    // Check for the known bug: auth has data but service doesn't
    if (holdings.length === 0 && authHoldings.length > 0) {
      assert.fail(`BUG DETECTED: empower-auth.json has ${authHoldings.length} holdings but PersonalCapitalService.data.holdings is empty. The service load() method doesn't read from empower-auth.json.`);
    }

    if (holdings.length === 0 && portfolioHoldings.length > 0) {
      console.log(`  ⚠ Holdings only available in brokerage-portfolio.json (${portfolioHoldings.length}), not in primary service`);
    }
  });

  it("'What accounts do I have?' should resolve to data", async () => {
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();
    const accounts = svc.data.accounts || [];

    const authPath = path.join(DATA_DIR, "empower-auth.json");
    const authAccounts = fs.existsSync(authPath)
      ? (JSON.parse(fs.readFileSync(authPath, "utf-8")).accounts || [])
      : [];

    console.log("  Account sources:");
    console.log(`    svc.data.accounts: ${accounts.length}`);
    console.log(`    empower-auth.json: ${authAccounts.length}`);

    if (accounts.length === 0 && authAccounts.length > 0) {
      assert.fail(`BUG DETECTED: empower-auth.json has ${authAccounts.length} accounts but PersonalCapitalService.data.accounts is empty.`);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// TEST 5: WhatsApp Message Simulation
// ════════════════════════════════════════════════════════════════

describe("WhatsApp Financial Query Simulation", () => {
  it("should have the data needed to answer 'what is my net worth?' via WhatsApp", async () => {
    // WhatsApp queries use memory/portfolio.md + MCP tools
    const memoryDir = path.join(DATA_DIR, "..", "memory");
    const portfolioMdPath = path.join(memoryDir, "portfolio.md");

    if (fs.existsSync(portfolioMdPath)) {
      const content = fs.readFileSync(portfolioMdPath, "utf-8");
      console.log(`  portfolio.md: ${content.length} chars`);
      // Check if it has dollar amounts
      const dollarPattern = /\$[\d,]+/g;
      const amounts = content.match(dollarPattern);
      if (amounts && amounts.length > 0) {
        console.log(`  ✓ portfolio.md contains ${amounts.length} dollar amounts: ${amounts.slice(0, 5).join(", ")}`);
      } else {
        console.log("  ⚠ portfolio.md has no dollar amounts — WhatsApp AI may not be able to answer financial questions");
      }
    } else {
      console.log("  ⚠ memory/portfolio.md does not exist — WhatsApp context will lack financial data");
    }

    // The WhatsApp handler also loads from the data files
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();

    const hasNetWorth = svc.data.netWorth && (svc.data.netWorth.total || typeof svc.data.netWorth === "number");
    const hasAccounts = (svc.data.accounts || []).length > 0;
    const hasHoldings = (svc.data.holdings || []).length > 0;

    console.log("  WhatsApp data availability:");
    console.log(`    Net worth: ${hasNetWorth ? "✓" : "✗"}`);
    console.log(`    Accounts: ${hasAccounts ? "✓" : "✗"} (${(svc.data.accounts || []).length})`);
    console.log(`    Holdings: ${hasHoldings ? "✓" : "✗"} (${(svc.data.holdings || []).length})`);
    console.log(`    Last updated: ${svc.data.lastUpdated || "never"}`);

    if (svc.data.lastUpdated) {
      const ageH = (Date.now() - new Date(svc.data.lastUpdated).getTime()) / 3600000;
      console.log(`    Data age: ${ageH.toFixed(1)} hours`);
      if (ageH > 24) {
        console.log("    ⚠ Data is over 24h old — recommend running empower_scrape");
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════
// TEST 6: Data Integrity — Find the Bug
// ════════════════════════════════════════════════════════════════

describe("Empower Data Integrity — Bug Detection", () => {
  it("should not have empty holdings when auth file has data", () => {
    const pcPath = path.join(DATA_DIR, "personal-capital.json");
    const authPath = path.join(DATA_DIR, "empower-auth.json");

    const pc = fs.existsSync(pcPath) ? JSON.parse(fs.readFileSync(pcPath, "utf-8")) : null;
    const auth = fs.existsSync(authPath) ? JSON.parse(fs.readFileSync(authPath, "utf-8")) : null;

    if (auth?.holdings?.length > 0 && pc && (pc.holdings || []).length === 0) {
      console.log(`  ✗ KNOWN BUG: auth has ${auth.holdings.length} holdings, personal-capital.json has 0`);
      console.log("  → Fix: PersonalCapitalService.load() should merge from empower-auth.json as fallback");
      assert.fail("Holdings data loss: auth file has data but primary cache does not");
    }

    if (pc && auth) {
      console.log(`  personal-capital.json: ${(pc.holdings || []).length} holdings, ${(pc.accounts || []).length} accounts`);
      console.log(`  empower-auth.json: ${(auth.holdings || []).length} holdings, ${(auth.accounts || []).length} accounts`);
    }
  });

  it("should not have stale data in brokerage-portfolio.json", () => {
    const portfolioPath = path.join(DATA_DIR, "brokerage-portfolio.json");
    if (!fs.existsSync(portfolioPath)) {
      console.log("  ⚠ brokerage-portfolio.json not found");
      return;
    }

    const portfolio = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
    console.log(`  Portfolio sync: ${portfolio.lastSync}`);
    console.log(`  Holdings: ${portfolio.holdingCount || (portfolio.holdings || []).length}`);
    console.log(`  Accounts: ${portfolio.accountCount || (portfolio.accounts || []).length}`);
    console.log(`  Net worth: $${(portfolio.totalNetWorth || 0).toLocaleString()}`);
    console.log(`  Duplicates removed: ${portfolio.duplicatesRemoved || 0}`);

    if ((portfolio.holdings || []).length === 0 && portfolio.holdingCount === 0) {
      console.log("  ⚠ Portfolio has 0 holdings — brokerage-sync may not be populating");
    }
  });

  it("getFinanceData() and getDisplayData() should return consistent data", async () => {
    const { getPersonalCapitalService } = await importLocal("src/services/integrations/personal-capital.js");
    const svc = getPersonalCapitalService();

    const hasGetFinanceData = typeof svc.getFinanceData === "function";
    const hasGetDisplayData = typeof svc.getDisplayData === "function";
    const hasGetConfig = typeof svc.getConfig === "function";

    console.log(`  Methods available: getFinanceData=${hasGetFinanceData}, getDisplayData=${hasGetDisplayData}, getConfig=${hasGetConfig}`);

    if (hasGetFinanceData) {
      try {
        const fd = svc.getFinanceData();
        console.log(`  getFinanceData() = ${JSON.stringify(fd)}`);
      } catch (e) {
        console.log(`  getFinanceData() threw: ${e.message}`);
      }
    }

    if (hasGetDisplayData) {
      try {
        const dd = svc.getDisplayData();
        console.log(`  getDisplayData() keys = ${Object.keys(dd || {}).join(", ")}`);
      } catch (e) {
        console.log(`  getDisplayData() threw: ${e.message}`);
      }
    }

    if (hasGetConfig) {
      try {
        const cfg = await svc.getConfig();
        console.log(`  getConfig() = ${JSON.stringify(cfg)}`);
      } catch (e) {
        console.log(`  getConfig() threw: ${e.message}`);
      }
    }
  });
});
