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
import { trackUserQuery, QUERY_SOURCE } from "../memory/query-tracker.js";
import { loadFirebaseUser } from "../firebase/firebase-auth.js";
import { getActionApproval, processApprovalResponse } from "../action-approval.js";
import { getWhatsAppNotifications } from "./whatsapp-notifications.js";
import { MESSAGE_CHANNEL } from "./unified-message-log.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
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
    this.presenceHeartbeatTimer = null;
    this.pendingTasksTimer = null;
    this.pollingMode = "idle";          // "idle" or "active"
    this.lastActivityTime = null;       // Last time a message was received
    this.lastMessageTime = null;
    this.messageHandler = null;
    this.presence = PRESENCE_STATUS.OFFLINE;
    this.processedMessageIds = new Set();
    this.processedTaskIds = new Set();

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
    if (!authToken) {
      const user = loadFirebaseUser();
      authToken = user?.idToken || null;
    }
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

    // Start presence heartbeat (every 2 minutes keeps us "online" for the cloud function)
    this.startPresenceHeartbeat();

    // Start pending tasks processor (checks every 30s for tasks queued by cloud function)
    this.startPendingTasksProcessor();

    // Initial check
    await this.checkForNewMessages();

    // Also check for pending tasks immediately
    await this.processPendingTasks();

    console.log(`[RealtimeMessaging] Smart polling started (idle: 3min, active: 10sec, heartbeat: 2min)`);
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

    // Schedule next poll — ensure schedulePoll is ALWAYS called to prevent staleness
    this.pollTimeout = setTimeout(async () => {
      if (this.listening) {
        this.lastPollTime = Date.now();
        try {
          await this.checkForNewMessages();
        } catch (err) {
          console.error("[RealtimeMessaging] Poll error:", err.message);
        }
        // Always schedule next poll even if there was an error
        this.schedulePoll();
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
   * Start presence heartbeat — keeps Firestore presence fresh so the cloud
   * function knows we're online and sends typing indicator instead of GPT response.
   * Cloud function considers us offline if lastSeen > 5 minutes ago.
   * We heartbeat every 2 minutes to stay well within that window.
   */
  startPresenceHeartbeat() {
    if (this.presenceHeartbeatTimer) clearInterval(this.presenceHeartbeatTimer);

    const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes

    this.presenceHeartbeatTimer = setInterval(async () => {
      if (!this.listening) return;
      try {
        await this.updatePresence(this.presence === PRESENCE_STATUS.BUSY
          ? PRESENCE_STATUS.BUSY
          : PRESENCE_STATUS.ONLINE);
      } catch (err) {
        // Non-critical — will retry next interval
      }
    }, HEARTBEAT_INTERVAL);

    console.log("[RealtimeMessaging] Presence heartbeat started (every 2 min)");
  }

  /**
   * Start pending tasks processor — picks up whatsapp_followup tasks
   * queued by the cloud function when it responded with OpenAI.
   * The local BACKBONE processes these with full context and sends a richer follow-up.
   */
  startPendingTasksProcessor() {
    if (this.pendingTasksTimer) clearInterval(this.pendingTasksTimer);

    const TASK_CHECK_INTERVAL = 30 * 1000; // 30 seconds

    this.pendingTasksTimer = setInterval(async () => {
      if (!this.listening) return;
      try {
        await this.processPendingTasks();
      } catch (err) {
        // Non-critical
      }
    }, TASK_CHECK_INTERVAL);
  }

  /**
   * Process pending tasks from Firestore (queued by cloud function).
   * These are follow-up tasks where the cloud gave a quick OpenAI answer
   * and the local BACKBONE should provide a richer response with full context.
   */
  async processPendingTasks() {
    if (!this.userId || !this.messageHandler) return;

    try {
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/pendingTasks?key=${FIREBASE_CONFIG.apiKey}`;
      const response = await this.fetchWithAuth(url);

      if (!response.ok) {
        if (response.status === 404) return; // No collection yet
        return;
      }

      const data = await response.json();
      const documents = data.documents || [];

      for (const doc of documents) {
        const taskId = doc.name.split("/").pop();
        const task = parseFirestoreFields(doc.fields);

        // Skip if already processed or not a whatsapp followup
        if (task.status !== "pending" || this.processedTaskIds.has(taskId)) continue;
        if (task.type !== "whatsapp_followup") {
          this.processedTaskIds.add(taskId);
          continue;
        }

        // Skip if the task is old (> 30 minutes) — the user has moved on
        if (task.createdAt) {
          const taskAge = Date.now() - new Date(task.createdAt).getTime();
          if (taskAge > 30 * 60 * 1000) {
            this.processedTaskIds.add(taskId);
            // Mark as expired in Firestore
            await this.updatePendingTaskStatus(taskId, "expired");
            continue;
          }
        }

        console.log(`[RealtimeMessaging] Processing pending task: "${(task.originalMessage || "").slice(0, 60)}"`);

        // Mark task as processing
        this.processedTaskIds.add(taskId);
        await this.updatePendingTaskStatus(taskId, "processing");

        try {
          // Inject conversation context from the cloud function
          const message = {
            content: task.originalMessage || "",
            from: task.from || "whatsapp",
            channel: "twilio_whatsapp",
            conversationContext: task.conversationContext || null,
            source: "pending_task_followup",
          };

          // Process with the local message handler (full BACKBONE context)
          const result = await this.messageHandler(message);

          if (result?.content) {
            // Check if the cloud already gave the same answer — don't send duplicates
            const cloudResponse = (task.aiQuickResponse || "").toLowerCase().trim();
            const localResponse = result.content.toLowerCase().trim();

            // Only send follow-up if the local response is substantially different
            const isDifferent = !cloudResponse ||
              cloudResponse.includes("let me") ||
              cloudResponse.includes("give me a") ||
              cloudResponse.includes("working on") ||
              cloudResponse.includes("pulling up") ||
              cloudResponse.includes("i'll get back") ||
              localResponse.length > cloudResponse.length * 1.5;

            if (isDifferent && task.requiresFollowUp) {
              const formattedResponse = result.content;

              // Send via Twilio directly — ONE send path only
              let sentViaTwilio = false;
              try {
                const { getTwilioWhatsApp } = await import("./twilio-whatsapp.js");
                const wa = getTwilioWhatsApp();
                if (wa.initialized && task.from) {
                  const { formatAIResponse, chunkMessage } = await import("./whatsapp-formatter.js");
                  const formatted = formatAIResponse(formattedResponse);
                  const chunks = chunkMessage(formatted, 1500);
                  for (const chunk of chunks) {
                    await wa.sendMessage(task.from, chunk);
                    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
                  }
                  sentViaTwilio = true;
                  console.log(`[RealtimeMessaging] Sent follow-up response for pending task`);
                }
              } catch (sendErr) {
                console.warn("[RealtimeMessaging] Failed to send follow-up via Twilio:", sendErr.message);
              }

              // Save to Firestore for conversation history only (NOT for re-sending)
              // sendToWhatsApp=false prevents Firebase Function from sending again
              await this.sendMessage(formattedResponse, {
                type: MESSAGE_TYPE.AI,
                sendToWhatsApp: !sentViaTwilio, // Only use Firebase send if Twilio failed
                channel: sentViaTwilio ? undefined : "twilio_whatsapp_response",
                metadata: { source: "local_followup", pendingTaskId: taskId, sentViaTwilio },
              });
            }
          }

          await this.updatePendingTaskStatus(taskId, "completed");
        } catch (err) {
          console.error("[RealtimeMessaging] Pending task processing error:", err.message);
          await this.updatePendingTaskStatus(taskId, "failed", err.message);
        }
      }

      // Trim processedTaskIds to prevent unbounded growth
      if (this.processedTaskIds.size > 200) {
        const arr = [...this.processedTaskIds];
        this.processedTaskIds = new Set(arr.slice(-100));
      }
    } catch (err) {
      // Silent — will retry next interval
    }
  }

  /**
   * Update a pending task's status in Firestore
   */
  async updatePendingTaskStatus(taskId, status, error = null) {
    try {
      const fieldPaths = ["status", "processedAt"];
      if (error) fieldPaths.push("error");
      const updateMask = fieldPaths.map(p => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/pendingTasks/${taskId}?${updateMask}&key=${FIREBASE_CONFIG.apiKey}`;

      const fields = {
        status: { stringValue: status },
        processedAt: { timestampValue: new Date().toISOString() },
      };
      if (error) fields.error = { stringValue: error };

      await this.fetchWithAuth(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
    } catch {}
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

    if (this.presenceHeartbeatTimer) {
      clearInterval(this.presenceHeartbeatTimer);
      this.presenceHeartbeatTimer = null;
    }

    if (this.pendingTasksTimer) {
      clearInterval(this.pendingTasksTimer);
      this.pendingTasksTimer = null;
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

        const isCompleted = message.status === MESSAGE_STATUS.COMPLETED;
        const isProcessing = message.status === MESSAGE_STATUS.PROCESSING;

        // Skip if not a user message or already completed
        if (message.type !== MESSAGE_TYPE.USER) {
          // For cloud AI responses (from OpenAI while offline), merge into unified message log
          // so the local AI knows what was already said to the user
          if (message.type === MESSAGE_TYPE.AI && !this.processedMessageIds.has(messageId)) {
            if (message.source === "cloud_openai") {
              try {
                const { getUnifiedMessageLog } = await import("./unified-message-log.js");
                const log = getUnifiedMessageLog();
                log.addAssistantMessage(message.content, MESSAGE_CHANNEL.WHATSAPP, {
                  source: "cloud_openai",
                  messageId
                });
                console.log(`[RealtimeMessaging] Merged cloud AI response into message log`);

                // Route cloud conversation to topic-specific memory files
                // Find the user message this was replying to (replyTo field or previous user msg)
                const userContent = message.replyTo
                  ? documents.find(d => d.name.endsWith(message.replyTo))
                  : null;
                const userMsg = userContent
                  ? parseFirestoreFields(userContent.fields)?.content
                  : null;
                // Also try conversationInsight from the AI message itself
                if (userMsg || message.conversationInsight) {
                  try {
                    const { processConversationMemory } = await import("./conversation-memory.js");
                    processConversationMemory(
                      userMsg || "",
                      message.content,
                      { source: "cloud", channel: "whatsapp" }
                    );
                  } catch {}
                }
              } catch {}
            }
            // Emit for UI display
            if (message.channel?.includes("whatsapp")) {
              this.emit("whatsapp-response", {
                messageId,
                content: message.content,
                channel: message.channel,
                timestamp: message.createdAt
              });
            }
          }
          this.processedMessageIds.add(messageId);
          continue;
        }
        if (isCompleted || isProcessing) {
          // If completed by cloud, merge user message into unified log for continuity
          if (isCompleted && !this.processedMessageIds.has(messageId) && message.content) {
            try {
              const { getUnifiedMessageLog } = await import("./unified-message-log.js");
              const log = getUnifiedMessageLog();
              const channel = message.channel?.includes("whatsapp") ? MESSAGE_CHANNEL.WHATSAPP : "app";
              log.addUserMessage(message.content, channel, { source: "cloud_replay", messageId });
            } catch {}

            // If this user message was completed by cloud, find the AI response and route to memory
            try {
              const aiDoc = documents.find(d => {
                const f = parseFirestoreFields(d.fields);
                return f.type === MESSAGE_TYPE.AI && f.source === "cloud_openai" && f.replyTo === messageId;
              });
              if (aiDoc) {
                const aiMsg = parseFirestoreFields(aiDoc.fields);
                const { processConversationMemory } = await import("./conversation-memory.js");
                processConversationMemory(
                  message.content,
                  aiMsg.content,
                  { source: "cloud", channel: "whatsapp" }
                );
              }
            } catch {}
          }
          this.processedMessageIds.add(messageId);
          continue;
        }

        // Private messages should still be processed, but not shown in UI
        message._silent = message.private === true || message.showInApp === false;

        // Skip WhatsApp messages early — let the poller handle them
        // MUST happen before dedup claim, otherwise we claim it here and poller can't process it
        const isWhatsApp = message.channel?.includes("whatsapp") ||
                           message.source?.includes("whatsapp") ||
                           message.channel === "twilio_whatsapp";
        if (isWhatsApp) {
          console.log(`[RealtimeMessaging] WhatsApp message — deferring to poller: "${(message.content || "").slice(0, 60)}"`);
          this.processedMessageIds.add(messageId);
          continue;
        }

        // Global dedup — skip if poller/webhook already handling this
        try {
          const { claim, claimByContent } = await import("./message-dedup.js");
          const dedupKey = message.twilioMessageId || messageId;
          const idOk = claim(dedupKey, "realtime");
          const contentOk = claimByContent(message.content, "realtime");
          if (!idOk || !contentOk) {
            console.log(`[RealtimeMessaging] Message ${messageId} already claimed, skipping`);
            this.processedMessageIds.add(messageId);
            continue;
          }
        } catch {}

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
    // Detect if message came from WhatsApp (could be "whatsapp" or "twilio_whatsapp")
    const isWhatsApp = message.channel?.includes("whatsapp") ||
                       message.source?.includes("whatsapp") ||
                       message.channel === "twilio_whatsapp";
    console.log(`[RealtimeMessaging] Processing ${isWhatsApp ? "WhatsApp" : "app"} message: ${message.content?.substring(0, 50)}...`);

    // Mark as processing
    await this.updateMessageStatus(messageId, MESSAGE_STATUS.PROCESSING);
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

    if (!message._silent) {
      this.emit("message-received", { messageId, message });
    }

    // Check if this is an approval response (YES/NO to a pending action)
    const content = (message.content || "").trim().toLowerCase();
    const isApprovalResponse = content === "yes" || content === "no" ||
                               content === "approve" || content === "reject" ||
                               content.includes("let's go") || content.includes("go for it") ||
                               content.includes("don't") || content.includes("stop");

    if (isApprovalResponse) {
      const actionApproval = getActionApproval();
      const pendingApprovals = actionApproval.getPending();

      if (pendingApprovals.length > 0) {
        const result = await processApprovalResponse(message.content);

        if (result.success) {
          const action = result.action === "approved" ? "approved" : "rejected";
          const responseText = action === "approved"
            ? `✅ Got it! Starting: ${result.approval.title}`
            : `❌ Okay, I won't proceed with: ${result.approval.title}`;

          // Emit event for the engine to handle
          this.emit("approval-response", {
            approvalId: result.approval.id,
            approved: action === "approved",
            approval: result.approval
          });

          // Send confirmation response
          const sent = await this.sendMessage(responseText, {
            type: MESSAGE_TYPE.AI,
            replyTo: messageId,
            sendToWhatsApp: isWhatsApp,
            channel: isWhatsApp ? "twilio_whatsapp_response" : undefined
          });

          await this.updateMessageStatus(messageId, MESSAGE_STATUS.COMPLETED);
          this.processedMessageIds.add(messageId);
          this.saveState();
          return;
        }
      }
    }

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

      // If handler said to skip (e.g., WhatsApp handled by poller), just mark done
      if (response?.skip || !response?.content) {
        await this.updateMessageStatus(messageId, MESSAGE_STATUS.COMPLETED, null, {
          processedBy: "skipped"
        });
        this.processedMessageIds.add(messageId);
        this.saveState();
        return;
      }

      // Send the response
      const sent = await this.sendMessage(response.content, {
        type: response.type || MESSAGE_TYPE.AI,
        replyTo: messageId,
        metadata: response.metadata,
        sendToWhatsApp: isWhatsApp,
        channel: isWhatsApp ? "twilio_whatsapp_response" : undefined
      });

      // Mark original as completed
      await this.updateMessageStatus(messageId, MESSAGE_STATUS.COMPLETED, null, {
        responseContent: response.content,
        responseMessageId: sent?.messageId || null
      });
      this.processedMessageIds.add(messageId);
      this.saveState();

      this.emit("message-processed", { messageId, response });

    } catch (error) {
      console.error("[RealtimeMessaging] Error processing message:", error.message);

      // Mark as failed
      await this.updateMessageStatus(messageId, MESSAGE_STATUS.FAILED, error.message);
      this.processedMessageIds.add(messageId);
      this.saveState();

      // Send error response
      await this.sendMessage("Sorry, I encountered an error processing your message. Please try again.", {
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
      sendToWhatsApp: options.sendToWhatsApp || false,
      channel: options.channel || null,
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
   * Ensure WhatsApp replies queued in Firestore are actually sent.
   */
  async reconcileWhatsAppReplies(limit = 200) {
    if (!this.userId) {
      return { success: false, error: "Not initialized" };
    }

    try {
      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/messages?pageSize=${limit}&orderBy=createdAt%20desc&key=${FIREBASE_CONFIG.apiKey}`;
      const response = await this.fetchWithAuth(url);
      if (!response.ok) {
        return { success: false, error: `Firestore error: ${response.status}` };
      }

      const data = await response.json();
      const documents = data.documents || [];
      let sentCount = 0;
      let skippedCount = 0;

      for (const doc of documents) {
        const messageId = doc.name.split("/").pop();
        const message = parseFirestoreFields(doc.fields);

        const isAI = message.type === MESSAGE_TYPE.AI || message.fromAI === true;
        const needsWhatsApp = message.sendToWhatsApp === true;
        const alreadySent = message.whatsappSent === true || Boolean(message.whatsappSentAt);

        if (!isAI || !needsWhatsApp || alreadySent) {
          skippedCount++;
          continue;
        }

        const whatsapp = getWhatsAppNotifications();
        const result = await whatsapp.sendAIResponse(message.content, MESSAGE_CHANNEL.WHATSAPP);

        if (result.success) {
          sentCount++;
          await this.updateMessageStatus(messageId, MESSAGE_STATUS.COMPLETED, null, {
            whatsappSent: true,
            whatsappSentAt: new Date().toISOString(),
            whatsappMessageId: result.messageId || null
          });
        } else {
          await this.updateMessageStatus(messageId, MESSAGE_STATUS.COMPLETED, result.error || "WhatsApp send failed", {
            whatsappSent: false,
            whatsappSentAt: null
          });
        }
      }

      return { success: true, sentCount, skippedCount };
    } catch (error) {
      console.error("[RealtimeMessaging] WhatsApp reconcile error:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update a message's status
   */
  async updateMessageStatus(messageId, status, error = null, extraFields = null) {
    try {
      const fieldPaths = ["status", "processedAt"];
      if (error) fieldPaths.push("error");
      if (extraFields && typeof extraFields === "object") {
        for (const key of Object.keys(extraFields)) {
          fieldPaths.push(key);
        }
      }
      const updateMask = fieldPaths.map(p => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join("&");

      const url = `${FIRESTORE_BASE_URL}/users/${this.userId}/messages/${messageId}?${updateMask}&key=${FIREBASE_CONFIG.apiKey}`;

      const fields = {
        status: { stringValue: status },
        processedAt: { timestampValue: new Date().toISOString() }
      };

      if (error) {
        fields.error = { stringValue: error };
      }
      if (extraFields && typeof extraFields === "object") {
        Object.assign(fields, toFirestoreFields(extraFields));
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
   * Fetch with optional auth header — refreshes token if expired
   */
  async fetchWithAuth(url, options = {}) {
    const headers = { ...options.headers };

    // Refresh auth token if needed (tokens expire after 1 hour)
    if (this.authToken) {
      try {
        const user = loadFirebaseUser();
        if (user?.idToken && user.idToken !== this.authToken) {
          // Token was refreshed elsewhere, update our copy
          this.authToken = user.idToken;
        } else if (user?.tokenExpiresAt) {
          const expiresAt = new Date(user.tokenExpiresAt).getTime();
          const isExpired = Number.isFinite(expiresAt) && Date.now() > expiresAt - 60000; // 1 min buffer
          if (isExpired) {
            console.log("[RealtimeMessaging] Auth token expired, clearing...");
            this.authToken = null; // Will use API key auth instead
          }
        }
      } catch {
        // Ignore token refresh errors
      }

      if (this.authToken) {
        headers["Authorization"] = `Bearer ${this.authToken}`;
      }
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
      processedTaskCount: this.processedTaskIds.size,
      presenceHeartbeat: !!this.presenceHeartbeatTimer,
      pendingTasksProcessor: !!this.pendingTasksTimer,
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
   * Sync Firebase conversations into local memory files + detect recurring themes.
   * Call on startup and periodically to ensure cloud conversations build knowledge.
   *
   * @param {number} limit - Max messages to pull from Firestore
   * @returns {Promise<{ processed: number, themes: string[] }>}
   */
  async syncFirebaseConversations(limit = 100) {
    if (!this.userId) return { processed: 0, themes: [] };

    try {
      const history = await this.getConversationHistory(limit);
      if (history.length === 0) return { processed: 0, themes: [] };

      const { processConversationMemory, classifyConversationTopic } = await import("./conversation-memory.js");

      // Track which message IDs we've already synced (prevent duplicates)
      const syncStatePath = path.join(DATA_DIR, "firebase-conversation-sync.json");
      let syncState = { lastSyncAt: null, processedIds: [] };
      try {
        if (fs.existsSync(syncStatePath)) {
          syncState = JSON.parse(fs.readFileSync(syncStatePath, "utf-8"));
        }
      } catch {}

      const alreadySynced = new Set(syncState.processedIds || []);
      const topicCounts = {};
      let processed = 0;

      // Pair user → AI messages
      for (let i = 0; i < history.length - 1; i++) {
        const msg = history[i];
        const next = history[i + 1];

        if (msg.type === "user" && next.type === "ai" && !alreadySynced.has(msg.id || `${i}`)) {
          const result = processConversationMemory(msg.content, next.content, {
            source: next.source === "cloud_openai" ? "cloud" : "local",
            channel: "whatsapp",
            timestamp: msg.createdAt,
          });

          if (result) {
            processed++;
            topicCounts[result.topicId] = (topicCounts[result.topicId] || 0) + 1;
          }

          alreadySynced.add(msg.id || `${i}`);
          i++; // Skip the AI message
        }
      }

      // Save sync state (keep last 500 IDs to prevent unbounded growth)
      syncState.lastSyncAt = new Date().toISOString();
      syncState.processedIds = [...alreadySynced].slice(-500);
      syncState.topicCounts = topicCounts;
      try {
        fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));
      } catch {}

      // Detect recurring themes — topics mentioned 3+ times could be core goals
      const recurringThemes = Object.entries(topicCounts)
        .filter(([, count]) => count >= 3)
        .map(([topic]) => topic);

      if (recurringThemes.length > 0) {
        console.log(`[RealtimeMessaging] Recurring conversation themes: ${recurringThemes.join(", ")}`);
      }

      console.log(`[RealtimeMessaging] Firebase conversation sync: ${processed} new pairs processed`);
      return { processed, themes: recurringThemes, topicCounts };
    } catch (err) {
      console.error("[RealtimeMessaging] Firebase conversation sync error:", err.message);
      return { processed: 0, themes: [], error: err.message };
    }
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
