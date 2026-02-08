/**
 * Life Engine - Core System
 *
 * On boot:
 * 1. Gather all user data sources (LinkedIn, health, email, calendar, stocks, etc.)
 * 2. Track data coverage percentage
 * 3. Once 80%+ coverage, begin life optimization
 *
 * Data Sources:
 * - Identity: LinkedIn profile, name, location, career history
 * - Health: Oura ring, sleep, activity, readiness
 * - Financial: Alpaca portfolio, bank accounts, net worth
 * - Calendar: Upcoming events, commitments, time allocation
 * - Email: Important communications, pending actions
 * - Goals: User's stated goals and progress
 * - Disaster Planning: Emergency preparedness status
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const ENGINE_STATE_PATH = path.join(DATA_DIR, "life_engine_state.json");

/**
 * Data source definitions with weight (importance for life optimization)
 */
export const DATA_SOURCES = {
  // Identity & Career (25% weight)
  linkedin: {
    id: "linkedin",
    name: "LinkedIn Profile",
    category: "identity",
    weight: 15,
    required: true,
    fields: ["name", "headline", "location", "experience", "education", "skills"]
  },

  // Health (20% weight)
  oura: {
    id: "oura",
    name: "Oura Health",
    category: "health",
    weight: 15,
    required: false,
    fields: ["sleep", "readiness", "activity", "heartRate", "hrv"]
  },

  // Financial (25% weight)
  alpaca: {
    id: "alpaca",
    name: "Alpaca Trading",
    category: "financial",
    weight: 15,
    required: false,
    fields: ["portfolio", "positions", "equity", "dayChange"]
  },
  bankAccounts: {
    id: "bankAccounts",
    name: "Bank Accounts",
    category: "financial",
    weight: 10,
    required: false,
    fields: ["checking", "savings", "totalBalance"]
  },

  // Calendar & Time (10% weight)
  calendar: {
    id: "calendar",
    name: "Calendar",
    category: "time",
    weight: 10,
    required: false,
    fields: ["events", "commitments", "freeTime"]
  },

  // Communication (10% weight)
  email: {
    id: "email",
    name: "Email",
    category: "communication",
    weight: 10,
    required: false,
    fields: ["unread", "important", "actionRequired"]
  },

  // Goals (15% weight)
  goals: {
    id: "goals",
    name: "Life Goals",
    category: "goals",
    weight: 15,
    required: true,
    fields: ["activeGoals", "progress", "milestones"]
  },

  // Safety (5% weight)
  disasterPlanning: {
    id: "disasterPlanning",
    name: "Disaster Preparedness",
    category: "safety",
    weight: 5,
    required: false,
    fields: ["emergencyContacts", "insurances", "documents", "supplies"]
  },

  // AI Model (5% weight)
  aiModel: {
    id: "aiModel",
    name: "AI Model",
    category: "system",
    weight: 5,
    required: true,
    fields: ["connected", "provider", "tokensAvailable"]
  }
};

// Coverage threshold to begin optimization
const OPTIMIZATION_THRESHOLD = 80;

/**
 * Life Engine Class
 */
class LifeEngine extends EventEmitter {
  constructor() {
    super();
    this.state = this.loadState();
    this.dataStatus = {};
    this.isRunning = false;
    this.optimizationActive = false;
  }

