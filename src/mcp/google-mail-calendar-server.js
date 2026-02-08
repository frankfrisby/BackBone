import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { getDataDir } from "../services/paths.js";
import { fetchGoogleConfig } from "../services/firebase/firebase-config.js";

/**
 * BACKBONE Google Mail & Calendar MCP Server
 * Unified email + calendar with AI analysis and draft capabilities
 *
 * Token refresh: This server handles its own token refresh because MCP servers
 * run as child processes that don't inherit .env vars or share the main process's
 * auto-refresh timer. On every API call, we check expiry and refresh if needed.
 */

const DATA_DIR = getDataDir();
const EMAIL_CACHE = path.join(DATA_DIR, "email-cache.json");
const DRAFT_LOG = path.join(DATA_DIR, "email-draft-log.json");
const GOOGLE_TOKEN_FILE = path.join(DATA_DIR, "google-email-tokens.json");

// ── Token management with auto-refresh ──────────────────────────

const loadGoogleTokens = () => {
  try {
    if (fs.existsSync(GOOGLE_TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(GOOGLE_TOKEN_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
};

const saveGoogleTokens = (tokens) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(GOOGLE_TOKEN_FILE, JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }, null, 2));
  } catch (err) {
    console.error("[GoogleMCP] Failed to save tokens:", err.message);
  }
};

const isTokenExpired = (tokens) => {
  if (!tokens?.savedAt) return true;
  const savedAt = new Date(tokens.savedAt).getTime();
  const expiresIn = (tokens.expires_in || 3600) * 1000;
  const fiveMinBuffer = 5 * 60 * 1000;
  return Date.now() > savedAt + expiresIn - fiveMinBuffer;
};

/**
 * Refresh Google access token using refresh_token.
 * Fetches OAuth client credentials from Firebase (not env vars).
 */
const refreshAccessToken = async (tokens) => {
  if (!tokens?.refresh_token) return null;

  // Get OAuth client creds from Firebase (same pattern as trading/health servers)
  let clientId, clientSecret;
  try {
    const googleConfig = await fetchGoogleConfig();
    clientId = googleConfig?.clientId;
    clientSecret = googleConfig?.clientSecret;
  } catch {}

  if (!clientId || !clientSecret) {
    console.error("[GoogleMCP] Cannot refresh — no OAuth client credentials in Firebase (config/config_google)");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("[GoogleMCP] Token refresh failed:", response.status);
      return null;
    }

    const newTokens = await response.json();
    const merged = {
      ...tokens,
      access_token: newTokens.access_token,
      expires_in: newTokens.expires_in || 3600,
    };
    saveGoogleTokens(merged);
    console.error("[GoogleMCP] Token refreshed successfully");
    return merged.access_token;
  } catch (err) {
    console.error("[GoogleMCP] Token refresh error:", err.message);
    return null;
  }
};

/**
 * Get a valid access token — refreshes automatically if expired.
 */
const getValidToken = async () => {
  const tokens = loadGoogleTokens();
  if (!tokens?.access_token) return null;

  if (isTokenExpired(tokens)) {
    const refreshed = await refreshAccessToken(tokens);
    return refreshed;
  }

  return tokens.access_token;
};

// Wrappers for backwards compat with the rest of this file
const getGmailToken = () => loadGoogleTokens()?.access_token || null;
const getCalendarToken = () => loadGoogleTokens()?.access_token || null;

