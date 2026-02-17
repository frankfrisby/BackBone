/**
 * Calendar Action Processor
 *
 * Parses AI responses for calendar action tags and executes them:
 *   [CALENDAR_ADD] title | startTime | endTime | location
 *   [CALENDAR_DELETE] keyword to match
 *
 * Uses the same Google Calendar API + tokens as the MCP server.
 * Returns the cleaned response text with tags stripped out.
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getDataDir } from "../paths.js";

const TAG = "[CalendarActions]";
const DATA_DIR = getDataDir();
const GOOGLE_TOKEN_FILE = path.join(DATA_DIR, "google-email-tokens.json");
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

// ── Token management (mirrors MCP server logic) ─────────────────

function loadTokens() {
  try {
    if (fs.existsSync(GOOGLE_TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(GOOGLE_TOKEN_FILE, "utf-8"));
    }
  } catch {}
  return null;
}

function saveTokens(tokens) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(GOOGLE_TOKEN_FILE, JSON.stringify({ ...tokens, savedAt: new Date().toISOString() }, null, 2));
  } catch {}
}

function isExpired(tokens) {
  if (!tokens?.savedAt) return true;
  const saved = new Date(tokens.savedAt).getTime();
  const expires = (tokens.expires_in || 3600) * 1000;
  return Date.now() > saved + expires - 120_000; // 2min buffer
}

async function getValidToken() {
  const tokens = loadTokens();
  if (!tokens?.access_token) return null;

  if (isExpired(tokens)) {
    if (!tokens.refresh_token || !tokens.client_id || !tokens.client_secret) return null;
    try {
      const resp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: tokens.client_id,
          client_secret: tokens.client_secret,
          refresh_token: tokens.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const data = await resp.json();
      if (data.access_token) {
        const merged = { ...tokens, ...data };
        saveTokens(merged);
        return merged.access_token;
      }
    } catch (err) {
      console.error(`${TAG} Token refresh error:`, err.message);
    }
    return null;
  }

  return tokens.access_token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Calendar API calls ──────────────────────────────────────────

async function createEvent(title, startTime, endTime, location) {
  const token = await getValidToken();
  if (!token) return { success: false, error: "No valid Google Calendar token" };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const event = {
    summary: title,
    start: { dateTime: startTime, timeZone: tz },
    end: { dateTime: endTime, timeZone: tz },
  };
  if (location) event.location = location;

  const resp = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(event),
  });

  if (!resp.ok) return { success: false, error: `Calendar API ${resp.status}` };

  const created = await resp.json();
  console.log(`${TAG} Created event: "${title}" at ${startTime}`);
  return {
    success: true,
    event: { id: created.id, title: created.summary, start: created.start?.dateTime, end: created.end?.dateTime },
  };
}

async function findAndDeleteEvent(keyword) {
  const token = await getValidToken();
  if (!token) return { success: false, error: "No valid Google Calendar token" };

  // Search upcoming events for the keyword
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  const url = `${GOOGLE_CALENDAR_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(future)}&q=${encodeURIComponent(keyword)}&singleEvents=true&orderBy=startTime&maxResults=5`;

  const resp = await fetch(url, { headers: authHeaders(token) });
  if (!resp.ok) return { success: false, error: `Calendar search failed: ${resp.status}` };

  const data = await resp.json();
  const events = data.items || [];

  if (events.length === 0) {
    return { success: false, error: `No events found matching "${keyword}"` };
  }

  // Delete the first matching event
  const target = events[0];
  const delResp = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${target.id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });

  if (!delResp.ok && delResp.status !== 204) {
    return { success: false, error: `Delete failed: ${delResp.status}` };
  }

  console.log(`${TAG} Deleted event: "${target.summary}" (${target.id})`);
  return { success: true, deleted: { id: target.id, title: target.summary } };
}

// ── Main processor ──────────────────────────────────────────────

/**
 * Process AI response text for calendar action tags.
 * Executes any calendar actions found and strips the tags from the text.
 *
 * @param {string} responseText - The raw AI response
 * @returns {Promise<{ cleanText: string, actions: Array }>}
 */
export async function processCalendarActions(responseText) {
  if (!responseText) return { cleanText: responseText, actions: [] };

  const actions = [];
  let cleanText = responseText;

  // ── [CALENDAR_ADD] title | start | end | location ──
  const addPattern = /\[CALENDAR_ADD\]\s*(.+)/gi;
  let match;

  while ((match = addPattern.exec(responseText)) !== null) {
    const parts = match[1].split("|").map(s => s.trim());
    const [title, startTime, endTime, location] = parts;

    if (title && startTime && endTime) {
      try {
        const result = await createEvent(title, startTime, endTime, location || null);
        actions.push({ type: "add", title, startTime, endTime, location, result });
      } catch (err) {
        console.error(`${TAG} Create event error:`, err.message);
        actions.push({ type: "add", title, error: err.message });
      }
    } else {
      console.log(`${TAG} Incomplete CALENDAR_ADD: "${match[1]}"`);
    }

    // Remove the tag line from the response
    cleanText = cleanText.replace(match[0], "").trim();
  }

  // ── [CALENDAR_DELETE] keyword ──
  const delPattern = /\[CALENDAR_DELETE\]\s*(.+)/gi;

  while ((match = delPattern.exec(responseText)) !== null) {
    const keyword = match[1].trim();

    if (keyword) {
      try {
        const result = await findAndDeleteEvent(keyword);
        actions.push({ type: "delete", keyword, result });
      } catch (err) {
        console.error(`${TAG} Delete event error:`, err.message);
        actions.push({ type: "delete", keyword, error: err.message });
      }
    }

    cleanText = cleanText.replace(match[0], "").trim();
  }

  // Clean up any double newlines left by tag removal
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanText, actions };
}

export default { processCalendarActions };
