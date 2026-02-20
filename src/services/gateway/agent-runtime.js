/**
 * Gateway Agent Runtime
 *
 * Bridges the gateway to BACKBONE's agent execution.
 * When a client sends an agent.request through the gateway,
 * this module runs it via Claude Agent SDK or CLI and streams
 * results back through the gateway.
 */

import { EventEmitter } from "events";
import { getGateway, MSG } from "./gateway-server.js";
import { getSessionLogger } from "./session-logger.js";

// ── Agent Runtime ─────────────────────────────────────────────

export class AgentRuntime extends EventEmitter {
  constructor(gateway) {
    super();
    this.gateway = gateway;
    this._running = new Map(); // sessionId → abort controller
  }

  /**
   * Wire up the gateway's agent.request events to this runtime
   */
  attach() {
    this.gateway.on("agent.request", (req) => this.handleRequest(req));
    console.log("[agent-runtime] Attached to gateway");
  }

  /**
   * Handle an agent request — run Claude and stream results
   */
  async handleRequest(req) {
    const { sessionId, message, model, thinking, clientId, channel } = req;
    const logger = getSessionLogger(sessionId);

    // Log the user message
    logger.logMessage("user", message, { channel, clientId });

    // Register the active agent
    const abortController = new AbortController();
    this._running.set(sessionId, { cancel: () => abortController.abort() });
    this.gateway.activeAgents.set(sessionId, { cancel: () => abortController.abort() });

    // Update session tracking
    if (!this.gateway.sessions.has(sessionId)) {
      this.gateway.sessions.set(sessionId, {
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
        model,
      });
    }
    const session = this.gateway.sessions.get(sessionId);
    session.lastActivity = Date.now();
    session.messageCount++;

    try {
      // Try Agent SDK first, fall back to CLI
      const result = await this._executeAgent({
        sessionId,
        message,
        model,
        thinking,
        signal: abortController.signal,
        logger,
      });

      logger.logMessage("assistant", result.text, {
        model,
        toolsUsed: result.toolsUsed || [],
        tokensUsed: result.tokensUsed || 0,
      });

      this.gateway.agentDone(sessionId, {
        text: result.text,
        toolsUsed: result.toolsUsed,
        tokensUsed: result.tokensUsed,
      });
    } catch (err) {
      if (abortController.signal.aborted) {
        logger.logEvent("cancelled");
        return;
      }

      logger.logEvent("error", { error: err.message });
      this.gateway.agentError(sessionId, err);
    } finally {
      this._running.delete(sessionId);
    }
  }

  /**
   * Execute agent via Claude Agent SDK (preferred) or CLI fallback
   */
  async _executeAgent({ sessionId, message, model, thinking, signal, logger }) {
    // Try Agent SDK first
    try {
      return await this._runAgentSDK({ sessionId, message, model, thinking, signal, logger });
    } catch (sdkErr) {
      // If Agent SDK not available, fall back to CLI
      if (sdkErr.code === "MODULE_NOT_FOUND" || sdkErr.message?.includes("not found")) {
        console.log("[agent-runtime] Agent SDK unavailable, falling back to CLI");
        return await this._runCLI({ sessionId, message, model, thinking, signal, logger });
      }
      throw sdkErr;
    }
  }

  /**
   * Run via @anthropic-ai/claude-agent-sdk (in-process, fast)
   */
  async _runAgentSDK({ sessionId, message, model, thinking, signal, logger }) {
    const { ClaudeAgent } = await import("@anthropic-ai/claude-agent-sdk");

    const agent = new ClaudeAgent({
      model: model || "claude-sonnet-4-6",
      maxTurns: 25,
      systemPrompt: this._getSystemPrompt(),
    });

    let fullText = "";
    const toolsUsed = [];
    let tokensUsed = 0;

    // Stream handler
    agent.on("text", (token) => {
      fullText += token;
      this.gateway.streamToken(sessionId, token);
    });

    agent.on("tool_use", (tool) => {
      toolsUsed.push(tool.name);
      this.gateway.streamToolUse(sessionId, tool.name, tool.input);
      logger.logEvent("tool_use", { tool: tool.name, input: tool.input });
    });

    agent.on("tool_result", (result) => {
      this.gateway.streamToolResult(sessionId, result.toolName, result.output);
      logger.logEvent("tool_result", { tool: result.toolName });
    });

    const result = await agent.run(message, { signal });
    tokensUsed = result.usage?.totalTokens || 0;

    return { text: fullText || result.text, toolsUsed, tokensUsed };
  }

  /**
   * Run via Claude Code CLI (subprocess, reliable fallback)
   */
  async _runCLI({ sessionId, message, model, thinking, signal, logger }) {
    const { spawn } = await import("child_process");

    return new Promise((resolve, reject) => {
      const args = [
        "--print", message,
        "--model", model || "claude-sonnet-4-6",
        "--output-format", "stream-json",
      ];

      if (thinking === "high") {
        args.push("--thinking", "budget", "high");
      }

      const child = spawn("claude", args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        signal,
      });

      let fullText = "";
      const toolsUsed = [];

      child.stdout.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const evt = JSON.parse(line);
            if (evt.type === "assistant" && evt.content) {
              for (const block of evt.content) {
                if (block.type === "text") {
                  fullText += block.text;
                  this.gateway.streamToken(sessionId, block.text);
                } else if (block.type === "tool_use") {
                  toolsUsed.push(block.name);
                  this.gateway.streamToolUse(sessionId, block.name, block.input);
                }
              }
            } else if (evt.type === "result") {
              fullText = evt.result || fullText;
            }
          } catch {}
        }
      });

      child.stderr.on("data", (chunk) => {
        // CLI status output — ignore
      });

      child.on("close", (code) => {
        if (code === 0 || fullText) {
          resolve({ text: fullText, toolsUsed, tokensUsed: 0 });
        } else {
          reject(new Error(`Claude CLI exited with code ${code}`));
        }
      });

      child.on("error", reject);
    });
  }

  /**
   * System prompt for BACKBONE agents
   */
  _getSystemPrompt() {
    return [
      "You are BACKBONE, an autonomous life optimization engine.",
      "You help the user manage goals, finances, health, projects, and daily life.",
      "You have access to tools for file operations, web search, and shell commands.",
      "Be concise. Take action. Don't ask for permission on low-risk operations.",
    ].join(" ");
  }

  /**
   * Cancel all running agents
   */
  cancelAll() {
    for (const [sid, handle] of this._running) {
      handle.cancel();
    }
    this._running.clear();
  }
}

// ── Singleton ───────────────────────────────────────────────

let _runtime = null;

export function getAgentRuntime(gateway) {
  if (!_runtime) {
    _runtime = new AgentRuntime(gateway || getGateway());
    _runtime.attach();
  }
  return _runtime;
}

export default AgentRuntime;
