/**
 * WhatsApp Message Poller
 *
 * Polls Twilio's REST API for incoming WhatsApp messages with adaptive intervals.
 * This eliminates the need for a public webhook URL — works behind NAT/localhost.
 *
 * Polling Strategy:
 *   - Peak hours (7-10am, 11:30am-1pm, 4-6pm): every 30s
 *   - Off-peak: every 60s
 *   - User active (sent message in last 5 min): every 10s
 *
 * Flow:
 *   1. Poll Twilio for messages sent TO our sandbox number
 *   2. Filter for unprocessed messages (track by SID)
 *   3. Send immediate acknowledgment ("thinking" message) — varied per call
 *   4. Process each message: build context → Claude AI → send response
 *   5. Persist processed SIDs to disk so restarts don't re-process
 *
 * This is the solution to: "user sends WhatsApp message → BACKBONE responds"
 * without needing Firebase Cloud Functions or a public webhook URL.
 */

import fs from "fs";
import path from "path";
import { getTwilioWhatsApp } from "./twilio-whatsapp.js";
import { formatAIResponse, chunkMessage } from "./whatsapp-formatter.js";
import { getDataDir } from "../paths.js";
import { getUnifiedMessageLog, MESSAGE_CHANNEL } from "./unified-message-log.js";

const DATA_DIR = getDataDir();
const PROCESSED_SIDS_PATH = path.join(DATA_DIR, "whatsapp-processed-sids.json");
const MAX_STORED_SIDS = 500;

// Adaptive polling intervals (milliseconds)
const POLL_INTERVAL_ACTIVE = 10_000;  // 10s when user recently messaged
const POLL_INTERVAL_PEAK = 30_000;    // 30s during peak hours
const POLL_INTERVAL_DEFAULT = 60_000; // 60s off-peak

// Peak hours (user's local time)
const PEAK_WINDOWS = [
  { start: 7, end: 10 },       // 7:00 AM - 10:00 AM
  { startH: 11, startM: 30, end: 13 }, // 11:30 AM - 1:00 PM
  { start: 16, end: 18 },      // 4:00 PM - 6:00 PM
];

// Time (ms) after last user message to consider them "active"
const USER_ACTIVE_WINDOW = 5 * 60 * 1000; // 5 minutes

// Acknowledgment messages — sent when AI is processing (not during active conversation)
const THINKING_MESSAGES = [
  "On it — pulling up your data now...",
  "Give me a sec, checking the latest...",
  "Working on that for you...",
  "Let me look into this...",
  "Crunching the numbers...",
  "Digging into your data...",
  "One moment — analyzing this now...",
  "Thinking through this...",
  "Running the analysis...",
  "Got it — putting this together...",
  "Looking into that right now...",
  "Processing — I'll have an answer shortly...",
  "Pulling the latest info...",
  "Let me check on that...",
  "On it. Back in a moment...",
  "Gathering the data you need...",
  "Checking your latest numbers...",
  "Assembling the details...",
  "Good question — let me look...",
  "Working through the data...",
];

// Track which thinking messages were recently used to avoid repeats
let recentThinkingIndices = [];

class WhatsAppPoller {
  constructor() {
    this.running = false;
    this.timer = null;
    this.processedSids = this._loadProcessedSids();
    this.lastPollTime = null;
    this.lastUserMessageTime = null;  // Track when user last messaged
    this.lastResponseTime = null;     // Track when we last responded
    this.messageHandler = null;       // Set by server.js
    this.stats = { polled: 0, processed: 0, errors: 0, lastMessage: null };
  }

  /**
   * Load previously processed message SIDs from disk
   */
  _loadProcessedSids() {
    try {
      if (fs.existsSync(PROCESSED_SIDS_PATH)) {
        const data = JSON.parse(fs.readFileSync(PROCESSED_SIDS_PATH, "utf-8"));
        return new Set(data.sids || []);
      }
    } catch {}
    return new Set();
  }

