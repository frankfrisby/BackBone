/**
 * Claude Code CLI Detection & Authentication Service
 *
 * Detects if Claude Code CLI is installed and if user is logged in.
 * Can spawn a login terminal if not authenticated.
 */

import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { EventEmitter } from "events";
import { isClaudeAgentSdkInstalled, runClaudeAgentSdkStreaming } from "./claude-agent-sdk.js";
import { getBackboneRoot } from "../paths.js";

// On Windows, use "claude.cmd" explicitly — bare "claude" can timeout due to
// slow shell command resolution. On macOS/Linux, use bare "claude".
const CLAUDE_CMD = process.platform === "win32" ? "claude.cmd" : "claude";

const getClaudeProcessEnv = () => {
  const env = { ...process.env };
  if (process.platform === "win32") {
    const npmBin = path.join(process.env.APPDATA || "", "npm");
    if (npmBin) {
      const pathValue = env.PATH || env.Path || "";
      const lowerPath = pathValue.toLowerCase();
      if (!lowerPath.includes(npmBin.toLowerCase())) {
        const newPath = `${npmBin}${path.delimiter}${pathValue}`;
        // Set both casings — Windows env vars are case-insensitive
        // but Node.js object keys are not, so cmd.exe may read either
        env.PATH = newPath;
        env.Path = newPath;
      }
    }
  }
  return env;
};

// Claude Code stores credentials in these locations
const CLAUDE_CODE_PATHS = {
  // Windows: %APPDATA%\claude-code or %USERPROFILE%\.claude
  win32: [
    path.join(process.env.APPDATA || "", "claude-code"),
    path.join(process.env.APPDATA || "", "Claude"),
    path.join(os.homedir(), ".claude"),
    path.join(os.homedir(), ".claude-code"),
    path.join(os.homedir(), ".config", "claude"),
    path.join(os.homedir(), ".config", "claude-code"),
  ],
  // macOS/Linux: ~/.claude
  darwin: [
    path.join(os.homedir(), ".claude"),
    path.join(os.homedir(), ".claude-code"),
    path.join(os.homedir(), ".config", "claude"),
    path.join(os.homedir(), "Library", "Application Support", "Claude"),
  ],
  linux: [
    path.join(os.homedir(), ".claude"),
    path.join(os.homedir(), ".claude-code"),
    path.join(os.homedir(), ".config", "claude"),
    path.join(os.homedir(), ".config", "claude-code"),
  ],
};

// Auth file names to check
const AUTH_FILES = [
  "credentials.json",
  "auth.json",
  "settings.json",
  ".credentials.json",
  "config.json",
  "session.json",
  "user.json",
  ".auth",
];

/**
 * Get Claude Code config directory path for current platform
 */
export const getClaudeCodeConfigDir = () => {
  const platform = process.platform;
  const paths = CLAUDE_CODE_PATHS[platform] || CLAUDE_CODE_PATHS.linux;

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return paths[0]; // Return first path as default
};

/**
 * Check if Claude Code CLI is installed
 */
