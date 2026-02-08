import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { getAPIQuotaMonitor } from "../api-quota-monitor.js";
import { hasValidCredentials as hasCodexCredentials } from "./codex-oauth.js";
import { getClaudeCodeStatus, runClaudeCodeStreaming } from "./claude-code-cli.js";
import { getLatestOpenAICodexModelId, kickoffModelRefresh } from "./model-registry.js";

import { dataFile } from "../paths.js";
// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMIT TRACKING - Track "wait until" times for each model
// ═══════════════════════════════════════════════════════════════════════════

const RATE_LIMIT_FILE = dataFile("ai-rate-limits.json");

// In-memory rate limit state
let rateLimits = {};

// Load rate limits from disk
const loadRateLimits = () => {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      rateLimits = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, "utf-8"));
    }
  } catch {
    rateLimits = {};
  }
};

// Save rate limits to disk
const saveRateLimits = () => {
  try {
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(rateLimits, null, 2));
  } catch { /* ignore */ }
};

// Check if model is rate limited
const isRateLimited = (modelId) => {
  const limit = rateLimits[modelId];
  if (!limit) return false;
  const waitUntil = new Date(limit.waitUntil).getTime();
  return Date.now() < waitUntil;
};

// Set rate limit for a model
const setRateLimit = (modelId, waitUntilTime) => {
  rateLimits[modelId] = {
    waitUntil: waitUntilTime,
    setAt: new Date().toISOString()
  };
  saveRateLimits();
  console.log(`[MultiAI] Rate limit set for ${modelId} until ${waitUntilTime}`);
};

// Clear rate limit for a model
const clearRateLimit = (modelId) => {
  delete rateLimits[modelId];
  saveRateLimits();
};

// Parse rate limit time from error message
const parseRateLimitTime = (errorMessage) => {
  // Look for patterns like "try again in 30 seconds", "wait until 2026-02-06T19:00:00"
  const secondsMatch = errorMessage.match(/(\d+)\s*seconds?/i);
  if (secondsMatch) {
    return new Date(Date.now() + parseInt(secondsMatch[1], 10) * 1000).toISOString();
  }

  const minutesMatch = errorMessage.match(/(\d+)\s*minutes?/i);
  if (minutesMatch) {
    return new Date(Date.now() + parseInt(minutesMatch[1], 10) * 60 * 1000).toISOString();
  }

  const hoursMatch = errorMessage.match(/(\d+)\s*hours?/i);
  if (hoursMatch) {
    return new Date(Date.now() + parseInt(hoursMatch[1], 10) * 60 * 60 * 1000).toISOString();
  }

  // ISO timestamp
  const isoMatch = errorMessage.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Default: 5 minutes
  return new Date(Date.now() + 5 * 60 * 1000).toISOString();
};

// Initialize rate limits
loadRateLimits();

/**
 * Parse OpenAI API error response and return a clean message
 */
const parseOpenAIError = (errorText) => {
  try {
    const parsed = JSON.parse(errorText);
    if (parsed.error) {
      const err = parsed.error;
      // Common error types with friendly messages
      if (err.code === "insufficient_quota") {
        return "OpenAI quota exceeded. Please check your billing at platform.openai.com";
      }
      if (err.code === "invalid_api_key") {
        return "Invalid OpenAI API key. Please check your key in /models";
      }
      if (err.code === "rate_limit_exceeded") {
        return "Rate limit exceeded. Please wait a moment and try again.";
      }
      if (err.code === "model_not_found") {
        return `Model not available: ${err.message || "unknown model"}`;
      }
      // Return the error message if available
      return err.message || err.code || "Unknown OpenAI error";
    }
  } catch {
    // Not JSON, return truncated text
  }
  // Fallback: truncate raw error
  return errorText.length > 100 ? errorText.slice(0, 100) + "..." : errorText;
};

/**
 * Multi-Model AI Service for BACKBONE
 *
 * Model Routing:
 * - GPT-5.2 Instant: Fast responses, quick tasks, low latency
 * - GPT-5.2 Thinking: Complex reasoning, coding, analysis, planning
 * - Claude: Alternative for complex tasks (if configured)
 *
 * API Model IDs (January 2026):
 * - gpt-5.2-chat-latest (Instant) - Fast, everyday tasks
 * - gpt-5.2 (Thinking) - Complex reasoning, coding
 * - gpt-5.2-pro (Pro) - Maximum quality (Responses API only)
 */

