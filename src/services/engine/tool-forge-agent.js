/**
 * Tool Forge Agent — Builds executable tools autonomously
 *
 * 4 phases: DETECT → DESIGN → BUILD → VALIDATE
 *
 * When the engine hits a capability gap, this agent:
 * 1. Parses what's needed from the failed goal context
 * 2. Designs a tool spec using existing tools as templates
 * 3. Generates the tool file and registers it in index.json
 * 4. Dry-runs the tool to verify it works
 *
 * State persisted to agent memory directory.
 */

import fs from "fs";
import path from "path";
import { getAgentMemoryDir } from "./agent-loader.js";
import { loadIndex, runTool, refreshToolIndex } from "../../../tools/tool-loader.js";
import { getDataDir, getEngineRoot } from "../paths.js";
import { runClaudeCodePrompt } from "../ai/claude-code-cli.js";

const AGENT_ID = "tool-forge";
const DATA_DIR = getDataDir();
const ENGINE_ROOT = getEngineRoot();
const TOOLS_DIR = path.join(ENGINE_ROOT, "tools");
const INDEX_PATH = path.join(TOOLS_DIR, "index.json");
const FORGE_LOG_PATH = path.join(DATA_DIR, "tool-forge-log.json");

const PHASES = {
  DETECT: { order: 1, label: "Detect", next: "DESIGN" },
  DESIGN: { order: 2, label: "Design", next: "BUILD" },
  BUILD:  { order: 3, label: "Build",  next: "VALIDATE" },
  VALIDATE: { order: 4, label: "Validate", next: null },
};

// ── State Management ────────────────────────────────────────

export function loadState() {
  const stateFile = path.join(getAgentMemoryDir(AGENT_ID), "state.json");
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    }
  } catch {}
  return { forgeQueue: [], completedForges: [], stats: { totalBuilt: 0, totalFailed: 0 }, lastUpdated: null };
}

export function saveState(state) {
  const memDir = getAgentMemoryDir(AGENT_ID);
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(path.join(memDir, "state.json"), JSON.stringify(state, null, 2));
}

function logForge(entry) {
  let log = [];
  try {
    if (fs.existsSync(FORGE_LOG_PATH)) {
      log = JSON.parse(fs.readFileSync(FORGE_LOG_PATH, "utf-8"));
    }
  } catch {}
  log.push({ ...entry, timestamp: new Date().toISOString() });
  // Keep last 100 entries
  if (log.length > 100) log = log.slice(-100);
  fs.writeFileSync(FORGE_LOG_PATH, JSON.stringify(log, null, 2));
}

// ── Phase 1: DETECT ─────────────────────────────────────────

/**
 * Detect what capability is needed from context.
 * @param {Object} context - { goalTitle, goalOutput, errorMessage, userRequest }
 * @returns {Object} { needed, description, trigger }
 */
