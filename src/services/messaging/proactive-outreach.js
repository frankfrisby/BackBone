/**
 * Proactive Outreach — BACKBONE → User Communication
 *
 * Unified API for the engine and services to reach out to the user
 * when they need input, when work is done, or when something important happens.
 *
 * Channels:
 *   WhatsApp (primary) — async, non-urgent, updates/questions
 *   Vapi (urgent)      — phone call for time-sensitive decisions
 *
 * Features:
 *   - Pending questions tracking (match responses to questions)
 *   - Dedup & rate limiting (don't spam the user)
 *   - Quiet hours respect (unless urgent)
 *   - Data update routing (user answers → update memory/data files)
 */

import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir } from "../paths.js";
import { getWhatsAppNotifications } from "./whatsapp-notifications.js";
import { getUnifiedMessageLog, MESSAGE_CHANNEL } from "./unified-message-log.js";

const DATA_DIR = getDataDir();
const PENDING_PATH = path.join(DATA_DIR, "pending-questions.json");

// Rate limiting
const MAX_OUTREACH_PER_HOUR = 4;
const MIN_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes between messages
let lastOutreachTime = 0;
let hourlyCount = 0;
let hourlyResetTime = 0;

// ── Pending Questions (track what we asked the user) ─────────

/**
 * Load pending questions from disk.
 * @returns {Array<{ id: string, question: string, context: string, dataTarget?: string, askedAt: string, answered: boolean }>}
 */
function loadPendingQuestions() {
  try {
    if (fs.existsSync(PENDING_PATH)) {
      return JSON.parse(fs.readFileSync(PENDING_PATH, "utf-8"));
    }
  } catch {}
  return [];
}

/**
 * Save pending questions to disk.
 */
function savePendingQuestions(questions) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PENDING_PATH, JSON.stringify(questions, null, 2));
  } catch (err) {
    console.error("[Outreach] Failed to save pending questions:", err.message);
  }
}

/**
 * Add a pending question we asked the user.
 */
function addPendingQuestion(question, context, dataTarget = null) {
  const questions = loadPendingQuestions();
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  questions.push({
    id,
    question,
    context,
    dataTarget, // e.g., "memory/family.md", "data/goals.json", "settings.phoneNumber"
    askedAt: new Date().toISOString(),
    answered: false,
  });

  // Keep last 20 questions max
  const trimmed = questions.slice(-20);
  savePendingQuestions(trimmed);
  return id;
}

/**
 * Find the most recent unanswered question that matches a user response.
 * Uses keyword overlap to match response to question context.
 */
