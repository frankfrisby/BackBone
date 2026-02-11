/**
 * Claude Agent SDK bridge
 *
 * Wraps `@anthropic-ai/claude-agent-sdk` so Backbone can stream output in the
 * same shape as the existing Claude Code CLI executor.
 *
 * This module is OPTIONAL. It is loaded dynamically by `multi-ai.js` so the
 * engine still runs even when the dependency is not installed.
 */

import { EventEmitter } from "events";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const isTradingOrderTool = (toolName) => {
  const name = String(toolName || "");
  return (
    name === "mcp__backbone-trading__buy_stock" ||
    name === "mcp__backbone-trading__sell_stock" ||
    name.startsWith("mcp__backbone-trading__buy_stock") ||
    name.startsWith("mcp__backbone-trading__sell_stock")
  );
};

const safeJsonPreview = (value, maxLen = 200) => {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length > maxLen ? text.slice(0, maxLen) : text;
  } catch {
    const text = String(value ?? "");
    return text.length > maxLen ? text.slice(0, maxLen) : text;
  }
};

const formatToolEventLine = (toolName, input) => {
  const name = String(toolName || "Tool");
  const obj = (input && typeof input === "object") ? input : {};

  switch (name) {
    case "Read":
      return `Read(${obj.file_path || obj.path || obj.file || "..."})`;
    case "Write":
      return `Write(${obj.file_path || obj.path || obj.file || "..."})`;
    case "Edit":
      return `Edit(${obj.file_path || obj.path || obj.file || "..."})`;
    case "Bash":
      return `Bash(${String(obj.command || "...").slice(0, 80)})`;
    case "Glob":
      return `Glob(${obj.pattern || "..."})`;
    case "Grep":
      return `Grep(${obj.pattern || "..."} ${obj.path || ""})`.trim();
    case "WebSearch":
      return `WebSearch(${obj.query || "..."})`;
    case "WebFetch":
    case "Fetch":
      return `Fetch(${obj.url || "..."})`;
    default:
      // Keep as a short line (won't be picked up by TOOL_REGEX, but shows in stream text).
      return `[Tool] ${name}: ${safeJsonPreview(obj, 200)}`;
  }
};

export async function isClaudeAgentSdkInstalled() {
  try {
    await import("@anthropic-ai/claude-agent-sdk");
    return true;
  } catch {
    return false;
  }
}

