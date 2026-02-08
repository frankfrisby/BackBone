/**
 * Solution Manager for BACKBONE
 *
 * Manages isolated solutions with their own package dependencies.
 * Each solution is like a container - it has its own node_modules,
 * configuration, and can be deleted without affecting the core project.
 *
 * Use cases:
 * - Calendar management solution with specific packages
 * - Email processing with different dependencies
 * - Custom integrations that need specific libraries
 *
 * Directory structure:
 * solutions/
 *   {solution-id}/
 *     package.json         - Dependencies for this solution
 *     node_modules/        - Isolated packages
 *     index.js             - Entry point
 *     config.json          - Solution configuration
 *     README.md            - Solution documentation
 */

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { EventEmitter } from "events";

import { getEngineRoot } from "../paths.js";
const SOLUTIONS_DIR = path.join(getEngineRoot(), "solutions");
const SOLUTIONS_REGISTRY = path.join(SOLUTIONS_DIR, "registry.json");

// Solution status
export const SOLUTION_STATUS = {
  CREATING: "creating",
  INSTALLING: "installing",
  READY: "ready",
  RUNNING: "running",
  ERROR: "error",
  DELETED: "deleted"
};

/**
 * Create a unique solution ID
 */
const createSolutionId = (name) => {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
};

/**
 * Load solutions registry
 */
