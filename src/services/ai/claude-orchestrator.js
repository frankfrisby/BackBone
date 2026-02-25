/**
 * Claude Code Orchestrator
 *
 * The brain that orchestrates Claude Code CLI execution with GPT-5.2 evaluation.
 *
 * FLOW:
 * 1. Goal → Spawn Claude Code CLI with goal as prompt
 * 2. Claude Code does real work (files, web, bash)
 * 3. Monitor stdout in real-time
 * 4. GPT-5.2 evaluates output and decides:
 *    - Continue (let Claude keep working)
 *    - Reply (send follow-up input if Claude needs clarification)
 *    - Complete (goal is done, kill process)
 *    - Redirect (Claude is off-track, send correction)
 * 5. Loop until goal is complete or max iterations reached
 *
 * This creates a "supervisor" pattern where GPT-5.2 oversees Claude's work.
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { getClaudeCodeStatus, getCurrentModelInUse, PREFERRED_MODEL, FALLBACK_MODEL } from "./claude-code-cli.js";

// Debug log for diagnosing streaming issues
const DEBUG_LOG = dataFile("claude-debug.log");
const debugLog = (msg) => {
  try {
    const ts = new Date().toISOString().slice(11, 23);
    fs.appendFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`);
  } catch {}
};
import { sendMessage, getMultiAIConfig, TASK_TYPES } from "./multi-ai.js";
import { getActivityNarrator, ACTION_STATUS } from "../ui/activity-narrator.js";
import { getGoalManager, TASK_STATE } from "../goals/goal-manager.js";
import { isClaudeAgentSdkInstalled, runClaudeAgentSdkTask } from "./claude-agent-sdk.js";

import { dataFile, getBackboneRoot, getProjectsDir } from "../paths.js";

// CLI tool catalog injected into engine-mode prompts (saves ~15K tokens of MCP schema overhead)
const ENGINE_CLI_CATALOG = `
You have access to BACKBONE tools via CLI. Call them with Bash:
  node tools/backbone-cli.js <domain> <action> [--key=value]

Domains & key actions:
  trading   portfolio | positions | signals | quote --symbol=X | top | worst | score --symbol=X | research --symbol=X | convictions | recession | history
  health    summary | sleep | readiness | activity
  life      goals [--status=active] | beliefs | backlog | scores | thesis | add-goal --title="..." --category=health
  portfolio networth | accounts | holdings | overview | status
  news      latest | market
  projects  list | create --name=X | status
  messaging send --message="..." | notify --type=alert --message="..."
  contacts  list | search --query=X | add --name=X --category=friends
  calendar  today | upcoming
  email     recent | unread | search --query=X

IMPORTANT: Prefer using these CLI commands via Bash over MCP tools. They return JSON to stdout.
`;

/**
 * Orchestration states
 */
export const ORCHESTRATION_STATE = {
  IDLE: "idle",
  STARTING: "starting",
  RUNNING: "running",
  EVALUATING: "evaluating",
  RESPONDING: "responding",
  COMPLETING: "completing",
  STOPPED: "stopped",
  ERROR: "error"
};

/**
 * GPT-5.2 decision types
 */
export const EVALUATION_DECISION = {
  CONTINUE: "continue",      // Let Claude continue working
  REPLY: "reply",            // Send follow-up input to Claude
  COMPLETE: "complete",      // Goal achieved, stop
  REDIRECT: "redirect",      // Claude is off-track, correct course
  ESCALATE: "escalate"       // Need human intervention
};

/**
 * Claude Code Orchestrator Class
 */
