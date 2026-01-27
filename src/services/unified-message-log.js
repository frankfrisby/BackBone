/**
 * Unified Message Log Service
 *
 * Maintains a single conversation history across all channels (chat, WhatsApp).
 * The AI sees one unified conversation but messages are tagged with their source.
 *
 * Features:
 * - Unified log for chat + WhatsApp messages
 * - Source tracking (chat vs whatsapp)
 * - Automatic compaction (keep 50 messages, compact every 25 older ones)
 * - Integration with AI brain for context
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const MESSAGE_LOG_PATH = path.join(DATA_DIR, "unified-message-log.json");

/**
 * Message channels
 */
export const MESSAGE_CHANNEL = {
  CHAT: "chat",           // CLI chat input
  WHATSAPP: "whatsapp",   // WhatsApp messages
  SYSTEM: "system",       // System notifications
  PROACTIVE: "proactive"  // AI-initiated messages
};

/**
 * Message roles
 */
export const MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system"
};

/**
 * Configuration
 */
const CONFIG = {
  MAX_MESSAGES: 50,           // Keep this many recent messages
  COMPACT_THRESHOLD: 25,      // Compact when we have this many old messages
  COMPACT_BATCH_SIZE: 25      // How many messages to compact at once
};

/**
 * Unified Message Log
 */
class UnifiedMessageLog extends EventEmitter {
  constructor() {
    super();
    this.messages = [];
    this.compactedSummaries = [];
    this.lastCompactTime = null;
    this.loadState();
  }

