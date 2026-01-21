import fs from "fs";
import path from "path";

/**
 * MCP Tools Service for BACKBONE
 * Manages available MCP servers and tools that the system can execute
 */

const DATA_DIR = path.join(process.cwd(), "data");
const MCP_CONFIG_PATH = path.join(DATA_DIR, "mcp-config.json");

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
  calendar: {
    name: "Calendar",
    description: "Google Calendar integration",
    enabled: false,
    tools: [
      { name: "list_events", description: "List upcoming events" },
      { name: "create_event", description: "Create a new calendar event" },
      { name: "update_event", description: "Update an existing event" },
      { name: "delete_event", description: "Delete a calendar event" },
      { name: "get_free_busy", description: "Check availability" }
    ]
  },
  email: {
    name: "Email",
    description: "Gmail integration",
    enabled: false,
    tools: [
      { name: "list_emails", description: "List recent emails" },
      { name: "read_email", description: "Read email content" },
      { name: "send_email", description: "Send a new email" },
      { name: "reply_email", description: "Reply to an email" },
      { name: "search_emails", description: "Search emails" }
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
  try {
    if (fs.existsSync(MCP_CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, "utf-8"));
      // Merge with defaults to ensure new servers are included
      return { ...DEFAULT_MCP_SERVERS, ...saved };
    }
  } catch (error) {
    console.error("Failed to load MCP config:", error.message);
  }
  return DEFAULT_MCP_SERVERS;
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
