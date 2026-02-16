import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "events";

import { getDataDir, getScreenshotsDir } from "../paths.js";

// Load ~/.backbone/.env for credentials (AI never reads the values)
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
    } catch (error) {
      console.error("Failed to save Personal Capital data:", error.message);
    }
  }

  /**
   * Get email credential (checks EMPOWER_EMAIL first, then PERSONAL_CAPITAL_EMAIL)
   */
  getEmail() {
    return process.env.EMPOWER_EMAIL || process.env.PERSONAL_CAPITAL_EMAIL || "";
  }

  /**
   * Get password credential (checks EMPOWER_PASSWORD first, then PERSONAL_CAPITAL_PASSWORD)
   */
  getPassword() {
    return process.env.EMPOWER_PASSWORD || process.env.PERSONAL_CAPITAL_PASSWORD || "";
  }

  /**
   * Check if credentials are configured
   */
  hasCredentials() {
    return Boolean(this.getEmail() && this.getPassword());
  }

  /**
   * Get configuration status
   */
  getConfig() {
    const email = this.getEmail();
    return {
      hasCredentials: this.hasCredentials(),
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
    if (!this.hasCredentials()) {
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

    const email = this.getEmail();
    const password = this.getPassword();

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
      const email = this.getEmail();
      const password = this.getPassword();
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

      context = await chromium.launchPersistentContext(backboneProfile, {
        headless,
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

      // Navigate to Empower dashboard
      console.log(`${TAG} Navigating to Empower dashboard...`);
      await page.goto("https://www.empower.com/login-v2", {
        waitUntil: "domcontentloaded",
        timeout,
      });

      // Wait for dashboard to load (check for net worth element or login page)
      const currentUrl = page.url();
      console.log(`${TAG} Current URL: ${currentUrl}`);

      // Check if we're on the login page — try to auto-login using Chrome's saved credentials
      // Helper: check if URL is a login/auth page
      const isLoginPage = (url) => url.includes("/login") || url.includes("/signin") || url.includes("/auth");
      // Helper: check if URL is a dashboard/post-login page
      const isDashboard = (url) => !isLoginPage(url) && (url.includes("/dashboard") || url.includes("/page/") || url.includes("/home") || url.includes("empower.com"));

      if (isLoginPage(currentUrl)) {
        const empEmail = this.getEmail();
        const empPassword = this.getPassword();
        const hasCreds = empEmail && empPassword;
        const loginWait = Math.max(timeout, 300000);

        if (hasCreds) {
          console.log(`${TAG} Have credentials from .env — attempting auto-login...`);

          // Find and fill email field
          const emailInput = await page.waitForSelector(
            'input[type="email"], input[name="username"], input[name="email"], #username, #email, input[placeholder*="email" i], input[placeholder*="user" i]',
            { timeout: 15000 }
          ).catch(() => null);

          if (emailInput) {
            await emailInput.click({ clickCount: 3 }); // select all
            await emailInput.fill(empEmail);
            console.log(`${TAG} Email entered`);
            await page.waitForTimeout(500);

            // Some sites show password on same page, some on next page after "Continue"
            let passwordInput = await page.waitForSelector(
              'input[type="password"]', { timeout: 3000 }
            ).catch(() => null);

            if (!passwordInput) {
              // Click Continue/Next to get to password page
              const continueBtn = await page.waitForSelector(
                'button[type="submit"], button:has-text("Continue"), button:has-text("Next"), button:has-text("Log In"), button:has-text("Sign In")',
                { timeout: 5000 }
              ).catch(() => null);
              if (continueBtn) {
                await continueBtn.click();
                console.log(`${TAG} Clicked continue — waiting for password page...`);
                await page.waitForTimeout(3000);
              }
              passwordInput = await page.waitForSelector(
                'input[type="password"]', { timeout: 10000 }
              ).catch(() => null);
            }

            if (passwordInput) {
              await passwordInput.click();
              await passwordInput.fill(empPassword);
              console.log(`${TAG} Password entered`);
              await page.waitForTimeout(500);

              // Click login/submit
              const submitBtn = await page.waitForSelector(
                'button[type="submit"], button:has-text("Log In"), button:has-text("Sign In"), button:has-text("Continue"), input[type="submit"]',
                { timeout: 5000 }
              ).catch(() => null);

              if (submitBtn) {
                await submitBtn.click();
                console.log(`${TAG} Login submitted — waiting for dashboard...`);

                // Wait for navigation past login (handles multi-page login flows)
                // Keep waiting as long as URL changes — Empower has multiple auth pages
                let lastUrl = page.url();
                let stableCount = 0;
                const loginStart = Date.now();

                while (Date.now() - loginStart < 60000) {
                  await page.waitForTimeout(3000);
                  const nowUrl = page.url();
                  console.log(`${TAG} Current URL: ${nowUrl}`);

                  // If we're on a 2FA/challenge page, handle it
                  if (nowUrl.includes("challenge") || nowUrl.includes("mfa") || nowUrl.includes("verify") || nowUrl.includes("authorize")) {
                    if (headless) {
                      console.log(`${TAG} 2FA required — cannot proceed in headless mode`);
                      await context.close();
                      return {
                        success: false,
                        needs2FA: true,
                        message: "2FA challenge detected. Run with headless=false to complete 2FA, or set up a trusted device.",
                      };
                    }
                    console.log(`${TAG} 2FA page — waiting for user to complete (up to 3min)...`);
                    await page.bringToFront();
                    try {
                      await page.waitForURL(url => !url.includes("challenge") && !url.includes("mfa") && !url.includes("verify") && !url.includes("authorize"), {
                        timeout: 180000,
                      });
                      console.log(`${TAG} 2FA completed`);
                    } catch {
                      await context.close();
                      return { success: false, needs2FA: true, message: "2FA timed out." };
                    }
                  }

                  // If no longer on a login page, we're in
                  if (!isLoginPage(nowUrl) && !nowUrl.includes("challenge") && !nowUrl.includes("mfa") && !nowUrl.includes("verify")) {
                    console.log(`${TAG} Login complete — on dashboard`);
                    break;
                  }

                  // If URL hasn't changed, count as stable
                  if (nowUrl === lastUrl) {
                    stableCount++;
                    if (stableCount > 5) break; // stuck for 15s — probably need user help
                  } else {
                    stableCount = 0;
                    lastUrl = nowUrl;
                  }
                }
              }
            } else {
              console.log(`${TAG} Could not find password field`);
            }
          } else {
            console.log(`${TAG} Could not find email field`);
          }
        }

        // If still on login (no creds, or auto-login failed)
        const afterLoginUrl = page.url();
        if (isLoginPage(afterLoginUrl) || afterLoginUrl.includes("challenge") || afterLoginUrl.includes("verify")) {
          if (headless) {
            console.log(`${TAG} Still on login/auth page in headless — need setup`);
            await context.close();
            return {
              success: false,
              needsLogin: true,
              message: hasCreds
                ? "Auto-login failed. Run with headless=false to debug, or check .env credentials."
                : "No credentials. Add EMPOWER_EMAIL and EMPOWER_PASSWORD to ~/.backbone/.env, or login via the browser scraper with headless=false",
            };
          }

          // Non-headless fallback: wait for manual login
          console.log(`${TAG} Waiting for manual login (up to ${Math.round(loginWait/60000)}min)...`);
          await page.bringToFront();
          try {
            await page.waitForURL(url => !isLoginPage(url) && !url.includes("challenge") && !url.includes("verify"), { timeout: loginWait });
            console.log(`${TAG} Login successful — URL: ${page.url()}`);
            await page.waitForTimeout(5000);
          } catch {
            await context.close();
            return { success: false, needsLogin: true, message: `Login timed out after ${Math.round(loginWait/60000)} minutes.` };
          }
        }

        // Give dashboard time to fully load after login
        await page.waitForTimeout(5000);
      }

      // Wait for the dashboard content to load
      console.log(`${TAG} Waiting for dashboard data...`);
      await page.waitForTimeout(5000); // Give JS time to render

      // Take dashboard screenshot
      const screenshotsDir = getScreenshotsDir();
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
      const screenshotPath = path.join(screenshotsDir, `empower-dashboard-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`${TAG} Dashboard screenshot saved: ${screenshotPath}`);

      // Extract data from the page
      const extractedData = await page.evaluate(() => {
        const result = { accounts: [], netWorth: null, holdings: [] };

        // Try to find net worth (multiple selectors for robustness)
        const netWorthSelectors = [
          '[data-testid="net-worth-value"]',
          '.net-worth-value',
          '.netWorthValue',
          '.js-net-worth',
          '.net-worth__value',
          'h1[class*="networth"]',
          'span[class*="networth"]',
          '[class*="NetWorth"] [class*="value"]',
          '[class*="net-worth"] [class*="amount"]',
        ];
        for (const sel of netWorthSelectors) {
          const el = document.querySelector(sel);
          if (el?.textContent) {
            const text = el.textContent.replace(/[^0-9.,\-]/g, "");
            const value = parseFloat(text.replace(/,/g, ""));
            if (!isNaN(value)) {
              result.netWorth = value;
              break;
            }
          }
        }

        // If no specific selector found, try to find any large dollar amount on the page
        if (!result.netWorth) {
          const allElements = document.querySelectorAll("h1, h2, h3, [class*='value'], [class*='amount'], [class*='balance'], [class*='total']");
          for (const el of allElements) {
            const text = el.textContent?.trim() || "";
            const match = text.match(/\$[\d,]+\.?\d*/);
            if (match) {
              const value = parseFloat(match[0].replace(/[$,]/g, ""));
              if (value > 1000 && !result.netWorth) {
                result.netWorth = value;
              }
            }
          }
        }

        // Try to extract account list
        const accountRows = document.querySelectorAll('[class*="account-row"], [class*="AccountRow"], tr[class*="account"], [data-testid*="account"]');
        for (const row of accountRows) {
          const nameEl = row.querySelector('[class*="name"], [class*="title"], td:first-child');
          const balanceEl = row.querySelector('[class*="balance"], [class*="value"], [class*="amount"], td:last-child');
          if (nameEl && balanceEl) {
            const balanceText = balanceEl.textContent?.replace(/[^0-9.,\-]/g, "");
            const balance = parseFloat(balanceText?.replace(/,/g, ""));
            result.accounts.push({
              name: nameEl.textContent?.trim(),
              balance: isNaN(balance) ? 0 : balance,
            });
          }
        }

        // Get page title and body text for AI parsing fallback
        result.pageTitle = document.title;
        result.bodyText = document.body?.innerText?.slice(0, 5000) || "";

        return result;
      });

      console.log(`${TAG} Extracted: netWorth=${extractedData.netWorth}, accounts=${extractedData.accounts.length}`);

      // If we got net worth or accounts, update our data
      if (extractedData.netWorth || extractedData.accounts.length > 0) {
        if (extractedData.netWorth) {
          this.data.netWorth = {
            total: extractedData.netWorth,
            date: new Date().toISOString(),
            source: "browser_scrape",
          };
        }
        if (extractedData.accounts.length > 0) {
          this.data.accounts = extractedData.accounts.map((acc, i) => ({
            id: `empower_${i}`,
            name: acc.name,
            balance: acc.balance,
            institution: "Empower",
            lastUpdated: new Date().toISOString(),
          }));
        }
        this.data.lastUpdated = new Date().toISOString();
        this.data.authenticated = true;
        this.authenticated = true;
        this.save();
        this.emit("data-updated", this.data);
      }

      // If extraction was thin, save the page text for AI parsing
      if (!extractedData.netWorth && extractedData.accounts.length === 0 && extractedData.bodyText) {
        const textPath = path.join(DATA_DIR, "empower-page-text.txt");
        fs.writeFileSync(textPath, extractedData.bodyText);
        console.log(`${TAG} Page text saved for AI parsing: ${textPath}`);
      }

      await context.close();

      return {
        success: extractedData.netWorth !== null || extractedData.accounts.length > 0,
        netWorth: extractedData.netWorth,
        accounts: extractedData.accounts,
        screenshot: screenshotPath,
        pageText: extractedData.bodyText?.slice(0, 1000),
        message: extractedData.netWorth
          ? `Net worth: $${extractedData.netWorth.toLocaleString()}, ${extractedData.accounts.length} accounts found`
          : "Dashboard loaded but couldn't extract net worth — screenshot saved for review",
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

export const getPersonalCapitalService = () => {
  if (!serviceInstance) {
    serviceInstance = new PersonalCapitalService();
  }
  return serviceInstance;
};

export default PersonalCapitalService;
