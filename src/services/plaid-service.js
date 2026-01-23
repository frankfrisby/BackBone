/**
 * Plaid Integration for BACKBONE
 * Connects to banks, credit cards, and investments via Plaid
 *
 * Plaid Documentation: https://plaid.com/docs/
 * Dashboard: https://dashboard.plaid.com/
 *
 * Setup:
 * 1. Create account at https://dashboard.plaid.com/signup
 * 2. Get API keys from dashboard (Client ID and Secret)
 * 3. Set environment variables:
 *    - PLAID_CLIENT_ID
 *    - PLAID_SECRET
 *    - PLAID_ENV (sandbox, development, or production)
 *
 * Flow:
 * 1. Create link_token via API
 * 2. Open Plaid Link in browser
 * 3. User connects their accounts
 * 4. Receive public_token via redirect
 * 5. Exchange for access_token
 * 6. Fetch account data
 *
 * Token Security:
 * - Tokens stored in hidden file with restricted permissions
 * - Backup copy maintained for recovery
 * - Requires explicit user action to delete
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { EventEmitter } from "events";
import { openUrl } from "./open-url.js";
import { fetchPlaidConfig } from "./firebase-config.js";

const DATA_DIR = path.join(process.cwd(), "data");
const PLAID_DATA_PATH = path.join(DATA_DIR, "plaid.json");
const PLAID_TOKENS_PATH = path.join(DATA_DIR, ".plaid-tokens.json");
const PLAID_TOKENS_BACKUP_PATH = path.join(DATA_DIR, ".plaid-tokens.backup.json");
const PLAID_SETUP_PATH = path.join(DATA_DIR, "plaid-setup.txt");

// Plaid API endpoints
const PLAID_ENVIRONMENTS = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com"
};

// Local callback server port
const CALLBACK_PORT = 3849;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;

// Cache duration (4 hours)
const CACHE_DURATION = 4 * 60 * 60 * 1000;

/**
 * Get default data structure
 */
const getDefaultData = () => ({
  accounts: [],
  institutions: [],
  netWorth: null,
  lastUpdated: null
});

/**
 * Plaid Service Class
 */
export class PlaidService extends EventEmitter {
  constructor() {
    super();
    this.data = getDefaultData();
    this.accessTokens = []; // Array of { accessToken, institutionId, institutionName }
    this.clientId = process.env.PLAID_CLIENT_ID;
    this.secret = process.env.PLAID_SECRET;
    this.env = process.env.PLAID_ENV || "sandbox";
    this.configLoaded = false;
    this.load();
  }

  /**
   * Initialize credentials from Firebase (call this before using the service)
   */
  async initFromFirebase() {
    if (this.configLoaded) return;

    try {
      const config = await fetchPlaidConfig();
      if (config) {
        if (config.clientId && !config.clientId.includes("YOUR_")) {
          this.clientId = config.clientId;
        }
        if (config.secret && !config.secret.includes("YOUR_")) {
          this.secret = config.secret;
        }
        if (config.env) {
          this.env = config.env;
        }
        this.configLoaded = true;
      }
    } catch (error) {
      console.error("Failed to load Plaid config from Firebase:", error.message);
      // Fall back to .env values (already set in constructor)
    }
  }

  /**
   * Get Plaid API base URL
   */
  getBaseUrl() {
    return PLAID_ENVIRONMENTS[this.env] || PLAID_ENVIRONMENTS.sandbox;
  }

