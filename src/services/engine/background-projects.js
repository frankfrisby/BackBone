/**
 * Background Projects Service
 *
 * Manages persistent, long-running background projects that operate autonomously.
 * These projects don't show in the main goals list unless nothing else is active.
 *
 * Background Projects:
 * 1. Market Research - Continuous analysis of markets, geopolitics, macroeconomics
 * 2. Financial Growth - Strategies to improve user's financial position
 * 3. Disaster Planning - Scenario analysis and preparation for potential threats
 *
 * These projects:
 * - Run in the background with low priority
 * - Are mostly on-hold until triggered by events
 * - Build persistent knowledge over time
 * - Can suggest actions to user when relevant
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { runClaudeCodeStreaming, getClaudeCodeStatus } from "../ai/claude-code-cli.js";
import { getActivityNarrator } from "../ui/activity-narrator.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const BACKGROUND_PROJECTS_PATH = path.join(DATA_DIR, "background-projects.json");

/**
 * Background Project Types
 */
export const BACKGROUND_PROJECT_TYPE = {
  MARKET_RESEARCH: "market_research",
  FINANCIAL_GROWTH: "financial_growth",
  DISASTER_PLANNING: "disaster_planning"
};

/**
 * Project Status
 */
export const PROJECT_STATUS = {
  ACTIVE: "active",       // Currently analyzing
  ON_HOLD: "on_hold",     // Waiting for trigger
  TRIGGERED: "triggered", // Event triggered action
  IDLE: "idle"            // Nothing to do
};

/**
 * Default background projects configuration
 */
const DEFAULT_PROJECTS = {
  [BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH]: {
    id: "bg_market_research",
    type: BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH,
    title: "Market Research & Analysis",
    description: `Continuous analysis of global markets, geopolitical shifts, and macroeconomic changes.

Scope:
- Evaluate ticker performance and market trends
- Monitor geopolitical events affecting markets
- Track macroeconomic indicators globally
- Research emerging patterns and opportunities
- Analyze satellite data, shipping, oil consumption when available
- Build theories and update as market conditions change

This project provides deeper analysis than typical market data, looking at:
- Supply chain indicators
- Currency movements
- Central bank policies
- Trade relationships
- Resource consumption patterns`,
    status: PROJECT_STATUS.ON_HOLD,
    priority: 0, // Low priority - runs when nothing else needs attention
    createdAt: new Date().toISOString(),
    lastActive: null,
    triggers: [
      { type: "market_hours", description: "Activate during trading hours" },
      { type: "significant_move", description: "Major market movement detected" },
      { type: "geopolitical_event", description: "Breaking news affecting markets" },
      { type: "scheduled", interval: "daily", time: "06:00" }
    ],
    insights: [],        // Accumulated insights over time
    theories: [],        // Current market theories being tracked
    dataPoints: [],      // Key data points being monitored
    showInGoalsList: false
  },

  [BACKGROUND_PROJECT_TYPE.FINANCIAL_GROWTH]: {
    id: "bg_financial_growth",
    type: BACKGROUND_PROJECT_TYPE.FINANCIAL_GROWTH,
    title: "Financial Growth Strategy",
    description: `Research and implement strategies to improve user's financial position.

Scope:
- Analyze current net worth and identify opportunities
- Research investment options based on risk profile
- Monitor and execute trades using market research insights
- Track credit improvement opportunities
- Identify optimal money deployment strategies
- Calculate compound growth scenarios
- Suggest rebalancing when appropriate

Works in conjunction with Market Research project to:
- Time entries based on market conditions
- Avoid concentrated risk
- Maintain appropriate asset allocation
- Execute trades when conditions align`,
    status: PROJECT_STATUS.ON_HOLD,
    priority: 0,
    createdAt: new Date().toISOString(),
    lastActive: null,
    triggers: [
      { type: "market_opportunity", description: "Good entry point identified" },
      { type: "portfolio_rebalance", description: "Portfolio drifted from target" },
      { type: "new_capital", description: "Cash available for deployment" },
      { type: "scheduled", interval: "weekly", day: "monday" }
    ],
    currentStrategy: null,
    pendingActions: [],
    executedTrades: [],
    growthTargets: [],
    showInGoalsList: false
  },

  [BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING]: {
    id: "bg_disaster_planning",
    type: BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING,
    title: "Disaster Planning & Preparedness",
    description: `Monitor world events and prepare user for potential disruptions.

Scope:
- Track emerging threats (pandemics, geopolitical, climate, economic)
- Analyze user's vulnerability based on location and circumstances
- Model scenarios and their potential impact
- Proactively suggest preparations before events materialize
- Monitor early warning indicators
- Suggest purchases, preparations, or actions when needed

Example triggers:
- Disease outbreaks in other countries
- Supply chain disruptions
- Weather pattern changes
- Economic instability indicators
- Geopolitical tensions escalating

Can suggest actions like:
- Pre-ordering supplies before shortages
- Adjusting investment allocation
- Securing resources at lower prices
- Building emergency reserves`,
    status: PROJECT_STATUS.ON_HOLD,
    priority: 0,
    createdAt: new Date().toISOString(),
    lastActive: null,
    triggers: [
      { type: "threat_detected", description: "Early warning indicator triggered" },
      { type: "scenario_update", description: "New risk scenario identified" },
      { type: "action_recommended", description: "Preventive action should be taken" },
      { type: "scheduled", interval: "weekly", day: "sunday" }
    ],
    activeThreats: [],
    scenarios: [],
    preparednessLevel: 0,
    actionHistory: [],
    showInGoalsList: false
  }
};

