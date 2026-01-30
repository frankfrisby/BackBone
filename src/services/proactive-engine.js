/**
 * Proactive Engine
 *
 * Instead of waiting for the user to ask, this engine:
 * 1. Proactively prompts the user with questions
 * 2. Suggests actions based on context
 * 3. Sends notifications for important events
 * 4. Manages scheduled check-ins
 *
 * Works with conversation-tracker to avoid asking the same things.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getConversationTracker } from "./conversation-tracker.js";
import { getDisasterMonitor } from "./disaster-monitor.js";
import { getPolymarketService } from "./polymarket-service.js";

const DATA_DIR = path.join(process.cwd(), "data");
const PROACTIVE_STATE_FILE = path.join(DATA_DIR, "proactive_state.json");

// Question templates for different life areas
const QUESTION_TEMPLATES = {
  onboarding: [
    { q: "What city or area do you live in?", category: "profile", priority: 10 },
    { q: "Do you have a family (partner, children)?", category: "profile", priority: 9 },
    { q: "What do you do for work?", category: "career", priority: 8 },
    { q: "What are your top 3 priorities right now?", category: "goals", priority: 8 },
    { q: "Are you saving for anything specific (house, retirement, vacation)?", category: "financial", priority: 7 },
    { q: "Do you have any health goals?", category: "health", priority: 6 }
  ],
  financial: [
    { q: "How's your emergency fund looking? Do you have 3-6 months expenses saved?", category: "financial", priority: 7 },
    { q: "Are you investing regularly? What's your strategy?", category: "financial", priority: 6 },
    { q: "Have you reviewed your budget recently?", category: "financial", priority: 5 },
    { q: "Any big purchases coming up you should plan for?", category: "financial", priority: 5 }
  ],
  health: [
    { q: "How's your sleep been lately?", category: "health", priority: 6 },
    { q: "Getting enough exercise this week?", category: "health", priority: 5 },
    { q: "When was your last doctor checkup?", category: "health", priority: 4 },
    { q: "How's your stress level on a scale of 1-10?", category: "health", priority: 5 }
  ],
  career: [
    { q: "How are things going at work?", category: "career", priority: 5 },
    { q: "Any skills you want to develop?", category: "career", priority: 4 },
    { q: "Feeling challenged or stuck in your role?", category: "career", priority: 4 }
  ],
  family: [
    { q: "How's the family doing?", category: "family", priority: 5 },
    { q: "Any family events or milestones coming up?", category: "family", priority: 4 },
    { q: "Getting enough quality time with loved ones?", category: "family", priority: 5 }
  ],
  disaster_prep: [
    { q: "Do you have an emergency kit at home?", category: "disaster_prep", priority: 6 },
    { q: "Is your important documents stored safely?", category: "disaster_prep", priority: 5 },
    { q: "Do you know your evacuation routes?", category: "disaster_prep", priority: 4 }
  ],
  goals: [
    { q: "How's progress on your main goal?", category: "goals", priority: 6 },
    { q: "Any new goals you've been thinking about?", category: "goals", priority: 4 },
    { q: "What's blocking you from your goals right now?", category: "goals", priority: 5 }
  ]
};

// Notification types
const NOTIFICATION_TYPES = {
  URGENT: "urgent",       // Requires immediate attention
  IMPORTANT: "important", // Should see soon
  INFO: "info",          // Nice to know
  REMINDER: "reminder"   // Scheduled reminder
};

class ProactiveEngine extends EventEmitter {
  constructor() {
    super();
    this.state = this.loadState();
    this.questionQueue = [];
    this.notificationQueue = [];
    this.scheduledCheckins = [];
    this.lastPromptTime = null;
    this.conversationTracker = null;
    this.disasterMonitor = null;
    this.polymarketService = null;
  }

  /**
   * Initialize with dependencies
   */
  async initialize() {
    this.conversationTracker = getConversationTracker();
    this.disasterMonitor = getDisasterMonitor();
    this.polymarketService = getPolymarketService();

    // Load any pending questions from conversation tracker
    this.syncWithConversationTracker();

    // Schedule initial checks
    await this.scheduleChecks();
  }

  /**
   * Load saved state
   */
  loadState() {
    try {
      if (fs.existsSync(PROACTIVE_STATE_FILE)) {
        return JSON.parse(fs.readFileSync(PROACTIVE_STATE_FILE, "utf-8"));
      }
    } catch (err) {
      console.error("Failed to load proactive state:", err.message);
    }
    return {
      onboardingComplete: false,
      lastCheckins: {},
      askedQuestions: [],
      userPreferences: {
        promptFrequency: "moderate", // low, moderate, high
        quietHoursStart: 22,
        quietHoursEnd: 7,
        preferredChannel: "app" // app, sms, email
      }
    };
  }

  /**
   * Save state
   */
  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(PROACTIVE_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error("Failed to save proactive state:", err.message);
    }
  }

  /**
   * Sync with conversation tracker
   */
  syncWithConversationTracker() {
    if (!this.conversationTracker) return;

    // Check if we need onboarding questions
    const profile = this.conversationTracker.userProfile;
    if (!profile.location || !profile.occupation) {
      this.state.onboardingComplete = false;
    }

    // Add onboarding questions if needed
    if (!this.state.onboardingComplete) {
      this.queueOnboardingQuestions();
    }
  }

  /**
   * Queue onboarding questions
   */
  queueOnboardingQuestions() {
    const alreadyAsked = new Set(this.state.askedQuestions);

    for (const template of QUESTION_TEMPLATES.onboarding) {
      if (!alreadyAsked.has(template.q)) {
        this.queueQuestion(template.q, template.category, template.priority);
      }
    }
  }

  /**
   * Queue a question for the user
   */
  queueQuestion(question, category = "general", priority = 5) {
    // Don't queue duplicates
    if (this.questionQueue.some(q => q.question === question)) {
      return null;
    }

    const q = {
      id: `pq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      question,
      category,
      priority,
      createdAt: new Date().toISOString(),
      status: "pending"
    };

    this.questionQueue.push(q);
    this.questionQueue.sort((a, b) => b.priority - a.priority);

    // Also add to conversation tracker
    if (this.conversationTracker) {
      this.conversationTracker.addPendingQuestion(question, category, priority);
    }

    this.emit("question-queued", q);
    return q;
  }

  /**
   * Get next question to ask
   */
  getNextQuestion() {
    // Filter to pending questions only
    const pending = this.questionQueue.filter(q => q.status === "pending");
    if (pending.length === 0) return null;

    // Check if we're in quiet hours
    if (this.isQuietHours()) return null;

    // Check prompt frequency limits
    if (!this.shouldPrompt()) return null;

    return pending[0];
  }

  /**
   * Check if we're in quiet hours
   */
  isQuietHours() {
    const hour = new Date().getHours();
    const start = this.state.userPreferences.quietHoursStart;
    const end = this.state.userPreferences.quietHoursEnd;

    if (start > end) {
      // Quiet hours span midnight (e.g., 22:00 - 07:00)
      return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
  }

  /**
   * Check if we should prompt based on frequency settings
   */
  shouldPrompt() {
    if (!this.lastPromptTime) return true;

    const now = Date.now();
    const lastPrompt = new Date(this.lastPromptTime).getTime();
    const hoursSinceLastPrompt = (now - lastPrompt) / (1000 * 60 * 60);

    switch (this.state.userPreferences.promptFrequency) {
      case "low":
        return hoursSinceLastPrompt >= 24; // Once per day
      case "high":
        return hoursSinceLastPrompt >= 1; // Once per hour
      default: // moderate
        return hoursSinceLastPrompt >= 4; // Every 4 hours
    }
  }

  /**
   * Mark a question as asked
   */
  markAsked(questionId) {
    const q = this.questionQueue.find(q => q.id === questionId);
    if (q) {
      q.status = "asked";
      q.askedAt = new Date().toISOString();
      this.lastPromptTime = q.askedAt;
      this.state.askedQuestions.push(q.question);
      this.saveState();
    }
  }

  /**
   * Record answer to a question
   */
  recordAnswer(questionId, answer) {
    const q = this.questionQueue.find(q => q.id === questionId);
    if (q) {
      q.status = "answered";
      q.answer = answer;
      q.answeredAt = new Date().toISOString();

      // Process the answer
      this.processAnswer(q, answer);

      this.saveState();
      this.emit("question-answered", q);
    }
  }

  /**
   * Process an answer and take action
   */
  processAnswer(question, answer) {
    // Update user profile if it's a profile question
    if (question.category === "profile" && this.conversationTracker) {
      this.conversationTracker.extractProfileInfo(answer);
    }

    // Check if onboarding is complete
    if (!this.state.onboardingComplete) {
      const pendingOnboarding = this.questionQueue.filter(
        q => QUESTION_TEMPLATES.onboarding.some(t => t.q === q.question) && q.status === "pending"
      );
      if (pendingOnboarding.length === 0) {
        this.state.onboardingComplete = true;
        this.emit("onboarding-complete");
      }
    }

    // Queue follow-up questions based on answer
    this.queueFollowUps(question, answer);
  }

  /**
   * Queue follow-up questions based on answer
   */
  queueFollowUps(question, answer) {
    const text = answer.toLowerCase();

    // Example follow-ups based on category
    if (question.category === "financial") {
      if (text.includes("no") && question.question.includes("emergency fund")) {
        this.queueQuestion(
          "Would you like help creating a savings plan for an emergency fund?",
          "financial",
          8
        );
      }
    }

    if (question.category === "health") {
      if (text.includes("stress") || text.includes("anxious")) {
        this.queueQuestion(
          "What's causing the most stress right now?",
          "health",
          7
        );
      }
    }

    if (question.category === "career") {
      if (text.includes("stuck") || text.includes("bored")) {
        this.queueQuestion(
          "Have you considered looking for new opportunities or learning new skills?",
          "career",
          6
        );
      }
    }
  }

  /**
   * Add a notification
   */
  notify(message, type = NOTIFICATION_TYPES.INFO, data = {}) {
    const notification = {
      id: `notif_${Date.now()}`,
      message,
      type,
      data,
      createdAt: new Date().toISOString(),
      read: false,
      sent: false
    };

    this.notificationQueue.push(notification);
    this.emit("notification", notification);

    return notification;
  }

  /**
   * Schedule periodic checks
   */
  async scheduleChecks() {
    // Check Polymarket every 2 days
    await this.scheduleCheckin("polymarket", 2 * 24 * 60 * 60 * 1000, async () => {
      if (this.polymarketService) {
        await this.polymarketService.refresh();
        const highImpact = this.polymarketService.getHighImpact(60);
        if (highImpact.length > 0) {
          this.notify(
            `${highImpact.length} high-impact events to watch on prediction markets`,
            NOTIFICATION_TYPES.IMPORTANT,
            { markets: highImpact.slice(0, 3) }
          );
        }
      }
    });

    // Check disaster risks daily
    await this.scheduleCheckin("disaster", 24 * 60 * 60 * 1000, async () => {
      if (this.disasterMonitor) {
        const display = this.disasterMonitor.getDisplayData();
        if (display.activeAlerts.length > 0) {
          this.notify(
            `${display.activeAlerts.length} active alerts require attention`,
            NOTIFICATION_TYPES.URGENT,
            { alerts: display.activeAlerts }
          );
        }
      }
    });

    // Life area check-ins (rotate through categories)
    const categories = ["financial", "health", "career", "family", "goals"];
    let categoryIndex = 0;

    await this.scheduleCheckin("life_areas", 3 * 24 * 60 * 60 * 1000, () => {
      const category = categories[categoryIndex];
      categoryIndex = (categoryIndex + 1) % categories.length;

      const templates = QUESTION_TEMPLATES[category] || [];
      if (templates.length > 0) {
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
        if (!this.state.askedQuestions.includes(randomTemplate.q)) {
          this.queueQuestion(randomTemplate.q, randomTemplate.category, randomTemplate.priority);
        }
      }
    });
  }

  /**
   * Schedule a periodic check-in
   */
  async scheduleCheckin(name, intervalMs, callback) {
    const lastCheckin = this.state.lastCheckins[name];
    const now = Date.now();

    // Check if it's time to run
    if (!lastCheckin || now - new Date(lastCheckin).getTime() >= intervalMs) {
      // Run the callback (properly await async callbacks)
      try {
        await callback();
      } catch (err) {
        console.error(`Checkin ${name} failed:`, err.message);
      }
      this.state.lastCheckins[name] = new Date().toISOString();
      this.saveState();
    }

    // Schedule next run
    this.scheduledCheckins.push({
      name,
      intervalMs,
      callback,
      nextRun: new Date(now + intervalMs).toISOString()
    });
  }

  /**
   * Run scheduled check-ins
   */
  async runScheduledCheckins() {
    const now = Date.now();

    for (const checkin of this.scheduledCheckins) {
      const lastRun = this.state.lastCheckins[checkin.name];
      if (!lastRun || now - new Date(lastRun).getTime() >= checkin.intervalMs) {
        try {
          await checkin.callback();
        } catch (err) {
          console.error(`Checkin ${checkin.name} failed:`, err.message);
        }
        this.state.lastCheckins[checkin.name] = new Date().toISOString();
        this.saveState();
      }
    }
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      nextQuestion: this.getNextQuestion(),
      pendingQuestions: this.questionQueue.filter(q => q.status === "pending").length,
      notifications: this.notificationQueue.filter(n => !n.read).slice(0, 5),
      onboardingComplete: this.state.onboardingComplete,
      lastPromptTime: this.lastPromptTime
    };
  }

  /**
   * Get the current prompt to show user (if any)
   */
  getCurrentPrompt() {
    const question = this.getNextQuestion();
    if (question) {
      return {
        type: "question",
        ...question
      };
    }

    const unreadNotifications = this.notificationQueue.filter(n => !n.read && !n.sent);
    if (unreadNotifications.length > 0) {
      return {
        type: "notification",
        ...unreadNotifications[0]
      };
    }

    return null;
  }
}

// Singleton
let instance = null;

export const getProactiveEngine = () => {
  if (!instance) {
    instance = new ProactiveEngine();
    // Initialize asynchronously - errors are caught within scheduleCheckin
    instance.initialize().catch(err => {
      console.error("ProactiveEngine initialization error:", err.message);
    });
  }
  return instance;
};

export default ProactiveEngine;
