/**
 * Real-Time Messaging Service
 *
 * Enables real-time two-way communication between users and their AI
 * using Firebase Firestore as the message bus.
 *
 * Architecture:
 * - Each user has their own Firestore path: /users/{userId}/messages
 * - User's local BACKBONE listens to their messages in real-time
 * - AI processes incoming messages and responds
 * - Works for 100+ users - each has isolated message stream
 *
 * Flow:
 * 1. User sends message via mobile/web app → writes to Firestore
 * 2. Local BACKBONE has listener on that path → receives message
 * 3. AI Brain processes message → generates response
 * 4. BACKBONE writes response to Firestore
 * 5. Mobile/web app displays response
 * 6. Optional: FCM push notification sent for offline users
 */

import fs from "fs";
import path from "path";
import https from "https";
import { EventEmitter } from "events";
import { trackUserQuery, QUERY_SOURCE } from "./query-tracker.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MESSAGING_STATE_PATH = path.join(DATA_DIR, "realtime-messaging.json");

// Firebase project config
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0",
  projectId: "backboneai"
};

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/**
 * Message types
 */
export const MESSAGE_TYPE = {
  USER: "user",           // Message from user
  AI: "ai",               // Message from AI
  SYSTEM: "system",       // System notification
  ACTION: "action",       // AI action notification (e.g., "Trading AAPL...")
  QUESTION: "question",   // AI asking user a question
  CONFIRMATION: "confirm" // Confirmation request
};

/**
 * Message status
 */
export const MESSAGE_STATUS = {
  PENDING: "pending",     // Not yet processed
  PROCESSING: "processing", // AI is working on it
  COMPLETED: "completed", // Processed and responded
  FAILED: "failed",       // Processing failed
  READ: "read"            // User has read the response
};

/**
 * Presence status
 */
export const PRESENCE_STATUS = {
  ONLINE: "online",       // AI is running and listening
  BUSY: "busy",           // AI is processing a task
  OFFLINE: "offline",     // AI is not running
  AWAY: "away"            // AI running but user inactive
};

/**
 * Parse Firestore document fields to plain object
 */
const parseFirestoreFields = (fields) => {
  const result = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value.stringValue !== undefined) {
      result[key] = value.stringValue;
    } else if (value.integerValue !== undefined) {
      result[key] = parseInt(value.integerValue, 10);
    } else if (value.booleanValue !== undefined) {
      result[key] = value.booleanValue;
    } else if (value.doubleValue !== undefined) {
      result[key] = value.doubleValue;
    } else if (value.timestampValue !== undefined) {
      result[key] = value.timestampValue;
    } else if (value.mapValue !== undefined) {
      result[key] = parseFirestoreFields(value.mapValue.fields);
    } else if (value.arrayValue !== undefined) {
      result[key] = (value.arrayValue.values || []).map(v => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
        if (v.mapValue !== undefined) return parseFirestoreFields(v.mapValue.fields);
        return v;
      });
    }
  }
  return result;
};

/**
 * Convert plain object to Firestore fields format
 */
const toFirestoreFields = (obj) => {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "number") {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: String(value) };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(v => {
            if (typeof v === "string") return { stringValue: v };
            if (typeof v === "number") return { integerValue: String(v) };
            if (typeof v === "object") return { mapValue: { fields: toFirestoreFields(v) } };
            return { stringValue: String(v) };
          })
        }
      };
    } else if (typeof value === "object") {
      fields[key] = { mapValue: { fields: toFirestoreFields(value) } };
    }
  }
  return fields;
};

/**
 * Real-Time Messaging Service
 */
export class RealtimeMessaging extends EventEmitter {
  constructor() {
    super();
    this.userId = null;
    this.authToken = null;
    this.listening = false;
    this.pollInterval = null;
    this.pollTimeout = null;
    this.pollingMode = "idle";          // "idle" or "active"
    this.lastActivityTime = null;       // Last time a message was received
    this.lastMessageTime = null;
    this.messageHandler = null;
    this.presence = PRESENCE_STATUS.OFFLINE;
    this.processedMessageIds = new Set();

    this.loadState();
  }