export class ClaudeOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.maxTurns = options.maxTurns || 30;
    this.evaluationInterval = options.evaluationInterval || 5000; // Evaluate every 5s of output
    this.timeout = options.timeout || 600000; // 10 minute max
    this.workDir = options.workDir || process.cwd();

    // SECURITY: Allowed directories for Claude Code access
    // Claude can ONLY read/write within these directories
    this.allowedDirectories = options.allowedDirectories || [
      "data",        // User data, goals, settings
      "memory",      // AI memory, conversation history
      "projects",    // User's projects being worked on
      "screenshots"  // Screenshots for analysis
    ];

    // State
    this.state = ORCHESTRATION_STATE.IDLE;
    this.currentGoal = null;
    this.claudeProcess = null;
    this.sessionId = null;

    // Output tracking
    this.outputBuffer = "";
    this.lastEvaluatedAt = 0;
    this.turnCount = 0;
    this.toolCalls = [];
    this.decisions = [];

    // Narrator for UI updates
    this.narrator = getActivityNarrator();
  }

  async _shouldUseAgentSdk() {
    // Default ON: once installed, prefer SDK over spawning a separate CLI process.
    if (String(process.env.BACKBONE_CLAUDE_AGENT_SDK || "1") === "0") return false;
    try {
      return await isClaudeAgentSdkInstalled();
    } catch {
      return false;
    }
  }

  /**
   * Start orchestrated execution of a goal
   *
   * @param {Object} goal - Goal object with title, description
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeGoal(goal, options = {}) {
    debugLog(`executeGoal called: "${goal?.title}" (state=${this.state})`);

    // Prevent re-entry if already running
    if (this.state === ORCHESTRATION_STATE.RUNNING || this.state === ORCHESTRATION_STATE.STARTING) {
      debugLog(`Already running — skipping`);
      return { success: false, error: "Already executing a goal" };
    }

    // Check Claude Code is ready
    const status = await getClaudeCodeStatus();
    debugLog(`Claude status: installed=${status.installed} loggedIn=${status.loggedIn} ready=${status.ready}`);
    if (!status.ready) {
      debugLog(`Claude NOT ready — aborting`);
      return {
        success: false,
        error: status.installed
          ? "Claude Code not logged in. Run: claude"
          : "Claude Code not installed. Run: npm install -g @anthropic-ai/claude-code"
      };
    }

    this.currentGoal = goal;
    this.state = ORCHESTRATION_STATE.STARTING;
    this.outputBuffer = "";
    this.turnCount = 0;
    this.toolCalls = [];
    this.decisions = [];

    // NOTIFY NARRATOR: Claude Code is now ACTIVE (orange background)
    this.narrator.setClaudeCodeActive(true, "starting");

    this.emit("started", { goal });

    // Build the prompt for Claude Code — include user context and agent identity
    const prompt = this.buildClaudePrompt(goal, options.userContext, options.agentIdentity);

    try {
      const useAgentSdk = await this._shouldUseAgentSdk();

      const execOptions = {
        workDir: options.workDir || this.workDir,
        timeout: options.timeout || this.timeout,
        model: options.model || null,
        engineMode: options.engineMode || false,
      };

      const result = useAgentSdk
        ? await this.runClaudeWithAgentSdk(prompt, execOptions)
        : await this.runClaudeWithSupervision(prompt, execOptions);

      return result;
    } catch (error) {
      this.state = ORCHESTRATION_STATE.ERROR;
      this.emit("error", { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get the full paths for allowed directories
   */
  getAllowedPaths() {
    return this.allowedDirectories.map(dir => path.join(this.workDir, dir));
  }

  /**
   * Check if a file path is within allowed directories
   */
  isPathAllowed(filePath) {
    if (!filePath) return false;

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.join(this.workDir, filePath));

    const allowedPaths = this.getAllowedPaths();

    // Check if the path starts with any allowed directory
    return allowedPaths.some(allowedPath => {
      const normalizedAllowed = path.normalize(allowedPath);
      return absolutePath.startsWith(normalizedAllowed + path.sep) ||
             absolutePath === normalizedAllowed;
    });
  }

  /**
   * Build directory context for the prompt
   */
  buildDirectoryContext() {
    const allowedPaths = this.getAllowedPaths();

    return `
DIRECTORY ACCESS RESTRICTIONS:
You are running inside BACKBONE and have LIMITED file system access.
You can ONLY access these directories within ${this.workDir}:

${this.allowedDirectories.map(dir => `- ${dir}/ - ${this.getDirectoryDescription(dir)}`).join("\n")}

SECURITY RULES:
- DO NOT access files outside these directories
- DO NOT access src/, node_modules/, bin/, or other system directories
- DO NOT modify .env, package.json, or configuration files
- All file paths must be within: ${allowedPaths.join(", ")}
- When using Bash, only operate within allowed directories
`;
  }

  /**
   * Get description for each allowed directory
   */
  getDirectoryDescription(dir) {
    const descriptions = {
      data: "User data, goals, settings, activity logs",
      memory: "AI memory, conversation history, learned context",
      projects: "User's projects being worked on",
      screenshots: "Screenshots for visual analysis"
    };
    return descriptions[dir] || "User data";
  }

  /**
   * Build the initial prompt for Claude Code
   * Includes full goal context: criteria, tasks, and data sources
   */
  buildClaudePrompt(goal, userContext = {}, agentIdentity = null) {
    const title = goal.title || goal;
    const description = goal.description || "";
    const context = goal.context || "";
    const directoryContext = this.buildDirectoryContext();

    // Get goal manager for criteria and tasks
    const goalManager = getGoalManager();
    const goalId = goal.id || goal.goalId;

    // Get completion criteria
    const criteria = goalId ? goalManager.getCriteria(goalId) : [];
    const criteriaSection = this.buildCriteriaSection(criteria);

    // Get tasks/plan
    const tasks = goalId ? goalManager.getTasks(goalId) : [];
    const tasksSection = this.buildTasksSection(tasks);

    // Get data sources if available
    const dataSources = goal.dataSources || goal.data_sources || [];
    const dataSourcesSection = this.buildDataSourcesSection(dataSources);

    // Build user context section from context providers
    const userContextSection = this.buildUserContextSection(userContext);

    // Agent identity injection — specialized domain context
    const agentSection = agentIdentity
      ? `## AGENT IDENTITY\n${agentIdentity}\n\n---\n\n`
      : "";

    // Determine project directory for saving findings
    const projectName = goal.project || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    let projectDir = "";
    try {
      projectDir = path.join(getProjectsDir(), projectName);
    } catch {
      projectDir = `projects/${projectName}`;
    }

    // Include original user message if available (critical for context)
    const originalMessage = goal.originalMessage || description || title;

    return `${agentSection}You are BACKBONE's autonomous engine, working on a goal for the user.

GOAL: "${title}"

${description ? `DESCRIPTION:\n${description}\n` : ""}
${goal.originalMessage ? `ORIGINAL USER REQUEST (verbatim):\n"${goal.originalMessage}"\n` : ""}
${context ? `CONTEXT:\n${context}\n` : ""}
${userContextSection}
${criteriaSection}
${tasksSection}
${dataSourcesSection}
${directoryContext}

EXECUTION INSTRUCTIONS:
1. Work autonomously to achieve this goal — DO THE ACTUAL WORK, don't just plan it
2. AVAILABLE TOOLS — use them aggressively:
   - **WebSearch** — search the web for information (USE THIS for any research task)
   - **WebFetch** — fetch and read web pages
   - **Read/Write/Edit** — read and create files
   - **Bash** — run commands, install tools, process data
   - **Grep/Glob** — search files and codebases
3. RESPECT DIRECTORY RESTRICTIONS — only access allowed directories
4. SAVE ALL FINDINGS to: ${projectDir}/findings.md
   - Create this file with your research results, analysis, and conclusions
   - Use markdown formatting with headers and bullet points
   - Include sources and links where applicable
5. For research tasks: search multiple sources, cross-reference, synthesize
6. For creation tasks: actually create the deliverable (document, code, plan)
7. When the goal is complete, clearly state "GOAL COMPLETE" with a summary

CRITICAL: The user is counting on you to DO the work, not describe what could be done.
If this involves finding information online, USE WebSearch and WebFetch NOW.
Save everything you find to the project directory.

Begin working on this goal now.`;
  }

  /**
   * Build user context section from context providers.
   * Gives Claude real knowledge about the user so it can work intelligently.
   */
  buildUserContextSection(ctx) {
    if (!ctx || Object.keys(ctx).length === 0) return "";

    const sections = [];

    // User identity — WHO is the user (name, background, details)
    if (ctx.profile && typeof ctx.profile === "string" && ctx.profile.length > 20) {
      sections.push(`WHO THE USER IS:\n${ctx.profile.slice(0, 800)}`);
    }

    // Family — names, relationships, personal details
    if (ctx.family && typeof ctx.family === "string" && ctx.family.length > 20) {
      sections.push(`USER'S FAMILY:\n${ctx.family.slice(0, 800)}`);
    }

    // Core beliefs
    if (ctx.beliefs && Array.isArray(ctx.beliefs) && ctx.beliefs.length > 0) {
      const beliefList = ctx.beliefs.map(b => `- ${b.name || b}: ${b.description || ""}`).join("\n");
      sections.push(`CORE BELIEFS (what the user cares about most):\n${beliefList}`);
    }

    // Current thesis/focus
    if (ctx.thesis && typeof ctx.thesis === "string" && ctx.thesis.length > 20) {
      sections.push(`CURRENT FOCUS:\n${ctx.thesis.slice(0, 800)}`);
    }

    // Active goals (so Claude knows what else is in flight)
    if (ctx.goals && Array.isArray(ctx.goals) && ctx.goals.length > 0) {
      const goalList = ctx.goals.slice(0, 5).map(g =>
        `- [${g.status || "active"}] ${g.title}${g.category ? ` (${g.category})` : ""}`
      ).join("\n");
      sections.push(`OTHER ACTIVE GOALS:\n${goalList}`);
    }

    // Portfolio snapshot
    if (ctx.portfolio && typeof ctx.portfolio === "string" && ctx.portfolio.length > 20) {
      sections.push(`PORTFOLIO SNAPSHOT:\n${ctx.portfolio.slice(0, 600)}`);
    }

    // Health snapshot
    if (ctx.health && typeof ctx.health === "string" && ctx.health.length > 20) {
      sections.push(`HEALTH SNAPSHOT:\n${ctx.health.slice(0, 400)}`);
    }

    // Conversation memory (what user has been talking about)
    if (ctx.conversations && typeof ctx.conversations === "string" && ctx.conversations.length > 20) {
      sections.push(`RECENT CONVERSATIONS (what the user has been discussing):\n${ctx.conversations.slice(0, 1500)}`);
    }

    if (sections.length === 0) return "";

    return `USER CONTEXT (use this to make informed decisions):\n${"─".repeat(50)}\n${sections.join("\n\n")}\n${"─".repeat(50)}\n`;
  }

  /**
   * Build completion criteria section for the prompt
   */
  buildCriteriaSection(criteria) {
    if (!criteria || criteria.length === 0) {
      return "";
    }

    const criteriaList = criteria.map((c, i) => {
      const status = c.met ? "✓" : "○";
      const description = c.description || c.criterion || c;
      const verification = c.verificationMethod ? ` (Verify: ${c.verificationMethod})` : "";
      return `  ${status} ${i + 1}. ${description}${verification}`;
    }).join("\n");

    return `COMPLETION CRITERIA (All must be met):
${criteriaList}

You must verify each criterion is satisfied before marking the goal complete.
`;
  }

  /**
   * Build tasks/plan section for the prompt
   */
  buildTasksSection(tasks) {
    if (!tasks || tasks.length === 0) {
      return "";
    }

    const taskList = tasks.map((task, i) => {
      // Determine status indicator
      let statusIcon = "○"; // pending
      if (task.state === TASK_STATE.COMPLETED) statusIcon = "✓";
      else if (task.state === TASK_STATE.IN_PROGRESS) statusIcon = "▶";
      else if (task.state === TASK_STATE.ON_HOLD) statusIcon = "◐";
      else if (task.state === TASK_STATE.BLOCKED) statusIcon = "✗";
      else if (task.state === TASK_STATE.SKIPPED) statusIcon = "⊘";

      const title = task.title || task.name || `Task ${i + 1}`;
      const description = task.description ? `\n      ${task.description}` : "";
      const dependencies = task.dependencies?.length ? `\n      Dependencies: ${task.dependencies.join(", ")}` : "";

      return `  ${statusIcon} ${i + 1}. ${title}${description}${dependencies}`;
    }).join("\n");

    return `EXECUTION PLAN (Work through in order):
${taskList}

Work through these tasks sequentially. Skip completed tasks. Report which task you're working on.
`;
  }

  /**
   * Build data sources section for the prompt
   */
  buildDataSourcesSection(dataSources) {
    if (!dataSources || dataSources.length === 0) {
      return "";
    }

    const sourcesList = dataSources.map((source, i) => {
      const name = source.name || source.title || `Source ${i + 1}`;
      const type = source.type || "unknown";
      const location = source.path || source.url || source.location || "";
      return `  ${i + 1}. [${type}] ${name}${location ? `: ${location}` : ""}`;
    }).join("\n");

    return `DATA SOURCES (Reference these for information):
${sourcesList}

`;
  }

  /**
   * Run Claude Code with GPT-5.2 supervision
   */
  async runClaudeWithSupervision(prompt, options = {}) {
    return new Promise((resolve) => {
      this.state = ORCHESTRATION_STATE.RUNNING;

      // Build Claude Code args — use stdin for prompt (not -p) to get real-time streaming
      // Use Opus 4.6 by default, falls back to Sonnet if rate limited
      const modelToUse = options.model || getCurrentModelInUse();
      const args = [
        "--model", modelToUse,
        "--output-format", "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        ...(fs.existsSync(getBackboneRoot()) ? ["--add-dir", getBackboneRoot()] : []),
        "--max-turns", String(this.maxTurns),
        // Engine mode: use minimal MCP config (chrome only)
        ...(options.engineMode ? ["--mcp-config", path.join(getBackboneRoot(), ".mcp-engine.json")] : []),
      ];

      // Resume session if we have one
      if (this.sessionId) {
        args.push("--resume", this.sessionId);
      }

      // Resolve the Claude CLI path for direct node execution (avoids Windows cmd.exe buffering)
      const claudeCliPath = path.join(process.env.APPDATA || "", "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
      const useDirectNode = fs.existsSync(claudeCliPath);

      const spawnCmd = useDirectNode
        ? process.execPath
        : (process.platform === "win32" ? "claude.cmd" : "claude");
      const spawnArgs = useDirectNode ? [claudeCliPath, ...args] : args;
      const spawnOpts = {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: options.workDir || this.workDir,
        env: { ...process.env, FORCE_COLOR: "0" },
        windowsHide: true,
      };

      debugLog(`Spawning: ${spawnCmd} ${spawnArgs.join(" ").slice(0, 200)}`);
      debugLog(`CWD: ${spawnOpts.cwd}`);

      // Spawn Claude Code
      this.claudeProcess = spawn(spawnCmd, spawnArgs, spawnOpts);

      // Send prompt via stdin for real-time stream-json output
      // In engine mode, prepend CLI tool catalog so the engine uses backbone-cli.js via Bash
      const finalPrompt = options.engineMode ? (ENGINE_CLI_CATALOG + "\n" + prompt) : prompt;
      this.claudeProcess.stdin.write(finalPrompt);
      this.claudeProcess.stdin.end();
      debugLog(`Prompt sent via stdin (${finalPrompt.length} chars)${options.engineMode ? " [ENGINE MODE]" : ""}`);

      let lineBuffer = "";
      let lastOutput = "";
      let evaluationTimer = null;
      let timeoutTimer = null;
      let stdinOpen = true;
      let stdoutBytes = 0;
      let stderrBytes = 0;

      // Timeout handler
      timeoutTimer = setTimeout(() => {
        this.killProcess("Timeout exceeded");
        resolve({
          success: false,
          error: "Execution timeout",
          output: this.outputBuffer,
          decisions: this.decisions
        });
      }, options.timeout || this.timeout);

      // Schedule periodic evaluation
      const scheduleEvaluation = () => {
        if (evaluationTimer) clearTimeout(evaluationTimer);

        evaluationTimer = setTimeout(async () => {
          if (this.state !== ORCHESTRATION_STATE.RUNNING) return;

          // Check if we have new output to evaluate
          if (this.outputBuffer.length > lastOutput.length) {
            lastOutput = this.outputBuffer;
            await this.evaluateProgress();

            // Check if we should take action based on evaluation
            const lastDecision = this.decisions[this.decisions.length - 1];
            if (lastDecision) {
              await this.actOnDecision(lastDecision, stdinOpen);

              if (lastDecision.decision === EVALUATION_DECISION.COMPLETE) {
                this.killProcess("Goal complete");
                clearTimeout(timeoutTimer);
                resolve({
                  success: true,
                  output: this.outputBuffer,
                  decisions: this.decisions,
                  toolCalls: this.toolCalls,
                  sessionId: this.sessionId
                });
                return;
              }
            }
          }

          // Schedule next evaluation
          if (this.state === ORCHESTRATION_STATE.RUNNING) {
            scheduleEvaluation();
          }
        }, this.evaluationInterval);
      };

      // Process streaming output
      const processLine = (line) => {
        if (!line.trim()) return;

        try {
          const msg = JSON.parse(line);

          // Track tool calls
          if (msg.type === "tool_use") {
            const tool = msg.tool?.name || msg.name || "unknown";
            const input = msg.tool?.input || msg.input || {};

            // SECURITY: Validate file paths for file operations
            const fileTools = ["Read", "Write", "Edit", "Grep", "Glob"];
            const filePath = input.file_path || input.path || input.file || null;

            if (fileTools.includes(tool) && filePath) {
              if (!this.isPathAllowed(filePath)) {
                console.warn(`[ClaudeOrchestrator] BLOCKED: ${tool} attempted to access restricted path: ${filePath}`);
                this.narrator.observe(`Security: Blocked access to restricted path`);
                this.emit("security-violation", { tool, path: filePath });
                // Don't record blocked operations
                return;
              }
            }

            // For Bash commands, check if they reference restricted paths
            if (tool === "Bash") {
              const command = input.command || input;
              const restrictedPaths = ["src/", "node_modules/", "bin/", ".env", "package.json", ".git/"];
              const accessesRestricted = restrictedPaths.some(rp =>
                command.includes(rp) || command.includes(rp.replace("/", "\\"))
              );

              if (accessesRestricted) {
                console.warn(`[ClaudeOrchestrator] WARNING: Bash command may access restricted paths: ${command.slice(0, 100)}`);
                this.narrator.observe(`Security: Monitoring bash command accessing system paths`);
              }
            }

            this.toolCalls.push({
              tool,
              input,
              timestamp: Date.now()
            });

            // Update narrator with Claude Code tool tracking
            this.narrator.recordClaudeCodeTool(tool, input);
            this.narrator.setClaudeCodeActive(true, "running");
            this.emit("tool-use", { tool, input });
          }

          // Track results
          if (msg.type === "result") {
            this.sessionId = msg.session_id || msg.sessionId;
          }

          // Track assistant messages
          if (msg.type === "assistant") {
            const text = msg.message?.content?.[0]?.text || msg.content || "";
            if (text) {
              this.emit("claude-text", { text });

              // Check for goal completion signals
              if (text.toLowerCase().includes("goal complete") ||
                  text.toLowerCase().includes("task complete") ||
                  text.toLowerCase().includes("successfully completed")) {
                this.emit("completion-signal", { text });
              }
            }
          }

        } catch (e) {
          // Not JSON, still add to buffer
        }

        this.outputBuffer += line + "\n";
      };

      // Handle stdout
      this.claudeProcess.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdoutBytes += data.length;
        if (stdoutBytes <= data.length) {
          debugLog(`First stdout data: ${stdoutBytes} bytes, preview: ${chunk.slice(0, 120)}`);
        }

        // Parse line by line
        lineBuffer += chunk;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop();

        for (const line of lines) {
          processLine(line);
        }

        this.emit("output", { chunk, type: "stdout" });

        // Start/reset evaluation timer
        scheduleEvaluation();
      });

      // Handle stderr
      this.claudeProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderrBytes += data.length;
        debugLog(`stderr (${stderrBytes} total): ${chunk.slice(0, 200)}`);
        this.emit("output", { chunk, type: "stderr" });
      });

      // Handle stdin close
      this.claudeProcess.stdin.on("close", () => {
        stdinOpen = false;
      });

      // Handle process close
      this.claudeProcess.on("close", (code) => {
        debugLog(`Process closed: code=${code}, stdout=${stdoutBytes}b, stderr=${stderrBytes}b`);
        if (evaluationTimer) clearTimeout(evaluationTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        // Process remaining buffer
        if (lineBuffer.trim()) {
          processLine(lineBuffer);
        }

        this.state = ORCHESTRATION_STATE.STOPPED;
        this.claudeProcess = null;

        this.emit("stopped", { code });

        resolve({
          success: code === 0,
          output: this.outputBuffer,
          decisions: this.decisions,
          toolCalls: this.toolCalls,
          sessionId: this.sessionId,
          exitCode: code
        });
      });

      // Handle errors
      this.claudeProcess.on("error", (error) => {
        debugLog(`Process error: ${error.message}`);
        if (evaluationTimer) clearTimeout(evaluationTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        this.state = ORCHESTRATION_STATE.ERROR;
        this.claudeProcess = null;

        this.emit("error", { error: error.message });

        resolve({
          success: false,
          error: error.message,
          output: this.outputBuffer,
          decisions: this.decisions
        });
      });
    });
  }

  /**
   * Collect evidence of goal completion from Claude's output and work artifacts
   */
  collectCompletionEvidence() {
    const evidence = { signals: [], score: 0 };
    const output = this.outputBuffer || "";
    const recentOutput = this.getRecentOutput(5000);

    // 1. Completion phrases in Claude's output (strong signal)
    const completionPhrases = [
      /goal\s+(?:is\s+)?complete/i,
      /task\s+(?:is\s+)?(?:complete|done|finished)/i,
      /(?:all|everything)\s+(?:is\s+)?(?:done|complete|finished)/i,
      /successfully\s+(?:completed|finished|created|built|delivered)/i,
      /I(?:'ve| have)\s+(?:completed|finished|done)\s+(?:the|this|all)/i,
      /(?:research|analysis|report|document)\s+(?:is\s+)?(?:ready|complete|done)/i,
      /wrapping\s+up/i,
      /that\s+(?:covers|completes|wraps)\s+(?:everything|it|the)/i,
    ];

    for (const phrase of completionPhrases) {
      if (phrase.test(recentOutput)) {
        evidence.signals.push(`completion-phrase: ${phrase.source}`);
        evidence.score += 25;
        break; // One phrase is enough
      }
    }

    // 2. File creation evidence (work product exists)
    if (this.toolCalls.length > 0) {
      const writeTools = this.toolCalls.filter(t =>
        t.tool === "Write" || t.tool === "Edit" || t.tool === "NotebookEdit"
      );
      if (writeTools.length > 0) {
        evidence.signals.push(`files-created: ${writeTools.length}`);
        evidence.score += 15;
      }

      // Web research completed
      const webTools = this.toolCalls.filter(t =>
        t.tool === "WebSearch" || t.tool === "WebFetch"
      );
      if (webTools.length >= 2) {
        evidence.signals.push(`web-research: ${webTools.length} searches`);
        evidence.score += 10;
      }
    }

    // 3. Turn count nearing max (natural completion)
    if (this.turnCount >= this.maxTurns - 1) {
      evidence.signals.push(`turns-exhausted: ${this.turnCount}/${this.maxTurns}`);
      evidence.score += 30;
    } else if (this.turnCount >= this.maxTurns * 0.7) {
      evidence.signals.push(`turns-high: ${this.turnCount}/${this.maxTurns}`);
      evidence.score += 10;
    }

    // 4. No new tool calls in recent output (Claude stopped working)
    const recentTools = this.toolCalls.filter(t =>
      t.timestamp && (Date.now() - t.timestamp) < 30000
    );
    if (this.turnCount > 3 && recentTools.length === 0) {
      evidence.signals.push("no-recent-tools");
      evidence.score += 15;
    }

    // 5. Error/failure signals (negative — NOT complete)
    const failurePhrases = [
      /(?:error|failed|cannot|unable|couldn't|can't)\s/i,
      /I\s+(?:need|require)\s+(?:more|additional|further)/i,
      /blocked\s+(?:by|on|because)/i,
    ];
    for (const phrase of failurePhrases) {
      if (phrase.test(recentOutput.slice(-1000))) {
        evidence.signals.push(`failure-signal: ${phrase.source}`);
        evidence.score -= 20;
        break;
      }
    }

    return evidence;
  }

  /**
   * Evaluate Claude's progress — evidence-based with optional GPT boost
   */
  async evaluateProgress() {
    this.state = ORCHESTRATION_STATE.EVALUATING;
    this.emit("evaluating");

    // First, update progress tracking based on recent output
    await this.updateProgress(this.outputBuffer);

    // ── EVIDENCE-BASED COMPLETION ──
    // Primary mechanism: check output + artifacts for completion signals
    const evidence = this.collectCompletionEvidence();

    if (evidence.score >= 50) {
      // Strong evidence of completion — mark complete without GPT
      const decision = {
        timestamp: Date.now(),
        turnCount: this.turnCount,
        decision: EVALUATION_DECISION.COMPLETE,
        reasoning: `Evidence-based completion (score: ${evidence.score}): ${evidence.signals.join(", ")}`,
        message: "",
        completedTasks: [],
        metCriteria: [],
        confidence: Math.min(evidence.score / 100, 1.0)
      };
      this.decisions.push(decision);
      this.emit("decision", decision);
      this.narrator.observe(`Evidence-based completion (${evidence.score}): ${evidence.signals.slice(0, 3).join(", ")}`);
      this.state = ORCHESTRATION_STATE.RUNNING;
      return decision;
    }

    // ── OPTIONAL GPT EVALUATION ──
    // If GPT is available, use it as a bonus evaluator for ambiguous cases
    try {
      const config = getMultiAIConfig();
      if (!config.gptInstant?.ready && !config.gptThinking?.ready) {
        // No GPT — use evidence score to decide
        if (evidence.score >= 30) {
          // Moderate evidence — lean toward completion
          const decision = {
            timestamp: Date.now(),
            turnCount: this.turnCount,
            decision: EVALUATION_DECISION.COMPLETE,
            reasoning: `Moderate evidence (${evidence.score}), no GPT: ${evidence.signals.join(", ")}`,
            message: "",
            completedTasks: [],
            metCriteria: [],
            confidence: evidence.score / 100
          };
          this.decisions.push(decision);
          this.emit("decision", decision);
          this.state = ORCHESTRATION_STATE.RUNNING;
          return decision;
        }
        return { decision: EVALUATION_DECISION.CONTINUE, reasoning: `Evidence score ${evidence.score} — continuing` };
      }

      // Get progress summary
      const progressSummary = this.getProgressSummary();

      // Build evaluation prompt with full context
      const evaluationPrompt = `You are supervising an AI agent (Claude) working on a goal.

GOAL: "${this.currentGoal?.title || this.currentGoal}"
${this.currentGoal?.description ? `\nDESCRIPTION: ${this.currentGoal.description}` : ""}

${progressSummary}

EVIDENCE SIGNALS: ${evidence.signals.join(", ")} (score: ${evidence.score})

RECENT OUTPUT FROM CLAUDE:
${this.getRecentOutput(3000)}

TOOLS USED SO FAR:
${this.toolCalls.slice(-10).map(t => `- ${t.tool}(${JSON.stringify(t.input).slice(0, 50)}...)`).join("\n")}

TURN COUNT: ${this.turnCount}/${this.maxTurns}

Evaluate Claude's progress and decide what to do:

1. CONTINUE - Claude is making good progress, let it keep working
2. REPLY - Send a follow-up message to Claude (include the message)
3. COMPLETE - Goal is achieved (evidence + output confirm it), stop execution
4. REDIRECT - Claude is off-track, send a correction (include the correction)
5. ESCALATE - There's a problem that needs human attention

Return JSON only:
{
  "decision": "continue|reply|complete|redirect|escalate",
  "reasoning": "brief explanation",
  "message": "message to send if reply/redirect",
  "confidence": 0.0-1.0
}`;

      const result = await sendMessage(evaluationPrompt, {}, TASK_TYPES.QUICK);

      // Parse response
      let parsed;
      try {
        let jsonStr = result.response;
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        parsed = { decision: EVALUATION_DECISION.CONTINUE, reasoning: "Parse error, continuing" };
      }

      // Record decision
      const decision = {
        timestamp: Date.now(),
        turnCount: this.turnCount,
        decision: parsed.decision || EVALUATION_DECISION.CONTINUE,
        reasoning: parsed.reasoning || "",
        message: parsed.message || "",
        completedTasks: parsed.completedTasks || [],
        metCriteria: parsed.metCriteria || [],
        confidence: parsed.confidence || 0.5
      };

      this.decisions.push(decision);
      this.emit("decision", decision);

      // Update narrator
      this.narrator.observe(`GPT Evaluation: ${decision.decision} - ${decision.reasoning}`);

      this.state = ORCHESTRATION_STATE.RUNNING;
      return decision;

    } catch (error) {
      console.error("[ClaudeOrchestrator] Evaluation error:", error.message);
      // Fallback to evidence on GPT error
      if (evidence.score >= 30) {
        return { decision: EVALUATION_DECISION.COMPLETE, reasoning: `GPT error, evidence score ${evidence.score}` };
      }
      return { decision: EVALUATION_DECISION.CONTINUE, reasoning: "Evaluation error" };
    }
  }

  /**
   * Act on an evaluation decision
   */
  async actOnDecision(decision, stdinOpen) {
    switch (decision.decision) {
      case EVALUATION_DECISION.REPLY:
      case EVALUATION_DECISION.REDIRECT:
        if (decision.message && stdinOpen && this.claudeProcess?.stdin) {
          this.state = ORCHESTRATION_STATE.RESPONDING;
          this.claudeProcess.stdin.write(decision.message + "\n");
          this.turnCount++;
          this.emit("replied", { message: decision.message });
          this.narrator.observe(`Sent to Claude: ${decision.message.slice(0, 50)}...`);
        }
        break;

      case EVALUATION_DECISION.COMPLETE:
        // Will be handled by caller
        this.narrator.observe("Goal marked complete by GPT-5.2");
        break;

      case EVALUATION_DECISION.ESCALATE:
        this.emit("escalate", { decision });
        this.narrator.observe(`ESCALATION NEEDED: ${decision.reasoning}`);
        break;

      case EVALUATION_DECISION.CONTINUE:
      default:
        // Do nothing, let Claude continue
        break;
    }
  }

  /**
   * Get recent output for evaluation (truncated)
   */
  getRecentOutput(maxLength = 3000) {
    if (this.outputBuffer.length <= maxLength) {
      return this.outputBuffer;
    }
    return "...[truncated]...\n" + this.outputBuffer.slice(-maxLength);
  }

  /**
   * Kill the Claude process
   */
  killProcess(reason = "Terminated") {
    if (this.claudeProcess) {
      this.claudeProcess.kill();
      this.claudeProcess = null;
      this.emit("killed", { reason });
    }
    this.state = ORCHESTRATION_STATE.STOPPED;

    // NOTIFY NARRATOR: Claude Code is now INACTIVE
    this.narrator.setClaudeCodeActive(false, "complete");
  }

  /**
   * Send input to Claude (for interactive use)
   */
  sendInput(input) {
    if (this.claudeProcess?.stdin) {
      this.claudeProcess.stdin.write(input + "\n");
      this.turnCount++;
      this.emit("input-sent", { input });
      return true;
    }
    return false;
  }

  /**
   * Stop execution
   */
  stop() {
    this.killProcess("User stopped");
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      goal: this.currentGoal,
      turnCount: this.turnCount,
      maxTurns: this.maxTurns,
      toolCalls: this.toolCalls.length,
      lastDecision: this.decisions[this.decisions.length - 1] || null,
      sessionId: this.sessionId
    };
  }

  /**
   * Update progress based on Claude's output
   * Called during evaluation to sync progress with goal manager
   */
  async updateProgress(output) {
    const goalManager = getGoalManager();
    const goalId = this.currentGoal?.id || this.currentGoal?.goalId;

    if (!goalId) return;

    // Check for task completion signals in output
    const taskCompletionRegex = /(?:completed|finished|done with)\s+(?:task\s+)?(\d+)|task\s+(\d+)\s+(?:complete|done|finished)/gi;
    let match;
    while ((match = taskCompletionRegex.exec(output)) !== null) {
      const taskNum = parseInt(match[1] || match[2]) - 1; // Convert to 0-based index
      const tasks = goalManager.getTasks(goalId);
      if (tasks[taskNum] && tasks[taskNum].state !== TASK_STATE.COMPLETED) {
        goalManager.completeTask(goalId, tasks[taskNum].id, {
          completedBy: "claude-code",
          output: output.slice(Math.max(0, match.index - 200), match.index + 200)
        });
        this.emit("task-completed", { goalId, taskId: tasks[taskNum].id, taskNum: taskNum + 1 });
        this.narrator.observe(`Task ${taskNum + 1} completed by Claude Code`);
      }
    }

    // Check for criterion verification signals
    const criterionRegex = /(?:criterion|criteria)\s+(\d+)\s+(?:met|satisfied|verified)|(?:verified|confirmed)\s+(?:criterion|criteria)\s+(\d+)/gi;
    while ((match = criterionRegex.exec(output)) !== null) {
      const criterionNum = parseInt(match[1] || match[2]) - 1;
      const criteria = goalManager.getCriteria(goalId);
      if (criteria[criterionNum] && !criteria[criterionNum].met) {
        goalManager.markCriterionMet(goalId, criterionNum, {
          verifiedBy: "claude-code",
          evidence: output.slice(Math.max(0, match.index - 200), match.index + 200)
        });
        this.emit("criterion-met", { goalId, criterionIndex: criterionNum + 1 });
        this.narrator.observe(`Criterion ${criterionNum + 1} verified by Claude Code`);
      }
    }

    // Check for goal completion signal
    if (output.toLowerCase().includes("goal complete") ||
        output.toLowerCase().includes("all criteria met") ||
        output.toLowerCase().includes("all tasks completed")) {

      // Verify all criteria are actually met
      const allCriteriaMet = await goalManager.evaluateCriteria(goalId);

      if (allCriteriaMet) {
        this.emit("goal-complete", { goalId });
        this.narrator.observe(`Goal "${this.currentGoal?.title}" completed by Claude Code`);
      }
    }
  }

  /**
   * Mark a specific task as in progress
   */
  markTaskInProgress(taskNum) {
    const goalManager = getGoalManager();
    const goalId = this.currentGoal?.id || this.currentGoal?.goalId;

    if (!goalId) return;

    const tasks = goalManager.getTasks(goalId);
    const taskIndex = taskNum - 1; // Convert to 0-based

    if (tasks[taskIndex] && tasks[taskIndex].state === TASK_STATE.PENDING) {
      goalManager.startTask(goalId, tasks[taskIndex].id);
      this.emit("task-started", { goalId, taskId: tasks[taskIndex].id, taskNum });
      this.narrator.observe(`Starting task ${taskNum}: ${tasks[taskIndex].title}`);
    }
  }

  /**
   * Get summary of goal progress for evaluation
   */
  getProgressSummary() {
    const goalManager = getGoalManager();
    const goalId = this.currentGoal?.id || this.currentGoal?.goalId;

    if (!goalId) return "No goal context available";

    const criteria = goalManager.getCriteria(goalId);
    const tasks = goalManager.getTasks(goalId);

    const criteriaStatus = criteria.map((c, i) =>
      `${c.met ? "✓" : "○"} Criterion ${i + 1}: ${c.description || c.criterion}`
    ).join("\n");

    const taskStatus = tasks.map((t, i) => {
      const icons = {
        [TASK_STATE.COMPLETED]: "✓",
        [TASK_STATE.IN_PROGRESS]: "▶",
        [TASK_STATE.ON_HOLD]: "◐",
        [TASK_STATE.BLOCKED]: "✗",
        [TASK_STATE.SKIPPED]: "⊘",
        [TASK_STATE.PENDING]: "○"
      };
      return `${icons[t.state] || "○"} Task ${i + 1}: ${t.title || t.name}`;
    }).join("\n");

    const completedTasks = tasks.filter(t => t.state === TASK_STATE.COMPLETED).length;
    const metCriteria = criteria.filter(c => c.met).length;

    return `PROGRESS SUMMARY:
Tasks: ${completedTasks}/${tasks.length} completed
Criteria: ${metCriteria}/${criteria.length} met

CRITERIA STATUS:
${criteriaStatus || "No criteria defined"}

TASK STATUS:
${taskStatus || "No tasks defined"}`;
  }

  /**
   * Continue a previous session
   */
  async continueSession(prompt, options = {}) {
    if (!this.sessionId) {
      return {
        success: false,
        error: "No session to continue"
      };
    }

    return this.runClaudeWithSupervision(prompt, options);
  }

  /**
   * Agent SDK execution path.
   *
   * Uses the SDK's built-in agent loop instead of spawning `claude` and
   * supervising with GPT-5.2. Keeps the SAME event interface so the UI
   * doesn't need to change.
   */
  async runClaudeWithAgentSdk(prompt, options = {}) {
    this.state = ORCHESTRATION_STATE.RUNNING;
    this.outputBuffer = "";
    this.toolCalls = [];
    this.decisions = [];

    const workDir = options.workDir || this.workDir || process.cwd();
    const timeoutMs = Number.isFinite(options.timeout) ? options.timeout : this.timeout;

    // Stream SDK output into the same events used by the UI.
    // In engine mode, restrict MCP to chrome-only (engine uses backbone-cli.js via Bash)
    const engineMcpServers = options.engineMode ? {
      "claude-in-chrome": {
        command: "npx",
        args: ["-y", "@anthropic-ai/claude-code-mcp-in-chrome"],
      },
    } : undefined;

    const result = await runClaudeAgentSdkTask(
      prompt,
      workDir,
      (event) => {
        if (!event || typeof event !== "object") return;

        if (event.type === "assistant_text") {
          const text = String(event.text || "");
          if (!text) return;

          // Mirror the CLI path: clean assistant text in `claude-text`, raw-ish data in `output`.
          this.emit("claude-text", { text });
          this.emit("output", { chunk: text + "\n", type: "stdout" });
          this.outputBuffer += text + "\n";

          // Completion signals (best-effort)
          const lower = text.toLowerCase();
          if (lower.includes("goal complete") ||
              lower.includes("task complete") ||
              lower.includes("successfully completed")) {
            this.emit("completion-signal", { text });
          }

          return;
        }

        if (event.type === "tool_call") {
          const tool = String(event.tool || "unknown");
          const input = event.input || {};
          this.toolCalls.push({ tool, input });

          // Narrator tracking (matches CLI path).
          try {
            this.narrator.recordClaudeCodeTool(tool, input);
            this.narrator.setClaudeCodeActive(true, "running");
          } catch {}

          this.emit("tool-use", { tool, input });
          return;
        }

        if (event.type === "tool_result") {
          // Not currently forwarded to the UI, but keep stderr/out buffer intact if needed.
          return;
        }

        if (event.type === "stderr") {
          const chunk = String(event.text || "");
          if (!chunk) return;
          this.emit("output", { chunk, type: "stderr" });
          this.outputBuffer += chunk + "\n";
          return;
        }

        if (event.type === "error") {
          const msg = String(event.error || "unknown error");
          this.emit("error", { error: msg });
          return;
        }
      },
      {
        timeoutMs,
        permissionMode: process.env.BACKBONE_CLAUDE_PERMISSION_MODE || "bypassPermissions",
        model: options.model || null,
        settingSources: ["project", "user", "local"],
        ...(engineMcpServers ? { mcpServers: engineMcpServers } : {}),
      }
    );

    this.state = result.success ? ORCHESTRATION_STATE.STOPPED : ORCHESTRATION_STATE.ERROR;

    return {
      success: !!result.success,
      output: this.outputBuffer || result.output || "",
      decisions: this.decisions,
      toolCalls: this.toolCalls,
      sessionId: null,
      exitCode: result.exitCode ?? (result.success ? 0 : 1),
      error: result.error || null,
      method: "claude-agent-sdk",
    };
  }
}

// Singleton instance
let orchestratorInstance = null;

export const getClaudeOrchestrator = (options = {}) => {
  if (!orchestratorInstance) {
    orchestratorInstance = new ClaudeOrchestrator(options);
  }
  return orchestratorInstance;
};

export default ClaudeOrchestrator;