  /**
   * Save processed SIDs to disk (keeps last MAX_STORED_SIDS)
   */
  _saveProcessedSids() {
    try {
      const sids = Array.from(this.processedSids).slice(-MAX_STORED_SIDS);
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(PROCESSED_SIDS_PATH, JSON.stringify({ sids, lastSaved: new Date().toISOString() }));
    } catch (err) {
      console.error("[WhatsAppPoller] Failed to save SIDs:", err.message);
    }
  }

  /**
   * Set the handler for processing incoming messages.
   * Handler signature: async (messageData) => responseText
   *
   * messageData: { from, content, messageId, timestamp }
   * Returns: string (response to send back)
   */
  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  /**
   * Start polling for incoming messages with adaptive intervals
   */
  async start() {
    if (this.running) return;

    const wa = getTwilioWhatsApp();
    if (!wa.initialized) {
      const result = await wa.initialize();
      if (!result?.success) {
        console.log("[WhatsAppPoller] Twilio not configured — poller disabled");
        return;
      }
    }

    if (!wa.client) {
      console.log("[WhatsAppPoller] No Twilio client — poller disabled");
      return;
    }

    this.running = true;
    // Set initial poll time to now minus 5 minutes to catch recent messages on startup
    this.lastPollTime = new Date(Date.now() - 5 * 60 * 1000);
    console.log("[WhatsAppPoller] Started — adaptive polling (10s active / 30s peak / 60s off-peak)");

    // Initial poll
    await this._poll();

    // Schedule next poll using adaptive interval
    this._scheduleNextPoll();
  }

