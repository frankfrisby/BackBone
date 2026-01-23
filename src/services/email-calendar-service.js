/**
 * Email & Calendar Service
 * Supports Google (Gmail/Calendar) and Microsoft (Outlook/Calendar)
 *
 * Google API: https://developers.google.com/gmail/api
 * Microsoft Graph: https://learn.microsoft.com/en-us/graph/api/overview
 */

import fs from "fs";
import path from "path";
import http from "http";
import { openUrl } from "./open-url.js";

const DATA_DIR = path.join(process.cwd(), "data");
const GOOGLE_TOKEN_FILE = path.join(DATA_DIR, "google-email-tokens.json");
const MICROSOFT_TOKEN_FILE = path.join(DATA_DIR, "microsoft-tokens.json");
const EMAIL_DATA_FILE = path.join(DATA_DIR, "email-data.json");
const CALENDAR_DATA_FILE = path.join(DATA_DIR, "calendar-data.json");

// OAuth callback port
const OAUTH_PORT = 3848;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// Google Configuration
// ============================================================================

// These would be set via environment or config
// Users need to create OAuth credentials at https://console.cloud.google.com/
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback/google`;

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
].join(" ");

// ============================================================================
// Microsoft Configuration
// ============================================================================

// Azure AD app registration required at https://portal.azure.com/
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "";
const MICROSOFT_REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback/microsoft`;
const MICROSOFT_TENANT = "common"; // "common" for personal + work accounts

const MICROSOFT_SCOPES = [
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Calendars.Read",
  "https://graph.microsoft.com/User.Read",
  "offline_access"
].join(" ");

// ============================================================================
// Token Management
// ============================================================================

/**
 * Save Google tokens
 */
export const saveGoogleTokens = (tokens) => {
  const data = {
    ...tokens,
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(GOOGLE_TOKEN_FILE, JSON.stringify(data, null, 2));
};

/**
 * Load Google tokens
 */
export const loadGoogleTokens = () => {
  try {
    if (fs.existsSync(GOOGLE_TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(GOOGLE_TOKEN_FILE, "utf-8"));
    }
  } catch (e) {}
  return null;
};

/**
 * Save Microsoft tokens
 */
export const saveMicrosoftTokens = (tokens) => {
  const data = {
    ...tokens,
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(MICROSOFT_TOKEN_FILE, JSON.stringify(data, null, 2));
};

/**
 * Load Microsoft tokens
 */
export const loadMicrosoftTokens = () => {
  try {
    if (fs.existsSync(MICROSOFT_TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(MICROSOFT_TOKEN_FILE, "utf-8"));
    }
  } catch (e) {}
  return null;
};

/**
 * Check if Google is configured
 */
export const isGoogleEmailConfigured = () => {
  const tokens = loadGoogleTokens();
  return !!(tokens?.access_token);
};

/**
 * Check if Microsoft is configured
 */
export const isMicrosoftConfigured = () => {
  const tokens = loadMicrosoftTokens();
  return !!(tokens?.access_token);
};

/**
 * Check if any email provider is configured
 */
export const isEmailConfigured = () => {
  return isGoogleEmailConfigured() || isMicrosoftConfigured();
};

/**
 * Get configured providers
 */
export const getConfiguredProviders = () => {
  const providers = [];
  if (isGoogleEmailConfigured()) providers.push("google");
  if (isMicrosoftConfigured()) providers.push("microsoft");
  return providers;
};

// ============================================================================
// OAuth Flows
// ============================================================================

/**
 * Generate Google OAuth URL
 */
export const getGoogleAuthUrl = () => {
  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent"
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

/**
 * Generate Microsoft OAuth URL
 */
export const getMicrosoftAuthUrl = () => {
  if (!MICROSOFT_CLIENT_ID) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    redirect_uri: MICROSOFT_REDIRECT_URI,
    response_type: "code",
    scope: MICROSOFT_SCOPES,
    response_mode: "query"
  });

  return `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize?${params.toString()}`;
};

/**
 * Exchange Google auth code for tokens
 */
const exchangeGoogleCode = async (code) => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: GOOGLE_REDIRECT_URI
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token exchange failed: ${error}`);
  }

  return response.json();
};

/**
 * Exchange Microsoft auth code for tokens
 */
const exchangeMicrosoftCode = async (code) => {
  const response = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: MICROSOFT_REDIRECT_URI,
      scope: MICROSOFT_SCOPES
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Microsoft token exchange failed: ${error}`);
  }

  return response.json();
};

/**
 * Refresh Google access token
 */
export const refreshGoogleToken = async () => {
  const tokens = loadGoogleTokens();
  if (!tokens?.refresh_token) {
    throw new Error("No refresh token available");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Google token");
  }

  const newTokens = await response.json();
  saveGoogleTokens({
    ...tokens,
    access_token: newTokens.access_token,
    expires_in: newTokens.expires_in
  });

  return newTokens.access_token;
};

/**
 * Refresh Microsoft access token
 */
