/**
 * Claude Engine - Opens a real terminal window to run Claude
 *
 * Simple approach:
 * 1. Open a visible terminal window
 * 2. Run Claude CLI there (user can see everything)
 * 3. Claude does work and updates files
 * 4. Terminal closes when done
 * 5. Engine reads updated files to show what happened
 */

import { exec, execSync } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import os from "os";
import { getClaudeCodeStatus } from "./claude-code-cli.js";
import { hasValidCredentials as hasCodexCredentials } from "./codex-oauth.js";
import { getActivityNarrator } from "../ui/activity-narrator.js";
import { updateProjects } from "../app-store.js";

import { getDataDir, getMemoryDir, getProjectsDir, getBackboneRoot } from "../paths.js";
const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const CURRENT_WORK_FILE = path.join(MEMORY_DIR, "current-work.md");
const ENGINE_LOG_FILE = path.join(MEMORY_DIR, "engine-work-log.md");
const ENGINE_STATE_FILE = path.join(DATA_DIR, "claude-engine-state.json");

// Cooldown: 1 hour between runs
const ENGINE_COOLDOWN_MS = 60 * 60 * 1000;

// Claude CLI path
const CLAUDE_CMD = process.platform === "win32"
  ? path.join(os.homedir(), "AppData", "Roaming", "npm", "claude.cmd")
  : "claude";
const CODEX_CMD = process.platform === "win32"
  ? path.join(os.homedir(), "AppData", "Roaming", "npm", "codex.cmd")
  : "codex";

