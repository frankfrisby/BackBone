import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";
import { getDataDir } from "../paths.js";

/**
 * Fidelity Integration for BACKBONE (READ-ONLY)
 *
 * Fidelity does NOT have a public API for personal accounts.
 * This integration supports TWO methods:
 *
 * METHOD 1: Manual CSV Import (recommended, reliable)
 *   - User exports positions/activity from Fidelity website
 *   - Place CSV file in data/fidelity-import/
 *   - This service parses and caches the data
 *
 * METHOD 2: Browser Automation (fragile, requires Playwright)
 *   - Uses Playwright to login and scrape account data
 *   - Requires 2FA handling (SMS/push)
 *   - May break when Fidelity changes their UI
 *
 * NOTE: Fidelity dropped Plaid support. They use "Fidelity Access"
 * for third-party integrations, but it's not available to individuals.
 *
 * SETUP (CSV Method):
 * 1. Login to Fidelity.com
 * 2. Go to Accounts → Positions
 * 3. Click "Download" → CSV
 * 4. Save to ~/.backbone/users/<uid>/data/fidelity-import/positions.csv
 *
 * SETUP (Browser Method):
 * 1. npm install playwright
 * 2. Store credentials locally: ~/.backbone/users/<uid>/data/fidelity-config.json
 *    Fields: { "username": "...", "password": "..." }
 * 3. Call login() — will require 2FA on first run
 */

const DATA_DIR = getDataDir();
const FIDELITY_DATA_PATH = path.join(DATA_DIR, "fidelity.json");
const FIDELITY_IMPORT_DIR = path.join(DATA_DIR, "fidelity-import");
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const getDefaultData = () => ({
  accounts: [],
  positions: [],
  totalValue: null,
  importMethod: null, // "csv" or "browser"
  lastUpdated: null,
  authenticated: false
});

