import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";

/**
 * Personal Capital (Empower) Integration for BACKBONE
 * Uses unofficial API via personal-capital-sdk
 *
 * Note: Personal Capital doesn't have an official public API.
 * This uses reverse-engineered endpoints that may change.
 *
 * Setup:
 * 1. Add PERSONAL_CAPITAL_EMAIL and PERSONAL_CAPITAL_PASSWORD to .env
 * 2. Run /finances setup to authenticate
 * 3. Complete 2FA via SMS when prompted
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
      authenticated: this.authenticated || this.data.authenticated,
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
      throw new Error("Personal Capital credentials not configured");
    }

    try {
      // Dynamic import since package may not be installed
      const { PersonalCapital } = await import("personal-capital-sdk");

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
      // Try to restore session from cookies
      const sessionValid = await this.client.isSessionValid();
      if (sessionValid) {
        this.authenticated = true;
        this.data.authenticated = true;
        this.save();
        return { success: true, message: "Session restored from cookies" };
      }

      // Start authentication
      const authResult = await this.client.login(email, password);

      if (authResult.needsTwoFactor) {
        // 2FA required - will need user to provide code
        return {
          success: false,
          needsTwoFactor: true,
          message: "Two-factor authentication required. Check your SMS."
        };
      }

      this.authenticated = true;
      this.data.authenticated = true;
      this.save();

      return { success: true, message: "Authenticated successfully" };
    } catch (error) {
      return { success: false, message: error.message };
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
      await this.client.twoFactor(code);
      this.authenticated = true;
      this.data.authenticated = true;
      this.save();
      return { success: true, message: "Two-factor authentication complete" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Fetch all account data
   */
  async fetchAccounts() {
    if (!this.authenticated && !this.data.authenticated) {
      const authResult = await this.authenticate();
      if (!authResult.success) {
        return authResult;
      }
    }

    try {
      const accounts = await this.client.getAccounts();

      this.data.accounts = accounts.map(acc => ({
        id: acc.accountId,
        name: acc.name || acc.accountName,
        type: acc.accountType,
        balance: acc.balance,
        institution: acc.firmName,
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
    if (!this.authenticated && !this.data.authenticated) {
      const authResult = await this.authenticate();
      if (!authResult.success) return authResult;
    }

    try {
      const holdings = await this.client.getHoldings();

      this.data.holdings = holdings.map(h => ({
        ticker: h.ticker,
        name: h.description,
        quantity: h.quantity,
        value: h.value,
        costBasis: h.costBasis,
        gain: h.gain,
        gainPercent: h.gainPercent,
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
   * Fetch net worth data
   */
  async fetchNetWorth() {
    if (!this.authenticated && !this.data.authenticated) {
      const authResult = await this.authenticate();
      if (!authResult.success) return authResult;
    }

    try {
      const netWorthData = await this.client.getNetWorth();

      // Current net worth
      this.data.netWorth = {
        total: netWorthData.netWorth,
        assets: netWorthData.assets,
        liabilities: netWorthData.liabilities,
        date: new Date().toISOString()
      };

      // Historical data if available
      if (netWorthData.history) {
        this.data.netWorthHistory = netWorthData.history.map(h => ({
          date: h.date,
          netWorth: h.netWorth,
          assets: h.assets,
          liabilities: h.liabilities
        }));
      }

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

    try {
      results.accounts = await this.fetchAccounts();
      if (!results.accounts.success) {
        results.errors.push(results.accounts.message);
      }
    } catch (e) {
      results.errors.push(`Accounts: ${e.message}`);
    }

    try {
      results.holdings = await this.fetchHoldings();
      if (!results.holdings.success) {
        results.errors.push(results.holdings.message);
      }
    } catch (e) {
      results.errors.push(`Holdings: ${e.message}`);
    }

    try {
      results.netWorth = await this.fetchNetWorth();
      if (!results.netWorth.success) {
        results.errors.push(results.netWorth.message);
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
      if (!byType[acc.type]) {
        byType[acc.type] = { count: 0, balance: 0 };
      }
      byType[acc.type].count++;
      byType[acc.type].balance += acc.balance || 0;
    }

    // Top holdings
    const topHoldings = [...(this.data.holdings || [])]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .slice(0, 5);

    return {
      connected: this.data.authenticated && this.data.accounts.length > 0,
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