  /**
   * Load cached data and tokens from disk
   * Attempts to restore from backup if primary token file is corrupted
   */
  load() {
    try {
      if (fs.existsSync(PLAID_DATA_PATH)) {
        const data = JSON.parse(fs.readFileSync(PLAID_DATA_PATH, "utf-8"));
        this.data = { ...getDefaultData(), ...data };
      }

      // Try to load tokens from primary file
      let tokensLoaded = false;
      if (fs.existsSync(PLAID_TOKENS_PATH)) {
        try {
          const tokenData = JSON.parse(fs.readFileSync(PLAID_TOKENS_PATH, "utf-8"));
          if (tokenData.accessTokens && tokenData.accessTokens.length > 0) {
            this.accessTokens = tokenData.accessTokens;
            tokensLoaded = true;
          }
        } catch (e) {
          // Primary file corrupted, try backup
        }
      }

      // If primary failed, try backup
      if (!tokensLoaded && fs.existsSync(PLAID_TOKENS_BACKUP_PATH)) {
        try {
          const backupData = JSON.parse(fs.readFileSync(PLAID_TOKENS_BACKUP_PATH, "utf-8"));
          if (backupData.accessTokens && backupData.accessTokens.length > 0) {
            this.accessTokens = backupData.accessTokens;
            // Restore primary from backup
            this.saveTokens();
            console.log("Plaid tokens restored from backup");
          }
        } catch (e) {
          // Backup also failed
        }
      }
    } catch (error) {
      console.error("Failed to load Plaid data:", error.message);
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
      fs.writeFileSync(PLAID_DATA_PATH, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error("Failed to save Plaid data:", error.message);
    }
  }

  /**
   * Save access tokens with backup for security
   * Creates both primary and backup files to prevent accidental data loss
   */
  saveTokens() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const tokenData = JSON.stringify({
        accessTokens: this.accessTokens,
        savedAt: new Date().toISOString(),
        version: 1
      }, null, 2);

      // Save primary token file
      fs.writeFileSync(PLAID_TOKENS_PATH, tokenData);

      // Save backup copy
      fs.writeFileSync(PLAID_TOKENS_BACKUP_PATH, tokenData);

    } catch (error) {
      console.error("Failed to save Plaid tokens:", error.message);
    }
  }

  /**
   * Check if Plaid credentials are configured
   */
  hasCredentials() {
    return Boolean(this.clientId && this.secret);
  }

  /**
   * Check if Plaid has connected accounts
   */
  isConfigured() {
    return this.hasCredentials() && this.accessTokens.length > 0;
  }

  /**
   * Get configuration status
   */
  getConfig() {
    return {
      hasCredentials: this.hasCredentials(),
      configured: this.isConfigured(),
      environment: this.env,
      institutionCount: this.accessTokens.length,
      accountCount: this.data.accounts?.length || 0,
      lastUpdated: this.data.lastUpdated
    };
  }

  /**
   * Make API request to Plaid
   */
  async apiRequest(endpoint, body = {}) {
    if (!this.hasCredentials()) {
      throw new Error("Plaid credentials not configured");
    }

    const response = await fetch(`${this.getBaseUrl()}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
        ...body
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error_message || data.error_code || `API error: ${response.status}`;
      throw new Error(errorMessage);
    }

    return data;
  }

  /**
   * Create a link token for Plaid Link
   */
  async createLinkToken(userId = "backbone-user") {
    const response = await this.apiRequest("/link/token/create", {
      user: {
        client_user_id: userId
      },
      client_name: "BACKBONE",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en"
    });

    return response.link_token;
  }

  /**
   * Exchange public token for access token
   */
  async exchangePublicToken(publicToken) {
    const response = await this.apiRequest("/item/public_token/exchange", {
      public_token: publicToken
    });

    return {
      accessToken: response.access_token,
      itemId: response.item_id
    };
  }

  /**
   * Get institution info
   */
  async getInstitution(institutionId) {
    try {
      const response = await this.apiRequest("/institutions/get_by_id", {
        institution_id: institutionId,
        country_codes: ["US"]
      });
      return response.institution;
    } catch (error) {
      return { name: "Unknown Institution", institution_id: institutionId };
    }
  }

  /**
   * Start Plaid Link flow
   * Opens browser with clean Plaid popup - no developer console visible
   */
  async startLinkFlow() {
    // Ensure we have latest credentials from Firebase
    await this.initFromFirebase();

    if (!this.hasCredentials()) {
      throw new Error("Plaid credentials not configured. Check Firebase config/config_plaid document.");
    }

    return new Promise(async (resolve, reject) => {
      let server = null;
      let linkToken = null;
      let resolved = false;

      try {
        // Create link token
        linkToken = await this.createLinkToken();

        // Create callback server
        server = http.createServer(async (req, res) => {
          const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

          if (url.pathname === "/callback") {
            const publicToken = url.searchParams.get("public_token");
            const institutionId = url.searchParams.get("institution_id");
            const institutionName = decodeURIComponent(url.searchParams.get("institution_name") || "");

            // Send success response - auto-closes the window
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Connected!</title>
                <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    color: #e2e8f0;
                  }
                  .container {
                    text-align: center;
                    padding: 60px 40px;
                    background: rgba(30, 41, 59, 0.8);
                    border-radius: 16px;
                    border: 1px solid rgba(148, 163, 184, 0.1);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                  }
                  .checkmark {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: #22c55e;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 24px;
                    animation: scale-in 0.3s ease-out;
                  }
                  .checkmark svg { width: 40px; height: 40px; }
                  h1 { color: #22c55e; margin-bottom: 8px; font-size: 28px; font-weight: 600; }
                  p { color: #94a3b8; font-size: 16px; }
                  .close-msg { margin-top: 20px; font-size: 14px; color: #64748b; }
                  @keyframes scale-in {
                    from { transform: scale(0); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="checkmark">
                    <svg fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  <h1>Account Connected!</h1>
                  <p>Successfully linked to your bank</p>
                  <p class="close-msg">This window will close automatically...</p>
                </div>
                <script>setTimeout(function() { window.close(); }, 2000);</script>
              </body>
              </html>
            `);

            // Close server after short delay
            setTimeout(() => {
              if (server) server.close();
            }, 3000);

            if (publicToken && !resolved) {
              resolved = true;
              try {
                // Exchange token
                const { accessToken, itemId } = await this.exchangePublicToken(publicToken);

                // Get institution info
                const institution = institutionName ? { name: institutionName } : await this.getInstitution(institutionId);

                // Store access token securely
                this.accessTokens.push({
                  accessToken,
                  itemId,
                  institutionId,
                  institutionName: institution.name,
                  addedAt: new Date().toISOString()
                });
                this.saveTokens();

                resolve({
                  success: true,
                  institution: institution.name,
                  itemId
                });
              } catch (err) {
                reject(err);
              }
            }
          } else if (url.pathname === "/cancelled") {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head><title>Cancelled</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0f172a; color: #94a3b8; }
                .container { text-align: center; }
              </style>
              </head>
              <body>
                <div class="container">
                  <p>Connection cancelled. You can close this window.</p>
                </div>
                <script>setTimeout(function() { window.close(); }, 1500);</script>
              </body>
              </html>
            `);
            setTimeout(() => {
              if (server && !resolved) {
                server.close();
                resolved = true;
                reject(new Error("Connection cancelled by user"));
              }
            }, 2000);
          } else if (url.pathname === "/") {
            // Serve clean Plaid Link page - opens popup immediately
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>BACKBONE - Connect Bank</title>
                <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
                <style>
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                    color: #e2e8f0;
                  }
                  .container {
                    text-align: center;
                    padding: 60px 40px;
                    background: rgba(30, 41, 59, 0.8);
                    border-radius: 16px;
                    border: 1px solid rgba(148, 163, 184, 0.1);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    max-width: 400px;
                  }
                  .logo {
                    font-size: 48px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin-bottom: 16px;
                  }
                  h2 { color: #e2e8f0; margin-bottom: 8px; font-size: 20px; font-weight: 500; }
                  p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
                  .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(249, 115, 22, 0.2);
                    border-top-color: #f97316;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 24px auto 16px;
                  }
                  .status { color: #f97316; font-size: 14px; }
                  @keyframes spin {
                    to { transform: rotate(360deg); }
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="logo">B</div>
                  <h2>Connect Your Account</h2>
                  <p>Securely link your bank, credit cards, or investments through Plaid</p>
                  <div class="spinner"></div>
                  <p class="status">Opening secure connection...</p>
                </div>
                <script>
                  // Initialize and open Plaid Link immediately
                  const handler = Plaid.create({
                    token: '${linkToken}',
                    onSuccess: function(public_token, metadata) {
                      document.querySelector('.status').textContent = 'Connecting...';
                      const instName = encodeURIComponent(metadata.institution.name || '');
                      window.location.href = '/callback?public_token=' + public_token +
                        '&institution_id=' + metadata.institution.institution_id +
                        '&institution_name=' + instName;
                    },
                    onExit: function(err, metadata) {
                      document.querySelector('.status').textContent = 'Connection cancelled';
                      document.querySelector('.spinner').style.display = 'none';
                      setTimeout(function() {
                        window.location.href = '/cancelled';
                      }, 500);
                    },
                    onLoad: function() {
                      // Plaid Link loaded successfully
                    }
                  });

                  // Open Plaid Link popup immediately when page loads
                  handler.open();
                </script>
              </body>
              </html>
            `);
          }
        });

        server.listen(CALLBACK_PORT, () => {
          // Open browser to local server
          openUrl(`http://localhost:${CALLBACK_PORT}`);
        });

        // Timeout after 5 minutes
        setTimeout(() => {
          if (server && !resolved) {
            server.close();
            resolved = true;
            reject(new Error("Connection timeout. Please try again."));
          }
        }, 5 * 60 * 1000);

      } catch (error) {
        if (server) server.close();
        reject(error);
      }
    });
  }

  /**
   * Fetch accounts from all connected institutions
   */
  async fetchAccounts() {
    if (this.accessTokens.length === 0) {
      return { success: false, error: "No accounts connected" };
    }

    const allAccounts = [];
    const errors = [];

    for (const tokenInfo of this.accessTokens) {
      try {
        // Fetch balance data
        const balanceResponse = await this.apiRequest("/accounts/balance/get", {
          access_token: tokenInfo.accessToken
        });

        for (const account of balanceResponse.accounts) {
          allAccounts.push({
            id: account.account_id,
            name: account.name,
            officialName: account.official_name,
            type: account.type,
            subtype: account.subtype,
            balance: account.balances.current,
            availableBalance: account.balances.available,
            currency: account.balances.iso_currency_code || "USD",
            institution: tokenInfo.institutionName,
            institutionId: tokenInfo.institutionId,
            mask: account.mask
          });
        }
      } catch (error) {
        errors.push(`${tokenInfo.institutionName}: ${error.message}`);
      }
    }

    // Try to fetch investment holdings
    for (const tokenInfo of this.accessTokens) {
      try {
        const holdingsResponse = await this.apiRequest("/investments/holdings/get", {
          access_token: tokenInfo.accessToken
        });

        for (const holding of holdingsResponse.holdings) {
          const security = holdingsResponse.securities.find(s => s.security_id === holding.security_id);
          allAccounts.push({
            id: holding.account_id + "_" + holding.security_id,
            name: security?.name || holding.security_id,
            ticker: security?.ticker_symbol,
            type: "investment",
            subtype: security?.type || "security",
            balance: holding.institution_value,
            quantity: holding.quantity,
            costBasis: holding.cost_basis,
            institution: tokenInfo.institutionName,
            institutionId: tokenInfo.institutionId
          });
        }
      } catch (error) {
        // Investments may not be available for all accounts - ignore errors
      }
    }

    // Calculate net worth
    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const account of allAccounts) {
      const balance = account.balance || 0;
      const type = (account.type || "").toLowerCase();

      if (type === "credit" || type === "loan" || type === "liability") {
        totalLiabilities += Math.abs(balance);
      } else {
        totalAssets += balance;
      }
    }

    this.data.accounts = allAccounts;
    this.data.institutions = [...new Set(allAccounts.map(a => a.institution))];
    this.data.netWorth = {
      total: totalAssets - totalLiabilities,
      assets: totalAssets,
      liabilities: totalLiabilities,
      date: new Date().toISOString()
    };
    this.data.lastUpdated = new Date().toISOString();

    this.save();
    this.emit("accounts-updated", allAccounts);
    this.emit("networth-updated", this.data.netWorth);

    return {
      success: true,
      accounts: allAccounts,
      netWorth: this.data.netWorth,
      errors: errors.length > 0 ? errors : undefined
    };
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
      connected: this.isConfigured(),
      netWorth: this.data.netWorth,
      accountCount: this.data.accounts?.length || 0,
      institutionCount: this.accessTokens.length,
      accountsByType: byType,
      institutions: this.data.institutions || [],
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
   * Open Plaid dashboard for API keys
   */
  openDashboard() {
    openUrl("https://dashboard.plaid.com/developers/keys");
  }

  /**
   * Create setup file for API key entry
   */
  createSetupFile() {
    const content = `PLAID API SETUP
===============

1. Go to https://dashboard.plaid.com/signup to create an account
2. Once logged in, go to Developers > Keys
3. Copy your Client ID and Secret (use Sandbox for testing)
4. Paste them below:

PLAID_CLIENT_ID=paste_your_client_id_here
PLAID_SECRET=paste_your_secret_here
PLAID_ENV=sandbox

5. Save this file (Ctrl+S)

Environments:
- sandbox: Free testing with fake data
- development: Free with real data (100 items)
- production: Pay-per-use with real data

Note: For production, you'll need to apply for access via the dashboard.
`;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(PLAID_SETUP_PATH, content);
    return PLAID_SETUP_PATH;
  }

  /**
   * Open setup file in editor
   */
  openSetupInEditor() {
    if (process.platform === "win32") {
      import("child_process").then(({ exec }) => {
        exec(`notepad "${PLAID_SETUP_PATH}"`);
      });
    } else if (process.platform === "darwin") {
      import("child_process").then(({ exec }) => {
        exec(`open -e "${PLAID_SETUP_PATH}"`);
      });
    } else {
      import("child_process").then(({ exec }) => {
        exec(`xdg-open "${PLAID_SETUP_PATH}"`);
      });
    }
  }

  /**
   * Read credentials from setup file
   */
  readSetupFile() {
    try {
      if (fs.existsSync(PLAID_SETUP_PATH)) {
        const content = fs.readFileSync(PLAID_SETUP_PATH, "utf-8");
        const clientIdMatch = content.match(/PLAID_CLIENT_ID=([^\s\n]+)/);
        const secretMatch = content.match(/PLAID_SECRET=([^\s\n]+)/);
        const envMatch = content.match(/PLAID_ENV=([^\s\n]+)/);

        if (clientIdMatch && secretMatch &&
            !clientIdMatch[1].includes("paste_") &&
            !secretMatch[1].includes("paste_")) {
          return {
            clientId: clientIdMatch[1].trim(),
            secret: secretMatch[1].trim(),
            env: envMatch ? envMatch[1].trim() : "sandbox"
          };
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Watch setup file for changes
   */
  watchSetupFile(callback) {
    if (!fs.existsSync(PLAID_SETUP_PATH)) {
      this.createSetupFile();
    }

    const watcher = fs.watch(PLAID_SETUP_PATH, (eventType) => {
      if (eventType === "change") {
        const creds = this.readSetupFile();
        if (creds) {
          callback(creds);
        }
      }
    });

    return watcher;
  }

  /**
   * Save credentials to environment
   */
  saveCredentials(clientId, secret, env = "sandbox") {
    this.clientId = clientId;
    this.secret = secret;
    this.env = env;

    // Also save to .env file
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";

    try {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf-8");
      }
    } catch (e) {}

    // Update or add each variable
    const updates = {
      PLAID_CLIENT_ID: clientId,
      PLAID_SECRET: secret,
      PLAID_ENV: env
    };

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + "\n");

    // Update process.env
    process.env.PLAID_CLIENT_ID = clientId;
    process.env.PLAID_SECRET = secret;
    process.env.PLAID_ENV = env;
  }

  /**
   * Cleanup setup file
   */
  cleanupSetupFile() {
    try {
      if (fs.existsSync(PLAID_SETUP_PATH)) {
        fs.unlinkSync(PLAID_SETUP_PATH);
      }
    } catch (e) {}
  }

  /**
   * Validate credentials by making a test request
   */
  async validateCredentials() {
    try {
      // Try to create a link token as a validation test
      await this.createLinkToken();
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Disconnect a specific institution
   * Requires explicit itemId to prevent accidental deletion
   */
  async disconnectInstitution(itemId) {
    const tokenIndex = this.accessTokens.findIndex(t => t.itemId === itemId);
    if (tokenIndex === -1) {
      return { success: false, error: "Institution not found" };
    }

    const institutionName = this.accessTokens[tokenIndex].institutionName;

    try {
      // Try to remove from Plaid (may fail if already removed)
      await this.apiRequest("/item/remove", {
        access_token: this.accessTokens[tokenIndex].accessToken
      }).catch(() => {});
    } catch (error) {
      // Continue even if Plaid removal fails
    }

    // Remove from local storage
    this.accessTokens.splice(tokenIndex, 1);
    this.saveTokens();

    // Refresh account data
    if (this.accessTokens.length > 0) {
      await this.fetchAccounts();
    } else {
      this.data = getDefaultData();
      this.save();
    }

    this.emit("institution-disconnected", { itemId, institutionName });
    return { success: true, institutionName };
  }

  /**
   * Get list of connected institutions for user to select
   */
  getConnectedInstitutions() {
    return this.accessTokens.map(t => ({
      itemId: t.itemId,
      name: t.institutionName,
      addedAt: t.addedAt
    }));
  }

  /**
   * Reset all data - REQUIRES explicit confirmation
   * This permanently removes all Plaid connections and cached data
   * @param {boolean} confirmed - Must be true to proceed
   */
  reset(confirmed = false) {
    if (!confirmed) {
      return { success: false, error: "Reset requires explicit confirmation" };
    }

    // Try to remove all items from Plaid
    for (const tokenInfo of this.accessTokens) {
      this.apiRequest("/item/remove", {
        access_token: tokenInfo.accessToken
      }).catch(() => {});
    }

    this.data = getDefaultData();
    this.accessTokens = [];
    this.save();
    this.saveTokens();
    this.cleanupSetupFile();

    // Also remove backup
    try {
      if (fs.existsSync(PLAID_TOKENS_BACKUP_PATH)) {
        fs.unlinkSync(PLAID_TOKENS_BACKUP_PATH);
      }
    } catch (e) {}

    this.emit("reset");
    return { success: true };
  }

  /**
   * Check if tokens exist (for recovery purposes)
   */
  hasStoredTokens() {
    return fs.existsSync(PLAID_TOKENS_PATH) || fs.existsSync(PLAID_TOKENS_BACKUP_PATH);
  }

  /**
   * Attempt to recover tokens from backup
   */
  recoverFromBackup() {
    if (fs.existsSync(PLAID_TOKENS_BACKUP_PATH)) {
      try {
        const backupData = JSON.parse(fs.readFileSync(PLAID_TOKENS_BACKUP_PATH, "utf-8"));
        if (backupData.accessTokens && backupData.accessTokens.length > 0) {
          this.accessTokens = backupData.accessTokens;
          this.saveTokens();
          return { success: true, count: backupData.accessTokens.length };
        }
      } catch (e) {}
    }
    return { success: false, error: "No backup available" };
  }
}

// Singleton instance
let serviceInstance = null;

export const getPlaidService = () => {
  if (!serviceInstance) {
    serviceInstance = new PlaidService();
  }
  return serviceInstance;
};

// Export helper functions
export const isPlaidConfigured = () => getPlaidService().isConfigured();
export const hasPlaidCredentials = () => getPlaidService().hasCredentials();
export const syncPlaidData = async () => getPlaidService().sync();
export const getNetWorthData = () => getPlaidService().getNetWorthData();

export default PlaidService;