const loadRegistry = () => {
  try {
    if (fs.existsSync(SOLUTIONS_REGISTRY)) {
      return JSON.parse(fs.readFileSync(SOLUTIONS_REGISTRY, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load solutions registry:", error.message);
  }
  return { solutions: {}, created: new Date().toISOString() };
};

/**
 * Save solutions registry
 */
const saveRegistry = (registry) => {
  try {
    if (!fs.existsSync(SOLUTIONS_DIR)) {
      fs.mkdirSync(SOLUTIONS_DIR, { recursive: true });
    }
    fs.writeFileSync(SOLUTIONS_REGISTRY, JSON.stringify(registry, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save solutions registry:", error.message);
    return false;
  }
};

/**
 * Run npm command in solution directory
 */
const runNpm = (solutionDir, args) => {
  return new Promise((resolve, reject) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, args, {
      cwd: solutionDir,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true, stdout, stderr });
      } else {
        reject(new Error(`npm exited with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
};

/**
 * Solution Manager Class
 */
export class SolutionManager extends EventEmitter {
  constructor() {
    super();
    this.registry = loadRegistry();
    this.ensureSolutionsDir();
  }

  ensureSolutionsDir() {
    if (!fs.existsSync(SOLUTIONS_DIR)) {
      fs.mkdirSync(SOLUTIONS_DIR, { recursive: true });
    }
  }

  /**
   * Create a new solution
   */
  async createSolution({
    name,
    description = "",
    packages = [],
    entryPoint = "index.js",
    recommended = false,
    recommendedBy = null
  }) {
    const id = createSolutionId(name);
    const solutionDir = path.join(SOLUTIONS_DIR, id);

    this.emit("solution-creating", { id, name });

    try {
      // Create solution directory
      fs.mkdirSync(solutionDir, { recursive: true });

      // Create package.json
      const packageJson = {
        name: `backbone-solution-${id}`,
        version: "1.0.0",
        description: description || `BACKBONE Solution: ${name}`,
        main: entryPoint,
        type: "module",
        private: true,
        dependencies: {},
        backbone: {
          solutionId: id,
          solutionName: name,
          recommended,
          recommendedBy,
          createdAt: new Date().toISOString()
        }
      };

      fs.writeFileSync(
        path.join(solutionDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      );

      // Create solution config
      const config = {
        id,
        name,
        description,
        packages,
        entryPoint,
        recommended,
        recommendedBy,
        status: SOLUTION_STATUS.CREATING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(
        path.join(solutionDir, "config.json"),
        JSON.stringify(config, null, 2)
      );

      // Create entry point file
      const entryCode = `/**
 * BACKBONE Solution: ${name}
 * ID: ${id}
 * Created: ${new Date().toISOString()}
 *
 * ${description}
 */

// Export your solution's main functionality here
export const run = async (context) => {
  console.log("Solution ${name} running with context:", context);
  // Implement your solution logic here
  return { success: true };
};

export default { run };
`;
      fs.writeFileSync(path.join(solutionDir, entryPoint), entryCode);

      // Create README
      const readme = `# ${name}

## Solution ID
\`${id}\`

## Description
${description || "A BACKBONE solution."}

## Packages
${packages.length > 0 ? packages.map(p => `- ${p}`).join("\n") : "No additional packages."}

## Usage
\`\`\`javascript
import solution from "./index.js";
const result = await solution.run(context);
\`\`\`

## Created
${new Date().toISOString()}

${recommended ? `## Recommended By\n${recommendedBy || "AI Assistant"}` : ""}

---
*Managed by BACKBONE Solution Manager*
`;
      fs.writeFileSync(path.join(solutionDir, "README.md"), readme);

      // Update registry
      this.registry.solutions[id] = {
        id,
        name,
        description,
        packages,
        status: SOLUTION_STATUS.CREATING,
        path: solutionDir,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt
      };
      saveRegistry(this.registry);

      // Install packages if any
      if (packages.length > 0) {
        this.registry.solutions[id].status = SOLUTION_STATUS.INSTALLING;
        saveRegistry(this.registry);
        this.emit("solution-installing", { id, packages });

        try {
          await runNpm(solutionDir, ["install", ...packages]);
          this.registry.solutions[id].status = SOLUTION_STATUS.READY;
        } catch (installError) {
          this.registry.solutions[id].status = SOLUTION_STATUS.ERROR;
          this.registry.solutions[id].error = installError.message;
          saveRegistry(this.registry);
          this.emit("solution-error", { id, error: installError.message });
          return { success: false, error: installError.message, id };
        }
      } else {
        this.registry.solutions[id].status = SOLUTION_STATUS.READY;
      }

      saveRegistry(this.registry);
      this.emit("solution-created", { id, name, path: solutionDir });

      return {
        success: true,
        id,
        name,
        path: solutionDir,
        packages
      };
    } catch (error) {
      this.emit("solution-error", { id, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Install additional packages to a solution
   */
  async installPackages(solutionId, packages) {
    const solution = this.registry.solutions[solutionId];
    if (!solution) {
      return { success: false, error: "Solution not found" };
    }

    this.emit("solution-installing", { id: solutionId, packages });

    try {
      await runNpm(solution.path, ["install", ...packages]);

      // Update registry
      solution.packages = [...(solution.packages || []), ...packages];
      solution.updatedAt = new Date().toISOString();
      saveRegistry(this.registry);

      this.emit("solution-updated", { id: solutionId, packages });

      return { success: true, packages };
    } catch (error) {
      this.emit("solution-error", { id: solutionId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Run a solution
   */
  async runSolution(solutionId, context = {}) {
    const solution = this.registry.solutions[solutionId];
    if (!solution) {
      return { success: false, error: "Solution not found" };
    }

    if (solution.status !== SOLUTION_STATUS.READY) {
      return { success: false, error: `Solution not ready. Status: ${solution.status}` };
    }

    this.emit("solution-running", { id: solutionId });

    try {
      const entryPath = path.join(solution.path, "index.js");
      const solutionModule = await import(`file://${entryPath}`);

      if (typeof solutionModule.run !== "function") {
        return { success: false, error: "Solution does not export a run function" };
      }

      const result = await solutionModule.run(context);

      this.emit("solution-completed", { id: solutionId, result });

      return { success: true, result };
    } catch (error) {
      this.emit("solution-error", { id: solutionId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a solution and all its packages
   */
  async deleteSolution(solutionId) {
    const solution = this.registry.solutions[solutionId];
    if (!solution) {
      return { success: false, error: "Solution not found" };
    }

    this.emit("solution-deleting", { id: solutionId });

    try {
      // Remove directory recursively
      if (fs.existsSync(solution.path)) {
        fs.rmSync(solution.path, { recursive: true, force: true });
      }

      // Update registry
      delete this.registry.solutions[solutionId];
      saveRegistry(this.registry);

      this.emit("solution-deleted", { id: solutionId, name: solution.name });

      return { success: true, name: solution.name };
    } catch (error) {
      this.emit("solution-error", { id: solutionId, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * List all solutions
   */
  listSolutions() {
    return Object.values(this.registry.solutions).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      packages: s.packages,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    }));
  }

  /**
   * Get solution details
   */
  getSolution(solutionId) {
    return this.registry.solutions[solutionId] || null;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const solutions = this.listSolutions();
    return {
      count: solutions.length,
      solutions,
      ready: solutions.filter(s => s.status === SOLUTION_STATUS.READY).length,
      installing: solutions.filter(s => s.status === SOLUTION_STATUS.INSTALLING).length,
      error: solutions.filter(s => s.status === SOLUTION_STATUS.ERROR).length
    };
  }
}

// Singleton instance
let solutionManagerInstance = null;

export const getSolutionManager = () => {
  if (!solutionManagerInstance) {
    solutionManagerInstance = new SolutionManager();
  }
  return solutionManagerInstance;
};

export default SolutionManager;