export const isClaudeCodeInstalled = () => {
  try {
    // Try running claude --version (15s timeout — Windows can be slow)
    const result = execSync(`${CLAUDE_CMD} --version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
      env: getClaudeProcessEnv(),
    });
    return {
      installed: true,
      version: result.trim(),
    };
  } catch (error) {
    // Command not found or error
    return {
      installed: false,
      version: null,
      error: error.message,
    };
  }
};

/**
 * Check if Claude Code CLI is installed (async version)
 */
export const isClaudeCodeInstalledAsync = async () => {
  return new Promise((resolve) => {
    const proc = spawn(CLAUDE_CMD, ["--version"], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: getClaudeProcessEnv(),
    });

    let output = "";

    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({
          installed: true,
          version: output.trim(),
        });
      } else {
        resolve({
          installed: false,
          version: null,
        });
      }
    });

    proc.on("error", () => {
      resolve({
        installed: false,
        version: null,
      });
    });

    // Timeout after 15 seconds (Windows is slow with shell resolution)
    setTimeout(() => {
      proc.kill();
      resolve({
        installed: false,
        version: null,
        error: "Timeout",
      });
    }, 15000);
  });
};

/**
 * Check if user is logged into Claude Code
 * Returns user info if logged in, null otherwise
 */
export const isClaudeCodeLoggedIn = () => {
  const platform = process.platform;
  const allPaths = CLAUDE_CODE_PATHS[platform] || CLAUDE_CODE_PATHS.linux;

  // Check all possible config directories
  for (const configDir of allPaths) {
    if (!fs.existsSync(configDir)) continue;

    for (const authFile of AUTH_FILES) {
      const authPath = path.join(configDir, authFile);

      if (fs.existsSync(authPath)) {
        try {
          const content = fs.readFileSync(authPath, "utf-8").trim();

          // Handle non-JSON files (like .auth which might just be a token)
          if (!content.startsWith("{") && !content.startsWith("[")) {
            if (content.length > 20) {
              // Looks like a token
              return {
                loggedIn: true,
                source: authPath,
                user: null,
                model: "claude-sonnet-4-20250514",
                method: "claude-code-cli",
              };
            }
            continue;
          }

          const data = JSON.parse(content);

          // Check for various auth indicators
          if (data.accessToken || data.access_token || data.token) {
            return {
              loggedIn: true,
              source: authPath,
              user: data.user || data.email || data.accountEmail || null,
              model: data.model || data.defaultModel || "claude-sonnet-4-20250514",
              expiresAt: data.expiresAt || data.expires_at || null,
              method: "claude-code-cli",
            };
          }

          // Check for OAuth tokens
          if (data.oauth?.accessToken || data.tokens?.access_token || data.auth?.token) {
            const tokens = data.oauth || data.tokens || data.auth;
            return {
              loggedIn: true,
              source: authPath,
              user: data.user || data.email || tokens.email || null,
              model: data.model || "claude-sonnet-4-20250514",
              expiresAt: tokens.expiresAt || tokens.expires_at || null,
              method: "claude-code-cli",
            };
          }

          // Check for claudeAiOauth format (actual Claude Code CLI format)
          if (data.claudeAiOauth?.accessToken) {
            const oauth = data.claudeAiOauth;
            return {
              loggedIn: true,
              source: authPath,
              user: oauth.email || null,
              model: "claude-sonnet-4-20250514",
              expiresAt: oauth.expiresAt || null,
              subscriptionType: oauth.subscriptionType || null,
              rateLimitTier: oauth.rateLimitTier || null,
              method: "claude-code-cli",
            };
          }

          // Check for hasCompletedAuth or similar flags
          if (data.hasCompletedAuth || data.authenticated || data.isAuthenticated || data.loggedIn) {
            return {
              loggedIn: true,
              source: authPath,
              user: data.user || data.email || data.accountEmail || null,
              model: data.model || data.preferredModel || "claude-sonnet-4-20250514",
              method: "claude-code-cli",
            };
          }

          // Check for account info (newer format)
          if (data.account || data.accountId || data.userId) {
            return {
              loggedIn: true,
              source: authPath,
              user: data.account?.email || data.email || null,
              model: data.model || "claude-sonnet-4-20250514",
              method: "claude-code-cli",
            };
          }

          // If file has substantial content with session/user data, assume logged in
          if (data.session || data.sessionId || (data.user && typeof data.user === "object")) {
            return {
              loggedIn: true,
              source: authPath,
              user: data.user?.email || data.email || null,
              model: data.model || "claude-sonnet-4-20250514",
              method: "claude-code-cli",
            };
          }
        } catch (error) {
          // Continue to next file
        }
      }
    }
  }

  return {
    loggedIn: false,
    source: null,
    user: null,
    model: null,
  };
};

/**
 * Get the model being used by Claude Code
 */
export const getClaudeCodeModel = () => {
  const authStatus = isClaudeCodeLoggedIn();
  if (authStatus.loggedIn) {
    return authStatus.model || "claude-3-5-sonnet-20241022";
  }
  return null;
};

/**
 * Get full Claude Code status
 */
export const getClaudeCodeStatus = async () => {
  const installed = await isClaudeCodeInstalledAsync();
  const auth = isClaudeCodeLoggedIn();

  return {
    installed: installed.installed,
    version: installed.version,
    loggedIn: auth.loggedIn,
    user: auth.user,
    model: auth.model,
    method: auth.method,
    configDir: getClaudeCodeConfigDir(),
    // Ready means installed AND logged in
    ready: installed.installed && auth.loggedIn,
  };
};

/**
 * Spawn Claude Code CLI for interactive login
 * Opens in a new terminal window (or current if no terminal available)
 *
 * @returns Promise that resolves when login is complete
 */
export const spawnClaudeCodeLogin = async (onStatus = () => {}) => {
  return new Promise((resolve) => {
    onStatus("Starting Claude Code login...");

    const isWindows = process.platform === "win32";
    const isMac = process.platform === "darwin";

    let proc;

    if (isWindows) {
      // On Windows, spawn cmd with /c start to open new window
      // The /wait flag makes cmd wait for the claude process
      proc = spawn("cmd", ["/c", "start", "/wait", "cmd", "/c", "claude && pause"], {
        shell: true,
        detached: true,
        stdio: "ignore",
        env: getClaudeProcessEnv(),
      });
    } else if (isMac) {
      // On macOS, use osascript to open Terminal
      const script = `
        tell application "Terminal"
          activate
          do script "claude; echo 'Press any key to close...'; read -n 1"
        end tell
      `;
      proc = spawn("osascript", ["-e", script], {
        shell: true,
        detached: true,
        stdio: "ignore",
        env: getClaudeProcessEnv(),
      });
    } else {
      // On Linux, try various terminal emulators
      const terminals = [
        ["gnome-terminal", "--", "bash", "-c", "claude; read -p 'Press Enter to close...'"],
        ["konsole", "-e", "bash", "-c", "claude; read -p 'Press Enter to close...'"],
        ["xterm", "-e", "bash", "-c", "claude; read -p 'Press Enter to close...'"],
      ];

      for (const [cmd, ...args] of terminals) {
        try {
          proc = spawn(cmd, args, {
            shell: true,
            detached: true,
            stdio: "ignore",
            env: getClaudeProcessEnv(),
          });
          break;
        } catch (e) {
          continue;
        }
      }

      if (!proc) {
        // Fallback: run in current terminal (will block)
        proc = spawn(CLAUDE_CMD, [], {
          shell: true,
          stdio: "inherit",
          env: getClaudeProcessEnv(),
        });
      }
    }

    if (proc) {
      proc.unref(); // Don't wait for the process
    }

    onStatus("Claude Code login window opened.");
    onStatus("Please complete login in the terminal window...");

    // Poll for auth completion
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes

    const checkInterval = setInterval(async () => {
      attempts++;

      const status = await getClaudeCodeStatus();

      if (status.loggedIn) {
        clearInterval(checkInterval);
        onStatus("Claude Code login successful!");
        resolve({
          success: true,
          method: "claude-code-cli",
          user: status.user,
          model: status.model,
        });
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        onStatus("Login timeout - please try again");
        resolve({
          success: false,
          error: "Timeout waiting for login",
        });
        return;
      }

      if (attempts % 30 === 0) {
        onStatus(`Waiting for login... (${Math.floor(attempts / 60)}m ${attempts % 60}s)`);
      }
    }, 1000);
  });
};

/**
 * Run Claude Code with a prompt and return the result
 * Uses the -p flag for non-interactive mode
 */
export const runClaudeCodePrompt = async (prompt, options = {}) => {
  const status = await getClaudeCodeStatus();

  if (!status.ready) {
    return {
      success: false,
      error: status.installed
        ? "Claude Code not logged in"
        : "Claude Code not installed",
    };
  }

  return new Promise((resolve) => {
    const args = ["-p", prompt];

    if (options.outputFormat) {
      args.unshift("--output-format", options.outputFormat);
    }

    const proc = spawn(CLAUDE_CMD, args, {
      shell: true,
      cwd: options.cwd || process.cwd(),
      env: getClaudeProcessEnv(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        output: stdout,
        error: stderr || null,
        exitCode: code,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        error: err.message,
        exitCode: -1,
      });
    });

    // Timeout
    if (options.timeout) {
      setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          error: "Timeout",
          exitCode: -1,
        });
      }, options.timeout);
    }
  });
};

// Model configuration - Opus 4.5 by default, Sonnet as fallback
export const PREFERRED_MODEL = "claude-opus-4-5-20251101";
export const FALLBACK_MODEL = "claude-sonnet-4-20250514";

// Track current model state for rate limit fallback
let currentModelInUse = PREFERRED_MODEL;
let rateLimitedUntil = null; // Timestamp when rate limit expires (null = not limited)
const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown before retrying Opus

/**
 * Get the current model being used (for display purposes)
 */
export const getCurrentModelInUse = () => {
  // Check if rate limit cooldown has expired
  if (rateLimitedUntil && Date.now() > rateLimitedUntil) {
    rateLimitedUntil = null;
    currentModelInUse = PREFERRED_MODEL;
    console.log("[ClaudeCodeCLI] Rate limit cooldown expired, switching back to Opus 4.5");
  }
  return currentModelInUse;
};

/**
 * Check if text indicates rate limiting
 */
const isRateLimitError = (text) => {
  const lowerText = text.toLowerCase();
  return lowerText.includes("rate limit") ||
         lowerText.includes("rate_limit") ||
         lowerText.includes("429") ||
         lowerText.includes("overloaded") ||
         lowerText.includes("capacity") ||
         lowerText.includes("too many requests") ||
         lowerText.includes("quota exceeded");
};

/**
 * Detect auth/API key errors in CLI output.
 * Only checks first 500 chars by default to avoid false positives from Claude's
 * response content (e.g. discussing Alpaca API keys would trigger a false match).
 * Returns a descriptive string if an auth error is found, null otherwise.
 */
const detectAuthError = (text) => {
  if (!text) return null;
  // Only check the beginning — auth errors happen at startup, not mid-response
  const lower = text.slice(0, 500).toLowerCase();

  // ANTHROPIC_API_KEY specific
  if (lower.includes("anthropic_api_key")) {
    return "ANTHROPIC_API_KEY not set — Claude Code should use Pro/Max login. Run 'claude login'.";
  }

  // Error-prefixed API key messages (e.g. "Error: API key has no value")
  if ((lower.includes("error") || lower.includes("fatal")) &&
      (lower.includes("api key") || lower.includes("api_key"))) {
    return "API key error — Run 'claude login' to authenticate with Pro/Max subscription.";
  }

  // Auth/login errors
  if (lower.includes("not logged in") || lower.includes("authentication required") ||
      lower.includes("login required")) {
    return "Not logged in — Run 'claude login' to authenticate with Pro/Max subscription.";
  }

  // OAuth errors
  if (lower.includes("oauth") && (lower.includes("expired") || lower.includes("invalid"))) {
    return "OAuth session expired — Run 'claude login' to re-authenticate.";
  }

  // Billing/credit errors (API key has no credits)
  if (lower.includes("credit balance") || lower.includes("billing_error") ||
      lower.includes("insufficient_credit") || lower.includes("billing error")) {
    return "API credit balance too low — using API key instead of Pro/Max subscription.";
  }

  return null;
};

export { detectAuthError };

/**
 * Run Claude Code with streaming output
 * Returns an EventEmitter that emits 'data', 'tool', 'complete', and 'error' events
 *
 * Uses Opus 4.5 by default, automatically falls back to Sonnet on rate limits
 *
 * Events:
 * - 'data': Raw text output
 * - 'tool': Tool call detected { tool, input, output }
 * - 'action': Action requiring approval { id, type, description }
 * - 'complete': Process completed { success, output, model }
 * - 'error': Error occurred { error }
 * - 'auth-error': Authentication error { error, raw }
 * - 'model-fallback': Switched to fallback model due to rate limit
 *
 * Usage:
 * const stream = runClaudeCodeStreaming("Analyze this file", { cwd: "/path" });
 * stream.on('data', text => console.log(text));
 * stream.on('tool', tool => console.log('Tool called:', tool));
 * stream.on('complete', result => console.log('Done:', result));
 *
 * // To approve an action:
 * stream.approve(actionId);
 * // To reject:
 * stream.reject(actionId);
 * // To provide input:
 * stream.respond(text);
 */
export const runClaudeCodeStreaming = async (prompt, options = {}) => {
  console.log("[ClaudeCodeCLI] runClaudeCodeStreaming called");
  const status = await getClaudeCodeStatus();
  console.log(`[ClaudeCodeCLI] Status: installed=${status.installed}, loggedIn=${status.loggedIn}, ready=${status.ready}`);
  const emitter = new EventEmitter();

  if (!status.ready) {
    console.error(`[ClaudeCodeCLI] NOT READY - installed=${status.installed}, loggedIn=${status.loggedIn}`);
    process.nextTick(() => {
      emitter.emit("error", {
        error: status.installed
          ? "Claude Code not logged in"
          : "Claude Code not installed"
      });
    });
    return emitter;
  }

  // Determine which model to use
  const modelToUse = options.model || getCurrentModelInUse();
  const isUsingFallback = modelToUse === FALLBACK_MODEL;

  // Prefer Claude Agent SDK when available (runs in-process, uses `.mcp.json` automatically).
  // Can be disabled with BACKBONE_CLAUDE_AGENT_SDK=0.
  try {
    const useAgentSdk = String(process.env.BACKBONE_CLAUDE_AGENT_SDK || "1") !== "0";
    if (useAgentSdk && (await isClaudeAgentSdkInstalled())) {
      console.log(`[ClaudeCodeCLI] Using Claude Agent SDK (model: ${modelToUse})`);
      return await runClaudeAgentSdkStreaming(prompt, {
        cwd: options.cwd || process.cwd(),
        timeoutMs: options.timeoutMs || options.timeout || 5 * 60 * 1000,
        permissionMode: options.permissionMode || process.env.BACKBONE_CLAUDE_PERMISSION_MODE || "bypassPermissions",
        model: modelToUse,
        resume: options.resume || false,
        settingSources: options.settingSources || ["project", "user", "local"],
      });
    }
  } catch (err) {
    // Fall back to spawning `claude` CLI below.
    console.log(`[ClaudeCodeCLI] Agent SDK unavailable - falling back to CLI (${err?.message || err})`);
  }

  // Build args with model selection, stream-json for structured output, and permissions bypass
  const mcpTools = [
    "mcp__backbone-google", "mcp__backbone-linkedin", "mcp__backbone-contacts",
    "mcp__backbone-news", "mcp__backbone-life", "mcp__backbone-health",
    "mcp__backbone-trading", "mcp__backbone-projects",
  ];
  const allowedTools = [
    "Read", "Glob", "Grep", "WebFetch", "WebSearch", "Task",
    "Write", "Edit", "Bash", ...mcpTools
  ];
  const args = [
    "--model", modelToUse, "--print",
    "--verbose", "--output-format", "stream-json",
    "--dangerously-skip-permissions",
    ...(fs.existsSync(getBackboneRoot()) ? ["--add-dir", getBackboneRoot()] : []),
    "--allowedTools", allowedTools.join(",")
  ];

  console.log(`[ClaudeCodeCLI] Spawning: claude --model ${modelToUse} --print`);
  console.log(`[ClaudeCodeCLI] Prompt length: ${prompt.length} chars`);
  console.log(`[ClaudeCodeCLI] CWD: ${options.cwd || process.cwd()}`);
  console.log(`[ClaudeCodeCLI] Using ${isUsingFallback ? "FALLBACK (Sonnet)" : "PREFERRED (Opus 4.5)"} model`);

  // Remove ANTHROPIC_API_KEY so CLI uses Pro/Max OAuth subscription instead of API key
  const cleanEnv = getClaudeProcessEnv();
  delete cleanEnv.ANTHROPIC_API_KEY;

  const proc = spawn(CLAUDE_CMD, args, {
    shell: true,
    cwd: options.cwd || process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: cleanEnv
  });

  console.log(`[ClaudeCodeCLI] Process spawned, PID: ${proc.pid || "unknown"}`);

  // Write prompt to stdin and close it to signal end of input
  if (proc.stdin) {
    proc.stdin.write(prompt);
    proc.stdin.end();
    console.log(`[ClaudeCodeCLI] Prompt written to stdin, stream closed`);
  } else {
    console.error(`[ClaudeCodeCLI] ERROR: stdin not available`);
  }

  // Track if we've detected a rate limit for this request
  let rateLimitDetected = false;

  let fullOutput = "";
  let lineBuffer = "";

  // Parse a stream-json line and emit structured events
  const processStreamLine = (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      switch (msg.type) {
        case "assistant": {
          const text = msg.message?.content?.[0]?.text || "";
          if (text) {
            fullOutput = text;
            emitter.emit("data", text);
          }
          break;
        }
        case "tool_use": {
          const tool = msg.tool?.name || msg.name || "unknown";
          const input = JSON.stringify(msg.tool?.input || msg.input || {}).slice(0, 200);
          emitter.emit("tool", { tool, input, timestamp: Date.now() });
          emitter.emit("data", `[Tool] ${tool}: ${input}\n`);
          break;
        }
        case "tool_result": {
          const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content || "").slice(0, 300);
          emitter.emit("data", content + "\n");
          break;
        }
        case "result": {
          const resultText = msg.result || "";
          if (resultText) fullOutput = resultText;
          break;
        }
      }
    } catch {
      // Not JSON — emit as raw text
      fullOutput += line;
      emitter.emit("data", line);
    }
  };

  proc.stdout.on("data", (data) => {
    const chunk = data.toString();

    // Check for rate limit in output
    if (!rateLimitDetected && isRateLimitError(chunk)) {
      rateLimitDetected = true;
      console.log(`[ClaudeCodeCLI] Rate limit detected in stdout`);
    }

    lineBuffer += chunk;
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() || "";
    for (const line of lines) {
      processStreamLine(line);
    }
  });

  proc.stderr.on("data", (data) => {
    const text = data.toString();
    console.log(`[ClaudeCodeCLI] stderr: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);

    // Check for rate limit in stderr
    if (!rateLimitDetected && isRateLimitError(text)) {
      rateLimitDetected = true;
      console.log(`[ClaudeCodeCLI] Rate limit detected in stderr`);
    }

    // Check for auth/API key errors in stderr
    const authError = detectAuthError(text);
    if (authError) {
      console.error(`[ClaudeCodeCLI] Auth error: ${authError}`);
      emitter.emit("auth-error", { error: authError, raw: text.slice(0, 200) });
    }

    emitter.emit("data", text);
  });

  proc.on("close", async (code) => {
    // Process any remaining buffered line
    if (lineBuffer.trim()) processStreamLine(lineBuffer);
    console.log(`[ClaudeCodeCLI] Process closed with code: ${code}`);

    // Check for auth errors in accumulated output - don't retry these
    const authErr = detectAuthError(fullOutput);
    if (authErr) {
      console.error(`[ClaudeCodeCLI] Auth error in output: ${authErr}`);
      emitter.emit("auth-error", { error: authErr });
      emitter.emit("complete", {
        success: false,
        output: fullOutput,
        exitCode: code,
        model: modelToUse,
        authError: authErr
      });
      return;
    }

    // If rate limit detected and we were using Opus, retry with Sonnet
    if (rateLimitDetected && modelToUse === PREFERRED_MODEL && !options._isRetry) {
      console.log(`[ClaudeCodeCLI] Rate limited on Opus 4.5, switching to Sonnet fallback`);

      // Set rate limit cooldown
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      currentModelInUse = FALLBACK_MODEL;

      // Emit fallback event
      emitter.emit("model-fallback", {
        from: PREFERRED_MODEL,
        to: FALLBACK_MODEL,
        reason: "rate_limit",
        cooldownMs: RATE_LIMIT_COOLDOWN_MS
      });

      // Retry with fallback model
      console.log(`[ClaudeCodeCLI] Retrying with Sonnet...`);
      const retryEmitter = runClaudeCodeStreaming(prompt, {
        ...options,
        model: FALLBACK_MODEL,
        _isRetry: true
      });

      // Forward all events from retry to original emitter
      try {
        const retry = await retryEmitter;
        retry.on("data", (d) => emitter.emit("data", d));
        retry.on("tool", (t) => emitter.emit("tool", t));
        retry.on("complete", (c) => emitter.emit("complete", { ...c, model: FALLBACK_MODEL, wasRetry: true }));
        retry.on("error", (e) => emitter.emit("error", e));
      } catch (retryErr) {
        emitter.emit("error", { error: retryErr.message || "Retry failed", model: FALLBACK_MODEL });
      }

      return;
    }

    emitter.emit("complete", {
      success: code === 0,
      output: fullOutput,
      exitCode: code,
      model: modelToUse,
      wasRetry: options._isRetry || false
    });
  });

  proc.on("error", (err) => {
    console.error(`[ClaudeCodeCLI] Process error: ${err.message}`);
    emitter.emit("error", { error: err.message, model: modelToUse });
  });

  // Timeout handling
  let timeoutId = null;
  if (options.timeout) {
    timeoutId = setTimeout(() => {
      proc.kill();
      emitter.emit("error", { error: "Timeout" });
    }, options.timeout);

    proc.on("close", () => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  // Track pending actions for interactive approval
  const pendingActions = new Map();

  // Add methods for interactive control
  emitter.approve = (actionId) => {
    if (proc.stdin.writable) {
      proc.stdin.write("y\n");
      const action = pendingActions.get(actionId);
      if (action) {
        action.approved = true;
        pendingActions.delete(actionId);
      }
    }
  };

  emitter.reject = (actionId) => {
    if (proc.stdin.writable) {
      proc.stdin.write("n\n");
      const action = pendingActions.get(actionId);
      if (action) {
        action.approved = false;
        pendingActions.delete(actionId);
      }
    }
  };

  emitter.respond = (text) => {
    if (proc.stdin.writable) {
      proc.stdin.write(text + "\n");
    }
  };

  emitter.abort = () => {
    proc.kill("SIGTERM");
  };

  emitter.process = proc;
  emitter.getPendingActions = () => Array.from(pendingActions.values());
  emitter.model = modelToUse;
  emitter.isUsingFallback = isUsingFallback;

  return emitter;
};

/**
 * Get installation instructions
 */
export const getInstallInstructions = () => {
  const isWindows = process.platform === "win32";

  return {
    message: "Claude Code CLI is not installed",
    steps: [
      isWindows
        ? "npm install -g @anthropic-ai/claude-code"
        : "npm install -g @anthropic-ai/claude-code",
      "claude   # This will prompt you to log in",
    ],
    docs: "https://docs.anthropic.com/claude-code",
    note: "Requires a Claude Pro or Max subscription",
  };
};

export default {
  isClaudeCodeInstalled,
  isClaudeCodeInstalledAsync,
  isClaudeCodeLoggedIn,
  getClaudeCodeModel,
  getCurrentModelInUse,
  getClaudeCodeStatus,
  spawnClaudeCodeLogin,
  runClaudeCodePrompt,
  runClaudeCodeStreaming,
  getInstallInstructions,
  getClaudeCodeConfigDir,
  PREFERRED_MODEL,
  FALLBACK_MODEL,
};
