/**
 * User Settings Service
 * Manages all user preferences and configuration
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_PATH = path.join(DATA_DIR, "user-settings.json");

// Default settings
const DEFAULT_SETTINGS = {
  // Onboarding
  onboardingComplete: false,
  onboardingStep: null,
  firebaseUser: null,
  coreModelProvider: null, // 'anthropic' | 'openai' | 'google'
  hasProAccount: false,
  connections: {
    google: false,
    phone: false,
    alpaca: false,
    oura: false,
    email: false,
    personalCapital: false,
    plaid: false
  },
  phoneNumber: null,

  // Display
  privateMode: false,
  viewMode: "CORE", // CORE, ADVANCED, MINIMAL

  // Base LLM (for general conversations)
  baseProvider: "anthropic", // anthropic, openai, google
  baseModel: "claude-opus-4-5-20251101",

  // Agentic Model (for autonomous actions)
  agenticProvider: "anthropic",
  agenticModel: "claude-opus-4-5-20251101",

  // Fine-Tuning
  fineTuningEnabled: false,
  useFineTunedModel: false, // Whether to use fine-tuned model when available

  // Trading
  autoTrading: true,
  tradingNotifications: true,

  // UI
  theme: "dark",
  compactMode: false,

  // Data Collection
  collectTrainingData: true,

  // Last updated
  lastUpdated: null
};

/**
 * Ensure data directory exists
 */
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load user settings
 */
export const loadUserSettings = () => {
  try {
    ensureDataDir();
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      return { ...DEFAULT_SETTINGS, ...data };
    }
  } catch (error) {
    console.error("Failed to load user settings:", error.message);
  }
  return { ...DEFAULT_SETTINGS };
};

/**
 * Save user settings
 */
export const saveUserSettings = (settings) => {
  try {
    ensureDataDir();
    const toSave = {
      ...settings,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(toSave, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save user settings:", error.message);
    return false;
  }
};

/**
 * Update a single setting
 */
export const updateSetting = (key, value) => {
  const settings = loadUserSettings();
  settings[key] = value;
  return saveUserSettings(settings);
};

/**
 * Update multiple settings
 */
export const updateSettings = (updates) => {
  const settings = loadUserSettings();
  Object.assign(settings, updates);
  return saveUserSettings(settings);
};

/**
 * Get a single setting
 */
export const getSetting = (key) => {
  const settings = loadUserSettings();
  return settings[key];
};

/**
 * Reset settings to defaults
 */
export const resetSettings = () => {
  return saveUserSettings(DEFAULT_SETTINGS);
};

/**
 * Get model configuration for a provider
 */
export const getModelConfig = (provider) => {
  const configs = {
    anthropic: {
      name: "Anthropic",
      envKey: "ANTHROPIC_API_KEY",
      baseUrl: "https://api.anthropic.com",
      models: {
        "claude-opus-4-5-20251101": { name: "Claude Opus 4.5", maxTokens: 8192 },
        "claude-sonnet-4-20250514": { name: "Claude Sonnet 4", maxTokens: 8192 },
        "claude-3-5-haiku-20241022": { name: "Claude Haiku 3.5", maxTokens: 8192 }
      }
    },
    openai: {
      name: "OpenAI",
      envKey: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com",
      models: {
        "gpt-4o": { name: "GPT-4o", maxTokens: 4096 },
        "gpt-4o-mini": { name: "GPT-4o Mini", maxTokens: 4096 },
        "gpt-4-turbo": { name: "GPT-4 Turbo", maxTokens: 4096 },
        "o1": { name: "o1 Reasoning", maxTokens: 32768 },
        "o1-mini": { name: "o1 Mini", maxTokens: 32768 }
      }
    },
    google: {
      name: "Google",
      envKey: "GOOGLE_API_KEY",
      baseUrl: "https://generativelanguage.googleapis.com",
      models: {
        "gemini-2.0-flash": { name: "Gemini 2.0 Flash", maxTokens: 8192 },
        "gemini-1.5-pro": { name: "Gemini 1.5 Pro", maxTokens: 8192 },
        "gemini-1.5-flash": { name: "Gemini 1.5 Flash", maxTokens: 8192 }
      }
    }
  };

  return configs[provider] || configs.anthropic;
};

/**
 * Check if a provider's API key is configured
 */
export const isProviderConfigured = (provider) => {
  const config = getModelConfig(provider);
  return !!process.env[config.envKey];
};

/**
 * Get the current base model configuration
 */
export const getCurrentBaseModel = () => {
  const settings = loadUserSettings();
  const config = getModelConfig(settings.baseProvider);
  return {
    provider: settings.baseProvider,
    model: settings.baseModel,
    config: config.models[settings.baseModel] || {},
    apiKey: process.env[config.envKey],
    isConfigured: isProviderConfigured(settings.baseProvider)
  };
};

/**
 * Get the current agentic model configuration
 */
export const getCurrentAgenticModel = () => {
  const settings = loadUserSettings();
  const config = getModelConfig(settings.agenticProvider);
  return {
    provider: settings.agenticProvider,
    model: settings.agenticModel,
    config: config.models[settings.agenticModel] || {},
    apiKey: process.env[config.envKey],
    isConfigured: isProviderConfigured(settings.agenticProvider)
  };
};

/**
 * Get display-friendly settings summary
 */
export const getSettingsSummary = () => {
  const settings = loadUserSettings();
  const baseConfig = getModelConfig(settings.baseProvider);
  const agenticConfig = getModelConfig(settings.agenticProvider);

  return {
    display: {
      privateMode: settings.privateMode,
      viewMode: settings.viewMode,
      theme: settings.theme
    },
    models: {
      base: {
        provider: baseConfig.name,
        model: baseConfig.models[settings.baseModel]?.name || settings.baseModel,
        configured: isProviderConfigured(settings.baseProvider)
      },
      agentic: {
        provider: agenticConfig.name,
        model: agenticConfig.models[settings.agenticModel]?.name || settings.agenticModel,
        configured: isProviderConfigured(settings.agenticProvider)
      }
    },
    features: {
      fineTuning: settings.fineTuningEnabled,
      autoTrading: settings.autoTrading,
      trainingData: settings.collectTrainingData
    }
  };
};

export default {
  loadUserSettings,
  saveUserSettings,
  updateSetting,
  updateSettings,
  getSetting,
  resetSettings,
  getModelConfig,
  isProviderConfigured,
  getCurrentBaseModel,
  getCurrentAgenticModel,
  getSettingsSummary
};
