/**
 * Startup Engine - Automatic work initialization on startup
 *
 * On startup, this engine:
 * 1. Reads the startup checklist (data/startup-checklist.md)
 * 2. Analyzes user context (profile, goals, beliefs, financials, LinkedIn)
 * 3. Evaluates the backlog and determines priorities
 * 4. Starts working on highest priority items using Claude Code CLI
 *
 * Philosophy: The AI should be productive the moment it starts, not waiting for user input.
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { runClaudeCodeStreaming, getClaudeCodeStatus } from "../ai/claude-code-cli.js";
import { sendMessage, TASK_TYPES } from "../ai/multi-ai.js";
import { getActivityNarrator } from "../ui/activity-narrator.js";
import { getActivityTracker } from "../ui/activity-tracker.js";
import { getIdleProcessor } from "./idle-processor.js";
import { getConversationAnalysisEngine } from "../memory/conversation-analysis-engine.js";

import { getDataDir, getMemoryDir, getProjectsDir } from "../paths.js";
const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const PROJECTS_DIR = getProjectsDir();
const CHECKLIST_PATH = path.join(DATA_DIR, "startup-checklist.md");
const STARTUP_STATE_PATH = path.join(DATA_DIR, "startup-engine-state.json");

// Startup phases
const PHASES = {
  INITIALIZING: "initializing",
  CONTEXT_ASSESSMENT: "context_assessment",
  WORK_ASSESSMENT: "work_assessment",
  PRIORITY_DETERMINATION: "priority_determination",
  STARTING_WORK: "starting_work",
  RUNNING: "running",
  COMPLETE: "complete",
  ERROR: "error"
};

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return "";
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

class StartupEngine extends EventEmitter {
  constructor() {
    super();
    this.phase = PHASES.INITIALIZING;
    this.isRunning = false;
    this.startupComplete = false;
    this.context = {};
    this.priorities = [];
    this.currentStream = null;
    this.useClaudeCode = true;
    this.state = this.loadState();
  }

  loadState() {
    return readJson(STARTUP_STATE_PATH) || {
      lastStartup: null,
      startupCount: 0,
      lastPhaseCompleted: null,
      errors: []
    };
  }

  saveState() {
    writeJson(STARTUP_STATE_PATH, this.state);
  }

  /**
   * Run the startup sequence
   */
  async run() {
    if (this.isRunning) {
      console.log("[StartupEngine] Already running");
      return;
    }

    console.log("[StartupEngine] ========================================");
    console.log("[StartupEngine] STARTING AUTOMATIC WORK INITIALIZATION");
    console.log("[StartupEngine] ========================================");

    this.isRunning = true;
    this.state.lastStartup = new Date().toISOString();
    this.state.startupCount++;
    this.saveState();

    const narrator = getActivityNarrator();
    const tracker = getActivityTracker();

    try {
      // Phase 1: Check Claude Code CLI
      this.setPhase(PHASES.INITIALIZING);
      narrator.setState("CONNECTING", "Checking Claude Code CLI...");

      const cliStatus = await getClaudeCodeStatus();
      if (!cliStatus.ready) {
        console.log("[StartupEngine] Claude Code CLI not ready, falling back to Codex");
        this.emit("cli-not-ready", cliStatus);
        this.useClaudeCode = false;
        narrator.setState("CONNECTING", "Claude Code not ready — using Codex fallback");
      } else {
        this.useClaudeCode = true;
      }

      if (this.useClaudeCode) {
        console.log("[StartupEngine] Claude Code CLI ready");
      }

      // Phase 2: Context Assessment
      this.setPhase(PHASES.CONTEXT_ASSESSMENT);
      narrator.setState("ANALYZING", "Assessing user context...");
      await this.assessContext();

      // Phase 3: Work Assessment
      this.setPhase(PHASES.WORK_ASSESSMENT);
      narrator.setState("ANALYZING", "Evaluating backlog and projects...");
      await this.assessWork();

      // Phase 4: Priority Determination
      this.setPhase(PHASES.PRIORITY_DETERMINATION);
      narrator.setState("THINKING", "Determining priorities...");
      await this.determinePriorities();

      // Phase 5: Start Work
      this.setPhase(PHASES.STARTING_WORK);
      narrator.setState("WORKING", "Starting highest priority work...");
      await this.startWork();

      this.setPhase(PHASES.RUNNING);
      this.startupComplete = true;
      this.state.lastPhaseCompleted = PHASES.RUNNING;
      this.saveState();

      console.log("[StartupEngine] ========================================");
      console.log("[StartupEngine] STARTUP COMPLETE - ENGINE IS RUNNING");
      console.log("[StartupEngine] ========================================");

      this.emit("startup-complete", {
        context: this.context,
        priorities: this.priorities
      });

    } catch (error) {
      console.error("[StartupEngine] Startup error:", error.message);
      this.setPhase(PHASES.ERROR);
      this.state.errors.push({
        timestamp: new Date().toISOString(),
        error: error.message
      });
      this.saveState();
      this.emit("error", error);
    }

    this.isRunning = false;
  }

  setPhase(phase) {
    this.phase = phase;
    this.emit("phase-changed", phase);
    console.log(`[StartupEngine] Phase: ${phase}`);
  }

  /**
   * Phase 2: Assess user context
   */
  async assessContext() {
    this.context = {
      profile: readFile(path.join(MEMORY_DIR, "profile.md")),
      beliefs: readJson(path.join(DATA_DIR, "core-beliefs.json")) || { beliefs: [] },
      goals: readJson(path.join(DATA_DIR, "goals.json")) || { goals: [] },
      thesis: readFile(path.join(MEMORY_DIR, "thesis.md")),
      settings: readJson(path.join(DATA_DIR, "user-settings.json")) || {},
      health: readJson(path.join(DATA_DIR, "oura-data.json")),
      portfolio: readJson(path.join(DATA_DIR, "trades-log.json")),
      tickers: readJson(path.join(DATA_DIR, "tickers-cache.json")),
      linkedin: this.loadLinkedInData()
    };

    // Initialize and analyze conversations
    try {
      const conversationEngine = getConversationAnalysisEngine();
      await conversationEngine.initialize();

      // Analyze recent conversations for insights
      const recentAnalyses = await conversationEngine.analyzeRecentConversations(5);
      this.context.conversationInsights = conversationEngine.getContextForEngine();
      this.context.recentConversationAnalyses = recentAnalyses;

      console.log(`[StartupEngine] Conversation analysis: ${recentAnalyses.length} conversations analyzed`);

      // Listen for new analyses to potentially trigger work
      conversationEngine.on("backlog-item-created", (item) => {
        console.log(`[StartupEngine] New backlog item from conversation: ${item.title}`);
        this.emit("backlog-item-created", item);
      });
    } catch (err) {
      console.error("[StartupEngine] Conversation analysis error:", err.message);
      this.context.conversationInsights = null;
    }

    console.log(`[StartupEngine] Context loaded:
  - Profile: ${this.context.profile ? "yes" : "no"}
  - Beliefs: ${this.context.beliefs.beliefs?.length || 0} defined
  - Goals: ${this.context.goals.goals?.length || 0} active
  - Thesis: ${this.context.thesis ? "yes" : "no"}
  - Health data: ${this.context.health ? "yes" : "no"}
  - Portfolio: ${this.context.portfolio ? "yes" : "no"}
  - Conversation insights: ${this.context.conversationInsights ? "yes" : "no"}`);

    this.emit("context-assessed", this.context);
  }

  loadLinkedInData() {
    // Try to find LinkedIn data files
    const files = ["linkedin-profile.json", "linkedin-data.json", "linkedin.json"];
    for (const file of files) {
      const data = readJson(path.join(DATA_DIR, file));
      if (data) return data;
    }
    return null;
  }

  /**
   * Phase 3: Assess current work state
   */
  async assessWork() {
    const backlog = readJson(path.join(DATA_DIR, "backlog.json")) || { items: [] };
    const idleState = readJson(path.join(DATA_DIR, "idle-processor-state.json")) || {};

    // Get projects
    const projects = [];
    if (fs.existsSync(PROJECTS_DIR)) {
      const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("."))
        .map(d => d.name);

      for (const dir of dirs) {
        const projectMd = path.join(PROJECTS_DIR, dir, "PROJECT.md");
        if (fs.existsSync(projectMd)) {
          const content = fs.readFileSync(projectMd, "utf-8");
          const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/i);
          projects.push({
            name: dir,
            status: statusMatch ? statusMatch[1].toLowerCase() : "unknown",
            path: projectMd
          });
        }
      }
    }

    this.context.work = {
      backlog: {
        total: backlog.items?.length || 0,
        highImpact: backlog.items?.filter(i => i.impactScore >= 75).length || 0,
        items: backlog.items || []
      },
      projects: {
        total: projects.length,
        active: projects.filter(p => p.status === "active").length,
        list: projects
      },
      lastWork: idleState.recentWork?.[0] || null
    };

    console.log(`[StartupEngine] Work assessed:
  - Backlog items: ${this.context.work.backlog.total}
  - High impact items: ${this.context.work.backlog.highImpact}
  - Projects: ${this.context.work.projects.total} (${this.context.work.projects.active} active)`);

    this.emit("work-assessed", this.context.work);
  }

  /**
   * Phase 4: Determine priorities
   */
  async determinePriorities() {
    const priorities = [];

    // Score backlog items
    for (const item of this.context.work.backlog.items) {
      let score = item.impactScore || 50;

      // Boost for time sensitivity
      if (item.isTimeSensitive) score += 15;

      // Boost for urgency
      if (item.urgency === "critical") score += 25;
      else if (item.urgency === "high") score += 15;
      else if (item.urgency === "medium") score += 5;

      // Boost for alignment with beliefs
      if (item.relatedBeliefs?.length > 0 && this.context.beliefs.beliefs?.length > 0) {
        const beliefMatch = item.relatedBeliefs.some(rb =>
          this.context.beliefs.beliefs.some(b =>
            b.name?.toLowerCase().includes(rb.toLowerCase()) ||
            rb.toLowerCase().includes(b.name?.toLowerCase())
          )
        );
        if (beliefMatch) score += 20;
      }

      // Penalize recently worked items
      const lastWork = this.context.work.lastWork;
      if (lastWork && lastWork.itemId === item.id) {
        const hoursSince = (Date.now() - new Date(lastWork.timestamp).getTime()) / (1000 * 60 * 60);
        if (hoursSince < 2) score -= 20;
      }

      priorities.push({
        type: "backlog",
        id: item.id,
        title: item.title,
        score,
        originalItem: item
      });
    }

    // Score active projects
    for (const project of this.context.work.projects.list) {
      if (project.status === "active") {
        priorities.push({
          type: "project",
          id: project.name,
          title: `Continue project: ${project.name}`,
          score: 70, // Active projects get decent priority
          originalItem: project
        });
      }
    }

    // Sort by score
    priorities.sort((a, b) => b.score - a.score);

    this.priorities = priorities.slice(0, 10); // Keep top 10

    console.log(`[StartupEngine] Priorities determined: ${this.priorities.length} items`);
    if (this.priorities.length > 0) {
      console.log(`[StartupEngine] Top priority: ${this.priorities[0].title} (score: ${this.priorities[0].score})`);
    }

    this.emit("priorities-determined", this.priorities);
  }

  /**
   * Phase 5: Start working on highest priority
   */
  async startWork() {
    if (this.priorities.length === 0) {
      console.log("[StartupEngine] No priorities to work on, running general research");
      // Trigger idle processor to do research
      const idleProcessor = getIdleProcessor();
      await idleProcessor.forceWork();
      return;
    }

    const topPriority = this.priorities[0];
    console.log(`[StartupEngine] Starting work on: ${topPriority.title}`);

    const narrator = getActivityNarrator();
    narrator.setState("WORKING", topPriority.title);
    if (this.useClaudeCode) {
      narrator.setClaudeCodeActive(true, "starting");
    }

    // Build startup prompt
    const prompt = this.buildStartupPrompt(topPriority);

    if (this.useClaudeCode) {
      // Run Claude Code CLI
      this.currentStream = await runClaudeCodeStreaming(prompt, {
        timeout: 5 * 60_000, // 5 minutes
        cwd: process.cwd()
      });

      if (!this.currentStream) {
        console.error("[StartupEngine] Failed to start Claude Code CLI");
        return;
      }

      this.currentStream.on("data", (text) => {
        this.emit("stream", text);
      });

      this.currentStream.on("complete", (result) => {
        console.log(`[StartupEngine] Initial work complete: ${result.success ? "success" : "failed"}`);
        narrator.setClaudeCodeActive(false, "complete");

        // Hand off to idle processor for continued work
        const idleProcessor = getIdleProcessor();
        idleProcessor.recordUserActivity(); // Reset idle timer
        // Idle processor will pick up work when user goes idle

        this.emit("work-complete", result);
      });

      this.currentStream.on("error", (error) => {
        console.error("[StartupEngine] Work error:", error);
        narrator.setClaudeCodeActive(false, "error");
        this.emit("work-error", error);
      });
      return;
    }

    try {
      const result = await sendMessage(prompt, this.context, TASK_TYPES.AGENTIC);
      if (result?.response) {
        this.emit("stream", result.response);
      }
      this.emit("work-complete", { success: true, output: result?.response || "" });
    } catch (error) {
      console.error("[StartupEngine] Codex fallback error:", error?.message || error);
      this.emit("work-error", error);
    }
  }

  /**
   * Build the startup prompt for Claude Code CLI
   */
  buildStartupPrompt(priority) {
    const contextSummary = `
User Profile Summary:
${this.context.profile?.slice(0, 500) || "No profile available"}

Core Beliefs:
${this.context.beliefs.beliefs?.map(b => `- ${b.name}: ${b.description}`).join("\n") || "No beliefs defined"}

Current Thesis:
${this.context.thesis?.slice(0, 300) || "No thesis available"}

Active Goals:
${this.context.goals.goals?.filter(g => g.status === "active").map(g => `- ${g.title}`).join("\n") || "No active goals"}

Backlog Status:
- Total items: ${this.context.work.backlog.total}
- High impact items: ${this.context.work.backlog.highImpact}
`;

    if (priority.type === "backlog") {
      return `${contextSummary}

STARTUP TASK: Work on this high-priority backlog item.

Item Details:
- Title: ${priority.originalItem.title}
- Description: ${priority.originalItem.description}
- Impact Score: ${priority.originalItem.impactScore}
- Urgency: ${priority.originalItem.urgency}
- Time Sensitive: ${priority.originalItem.isTimeSensitive ? "Yes" : "No"}

Your task:
1. Research this topic thoroughly using WebSearch
2. Gather actionable insights
3. Update the backlog item with your findings (data/backlog.json)
4. If impact score >= 75, graduate it to a goal (data/goals.json)
5. Create or update a project if needed (projects/<name>/PROJECT.md)

Be thorough but efficient. Do 3-5 quality research actions, then update files and stop.`;
    }

    if (priority.type === "project") {
      return `${contextSummary}

STARTUP TASK: Continue working on this active project.

Project: ${priority.originalItem.name}
Path: ${priority.originalItem.path}

Your task:
1. Read the PROJECT.md file to understand current status
2. Identify the next actionable task
3. Execute that task (research, create files, update project)
4. Update PROJECT.md with your progress
5. Add any new findings to the project folder

Be focused. Complete one meaningful task and update the project status.`;
    }

    // Default research task
    return `${contextSummary}

STARTUP TASK: Analyze user context and identify opportunities.

Your task:
1. Review the user's profile, goals, and beliefs
2. Search for relevant opportunities aligned with their goals
3. Create 2-3 new backlog items with high impact scores
4. Update data/backlog.json with your findings

Focus on:
- Financial opportunities if user has portfolio
- Health optimizations if health data available
- Career/growth opportunities based on profile

Be concise. Create actionable backlog items and stop.`;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      phase: this.phase,
      isRunning: this.isRunning,
      startupComplete: this.startupComplete,
      priorities: this.priorities.slice(0, 5),
      lastStartup: this.state.lastStartup,
      startupCount: this.state.startupCount
    };
  }
}

// Singleton
let instance = null;

export const getStartupEngine = () => {
  if (!instance) {
    instance = new StartupEngine();
  }
  return instance;
};

export default StartupEngine;
