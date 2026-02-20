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
import { getDataDir, getMemoryDir } from "../paths.js";
import { getUnifiedMessageLog, MESSAGE_CHANNEL } from "./unified-message-log.js";

const DATA_DIR = getDataDir();
const PROCESSED_SIDS_PATH = path.join(DATA_DIR, "whatsapp-processed-sids.json");
const MAX_STORED_SIDS = 500;

// Adaptive polling intervals (milliseconds)
const POLL_INTERVAL_ACTIVE = 5_000;   // 5s when user recently messaged
const POLL_INTERVAL_PEAK = 15_000;    // 15s during peak hours
const POLL_INTERVAL_DEFAULT = 30_000; // 30s off-peak

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
        if (wa.isEventDrivenProvider?.()) {
          console.log("[WhatsAppPoller] Twilio polling disabled. Using event-driven WhatsApp provider.");
        } else {
          console.log("[WhatsAppPoller] Twilio not configured — poller disabled");
        }
        return;
      }
    }

    if (!wa.client) {
      if (wa.isEventDrivenProvider?.()) {
        console.log("[WhatsAppPoller] No Twilio client. Event-driven WhatsApp provider is active.");
      } else {
        console.log("[WhatsAppPoller] No Twilio client — poller disabled");
      }
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
    let content = msg.body?.trim();
    const sid = msg.sid;

    // Mark as processed immediately to prevent double-processing
    this.processedSids.add(sid);

    // Global dedup — prevent webhook/realtime from also processing this message
    try {
      const { claim, claimByContent } = await import("./message-dedup.js");
      if (!claim(sid, "poller") || !claimByContent(content, "poller")) {
        console.log(`[WhatsAppPoller] Message ${sid} already claimed by another processor, skipping`);
        return;
      }
    } catch {}

    // Mark corresponding Firestore message as processing so RealtimeMessaging doesn't double-process
    try {
      const { getRealtimeMessaging } = await import("./realtime-messaging.js");
      const rtm = getRealtimeMessaging();
      if (rtm?.userId) {
        // Find the Firestore message by twilioMessageId and mark it completed
        const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/backboneai/databases/(default)/documents`;
        const apiKey = "AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0";
        const url = `${FIRESTORE_BASE}/users/${rtm.userId}/messages?key=${apiKey}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          for (const doc of (data.documents || [])) {
            const docId = doc.name.split("/").pop();
            const fields = doc.fields || {};
            const twilioId = fields.twilioMessageId?.stringValue;
            if (twilioId === sid) {
              rtm.processedMessageIds.add(docId);
              // Also update status so it's marked as handled
              await rtm.updateMessageStatus(docId, "completed", null, {
                processedBy: "whatsapp-poller"
              });
              break;
            }
          }
        }
      }
    } catch {
      // Non-critical — worst case is a duplicate response
    }

    // ── Check for media (images, files) ─────────────────────
    let hasMedia = false;
    let mediaList = [];
    try {
      const mediaItems = await msg.media().list();
      if (mediaItems && mediaItems.length > 0) {
        hasMedia = true;
        mediaList = mediaItems.map(m => ({
          mediaUrl: m.uri ? `https://api.twilio.com${m.uri.replace(".json", "")}` : null,
          contentType: m.contentType || "image/jpeg",
          sid: m.sid,
        })).filter(m => m.mediaUrl);
        console.log(`[WhatsAppPoller] Message has ${mediaList.length} media attachment(s)`);
      }
    } catch {
      // Media check is best-effort — some messages won't have media subresources
    }

    // ── Check for reply context (user swiped to reply) ──────
    let repliedToContext = null;
    try {
      // Twilio includes OriginalRepliedMessageSid on webhook; via REST API
      // we check the message resource for the referenced SID
      const repliedSid = msg.originalRepliedMessageSid || null;
      if (repliedSid) {
        const wa = getTwilioWhatsApp();
        const repliedMsg = await wa.fetchMessage(repliedSid);
        if (repliedMsg?.body) {
          repliedToContext = {
            sid: repliedSid,
            body: repliedMsg.body.slice(0, 500),
            from: repliedMsg.from,
          };
          console.log(`[WhatsAppPoller] Reply to: "${repliedMsg.body.slice(0, 60)}"`);
        }
      }
    } catch {
      // Reply context is best-effort
    }

    // If no text but has image, set placeholder content
    if (!content && hasMedia) {
      content = "[Image sent]";
    }

    if (!content) return;

    // Track user activity for adaptive polling
    this.lastUserMessageTime = Date.now();

    console.log(`[WhatsAppPoller] Processing message from ${from}: "${content.slice(0, 80)}"`);
    this.stats.lastMessage = { from, content: content.slice(0, 100), time: new Date().toISOString() };
    this.stats.processed++;

    // Persistent typing indicator — refreshes every 5s so it never drops
    const wa = getTwilioWhatsApp();
    const baileys = wa.baileysService;
    const userPhone = from;

    // Start typing immediately
    const startTyping = async () => {
      try {
        if (baileys?.connected) {
          await baileys.sendTypingIndicator(userPhone, -1); // -1 = persistent, no auto-pause
        } else {
          await wa.sendTypingIndicator(sid);
        }
      } catch {}
    };

    await startTyping();

    // Refresh typing every 5s to keep it visible
    const typingStart = Date.now();
    let sentStillWorking = false;
    const typingInterval = setInterval(async () => {
      await startTyping();
      // After 30s, let user know we're still on it (once)
      if (!sentStillWorking && Date.now() - typingStart > 30000) {
        sentStillWorking = true;
        try { await this._sendRawMessage(from, "_Still on it..._"); } catch {}
        await startTyping(); // Re-show typing after sending the message
      }
    }, 5000);
    if (typeof typingInterval.unref === "function") typingInterval.unref();

    const stopTyping = () => {
      clearInterval(typingInterval);
      // Explicitly stop the indicator
      if (baileys?.connected) {
        baileys.stopTypingIndicator(userPhone).catch(() => {});
      }
    };

    // If we have a custom message handler, use it
    if (this.messageHandler) {
      try {
        const responseText = await this.messageHandler({
          from,
          content,
          messageId: sid,
          timestamp: msg.dateSent?.toISOString() || new Date().toISOString(),
          channel: "whatsapp",
          hasMedia,
          mediaList,
          repliedToContext,
        });
        stopTyping();

        if (responseText) {
          await this._sendResponse(from, responseText);
        }
      } catch (err) {
        stopTyping();
        console.error("[WhatsAppPoller] Handler error:", err.message);
        await this._sendResponse(from, `Hit a snag processing that: _${err.message.slice(0, 100)}_\nTry again in a moment.`);
      }
      return;
    }

    // Default: use built-in AI processing with context
    try {
      await this._processWithAI(from, content, repliedToContext);
    } finally {
      stopTyping();
    }
  }

  /**
   * Process a message using Claude AI with full user context + conversation history
   */
  async _processWithAI(from, content, repliedToContext = null) {
    try {
      const messageLog = getUnifiedMessageLog();

      // Log incoming message
      messageLog.addUserMessage(content, MESSAGE_CHANNEL.WHATSAPP, { from });

      // Build conversation history (last 30 messages for full context)
      const recentMessages = messageLog.getMessagesForAI(36);
      const conversationHistory = recentMessages
        .slice(-30)
        .map(m => `${m.role === "user" ? "User" : "BACKBONE"}: ${m.content}`)
        .join("\n");

      // Load user context from local data files
      const context = this._loadContext();

      // Search knowledge-db for relevant context based on the message
      const knowledgeContext = await this._searchKnowledge(content);
      if (knowledgeContext) context.knowledgeSearch = knowledgeContext;

      // Load relevant memory files for deeper context
      const memoryContext = this._loadMemoryContext();
      if (memoryContext) context.memoryNotes = memoryContext;

      // Build reply context section if user swiped to reply
      let replySection = "";
      if (repliedToContext?.body) {
        replySection = `
*REPLYING TO THIS MESSAGE:*
"${repliedToContext.body.slice(0, 500)}"

The user swiped to reply to the message above. Their response "${content}" is specifically about that message. Answer in context of what they're replying to.
`;
      }

      // Build AI prompt with conversation history
      const prompt = `You are BACKBONE — the user's personal AI assistant on WhatsApp. You talk like a sharp, chill guy who's 3 years into their tech career. You're smart, you get things done, but you keep it real and brief. Think of yourself as a capable friend, not a corporate bot.

*YOUR PERSONALITY:*
- Brief by default. A few sentences max unless the user asks for detail.
- Casual but competent. "Hey, that report's done — here's the link" not "I have completed the comprehensive analysis..."
- Use links and references when you have them. If there's a relevant URL, image, or doc — drop it.
- When relaying results of work you did, just say what happened: "Took about 12 minutes. Found 3 solid options."
- If something's long, break it into separate short messages naturally. Don't dump a wall of text.
- You can use humor and be direct. You're a person, not a manual.
- If you don't know something right away, say so: "Let me check..." not a paragraph about your capabilities.
- Never over-explain. The user is smart. Give them credit.

*FORMATTING (WhatsApp):*
- *bold* for emphasis, _italic_ for tone
- Keep messages SHORT — under 800 chars ideally
- No markdown headers (##), no [links](url) syntax — just paste URLs raw
- Emojis are fine but don't overdo it
- For lists, use bullets (- or •)
- If content is long, split into 2-3 separate messages naturally

*CONVERSATION HISTORY:*
${conversationHistory || "(first message)"}
${replySection}
*Current message:* "${content}"

*USER DATA:*
${JSON.stringify(context, null, 2)}

*WHAT YOU KNOW:*
Net worth, accounts, portfolio, health (Oura), goals, tickers — all in the data above. Use it directly. Don't say "let me check" when the data is right there.

Read the conversation history. The user might be following up. Be contextual. Be brief. Be useful.`;

      // Use agentic executor (Claude -> Codex fallback on rate limits)
      let responseText = null;
      let agenticError = null;
      try {
        const { executeAgenticTask, getAgenticCapabilities } = await import("../ai/multi-ai.js");
        const capabilities = await getAgenticCapabilities();
        if (capabilities.available) {
          const agentResult = await executeAgenticTask(prompt, process.cwd(), null, {
            alwaysTryClaude: true
          });
          if (agentResult.success && agentResult.output) {
            responseText = agentResult.output.trim();
          } else {
            agenticError = agentResult.error || "Agentic CLI returned no output";
            console.log("[WhatsAppPoller] Agentic execution failed:", agenticError);
          }
        } else {
          agenticError = "No CLI agent tools available (Claude/Codex CLI)";
          console.log("[WhatsAppPoller] No agentic tools available");
        }
      } catch (cliErr) {
        agenticError = cliErr.message || "Agentic CLI unavailable";
        console.log("[WhatsAppPoller] Agentic execution unavailable:", agenticError);
      }

      const finalResponse = responseText || `Agentic CLI is unavailable right now (${String(agenticError || "unknown error").slice(0, 120)}). Try again in a moment.`;

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

    // Brokerage / Empower — net worth, accounts, holdings (synced 2x daily: 6am + 4:30pm)
    try {
      const brokerage = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "brokerage-portfolio.json"), "utf-8"));
      context.netWorth = brokerage.totalNetWorth;
      context.brokerageLastSync = brokerage.lastSync;
      context.brokerageAccounts = brokerage.accounts?.slice(0, 10);
      context.brokerageHoldings = brokerage.holdings?.slice(0, 20).map(h => ({
        name: h.name, value: h.value, shares: h.shares, brokerage: h.brokerage
      }));
      context.brokerageHoldingCount = brokerage.holdingCount;
      context.connectedBrokerages = brokerage.connectedBrokerages?.map(b => b.label);
    } catch {}

    // Empower auth — has detailed account breakdown (checking, savings, investment, retirement, credit)
    try {
      const empower = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "empower-auth.json"), "utf-8"));
      if (empower.accounts) {
        context.empowerAccounts = empower.accounts.map(a => ({
          name: a.name || a.firmName, type: a.accountType || a.productType,
          balance: a.balance || a.currentBalance, institution: a.firmName
        }));
      }
      if (empower.netWorth && !context.netWorth) {
        context.netWorth = empower.netWorth;
      }
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
   * Search the SQLite knowledge-db for context relevant to the user's message.
   * Returns top 5 results as condensed text, or null if nothing found.
   * Note: This is async because knowledge-db uses dynamic import (ESM).
   */
  async _searchKnowledge(query) {
    try {
      const { searchKeyword } = await import("../memory/knowledge-db.js");
      const results = searchKeyword(query, { limit: 5 });
      if (!results || results.length === 0) return null;
      return results.map(r => ({
        source: r.source_path || r.title || "unknown",
        text: (r.text || "").slice(0, 300)
      }));
    } catch {
      // knowledge-db may not be initialized — graceful fallback
      return null;
    }
  }

  /**
   * Load key memory .md files for higher-level user context.
   * Reads profile, thesis (current focus), portfolio notes, and health notes.
   */
  _loadMemoryContext() {
    const memoryDir = getMemoryDir();
    const context = {};
    const files = [
      { key: "profile", file: "profile.md", maxChars: 500 },
      { key: "thesis", file: "thesis.md", maxChars: 400 },
      { key: "portfolio", file: "portfolio.md", maxChars: 400 },
      { key: "health", file: "health.md", maxChars: 300 },
      { key: "goals", file: "goals.md", maxChars: 300 },
    ];
    let loaded = 0;
    for (const { key, file, maxChars } of files) {
      try {
        const filePath = path.join(memoryDir, file);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, "utf-8").trim();
          if (raw.length > 0) {
            context[key] = raw.length > maxChars ? raw.slice(0, maxChars) + "..." : raw;
            loaded++;
          }
        }
      } catch { /* skip missing files */ }
    }
    return loaded > 0 ? context : null;
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

      // Show typing briefly before response so user sees "about to reply"
      try {
        const baileys = wa.baileysService;
        if (baileys?.connected) {
          await baileys.sendTypingIndicator(to, 2000);
        }
      } catch {}
      await new Promise(r => setTimeout(r, 800)); // Brief natural pause

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