  /**
   * Stop polling
   */
  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._saveProcessedSids();
    console.log("[WhatsAppPoller] Stopped");
  }

  /**
   * Schedule the next poll with adaptive interval based on time-of-day and user activity.
   */
  _scheduleNextPoll() {
    if (!this.running) return;

    const interval = this._getPollingInterval();
    this.timer = setTimeout(async () => {
      await this._poll();
      this._scheduleNextPoll();
    }, interval);
  }

  /**
   * Determine polling interval based on user activity and time of day.
   *
   * Priority:
   *   1. User active (message in last 5 min) → 10s
   *   2. Peak hours → 30s
   *   3. Off-peak → 60s
   */
  _getPollingInterval() {
    // User recently messaged → fast polling
    if (this.lastUserMessageTime) {
      const sinceLastMessage = Date.now() - this.lastUserMessageTime;
      if (sinceLastMessage < USER_ACTIVE_WINDOW) {
        return POLL_INTERVAL_ACTIVE;
      }
    }

    // Check if we're in a peak window
    if (this._isPeakHours()) {
      return POLL_INTERVAL_PEAK;
    }

    return POLL_INTERVAL_DEFAULT;
  }

  /**
   * Check if current time falls within a peak window.
   */
  _isPeakHours() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeAsMinutes = hour * 60 + minute;

    for (const window of PEAK_WINDOWS) {
      const startMin = (window.startH ?? window.start) * 60 + (window.startM ?? 0);
      const endMin = window.end * 60;
      if (timeAsMinutes >= startMin && timeAsMinutes < endMin) {
        return true;
      }
    }
    return false;
  }

  /**
   * Poll Twilio for incoming messages
   */
  async _poll() {
    if (!this.running) return;

    try {
      const wa = getTwilioWhatsApp();
      if (!wa.client) return;

      this.stats.polled++;
      const sandboxNumber = wa.config.whatsappNumber || "+14155238886";

      // Fetch messages sent TO our sandbox number (incoming from users)
      const messages = await wa.client.messages.list({
        to: `whatsapp:${sandboxNumber}`,
        dateSentAfter: this.lastPollTime,
        limit: 20,
      });

      // Update poll time
      this.lastPollTime = new Date();

      // Filter out already-processed messages
      const newMessages = messages.filter(m => !this.processedSids.has(m.sid));

      if (newMessages.length === 0) return;

      console.log(`[WhatsAppPoller] Found ${newMessages.length} new incoming message(s)`);

      // Process each new message (oldest first)
      for (const msg of newMessages.reverse()) {
        await this._processMessage(msg);
      }

      // Save processed SIDs to disk
      this._saveProcessedSids();

    } catch (err) {
      this.stats.errors++;
      // Don't spam console on every poll failure — log only first or every 10th
      if (this.stats.errors <= 2 || this.stats.errors % 10 === 0) {
        console.error(`[WhatsAppPoller] Poll error (${this.stats.errors}):`, err.message);
      }
    }
  }

  /**
   * Check if we're in an active conversation (recent back-and-forth).
   * If user has sent a message AND received a response within the last 60s,
   * we skip the "thinking" acknowledgment to avoid spamming.
   */
  _isActiveConversation() {
    if (!this.lastResponseTime || !this.lastUserMessageTime) return false;
    const now = Date.now();
    return (now - this.lastResponseTime) < 60_000 && (now - this.lastUserMessageTime) < 60_000;
  }

  /**
   * Pick a random "thinking" message, avoiding recent repeats.
   */
  _pickThinkingMessage() {
    // Filter out recently used indices
    const available = THINKING_MESSAGES
      .map((_, i) => i)
      .filter(i => !recentThinkingIndices.includes(i));

    // If all have been used, reset
    const pool = available.length > 0 ? available : THINKING_MESSAGES.map((_, i) => i);

    const idx = pool[Math.floor(Math.random() * pool.length)];

    // Track recent picks (keep last 10 to ensure variety)
    recentThinkingIndices.push(idx);
    if (recentThinkingIndices.length > 10) {
      recentThinkingIndices = recentThinkingIndices.slice(-10);
    }

    return THINKING_MESSAGES[idx];
  }

  /**
   * Process a single incoming message
   */
  async _processMessage(msg) {
    const from = msg.from?.replace("whatsapp:", "") || null;
    const content = msg.body?.trim();
    const sid = msg.sid;

    // Mark as processed immediately to prevent double-processing
    this.processedSids.add(sid);

    if (!content) return;

    // Track user activity for adaptive polling
    this.lastUserMessageTime = Date.now();

    console.log(`[WhatsAppPoller] Processing message from ${from}: "${content.slice(0, 80)}"`);
    this.stats.lastMessage = { from, content: content.slice(0, 100), time: new Date().toISOString() };
    this.stats.processed++;

    // Send immediate "thinking" acknowledgment unless in active conversation
    if (!this._isActiveConversation()) {
      try {
        const ack = this._pickThinkingMessage();
        await this._sendRawMessage(from, `_${ack}_`);
      } catch {
        // Best-effort — don't block processing if ack fails
      }
    }

    // If we have a custom message handler, use it
    if (this.messageHandler) {
      try {
        const responseText = await this.messageHandler({
          from,
          content,
          messageId: sid,
          timestamp: msg.dateSent?.toISOString() || new Date().toISOString(),
          channel: "whatsapp",
        });

        if (responseText) {
          await this._sendResponse(from, responseText);
        }
      } catch (err) {
        console.error("[WhatsAppPoller] Handler error:", err.message);
        await this._sendResponse(from, `Hit a snag processing that: _${err.message.slice(0, 100)}_\nTry again in a moment.`);
      }
      return;
    }

    // Default: use built-in AI processing with context
    await this._processWithAI(from, content);
  }

  /**
   * Process a message using Claude AI with full user context + conversation history
   */
  async _processWithAI(from, content) {
    try {
      const messageLog = getUnifiedMessageLog();

      // Log incoming message
      messageLog.addUserMessage(content, MESSAGE_CHANNEL.WHATSAPP, { from });

      // Build conversation history
      const recentMessages = messageLog.getMessagesForAI(12);
      const conversationHistory = recentMessages
        .slice(-10)
        .map(m => `${m.role === "user" ? "User" : "BACKBONE"}: ${m.content}`)
        .join("\n");

      // Load user context from local data files
      const context = this._loadContext();

      // Build AI prompt with conversation history
      const prompt = `You are BACKBONE, an executive AI assistant. The user messaged you on WhatsApp.

*CONVERSATION HISTORY (most recent):*
${conversationHistory || "(first message — no prior history)"}

*Current message:* "${content}"

*FORMATTING RULES (CRITICAL):*
Use WhatsApp-native formatting in your response:
- *bold* for emphasis (single asterisks)
- _italic_ for secondary emphasis (underscores)
- ~strikethrough~ for corrections
- \`\`\`code\`\`\` for numbers/data blocks
- Bullet points with - or •
- Keep under 1500 characters
- No markdown headers (##), no [links](url)
- Use emojis sparingly for visual scanning

*USER DATA:*
${JSON.stringify(context, null, 2)}

IMPORTANT: You are in a CONVERSATION. Read the history above. If the user is answering a question you asked, or following up on a prior topic, respond in context. Be concise, actionable, and data-rich.`;

      // Use Claude Code CLI (Pro/Max subscription) — no API key needed
      let responseText = null;
      try {
        const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");
        const cliResult = await runClaudeCodePrompt(prompt, { timeout: 90000 });
        if (cliResult.success && cliResult.output) {
          responseText = cliResult.output.trim();
        } else {
          console.log("[WhatsAppPoller] CLI failed, trying multi-ai fallback:", cliResult.error);
        }
      } catch (cliErr) {
        console.log("[WhatsAppPoller] CLI unavailable:", cliErr.message);
      }

      // Fallback: try multi-ai
      if (!responseText) {
        try {
          const { sendMessage } = await import("../ai/multi-ai.js");
          const aiResponse = await sendMessage(prompt, { format: "text", maxTokens: 1000 });
          if (typeof aiResponse === "string") {
            responseText = aiResponse;
          } else if (aiResponse?.content) {
            responseText = aiResponse.content;
          } else if (aiResponse?.message) {
            responseText = aiResponse.message;
          } else if (aiResponse?.response) {
            responseText = aiResponse.response;
          } else if (aiResponse?.error) {
            console.error("[WhatsAppPoller] multi-ai error:", aiResponse.error);
          }
        } catch (aiErr) {
          console.error("[WhatsAppPoller] multi-ai fallback failed:", aiErr.message);
        }
      }

      const finalResponse = responseText || "Hmm, I drew a blank on that one. Could you rephrase?";

      // Log assistant response
      messageLog.addAssistantMessage(finalResponse, MESSAGE_CHANNEL.WHATSAPP);

      await this._sendResponse(from, finalResponse);
    } catch (err) {
      console.error("[WhatsAppPoller] AI processing error:", err.message);
      await this._sendResponse(from, `Hit a snag: _${err.message.slice(0, 100)}_`);
    }
  }

  /**
   * Load comprehensive user context from local data files
   */
  _loadContext() {
    const context = {};

    // Portfolio
    try {
      const alpaca = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "alpaca-cache.json"), "utf-8"));
      context.portfolio = {
        equity: alpaca.account?.equity,
        cash: alpaca.account?.cash,
        buying_power: alpaca.account?.buying_power,
        positions: alpaca.positions?.filter(p => !p.symbol?.includes("CVR")).map(p => ({
          symbol: p.symbol, qty: p.qty, value: p.market_value,
          pl: p.unrealized_pl, plPercent: p.unrealized_plpc
        }))
      };
    } catch {}

    // Life scores
    try {
      context.lifeScores = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "life-scores.json"), "utf-8"));
    } catch {}

    // Top/bottom tickers
    try {
      const tickers = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "tickers-cache.json"), "utf-8"));
      const arr = tickers.tickers || tickers;
      if (Array.isArray(arr)) {
        context.topTickers = arr.slice(0, 5).map(t => ({
          symbol: t.symbol, score: t.score?.toFixed?.(1), change: t.changePercent
        }));
        context.bottomTickers = arr.slice(-3).map(t => ({
          symbol: t.symbol, score: t.score?.toFixed?.(1), change: t.changePercent
        }));
      }
    } catch {}

    // Health
    try {
      const oura = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "oura-data.json"), "utf-8"));
      const latest = oura.latest || oura.history?.[oura.history?.length - 1];
      context.health = {
        sleep: latest?.sleep?.at(-1)?.score,
        readiness: latest?.readiness?.at(-1)?.score,
        activity: latest?.activity?.at(-1)?.score
      };
    } catch {}

    // Active goals
    try {
      const goalsRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "goals.json"), "utf-8"));
      const goals = Array.isArray(goalsRaw) ? goalsRaw : goalsRaw.goals || [];
      context.goals = goals.filter(g => g.status === "active").slice(0, 5).map(g => ({
        title: g.title, progress: g.progress || 0, category: g.category
      }));
    } catch {}

    // Engine state
    try {
      const handoffPath = path.join(DATA_DIR, "engine-handoff.json");
      if (fs.existsSync(handoffPath)) {
        const handoff = JSON.parse(fs.readFileSync(handoffPath, "utf-8"));
        context.engineLastAction = handoff.fromAction;
        context.engineNextTask = handoff.nextTask;
      }
    } catch {}

    // Recent trades
    try {
      const trades = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "trades-log.json"), "utf-8"));
      if (Array.isArray(trades)) {
        context.recentTrades = trades.slice(-3).map(t => ({
          symbol: t.symbol, action: t.side || t.action, qty: t.qty, price: t.price, time: t.timestamp
        }));
      }
    } catch {}

    return context;
  }

  /**
   * Send a raw (unformatted) message — used for acknowledgments/thinking messages.
   */
  async _sendRawMessage(to, text) {
    const wa = getTwilioWhatsApp();
    if (!wa.initialized) return;
    await wa.sendMessage(to, text);
  }

  /**
   * Send a formatted response back to the user
   */
  async _sendResponse(to, text) {
    try {
      const wa = getTwilioWhatsApp();
      if (!wa.initialized) return;

      const formatted = formatAIResponse(text);
      const chunks = chunkMessage(formatted, 1500);

      for (const chunk of chunks) {
        await wa.sendMessage(to, chunk);
        // Small delay between chunks to maintain order
        if (chunks.length > 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Track response time for active conversation detection
      this.lastResponseTime = Date.now();

      console.log(`[WhatsAppPoller] Sent response to ${to} (${chunks.length} chunk${chunks.length > 1 ? "s" : ""})`);
    } catch (err) {
      console.error("[WhatsAppPoller] Send response error:", err.message);
    }
  }

  /**
   * Get poller status
   */
  getStatus() {
    const interval = this._getPollingInterval();
    const isActive = this.lastUserMessageTime && (Date.now() - this.lastUserMessageTime) < USER_ACTIVE_WINDOW;

    return {
      running: this.running,
      lastPollTime: this.lastPollTime?.toISOString(),
      processedCount: this.processedSids.size,
      pollingInterval: interval,
      pollingMode: isActive ? "active (10s)" : this._isPeakHours() ? "peak (30s)" : "off-peak (60s)",
      userActive: !!isActive,
      lastUserMessage: this.lastUserMessageTime ? new Date(this.lastUserMessageTime).toISOString() : null,
      stats: this.stats,
    };
  }
}

// Singleton
let instance = null;

export function getWhatsAppPoller() {
  if (!instance) {
    instance = new WhatsAppPoller();
  }
  return instance;
}

export default WhatsAppPoller;
