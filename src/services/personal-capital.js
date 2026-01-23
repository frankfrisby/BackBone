import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";

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

const DATA_DIR = path.join(process.cwd(), "data");
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
   * Check if credentials are configured
   */
  hasCredentials() {
    return Boolean(
      process.env.PERSONAL_CAPITAL_EMAIL &&
      process.env.PERSONAL_CAPITAL_PASSWORD
    );
  }

  /**
   * Get configuration status
   */
  getConfig() {
    return {
      hasCredentials: this.hasCredentials(),
      authenticated: this.authenticated,
      lastUpdated: this.data.lastUpdated,
      accountCount: this.data.accounts?.length || 0,
      email: process.env.PERSONAL_CAPITAL_EMAIL
        ? `••••${process.env.PERSONAL_CAPITAL_EMAIL.slice(-10)}`
        : null
    };
  }

  /**
   * Initialize the Personal Capital client
   */
  async initClient() {
    if (!this.hasCredentials()) {
      throw new Error("Personal Capital credentials not configured. Set PERSONAL_CAPITAL_EMAIL and PERSONAL_CAPITAL_PASSWORD.");
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

    const email = process.env.PERSONAL_CAPITAL_EMAIL;
    const password = process.env.PERSONAL_CAPITAL_PASSWORD;

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
      const email = process.env.PERSONAL_CAPITAL_EMAIL;
      const password = process.env.PERSONAL_CAPITAL_PASSWORD;
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