// Model definitions with display info
// Primary models (GPT-5.2) with fallbacks (GPT-4o) for older API keys
export const MODELS = {
  // gpt-5-nano: High-throughput tasks, simple instruction-following or classification
  GPT5_NANO: {
    id: "gpt-5-nano",
    fallbackId: "gpt-4o-mini",
    name: "GPT-5 Nano",
    shortName: "GPT-5 Nano",
    icon: "⚡",
    color: "#06b6d4",
    description: "High-throughput, simple tasks, classification",
    maxTokens: 2000,
    contextWindow: 128000,
    pricing: { input: 0.50, output: 2 }
  },
  // gpt-5-mini: Cost-optimized reasoning and chat; balances speed, cost, and capability
  GPT5_MINI: {
    id: "gpt-5-mini",
    fallbackId: "gpt-4o-mini",
    name: "GPT-5 Mini",
    shortName: "GPT-5 Mini",
    icon: "💨",
    color: "#10a37f",
    description: "Cost-optimized reasoning and chat",
    maxTokens: 4000,
    contextWindow: 256000,
    pricing: { input: 1, output: 4 }
  },
  // gpt-5.2: Complex reasoning, broad world knowledge, code-heavy or multi-step agentic tasks
  GPT52: {
    id: "gpt-5.2",
    fallbackId: "gpt-4o",
    name: "GPT-5.2",
    shortName: "GPT-5.2",
    icon: "🧠",
    color: "#8b5cf6",
    description: "Complex reasoning, agentic tasks, coding",
    maxTokens: 8000,
    contextWindow: 400000,
    pricing: { input: 1.75, output: 14 }
  },
  // gpt-5.2-pro: Tough problems that may take longer to solve but require harder thinking
  GPT52_PRO: {
    id: "gpt-5.2-pro",
    fallbackId: "gpt-4o",
    name: "GPT-5.2 Pro",
    shortName: "GPT-5.2 Pro",
    icon: "💎",
    color: "#f59e0b",
    description: "Tough problems, harder thinking, longer reasoning",
    maxTokens: 16000,
    contextWindow: 400000,
    pricing: { input: 3.50, output: 28 }
  },
  // gpt-5.x-codex: Interactive coding products; full spectrum of coding tasks (Pro/Max)
  GPT52_CODEX: {
    id: "codex-latest",
    name: "Codex (Latest)",
    shortName: "Codex",
    icon: "🔮",
    color: "#a855f7",
    description: "Full spectrum coding tasks (Pro/Max subscription)",
    maxTokens: 32000,
    contextWindow: 1000000,
    requiresCodex: true,
    pricing: { input: 0, output: 0 }  // Included in Pro/Max subscription
  },
  CLAUDE_SONNET: {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    shortName: "Sonnet 4",
    icon: "◈",
    color: "#d97706",
    description: "Balanced performance",
    maxTokens: 4096,
    contextWindow: 200000
  },
  CLAUDE_OPUS_46: {
    id: "claude-opus-4-6-20260115",  // Hypothetical Opus 4.6 model ID
    name: "Claude Opus 4.6",
    shortName: "Opus 4.6",
    icon: "◈",
    color: "#b91c1c",
    description: "Latest maximum capability",
    maxTokens: 8192,
    contextWindow: 300000
  },
  CLAUDE_OPUS: {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    shortName: "Opus 4.5",
    icon: "◈",
    color: "#dc2626",
    description: "Maximum capability",
    maxTokens: 4096,
    contextWindow: 200000
  },
  CLAUDE_CODE_CLI: {
    id: "claude-code-cli",
    name: "Claude Code CLI",
    shortName: "Claude Code",
    icon: "◇",
    color: "#f59e0b",
    description: "Agentic engine powered by Claude Code CLI",
    maxTokens: 32000,
    contextWindow: 200000
  }
};

// Task types for routing
export const TASK_TYPES = {
  INSTANT: "instant",      // Quick questions, simple tasks
  ROUTING: "routing",      // Fast routing decisions (use Instant)
  STANDARD: "standard",    // Normal conversations
  COMPLEX: "complex",      // Analysis, planning, reasoning
  CODING: "coding",        // Code generation, debugging
  AGENTIC: "agentic",      // Multi-step autonomous tasks (use Thinking)
  RESEARCH: "research"     // In-depth research and analysis (use Pro)
};

// Current model state (for display) — Claude Code CLI is the primary engine
let currentModel = MODELS.CLAUDE_CODE_CLI;
let lastTaskType = TASK_TYPES.AGENTIC;

// Check if Codex OAuth is available
const isCodexAvailable = () => {
  try {
    return hasCodexCredentials();
  } catch (e) {
    return false;
  }
};

