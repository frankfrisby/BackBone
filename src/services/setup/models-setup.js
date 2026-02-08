import fs from "node:fs";
import path from "node:path";
import { openUrl } from "../open-url.js";

import { getDataDir, engineFile } from "../paths.js";
/**
 * AI Models Service for BACKBONE
 * Supports multiple concurrent connections: OpenAI, Anthropic, Google
 *
 * Connection types:
 * - API Key: Direct API access (pay per token)
 * - Pro Account: OAuth with ChatGPT Plus/Pro subscription
 *
 * Model Tiers (Ctrl+T to change):
 * - low: Fastest, cheapest (gpt-4o-mini, claude-3-haiku, gemini-flash)
 * - medium: Balanced (gpt-4o, claude-3.5-sonnet, gemini-pro)
 * - high: Best quality (gpt-4o, claude-opus-4, gemini-pro)
 * - xhigh: Maximum capability (gpt-5.2, claude-opus-4.5, gemini-3-ultra)
 */

const DATA_DIR = getDataDir();
const MODELS_CONFIG_PATH = path.join(DATA_DIR, "models-config.json");

// Model Tiers - selectable with Ctrl+T
export const MODEL_TIERS = {
  low: {
    label: "Low",
    description: "Fast & economical",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-haiku-20240307",
    google: "gemini-1.5-flash"
  },
  medium: {
    label: "Medium",
    description: "Balanced performance",
    openai: "gpt-4o",
    anthropic: "claude-3-5-sonnet-20241022",
    google: "gemini-1.5-pro"
  },
  high: {
    label: "High",
    description: "Best quality",
    openai: "gpt-4o",
    anthropic: "claude-opus-4-20250514",
    google: "gemini-1.5-pro"
  },
  xhigh: {
    label: "XHigh",
    description: "Maximum capability",
    openai: "gpt-4.5-preview",
    anthropic: "claude-opus-4-5-20251101",
    google: "gemini-2.0-flash-exp"
  }
};

// AI Providers
export const PROVIDERS = {
  openai: {
    id: "openai",
    name: "OpenAI",
    displayName: "GPT",
    icon: "◇",
    color: "#10a37f",
    envKey: "OPENAI_API_KEY",
    apiUrl: "https://platform.openai.com/api-keys",
    oauthUrl: "https://chatgpt.com", // For Pro account OAuth
    testEndpoint: "https://api.openai.com/v1/chat/completions"
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    displayName: "Claude",
    icon: "◈",
    color: "#d97706",
    envKey: "ANTHROPIC_API_KEY",
    apiUrl: "https://console.anthropic.com/settings/keys",
    oauthUrl: "https://claude.ai",
    testEndpoint: "https://api.anthropic.com/v1/messages"
  },
  google: {
    id: "google",
    name: "Google",
    displayName: "Gemini",
    icon: "◆",
    color: "#4285f4",
    envKey: "GOOGLE_AI_KEY",
    altEnvKey: "GEMINI_API_KEY",
    apiUrl: "https://aistudio.google.com/apikey",
    oauthUrl: "https://gemini.google.com",
    testEndpoint: "https://generativelanguage.googleapis.com/v1beta/models"
  }
};

export const PROVIDER_LIST = Object.values(PROVIDERS);

// Connection status
export const CONNECTION_STATUS = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  INVALID: "invalid",
  ERROR: "error"
};

/**
 * Load saved models configuration
 */
const loadModelsConfig = () => {
  try {
    if (fs.existsSync(MODELS_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(MODELS_CONFIG_PATH, "utf-8"));
    }
  } catch (e) {}
  return {
    tier: "medium",
    primary: null,
    connections: {}
  };
};

/**
 * Save models configuration
 */
const saveModelsConfig = (config) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(MODELS_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("Failed to save models config:", e.message);
  }
};

/**
 * Get API key for a provider
 */
const getApiKey = (providerId) => {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  return process.env[provider.envKey] || (provider.altEnvKey && process.env[provider.altEnvKey]) || null;
};

