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

/**
 * BACKBONE Email MCP Server
 * Provides tools for email integration (Gmail/Outlook)
 */

const DATA_DIR = getDataDir();
const EMAIL_CACHE = path.join(DATA_DIR, "email-cache.json");
const GOOGLE_TOKEN_FILE = path.join(DATA_DIR, "google-email-tokens.json");

// Load Google tokens from config file (MCP child processes don't inherit .env vars)
const loadGoogleTokens = () => {
  try {
    if (fs.existsSync(GOOGLE_TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(GOOGLE_TOKEN_FILE, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
};
const getGmailToken = () => process.env.GMAIL_ACCESS_TOKEN || loadGoogleTokens()?.access_token || null;

// Tool definitions
const TOOLS = [
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
];

// Gmail API helpers
const getGmailHeaders = () => ({
  Authorization: `Bearer ${getGmailToken()}`,
  "Content-Type": "application/json",
});

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// Microsoft Graph API helpers (for Outlook)
const getOutlookHeaders = () => ({
  Authorization: `Bearer ${process.env.OUTLOOK_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
});

const OUTLOOK_BASE = "https://graph.microsoft.com/v1.0/me";

// Detect which provider is configured
const getEmailProvider = () => {
  if (getGmailToken()) return "gmail";
  if (process.env.OUTLOOK_ACCESS_TOKEN) return "outlook";
  return null;
};

// Cache management
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

// Gmail implementations
async function getGmailEmails(limit = 10, unreadOnly = false) {
  try {
    const query = unreadOnly ? "is:unread" : "";
    const url = `${GMAIL_BASE}/messages?maxResults=${limit}${query ? `&q=${encodeURIComponent(query)}` : ""}`;

    const listResponse = await fetch(url, { headers: getGmailHeaders() });

    if (!listResponse.ok) {
      if (listResponse.status === 401) {
        return { error: "Gmail token expired", hint: "Re-authenticate with Gmail" };
      }
      throw new Error(`Gmail API error: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const messages = listData.messages || [];

    // Fetch message details
    const emails = await Promise.all(
      messages.slice(0, limit).map(async (msg) => {
        const detailResponse = await fetch(`${GMAIL_BASE}/messages/${msg.id}?format=metadata`, {
          headers: getGmailHeaders(),
        });
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
    const response = await fetch(`${GMAIL_BASE}/labels/INBOX`, {
      headers: getGmailHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }

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
    const url = `${GMAIL_BASE}/messages?maxResults=${limit}&q=${encodeURIComponent(query)}`;
    const listResponse = await fetch(url, { headers: getGmailHeaders() });

    if (!listResponse.ok) {
      throw new Error(`Gmail API error: ${listResponse.status}`);
    }

    const listData = await listResponse.json();
    const messages = listData.messages || [];

    const emails = await Promise.all(
      messages.map(async (msg) => {
        const detailResponse = await fetch(`${GMAIL_BASE}/messages/${msg.id}?format=metadata`, {
          headers: getGmailHeaders(),
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

// Outlook implementations
async function getOutlookEmails(limit = 10, unreadOnly = false) {
  try {
    const filter = unreadOnly ? "&$filter=isRead eq false" : "";
    const url = `${OUTLOOK_BASE}/messages?$top=${limit}&$orderby=receivedDateTime desc${filter}`;

    const response = await fetch(url, { headers: getOutlookHeaders() });

    if (!response.ok) {
      if (response.status === 401) {
        return { error: "Outlook token expired", hint: "Re-authenticate with Outlook" };
      }
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

    if (!response.ok) {
      throw new Error(`Outlook API error: ${response.status}`);
    }

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

    if (!response.ok) {
      throw new Error(`Outlook API error: ${response.status}`);
    }

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

// Unified tool implementations
async function getRecentEmails(limit = 10, unreadOnly = false) {
  const provider = getEmailProvider();

  if (!provider) {
    return {
      error: "No email provider configured",
      hint: "Set GMAIL_ACCESS_TOKEN or OUTLOOK_ACCESS_TOKEN environment variable",
    };
  }

  if (provider === "gmail") {
    return getGmailEmails(limit, unreadOnly);
  } else {
    return getOutlookEmails(limit, unreadOnly);
  }
}

async function getUnreadCount() {
  const provider = getEmailProvider();

  if (!provider) {
    return { error: "No email provider configured" };
  }

  if (provider === "gmail") {
    return getGmailUnreadCount();
  } else {
    return getOutlookUnreadCount();
  }
}

async function searchEmails(query, limit = 20) {
  const provider = getEmailProvider();

  if (!provider) {
    return { error: "No email provider configured" };
  }

  if (provider === "gmail") {
    return searchGmailEmails(query, limit);
  } else {
    return searchOutlookEmails(query, limit);
  }
}

// Create server
const server = new Server(
  {
    name: "backbone-email",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Email MCP Server running");
}

main().catch(console.error);