export const getMultiAIConfig = () => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  const codexAvailable = isCodexAvailable();
  kickoffModelRefresh({ openaiKey, anthropicKey });

  return {
    // GPT-5 Nano: High-throughput, simple tasks, classification
    gptNano: {
      apiKey: openaiKey,
      model: MODELS.GPT5_NANO.id,
      modelInfo: MODELS.GPT5_NANO,
      ready: Boolean(openaiKey)
    },
    // GPT-5 Mini: Cost-optimized reasoning and chat (fast routing)
    gptMini: {
      apiKey: openaiKey,
      model: MODELS.GPT5_MINI.id,
      modelInfo: MODELS.GPT5_MINI,
      ready: Boolean(openaiKey)
    },
    // GPT-5.2: Complex reasoning, agentic tasks (main model)
    gpt52: {
      apiKey: openaiKey,
      model: MODELS.GPT52.id,
      modelInfo: MODELS.GPT52,
      ready: Boolean(openaiKey)
    },
    // GPT-5.2 Pro: Tough problems, longer reasoning (research)
    gptPro: {
      apiKey: openaiKey,
      model: MODELS.GPT52_PRO.id,
      modelInfo: MODELS.GPT52_PRO,
      ready: Boolean(openaiKey)
    },
    // Codex: Full spectrum coding (Pro/Max subscription)
    gptCodex: {
      model: getLatestOpenAICodexModelId(openaiKey),
      modelInfo: MODELS.GPT52_CODEX,
      ready: codexAvailable,
      requiresCodex: true
    },
    // Legacy aliases for backwards compatibility
    gptInstant: {
      apiKey: openaiKey,
      model: MODELS.GPT5_MINI.id,
      modelInfo: MODELS.GPT5_MINI,
      ready: Boolean(openaiKey)
    },
    gptThinking: {
      apiKey: openaiKey,
      model: MODELS.GPT52.id,
      modelInfo: MODELS.GPT52,
      ready: Boolean(openaiKey)
    },
    gptAgentic: {
      apiKey: openaiKey,
      model: MODELS.GPT52.id,
      modelInfo: MODELS.GPT52,
      ready: Boolean(openaiKey)
    },
    // Claude (alternative for complex tasks)
    claude: {
      apiKey: anthropicKey,
      model: process.env.CLAUDE_MODEL || MODELS.CLAUDE_SONNET.id,
      modelInfo: MODELS.CLAUDE_SONNET,
      ready: Boolean(anthropicKey)
    },
    // Claude Code (background agentic work)
    claudeCode: {
      enabled: process.env.CLAUDE_CODE_ENABLED === "true",
      workDir: process.env.CLAUDE_CODE_WORKDIR || process.cwd(),
      ready: process.env.CLAUDE_CODE_ENABLED === "true"
    },
    // Codex availability flag
    codexAvailable,
    primaryModel: process.env.PRIMARY_AI_MODEL || (openaiKey ? "openai" : "claude"),
    ready: Boolean(openaiKey || anthropicKey)
  };
};

/**
 * Get current model info for display
 */
export const getCurrentModel = () => ({
  model: currentModel,
  taskType: lastTaskType
});

/**
 * BACKBONE system prompt
 * If context.systemPrompt is provided, use that instead (for AI Brain custom prompts)
 */
const getSystemPrompt = (context, taskType) => {
  // Allow custom system prompt from AI Brain or other advanced callers
  if (context.systemPrompt) {
    return context.systemPrompt;
  }

  // Get user name from context
  const userName = context.user?.displayName?.split(" ")[0] ||
                   context.linkedIn?.details?.name?.split(" ")[0] ||
                   context.profile?.name?.split(" ")[0] ||
                   "User";

  // Build rich context summary
  let contextSummary = "";

  // LinkedIn/Profile info
  if (context.linkedIn?.summary) {
    contextSummary += `\n\nUSER PROFILE:\n${context.linkedIn.summary.slice(0, 800)}`;
  } else if (context.linkedIn?.details) {
    const li = context.linkedIn.details;
    contextSummary += `\n\nUSER: ${li.name || userName}`;
    if (li.headline) contextSummary += ` - ${li.headline}`;
    if (li.currentRole) contextSummary += `\nRole: ${li.currentRole} at ${li.currentCompany || "Unknown"}`;
  }

  // Portfolio
  if (context.portfolio?.equity) {
    contextSummary += `\n\nPORTFOLIO: $${context.portfolio.equity.toLocaleString()} equity`;
    if (context.portfolio.dayPL) {
      const sign = context.portfolio.dayPL >= 0 ? "+" : "";
      contextSummary += ` (${sign}$${context.portfolio.dayPL.toFixed(0)} today)`;
    }
    if (context.portfolio.positions?.length) {
      const topPos = context.portfolio.positions.slice(0, 3).map(p => p.symbol).join(", ");
      contextSummary += `\nTop holdings: ${topPos}`;
    }
  }

  // Health
  if (context.health) {
    const h = context.health;
    contextSummary += `\n\nHEALTH:`;
    if (h.sleepScore) contextSummary += ` Sleep ${h.sleepScore}`;
    if (h.readinessScore) contextSummary += ` | Readiness ${h.readinessScore}`;
    if (h.steps) contextSummary += ` | ${h.steps.toLocaleString()} steps`;
  }

  // Goals
  if (context.goals?.length > 0) {
    const goalList = context.goals.slice(0, 3).map(g => `- ${g.title || g}`).join("\n");
    contextSummary += `\n\nGOALS:\n${goalList}`;
  }

  // Life scores
  if (context.lifeScores?.overall) {
    contextSummary += `\n\nLIFE SCORE: ${context.lifeScores.overall}%`;
  }

  // Projects
  if (context.projects?.length > 0) {
    const projectList = context.projects.slice(0, 3).map(p => `- ${p.name}: ${p.status || "active"}`).join("\n");
    contextSummary += `\n\nPROJECTS:\n${projectList}`;
  }

  const basePrompt = `You are BACKBONE, ${userName}'s personal AI assistant. You know ${userName} well and help with their life: finances, health, career, and goals.

CRITICAL RULES:
1. Be CONCISE - max 3-4 sentences for simple questions
2. Be SPECIFIC - use actual data from context, not generic advice
3. Be HELPFUL - answer the question directly, don't deflect
4. Reference ${userName}'s actual situation (portfolio, health, goals) when relevant
5. Only give longer responses (5+ sentences) for plans, tables, or code
${contextSummary}

If you don't have data about something, say so briefly and suggest how to get it.`;

  if (taskType === TASK_TYPES.CODING) {
    return basePrompt + "\n\nProvide clean, working code with brief explanations.";
  }
  if (taskType === TASK_TYPES.COMPLEX || taskType === TASK_TYPES.AGENTIC) {
    return basePrompt + "\n\nThink step by step for complex problems.";
  }
  return basePrompt;
};

