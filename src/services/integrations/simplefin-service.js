/**
 * SimpleFIN Bridge Integration for BACKBONE
 * Aggregates bank accounts for net worth tracking
 *
 * SimpleFIN Bridge: https://beta-bridge.simplefin.org/
 * Cost: $15/year
 * Supports 16,000+ financial institutions via MX
 *
 * Flow:
 * 1. User signs up at SimpleFIN Bridge
 * 2. User connects their bank accounts
 * 3. User generates an Access URL (setup token)
 * 4. We exchange the setup token for an access token
 * 5. We fetch account data periodically
 */

import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";
import { openUrl } from "../open-url.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const SIMPLEFIN_DATA_PATH = path.join(DATA_DIR, "simplefin.json");
const SIMPLEFIN_TOKEN_PATH = path.join(DATA_DIR, ".simplefin-token.json");
const SIMPLEFIN_SETUP_PATH = path.join(DATA_DIR, "simplefin-setup.txt");

const SIMPLEFIN_BRIDGE_URL = "https://beta-bridge.simplefin.org/";
const SIMPLEFIN_API_BASE = "https://beta-bridge.simplefin.org/simplefin";

// Cache duration (4 hours - SimpleFIN updates data a few times per day)
const CACHE_DURATION = 4 * 60 * 60 * 1000;

/**
 * Get default data structure
 */
const getDefaultData = () => ({
  accounts: [],
  netWorth: null,
  lastUpdated: null,
  organizations: []
});

/**
 * SimpleFIN Service Class
 */
export class SimpleFINService extends EventEmitter {
  constructor() {
    super();
    this.data = getDefaultData();
    this.accessToken = null;
    this.load();
  }