  /**
   * Load saved state
   */
  loadState() {
    try {
      if (fs.existsSync(MESSAGING_STATE_PATH)) {
        const data = JSON.parse(fs.readFileSync(MESSAGING_STATE_PATH, "utf-8"));
        this.userId = data.userId || null;
        this.lastMessageTime = data.lastMessageTime || null;
        this.processedMessageIds = new Set(data.processedMessageIds || []);
      }
    } catch (err) {
      console.error("[RealtimeMessaging] Failed to load state:", err.message);
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
      fs.writeFileSync(MESSAGING_STATE_PATH, JSON.stringify({
        userId: this.userId,
        lastMessageTime: this.lastMessageTime,
        processedMessageIds: Array.from(this.processedMessageIds).slice(-100) // Keep last 100
      }, null, 2));
    } catch (err) {
      console.error("[RealtimeMessaging] Failed to save state:", err.message);
    }
  }

  /**
   * Initialize with user credentials
   * @param {string} userId - Firebase user ID
   * @param {string} authToken - Firebase ID token (optional for public access)
   */
  async initialize(userId, authToken = null) {
    if (!userId) {
      return { success: false, error: "User ID is required" };
    }

    this.userId = userId;
    this.authToken = authToken;
    this.saveState();

    // Update presence to online
    await this.updatePresence(PRESENCE_STATUS.ONLINE);

    this.emit("initialized", { userId });
    return { success: true, userId };
  }

  /**
   * Set the message handler function
   * This is called when a new user message arrives
   * @param {Function} handler - async function(message) => response
   */
  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  /**
   * Smart Polling Configuration
   * - Idle mode: Poll every 3 minutes (cost efficient when no activity)
   * - Active mode: Poll every 10 seconds (responsive when chatting)
   * - Returns to idle after 10 minutes of no activity
   */
  static POLL_CONFIG = {
    IDLE_INTERVAL: 3 * 60 * 1000,      // 3 minutes
    ACTIVE_INTERVAL: 10 * 1000,         // 10 seconds
    ACTIVE_TIMEOUT: 10 * 60 * 1000      // 10 minutes until back to idle
  };

  // Track next poll time for countdown display
  nextPollTime = null;
  lastPollTime = null;

  /**
   * Start listening for incoming messages
   * Uses smart polling: slow when idle, fast when active
   */
  async startListening(options = {}) {
    if (this.listening) {
      return { success: true, message: "Already listening" };
    }

    if (!this.userId) {
      return { success: false, error: "Not initialized. Call initialize() first" };
    }

    this.listening = true;
    this.pollingMode = "idle";
    this.lastActivityTime = null;
    this.emit("listening-started");

    // Start in idle mode (poll every 3 minutes)
    this.schedulePoll();

    // Initial check
    await this.checkForNewMessages();

    console.log(`[RealtimeMessaging] Smart polling started (idle: 3min, active: 10sec)`);
    return { success: true };
  }

  /**
   * Schedule the next poll based on current mode
   */
  schedulePoll() {
    if (!this.listening) return;

    // Clear existing timer
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    // Check if we should switch back to idle mode
    if (this.pollingMode === "active" && this.lastActivityTime) {
      const timeSinceActivity = Date.now() - this.lastActivityTime;
      if (timeSinceActivity > RealtimeMessaging.POLL_CONFIG.ACTIVE_TIMEOUT) {
        this.pollingMode = "idle";
        console.log("[RealtimeMessaging] Switching to idle mode (no activity for 10 min)");
        this.emit("polling-mode-changed", { mode: "idle" });
      }
    }

    // Determine interval based on mode
    const interval = this.pollingMode === "active"
      ? RealtimeMessaging.POLL_CONFIG.ACTIVE_INTERVAL
      : RealtimeMessaging.POLL_CONFIG.IDLE_INTERVAL;

    // Track next poll time for countdown display
    this.nextPollTime = Date.now() + interval;
    this.emit("poll-scheduled", { nextPollTime: this.nextPollTime, interval });

    // Schedule next poll
    this.pollTimeout = setTimeout(async () => {
      if (this.listening) {
        this.lastPollTime = Date.now();
        await this.checkForNewMessages();
        this.schedulePoll(); // Schedule the next one
      }
    }, interval);
  }

  /**
   * Get time until next poll in seconds
   */
  getSecondsUntilNextPoll() {
    if (!this.nextPollTime || !this.listening) return null;
    const remaining = Math.max(0, this.nextPollTime - Date.now());
    return Math.ceil(remaining / 1000);
  }

