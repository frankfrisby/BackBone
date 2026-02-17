/**
 * Email Digest Service
 *
 * Fetches top useful emails at scheduled intervals (7am, 12pm, 5pm)
 * and sends a digest via WhatsApp. Tracks the last-fetched timestamp
 * so we only surface new emails going forward.
 *
 * First run: scans last 5 days and picks the most important.
 * Subsequent runs: only new emails since last fetch.
 *
 * Persisted state: data/email-digest-state.json
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const TAG = "[EmailDigest]";
const STATE_FILE = path.join(getDataDir(), "email-digest-state.json");

// Categories that are usually noise
const NOISE_SENDERS = [
  "noreply@", "no-reply@", "notifications-noreply@", "mailer-daemon",
  "quora.com", "reddit.com", "peloton", "lumosity", "glassdoor",
  "club peloton", "idealist.org"
];

const NOISE_SUBJECTS = [
  "unsubscribe", "verify your email", "confirm your", "password reset",
  "profile view", "you have 1 new", "add stephen", "early access",
  "social security", "club peloton"
];

/**
 * Load persisted state
 */
export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return {
    lastFetchedAt: null,       // ISO timestamp of last email we processed
    lastEmailDate: null,       // Date of the newest email we've seen
    lastDigestSentAt: null,    // When we last sent a digest
    totalDigestsSent: 0,
    digestHistory: []          // Last 20 digests for reference
  };
}

/**
 * Save state
 */
function saveState(state) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Score an email for usefulness (0-100)
 * Higher = more important to surface
 */
