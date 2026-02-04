/**
 * Capability Builder
 *
 * Self-extending system that constructs code, libraries, and utility modules
 * to solve problems. Builds on top of existing BACKBONE infrastructure.
 *
 * This is the "Jarvis builds its own tools" layer:
 * 1. Detects when a problem needs custom code (not just a skill or MCP server)
 * 2. Generates reusable utility modules in src/lib/
 * 3. Creates data pipelines for recurring analysis
 * 4. Builds integrations with external services
 * 5. Manages a registry of all constructed capabilities
 *
 * Unlike skill-gap-detector (which creates knowledge docs + MCP tools),
 * this creates actual reusable code libraries the system can import.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { sendMessage } from "./claude.js";

const DATA_DIR = path.join(process.cwd(), "data");
const LIB_DIR = path.join(process.cwd(), "src", "lib");
const REGISTRY_PATH = path.join(DATA_DIR, "capability-registry.json");
const BUILD_LOG_PATH = path.join(DATA_DIR, "capability-build-log.json");

/**
 * Capability types
 */
export const CAPABILITY_TYPE = {
  UTILITY: "utility",           // Reusable utility function/module
  PIPELINE: "pipeline",         // Data processing pipeline
  INTEGRATION: "integration",   // External service integration
  ANALYZER: "analyzer",         // Data analysis module
  TRANSFORMER: "transformer",   // Data transformation module
  VALIDATOR: "validator"        // Validation/verification module
};

/**
 * Load the capability registry
 */
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
    }
  } catch {}
  return {
    capabilities: [],
    stats: { totalBuilt: 0, lastBuild: null },
    createdAt: new Date().toISOString()
  };
}

/**
 * Save the capability registry
 */
function saveRegistry(registry) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch (err) {
    console.error("[CapabilityBuilder] Failed to save registry:", err.message);
  }
}

/**
 * Load build log
 */
function loadBuildLog() {
  try {
    if (fs.existsSync(BUILD_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(BUILD_LOG_PATH, "utf-8"));
    }
  } catch {}
  return { builds: [] };
}

/**
 * Save build log
 */
function saveBuildLog(log) {
  try {
    fs.writeFileSync(BUILD_LOG_PATH, JSON.stringify(log, null, 2));
  } catch {}
}

/**
 * Capability Builder Service
 */
export class CapabilityBuilder extends EventEmitter {
  constructor() {
    super();
    this.registry = loadRegistry();
    this.building = false;
  }

  /**
   * Analyze a problem and determine what code/library needs to be built.
   *
   * @param {Object} problem - Description of the problem
   * @param {string} problem.description - What needs to be solved
   * @param {string} problem.context - Additional context
   * @param {string} problem.source - Where this need came from (goal, user, idle)
   * @returns {Object} Analysis result with build recommendations
   */
  async analyzeProblem(problem) {
    if (!problem?.description) return { needsBuild: false };

    // Check if we already have a capability for this
    const existing = this.findExistingCapability(problem.description);
    if (existing) {
      return { needsBuild: false, existing, reason: "Capability already exists" };
    }

    try {
      const prompt = `You are analyzing whether BACKBONE needs to build a new code module to solve a problem.

PROBLEM: ${problem.description}
CONTEXT: ${problem.context || "none"}

EXISTING CAPABILITIES in src/lib/:
${this.registry.capabilities.map(c => `- ${c.name}: ${c.description}`).join("\n") || "None yet"}

EXISTING SERVICES in src/services/:
- ai-brain.js, auto-trader.js, score-engine.js, trading-algorithms.js
- goal-manager.js, thinking-engine.js, idle-processor.js
- skill-gap-detector.js (creates skills + MCP servers)
- app-command-handler.js, message-classifier.js
- realtime-messaging.js, unified-message-log.js
- And 40+ more services

Does this problem need a NEW reusable code module? Or can it be solved with existing services + skills?

Respond with JSON:
{
  "needsBuild": true/false,
  "reason": "why or why not",
  "recommendation": {
    "name": "module-name",
    "type": "utility|pipeline|integration|analyzer|transformer|validator",
    "description": "what it does",
    "exports": ["functionName1", "functionName2"],
    "dependencies": ["existing-service-or-npm-package"],
    "estimatedComplexity": "simple|moderate|complex"
  } or null
}`;

      const response = await sendMessage(prompt, { format: "json" });
      const text = response?.content || response?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.error("[CapabilityBuilder] Analysis failed:", err.message);
    }

    return { needsBuild: false, reason: "Analysis failed" };
  }

