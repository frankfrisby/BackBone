/**
 * Query Tracker Service
 *
 * Tracks user queries from CLI and WhatsApp to:
 * - Identify patterns and interests
 * - Extract potential goals
 * - Generate insights for background projects
 * - Improve AI responses over time
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const QUERIES_PATH = path.join(DATA_DIR, "user_queries.json");

// Query source types
export const QUERY_SOURCE = {
  CLI: "cli",
  WHATSAPP: "whatsapp",
  VOICE: "voice",
  API: "api"
};

// Query categories for classification
export const QUERY_CATEGORY = {
  GOAL: "goal",           // User expressing a goal/intention
  QUESTION: "question",   // User asking for information
  COMMAND: "command",     // User issuing a command
  FEEDBACK: "feedback",   // User providing feedback
  CONVERSATION: "conversation", // General chat
  TASK: "task",           // User requesting a task
  FINANCE: "finance",     // Finance-related query
  HEALTH: "health",       // Health-related query
  CAREER: "career",       // Career-related query
  LEARNING: "learning"    // Learning/education query
};

/**
 * Goal indicator phrases
 */
const GOAL_INDICATORS = [
  "i want to", "i need to", "i'd like to", "i would like to",
  "help me", "can you help", "i'm trying to", "my goal is",
  "i plan to", "i'm planning to", "i hope to", "i wish to",
  "remind me to", "track my", "monitor my", "analyze my",
  "find me", "search for", "look for", "get me"
];

/**
 * Category keyword patterns
 */
const CATEGORY_PATTERNS = {
  [QUERY_CATEGORY.FINANCE]: [
    "stock", "invest", "portfolio", "trade", "money", "budget",
    "savings", "wealth", "finance", "income", "expense", "crypto",
    "bitcoin", "market", "dividend", "roi", "alpaca"
  ],
  [QUERY_CATEGORY.HEALTH]: [
    "health", "fitness", "exercise", "sleep", "diet", "weight",
    "workout", "calories", "steps", "heart", "stress", "oura",
    "meditation", "wellness", "nutrition"
  ],
  [QUERY_CATEGORY.CAREER]: [
    "job", "career", "work", "salary", "interview", "resume",
    "linkedin", "promotion", "skill", "professional", "business",
    "startup", "entrepreneur"
  ],
  [QUERY_CATEGORY.LEARNING]: [
    "learn", "study", "course", "book", "tutorial", "education",
    "skill", "training", "certificate", "degree", "teach"
  ]
};

class QueryTrackerService extends EventEmitter {
  constructor() {
    super();
    this.queries = [];
    this.insights = [];
    this.loadQueries();
  }

  /**
   * Load stored queries
   */
  loadQueries() {
    try {
      if (fs.existsSync(QUERIES_PATH)) {
        const data = JSON.parse(fs.readFileSync(QUERIES_PATH, "utf-8"));
        this.queries = data.queries || [];
        this.insights = data.insights || [];
      }
    } catch (e) {
      console.error("[QueryTracker] Failed to load queries:", e.message);
    }
  }

  /**
   * Save queries to disk
   */
  saveQueries() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(QUERIES_PATH, JSON.stringify({
        queries: this.queries.slice(-500), // Keep last 500 queries
        insights: this.insights.slice(-100), // Keep last 100 insights
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error("[QueryTracker] Failed to save queries:", e.message);
    }
  }

  /**
   * Track a user query
   */
  trackQuery(text, source = QUERY_SOURCE.CLI, metadata = {}) {
    if (!text || text.trim().length === 0) return null;

    const normalized = text.trim().toLowerCase();

    // Skip commands
    if (normalized.startsWith("/")) return null;

    // Classify the query
    const classification = this.classifyQuery(normalized);

    const query = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      source,
      timestamp: new Date().toISOString(),
      categories: classification.categories,
      isGoalRelated: classification.isGoalRelated,
      extractedIntent: classification.intent,
      metadata
    };

    this.queries.push(query);
    this.saveQueries();

    // Emit event for listeners
    this.emit("query-tracked", query);

    // If goal-related, emit special event
    if (classification.isGoalRelated) {
      this.emit("goal-detected", {
        query,
        suggestedGoal: classification.suggestedGoal
      });
    }

    return query;
  }

