/**
 * API Quota Monitor
 *
 * Monitors OpenAI API usage and credits:
 * - Detects quota exceeded errors
 * - Checks remaining balance (if API supports it)
 * - Sends SMS warnings at $2, $1, $0.20 thresholds
 * - Provides billing page URLs for quick access
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { EventEmitter } from "events";

import { getDataDir } from "./paths.js";
const DATA_DIR = getDataDir();
const QUOTA_STATE_FILE = path.join(DATA_DIR, "api_quota_state.json");

// Billing URLs
export const BILLING_URLS = {
  openai: "https://platform.openai.com/settings/organization/billing/overview",
  anthropic: "https://console.anthropic.com/settings/billing"
};

// Warning thresholds in dollars
const WARNING_THRESHOLDS = [2.00, 1.00, 0.20];

class APIQuotaMonitor extends EventEmitter {
  constructor() {
    super();
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(QUOTA_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(QUOTA_STATE_FILE, "utf-8"));
      }
    } catch (error) {
      console.error("Failed to load quota state:", error.message);
    }
    return {
      openai: {
        quotaExceeded: false,
        lastError: null,
        lastErrorTime: null,
        warningsSent: [], // Track which warning thresholds we've sent
        lastBalanceCheck: null,
        lastKnownBalance: null
      },
      anthropic: {
        quotaExceeded: false,
        lastError: null,
        lastErrorTime: null,
        warningsSent: [],
        lastBalanceCheck: null,
        lastKnownBalance: null
      }
    };
  }

  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(QUOTA_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error("Failed to save quota state:", error.message);
    }
  }

  /**
   * Record a quota exceeded error
   */
  recordQuotaExceeded(provider, errorMessage) {
    const providerState = this.state[provider];
    if (!providerState) return;

    providerState.quotaExceeded = true;
    providerState.lastError = errorMessage;
    providerState.lastErrorTime = new Date().toISOString();

    this.saveState();
    this.emit("quota-exceeded", { provider, errorMessage });
  }

  /**
   * Clear quota exceeded status (e.g., after user adds credits)
   */
  clearQuotaExceeded(provider) {
    const providerState = this.state[provider];
    if (!providerState) return;

    providerState.quotaExceeded = false;
    providerState.lastError = null;
    providerState.warningsSent = []; // Reset warnings so they can fire again

    this.saveState();
    this.emit("quota-cleared", { provider });
  }

  /**
   * Check if quota is exceeded for a provider
   */
  isQuotaExceeded(provider) {
    return this.state[provider]?.quotaExceeded || false;
  }

  /**
   * Get quota status for display
   */
  getStatus() {
    return {
      openai: {
        quotaExceeded: this.state.openai.quotaExceeded,
        lastError: this.state.openai.lastError,
        lastErrorTime: this.state.openai.lastErrorTime,
        billingUrl: BILLING_URLS.openai
      },
      anthropic: {
        quotaExceeded: this.state.anthropic.quotaExceeded,
        lastError: this.state.anthropic.lastError,
        lastErrorTime: this.state.anthropic.lastErrorTime,
        billingUrl: BILLING_URLS.anthropic
      }
    };
  }

  /**
   * Health check - verify if API actually works by making a minimal call
   * Clears quota exceeded if successful
   */
  async healthCheck(provider = "openai") {
    if (provider === "openai") {
      return await this.checkOpenAIHealth();
    } else if (provider === "anthropic") {
      return await this.checkAnthropicHealth();
    }
    return { success: false, error: "Unknown provider" };
  }

  /**
   * Check if OpenAI API is working with a minimal request
   */
  async checkOpenAIHealth() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { success: false, error: "No API key configured" };
    }

    try {
      // Make a minimal API call to check if tokens are available
      // Using models endpoint which is cheap/free
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        // API is working - clear quota exceeded state
        if (this.state.openai.quotaExceeded) {
          console.log("OpenAI health check passed - clearing quota exceeded state");
          this.clearQuotaExceeded("openai");
        }
        this.state.openai.lastHealthCheck = new Date().toISOString();
        this.saveState();
        return { success: true, message: "OpenAI API is working" };
      }

      // Check if it's a quota error
      const errorText = await response.text();
      if (errorText.includes("insufficient_quota") || errorText.includes("exceeded")) {
        this.recordQuotaExceeded("openai", errorText);
        return { success: false, error: "Quota exceeded", quotaExceeded: true };
      }

      return { success: false, error: `API error: ${response.status}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if Anthropic API is working
   */
  async checkAnthropicHealth() {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return { success: false, error: "No API key configured" };
    }

    try {
      // Make a minimal API call - just check auth works
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }]
        })
      });

      if (response.ok) {
        // API is working - clear quota exceeded state
        if (this.state.anthropic.quotaExceeded) {
          console.log("Anthropic health check passed - clearing quota exceeded state");
          this.clearQuotaExceeded("anthropic");
        }
        this.state.anthropic.lastHealthCheck = new Date().toISOString();
        this.saveState();
        return { success: true, message: "Anthropic API is working" };
      }

      const errorText = await response.text();
      if (errorText.includes("credit") || errorText.includes("billing")) {
        this.recordQuotaExceeded("anthropic", errorText);
        return { success: false, error: "Quota exceeded", quotaExceeded: true };
      }

      return { success: false, error: `API error: ${response.status}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Run health check on all providers
   */
  async checkAllProviders() {
    const results = {
      openai: await this.checkOpenAIHealth(),
      anthropic: await this.checkAnthropicHealth()
    };

    this.emit("health-check-complete", results);
    return results;
  }

  /**
   * Check OpenAI usage/balance (requires organization API access)
   * Note: This uses the usage API which may not be available to all accounts
   */
  async checkOpenAIBalance() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    try {
      // OpenAI doesn't have a direct balance API, but we can check usage
      // This is a best-effort approach - the billing page is the authoritative source
      const response = await fetch("https://api.openai.com/v1/usage", {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Parse usage data if available
        this.state.openai.lastBalanceCheck = new Date().toISOString();
        this.saveState();
        return data;
      }
    } catch (error) {
      // Usage API may not be available - that's ok
    }

    return null;
  }

  /**
   * Record a balance check and send warnings if needed
   */
  async checkAndWarnBalance(provider, balance, messagingService) {
    if (balance === null || balance === undefined) return;

    const providerState = this.state[provider];
    providerState.lastKnownBalance = balance;
    providerState.lastBalanceCheck = new Date().toISOString();

    // Check warning thresholds
    for (const threshold of WARNING_THRESHOLDS) {
      if (balance <= threshold && !providerState.warningsSent.includes(threshold)) {
        // Send warning
        providerState.warningsSent.push(threshold);
        this.saveState();

        const urgency = threshold <= 0.20 ? "CRITICAL" : threshold <= 1.00 ? "WARNING" : "NOTICE";
        const message = `${urgency}: Your ${provider.toUpperCase()} API balance is $${balance.toFixed(2)}. ` +
          `Add credits at ${BILLING_URLS[provider]} to continue using AI features.`;

        this.emit("low-balance-warning", {
          provider,
          balance,
          threshold,
          urgency,
          message
        });

        // Send SMS if messaging service available
        if (messagingService?.getStatus()?.phoneVerified) {
          try {
            await messagingService.sendAlert(message);
          } catch (err) {
            console.error("Failed to send balance warning SMS:", err.message);
          }
        }
      }
    }
  }

  /**
   * Parse API error to detect quota issues
   */
  parseAPIError(error, provider = "openai") {
    const errorStr = typeof error === "string" ? error : error?.message || "";

    // OpenAI quota errors
    if (errorStr.includes("insufficient_quota") ||
        errorStr.includes("exceeded your current quota") ||
        errorStr.includes("billing") ||
        errorStr.includes("rate limit")) {

      this.recordQuotaExceeded(provider, errorStr);

      return {
        isQuotaError: true,
        provider,
        message: "API quota exceeded",
        billingUrl: BILLING_URLS[provider],
        displayMessage: `${provider === "openai" ? "GPT-5.2" : "Claude"} Tokens Exceeded`
      };
    }

    // Anthropic quota errors
    if (errorStr.includes("credit") ||
        errorStr.includes("billing") ||
        errorStr.includes("insufficient")) {

      this.recordQuotaExceeded(provider, errorStr);

      return {
        isQuotaError: true,
        provider,
        message: "API quota exceeded",
        billingUrl: BILLING_URLS[provider],
        displayMessage: `${provider === "openai" ? "GPT-5.2" : "Claude"} Tokens Exceeded`
      };
    }

    return {
      isQuotaError: false,
      provider,
      message: errorStr
    };
  }
}

// Singleton
let instance = null;

export const getAPIQuotaMonitor = () => {
  if (!instance) {
    instance = new APIQuotaMonitor();
  }
  return instance;
};

export default APIQuotaMonitor;
