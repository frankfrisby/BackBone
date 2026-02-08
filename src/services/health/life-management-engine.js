/**
 * Life Management Engine
 *
 * The core autonomous engine that manages all aspects of the user's life:
 * - Financial management & investments
 * - Retirement planning
 * - Health & self-care
 * - Family growth
 * - Learning & adaptation
 * - Disaster preparedness
 * - Goal tracking
 *
 * Integrates all the specialized services and coordinates their actions.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

// Import all life management services
import { getDisasterMonitor } from "../research/disaster-monitor.js";
import { getPolymarketService } from "../integrations/polymarket-service.js";
import { getConversationTracker } from "../memory/conversation-tracker.js";
import { getProactiveEngine } from "../engine/proactive-engine.js";
import { getFirebaseMessaging } from "../firebase/firebase-messaging.js";
import { getGoalTracker } from "../goals/goal-tracker.js";
import { getLifeScores } from "./life-scores.js";
import { getActivityNarrator, ACTION_STATUS } from "../ui/activity-narrator.js";
import { getDataDir } from "../paths.js";
import {
  withTimeout,
  withRetry,
  getServiceHealthMonitor,
  StructuredLogger,
  TimeoutError
} from "../service-utils.js";

const DATA_DIR = getDataDir();
const ENGINE_STATE_FILE = path.join(DATA_DIR, "life_engine_state.json");
const INSIGHTS_FILE = path.join(DATA_DIR, "life_insights.md");

// Life areas the engine manages
export const LIFE_AREAS = {
  FINANCIAL: {
    id: "financial",
    name: "Financial Management",
    icon: "💰",
    priority: 1,
    subAreas: ["budgeting", "investing", "debt", "emergency_fund", "retirement"]
  },
  HEALTH: {
    id: "health",
    name: "Health & Self-Care",
    icon: "❤️",
    priority: 2,
    subAreas: ["sleep", "exercise", "nutrition", "mental_health", "medical"]
  },
  CAREER: {
    id: "career",
    name: "Career & Growth",
    icon: "📈",
    priority: 3,
    subAreas: ["skills", "networking", "income", "satisfaction", "learning"]
  },
  FAMILY: {
    id: "family",
    name: "Family & Relationships",
    icon: "👨‍👩‍👧‍👦",
    priority: 4,
    subAreas: ["quality_time", "communication", "planning", "milestones"]
  },
  SAFETY: {
    id: "safety",
    name: "Safety & Preparedness",
    icon: "🛡️",
    priority: 5,
    subAreas: ["emergency_prep", "insurance", "security", "disaster_plan"]
  },
  GROWTH: {
    id: "growth",
    name: "Personal Growth",
    icon: "🌱",
    priority: 6,
    subAreas: ["learning", "hobbies", "goals", "habits", "mindset"]
  }
};

// Actions the engine can take
const ENGINE_ACTIONS = {
  ANALYZE: "analyze",         // Analyze data and situation
  RECOMMEND: "recommend",     // Make recommendations
  REMIND: "remind",          // Send reminders
  ALERT: "alert",            // Send urgent alerts
  TRACK: "track",            // Track progress
  PROMPT: "prompt",          // Ask user questions
  RESEARCH: "research",      // Research topics
  PLAN: "plan"               // Create plans
};

// Default timeouts for operations
const TIMEOUTS = {
  STEP: 30000,        // 30s per step
  CYCLE: 240000,      // 4 minutes max per cycle (leaves buffer before next 5min cycle)
  SERVICE_INIT: 10000, // 10s for service init
  HEALTH_CHECK: 5000   // 5s for health checks
};

class LifeManagementEngine extends EventEmitter {
  constructor() {
    super();
    this.state = this.loadState();
    this.services = {};
    this.isRunning = false;
    this.cycleInterval = null;
    this.lastCycleTime = null;

    // Initialize logger for structured logging
    this.logger = new StructuredLogger("LifeManagementEngine");

    // Initialize health monitor
    this.healthMonitor = getServiceHealthMonitor();

    // Track cycle execution for robustness
    this.cycleState = {
      inProgress: false,
      currentStep: null,
      stepStartTime: null,
      abortController: null
    };

    // Error recovery state
    this.errorRecovery = {
      consecutiveFailures: 0,
      lastFailureTime: null,
      backoffMs: 0,
      maxConsecutiveFailures: 5,
      baseBackoffMs: 5000
    };
  }

  /**
   * Load engine state
   */
  loadState() {
    try {
      if (fs.existsSync(ENGINE_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(ENGINE_STATE_FILE, "utf-8"));
      }
    } catch (err) {
      console.error("Failed to load life engine state:", err.message);
    }
    return {
      initialized: false,
      cycleCount: 0,
      lastCycle: null,
      areaScores: {},
      insights: [],
      pendingActions: [],
      completedActions: [],
      userContext: {}
    };
  }

  /**
   * Save engine state
   */
  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(ENGINE_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error("Failed to save life engine state:", err.message);
    }
  }

  /**
   * Initialize all services
   */
  async initialize() {
    try {
      // Initialize all services
      this.services.disasterMonitor = getDisasterMonitor();
      this.services.polymarket = getPolymarketService();
      this.services.conversationTracker = getConversationTracker();
      this.services.proactiveEngine = getProactiveEngine();
      this.services.messaging = getFirebaseMessaging();
      this.services.goalTracker = getGoalTracker();
      this.services.lifeScores = getLifeScores();

      // Initialize Firebase messaging
      await this.services.messaging.initialize();

      // Wire up event handlers
      this.wireEvents();

      this.state.initialized = true;
      this.saveState();

      this.emit("initialized");

      return { success: true };
    } catch (err) {
      console.error("Life engine init failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Wire up service events
   */
  wireEvents() {
    // Disaster alerts -> notify user
    this.services.disasterMonitor.on("alert-added", (alert) => {
      if (alert.severity === "high") {
        this.services.messaging.sendAlert(
          `${alert.type}: ${alert.message}\n\nActions: ${alert.actions?.slice(0, 2).join(", ")}`
        );
      }
      this.addInsight({
        area: LIFE_AREAS.SAFETY.id,
        type: "alert",
        title: alert.type,
        content: alert.message,
        actions: alert.actions
      });
    });

    // Polymarket updates -> analyze impact
    this.services.polymarket.on("markets-updated", (data) => {
      const highImpact = data.markets?.filter(m => m.impactScore > 60) || [];
      if (highImpact.length > 0) {
        this.addInsight({
          area: LIFE_AREAS.FINANCIAL.id,
          type: "prediction",
          title: "Market Predictions",
          content: `${highImpact.length} high-impact events to watch`,
          data: highImpact.slice(0, 3)
        });
      }
    });

    // Proactive engine -> handle questions and notifications
    this.services.proactiveEngine.on("notification", (notification) => {
      if (notification.type === "urgent") {
        this.services.messaging.sendAlert(notification.message);
      }
    });

    // Goal updates -> track and celebrate
    this.services.goalTracker.on("milestone-achieved", ({ goal, milestone }) => {
      this.services.messaging.sendSMS(
        `Milestone achieved! "${milestone.label}" for goal: ${goal.title}`,
        { type: "update", priority: "normal" }
      );
    });
  }

  /**
   * Start the engine cycle
   */
  start(intervalMs = 5 * 60 * 1000) { // Default: 5 minutes
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit("started");

    // Run initial cycle
    this.runCycle();

    // Schedule regular cycles
    this.cycleInterval = setInterval(() => {
      this.runCycle();
    }, intervalMs);
  }

  /**
   * Stop the engine
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = null;
    }

    this.emit("stopped");
  }

  /**
   * Execute a step with timeout and error handling
   */
  async executeStep(stepName, stepFn, timeoutMs = TIMEOUTS.STEP) {
    this.cycleState.currentStep = stepName;
    this.cycleState.stepStartTime = Date.now();

    this.logger.info(`Starting step: ${stepName}`);

    try {
      const result = await withTimeout(
        stepFn,
        timeoutMs,
        `Step: ${stepName}`
      );
      this.logger.info(`Completed step: ${stepName}`, {
        duration: Date.now() - this.cycleState.stepStartTime
      });
      return { success: true, result };
    } catch (error) {
      const isTimeout = error instanceof TimeoutError;
      this.logger.error(`Step failed: ${stepName}`, {
        error: error.message,
        isTimeout,
        duration: Date.now() - this.cycleState.stepStartTime
      });
      return { success: false, error, isTimeout };
    }
  }

  /**
   * Run one cycle of the engine with proper error handling and timeouts
   */
  async runCycle() {
    // Prevent concurrent cycles
    if (this.cycleState.inProgress) {
      this.logger.warn("Cycle already in progress, skipping");
      return;
    }

    // Check if we're in backoff mode
    if (this.errorRecovery.backoffMs > 0) {
      const timeSinceFailure = Date.now() - this.errorRecovery.lastFailureTime;
      if (timeSinceFailure < this.errorRecovery.backoffMs) {
        this.logger.info("In backoff mode, skipping cycle", {
          remainingMs: this.errorRecovery.backoffMs - timeSinceFailure
        });
        return;
      }
    }

    this.cycleState.inProgress = true;
    const cycleStartTime = Date.now();

    this.state.cycleCount++;
    this.state.lastCycle = new Date().toISOString();
    this.lastCycleTime = Date.now();

    const narrator = getActivityNarrator();
    const totalTasks = 7;
    let currentTask = 0;
    let cycleSuccess = true;
    let stepResults = {};

    this.emit("cycle-start", this.state.cycleCount);
    narrator.resetStats();
    narrator.setState("ANALYZING");
    narrator.setTaskProgress(0, totalTasks, "life management tasks");
    narrator.setWorkDescription(
      "Initializing life management cycle - gathering user context, analyzing life areas, " +
      "generating insights from data patterns, planning recommended actions, and coordinating all services"
    );

    try {
      // Wrap entire cycle in timeout
      await withTimeout(async () => {
        // 1. Gather context
        currentTask++;
        narrator.setTaskProgress(currentTask, totalTasks, "life management tasks");
        const gatherAction = narrator.action(
          "ANALYZE",
          "user-context",
          "Gathering comprehensive user context including profile data, active goals, life scores, disaster alerts, market predictions, and recent conversation history for analysis",
          ACTION_STATUS.WORKING
        );

        const contextResult = await this.executeStep("gather-context", () => this.gatherContext());
        if (!contextResult.success) {
          narrator.failAction(gatherAction);
          throw contextResult.error;
        }
        const context = contextResult.result;
        narrator.completeAction(gatherAction);
        narrator.addTokens(150);
        stepResults.context = context;

        // 2. Analyze each life area
        currentTask++;
        narrator.setTaskProgress(currentTask, totalTasks, "life management tasks");
        const analyzeAction = narrator.action(
          "ANALYZE",
          "life-areas",
          "Analyzing all six life areas (financial, health, career, family, safety, growth) to calculate scores and identify concerns, opportunities, and personalized recommendations",
          ACTION_STATUS.WORKING
        );
        narrator.setState("RESEARCHING");

        const analysisResult = await this.executeStep("analyze-life-areas", () => this.analyzeLifeAreas(context));
        if (!analysisResult.success) {
          narrator.failAction(analyzeAction);
          // Continue with empty analyses rather than failing entire cycle
          this.logger.warn("Analysis step failed, continuing with defaults");
          stepResults.analyses = {};
        } else {
          stepResults.analyses = analysisResult.result;
        }
        narrator.completeAction(analyzeAction);
        narrator.addTokens(350);
        const analyses = stepResults.analyses;

        // 3. Generate insights
        currentTask++;
        narrator.setTaskProgress(currentTask, totalTasks, "life management tasks");
        const insightAction = narrator.action(
          "THINK",
          "generate-insights",
          "Processing analysis data to generate actionable insights, identifying low scores requiring attention, flagging warnings, and discovering growth opportunities across all life areas",
          ACTION_STATUS.WORKING
        );
        narrator.setState("THINKING");

        const insightResult = await this.executeStep("generate-insights", () => this.generateInsights(analyses));
        const insights = insightResult.success ? insightResult.result : [];
        stepResults.insights = insights;
        narrator.completeAction(insightAction);

        // Show what insights were generated
        if (insights.length > 0) {
          const insightSummary = insights.slice(0, 3).map(i =>
            `${i.area}: ${i.title} (priority ${i.priority})`
          ).join("; ");
          narrator.observe(`Generated ${insights.length} insights: ${insightSummary}`);
        } else {
          narrator.observe("No new insights generated this cycle");
        }
        narrator.addTokens(200);

        // 4. Queue actions
        currentTask++;
        narrator.setTaskProgress(currentTask, totalTasks, "life management tasks");
        const planAction = narrator.action(
          "PLAN",
          "action-queue",
          "Converting insights into concrete action items, prioritizing by urgency and impact, scheduling prompts, alerts, and recommendations for the user based on their preferences",
          ACTION_STATUS.WORKING
        );
        narrator.setState("PLANNING");

        const planResult = await this.executeStep("plan-actions", () => this.planActions(insights));
        const actions = planResult.success ? planResult.result : [];
        stepResults.actions = actions;
        narrator.completeAction(planAction);

        // Show what actions were planned
        if (actions.length > 0) {
          const actionSummary = actions.slice(0, 4).map(a =>
            `${a.type.toUpperCase()}: ${a.action}`
          ).join("; ");
          narrator.observe(`Planned ${actions.length} actions: ${actionSummary}`);
        }
        narrator.addTokens(100);

        // 5. Execute high-priority actions
        currentTask++;
        narrator.setTaskProgress(currentTask, totalTasks, "life management tasks");
        const highPriority = actions.filter(a => a.priority >= 8);
        if (highPriority.length > 0) {
          const execAction = narrator.action(
            "BASH",
            "execute-actions",
            `Executing ${highPriority.length} high-priority actions including sending alerts, queuing questions for user, and creating recommendations based on urgent life area concerns`,
            ACTION_STATUS.WORKING
          );
          narrator.setState("WORKING");

          // Show what high-priority actions will be executed
          const highPrioritySummary = highPriority.map(a => `${a.type}: ${a.action}`).join("; ");
          narrator.observe(`Executing high-priority: ${highPrioritySummary}`);

          await this.executeStep("execute-actions", () => this.executeActions(highPriority));
          narrator.completeAction(execAction);
          narrator.addTokens(50 * highPriority.length);
        }

        // 6. Check for proactive prompts
        currentTask++;
        narrator.setTaskProgress(currentTask, totalTasks, "life management tasks");
        const promptAction = narrator.action(
          "SEARCH",
          "proactive-prompts",
          "Checking for pending proactive prompts to send to user via SMS or in-app notification, respecting quiet hours and daily message limits set in preferences",
          ACTION_STATUS.WORKING
        );
        narrator.setState("CONNECTING");
        await this.executeStep("check-prompts", () => this.checkProactivePrompts());
        narrator.completeAction(promptAction);

        // 7. Update life scores
        currentTask++;
        narrator.setTaskProgress(currentTask, totalTasks, "life management tasks");
        const updateAction = narrator.action(
          "UPDATE",
          "life-scores",
          "Updating all life area scores based on latest analysis, recording status changes, and persisting state for historical tracking and trend analysis",
          ACTION_STATUS.WORKING
        );
        this.updateLifeScores(analyses);
        narrator.completeAction(updateAction);

        // Save insights to file
        if (this.state.insights.length > 0) {
          const saveAction = narrator.action(
            "WRITE",
            "life_insights.md",
            "Saving all generated insights to markdown file for user review, organized by life area with recommendations, dates, and priority levels",
            ACTION_STATUS.WORKING
          );
          this.saveInsightsMarkdown();
          narrator.completeAction(saveAction);
          narrator.addDiff(
            "life_insights.md",
            1,
            [],
            [`## ${insights.length} new insights added`, `Last updated: ${new Date().toISOString()}`]
          );
        }

      }, TIMEOUTS.CYCLE, "Engine cycle");

      // Success - reset error recovery
      this.errorRecovery.consecutiveFailures = 0;
      this.errorRecovery.backoffMs = 0;

      this.saveState();
      narrator.clearTaskProgress();
      narrator.setState("OBSERVING");

      const cycleDuration = Date.now() - cycleStartTime;
      narrator.setWorkDescription(
        `Cycle ${this.state.cycleCount} complete in ${(cycleDuration / 1000).toFixed(1)}s - ` +
        `analyzed ${Object.keys(stepResults.analyses || {}).length} life areas, ` +
        `generated ${(stepResults.insights || []).length} insights, ` +
        `planned ${(stepResults.actions || []).length} actions`
      );

      // Record successful cycle
      narrator.recordCycleComplete(cycleDuration, true);
      this.emit("cycle-complete", this.state.cycleCount);

    } catch (err) {
      cycleSuccess = false;
      const cycleDuration = Date.now() - cycleStartTime;

      // Update error recovery state
      this.errorRecovery.consecutiveFailures++;
      this.errorRecovery.lastFailureTime = Date.now();
      this.errorRecovery.backoffMs = Math.min(
        this.errorRecovery.baseBackoffMs * Math.pow(2, this.errorRecovery.consecutiveFailures - 1),
        60000 // Max 1 minute backoff
      );

      this.logger.error("Engine cycle failed", {
        error: err.message,
        consecutiveFailures: this.errorRecovery.consecutiveFailures,
        backoffMs: this.errorRecovery.backoffMs,
        cycleDuration
      });

      narrator.setState("OBSERVING");
      narrator.setWorkDescription(
        `Cycle ${this.state.cycleCount} failed: ${err.message}. ` +
        `Consecutive failures: ${this.errorRecovery.consecutiveFailures}. ` +
        `Next attempt in ${Math.round(this.errorRecovery.backoffMs / 1000)}s`
      );

      // Record failed cycle
      narrator.recordCycleComplete(cycleDuration, false, err);
      this.emit("cycle-error", err.message);

      // If too many consecutive failures, emit critical alert
      if (this.errorRecovery.consecutiveFailures >= this.errorRecovery.maxConsecutiveFailures) {
        this.emit("critical-failure", {
          message: "Engine has failed too many times consecutively",
          consecutiveFailures: this.errorRecovery.consecutiveFailures,
          lastError: err.message
        });

        // Try to send alert if messaging is available
        try {
          if (this.services.messaging?.getStatus()?.phoneVerified) {
            await this.services.messaging.sendAlert(
              `Life Engine Critical: ${this.errorRecovery.consecutiveFailures} consecutive failures. Last error: ${err.message}`
            );
          }
        } catch (alertErr) {
          this.logger.error("Failed to send critical failure alert", { error: alertErr.message });
        }
      }

    } finally {
      this.cycleState.inProgress = false;
      this.cycleState.currentStep = null;
    }
  }

  /**
   * Gather context from all sources
   */
  async gatherContext() {
    return {
      userProfile: this.services.conversationTracker.userProfile,
      goals: this.services.goalTracker.getDisplayData(),
      lifeScores: this.services.lifeScores.getDisplayData(),
      disasterAlerts: this.services.disasterMonitor.getDisplayData(),
      polymarket: this.services.polymarket.getDisplayData(),
      recentConversations: this.services.conversationTracker.getRecent(10),
      pendingQuestions: this.services.proactiveEngine.getDisplayData().pendingQuestions
    };
  }

  /**
   * Analyze each life area
   */
  async analyzeLifeAreas(context) {
    const analyses = {};

    for (const [key, area] of Object.entries(LIFE_AREAS)) {
      analyses[area.id] = {
        area: area.name,
        score: this.calculateAreaScore(area.id, context),
        status: "stable",
        concerns: [],
        opportunities: [],
        recommendations: []
      };
    }

    // Financial analysis
    if (context.polymarket?.topMarkets) {
      const financialRisks = context.polymarket.topMarkets.filter(m =>
        m.relevance === "financial" && m.probability > 0.6
      );
      if (financialRisks.length > 0) {
        analyses.financial.concerns.push(
          `${financialRisks.length} financial events with >60% probability`
        );
      }
    }

    // Safety analysis
    if (context.disasterAlerts?.activeAlerts?.length > 0) {
      analyses.safety.status = "attention_needed";
      analyses.safety.concerns = context.disasterAlerts.activeAlerts.map(a => a.type);
    }

    // Health analysis (from Oura if available)
    if (context.lifeScores?.categories?.health) {
      const healthScore = context.lifeScores.categories.health;
      if (healthScore < 50) {
        analyses.health.status = "needs_improvement";
        analyses.health.recommendations.push("Focus on sleep and exercise");
      }
    }

    return analyses;
  }

  /**
   * Calculate score for a life area
   */
  calculateAreaScore(areaId, context) {
    // Base score of 50
    let score = 50;

    // Adjust based on various factors
    if (context.lifeScores?.categories?.[areaId]) {
      score = context.lifeScores.categories[areaId];
    }

    // Goals in this area
    const areaGoals = context.goals?.filter(g => g.category === areaId) || [];
    if (areaGoals.length > 0) {
      const avgProgress = areaGoals.reduce((sum, g) => sum + g.progress, 0) / areaGoals.length;
      score = (score + avgProgress * 100) / 2;
    }

    return Math.round(score);
  }

  /**
   * Generate insights from analyses
   */
  generateInsights(analyses) {
    const insights = [];

    for (const [areaId, analysis] of Object.entries(analyses)) {
      // Low scores
      if (analysis.score < 40) {
        insights.push({
          area: areaId,
          type: "concern",
          priority: 8,
          title: `${analysis.area} needs attention`,
          content: `Score: ${analysis.score}/100. Consider focusing here.`,
          recommendations: analysis.recommendations
        });
      }

      // Concerns
      for (const concern of analysis.concerns) {
        insights.push({
          area: areaId,
          type: "warning",
          priority: 7,
          title: concern,
          content: `Issue identified in ${analysis.area}`
        });
      }

      // Opportunities
      for (const opportunity of analysis.opportunities) {
        insights.push({
          area: areaId,
          type: "opportunity",
          priority: 5,
          title: opportunity,
          content: `Opportunity in ${analysis.area}`
        });
      }
    }

    // Sort by priority
    insights.sort((a, b) => b.priority - a.priority);

    return insights;
  }

  /**
   * Plan actions based on insights
   */
  planActions(insights) {
    const actions = [];

    for (const insight of insights) {
      if (insight.type === "concern" && insight.priority >= 7) {
        actions.push({
          type: ENGINE_ACTIONS.PROMPT,
          priority: insight.priority,
          insight: insight,
          action: `Ask user about ${insight.area}`
        });
      }

      if (insight.type === "warning") {
        actions.push({
          type: ENGINE_ACTIONS.ALERT,
          priority: insight.priority,
          insight: insight,
          action: `Alert user: ${insight.title}`
        });
      }

      if (insight.recommendations?.length > 0) {
        actions.push({
          type: ENGINE_ACTIONS.RECOMMEND,
          priority: insight.priority - 1,
          insight: insight,
          action: insight.recommendations[0]
        });
      }
    }

    return actions;
  }

  /**
   * Execute planned actions
   */
  async executeActions(actions) {
    for (const action of actions) {
      try {
        switch (action.type) {
          case ENGINE_ACTIONS.PROMPT:
            this.services.proactiveEngine.queueQuestion(
              `How are things going with ${action.insight.area}?`,
              action.insight.area,
              action.priority
            );
            break;

          case ENGINE_ACTIONS.ALERT:
            if (this.services.messaging.getStatus().phoneVerified) {
              await this.services.messaging.sendAlert(action.insight.title);
            }
            break;

          case ENGINE_ACTIONS.RECOMMEND:
            this.addInsight({
              ...action.insight,
              recommendation: action.action
            });
            break;
        }

        this.state.completedActions.unshift({
          ...action,
          completedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error(`Action failed: ${action.type}`, err.message);
      }
    }

    // Keep only last 100 completed actions
    this.state.completedActions = this.state.completedActions.slice(0, 100);
  }

  /**
   * Check for proactive prompts
   */
  async checkProactivePrompts() {
    const prompt = this.services.proactiveEngine.getCurrentPrompt();
    if (!prompt) return;

    // If messaging is available and user prefers SMS, send there
    if (prompt.type === "question" && this.services.messaging.getStatus().phoneVerified) {
      const canSend = this.services.messaging.canSendMessage();
      if (canSend.canSend) {
        await this.services.messaging.askQuestion(prompt.question, prompt.id);
        this.services.proactiveEngine.markAsked(prompt.id);
      }
    }
  }

  /**
   * Update life scores
   */
  updateLifeScores(analyses) {
    for (const [areaId, analysis] of Object.entries(analyses)) {
      this.state.areaScores[areaId] = {
        score: analysis.score,
        status: analysis.status,
        updatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Add an insight
   */
  addInsight(insight) {
    const fullInsight = {
      id: `insight_${Date.now()}`,
      ...insight,
      createdAt: new Date().toISOString()
    };

    this.state.insights.unshift(fullInsight);
    this.state.insights = this.state.insights.slice(0, 100);
    this.saveState();
    this.saveInsightsMarkdown();

    this.emit("insight-added", fullInsight);

    return fullInsight;
  }

  /**
   * Save insights to markdown
   */
  saveInsightsMarkdown() {
    const lines = [
      "# Life Insights",
      "",
      `**Last Updated:** ${new Date().toISOString()}`,
      `**Total Insights:** ${this.state.insights.length}`,
      "",
      "---",
      ""
    ];

    // Group by area
    const byArea = {};
    for (const insight of this.state.insights.slice(0, 50)) {
      if (!byArea[insight.area]) {
        byArea[insight.area] = [];
      }
      byArea[insight.area].push(insight);
    }

    for (const [area, insights] of Object.entries(byArea)) {
      const areaInfo = Object.values(LIFE_AREAS).find(a => a.id === area);
      lines.push(`## ${areaInfo?.icon || "📌"} ${areaInfo?.name || area}`);
      lines.push("");

      for (const insight of insights.slice(0, 10)) {
        const date = new Date(insight.createdAt).toLocaleDateString();
        lines.push(`### ${insight.title}`);
        lines.push(`*${date}* | Type: ${insight.type} | Priority: ${insight.priority}/10`);
        lines.push("");
        lines.push(insight.content);
        if (insight.recommendations?.length > 0) {
          lines.push("");
          lines.push("**Recommendations:**");
          for (const rec of insight.recommendations) {
            lines.push(`- ${rec}`);
          }
        }
        lines.push("");
      }
    }

    try {
      fs.writeFileSync(INSIGHTS_FILE, lines.join("\n"));
    } catch (err) {
      console.error("Failed to save insights markdown:", err.message);
    }
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      running: this.isRunning,
      cycleCount: this.state.cycleCount,
      lastCycle: this.state.lastCycle,
      areaScores: this.state.areaScores,
      recentInsights: this.state.insights.slice(0, 5),
      pendingActions: this.state.pendingActions.length,
      completedActions: this.state.completedActions.length,
      // New fields for enhanced display
      cycleState: {
        inProgress: this.cycleState.inProgress,
        currentStep: this.cycleState.currentStep,
        stepDuration: this.cycleState.stepStartTime
          ? Date.now() - this.cycleState.stepStartTime
          : null
      },
      errorRecovery: {
        consecutiveFailures: this.errorRecovery.consecutiveFailures,
        backoffMs: this.errorRecovery.backoffMs,
        lastFailureTime: this.errorRecovery.lastFailureTime
      },
      health: this.healthMonitor.getSystemHealth()
    };
  }

  /**
   * Get detailed display data for expanded view (up to 20 rows)
   */
  getDetailedDisplayData() {
    const basic = this.getDisplayData();
    return {
      ...basic,
      // Show more insights in detailed view
      recentInsights: this.state.insights.slice(0, 10),
      // Show recent completed actions
      recentCompletedActions: this.state.completedActions.slice(0, 10).map(a => ({
        type: a.type,
        action: a.action,
        completedAt: a.completedAt,
        insight: a.insight?.title
      })),
      // Show all life area scores with details
      lifeAreas: Object.entries(LIFE_AREAS).map(([key, area]) => ({
        id: area.id,
        name: area.name,
        icon: area.icon,
        score: this.state.areaScores[area.id]?.score || 50,
        status: this.state.areaScores[area.id]?.status || "unknown",
        lastUpdated: this.state.areaScores[area.id]?.updatedAt
      })),
      // Show recent logs
      recentLogs: this.logger.getRecentLogs(10)
    };
  }

  /**
   * Force stop the current cycle (for emergency situations)
   */
  abortCycle() {
    if (this.cycleState.inProgress) {
      this.logger.warn("Aborting current cycle");
      this.cycleState.inProgress = false;
      this.cycleState.currentStep = null;
      this.emit("cycle-aborted");
    }
  }

  /**
   * Reset error recovery state (manual recovery)
   */
  resetErrorRecovery() {
    this.errorRecovery.consecutiveFailures = 0;
    this.errorRecovery.backoffMs = 0;
    this.errorRecovery.lastFailureTime = null;
    this.logger.info("Error recovery state reset");
  }
}

// Singleton
let instance = null;

export const getLifeManagementEngine = () => {
  if (!instance) {
    instance = new LifeManagementEngine();
  }
  return instance;
};

export default LifeManagementEngine;