/**
 * Get current model tier
 */
export const getCurrentTier = () => {
  const config = loadModelsConfig();
  return config.tier || "medium";
};

/**
 * Set model tier
 */
export const setModelTier = (tier) => {
  if (!MODEL_TIERS[tier]) {
    return { success: false, error: "Invalid tier. Use: low, medium, high, xhigh" };
  }
  const config = loadModelsConfig();
  config.tier = tier;
  saveModelsConfig(config);
  return { success: true, tier, label: MODEL_TIERS[tier].label };
};

/**
 * Cycle to next tier (for Ctrl+T)
 */
export const cycleTier = () => {
  const tiers = Object.keys(MODEL_TIERS);
  const current = getCurrentTier();
  const currentIndex = tiers.indexOf(current);
  const nextIndex = (currentIndex + 1) % tiers.length;
  return setModelTier(tiers[nextIndex]);
};

/**
 * Get model ID for current tier and provider
 */
export const getModelForTier = (providerId, tier = null) => {
  const t = tier || getCurrentTier();
  return MODEL_TIERS[t]?.[providerId] || MODEL_TIERS.medium[providerId];
};

/**
 * Get all connected providers status
 */
export const getConnectionStatus = () => {
  const status = {
    tier: getCurrentTier(),
    tierLabel: MODEL_TIERS[getCurrentTier()]?.label || "Medium",
    primary: null,
    providers: {}
  };

  const config = loadModelsConfig();

  for (const provider of PROVIDER_LIST) {
    const apiKey = getApiKey(provider.id);
    const hasKey = Boolean(apiKey);

    status.providers[provider.id] = {
      ...provider,
      connected: hasKey,
      keyPreview: hasKey ? `••••${apiKey.slice(-4)}` : null,
      model: getModelForTier(provider.id)
    };

    // Set primary if not set
    if (hasKey && !status.primary) {
      status.primary = provider.id;
    }
  }

  // Use saved primary if still valid
  if (config.primary && status.providers[config.primary]?.connected) {
    status.primary = config.primary;
  }

  status.anyConnected = Object.values(status.providers).some(p => p.connected);
  status.connectedCount = Object.values(status.providers).filter(p => p.connected).length;

  return status;
};

/**
 * Set primary provider
 */
export const setPrimaryProvider = (providerId) => {
  if (!PROVIDERS[providerId]) {
    return { success: false, error: "Invalid provider" };
  }
  const config = loadModelsConfig();
  config.primary = providerId;
  saveModelsConfig(config);
  return { success: true, provider: providerId };
};

/**
 * Test connection to a provider
 */
export const testConnection = async (providerId) => {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return { success: false, error: "Unknown provider" };
  }

  const apiKey = getApiKey(providerId);
  if (!apiKey) {
    return {
      success: false,
      status: CONNECTION_STATUS.DISCONNECTED,
      message: "No API key configured"
    };
  }

  try {
    let response;
    const model = getModelForTier(providerId);

    if (providerId === "openai") {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5
        })
      });
    } else if (providerId === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 5,
          messages: [{ role: "user", content: "Hi" }]
        })
      });
    } else if (providerId === "google") {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Hi" }] }]
          })
        }
      );
    }

    if (response?.ok) {
      return {
        success: true,
        status: CONNECTION_STATUS.CONNECTED,
        provider: provider.name,
        model: model,
        message: `Connected to ${provider.displayName}`
      };
    } else {
      const error = await response?.text();
      return {
        success: false,
        status: CONNECTION_STATUS.INVALID,
        message: error?.slice(0, 100) || "Connection failed"
      };
    }
  } catch (error) {
    return {
      success: false,
      status: CONNECTION_STATUS.ERROR,
      message: error.message
    };
  }
};

/**
 * Test all connections
 */