// Tool definitions
const TOOLS = [
  // === EMAIL TOOLS ===
  {
    name: "get_recent_emails",
    description: "Get recent emails from inbox",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of emails to return (default 10)" },
        unreadOnly: { type: "boolean", description: "Only return unread emails" },
      },
      required: [],
    },
  },
  {
    name: "get_unread_count",
    description: "Get count of unread emails",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "search_emails",
    description: "Search emails by query",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_email_body",
    description: "Read the full body content of a specific email by ID",
    inputSchema: {
      type: "object",
      properties: {
        emailId: { type: "string", description: "The email message ID" },
      },
      required: ["emailId"],
    },
  },
  {
    name: "draft_email",
    description: "Create an email draft (does NOT send — requires user approval)",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        reason: { type: "string", description: "Why this draft is being created (logged for audit)" },
      },
      required: ["to", "subject", "body", "reason"],
    },
  },
  {
    name: "analyze_emails_by_topic",
    description: "Correlate recent emails with user interests, beliefs, or news topics",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to correlate emails against (e.g., 'investing', 'health')" },
        limit: { type: "number", description: "Max emails to scan (default 50)" },
      },
      required: ["topic"],
    },
  },
  // === CALENDAR TOOLS ===
  {
    name: "get_today_events",
    description: "Get all events for today",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_upcoming_events",
    description: "Get upcoming events for the next N days",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to look ahead (default 7)" },
        limit: { type: "number", description: "Maximum number of events (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "create_event",
    description: "Create a new calendar event",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        startTime: { type: "string", description: "Start time (ISO 8601 format)" },
        endTime: { type: "string", description: "End time (ISO 8601 format)" },
        description: { type: "string", description: "Event description" },
        location: { type: "string", description: "Event location" },
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "update_event",
    description: "Update an existing calendar event",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event ID to update" },
        title: { type: "string", description: "New event title" },
        startTime: { type: "string", description: "New start time (ISO 8601)" },
        endTime: { type: "string", description: "New end time (ISO 8601)" },
        description: { type: "string", description: "New event description" },
        location: { type: "string", description: "New event location" },
      },
      required: ["eventId"],
    },
  },
  {
    name: "delete_event",
    description: "Delete a calendar event",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "The event ID to delete" },
      },
      required: ["eventId"],
    },
  },
];

// === PROVIDER HELPERS ===

const makeAuthHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

// Sync fallbacks (used only for provider detection)
const getGmailHeaders = () => makeAuthHeaders(getGmailToken());
const getGoogleCalHeaders = () => makeAuthHeaders(getCalendarToken());

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

