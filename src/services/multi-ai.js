import fetch from "node-fetch";

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
  GPT52_INSTANT: {
    id: "gpt-5.2-chat-latest",
    fallbackId: "gpt-4o-mini",  // Fallback for older API keys
    name: "GPT-5.2 Instant",
    shortName: "5.2 Instant",
    icon: "⚡",
    color: "#10a37f",
    description: "Fast responses, quick tasks",
    maxTokens: 2000,
    contextWindow: 400000,
    pricing: { input: 1.75, output: 14 } // per 1M tokens
  },
  GPT52_THINKING: {
    id: "gpt-5.2",
    fallbackId: "gpt-4o",  // Fallback for older API keys
    name: "GPT-5.2 Thinking",
    shortName: "5.2 Think",
    icon: "🧠",
    color: "#8b5cf6",
    description: "Complex reasoning, coding, analysis",
    maxTokens: 4000,
    contextWindow: 400000,
    pricing: { input: 1.75, output: 14 }
  },
  GPT52_PRO: {
    id: "gpt-5.2-pro",
    fallbackId: "gpt-4o",
    name: "GPT-5.2 Pro",
    shortName: "5.2 Pro",
    icon: "💎",
    color: "#f59e0b",
    description: "Maximum quality for difficult problems",
    maxTokens: 8000,
    contextWindow: 400000,
    pricing: { input: 3.50, output: 28 }
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
  STANDARD: "standard",    // Normal conversations
  COMPLEX: "complex",      // Analysis, planning, reasoning
  CODING: "coding",        // Code generation, debugging
  AGENTIC: "agentic"       // Multi-step autonomous tasks
};

// Current model state (for display)
let currentModel = MODELS.GPT52_INSTANT;
let lastTaskType = TASK_TYPES.STANDARD;

export const getMultiAIConfig = () => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  return {
    // OpenAI GPT-5.2 Instant (fast tasks)
    gptInstant: {
      apiKey: openaiKey,
      model: MODELS.GPT52_INSTANT.id,
      modelInfo: MODELS.GPT52_INSTANT,
      ready: Boolean(openaiKey)
    },
    // OpenAI GPT-5.2 Thinking (complex reasoning)
    gptThinking: {
      apiKey: openaiKey,
      model: MODELS.GPT52_THINKING.id,
      modelInfo: MODELS.GPT52_THINKING,
      ready: Boolean(openaiKey)
    },
    // OpenAI GPT-5.2 Pro (maximum quality)
    gptPro: {
      apiKey: openaiKey,
      model: MODELS.GPT52_PRO.id,
      modelInfo: MODELS.GPT52_PRO,
      ready: Boolean(openaiKey)
    },
    // Claude (alternative for complex tasks)
    claude: {
      apiKey: anthropicKey,
      model: process.env.CLAUDE_MODEL || MODELS.CLAUDE_SONNET.id,
      modelInfo: MODELS.CLAUDE_SONNET,
      ready: Boolean(anthropicKey)
    },
    // Legacy compatibility
    gptMini: {
      apiKey: openaiKey,
      model: MODELS.GPT52_INSTANT.id,
      ready: Boolean(openaiKey)
    },
    gptAgentic: {
      apiKey: openaiKey,
      model: MODELS.GPT52_THINKING.id,
      ready: Boolean(openaiKey)
    },
    // Claude Code (background agentic work)
    claudeCode: {
      enabled: process.env.CLAUDE_CODE_ENABLED === "true",
      workDir: process.env.CLAUDE_CODE_WORKDIR || process.cwd(),
      ready: process.env.CLAUDE_CODE_ENABLED === "true"
    },
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
 */
const getSystemPrompt = (context, taskType) => {
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
    // Check if it's a model not found error
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
    throw new Error(`OpenAI API error: ${error}`);
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
      // Use GPT-5.2 Instant for fast responses
      if (config.gptInstant.ready) {
        modelConfig = config.gptInstant;
        modelKey = "gpt-5.2-instant";
        currentModel = MODELS.GPT52_INSTANT;
      }
      break;

    case TASK_TYPES.CODING:
    case TASK_TYPES.COMPLEX:
    case TASK_TYPES.AGENTIC:
      // Use GPT-5.2 Thinking for complex tasks
      if (config.gptThinking.ready) {
        modelConfig = config.gptThinking;
        modelKey = "gpt-5.2-thinking";
        currentModel = MODELS.GPT52_THINKING;
      } else if (config.claude.ready) {
        // Fall back to Claude for complex tasks
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
      // Use GPT-5.2 Instant for standard tasks (fast)
      if (config.gptInstant.ready) {
        modelConfig = config.gptInstant;
        modelKey = "gpt-5.2-instant";
        currentModel = MODELS.GPT52_INSTANT;
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

  return {
    gptInstant: {
      ready: config.gptInstant.ready,
      model: MODELS.GPT52_INSTANT.id,
      modelInfo: MODELS.GPT52_INSTANT,
      status: config.gptInstant.ready ? "Connected" : "Missing OPENAI_API_KEY"
    },
    gptThinking: {
      ready: config.gptThinking.ready,
      model: MODELS.GPT52_THINKING.id,
      modelInfo: MODELS.GPT52_THINKING,
      status: config.gptThinking.ready ? "Connected" : "Missing OPENAI_API_KEY"
    },
    claude: {
      ready: config.claude.ready,
      model: config.claude.model,
      modelInfo: MODELS.CLAUDE_SONNET,
      status: config.claude.ready ? "Connected" : "Missing ANTHROPIC_API_KEY"
    },
    claudeCode: {
      ready: config.claudeCode.ready,
      workDir: config.claudeCode.workDir,
      status: config.claudeCode.ready ? "Enabled" : "Set CLAUDE_CODE_ENABLED=true"
    },
    currentModel,
    lastTaskType,
    primaryModel: config.primaryModel,
    anyAvailable: config.ready
  };
};