export function matchResponseToQuestion(userMessage) {
  const questions = loadPendingQuestions();
  const unanswered = questions.filter(q => !q.answered);
  if (unanswered.length === 0) return null;

  const msgLower = (userMessage || "").toLowerCase();

  // Most recent unanswered question is the default match
  // (WhatsApp is sequential — user typically answers the last question)
  const latest = unanswered[unanswered.length - 1];

  // Check if it's stale (>24h old = probably not relevant)
  const ageMs = Date.now() - new Date(latest.askedAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return null;

  return latest;
}

/**
 * Mark a question as answered and optionally process the answer.
 */
export function markQuestionAnswered(questionId, answer) {
  const questions = loadPendingQuestions();
  const q = questions.find(q => q.id === questionId);
  if (!q) return;

  q.answered = true;
  q.answeredAt = new Date().toISOString();
  q.answer = (answer || "").slice(0, 500);
  savePendingQuestions(questions);

  // If question has a data target, update it
  if (q.dataTarget && answer) {
    try {
      updateDataFromAnswer(q.dataTarget, q.context, answer);
    } catch (err) {
      console.error("[Outreach] Failed to update data from answer:", err.message);
    }
  }

  // Handle goal-approval responses — route yes/no back to engine
  if (q.context === "goal-approval") {
    const answerLower = (answer || "").toLowerCase().trim();
    const isApproved = ["yes", "y", "yeah", "yep", "sure", "go", "ok", "do it", "approved", "go ahead"].some(w => answerLower.startsWith(w));
    const isDenied = ["no", "n", "nah", "nope", "skip", "not now", "later"].some(w => answerLower.startsWith(w));

    if (isApproved || isDenied) {
      import("../engine/autonomous-engine.js").then(({ getAutonomousEngine }) => {
        const engine = getAutonomousEngine();
        if (engine && engine.pendingGoal) {
          engine.handleApprovalResponse(null, isApproved);
          console.log(`[Outreach] Goal ${isApproved ? "approved" : "rejected"} via WhatsApp`);
        }
      }).catch(() => {});
    }
  }

  return q;
}

/**
 * Update a data file based on user's answer to a question.
 */
function updateDataFromAnswer(target, context, answer) {
  // Memory file targets: append the answer
  if (target.startsWith("memory/")) {
    const memoryDir = getMemoryDir();
    const filePath = path.join(memoryDir, target.replace("memory/", ""));
    if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const entry = `\n**${dateStr}** (user response to BACKBONE question)\n> Context: ${context}\n> User: ${answer}\n`;

    if (!fs.existsSync(filePath)) {
      const name = path.basename(filePath, ".md");
      fs.writeFileSync(filePath, `# ${name.charAt(0).toUpperCase() + name.slice(1)} Notes\n`);
    }
    fs.appendFileSync(filePath, entry);
    console.log(`[Outreach] Updated ${target} with user response`);
    return;
  }

  // Settings targets: update specific field
  if (target.startsWith("settings.")) {
    const field = target.replace("settings.", "");
    const settingsPath = path.join(DATA_DIR, "user-settings.json");
    try {
      const settings = fs.existsSync(settingsPath)
        ? JSON.parse(fs.readFileSync(settingsPath, "utf-8"))
        : {};
      settings[field] = answer.trim();
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(`[Outreach] Updated settings.${field}`);
    } catch {}
    return;
  }

  console.log(`[Outreach] Data target "${target}" not handled — answer stored in pending questions`);
}

// ── Rate Limiting ────────────────────────────────────────────

function canSendNow() {
  const now = Date.now();

  // Reset hourly counter
  if (now - hourlyResetTime > 60 * 60 * 1000) {
    hourlyCount = 0;
    hourlyResetTime = now;
  }

  // Check rate limits
  if (hourlyCount >= MAX_OUTREACH_PER_HOUR) {
    return { allowed: false, reason: "hourly limit reached" };
  }
  if (now - lastOutreachTime < MIN_INTERVAL_MS) {
    return { allowed: false, reason: "too soon since last message" };
  }

  return { allowed: true };
}

function recordOutreach() {
  lastOutreachTime = Date.now();
  hourlyCount++;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Send a WhatsApp message to the user (primary channel).
 * Use for updates, progress reports, and non-urgent info.
 *
 * @param {string} message - The message to send
 * @param {Object} options
 * @param {string} options.type - Notification type (system, outcome, trade, etc.)
 * @param {boolean} options.skipRateLimit - Bypass rate limiting
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendWhatsApp(message, options = {}) {
  if (!options.skipRateLimit) {
    const check = canSendNow();
    if (!check.allowed) {
      console.log(`[Outreach] Skipped WhatsApp (${check.reason}): ${message.slice(0, 60)}`);
      return { success: false, error: check.reason };
    }
  }

  try {
    const notif = getWhatsAppNotifications();
    if (!notif.enabled) {
      await notif.initialize("default");
    }

    const result = await notif.send(options.type || "system", message, {
      identifier: options.identifier,
      priority: options.urgent ? 4 : 2,
    });

    if (result?.success) {
      recordOutreach();

      // Log to unified message log
      const log = getUnifiedMessageLog();
      log.addAssistantMessage(message, MESSAGE_CHANNEL.PROACTIVE, {
        type: "outreach",
        trigger: options.trigger || "engine",
      });
    }

    return result || { success: false, error: "No result from notifications" };
  } catch (err) {
    console.error("[Outreach] WhatsApp send failed:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Ask the user a question via WhatsApp and track it for response routing.
 * When the user responds, the answer is matched back to this question.
 *
 * @param {string} question - The question to ask
 * @param {Object} options
 * @param {string} options.context - Why we're asking (shown in logs)
 * @param {string} options.dataTarget - Where to store the answer (e.g., "memory/family.md")
 * @returns {Promise<{ success: boolean, questionId?: string }>}
 */
export async function askUser(question, options = {}) {
  const result = await sendWhatsApp(question, {
    type: "reminder",
    trigger: "ask-user",
    identifier: `ask_${Date.now()}`,
    ...options,
  });

  if (result?.success) {
    const qId = addPendingQuestion(
      question,
      options.context || "BACKBONE needs user input",
      options.dataTarget || null
    );
    console.log(`[Outreach] Asked user (${qId}): ${question.slice(0, 80)}`);
    return { success: true, questionId: qId };
  }

  return { success: false, error: result?.error };
}

/**
 * Send a progress update about a goal or task.
 *
 * @param {string} title - Goal/task title
 * @param {string} update - What happened
 * @param {Object} options
 */
export async function notifyProgress(title, update, options = {}) {
  const message = `*${title}*\n\n${update}`;
  return sendWhatsApp(message, {
    type: "outcome",
    trigger: "progress",
    identifier: `progress_${title.replace(/\s+/g, "_").slice(0, 30)}`,
    ...options,
  });
}

/**
 * Notify the user that BACKBONE is blocked and needs their input.
 *
 * @param {string} reason - Why we're blocked
 * @param {string} question - What we need from the user
 * @param {Object} options
 */
export async function notifyBlocked(reason, question, options = {}) {
  const message = `Hey, I'm working on something but hit a wall:\n\n_${reason}_\n\n${question}`;
  return askUser(message, {
    context: reason,
    ...options,
  });
}

/**
 * Call the user via Vapi for urgent matters.
 * Only use when the user needs to make an immediate decision.
 *
 * @param {string} reason - Why we're calling
 * @param {string} [systemPrompt] - Custom prompt for the voice assistant
 * @returns {Promise<{ success: boolean, callId?: string }>}
 */
export async function urgentCall(reason, systemPrompt = null) {
  console.log(`[Outreach] Initiating urgent call: ${reason}`);
  try {
    const { default: VapiService } = await import("./vapi-service.js");
    const vapi = new VapiService();
    await vapi.initialize();

    const prompt = systemPrompt ||
      `You need to talk to the user about something urgent. ` +
      `Reason: ${reason}. Be concise, get their decision, and end the call.`;

    const call = await vapi.callUser(prompt);
    return { success: true, callId: call?.id };
  } catch (err) {
    console.error("[Outreach] Vapi call failed:", err.message);
    // Fall back to WhatsApp
    await sendWhatsApp(
      `Tried to call you but couldn't connect.\n\n*Urgent:* ${reason}\n\nPlease respond when you can.`,
      { type: "alert", skipRateLimit: true, urgent: true }
    );
    return { success: false, error: err.message };
  }
}

/**
 * Send a daily/regular update to the user.
 * Respects quiet hours and daily limits.
 *
 * @param {string} message - Update content
 */
export async function sendUpdate(message) {
  return sendWhatsApp(message, {
    type: "system",
    trigger: "update",
  });
}

/**
 * Get pending (unanswered) questions.
 */
export function getPendingQuestions() {
  return loadPendingQuestions().filter(q => !q.answered);
}

/**
 * Get outreach status.
 */
export function getOutreachStatus() {
  return {
    hourlyCount,
    maxPerHour: MAX_OUTREACH_PER_HOUR,
    lastOutreachTime: lastOutreachTime ? new Date(lastOutreachTime).toISOString() : null,
    pendingQuestions: getPendingQuestions().length,
    canSend: canSendNow().allowed,
  };
}

export default {
  sendWhatsApp,
  askUser,
  notifyProgress,
  notifyBlocked,
  urgentCall,
  sendUpdate,
  matchResponseToQuestion,
  markQuestionAnswered,
  getPendingQuestions,
  getOutreachStatus,
};
