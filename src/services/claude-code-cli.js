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
    // Try running claude --version
    const result = execSync("claude --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
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
    const proc = spawn("claude", ["--version"], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
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

    // Timeout after 5 seconds
    setTimeout(() => {
      proc.kill();
      resolve({
        installed: false,
        version: null,
        error: "Timeout",
      });
    }, 5000);
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
          });
          break;
        } catch (e) {
          continue;
        }
      }

      if (!proc) {
        // Fallback: run in current terminal (will block)
        proc = spawn("claude", [], {
          shell: true,
          stdio: "inherit",
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

    const proc = spawn("claude", args, {
      shell: true,
      cwd: options.cwd || process.cwd(),
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

/**
 * Run Claude Code with streaming output
 * Returns an EventEmitter that emits 'data', 'tool', 'complete', and 'error' events
 *
 * Events:
 * - 'data': Raw text output
 * - 'tool': Tool call detected { tool, input, output }
 * - 'action': Action requiring approval { id, type, description }
 * - 'complete': Process completed { success, output }
 * - 'error': Error occurred { error }
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

  // Use --print flag for non-interactive mode
  // Prompt is passed via stdin to avoid Windows command line length limits
  const args = ["--print"];

  // Use JSON output format for easier parsing if requested
  if (options.json) {
    args.push("--output-format", "json");
  }

  console.log(`[ClaudeCodeCLI] Spawning: echo <prompt> | claude --print`);
  console.log(`[ClaudeCodeCLI] Prompt length: ${prompt.length} chars`);
  console.log(`[ClaudeCodeCLI] CWD: ${options.cwd || process.cwd()}`);

  const proc = spawn("claude", args, {
    shell: true,
    cwd: options.cwd || process.cwd(),
    stdio: ["pipe", "pipe", "pipe"]
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

  let fullOutput = "";
  let currentTool = null;
  const pendingActions = new Map();

  // Track tool calls and actions from output
  const parseOutput = (text) => {
    fullOutput += text;

    // Detect tool calls (format varies, this handles common patterns)
    const toolPatterns = [
      /\[TOOL\]\s*(\w+)\((.*?)\)/g,
      /Running:\s*(\w+)\s*\((.*?)\)/g,
      /◆\s*(\w+)\((.*?)\)/g,
      /●\s*(\w+)\((.*?)\)/g
    ];

    for (const pattern of toolPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const tool = { tool: match[1], input: match[2], timestamp: Date.now() };
        currentTool = tool;
        emitter.emit("tool", tool);
      }
    }

    // Detect actions requiring approval
    const actionPatterns = [
      /\[ACTION\s*(\w+)\]\s*(.*?)(?:\n|$)/g,
      /Approve\?\s*\(y\/n\):\s*(.*?)(?:\n|$)/gi,
      /Allow\s+(\w+).*?\?\s*(.*?)(?:\n|$)/gi
    ];

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const actionId = `action_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const action = { id: actionId, type: match[1], description: match[2] || match[1] };
        pendingActions.set(actionId, action);
        emitter.emit("action", action);
      }
    }

    emitter.emit("data", text);
  };

  proc.stdout.on("data", (data) => {
    const text = data.toString();
    console.log(`[ClaudeCodeCLI] stdout: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
    parseOutput(text);
  });

  proc.stderr.on("data", (data) => {
    const text = data.toString();
    console.log(`[ClaudeCodeCLI] stderr: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`);
    emitter.emit("data", text);
  });

  proc.on("close", (code) => {
    console.log(`[ClaudeCodeCLI] Process closed with code: ${code}`);
    emitter.emit("complete", {
      success: code === 0,
      output: fullOutput,
      exitCode: code
    });
  });

  proc.on("error", (err) => {
    console.error(`[ClaudeCodeCLI] Process error: ${err.message}`);
    emitter.emit("error", { error: err.message });
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
  getClaudeCodeStatus,
  spawnClaudeCodeLogin,
  runClaudeCodePrompt,
  runClaudeCodeStreaming,
  getInstallInstructions,
  getClaudeCodeConfigDir,
};
