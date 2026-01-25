import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { scrapeLinkedInProfile, loadLinkedInProfile } from "./linkedin-scraper.js";

/**
 * Data Freshness Checker & Auto-Scheduler Service
 *
 * Monitors ALL data sources and auto-updates when stale.
 * Runs multiple times per day to ensure fresh data.
 * Generates suggested actions based on data analysis.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const FRESHNESS_METADATA_PATH = path.join(DATA_DIR, "freshness-metadata.json");
const SUGGESTED_ACTIONS_PATH = path.join(DATA_DIR, "suggested-actions.json");

// Default freshness thresholds (in milliseconds)
const DEFAULT_THRESHOLDS = {
  "linkedin-profile": 7 * 24 * 60 * 60 * 1000,  // 7 days
  "personal-capital": 6 * 60 * 60 * 1000,       // 6 hours
  "oura-health": 12 * 60 * 60 * 1000,           // 12 hours
  "alpaca-portfolio": 15 * 60 * 1000,           // 15 minutes (market hours)
  "trading-history": 60 * 60 * 1000,            // 1 hour
  "life-scores": 4 * 60 * 60 * 1000,            // 4 hours
  "work-log": 60 * 60 * 1000,                   // 1 hour
  "yahoo-quotes": 5 * 60 * 1000,                // 5 minutes
  "goals": 24 * 60 * 60 * 1000,                 // 24 hours
  "user-context": 24 * 60 * 60 * 1000,          // 24 hours
};

// Data source configurations
const DATA_SOURCES = {
  "linkedin-profile": {
    dataFile: "linkedin-profile.json",
    timestampField: "capturedAt",
    updateFn: "updateLinkedInProfile",
    category: "career",
    priority: 2,
    autoUpdate: false,
  },
  "personal-capital": {
    dataFile: "personal-capital.json",
    timestampField: "lastUpdated",
    updateFn: "updatePersonalCapital",
    category: "finance",
    priority: 1,
  },
  "oura-health": {
    dataFile: "oura-cache.json",
    timestampField: "fetchedAt",
    updateFn: "updateOuraHealth",
    category: "health",
    priority: 1,
  },
  "alpaca-portfolio": {
    dataFile: "alpaca-portfolio.json",
    timestampField: "lastUpdated",
    updateFn: null, // Updated by app.js polling
    category: "finance",
    priority: 1,
  },
  "trading-history": {
    dataFile: "trading-history.json",
    timestampField: "lastUpdated",
    updateFn: null,
    category: "finance",
    priority: 3,
  },
  "life-scores": {
    dataFile: "life-scores.json",
    timestampField: "lastUpdated",
    updateFn: "updateLifeScores",
    category: "growth",
    priority: 2,
  },
  "work-log": {
    dataFile: "work-log.json",
    timestampField: "lastUpdated",
    updateFn: null,
    category: "career",
    priority: 3,
  },
  "goals": {
    dataFile: "goals.json",
    timestampField: "lastUpdated",
    updateFn: null,
    category: "growth",
    priority: 2,
  },
  "user-context": {
    dataFile: "user-context.json",
    timestampField: "lastUpdated",
    updateFn: null,
    category: "general",
    priority: 3,
  },
};

// Action templates based on data patterns
const ACTION_TEMPLATES = {
  // Finance actions
  lowNetWorth: {
    type: "finance",
    title: "Review budget and spending",
    description: "Your net worth could use attention. Consider reviewing monthly expenses.",
    priority: 1,
  },
  portfolioDown: {
    type: "finance",
    title: "Review portfolio allocation",
    description: "Portfolio has declined. Consider rebalancing or reviewing strategy.",
    priority: 2,
  },
  highDebt: {
    type: "finance",
    title: "Create debt payoff plan",
    description: "Significant debt detected. Focus on high-interest debt first.",
    priority: 1,
  },
  // Health actions
  poorSleep: {
    type: "health",
    title: "Improve sleep routine",
    description: "Sleep scores are below optimal. Consider adjusting bedtime.",
    priority: 1,
  },
  lowActivity: {
    type: "health",
    title: "Increase daily activity",
    description: "Activity levels are low. Aim for more movement today.",
    priority: 2,
  },
  // Career actions
  staleProfile: {
    type: "career",
    title: "Update LinkedIn profile",
    description: "LinkedIn profile is outdated. Add recent accomplishments.",
    priority: 2,
  },
  networkingOpportunity: {
    type: "career",
    title: "Reach out to connections",
    description: "Good time to connect with industry contacts.",
    priority: 3,
  },
  // Growth actions
  goalBehind: {
    type: "growth",
    title: "Focus on stalled goal",
    description: "A goal needs attention. Break it into smaller steps.",
    priority: 2,
  },
  learningOpportunity: {
    type: "growth",
    title: "Learn something new",
    description: "Consistent learning drives growth. Pick a skill to develop.",
    priority: 3,
  },
};

class DataFreshnessChecker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
    this.checkIntervalMs = options.checkIntervalMs || 4 * 60 * 60 * 1000; // Default: 4 hours (6x per day)
    this.autoUpdate = options.autoUpdate !== false; // Default: true
    this.updating = new Set(); // Track sources currently updating
    this.intervalId = null;
    this.metadata = this.loadMetadata();
  }

  /**
   * Load freshness metadata from disk
   */
  loadMetadata() {
    try {
      if (fs.existsSync(FRESHNESS_METADATA_PATH)) {
        return JSON.parse(fs.readFileSync(FRESHNESS_METADATA_PATH, "utf-8"));
      }
    } catch (err) {
      console.error("[Freshness] Error loading metadata:", err.message);
    }
    return { lastChecks: {}, updateHistory: [] };
  }

  /**
   * Save freshness metadata to disk
   */
  saveMetadata() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(FRESHNESS_METADATA_PATH, JSON.stringify(this.metadata, null, 2));
    } catch (err) {
      console.error("[Freshness] Error saving metadata:", err.message);
    }
  }

  /**
   * Get the last updated timestamp for a data source
   */
  getLastUpdated(source) {
    const config = DATA_SOURCES[source];
    if (!config) return null;

    const filePath = path.join(DATA_DIR, config.dataFile);

    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const timestamp = data[config.timestampField];

      if (timestamp) {
        return new Date(timestamp).getTime();
      }
    } catch (err) {
      console.error(`[Freshness] Error reading ${source}:`, err.message);
    }

    return null;
  }

  /**
   * Check if a data source is stale
   */
  isStale(source) {
    const threshold = this.thresholds[source];
    if (!threshold) return false;

    const lastUpdated = this.getLastUpdated(source);
    if (!lastUpdated) return true; // No data = stale

    const age = Date.now() - lastUpdated;
    return age > threshold;
  }

  /**
   * Get freshness info for a data source
   */
  checkDataFreshness(source) {
    const threshold = this.thresholds[source];
    const lastUpdated = this.getLastUpdated(source);
    const now = Date.now();

    const age = lastUpdated ? now - lastUpdated : null;
    const stale = this.isStale(source);
    const updating = this.updating.has(source);

    return {
      source,
      stale,
      updating,
      lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : null,
      ageMs: age,
      ageHuman: age ? this.formatAge(age) : "never",
      threshold,
      thresholdHuman: this.formatAge(threshold),
      nextUpdate: stale ? "now" : this.formatAge(threshold - age),
    };
  }

  /**
   * Format age in human-readable form
   */
  formatAge(ms) {
    if (ms < 60 * 1000) return `${Math.round(ms / 1000)}s`;
    if (ms < 60 * 60 * 1000) return `${Math.round(ms / 60000)}m`;
    if (ms < 24 * 60 * 60 * 1000) return `${Math.round(ms / 3600000)}h`;
    return `${Math.round(ms / 86400000)}d`;
  }

  /**
   * Get all stale data sources
   */
  getStaleDataSources() {
    const stale = [];
    for (const source of Object.keys(DATA_SOURCES)) {
      const info = this.checkDataFreshness(source);
      if (info.stale && !info.updating) {
        stale.push(info);
      }
    }
    return stale;
  }

  /**
   * Get health report for all data sources
   */
  getHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      sources: {},
      staleCount: 0,
      updatingCount: 0,
      healthyCount: 0,
    };

    for (const source of Object.keys(DATA_SOURCES)) {
      const info = this.checkDataFreshness(source);
      report.sources[source] = info;

      if (info.updating) report.updatingCount++;
      else if (info.stale) report.staleCount++;
      else report.healthyCount++;
    }

    report.overallHealth = report.staleCount === 0 ? "healthy" :
                           report.staleCount <= 2 ? "warning" : "critical";

    return report;
  }

  /**
   * Update a specific data source
   */
  async updateDataSource(source) {
    if (this.updating.has(source)) {
      console.log(`[Freshness] ${source} is already updating, skipping...`);
      return { success: false, reason: "already_updating" };
    }

    const config = DATA_SOURCES[source];
    if (!config) {
      return { success: false, reason: "unknown_source" };
    }

    this.updating.add(source);
    this.emit("updateStart", { source });
    console.log(`[Freshness] Starting update for ${source}...`);

    try {
      let result;

      switch (source) {
        case "linkedin-profile":
          result = await this.updateLinkedInProfile();
          break;
        default:
          result = { success: false, reason: "no_update_handler" };
      }

      // Record update in metadata
      this.metadata.updateHistory.push({
        source,
        timestamp: new Date().toISOString(),
        success: result.success,
        reason: result.reason || null,
      });

      // Keep only last 100 updates in history
      if (this.metadata.updateHistory.length > 100) {
        this.metadata.updateHistory = this.metadata.updateHistory.slice(-100);
      }

      this.saveMetadata();
      this.emit("updateComplete", { source, result });

      return result;

    } catch (err) {
      console.error(`[Freshness] Error updating ${source}:`, err.message);
      this.emit("updateError", { source, error: err.message });
      return { success: false, error: err.message };
    } finally {
      this.updating.delete(source);
    }
  }

  /**
   * Update LinkedIn profile via scraper
   */
  async updateLinkedInProfile() {
    console.log("[Freshness] Updating LinkedIn profile...");

    try {
      // Use headless: false so user can log in if needed
      const result = await scrapeLinkedInProfile({ headless: false });

      if (result.success) {
        console.log("[Freshness] LinkedIn profile updated successfully");
        return { success: true, profileUrl: result.profileUrl };
      } else {
        console.log("[Freshness] LinkedIn update failed:", result.error);
        return { success: false, error: result.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Auto-update stale data if enabled
   */
  async autoUpdateIfStale(source) {
    if (!this.autoUpdate) {
      return { success: false, reason: "auto_update_disabled" };
    }

    const config = DATA_SOURCES[source];
    if (config?.autoUpdate === false) {
      return { success: false, reason: "auto_update_disabled" };
    }

    if (!this.isStale(source)) {
      return { success: false, reason: "not_stale" };
    }

    return await this.updateDataSource(source);
  }

  /**
   * Run full freshness check and update stale sources
   */
  async runCheck() {
    console.log("[Freshness] Running freshness check...");

    this.metadata.lastChecks.global = new Date().toISOString();
    this.saveMetadata();

    const stale = this.getStaleDataSources();

    if (stale.length === 0) {
      console.log("[Freshness] All data sources are fresh");
      return { updated: [], skipped: [] };
    }

    console.log(`[Freshness] Found ${stale.length} stale source(s): ${stale.map(s => s.source).join(", ")}`);

    const results = { updated: [], skipped: [] };

    for (const source of stale) {
      const config = DATA_SOURCES[source.source];

      // Only auto-update sources that have an update function
      if (config && config.updateFn && config.autoUpdate !== false) {
        const result = await this.updateDataSource(source.source);
        if (result.success) {
          results.updated.push(source.source);
        } else {
          results.skipped.push({ source: source.source, reason: result.reason || result.error });
        }
      } else {
        results.skipped.push({ source: source.source, reason: config?.autoUpdate === false ? "auto_update_disabled" : "no_auto_update" });
      }
    }

    console.log(`[Freshness] Check complete. Updated: ${results.updated.length}, Skipped: ${results.skipped.length}`);
    return results;
  }

  /**
   * Start the periodic freshness checker
   */
  start() {
    if (this.intervalId) {
      console.log("[Freshness] Already running");
      return;
    }

    console.log(`[Freshness] Starting checker (interval: ${this.formatAge(this.checkIntervalMs)})`);

    // Run immediately on start
    this.runCheck().catch(err => {
      console.error("[Freshness] Initial check failed:", err.message);
    });

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCheck().catch(err => {
        console.error("[Freshness] Periodic check failed:", err.message);
      });
    }, this.checkIntervalMs);

    this.emit("started");
  }

  /**
   * Stop the periodic freshness checker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Freshness] Stopped checker");
      this.emit("stopped");
    }
  }

  /**
   * Check if checker is running
   */
  isRunning() {
    return this.intervalId !== null;
  }

  /**
   * Analyze all data and generate suggested actions
   */
  async generateSuggestedActions() {
    console.log("[Freshness] Generating suggested actions...");
    const actions = [];
    const now = new Date();

    // Load all data files for analysis
    const dataFiles = {};
    for (const [source, config] of Object.entries(DATA_SOURCES)) {
      try {
        const filePath = path.join(DATA_DIR, config.dataFile);
        if (fs.existsSync(filePath)) {
          dataFiles[source] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
      } catch (err) {
        // Ignore read errors
      }
    }

    // Analyze LinkedIn data
    if (dataFiles["linkedin-profile"]) {
      const linkedin = dataFiles["linkedin-profile"];
      const capturedAt = linkedin.capturedAt ? new Date(linkedin.capturedAt) : null;
      const daysSinceFetch = capturedAt ? (now - capturedAt) / (1000 * 60 * 60 * 24) : 999;

      if (daysSinceFetch > 30) {
        actions.push({
          ...ACTION_TEMPLATES.staleProfile,
          id: `linkedin-update-${Date.now()}`,
          source: "linkedin-profile",
          createdAt: now.toISOString(),
          data: { daysSinceFetch: Math.round(daysSinceFetch) },
        });
      }
    } else {
      // No LinkedIn data at all
      actions.push({
        type: "career",
        title: "Connect LinkedIn profile",
        description: "Run /linkedin to import your career profile.",
        priority: 1,
        id: `linkedin-connect-${Date.now()}`,
        source: "linkedin-profile",
        createdAt: now.toISOString(),
      });
    }

    // Analyze Personal Capital data
    if (dataFiles["personal-capital"]) {
      const pc = dataFiles["personal-capital"];
      const netWorth = pc.netWorth?.total || 0;
      const accountsByType = pc.accountsByType || {};

      // Check for high debt
      const debtTypes = ["CREDIT_CARD", "LOAN", "MORTGAGE"];
      let totalDebt = 0;
      for (const type of debtTypes) {
        totalDebt += accountsByType[type]?.balance || 0;
      }

      if (totalDebt > 10000) {
        actions.push({
          ...ACTION_TEMPLATES.highDebt,
          id: `debt-review-${Date.now()}`,
          source: "personal-capital",
          createdAt: now.toISOString(),
          data: { totalDebt },
        });
      }
    } else {
      actions.push({
        type: "finance",
        title: "Connect Personal Capital",
        description: "Run /finances to track your net worth and investments.",
        priority: 1,
        id: `pc-connect-${Date.now()}`,
        source: "personal-capital",
        createdAt: now.toISOString(),
      });
    }

    // Analyze Oura health data
    if (dataFiles["oura-health"]) {
      const oura = dataFiles["oura-health"];
      const sleepScore = oura.sleepScore || oura.sleep?.score || 0;
      const activityScore = oura.activityScore || oura.activity?.score || 0;

      if (sleepScore < 70 && sleepScore > 0) {
        actions.push({
          ...ACTION_TEMPLATES.poorSleep,
          id: `sleep-improve-${Date.now()}`,
          source: "oura-health",
          createdAt: now.toISOString(),
          data: { sleepScore },
        });
      }

      if (activityScore < 60 && activityScore > 0) {
        actions.push({
          ...ACTION_TEMPLATES.lowActivity,
          id: `activity-improve-${Date.now()}`,
          source: "oura-health",
          createdAt: now.toISOString(),
          data: { activityScore },
        });
      }
    } else {
      actions.push({
        type: "health",
        title: "Connect Oura ring",
        description: "Run /oura to track your sleep and activity.",
        priority: 2,
        id: `oura-connect-${Date.now()}`,
        source: "oura-health",
        createdAt: now.toISOString(),
      });
    }

    // Analyze goals data
    if (dataFiles["goals"]) {
      const goals = Array.isArray(dataFiles["goals"]) ? dataFiles["goals"] : dataFiles["goals"].goals || [];
      for (const goal of goals) {
        if (goal.progress < 0.3 && goal.status !== "completed") {
          actions.push({
            ...ACTION_TEMPLATES.goalBehind,
            id: `goal-${goal.id || goal.category}-${Date.now()}`,
            source: "goals",
            title: `Focus on: ${goal.title || goal.category}`,
            description: `Goal "${goal.title || goal.category}" is at ${Math.round((goal.progress || 0) * 100)}%. Time to make progress.`,
            createdAt: now.toISOString(),
            data: { goalId: goal.id, progress: goal.progress },
          });
        }
      }
    }

    // Always add learning opportunity
    const dayOfWeek = now.getDay();
    if (dayOfWeek === 1) { // Monday - good for planning
      actions.push({
        ...ACTION_TEMPLATES.learningOpportunity,
        id: `learning-${Date.now()}`,
        source: "system",
        createdAt: now.toISOString(),
      });
    }

    // Sort by priority
    actions.sort((a, b) => (a.priority || 5) - (b.priority || 5));

    // Save suggested actions
    this.saveSuggestedActions(actions);
    this.emit("actionsGenerated", actions);

    console.log(`[Freshness] Generated ${actions.length} suggested action(s)`);
    return actions;
  }

  /**
   * Save suggested actions to disk
   */
  saveSuggestedActions(actions) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        actions,
        generatedAt: new Date().toISOString(),
        count: actions.length,
      };
      fs.writeFileSync(SUGGESTED_ACTIONS_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("[Freshness] Error saving suggested actions:", err.message);
    }
  }

  /**
   * Load suggested actions from disk
   */
  loadSuggestedActions() {
    try {
      if (fs.existsSync(SUGGESTED_ACTIONS_PATH)) {
        const data = JSON.parse(fs.readFileSync(SUGGESTED_ACTIONS_PATH, "utf-8"));
        return data.actions || [];
      }
    } catch (err) {
      console.error("[Freshness] Error loading suggested actions:", err.message);
    }
    return [];
  }

  /**
   * Enhanced run check that also generates actions
   */
  async runFullCheck() {
    // First run the regular freshness check
    const checkResult = await this.runCheck();

    // Then generate suggested actions
    const actions = await this.generateSuggestedActions();

    return {
      ...checkResult,
      suggestedActions: actions,
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create the DataFreshnessChecker instance
 */
export const getDataFreshnessChecker = (options = {}) => {
  if (!instance) {
    instance = new DataFreshnessChecker(options);
  }
  return instance;
};

/**
 * Quick check if LinkedIn data is stale (older than 7 days)
 */
export const isLinkedInStale = () => {
  const checker = getDataFreshnessChecker();
  return checker.isStale("linkedin-profile");
};

/**
 * Trigger LinkedIn update if stale
 */
export const updateLinkedInIfStale = async () => {
  const checker = getDataFreshnessChecker();
  return await checker.autoUpdateIfStale("linkedin-profile");
};

/**
 * Get freshness report for all sources
 */
export const getFreshnessReport = () => {
  const checker = getDataFreshnessChecker();
  return checker.getHealthReport();
};

/**
 * Generate and return suggested actions based on all data
 */
export const generateSuggestedActions = async () => {
  const checker = getDataFreshnessChecker();
  return await checker.generateSuggestedActions();
};

/**
 * Get cached suggested actions
 */
export const getSuggestedActions = () => {
  const checker = getDataFreshnessChecker();
  return checker.loadSuggestedActions();
};

/**
 * Run full check with action generation
 */
export const runFullDataCheck = async () => {
  const checker = getDataFreshnessChecker();
  return await checker.runFullCheck();
};

/**
 * Start the automatic data scheduler
 */
export const startDataScheduler = () => {
  const checker = getDataFreshnessChecker();
  checker.start();
  return checker;
};

/**
 * Stop the automatic data scheduler
 */
export const stopDataScheduler = () => {
  const checker = getDataFreshnessChecker();
  checker.stop();
};

export default DataFreshnessChecker;
