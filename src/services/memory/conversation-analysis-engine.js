/**
 * Conversation Analysis Engine
 *
 * Integrates conversation tracking with the backlog and project system.
 * Analyzes conversations to:
 * 1. Extract action items and create backlog entries
 * 2. Identify opportunities for projects
 * 3. Update user profile and preferences
 * 4. Trigger relevant work when insights are discovered
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { getConversationTracker, TOPIC_CATEGORIES } from "./conversation-tracker.js";
import { processUserMessage, buildContextForAI, getContextSummary } from "./conversation-context.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const BACKLOG_FILE = path.join(DATA_DIR, "backlog.json");
const ANALYSIS_LOG = path.join(DATA_DIR, "conversation-analysis-log.json");

/**
 * Read JSON helper
 */
function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Write JSON helper
 */
function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

class ConversationAnalysisEngine extends EventEmitter {
  constructor() {
    super();
    this.tracker = null;
    this.analysisQueue = [];
    this.recentAnalyses = [];
    this.initialized = false;
  }

  /**
   * Initialize the engine
   */
  async initialize() {
    this.tracker = getConversationTracker();

    // Listen for new conversations
    this.tracker.on("conversation-recorded", (conv) => {
      this.analyzeConversation(conv);
    });

    // Load recent analyses
    const log = readJson(ANALYSIS_LOG);
    if (log) {
      this.recentAnalyses = log.analyses || [];
    }

    this.initialized = true;
    console.log("[ConversationAnalysisEngine] Initialized");
    return this;
  }

  /**
   * Analyze a single conversation for actionable insights
   */
  async analyzeConversation(conversation) {
    const analysis = {
      id: `analysis_${Date.now()}`,
      conversationId: conversation.id,
      timestamp: new Date().toISOString(),
      category: conversation.category,
      insights: [],
      backlogItems: [],
      profileUpdates: [],
      projectRelevance: []
    };

    // Extract context from user message
    const extractedContext = processUserMessage(conversation.userMessage);
    if (extractedContext) {
      analysis.extractedContext = extractedContext;
    }

    // Analyze for action items
    const actionItems = this.extractActionItems(conversation.userMessage, conversation.aiResponse);
    if (actionItems.length > 0) {
      analysis.insights.push({
        type: "action_items",
        items: actionItems
      });

      // Create backlog items from action items
      for (const item of actionItems) {
        const backlogItem = await this.createBacklogItem(item, conversation.category);
        if (backlogItem) {
          analysis.backlogItems.push(backlogItem);
        }
      }
    }

    // Analyze for opportunities
    const opportunities = this.extractOpportunities(conversation.userMessage, conversation.aiResponse);
    if (opportunities.length > 0) {
      analysis.insights.push({
        type: "opportunities",
        items: opportunities
      });
    }

    // Analyze for concerns/risks
    const concerns = this.extractConcerns(conversation.userMessage);
    if (concerns.length > 0) {
      analysis.insights.push({
        type: "concerns",
        items: concerns
      });
    }

    // Check project relevance
    analysis.projectRelevance = this.checkProjectRelevance(conversation);

    // Save analysis
    this.recentAnalyses.unshift(analysis);
    if (this.recentAnalyses.length > 100) {
      this.recentAnalyses = this.recentAnalyses.slice(0, 100);
    }
    this.saveAnalysisLog();

    // Emit event for other systems to react
    if (analysis.insights.length > 0 || analysis.backlogItems.length > 0) {
      this.emit("analysis-complete", analysis);
    }

    return analysis;
  }

