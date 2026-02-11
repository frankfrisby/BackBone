/**
 * LinkedIn Agent — Autonomous LinkedIn data fetcher and network intelligence
 *
 * This agent uses Claude-in-Chrome browser automation to interact with LinkedIn.
 * It fetches profile data, connections, messages, posts, and enriches the
 * BACKBONE contacts directory with LinkedIn intelligence.
 *
 * Schedule: Daily at 8 AM (cron), on-demand via /linkedin refresh
 *
 * Data flow:
 *   Claude-in-Chrome → linkedin-server MCP → data/linkedin-profile.json
 *                                          → data/linkedin-history/
 *                                          → contacts MCP
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getDataDir, getMemoryDir } from "../paths.js";

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const STATE_PATH = path.join(DATA_DIR, "linkedin-agent-state.json");
const PROFILE_PATH = path.join(DATA_DIR, "linkedin-profile.json");
const HISTORY_DIR = path.join(DATA_DIR, "linkedin-history");

// Minimum hours between operations to avoid hammering LinkedIn
const COOLDOWNS = {
  profileRefresh: 12,       // Full profile refresh every 12h
  connectionsScrape: 168,   // Connections scrape weekly (168h)
  messagesCheck: 6,         // Messages every 6h
  postsCheck: 12,           // Posts every 12h
  contactEnrichment: 24,    // Contact enrichment daily
};

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

class LinkedInAgent extends EventEmitter {
  constructor() {
    super();
    this.state = this._loadState();
    this.isRunning = false;
  }

  _loadState() {
    return readJson(STATE_PATH) || {
      lastProfileRefresh: null,
      lastConnectionsScrape: null,
      lastMessagesCheck: null,
      lastPostsCheck: null,
      lastContactEnrichment: null,
      totalRuns: 0,
      lastRun: null,
      lastError: null,
      connectionsCount: 0,
      messagesRead: 0,
      contactsEnriched: 0,
      profileCompleteness: 0,
    };
  }

  _saveState() {
    writeJson(STATE_PATH, this.state);
  }

  _hoursSince(isoDateStr) {
    if (!isoDateStr) return Infinity;
    return (Date.now() - new Date(isoDateStr).getTime()) / (1000 * 60 * 60);
  }

  _canRun(operation) {
    const lastRun = this.state[`last${operation.charAt(0).toUpperCase() + operation.slice(1)}`];
    return this._hoursSince(lastRun) >= (COOLDOWNS[operation] || 24);
  }

  /**
   * Main agent cycle — determines what needs doing and returns a task plan.
   * The actual execution happens via Claude-in-Chrome browser automation.
   */
  async run() {
    if (this.isRunning) {
      return { status: "already_running", message: "LinkedIn agent is already running" };
    }

    this.isRunning = true;
    this.state.totalRuns++;
    this.state.lastRun = new Date().toISOString();

    try {
      const tasks = this._planTasks();

      if (tasks.length === 0) {
        this.isRunning = false;
        this._saveState();
        return { status: "idle", message: "All LinkedIn data is fresh. Nothing to do.", nextCheck: this._getNextCheck() };
      }

      this.emit("cycle-start", { tasks: tasks.map(t => t.action) });

      const results = [];
      for (const task of tasks) {
        this.emit("task-start", task);
        const result = await this._executeTask(task);
        results.push(result);
        this.emit("task-complete", { ...task, result });
      }

      this.isRunning = false;
      this._saveState();
      this.emit("cycle-complete", { results });

      return {
        status: "complete",
        tasksExecuted: results.length,
        results,
        nextCheck: this._getNextCheck(),
      };
    } catch (error) {
      this.state.lastError = { message: error.message, at: new Date().toISOString() };
      this.isRunning = false;
      this._saveState();
      this.emit("error", error);
      return { status: "error", message: error.message };
    }
  }

  /**
   * Determine which tasks need to run based on cooldowns
   */
  _planTasks() {
    const tasks = [];

    // Priority order: profile > messages > posts > connections > enrichment
    if (this._canRun("profileRefresh")) {
      tasks.push({
        action: "profile_refresh",
        description: "Refresh LinkedIn profile data",
        priority: 1,
      });
    }

    if (this._canRun("messagesCheck")) {
      tasks.push({
        action: "messages_check",
        description: "Check LinkedIn messages",
        priority: 2,
      });
    }

    if (this._canRun("postsCheck")) {
      tasks.push({
        action: "posts_check",
        description: "Check LinkedIn posts and engagement",
        priority: 3,
      });
    }

    if (this._canRun("connectionsScrape")) {
      tasks.push({
        action: "connections_scrape",
        description: "Scrape LinkedIn connections list",
        priority: 4,
      });
    }

    if (this._canRun("contactEnrichment")) {
      tasks.push({
        action: "contact_enrichment",
        description: "Enrich top contacts with detailed profiles",
        priority: 5,
      });
    }

    return tasks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute a single task — returns a browser automation plan
   * for Claude-in-Chrome to carry out
   */
  async _executeTask(task) {
    switch (task.action) {
      case "profile_refresh":
        return this._buildProfileRefreshPlan();
      case "messages_check":
        return this._buildMessagesCheckPlan();
      case "posts_check":
        return this._buildPostsCheckPlan();
      case "connections_scrape":
        return this._buildConnectionsScrapePlan();
      case "contact_enrichment":
        return this._buildContactEnrichmentPlan();
      default:
        return { action: task.action, status: "unknown_action" };
    }
  }

  // === Browser Automation Plans ===

  _buildProfileRefreshPlan() {
    const existingData = readJson(PROFILE_PATH);
    const profileUrl = existingData?.profileUrl || existingData?.url || null;

    this.state.lastProfileRefresh = new Date().toISOString();

    return {
      action: "profile_refresh",
      method: "claude-in-chrome",
      profileUrl,
      steps: [
        {
          step: 1,
          action: "navigate",
          url: "https://www.linkedin.com/me",
          description: "Go to user's LinkedIn profile (redirects to actual URL)",
          waitFor: "profile page load",
        },
        {
          step: 2,
          action: "extract_hero",
          selectors: ["h1", ".text-heading-xlarge", ".pv-text-details__left-panel"],
          extract: ["name", "headline", "location", "connections", "followers"],
          description: "Extract name, headline, location from top section",
        },
        {
          step: 3,
          action: "extract_about",
          description: "Find and expand About section, extract full text",
          clickExpand: true,
        },
        {
          step: 4,
          action: "extract_experience",
          description: "Extract all work experience entries with title, company, duration, description",
          clickExpand: true,
          clickShowAll: true,
        },
        {
          step: 5,
          action: "extract_education",
          description: "Extract education entries with school, degree, field, years",
        },
        {
          step: 6,
          action: "navigate_and_extract",
          url: "{profileUrl}/details/skills/",
          extract: "skills",
          description: "Navigate to skills page and extract all skills with endorsement counts",
        },
        {
          step: 7,
          action: "save",
          tool: "save_linkedin_profile_data",
          description: "Compile all extracted data and save via MCP tool",
        },
      ],
    };
  }

  _buildMessagesCheckPlan() {
    this.state.lastMessagesCheck = new Date().toISOString();

    return {
      action: "messages_check",
      method: "claude-in-chrome",
      steps: [
        {
          step: 1,
          action: "navigate",
          url: "https://www.linkedin.com/messaging/",
          description: "Navigate to LinkedIn messaging inbox",
        },
        {
          step: 2,
          action: "extract_conversations",
          description: "Extract recent conversation threads — sender name, preview text, timestamp, unread status",
          maxItems: 20,
        },
        {
          step: 3,
          action: "read_unread",
          description: "Click into each unread conversation and extract full message thread",
          maxItems: 5,
        },
        {
          step: 4,
          action: "save",
          tool: "update_linkedin_section",
          section: "messages",
          description: "Save messages data via MCP",
        },
      ],
    };
  }

  _buildPostsCheckPlan() {
    const existingData = readJson(PROFILE_PATH);
    const profileUrl = existingData?.profileUrl || existingData?.url || null;

    this.state.lastPostsCheck = new Date().toISOString();

    return {
      action: "posts_check",
      method: "claude-in-chrome",
      steps: [
        {
          step: 1,
          action: "navigate",
          url: profileUrl ? `${profileUrl}recent-activity/all/` : "https://www.linkedin.com/me/recent-activity/all/",
          description: "Navigate to user's recent activity/posts page",
        },
        {
          step: 2,
          action: "extract_posts",
          description: "Extract posts with content, type, date, likes, comments, reposts count",
          maxItems: 20,
          scrollLoads: 3,
        },
        {
          step: 3,
          action: "save",
          tool: "update_linkedin_section",
          section: "posts",
          description: "Save posts data via MCP",
        },
      ],
    };
  }

  _buildConnectionsScrapePlan() {
    this.state.lastConnectionsScrape = new Date().toISOString();

    return {
      action: "connections_scrape",
      method: "claude-in-chrome",
      steps: [
        {
          step: 1,
          action: "navigate",
          url: "https://www.linkedin.com/mynetwork/invite-connect/connections/",
          description: "Navigate to LinkedIn connections page",
        },
        {
          step: 2,
          action: "scroll_and_extract",
          description: "Scroll to load connections, extract: name, headline, profile URL, connected date",
          maxItems: 200,
          scrollLoads: 10,
        },
        {
          step: 3,
          action: "save_connections",
          tool: "update_linkedin_section",
          section: "connections",
          description: "Save connections list via MCP",
        },
        {
          step: 4,
          action: "sync_to_contacts",
          tool: "add_contact",
          description: "For each new connection not already in backbone-contacts, add them with category 'linkedin'",
          category: "linkedin",
        },
      ],
    };
  }

  _buildContactEnrichmentPlan() {
    this.state.lastContactEnrichment = new Date().toISOString();

    return {
      action: "contact_enrichment",
      method: "claude-in-chrome",
      steps: [
        {
          step: 1,
          action: "identify_targets",
          description: "Read backbone-contacts with category 'linkedin' that have no detailed profile data (missing role, company, or notes). Pick top 5 to enrich.",
          tool: "get_contacts",
          category: "linkedin",
        },
        {
          step: 2,
          action: "visit_profiles",
          description: "For each target contact, navigate to their LinkedIn profile URL and extract: current role, company, headline, location, about summary",
          maxItems: 5,
          delayBetween: "3-5 seconds",
        },
        {
          step: 3,
          action: "update_contacts",
          tool: "update_contact",
          description: "Update each contact in backbone-contacts with enriched data (role, company, notes with LinkedIn summary)",
        },
      ],
    };
  }

  // === On-Demand Actions ===

  /**
   * Send a LinkedIn message (risk 8 — requires user confirmation)
   */
  buildSendMessagePlan(recipientName, messageText) {
    return {
      action: "send_message",
      risk: 8,
      requiresConfirmation: true,
      method: "claude-in-chrome",
      recipient: recipientName,
      message: messageText,
      steps: [
        {
          step: 1,
          action: "navigate",
          url: "https://www.linkedin.com/messaging/",
          description: "Navigate to LinkedIn messaging",
        },
        {
          step: 2,
          action: "new_message",
          description: `Click 'New message' / compose button, search for "${recipientName}" in the recipient field`,
        },
        {
          step: 3,
          action: "type_message",
          description: `Type the message: "${messageText}"`,
        },
        {
          step: 4,
          action: "confirm_and_send",
          description: "Take screenshot for user to verify, then click Send only after explicit user confirmation",
          requiresConfirmation: true,
        },
      ],
    };
  }

  /**
   * Search for a person on LinkedIn
   */
  buildSearchPlan(query, filters = {}) {
    return {
      action: "search",
      method: "claude-in-chrome",
      query,
      filters,
      steps: [
        {
          step: 1,
          action: "navigate",
          url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`,
          description: `Search LinkedIn for "${query}"`,
        },
        {
          step: 2,
          action: "extract_results",
          description: "Extract search results: name, headline, location, profile URL, mutual connections",
          maxItems: 10,
        },
        {
          step: 3,
          action: "return_results",
          description: "Return structured search results",
        },
      ],
    };
  }

  /**
   * View a specific contact's full LinkedIn profile
   */
  buildViewProfilePlan(profileUrl) {
    return {
      action: "view_profile",
      method: "claude-in-chrome",
      profileUrl,
      steps: [
        {
          step: 1,
          action: "navigate",
          url: profileUrl,
          description: "Navigate to the contact's LinkedIn profile",
        },
        {
          step: 2,
          action: "extract_full_profile",
          description: "Extract: name, headline, location, about, experience (all entries), education, skills, recent posts",
          clickExpand: true,
        },
        {
          step: 3,
          action: "return_profile",
          description: "Return structured profile data",
        },
      ],
    };
  }

  // === Utility ===

  _getNextCheck() {
    const checks = [
      { op: "profileRefresh", label: "Profile refresh" },
      { op: "messagesCheck", label: "Messages check" },
      { op: "postsCheck", label: "Posts check" },
      { op: "connectionsScrape", label: "Connections scrape" },
      { op: "contactEnrichment", label: "Contact enrichment" },
    ];

    const next = [];
    for (const { op, label } of checks) {
      const key = `last${op.charAt(0).toUpperCase() + op.slice(1)}`;
      const hoursSince = this._hoursSince(this.state[key]);
      const cooldown = COOLDOWNS[op];
      const hoursUntil = Math.max(0, cooldown - hoursSince);

      next.push({
        operation: label,
        hoursUntilDue: Math.round(hoursUntil * 10) / 10,
        isDue: hoursUntil === 0,
      });
    }

    return next.sort((a, b) => a.hoursUntilDue - b.hoursUntilDue);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      totalRuns: this.state.totalRuns,
      lastRun: this.state.lastRun,
      lastError: this.state.lastError,
      profileCompleteness: this.state.profileCompleteness,
      connectionsCount: this.state.connectionsCount,
      messagesRead: this.state.messagesRead,
      contactsEnriched: this.state.contactsEnriched,
      schedule: this._getNextCheck(),
      cooldowns: COOLDOWNS,
    };
  }

  getDisplayData() {
    const status = this.getStatus();
    return {
      ...status,
      stateFile: STATE_PATH,
      profileFile: PROFILE_PATH,
      historyDir: HISTORY_DIR,
    };
  }

  /**
   * Force reset cooldowns (for testing or manual override)
   */
  resetCooldowns() {
    this.state.lastProfileRefresh = null;
    this.state.lastConnectionsScrape = null;
    this.state.lastMessagesCheck = null;
    this.state.lastPostsCheck = null;
    this.state.lastContactEnrichment = null;
    this._saveState();
    return { message: "All cooldowns reset. Next run will execute all tasks." };
  }
}

// Singleton
let instance = null;
export function getLinkedInAgent() {
  if (!instance) instance = new LinkedInAgent();
  return instance;
}

export default LinkedInAgent;
