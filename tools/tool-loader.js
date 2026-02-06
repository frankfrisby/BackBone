/**
 * Tool Loader & Executor
 *
 * Provides a standard interface for discovering and executing BACKBONE tools.
 * Tools are self-contained modules that can be invoked by AI systems.
 *
 * Usage:
 *   import { listTools, getTool, runTool } from "./tools/tool-loader.js";
 *
 *   // List available tools
 *   const tools = listTools();
 *
 *   // Get tool info
 *   const tool = getTool("add-conviction");
 *
 *   // Run a tool
 *   const result = await runTool("add-conviction", {
 *     symbol: "NVDA",
 *     conviction: 0.9,
 *     reason: "Strong AI growth"
 *   });
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, "index.json");

// Cache for loaded tools
const toolCache = new Map();
let indexCache = null;

/**
 * Load the tools index
 */
export function loadIndex() {
  if (indexCache) return indexCache;

  try {
    const raw = fs.readFileSync(INDEX_PATH, "utf-8");
    indexCache = JSON.parse(raw);
    return indexCache;
  } catch (error) {
    console.error("[ToolLoader] Failed to load index:", error.message);
    return { tools: [], categories: {} };
  }
}

/**
 * List all available tools
 * @param {string} [category] - Filter by category
 * @returns {Array} Array of tool definitions
 */
export function listTools(category = null) {
  const index = loadIndex();
  let tools = index.tools || [];

  if (category) {
    tools = tools.filter(t => t.category === category);
  }

  return tools.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    inputs: t.inputs,
    examples: t.examples
  }));
}

/**
 * Get a specific tool definition
 * @param {string} toolId - Tool ID
 * @returns {Object|null} Tool definition or null
 */
export function getTool(toolId) {
  const index = loadIndex();
  return index.tools?.find(t => t.id === toolId) || null;
}

/**
 * Get tool categories
 * @returns {Object} Category definitions
 */
export function getCategories() {
  const index = loadIndex();
  return index.categories || {};
}

/**
 * Load a tool module
 * @param {string} toolId - Tool ID
 * @returns {Promise<Object>} Tool module with execute function
 */
async function loadToolModule(toolId) {
  if (toolCache.has(toolId)) {
    return toolCache.get(toolId);
  }

  const tool = getTool(toolId);
  if (!tool) {
    throw new Error(`Tool not found: ${toolId}`);
  }

  const toolPath = path.join(__dirname, tool.file);

  if (!fs.existsSync(toolPath)) {
    throw new Error(`Tool file not found: ${tool.file}`);
  }

  try {
    const module = await import(`file://${toolPath}`);
    toolCache.set(toolId, module);
    return module;
  } catch (error) {
    throw new Error(`Failed to load tool ${toolId}: ${error.message}`);
  }
}

/**
 * Validate tool inputs
 * @param {Object} tool - Tool definition
 * @param {Object} inputs - Provided inputs
 * @returns {Object} Validation result { valid, errors, sanitized }
 */
function validateInputs(tool, inputs) {
  const errors = [];
  const sanitized = { ...inputs };

  for (const [key, schema] of Object.entries(tool.inputs || {})) {
    const value = inputs[key];

    // Check required
    if (schema.required && (value === undefined || value === null || value === "")) {
      errors.push(`Missing required input: ${key}`);
      continue;
    }

    // Apply defaults
    if (value === undefined && schema.default !== undefined) {
      sanitized[key] = schema.default;
      continue;
    }

    // Type validation
    if (value !== undefined && schema.type) {
      const actualType = typeof value;
      if (schema.type === "number" && actualType !== "number") {
        // Try to parse
        const parsed = parseFloat(value);
        if (isNaN(parsed)) {
          errors.push(`Input ${key} must be a number`);
        } else {
          sanitized[key] = parsed;
        }
      } else if (schema.type === "boolean" && actualType !== "boolean") {
        sanitized[key] = value === "true" || value === true;
      } else if (schema.type === "string" && actualType !== "string") {
        sanitized[key] = String(value);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Run a tool with inputs
 * @param {string} toolId - Tool ID
 * @param {Object} inputs - Tool inputs
 * @returns {Promise<Object>} Tool result
 */
export async function runTool(toolId, inputs = {}) {
  const tool = getTool(toolId);
  if (!tool) {
    return {
      success: false,
      error: `Tool not found: ${toolId}`,
      availableTools: listTools().map(t => t.id)
    };
  }

  // Validate inputs
  const validation = validateInputs(tool, inputs);
  if (!validation.valid) {
    return {
      success: false,
      error: "Invalid inputs",
      validationErrors: validation.errors,
      expectedInputs: tool.inputs
    };
  }

  try {
    const module = await loadToolModule(toolId);

    if (typeof module.execute !== "function") {
      return {
        success: false,
        error: `Tool ${toolId} does not export an execute function`
      };
    }

    const result = await module.execute(validation.sanitized);

    return {
      success: true,
      toolId,
      result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      toolId
    };
  }
}

/**
 * Get formatted help for a tool
 * @param {string} toolId - Tool ID
 * @returns {string} Formatted help text
 */
export function getToolHelp(toolId) {
  const tool = getTool(toolId);
  if (!tool) return `Tool not found: ${toolId}`;

  let help = `## ${tool.name}\n\n`;
  help += `${tool.description}\n\n`;
  help += `**Category:** ${tool.category}\n\n`;

  if (Object.keys(tool.inputs || {}).length > 0) {
    help += `**Inputs:**\n`;
    for (const [key, schema] of Object.entries(tool.inputs)) {
      const req = schema.required ? "(required)" : `(optional, default: ${schema.default ?? "none"})`;
      help += `- \`${key}\` (${schema.type}) ${req}: ${schema.description}\n`;
    }
    help += "\n";
  }

  if (tool.examples && tool.examples.length > 0) {
    help += `**Examples:**\n`;
    tool.examples.forEach((ex, i) => {
      help += `\`\`\`json\n${JSON.stringify(ex, null, 2)}\n\`\`\`\n`;
    });
  }

  return help;
}

/**
 * Get all tools formatted for AI consumption (e.g., Claude tool definitions)
 * @returns {Array} Array of tool definitions in Claude tool format
 */
export function getToolsForAI() {
  const tools = listTools();

  return tools.map(tool => ({
    name: `backbone_${tool.id.replace(/-/g, "_")}`,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(tool.inputs || {}).map(([key, schema]) => [
          key,
          {
            type: schema.type,
            description: schema.description,
            ...(schema.default !== undefined ? { default: schema.default } : {})
          }
        ])
      ),
      required: Object.entries(tool.inputs || {})
        .filter(([_, schema]) => schema.required)
        .map(([key]) => key)
    }
  }));
}

export default {
  listTools,
  getTool,
  getCategories,
  runTool,
  getToolHelp,
  getToolsForAI
};