const getOutlookHeaders = () => ({
  Authorization: `Bearer ${process.env.OUTLOOK_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
});

const OUTLOOK_BASE = "https://graph.microsoft.com/v1.0/me";

const getEmailProvider = () => {
  if (getGmailToken()) return "gmail";
  if (process.env.OUTLOOK_ACCESS_TOKEN) return "outlook";
  return null;
};

const getCalendarProvider = () => {
  if (getCalendarToken()) return "google";
  if (process.env.OUTLOOK_ACCESS_TOKEN) return "outlook";
  return null;
};

// Date helpers
const formatDate = (date) => date.toISOString();
const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

// Cache
const loadCache = () => {
  try {
    if (fs.existsSync(EMAIL_CACHE)) {
      return JSON.parse(fs.readFileSync(EMAIL_CACHE, "utf-8"));
    }
  } catch (e) {}
  return { lastFetch: null, emails: [] };
};

const saveCache = (cache) => {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(EMAIL_CACHE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error("Cache save error:", e.message);
  }
};

// === GMAIL IMPLEMENTATIONS ===

async function getGmailEmails(limit = 10, unreadOnly = false) {
  try {
    const token = await getValidToken();
    if (!token) return { error: "Gmail token expired and could not be refreshed", hint: "Re-authenticate with Gmail" };
    const headers = makeAuthHeaders(token);
    const query = unreadOnly ? "is:unread" : "";
    const url = `${GMAIL_BASE}/messages?maxResults=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
    const listResponse = await fetch(url, { headers });

    if (!listResponse.ok) {
      if (listResponse.status === 401) {
        return { error: "Gmail token expired", hint: "Re-authenticate with Gmail" };
      }
      throw new Error(`Gmail API error: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const messages = listData.messages || [];

    const emails = await Promise.all(
      messages.slice(0, limit).map(async (msg) => {
        const detailResponse = await fetch(`${GMAIL_BASE}/messages/${msg.id}?format=metadata`, { headers });
        if (!detailResponse.ok) return null;
        const detail = await detailResponse.json();

        const getHeader = (name) =>
          detail.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        return {
          id: detail.id,
          threadId: detail.threadId,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: detail.snippet,
          unread: detail.labelIds?.includes("UNREAD") || false,
        };
      })
    );

    return { emails: emails.filter(Boolean), provider: "gmail" };
  } catch (error) {
    return { error: error.message };
  }
}

async function getGmailUnreadCount() {
  try {
    const token = await getValidToken();
    if (!token) return { error: "Gmail token expired" };
    const headers = makeAuthHeaders(token);
    const response = await fetch(`${GMAIL_BASE}/labels/INBOX`, { headers });

    if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);

    const data = await response.json();
    return {
      unreadCount: data.messagesUnread || 0,
      totalMessages: data.messagesTotal || 0,
      provider: "gmail",
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function searchGmailEmails(query, limit = 20) {
  try {
    const token = await getValidToken();
    if (!token) return { error: "Gmail token expired" };
    const headers = makeAuthHeaders(token);
    const url = `${GMAIL_BASE}/messages?maxResults=${limit}&q=${encodeURIComponent(query)}`;
    const listResponse = await fetch(url, { headers });

    if (!listResponse.ok) throw new Error(`Gmail API error: ${listResponse.status}`);

    const listData = await listResponse.json();
    const messages = listData.messages || [];

    const emails = await Promise.all(
      messages.map(async (msg) => {
        const detailResponse = await fetch(`${GMAIL_BASE}/messages/${msg.id}?format=metadata`, {
          headers,
        });
        if (!detailResponse.ok) return null;
        const detail = await detailResponse.json();

        const getHeader = (name) =>
          detail.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

        return {
          id: detail.id,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: detail.snippet,
        };
      })
    );

    return { emails: emails.filter(Boolean), query, provider: "gmail" };
  } catch (error) {
    return { error: error.message };
  }
}

async function getGmailEmailBody(emailId) {
  try {
    const token = await getValidToken();
    if (!token) return { error: "Gmail token expired" };
    const headers = makeAuthHeaders(token);
    const response = await fetch(`${GMAIL_BASE}/messages/${emailId}?format=full`, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) return { error: "Gmail token expired" };
      throw new Error(`Gmail API error: ${response.status}`);
    }

    const detail = await response.json();
    const getHeader = (name) =>
      detail.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";

    // Extract body from parts
    let body = "";
    function extractBody(payload) {
      if (payload.body?.data) {
        body += Buffer.from(payload.body.data, "base64url").toString("utf-8");
      }
      if (payload.parts) {
        // Prefer text/plain, fall back to text/html
        const textPart = payload.parts.find(p => p.mimeType === "text/plain");
        const htmlPart = payload.parts.find(p => p.mimeType === "text/html");
        const target = textPart || htmlPart;
        if (target) {
          extractBody(target);
        } else {
          payload.parts.forEach(p => extractBody(p));
        }
      }
    }
    extractBody(detail.payload);

    return {
      id: detail.id,
      threadId: detail.threadId,
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      body: body || detail.snippet,
      provider: "gmail",
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function createGmailDraft(to, subject, body) {
  try {
    const token = await getValidToken();
    if (!token) return { success: false, error: "Gmail token expired" };
    const headers = makeAuthHeaders(token);
    const rawMessage = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ].join("\r\n");

    const encodedMessage = Buffer.from(rawMessage).toString("base64url");

    const response = await fetch(`${GMAIL_BASE}/drafts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: { raw: encodedMessage },
      }),
    });

    if (!response.ok) throw new Error(`Gmail API error: ${response.status}`);

    const draft = await response.json();
    return {
      success: true,
      draftId: draft.id,
      messageId: draft.message?.id,
      provider: "gmail",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// === OUTLOOK IMPLEMENTATIONS ===

async function getOutlookEmails(limit = 10, unreadOnly = false) {
  try {
    const filter = unreadOnly ? "&$filter=isRead eq false" : "";
    const url = `${OUTLOOK_BASE}/messages?$top=${limit}&$orderby=receivedDateTime desc${filter}`;
    const response = await fetch(url, { headers: getOutlookHeaders() });

    if (!response.ok) {
      if (response.status === 401) return { error: "Outlook token expired" };
      throw new Error(`Outlook API error: ${response.status}`);
    }

    const data = await response.json();
    const emails = (data.value || []).map(msg => ({
      id: msg.id,
      from: msg.from?.emailAddress?.address || "",
      fromName: msg.from?.emailAddress?.name || "",
      to: msg.toRecipients?.map(r => r.emailAddress?.address).join(", ") || "",
      subject: msg.subject || "",
      date: msg.receivedDateTime,
      snippet: msg.bodyPreview || "",
      unread: !msg.isRead,
    }));

    return { emails, provider: "outlook" };
  } catch (error) {
    return { error: error.message };
  }
}

async function getOutlookUnreadCount() {
  try {
    const response = await fetch(
      `${OUTLOOK_BASE}/mailFolders/inbox?$select=unreadItemCount,totalItemCount`,
      { headers: getOutlookHeaders() }
    );

    if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

    const data = await response.json();
    return {
      unreadCount: data.unreadItemCount || 0,
      totalMessages: data.totalItemCount || 0,
      provider: "outlook",
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function searchOutlookEmails(query, limit = 20) {
  try {
    const url = `${OUTLOOK_BASE}/messages?$search="${encodeURIComponent(query)}"&$top=${limit}`;
    const response = await fetch(url, { headers: getOutlookHeaders() });

    if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

    const data = await response.json();
    const emails = (data.value || []).map(msg => ({
      id: msg.id,
      from: msg.from?.emailAddress?.address || "",
      subject: msg.subject || "",
      date: msg.receivedDateTime,
      snippet: msg.bodyPreview || "",
    }));

    return { emails, query, provider: "outlook" };
  } catch (error) {
    return { error: error.message };
  }
}

async function getOutlookEmailBody(emailId) {
  try {
    const response = await fetch(`${OUTLOOK_BASE}/messages/${emailId}`, {
      headers: getOutlookHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401) return { error: "Outlook token expired" };
      throw new Error(`Outlook API error: ${response.status}`);
    }

    const msg = await response.json();
    return {
      id: msg.id,
      from: msg.from?.emailAddress?.address || "",
      fromName: msg.from?.emailAddress?.name || "",
      to: msg.toRecipients?.map(r => r.emailAddress?.address).join(", ") || "",
      subject: msg.subject || "",
      date: msg.receivedDateTime,
      body: msg.body?.content || msg.bodyPreview || "",
      bodyType: msg.body?.contentType || "text",
      provider: "outlook",
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function createOutlookDraft(to, subject, body) {
  try {
    const response = await fetch(`${OUTLOOK_BASE}/messages`, {
      method: "POST",
      headers: getOutlookHeaders(),
      body: JSON.stringify({
        subject,
        body: { content: body, contentType: "text" },
        toRecipients: [{ emailAddress: { address: to } }],
        isDraft: true,
      }),
    });

    if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

    const draft = await response.json();
    return {
      success: true,
      draftId: draft.id,
      provider: "outlook",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// === GOOGLE CALENDAR IMPLEMENTATIONS ===

async function getGoogleTodayEvents() {
  try {
    const token = await getValidToken();
    if (!token) return { error: "Google Calendar token expired" };
    const headers = makeAuthHeaders(token);
    const timeMin = formatDate(startOfDay());
    const timeMax = formatDate(endOfDay());
    const url = `${GOOGLE_CALENDAR_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 401) return { error: "Google Calendar token expired" };
      throw new Error(`Google Calendar API error: ${response.status}`);
    }

    const data = await response.json();
    const events = (data.items || []).map(event => ({
      id: event.id,
      title: event.summary || "No title",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: !event.start?.dateTime,
      location: event.location || null,
      description: event.description || null,
      status: event.status,
      meetLink: event.hangoutLink || null,
    }));

    return { events, date: new Date().toDateString(), provider: "google" };
  } catch (error) {
    return { error: error.message };
  }
}

async function getGoogleUpcomingEvents(days = 7, limit = 20) {
  try {
    const token = await getValidToken();
    if (!token) return { error: "Google Calendar token expired" };
    const headers = makeAuthHeaders(token);
    const timeMin = formatDate(new Date());
    const timeMax = formatDate(addDays(new Date(), days));
    const url = `${GOOGLE_CALENDAR_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=${limit}&singleEvents=true&orderBy=startTime`;
    const response = await fetch(url, { headers });

    if (!response.ok) throw new Error(`Google Calendar API error: ${response.status}`);

    const data = await response.json();
    const events = (data.items || []).map(event => ({
      id: event.id,
      title: event.summary || "No title",
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: !event.start?.dateTime,
      location: event.location || null,
      meetLink: event.hangoutLink || null,
    }));

    return { events, days, provider: "google" };
  } catch (error) {
    return { error: error.message };
  }
}

async function createGoogleEvent(title, startTime, endTime, description, location) {
  try {
    const token = await getValidToken();
    if (!token) return { success: false, error: "Google Calendar token expired" };
    const headers = makeAuthHeaders(token);
    const event = {
      summary: title,
      start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };
    if (description) event.description = description;
    if (location) event.location = location;

    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    });

    if (!response.ok) throw new Error(`Google Calendar API error: ${response.status}`);

    const created = await response.json();
    return {
      success: true,
      event: {
        id: created.id,
        title: created.summary,
        start: created.start?.dateTime,
        end: created.end?.dateTime,
        link: created.htmlLink,
      },
      provider: "google",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateGoogleEvent(eventId, updates) {
  try {
    const token = await getValidToken();
    if (!token) return { success: false, error: "Google Calendar token expired" };
    const headers = makeAuthHeaders(token);
    const patchBody = {};
    if (updates.title) patchBody.summary = updates.title;
    if (updates.description) patchBody.description = updates.description;
    if (updates.location) patchBody.location = updates.location;
    if (updates.startTime) {
      patchBody.start = { dateTime: updates.startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    if (updates.endTime) {
      patchBody.end = { dateTime: updates.endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }

    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patchBody),
    });

    if (!response.ok) throw new Error(`Google Calendar API error: ${response.status}`);

    const updated = await response.json();
    return {
      success: true,
      event: {
        id: updated.id,
        title: updated.summary,
        start: updated.start?.dateTime,
        end: updated.end?.dateTime,
        link: updated.htmlLink,
      },
      provider: "google",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteGoogleEvent(eventId) {
  try {
    const token = await getValidToken();
    if (!token) return { success: false, error: "Google Calendar token expired" };
    const headers = makeAuthHeaders(token);
    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) throw new Error(`Google Calendar API error: ${response.status}`);

    return { success: true, deletedEventId: eventId, provider: "google" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// === OUTLOOK CALENDAR IMPLEMENTATIONS ===

async function getOutlookTodayEvents() {
  try {
    const startDateTime = formatDate(startOfDay());
    const endDateTime = formatDate(endOfDay());
    const url = `${OUTLOOK_BASE}/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$orderby=start/dateTime`;
    const response = await fetch(url, { headers: getOutlookHeaders() });

    if (!response.ok) {
      if (response.status === 401) return { error: "Outlook token expired" };
      throw new Error(`Outlook API error: ${response.status}`);
    }

    const data = await response.json();
    const events = (data.value || []).map(event => ({
      id: event.id,
      title: event.subject || "No title",
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      allDay: event.isAllDay || false,
      location: event.location?.displayName || null,
      description: event.bodyPreview || null,
      onlineMeeting: event.onlineMeetingUrl || null,
    }));

    return { events, date: new Date().toDateString(), provider: "outlook" };
  } catch (error) {
    return { error: error.message };
  }
}

async function getOutlookUpcomingEvents(days = 7, limit = 20) {
  try {
    const startDateTime = formatDate(new Date());
    const endDateTime = formatDate(addDays(new Date(), days));
    const url = `${OUTLOOK_BASE}/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$top=${limit}&$orderby=start/dateTime`;
    const response = await fetch(url, { headers: getOutlookHeaders() });

    if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

    const data = await response.json();
    const events = (data.value || []).map(event => ({
      id: event.id,
      title: event.subject || "No title",
      start: event.start?.dateTime,
      end: event.end?.dateTime,
      allDay: event.isAllDay || false,
      location: event.location?.displayName || null,
      onlineMeeting: event.onlineMeetingUrl || null,
    }));

    return { events, days, provider: "outlook" };
  } catch (error) {
    return { error: error.message };
  }
}

async function createOutlookEvent(title, startTime, endTime, description, location) {
  try {
    const event = {
      subject: title,
      start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };
    if (description) event.body = { content: description, contentType: "text" };
    if (location) event.location = { displayName: location };

    const response = await fetch(`${OUTLOOK_BASE}/events`, {
      method: "POST",
      headers: getOutlookHeaders(),
      body: JSON.stringify(event),
    });

    if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

    const created = await response.json();
    return {
      success: true,
      event: {
        id: created.id,
        title: created.subject,
        start: created.start?.dateTime,
        end: created.end?.dateTime,
        link: created.webLink,
      },
      provider: "outlook",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function updateOutlookEvent(eventId, updates) {
  try {
    const patchBody = {};
    if (updates.title) patchBody.subject = updates.title;
    if (updates.description) patchBody.body = { content: updates.description, contentType: "text" };
    if (updates.location) patchBody.location = { displayName: updates.location };
    if (updates.startTime) {
      patchBody.start = { dateTime: updates.startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }
    if (updates.endTime) {
      patchBody.end = { dateTime: updates.endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    }

    const response = await fetch(`${OUTLOOK_BASE}/events/${eventId}`, {
      method: "PATCH",
      headers: getOutlookHeaders(),
      body: JSON.stringify(patchBody),
    });

    if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

    const updated = await response.json();
    return {
      success: true,
      event: {
        id: updated.id,
        title: updated.subject,
        start: updated.start?.dateTime,
        end: updated.end?.dateTime,
        link: updated.webLink,
      },
      provider: "outlook",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function deleteOutlookEvent(eventId) {
  try {
    const response = await fetch(`${OUTLOOK_BASE}/events/${eventId}`, {
      method: "DELETE",
      headers: getOutlookHeaders(),
    });

    if (!response.ok) throw new Error(`Outlook API error: ${response.status}`);

    return { success: true, deletedEventId: eventId, provider: "outlook" };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// === UNIFIED TOOL IMPLEMENTATIONS ===

async function getRecentEmails(limit = 10, unreadOnly = false) {
  const provider = getEmailProvider();
  if (!provider) {
    return { error: "No email provider configured", hint: "Set GMAIL_ACCESS_TOKEN or OUTLOOK_ACCESS_TOKEN" };
  }
  return provider === "gmail" ? getGmailEmails(limit, unreadOnly) : getOutlookEmails(limit, unreadOnly);
}

async function getUnreadCount() {
  const provider = getEmailProvider();
  if (!provider) return { error: "No email provider configured" };
  return provider === "gmail" ? getGmailUnreadCount() : getOutlookUnreadCount();
}

async function searchEmails(query, limit = 20) {
  const provider = getEmailProvider();
  if (!provider) return { error: "No email provider configured" };
  return provider === "gmail" ? searchGmailEmails(query, limit) : searchOutlookEmails(query, limit);
}

async function getEmailBody(emailId) {
  const provider = getEmailProvider();
  if (!provider) return { error: "No email provider configured" };
  return provider === "gmail" ? getGmailEmailBody(emailId) : getOutlookEmailBody(emailId);
}

async function draftEmail(to, subject, body, reason) {
  const provider = getEmailProvider();
  if (!provider) return { error: "No email provider configured" };

  // Log the draft creation for audit trail
  const logEntry = {
    to,
    subject,
    reason,
    createdAt: new Date().toISOString(),
    provider,
    status: "draft_created",
  };

  try {
    const logData = fs.existsSync(DRAFT_LOG)
      ? JSON.parse(fs.readFileSync(DRAFT_LOG, "utf-8"))
      : { drafts: [] };
    logData.drafts.unshift(logEntry);
    if (logData.drafts.length > 100) logData.drafts = logData.drafts.slice(0, 100);
    fs.writeFileSync(DRAFT_LOG, JSON.stringify(logData, null, 2));
  } catch (e) {
    console.error("Draft log error:", e.message);
  }

  const result = provider === "gmail"
    ? await createGmailDraft(to, subject, body)
    : await createOutlookDraft(to, subject, body);

  return {
    ...result,
    note: "Draft created. User must review and send manually.",
    reason,
  };
}

async function analyzeEmailsByTopic(topic, limit = 50) {
  const provider = getEmailProvider();
  if (!provider) return { error: "No email provider configured" };

  // Search for emails related to the topic
  const searchResult = await searchEmails(topic, limit);
  if (searchResult.error) return searchResult;

  const emails = searchResult.emails || [];

  // Categorize by relevance
  const analysis = {
    topic,
    totalFound: emails.length,
    emails: emails.map(e => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      date: e.date,
      snippet: e.snippet,
    })),
    summary: `Found ${emails.length} emails related to "${topic}"`,
    analyzedAt: new Date().toISOString(),
    provider,
  };

  return analysis;
}

async function getTodayEvents() {
  const provider = getCalendarProvider();
  if (!provider) {
    return { error: "No calendar provider configured", hint: "Set GOOGLE_CALENDAR_TOKEN or OUTLOOK_ACCESS_TOKEN" };
  }
  return provider === "google" ? getGoogleTodayEvents() : getOutlookTodayEvents();
}

async function getUpcomingEvents(days = 7, limit = 20) {
  const provider = getCalendarProvider();
  if (!provider) return { error: "No calendar provider configured" };
  return provider === "google" ? getGoogleUpcomingEvents(days, limit) : getOutlookUpcomingEvents(days, limit);
}

async function createEvent(title, startTime, endTime, description, location) {
  const provider = getCalendarProvider();
  if (!provider) return { error: "No calendar provider configured" };
  return provider === "google"
    ? createGoogleEvent(title, startTime, endTime, description, location)
    : createOutlookEvent(title, startTime, endTime, description, location);
}

async function updateEvent(eventId, updates) {
  const provider = getCalendarProvider();
  if (!provider) return { error: "No calendar provider configured" };
  return provider === "google" ? updateGoogleEvent(eventId, updates) : updateOutlookEvent(eventId, updates);
}

async function deleteEvent(eventId) {
  const provider = getCalendarProvider();
  if (!provider) return { error: "No calendar provider configured" };
  return provider === "google" ? deleteGoogleEvent(eventId) : deleteOutlookEvent(eventId);
}

// === SERVER SETUP ===

const server = new Server(
  { name: "backbone-google", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  switch (name) {
    case "get_recent_emails":
      result = await getRecentEmails(args.limit, args.unreadOnly);
      break;
    case "get_unread_count":
      result = await getUnreadCount();
      break;
    case "search_emails":
      result = await searchEmails(args.query, args.limit);
      break;
    case "get_email_body":
      result = await getEmailBody(args.emailId);
      break;
    case "draft_email":
      result = await draftEmail(args.to, args.subject, args.body, args.reason);
      break;
    case "analyze_emails_by_topic":
      result = await analyzeEmailsByTopic(args.topic, args.limit);
      break;
    case "get_today_events":
      result = await getTodayEvents();
      break;
    case "get_upcoming_events":
      result = await getUpcomingEvents(args.days, args.limit);
      break;
    case "create_event":
      result = await createEvent(args.title, args.startTime, args.endTime, args.description, args.location);
      break;
    case "update_event":
      result = await updateEvent(args.eventId, {
        title: args.title,
        startTime: args.startTime,
        endTime: args.endTime,
        description: args.description,
        location: args.location,
      });
      break;
    case "delete_event":
      result = await deleteEvent(args.eventId);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Google Mail & Calendar MCP Server running");
}

main().catch(console.error);
