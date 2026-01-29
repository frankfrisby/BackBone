/**
 * Tests for Conversation Analysis Engine
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../src/services/conversation-tracker.js", () => ({
  getConversationTracker: vi.fn(() => ({
    on: vi.fn(),
    getRecent: vi.fn(() => []),
    getContextForAI: vi.fn(() => ({
      userProfile: {},
      keyTopics: {},
      pendingQuestions: []
    }))
  })),
  TOPIC_CATEGORIES: {
    FINANCIAL: "financial",
    HEALTH: "health",
    CAREER: "career",
    FAMILY: "family",
    GOALS: "goals",
    DISASTER_PREP: "disaster_prep",
    LEARNING: "learning",
    PERSONAL: "personal",
    SYSTEM: "system"
  }
}));

vi.mock("../src/services/conversation-context.js", () => ({
  processUserMessage: vi.fn(() => null),
  buildContextForAI: vi.fn(() => null),
  getContextSummary: vi.fn(() => ({}))
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => "{}"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}));

import ConversationAnalysisEngine from "../src/services/conversation-analysis-engine.js";

describe("ConversationAnalysisEngine", () => {
  let engine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ConversationAnalysisEngine();
  });

  describe("extractActionItems", () => {
    it("should extract action items with 'need to'", () => {
      const items = engine.extractActionItems(
        "I need to review my investment portfolio",
        "I can help you with that."
      );

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].priority).toBe("high");
    });

    it("should extract action items with 'planning to'", () => {
      const items = engine.extractActionItems(
        "I'm planning to start a new savings account",
        "Great idea!"
      );

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].priority).toBe("medium");
    });

    it("should limit to 5 items", () => {
      const longMessage = `
        I need to do task one and I need to do task two
        and I need to do task three and I need to do task four
        and I need to do task five and I need to do task six
        and I need to do task seven
      `;

      const items = engine.extractActionItems(longMessage, "OK");

      expect(items.length).toBeLessThanOrEqual(5);
    });
  });

  describe("extractOpportunities", () => {
    it("should extract opportunities", () => {
      const opps = engine.extractOpportunities(
        "There might be an opportunity to invest in tech stocks",
        "That's a good point."
      );

      expect(opps.length).toBeGreaterThan(0);
    });

    it("should limit to 3 opportunities", () => {
      const message = `
        opportunity to do one thing
        opportunity to do another thing
        opportunity to do a third thing
        opportunity to do a fourth thing
      `;

      const opps = engine.extractOpportunities(message, "OK");

      expect(opps.length).toBeLessThanOrEqual(3);
    });
  });

  describe("extractConcerns", () => {
    it("should extract concerns", () => {
      const concerns = engine.extractConcerns(
        "I'm worried about the market volatility"
      );

      expect(concerns.length).toBeGreaterThan(0);
    });

    it("should extract 'what if' concerns", () => {
      const concerns = engine.extractConcerns(
        "What if the market crashes next month?"
      );

      expect(concerns.length).toBeGreaterThan(0);
    });
  });

  describe("checkProjectRelevance", () => {
    it("should match market-related keywords to market-analysis project", () => {
      const relevance = engine.checkProjectRelevance({
        userMessage: "How are my stocks doing?",
        aiResponse: "Let me check your portfolio."
      });

      expect(relevance.some(r => r.project === "market-analysis")).toBe(true);
    });

    it("should match emergency keywords to disaster-planning project", () => {
      const relevance = engine.checkProjectRelevance({
        userMessage: "I need to prepare for potential emergencies",
        aiResponse: "Good idea to have a plan."
      });

      expect(relevance.some(r => r.project === "disaster-planning")).toBe(true);
    });

    it("should sort by relevance score", () => {
      const relevance = engine.checkProjectRelevance({
        userMessage: "I want to build wealth through investing in stocks and grow my portfolio",
        aiResponse: "Great financial goals!"
      });

      if (relevance.length >= 2) {
        expect(relevance[0].relevanceScore).toBeGreaterThanOrEqual(relevance[1].relevanceScore);
      }
    });
  });

  describe("mapCategoryToBacklog", () => {
    it("should map financial category", () => {
      const result = engine.mapCategoryToBacklog("financial");
      expect(result).toBe("finance");
    });

    it("should map health category", () => {
      const result = engine.mapCategoryToBacklog("health");
      expect(result).toBe("health");
    });

    it("should return general for unknown category", () => {
      const result = engine.mapCategoryToBacklog("unknown");
      expect(result).toBe("general");
    });
  });

  describe("getInsightsSummary", () => {
    it("should return empty summary when no analyses", () => {
      const summary = engine.getInsightsSummary(7);

      expect(summary.totalConversations).toBe(0);
      expect(summary.backlogItemsCreated).toBe(0);
    });
  });

  describe("getDisplayData", () => {
    it("should return valid display structure", () => {
      const data = engine.getDisplayData();

      expect(data).toHaveProperty("weekSummary");
      expect(data).toHaveProperty("recentAnalyses");
      expect(Array.isArray(data.recentAnalyses)).toBe(true);
    });
  });
});
