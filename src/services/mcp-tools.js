import fs from "fs";
import path from "path";

import { getDataDir, getEngineRoot } from "./paths.js";
/**
 * MCP Tools Service for BACKBONE
 * Manages available MCP servers and tools that the system can execute
 */

const DATA_DIR = getDataDir();
const MCP_CONFIG_PATH = path.join(DATA_DIR, "mcp-config.json");
const MCP_RUNTIME_PATH = path.join(getEngineRoot(), ".mcp.json");

const DYNAMIC_TOOL_HINTS = {
  "backbone-google": [
    { name: "get_recent_emails", description: "Get recent inbox emails" },
    { name: "get_today_events", description: "Get today's calendar events" }
  ],
  "backbone-linkedin": [
    { name: "get_linkedin_profile", description: "Get LinkedIn profile data" }
  ],
  "backbone-contacts": [
    { name: "get_contacts", description: "List contacts" }
  ],
  "backbone-news": [
    { name: "fetch_latest_news", description: "Fetch latest news" }
  ],
  "backbone-life": [
    { name: "get_goals", description: "Get active goals" }
  ],
  "backbone-health": [
    { name: "get_health_summary", description: "Get health summary" }
  ],
  "backbone-trading": [
    { name: "get_account", description: "Get trading account information" }
  ],
  "backbone-projects": [
    { name: "create_project", description: "Create project workspace" }
  ],
  "backbone-vapi": [
    { name: "call_user", description: "Start an outbound AI voice call" },
    { name: "end_call", description: "End active AI voice call" },
    { name: "get_call_status", description: "Get active AI voice call status" }
  ],
  "backbone-whatsapp": [
    { name: "send_whatsapp", description: "Send WhatsApp message" }
  ],
  "backbone-youtube": [
    { name: "get_video_transcript", description: "Get video transcript" }
  ],
  "claude-in-chrome": [
    { name: "browser_control", description: "Control browser session in Chrome" }
  ]
};

