/**
 * Mount User Extensions
 *
 * On startup, merges user-defined MCP servers, skills, and tools
 * with the engine's built-in ones so they're available at runtime.
 *
 * MCP:    user/mcp/servers.json  + engine base  → .mcp.json (read by Claude Code)
 * Skills: user/skills/           + engine/skills → merged by skills-loader.js
 * Tools:  user/tools/index.json  + engine/tools  → merged by tool-loader.js
 */

import fs from "fs";
import path from "path";
import { getUserMcpDir, getEngineRoot } from "./paths.js";

// ── Base MCP config (engine-provided servers) ───────────────────

const BASE_MCP_SERVERS = {
  "backbone-google": {
    command: "node",
    args: ["src/mcp/google-mail-calendar-server.js"]
  },
  "backbone-linkedin": {
    command: "node",
    args: ["src/mcp/linkedin-server.js"]
  },
  "backbone-contacts": {
    command: "node",
    args: ["src/mcp/contacts-server.js"]
  },
  "backbone-news": {
    command: "node",
    args: ["src/mcp/news-server.js"]
  },
  "backbone-life": {
    command: "node",
    args: ["src/mcp/life-server.js"]
  },
  "backbone-health": {
    command: "node",
    args: ["src/mcp/health-server.js"]
  },
  "backbone-trading": {
    command: "node",
    args: ["src/mcp/trading-server.js"]
  },
  "backbone-projects": {
    command: "node",
    args: ["src/mcp/projects-server.js"]
  },
  "backbone-vapi": {
    command: "node",
    args: ["src/mcp/vapi-server.js"]
  },
  "backbone-whatsapp": {
    command: "node",
    args: ["src/mcp/whatsapp-server.js"]
  },
  "backbone-youtube": {
    command: "node",
    args: ["src/mcp/youtube-server.js"]
  },
  "claude-in-chrome": {
    command: "npx",
    args: ["-y", "@anthropic-ai/claude-code-mcp-in-chrome"]
  }
};

/**
 * Merge engine MCP servers + user MCP servers → .mcp.json
 *
 * User servers.json format:
 * {
 *   "my-custom-server": {
 *     "command": "node",
 *     "args": ["path/to/server.js"],
 *     "env": { "API_KEY": "..." }
 *   }
 * }
 *
 * User servers override engine servers on name collision.
 */
export function mountMcpServers() {
  const merged = { ...BASE_MCP_SERVERS };

  // Load user MCP servers
  const userMcpDir = getUserMcpDir();
  const userServersPath = path.join(userMcpDir, "servers.json");

  if (fs.existsSync(userServersPath)) {
    try {
      const userServers = JSON.parse(fs.readFileSync(userServersPath, "utf-8"));
      for (const [name, config] of Object.entries(userServers)) {
        merged[name] = config;
      }
    } catch (err) {
      console.error("[Mount] Failed to load user MCP servers:", err.message);
    }
  }

  // Write merged .mcp.json at engine root
  const mcpJsonPath = path.join(getEngineRoot(), ".mcp.json");
  const mcpJson = { mcpServers: merged };

  // Only write if content changed (avoid unnecessary file writes)
  const newContent = JSON.stringify(mcpJson, null, 2) + "\n";
  let currentContent = "";
  try { currentContent = fs.readFileSync(mcpJsonPath, "utf-8"); } catch {}

  if (newContent !== currentContent) {
    fs.writeFileSync(mcpJsonPath, newContent);
  }

  return {
    engineServers: Object.keys(BASE_MCP_SERVERS).length,
    userServers: Object.keys(merged).length - Object.keys(BASE_MCP_SERVERS).length,
    totalServers: Object.keys(merged).length
  };
}

/**
 * Mount all user extensions (MCP, skills, tools).
 * Skills and tools are handled by their respective loaders at runtime.
 * MCP needs to be written to .mcp.json since Claude Code reads it directly.
 */
export function mountAllExtensions() {
  const result = { mcp: null, skills: "loaded by skills-loader.js", tools: "loaded by tool-loader.js" };

  try {
    result.mcp = mountMcpServers();
  } catch (err) {
    console.error("[Mount] MCP mount failed:", err.message);
    result.mcp = { error: err.message };
  }

  return result;
}