  /**
   * Get formatted countdown string (e.g., "2:35")
   */
  getPollCountdown() {
    const seconds = this.getSecondsUntilNextPoll();
    if (seconds === null) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Switch to active polling mode (called when message received)
   */
  activatePolling() {
    if (this.pollingMode !== "active") {
      this.pollingMode = "active";
      console.log("[RealtimeMessaging] Switching to active mode (10 sec polling)");
      this.emit("polling-mode-changed", { mode: "active" });

      // Reschedule with shorter interval
      this.schedulePoll();
    }
    this.lastActivityTime = Date.now();
  }

  /**
   * Stop listening for messages
   */
  async stopListening() {
    this.listening = false;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Update presence to offline
    await this.updatePresence(PRESENCE_STATUS.OFFLINE);

    this.emit("listening-stopped");
    return { success: true };
  }

  /**
   * Check for new messages from Firestore
   */
  async checkForNewMessages() {
    if (!this.listening || !this.userId) return;

    try {
      // Query for unprocessed messages from user
      const messagesUrl = `${FIRESTORE_BASE_URL}/users/${this.userId}/messages?key=${FIREBASE_CONFIG.apiKey}`;
      const response = await this.fetchWithAuth(messagesUrl);

      if (!response.ok) {
        if (response.status === 404) {
          // No messages collection yet - that's OK
          return;
        }
        throw new Error(`Firestore error: ${response.status}`);
      }

      const data = await response.json();
      const documents = data.documents || [];

      // Process each message
      for (const doc of documents) {
        const messageId = doc.name.split("/").pop();
        const message = parseFirestoreFields(doc.fields);

        // Skip if already processed
        if (this.processedMessageIds.has(messageId)) {
          continue;
        }

        // Skip private messages from showing in app (but still process them)
        // Private messages have showInApp: false
        if (message.private === true || message.showInApp === false) {
          this.processedMessageIds.add(messageId);
          continue;
        }

        // Skip if not a user message or already completed
        if (message.type !== MESSAGE_TYPE.USER) {
          // For WhatsApp AI responses, emit them to show in conversation
          if (message.type === MESSAGE_TYPE.AI && message.channel?.includes("whatsapp")) {
            this.emit("whatsapp-response", {
              messageId,
              content: message.content,
              channel: message.channel,
              timestamp: message.createdAt
            });
          }
          this.processedMessageIds.add(messageId);
          continue;
        }
        if (message.status === MESSAGE_STATUS.COMPLETED ||
            message.status === MESSAGE_STATUS.PROCESSING) {
          continue;
        }

        // Found a new message - switch to active polling mode
        this.activatePolling();

        // Process this message
        await this.processMessage(messageId, message);
      }

    } catch (error) {
      console.error("[RealtimeMessaging] Error checking messages:", error.message);
    }
  }

  /**
   * Process an incoming message
   */
  async processMessage(messageId, message) {
    console.log(`[RealtimeMessaging] Processing message: ${message.content?.substring(0, 50)}...`);

    // Mark as processing
    await this.updateMessageStatus(messageId, MESSAGE_STATUS.PROCESSING);
    this.processedMessageIds.add(messageId);
    this.saveState();

    // Update presence to busy
    await this.updatePresence(PRESENCE_STATUS.BUSY);

    // Track query for goals/insights analysis
    if (message.content && message.content.trim()) {
      trackUserQuery(message.content, QUERY_SOURCE.API, {
        messageId,
        userId: this.userId,
        source: message.source || "realtime"
      });
    }

    this.emit("message-received", { messageId, message });

    try {
      let response = null;

      // Call the message handler if set
      if (this.messageHandler) {
        response = await this.messageHandler(message);
      } else {
        response = {
          content: "I received your message but no handler is configured.",
          type: MESSAGE_TYPE.SYSTEM
        };
      }

      // Send the response
      await this.sendMessage(response.content, {
        type: response.type || MESSAGE_TYPE.AI,
        replyTo: messageId,
        metadata: response.metadata
      });

      // Mark original as completed
      await this.updateMessageStatus(messageId, MESSAGE_STATUS.COMPLETED);

      this.emit("message-processed", { messageId, response });

    } catch (error) {
      console.error("[RealtimeMessaging] Error processing message:", error.message);

      // Mark as failed
      await this.updateMessageStatus(messageId, MESSAGE_STATUS.FAILED, error.message);

      // Send error response
      await this.sendMessage("Sorry, I encountered an error processing your message.", {
        type: MESSAGE_TYPE.SYSTEM,
        replyTo: messageId,
        error: error.message
      });
    }

    // Update presence back to online
    await this.updatePresence(PRESENCE_STATUS.ONLINE);
  }

  /**
   * Send a message to the user
   */
  async sendMessage(content, options = {}) {
    if (!this.userId) {
      return { success: false, error: "Not initialized" };
    }

    const message = {
      content,
      type: options.type || MESSAGE_TYPE.AI,
      status: MESSAGE_STATUS.COMPLETED,
      replyTo: options.replyTo || null,
      metadata: options.metadata || {},
      error: options.error || null,
      createdAt: new Date().toISOString(),
      fromAI: true
    };

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/messages/${messageId}?key=${FIREBASE_CONFIG.apiKey}`;
      const response = await this.fetchWithAuth(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: toFirestoreFields(message) })
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      this.emit("message-sent", { messageId, content });
      return { success: true, messageId };

    } catch (error) {
      console.error("[RealtimeMessaging] Error sending message:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a message's status
   */
  async updateMessageStatus(messageId, status, error = null) {
    try {
      const updateMask = error
        ? "updateMask.fieldPaths=status&updateMask.fieldPaths=error&updateMask.fieldPaths=processedAt"
        : "updateMask.fieldPaths=status&updateMask.fieldPaths=processedAt";

      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/messages/${messageId}?${updateMask}&key=${FIREBASE_CONFIG.apiKey}`;

      const fields = {
        status: { stringValue: status },
        processedAt: { timestampValue: new Date().toISOString() }
      };

      if (error) {
        fields.error = { stringValue: error };
      }

      await this.fetchWithAuth(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields })
      });

    } catch (err) {
      console.error("[RealtimeMessaging] Error updating status:", err.message);
    }
  }

  /**
   * Update presence status
   */
  async updatePresence(status) {
    if (!this.userId) return;

    this.presence = status;

    try {
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/presence/status?key=${FIREBASE_CONFIG.apiKey}`;
      const response = await this.fetchWithAuth(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: toFirestoreFields({
            status,
            lastSeen: new Date().toISOString(),
            platform: "backbone-cli"
          })
        })
      });

      if (!response.ok && response.status !== 404) {
        console.error("[RealtimeMessaging] Failed to update presence:", response.status);
      }
    } catch (err) {
      // Presence update is non-critical
    }
  }

  /**
   * Send a push notification to the user's devices
   */
  async sendPushNotification(title, body, data = {}) {
    // Queue notification in Firestore - Firebase Function will send it
    if (!this.userId) return { success: false, error: "Not initialized" };

    try {
      const notificationId = `notif_${Date.now()}`;
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/notifications/${notificationId}?key=${FIREBASE_CONFIG.apiKey}`;

      const notification = {
        title,
        body,
        data,
        createdAt: new Date().toISOString(),
        sent: false
      };

      await this.fetchWithAuth(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: toFirestoreFields(notification) })
      });

      return { success: true, notificationId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Ask the user a question and wait for response
   */
  async askUser(question, options = {}) {
    const result = await this.sendMessage(question, {
      type: MESSAGE_TYPE.QUESTION,
      metadata: {
        expectsReply: true,
        timeout: options.timeout || 300000, // 5 minutes default
        options: options.choices || null
      }
    });

    if (options.sendPush !== false) {
      await this.sendPushNotification(
        "Question from BACKBONE",
        question.substring(0, 100),
        { type: "question", messageId: result.messageId }
      );
    }

    return result;
  }

  /**
   * Request confirmation from user
   */
  async requestConfirmation(action, details) {
    const message = `Please confirm: ${action}\n\n${details}\n\nReply YES to confirm or NO to cancel.`;

    return this.sendMessage(message, {
      type: MESSAGE_TYPE.CONFIRMATION,
      metadata: {
        action,
        details,
        expectsReply: true,
        validResponses: ["yes", "no", "confirm", "cancel"]
      }
    });
  }

  /**
   * Notify user of an action being taken
   */
  async notifyAction(action, status = "in_progress") {
    return this.sendMessage(`Action: ${action}`, {
      type: MESSAGE_TYPE.ACTION,
      metadata: { action, status }
    });
  }

  /**
   * Fetch with optional auth header
   */
  async fetchWithAuth(url, options = {}) {
    const headers = { ...options.headers };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    return fetch(url, { ...options, headers });
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(limit = 50) {
    if (!this.userId) return [];

    try {
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/messages?pageSize=${limit}&orderBy=createdAt%20desc&key=${FIREBASE_CONFIG.apiKey}`;
      const response = await this.fetchWithAuth(url);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const documents = data.documents || [];

      return documents.map(doc => ({
        id: doc.name.split("/").pop(),
        ...parseFirestoreFields(doc.fields)
      })).reverse();

    } catch (error) {
      console.error("[RealtimeMessaging] Error getting history:", error.message);
      return [];
    }
  }

  /**
   * Get status
   */
  getStatus() {
    const timeSinceActivity = this.lastActivityTime
      ? Math.round((Date.now() - this.lastActivityTime) / 1000)
      : null;

    return {
      initialized: !!this.userId,
      userId: this.userId,
      listening: this.listening,
      presence: this.presence,
      pollingMode: this.pollingMode,
      pollInterval: this.pollingMode === "active"
        ? RealtimeMessaging.POLL_CONFIG.ACTIVE_INTERVAL / 1000 + "s"
        : RealtimeMessaging.POLL_CONFIG.IDLE_INTERVAL / 1000 + "s",
      lastActivitySecondsAgo: timeSinceActivity,
      processedCount: this.processedMessageIds.size,
      nextPollCountdown: this.getPollCountdown(),
      nextPollSeconds: this.getSecondsUntilNextPoll(),
      lastPollTime: this.lastPollTime
    };
  }

  /**
   * Clear conversation history (useful for testing)
   */
  async clearHistory() {
    // Note: This would need to delete all documents in the messages subcollection
    // For now, just clear local state
    this.processedMessageIds.clear();
    this.lastMessageTime = null;
    this.saveState();
    return { success: true };
  }

  /**
   * Register user's WhatsApp phone number in Firestore
   * This creates/updates the user document so the webhook can route messages correctly
   *
   * @param {string} phoneNumber - Verified phone number in E.164 format (e.g., +15551234567)
   * @param {Object} userData - Optional additional user data (name, email, etc.)
   * @returns {Promise<Object>} Result with success status
   */
  async registerUserPhone(phoneNumber, userData = {}) {
    if (!this.userId) {
      return { success: false, error: "Not initialized. Call initialize() first." };
    }

    if (!phoneNumber) {
      return { success: false, error: "Phone number is required" };
    }

    // Normalize phone number (remove spaces, ensure + prefix)
    let normalized = phoneNumber.replace(/[^\d+]/g, "");
    if (!normalized.startsWith("+")) {
      if (normalized.length === 10) {
        normalized = "+1" + normalized;
      } else if (normalized.length === 11 && normalized.startsWith("1")) {
        normalized = "+" + normalized;
      }
    }

    try {
      // Create/update user document with whatsappPhone field
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}?key=${FIREBASE_CONFIG.apiKey}`;

      const userFields = {
        whatsappPhone: normalized,
        updatedAt: new Date().toISOString(),
        source: "backbone-cli",
        ...userData
      };

      const response = await this.fetchWithAuth(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: toFirestoreFields(userFields)
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to register phone: ${response.status} - ${errorText}`);
      }

      console.log(`[RealtimeMessaging] User phone registered in Firestore: ${normalized}`);
      this.emit("phone-registered", { userId: this.userId, phoneNumber: normalized });

      return {
        success: true,
        userId: this.userId,
        phoneNumber: normalized
      };

    } catch (error) {
      console.error("[RealtimeMessaging] Error registering phone:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user document from Firestore
   */
  async getUserDocument() {
    if (!this.userId) return null;

    try {
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}?key=${FIREBASE_CONFIG.apiKey}`;
      const response = await this.fetchWithAuth(url);

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to get user: ${response.status}`);
      }

      const data = await response.json();
      return parseFirestoreFields(data.fields);

    } catch (error) {
      console.error("[RealtimeMessaging] Error getting user:", error.message);
      return null;
    }
  }
}

// Singleton instance
let instance = null;

export const getRealtimeMessaging = () => {
  if (!instance) {
    instance = new RealtimeMessaging();
  }
  return instance;
};

/**
 * Quick setup function
 * Call this from app.js to enable real-time messaging
 */
export const setupRealtimeMessaging = async (userId, messageHandler) => {
  const messaging = getRealtimeMessaging();

  await messaging.initialize(userId);
  messaging.setMessageHandler(messageHandler);
  await messaging.startListening();

  return messaging;
};

export default RealtimeMessaging;