  /**
   * Extract action items from conversation
   */
  extractActionItems(userMessage, aiResponse) {
    const items = [];
    const text = `${userMessage} ${aiResponse}`.toLowerCase();

    // Patterns that indicate action items
    const actionPatterns = [
      { pattern: /i (?:need|want|should|must|have) to (.{10,100})/gi, priority: "high" },
      { pattern: /(?:please|can you|could you) (?:help me|remind me to|set up) (.{10,100})/gi, priority: "medium" },
      { pattern: /i'm (?:planning|going) to (.{10,100})/gi, priority: "medium" },
      { pattern: /(?:let's|we should|we need to) (.{10,100})/gi, priority: "medium" },
      { pattern: /(?:don't forget to|remember to|make sure to) (.{10,100})/gi, priority: "high" }
    ];

    for (const { pattern, priority } of actionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const action = match[1].trim()
          .replace(/[.!?,]$/, "")
          .slice(0, 100);

        if (action.length > 10 && !items.some(i => i.action === action)) {
          items.push({
            action,
            priority,
            source: "conversation"
          });
        }
      }
    }

    return items.slice(0, 5); // Limit to 5 items per conversation
  }

  /**
   * Extract opportunities from conversation
   */
  extractOpportunities(userMessage, aiResponse) {
    const opportunities = [];
    const text = `${userMessage} ${aiResponse}`.toLowerCase();

    // Opportunity patterns
    const patterns = [
      /(?:opportunity|chance) to (.{10,100})/gi,
      /(?:could|might) (?:be able to|benefit from) (.{10,100})/gi,
      /(?:consider|think about) (.{10,100})/gi,
      /(?:potential|possible) (.{10,50})/gi
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const opp = match[1].trim().replace(/[.!?,]$/, "").slice(0, 100);
        if (opp.length > 10 && !opportunities.includes(opp)) {
          opportunities.push(opp);
        }
      }
    }

    return opportunities.slice(0, 3);
  }

  /**
   * Extract concerns from user message
   */
  extractConcerns(userMessage) {
    const concerns = [];
    const text = userMessage.toLowerCase();

    const patterns = [
      /(?:i'm worried|i'm concerned|i'm anxious) (?:about|that) (.{10,100})/gi,
      /(?:what if|what happens if) (.{10,100})/gi,
      /(?:scared|afraid|nervous) (?:about|of|that) (.{10,100})/gi,
      /(?:problem|issue|trouble) (?:with|is) (.{10,100})/gi
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const concern = match[1].trim().replace(/[.!?,]$/, "").slice(0, 100);
        if (concern.length > 10 && !concerns.includes(concern)) {
          concerns.push(concern);
        }
      }
    }

    return concerns.slice(0, 3);
  }

  /**
   * Check which projects are relevant to this conversation
   */
  checkProjectRelevance(conversation) {
    const relevance = [];
    const text = `${conversation.userMessage} ${conversation.aiResponse}`.toLowerCase();

    // Map topics to projects
    const projectMappings = {
      "market-analysis": ["stock", "market", "invest", "portfolio", "trading", "dividend"],
      "disaster-planning": ["emergency", "disaster", "prepare", "crisis", "safety", "risk"],
      "financial-growth": ["wealth", "retire", "savings", "income", "budget", "money"]
    };

    for (const [project, keywords] of Object.entries(projectMappings)) {
      const matches = keywords.filter(kw => text.includes(kw));
      if (matches.length > 0) {
        relevance.push({
          project,
          keywords: matches,
          relevanceScore: matches.length / keywords.length
        });
      }
    }

    return relevance.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Create a backlog item from an action item
   */
  async createBacklogItem(actionItem, category) {
    const backlog = readJson(BACKLOG_FILE) || { items: [], graduated: [], dismissed: [] };

    // Check for duplicates
    const isDuplicate = backlog.items.some(item =>
      item.title.toLowerCase().includes(actionItem.action.toLowerCase()) ||
      actionItem.action.toLowerCase().includes(item.title.toLowerCase())
    );

    if (isDuplicate) {
      return null;
    }

    const newItem = {
      id: `bl_conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: actionItem.action.charAt(0).toUpperCase() + actionItem.action.slice(1),
      source: "conversation",
      category: this.mapCategoryToBacklog(category),
      impactScore: actionItem.priority === "high" ? 60 : 45,
      urgency: actionItem.priority,
      createdAt: new Date().toISOString(),
      status: "new",
      lastEvaluated: null,
      notes: "Extracted from conversation analysis"
    };

    backlog.items.push(newItem);

    // Enforce max 150 items
    if (backlog.items.length > 150) {
      // Remove oldest low-impact items
      backlog.items.sort((a, b) => b.impactScore - a.impactScore);
      backlog.items = backlog.items.slice(0, 150);
    }

    writeJson(BACKLOG_FILE, backlog);
    this.emit("backlog-item-created", newItem);

    return newItem;
  }

  /**
   * Map conversation category to backlog category
   */
  mapCategoryToBacklog(category) {
    const mapping = {
      [TOPIC_CATEGORIES.FINANCIAL]: "finance",
      [TOPIC_CATEGORIES.HEALTH]: "health",
      [TOPIC_CATEGORIES.CAREER]: "career",
      [TOPIC_CATEGORIES.FAMILY]: "personal",
      [TOPIC_CATEGORIES.GOALS]: "goals",
      [TOPIC_CATEGORIES.DISASTER_PREP]: "safety",
      [TOPIC_CATEGORIES.LEARNING]: "learning",
      [TOPIC_CATEGORIES.PERSONAL]: "personal",
      [TOPIC_CATEGORIES.SYSTEM]: "system"
    };
    return mapping[category] || "general";
  }

  /**
   * Get insights summary for a time period
   */
  getInsightsSummary(days = 7) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recentAnalyses = this.recentAnalyses.filter(
      a => new Date(a.timestamp).getTime() > cutoff
    );

    const summary = {
      totalConversations: recentAnalyses.length,
      insightsByType: {},
      backlogItemsCreated: 0,
      topCategories: {},
      projectsEngaged: {}
    };

    for (const analysis of recentAnalyses) {
      // Count insights by type
      for (const insight of analysis.insights) {
        summary.insightsByType[insight.type] =
          (summary.insightsByType[insight.type] || 0) + insight.items.length;
      }

      // Count backlog items
      summary.backlogItemsCreated += analysis.backlogItems.length;

      // Count categories
      if (analysis.category) {
        summary.topCategories[analysis.category] =
          (summary.topCategories[analysis.category] || 0) + 1;
      }

      // Count project relevance
      for (const rel of analysis.projectRelevance) {
        summary.projectsEngaged[rel.project] =
          (summary.projectsEngaged[rel.project] || 0) + 1;
      }
    }

    return summary;
  }

  /**
   * Get context for the engine to use in work
   */
  getContextForEngine() {
    const contextSummary = getContextSummary();
    const aiContext = buildContextForAI();
    const trackerContext = this.tracker?.getContextForAI() || {};

    return {
      contextFiles: contextSummary,
      aiReadyContext: aiContext,
      userProfile: trackerContext.userProfile || {},
      keyTopics: trackerContext.keyTopics || {},
      pendingQuestions: trackerContext.pendingQuestions || [],
      recentCategories: this.recentAnalyses.slice(0, 10).map(a => a.category)
    };
  }

  /**
   * Force analysis of recent conversations (batch mode)
   */
  async analyzeRecentConversations(count = 10) {
    const conversations = this.tracker?.getRecent(count) || [];
    const results = [];

    for (const conv of conversations) {
      // Skip if already analyzed
      if (this.recentAnalyses.some(a => a.conversationId === conv.id)) {
        continue;
      }

      const analysis = await this.analyzeConversation(conv);
      results.push(analysis);
    }

    return results;
  }

  /**
   * Save analysis log
   */
  saveAnalysisLog() {
    writeJson(ANALYSIS_LOG, {
      lastUpdated: new Date().toISOString(),
      analyses: this.recentAnalyses
    });
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const summary = this.getInsightsSummary(7);
    const recent = this.recentAnalyses.slice(0, 5);

    return {
      weekSummary: summary,
      recentAnalyses: recent.map(a => ({
        id: a.id,
        timestamp: a.timestamp,
        category: a.category,
        insightCount: a.insights.reduce((sum, i) => sum + i.items.length, 0),
        backlogItemsCreated: a.backlogItems.length,
        projectsRelevant: a.projectRelevance.map(r => r.project)
      }))
    };
  }
}

// Singleton
let instance = null;

export const getConversationAnalysisEngine = () => {
  if (!instance) {
    instance = new ConversationAnalysisEngine();
  }
  return instance;
};

export default ConversationAnalysisEngine;