export function scoreEmail(email) {
  let score = 50; // baseline
  const from = (email.from || "").toLowerCase();
  const subject = (email.subject || "").toLowerCase();
  const snippet = (email.snippet || "").toLowerCase();

  // --- NOISE DETECTION (reduce score) ---
  for (const noise of NOISE_SENDERS) {
    if (from.includes(noise)) { score -= 30; break; }
  }
  for (const noise of NOISE_SUBJECTS) {
    if (subject.includes(noise)) { score -= 20; break; }
  }

  // Generic notification emails
  if (from.includes("notifications-noreply") || from.includes("jobalerts-noreply")) score -= 15;
  if (subject.includes("new listings match")) score -= 20;
  if (subject.includes("profile view")) score -= 25;

  // --- HIGH VALUE SIGNALS (increase score) ---

  // Action required / urgent
  if (subject.includes("action required") || subject.includes("urgent") || subject.includes("important")) score += 25;
  if (subject.includes("security alert")) score += 20;
  if (subject.includes("deadline") || subject.includes("expires") || subject.includes("before march")) score += 15;

  // Financial / market intel
  if (from.includes("finimize") || from.includes("theinformation.com") || from.includes("bloomberg")) score += 15;
  if (subject.includes("market") || subject.includes("earnings") || subject.includes("stock") || subject.includes("portfolio")) score += 10;
  if (subject.includes("chip") || subject.includes("ai ") || subject.includes("nvidia") || subject.includes("tesla")) score += 10;

  // Career / high-value job matches
  if (subject.includes("microsoft") || subject.includes("google") || subject.includes("netflix") || subject.includes("nvidia")) score += 15;
  if (subject.includes("principal") || subject.includes("senior lead") || subject.includes("director")) score += 10;
  if (subject.includes("agentic ai") || subject.includes("machine learning") || subject.includes("data scientist")) score += 10;

  // Direct messages from real people (not automated)
  if (from.includes("@gmail.com") || from.includes("@outlook.com") || from.includes("@yahoo.com")) score += 15;
  if (!from.includes("noreply") && !from.includes("no-reply") && !from.includes("notifications")) score += 5;

  // Technology / tools you use
  if (from.includes("claude") || from.includes("anthropic") || from.includes("openai")) score += 20;

  // Long/substantive content (not just a notification)
  if ((snippet || "").length > 150) score += 5;

  // LinkedIn direct messages (not job alerts)
  if (from.includes("messages-noreply@linkedin") && subject.includes("new message")) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Filter and rank emails, return top N
 */
export function rankEmails(emails, topN = 5) {
  if (!Array.isArray(emails) || emails.length === 0) return [];

  const scored = emails.map(e => ({
    ...e,
    importanceScore: scoreEmail(e)
  }));

  // Sort by score descending, then by date descending
  scored.sort((a, b) => {
    if (b.importanceScore !== a.importanceScore) return b.importanceScore - a.importanceScore;
    return new Date(b.date) - new Date(a.date);
  });

  // Filter out very low scores
  const filtered = scored.filter(e => e.importanceScore >= 30);

  return filtered.slice(0, topN);
}

/**
 * Format a ranked email list into a WhatsApp-friendly digest
 */
export function formatEmailDigest(rankedEmails, period = "today") {
  if (!rankedEmails || rankedEmails.length === 0) {
    return "No important emails to surface right now.";
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  let msg = `*Top ${rankedEmails.length} Emails* (${period})\n\n`;

  for (let i = 0; i < rankedEmails.length; i++) {
    const e = rankedEmails[i];
    const fromName = extractSenderName(e.from);
    const date = new Date(e.date);
    const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const snippet = (e.snippet || "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').slice(0, 120);

    msg += `*${i + 1}. ${e.subject}*\n`;
    msg += `   _${fromName}_ · ${dateStr}\n`;
    if (snippet) msg += `   ${snippet}...\n`;
    msg += `\n`;
  }

  return msg.trim();
}

/**
 * Extract sender display name from "Name <email>" format
 */
function extractSenderName(from) {
  if (!from) return "Unknown";
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  return from.split("@")[0] || from;
}

/**
 * Run the email digest — fetch, rank, format, send via WhatsApp
 * Called by the proactive scheduler at 7am, 12pm, 5pm
 *
 * @param {Object} options - { sendWhatsApp: true, topN: 5 }
 * @returns {Object} - { success, digest, emails }
 */
export async function runEmailDigest(options = {}) {
  const { sendWhatsApp = true, topN = 5 } = options;
  const state = loadState();

  console.log(`${TAG} Running email digest. Last fetched: ${state.lastEmailDate || "never (first run)"}`);

  try {
    // Dynamically import the MCP google service
    let emails = [];

    // If first run (no lastEmailDate), search last 5 days
    if (!state.lastEmailDate) {
      console.log(`${TAG} First run — fetching last 5 days of emails`);
      try {
        const { searchEmails } = await getGoogleEmailFunctions();
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const dateStr = fiveDaysAgo.toISOString().split("T")[0].replace(/-/g, "/");
        const result = await searchEmails(`after:${dateStr}`, 50);
        emails = result?.emails || [];
      } catch (err) {
        console.log(`${TAG} Search failed, falling back to recent:`, err.message);
        const { getRecentEmails } = await getGoogleEmailFunctions();
        const result = await getRecentEmails(50);
        emails = result?.emails || [];
      }
    } else {
      // Subsequent runs: fetch since last email date
      try {
        const { searchEmails } = await getGoogleEmailFunctions();
        const lastDate = new Date(state.lastEmailDate);
        const dateStr = lastDate.toISOString().split("T")[0].replace(/-/g, "/");
        const result = await searchEmails(`after:${dateStr}`, 30);
        emails = result?.emails || [];
      } catch (err) {
        console.log(`${TAG} Search failed, falling back to recent:`, err.message);
        const { getRecentEmails } = await getGoogleEmailFunctions();
        const result = await getRecentEmails(30);
        emails = result?.emails || [];
      }
    }

    if (emails.length === 0) {
      console.log(`${TAG} No new emails to process`);
      return { success: true, digest: null, emails: [], reason: "No new emails" };
    }

    console.log(`${TAG} Fetched ${emails.length} emails, ranking...`);

    // Rank and pick top N
    const ranked = rankEmails(emails, topN);
    const digest = formatEmailDigest(ranked, state.lastEmailDate ? "since last check" : "last 5 days");

    // Update state with newest email date
    const newestDate = emails.reduce((latest, e) => {
      const d = new Date(e.date);
      return d > latest ? d : latest;
    }, new Date(0));

    state.lastEmailDate = newestDate.toISOString();
    state.lastFetchedAt = new Date().toISOString();
    state.lastDigestSentAt = new Date().toISOString();
    state.totalDigestsSent = (state.totalDigestsSent || 0) + 1;

    // Keep last 20 digests in history
    state.digestHistory = state.digestHistory || [];
    state.digestHistory.unshift({
      sentAt: new Date().toISOString(),
      emailCount: ranked.length,
      topSubjects: ranked.slice(0, 3).map(e => e.subject?.slice(0, 60))
    });
    if (state.digestHistory.length > 20) state.digestHistory = state.digestHistory.slice(0, 20);

    saveState(state);

    // Send via WhatsApp
    if (sendWhatsApp && ranked.length > 0) {
      try {
        const { getWhatsAppNotifications } = await import("./whatsapp-notifications.js");
        const notif = getWhatsAppNotifications();
        if (!notif.enabled) {
          try { await notif.initialize("default"); } catch {}
        }
        if (notif.enabled) {
          const whatsAppMsg = `🦴 *BACKBONE*\n\n📧 ${digest}\n\n_— ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}_`;
          await notif.send(whatsAppMsg);
          console.log(`${TAG} Digest sent via WhatsApp (${ranked.length} emails)`);
        }
      } catch (waErr) {
        console.log(`${TAG} WhatsApp send failed:`, waErr.message);
      }
    }

    return { success: true, digest, emails: ranked };

  } catch (err) {
    console.error(`${TAG} Error:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get google email functions dynamically (to avoid circular imports)
 */
async function getGoogleEmailFunctions() {
  // Try MCP tools first, then fallback to direct service
  try {
    const mod = await import("../../mcp/google-mail-calendar-server.js");
    return {
      getRecentEmails: async (limit) => {
        // Use the search with a recent filter
        if (mod.searchEmails) return mod.searchEmails("", limit);
        return { emails: [] };
      },
      searchEmails: mod.searchEmails || (async () => ({ emails: [] }))
    };
  } catch {
    // Fallback: use fetch against local server
    return {
      getRecentEmails: async (limit = 30) => {
        try {
          const resp = await fetch(`http://localhost:3000/api/google/emails?limit=${limit}`);
          return await resp.json();
        } catch { return { emails: [] }; }
      },
      searchEmails: async (query, limit = 30) => {
        try {
          const resp = await fetch(`http://localhost:3000/api/google/emails/search?q=${encodeURIComponent(query)}&limit=${limit}`);
          return await resp.json();
        } catch { return { emails: [] }; }
      }
    };
  }
}

/**
 * Get the current state (for API/status checks)
 */
export function getDigestStatus() {
  const state = loadState();
  return {
    lastEmailDate: state.lastEmailDate,
    lastDigestSentAt: state.lastDigestSentAt,
    totalDigestsSent: state.totalDigestsSent,
    recentDigests: (state.digestHistory || []).slice(0, 5)
  };
}

export default {
  runEmailDigest,
  rankEmails,
  scoreEmail,
  formatEmailDigest,
  getDigestStatus,
  loadState
};