/**
 * Send message to OpenAI GPT-5.2 (with automatic fallback to GPT-4o for older API keys)
 */
const sendToOpenAI = async (message, context = {}, modelConfig, taskType) => {
  const modelId = modelConfig.model;
  const fallbackId = modelConfig.modelInfo?.fallbackId;

  // Try primary model first
  let response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${modelConfig.apiKey}`
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: getSystemPrompt(context, taskType) },
        { role: "user", content: message }
      ],
      max_tokens: modelConfig.modelInfo?.maxTokens || 2000,
      temperature: taskType === TASK_TYPES.CODING ? 0.2 : 0.7
    })
  });

  // If primary model fails (e.g., not available), try fallback
  if (!response.ok && fallbackId) {
    const errorText = await response.text();

    // First check for quota errors - these should NOT fallback to another model
    const quotaMonitor = getAPIQuotaMonitor();
    const quotaCheck = quotaMonitor.parseAPIError(errorText, "openai");

    if (quotaCheck.isQuotaError) {
      // Create a special error that can be identified by callers
      const quotaError = new Error(parseOpenAIError(errorText));
      quotaError.isQuotaExceeded = true;
      quotaError.provider = "openai";
      quotaError.billingUrl = quotaCheck.billingUrl;
      quotaError.displayMessage = quotaCheck.displayMessage;
      throw quotaError;
    }

    // Check if it's a model not found error - these CAN fallback
    if (errorText.includes("model") || errorText.includes("does not exist") || response.status === 404) {
      console.log(`Model ${modelId} not available, falling back to ${fallbackId}`);
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${modelConfig.apiKey}`
        },
        body: JSON.stringify({
          model: fallbackId,
          messages: [
            { role: "system", content: getSystemPrompt(context, taskType) },
            { role: "user", content: message }
          ],
          max_tokens: modelConfig.modelInfo?.maxTokens || 2000,
          temperature: taskType === TASK_TYPES.CODING ? 0.2 : 0.7
        })
      });
    } else {
      throw new Error(parseOpenAIError(errorText));
    }
  }

  if (!response.ok) {
    const error = await response.text();

    // Check for quota exceeded errors
    const quotaMonitor = getAPIQuotaMonitor();
    const quotaCheck = quotaMonitor.parseAPIError(error, "openai");

    if (quotaCheck.isQuotaError) {
      // Create a special error that can be identified by callers
      const quotaError = new Error(parseOpenAIError(error));
      quotaError.isQuotaExceeded = true;
      quotaError.provider = "openai";
      quotaError.billingUrl = quotaCheck.billingUrl;
      quotaError.displayMessage = quotaCheck.displayMessage;
      throw quotaError;
    }

    throw new Error(parseOpenAIError(error));
  }

  // Clear quota exceeded status on successful request
  const quotaMonitor = getAPIQuotaMonitor();
  if (quotaMonitor.isQuotaExceeded("openai")) {
    quotaMonitor.clearQuotaExceeded("openai");
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    usage: data.usage,
    modelUsed: data.model // Track which model was actually used
  };
};

/**
 * Send message to Claude
 */
