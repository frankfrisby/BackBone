/**
 * Mount User Extensions
 *
 * On startup, merges user-defined MCP servers, skills, and tools
 * with the engine's built-in ones so they're available at runtime.
 *
 * MCP:    auto-discovered from src/mcp/*-server.js + user/mcp/servers.json → .mcp.json
 * Skills: user/skills/           + engine/skills → merged by skills-loader.js
 * Tools:  user/tools/index.json  + engine/tools  → merged by tool-loader.js
 */

import fs from "fs";
import path from "path";
import { getUserMcpDir, getEngineRoot } from "./paths.js";

// ── Non-standard name mappings ──────────────────────────────
// Servers whose MCP name doesn't match `backbone-{filename}`.
// e.g. google-mail-calendar-server.js → backbone-google (not backbone-google-mail-calendar)
const NAME_OVERRIDES = {
  "google-mail-calendar-server.js": "backbone-google",
};

// Servers to skip (superseded by other servers)
const SKIP_FILES = new Set([
  // calendar-server.js and email-server.js are superseded by google-mail-calendar-server.js
  "calendar-server.js",
  "email-server.js",
]);

/**
 * Auto-discover all MCP servers in src/mcp/*-server.js
 * Derives the MCP name from the filename: foo-server.js → backbone-foo
 * Unless overridden in NAME_OVERRIDES.
 */
function discoverMcpServers() {
  const engineRoot = getEngineRoot();
  const mcpDir = path.join(engineRoot, "src", "mcp");
  const servers = {};

  if (!fs.existsSync(mcpDir)) return servers;

  const files = fs.readdirSync(mcpDir).filter(f => f.endsWith("-server.js"));

  for (const file of files) {
    if (SKIP_FILES.has(file)) continue;

    // Derive name: brokerage-server.js → backbone-brokerage
    const name = NAME_OVERRIDES[file] || "backbone-" + file.replace("-server.js", "");
    servers[name] = {
      command: "node",
      args: [`src/mcp/${file}`],
    };
  }

  return servers;
}

// ── Extra (non-src/mcp) servers ─────────────────────────────
const EXTRA_SERVERS = {
  "claude-in-chrome": {
    command: "npx",
    args: ["-y", "@anthropic-ai/claude-code-mcp-in-chrome"],
  },
};

/**
 * Merge engine MCP servers + user MCP servers → .mcp.json
 *
 * Engine servers are auto-discovered from src/mcp/*-server.js.
 * User servers.json overrides engine servers on name collision.
 */
export function mountMcpServers() {
  // Auto-discover all engine MCP servers
  const discovered = discoverMcpServers();
  const merged = { ...discovered, ...EXTRA_SERVERS };

  const engineCount = Object.keys(merged).length;

  // Load user MCP servers (override on collision)
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
    console.log(`[Mount] Updated .mcp.json with ${Object.keys(merged).length} servers (${Object.keys(discovered).length} auto-discovered)`);
  }

  return {
    engineServers: engineCount,
    discoveredServers: Object.keys(discovered),
    userServers: Object.keys(merged).length - engineCount,
    totalServers: Object.keys(merged).length,
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
