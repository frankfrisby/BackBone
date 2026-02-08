import fs from "fs";
import path from "path";
import fetch from "node-fetch";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const REGISTRY_PATH = path.join(DATA_DIR, "model-registry.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

let registry = {};
let refreshInFlight = {};
let lastRefreshAt = {};

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const loadRegistry = () => {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
    }
  } catch {
    registry = {};
  }
};

const saveRegistry = () => {
  try {
    ensureDataDir();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // Ignore registry persistence issues
  }
};

const getEntry = (provider, family) => {
  return registry?.[provider]?.[family] || null;
};

const setEntry = (provider, family, modelId) => {
  if (!registry[provider]) registry[provider] = {};
  registry[provider][family] = {
    modelId,
    updatedAt: new Date().toISOString()
  };
  saveRegistry();
};

const isStale = (entry) => {
  if (!entry?.updatedAt) return true;
  const age = Date.now() - new Date(entry.updatedAt).getTime();
  return age > CACHE_TTL_MS;
};

const shouldRefresh = (key) => {
  const last = lastRefreshAt[key];
  if (!last) return true;
  return Date.now() - last > MIN_REFRESH_INTERVAL_MS;
};

const parseCodexVersion = (id) => {
  const match = id.match(/^gpt-(\d+)(?:\.(\d+))?-codex$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] || 0)
  };
};

const pickLatestCodexModel = (models) => {
  const candidates = models
    .map((model) => model?.id)
    .filter((id) => typeof id === "string" && parseCodexVersion(id));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const av = parseCodexVersion(a);
    const bv = parseCodexVersion(b);
    if (!av || !bv) return 0;
    if (av.major !== bv.major) return av.major - bv.major;
    return av.minor - bv.minor;
  });

  return candidates[candidates.length - 1];
};

const parseClaudeOpusDate = (id) => {
  const match = id.match(/-(\d{8})$/);
  if (!match) return null;
  return Number(match[1]);
};

const pickLatestClaudeOpusModel = (models) => {
  const candidates = models
    .map((model) => model?.id)
    .filter((id) => typeof id === "string" && id.startsWith("claude-opus-"));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ad = parseClaudeOpusDate(a) || 0;
    const bd = parseClaudeOpusDate(b) || 0;
    if (ad !== bd) return ad - bd;
    return a.localeCompare(b);
  });

  return candidates[candidates.length - 1];
};

const refreshOpenAICodexModel = async (openaiKey) => {
  if (!openaiKey) return null;
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${openaiKey}`
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const modelId = pickLatestCodexModel(data?.data || []);
  if (modelId) {
    setEntry("openai", "codex", modelId);
  }
  return modelId;
};

const refreshAnthropicOpusModel = async (anthropicKey) => {
  if (!anthropicKey) return null;
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01"
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const modelId = pickLatestClaudeOpusModel(data?.data || []);
  if (modelId) {
    setEntry("anthropic", "opus", modelId);
  }
  return modelId;
};

export const kickoffModelRefresh = ({ openaiKey, anthropicKey } = {}) => {
  if (openaiKey && shouldRefresh("openai:codex") && !refreshInFlight["openai:codex"]) {
    lastRefreshAt["openai:codex"] = Date.now();
    refreshInFlight["openai:codex"] = refreshOpenAICodexModel(openaiKey)
      .catch(() => null)
      .finally(() => {
        refreshInFlight["openai:codex"] = null;
      });
  }

  if (anthropicKey && shouldRefresh("anthropic:opus") && !refreshInFlight["anthropic:opus"]) {
    lastRefreshAt["anthropic:opus"] = Date.now();
    refreshInFlight["anthropic:opus"] = refreshAnthropicOpusModel(anthropicKey)
      .catch(() => null)
      .finally(() => {
        refreshInFlight["anthropic:opus"] = null;
      });
  }
};

export const getLatestOpenAICodexModelId = (openaiKey, fallback = "gpt-5.2-codex") => {
  const entry = getEntry("openai", "codex");
  const resolved = entry?.modelId || fallback;
  if (!entry || isStale(entry)) {
    kickoffModelRefresh({ openaiKey });
  }
  return resolved;
};

export const getLatestAnthropicOpusModelId = (anthropicKey, fallback = "claude-opus-4-5-20251101") => {
  const entry = getEntry("anthropic", "opus");
  const resolved = entry?.modelId || fallback;
  if (!entry || isStale(entry)) {
    kickoffModelRefresh({ anthropicKey });
  }
  return resolved;
};

loadRegistry();