const toDisplayName = (serverId = "") => {
  return String(serverId)
    .replace(/^backbone-/, "")
    .replace(/^user-/, "user ")
    .split(/[-_]/g)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const loadRuntimeMcpServers = () => {
  try {
    if (fs.existsSync(MCP_RUNTIME_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(MCP_RUNTIME_PATH, "utf-8"));
      return parsed?.mcpServers || {};
    }
  } catch (error) {
    console.error("Failed to load runtime MCP servers:", error.message);
  }
  return {};
};

const mergeServerDefinition = (base = {}, incoming = {}) => {
  const merged = {
    ...base,
    ...incoming
  };
  if (!Array.isArray(merged.tools)) {
    merged.tools = Array.isArray(base.tools) ? base.tools : Array.isArray(incoming.tools) ? incoming.tools : [];
  }
  if (typeof merged.enabled !== "boolean") {
    merged.enabled = true;
  }
  if (!merged.name) {
    merged.name = "Unnamed Server";
  }
  if (!merged.description) {
    merged.description = "MCP server";
  }
  return merged;
};

const buildDynamicServerDefinition = (serverId) => ({
  name: toDisplayName(serverId) || serverId,
  description: `Runtime MCP server: ${serverId}`,
  enabled: true,
  tools: DYNAMIC_TOOL_HINTS[serverId] || []
});

/**
 * Default MCP servers and their tools
 */
export const DEFAULT_MCP_SERVERS = {
  filesystem: {
    name: "Filesystem",
    description: "Read, write, and manage local files",
    enabled: true,
    tools: [
      { name: "read_file", description: "Read contents of a file" },
      { name: "write_file", description: "Write content to a file" },
      { name: "list_directory", description: "List files in a directory" },
      { name: "create_directory", description: "Create a new directory" },
      { name: "delete_file", description: "Delete a file" },
      { name: "move_file", description: "Move or rename a file" }
    ]
  },
  browser: {
    name: "Browser",
    description: "Web browsing and scraping capabilities",
    enabled: true,
    tools: [
      { name: "navigate", description: "Navigate to a URL" },
      { name: "screenshot", description: "Take a screenshot of current page" },
      { name: "click", description: "Click an element on the page" },
      { name: "type", description: "Type text into an input field" },
      { name: "extract_text", description: "Extract text content from page" },
      { name: "get_links", description: "Get all links from current page" }
    ]
  },
  alpaca: {
    name: "Alpaca Trading",
    description: "Stock trading and portfolio management",
    enabled: true,
    tools: [
      { name: "get_account", description: "Get account information" },
      { name: "get_positions", description: "Get current positions" },
      { name: "place_order", description: "Place a buy/sell order" },
      { name: "cancel_order", description: "Cancel a pending order" },
      { name: "get_orders", description: "Get order history" },
      { name: "get_quotes", description: "Get real-time quotes" },
      { name: "get_bars", description: "Get historical price bars" }
    ]
  },
  google: {
    name: "Google Mail & Calendar",
    description: "Unified email and calendar (Gmail/Outlook + Google Calendar/Outlook Calendar)",
    enabled: true,
    tools: [
      { name: "get_recent_emails", description: "Get recent inbox emails" },
      { name: "get_unread_count", description: "Count unread emails" },
      { name: "search_emails", description: "Search emails by query" },
      { name: "get_email_body", description: "Read full email content by ID" },
      { name: "draft_email", description: "Create email draft (requires approval)" },
      { name: "analyze_emails_by_topic", description: "Correlate emails with user interests" },
      { name: "get_today_events", description: "Get today's calendar events" },
      { name: "get_upcoming_events", description: "Get upcoming events for N days" },
      { name: "create_event", description: "Create a new calendar event" },
      { name: "update_event", description: "Update an existing calendar event" },
      { name: "delete_event", description: "Delete a calendar event" }
    ]
  },
  contacts: {
    name: "Contacts Directory",
    description: "Manage contacts across categories (LinkedIn, family, friends, coworkers, startup)",
    enabled: true,
    tools: [
      { name: "add_contact", description: "Add a new contact" },
      { name: "get_contacts", description: "List contacts by category" },
      { name: "search_contacts", description: "Search contacts by name, company, or notes" },
      { name: "get_contact_profile", description: "Get full profile for a contact" },
      { name: "update_contact", description: "Update contact details" },
      { name: "categorize_contact", description: "Move contact to a different category" }
    ]
  },
  news: {
    name: "News & Research",
    description: "News fetching, market summaries, and AI-powered research",
    enabled: true,
    tools: [
      { name: "fetch_latest_news", description: "Fetch and analyze latest news" },
      { name: "get_market_summary", description: "Get latest market summary" },
      { name: "research_topic", description: "Deep research on a topic" },
      { name: "get_news_for_beliefs", description: "Get news relevant to core beliefs" },
      { name: "correlate_news_with_portfolio", description: "Analyze news impact on portfolio" }
    ]
  },
  life: {
    name: "Life Management",
    description: "Goals, beliefs, backlog, life scores, and thinking engine",
    enabled: true,
    tools: [
      { name: "get_goals", description: "Get goals by status or category" },
      { name: "get_beliefs", description: "Get core beliefs" },
      { name: "get_backlog", description: "Get backlog items with filtering" },
      { name: "get_life_scores", description: "Get life dimension scores" },
      { name: "add_goal", description: "Create a new goal" },
      { name: "add_belief", description: "Add a new core belief" },
      { name: "get_thesis", description: "Get current thesis/focus" },
      { name: "trigger_thinking_cycle", description: "Force a thinking engine cycle" }
    ]
  },
  github: {
    name: "GitHub",
    description: "GitHub repository management",
    enabled: false,
    tools: [
      { name: "list_repos", description: "List repositories" },
      { name: "create_repo", description: "Create a new repository" },
      { name: "create_issue", description: "Create an issue" },
      { name: "create_pr", description: "Create a pull request" },
      { name: "get_commits", description: "Get commit history" }
    ]
  },
  notion: {
    name: "Notion",
    description: "Notion workspace integration",
    enabled: false,
    tools: [
      { name: "search_pages", description: "Search Notion pages" },
      { name: "create_page", description: "Create a new page" },
      { name: "update_page", description: "Update page content" },
      { name: "query_database", description: "Query a Notion database" }
    ]
  },
  slack: {
    name: "Slack",
    description: "Slack workspace integration",
    enabled: false,
    tools: [
      { name: "send_message", description: "Send a message to a channel" },
      { name: "list_channels", description: "List available channels" },
      { name: "get_messages", description: "Get recent messages" },
      { name: "search_messages", description: "Search messages" }
    ]
  },
  memory: {
    name: "Memory",
    description: "Persistent memory and knowledge storage",
    enabled: true,
    tools: [
      { name: "store_memory", description: "Store information in memory" },
      { name: "recall_memory", description: "Recall stored information" },
      { name: "search_memory", description: "Search through memories" },
      { name: "forget_memory", description: "Remove a memory entry" }
    ]
  },
  search: {
    name: "Web Search",
    description: "Search the web for information",
    enabled: true,
    tools: [
      { name: "web_search", description: "Search the web" },
      { name: "news_search", description: "Search recent news" },
      { name: "image_search", description: "Search for images" }
    ]
  },
  projects: {
    name: "Projects",
    description: "Create and manage project workspaces",
    enabled: true,
    tools: [
      { name: "create_project", description: "Create a new project" },
      { name: "list_projects", description: "List existing projects" },
      { name: "create_project_action", description: "Add an action to a project" }
    ]
  }
};

/**
 * Load MCP configuration from disk
 */
export const loadMCPConfig = () => {
  const merged = { ...DEFAULT_MCP_SERVERS };

  // Merge persisted display config
  try {
    if (fs.existsSync(MCP_CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, "utf-8"));
      for (const [serverId, serverDef] of Object.entries(saved || {})) {
        merged[serverId] = mergeServerDefinition(merged[serverId], serverDef);
      }
    }
  } catch (error) {
    console.error("Failed to load MCP config:", error.message);
  }

  // Merge runtime servers from .mcp.json so dynamic/user servers always show up
  const runtimeServers = loadRuntimeMcpServers();
  for (const serverId of Object.keys(runtimeServers)) {
    merged[serverId] = mergeServerDefinition(merged[serverId], buildDynamicServerDefinition(serverId));
  }

  return merged;
};

