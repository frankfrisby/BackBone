import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/**
 * BACKBONE Calendar MCP Server
 * Provides tools for calendar integration (Google Calendar/Outlook)
 */

const DATA_DIR = path.join(process.cwd(), "data");
const CALENDAR_CACHE = path.join(DATA_DIR, "calendar-cache.json");

// Tool definitions
const TOOLS = [
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
];

// Google Calendar API helpers
const getGoogleHeaders = () => ({
  Authorization: `Bearer ${process.env.GOOGLE_CALENDAR_TOKEN}`,
  "Content-Type": "application/json",
});

const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

// Microsoft Graph API helpers (for Outlook Calendar)
const getOutlookHeaders = () => ({
  Authorization: `Bearer ${process.env.OUTLOOK_ACCESS_TOKEN}`,
  "Content-Type": "application/json",
});

const OUTLOOK_BASE = "https://graph.microsoft.com/v1.0/me";

// Detect which provider is configured
const getCalendarProvider = () => {
  if (process.env.GOOGLE_CALENDAR_TOKEN) return "google";
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

// Google Calendar implementations
async function getGoogleTodayEvents() {
  try {
    const timeMin = formatDate(startOfDay());
    const timeMax = formatDate(endOfDay());

    const url = `${GOOGLE_CALENDAR_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

    const response = await fetch(url, { headers: getGoogleHeaders() });

    if (!response.ok) {
      if (response.status === 401) {
        return { error: "Google Calendar token expired" };
      }
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
    const timeMin = formatDate(new Date());
    const timeMax = formatDate(addDays(new Date(), days));

    const url = `${GOOGLE_CALENDAR_BASE}/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=${limit}&singleEvents=true&orderBy=startTime`;

    const response = await fetch(url, { headers: getGoogleHeaders() });

    if (!response.ok) {
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
      meetLink: event.hangoutLink || null,
    }));

    return { events, days, provider: "google" };
  } catch (error) {
    return { error: error.message };
  }
}

async function createGoogleEvent(title, startTime, endTime, description, location) {
  try {
    const event = {
      summary: title,
      start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    };

    if (description) event.description = description;
    if (location) event.location = location;

    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`, {
      method: "POST",
      headers: getGoogleHeaders(),
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Google Calendar API error: ${response.status}`);
    }

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

// Outlook Calendar implementations
async function getOutlookTodayEvents() {
  try {
    const startDateTime = formatDate(startOfDay());
    const endDateTime = formatDate(endOfDay());

    const url = `${OUTLOOK_BASE}/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$orderby=start/dateTime`;

    const response = await fetch(url, { headers: getOutlookHeaders() });

    if (!response.ok) {
      if (response.status === 401) {
        return { error: "Outlook token expired" };
      }
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

    if (!response.ok) {
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

    if (!response.ok) {
      throw new Error(`Outlook API error: ${response.status}`);
    }

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

// Unified tool implementations
async function getTodayEvents() {
  const provider = getCalendarProvider();

  if (!provider) {
    return {
      error: "No calendar provider configured",
      hint: "Set GOOGLE_CALENDAR_TOKEN or OUTLOOK_ACCESS_TOKEN environment variable",
    };
  }

  if (provider === "google") {
    return getGoogleTodayEvents();
  } else {
    return getOutlookTodayEvents();
  }
}

async function getUpcomingEvents(days = 7, limit = 20) {
  const provider = getCalendarProvider();

  if (!provider) {
    return { error: "No calendar provider configured" };
  }

  if (provider === "google") {
    return getGoogleUpcomingEvents(days, limit);
  } else {
    return getOutlookUpcomingEvents(days, limit);
  }
}

async function createEvent(title, startTime, endTime, description, location) {
  const provider = getCalendarProvider();

  if (!provider) {
    return { error: "No calendar provider configured" };
  }

  if (provider === "google") {
    return createGoogleEvent(title, startTime, endTime, description, location);
  } else {
    return createOutlookEvent(title, startTime, endTime, description, location);
  }
}

// Create server
const server = new Server(
  {
    name: "backbone-calendar",
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
    case "get_today_events":
      result = await getTodayEvents();
      break;
    case "get_upcoming_events":
      result = await getUpcomingEvents(args.days, args.limit);
      break;
    case "create_event":
      result = await createEvent(args.title, args.startTime, args.endTime, args.description, args.location);
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
  console.error("BACKBONE Calendar MCP Server running");
}

main().catch(console.error);
