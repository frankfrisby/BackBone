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

import { exec } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import os from "os";
import { getClaudeCodeStatus } from "./claude-code-cli.js";
import { getActivityNarrator } from "./activity-narrator.js";
import { updateProjects } from "./app-store.js";

const MEMORY_DIR = path.join(process.cwd(), "memory");
const CURRENT_WORK_FILE = path.join(MEMORY_DIR, "current-work.md");
const ENGINE_LOG_FILE = path.join(MEMORY_DIR, "engine-work-log.md");

// Claude CLI path
const CLAUDE_CMD = process.platform === "win32"
  ? path.join(os.homedir(), "AppData", "Roaming", "npm", "claude.cmd")
  : "claude";

class ClaudeEngine extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.workCount = 0;
    this.currentPid = null;
    this.currentBackend = null;
    this.currentStartTime = null;
    this.currentLogPath = null;
    this.triedCodexFallback = false;
    this.lastRunCompletedAt = null;
    this.lastCodexRateLimitAt = null;
    this.lastLogSize = 0;
  }

  isRateLimitOutput(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return (
      lower.includes("rate limit") ||
      lower.includes("rate-limit") ||
      lower.includes("too many requests") ||
      lower.includes("429")
    );
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
      const projectsDir = path.join(process.cwd(), "projects");
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

  async isCodexAvailable() {
    return new Promise((resolve) => {
      exec("codex --version", { timeout: 5000 }, (err) => {
        resolve(!err);
      });
    });
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
      this.triedCodexFallback = false;
    }

    const now = Date.now();
    if (this.lastRunCompletedAt && now - this.lastRunCompletedAt < 10 * 60 * 1000) {
      const waitMs = 10 * 60 * 1000 - (now - this.lastRunCompletedAt);
      this.emit("status", `Cooling down for ${Math.ceil(waitMs / 1000)}s before next run`);
      setTimeout(() => {
        if (!this.isRunning) this.start(backendOverride);
      }, waitMs);
      return { success: false, reason: "Cooldown" };
    }

    const status = await getClaudeCodeStatus();
    const codexAvailable = await this.isCodexAvailable();
    const backend = backendOverride || (status.ready ? "claude" : (codexAvailable ? "codex" : null));

    if (!backend) {
      this.emit("status", "No CLI available (Claude Code or Codex)");
      return { success: false, reason: "No CLI available" };
    }

    this.ensureWorkFile();
    this.isRunning = true;
    this.workCount++;
    this.currentBackend = backend;
    this.currentStartTime = Date.now();

    const narrator = getActivityNarrator();
    narrator.setState("WORKING", backend === "claude" ? "Claude terminal open" : "Codex terminal open");
    narrator.setGoal("Working in terminal window");
    narrator.setClaudeCodeActive(true, "working");

    this.emit("status", backend === "claude" ? "Opening Claude terminal..." : "Opening Codex terminal...");
    this.emit("started");

    // Mark that we're starting work (will detect specific project later)
    this.setCurrentWorkingProject("analyzing");

    const prompt = this.buildPrompt();
    const cwd = process.cwd();

    // Write prompt to a temp file to avoid cmd.exe quoting/newline issues
    const promptPath = path.join(os.tmpdir(), `backbone-cli-prompt-${Date.now()}.txt`);
    const logPath = path.join(os.tmpdir(), `backbone-cli-log-${backend}-${Date.now()}.txt`);
    this.currentLogPath = logPath;
    this.lastLogSize = 0;
    fs.writeFileSync(promptPath, prompt, "utf-8");

    // No separate script files needed - run directly in batch

    // Create a batch script that runs CLI and then pauses briefly so user can see result
    const batchContent = `@echo off
title BACKBONE ${backend === "claude" ? "Claude" : "Codex"}
cd /d "${cwd}"
echo.
echo ========================================
echo BACKBONE ${backend === "claude" ? "Claude" : "Codex"} Engine
echo ========================================
echo.
echo Running ${backend === "claude" ? "Claude Code CLI" : "Codex CLI"}...
${backend === "claude"
  ? `type "${promptPath}" | "${CLAUDE_CMD}" --print --dangerously-skip-permissions > "${logPath}" 2>&1`
  : `codex exec --dangerously-bypass-approvals-and-sandbox "Read memory/current-work.md and do the work described there. Update the file when done." > "${logPath}" 2>&1`
}
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
        this.emit("status", `${backend === "claude" ? "Claude" : "Codex"} terminal PID: ${pid}`);
      } else {
        this.currentPid = null;
      }
    });

    this.emit("status", "Terminal opened - Claude is working");

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
      let logTail = "";
      if (this.currentLogPath && fs.existsSync(this.currentLogPath)) {
        try {
          const logText = fs.readFileSync(this.currentLogPath, "utf-8");
          rateLimited = this.isRateLimitOutput(logText);
          logTail = logText.slice(-4000);
        } catch {}
      }

      if (backend === "codex" && rateLimited) {
        this.lastCodexRateLimitAt = Date.now();
      }

      const codexRateLimitedRecently = this.lastCodexRateLimitAt && (Date.now() - this.lastCodexRateLimitAt) < 10 * 60 * 1000;

      if (currentContent !== initialContent) {
        this.emit("status", "Work complete - files updated");
        this.emit("complete", { success: true, workStatus: currentContent });
      } else if (reason === "process-exited") {
        this.emit("status", `${this.currentBackend === "codex" ? "Codex" : "Claude"} terminal closed`);
        this.emit("complete", { success: true, reason: "process-exited" });
      } else {
        this.emit("status", "Timeout - check terminal");
        this.emit("complete", { success: false, reason: "timeout" });
      }

    const quickExit = reason === "process-exited" && this.currentStartTime && (Date.now() - this.currentStartTime) < 5000;

      this.currentPid = null;
      this.currentBackend = null;
      this.currentStartTime = null;
      this.currentLogPath = null;
      this.lastRunCompletedAt = Date.now();
      this.lastLogSize = 0;

      const logEntry = `\n## ${new Date().toISOString()}\n` +
        `**Backend:** ${backend}\n` +
        `**Result:** ${reason || (currentContent !== initialContent ? "updated" : "unknown")}\n\n` +
        `### Current Work Snapshot\n\n` +
        `${currentContent}\n\n` +
        (logTail ? `### CLI Output (tail)\n\n\`\`\`\n${logTail}\n\`\`\`\n` : "");
      this.appendEngineLog(logEntry);

      // If Claude hit rate limit, try Codex once (if Codex not recently rate-limited)
      if (!this.triedCodexFallback && rateLimited && backend === "claude" && codexAvailable && !codexRateLimitedRecently) {
        this.triedCodexFallback = true;
        this.emit("status", "Claude rate-limited - trying Codex");
        setTimeout(() => {
          if (!this.isRunning) this.start("codex");
        }, 1000);
        return;
      }

      // If Claude exited immediately, try Codex once
      if (!this.triedCodexFallback && quickExit && backend === "claude" && codexAvailable) {
        this.triedCodexFallback = true;
        this.emit("status", "Claude failed quickly - trying Codex");
        setTimeout(() => {
          if (!this.isRunning) this.start("codex");
        }, 1000);
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
            if (chunk.trim()) {
              // Split to avoid giant single line in UI
              chunk.split(/\r?\n/).forEach((line) => {
                if (line.trim().length > 0) {
                  this.emit("status", line);
                }
              });
            }
          }
        } catch {}
      }

      // If Claude hasn't produced any output in 30s, fall back to Codex
      if (
        backend === "claude" &&
        !this.triedCodexFallback &&
        codexAvailable &&
        elapsed > 30 * 1000
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
        this.triedCodexFallback = true;
        this.emit("status", "Claude stalled >30s - switching to Codex");
        if (this.currentPid) {
          // Kill entire process tree, not just the parent cmd.exe
          exec(`taskkill /T /F /PID ${this.currentPid}`, { windowsHide: true }, () => {});
          this.currentPid = null;
        }
        this.isRunning = false;
        setTimeout(() => {
          if (!this.isRunning) this.start("codex");
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
  getStatus() {
    return {
      isRunning: this.isRunning,
      workCount: this.workCount,
      currentWorkFile: this.readWorkStatus()
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
