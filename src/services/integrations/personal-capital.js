import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "events";

import { getDataDir, getScreenshotsDir } from "../paths.js";
import { loginFlow, evaluatePage, clearAllPopups, visitPages } from "../browser-form-agent.js";
import { getCredential } from "../credential-vault.js";

// Load ~/.backbone/.env for credentials (legacy fallback — vault is primary)
const _loadBackboneEnv = () => {
  try {
    const envPath = path.join(os.homedir(), ".backbone", ".env");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (val && !process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {}
};
_loadBackboneEnv();
/**
 * Personal Capital (Empower) Integration for BACKBONE
 * Uses the personal-capital-sdk package
 *
 * SDK: https://github.com/auchenberg/node-personal-capital
 * Install: npm install personal-capital-sdk
 *
 * Authentication Flow:
 * 1. Call login(email, password)
 * 2. If 2FA required, SDK throws error with message "2FA_required"
 * 3. Call challangeTwoFactor("sms") to send SMS code
 * 4. Call enterTwoFactorCode("sms", code) with the code
 * 5. Call login() again to complete authentication
 */

const DATA_DIR = getDataDir();
const PC_DATA_PATH = path.join(DATA_DIR, "personal-capital.json");
const PC_COOKIES_PATH = path.join(DATA_DIR, ".pc-cookies.json");

// Default cache duration (1 hour)
const CACHE_DURATION = 60 * 60 * 1000;

/**
 * Get default data structure
 */
const getDefaultData = () => ({
  accounts: [],
  holdings: [],
  netWorth: null,
  netWorthHistory: [],
  cashFlow: null,
  categories: {},
  lastUpdated: null,
  authenticated: false
});

/**
 * Personal Capital Service Class
 */
export class PersonalCapitalService extends EventEmitter {
  constructor() {
    super();
    this.data = getDefaultData();
    this.client = null;
    this.authenticated = false;
    this.pendingTwoFactor = false;
    this.load();
  }

  /**
   * Load cached data from disk
   */
  load() {
    try {
      if (fs.existsSync(PC_DATA_PATH)) {
        const data = JSON.parse(fs.readFileSync(PC_DATA_PATH, "utf-8"));
        this.data = { ...getDefaultData(), ...data };
      }
    } catch (error) {
      console.error("Failed to load Personal Capital data:", error.message);
    }
  }

  /**
   * Save data to disk
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(PC_DATA_PATH, JSON.stringify(this.data, null, 2));
      // Also write empower-data.json as a fallback for brokerage MCP server
      const empowerDataPath = path.join(DATA_DIR, "empower-data.json");
      fs.writeFileSync(empowerDataPath, JSON.stringify({
        netWorth: this.data.netWorth?.total || 0,
        accounts: this.data.accounts || [],
        holdings: this.data.holdings || [],
        categories: this.data.categories || {},
        lastUpdated: this.data.lastUpdated,
      }, null, 2));
    } catch (error) {
      console.error("Failed to save Personal Capital data:", error.message);
    }
  }

  /**
   * Get email credential (vault first, then env vars)
   */
  async getEmail() {
    return await getCredential("EMPOWER_EMAIL") || process.env.PERSONAL_CAPITAL_EMAIL || "";
  }

  /**
   * Get password credential (vault first, then env vars)
   */
  async getPassword() {
    return await getCredential("EMPOWER_PASSWORD") || process.env.PERSONAL_CAPITAL_PASSWORD || "";
  }

  /**
   * Check if credentials are configured
   */
  async hasCredentials() {
    return Boolean(await this.getEmail() && await this.getPassword());
  }

  /**
   * Get configuration status
   */
  async getConfig() {
    const email = await this.getEmail();
    return {
      hasCredentials: await this.hasCredentials(),
      authenticated: this.authenticated,
      hasCachedData: !!(this.data.lastUpdated),
      lastUpdated: this.data.lastUpdated,
      accountCount: this.data.accounts?.length || 0,
      email: email ? `••••${email.slice(-10)}` : null
    };
  }

  /**
   * Initialize the Personal Capital client
   */
  async initClient() {
    if (!(await this.hasCredentials())) {
      throw new Error("Empower credentials not configured. Set EMPOWER_EMAIL and EMPOWER_PASSWORD in ~/.backbone/.env");
    }

    try {
      // Dynamic import since package may not be installed
      const module = await import("personal-capital-sdk");
      const PersonalCapital = module.PersonalCapital || module.default;

      if (!PersonalCapital) {
        throw new Error("Could not load PersonalCapital from SDK");
      }

      this.client = new PersonalCapital({
        cookiePath: PC_COOKIES_PATH
      });

      return true;
    } catch (error) {
      if (error.code === "ERR_MODULE_NOT_FOUND") {
        throw new Error("personal-capital-sdk not installed. Run: npm install personal-capital-sdk");
      }
      throw error;
    }
  }

  /**
   * Authenticate with Personal Capital
   * Returns { success, needsTwoFactor, message }
   */
  async authenticate() {
    if (!this.client) {
      await this.initClient();
    }

    const email = await this.getEmail();
    const password = await this.getPassword();

    try {
      // Attempt login
      await this.client.login(email, password);

      // If we get here, login succeeded without 2FA
      this.authenticated = true;
      this.data.authenticated = true;
      this.pendingTwoFactor = false;
      this.save();

      return { success: true, message: "Authenticated successfully" };
    } catch (error) {
      // Check if 2FA is required
      if (error.message === "2FA_required" || error.message?.includes("2FA") || error.message?.includes("two-factor")) {
        this.pendingTwoFactor = true;

        // Trigger SMS 2FA challenge
        try {
          await this.client.challangeTwoFactor("sms");
          return {
            success: false,
            needsTwoFactor: true,
            message: "Two-factor authentication required. SMS code sent to your phone."
          };
        } catch (challengeError) {
          return {
            success: false,
            needsTwoFactor: true,
            message: "Two-factor authentication required. Check your phone for SMS code."
          };
        }
      }

      return { success: false, message: error.message || "Authentication failed" };
    }
  }

  /**
   * Complete two-factor authentication
   */
  async completeTwoFactor(code) {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    try {
      // Submit the 2FA code
      await this.client.enterTwoFactorCode("sms", code);

      // Login again to complete authentication
      const email = await this.getEmail();
      const password = await this.getPassword();
      await this.client.login(email, password);

      this.authenticated = true;
      this.data.authenticated = true;
      this.pendingTwoFactor = false;
      this.save();

      return { success: true, message: "Two-factor authentication complete" };
    } catch (error) {
      // If still needs 2FA, the code was wrong
      if (error.message === "2FA_required" || error.message?.includes("2FA")) {
        return { success: false, message: "Invalid code. Please try again." };
      }
      return { success: false, message: error.message || "2FA verification failed" };
    }
  }

  /**
   * Fetch all account data
   */
  async fetchAccounts() {
    if (!this.authenticated) {
      return { success: false, message: "Not authenticated" };
    }

    try {
      const accounts = await this.client.getAccounts();

      this.data.accounts = (accounts || []).map(acc => ({
        id: acc.accountId,
        name: acc.name || acc.accountName || acc.firmName,
        type: acc.accountType || acc.productType,
        balance: acc.balance || acc.currentBalance,
        institution: acc.firmName || acc.name,
        lastUpdated: acc.lastRefreshed || new Date().toISOString()
      }));

      this.data.lastUpdated = new Date().toISOString();
      this.save();
      this.emit("accounts-updated", this.data.accounts);

      return { success: true, accounts: this.data.accounts };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Fetch investment holdings
   */
  async fetchHoldings() {
    if (!this.authenticated) {
      return { success: false, message: "Not authenticated" };
    }

    try {
      const holdings = await this.client.getHoldings();

      this.data.holdings = (holdings || []).map(h => ({
        ticker: h.ticker || h.symbol,
        name: h.description || h.securityName || h.holdingName,
        quantity: h.quantity || h.shares,
        value: h.value || h.marketValue,
        costBasis: h.costBasis,
        gain: h.gain || h.unrealizedGain,
        gainPercent: h.gainPercent || h.unrealizedGainPercent,
        accountId: h.accountId
      }));

      this.data.lastUpdated = new Date().toISOString();
      this.save();
      this.emit("holdings-updated", this.data.holdings);

      return { success: true, holdings: this.data.holdings };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Fetch net worth data (using accounts sum if getNetWorth not available)
   */
  async fetchNetWorth() {
    if (!this.authenticated) {
      return { success: false, message: "Not authenticated" };
    }

    try {
      // Calculate net worth from accounts
      let totalAssets = 0;
      let totalLiabilities = 0;

      for (const acc of this.data.accounts || []) {
        const balance = acc.balance || 0;
        const type = (acc.type || "").toLowerCase();

        if (type.includes("loan") || type.includes("credit") || type.includes("mortgage") || type.includes("debt")) {
          totalLiabilities += Math.abs(balance);
        } else {
          totalAssets += balance;
        }
      }

      this.data.netWorth = {
        total: totalAssets - totalLiabilities,
        assets: totalAssets,
        liabilities: totalLiabilities,
        date: new Date().toISOString()
      };

      this.data.lastUpdated = new Date().toISOString();
      this.save();
      this.emit("networth-updated", this.data.netWorth);

      return { success: true, netWorth: this.data.netWorth };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Fetch all financial data
   */
  async fetchAll() {
    const results = {
      accounts: null,
      holdings: null,
      netWorth: null,
      errors: []
    };

    // Fetch accounts first
    try {
      results.accounts = await this.fetchAccounts();
      if (!results.accounts.success) {
        results.errors.push(`Accounts: ${results.accounts.message}`);
      }
    } catch (e) {
      results.errors.push(`Accounts: ${e.message}`);
    }

    // Then holdings
    try {
      results.holdings = await this.fetchHoldings();
      if (!results.holdings.success) {
        results.errors.push(`Holdings: ${results.holdings.message}`);
      }
    } catch (e) {
      results.errors.push(`Holdings: ${e.message}`);
    }

    // Calculate net worth from accounts
    try {
      results.netWorth = await this.fetchNetWorth();
      if (!results.netWorth.success) {
        results.errors.push(`Net Worth: ${results.netWorth.message}`);
      }
    } catch (e) {
      results.errors.push(`Net Worth: ${e.message}`);
    }

    return {
      success: results.errors.length === 0,
      ...results
    };
  }

  /**
   * Check if data is stale (older than cache duration)
   */
  isStale() {
    if (!this.data.lastUpdated) return true;
    const age = Date.now() - new Date(this.data.lastUpdated).getTime();
    return age > CACHE_DURATION;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    // Calculate totals by account type
    const byType = {};
    for (const acc of this.data.accounts || []) {
      const type = acc.type || "Other";
      if (!byType[type]) {
        byType[type] = { count: 0, balance: 0 };
      }
      byType[type].count++;
      byType[type].balance += acc.balance || 0;
    }

    // Top holdings
    const topHoldings = [...(this.data.holdings || [])]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 5);

    return {
      connected: this.authenticated && this.data.accounts.length > 0,
      netWorth: this.data.netWorth,
      accountCount: this.data.accounts?.length || 0,
      accountsByType: byType,
      topHoldings,
      lastUpdated: this.data.lastUpdated,
      isStale: this.isStale()
    };
  }

  /**
   * Get total portfolio value
   */
  getTotalValue() {
    if (this.data.netWorth?.total) {
      return this.data.netWorth.total;
    }
    return this.data.accounts?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0;
  }

  /**
   * Get data for life scores integration
   */
  getFinanceData() {
    return {
      equity: this.getTotalValue(),
      accounts: this.data.accounts?.length || 0,
      holdings: this.data.holdings?.length || 0,
      netWorth: this.data.netWorth,
      lastUpdated: this.data.lastUpdated
    };
  }

  /**
   * Authenticate using cookies captured by brokerage-auth browser login.
   * Skips username/password flow entirely.
   */
  async authenticateFromCookies(cookies) {
    if (!cookies?.length) return { success: false, message: "No cookies provided" };
    try {
      // Save cookies to disk for the SDK cookie jar
      fs.writeFileSync(PC_COOKIES_PATH, JSON.stringify(cookies, null, 2));
      this.authenticated = true;
      this.data.authenticated = true;
      this.save();
      return { success: true, message: "Authenticated from browser cookies" };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Scrape Empower dashboard using Playwright with the user's Chrome profile.
   * This bypasses the SDK entirely — uses the existing browser session.
   * Returns { success, netWorth, accounts, holdings }
   */
  async scrapeWithBrowser(options = {}) {
    const { headless = true, timeout = 60000 } = options;
    const TAG = "[Empower/Browser]";

    let chromium;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      return { success: false, message: "Playwright not installed. Run: npm install playwright" };
    }

    // Use Chrome's user data dir to leverage existing login session
    const userDataDir = process.env.CHROME_USER_DATA_DIR || (() => {
      if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Google", "Chrome", "User Data");
      } else if (process.platform === "darwin") {
        return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
      }
      return path.join(os.homedir(), ".config", "google-chrome");
    })();

    const profileDir = process.env.CHROME_PROFILE || "Default";
    let context = null;

    // BACKBONE uses its own persistent Chrome profile for Empower
    // This avoids conflicts with user's open Chrome (profile lock)
    // First login requires headless=false; subsequent runs stay logged in
    const backboneProfile = path.join(DATA_DIR, "chrome-empower");
    if (!fs.existsSync(backboneProfile)) fs.mkdirSync(backboneProfile, { recursive: true });

    try {
      console.log(`${TAG} Launching browser with BACKBONE profile (headless=${headless})...`);

      // Kill any stale Chrome instances using our profile (prevents lock)
      try {
        const lockFile = path.join(backboneProfile, "SingletonLock");
        if (fs.existsSync(lockFile)) {
          console.log(`${TAG} Removing stale profile lock...`);
          fs.unlinkSync(lockFile);
        }
      } catch {}

      context = await chromium.launchPersistentContext(backboneProfile, {
        headless: false, // Always visible — Empower blocks headless + needs popup interaction
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-first-run",
          "--no-default-browser-check",
        ],
        viewport: { width: 1280, height: 900 },
        ignoreDefaultArgs: ["--enable-automation"],
        timeout: 45000,
      });
      console.log(`${TAG} Browser launched successfully`);

      const page = context.pages()[0] || await context.newPage();

      const screenshotsDir = getScreenshotsDir();
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

      // ── Login via generic form agent ─────────────────────────────
      const empEmail = await this.getEmail();
      const empPassword = await this.getPassword();

      const loginResult = await loginFlow(page, {
        url: "https://participant.empower-retirement.com/participant/#/login?accu=MYERIRA",
        email: empEmail,
        password: empPassword,
        screenshotsDir,
        timeoutMs: 600000,
        submitButton: { labels: ["Log In", "Sign In", "Continue", "Next"] },
      });

      // Check if we actually made it past login
      const finalLoginState = loginResult.state || await evaluatePage(page, "post-login", screenshotsDir);
      if (!finalLoginState.hasDollarAmounts && (finalLoginState.isLogin || finalLoginState.is2FA)) {
        await context.close();
        return {
          success: false,
          needsLogin: !(empEmail && empPassword),
          needs2FA: finalLoginState.is2FA,
          message: `Could not complete login. Screenshot saved for review.`,
          screenshot: finalLoginState.screenshot,
        };
      }

      // Dismiss any post-login popups
      await clearAllPopups(page, screenshotsDir);

      // ═══════════════════════════════════════════════════════════
      // TRIANGULATION: 3 data sources captured simultaneously
      //   1. XHR API interception — Empower's internal REST calls
      //   2. DOM scraping — CSS selectors + brute-force dollar scan
      //   3. Full page text — for AI-assisted parsing as fallback
      // ═══════════════════════════════════════════════════════════

      // Source 1: XHR API interception — capture Empower's internal API responses
      const apiData = { accounts: [], holdings: [], netWorth: null, categories: {} };
      const capturedResponses = [];

      page.on("response", async (response) => {
        try {
          const url = response.url();
          const status = response.status();
          if (status < 200 || status >= 300) return;
          const ct = response.headers()["content-type"] || "";
          if (!ct.includes("json")) return;

          // Capture any API calls that look like account/holding/net worth data
          const isRelevant = url.includes("/api/") || url.includes("/rest/") ||
            url.includes("account") || url.includes("holding") || url.includes("position") ||
            url.includes("balance") || url.includes("networth") || url.includes("net-worth") ||
            url.includes("portfolio") || url.includes("investment") || url.includes("wealth") ||
            url.includes("participant") || url.includes("aggregation");

          if (isRelevant) {
            const body = await response.json().catch(() => null);
            if (body) {
              capturedResponses.push({ url: url.slice(0, 200), body });
              console.log(`${TAG} [XHR] Captured: ${url.slice(0, 120)} (${JSON.stringify(body).length} bytes)`);
            }
          }
        } catch { /* ignore non-JSON or closed pages */ }
      });

      // ── Patient wait: let the app load fully before doing anything ──
      // Empower's SPA is slow — wait for dollar amounts to appear on screen
      console.log(`${TAG} Waiting patiently for dashboard data to render...`);

      const waitForDollarAmount = async (pg, maxWaitMs = 60000) => {
        const startMs = Date.now();
        while (Date.now() - startMs < maxWaitMs) {
          const hasMoney = await pg.evaluate(() => {
            const text = document.body?.innerText || "";
            return /\$[\d,]{2,}/.test(text);
          }).catch(() => false);
          if (hasMoney) {
            console.log(`${TAG} Dollar amounts visible after ${Math.round((Date.now() - startMs) / 1000)}s`);
            return true;
          }
          await pg.waitForTimeout(2000);
        }
        console.log(`${TAG} Timed out waiting for dollar amounts (${Math.round(maxWaitMs / 1000)}s)`);
        return false;
      };

      // Wait for initial page to show data (up to 60s — Empower is slow)
      await waitForDollarAmount(page, 60000);
      await page.waitForTimeout(5000);

      // ── DOM scraper function (passed to visitPages) ──
      const scrapeDOMOnPage = async (pg) => {
        return await pg.evaluate(() => {
          const result = { accounts: [], netWorth: null, holdings: [], pageTitle: document.title, url: window.location.href };

          // Net worth: specific selectors then brute-force biggest $
          const nwSels = ['[data-testid="net-worth-value"]', '.net-worth-value', '.netWorthValue', '.js-net-worth', '.net-worth__value', 'h1[class*="networth"]', 'span[class*="networth"]', '[class*="NetWorth"] [class*="value"]', '[class*="net-worth"] [class*="amount"]'];
          for (const sel of nwSels) {
            const el = document.querySelector(sel);
            if (el?.textContent) {
              const v = parseFloat(el.textContent.replace(/[^0-9.,\-]/g, "").replace(/,/g, ""));
              if (!isNaN(v) && v > 100) { result.netWorth = v; break; }
            }
          }
          if (!result.netWorth) {
            let maxVal = 0;
            for (const el of document.querySelectorAll("h1, h2, h3, [class*='value'], [class*='amount'], [class*='balance'], [class*='total'], span, div")) {
              const match = el.textContent?.trim().match(/\$[\d,]+\.?\d*/);
              if (match) { const v = parseFloat(match[0].replace(/[$,]/g, "")); if (v > maxVal) { maxVal = v; result.netWorth = v; } }
            }
          }

          // Accounts: multiple selector patterns
          const accSels = ['[class*="account-row"]', '[class*="AccountRow"]', 'tr[class*="account"]', '[data-testid*="account"]', '[class*="account-item"]', '[class*="account-card"]', 'li[class*="account"]', '[role="listitem"]', 'div[class*="card"]', 'div[class*="tile"]', 'article'];
          const seenNames = new Set();
          for (const sel of accSels) {
            for (const row of document.querySelectorAll(sel)) {
              const text = row.textContent?.trim() || "";
              const dollars = [...text.matchAll(/\$[\d,]+\.?\d*/g)];
              if (!dollars.length) continue;
              let maxBal = 0;
              for (const m of dollars) { const v = parseFloat(m[0].replace(/[$,]/g, "")); if (v > maxBal) maxBal = v; }
              const name = text.split("$")[0].trim().replace(/[\n\r\t]+/g, " ").slice(0, 80);
              if (name.length > 2 && maxBal > 0 && !seenNames.has(name)) { seenNames.add(name); result.accounts.push({ name, balance: maxBal }); }
            }
          }

          // Holdings: table rows
          for (const row of document.querySelectorAll("table tbody tr, [role='row']")) {
            const cells = row.querySelectorAll("td, [role='cell']");
            if (cells.length < 2) continue;
            const rawName = cells[0]?.textContent?.trim() || "";
            if (!rawName || rawName.length < 2 || rawName.toLowerCase().includes("total")) continue;
            let symbol = "", name = rawName;
            const tm = rawName.match(/^([A-Z]{1,5}(?:\.[A-Z]+)?)\s*(.*)/);
            if (tm) { symbol = tm[1]; name = tm[2] || symbol; }
            const nums = [];
            for (let i = 1; i < cells.length; i++) { const v = parseFloat(cells[i]?.textContent?.replace(/[$,%]/g, "").replace(/,/g, "").trim()); if (!isNaN(v)) nums.push(v); }
            if (symbol || name) result.holdings.push({ symbol, name, shares: nums[0] || null, price: nums[1] || null, value: nums[2] || nums[nums.length - 1] || null });
          }
          return result;
        }).catch(() => ({ accounts: [], netWorth: null, holdings: [] }));
      };

      // ═════════════════════════════════════════════════════════
      // Visit 3 pages: dashboard home, net worth, holdings
      // On each: wait for data → clear popups → scroll down 5x
      //          taking screenshot at each position → scrape DOM
      // ═════════════════════════════════════════════════════════

      const { pageResults } = await visitPages(page, [
        { name: "empower-home", url: "https://participant.empower-retirement.com/dashboard/#/user/home", desc: "Dashboard home (accounts list)" },
        { name: "empower-networth", url: "https://participant.empower-retirement.com/dashboard/#/net-worth", desc: "Net worth (categories)" },
        { name: "empower-holdings", url: "https://participant.empower-retirement.com/dashboard/#/portfolio/holdings", desc: "Holdings (positions)" },
      ], {
        screenshotsDir,
        scrollCount: 5,
        waitForDataMs: 45000,
        scrapeFn: scrapeDOMOnPage,
      });

      // ── Merge DOM scrapes from all 3 pages ──
      const extractedData = { accounts: [], netWorth: null, holdings: [], bodyText: "" };

      for (const pr of pageResults) {
        const scrape = pr.scrapeData;
        if (!scrape) continue;
        if (scrape.netWorth && !extractedData.netWorth) extractedData.netWorth = scrape.netWorth;

        // Accounts: merge unique by name
        for (const acc of (scrape.accounts || [])) {
          const key = acc.name.toLowerCase().slice(0, 30);
          if (!extractedData.accounts.some(a => a.name.toLowerCase().slice(0, 30) === key)) {
            extractedData.accounts.push(acc);
          }
        }
        // Holdings: merge unique by symbol+name
        for (const h of (scrape.holdings || [])) {
          const key = (h.symbol || h.name).toLowerCase();
          if (!extractedData.holdings.some(x => (x.symbol || x.name).toLowerCase() === key)) {
            extractedData.holdings.push(h);
          }
        }
      }

      // Body text: all page texts combined
      extractedData.bodyText = pageResults.map(pr => pr.text).join("\n\n---PAGE BREAK---\n\n").slice(0, 50000);

      console.log(`${TAG} Merged DOM results: netWorth=${extractedData.netWorth}, accounts=${extractedData.accounts.length}, holdings=${extractedData.holdings.length}`);

      console.log(`${TAG} DOM scrape: netWorth=${extractedData.netWorth}, accounts=${extractedData.accounts.length}, holdings=${extractedData.holdings.length}`);

      // ── Parse XHR API responses ──
      console.log(`${TAG} Processing ${capturedResponses.length} captured API responses...`);
      for (const { url, body } of capturedResponses) {
        try {
          // Look for account arrays in response
          const accountArrays = findArraysWithKey(body, ["accountName", "name", "firmName", "accountType", "balance", "currentBalance"]);
          for (const arr of accountArrays) {
            for (const item of arr) {
              const name = item.accountName || item.name || item.firmName || item.description || "";
              const balance = item.balance || item.currentBalance || item.value || item.totalBalance || 0;
              const type = item.accountType || item.productType || item.type || "";
              if (name && typeof balance === "number") {
                apiData.accounts.push({ name, balance, type, institution: item.firmName || "Empower", source: "api" });
              }
            }
          }

          // Look for holdings/positions arrays
          const holdingArrays = findArraysWithKey(body, ["ticker", "symbol", "cusip", "securityName", "holdingName", "quantity", "shares"]);
          for (const arr of holdingArrays) {
            for (const item of arr) {
              const symbol = item.ticker || item.symbol || "";
              const name = item.description || item.securityName || item.holdingName || item.name || "";
              const shares = item.quantity || item.shares || item.units || 0;
              const value = item.value || item.marketValue || item.currentValue || 0;
              const price = item.price || item.currentPrice || item.lastPrice || (shares > 0 ? value / shares : 0);
              const costBasis = item.costBasis || item.totalCostBasis || null;
              if (symbol || name) {
                apiData.holdings.push({ symbol, name, shares, price, value, costBasis, source: "api" });
              }
            }
          }

          // Look for net worth value
          if (body.netWorth != null) apiData.netWorth = body.netWorth;
          if (body.totalNetWorth != null) apiData.netWorth = body.totalNetWorth;
          if (body.data?.netWorth != null) apiData.netWorth = body.data.netWorth;
          if (body.totalValue != null && !apiData.netWorth) apiData.netWorth = body.totalValue;

          // Look for category breakdowns (investments, cash, credit, etc.)
          const catKeys = ["investments", "cash", "creditCards", "loans", "otherAssets", "otherLiabilities", "retirement"];
          for (const key of catKeys) {
            if (body[key] != null && typeof body[key] === "number") apiData.categories[key] = body[key];
            if (body.data?.[key] != null && typeof body.data[key] === "number") apiData.categories[key] = body.data[key];
          }
        } catch (e) {
          console.log(`${TAG} [XHR] Parse error for ${url.slice(0, 60)}: ${e.message}`);
        }
      }

      console.log(`${TAG} API interception: netWorth=${apiData.netWorth}, accounts=${apiData.accounts.length}, holdings=${apiData.holdings.length}, categories=${Object.keys(apiData.categories).length}`);

      // ── Triangulate: merge all 3 sources, preferring API > DOM > text ──
      const finalNetWorth = apiData.netWorth || extractedData.netWorth;
      const finalAccounts = apiData.accounts.length > 0 ? apiData.accounts : extractedData.accounts;
      const finalHoldings = apiData.holdings.length > 0 ? apiData.holdings : extractedData.holdings;
      const finalCategories = apiData.categories;

      // If DOM found accounts that API missed, merge them in
      if (apiData.accounts.length > 0 && extractedData.accounts.length > 0) {
        const apiNames = new Set(apiData.accounts.map(a => a.name.toLowerCase().slice(0, 20)));
        for (const domAcc of extractedData.accounts) {
          const key = domAcc.name.toLowerCase().slice(0, 20);
          if (!apiNames.has(key)) {
            finalAccounts.push({ ...domAcc, source: "dom" });
          }
        }
      }

      // ── Parse page text for any accounts/categories the other methods missed ──
      const textAccounts = parseAccountsFromText(extractedData.bodyText);
      if (finalAccounts.length === 0 && textAccounts.length > 0) {
        console.log(`${TAG} Text parsing found ${textAccounts.length} accounts as fallback`);
        finalAccounts.push(...textAccounts);
      }

      // Update our data store
      if (finalNetWorth) {
        this.data.netWorth = {
          total: finalNetWorth,
          categories: finalCategories,
          date: new Date().toISOString(),
          source: apiData.netWorth ? "api+browser" : "browser_scrape",
        };
      }
      if (finalAccounts.length > 0) {
        this.data.accounts = finalAccounts.map((acc, i) => ({
          id: `empower_${i}`,
          name: acc.name,
          type: acc.type || "",
          balance: acc.balance,
          institution: acc.institution || "Empower",
          source: acc.source || "triangulated",
          lastUpdated: new Date().toISOString(),
        }));
      }
      if (finalHoldings.length > 0) {
        this.data.holdings = finalHoldings.map(h => ({
          ticker: h.symbol || "",
          name: h.name || "",
          quantity: h.shares || 0,
          value: h.value || 0,
          price: h.price || 0,
          costBasis: h.costBasis || null,
          source: h.source || "triangulated",
        }));
      }
      this.data.lastUpdated = new Date().toISOString();
      this.data.authenticated = true;
      this.authenticated = true;
      this.save();
      this.emit("data-updated", this.data);

      // Always save page text for debugging (even on success)
      const textPath = path.join(DATA_DIR, "empower-page-text.txt");
      fs.writeFileSync(textPath, extractedData.bodyText || "");

      // Save raw API responses for debugging
      if (capturedResponses.length > 0) {
        const apiPath = path.join(DATA_DIR, "empower-api-captures.json");
        fs.writeFileSync(apiPath, JSON.stringify(capturedResponses.map(r => ({
          url: r.url,
          bodyPreview: JSON.stringify(r.body).slice(0, 2000),
        })), null, 2));
      }

      await context.close();

      const msg = [
        finalNetWorth ? `Net worth: $${finalNetWorth.toLocaleString()}` : null,
        `${finalAccounts.length} accounts`,
        `${finalHoldings.length} holdings`,
        Object.keys(finalCategories).length > 0 ? `Categories: ${Object.keys(finalCategories).join(", ")}` : null,
        `Sources: API(${capturedResponses.length} calls), DOM, text`,
      ].filter(Boolean).join(", ");

      return {
        success: finalNetWorth !== null || finalAccounts.length > 0 || finalHoldings.length > 0,
        netWorth: finalNetWorth,
        accounts: finalAccounts,
        holdings: finalHoldings,
        categories: finalCategories,
        screenshot: screenshotPath,
        dataSources: {
          api: { responses: capturedResponses.length, accounts: apiData.accounts.length, holdings: apiData.holdings.length },
          dom: { accounts: extractedData.accounts.length, holdings: extractedData.holdings.length },
          text: { accounts: textAccounts.length },
        },
        message: msg,
      };
    } catch (err) {
      console.error(`${TAG} Scrape failed:`, err.message);
      if (context) {
        try { await context.close(); } catch {}
      }
      return { success: false, message: err.message };
    }
  }

  /**
   * Clear all stored data
   */
  reset() {
    this.data = getDefaultData();
    this.authenticated = false;
    this.pendingTwoFactor = false;
    this.save();

    // Remove cookies file
    try {
      if (fs.existsSync(PC_COOKIES_PATH)) {
        fs.unlinkSync(PC_COOKIES_PATH);
      }
    } catch (error) {
      // Ignore
    }

    this.emit("reset");
  }
}

// Singleton instance
let serviceInstance = null;

// ── Helper: recursively find arrays containing objects with target keys ──
function findArraysWithKey(obj, targetKeys, depth = 0) {
  const results = [];
  if (depth > 8 || !obj || typeof obj !== "object") return results;

  if (Array.isArray(obj)) {
    // Check if array items have any target key
    const hasTarget = obj.some(item =>
      item && typeof item === "object" && targetKeys.some(k => k in item)
    );
    if (hasTarget) results.push(obj);
  }

  // Recurse into object properties
  for (const val of Object.values(obj)) {
    if (val && typeof val === "object") {
      results.push(...findArraysWithKey(val, targetKeys, depth + 1));
    }
  }
  return results;
}

// ── Helper: parse accounts from raw page text ──
function parseAccountsFromText(text) {
  if (!text) return [];
  const accounts = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Look for patterns like: "Account Name ... $12,345.67"
  // or "Checking ... $1,234.56"
  const accountPatterns = [
    /^(.{3,60}?)\s+\$?([\d,]+\.?\d*)\s*$/,
    /^(.+?)\s+\$\s*([\d,]+\.?\d*)/,
  ];

  // Also look for category totals like "Total Investments $50,000"
  const categoryPattern = /(?:total\s+)?(\w[\w\s]{2,30}?)\s*[:.]?\s*\$\s*([\d,]+\.?\d{0,2})/gi;
  let match;
  while ((match = categoryPattern.exec(text)) !== null) {
    const name = match[1].trim();
    const balance = parseFloat(match[2].replace(/,/g, ""));
    if (balance > 0 && name.length > 2 && !name.toLowerCase().includes("net worth")) {
      accounts.push({ name, balance, source: "text" });
    }
  }

  return accounts;
}

export const getPersonalCapitalService = () => {
  if (!serviceInstance) {
    serviceInstance = new PersonalCapitalService();
  }
  return serviceInstance;
};

export default PersonalCapitalService;
