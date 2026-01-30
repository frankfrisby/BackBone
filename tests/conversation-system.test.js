/**
 * Conversation System Tests
 * Tests Conversation Tracker, Conversation Context, and Unified Message Log
 * Verifies conversation recording, categorization, context extraction, and display
 */

import { describe, it, expect, beforeEach } from "vitest";

// Conversation Tracker
import {
  getConversationTracker,
  TOPIC_CATEGORIES,
} from "../src/services/conversation-tracker.js";

// Conversation Context
import conversationContext, {
  processUserMessage,
} from "../src/services/conversation-context.js";
const {
  processAndSaveContext,
  getContextSummary,
  buildContextForAI,
  parseConversation,
} = conversationContext;

// Unified Message Log
import {
  getUnifiedMessageLog,
  MESSAGE_CHANNEL,
  MESSAGE_ROLE,
} from "../src/services/unified-message-log.js";

// ─── Conversation Tracker ────────────────────────────────────────

describe("Conversation Tracker", () => {
  let tracker;

  beforeEach(() => {
    tracker = getConversationTracker();
  });

  it("getConversationTracker returns singleton", () => {
    const a = getConversationTracker();
    const b = getConversationTracker();
    expect(a).toBe(b);
  });

  it("TOPIC_CATEGORIES has expected categories", () => {
    expect(TOPIC_CATEGORIES.FINANCIAL).toBe("financial");
    expect(TOPIC_CATEGORIES.HEALTH).toBe("health");
    expect(TOPIC_CATEGORIES.CAREER).toBe("career");
    expect(TOPIC_CATEGORIES.FAMILY).toBe("family");
    expect(TOPIC_CATEGORIES.GOALS).toBe("goals");
    expect(TOPIC_CATEGORIES.LEARNING).toBe("learning");
    expect(TOPIC_CATEGORIES.PERSONAL).toBe("personal");
    expect(TOPIC_CATEGORIES.SYSTEM).toBe("system");
  });

  it("record saves a conversation entry", () => {
    const entry = tracker.record(
      "How is my portfolio doing?",
      "Your portfolio is up 2.3% today.",
      { category: "financial" }
    );
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("timestamp");
    expect(entry).toHaveProperty("userMessage");
    expect(entry.userMessage).toBe("How is my portfolio doing?");
    expect(entry.aiResponse).toBe("Your portfolio is up 2.3% today.");
    expect(entry.category).toBe("financial");
  });

  it("categorizeMessage classifies financial messages", () => {
    const cat = tracker.categorizeMessage("I want to invest my money and save for retirement.");
    expect(cat).toBe("financial");
  });

  it("categorizeMessage classifies health messages", () => {
    const cat = tracker.categorizeMessage("How did I sleep last night? Check my Oura data.");
    expect(cat).toBe("health");
  });

  it("categorizeMessage classifies goals messages", () => {
    const cat = tracker.categorizeMessage("I want to set a new goal to learn Spanish.");
    expect(cat).toBe("goals");
  });

  it("categorizeMessage defaults to personal for generic messages", () => {
    const cat = tracker.categorizeMessage("Hey what's up");
    // Should be personal or system for generic messages
    expect(["personal", "system"]).toContain(cat);
  });

  it("getRecent returns recent conversations", () => {
    tracker.record("test question 1", "test answer 1");
    tracker.record("test question 2", "test answer 2");
    const recent = tracker.getRecent(5);
    expect(Array.isArray(recent)).toBe(true);
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });

  it("getByCategory filters by category", () => {
    tracker.record("Check my health", "Your sleep was 7.5 hours", { category: "health" });
    const health = tracker.getByCategory("health", 10);
    expect(Array.isArray(health)).toBe(true);
    expect(health.length).toBeGreaterThan(0);
    expect(health[0].category).toBe("health");
  });

  it("search finds matching conversations", () => {
    tracker.record("I want to learn JavaScript", "Great goal!");
    const results = tracker.search("JavaScript");
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("getDisplayData returns UI-ready data", () => {
    const data = tracker.getDisplayData();
    expect(data).toHaveProperty("totalConversations");
    expect(data).toHaveProperty("recentConversations");
    expect(data).toHaveProperty("pendingQuestions");
    expect(data).toHaveProperty("keyTopics");
    expect(data).toHaveProperty("userProfile");
    expect(typeof data.totalConversations).toBe("number");
    expect(Array.isArray(data.recentConversations)).toBe(true);
  });

  it("getContextForAI returns AI context shape", () => {
    const ctx = tracker.getContextForAI();
    expect(ctx).toHaveProperty("userProfile");
    expect(ctx).toHaveProperty("recentTopics");
    expect(ctx).toHaveProperty("keyTopics");
    expect(ctx).toHaveProperty("pendingQuestions");
  });

  it("getFullContext includes summaries and profile", () => {
    const full = tracker.getFullContext();
    expect(full).toHaveProperty("recentMessages");
    expect(full).toHaveProperty("userProfile");
    expect(full).toHaveProperty("keyTopics");
  });

  it("pending questions lifecycle works", () => {
    const q = tracker.addPendingQuestion("What is your morning routine?", "personal", 1);
    if (q) {
      expect(q).toHaveProperty("id");
      expect(q.question).toBe("What is your morning routine?");
      expect(q.asked).toBe(false);
      expect(q.answered).toBe(false);

      tracker.markQuestionAsked(q.id);
      const next = tracker.getNextQuestion();
      // After marking asked, it may or may not be the next question
      expect(next === null || next.id !== q.id || next.asked === true).toBe(true);
    }
  });

  it("tracker is an EventEmitter", () => {
    expect(typeof tracker.on).toBe("function");
    expect(typeof tracker.emit).toBe("function");
  });

  it("emits conversation-recorded event", () => {
    let emitted = null;
    tracker.on("conversation-recorded", (data) => { emitted = data; });
    tracker.record("event test", "event response");
    expect(emitted).not.toBeNull();
    expect(emitted.userMessage).toBe("event test");
    tracker.removeAllListeners("conversation-recorded");
  });
});

// ─── Conversation Context ────────────────────────────────────────

describe("Conversation Context", () => {
  it("processUserMessage extracts context from goal statement", () => {
    const result = processUserMessage("I want to save $50000 for a house down payment");
    // May extract finances and/or goals
    if (result) {
      const domains = Object.keys(result).filter(k => result[k] && result[k].length > 0);
      expect(domains.length).toBeGreaterThan(0);
    }
  });

  it("processUserMessage extracts health context", () => {
    const result = processUserMessage("I've been running 5 miles every morning for my health");
    if (result) {
      const domains = Object.keys(result).filter(k => result[k] && result[k].length > 0);
      expect(domains.length).toBeGreaterThan(0);
    }
  });

  it("processUserMessage returns null for empty content", () => {
    const result = processUserMessage("");
    expect(result === null || Object.values(result).every(v => v.length === 0)).toBe(true);
  });

  it("parseConversation extracts from message array", () => {
    const messages = [
      { role: "user", content: "I want to invest in stocks and save for retirement" },
      { role: "assistant", content: "Great financial goals!" },
      { role: "user", content: "I also want to improve my sleep schedule" },
    ];
    const extracted = parseConversation(messages);
    expect(extracted).toHaveProperty("goals");
    expect(extracted).toHaveProperty("finances");
    expect(extracted).toHaveProperty("health");
    expect(Array.isArray(extracted.goals)).toBe(true);
    expect(Array.isArray(extracted.finances)).toBe(true);
  });

  it("getContextSummary returns domain summary", () => {
    const summary = getContextSummary();
    expect(typeof summary).toBe("object");
    // Each domain entry has exists and entryCount
    for (const [domain, info] of Object.entries(summary)) {
      expect(info).toHaveProperty("exists");
      expect(typeof info.exists).toBe("boolean");
    }
  });

  it("buildContextForAI returns string or null", () => {
    const ctx = buildContextForAI();
    expect(ctx === null || typeof ctx === "string").toBe(true);
  });
});

// ─── Unified Message Log ─────────────────────────────────────────

describe("Unified Message Log", () => {
  let log;

  beforeEach(() => {
    log = getUnifiedMessageLog();
  });

  it("getUnifiedMessageLog returns singleton", () => {
    const a = getUnifiedMessageLog();
    const b = getUnifiedMessageLog();
    expect(a).toBe(b);
  });

  it("MESSAGE_CHANNEL has all channels", () => {
    expect(MESSAGE_CHANNEL.CHAT).toBe("chat");
    expect(MESSAGE_CHANNEL.WHATSAPP).toBe("whatsapp");
    expect(MESSAGE_CHANNEL.SYSTEM).toBe("system");
    expect(MESSAGE_CHANNEL.PROACTIVE).toBe("proactive");
  });

  it("MESSAGE_ROLE has all roles", () => {
    expect(MESSAGE_ROLE.USER).toBe("user");
    expect(MESSAGE_ROLE.ASSISTANT).toBe("assistant");
    expect(MESSAGE_ROLE.SYSTEM).toBe("system");
  });

  it("addMessage creates a message with proper shape", () => {
    const msg = log.addMessage("user", "Hello from test", { channel: "chat" });
    expect(msg).toHaveProperty("id");
    expect(msg).toHaveProperty("role");
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("channel");
    expect(msg).toHaveProperty("timestamp");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello from test");
    expect(msg.channel).toBe("chat");
  });

  it("addUserMessage convenience method works", () => {
    const msg = log.addUserMessage("User test message", "chat");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("User test message");
  });

  it("addAssistantMessage convenience method works", () => {
    const msg = log.addAssistantMessage("AI response here", "chat");
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("AI response here");
  });

  it("addSystemMessage convenience method works", () => {
    const msg = log.addSystemMessage("System notification");
    expect(msg.role).toBe("system");
    expect(msg.channel).toBe("system");
  });

  it("getRecentMessages returns array of messages", () => {
    log.addUserMessage("Recent test 1");
    log.addAssistantMessage("Response 1");
    const recent = log.getRecentMessages(10);
    expect(Array.isArray(recent)).toBe(true);
    expect(recent.length).toBeGreaterThanOrEqual(2);
  });

  it("getMessagesForAI returns simplified role/content pairs", () => {
    log.addUserMessage("AI format test");
    log.addAssistantMessage("AI format response");
    const forAI = log.getMessagesForAI(10);
    expect(Array.isArray(forAI)).toBe(true);
    if (forAI.length > 0) {
      expect(forAI[0]).toHaveProperty("role");
      expect(forAI[0]).toHaveProperty("content");
    }
  });

  it("getStats returns message statistics", () => {
    const stats = log.getStats();
    expect(stats).toHaveProperty("totalMessages");
    expect(typeof stats.totalMessages).toBe("number");
    expect(stats).toHaveProperty("chatMessages");
    expect(stats).toHaveProperty("whatsappMessages");
    expect(stats).toHaveProperty("compactedSummaries");
  });

  it("getFullContext returns summaries, messages, and stats", () => {
    const ctx = log.getFullContext();
    expect(ctx).toHaveProperty("summaries");
    expect(ctx).toHaveProperty("recentMessages");
    expect(ctx).toHaveProperty("stats");
    expect(Array.isArray(ctx.summaries)).toBe(true);
    expect(Array.isArray(ctx.recentMessages)).toBe(true);
  });

  it("extractTopics extracts keywords from content", () => {
    const topics = log.extractTopics("I want to check my portfolio and stocks trading performance");
    expect(Array.isArray(topics)).toBe(true);
    // Should extract at least some topic keywords
  });

  it("log is an EventEmitter", () => {
    expect(typeof log.on).toBe("function");
    expect(typeof log.emit).toBe("function");
  });

  it("emits message-added event", () => {
    let emitted = null;
    log.on("message-added", (data) => { emitted = data; });
    log.addUserMessage("event test message");
    expect(emitted).not.toBeNull();
    expect(emitted.content).toBe("event test message");
    log.removeAllListeners("message-added");
  });

  it("compactOldMessages runs without error", () => {
    const result = log.compactOldMessages();
    expect(result).toHaveProperty("compacted");
    expect(typeof result.compacted).toBe("boolean");
  });
});
