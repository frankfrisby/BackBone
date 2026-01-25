/**
 * Disaster & Risk Monitoring Service
 *
 * Proactively monitors for potential risks and disasters that could affect the user.
 * Uses multiple sources including news, weather, and prediction markets.
 *
 * Risk Categories:
 * - Natural disasters (weather, earthquakes, floods)
 * - Financial risks (job loss, market crashes, inflation)
 * - Health risks (pandemics, local outbreaks)
 * - Infrastructure (power outages, water issues)
 * - Personal (home fire, theft, accidents)
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const RISKS_FILE = path.join(DATA_DIR, "user_risks.json");
const POLYMARKET_FILE = path.join(DATA_DIR, "polymarkets.md");

// Risk categories with base probabilities
export const RISK_CATEGORIES = {
  NATURAL_DISASTER: {
    id: "natural_disaster",
    name: "Natural Disasters",
    subcategories: ["weather", "earthquake", "flood", "wildfire", "tornado", "hurricane"]
  },
  FINANCIAL: {
    id: "financial",
    name: "Financial Risks",
    subcategories: ["job_loss", "market_crash", "inflation", "recession", "bank_failure"]
  },
  HEALTH: {
    id: "health",
    name: "Health Risks",
    subcategories: ["pandemic", "local_outbreak", "hospital_capacity", "drug_shortage"]
  },
  INFRASTRUCTURE: {
    id: "infrastructure",
    name: "Infrastructure",
    subcategories: ["power_outage", "water_contamination", "internet_outage", "gas_shortage"]
  },
  PERSONAL: {
    id: "personal",
    name: "Personal Risks",
    subcategories: ["home_fire", "theft", "accident", "identity_theft", "cyber_attack"]
  }
};

// Protective actions for different risk types
const PROTECTIVE_ACTIONS = {
  weather_snow: [
    "Stock up on food and water (3-day supply)",
    "Ensure heating system is working",
    "Have flashlights and batteries ready",
    "Keep car gas tank full",
    "Have warm blankets accessible",
    "Check on elderly neighbors"
  ],
  weather_heat: [
    "Stay hydrated - drink extra water",
    "Avoid outdoor activities during peak heat",
    "Check AC is working properly",
    "Know location of cooling centers",
    "Check on elderly family members"
  ],
  job_loss: [
    "Build 6-month emergency fund",
    "Update resume and LinkedIn profile",
    "Network with industry contacts",
    "Reduce non-essential spending",
    "Consider skill development courses"
  ],
  market_crash: [
    "Review portfolio allocation",
    "Consider defensive positions",
    "Don't panic sell - stick to long-term plan",
    "Rebalance if needed",
    "Look for buying opportunities"
  ],
  power_outage: [
    "Have flashlights and batteries",
    "Keep phones charged",
    "Have backup phone charger",
    "Know manual garage door release",
    "Have cash on hand (ATMs won't work)"
  ],
  home_fire: [
    "Test smoke detectors monthly",
    "Have fire extinguisher accessible",
    "Plan two escape routes",
    "Keep important documents in fireproof safe",
    "Review insurance coverage"
  ],
  flood: [
    "Know your flood zone status",
    "Have flood insurance if in risk area",
    "Keep important items off ground floor",
    "Have evacuation plan ready",
    "Know how to shut off utilities"
  ]
};

/**
 * User risk profile based on their situation
 */
const calculateUserRiskProfile = (userContext) => {
  const profile = {
    location: null,
    hasFamily: false,
    income: null,
    homeOwner: false,
    risks: [],
    lastUpdated: new Date().toISOString()
  };

  if (userContext?.location) {
    profile.location = userContext.location;
    // Location-based risks
    if (userContext.location.toLowerCase().includes("coast")) {
      profile.risks.push({ type: "hurricane", baseProb: 0.15 });
    }
    if (userContext.location.toLowerCase().includes("california")) {
      profile.risks.push({ type: "earthquake", baseProb: 0.10 });
      profile.risks.push({ type: "wildfire", baseProb: 0.12 });
    }
  }

  if (userContext?.family) {
    profile.hasFamily = true;
    profile.risks.push({ type: "family_emergency", baseProb: 0.08 });
  }

  if (userContext?.income) {
    profile.income = userContext.income;
    if (userContext.income < 50000) {
      profile.risks.push({ type: "financial_stress", baseProb: 0.20 });
    }
  }

  return profile;
};

