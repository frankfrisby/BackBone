/**
 * Model API Key Setup Service
 * Handles API key configuration for AI providers during onboarding
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { openUrl } from "./open-url.js";

const DATA_DIR = path.join(process.cwd(), "data");
const API_KEY_SETUP_PATH = path.join(DATA_DIR, "api-key-setup.json");
const ENV_PATH = path.join(process.cwd(), ".env");

// Provider configurations
export const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    displayName: "Claude (Anthropic)",
    icon: "\u{1F7E3}", // Purple circle
    envKey: "ANTHROPIC_API_KEY",
    keyPrefix: "sk-ant-",
    apiKeyUrl: "https://console.anthropic.com/account/keys",
    proCheckUrl: "https://console.anthropic.com/settings/billing",
    testEndpoint: "https://api.anthropic.com/v1/messages",
    instructions: [
      "1. Go to console.anthropic.com",
      "2. Sign in or create account",
      "3. Navigate to 'API Keys'",
      "4. Click 'Create Key'",
      "5. Copy the key (starts with sk-ant-)"
    ]
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    displayName: "GPT (OpenAI)",
    icon: "\u{1F7E2}", // Green circle
    envKey: "OPENAI_API_KEY",
    keyPrefix: "sk-",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    proCheckUrl: "https://platform.openai.com/account/billing",
    testEndpoint: "https://api.openai.com/v1/models",
    instructions: [
      "1. Go to platform.openai.com",
      "2. Sign in or create account",
      "3. Navigate to 'API Keys'",
      "4. Click 'Create new secret key'",
      "5. Copy the key (starts with sk-)"
    ]
  },
  google: {
    id: "google",
    name: "Google",
    displayName: "Gemini (Google)",
    icon: "\u{1F535}", // Blue circle
    envKey: "GOOGLE_API_KEY",
    keyPrefix: "AIza",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    proCheckUrl: "https://aistudio.google.com/app/billing",
    testEndpoint: "https://generativelanguage.googleapis.com/v1/models",
    instructions: [
      "1. Go to aistudio.google.com",
      "2. Sign in with Google account",
      "3. Click 'Get API Key'",
      "4. Create or select project",
      "5. Copy the key (starts with AIza)"
    ]
  }
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
 * Check if user has Pro/Max subscription for a provider
 * This is a placeholder - actual implementation would check billing status
 */
export const checkProAccount = async (provider) => {
  // For now, return false - user needs to configure API key
  // In future, this could check Firebase user's subscription status
  return { hasPro: false, tier: "free" };
};

/**
 * Create API key setup file with instructions
 */