  /**
   * Load saved state
   */
  loadState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(MESSAGE_LOG_PATH)) {
        const data = JSON.parse(fs.readFileSync(MESSAGE_LOG_PATH, "utf-8"));
        this.messages = data.messages || [];
        this.compactedSummaries = data.compactedSummaries || [];
        this.lastCompactTime = data.lastCompactTime || null;
      }
    } catch (err) {
      console.error("[UnifiedMessageLog] Failed to load state:", err.message);
      this.messages = [];
      this.compactedSummaries = [];
    }
  }

  /**
   * Save state
   */
  saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(MESSAGE_LOG_PATH, JSON.stringify({
        messages: this.messages,
        compactedSummaries: this.compactedSummaries,
        lastCompactTime: this.lastCompactTime
      }, null, 2));
    } catch (err) {
      console.error("[UnifiedMessageLog] Failed to save state:", err.message);
    }
  }

  /**
   * Add a message to the log
   * @param {string} role - "user" or "assistant" or "system"
   * @param {string} content - Message content
   * @param {Object} options - Additional options
   * @param {string} options.channel - "chat" | "whatsapp" | "system" | "proactive"
   * @param {Object} options.metadata - Additional metadata
   */
  addMessage(role, content, options = {}) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role,
      content,
      channel: options.channel || MESSAGE_CHANNEL.CHAT,
      timestamp: new Date().toISOString(),
      metadata: options.metadata || {},
      notifiedViaWhatsApp: options.notifiedViaWhatsApp || false
    };

    this.messages.push(message);
    this.emit("message-added", message);

    // Check if we need to compact
    if (this.messages.length > CONFIG.MAX_MESSAGES + CONFIG.COMPACT_THRESHOLD) {
      this.compactOldMessages();
    }

    this.saveState();
    return message;
  }

  /**
   * Add a user message (from chat or WhatsApp)
   */
  addUserMessage(content, channel = MESSAGE_CHANNEL.CHAT, metadata = {}) {
    return this.addMessage(MESSAGE_ROLE.USER, content, { channel, metadata });
  }

  /**
   * Add an AI response
   */
  addAssistantMessage(content, channel = MESSAGE_CHANNEL.CHAT, metadata = {}) {
    return this.addMessage(MESSAGE_ROLE.ASSISTANT, content, { channel, metadata });
  }

  /**
   * Add a system message
   */
  addSystemMessage(content, metadata = {}) {
    return this.addMessage(MESSAGE_ROLE.SYSTEM, content, {
      channel: MESSAGE_CHANNEL.SYSTEM,
      metadata
    });
  }

  /**
   * Compact old messages into summaries
   * Keeps the most recent MAX_MESSAGES and summarizes older ones
   */
  compactOldMessages() {
    if (this.messages.length <= CONFIG.MAX_MESSAGES) {
      return { compacted: false };
    }

    const messagesToCompact = this.messages.slice(0, CONFIG.COMPACT_BATCH_SIZE);
    const messagesToKeep = this.messages.slice(CONFIG.COMPACT_BATCH_SIZE);

    // Create a summary of the compacted messages
    const summary = this.createSummary(messagesToCompact);

    this.compactedSummaries.push(summary);
    this.messages = messagesToKeep;
    this.lastCompactTime = new Date().toISOString();

    this.emit("messages-compacted", {
      compactedCount: messagesToCompact.length,
      summary
    });

    this.saveState();
    return { compacted: true, count: messagesToCompact.length };
  }

  /**
   * Create a summary of messages for compaction
   */
  createSummary(messages) {
    const userMessages = messages.filter(m => m.role === MESSAGE_ROLE.USER);
    const assistantMessages = messages.filter(m => m.role === MESSAGE_ROLE.ASSISTANT);

    const chatCount = messages.filter(m => m.channel === MESSAGE_CHANNEL.CHAT).length;
    const whatsappCount = messages.filter(m => m.channel === MESSAGE_CHANNEL.WHATSAPP).length;

    const timeRange = {
      start: messages[0]?.timestamp,
      end: messages[messages.length - 1]?.timestamp
    };

    // Extract key topics/themes (simple keyword extraction)
    const allContent = messages.map(m => m.content).join(" ");
    const topics = this.extractTopics(allContent);

    return {
      id: `summary_${Date.now()}`,
      messageCount: messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      chatCount,
      whatsappCount,
      timeRange,
      topics,
      createdAt: new Date().toISOString(),
      // Keep a condensed version of the conversation
      condensed: this.condenseMessages(messages)
    };
  }

  /**
   * Extract key topics from content (simple implementation)
   */
  extractTopics(content) {
    // Common words to ignore
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "shall", "can", "to", "of", "in",
      "for", "on", "with", "at", "by", "from", "as", "into", "through",
      "during", "before", "after", "above", "below", "between", "under",
      "again", "further", "then", "once", "here", "there", "when", "where",
      "why", "how", "all", "each", "few", "more", "most", "other", "some",
      "such", "no", "nor", "not", "only", "own", "same", "so", "than",
      "too", "very", "just", "and", "but", "if", "or", "because", "until",
      "while", "about", "what", "which", "who", "this", "that", "these",
      "those", "am", "it", "its", "i", "you", "your", "we", "they", "them",
      "my", "me", "he", "she", "him", "her", "his", "our", "their"
    ]);

    const words = content.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    // Count word frequency
    const freq = {};
    words.forEach(w => {
      freq[w] = (freq[w] || 0) + 1;
    });

    // Return top 5 topics
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Condense messages into a shorter summary
   */
  condenseMessages(messages) {
    return messages.map(m => ({
      role: m.role,
      channel: m.channel,
      // Keep first 100 chars of each message
      content: m.content.length > 100
        ? m.content.substring(0, 100) + "..."
        : m.content,
      timestamp: m.timestamp
    }));
  }

  /**
   * Get recent messages for AI context
   * @param {number} limit - Number of messages to return
   * @returns {Array} Recent messages
   */
  getRecentMessages(limit = CONFIG.MAX_MESSAGES) {
    return this.messages.slice(-limit);
  }

  /**
   * Get messages formatted for AI (with channel context)
   */
  getMessagesForAI(limit = CONFIG.MAX_MESSAGES) {
    const recent = this.getRecentMessages(limit);

    return recent.map(m => {
      // Add channel indicator for AI context
      const channelPrefix = m.channel === MESSAGE_CHANNEL.WHATSAPP
        ? "[via WhatsApp] "
        : m.channel === MESSAGE_CHANNEL.PROACTIVE
          ? "[proactive notification] "
          : "";

      return {
        role: m.role,
        content: channelPrefix + m.content
      };
    });
  }

  /**
   * Get full context including compacted summaries
   */
  getFullContext() {
    return {
      summaries: this.compactedSummaries,
      recentMessages: this.messages,
      stats: this.getStats()
    };
  }

  /**
   * Get message statistics
   */
  getStats() {
    const chatMessages = this.messages.filter(m => m.channel === MESSAGE_CHANNEL.CHAT);
    const whatsappMessages = this.messages.filter(m => m.channel === MESSAGE_CHANNEL.WHATSAPP);

    return {
      totalMessages: this.messages.length,
      chatMessages: chatMessages.length,
      whatsappMessages: whatsappMessages.length,
      compactedSummaries: this.compactedSummaries.length,
      lastCompactTime: this.lastCompactTime
    };
  }

  /**
   * Get last N WhatsApp messages
   */
  getWhatsAppMessages(limit = 10) {
    return this.messages
      .filter(m => m.channel === MESSAGE_CHANNEL.WHATSAPP)
      .slice(-limit);
  }

  /**
   * Mark a message as notified via WhatsApp
   */
  markAsNotifiedViaWhatsApp(messageId) {
    const message = this.messages.find(m => m.id === messageId);
    if (message) {
      message.notifiedViaWhatsApp = true;
      this.saveState();
    }
  }

  /**
   * Clear all messages (for testing)
   */
  clear() {
    this.messages = [];
    this.compactedSummaries = [];
    this.lastCompactTime = null;
    this.saveState();
  }
}

// Singleton instance
let instance = null;

export const getUnifiedMessageLog = () => {
  if (!instance) {
    instance = new UnifiedMessageLog();
  }
  return instance;
};

export default UnifiedMessageLog;