export async function runClaudeAgentSdkTask(task, workDir, onOutput, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const permissionMode = opts.permissionMode || process.env.BACKBONE_CLAUDE_PERMISSION_MODE || "bypassPermissions";
  const allowTradingOrders = String(process.env.BACKBONE_AGENT_ALLOW_TRADING || "") === "1";
  const model = opts.model || process.env.BACKBONE_CLAUDE_MODEL || null;

  let query;
  try {
    const mod = await import("@anthropic-ai/claude-agent-sdk");
    query = mod?.query;
    if (typeof query !== "function") {
      return {
        success: false,
        error: "Claude Agent SDK loaded but `query()` was not found.",
        output: "",
        exitCode: null,
        tool: "claude-agent-sdk",
        rateLimited: false
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Claude Agent SDK not installed. Install with: npm i @anthropic-ai/claude-agent-sdk\n\n(${err?.message || err})`,
      output: "",
      exitCode: null,
      tool: "claude-agent-sdk",
      rateLimited: false
    };
  }

  if (onOutput) onOutput({ type: "tool", tool: "claude-agent-sdk" });

  let output = "";
  let finalText = "";
  let error = "";
  const toolCalls = [];

  const emitStdout = (text) => {
    if (!text) return;
    output += text;
    if (onOutput) onOutput({ type: "stdout", text, output });
  };

  const handleAssistantMessage = (message) => {
    const content = message?.content;
    if (!Array.isArray(content)) return;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        finalText = block.text;
        emitStdout(block.text + "\n");
        if (onOutput) onOutput({ type: "assistant_text", text: block.text });
        continue;
      }
    }
  };

  const canUseTool = async (toolName, toolInput) => {
    if (!allowTradingOrders && isTradingOrderTool(toolName)) {
      return {
        behavior: "deny",
        reason: "Trading order tool blocked by Backbone safety. Use /trading run (auto-trader) or set BACKBONE_AGENT_ALLOW_TRADING=1."
      };
    }
    return { behavior: "allow" };
  };

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  const cwd = workDir || process.cwd();

  // Favor Claude Code defaults so the agent behaves like Claude Code (tools + system prompt),
  // but keep a compatibility fallback for older SDK builds.
  const baseOptions = {
    cwd,
    abortController,
    settingSources: opts.settingSources || ["project", "user", "local"],
    permissionMode,
    allowDangerouslySkipPermissions: permissionMode === "bypassPermissions",
    canUseTool,
    ...(model ? { model } : {}),
    ...(opts.resume !== undefined ? { resume: opts.resume } : {}),
  };

  let iterator;
  try {
    // Attempt "Claude Code preset" options first (newer SDKs). Fallback to baseOptions only.
    try {
      iterator = query({
        prompt: task,
        options: {
          ...baseOptions,
          tools: opts.tools || "claude_code",
          systemPrompt: opts.systemPrompt || { type: "preset", preset: "claude_code" },
        },
      });
    } catch {
      iterator = query({ prompt: task, options: baseOptions });
    }

    for await (const value of iterator) {
      if (!value || typeof value !== "object") continue;

      switch (value.type) {
        case "assistant": {
          handleAssistantMessage(value.message);
          break;
        }
        case "tool_call": {
          const toolName = value.toolName || "unknown";
          const toolInput = value.toolInput || {};
          toolCalls.push({ tool: toolName, input: toolInput });
          const toolLine = formatToolEventLine(toolName, toolInput);
          emitStdout(toolLine + "\n");
          if (onOutput) onOutput({ type: "tool_call", tool: toolName, input: toolInput });
          break;
        }
        case "tool_result": {
          if (onOutput) onOutput({ type: "tool_result", tool: value.toolName, result: value.result });
          break;
        }
        case "result": {
          // Result shape differs across SDK builds.
          const resultText =
            (typeof value.result === "string")
              ? value.result
              : (typeof value.result?.result === "string")
                ? value.result.result
                : (typeof value.result?.text === "string")
                  ? value.result.text
                  : "";
          if (resultText) finalText = resultText;
          break;
        }
        case "error": {
          const msg = value.error?.message || value.error || value.message || "unknown error";
          error += (error ? "\n" : "") + String(msg);
          if (onOutput) onOutput({ type: "stderr", text: String(msg), error });
          break;
        }
        default:
          // user/system/log/stream_event - ignore
          break;
      }
    }

    clearTimeout(timeout);
    if (onOutput) onOutput({ type: "done", code: 0, output: finalText || output, error, toolCalls });
    return {
      success: true,
      output: finalText || output,
      error,
      toolCalls,
      exitCode: 0,
      tool: "claude-agent-sdk",
      rateLimited: false
    };
  } catch (err) {
    clearTimeout(timeout);
    const msg = err?.message || String(err);
    if (abortController.signal.aborted && /aborted|abort|timeout/i.test(msg)) {
      const timeoutMsg = `Request timed out after ${Math.round(timeoutMs / 1000)} seconds`;
      if (onOutput) onOutput({ type: "error", error: timeoutMsg });
      return {
        success: false,
        error: timeoutMsg,
        output: finalText || output,
        toolCalls,
        exitCode: null,
        tool: "claude-agent-sdk",
        rateLimited: false
      };
    }
    if (onOutput) onOutput({ type: "error", error: msg });
    return {
      success: false,
      error: msg,
      output: finalText || output,
      toolCalls,
      exitCode: null,
      tool: "claude-agent-sdk",
      rateLimited: false
    };
  }
}

/**
 * Streaming wrapper that mimics the EventEmitter interface used by runClaudeCodeStreaming().
 */
export const runClaudeAgentSdkStreaming = async (prompt, options = {}) => {
  const emitter = new EventEmitter();

  // Keep the same extension points as the Claude Code CLI streaming wrapper.
  emitter.approve = () => {};
  emitter.reject = () => {};
  emitter.respond = () => {};

  // Execute in background so callers can attach listeners immediately.
  queueMicrotask(async () => {
    const res = await runClaudeAgentSdkTask(
      prompt,
      options.cwd || process.cwd(),
      (event) => {
        if (!event) return;
        if (event.type === "stdout") {
          emitter.emit("data", event.text);
          return;
        }
        if (event.type === "stderr") {
          emitter.emit("data", event.text);
          return;
        }
        if (event.type === "tool_call") {
          emitter.emit("tool", {
            tool: event.tool,
            input: safeJsonPreview(event.input, 200),
            timestamp: Date.now()
          });
          return;
        }
        if (event.type === "tool_result") {
          emitter.emit("tool-result", { tool: event.tool, result: event.result, timestamp: Date.now() });
          return;
        }
      },
      {
        timeoutMs: options.timeoutMs,
        permissionMode: options.permissionMode,
        model: options.model,
        resume: options.resume,
        settingSources: options.settingSources,
        tools: options.tools,
        systemPrompt: options.systemPrompt,
      }
    );

    if (!res.success) {
      emitter.emit("error", { error: res.error || "Unknown error" });
    }

    emitter.emit("complete", {
      success: res.success,
      output: res.output || "",
      error: res.error || "",
      exitCode: res.exitCode ?? null,
      toolCalls: res.toolCalls || [],
      tool: "claude-agent-sdk"
    });
  });

  return emitter;
};