/** Read persisted engine state from disk */
function loadEngineState() {
  try {
    if (fs.existsSync(ENGINE_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(ENGINE_STATE_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

/** Save engine state to disk */
function saveEngineState(state) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ENGINE_STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

class ClaudeEngine extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.workCount = 0;
    this.currentPid = null;
    this.currentBackend = null;
    this.currentStartTime = null;
    this.currentLogPath = null;
    this.triedRetry = false;
    this.lastRateLimitAt = null;
    this.lastLogSize = 0;

    // Restore last run time from disk so cooldown persists across restarts
    const saved = loadEngineState();
    this.lastRunCompletedAt = saved.lastRunCompletedAt ? new Date(saved.lastRunCompletedAt).getTime() : null;
    const savedLimitMs = Number(saved.claudeRateLimitedUntilMs);
    this.claudeRateLimitedUntilMs = Number.isFinite(savedLimitMs)
      ? savedLimitMs
      : null;
  }

  isRateLimitOutput(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.includes("rate limit") ||
      lower.includes("rate-limit") ||
      lower.includes("hit your limit") ||
      lower.includes("you've hit your limit") ||
      lower.includes("you have hit your limit") ||
      lower.includes("usage limit") ||
      lower.includes("quota exceeded") ||
      lower.includes("too many requests") ||
      lower.includes("429") ||
      (lower.includes("resets") && lower.includes("limit"))
    );
  }

  saveState() {
    saveEngineState({
      lastRunCompletedAt: this.lastRunCompletedAt ? new Date(this.lastRunCompletedAt).toISOString() : null,
      claudeRateLimitedUntilMs: this.claudeRateLimitedUntilMs || null
    });
  }

  isCodexReady() {
    try {
      const hasAuth = hasCodexCredentials() || Boolean(process.env.OPENAI_API_KEY);
      if (!hasAuth) return false;
      execSync(`"${CODEX_CMD}" --version`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000
      });
      return true;
    } catch {
      return false;
    }
  }

  clearExpiredClaudeLimit() {
    if (this.claudeRateLimitedUntilMs && Date.now() >= this.claudeRateLimitedUntilMs) {
      this.claudeRateLimitedUntilMs = null;
      this.saveState();
      this.emit("status", "Claude rate limit window expired - returning to Claude.");
    }
  }

  parseClaudeResetUntilMs(text) {
    const raw = text || "";
    const lower = raw.toLowerCase();
    if (!lower.includes("limit") && !lower.includes("rate")) return null;

    const monthMap = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, sept: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };

    const parseOffsetMinutes = (date, timeZone) => {
      try {
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone,
          timeZoneName: "shortOffset",
          hour: "2-digit",
          minute: "2-digit"
        });
        const tzName = fmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "";
        const mm = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
        if (!mm) return null;
        const sign = mm[1] === "-" ? -1 : 1;
        const hh = Number.parseInt(mm[2], 10);
        const min = mm[3] ? Number.parseInt(mm[3], 10) : 0;
        return sign * (hh * 60 + min);
      } catch {
        return null;
      }
    };

    const buildUtcFromLocalParts = (y, mo, d, hh24, min, timeZone) => {
      const guess = new Date(Date.UTC(y, mo, d, hh24, min, 0));
      const offsetMinutes = parseOffsetMinutes(guess, timeZone);
      if (offsetMinutes == null) return null;
      return Date.UTC(y, mo, d, hh24, min, 0) - (offsetMinutes * 60 * 1000);
    };

    // Pattern: "resets Feb 16, 11am (America/New_York)"
    const withDate = raw.match(/resets?\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?/i);
    if (withDate) {
      const monthName = (withDate[1] || "").toLowerCase();
      const month = monthMap[monthName];
      if (month == null) return null;

      const day = Number.parseInt(withDate[2], 10);
      const hour12 = Number.parseInt(withDate[3], 10);
      const minute = withDate[4] ? Number.parseInt(withDate[4], 10) : 0;
      const ampm = (withDate[5] || "").toLowerCase();
      const timeZone = (withDate[6] && withDate[6].includes("/")) ? withDate[6].trim() : "America/New_York";

      let hour = hour12 % 12;
      if (ampm === "pm") hour += 12;

      const now = new Date();
      const year = now.getUTCFullYear();
      let untilMs = buildUtcFromLocalParts(year, month, day, hour, minute, timeZone);
      if (untilMs == null) return null;

      // If parsed date is already in the past, assume next year.
      if (untilMs <= Date.now() - (5 * 60 * 1000)) {
        untilMs = buildUtcFromLocalParts(year + 1, month, day, hour, minute, timeZone) || untilMs;
      }
      return untilMs;
    }

    // Pattern: "resets 3pm (America/New_York)"
    const timeOnly = raw.match(/resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?:\s*\(([^)]+)\))?/i);
    if (!timeOnly) return null;

    const hour12 = Number.parseInt(timeOnly[1], 10);
    const minute = timeOnly[2] ? Number.parseInt(timeOnly[2], 10) : 0;
    const ampm = (timeOnly[3] || "").toLowerCase();
    const timeZone = (timeOnly[4] && timeOnly[4].includes("/")) ? timeOnly[4].trim() : "America/New_York";

    let hour = hour12 % 12;
    if (ampm === "pm") hour += 12;

    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [y, mo, d] = dateStr.split("-").map((n) => Number.parseInt(n, 10));

    let untilMs = buildUtcFromLocalParts(y, mo - 1, d, hour, minute, timeZone);
    if (untilMs == null) return null;
    if (untilMs <= Date.now()) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(tomorrow);
      const [ty, tmo, td] = tDateStr.split("-").map((n) => Number.parseInt(n, 10));
      untilMs = buildUtcFromLocalParts(ty, tmo - 1, td, hour, minute, timeZone) || untilMs;
    }
    return untilMs;
  }

  /**
   * Detect auth/API key errors in CLI output.
   * Only checks the FIRST 500 chars to avoid false positives from Claude's actual responses
   * (e.g. Claude discussing Alpaca API keys would trigger a false match on the full log).
   * Returns a descriptive string if an auth error is found, null otherwise.
   */
  detectAuthError(text, { fullText = false } = {}) {
    if (!text) return null;
    // Only check the start of output — auth errors happen immediately, not mid-response
    const checkText = fullText ? text : text.slice(0, 500);
    const lower = checkText.toLowerCase();

    // ANTHROPIC_API_KEY specific — most common CLI auth error
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
      return "API credit balance too low — ANTHROPIC_API_KEY is being used instead of Pro/Max subscription. Restarting without API key.";
    }

    return null;
  }

  /**
   * Parse a stream-json line into human-readable text for the UI.
   * Claude Code CLI with --output-format stream-json emits one JSON object per line.
   */
  _parseStreamLine(line) {
    try {
      const msg = JSON.parse(line);
      const type = msg.type;

      // Codex stream-json style messages can use text/delta/output_text/message.
      const codexText =
        (typeof msg.delta === "string" && msg.delta) ||
        (typeof msg.text === "string" && msg.text) ||
        (typeof msg.output_text === "string" && msg.output_text) ||
        (typeof msg.message === "string" && msg.message) ||
        null;
      if (codexText) {
        const first = codexText.split("\n").find((l) => l.trim());
        return first ? first.trim().slice(0, 120) : null;
      }

      if (type === "assistant") {
        // Extract text from assistant messages
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          const parts = [];
          for (const block of content) {
            if (block.type === "text" && block.text) {
              // Split multi-line text and return first meaningful line
              const lines = block.text.split("\n").filter(l => l.trim());
              for (const l of lines) {
                parts.push(l.trim());
              }
            } else if (block.type === "tool_use") {
              // Tool use inside assistant message content
              const tool = block.name || "Tool";
              const input = block.input || {};
              parts.push(this._formatToolCall(tool, input));
            }
          }
          return parts.length > 0 ? parts.join("\n") : null;
        }
        return null;
      }

      if (type === "tool_use" || type === "content_block_start") {
        const tool = msg.tool?.name || msg.content_block?.name || msg.name;
        const input = msg.tool?.input || msg.content_block?.input || msg.input || {};
        if (tool) return this._formatToolCall(tool, input);
        return null;
      }

      if (type === "tool_result" || type === "content_block_stop") {
        return null; // Don't show raw tool results - too noisy
      }

      if (type === "result") {
        const text = msg.result?.text || msg.result || "";
        if (typeof text === "string" && text.trim()) {
          const firstLine = text.split("\n").find(l => l.trim());
          return firstLine ? `✓ ${firstLine.trim().slice(0, 70)}` : null;
        }
        return null;
      }

      if (type === "system") {
        return null; // Skip system messages
      }

      if (type === "error") {
        return `Error: ${msg.error?.message || msg.error || "unknown"}`;
      }

      // Unknown type - skip it
      return null;
    } catch {
      // Not valid JSON - emit as-is (could be plain text output)
      if (line.length > 0 && !line.startsWith("{")) {
        return line.slice(0, 80);
      }
      return null;
    }
  }

  /**
   * Format a tool call into a human-readable string that CLIOutputStream can render
   */
  _formatToolCall(tool, input) {
    switch (tool) {
      case "Read":
        return `Read(${input.file_path || input.path || "..."})`;
      case "Write":
        return `Write(${input.file_path || input.path || "..."})`;
      case "Edit":
        return `Edit(${input.file_path || input.path || "..."})`;
      case "Bash":
        return `Bash(${(input.command || "...").slice(0, 60)})`;
      case "Glob":
        return `Glob(${input.pattern || "..."})`;
      case "Grep":
        return `Grep(${input.pattern || "..."} ${input.path || ""})`;
      case "WebSearch":
        return `WebSearch(${input.query || "..."})`;
      case "WebFetch":
      case "Fetch":
        return `Fetch(${input.url || "..."})`;
      case "Task":
        return `Task(${input.description || "..."})`;
      default:
        // MCP tools: mcp__backbone-google__search → Google: search
        if (tool.startsWith("mcp__backbone-")) {
          const parts = tool.replace("mcp__backbone-", "").split("__");
          const server = parts[0] || "mcp";
          const method = parts.slice(1).join("/") || "call";
          return `${server}: ${method}`;
        }
        return `${tool}(...)`;
    }
  }

  /**
   * Detect which project is being worked on from current-work.md or recent file changes
   */
  detectCurrentProject() {
    try {
      const workContent = this.readWorkStatus();
      // Look for project references in the work file
      const projectMatch = workContent.match(/projects?[/\\]([a-z0-9-]+)/i);
      if (projectMatch) {
        return projectMatch[1];
      }
      // Look for "Working on: <project>" pattern
      const workingOnMatch = workContent.match(/working on[:\s]+([a-z0-9-]+)/i);
      if (workingOnMatch) {
        return workingOnMatch[1];
      }
      // Check projects directory for recently modified PROJECT.md
      const projectsDir = getProjectsDir();
      if (fs.existsSync(projectsDir)) {
        const projects = fs.readdirSync(projectsDir);
        let mostRecent = null;
        let mostRecentTime = 0;
        for (const proj of projects) {
          const projectFile = path.join(projectsDir, proj, "PROJECT.md");
          if (fs.existsSync(projectFile)) {
            const stat = fs.statSync(projectFile);
            if (stat.mtimeMs > mostRecentTime) {
              mostRecentTime = stat.mtimeMs;
              mostRecent = proj;
            }
          }
        }
        // Only return if modified in last 5 minutes
        if (mostRecent && Date.now() - mostRecentTime < 5 * 60 * 1000) {
          return mostRecent;
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Update the store with current working project
   */
  setCurrentWorkingProject(projectName) {
    try {
      updateProjects({ currentWorkingProject: projectName });
    } catch (e) {}
  }

  /**
   * Ensure current-work.md exists
   */
  ensureWorkFile() {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    if (!fs.existsSync(CURRENT_WORK_FILE)) {
      const content = `# Current Work

## Status
Ready

## Task
Check data/backlog.json and work on highest priority item.

## Progress
(none yet)

## Last Updated
${new Date().toISOString()}
`;
      fs.writeFileSync(CURRENT_WORK_FILE, content);
    }

    if (!fs.existsSync(ENGINE_LOG_FILE)) {
      const header = `# Engine Work Log\n\nCreated: ${new Date().toISOString()}\n\n`;
      fs.writeFileSync(ENGINE_LOG_FILE, header);
    }
  }

  /**
   * Read current work status from file
   */
  readWorkStatus() {
    try {
      if (fs.existsSync(CURRENT_WORK_FILE)) {
        return fs.readFileSync(CURRENT_WORK_FILE, "utf-8");
      }
    } catch (e) {}
    return "No status available";
  }

  /**
   * Build prompt for Claude
   */
  buildPrompt() {
    // Rotate through background projects to ensure variety
    const bgProjects = ["market-analysis", "disaster-planning", "financial-growth"];
    const projectIndex = this.workCount % bgProjects.length;
    const priorityProject = bgProjects[projectIndex];

    return `You are BACKBONE - a life optimization AI. Your job is to produce ANALYST-GRADE research and make FORWARD PROGRESS.

## STEP 1: LOAD FULL CONTEXT (Read ALL memory files)
Read these files to understand the user completely:

**User Profile:**
- memory/profile.md - Core profile
- memory/profile-general.md - General info
- memory/profile-work.md - Work/career
- memory/profile-education.md - Education background
- memory/profile-startup.md - Startup experience

**Current State:**
- memory/thesis.md - Current focus and priorities
- memory/goals.md - Active goals
- memory/user-goals.md - User-defined goals
- memory/health.md - Health status
- memory/portfolio.md - Financial snapshot
- memory/tickers.md - Tracked stocks

**System:**
- memory/BACKBONE.md - System overview
- memory/integrations.md - Connected services

**Also check data files:**
- data/goals.json - Structured goals
- data/backlog.json - Pending items
- data/core-beliefs.json - Core values
- data/oura-data.json - Health metrics
- data/trades-log.json - Trading history

## STEP 2: CHECK WHAT WAS DONE (MANDATORY)
**READ memory/engine-work-log.md** - see the "RECENT WORK" table.
Whatever is listed there, DO NOT DO AGAIN. Pick something DIFFERENT.

If the last 5 cycles were all about stocks/ZS, you MUST work on something else:
- Health analysis (use Oura data)
- Career/learning progress
- Disaster planning
- Broad market analysis (not single stocks)
- Financial planning (holistic, not one position)

## STEP 3: Background Projects (Rotate Each Run)
These 3 projects need REGULAR updates with REAL DATA:

1. **projects/market-analysis/PROJECT.md** - Market Analysis
   - Fill tables with ACTUAL numbers from web research
   - Update indices, sectors, economic indicators
   - Add dated entries to Progress Log

2. **projects/disaster-planning/PROJECT.md** - Disaster Preparedness
   - Assess current threat levels for each domain
   - Update risk matrices with real-world data
   - Log any emerging threats or changes

3. **projects/financial-growth/PROJECT.md** - Financial Planning
   - Track portfolio performance with real numbers
   - Update FI metrics and progress
   - Identify opportunities and risks

**THIS RUN: Focus on "${priorityProject}"** (but check if it was just updated - if so, pick another)

## QUALITY STANDARDS
Your output must be:
- **Data-rich**: Replace every "-" placeholder with real numbers
- **Analyst-grade**: A manager should be able to read it and make decisions
- **Dated**: Every update gets a timestamp in the Progress Log
- **Sourced**: Include where data came from
- **Actionable**: End with specific next steps

## WORKFLOW
1. Read memory/engine-work-log.md - see what was done (DON'T REPEAT)
2. Read the priority project's PROJECT.md
3. Do WEB RESEARCH to get current data
4. UPDATE the project file with real numbers and findings
5. Add entry to Progress Log with date
6. Update memory/current-work.md with what you did

## ANTI-REPETITION RULES
- Check engine-work-log.md FIRST
- If this project was updated in the last run, work on a DIFFERENT one
- Never just re-read data without adding NEW information
- Each run should add VALUE, not duplicate

## ALSO CONSIDER (if time permits)
- Other projects in projects/ folder
- Backlog items in data/backlog.json
- User goals in data/goals.json

## OUTPUT FORMAT
When updating PROJECT.md files:
- Replace "-" with actual data
- Add source references
- Include timestamps
- Write analysis that explains "so what?"

Start by reading engine-work-log.md to see recent work, then update the priority project with FRESH DATA.`;
  }

  appendEngineLog(entry) {
    try {
      fs.appendFileSync(ENGINE_LOG_FILE, entry, "utf-8");
    } catch (e) {
      // Non-fatal
    }
  }

  /**
   * Start Claude in a visible terminal window
   */
  async start(backendOverride = null) {
    if (this.isRunning) {
      return { success: false, reason: "Already running" };
    }

    if (!backendOverride) {
      this.triedRetry = false;
    }

    const now = Date.now();
    if (this.lastRunCompletedAt && now - this.lastRunCompletedAt < ENGINE_COOLDOWN_MS) {
      const waitMs = ENGINE_COOLDOWN_MS - (now - this.lastRunCompletedAt);
      const waitMin = Math.ceil(waitMs / 60000);
      this.emit("status", `Ran ${Math.round((now - this.lastRunCompletedAt) / 60000)} min ago — cooldown ${waitMin} min remaining. Use /engine start to override.`);
      return { success: false, reason: "Cooldown", waitMs };
    }

    const status = await getClaudeCodeStatus();
    const codexReady = this.isCodexReady();
    this.clearExpiredClaudeLimit();
    const claudeLimited = this.claudeRateLimitedUntilMs && Date.now() < this.claudeRateLimitedUntilMs;
    const backend = backendOverride || (
      claudeLimited
        ? (codexReady ? "codex" : (status.ready ? "claude" : null))
        : (status.ready ? "claude" : (codexReady ? "codex" : null))
    );

    if (!backend) {
      this.emit("status", "No CLI backend is ready (Claude/Codex) - check installation/login.");
      return { success: false, reason: "No CLI backend ready" };
    }

    if (claudeLimited && backend === "codex") {
      this.emit("status", `Claude rate-limited until ${new Date(this.claudeRateLimitedUntilMs).toLocaleString()} - using Codex.`);
    }

    this.ensureWorkFile();
    this.isRunning = true;
    this.workCount++;
    this.currentBackend = backend;
    this.currentStartTime = Date.now();

    const backendLabel = backend === "codex" ? "Codex" : "Claude";
    const narrator = getActivityNarrator();
    narrator.setState("WORKING", `${backendLabel} terminal open`);
    narrator.setGoal("Working in terminal window");
    narrator.setClaudeCodeActive(true, "working");

    this.emit("status", `Opening ${backendLabel} terminal...`);
    this.emit("started");

    // Mark that we're starting work (will detect specific project later)
    this.setCurrentWorkingProject("analyzing");

    const prompt = this.buildPrompt();
    const cwd = process.cwd();
    const backboneRoot = getBackboneRoot();
    const claudeAddDirArg =
      backboneRoot && fs.existsSync(backboneRoot)
        ? `--add-dir "${backboneRoot}"`
        : "";
    const codexHome = path.join(DATA_DIR, "codex-home");
    try { fs.mkdirSync(codexHome, { recursive: true }); } catch {}
    const codexModel = process.env.CODEX_CLI_MODEL || "gpt-5.3-codex";
    const codexReasoning = String(process.env.CODEX_REASONING_EFFORT || "xhigh").trim() || "xhigh";

    // Write prompt to a temp file to avoid cmd.exe quoting/newline issues
    const promptPath = path.join(os.tmpdir(), `backbone-cli-prompt-${Date.now()}.txt`);
    const logPath = path.join(os.tmpdir(), `backbone-cli-log-${backend}-${Date.now()}.txt`);
    this.currentLogPath = logPath;
    this.lastLogSize = 0;
    fs.writeFileSync(promptPath, prompt, "utf-8");

    // No separate script files needed - run directly in batch

    // Create a batch script that runs CLI and then pauses briefly so user can see result
    // IMPORTANT: Unset ANTHROPIC_API_KEY so CLI uses Pro/Max OAuth subscription instead of API key
    const runCommand = backend === "codex"
      ? `type "${promptPath}" | "${CODEX_CMD}" exec --json --full-auto --color never --add-dir "${codexHome}" -C "${cwd}" -m "${codexModel}" -c model_reasoning_effort=${codexReasoning} - > "${logPath}" 2>&1`
      : `type "${promptPath}" | "${CLAUDE_CMD}" --print --verbose --output-format stream-json --dangerously-skip-permissions ${claudeAddDirArg} --allowedTools "Read,Glob,Grep,WebFetch,WebSearch,Task,Write,Edit,Bash,mcp__backbone-google,mcp__backbone-linkedin,mcp__backbone-contacts,mcp__backbone-news,mcp__backbone-life,mcp__backbone-health,mcp__backbone-trading,mcp__backbone-projects" > "${logPath}" 2>&1`;

    const batchContent = `@echo off
title BACKBONE ${backendLabel}
cd /d "${cwd}"
set ANTHROPIC_API_KEY=
set "CODEX_HOME=${codexHome}"
echo.
echo ========================================
echo BACKBONE ${backendLabel} Engine
echo ========================================
echo.
echo Running ${backendLabel} CLI...
${runCommand}
echo.
echo ========================================
echo Work complete. Window closing in 5 seconds...
echo Log: ${logPath}
echo ========================================
del /f /q "${promptPath}" >nul 2>&1
timeout /t 5
`;

    // Write batch file
    const batchPath = path.join(os.tmpdir(), `backbone-cli-work-${backend}.bat`);
    fs.writeFileSync(batchPath, batchContent);

    // Open a new visible terminal window in background (behind BACKBONE) and track PID
    const psScriptContent = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win32Window {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOACTIVATE = 0x0010;
}
'@
# Remember the current foreground window (BACKBONE)
$backboneHwnd = [Win32Window]::GetForegroundWindow()

# Launch the terminal
$p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "\`"${batchPath}\`"" -PassThru
Start-Sleep -Milliseconds 500

# Send terminal to back
$terminalHwnd = $p.MainWindowHandle
if ($terminalHwnd -ne [IntPtr]::Zero) {
  [Win32Window]::SetWindowPos($terminalHwnd, [Win32Window]::HWND_BOTTOM, 0, 0, 0, 0, ([Win32Window]::SWP_NOMOVE -bor [Win32Window]::SWP_NOSIZE -bor [Win32Window]::SWP_NOACTIVATE)) | Out-Null
}

# Bring BACKBONE back to front
if ($backboneHwnd -ne [IntPtr]::Zero) {
  [Win32Window]::SetForegroundWindow($backboneHwnd) | Out-Null
}

Write-Output $p.Id
`;
    const psScriptPath = path.join(os.tmpdir(), `backbone-launch-${Date.now()}.ps1`);
    fs.writeFileSync(psScriptPath, psScriptContent);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptPath}"`, { cwd }, (error, stdout) => {
      // Clean up PS1 script
      try { fs.unlinkSync(psScriptPath); } catch {}

      if (error) {
        console.error("[ClaudeEngine] Failed to open terminal:", error.message);
        this.emit("status", `Error: ${error.message}`);
        this.emit("error", { error: error.message });
        return;
      }

      const pid = parseInt(String(stdout || "").trim(), 10);
      if (Number.isFinite(pid)) {
        this.currentPid = pid;
        this.emit("status", `${backendLabel} terminal PID: ${pid}`);
      } else {
        this.currentPid = null;
      }
    });

    this.emit("status", `Terminal opened - ${backendLabel} is working`);

    // Check for completion by watching the current-work.md file
    const startTime = Date.now();
    const initialContent = this.readWorkStatus();

    let finished = false;
    const finalizeRun = (currentContent, reason = null) => {
      if (finished) return;
      finished = true;
      clearInterval(checkInterval);
      this.isRunning = false;

      const narratorEnd = getActivityNarrator();
      narratorEnd.setClaudeCodeActive(false, "done");
      narratorEnd.setState("IDLE", "Work complete");

      // Clear the working project indicator
      this.setCurrentWorkingProject(null);

      let rateLimited = false;
      let authError = null;
      let logTail = "";
      if (this.currentLogPath && fs.existsSync(this.currentLogPath)) {
        try {
          const logText = fs.readFileSync(this.currentLogPath, "utf-8");
          rateLimited = this.isRateLimitOutput(logText);
          // Only check first 500 chars for auth errors — avoids false positives
          // from Claude discussing API keys in its actual work output
          authError = this.detectAuthError(logText);
          logTail = logText.slice(-4000);
        } catch {}
      }

      if (rateLimited) {
        this.lastRateLimitAt = Date.now();
        if (backend === "claude") {
          const untilMs = this.parseClaudeResetUntilMs(logTail) || (Date.now() + 30 * 60 * 1000);
          this.claudeRateLimitedUntilMs = untilMs;
          this.emit("status", `Claude hit limit - using Codex until ${new Date(untilMs).toLocaleString()}.`);
          this.saveState();
        }
      } else if (backend === "claude" && this.claudeRateLimitedUntilMs) {
        this.claudeRateLimitedUntilMs = null;
        this.saveState();
      }

      // Check for auth errors first - these should not retry
      if (authError) {
        this.emit("status", `Auth Error: ${authError}`);
        this.emit("auth-error", { error: authError });
        const narratorAuth = getActivityNarrator();
        narratorAuth.observe(`Claude Code: ${authError}`);
        this.emit("complete", { success: false, reason: "auth-error", error: authError });
      } else if (currentContent !== initialContent) {
        this.emit("status", "Work complete - files updated");
        this.emit("complete", { success: true, workStatus: currentContent });
      } else if (reason === "process-exited") {
        this.emit("status", `${backendLabel} terminal closed`);
        this.emit("complete", { success: true, reason: "process-exited" });
      } else {
        this.emit("status", "Timeout - check terminal");
        this.emit("complete", { success: false, reason: "timeout" });
      }

      const quickExit = reason === "process-exited" && this.currentStartTime && (Date.now() - this.currentStartTime) < 15000;

      // Determine if this was a successful run (actually did work)
      const wasSuccessful = !authError && !rateLimited && !quickExit && currentContent !== initialContent;
      const wasNormalExit = !authError && reason === "process-exited" && !quickExit;

      this.currentPid = null;
      this.currentBackend = null;
      this.currentStartTime = null;
      this.currentLogPath = null;
      this.lastLogSize = 0;

      // Only set cooldown if the run was successful or had a normal exit
      // Failed runs (auth errors, quick exits, rate limits) should NOT block the next run
      if (wasSuccessful || wasNormalExit) {
        this.lastRunCompletedAt = Date.now();
        this.saveState();
      }

      const logEntry = `\n## ${new Date().toISOString()}\n` +
        `**Backend:** ${backend}\n` +
        `**Result:** ${authError ? `AUTH ERROR: ${authError}` : (reason || (currentContent !== initialContent ? "updated" : "unknown"))}\n\n` +
        `### Current Work Snapshot\n\n` +
        `${currentContent}\n\n` +
        (logTail ? `### CLI Output (tail)\n\n\`\`\`\n${logTail}\n\`\`\`\n` : "");
      this.appendEngineLog(logEntry);

      // Auth errors should not retry - stop and let the user know
      if (authError) {
        return;
      }

      // If the run hit a rate limit, retry quickly and let start() choose backend.
      if (!this.triedRetry && rateLimited) {
        this.triedRetry = true;
        this.emit("status", "Rate-limited - retrying in 30s (Codex fallback if available)");
        setTimeout(() => {
          if (!this.isRunning) this.start();
        }, 30000);
        return;
      }

      // If Claude exited immediately, retry after a delay
      if (!this.triedRetry && quickExit) {
        this.triedRetry = true;
        this.emit("status", `${backendLabel} exited quickly - retrying in 30s`);
        setTimeout(() => {
          if (!this.isRunning) this.start();
        }, 30000);
        return;
      }

      // Schedule next run after 10 minutes to reduce rate-limit pressure
      this.emit("status", "Next run in 10 minutes...");
      setTimeout(() => {
        if (!this.isRunning) this.start();
      }, 10 * 60 * 1000);
    };

    const checkInterval = setInterval(() => {
      const currentContent = this.readWorkStatus();
      const elapsed = Date.now() - startTime;

      // Detect and update current working project
      const detectedProject = this.detectCurrentProject();
      if (detectedProject) {
        this.setCurrentWorkingProject(detectedProject);
      }

      // Stream CLI output into engine view
      if (this.currentLogPath && fs.existsSync(this.currentLogPath)) {
        try {
          const stat = fs.statSync(this.currentLogPath);
          if (stat.size > this.lastLogSize) {
            const fd = fs.openSync(this.currentLogPath, "r");
            const buffer = Buffer.alloc(stat.size - this.lastLogSize);
            fs.readSync(fd, buffer, 0, buffer.length, this.lastLogSize);
            fs.closeSync(fd);
            this.lastLogSize = stat.size;
            const chunk = buffer.toString("utf-8");

            // Check for auth errors only in first 15 seconds (auth failures happen immediately)
            if (elapsed < 15000) {
              const authErr = this.detectAuthError(chunk);
              if (authErr) {
                finalizeRun(currentContent, "auth-error");
                return;
              }
            }

            if (chunk.trim()) {
              chunk.split(/\r?\n/).forEach((line) => {
                if (!line.trim()) return;
                // Parse stream-json lines into human-readable text
                const parsed = this._parseStreamLine(line.trim());
                if (parsed) {
                  this.emit("status", parsed);
                }
              });
            }
          }
        } catch {}
      }

      // If backend hasn't produced any output in 60s, retry
      if (
        !this.triedRetry &&
        elapsed > 60 * 1000
      ) {
        let logEmpty = true;
        if (this.currentLogPath && fs.existsSync(this.currentLogPath)) {
          try {
            const stat = fs.statSync(this.currentLogPath);
            logEmpty = stat.size === 0;
          } catch {}
        }
        if (!logEmpty) {
          return;
        }
        this.triedRetry = true;
        this.emit("status", `${backendLabel} stalled >60s - restarting`);
        if (this.currentPid) {
          exec(`taskkill /T /F /PID ${this.currentPid}`, { windowsHide: true }, () => {});
          this.currentPid = null;
        }
        this.isRunning = false;
        setTimeout(() => {
          if (!this.isRunning) this.start();
        }, 1000);
        clearInterval(checkInterval);
        return;
      }

      // If file changed or 5 minutes passed, consider it done
      if (currentContent !== initialContent || elapsed > 5 * 60 * 1000) {
        finalizeRun(currentContent);
        return;
      }

      // If we have a PID, check if the process is still running
      if (this.currentPid) {
        exec(`powershell -NoProfile -Command "if (Get-Process -Id ${this.currentPid} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"`, (err) => {
          if (err) {
            this.currentPid = null;
            finalizeRun(this.readWorkStatus(), "process-exited");
          }
        });
      }
    }, 5000); // Check every 5 seconds

    return { success: true };
  }

  /**
   * Stop (can't really stop an external terminal, but mark as not running)
   */
  stop() {
    this.isRunning = false;
    this.currentPid = null;
    const narrator = getActivityNarrator();
    narrator.setClaudeCodeActive(false, "stopped");
    narrator.setState("IDLE", "Stopped");
    this.emit("status", "Stopped");
    this.emit("stopped");
  }

  /**
   * Get status
   */
  /** How long ago the engine last ran (ms), or null if never */
  getTimeSinceLastRun() {
    if (!this.lastRunCompletedAt) return null;
    return Date.now() - this.lastRunCompletedAt;
  }

  /** Whether the engine is within the 1-hour cooldown window */
  isInCooldown() {
    const elapsed = this.getTimeSinceLastRun();
    return elapsed !== null && elapsed < ENGINE_COOLDOWN_MS;
  }

  getStatus() {
    this.clearExpiredClaudeLimit();
    const timeSince = this.getTimeSinceLastRun();
    const claudeLimitActive = this.claudeRateLimitedUntilMs && Date.now() < this.claudeRateLimitedUntilMs;
    return {
      isRunning: this.isRunning,
      workCount: this.workCount,
      currentWorkFile: this.readWorkStatus(),
      lastRunCompletedAt: this.lastRunCompletedAt ? new Date(this.lastRunCompletedAt).toISOString() : null,
      lastRunMinutesAgo: timeSince !== null ? Math.round(timeSince / 60000) : null,
      cooldown: this.isInCooldown(),
      cooldownRemainingMin: this.isInCooldown() ? Math.ceil((ENGINE_COOLDOWN_MS - timeSince) / 60000) : 0,
      claudeRateLimited: Boolean(claudeLimitActive),
      claudeRateLimitedUntil: claudeLimitActive ? new Date(this.claudeRateLimitedUntilMs).toISOString() : null
    };
  }
}

let instance = null;

export const getClaudeEngine = () => {
  if (!instance) {
    instance = new ClaudeEngine();
  }
  return instance;
};

export default ClaudeEngine;