class DisasterMonitor extends EventEmitter {
  constructor() {
    super();
    this.userContext = {};
    this.activeAlerts = [];
    this.riskAssessments = [];
    this.polymarketData = {};
    this.lastPolymarketFetch = null;
    this.load();
  }

  /**
   * Load saved risk data
   */
  load() {
    try {
      if (fs.existsSync(RISKS_FILE)) {
        const data = JSON.parse(fs.readFileSync(RISKS_FILE, "utf-8"));
        this.userContext = data.userContext || {};
        this.activeAlerts = data.activeAlerts || [];
        this.riskAssessments = data.riskAssessments || [];
        this.polymarketData = data.polymarketData || {};
        this.lastPolymarketFetch = data.lastPolymarketFetch || null;
      }
    } catch (err) {
      console.error("Failed to load risk data:", err.message);
    }
  }

  /**
   * Save risk data
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(RISKS_FILE, JSON.stringify({
        userContext: this.userContext,
        activeAlerts: this.activeAlerts,
        riskAssessments: this.riskAssessments,
        polymarketData: this.polymarketData,
        lastPolymarketFetch: this.lastPolymarketFetch
      }, null, 2));
    } catch (err) {
      console.error("Failed to save risk data:", err.message);
    }
  }

  /**
   * Update user context (location, family, income, etc.)
   */
  updateUserContext(context) {
    this.userContext = { ...this.userContext, ...context };
    this.save();
    this.emit("context-updated", this.userContext);
  }

  /**
   * Get user's risk profile
   */
  getRiskProfile() {
    return calculateUserRiskProfile(this.userContext);
  }

