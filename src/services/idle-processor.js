/**
 * Idle Processor - Background work when system is idle
 *
 * When the user isn't actively interacting, this processor:
 * 1. Works on the backlog using Claude Code CLI
 * 2. Researches and gathers information
 * 3. Evaluates and prioritizes backlog items
 * 4. Pushes forward the best candidates for goals
 * 5. Stops when meaningful work is done (not just being busy)
 *
 * Philosophy: Do quality work, then rest. Don't spin cycles for no reason.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { runClaudeCodeStreaming, getClaudeCodeStatus } from "./claude-code-cli.js";
import { getActivityTracker } from "./activity-tracker.js";
import { getThinkingEngine } from "./thinking-engine.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const BACKLOG_PATH = path.join(DATA_DIR, "backlog.json");
const IDLE_STATE_PATH = path.join(DATA_DIR, "idle-processor-state.json");
const RESEARCH_CACHE_PATH = path.join(DATA_DIR, "research-cache.json");

// Configuration
const IDLE_THRESHOLD_MS = 60_000; // 1 minute of no user activity = idle
const MIN_WORK_INTERVAL_MS = 5 * 60_000; // Don't start new work within 5 min of last completion
const MAX_WORK_SESSION_MS = 10 * 60_000; // Max 10 minutes per work session
const GOOD_WORK_THRESHOLD = 3; // After 3 quality actions, consider resting
const RESEARCH_COOLDOWN_MS = 30 * 60_000; // Don't research same topic within 30 min

// Work types the processor can do
const WORK_TYPES = {
  RESEARCH: "research", // Gather information from web
  EVALUATE: "evaluate", // Re-evaluate backlog item priorities
  DEVELOP: "develop", // Develop/expand a backlog item
  CONNECT: "connect", // Find connections between items
  PRUNE: "prune", // Clean up stale/irrelevant items
};

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return "";
}

class IdleProcessor extends EventEmitter {
  constructor() {
    super();
    this.isEnabled = true;
    this.isWorking = false;
    this.lastUserActivity = Date.now();
    this.lastWorkCompletion = 0;
    this.currentWorkItem = null;
    this.currentStream = null;
    this.workSessionStart = null;
    this.qualityActionsThisSession = 0;
    this.state = this.loadState();
    this.researchCache = this.loadResearchCache();
    this.idleCheckInterval = null;
    this.streamBuffer = "";
  }

  loadState() {
    return readJson(IDLE_STATE_PATH) || {
      totalWorkSessions: 0,
      totalItemsProcessed: 0,
      lastSessionTimestamp: null,
      recentWork: [], // Last 20 work items for context
    };
  }

  saveState() {
    writeJson(IDLE_STATE_PATH, this.state);
  }

  loadResearchCache() {
    return readJson(RESEARCH_CACHE_PATH) || {
      topics: {}, // topic -> { lastResearched, findings }
    };
  }

  saveResearchCache() {
    writeJson(RESEARCH_CACHE_PATH, this.researchCache);
  }

  /**
   * Start monitoring for idle state
   */
  start() {
    console.log("========================================");
    console.log("[IdleProcessor] START() CALLED");
    console.log("========================================");

    if (this.idleCheckInterval) {
      console.log("[IdleProcessor] Already running, skipping");
      return;
    }

    console.log("[IdleProcessor] Started - will work when system is idle");
    console.log(`[IdleProcessor] Idle threshold: ${IDLE_THRESHOLD_MS / 1000}s, Work interval: ${MIN_WORK_INTERVAL_MS / 1000}s`);

    // Check for idle state every 30 seconds
    this.idleCheckInterval = setInterval(() => {
      this.checkAndWork();
    }, 30_000);

    // Initial check after 30 seconds (faster startup)
    setTimeout(() => {
      console.log("[IdleProcessor] Running initial idle check...");
      this.checkAndWork();
    }, 30_000);

    this.emit("started");
  }

  /**
   * Stop the processor
   */
  stop() {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    if (this.currentStream) {
      this.currentStream.abort();
      this.currentStream = null;
    }

    this.isWorking = false;
    console.log("[IdleProcessor] Stopped");
    this.emit("stopped");
  }

  /**
   * Record user activity (call this when user interacts)
   */
  recordUserActivity() {
    this.lastUserActivity = Date.now();

    // If we're working, pause gracefully
    if (this.isWorking && this.currentStream) {
      console.log("[IdleProcessor] User active - pausing work");
      this.pauseWork();
    }
  }

  /**
   * Check if we should start working
   */
  async checkAndWork() {
    const now = Date.now();
    const idleTime = now - this.lastUserActivity;
    const timeSinceLastWork = now - this.lastWorkCompletion;

    console.log(`[IdleProcessor] Check: enabled=${this.isEnabled}, working=${this.isWorking}, idle=${Math.round(idleTime/1000)}s, sinceLastWork=${Math.round(timeSinceLastWork/1000)}s`);

    if (!this.isEnabled) {
      console.log("[IdleProcessor] Disabled - skipping");
      return;
    }
    if (this.isWorking) {
      console.log("[IdleProcessor] Already working - skipping");
      return;
    }

    // Not idle enough
    if (idleTime < IDLE_THRESHOLD_MS) {
      console.log(`[IdleProcessor] Not idle enough (${Math.round(idleTime/1000)}s < ${IDLE_THRESHOLD_MS/1000}s)`);
      return;
    }

    // Too soon since last work
    if (timeSinceLastWork < MIN_WORK_INTERVAL_MS) {
      console.log(`[IdleProcessor] Too soon since last work (${Math.round(timeSinceLastWork/1000)}s < ${MIN_WORK_INTERVAL_MS/1000}s)`);
      return;
    }

    // Check if Claude Code is ready
    console.log("[IdleProcessor] Checking Claude Code status...");
    const status = await getClaudeCodeStatus();
    if (!status.ready) {
      console.log(`[IdleProcessor] Claude Code not ready - installed=${status.installed}, loggedIn=${status.loggedIn}`);
      return;
    }
    console.log("[IdleProcessor] Claude Code ready, finding work...");

    // Find work to do
    const workItem = await this.selectWorkItem();
    if (!workItem) {
      console.log("[IdleProcessor] No suitable work found - resting");
      return;
    }

    console.log(`[IdleProcessor] Found work: ${workItem.type} - ${workItem.item?.title || workItem.topic}`);

    // Start working
    await this.startWork(workItem);
  }

  /**
   * Select the best work item to process
   */
  async selectWorkItem() {
    const backlog = readJson(BACKLOG_PATH) || { items: [] };
    const profile = readFile(path.join(MEMORY_DIR, "profile.md"));
    const thesis = readFile(path.join(MEMORY_DIR, "thesis.md"));

    if (backlog.items.length === 0) {
      // No backlog items - do general research based on user profile
      return this.createResearchWorkItem(profile, thesis);
    }

    // Sort backlog by priority factors
    const scoredItems = backlog.items.map((item) => {
      let score = item.impactScore || 50;

      // Boost items that haven't been evaluated recently
      const lastEval = item.lastEvaluated
        ? new Date(item.lastEvaluated).getTime()
        : 0;
      const hoursSinceEval = (Date.now() - lastEval) / (1000 * 60 * 60);
      if (hoursSinceEval > 24) score += 10;
      if (hoursSinceEval > 72) score += 15;

      // Boost time-sensitive items
      if (item.isTimeSensitive) score += 20;

      // Boost high-urgency items
      if (item.urgency === "critical") score += 25;
      else if (item.urgency === "high") score += 15;
      else if (item.urgency === "medium") score += 5;

      // Check if we recently worked on this
      const recentlyWorked = this.state.recentWork.some(
        (w) => w.itemId === item.id && Date.now() - new Date(w.timestamp).getTime() < 2 * 60 * 60 * 1000
      );
      if (recentlyWorked) score -= 30;

      return { ...item, calculatedScore: score };
    });

    // Sort by calculated score
    scoredItems.sort((a, b) => b.calculatedScore - a.calculatedScore);

    // Get top candidate
    const topItem = scoredItems[0];
    if (!topItem) return null;

    // Decide what kind of work to do on this item
    const workType = this.determineWorkType(topItem);

    return {
      type: workType,
      item: topItem,
      context: { profile, thesis },
    };
  }

  /**
   * Create a research work item when backlog is empty
   */
  createResearchWorkItem(profile, thesis) {
    // Extract topics from profile and thesis
    const text = `${profile}\n${thesis}`.toLowerCase();

    const topics = [];
    if (text.includes("invest") || text.includes("stock") || text.includes("portfolio")) {
      topics.push("market trends and investment opportunities");
    }
    if (text.includes("health") || text.includes("fitness") || text.includes("sleep")) {
      topics.push("health optimization and longevity research");
    }
    if (text.includes("career") || text.includes("work") || text.includes("job")) {
      topics.push("career development and industry trends");
    }
    if (text.includes("family") || text.includes("relationship")) {
      topics.push("work-life balance and relationship insights");
    }
    // Always have fallback topics
    topics.push("AI and technology trends");
    topics.push("productivity and time management");
    topics.push("personal finance optimization");

    // Pick a topic that hasn't been researched recently
    const now = Date.now();
    for (const topic of topics) {
      const cached = this.researchCache.topics[topic];
      if (!cached || now - new Date(cached.lastResearched).getTime() > RESEARCH_COOLDOWN_MS) {
        this.log(`Selected research topic: ${topic}`);
        return {
          type: WORK_TYPES.RESEARCH,
          topic,
          context: { profile, thesis },
        };
      }
    }

    // Force a topic even if recently researched (pick oldest)
    const oldestTopic = topics.reduce((oldest, topic) => {
      const cached = this.researchCache.topics[topic];
      const lastTime = cached ? new Date(cached.lastResearched).getTime() : 0;
      const oldestTime = this.researchCache.topics[oldest]
        ? new Date(this.researchCache.topics[oldest].lastResearched).getTime()
        : 0;
      return lastTime < oldestTime ? topic : oldest;
    }, topics[0]);

    this.log(`All topics recently researched, using oldest: ${oldestTopic}`);
    return {
      type: WORK_TYPES.RESEARCH,
      topic: oldestTopic,
      context: { profile, thesis },
    };
  }

  /**
   * Log to stderr so it shows in Ink apps
   */
  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    process.stderr.write(`[IdleProcessor ${timestamp}] ${message}\n`);
  }

  /**
   * Determine what type of work to do on an item
   */
  determineWorkType(item) {
    // If item lacks detail, develop it
    if (!item.description || item.description.length < 100) {
      return WORK_TYPES.DEVELOP;
    }

    // If item is old and hasn't been evaluated, evaluate it
    const lastEval = item.lastEvaluated ? new Date(item.lastEvaluated).getTime() : 0;
    if (Date.now() - lastEval > 24 * 60 * 60 * 1000) {
      return WORK_TYPES.EVALUATE;
    }

    // If item is market/time-sensitive, research current state
    if (item.isTimeSensitive || item.source === "market-opportunity") {
      return WORK_TYPES.RESEARCH;
    }

    // Default to developing the item further
    return WORK_TYPES.DEVELOP;
  }

  /**
   * Start working on a work item
   */
  async startWork(workItem) {
    this.isWorking = true;
    this.currentWorkItem = workItem;
    this.workSessionStart = Date.now();
    this.qualityActionsThisSession = 0;
    this.streamBuffer = "";

    const tracker = getActivityTracker();
    tracker.setState("working", "Processing backlog...");

    console.log(`[IdleProcessor] Starting work: ${workItem.type}`);
    console.log(`[IdleProcessor] Target: ${workItem.item?.title || workItem.topic || "backlog"}`);
    this.emit("work-started", workItem);

    try {
      const prompt = this.buildPrompt(workItem);
      tracker.setGoal(this.getWorkDescription(workItem));
      // Use WEB_SEARCH as the action type for research tasks
      tracker.action("WEB_SEARCH", `researching: ${this.getWorkTarget(workItem)}`);

      console.log(`[IdleProcessor] ========================================`);
      console.log(`[IdleProcessor] RUNNING CLAUDE CODE CLI`);
      console.log(`[IdleProcessor] Prompt length: ${prompt.length} chars`);
      console.log(`[IdleProcessor] Prompt preview:`);
      console.log(prompt.slice(0, 500));
      console.log(`[IdleProcessor] ========================================`);

      // Run Claude Code CLI with streaming
      this.currentStream = await runClaudeCodeStreaming(prompt, {
        timeout: MAX_WORK_SESSION_MS,
        cwd: process.cwd(),
      });

      if (!this.currentStream) {
        console.error("[IdleProcessor] ERROR: runClaudeCodeStreaming returned null/undefined");
        this.handleWorkComplete({ success: false, error: "Stream not created" });
        return;
      }

      console.log("[IdleProcessor] Claude Code CLI process started, waiting for output...");

      this.currentStream.on("data", (text) => {
        this.streamBuffer += text;
        this.emit("stream", text);

        // Update status with preview of what Claude is saying
        if (text.trim() && text.length > 20) {
          const preview = text.trim().slice(0, 80).replace(/\n/g, " ");
          tracker.setState("working", preview);
        }

        // Track actions in the stream - detect Claude Code tool usage
        if (text.includes("Read(")) {
          this.qualityActionsThisSession++;
          const match = text.match(/Read\(([^)]+)\)/);
          tracker.action("READ", match ? match[1] : text.slice(0, 100));
        } else if (text.includes("WebSearch(") || text.includes("web_search")) {
          this.qualityActionsThisSession++;
          const match = text.match(/WebSearch\(([^)]+)\)/);
          tracker.action("WEB_SEARCH", match ? match[1] : "searching...");
        } else if (text.includes("Update(") || text.includes("Write(")) {
          this.qualityActionsThisSession++;
          const match = text.match(/(Update|Write)\(([^)]+)\)/);
          tracker.action("UPDATE", match ? match[2] : text.slice(0, 100));
        }
      });

      this.currentStream.on("tool", (tool) => {
        console.log(`[IdleProcessor] Tool called: ${tool.tool}(${tool.input?.slice(0, 50)})`);
        // Normalize tool name to uppercase for activity tracker
        const toolName = tool.tool?.toUpperCase?.() || tool.tool;
        tracker.action(toolName, tool.input?.slice(0, 100));
        this.qualityActionsThisSession++;
        this.emit("tool", tool);
      });

      this.currentStream.on("error", (error) => {
        console.error("[IdleProcessor] ========================================");
        console.error("[IdleProcessor] CLAUDE CODE CLI ERROR:");
        console.error(error);
        console.error("[IdleProcessor] ========================================");
        this.handleWorkComplete({ success: false, error: error.error || error.message || JSON.stringify(error) });
      });

      this.currentStream.on("complete", (result) => {
        console.log("[IdleProcessor] ========================================");
        console.log("[IdleProcessor] CLAUDE CODE CLI COMPLETED");
        console.log(`[IdleProcessor] Success: ${result.success}, Exit code: ${result.exitCode}`);
        console.log(`[IdleProcessor] Output length: ${result.output?.length || 0} chars`);
        if (result.output) {
          console.log("[IdleProcessor] Output preview:");
          console.log(result.output.slice(0, 500));
        }
        console.log("[IdleProcessor] ========================================");
        this.handleWorkComplete(result);
      });
    } catch (error) {
      console.error("[IdleProcessor] ========================================");
      console.error("[IdleProcessor] EXCEPTION IN START WORK:");
      console.error(error);
      console.error("[IdleProcessor] ========================================");
      this.handleWorkComplete({ success: false, error: error.message });
    }
  }

  /**
   * Build the prompt for Claude Code CLI
   */
  buildPrompt(workItem) {
    const { type, item, topic, context } = workItem;

    const baseContext = `You are working on BACKBONE's backlog in the background.
The user is not actively interacting - work autonomously.
Do meaningful work, then stop. Don't spin cycles unnecessarily.

User Profile Summary:
${context?.profile?.slice(0, 500) || "No profile available"}

Current Thesis:
${context?.thesis?.slice(0, 300) || "No thesis available"}
`;

    switch (type) {
      case WORK_TYPES.RESEARCH:
        if (topic) {
          return `${baseContext}

TASK: Research "${topic}" to find actionable insights for the user.

1. Use WebSearch to find current, relevant information
2. Focus on practical, actionable insights
3. Look for trends, opportunities, or risks
4. Update the backlog with new items if you find valuable opportunities

After researching, create a brief summary and add any valuable findings as new backlog items.
Save findings to data/backlog.json (add to items array with format: { title, description, source: "research", impactScore: 50-80, urgency: "low"|"medium"|"high", isTimeSensitive: true|false }).

Be concise. Do 2-3 quality searches, extract insights, update backlog, then stop.`;
        }
        return `${baseContext}

TASK: Research to update this backlog item with current information.

Backlog Item:
- Title: ${item.title}
- Description: ${item.description}
- Source: ${item.source}
- Current Impact Score: ${item.impactScore}

1. Search for current information relevant to this item
2. Determine if circumstances have changed
3. Update the item's description with new findings
4. Adjust impact score if warranted

Read data/backlog.json, find the item with id "${item.id}", update it, and save.

Be focused. 2-3 searches max, then update and stop.`;

      case WORK_TYPES.EVALUATE:
        return `${baseContext}

TASK: Re-evaluate this backlog item's priority and relevance.

Backlog Item:
- ID: ${item.id}
- Title: ${item.title}
- Description: ${item.description}
- Current Impact Score: ${item.impactScore}
- Urgency: ${item.urgency}
- Created: ${item.createdAt}
- Last Evaluated: ${item.lastEvaluated || "never"}

Consider:
1. Is this still relevant to the user's goals?
2. Has anything changed that affects urgency?
3. Should impact score be adjusted?
4. Should this be dismissed (no longer relevant)?

Read data/backlog.json, find item "${item.id}", update impactScore, urgency, lastEvaluated (set to now), and description if needed.

If item should be dismissed, move it to the "dismissed" array with a dismissReason.

Be decisive. Evaluate quickly and update.`;

      case WORK_TYPES.DEVELOP:
        return `${baseContext}

TASK: Develop this backlog item with more detail and actionable steps.

Backlog Item:
- ID: ${item.id}
- Title: ${item.title}
- Description: ${item.description}
- Related Beliefs: ${item.relatedBeliefs?.join(", ") || "none"}
- Suggested Project: ${item.suggestedProject || "none"}

Develop this item by:
1. Adding specific, actionable steps
2. Identifying what success looks like
3. Finding connections to existing projects
4. Estimating potential impact more accurately

Read data/backlog.json, update the item with enhanced description and any new fields.
If impact is now clearer, update impactScore.
Set lastEvaluated to current timestamp.

Be thorough but concise. Add real value, then stop.`;

      case WORK_TYPES.CONNECT:
        return `${baseContext}

TASK: Find connections between backlog items and consolidate if needed.

Read data/backlog.json and look for:
1. Duplicate or very similar items (merge them)
2. Items that could be grouped under a common theme
3. Items that depend on each other (note dependencies)
4. Items that conflict (flag for user review)

Update the backlog with your findings. Merge duplicates by keeping the best one and dismissing others.

Be efficient. Quick analysis, meaningful updates, then stop.`;

      case WORK_TYPES.PRUNE:
        return `${baseContext}

TASK: Clean up stale or irrelevant backlog items.

Read data/backlog.json and identify:
1. Items older than 30 days with low impact scores (<40)
2. Items that are no longer relevant to user's current goals
3. Items that are too vague to be actionable
4. Completed items that weren't marked as such

Move stale/irrelevant items to "dismissed" array with clear dismissReason.
Don't dismiss items with high impact scores unless clearly outdated.

Be conservative. Only prune what's clearly stale.`;

      default:
        return `${baseContext}

TASK: Review and improve the backlog.

Read data/backlog.json and make meaningful improvements:
1. Update stale items
2. Adjust priorities based on current context
3. Add missing details where obvious
4. Flag items needing user attention

Do quality work, then stop.`;
    }
  }

  /**
   * Get work description for activity tracker
   */
  getWorkDescription(workItem) {
    switch (workItem.type) {
      case WORK_TYPES.RESEARCH:
        return workItem.topic
          ? `Researching: ${workItem.topic}`
          : `Researching: ${workItem.item?.title}`;
      case WORK_TYPES.EVALUATE:
        return `Evaluating: ${workItem.item?.title}`;
      case WORK_TYPES.DEVELOP:
        return `Developing: ${workItem.item?.title}`;
      case WORK_TYPES.CONNECT:
        return "Finding connections in backlog";
      case WORK_TYPES.PRUNE:
        return "Cleaning up stale backlog items";
      default:
        return "Processing backlog";
    }
  }

  /**
   * Get work target for activity tracker
   */
  getWorkTarget(workItem) {
    if (workItem.topic) return workItem.topic;
    if (workItem.item) return workItem.item.title;
    return "backlog";
  }

  /**
   * Handle work completion
   */
  handleWorkComplete(result) {
    const tracker = getActivityTracker();

    this.isWorking = false;
    this.lastWorkCompletion = Date.now();
    this.currentStream = null;

    // Update state
    this.state.totalWorkSessions++;
    if (this.currentWorkItem?.item) {
      this.state.totalItemsProcessed++;
      this.state.recentWork.unshift({
        itemId: this.currentWorkItem.item.id,
        itemTitle: this.currentWorkItem.item.title,
        workType: this.currentWorkItem.type,
        timestamp: new Date().toISOString(),
        success: result.success,
      });
      // Keep only last 20
      this.state.recentWork = this.state.recentWork.slice(0, 20);
    }
    this.state.lastSessionTimestamp = new Date().toISOString();
    this.saveState();

    // Update research cache if we did research
    if (this.currentWorkItem?.type === WORK_TYPES.RESEARCH && this.currentWorkItem?.topic) {
      this.researchCache.topics[this.currentWorkItem.topic] = {
        lastResearched: new Date().toISOString(),
        findings: this.streamBuffer.slice(-500), // Keep last 500 chars
      };
      this.saveResearchCache();
    }

    const duration = Date.now() - this.workSessionStart;
    console.log(
      `[IdleProcessor] Work complete: ${result.success ? "success" : "failed"} ` +
        `(${Math.round(duration / 1000)}s, ${this.qualityActionsThisSession} actions)`
    );

    tracker.setState("idle", null);
    tracker.log("idle", "Background work completed", "completed");

    this.currentWorkItem = null;
    this.emit("work-complete", {
      success: result.success,
      duration,
      actionsCount: this.qualityActionsThisSession,
      output: this.streamBuffer,
    });

    // Check if we should do more work or rest
    if (this.qualityActionsThisSession >= GOOD_WORK_THRESHOLD) {
      console.log("[IdleProcessor] Good work done - resting");
    }
  }

  /**
   * Pause current work gracefully
   */
  pauseWork() {
    if (this.currentStream) {
      this.currentStream.abort();
      this.currentStream = null;
    }
    this.isWorking = false;
    this.emit("work-paused", this.currentWorkItem);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isWorking: this.isWorking,
      currentWorkItem: this.currentWorkItem
        ? {
            type: this.currentWorkItem.type,
            title: this.currentWorkItem.item?.title || this.currentWorkItem.topic,
          }
        : null,
      lastUserActivity: this.lastUserActivity,
      lastWorkCompletion: this.lastWorkCompletion,
      idleTimeMs: Date.now() - this.lastUserActivity,
      stats: {
        totalSessions: this.state.totalWorkSessions,
        totalItemsProcessed: this.state.totalItemsProcessed,
        recentWork: this.state.recentWork.slice(0, 5),
      },
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const status = this.getStatus();
    return {
      status: this.isWorking ? "working" : "idle",
      currentTask: status.currentWorkItem?.title || null,
      workType: status.currentWorkItem?.type || null,
      idleFor: Math.round(status.idleTimeMs / 1000),
      stats: status.stats,
      streamPreview: this.streamBuffer.slice(-200), // Last 200 chars
    };
  }

  /**
   * Enable/disable the processor
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled && this.isWorking) {
      this.pauseWork();
    }
  }

  /**
   * Force start work now (for testing)
   */
  async forceWork() {
    console.log("[IdleProcessor] Force work requested");

    if (this.isWorking) {
      console.log("[IdleProcessor] Already working");
      return { success: false, reason: "Already working" };
    }

    // Check Claude Code is ready
    const status = await getClaudeCodeStatus();
    if (!status.ready) {
      console.log(`[IdleProcessor] Claude Code not ready - installed=${status.installed}, loggedIn=${status.loggedIn}`);
      return { success: false, reason: "Claude Code not ready" };
    }

    console.log("[IdleProcessor] Claude Code ready, finding work...");
    let workItem = await this.selectWorkItem();

    // If no work item and backlog is empty, create a general research task
    if (!workItem) {
      console.log("[IdleProcessor] No backlog items, creating general research task...");
      const profile = readFile(path.join(MEMORY_DIR, "profile.md"));
      const thesis = readFile(path.join(MEMORY_DIR, "thesis.md"));

      workItem = {
        type: WORK_TYPES.RESEARCH,
        topic: "user goals and priorities",
        context: { profile, thesis },
      };
    }

    console.log(`[IdleProcessor] Starting work: ${workItem.type} - ${workItem.item?.title || workItem.topic}`);
    await this.startWork(workItem);
    return { success: true, workItem };
  }
}

// Singleton
let instance = null;

export const getIdleProcessor = () => {
  if (!instance) {
    console.log("========================================");
    console.log("[IdleProcessor] CREATING SINGLETON INSTANCE");
    console.log("========================================");
    instance = new IdleProcessor();
    // Auto-start on creation
    instance.start();
  }
  return instance;
};

// Auto-initialize when module is imported
console.log("========================================");
console.log("[IdleProcessor] MODULE LOADED");
console.log("========================================");

export default IdleProcessor;