  /**
   * Build a new capability (code module) based on analysis.
   *
   * @param {Object} spec - Build specification from analyzeProblem
   * @returns {Object} Build result
   */
  async buildCapability(spec) {
    if (this.building) return { success: false, error: "Already building" };
    if (!spec?.recommendation?.name) return { success: false, error: "No build specification" };

    this.building = true;
    const { recommendation } = spec;

    try {
      // Ensure lib directory exists
      if (!fs.existsSync(LIB_DIR)) {
        fs.mkdirSync(LIB_DIR, { recursive: true });
      }

      const modulePath = path.join(LIB_DIR, `${recommendation.name}.js`);

      // Don't overwrite existing modules
      if (fs.existsSync(modulePath)) {
        this.building = false;
        return { success: false, error: "Module already exists", path: modulePath };
      }

      // Generate the code
      const prompt = `Generate a complete, production-ready Node.js ES module for BACKBONE.

MODULE: ${recommendation.name}
TYPE: ${recommendation.type}
DESCRIPTION: ${recommendation.description}
EXPORTS: ${recommendation.exports?.join(", ") || "main function"}
DEPENDENCIES: ${recommendation.dependencies?.join(", ") || "none (use built-in Node.js)"}

REQUIREMENTS:
1. Use ES module syntax (import/export)
2. Include JSDoc comments for all exports
3. Handle errors gracefully (try/catch, sensible defaults)
4. Keep it focused — one module, one responsibility
5. Include a brief module-level doc comment
6. Export a default object with all public functions
7. Use fs, path, and other Node.js built-ins where needed
8. Data files should go in the data/ directory

Generate ONLY the JavaScript code. No markdown fences. No explanations.`;

      const response = await sendMessage(prompt);
      let code = response?.content || response?.text || "";

      // Clean up code fences if present
      code = code.replace(/^```(?:javascript|js)?\n?/m, "").replace(/\n?```$/m, "").trim();

      if (!code || code.length < 50) {
        this.building = false;
        return { success: false, error: "Generated code too short" };
      }

      // Write the module
      fs.writeFileSync(modulePath, code);

      // Register the capability
      const capability = {
        id: `cap_${Date.now()}`,
        name: recommendation.name,
        type: recommendation.type,
        description: recommendation.description,
        exports: recommendation.exports || [],
        path: `src/lib/${recommendation.name}.js`,
        createdAt: new Date().toISOString(),
        source: spec.source || "auto"
      };

      this.registry.capabilities.push(capability);
      this.registry.stats.totalBuilt++;
      this.registry.stats.lastBuild = new Date().toISOString();
      saveRegistry(this.registry);

      // Log the build
      const log = loadBuildLog();
      log.builds.push({
        ...capability,
        codeLength: code.length,
        buildTime: new Date().toISOString()
      });
      saveBuildLog(log);

      this.emit("capability-built", capability);
      console.log(`[CapabilityBuilder] Built: ${recommendation.name} (${recommendation.type})`);

      this.building = false;
      return { success: true, capability, path: modulePath };

    } catch (err) {
      this.building = false;
      console.error("[CapabilityBuilder] Build failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Full pipeline: analyze problem → build if needed
   */
  async solveWithCode(problem) {
    const analysis = await this.analyzeProblem(problem);

    if (!analysis.needsBuild) {
      return { built: false, reason: analysis.reason, existing: analysis.existing };
    }

    const result = await this.buildCapability({ ...analysis, source: problem.source });
    return { built: result.success, ...result };
  }

  /**
   * Find an existing capability that matches a description
   */
  findExistingCapability(description) {
    if (!description) return null;
    const lower = description.toLowerCase();

    return this.registry.capabilities.find(cap => {
      const capText = `${cap.name} ${cap.description}`.toLowerCase();
      // Check for word overlap
      const words = lower.split(/\s+/).filter(w => w.length > 3);
      const matches = words.filter(w => capText.includes(w));
      return matches.length >= 2;
    }) || null;
  }

  /**
   * List all built capabilities
   */
  listCapabilities() {
    return this.registry.capabilities;
  }

  /**
   * Get build statistics
   */
  getStats() {
    return {
      totalBuilt: this.registry.stats.totalBuilt,
      lastBuild: this.registry.stats.lastBuild,
      capabilities: this.registry.capabilities.length,
      building: this.building
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    return {
      capabilities: this.registry.capabilities.map(c => ({
        name: c.name,
        type: c.type,
        description: c.description
      })),
      stats: this.getStats()
    };
  }
}

// Singleton
let instance = null;
export const getCapabilityBuilder = () => {
  if (!instance) instance = new CapabilityBuilder();
  return instance;
};

export default CapabilityBuilder;
