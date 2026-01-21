import fetch from "node-fetch";

/**
 * Multi-Model AI Service for BACKBONE
 * Supports: Claude (primary), GPT-5 mini (lightweight), GPT-5.2 (agentic)
 * Uses Claude Code for background agentic work
 */

export const getMultiAIConfig = () => {
  return {
    // Claude (Primary for complex reasoning)
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
      ready: Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)
    },
    // OpenAI GPT-5 mini (lightweight tasks)
    gptMini: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.GPT_MINI_MODEL || "gpt-4o-mini",
      ready: Boolean(process.env.OPENAI_API_KEY)
    },
    // OpenAI GPT-5.2 (agentic tasks)
    gptAgentic: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.GPT_AGENTIC_MODEL || "o3-mini",
      ready: Boolean(process.env.OPENAI_API_KEY)
    },
    // Claude Code (background agentic work)
    claudeCode: {
      enabled: process.env.CLAUDE_CODE_ENABLED === "true",
      workDir: process.env.CLAUDE_CODE_WORKDIR || process.cwd(),
      ready: process.env.CLAUDE_CODE_ENABLED === "true"
    },
    // Recommended primary model
    primaryModel: process.env.PRIMARY_AI_MODEL || "claude",
    ready: Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
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

  const systemPrompt = `You are BACKBONE, an AI life operating system assistant. You help the user manage their life across domains: finance, health, career, education, and personal growth.

Current context:
- Portfolio: ${JSON.stringify(context.portfolio || "Not connected")}
- Health: ${JSON.stringify(context.health || "Not connected")}
- Goals: ${JSON.stringify(context.goals || [])}
- Education: ${JSON.stringify(context.education || "Not detected")}

Be concise, actionable, and honest. Focus on what matters most.`;

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
      system: systemPrompt,
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
 * Send message to GPT mini (lightweight tasks)
 */
export const sendToGPTMini = async (message, context = {}) => {
  const config = getMultiAIConfig();
  if (!config.gptMini.ready) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.gptMini.apiKey}`
    },
    body: JSON.stringify({
      model: config.gptMini.model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant for quick tasks. Be concise."
        },
        { role: "user", content: message }
      ],
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GPT Mini API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
};

/**
 * Send message to GPT agentic model (complex tasks)
 */
export const sendToGPTAgentic = async (message, context = {}) => {
  const config = getMultiAIConfig();
  if (!config.gptAgentic.ready) {
    throw new Error("OpenAI API key not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.gptAgentic.apiKey}`
    },
    body: JSON.stringify({
      model: config.gptAgentic.model,
      messages: [
        {
          role: "system",
          content: `You are an agentic AI assistant for complex multi-step tasks. You can reason through problems step by step and provide detailed solutions.

Context: ${JSON.stringify(context)}`
        },
        { role: "user", content: message }
      ],
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GPT Agentic API error: ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
};

/**
 * Intelligent routing - picks the best model for the task
 */
export const sendMessage = async (message, context = {}, taskType = "auto") => {
  const config = getMultiAIConfig();

  // Auto-detect task type
  if (taskType === "auto") {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("plan") ||
      lowerMessage.includes("analyze") ||
      lowerMessage.includes("strategy") ||
      lowerMessage.includes("deep") ||
      message.length > 500
    ) {
      taskType = "complex";
    } else if (
      lowerMessage.includes("quick") ||
      lowerMessage.includes("simple") ||
      lowerMessage.includes("format") ||
      message.length < 100
    ) {
      taskType = "simple";
    } else {
      taskType = "standard";
    }
  }

  // Route to appropriate model
  switch (taskType) {
    case "simple":
      if (config.gptMini.ready) {
        return { model: "gpt-mini", response: await sendToGPTMini(message, context) };
      }
      break;

    case "complex":
    case "agentic":
      if (config.claude.ready) {
        return { model: "claude", response: await sendToClaude(message, context) };
      }
      if (config.gptAgentic.ready) {
        return { model: "gpt-agentic", response: await sendToGPTAgentic(message, context) };
      }
      break;

    case "standard":
    default:
      if (config.claude.ready) {
        return { model: "claude", response: await sendToClaude(message, context) };
      }
      if (config.gptMini.ready) {
        return { model: "gpt-mini", response: await sendToGPTMini(message, context) };
      }
      break;
  }

  throw new Error("No AI models available. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env");
};

/**
 * Execute background task with Claude Code
 */
export const executeClaudeCodeTask = async (task, workDir) => {
  const config = getMultiAIConfig();
  if (!config.claudeCode.ready) {
    return { success: false, error: "Claude Code not enabled" };
  }

  // Claude Code integration via subprocess
  // This requires Claude Code CLI to be installed and authenticated
  const { spawn } = await import("child_process");

  return new Promise((resolve) => {
    const claude = spawn("claude", ["--print", task], {
      cwd: workDir || config.claudeCode.workDir,
      shell: true
    });

    let output = "";
    let error = "";

    claude.stdout.on("data", (data) => {
      output += data.toString();
    });

    claude.stderr.on("data", (data) => {
      error += data.toString();
    });

    claude.on("close", (code) => {
      resolve({
        success: code === 0,
        output,
        error,
        exitCode: code
      });
    });

    claude.on("error", (err) => {
      resolve({
        success: false,
        error: err.message
      });
    });
  });
};

/**
 * Get AI model status
 */
export const getAIStatus = () => {
  const config = getMultiAIConfig();

  return {
    claude: {
      ready: config.claude.ready,
      model: config.claude.model,
      status: config.claude.ready ? "Connected" : "Missing ANTHROPIC_API_KEY"
    },
    gptMini: {
      ready: config.gptMini.ready,
      model: config.gptMini.model,
      status: config.gptMini.ready ? "Connected" : "Missing OPENAI_API_KEY"
    },
    gptAgentic: {
      ready: config.gptAgentic.ready,
      model: config.gptAgentic.model,
      status: config.gptAgentic.ready ? "Connected" : "Missing OPENAI_API_KEY"
    },
    claudeCode: {
      ready: config.claudeCode.ready,
      workDir: config.claudeCode.workDir,
      status: config.claudeCode.ready ? "Enabled" : "Set CLAUDE_CODE_ENABLED=true"
    },
    primaryModel: config.primaryModel,
    anyAvailable: config.ready
  };
};
