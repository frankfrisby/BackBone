/**
 * Model Fallback Service
 * Manages AI model priority chain and automatic fallback when models fail
 *
 * Priority Order:
 * 1. Claude Pro/Max (OAuth)
 * 2. OpenAI Codex
 * 3. OpenAI API
 * 4. Claude API (Anthropic)
 * 5. Google Gemini (optional)
 */

import { EventEmitter } from "events";
import { getCredentials as getClaudeOAuthCredentials, hasValidCredentials as hasClaudeOAuth } from "./claude-oauth.js";
import { PROVIDERS, isProviderConfigured } from "../setup/model-key-setup.js";

// Build provider config with API key from env
const getProviderConfig = (provider) => {
  const p = PROVIDERS[provider];
  if (!p) return null;
  const apiKey = process.env[p.envKey] || null;
  return { ...p, apiKey };
};

// Model definitions with priority
const MODELS = {
  "claude-oauth": {
    id: "claude-oauth",
    name: "Claude Pro/Max",
    priority: 1,
    provider: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514"],
    authType: "oauth",
  },
  "openai-codex": {
    id: "openai-codex",
    name: "OpenAI Codex",
    priority: 2,
    provider: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o", "gpt-4-turbo"],
    authType: "api_key",
  },
  "openai": {
    id: "openai",
    name: "OpenAI API",
    priority: 3,
    provider: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    authType: "api_key",
  },
  "anthropic": {
    id: "anthropic",
    name: "Claude API",
    priority: 4,
    provider: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022"],
    authType: "api_key",
  },
  "google": {
    id: "google",
    name: "Google Gemini",
    priority: 5,
    provider: "google",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    authType: "api_key",
    optional: true,
  },
};

/**
 * Check if a model is available/connected
 */
const isModelAvailable = (modelId) => {
  const model = MODELS[modelId];
  if (!model) return false;

  switch (modelId) {
    case "claude-oauth":
      return hasClaudeOAuth();
    case "openai-codex":
    case "openai":
      return isProviderConfigured("openai");
    case "anthropic":
      return isProviderConfigured("anthropic");
    case "google":
      return isProviderConfigured("google");
    default:
      return false;
  }
};

/**
 * Get authentication for a model
 */
const getModelAuth = async (modelId) => {
  const model = MODELS[modelId];
  if (!model) return null;

  switch (modelId) {
    case "claude-oauth": {
      const creds = await getClaudeOAuthCredentials();
      if (creds?.type === "api_key") {
        return { type: "api_key", key: creds.apiKey };
      }
      if (creds?.type === "oauth") {
        return { type: "bearer", token: creds.accessToken };
      }
      return null;
    }
    case "openai-codex":
    case "openai": {
      const config = getProviderConfig("openai");
      return config?.apiKey ? { type: "api_key", key: config.apiKey } : null;
    }
    case "anthropic": {
      const config = getProviderConfig("anthropic");
      return config?.apiKey ? { type: "api_key", key: config.apiKey } : null;
    }
    case "google": {
      const config = getProviderConfig("google");
      return config?.apiKey ? { type: "api_key", key: config.apiKey } : null;
    }
    default:
      return null;
  }
};

/**
 * Model Fallback Manager
 */
class ModelFallbackManager extends EventEmitter {
  constructor() {
    super();
    this.currentModel = null;
    this.failedModels = new Set();
    this.failureCounts = {};
    this.lastError = null;
  }

  /**
   * Get all available models in priority order
   */
  getAvailableModels() {
    return Object.values(MODELS)
      .filter(m => isModelAvailable(m.id) && !this.failedModels.has(m.id))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the current active model (highest priority available)
   */
  getCurrentModel() {
    if (this.currentModel && isModelAvailable(this.currentModel) && !this.failedModels.has(this.currentModel)) {
      return MODELS[this.currentModel];
    }

    const available = this.getAvailableModels();
    if (available.length > 0) {
      this.currentModel = available[0].id;
      return available[0];
    }

    return null;
  }

  /**
   * Get authentication for current model
   */
  async getCurrentAuth() {
    const model = this.getCurrentModel();
    if (!model) return null;
    return getModelAuth(model.id);
  }

  /**
   * Report a model failure and switch to next available
   */
  reportFailure(modelId, error) {
    this.failureCounts[modelId] = (this.failureCounts[modelId] || 0) + 1;
    this.lastError = error;

    // After 3 failures, mark as failed and move to next
    if (this.failureCounts[modelId] >= 3) {
      this.failedModels.add(modelId);
      this.emit("model-failed", { modelId, error, permanent: true });

      // Find next model
      const nextModel = this.getAvailableModels()[0];
      if (nextModel) {
        this.currentModel = nextModel.id;
        this.emit("model-switched", { from: modelId, to: nextModel.id, reason: "failure" });
        return nextModel;
      } else {
        this.emit("all-models-failed", { lastError: error });
        return null;
      }
    }

    this.emit("model-error", { modelId, error, failureCount: this.failureCounts[modelId] });
    return MODELS[modelId]; // Still try same model
  }

  /**
   * Report a model success (reset failure count)
   */
  reportSuccess(modelId) {
    this.failureCounts[modelId] = 0;
    this.currentModel = modelId;
  }

  /**
   * Manually switch to a specific model
   */
  switchTo(modelId) {
    if (!MODELS[modelId]) return false;
    if (!isModelAvailable(modelId)) return false;

    const previous = this.currentModel;
    this.currentModel = modelId;
    this.failedModels.delete(modelId);
    this.failureCounts[modelId] = 0;

    this.emit("model-switched", { from: previous, to: modelId, reason: "manual" });
    return true;
  }

  /**
   * Reset all failure states
   */
  reset() {
    this.failedModels.clear();
    this.failureCounts = {};
    this.lastError = null;
    this.currentModel = null;
  }

  /**
   * Get status of all models
   */
  getStatus() {
    return Object.values(MODELS).map(m => ({
      id: m.id,
      name: m.name,
      priority: m.priority,
      available: isModelAvailable(m.id),
      failed: this.failedModels.has(m.id),
      failureCount: this.failureCounts[m.id] || 0,
      isCurrent: this.currentModel === m.id,
    }));
  }

  /**
   * Get a summary string for display
   */
  getSummary() {
    const current = this.getCurrentModel();
    const available = this.getAvailableModels();
    const failed = this.failedModels.size;

    if (!current) {
      return "No models available";
    }

    let summary = `Active: ${current.name}`;
    if (available.length > 1) {
      summary += ` (+${available.length - 1} fallback${available.length > 2 ? "s" : ""})`;
    }
    if (failed > 0) {
      summary += ` [${failed} failed]`;
    }

    return summary;
  }
}

// Singleton instance
let fallbackManager = null;

export const getModelFallbackManager = () => {
  if (!fallbackManager) {
    fallbackManager = new ModelFallbackManager();
  }
  return fallbackManager;
};

export const MODELS_CONFIG = MODELS;
export default ModelFallbackManager;