export const refreshMicrosoftToken = async () => {
  const tokens = loadMicrosoftTokens();
  if (!tokens?.refresh_token) {
    throw new Error("No refresh token available");
  }

  const response = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES
    })
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Microsoft token");
  }

  const newTokens = await response.json();
  saveMicrosoftTokens({
    ...tokens,
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || tokens.refresh_token,
    expires_in: newTokens.expires_in
  });

  return newTokens.access_token;
};

/**
 * Get valid Google access token (refresh if needed)
 */
const getGoogleAccessToken = async () => {
  const tokens = loadGoogleTokens();
  if (!tokens) return null;

  // Check if token is expired (with 5 min buffer)
  const savedAt = new Date(tokens.savedAt).getTime();
  const expiresIn = (tokens.expires_in || 3600) * 1000;
  const isExpired = Date.now() > savedAt + expiresIn - 300000;

  if (isExpired && tokens.refresh_token) {
    return refreshGoogleToken();
  }

  return tokens.access_token;
};

/**
 * Get valid Microsoft access token (refresh if needed)
 */
const getMicrosoftAccessToken = async () => {
  const tokens = loadMicrosoftTokens();
  if (!tokens) return null;

  // Check if token is expired (with 5 min buffer)
  const savedAt = new Date(tokens.savedAt).getTime();
  const expiresIn = (tokens.expires_in || 3600) * 1000;
  const isExpired = Date.now() > savedAt + expiresIn - 300000;

  if (isExpired && tokens.refresh_token) {
    return refreshMicrosoftToken();
  }

  return tokens.access_token;
};

/**
 * Start OAuth flow with local callback server
 */
export const startOAuthFlow = (provider) => {
  return new Promise((resolve, reject) => {
    const authUrl = provider === "google" ? getGoogleAuthUrl() : getMicrosoftAuthUrl();

    if (!authUrl) {
      reject(new Error(`${provider} OAuth not configured. Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET environment variables.`));
      return;
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);

      if (url.pathname === `/callback/${provider}`) {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<html><body><h1>Authorization Failed</h1><p>${error}</p><script>setTimeout(()=>window.close(),3000)</script></body></html>`);
          server.close();
          reject(new Error(error));
          return;
        }

        if (code) {
          try {
            const tokens = provider === "google"
              ? await exchangeGoogleCode(code)
              : await exchangeMicrosoftCode(code);

            if (provider === "google") {
              saveGoogleTokens(tokens);
            } else {
              saveMicrosoftTokens(tokens);
            }

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0"><div style="text-align:center"><h1 style="color:#22c55e">Connected!</h1><p>${provider === "google" ? "Google" : "Microsoft"} account linked to BACKBONE</p><p style="color:#64748b">You can close this window</p></div></body></html>`);
            server.close();
            resolve({ success: true, provider });
          } catch (err) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<html><body><h1>Error</h1><p>${err.message}</p></body></html>`);
            server.close();
            reject(err);
          }
        }
      }
    });

    server.listen(OAUTH_PORT, () => {
      openUrl(authUrl);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("OAuth timeout"));
    }, 300000);
  });
};

// ============================================================================
// Google API Calls
// ============================================================================

/**
 * Fetch Gmail messages
 */
export const fetchGmailMessages = async (maxResults = 20) => {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) throw new Error("Google not configured");

  // Get message list
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listResponse.ok) {
    throw new Error(`Gmail API error: ${listResponse.status}`);
  }

  const listData = await listResponse.json();
  if (!listData.messages) return [];

  // Fetch message details (batch for efficiency)
  const messages = await Promise.all(
    listData.messages.slice(0, 10).map(async (msg) => {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) return null;
      const data = await response.json();

      const headers = data.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name === name)?.value || "";

      return {
        id: data.id,
        threadId: data.threadId,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: data.snippet,
        isUnread: data.labelIds?.includes("UNREAD")
      };
    })
  );

  return messages.filter(Boolean);
};

/**
 * Fetch Google Calendar events
 */
export const fetchGoogleCalendarEvents = async (daysAhead = 7) => {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken) throw new Error("Google not configured");

  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50"
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Google Calendar API error: ${response.status}`);
  }

  const data = await response.json();

  return (data.items || []).map(event => ({
    id: event.id,
    title: event.summary || "(No title)",
    description: event.description,
    location: event.location,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    isAllDay: !event.start?.dateTime,
    attendees: event.attendees?.map(a => ({ email: a.email, name: a.displayName, status: a.responseStatus })),
    meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri
  }));
};

// ============================================================================
// Microsoft API Calls
// ============================================================================

/**
 * Fetch Outlook messages
 */
export const fetchOutlookMessages = async (maxResults = 20) => {
  const accessToken = await getMicrosoftAccessToken();
  if (!accessToken) throw new Error("Microsoft not configured");

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailfolders/inbox/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,bodyPreview,isRead`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Outlook API error: ${response.status}`);
  }

  const data = await response.json();

  return (data.value || []).map(msg => ({
    id: msg.id,
    from: msg.from?.emailAddress?.address || "",
    fromName: msg.from?.emailAddress?.name || "",
    subject: msg.subject || "(No subject)",
    date: msg.receivedDateTime,
    snippet: msg.bodyPreview,
    isUnread: !msg.isRead
  }));
};

