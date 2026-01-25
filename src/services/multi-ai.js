import fetch from "node-fetch";
import { getAPIQuotaMonitor } from "./api-quota-monitor.js";
import { hasValidCredentials as hasCodexCredentials } from "./codex-oauth.js";

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
  // gpt-5.2-codex: Interactive coding products; full spectrum of coding tasks (Pro/Max)
  GPT52_CODEX: {
    id: "gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    shortName: "GPT-5.2 Codex",
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
  CLAUDE_OPUS: {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    shortName: "Opus 4.5",
    icon: "◈",
    color: "#dc2626",
    description: "Maximum capability",
    maxTokens: 4096,
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

// Current model state (for display)
let currentModel = MODELS.GPT5_MINI;
let lastTaskType = TASK_TYPES.STANDARD;

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
    // GPT-5.2 Codex: Full spectrum coding (Pro/Max subscription)
    gptCodex: {
      model: MODELS.GPT52_CODEX.id,
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

  const basePrompt = `You are BACKBONE, an AI life operating system assistant. You help the user manage their life across domains: finance, health, career, education, and personal growth.

Current context:
- Portfolio: ${JSON.stringify(context.portfolio || "Not connected")}
- Health: ${JSON.stringify(context.health || "Not connected")}
- Goals: ${JSON.stringify(context.goals || [])}
- Education: ${JSON.stringify(context.education || "Not detected")}

Be concise, actionable, and honest. Focus on what matters most.`;

  if (taskType === TASK_TYPES.CODING) {
    return basePrompt + "\n\nYou are in coding mode. Provide clean, well-documented code with explanations.";
  }
  if (taskType === TASK_TYPES.COMPLEX || taskType === TASK_TYPES.AGENTIC) {
    return basePrompt + "\n\nThink step by step. Break down complex problems into manageable parts.";
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
      const quotaError = new Error(`OpenAI API error: ${errorText}`);
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
      throw new Error(`OpenAI API error: ${errorText}`);
    }
  }

  if (!response.ok) {
    const error = await response.text();

    // Check for quota exceeded errors
    const quotaMonitor = getAPIQuotaMonitor();
    const quotaCheck = quotaMonitor.parseAPIError(error, "openai");

    if (quotaCheck.isQuotaError) {
      // Create a special error that can be identified by callers
      const quotaError = new Error(`OpenAI API error: ${error}`);
      quotaError.isQuotaExceeded = true;
      quotaError.provider = "openai";
      quotaError.billingUrl = quotaCheck.billingUrl;
      quotaError.displayMessage = quotaCheck.displayMessage;
      throw quotaError;
    }

    throw new Error(`OpenAI API error: ${error}`);
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

  // Route to appropriate model
  let modelConfig;
  let modelKey;

  switch (taskType) {
    case TASK_TYPES.INSTANT:
    case TASK_TYPES.ROUTING:
      // Use GPT-5 Mini for fast routing decisions and quick tasks
      if (config.gptMini.ready) {
        modelConfig = config.gptMini;
        modelKey = "gpt-5-mini";
        currentModel = MODELS.GPT5_MINI;
      } else if (config.gptNano?.ready) {
        // Fall back to Nano for simple tasks
        modelConfig = config.gptNano;
        modelKey = "gpt-5-nano";
        currentModel = MODELS.GPT5_NANO;
      }
      break;

    case TASK_TYPES.RESEARCH:
      // Use GPT-5.2 Pro for in-depth research and analysis
      if (config.gptPro?.ready) {
        modelConfig = config.gptPro;
        modelKey = "gpt-5.2-pro";
        currentModel = MODELS.GPT52_PRO;
      } else if (config.gpt52?.ready) {
        // Fall back to GPT-5.2 if Pro not available
        modelConfig = config.gpt52;
        modelKey = "gpt-5.2";
        currentModel = MODELS.GPT52;
      } else if (config.claude.ready) {
        currentModel = MODELS.CLAUDE_OPUS;
        return {
          model: "claude",
          modelInfo: MODELS.CLAUDE_OPUS,
          taskType,
          response: await sendToClaude(message, context)
        };
      }
      break;

    case TASK_TYPES.CODING:
      // Use GPT-5.2 Codex for coding tasks (if Pro/Max subscription available)
      if (config.gptCodex?.ready) {
        modelConfig = config.gptCodex;
        modelKey = "gpt-5.2-codex";
        currentModel = MODELS.GPT52_CODEX;
      } else if (config.gpt52?.ready) {
        // Fall back to GPT-5.2 for coding
        modelConfig = config.gpt52;
        modelKey = "gpt-5.2";
        currentModel = MODELS.GPT52;
      } else if (config.claude.ready) {
        currentModel = MODELS.CLAUDE_SONNET;
        return {
          model: "claude",
          modelInfo: MODELS.CLAUDE_SONNET,
          taskType,
          response: await sendToClaude(message, context)
        };
      }
      break;

    case TASK_TYPES.STANDARD:
    default:
      // Use GPT-5 Mini for standard tasks (balanced cost/performance)
      if (config.gptMini?.ready) {
        modelConfig = config.gptMini;
        modelKey = "gpt-5-mini";
        currentModel = MODELS.GPT5_MINI;
      } else if (config.claude.ready) {
        currentModel = MODELS.CLAUDE_SONNET;
        return {
          model: "claude",
          modelInfo: MODELS.CLAUDE_SONNET,
          taskType,
          response: await sendToClaude(message, context)
        };
      }
      break;
  }

  if (!modelConfig) {
    throw new Error("No AI models available. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env");
  }

  const result = await sendToOpenAI(message, context, modelConfig, taskType);

  return {
    model: modelKey,
    modelInfo: currentModel,
    taskType,
    response: result.content,
    usage: result.usage
  };
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
 * Detect if a task requires agentic execution (file changes, code, etc.)
 */
export const isAgenticTask = (message) => {
  const lower = message.toLowerCase();
  const agenticIndicators = [
    "create a file", "write a file", "make a file",
    "create a function", "write code", "implement",
    "build", "fix the bug", "fix this", "refactor",
    "update the", "modify the", "change the",
    "add a feature", "remove the", "delete the",
    "run tests", "execute", "deploy",
    "set up", "configure", "install"
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
  const args = capabilities.claudeCode
    ? ["--print", "--dangerously-skip-permissions", task]
    : ["--task", task];

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: workDir || process.cwd(),
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0" }
    });

    let output = "";
    let error = "";

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      if (onOutput) onOutput({ type: "stdout", text, output });
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      error += text;
      if (onOutput) onOutput({ type: "stderr", text, error });
    });

    proc.on("close", (code) => {
      if (onOutput) onOutput({ type: "done", code, output, error });
      resolve({
        success: code === 0,
        output,
        error,
        exitCode: code,
        tool: command
      });
    });

    proc.on("error", (err) => {
      if (onOutput) onOutput({ type: "error", error: err.message });
      resolve({
        success: false,
        error: err.message,
        output: ""
      });
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
    // GPT-5.2 Codex (coding, Pro/Max subscription)
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
      status: config.claudeCode.ready ? "Enabled" : "Set CLAUDE_CODE_ENABLED=true"
    },
    codexAvailable: config.codexAvailable,
    currentModel,
    lastTaskType,
    primaryModel: config.primaryModel,
    anyAvailable: config.ready && (!openaiQuotaExceeded || !claudeQuotaExceeded),
    quotaStatus: {
      openai: quotaStatus.openai,
      anthropic: quotaStatus.anthropic
    }
  };
};