export const testAllConnections = async () => {
  const results = {};
  for (const provider of PROVIDER_LIST) {
    if (getApiKey(provider.id)) {
      results[provider.id] = await testConnection(provider.id);
    } else {
      results[provider.id] = {
        success: false,
        status: CONNECTION_STATUS.DISCONNECTED
      };
    }
  }
  return results;
};

/**
 * Open API key page for a provider
 */
export const openApiKeyPage = async (providerId) => {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return { success: false, error: "Unknown provider" };
  }

  try {
    await openUrl(provider.apiUrl);
    return {
      success: true,
      url: provider.apiUrl,
      envKey: provider.envKey,
      message: `Opening ${provider.name} API keys page...`,
      instructions: [
        "1. Sign in or create an account",
        "2. Create a new API key",
        "3. Copy the key",
        `4. Add to .env: ${provider.envKey}=your-key`,
        "5. Restart BACKBONE"
      ]
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Save API key for a provider
 */
export const saveApiKey = (providerId, apiKey) => {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return { success: false, error: "Unknown provider" };
  }

  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, error: "Invalid API key" };
  }

  try {
    const envPath = engineFile(".env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

    const keyRegex = new RegExp(`^${provider.envKey}=.*$`, "m");
    if (keyRegex.test(envContent)) {
      envContent = envContent.replace(keyRegex, `${provider.envKey}=${apiKey.trim()}`);
    } else {
      envContent += `\n${provider.envKey}=${apiKey.trim()}`;
    }

    fs.writeFileSync(envPath, envContent.trim() + "\n");
    process.env[provider.envKey] = apiKey.trim();

    return {
      success: true,
      message: `${provider.displayName} API key saved`,
      provider: providerId
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Get display status for all models
 */
export const getModelsStatusDisplay = () => {
  const status = getConnectionStatus();
  const lines = [];

  lines.push(`AI Models · Tier: ${status.tierLabel} (Ctrl+T to change)`);
  lines.push("");

  for (const provider of PROVIDER_LIST) {
    const p = status.providers[provider.id];
    const icon = p.connected ? "●" : "○";
    const statusText = p.connected ? `Connected · ${p.model}` : "Not connected";
    const primary = status.primary === provider.id ? " [PRIMARY]" : "";

    lines.push(`${p.icon} ${p.displayName}${primary}`);
    lines.push(`  ${icon} ${statusText}`);
    if (p.keyPreview) {
      lines.push(`  Key: ${p.keyPreview}`);
    }
    lines.push("");
  }

  if (!status.anyConnected) {
    lines.push("Run /models to connect an AI provider");
  }

  return lines.join("\n");
};

/**
 * Get tier display for status bar
 */
export const getTierDisplay = () => {
  const tier = getCurrentTier();
  const tierInfo = MODEL_TIERS[tier];
  return {
    tier,
    label: tierInfo.label,
    short: tier.charAt(0).toUpperCase()
  };
};

// Legacy exports for compatibility
export const MODELS = {
  GPT_5: { id: "openai", ...PROVIDERS.openai },
  CLAUDE_OPUS: { id: "anthropic", ...PROVIDERS.anthropic },
  GEMINI_3: { id: "google", ...PROVIDERS.google }
};

export const MODEL_LIST = PROVIDER_LIST;
export const getModelConfig = getConnectionStatus;
export const verifyConnection = testConnection;
export const verifyAllConnections = testAllConnections;
export const setPrimaryModel = setPrimaryProvider;
export const formatVerificationResult = (result) => {
  if (!result) return "No result";
  return result.message || (result.success ? "Connected" : "Not connected");
};

export default {
  PROVIDERS,
  PROVIDER_LIST,
  MODEL_TIERS,
  CONNECTION_STATUS,
  getCurrentTier,
  setModelTier,
  cycleTier,
  getModelForTier,
  getConnectionStatus,
  setPrimaryProvider,
  testConnection,
  testAllConnections,
  openApiKeyPage,
  saveApiKey,
  getModelsStatusDisplay,
  getTierDisplay
};