/**
 * Fetch Microsoft Calendar events
 */
export const fetchMicrosoftCalendarEvents = async (daysAhead = 7) => {
  const accessToken = await getMicrosoftAccessToken();
  if (!accessToken) throw new Error("Microsoft not configured");

  const now = new Date();
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${future.toISOString()}&$orderby=start/dateTime&$top=50&$select=id,subject,bodyPreview,start,end,location,isAllDay,attendees,onlineMeeting`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Microsoft Calendar API error: ${response.status}`);
  }

  const data = await response.json();

  return (data.value || []).map(event => ({
    id: event.id,
    title: event.subject || "(No title)",
    description: event.bodyPreview,
    location: event.location?.displayName,
    start: event.start?.dateTime,
    end: event.end?.dateTime,
    isAllDay: event.isAllDay,
    attendees: event.attendees?.map(a => ({
      email: a.emailAddress?.address,
      name: a.emailAddress?.name,
      status: a.status?.response
    })),
    meetLink: event.onlineMeeting?.joinUrl
  }));
};

// ============================================================================
// Combined Fetchers
// ============================================================================

/**
 * Fetch all emails from configured providers
 */
export const fetchAllEmails = async () => {
  const results = { google: [], microsoft: [], fetchedAt: new Date().toISOString() };

  if (isGoogleEmailConfigured()) {
    try {
      results.google = await fetchGmailMessages();
    } catch (err) {
      results.googleError = err.message;
    }
  }

  if (isMicrosoftConfigured()) {
    try {
      results.microsoft = await fetchOutlookMessages();
    } catch (err) {
      results.microsoftError = err.message;
    }
  }

  // Save to file
  fs.writeFileSync(EMAIL_DATA_FILE, JSON.stringify(results, null, 2));

  return results;
};

/**
 * Fetch all calendar events from configured providers
 */
export const fetchAllCalendarEvents = async (daysAhead = 7) => {
  const results = { google: [], microsoft: [], fetchedAt: new Date().toISOString() };

  if (isGoogleEmailConfigured()) {
    try {
      results.google = await fetchGoogleCalendarEvents(daysAhead);
    } catch (err) {
      results.googleError = err.message;
    }
  }

  if (isMicrosoftConfigured()) {
    try {
      results.microsoft = await fetchMicrosoftCalendarEvents(daysAhead);
    } catch (err) {
      results.microsoftError = err.message;
    }
  }

  // Save to file
  fs.writeFileSync(CALENDAR_DATA_FILE, JSON.stringify(results, null, 2));

  return results;
};

/**
 * Load saved email data
 */
export const loadEmailData = () => {
  try {
    if (fs.existsSync(EMAIL_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(EMAIL_DATA_FILE, "utf-8"));
    }
  } catch (e) {}
  return null;
};

/**
 * Load saved calendar data
 */
export const loadCalendarData = () => {
  try {
    if (fs.existsSync(CALENDAR_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(CALENDAR_DATA_FILE, "utf-8"));
    }
  } catch (e) {}
  return null;
};

/**
 * Sync all email and calendar data
 */
export const syncEmailCalendar = async () => {
  const results = { emails: null, calendar: null, error: null };

  try {
    if (isEmailConfigured()) {
      results.emails = await fetchAllEmails();
      results.calendar = await fetchAllCalendarEvents();
    }
  } catch (err) {
    results.error = err.message;
  }

  return results;
};

/**
 * Get email summary for display
 */
export const getEmailSummary = () => {
  const data = loadEmailData();
  if (!data) return null;

  const allEmails = [...(data.google || []), ...(data.microsoft || [])];
  const unread = allEmails.filter(e => e.isUnread);

  return {
    total: allEmails.length,
    unread: unread.length,
    providers: getConfiguredProviders(),
    lastUpdated: data.fetchedAt
  };
};

/**
 * Get upcoming events for display
 */
export const getUpcomingEvents = (count = 5) => {
  const data = loadCalendarData();
  if (!data) return [];

  const allEvents = [...(data.google || []), ...(data.microsoft || [])];

  // Sort by start time and return top N
  return allEvents
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, count);
};

/**
 * Disconnect a provider
 */
export const disconnectProvider = (provider) => {
  if (provider === "google" && fs.existsSync(GOOGLE_TOKEN_FILE)) {
    fs.unlinkSync(GOOGLE_TOKEN_FILE);
  }
  if (provider === "microsoft" && fs.existsSync(MICROSOFT_TOKEN_FILE)) {
    fs.unlinkSync(MICROSOFT_TOKEN_FILE);
  }
};

export default {
  isGoogleEmailConfigured,
  isMicrosoftConfigured,
  isEmailConfigured,
  getConfiguredProviders,
  startOAuthFlow,
  fetchAllEmails,
  fetchAllCalendarEvents,
  syncEmailCalendar,
  getEmailSummary,
  getUpcomingEvents,
  disconnectProvider
};