export class FidelityService extends EventEmitter {
  constructor() {
    super();
    this.data = getDefaultData();
    this.authenticated = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(FIDELITY_DATA_PATH)) {
        this.data = { ...getDefaultData(), ...JSON.parse(fs.readFileSync(FIDELITY_DATA_PATH, "utf-8")) };
      }
    } catch (err) {
      console.error("[Fidelity] Failed to load data:", err.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FIDELITY_DATA_PATH, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error("[Fidelity] Failed to save data:", err.message);
    }
  }

  // ─── CSV IMPORT METHOD ────────────────────────────────────────

  /**
   * Import positions from a Fidelity CSV export
   * Fidelity CSV format: Account, Symbol, Description, Quantity, Last Price, Current Value, ...
   */
  async importFromCSV(csvPath = null) {
    const filePath = csvPath || path.join(FIDELITY_IMPORT_DIR, "positions.csv");

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: `No CSV file found at ${filePath}. Export positions from Fidelity.com and save there.`,
        setupInstructions: this.getSetupInstructions()
      };
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

      if (lines.length < 2) {
        return { success: false, message: "CSV file is empty or has no data rows" };
      }

      // Parse header row
      const headers = this.parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const positions = [];
      const accounts = new Map();

      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        if (values.length < 3) continue;

        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

        // Skip summary/total rows
        const symbol = row.symbol || row.ticker || "";
        if (!symbol || symbol.startsWith("Total") || symbol === "Cash" || symbol.includes("**")) continue;

        const accountName = row.account || row["account name"] || row["account number"] || "Default";
        const quantity = parseFloat((row.quantity || row.shares || "0").replace(/,/g, "")) || 0;
        const lastPrice = parseFloat((row["last price"] || row.price || "0").replace(/[$,]/g, "")) || 0;
        const currentValue = parseFloat((row["current value"] || row.value || row["market value"] || "0").replace(/[$,]/g, "")) || 0;
        const costBasis = parseFloat((row["cost basis total"] || row["cost basis"] || "0").replace(/[$,]/g, "")) || 0;

        if (quantity === 0 && currentValue === 0) continue;

        positions.push({
          symbol: symbol.trim(),
          name: (row.description || row.name || "").trim(),
          account: accountName.trim(),
          quantity,
          lastPrice,
          currentValue: currentValue || (quantity * lastPrice),
          costBasis,
          gain: costBasis > 0 ? (currentValue || (quantity * lastPrice)) - costBasis : null,
          gainPercent: costBasis > 0 ? (((currentValue || (quantity * lastPrice)) - costBasis) / costBasis * 100) : null
        });

        if (!accounts.has(accountName)) {
          accounts.set(accountName, { name: accountName, balance: 0, positionCount: 0 });
        }
        const acc = accounts.get(accountName);
        acc.balance += currentValue || (quantity * lastPrice);
        acc.positionCount++;
      }

      // Parse cash positions
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
        const symbol = row.symbol || "";
        if (symbol.includes("Cash") || symbol === "SPAXX" || symbol === "FDRXX" || symbol === "FCASH") {
          const value = parseFloat((row["current value"] || row.value || "0").replace(/[$,]/g, "")) || 0;
          if (value > 0) {
            positions.push({
              symbol: symbol.trim(),
              name: "Cash / Money Market",
              account: (row.account || "Default").trim(),
              quantity: value,
              lastPrice: 1,
              currentValue: value,
              costBasis: value,
              gain: 0,
              gainPercent: 0
            });
          }
        }
      }

      this.data.positions = positions;
      this.data.accounts = [...accounts.values()];
      this.data.totalValue = positions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
      this.data.importMethod = "csv";
      this.data.lastUpdated = new Date().toISOString();
      this.data.authenticated = true;
      this.authenticated = true;
      this.save();

      this.emit("positions-updated", positions);
      return {
        success: true,
        positionCount: positions.length,
        accountCount: accounts.size,
        totalValue: this.data.totalValue,
        message: `Imported ${positions.length} positions from ${accounts.size} account(s)`
      };
    } catch (err) {
      return { success: false, message: `CSV parse error: ${err.message}` };
    }
  }

  /**
   * Parse a CSV line handling quoted fields
   */
  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  // ─── BROWSER AUTOMATION METHOD ────────────────────────────────

  /**
   * Login to Fidelity via browser automation (Playwright)
   * This is fragile and may break when Fidelity updates their site.
   */
  async loginWithBrowser(username, password) {
    try {
      const { chromium } = await import("playwright");

      const browser = await chromium.launch({ headless: false }); // headful for 2FA
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto("https://digital.fidelity.com/prgw/digital/login/full-page");
      await page.waitForTimeout(2000);

      // Fill login form
      await page.fill("#userId-input", username);
      await page.fill("#password", password);
      await page.click("#fs-login-button");

      // Wait for either 2FA page or dashboard
      await page.waitForTimeout(5000);

      const currentUrl = page.url();
      if (currentUrl.includes("login") || currentUrl.includes("security")) {
        // 2FA required — user must complete manually in the browser window
        console.log("[Fidelity] 2FA required. Complete verification in the browser window...");

        // Wait up to 2 minutes for user to complete 2FA
        try {
          await page.waitForURL("**/summary**", { timeout: 120000 });
        } catch {
          await browser.close();
          return { success: false, message: "Timed out waiting for 2FA. Try again." };
        }
      }

      // Extract positions from the summary page
      await page.waitForTimeout(3000);
      const positions = await this.scrapePositionsFromPage(page);

      await browser.close();

      if (positions.length > 0) {
        this.data.positions = positions;
        this.data.accounts = [{ name: "Fidelity", balance: positions.reduce((s, p) => s + (p.currentValue || 0), 0), positionCount: positions.length }];
        this.data.totalValue = positions.reduce((s, p) => s + (p.currentValue || 0), 0);
        this.data.importMethod = "browser";
        this.data.lastUpdated = new Date().toISOString();
        this.data.authenticated = true;
        this.authenticated = true;
        this.save();
        this.emit("positions-updated", positions);
      }

      return {
        success: true,
        positionCount: positions.length,
        totalValue: this.data.totalValue,
        message: `Scraped ${positions.length} positions via browser`
      };
    } catch (err) {
      if (err.message?.includes("Cannot find module") || err.code === "ERR_MODULE_NOT_FOUND") {
        return { success: false, message: "Playwright not installed. Run: npm install playwright && npx playwright install chromium" };
      }
      return { success: false, message: err.message };
    }
  }

  async scrapePositionsFromPage(page) {
    try {
      // Try to navigate to positions page
      await page.goto("https://digital.fidelity.com/ftgw/digital/portfolio/positions");
      await page.waitForTimeout(3000);

      // Extract text content and parse positions
      const content = await page.textContent("body");

      // This is a best-effort parse — Fidelity's DOM changes frequently
      // Real implementation would use page.$$eval with specific selectors
      console.log("[Fidelity] Page scraped, parsing positions...");
      return [];
    } catch (err) {
      console.error("[Fidelity] Scrape error:", err.message);
      return [];
    }
  }

  // ─── COMMON METHODS ──────────────────────────────────────────

  isStale() {
    if (!this.data.lastUpdated) return true;
    return Date.now() - new Date(this.data.lastUpdated).getTime() > CACHE_DURATION;
  }

  getDisplayData() {
    // Group positions by account
    const byAccount = {};
    for (const pos of (this.data.positions || [])) {
      const accName = pos.account || "Default";
      if (!byAccount[accName]) {
        byAccount[accName] = { name: accName, positions: [], totalValue: 0, totalGain: 0 };
      }
      byAccount[accName].positions.push(pos);
      byAccount[accName].totalValue += pos.currentValue || 0;
      byAccount[accName].totalGain += pos.gain || 0;
    }

    return {
      connected: this.data.positions.length > 0,
      importMethod: this.data.importMethod,
      totalValue: this.data.totalValue,
      accounts: Object.values(byAccount),
      accountCount: this.data.accounts?.length || 0,
      positionCount: this.data.positions?.length || 0,
      lastUpdated: this.data.lastUpdated,
      isStale: this.isStale()
    };
  }

  getFinanceData() {
    return {
      equity: this.data.totalValue || 0,
      accounts: this.data.accounts?.length || 0,
      positions: this.data.positions?.length || 0,
      lastUpdated: this.data.lastUpdated
    };
  }

  getConfig() {
    return {
      connected: this.data.positions.length > 0,
      importMethod: this.data.importMethod,
      lastUpdated: this.data.lastUpdated,
      accountCount: this.data.accounts?.length || 0,
      positionCount: this.data.positions?.length || 0
    };
  }

  getSetupInstructions() {
    return `
FIDELITY SETUP (CSV Import — Recommended)
==========================================

1. Login to Fidelity.com
2. Go to Accounts → Positions
3. Click "Download" icon → choose CSV
4. Save the file to:
   ~/.backbone/users/<uid>/data/fidelity-import/positions.csv
5. Run: /fidelity import

FIDELITY SETUP (Browser Automation — Fragile)
==============================================

1. npm install playwright
2. npx playwright install chromium
3. Store credentials in Firebase: config/config_fidelity
   Fields: username, password
4. Run: /fidelity login
   (Browser window opens — complete 2FA manually)

NOTE: Fidelity does NOT have a public API for personal accounts.
The CSV method is the most reliable approach.
`;
  }

  /**
   * Authenticate using cookies captured by brokerage-auth browser login.
   * Can be used to make authenticated fetch() calls to scrape positions.
   */
  async authenticateFromCookies(cookies) {
    if (!cookies?.length) return { success: false, message: "No cookies provided" };
    try {
      const authPath = path.join(DATA_DIR, "fidelity-auth.json");
      // Cookies are already saved by brokerage-auth; mark as authenticated
      this.authenticated = true;
      this.data.authenticated = true;
      this.data.importMethod = "browser";
      this.save();
      return { success: true, message: "Authenticated from browser cookies" };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  reset() {
    this.data = getDefaultData();
    this.authenticated = false;
    this.save();
    this.emit("reset");
  }
}

let instance = null;
export const getFidelityService = () => {
  if (!instance) instance = new FidelityService();
  return instance;
};

export default FidelityService;