/**
 * Background Projects Manager
 */
class BackgroundProjectsManager extends EventEmitter {
  constructor() {
    super();
    this.projects = {};
    this.initialized = false;
    this.checkInterval = null;
  }

  /**
   * Initialize background projects
   */
  async initialize() {
    this.loadProjects();

    // Ensure all default projects exist
    for (const [type, defaultProject] of Object.entries(DEFAULT_PROJECTS)) {
      if (!this.projects[type]) {
        this.projects[type] = { ...defaultProject };
      }
    }

    this.saveProjects();
    this.initialized = true;

    // Start periodic check for triggers
    this.startPeriodicCheck();

    // Start work scheduler to ensure 1-2 projects are always active
    this.startWorkScheduler();

    this.emit("initialized");
    return this.projects;
  }

  /**
   * Load projects from disk
   */
  loadProjects() {
    try {
      if (fs.existsSync(BACKGROUND_PROJECTS_PATH)) {
        this.projects = JSON.parse(fs.readFileSync(BACKGROUND_PROJECTS_PATH, "utf-8"));
        return this.projects;
      }
    } catch (error) {
      console.error("[BackgroundProjects] Failed to load:", error.message);
    }
    this.projects = {};
    return {};
  }

  /**
   * Save projects to disk
   */
  saveProjects() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(BACKGROUND_PROJECTS_PATH, JSON.stringify(this.projects, null, 2));
      return true;
    } catch (error) {
      console.error("[BackgroundProjects] Failed to save:", error.message);
      return false;
    }
  }

  /**
   * Get a specific project
   */
  getProject(type) {
    return this.projects[type] || null;
  }

  /**
   * Get all projects
   */
  getAllProjects() {
    return Object.values(this.projects);
  }

  /**
   * Get projects that should show in goals list (only when nothing else is there)
   */
  getDisplayableProjects() {
    return Object.values(this.projects).filter(p => p.showInGoalsList);
  }

  /**
   * Update project status
   */
  updateProjectStatus(type, status, details = {}) {
    if (!this.projects[type]) return false;

    this.projects[type].status = status;
    this.projects[type].lastActive = new Date().toISOString();

    if (details.insight) {
      this.projects[type].insights = this.projects[type].insights || [];
      this.projects[type].insights.unshift({
        text: details.insight,
        timestamp: new Date().toISOString(),
        source: details.source || "analysis"
      });
      // Keep last 100 insights
      if (this.projects[type].insights.length > 100) {
        this.projects[type].insights = this.projects[type].insights.slice(0, 100);
      }
    }

    this.saveProjects();
    this.emit("project-updated", { type, status, details });
    return true;
  }

  /**
   * Add insight to a project
   */
  addInsight(type, insight, source = "analysis") {
    if (!this.projects[type]) return false;

    this.projects[type].insights = this.projects[type].insights || [];
    this.projects[type].insights.unshift({
      text: insight,
      timestamp: new Date().toISOString(),
      source
    });

    if (this.projects[type].insights.length > 100) {
      this.projects[type].insights = this.projects[type].insights.slice(0, 100);
    }

    this.saveProjects();
    this.emit("insight-added", { type, insight, source });
    return true;
  }

  /**
   * Add a theory to market research
   */
  addTheory(theory, confidence = 50) {
    const project = this.projects[BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH];
    if (!project) return false;

    project.theories = project.theories || [];
    project.theories.unshift({
      id: `theory_${Date.now()}`,
      text: theory,
      confidence,
      createdAt: new Date().toISOString(),
      validations: [],
      invalidations: []
    });

    if (project.theories.length > 50) {
      project.theories = project.theories.slice(0, 50);
    }

    this.saveProjects();
    this.emit("theory-added", { theory, confidence });
    return true;
  }

  /**
   * Add a threat to disaster planning
   */
  addThreat(threat, severity = "low", details = {}) {
    const project = this.projects[BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING];
    if (!project) return false;

    project.activeThreats = project.activeThreats || [];
    project.activeThreats.unshift({
      id: `threat_${Date.now()}`,
      description: threat,
      severity, // low, medium, high, critical
      detectedAt: new Date().toISOString(),
      indicators: details.indicators || [],
      suggestedActions: details.actions || [],
      status: "monitoring"
    });

    if (project.activeThreats.length > 50) {
      project.activeThreats = project.activeThreats.slice(0, 50);
    }

    this.saveProjects();
    this.emit("threat-detected", { threat, severity, details });

    // If severity is high or critical, suggest immediate notification
    if (severity === "high" || severity === "critical") {
      this.emit("urgent-action-needed", {
        project: BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING,
        threat,
        severity,
        actions: details.actions
      });
    }

    return true;
  }

  /**
   * Trigger a project to become active
   */
  triggerProject(type, reason = "manual") {
    if (!this.projects[type]) return false;

    this.projects[type].status = PROJECT_STATUS.TRIGGERED;
    this.projects[type].lastActive = new Date().toISOString();
    this.projects[type].lastTrigger = {
      reason,
      timestamp: new Date().toISOString()
    };

    this.saveProjects();
    this.emit("project-triggered", { type, reason });
    return true;
  }

  /**
   * Start periodic check for triggers
   */
  startPeriodicCheck() {
    if (this.checkInterval) return;

    // Check every 5 minutes
    this.checkInterval = setInterval(() => {
      this.checkTriggers();
    }, 5 * 60 * 1000);

    // Initial check
    this.checkTriggers();
  }

  /**
   * Stop periodic check
   */
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check if any triggers should activate
   */
  checkTriggers() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.toLocaleDateString("en-US", { weekday: "lowercase" });

    for (const [type, project] of Object.entries(this.projects)) {
      if (project.status === PROJECT_STATUS.ON_HOLD) {
        for (const trigger of (project.triggers || [])) {
          if (trigger.type === "market_hours") {
            // Market hours: 9:30 AM - 4:00 PM ET (adjust for timezone)
            if (currentHour >= 9 && currentHour < 16) {
              this.triggerProject(type, "market_hours");
              break;
            }
          } else if (trigger.type === "scheduled") {
            if (trigger.interval === "daily" && trigger.time) {
              const [hour] = trigger.time.split(":").map(Number);
              if (currentHour === hour) {
                this.triggerProject(type, "scheduled_daily");
                break;
              }
            } else if (trigger.interval === "weekly" && trigger.day) {
              if (currentDay === trigger.day.toLowerCase() && currentHour === 9) {
                this.triggerProject(type, "scheduled_weekly");
                break;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      initialized: this.initialized,
      projects: Object.entries(this.projects).map(([type, project]) => ({
        type,
        title: project.title,
        status: project.status,
        lastActive: project.lastActive,
        insightCount: (project.insights || []).length,
        latestInsight: project.insights?.[0]?.text || null
      })),
      marketTheories: this.projects[BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH]?.theories?.length || 0,
      activeThreats: this.projects[BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING]?.activeThreats?.filter(
        t => t.status === "monitoring" && (t.severity === "high" || t.severity === "critical")
      ).length || 0,
      activeWorkCount: this.activeWorkCount || 0,
      currentlyWorking: this.currentlyWorkingOn || null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE PROJECT WORK MANAGEMENT
  // Ensures 1-2 projects are always being actively worked on
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ensure at least 1-2 projects are actively being worked on
   * Called periodically by the work scheduler
   */
  async ensureActiveWork() {
    if (this.isWorking) {
      console.log("[BackgroundProjects] Already working on a project");
      return;
    }

    // Check if Claude Code CLI is ready
    const cliStatus = await getClaudeCodeStatus();
    if (!cliStatus.ready) {
      console.log("[BackgroundProjects] Claude Code CLI not ready");
      return;
    }

    // Get projects that need work
    const projectsNeedingWork = this.getProjectsNeedingWork();

    if (projectsNeedingWork.length === 0) {
      console.log("[BackgroundProjects] All projects up to date");
      return;
    }

    // Work on the highest priority project
    const projectToWork = projectsNeedingWork[0];
    console.log(`[BackgroundProjects] Starting work on: ${projectToWork.title}`);

    await this.workOnProject(projectToWork.type);
  }

  /**
   * Get projects that need work, sorted by priority
   */
  getProjectsNeedingWork() {
    const now = Date.now();
    const projects = [];

    for (const [type, project] of Object.entries(this.projects)) {
      // Calculate how long since last active
      const lastActive = project.lastActive ? new Date(project.lastActive).getTime() : 0;
      const hoursSinceActive = (now - lastActive) / (1000 * 60 * 60);

      // Projects need work if:
      // 1. Status is TRIGGERED
      // 2. Status is ON_HOLD but not worked on in 24+ hours
      // 3. Status is ACTIVE (continue working)
      let needsWork = false;
      let priority = 0;

      if (project.status === PROJECT_STATUS.TRIGGERED) {
        needsWork = true;
        priority = 100;
      } else if (project.status === PROJECT_STATUS.ACTIVE) {
        needsWork = true;
        priority = 80;
      } else if (project.status === PROJECT_STATUS.ON_HOLD && hoursSinceActive > 24) {
        needsWork = true;
        priority = 50;
      }

      // Boost priority based on type
      if (type === BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH) {
        priority += 10; // Market research is always somewhat important
      }
      if (type === BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING) {
        // Boost if there are active threats
        const threatCount = (project.activeThreats || []).filter(t => t.status === "monitoring").length;
        priority += threatCount * 5;
      }

      if (needsWork) {
        projects.push({ type, priority, ...project });
      }
    }

    // Sort by priority descending
    projects.sort((a, b) => b.priority - a.priority);

    return projects;
  }

  /**
   * Start working on a specific project using Claude Code CLI
   */
  async workOnProject(type) {
    const project = this.projects[type];
    if (!project) {
      console.error(`[BackgroundProjects] Project not found: ${type}`);
      return;
    }

    this.isWorking = true;
    this.currentlyWorkingOn = project.title;
    this.activeWorkCount = (this.activeWorkCount || 0) + 1;

    const narrator = getActivityNarrator();
    narrator.setState("WORKING", `Background: ${project.title}`);
    narrator.setClaudeCodeActive(true, "starting");

    // Update project status
    this.updateProjectStatus(type, PROJECT_STATUS.ACTIVE, {});

    try {
      const prompt = this.buildProjectPrompt(type, project);

      const stream = await runClaudeCodeStreaming(prompt, {
        timeout: 10 * 60_000, // 10 minutes max
        cwd: process.cwd()
      });

      if (!stream) {
        console.error("[BackgroundProjects] Failed to start Claude Code CLI");
        this.handleWorkComplete(type, { success: false, error: "Stream not created" });
        return;
      }

      stream.on("data", (text) => {
        this.emit("stream", { type, text });
        // Extract insights from the stream
        this.extractInsightsFromStream(type, text);
      });

      stream.on("complete", (result) => {
        console.log(`[BackgroundProjects] Work on ${project.title} complete`);
        this.handleWorkComplete(type, result);
      });

      stream.on("error", (error) => {
        console.error(`[BackgroundProjects] Error working on ${project.title}:`, error);
        this.handleWorkComplete(type, { success: false, error: error.message });
      });

    } catch (error) {
      console.error(`[BackgroundProjects] Exception working on ${project.title}:`, error);
      this.handleWorkComplete(type, { success: false, error: error.message });
    }
  }

  /**
   * Handle work completion
   */
  handleWorkComplete(type, result) {
    const narrator = getActivityNarrator();
    narrator.setClaudeCodeActive(false, result.success ? "complete" : "error");
    narrator.setState("IDLE", result.success ? "Background work complete" : "Background work failed");

    this.isWorking = false;
    this.currentlyWorkingOn = null;

    // Update project status
    this.updateProjectStatus(type, PROJECT_STATUS.ON_HOLD, {
      insight: result.success ? "Work session completed" : `Work session failed: ${result.error}`
    });

    this.emit("work-complete", { type, result });
  }

  /**
   * Extract insights from streaming output
   */
  extractInsightsFromStream(type, text) {
    // Look for patterns that indicate insights
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // Key finding patterns
      if (trimmed.startsWith("INSIGHT:") || trimmed.startsWith("Finding:") || trimmed.startsWith("Key:")) {
        const insight = trimmed.replace(/^(INSIGHT:|Finding:|Key:)\s*/i, "");
        if (insight.length > 20) {
          this.addInsight(type, insight, "streaming");
        }
      }

      // Market theories
      if (type === BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH) {
        if (trimmed.startsWith("THEORY:") || trimmed.includes("market hypothesis")) {
          const theory = trimmed.replace(/^THEORY:\s*/i, "");
          if (theory.length > 20) {
            this.addTheory(theory, 50);
          }
        }
      }

      // Threat detection
      if (type === BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING) {
        if (trimmed.startsWith("THREAT:") || trimmed.includes("potential risk")) {
          const threat = trimmed.replace(/^THREAT:\s*/i, "");
          if (threat.length > 20) {
            this.addThreat(threat, "medium", {});
          }
        }
      }
    }
  }

  /**
   * Build prompt for project work
   */
  buildProjectPrompt(type, project) {
    const base = `You are working on a BACKBONE background project autonomously.
Project: ${project.title}

${project.description}

Previous Insights (last 5):
${(project.insights || []).slice(0, 5).map(i => `- ${i.text}`).join("\n") || "None yet"}

`;

    switch (type) {
      case BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH:
        return `${base}

TASK: Analyze current market conditions and update research.

1. Use WebSearch to find current market news and analysis
2. Look for macroeconomic trends, geopolitical events affecting markets
3. Analyze any significant market movements
4. Update your theories on market direction

For each finding, prefix with "INSIGHT:" so it can be captured.
For new theories, prefix with "THEORY:" so they can be tracked.

Focus on:
- S&P 500 and major index movements
- Bond market signals
- Currency movements
- Geopolitical events affecting markets
- Sector rotations

Do 3-5 quality searches, extract key insights, then stop.`;

      case BACKGROUND_PROJECT_TYPE.FINANCIAL_GROWTH:
        return `${base}

TASK: Analyze opportunities for financial growth.

1. Review current market conditions (from market_research if available)
2. Identify entry/exit opportunities
3. Look for undervalued assets or sectors
4. Analyze risk/reward scenarios

For each finding, prefix with "INSIGHT:" so it can be captured.

Focus on:
- Value opportunities in current market
- Risk factors to consider
- Portfolio optimization ideas
- Timing considerations

Do 2-4 quality searches, extract actionable insights, then stop.`;

      case BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING:
        return `${base}

TASK: Monitor world events for potential threats and preparation needs.

1. Search for emerging global risks (pandemic, economic, geopolitical, climate)
2. Identify early warning indicators
3. Suggest preparedness actions if needed
4. Update threat assessments

For each threat, prefix with "THREAT:" so it can be tracked.
For insights, prefix with "INSIGHT:" for capture.

Focus on:
- Supply chain disruptions
- Disease outbreaks
- Geopolitical tensions
- Economic instability indicators
- Climate/weather events

Do 3-5 quality searches, assess risks, then stop.`;

      default:
        return `${base}

TASK: Continue project work.

1. Review current state
2. Identify next actions
3. Execute research or analysis
4. Document findings

Mark key findings with "INSIGHT:" prefix.`;
    }
  }

  /**
   * Start the work scheduler to ensure projects are being worked on
   */
  startWorkScheduler() {
    if (this.workSchedulerInterval) return;

    console.log("[BackgroundProjects] Starting work scheduler");

    // Check every 15 minutes if we should start working on a project
    this.workSchedulerInterval = setInterval(() => {
      this.ensureActiveWork().catch(err => {
        console.error("[BackgroundProjects] Work scheduler error:", err.message);
      });
    }, 15 * 60 * 1000);

    // Initial check after 2 minutes
    setTimeout(() => {
      this.ensureActiveWork().catch(err => {
        console.error("[BackgroundProjects] Initial work check error:", err.message);
      });
    }, 2 * 60 * 1000);
  }

  /**
   * Stop the work scheduler
   */
  stopWorkScheduler() {
    if (this.workSchedulerInterval) {
      clearInterval(this.workSchedulerInterval);
      this.workSchedulerInterval = null;
    }
  }
}

// Singleton instance
let instance = null;

export const getBackgroundProjectsManager = () => {
  if (!instance) {
    instance = new BackgroundProjectsManager();
  }
  return instance;
};

/**
 * Initialize background projects on app start
 */
export const initializeBackgroundProjects = async () => {
  const manager = getBackgroundProjectsManager();
  await manager.initialize();
  return manager;
};

export default BackgroundProjectsManager;