/**
 * Save MCP configuration to disk
 */
export const saveMCPConfig = (config) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save MCP config:", error.message);
    return false;
  }
};

/**
 * Register or update a display definition for an MCP server.
 * This does not modify .mcp.json command wiring; it updates tool list metadata.
 */
export const registerMCPServerDefinition = (serverId, definition = {}) => {
  if (!serverId) return null;
  const config = loadMCPConfig();
  config[serverId] = mergeServerDefinition(config[serverId], {
    name: definition.name || toDisplayName(serverId),
    description: definition.description || `MCP server: ${serverId}`,
    enabled: definition.enabled ?? config[serverId]?.enabled ?? true,
    tools: Array.isArray(definition.tools) ? definition.tools : config[serverId]?.tools
  });
  saveMCPConfig(config);
  return config[serverId];
};

/**
 * Get list of all available tools
 */
export const getAllTools = () => {
  const config = loadMCPConfig();
  const tools = [];

  Object.entries(config).forEach(([serverId, server]) => {
    if (server.enabled && server.tools) {
      server.tools.forEach(tool => {
        tools.push({
          server: serverId,
          serverName: server.name,
          ...tool
        });
      });
    }
  });

  return tools;
};

/**
 * Get list of enabled MCP servers
 */
export const getEnabledServers = () => {
  const config = loadMCPConfig();
  return Object.entries(config)
    .filter(([, server]) => server.enabled)
    .map(([id, server]) => ({
      id,
      name: server.name,
      description: server.description,
      toolCount: server.tools?.length || 0
    }));
};

/**
 * Get list of disabled MCP servers
 */
export const getDisabledServers = () => {
  const config = loadMCPConfig();
  return Object.entries(config)
    .filter(([, server]) => !server.enabled)
    .map(([id, server]) => ({
      id,
      name: server.name,
      description: server.description,
      toolCount: server.tools?.length || 0
    }));
};

/**
 * Enable an MCP server
 */
export const enableServer = (serverId) => {
  const config = loadMCPConfig();
  if (config[serverId]) {
    config[serverId].enabled = true;
    saveMCPConfig(config);
    return true;
  }
  return false;
};

/**
 * Disable an MCP server
 */
export const disableServer = (serverId) => {
  const config = loadMCPConfig();
  if (config[serverId]) {
    config[serverId].enabled = false;
    saveMCPConfig(config);
    return true;
  }
  return false;
};

/**
 * Get tools summary for display
 */
export const getToolsSummary = () => {
  const config = loadMCPConfig();
  const enabled = getEnabledServers();
  const disabled = getDisabledServers();
  const allTools = getAllTools();

  return {
    totalServers: Object.keys(config).length,
    enabledServers: enabled.length,
    disabledServers: disabled.length,
    totalTools: allTools.length,
    enabled,
    disabled,
    tools: allTools
  };
};

/**
 * Format tools list for display
 */
export const formatToolsList = () => {
  const summary = getToolsSummary();
  const lines = [];

  lines.push(`MCP Tools (${summary.totalTools} available from ${summary.enabledServers} servers)`);
  lines.push("");

  // Enabled servers
  lines.push("Enabled Servers:");
  summary.enabled.forEach(server => {
    lines.push(`  ${server.name} (${server.toolCount} tools)`);
  });

  lines.push("");
  lines.push("Available Tools:");

  // Group tools by server
  const toolsByServer = {};
  summary.tools.forEach(tool => {
    if (!toolsByServer[tool.serverName]) {
      toolsByServer[tool.serverName] = [];
    }
    toolsByServer[tool.serverName].push(tool);
  });

  Object.entries(toolsByServer).forEach(([serverName, tools]) => {
    lines.push(`  [${serverName}]`);
    tools.forEach(tool => {
      lines.push(`    ${tool.name} - ${tool.description}`);
    });
  });

  if (summary.disabled.length > 0) {
    lines.push("");
    lines.push("Disabled Servers (use /mcp enable <server>):");
    summary.disabled.forEach(server => {
      lines.push(`  ${server.id} - ${server.name}`);
    });
  }

  return lines.join("\n");
};