  /**
   * Classify a query
   */
  classifyQuery(text) {
    const categories = [];
    let isGoalRelated = false;
    let intent = "general";
    let suggestedGoal = null;

    // Check for goal indicators
    for (const indicator of GOAL_INDICATORS) {
      if (text.includes(indicator)) {
        isGoalRelated = true;
        intent = "goal";

        // Extract what comes after the indicator
        const afterIndicator = text.split(indicator)[1]?.trim();
        if (afterIndicator) {
          suggestedGoal = this.extractGoalFromText(afterIndicator);
        }
        break;
      }
    }

    // Classify by category patterns
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) {
          categories.push(category);
          break;
        }
      }
    }

    // Check if it's a question
    if (text.includes("?") || text.startsWith("what") || text.startsWith("how") ||
        text.startsWith("why") || text.startsWith("when") || text.startsWith("where") ||
        text.startsWith("who") || text.startsWith("which") || text.startsWith("can")) {
      if (!categories.includes(QUERY_CATEGORY.QUESTION)) {
        categories.push(QUERY_CATEGORY.QUESTION);
      }
      if (intent === "general") intent = "question";
    }

    // Default category if none matched
    if (categories.length === 0) {
      categories.push(QUERY_CATEGORY.CONVERSATION);
    }

    return {
      categories,
      isGoalRelated,
      intent,
      suggestedGoal
    };
  }

  /**
   * Extract a goal from text
   */
  extractGoalFromText(text) {
    // Clean up the text
    let goal = text
      .replace(/[.!?,;:]+$/, "") // Remove trailing punctuation
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();

    // Capitalize first letter
    if (goal.length > 0) {
      goal = goal.charAt(0).toUpperCase() + goal.slice(1);
    }

    // Limit length
    if (goal.length > 100) {
      goal = goal.slice(0, 100) + "...";
    }

    return goal;
  }

  /**
   * Get query patterns and insights
   */
  getQueryInsights() {
    const recentQueries = this.queries.slice(-100);

    // Count categories
    const categoryCounts = {};
    for (const query of recentQueries) {
      for (const cat of query.categories || []) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    }

    // Get goal-related queries
    const goalQueries = recentQueries.filter(q => q.isGoalRelated);

    // Get common topics
    const topics = this.extractTopics(recentQueries);

    // Get source distribution
    const sourceCounts = {};
    for (const query of recentQueries) {
      sourceCounts[query.source] = (sourceCounts[query.source] || 0) + 1;
    }

    return {
      totalQueries: this.queries.length,
      recentCount: recentQueries.length,
      categoryCounts,
      goalQueries: goalQueries.length,
      suggestedGoals: goalQueries
        .filter(q => q.extractedIntent === "goal" && q.isGoalRelated)
        .map(q => ({
          text: q.text,
          suggested: this.extractGoalFromText(q.text),
          timestamp: q.timestamp,
          source: q.source
        }))
        .slice(-10),
      commonTopics: topics.slice(0, 10),
      sourceCounts,
      topCategory: Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || "conversation"
    };
  }

  /**
   * Extract common topics from queries
   */
  extractTopics(queries) {
    const wordCounts = {};
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "can", "this", "that", "these",
      "those", "i", "you", "he", "she", "it", "we", "they", "my", "your",
      "his", "her", "its", "our", "their", "what", "which", "who", "whom",
      "where", "when", "why", "how", "me", "him", "them", "us"
    ]);

    for (const query of queries) {
      const words = (query.text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([word, count]) => ({ word, count }));
  }

  /**
   * Get queries by source
   */
  getQueriesBySource(source, limit = 50) {
    return this.queries
      .filter(q => q.source === source)
      .slice(-limit);
  }

  /**
   * Get goal-related queries
   */
  getGoalQueries(limit = 20) {
    return this.queries
      .filter(q => q.isGoalRelated)
      .slice(-limit);
  }

  /**
   * Get queries by category
   */
  getQueriesByCategory(category, limit = 50) {
    return this.queries
      .filter(q => q.categories?.includes(category))
      .slice(-limit);
  }

  /**
   * Get recent queries
   */
  getRecentQueries(limit = 20) {
    return this.queries.slice(-limit);
  }

  /**
   * Add an insight (from AI analysis)
   */
  addInsight(insight) {
    this.insights.push({
      id: Date.now().toString(36),
      ...insight,
      timestamp: new Date().toISOString()
    });
    this.saveQueries();
    this.emit("insight-added", insight);
  }

  /**
   * Get stored insights
   */
  getInsights(limit = 20) {
    return this.insights.slice(-limit);
  }

  /**
   * Clear old queries (keep last N days)
   */
  pruneQueries(days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const beforeCount = this.queries.length;
    this.queries = this.queries.filter(
      q => new Date(q.timestamp) >= cutoff
    );

    if (this.queries.length < beforeCount) {
      this.saveQueries();
    }

    return beforeCount - this.queries.length;
  }
}

// Singleton instance
let instance = null;

export const getQueryTracker = () => {
  if (!instance) {
    instance = new QueryTrackerService();
  }
  return instance;
};

export const trackUserQuery = (text, source = QUERY_SOURCE.CLI, metadata = {}) => {
  return getQueryTracker().trackQuery(text, source, metadata);
};

export default QueryTrackerService;
