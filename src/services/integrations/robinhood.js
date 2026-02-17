import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "events";
import { getDataDir } from "../paths.js";

/**
 * Robinhood Integration for BACKBONE (READ-ONLY)
 *
 * Uses Robinhood's unofficial REST API for read-only data extraction.
 * No trades or actions — only pulls positions, balances, and holdings.
 *
 * IMPORTANT: This uses an unofficial, reverse-engineered API.
 * Robinhood does not officially support stocks API access.
 *
 * Authentication Flow:
 * 1. Call login(username, password)
 * 2. If MFA required, user provides TOTP code
 * 3. Call login(username, password, mfaCode) with the code
 * 4. Token cached locally for subsequent requests
 *
 * SETUP:
 * 1. Store credentials locally: ~/.backbone/users/<uid>/data/robinhood-config.json
 *    Fields: { "username": "...", "password": "..." }
 * 2. Or set env vars: ROBINHOOD_USERNAME, ROBINHOOD_PASSWORD
 * 3. MFA: Use authenticator app (TOTP) — SMS is unreliable for automation
 */

const DATA_DIR = getDataDir();
const RH_DATA_PATH = path.join(DATA_DIR, "robinhood.json");
const RH_TOKEN_PATH = path.join(DATA_DIR, ".robinhood-token.json");

const BASE_URL = "https://api.robinhood.com";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const getDefaultData = () => ({
  accounts: [],
  positions: [],
  portfolios: [],
  totalEquity: null,
  lastUpdated: null,
  authenticated: false
});

export class RobinhoodService extends EventEmitter {
  constructor() {
    super();
    this.data = getDefaultData();
    this.token = null;
    this.accountNumber = null;
    this.authenticated = false;
    this.pendingMfa = false;
    this.load();
    this.loadToken();
  }

  load() {
    try {
      if (fs.existsSync(RH_DATA_PATH)) {
        this.data = { ...getDefaultData(), ...JSON.parse(fs.readFileSync(RH_DATA_PATH, "utf-8")) };
      }
    } catch (err) {
      console.error("[Robinhood] Failed to load data:", err.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(RH_DATA_PATH, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error("[Robinhood] Failed to save data:", err.message);
    }
  }

  loadToken() {
    try {
      if (fs.existsSync(RH_TOKEN_PATH)) {
        const tokenData = JSON.parse(fs.readFileSync(RH_TOKEN_PATH, "utf-8"));
        if (tokenData.token && tokenData.expiresAt && Date.now() < tokenData.expiresAt) {
          this.token = tokenData.token;
          this.authenticated = true;
        }
      }
    } catch {}
  }

  saveToken(token, expiresInSeconds = 86400) {
    try {
      const tokenData = { token, expiresAt: Date.now() + (expiresInSeconds * 1000), savedAt: new Date().toISOString() };
      fs.writeFileSync(RH_TOKEN_PATH, JSON.stringify(tokenData, null, 2));
    } catch {}
  }

  /**
   * Make an authenticated request to Robinhood API
   */
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0",
      ...options.headers
    };

    if (this.token) {
      headers["Authorization"] = `Token ${this.token}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Robinhood API ${response.status}: ${text.slice(0, 200)}`);
    }