  loadState() {
    try {
      if (fs.existsSync(ENGINE_STATE_PATH)) {
        return JSON.parse(fs.readFileSync(ENGINE_STATE_PATH, "utf-8"));
      }
    } catch (e) {}

    return {
      initialized: false,
      firstBoot: new Date().toISOString(),
      lastBoot: null,
      coverage: 0,
      dataSources: {},
      optimizationStarted: false,
      userProfile: null,
      insights: [],
      lastOptimizationRun: null
    };
  }

  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(ENGINE_STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("Failed to save life engine state:", e.message);
    }
  }

  /**
   * Boot the engine - called on app startup
   */
  async boot(dependencies = {}) {
    this.state.lastBoot = new Date().toISOString();
    this.isRunning = true;

    this.emit("boot-started", { timestamp: this.state.lastBoot });

    // Gather all data sources
    await this.gatherAllData(dependencies);

    // Calculate coverage
    const coverage = this.calculateCoverage();
    this.state.coverage = coverage;

    this.emit("coverage-updated", { coverage, threshold: OPTIMIZATION_THRESHOLD });

    // Check if we can start optimization
    if (coverage >= OPTIMIZATION_THRESHOLD && !this.optimizationActive) {
      this.startOptimization();
    }

    this.state.initialized = true;
    this.saveState();

    this.emit("boot-complete", {
      coverage,
      optimizationActive: this.optimizationActive,
      dataSources: this.dataStatus
    });

    return {
      coverage,
      ready: coverage >= OPTIMIZATION_THRESHOLD,
      missing: this.getMissingData()
    };
  }

  /**
   * Gather data from all sources
   */
  async gatherAllData(deps) {
    const {
      linkedInProfile,
      ouraHealth,
      portfolio,
      goals,
      calendar,
      email,
      aiStatus
    } = deps;

    // LinkedIn
    this.dataStatus.linkedin = this.evaluateDataSource("linkedin", {
      connected: !!linkedInProfile?.connected,
      data: linkedInProfile,
      fields: {
        name: !!linkedInProfile?.name,
        headline: !!linkedInProfile?.headline,
        location: !!linkedInProfile?.location,
        experience: linkedInProfile?.positions?.length > 0,
        education: linkedInProfile?.education?.length > 0,
        skills: linkedInProfile?.skills?.length > 0
      }
    });

    // Oura Health
    this.dataStatus.oura = this.evaluateDataSource("oura", {
      connected: !!ouraHealth?.connected,
      data: ouraHealth,
      fields: {
        sleep: !!ouraHealth?.today?.sleepScore,
        readiness: !!ouraHealth?.today?.readinessScore,
        activity: !!ouraHealth?.today?.activityScore,
        heartRate: !!ouraHealth?.today?.restingHeartRate,
        hrv: !!ouraHealth?.today?.hrv
      }
    });

    // Alpaca Portfolio
    this.dataStatus.alpaca = this.evaluateDataSource("alpaca", {
      connected: !!portfolio?.connected,
      data: portfolio,
      fields: {
        portfolio: !!portfolio?.connected,
        positions: portfolio?.positions?.length > 0,
        equity: !!portfolio?.equity,
        dayChange: portfolio?.dayChange !== undefined
      }
    });

    // Bank Accounts (placeholder - would need Plaid integration)
    this.dataStatus.bankAccounts = this.evaluateDataSource("bankAccounts", {
      connected: false,
      data: null,
      fields: {
        checking: false,
        savings: false,
        totalBalance: false
      }
    });

    // Calendar
    this.dataStatus.calendar = this.evaluateDataSource("calendar", {
      connected: !!calendar?.connected,
      data: calendar,
      fields: {
        events: calendar?.events?.length > 0,
        commitments: !!calendar?.commitments,
        freeTime: !!calendar?.freeTime
      }
    });

    // Email
    this.dataStatus.email = this.evaluateDataSource("email", {
      connected: !!email?.connected,
      data: email,
      fields: {
        unread: email?.unread !== undefined,
        important: !!email?.important,
        actionRequired: !!email?.actionRequired
      }
    });

    // Goals
    this.dataStatus.goals = this.evaluateDataSource("goals", {
      connected: goals?.length > 0,
      data: goals,
      fields: {
        activeGoals: goals?.length > 0,
        progress: goals?.some(g => g.currentValue > g.startValue),
        milestones: goals?.some(g => g.milestones?.length > 0)
      }
    });

    // Disaster Planning (placeholder)
    this.dataStatus.disasterPlanning = this.evaluateDataSource("disasterPlanning", {
      connected: false,
      data: null,
      fields: {
        emergencyContacts: false,
        insurances: false,
        documents: false,
        supplies: false
      }
    });

    // AI Model
    this.dataStatus.aiModel = this.evaluateDataSource("aiModel", {
      connected: aiStatus?.ready,
      data: aiStatus,
      fields: {
        connected: aiStatus?.ready,
        provider: !!aiStatus?.provider,
        tokensAvailable: !aiStatus?.quotaExceeded
      }
    });

    // Store in state
    this.state.dataSources = this.dataStatus;
  }

  /**
   * Evaluate a single data source
   */
  evaluateDataSource(sourceId, status) {
    const source = DATA_SOURCES[sourceId];
    if (!source) return { connected: false, coverage: 0 };

    const fieldCount = Object.keys(status.fields).length;
    const connectedFields = Object.values(status.fields).filter(Boolean).length;
    const fieldCoverage = fieldCount > 0 ? (connectedFields / fieldCount) * 100 : 0;

    return {
      id: sourceId,
      name: source.name,
      category: source.category,
      weight: source.weight,
      required: source.required,
      connected: status.connected,
      fieldCoverage: Math.round(fieldCoverage),
      fields: status.fields,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Calculate overall coverage percentage
   */
  calculateCoverage() {
    let totalWeight = 0;
    let achievedWeight = 0;

    for (const [sourceId, source] of Object.entries(DATA_SOURCES)) {
      totalWeight += source.weight;

      const status = this.dataStatus[sourceId];
      if (status?.connected) {
        // Partial credit based on field coverage
        const fieldCredit = (status.fieldCoverage / 100) * source.weight;
        achievedWeight += fieldCredit;
      }
    }

    return totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;
  }

  /**
   * Get list of missing/incomplete data sources
   */
  getMissingData() {
    const missing = [];

    for (const [sourceId, source] of Object.entries(DATA_SOURCES)) {
      const status = this.dataStatus[sourceId];

      if (!status?.connected) {
        missing.push({
          id: sourceId,
          name: source.name,
          category: source.category,
          weight: source.weight,
          required: source.required,
          reason: "Not connected"
        });
      } else if (status.fieldCoverage < 50) {
        missing.push({
          id: sourceId,
          name: source.name,
          category: source.category,
          weight: source.weight,
          required: source.required,
          reason: `Only ${status.fieldCoverage}% of fields populated`
        });
      }
    }

    // Sort by weight (most important first)
    return missing.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Start the optimization engine
   */
  startOptimization() {
    if (this.optimizationActive) return;

    this.optimizationActive = true;
    this.state.optimizationStarted = true;
    this.state.lastOptimizationRun = new Date().toISOString();

    this.emit("optimization-started", {
      coverage: this.state.coverage,
      timestamp: this.state.lastOptimizationRun
    });

    // Start optimization cycle
    this.runOptimizationCycle();
  }

  /**
   * Run one optimization cycle
   * Analyzes all data and generates insights/actions
   */
  async runOptimizationCycle() {
    if (!this.optimizationActive) return;

    const insights = [];

    // Analyze each category
    const categories = this.groupByCategory();

    for (const [category, sources] of Object.entries(categories)) {
      const categoryInsights = await this.analyzeCategory(category, sources);
      insights.push(...categoryInsights);
    }

    // Cross-category analysis
    const crossInsights = await this.analyzeCrossCategory(categories);
    insights.push(...crossInsights);

    // Store insights
    this.state.insights = insights;
    this.saveState();

    this.emit("insights-generated", { insights, count: insights.length });

    return insights;
  }

  /**
   * Group data sources by category
   */
  groupByCategory() {
    const categories = {};

    for (const [sourceId, status] of Object.entries(this.dataStatus)) {
      const category = status.category;
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push({ id: sourceId, ...status });
    }

    return categories;
  }

  /**
   * Analyze a single category
   */
  async analyzeCategory(category, sources) {
    const insights = [];
    const connectedSources = sources.filter(s => s.connected);

    if (connectedSources.length === 0) {
      insights.push({
        category,
        type: "missing_data",
        priority: "high",
        title: `No ${category} data connected`,
        description: `Connect ${sources.map(s => s.name).join(", ")} to enable ${category} optimization.`,
        action: `setup_${category}`
      });
      return insights;
    }

    // Category-specific analysis
    switch (category) {
      case "health":
        insights.push(...this.analyzeHealth(connectedSources));
        break;
      case "financial":
        insights.push(...this.analyzeFinancial(connectedSources));
        break;
      case "identity":
        insights.push(...this.analyzeIdentity(connectedSources));
        break;
      case "goals":
        insights.push(...this.analyzeGoals(connectedSources));
        break;
    }

    return insights;
  }

  analyzeHealth(sources) {
    const insights = [];
    const oura = sources.find(s => s.id === "oura");

    if (oura?.connected && oura.fields) {
      if (!oura.fields.sleep) {
        insights.push({
          category: "health",
          type: "action",
          priority: "medium",
          title: "Sleep data not syncing",
          description: "Oura is connected but sleep data is missing. Ensure ring is charged and synced.",
          action: "sync_oura"
        });
      }
    }

    return insights;
  }

  analyzeFinancial(sources) {
    const insights = [];
    const alpaca = sources.find(s => s.id === "alpaca");
    const bank = sources.find(s => s.id === "bankAccounts");

    if (!bank?.connected) {
      insights.push({
        category: "financial",
        type: "recommendation",
        priority: "medium",
        title: "Connect bank accounts for full financial picture",
        description: "Link checking/savings accounts via Plaid to see complete net worth and cash flow.",
        action: "setup_plaid"
      });
    }

    return insights;
  }

  analyzeIdentity(sources) {
    const insights = [];
    const linkedin = sources.find(s => s.id === "linkedin");

    if (linkedin?.connected && linkedin.fieldCoverage < 80) {
      insights.push({
        category: "identity",
        type: "action",
        priority: "low",
        title: "Complete LinkedIn profile",
        description: `Profile is ${linkedin.fieldCoverage}% complete. Add missing sections for better career insights.`,
        action: "update_linkedin"
      });
    }

    return insights;
  }

  analyzeGoals(sources) {
    const insights = [];
    const goals = sources.find(s => s.id === "goals");

    if (!goals?.connected) {
      insights.push({
        category: "goals",
        type: "action",
        priority: "high",
        title: "Set your life goals",
        description: "Run /goals to define what you want to achieve. This drives all optimization.",
        action: "setup_goals"
      });
    }

    return insights;
  }

  /**
   * Cross-category analysis
   */
  async analyzeCrossCategory(categories) {
    const insights = [];

    // Example: Health + Goals correlation
    const healthSources = categories.health || [];
    const goalSources = categories.goals || [];

    if (healthSources.some(s => s.connected) && goalSources.some(s => s.connected)) {
      insights.push({
        category: "cross",
        type: "insight",
        priority: "medium",
        title: "Health impacts goal achievement",
        description: "Your health metrics can predict productivity. Optimizing sleep may accelerate financial goals.",
        action: "view_correlation"
      });
    }

    return insights;
  }

  /**
   * Get current status for display
   */
  getStatus() {
    return {
      initialized: this.state.initialized,
      coverage: this.state.coverage,
      threshold: OPTIMIZATION_THRESHOLD,
      ready: this.state.coverage >= OPTIMIZATION_THRESHOLD,
      optimizationActive: this.optimizationActive,
      dataSources: Object.entries(this.dataStatus).map(([id, status]) => ({
        id,
        name: status.name,
        connected: status.connected,
        coverage: status.fieldCoverage,
        category: status.category
      })),
      missing: this.getMissingData(),
      insights: this.state.insights?.slice(0, 5) || [],
      lastBoot: this.state.lastBoot
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const status = this.getStatus();

    return {
      coveragePercent: status.coverage,
      isReady: status.ready,
      connectedCount: status.dataSources.filter(s => s.connected).length,
      totalCount: status.dataSources.length,
      topMissing: status.missing.slice(0, 3),
      topInsights: status.insights.slice(0, 3),
      categories: this.getCategorySummary()
    };
  }

  /**
   * Get category-level summary
   */
  getCategorySummary() {
    const summary = {};

    for (const [id, status] of Object.entries(this.dataStatus)) {
      const cat = status.category;
      if (!summary[cat]) {
        summary[cat] = { connected: 0, total: 0, coverage: 0 };
      }
      summary[cat].total++;
      if (status.connected) {
        summary[cat].connected++;
        summary[cat].coverage += status.fieldCoverage;
      }
    }

    // Calculate averages
    for (const cat of Object.keys(summary)) {
      if (summary[cat].connected > 0) {
        summary[cat].coverage = Math.round(summary[cat].coverage / summary[cat].connected);
      }
    }

    return summary;
  }
}

// Singleton
let instance = null;

export const getLifeEngine = () => {
  if (!instance) {
    instance = new LifeEngine();
  }
  return instance;
};

export { OPTIMIZATION_THRESHOLD };
export default LifeEngine;