  /**
   * Add a new risk alert
   */
  addAlert(alert) {
    const newAlert = {
      id: `alert_${Date.now()}`,
      ...alert,
      createdAt: new Date().toISOString(),
      acknowledged: false
    };
    this.activeAlerts.unshift(newAlert);
    this.activeAlerts = this.activeAlerts.slice(0, 50); // Keep last 50
    this.save();
    this.emit("alert-added", newAlert);
    return newAlert;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId) {
    const alert = this.activeAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();
      this.save();
      this.emit("alert-acknowledged", alert);
    }
  }

  /**
   * Get protective actions for a risk type
   */
  getProtectiveActions(riskType) {
    return PROTECTIVE_ACTIONS[riskType] || [
      "Stay informed about the situation",
      "Have an emergency plan ready",
      "Keep emergency contacts accessible"
    ];
  }

  /**
   * Analyze news/events for risks
   */
  async analyzeForRisks(newsText, source = "news") {
    const risks = [];
    const textLower = newsText.toLowerCase();

    // Weather risks
    if (textLower.includes("snow storm") || textLower.includes("blizzard")) {
      risks.push({
        type: "weather_snow",
        severity: textLower.includes("severe") ? "high" : "medium",
        source,
        actions: this.getProtectiveActions("weather_snow")
      });
    }

    if (textLower.includes("heat wave") || textLower.includes("extreme heat")) {
      risks.push({
        type: "weather_heat",
        severity: "medium",
        source,
        actions: this.getProtectiveActions("weather_heat")
      });
    }

    if (textLower.includes("flood") || textLower.includes("flooding")) {
      risks.push({
        type: "flood",
        severity: "high",
        source,
        actions: this.getProtectiveActions("flood")
      });
    }

    // Financial risks
    if (textLower.includes("layoff") || textLower.includes("job cuts")) {
      risks.push({
        type: "job_loss",
        severity: "medium",
        source,
        actions: this.getProtectiveActions("job_loss")
      });
    }

    if (textLower.includes("market crash") || textLower.includes("stock plunge")) {
      risks.push({
        type: "market_crash",
        severity: "high",
        source,
        actions: this.getProtectiveActions("market_crash")
      });
    }

    // Infrastructure risks
    if (textLower.includes("power outage") || textLower.includes("blackout")) {
      risks.push({
        type: "power_outage",
        severity: "medium",
        source,
        actions: this.getProtectiveActions("power_outage")
      });
    }

    return risks;
  }

  /**
   * Store Polymarket data
   */
  updatePolymarketData(data) {
    this.polymarketData = data;
    this.lastPolymarketFetch = new Date().toISOString();
    this.save();
    this.savePolymarketMarkdown();
    this.emit("polymarket-updated", data);
  }

  /**
   * Save Polymarket data to markdown file
   */
  savePolymarketMarkdown() {
    try {
      const md = this.formatPolymarketMarkdown();
      fs.writeFileSync(POLYMARKET_FILE, md);
    } catch (err) {
      console.error("Failed to save polymarket markdown:", err.message);
    }
  }

  /**
   * Format Polymarket data as markdown
   */
  formatPolymarketMarkdown() {
    const lines = [
      "# Polymarket Event Probabilities",
      "",
      `Last Updated: ${this.lastPolymarketFetch || "Never"}`,
      "",
      "## Active Markets",
      ""
    ];

    if (this.polymarketData.markets) {
      for (const market of this.polymarketData.markets) {
        lines.push(`### ${market.title}`);
        lines.push(`- Probability: ${(market.probability * 100).toFixed(1)}%`);
        lines.push(`- Volume: $${market.volume?.toLocaleString() || "N/A"}`);
        lines.push(`- Category: ${market.category || "General"}`);
        if (market.relevance) {
          lines.push(`- Relevance to User: ${market.relevance}`);
        }
        lines.push("");
      }
    }

    lines.push("## Key Takeaways");
    lines.push("");
    if (this.polymarketData.summary) {
      lines.push(this.polymarketData.summary);
    } else {
      lines.push("No market data available yet. Will fetch every 2 days.");
    }

    return lines.join("\n");
  }

  /**
   * Check if we should fetch Polymarket data (every 2 days)
   */
  shouldFetchPolymarket() {
    if (!this.lastPolymarketFetch) return true;
    const lastFetch = new Date(this.lastPolymarketFetch);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    return lastFetch < twoDaysAgo;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      activeAlerts: this.activeAlerts.filter(a => !a.acknowledged).slice(0, 5),
      riskProfile: this.getRiskProfile(),
      polymarketSummary: this.polymarketData.summary || null,
      lastPolymarketFetch: this.lastPolymarketFetch
    };
  }

  /**
   * Generate risk assessment report
   */
  generateRiskReport() {
    const profile = this.getRiskProfile();
    const report = {
      generatedAt: new Date().toISOString(),
      userContext: this.userContext,
      overallRiskLevel: "low",
      categories: {},
      recommendations: []
    };

    // Calculate overall risk based on active alerts and profile
    const activeUnacknowledged = this.activeAlerts.filter(a => !a.acknowledged);
    if (activeUnacknowledged.length > 3) {
      report.overallRiskLevel = "high";
    } else if (activeUnacknowledged.length > 1) {
      report.overallRiskLevel = "medium";
    }

    // Add category-specific assessments
    for (const [key, category] of Object.entries(RISK_CATEGORIES)) {
      report.categories[key] = {
        name: category.name,
        alerts: activeUnacknowledged.filter(a =>
          category.subcategories.some(sub => a.type?.includes(sub))
        ).length,
        recommendation: null
      };
    }

    return report;
  }
}

// Singleton instance
let instance = null;

export const getDisasterMonitor = () => {
  if (!instance) {
    instance = new DisasterMonitor();
  }
  return instance;
};

export default DisasterMonitor;