export const sendToClaude = async (message, context = {}, stream = false) => {
  const config = getMultiAIConfig();
  if (!config.claude.ready) {
    throw new Error("Claude API key not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.claude.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: config.claude.model,
      max_tokens: 1024,
      system: getSystemPrompt(context, TASK_TYPES.STANDARD),
      messages: [{ role: "user", content: message }],
      stream
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  if (stream) {
    return response.body;
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
};

const sendToClaudeCodeCLI = async (message, context = {}, taskType = TASK_TYPES.STANDARD) => {
  const systemPrompt = getSystemPrompt(context, taskType);
  const prompt = `${systemPrompt}\n\nUSER:\n${message}`;
  const stream = await runClaudeCodeStreaming(prompt, { cwd: process.cwd() });

  return new Promise((resolve, reject) => {
    let output = "";
    let done = false;

    const finalize = (result) => {
      if (done) return;
      done = true;
      const finalText = (result?.output || output || "").trim();
      resolve(finalText);
    };

    stream.on("data", (text) => {
      output = text || output;
    });
    stream.on("complete", (result) => finalize(result));
    stream.on("error", (err) => {
      if (done) return;
      done = true;
      reject(new Error(err?.error || "Claude Code CLI error"));
    });
  });
};

/**
 * Auto-detect task type from message
 */
const detectTaskType = (message) => {
  const lower = message.toLowerCase();
  const length = message.length;

  // Coding indicators
  if (
    lower.includes("code") ||
    lower.includes("function") ||
    lower.includes("debug") ||
    lower.includes("implement") ||
    lower.includes("refactor") ||
    /```/.test(message)
  ) {
    return TASK_TYPES.CODING;
  }

  // Complex reasoning indicators
  if (
    lower.includes("analyze") ||
    lower.includes("plan") ||
    lower.includes("strategy") ||
    lower.includes("compare") ||
    lower.includes("explain why") ||
    lower.includes("deep dive") ||
    lower.includes("research") ||
    length > 500
  ) {
    return TASK_TYPES.COMPLEX;
  }

  // Quick/instant indicators
  if (
    lower.includes("quick") ||
    lower.includes("simple") ||
    lower.includes("what is") ||
    lower.includes("how do i") ||
    length < 80
  ) {
    return TASK_TYPES.INSTANT;
  }

  return TASK_TYPES.STANDARD;
};

// ═══════════════════════════════════════════════════════════════════════════
// SMART FALLBACK CHAIN
// Order: Opus 4.6 → Opus 4.5 → Claude CLI → Codex (latest) → GPT 5.2 → Sonnet 4
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_CHAIN = [
  { key: "opus46", modelInfo: MODELS.CLAUDE_OPUS_46, type: "claude" },
  { key: "opus45", modelInfo: MODELS.CLAUDE_OPUS, type: "claude" },
  { key: "claudeCli", modelInfo: MODELS.CLAUDE_CODE_CLI, type: "claudeCli" },
  { key: "codexLatest", modelInfo: MODELS.GPT52_CODEX, type: "openai" },
  { key: "gpt52", modelInfo: MODELS.GPT52, type: "openai" },
  { key: "sonnet4", modelInfo: MODELS.CLAUDE_SONNET, type: "claude" },
];

/**
 * Try sending to a model with rate limit awareness
 * Returns { success, response, error, rateLimited }
 */
const tryModel = async (modelEntry, message, context, taskType) => {
  const modelId = modelEntry.modelInfo.id;

  // Check if rate limited
  if (isRateLimited(modelId)) {
    const limit = rateLimits[modelId];
    console.log(`[MultiAI] ${modelEntry.modelInfo.name} rate limited until ${limit.waitUntil}`);
    return { success: false, rateLimited: true, waitUntil: limit.waitUntil };
  }

  try {
    let response;

    if (modelEntry.type === "claudeCli") {
      const status = await getClaudeCodeStatus();
      if (!status.ready) {
        return { success: false, error: "Claude CLI not ready" };
      }
      response = await sendToClaudeCodeCLI(message, context, taskType);
      currentModel = modelEntry.modelInfo;
      return { success: true, response };
    }

    if (modelEntry.type === "claude") {
      const config = getMultiAIConfig();
      if (!config.claude.ready) {
        return { success: false, error: "Claude API not configured" };
      }
      response = await sendToClaude(message, context, modelEntry.modelInfo.id);
      currentModel = modelEntry.modelInfo;
      return { success: true, response };
    }

    if (modelEntry.type === "openai") {
      const config = getMultiAIConfig();
      if (modelEntry.key === "codexLatest" && !config.gptCodex?.ready) {
        return { success: false, error: "Codex not available" };
      }
      if (!config.gpt52?.ready && !config.gptCodex?.ready) {
        return { success: false, error: "OpenAI not configured" };
      }

      const modelConfig = modelEntry.key === "codexLatest" ? config.gptCodex : config.gpt52;
      const result = await sendToOpenAI(message, context, modelConfig, taskType);
      currentModel = modelEntry.modelInfo;
      return { success: true, response: result.content };
    }

    return { success: false, error: "Unknown model type" };

  } catch (error) {
    const errorMsg = error.message || String(error);

    // Check for billing/credit exhaustion — block for 24h (credits won't auto-replenish)
    const lower = errorMsg.toLowerCase();
    if (lower.includes("credit balance") || lower.includes("billing_error") ||
        lower.includes("insufficient_credit") || lower.includes("billing error")) {
      const waitUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      setRateLimit(modelId, waitUntil);
      console.log(`[MultiAI] ${modelEntry.modelInfo.name} billing exhausted — blocked for 24h, falling back`);
      return { success: false, rateLimited: true, waitUntil, error: errorMsg };
    }

    // Check for rate limit / wait time in error
    if (lower.includes("rate") || lower.includes("wait") ||
        lower.includes("limit") || lower.includes("quota") ||
        lower.includes("overloaded")) {
      const waitUntil = parseRateLimitTime(errorMsg);
      setRateLimit(modelId, waitUntil);
      return { success: false, rateLimited: true, waitUntil, error: errorMsg };
    }

    // Check for model not found
    if (errorMsg.includes("model_not_found") || errorMsg.includes("not found") ||
        errorMsg.includes("does not exist")) {
      console.log(`[MultiAI] ${modelEntry.modelInfo.name} not available: ${errorMsg}`);
      // Set a longer rate limit for unavailable models
      setRateLimit(modelId, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      return { success: false, error: errorMsg };
    }

    return { success: false, error: errorMsg };
  }
};

/**
 * Smart send with automatic fallback chain
 */
const sendWithFallback = async (message, context, taskType) => {
  const errors = [];

  for (const modelEntry of FALLBACK_CHAIN) {
    console.log(`[MultiAI] Trying ${modelEntry.modelInfo.name}...`);

    const result = await tryModel(modelEntry, message, context, taskType);

    if (result.success) {
      // Clear any old rate limit since it worked
      clearRateLimit(modelEntry.modelInfo.id);

      return {
        model: modelEntry.key,
        modelInfo: modelEntry.modelInfo,
        taskType,
        response: result.response
      };
    }

    errors.push({
      model: modelEntry.modelInfo.name,
      error: result.error,
      rateLimited: result.rateLimited,
      waitUntil: result.waitUntil
    });

    console.log(`[MultiAI] ${modelEntry.modelInfo.name} failed: ${result.error || "rate limited"}`);
  }

  // All models failed
  const errorSummary = errors.map(e =>
    `${e.model}: ${e.rateLimited ? `wait until ${e.waitUntil}` : e.error}`
  ).join("; ");

  throw new Error(`All AI models failed: ${errorSummary}`);
};

/**
 * Intelligent routing - picks the best model for the task
 */
export const sendMessage = async (message, context = {}, taskType = "auto") => {
  const config = getMultiAIConfig();

  // Auto-detect task type
  if (taskType === "auto") {
    taskType = detectTaskType(message);
  }
  lastTaskType = taskType;

  // Use smart fallback chain for all requests
  // Fallback order: Opus 4.6 → Opus 4.5 → Claude CLI → Codex (latest) → GPT 5.2 → Sonnet 4
  return sendWithFallback(message, context, taskType);
};

/**
 * Get current rate limit status for all models
 */
export const getRateLimitStatus = () => {
  const status = {};
  for (const entry of FALLBACK_CHAIN) {
    const modelId = entry.modelInfo.id;
    const limit = rateLimits[modelId];
    status[entry.key] = {
      name: entry.modelInfo.name,
      rateLimited: isRateLimited(modelId),
      waitUntil: limit?.waitUntil || null
    };
  }
  return status;
};

/**
 * Clear all rate limits (for testing/reset)
 */
export const clearAllRateLimits = () => {
  rateLimits = {};
  saveRateLimits();
  console.log("[MultiAI] All rate limits cleared");
};

// Legacy exports for compatibility
export const sendToGPTMini = async (message, context = {}) => {
  const result = await sendMessage(message, context, TASK_TYPES.INSTANT);
  return result.response;
};

export const sendToGPTAgentic = async (message, context = {}) => {
  const result = await sendMessage(message, context, TASK_TYPES.COMPLEX);
  return result.response;
};

/**
 * Detect if a task requires agentic execution (file changes, code, commands, analysis)
 * Claude CLI should handle any task that requires:
 * - File operations
 * - Code execution
 * - Running commands/tools
 * - Data analysis
 * - Web searches
 */
export const isAgenticTask = (message) => {
  const lower = message.toLowerCase();
  const agenticIndicators = [
    // File operations
    "create a file", "write a file", "make a file",
    "create a function", "write code", "implement",
    // Code tasks
    "build", "fix the bug", "fix this", "refactor",
    "update the", "modify the", "change the",
    "add a feature", "remove the", "delete the",
    // Execution
    "run tests", "execute", "deploy",
    "set up", "configure", "install",
    // Analysis commands - use Claude CLI for these
    "run analysis", "run full analysis", "analyze stocks", "analyze the stocks",
    "analyze tickers", "full analysis", "stock analysis", "ticker analysis",
    "scan stocks", "scan tickers", "evaluate stocks", "evaluate tickers",
    "refresh tickers", "update tickers", "fetch tickers",
    // Research and data tasks
    "research", "look up", "find out", "search for",
    "get the latest", "check the", "pull data",
    // Action commands
    "send a message", "send message", "send email", "make a trade",
    "buy", "sell", "place order"
  ];
  return agenticIndicators.some(ind => lower.includes(ind));
};

/**
 * Check if agentic tools are available
 */
export const getAgenticCapabilities = async () => {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  const capabilities = {
    claudeCode: false,
    codex: false,
    available: false
  };

  // Check for Claude Code CLI
  try {
    await execAsync("claude --version", { timeout: 5000 });
    capabilities.claudeCode = true;
    capabilities.available = true;
  } catch {
    // Claude Code not available
  }

  // Check for Codex CLI (OpenAI)
  try {
    await execAsync("codex --version", { timeout: 5000 });
    capabilities.codex = true;
    capabilities.available = true;
  } catch {
    // Codex not available
  }

  return capabilities;
};

/**
 * Execute agentic task with streaming output
 * Uses Claude Code or Codex depending on availability
 */
export const executeAgenticTask = async (task, workDir, onOutput) => {
  const capabilities = await getAgenticCapabilities();

  if (!capabilities.available) {
    return {
      success: false,
      error: "No agentic tools available. Install Claude Code (npm install -g @anthropic-ai/claude-code) or OpenAI Codex.",
      output: ""
    };
  }

  const { spawn } = await import("child_process");

  // Prefer Claude Code, fall back to Codex
  const command = capabilities.claudeCode ? "claude" : "codex";

  // MCP tool prefixes for BACKBONE servers
  const mcpTools = [
    "mcp__backbone-google", "mcp__backbone-linkedin", "mcp__backbone-contacts",
    "mcp__backbone-news", "mcp__backbone-life", "mcp__backbone-health",
    "mcp__backbone-trading", "mcp__backbone-projects",
  ];
  const allowedTools = [
    "Read", "Glob", "Grep", "WebFetch", "WebSearch", "Task",
    "Write", "Edit", "Bash", ...mcpTools
  ];

  // For Claude Code, use -p flag with stream-json and MCP tools
  // Pass message via stdin to avoid shell escaping issues on Windows
  const useStdin = capabilities.claudeCode && process.platform === "win32";
  const args = capabilities.claudeCode
    ? [
        "-p",
        "--verbose",
        "--output-format", "stream-json",
        "--dangerously-skip-permissions",
        "--allowedTools", allowedTools.join(","),
        ...(useStdin ? [] : [task])
      ]
    : ["--task", task];

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: workDir || process.cwd(),
      shell: true,
      stdio: useStdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" }
    });

    // On Windows, write task to stdin to avoid escaping issues
    if (useStdin && proc.stdin) {
      proc.stdin.write(task);
      proc.stdin.end();
    }

    let output = "";
    let finalText = "";
    let error = "";
    let resolved = false;
    let lineBuffer = "";

    // Parse a stream-json line and emit structured events
    const processStreamLine = (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        switch (msg.type) {
          case "assistant": {
            const text = msg.message?.content?.[0]?.text || msg.content?.[0]?.text || "";
            if (text) {
              finalText = text;
              output = text;
              if (onOutput) onOutput({ type: "stdout", text, output: text });
            }
            break;
          }
          case "tool_use": {
            const tool = msg.tool?.name || msg.name || "unknown";
            const input = msg.tool?.input || msg.input || {};
            const toolLine = `[Tool] ${tool}: ${JSON.stringify(input).slice(0, 200)}`;
            if (onOutput) onOutput({ type: "stdout", text: toolLine, output: toolLine });
            break;
          }
          case "tool_result": {
            const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "").slice(0, 300);
            if (onOutput) onOutput({ type: "stdout", text: content, output: content });
            break;
          }
          case "result": {
            const resultText = msg.result || msg.message?.content?.[0]?.text || "";
            if (resultText) {
              finalText = resultText;
              output = resultText;
            }
            break;
          }
        }
      } catch {
        // Not JSON — treat as raw text
        output += line;
        if (onOutput) onOutput({ type: "stdout", text: line, output });
      }
    };

    // Timeout after 3 minutes
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        if (onOutput) onOutput({ type: "error", error: "Timeout after 3 minutes" });
        resolve({
          success: false,
          error: "Request timed out after 3 minutes",
          output: finalText || output
        });
      }
    }, 180000);

    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";
      for (const line of lines) {
        processStreamLine(line);
      }
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      error += text;
      if (onOutput) onOutput({ type: "stderr", text, error });
    });

    proc.on("close", (code) => {
      // Process any remaining buffered line
      if (lineBuffer.trim()) processStreamLine(lineBuffer);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const finalOutput = finalText || output;
        if (onOutput) onOutput({ type: "done", code, output: finalOutput, error });
        resolve({
          success: code === 0,
          output: finalOutput,
          error,
          exitCode: code,
          tool: command
        });
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (onOutput) onOutput({ type: "error", error: err.message });
        resolve({
          success: false,
          error: err.message,
          output: ""
        });
      }
    });
  });
};

/**
 * Execute background task with Claude Code (legacy)
 */
export const executeClaudeCodeTask = async (task, workDir) => {
  return executeAgenticTask(task, workDir, null);
};

/**
 * Get AI model status for display
 */
export const getAIStatus = () => {
  const config = getMultiAIConfig();
  const quotaMonitor = getAPIQuotaMonitor();
  const quotaStatus = quotaMonitor.getStatus();

  // Determine effective status considering quota
  const openaiQuotaExceeded = quotaStatus.openai.quotaExceeded;
  const claudeQuotaExceeded = quotaStatus.anthropic.quotaExceeded;

  const getOpenAIStatus = () => {
    if (!config.gptInstant.ready) return "Missing OPENAI_API_KEY";
    if (openaiQuotaExceeded) return "Tokens Exceeded";
    return "Connected";
  };

  const getClaudeStatus = () => {
    if (!config.claude.ready) return "Missing ANTHROPIC_API_KEY";
    if (claudeQuotaExceeded) return "Tokens Exceeded";
    return "Connected";
  };

  return {
    // GPT-5 Mini (fast routing, cost-optimized)
    gptMini: {
      ready: config.gptMini?.ready && !openaiQuotaExceeded,
      model: MODELS.GPT5_MINI.id,
      modelInfo: MODELS.GPT5_MINI,
      status: getOpenAIStatus(),
      quotaExceeded: openaiQuotaExceeded,
      billingUrl: quotaStatus.openai.billingUrl
    },
    // GPT-5.2 (complex reasoning, agentic)
    gpt52: {
      ready: config.gpt52?.ready && !openaiQuotaExceeded,
      model: MODELS.GPT52.id,
      modelInfo: MODELS.GPT52,
      status: getOpenAIStatus(),
      quotaExceeded: openaiQuotaExceeded,
      billingUrl: quotaStatus.openai.billingUrl
    },
    // GPT-5.2 Pro (research, tough problems)
    gptPro: {
      ready: config.gptPro?.ready && !openaiQuotaExceeded,
      model: MODELS.GPT52_PRO.id,
      modelInfo: MODELS.GPT52_PRO,
      status: getOpenAIStatus(),
      quotaExceeded: openaiQuotaExceeded,
      billingUrl: quotaStatus.openai.billingUrl
    },
    // Codex (coding, Pro/Max subscription)
    gptCodex: {
      ready: config.gptCodex?.ready,
      model: MODELS.GPT52_CODEX.id,
      modelInfo: MODELS.GPT52_CODEX,
      status: config.codexAvailable ? "Connected (Pro/Max)" : "Requires Codex Login",
      requiresCodex: true
    },
    // Legacy aliases
    gptInstant: {
      ready: config.gptMini?.ready && !openaiQuotaExceeded,
      model: MODELS.GPT5_MINI.id,
      modelInfo: MODELS.GPT5_MINI,
      status: getOpenAIStatus(),
      quotaExceeded: openaiQuotaExceeded,
      billingUrl: quotaStatus.openai.billingUrl
    },
    gptThinking: {
      ready: config.gpt52?.ready && !openaiQuotaExceeded,
      model: MODELS.GPT52.id,
      modelInfo: MODELS.GPT52,
      status: getOpenAIStatus(),
      quotaExceeded: openaiQuotaExceeded,
      billingUrl: quotaStatus.openai.billingUrl
    },
    claude: {
      ready: config.claude.ready && !claudeQuotaExceeded,
      model: config.claude.model,
      modelInfo: MODELS.CLAUDE_SONNET,
      status: getClaudeStatus(),
      quotaExceeded: claudeQuotaExceeded,
      billingUrl: quotaStatus.anthropic.billingUrl
    },
    claudeCode: {
      ready: config.claudeCode.ready,
      workDir: config.claudeCode.workDir,
      status: config.claudeCode.ready ? "Running" : "Set CLAUDE_CODE_ENABLED=true",
      modelInfo: MODELS.CLAUDE_CODE_CLI
    },
    codexAvailable: config.codexAvailable,
    currentModel,
    lastTaskType,
    primaryModel: "claude-code",
    anyAvailable: config.ready && (!openaiQuotaExceeded || !claudeQuotaExceeded),
    quotaStatus: {
      openai: quotaStatus.openai,
      anthropic: quotaStatus.anthropic
    }
  };
};
