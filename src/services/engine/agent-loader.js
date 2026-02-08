/**
 * Agent Loader — Discovers agent workspaces from .agents/ directory
 *
 * Scans .agents/<agent-id>/ directories for IDENTITY.md + config.json
 * and returns structured agent definitions. Each agent gets per-user
 * runtime memory at ~/.backbone/users/<uid>/agents/<agent-id>/.
 */

import fs from "fs";
import path from "path";
import { getEngineRoot, getUserAgentsDir } from "../paths.js";

const AGENTS_DIR = path.join(getEngineRoot(), ".agents");

/**
 * Discover all agent workspaces from .agents/ directory.
 * Returns array of { id, identity, config, paths }.
 */
export function discoverAgents() {
  if (!fs.existsSync(AGENTS_DIR)) return [];

  const agents = [];
  for (const entry of fs.readdirSync(AGENTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const agentDir = path.join(AGENTS_DIR, entry.name);
    const configPath = path.join(agentDir, "config.json");
    const identityPath = path.join(agentDir, "IDENTITY.md");

    if (!fs.existsSync(configPath)) continue;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const identity = fs.existsSync(identityPath)
        ? fs.readFileSync(identityPath, "utf-8")
        : null;

      agents.push({
        id: entry.name,
        identity,
        config,
        paths: {
          root: agentDir,
          config: configPath,
          identity: identityPath,
        },
      });
    } catch {
      // Skip agents with broken config
    }
  }

  return agents;
}

/**
 * Get a specific agent by ID.
 * Returns { id, identity, config, paths } or null if not found.
 */
export function getAgent(agentId) {
  const agents = discoverAgents();
  return agents.find((a) => a.id === agentId) || null;
}

/**
 * Get the per-user runtime memory directory for an agent.
 * Creates it if it doesn't exist.
 *
 * Structure: ~/.backbone/users/<uid>/agents/<agent-id>/
 */
export function getAgentMemoryDir(agentId) {
  const userAgentsDir = getUserAgentsDir();
  const agentMemDir = path.join(userAgentsDir, agentId);
  if (!fs.existsSync(agentMemDir)) {
    fs.mkdirSync(agentMemDir, { recursive: true });
  }
  return agentMemDir;
}

/**
 * List agents filtered by type (engine, infrastructure, etc.)
 */
export function getAgentsByType(type) {
  return discoverAgents().filter((a) => a.config.type === type);
}

/**
 * List agents filtered by schedule type
 */
export function getAgentsBySchedule(schedule) {
  return discoverAgents().filter((a) => a.config.schedule === schedule);
}