export const createApiKeyFile = (provider) => {
  ensureDataDir();

  const config = PROVIDERS[provider];
  if (!config) {
    return { success: false, error: "Unknown provider" };
  }

  const fileContent = {
    _provider: config.displayName,
    _instructions: config.instructions,
    _step1: `Go to: ${config.apiKeyUrl}`,
    _step2: `Copy your API key (starts with ${config.keyPrefix})`,
    _step3: "Paste it below and SAVE this file (Ctrl+S)",
    apiKey: `PASTE_YOUR_${provider.toUpperCase()}_KEY_HERE`
  };

  try {
    fs.writeFileSync(API_KEY_SETUP_PATH, JSON.stringify(fileContent, null, 2));
    return { success: true, filePath: API_KEY_SETUP_PATH };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Open API key file in default editor
 */
export const openApiKeyInEditor = async () => {
  const platform = process.platform;

  try {
    let editor;
    let args;

    if (platform === "win32") {
      editor = "notepad.exe";
      args = [API_KEY_SETUP_PATH];
    } else if (platform === "darwin") {
      editor = "open";
      args = ["-e", API_KEY_SETUP_PATH];
    } else {
      editor = "xdg-open";
      args = [API_KEY_SETUP_PATH];
    }

    const child = spawn(editor, args, {
      detached: true,
      stdio: "ignore"
    });
    child.unref();

    return { success: true, filePath: API_KEY_SETUP_PATH };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Read API key from setup file
 */
export const readApiKeyFile = () => {
  try {
    if (!fs.existsSync(API_KEY_SETUP_PATH)) {
      return { key: null };
    }

    const content = JSON.parse(fs.readFileSync(API_KEY_SETUP_PATH, "utf-8"));
    const key = content.apiKey;

    // Check if key is real (not placeholder)
    if (key && !key.includes("PASTE")) {
      return { key };
    }

    return { key: null };
  } catch (error) {
    return { key: null, error: error.message };
  }
};

/**
 * Watch API key file for changes
 */
export const watchApiKeyFile = (callback) => {
  ensureDataDir();

  if (!fs.existsSync(API_KEY_SETUP_PATH)) {
    createApiKeyFile("anthropic"); // Default provider
  }

  let lastKey = null;
  let lastMtimeMs = 0;
  let checking = false;

  const checkForKey = () => {
    if (checking) return;
    checking = true;
    try {
      if (fs.existsSync(API_KEY_SETUP_PATH)) {
        const stat = fs.statSync(API_KEY_SETUP_PATH);
        if (stat.mtimeMs !== lastMtimeMs) {
          lastMtimeMs = stat.mtimeMs;
          const result = readApiKeyFile();
          if (result.key && result.key !== lastKey) {
            lastKey = result.key;
            callback(result.key);
          }
        }
      }
    } catch (error) {
      // Ignore transient read errors
    } finally {
      checking = false;
    }
  };

  const watcher = fs.watch(API_KEY_SETUP_PATH, (eventType) => {
    if (eventType === "change" || eventType === "rename") {
      checkForKey();
    }
  });

  const interval = setInterval(checkForKey, 1000);
  checkForKey();

  return {
    close: () => {
      try {
        watcher.close();
      } catch {
        // Ignore
      }
      clearInterval(interval);
    }
  };
};

/**
 * Validate API key with a test request
 */
export const validateApiKey = async (provider, key) => {
  const config = PROVIDERS[provider];
  if (!config) {
    return { valid: false, error: "Unknown provider" };
  }

  try {
    let response;

    if (provider === "anthropic") {
      response = await fetch(config.testEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }]
        })
      });
    } else if (provider === "openai") {
      response = await fetch(config.testEndpoint, {
        headers: {
          "Authorization": `Bearer ${key}`
        }
      });
    } else if (provider === "google") {
      response = await fetch(`${config.testEndpoint}?key=${key}`);
    }

    if (response.ok) {
      return { valid: true };
    } else {
      const error = await response.text();
      return { valid: false, error: `API error: ${response.status}` };
    }
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

/**
 * Save API key to .env file
 */
export const saveApiKeyToEnv = (provider, key) => {
  const config = PROVIDERS[provider];
  if (!config) {
    return { success: false, error: "Unknown provider" };
  }

  try {
    let content = "";
    if (fs.existsSync(ENV_PATH)) {
      content = fs.readFileSync(ENV_PATH, "utf-8");
    }

    const envKey = config.envKey;

    // Update or add the key
    if (content.includes(`${envKey}=`)) {
      content = content.replace(new RegExp(`${envKey}=.*`, "g"), `${envKey}=${key}`);
    } else {
      content += `\n${envKey}=${key}`;
    }

    fs.writeFileSync(ENV_PATH, content.trim() + "\n");

    // Also set in process.env for immediate use
    process.env[envKey] = key;

    return { success: true, envPath: ENV_PATH, envKey };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Open provider's API key page in browser
 */
export const openProviderKeyPage = (provider) => {
  const config = PROVIDERS[provider];
  if (!config) {
    return { success: false, error: "Unknown provider" };
  }

  try {
    openUrl(config.apiKeyUrl);
    return { success: true, url: config.apiKeyUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Clean up API key setup file
 */
export const cleanupApiKeyFile = () => {
  try {
    if (fs.existsSync(API_KEY_SETUP_PATH)) {
      fs.unlinkSync(API_KEY_SETUP_PATH);
    }
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get provider display info
 */
export const getProviderInfo = (provider) => {
  return PROVIDERS[provider] || null;
};

/**
 * Get all providers list
 */
export const getProvidersList = () => {
  return Object.values(PROVIDERS);
};

/**
 * Check if a provider is configured
 */
export const isProviderConfigured = (provider) => {
  const config = PROVIDERS[provider];
  if (!config) return false;
  return !!process.env[config.envKey];
};

export default {
  PROVIDERS,
  checkProAccount,
  createApiKeyFile,
  openApiKeyInEditor,
  readApiKeyFile,
  watchApiKeyFile,
  validateApiKey,
  saveApiKeyToEnv,
  openProviderKeyPage,
  cleanupApiKeyFile,
  getProviderInfo,
  getProvidersList,
  isProviderConfigured
};
