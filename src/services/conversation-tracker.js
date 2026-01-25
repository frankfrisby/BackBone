/**
 * Conversation Tracker Service
 *
 * Tracks all AI-user conversations to:
 * 1. Remember what was discussed
 * 2. Avoid repeating advice
 * 3. Build understanding of user over time
 * 4. Compress older topics, keep recent ones fresh
 * 5. Maintain key topics that are always relevant
 *
 * Stores in user_conversations.md for persistence and human readability.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const CONVERSATIONS_FILE = path.join(DATA_DIR, "user_conversations.md");
const CONVERSATIONS_JSON = path.join(DATA_DIR, "user_conversations.json");

// Topic categories for organization
export const TOPIC_CATEGORIES = {
  FINANCIAL: "financial",
  HEALTH: "health",
  CAREER: "career",
  FAMILY: "family",
  GOALS: "goals",
  DISASTER_PREP: "disaster_prep",
  LEARNING: "learning",
  PERSONAL: "personal",
  SYSTEM: "system"
};

// How many messages to keep in full detail (rest get compacted)
const MAX_FULL_MESSAGES = 30;
const DETAIL_RETENTION_DAYS = 7;
const COMPRESS_AFTER_DAYS = 30;

class ConversationTracker extends EventEmitter {
  constructor() {
    super();
    this.conversations = [];
    this.keyTopics = {};
    this.userProfile = {};
    this.pendingQuestions = [];
    this.lastInteraction = null;
    this.compactedSummary = null; // AI-generated summary of older conversations
    this.compactedCount = 0; // How many conversations have been compacted
    this.load();
  }

  /**
   * Load conversation history
   */
  load() {
    try {
      if (fs.existsSync(CONVERSATIONS_JSON)) {
        const data = JSON.parse(fs.readFileSync(CONVERSATIONS_JSON, "utf-8"));
        this.conversations = data.conversations || [];
        this.keyTopics = data.keyTopics || {};
        this.userProfile = data.userProfile || {};
        this.pendingQuestions = data.pendingQuestions || [];
        this.lastInteraction = data.lastInteraction || null;
        this.compactedSummary = data.compactedSummary || null;
        this.compactedCount = data.compactedCount || 0;
      }
    } catch (err) {
      console.error("Failed to load conversations:", err.message);
    }
  }

  /**
   * Save conversation history
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Save JSON for programmatic access
      fs.writeFileSync(CONVERSATIONS_JSON, JSON.stringify({
        conversations: this.conversations,
        keyTopics: this.keyTopics,
        userProfile: this.userProfile,
        pendingQuestions: this.pendingQuestions,
        lastInteraction: this.lastInteraction,
        compactedSummary: this.compactedSummary,
        compactedCount: this.compactedCount,
        lastSaved: new Date().toISOString()
      }, null, 2));

      // Save markdown for human readability
      this.saveMarkdown();
    } catch (err) {
      console.error("Failed to save conversations:", err.message);
    }
  }

  /**
   * Save to markdown file
   */
  saveMarkdown() {
    const lines = [
      "# User Conversations History",
      "",
      `**Last Updated:** ${new Date().toISOString()}`,
      `**Total Conversations:** ${this.conversations.length}`,
      "",
      "---",
      "",
      "## User Profile",
      ""
    ];

    // User profile section
    if (Object.keys(this.userProfile).length > 0) {
      for (const [key, value] of Object.entries(this.userProfile)) {
        lines.push(`- **${key}:** ${value}`);
      }
    } else {
      lines.push("*No profile data yet. Learning about user through conversations.*");
    }

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Key Topics (Always Relevant)");
    lines.push("");

    // Key topics section
    for (const [topic, info] of Object.entries(this.keyTopics)) {
      lines.push(`### ${topic}`);
      lines.push(`- **Status:** ${info.status || "active"}`);
      lines.push(`- **Last Discussed:** ${info.lastDiscussed || "never"}`);
      if (info.summary) {
        lines.push(`- **Summary:** ${info.summary}`);
      }
      if (info.nextAction) {
        lines.push(`- **Next Action:** ${info.nextAction}`);
      }
      lines.push("");
    }

    if (Object.keys(this.keyTopics).length === 0) {
      lines.push("*No key topics identified yet.*");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push("## Pending Questions for User");
    lines.push("");

    // Pending questions
    if (this.pendingQuestions.length > 0) {
      for (const q of this.pendingQuestions) {
        lines.push(`- [ ] ${q.question} (${q.category}, priority: ${q.priority})`);
      }
    } else {
      lines.push("*No pending questions.*");
    }

    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Recent Conversations");
    lines.push("");

    // Recent conversations (last 20)
    const recent = this.conversations.slice(0, 20);
    for (const conv of recent) {
      const date = new Date(conv.timestamp).toLocaleDateString();
      const time = new Date(conv.timestamp).toLocaleTimeString();
      lines.push(`### ${date} ${time}`);
      lines.push(`**Category:** ${conv.category || "general"}`);
      lines.push("");
      lines.push(`**User:** ${conv.userMessage?.slice(0, 200) || "(no message)"}${conv.userMessage?.length > 200 ? "..." : ""}`);
      lines.push("");
      lines.push(`**AI:** ${conv.aiResponse?.slice(0, 300) || "(no response)"}${conv.aiResponse?.length > 300 ? "..." : ""}`);
      lines.push("");
      if (conv.keyInsight) {
        lines.push(`**Key Insight:** ${conv.keyInsight}`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }

    // Compressed older conversations
    const older = this.conversations.slice(20);
    if (older.length > 0) {
      lines.push("## Older Conversations (Compressed)");
      lines.push("");
      lines.push(`*${older.length} older conversations available in JSON format.*`);
      lines.push("");

      // Group by month
      const byMonth = {};
      for (const conv of older) {
        const month = new Date(conv.timestamp).toISOString().slice(0, 7);
        if (!byMonth[month]) {
          byMonth[month] = { count: 0, categories: {} };
        }
        byMonth[month].count++;
        const cat = conv.category || "general";
        byMonth[month].categories[cat] = (byMonth[month].categories[cat] || 0) + 1;
      }

      for (const [month, data] of Object.entries(byMonth)) {
        const catSummary = Object.entries(data.categories)
          .map(([c, n]) => `${c}: ${n}`)
          .join(", ");
        lines.push(`- **${month}:** ${data.count} conversations (${catSummary})`);
      }
    }

    fs.writeFileSync(CONVERSATIONS_FILE, lines.join("\n"));
  }

  /**
   * Record a new conversation
   */
  record(userMessage, aiResponse, options = {}) {
    const conversation = {
      id: `conv_${Date.now()}`,
      timestamp: new Date().toISOString(),
      userMessage,
      aiResponse,
      category: options.category || this.categorizeMessage(userMessage),
      keyInsight: options.keyInsight || null,
      actionTaken: options.actionTaken || null,
      followUpNeeded: options.followUpNeeded || false
    };

    this.conversations.unshift(conversation);
    this.lastInteraction = conversation.timestamp;

    // Extract any profile information
    this.extractProfileInfo(userMessage);

    // Update key topics if relevant
    if (options.keyTopic) {
      this.updateKeyTopic(options.keyTopic, {
        lastDiscussed: conversation.timestamp,
        summary: options.keyInsight
      });
    }

    // Compact when exceeding 30 messages (keep 30 full, compact older ones)
    if (this.conversations.length > MAX_FULL_MESSAGES) {
      this.compactOlderMessages();
    }

    this.save();
    this.emit("conversation-recorded", conversation);

    return conversation;
  }

  /**
   * Categorize a message
   */
  categorizeMessage(message) {
    const text = message.toLowerCase();

    if (text.includes("money") || text.includes("invest") || text.includes("budget") || text.includes("save") || text.includes("retire")) {
      return TOPIC_CATEGORIES.FINANCIAL;
    }
    if (text.includes("health") || text.includes("exercise") || text.includes("sleep") || text.includes("doctor") || text.includes("sick")) {
      return TOPIC_CATEGORIES.HEALTH;
    }
    if (text.includes("job") || text.includes("work") || text.includes("career") || text.includes("boss") || text.includes("interview")) {
      return TOPIC_CATEGORIES.CAREER;
    }
    if (text.includes("family") || text.includes("kid") || text.includes("spouse") || text.includes("parent") || text.includes("child")) {
      return TOPIC_CATEGORIES.FAMILY;
    }
    if (text.includes("goal") || text.includes("want to") || text.includes("plan to") || text.includes("trying to")) {
      return TOPIC_CATEGORIES.GOALS;
    }
    if (text.includes("emergency") || text.includes("disaster") || text.includes("prepare") || text.includes("storm") || text.includes("flood")) {
      return TOPIC_CATEGORIES.DISASTER_PREP;
    }
    if (text.includes("learn") || text.includes("study") || text.includes("course") || text.includes("skill") || text.includes("read")) {
      return TOPIC_CATEGORIES.LEARNING;
    }

    return TOPIC_CATEGORIES.PERSONAL;
  }

  /**
   * Extract profile information from messages
   */
  extractProfileInfo(message) {
    const text = message.toLowerCase();

    // Location
    const locationMatch = text.match(/i live in ([a-zA-Z\s]+)/i) ||
      text.match(/i'm in ([a-zA-Z\s]+)/i) ||
      text.match(/from ([a-zA-Z\s]+)/i);
    if (locationMatch) {
      this.userProfile.location = locationMatch[1].trim();
    }

    // Family
    if (text.includes("my wife") || text.includes("my husband") || text.includes("my spouse")) {
      this.userProfile.hasPartner = true;
    }
    if (text.includes("my kid") || text.includes("my child") || text.includes("my son") || text.includes("my daughter")) {
      this.userProfile.hasChildren = true;
    }

    // Job
    const jobMatch = text.match(/i work as ([a-zA-Z\s]+)/i) ||
      text.match(/i'm a ([a-zA-Z\s]+)/i) ||
      text.match(/my job is ([a-zA-Z\s]+)/i);
    if (jobMatch) {
      this.userProfile.occupation = jobMatch[1].trim();
    }

    // Income (rough detection)
    const incomeMatch = text.match(/\$([0-9,]+)\s*(k|thousand)?/i);
    if (incomeMatch && (text.includes("make") || text.includes("earn") || text.includes("salary"))) {
      let amount = parseInt(incomeMatch[1].replace(/,/g, ""));
      if (incomeMatch[2]) amount *= 1000;
      this.userProfile.estimatedIncome = amount;
    }
  }

  /**
   * Update a key topic
   */
  updateKeyTopic(topic, info) {
    if (!this.keyTopics[topic]) {
      this.keyTopics[topic] = {
        createdAt: new Date().toISOString(),
        status: "active"
      };
    }
    this.keyTopics[topic] = { ...this.keyTopics[topic], ...info };
    this.save();
  }

  /**
   * Add a pending question for the user
   */
  addPendingQuestion(question, category = "general", priority = 5) {
    // Don't add duplicates
    if (this.pendingQuestions.some(q => q.question === question)) {
      return null;
    }

    const q = {
      id: `q_${Date.now()}`,
      question,
      category,
      priority,
      createdAt: new Date().toISOString(),
      asked: false,
      answered: false
    };

    this.pendingQuestions.push(q);
    this.pendingQuestions.sort((a, b) => b.priority - a.priority);
    this.save();
    this.emit("question-added", q);

    return q;
  }

  /**
   * Get next question to ask user
   */
  getNextQuestion() {
    const unanswered = this.pendingQuestions.filter(q => !q.answered);
    return unanswered[0] || null;
  }

  /**
   * Mark question as asked
   */
  markQuestionAsked(questionId) {
    const q = this.pendingQuestions.find(q => q.id === questionId);
    if (q) {
      q.asked = true;
      q.askedAt = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Mark question as answered
   */
  answerQuestion(questionId, answer) {
    const q = this.pendingQuestions.find(q => q.id === questionId);
    if (q) {
      q.answered = true;
      q.answer = answer;
      q.answeredAt = new Date().toISOString();
      this.save();
      this.emit("question-answered", q);
    }
  }

  /**
   * Compact older messages beyond MAX_FULL_MESSAGES
   * Generates an AI summary and keeps only the last 30 in full detail
   */
  async compactOlderMessages() {
    if (this.conversations.length <= MAX_FULL_MESSAGES) return;

    // Split into recent (keep full) and older (compact)
    const recentMessages = this.conversations.slice(0, MAX_FULL_MESSAGES);
    const olderMessages = this.conversations.slice(MAX_FULL_MESSAGES);

    if (olderMessages.length === 0) return;

    // Build summary of older messages for AI compaction
    const olderSummary = olderMessages.map(conv => {
      const date = new Date(conv.timestamp).toLocaleDateString();
      return `[${date}] User: ${conv.userMessage?.slice(0, 100) || "?"} → AI: ${conv.aiResponse?.slice(0, 100) || "?"}`;
    }).join("\n");

    // Try to generate AI summary of older conversations
    try {
      const fetch = (await import("node-fetch")).default;
      const apiKey = process.env.OPENAI_API_KEY;

      if (apiKey) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are summarizing conversation history. Create a concise summary that captures: 1) Key topics discussed, 2) Important user preferences/information learned, 3) Any ongoing goals or plans. Keep it under 500 words."
              },
              {
                role: "user",
                content: `Summarize these ${olderMessages.length} older conversations:\n\n${olderSummary}\n\n${this.compactedSummary ? `Previous summary to incorporate:\n${this.compactedSummary}` : ""}`
              }
            ],
            max_tokens: 800,
            temperature: 0.3
          })
        });

        if (response.ok) {
          const data = await response.json();
          const newSummary = data.choices?.[0]?.message?.content || "";

          if (newSummary) {
            this.compactedSummary = newSummary;
            this.compactedCount += olderMessages.length;
            console.log(`[ConversationTracker] Compacted ${olderMessages.length} messages into summary`);
          }
        }
      }
    } catch (err) {
      console.error("[ConversationTracker] Failed to generate AI summary:", err.message);
      // Fallback: simple text summary
      this.compactedSummary = (this.compactedSummary || "") + `\n\n[${new Date().toLocaleDateString()}] ${olderMessages.length} conversations about: ${[...new Set(olderMessages.map(c => c.category))].join(", ")}`;
      this.compactedCount += olderMessages.length;
    }

    // Keep only recent messages in full
    this.conversations = recentMessages;
    this.emit("messages-compacted", { compacted: olderMessages.length, total: this.compactedCount });
  }

  /**
   * Get full context for AI (recent messages + compacted summary)
   */
  getFullContext() {
    return {
      recentMessages: this.conversations.slice(0, 10).map(c => ({
        role: "user",
        userMessage: c.userMessage,
        aiResponse: c.aiResponse,
        category: c.category,
        timestamp: c.timestamp
      })),
      compactedSummary: this.compactedSummary,
      compactedCount: this.compactedCount,
      userProfile: this.userProfile,
      keyTopics: this.keyTopics
    };
  }

  /**
   * Compress old conversations (legacy - by date)
   */
  compressOldConversations() {
    const now = Date.now();
    const compressThreshold = now - COMPRESS_AFTER_DAYS * 24 * 60 * 60 * 1000;

    this.conversations = this.conversations.map(conv => {
      const convTime = new Date(conv.timestamp).getTime();
      if (convTime < compressThreshold) {
        // Compress old conversations - keep only essential info
        return {
          id: conv.id,
          timestamp: conv.timestamp,
          category: conv.category,
          keyInsight: conv.keyInsight,
          compressed: true,
          userMessagePreview: conv.userMessage?.slice(0, 50),
          aiResponsePreview: conv.aiResponse?.slice(0, 50)
        };
      }
      return conv;
    });
  }

  /**
   * Get recent conversations
   */
  getRecent(count = 10) {
    return this.conversations.slice(0, count);
  }

  /**
   * Get conversations by category
   */
  getByCategory(category, count = 10) {
    return this.conversations
      .filter(c => c.category === category)
      .slice(0, count);
  }

  /**
   * Search conversations
   */
  search(query) {
    const q = query.toLowerCase();
    return this.conversations.filter(c =>
      c.userMessage?.toLowerCase().includes(q) ||
      c.aiResponse?.toLowerCase().includes(q) ||
      c.keyInsight?.toLowerCase().includes(q)
    );
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      totalConversations: this.conversations.length,
      recentConversations: this.conversations.slice(0, 5),
      pendingQuestions: this.pendingQuestions.filter(q => !q.answered).slice(0, 3),
      keyTopics: Object.keys(this.keyTopics).slice(0, 5),
      userProfile: this.userProfile,
      lastInteraction: this.lastInteraction
    };
  }

  /**
   * Get context for AI responses
   */
  getContextForAI() {
    return {
      userProfile: this.userProfile,
      recentTopics: this.conversations.slice(0, 5).map(c => c.category),
      keyTopics: this.keyTopics,
      pendingQuestions: this.pendingQuestions.filter(q => !q.answered),
      lastInteraction: this.lastInteraction
    };
  }
}

// Singleton
let instance = null;

export const getConversationTracker = () => {
  if (!instance) {
    instance = new ConversationTracker();
  }
  return instance;
};

export default ConversationTracker;