    return response.json();
  }

  /**
   * Authenticate with Robinhood
   * @param {string} username - Email address
   * @param {string} password - Password
   * @param {string} [mfaCode] - TOTP MFA code (if required)
   * @returns {{ success, needsMfa, message }}
   */
  async login(username, password, mfaCode = null) {
    try {
      const body = {
        username,
        password,
        grant_type: "password",
        client_id: "c82SH0WZOsabOXGP2sxqcj34FxkvfnWRZBKlBjFS",
        scope: "internal",
        device_token: this.getDeviceToken()
      };

      if (mfaCode) {
        body.mfa_code = mfaCode;
      }

      const response = await fetch(`${BASE_URL}/oauth2/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.mfa_required) {
        this.pendingMfa = true;
        return {
          success: false,
          needsMfa: true,
          mfaType: data.mfa_type || "totp",
          message: "MFA required. Provide your authenticator code."
        };
      }

      if (data.access_token) {
        this.token = data.access_token;
        this.authenticated = true;
        this.pendingMfa = false;
        this.data.authenticated = true;
        this.saveToken(data.access_token, data.expires_in || 86400);
        this.save();
        return { success: true, message: "Authenticated successfully" };
      }

      return { success: false, message: data.detail || data.error || "Authentication failed" };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  getDeviceToken() {
    // Generate a persistent device token
    const tokenPath = path.join(DATA_DIR, ".robinhood-device.json");
    try {
      if (fs.existsSync(tokenPath)) {
        return JSON.parse(fs.readFileSync(tokenPath, "utf-8")).deviceToken;
      }
    } catch {}

    const crypto = require("crypto");
    const deviceToken = crypto.randomUUID();
    try {
      fs.writeFileSync(tokenPath, JSON.stringify({ deviceToken }));
    } catch {}
    return deviceToken;
  }

  /**
   * Fetch account information
   */
  async fetchAccounts() {
    if (!this.authenticated) return { success: false, message: "Not authenticated" };

    try {
      const data = await this.request("/accounts/");
      const accounts = (data.results || []).map(acc => ({
        id: acc.account_number,
        url: acc.url,
        type: acc.type,
        buyingPower: parseFloat(acc.buying_power) || 0,
        cash: parseFloat(acc.cash) || 0,
        cashHeldForOrders: parseFloat(acc.cash_held_for_orders) || 0,
        portfolioUrl: acc.portfolio,
        positionsUrl: acc.positions,
        positions: [], // filled by fetchPositions
        balance: null  // filled by fetchPortfolios
      }));

      if (accounts.length > 0) {
        this.accountNumber = accounts[0].id;
      }

      this.data.accounts = accounts;
      this.data.lastUpdated = new Date().toISOString();
      this.save();
      return { success: true, accounts };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Fetch current positions per account
   */
  async fetchPositions() {
    if (!this.authenticated) return { success: false, message: "Not authenticated" };

    try {
      const allPositions = [];

      for (const account of this.data.accounts) {
        // Fetch positions for this account via its positions URL
        const url = account.positionsUrl || "/positions/?nonzero=true";
        const data = await this.request(url.includes("nonzero") ? url : `${url}?nonzero=true`);
        const accountPositions = [];

        for (const pos of (data.results || [])) {
          const quantity = parseFloat(pos.quantity) || 0;
          if (quantity === 0) continue;

          let symbol = "UNKNOWN";
          let name = "";
          try {
            const instrument = await this.request(pos.instrument);
            symbol = instrument.symbol || "UNKNOWN";
            name = instrument.simple_name || instrument.name || "";
          } catch {}

          accountPositions.push({
            symbol,
            name,
            quantity,
            averageCost: parseFloat(pos.average_buy_price) || 0,
            currentPrice: null,
            marketValue: null,
            accountId: account.id,
            instrumentUrl: pos.instrument,
            createdAt: pos.created_at
          });
        }

        // Batch-fetch current prices for this account's positions
        const symbols = accountPositions.map(p => p.symbol).filter(s => s !== "UNKNOWN");
        if (symbols.length > 0) {
          try {
            const quotes = await this.request(`/quotes/?symbols=${symbols.join(",")}`);
            const priceMap = {};
            for (const q of (quotes.results || [])) {
              priceMap[q.symbol] = parseFloat(q.last_trade_price) || parseFloat(q.last_extended_hours_trade_price) || 0;
            }
            for (const pos of accountPositions) {
              if (priceMap[pos.symbol]) {
                pos.currentPrice = priceMap[pos.symbol];
                pos.marketValue = pos.quantity * pos.currentPrice;
              }
            }
          } catch {}
        }

        // Attach positions to account
        account.positions = accountPositions;
        allPositions.push(...accountPositions);
      }

      this.data.positions = allPositions;
      this.data.lastUpdated = new Date().toISOString();
      this.save();
      this.emit("positions-updated", allPositions);
      return { success: true, positions: allPositions, byAccount: this.getPositionsByAccount() };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  /**
   * Group positions by account
   */
  getPositionsByAccount() {
    const grouped = {};
    for (const acc of this.data.accounts) {
      grouped[acc.id] = {
        accountId: acc.id,
        type: acc.type,
        balance: acc.balance,
        buyingPower: acc.buyingPower,
        cash: acc.cash,
        positions: acc.positions || [],
        positionCount: (acc.positions || []).length,
        marketValue: (acc.positions || []).reduce((s, p) => s + (p.marketValue || 0), 0)
      };
    }
    return grouped;
  }

  /**
   * Fetch portfolio/balance for ALL accounts
   */
  async fetchPortfolios() {
    if (!this.authenticated) return { success: false, message: "Not authenticated" };
    if (this.data.accounts.length === 0) await this.fetchAccounts();
    if (this.data.accounts.length === 0) return { success: false, message: "No accounts found" };

    const portfolios = [];
    for (const account of this.data.accounts) {
      try {
        const data = await this.request(`/portfolios/${account.id}/`);
        const portfolio = {
          accountId: account.id,
          equity: parseFloat(data.equity) || 0,
          extendedHoursEquity: parseFloat(data.extended_hours_equity) || 0,
          marketValue: parseFloat(data.market_value) || 0,
          lastCoreEquity: parseFloat(data.last_core_equity) || 0,
          excessMargin: parseFloat(data.excess_margin) || 0,
        };
        account.balance = portfolio.equity;
        portfolios.push(portfolio);
      } catch {}
    }

    this.data.portfolios = portfolios;
    this.data.totalEquity = portfolios.reduce((s, p) => s + p.equity, 0);
    this.data.lastUpdated = new Date().toISOString();
    this.save();
    this.emit("portfolios-updated", portfolios);
    return { success: true, portfolios, totalEquity: this.data.totalEquity };
  }

  /**
   * Fetch all data
   */
  async fetchAll() {
    const results = { accounts: null, portfolios: null, positions: null, errors: [] };

    try {
      results.accounts = await this.fetchAccounts();
      if (!results.accounts.success) results.errors.push(`Accounts: ${results.accounts.message}`);
    } catch (e) { results.errors.push(`Accounts: ${e.message}`); }

    try {
      results.portfolios = await this.fetchPortfolios();
      if (!results.portfolios.success) results.errors.push(`Portfolios: ${results.portfolios.message}`);
    } catch (e) { results.errors.push(`Portfolios: ${e.message}`); }

    try {
      results.positions = await this.fetchPositions();
      if (!results.positions.success) results.errors.push(`Positions: ${results.positions.message}`);
    } catch (e) { results.errors.push(`Positions: ${e.message}`); }

    return { success: results.errors.length === 0, ...results };
  }

  isStale() {
    if (!this.data.lastUpdated) return true;
    return Date.now() - new Date(this.data.lastUpdated).getTime() > CACHE_DURATION;
  }

  getDisplayData() {
    const totalEquity = this.data.totalEquity || this.data.positions?.reduce((sum, p) => sum + (p.marketValue || 0), 0) || 0;
    return {
      connected: this.authenticated && this.data.accounts.length > 0,
      totalEquity,
      accounts: (this.data.accounts || []).map(acc => ({
        id: acc.id,
        type: acc.type,
        balance: acc.balance,
        buyingPower: acc.buyingPower,
        cash: acc.cash,
        positionCount: (acc.positions || []).length,
        marketValue: (acc.positions || []).reduce((s, p) => s + (p.marketValue || 0), 0),
        positions: acc.positions || []
      })),
      accountCount: this.data.accounts?.length || 0,
      positionCount: this.data.positions?.length || 0,
      lastUpdated: this.data.lastUpdated,
      isStale: this.isStale()
    };
  }

  getFinanceData() {
    return {
      equity: this.data.totalEquity || 0,
      accounts: this.data.accounts?.length || 0,
      positions: this.data.positions?.length || 0,
      lastUpdated: this.data.lastUpdated
    };
  }

  getConfig() {
    return {
      authenticated: this.authenticated,
      pendingMfa: this.pendingMfa,
      lastUpdated: this.data.lastUpdated,
      accountCount: this.data.accounts?.length || 0,
      positionCount: this.data.positions?.length || 0
    };
  }

  reset() {
    this.data = getDefaultData();
    this.token = null;
    this.accountNumber = null;
    this.authenticated = false;
    this.pendingMfa = false;
    this.save();
    try { if (fs.existsSync(RH_TOKEN_PATH)) fs.unlinkSync(RH_TOKEN_PATH); } catch {}
    this.emit("reset");
  }
}

let instance = null;
export const getRobinhoodService = () => {
  if (!instance) instance = new RobinhoodService();
  return instance;
};

export default RobinhoodService;