export function detect(context) {
  const signals = [];
  const text = [context.goalOutput, context.errorMessage, context.userRequest, context.goalTitle]
    .filter(Boolean).join(" ").toLowerCase();

  // Pattern match for capability-need signals
  const patterns = [
    /i need (?:a )?tool (?:to|for|that) (.+?)(?:\.|$)/i,
    /no (?:tool|way|capability) (?:to|for) (.+?)(?:\.|$)/i,
    /missing (?:capability|tool|function) (?:to|for) (.+?)(?:\.|$)/i,
    /can(?:'|no)t (?:find a |)(?:tool|way) to (.+?)(?:\.|$)/i,
    /(?:need|require)s? (?:a |an )?(.+?) (?:tool|capability|function)/i,
    /build (?:a )?tool (?:to|for|that) (.+?)(?:\.|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      signals.push(match[1].trim());
    }
  }

  if (signals.length === 0 && context.userRequest) {
    // Direct user request to build a tool
    signals.push(context.userRequest);
  }

  return {
    needed: signals.length > 0,
    description: signals[0] || null,
    allSignals: signals,
    trigger: context.goalTitle || context.userRequest || "unknown",
  };
}

// ── Phase 2: DESIGN ─────────────────────────────────────────

/**
 * Design a tool spec based on the detected need.
 * Uses Claude to generate a proper spec.
 * @param {string} description - What the tool should do
 * @returns {Promise<Object>} Tool spec { id, name, description, category, inputs, file }
 */
export async function design(description) {
  // Check existing tools to avoid duplicates
  const index = loadIndex();
  const existingIds = new Set((index.tools || []).map(t => t.id));
  const existingDescriptions = (index.tools || []).map(t => `${t.id}: ${t.description}`).join("\n");

  const prompt = `You are designing a BACKBONE tool. The user needs: "${description}"

Existing tools (do NOT duplicate):
${existingDescriptions}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "id": "kebab-case-id",
  "name": "Human Readable Name",
  "description": "One-line description of what the tool does",
  "category": "one of: trading, research, health, goals, daily, world, messaging, documents, media, profile, web, utility",
  "inputs": {
    "paramName": { "type": "string|number|boolean", "required": true/false, "description": "..." }
  }
}`;

  const result = await runClaudeCodePrompt(prompt, { maxTokens: 1000 });

  try {
    // Extract JSON from response
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");
    const spec = JSON.parse(jsonMatch[0]);

    // Validate no duplicate
    if (existingIds.has(spec.id)) {
      throw new Error(`Tool "${spec.id}" already exists`);
    }

    spec.file = `${spec.id}.js`;
    return spec;
  } catch (err) {
    throw new Error(`Design failed: ${err.message}`);
  }
}

// ── Phase 3: BUILD ──────────────────────────────────────────

/**
 * Build the tool: generate JS file and register in index.json.
 * @param {Object} spec - Tool spec from design phase
 * @returns {Promise<Object>} { toolPath, registered }
 */
export async function build(spec) {
  const toolPath = path.join(TOOLS_DIR, spec.file);

  // Read a template tool for reference
  const templatePath = path.join(TOOLS_DIR, "add-conviction.js");
  let template = "";
  try { template = fs.readFileSync(templatePath, "utf-8"); } catch {}

  // Generate tool code via Claude
  const inputsList = Object.entries(spec.inputs || {})
    .map(([k, v]) => `  ${k}: ${v.type}${v.required ? " (required)" : ""} — ${v.description}`)
    .join("\n");

  const prompt = `Generate a BACKBONE tool module. Follow this exact pattern:

TEMPLATE (for reference):
\`\`\`javascript
${template}
\`\`\`

REQUIREMENTS:
- Tool ID: ${spec.id}
- Name: ${spec.name}
- Description: ${spec.description}
- Category: ${spec.category}
- Inputs:
${inputsList || "  (none)"}

OUTPUT: Write ONLY the complete JavaScript module. Use ES module syntax (import/export).
The module MUST export: metadata (object), execute (async function), and a default export.
The execute function receives an inputs object and must return { success: true/false, ... }.
Import from relative paths like "../src/services/..." if needed, or use built-in Node modules.
Keep it focused and simple. No unnecessary dependencies.`;

  const result = await runClaudeCodePrompt(prompt, { maxTokens: 4000 });

  // Extract code from response
  let code = result.output;
  const codeMatch = code.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  if (codeMatch) code = codeMatch[1];

  // Validate it has the required exports
  if (!code.includes("export const metadata") || !code.includes("export async function execute")) {
    throw new Error("Generated code missing required exports (metadata, execute)");
  }

  // Write tool file
  fs.writeFileSync(toolPath, code);

  // Register in index.json
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  index.tools.push({
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    file: spec.file,
    inputs: spec.inputs || {},
  });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

  // Refresh so it's immediately available
  refreshToolIndex();

  return { toolPath, registered: true };
}

// ── Phase 4: VALIDATE ───────────────────────────────────────

/**
 * Validate a forged tool by dry-running it.
 * @param {string} toolId - Tool ID to validate
 * @returns {Promise<Object>} { valid, error }
 */
export async function validate(toolId) {
  try {
    // Try to load the module (catches syntax errors)
    const tool = loadIndex().tools.find(t => t.id === toolId);
    if (!tool) return { valid: false, error: "Tool not found in index" };

    const toolPath = path.join(tool._basePath || TOOLS_DIR, tool.file);
    await import(`file://${toolPath}`);

    // Run with empty inputs to check it doesn't crash on load
    // (It should return a validation error, not throw)
    const result = await runTool(toolId, {});

    // If it returns a structured response (even with validation errors), it's valid
    const valid = result !== undefined && result !== null;
    return { valid, result };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ── Orchestrator: Full Forge Cycle ──────────────────────────

/**
 * Run a full forge cycle: DETECT → DESIGN → BUILD → VALIDATE
 * @param {Object} context - Trigger context
 * @returns {Promise<Object>} Forge result
 */
export async function forge(context) {
  const state = loadState();

  // Guard: max 3 tools per cycle
  const recentForges = state.completedForges.filter(f => {
    const age = Date.now() - new Date(f.completedAt).getTime();
    return age < 60 * 60 * 1000; // last hour
  });
  if (recentForges.length >= 3) {
    return { success: false, error: "Max 3 tools per forge cycle (hourly limit)" };
  }

  // Phase 1: DETECT
  const detection = detect(context);
  if (!detection.needed) {
    return { success: false, error: "No capability need detected", detection };
  }

  console.log(`[ToolForge] Detected need: ${detection.description}`);

  try {
    // Phase 2: DESIGN
    const spec = await design(detection.description);
    console.log(`[ToolForge] Designed tool: ${spec.id} (${spec.category})`);

    // Phase 3: BUILD
    const buildResult = await build(spec);
    console.log(`[ToolForge] Built: ${buildResult.toolPath}`);

    // Phase 4: VALIDATE
    const validation = await validate(spec.id);

    if (!validation.valid) {
      // Rollback: remove from index and delete file
      console.log(`[ToolForge] Validation failed, rolling back: ${validation.error}`);
      rollbackTool(spec.id, spec.file);
      state.stats.totalFailed++;
      saveState(state);
      logForge({ action: "forge-failed", toolId: spec.id, error: validation.error, trigger: detection.trigger });
      return { success: false, error: `Validation failed: ${validation.error}`, spec };
    }

    // Success
    state.completedForges.push({
      toolId: spec.id,
      description: spec.description,
      trigger: detection.trigger,
      completedAt: new Date().toISOString(),
    });
    state.stats.totalBuilt++;
    saveState(state);
    logForge({ action: "forge-success", toolId: spec.id, spec, trigger: detection.trigger });

    console.log(`[ToolForge] ✓ Tool "${spec.id}" forged and registered`);
    return { success: true, toolId: spec.id, spec, validation };
  } catch (err) {
    state.stats.totalFailed++;
    saveState(state);
    logForge({ action: "forge-error", error: err.message, trigger: detection.trigger });
    return { success: false, error: err.message };
  }
}

function rollbackTool(toolId, file) {
  try {
    // Remove from index
    const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
    index.tools = index.tools.filter(t => t.id !== toolId);
    fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
    // Delete file
    const toolPath = path.join(TOOLS_DIR, file);
    if (fs.existsSync(toolPath)) fs.unlinkSync(toolPath);
    refreshToolIndex();
  } catch {}
}

// ── Capability Need Detection (for autonomous-engine) ───────

/**
 * Scan Claude output for capability-need signals.
 * @param {string} output - Claude's output from a failed goal
 * @returns {Object|null} { description } if need detected, null otherwise
 */
export function detectCapabilityNeed(output) {
  if (!output) return null;
  const result = detect({ goalOutput: output });
  return result.needed ? { description: result.description } : null;
}

export default { loadState, saveState, detect, design, build, validate, forge, detectCapabilityNeed };