  /**
   * Load cached data and token from disk
   */
  load() {
    try {
      if (fs.existsSync(SIMPLEFIN_DATA_PATH)) {
        const data = JSON.parse(fs.readFileSync(SIMPLEFIN_DATA_PATH, "utf-8"));
        this.data = { ...getDefaultData(), ...data };
      }
      if (fs.existsSync(SIMPLEFIN_TOKEN_PATH)) {
        const tokenData = JSON.parse(fs.readFileSync(SIMPLEFIN_TOKEN_PATH, "utf-8"));
        this.accessToken = tokenData.accessToken;
      }
    } catch (error) {
      console.error("Failed to load SimpleFIN data:", error.message);
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
      fs.writeFileSync(SIMPLEFIN_DATA_PATH, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("Failed to save SimpleFIN data:", error.message);
    }
  }

  /**
   * Save access token
   */
  saveToken(token) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(SIMPLEFIN_TOKEN_PATH, JSON.stringify({
        accessToken: token,
        savedAt: new Date().toISOString()
      }));
      this.accessToken = token;
    } catch (error) {
      console.error("Failed to save SimpleFIN token:", error.message);
    }
  }

  /**
   * Check if SimpleFIN is configured
   */
  isConfigured() {
    return !!this.accessToken;
  }

  /**
   * Get configuration status
   */
  getConfig() {
    return {
      configured: this.isConfigured(),
      lastUpdated: this.data.lastUpdated,
      accountCount: this.data.accounts?.length || 0
    };
  }

  /**
   * Open SimpleFIN Bridge signup page
   */
  openSignupPage() {
    openUrl(SIMPLEFIN_BRIDGE_URL);
  }

  /**
   * Create setup file for token entry
   */
  createSetupFile() {
    const content = `SIMPLEFIN BRIDGE SETUP
======================

1. The SimpleFIN Bridge page should have opened in your browser
2. If not, go to: ${SIMPLEFIN_BRIDGE_URL}

FIRST TIME SETUP:
a) Click "Get Started" and create an account ($15/year)
b) Link your bank accounts through their interface
c) Once accounts are linked, go to your dashboard
d) Click "Create Access URL" or "Get Setup Token"
e) Copy the FULL URL and paste it below

RETURNING USER:
a) Log in to SimpleFIN Bridge
b) Go to your dashboard
c) Click "Create Access URL"
d) Copy the FULL URL and paste it below

PASTE YOUR SETUP URL HERE (replace the placeholder):

SIMPLEFIN_URL=paste_your_setup_url_here

Save this file (Ctrl+S) when done.

Note: The setup URL is a one-time use token. After claiming, we store
a permanent access token locally. Your credentials are never shared.
`;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SIMPLEFIN_SETUP_PATH, content);
    return SIMPLEFIN_SETUP_PATH;
  }

  /**
   * Open setup file in editor
   */
  openSetupInEditor() {
    const setupFile = SIMPLEFIN_SETUP_PATH;
    if (process.platform === "win32") {
      import("child_process").then(({ exec }) => {
        exec(`notepad "${setupFile}"`);
      });
    } else if (process.platform === "darwin") {
      import("child_process").then(({ exec }) => {
        exec(`open -e "${setupFile}"`);
      });
    } else {
      import("child_process").then(({ exec }) => {
        exec(`xdg-open "${setupFile}"`);
      });
    }
  }

  /**
   * Read setup URL from setup file
   */
  readSetupFile() {
    try {
      if (fs.existsSync(SIMPLEFIN_SETUP_PATH)) {
        const content = fs.readFileSync(SIMPLEFIN_SETUP_PATH, "utf-8");
        const match = content.match(/SIMPLEFIN_URL=([^\s\n]+)/);
        if (match && match[1] && !match[1].includes("paste_your")) {
          return match[1].trim();
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Watch setup file for changes
   */
  watchSetupFile(callback) {
    if (!fs.existsSync(SIMPLEFIN_SETUP_PATH)) {
      this.createSetupFile();
    }

    const watcher = fs.watch(SIMPLEFIN_SETUP_PATH, (eventType) => {
      if (eventType === "change") {
        const url = this.readSetupFile();
        if (url) {
          callback(url);
        }
      }
    });

    return watcher;
  }

  /**
   * Cleanup setup file
   */
  cleanupSetupFile() {
    try {
      if (fs.existsSync(SIMPLEFIN_SETUP_PATH)) {
        fs.unlinkSync(SIMPLEFIN_SETUP_PATH);
      }
    } catch (e) {}
  }

  /**
   * Claim the setup token and get access token
   * The setup URL is a one-time claim URL
   *
   * Setup URL format: https://beta-bridge.simplefin.org/simplefin/claim/TOKEN
   * Returns: Access URL with embedded credentials
   */
  async claimSetupToken(setupUrl) {
    try {
      // POST to the setup URL to claim it
      const response = await fetch(setupUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          return { success: false, error: "Setup token already claimed or expired. Generate a new one." };
        }
        return { success: false, error: `Failed to claim token: ${response.status}` };
      }

      // Response is the access URL with credentials
      const accessUrl = await response.text();

      if (!accessUrl || !accessUrl.includes("@")) {
        return { success: false, error: "Invalid access URL received" };
      }

      // Store the access URL as token
      this.saveToken(accessUrl.trim());
      this.cleanupSetupFile();

      return { success: true, accessUrl: accessUrl.trim() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate access token by fetching accounts
   */
  async validateToken() {
    if (!this.accessToken) {
      return { valid: false, error: "No access token configured" };
    }

    try {
      const result = await this.fetchAccounts();
      if (result.success) {
        return { valid: true, accounts: result.accounts };
      }
      return { valid: false, error: result.error || "Failed to fetch accounts" };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Make authenticated request to SimpleFIN API
   * The access URL contains embedded credentials in format:
   * https://user:pass@beta-bridge.simplefin.org/simplefin/accounts
   */
  async apiRequest(endpoint) {
    if (!this.accessToken) {
      throw new Error("Not configured");
    }

    // Access token is a full URL with embedded credentials
    // Format: https://user:pass@host/simplefin
    // We need to append the endpoint to it
    let url = this.accessToken;

    // Ensure URL ends with /simplefin and append endpoint
    if (!url.endsWith("/simplefin")) {
      // Extract base and add /simplefin
      const urlObj = new URL(url);
      url = `${urlObj.protocol}//${urlObj.username}:${urlObj.password}@${urlObj.host}/simplefin`;
    }

    url = `${url}/${endpoint}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Access token expired or invalid");
      }
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Fetch all accounts
   */
  async fetchAccounts() {
    try {
      const data = await this.apiRequest("accounts");

      // SimpleFIN returns { accounts: [...], errors: [...] }
      const accounts = (data.accounts || []).map(acc => ({
        id: acc.id,
        name: acc.name,
        organization: acc.org?.name || "Unknown",
        orgId: acc.org?.id,
        balance: acc.balance,
        balanceDate: acc.balance_date,
        currency: acc.currency || "USD",
        availableBalance: acc.available_balance,
        type: this.inferAccountType(acc)
      }));

      // Calculate net worth
      const assets = accounts.filter(a => a.balance >= 0).reduce((sum, a) => sum + a.balance, 0);
      const liabilities = accounts.filter(a => a.balance < 0).reduce((sum, a) => sum + Math.abs(a.balance), 0);

      this.data.accounts = accounts;
      this.data.organizations = [...new Set(accounts.map(a => a.organization))];
      this.data.netWorth = {
        total: assets - liabilities,
        assets,
        liabilities,
        date: new Date().toISOString()
      };
      this.data.lastUpdated = new Date().toISOString();

      this.save();
      this.emit("accounts-updated", accounts);
      this.emit("networth-updated", this.data.netWorth);

      return {
        success: true,
        accounts,
        netWorth: this.data.netWorth,
        errors: data.errors || []
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Infer account type from account data
   */
  inferAccountType(acc) {
    const name = (acc.name || "").toLowerCase();
    const balance = acc.balance || 0;

    if (balance < 0) return "credit";
    if (name.includes("checking")) return "checking";
    if (name.includes("saving")) return "savings";
    if (name.includes("401k") || name.includes("ira") || name.includes("retirement")) return "retirement";
    if (name.includes("brokerage") || name.includes("investment")) return "investment";
    if (name.includes("credit")) return "credit";
    if (name.includes("loan") || name.includes("mortgage")) return "loan";
    return "other";
  }

  /**
   * Check if data is stale
   */
  isStale() {
    if (!this.data.lastUpdated) return true;
    const age = Date.now() - new Date(this.data.lastUpdated).getTime();
    return age > CACHE_DURATION;
  }

  /**
   * Sync data (fetch and save)
   */
  async sync() {
    if (!this.isConfigured()) {
      return { success: false, error: "Not configured" };
    }

    return this.fetchAccounts();
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const byType = {};
    for (const acc of this.data.accounts || []) {
      const type = acc.type || "other";
      if (!byType[type]) {
        byType[type] = { count: 0, balance: 0 };
      }
      byType[type].count++;
      byType[type].balance += acc.balance || 0;
    }

    return {
      connected: this.isConfigured() && this.data.accounts.length > 0,
      netWorth: this.data.netWorth,
      accountCount: this.data.accounts?.length || 0,
      accountsByType: byType,
      organizations: this.data.organizations || [],
      accounts: this.data.accounts || [],
      lastUpdated: this.data.lastUpdated,
      isStale: this.isStale()
    };
  }

  /**
   * Get net worth data for life scores integration
   */
  getNetWorthData() {
    return {
      total: this.data.netWorth?.total || 0,
      assets: this.data.netWorth?.assets || 0,
      liabilities: this.data.netWorth?.liabilities || 0,
      accounts: this.data.accounts?.length || 0,
      lastUpdated: this.data.lastUpdated
    };
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  }

  /**
   * Reset all data
   */
  reset() {
    this.data = getDefaultData();
    this.accessToken = null;
    this.save();

    try {
      if (fs.existsSync(SIMPLEFIN_TOKEN_PATH)) {
        fs.unlinkSync(SIMPLEFIN_TOKEN_PATH);
      }
    } catch (e) {}

    this.cleanupSetupFile();
    this.emit("reset");
  }
}

// Singleton instance
let serviceInstance = null;

export const getSimpleFINService = () => {
  if (!serviceInstance) {
    serviceInstance = new SimpleFINService();
  }
  return serviceInstance;
};

// Export helper functions
export const isSimpleFINConfigured = () => getSimpleFINService().isConfigured();
export const syncSimpleFINData = async () => getSimpleFINService().sync();
export const getNetWorthData = () => getSimpleFINService().getNetWorthData();

export default SimpleFINService;
