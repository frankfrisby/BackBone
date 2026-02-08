/**
 * Tool Executor Service
 *
 * Executes real tools for the autonomous engine.
 * Provides a unified interface for WebSearch, Fetch, Read, Write, Edit, Bash, Grep, Glob.
 *
 * Each tool execution:
 * 1. Validates input
 * 2. Executes the operation
 * 3. Returns structured results
 * 4. Emits events for UI updates
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { getPlaywrightService } from "./integrations/playwright-service.js";
import { sendWhatsAppMessage } from "./firebase/phone-auth.js";
import { loadUserSettings } from "./user-settings.js";
import { getCurrentFirebaseUser } from "./firebase/firebase-auth.js";

import { dataFile, getDataDir } from "./paths.js";
const execAsync = promisify(exec);

/**
 * Tool types
 */
export const TOOL_TYPES = {
  WEB_SEARCH: "WebSearch",
  WEB_FETCH: "Fetch",
  READ: "Read",
  WRITE: "Write",
  EDIT: "Edit",
  BASH: "Bash",
  GREP: "Grep",
  GLOB: "Glob",
  // Data access tools (for AI chat to interact with projects, memory, data)
  READ_PROJECT: "ReadProject",
  LIST_PROJECTS: "ListProjects",
  READ_MEMORY: "ReadMemory",
  WRITE_MEMORY: "WriteMemory",
  READ_DATA: "ReadData",
  LIST_GOALS: "ListGoals",
  GET_GOAL: "GetGoal",
  // Messaging tools
  SEND_WHATSAPP: "SendWhatsApp",
  // Browser/Computer Use tools
  BROWSER_NAVIGATE: "BrowserNavigate",
  BROWSER_CLICK: "BrowserClick",
  BROWSER_TYPE: "BrowserType",
  BROWSER_SCROLL: "BrowserScroll",
  BROWSER_SCREENSHOT: "BrowserScreenshot",
  BROWSER_FILL_FORM: "BrowserFillForm",
  BROWSER_GET_CONTENT: "BrowserGetContent",
  BROWSER_CLOSE: "BrowserClose"
};

/**
 * Tool execution status
 */
export const EXECUTION_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed"
};

/**
 * Tool Executor Class
 */
export class ToolExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.executionHistory = [];
    this.maxHistory = 100;
    this.workDir = options.workDir || process.cwd();

    // SECURITY: Allowed directories for file operations
    this.allowedDirectories = options.allowedDirectories || [
      "data",
      "memory",
      "projects",
      "screenshots"
    ];
  }

  /**
   * Check if a file path is within allowed directories
   */
  isPathAllowed(filePath) {
    if (!filePath) return false;

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.normalize(path.join(this.workDir, filePath));

    // Get allowed paths
    const allowedPaths = this.allowedDirectories.map(dir =>
      path.normalize(path.join(this.workDir, dir))
    );

    // Check if the path starts with any allowed directory
    return allowedPaths.some(allowedPath => {
      return absolutePath.startsWith(allowedPath + path.sep) ||
             absolutePath === allowedPath;
    });
  }

  /**
   * Validate file path before operation
   */
  validatePath(filePath, operation) {
    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Security: ${operation} blocked - path "${filePath}" is outside allowed directories (data, memory, projects, screenshots)`);
    }
    return true;
  }

  /**
   * Execute a tool action
   * @param {Object} action - Action object with { action, target, params }
   * @returns {Object} Result object
   */
  async execute(action) {
    const startTime = Date.now();
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    this.emit("execution-started", {
      id: executionId,
      action: action.action,
      target: action.target,
      status: EXECUTION_STATUS.RUNNING
    });

    try {
      let result;

      switch (action.action) {
        case TOOL_TYPES.WEB_SEARCH:
          result = await this.executeWebSearch(action.target, action.params);
          break;

        case TOOL_TYPES.WEB_FETCH:
          result = await this.executeWebFetch(action.target, action.params);
          break;

        case TOOL_TYPES.READ:
          result = await this.executeRead(action.target, action.params);
          break;

        case TOOL_TYPES.WRITE:
          result = await this.executeWrite(action.target, action.params);
          break;

        case TOOL_TYPES.EDIT:
          result = await this.executeEdit(action.target, action.params);
          break;

        case TOOL_TYPES.BASH:
          result = await this.executeBash(action.target, action.params);
          break;

        case TOOL_TYPES.GREP:
          result = await this.executeGrep(action.target, action.params);
          break;

        case TOOL_TYPES.GLOB:
          result = await this.executeGlob(action.target, action.params);
          break;

        // Data access tools (for AI chat to interact with projects, memory, data)
        case TOOL_TYPES.READ_PROJECT:
          result = await this.executeReadProject(action.target, action.params);
          break;

        case TOOL_TYPES.LIST_PROJECTS:
          result = await this.executeListProjects(action.target, action.params);
          break;

        case TOOL_TYPES.READ_MEMORY:
          result = await this.executeReadMemory(action.target, action.params);
          break;

        case TOOL_TYPES.WRITE_MEMORY:
          result = await this.executeWriteMemory(action.target, action.params);
          break;

        case TOOL_TYPES.READ_DATA:
          result = await this.executeReadData(action.target, action.params);
          break;

        case TOOL_TYPES.LIST_GOALS:
          result = await this.executeListGoals(action.target, action.params);
          break;

        case TOOL_TYPES.GET_GOAL:
          result = await this.executeGetGoal(action.target, action.params);
          break;

        // Messaging tools
        case TOOL_TYPES.SEND_WHATSAPP:
          result = await this.executeSendWhatsApp(action.target, action.params);
          break;

        // Browser/Computer Use tools
        case TOOL_TYPES.BROWSER_NAVIGATE:
          result = await this.executeBrowserNavigate(action.target, action.params);
          break;

        case TOOL_TYPES.BROWSER_CLICK:
          result = await this.executeBrowserClick(action.target, action.params);
          break;

        case TOOL_TYPES.BROWSER_TYPE:
          result = await this.executeBrowserType(action.target, action.params);
          break;

        case TOOL_TYPES.BROWSER_SCROLL:
          result = await this.executeBrowserScroll(action.target, action.params);
          break;

        case TOOL_TYPES.BROWSER_SCREENSHOT:
          result = await this.executeBrowserScreenshot(action.target, action.params);
          break;

        case TOOL_TYPES.BROWSER_FILL_FORM:
          result = await this.executeBrowserFillForm(action.target, action.params);
          break;

        case TOOL_TYPES.BROWSER_GET_CONTENT:
          result = await this.executeBrowserGetContent(action.target, action.params);
          break;

        case TOOL_TYPES.BROWSER_CLOSE:
          result = await this.executeBrowserClose(action.target, action.params);
          break;

        default:
          throw new Error(`Unknown tool: ${action.action}`);
      }

      const duration = Date.now() - startTime;
      const record = {
        id: executionId,
        action: action.action,
        target: action.target,
        status: EXECUTION_STATUS.SUCCESS,
        result,
        duration,
        timestamp: new Date().toISOString()
      };

      this.recordExecution(record);

      this.emit("execution-completed", record);

      return {
        success: true,
        ...result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const record = {
        id: executionId,
        action: action.action,
        target: action.target,
        status: EXECUTION_STATUS.FAILED,
        error: error.message,
        duration,
        timestamp: new Date().toISOString()
      };

      this.recordExecution(record);

      this.emit("execution-failed", record);

      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  /**
   * Record execution in history
   */
  recordExecution(record) {
    this.executionHistory.unshift(record);
    if (this.executionHistory.length > this.maxHistory) {
      this.executionHistory = this.executionHistory.slice(0, this.maxHistory);
    }
  }

  /**
   * Execute web search
   * Note: This uses a mock/simple implementation. In production, integrate with actual search API.
   */
  async executeWebSearch(query, params = {}) {
    // Try to use web search via fetch if available
    // For now, return a structured result that AI can work with
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    return {
      type: "search_results",
      query,
      url: searchUrl,
      message: `Search initiated for: "${query}"`,
      results: [
        {
          title: `Search results for: ${query}`,
          url: searchUrl,
          snippet: `Web search for "${query}" - results available at URL`
        }
      ],
      note: "Use Fetch tool to retrieve actual search results from the URL"
    };
  }

  /**
   * Execute web fetch
   */
  async executeWebFetch(url, params = {}) {
    try {
      // Basic URL validation
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error("Invalid URL: must start with http:// or https://");
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "BACKBONE/1.0 (Autonomous Life OS)",
          ...params.headers
        },
        timeout: params.timeout || 30000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      let content;

      if (contentType.includes("application/json")) {
        content = await response.json();
      } else {
        content = await response.text();
        // Truncate very long content
        if (content.length > 50000) {
          content = content.slice(0, 50000) + "\n... [content truncated]";
        }
      }

      return {
        type: "fetch_result",
        url,
        status: response.status,
        contentType,
        content,
        contentLength: typeof content === "string" ? content.length : JSON.stringify(content).length
      };

    } catch (error) {
      throw new Error(`Fetch failed: ${error.message}`);
    }
  }

  /**
   * Execute file read
   */
  async executeRead(filePath, params = {}) {
    try {
      // SECURITY: Validate path is within allowed directories
      this.validatePath(filePath, "Read");

      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      const stats = fs.statSync(resolvedPath);
      if (stats.isDirectory()) {
        // List directory contents
        const files = fs.readdirSync(resolvedPath);
        return {
          type: "directory_listing",
          path: resolvedPath,
          files: files.slice(0, 100),
          totalFiles: files.length
        };
      }

      // Check file size
      if (stats.size > 1000000) {
        // 1MB limit
        throw new Error(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max 1MB)`);
      }

      const content = fs.readFileSync(resolvedPath, "utf-8");
      const lines = content.split("\n");

      return {
        type: "file_content",
        path: resolvedPath,
        content,
        lines: lines.length,
        size: stats.size
      };

    } catch (error) {
      throw new Error(`Read failed: ${error.message}`);
    }
  }

  /**
   * Execute file write
   */
  async executeWrite(filePath, params = {}) {
    try {
      // SECURITY: Validate path is within allowed directories
      this.validatePath(filePath, "Write");

      const resolvedPath = path.resolve(filePath);
      const content = params.content || "";

      // Ensure parent directory exists
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const isNewFile = !fs.existsSync(resolvedPath);

      fs.writeFileSync(resolvedPath, content, "utf-8");

      const lines = content.split("\n");

      return {
        type: "file_written",
        path: resolvedPath,
        isNewFile,
        lines: lines.length,
        size: Buffer.byteLength(content, "utf-8"),
        diff: {
          added: lines.map((text, i) => ({ lineNum: i + 1, text })),
          removed: []
        }
      };

    } catch (error) {
      throw new Error(`Write failed: ${error.message}`);
    }
  }

  /**
   * Execute file edit
   */
  async executeEdit(filePath, params = {}) {
    try {
      // SECURITY: Validate path is within allowed directories
      this.validatePath(filePath, "Edit");

      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`File not found: ${resolvedPath}`);
      }

      const originalContent = fs.readFileSync(resolvedPath, "utf-8");
      const originalLines = originalContent.split("\n");

      const { oldString, newString, replaceAll = false } = params;

      if (!oldString) {
        throw new Error("oldString is required for edit");
      }

      let newContent;
      if (replaceAll) {
        newContent = originalContent.split(oldString).join(newString || "");
      } else {
        newContent = originalContent.replace(oldString, newString || "");
      }

      if (newContent === originalContent) {
        return {
          type: "no_changes",
          path: resolvedPath,
          message: "No matching text found to replace"
        };
      }

      fs.writeFileSync(resolvedPath, newContent, "utf-8");

      const newLines = newContent.split("\n");

      // Calculate simple diff
      const diff = this.calculateDiff(originalLines, newLines);

      return {
        type: "file_edited",
        path: resolvedPath,
        linesChanged: Math.abs(newLines.length - originalLines.length) + diff.changed,
        diff
      };

    } catch (error) {
      throw new Error(`Edit failed: ${error.message}`);
    }
  }

  /**
   * Calculate simple diff between two arrays of lines
   */
  calculateDiff(oldLines, newLines) {
    const removed = [];
    const added = [];
    let changed = 0;

    // Simple line-by-line comparison
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (oldLines[i] !== newLines[i]) {
        if (oldLines[i] !== undefined) {
          removed.push({ lineNum: i + 1, text: oldLines[i] });
        }
        if (newLines[i] !== undefined) {
          added.push({ lineNum: i + 1, text: newLines[i] });
        }
        changed++;
      }
    }

    return { removed, added, changed };
  }

  /**
   * Execute bash command
   */
  async executeBash(command, params = {}) {
    try {
      const workDir = params.workDir || process.cwd();
      const timeout = params.timeout || 60000;

      // Security: Block dangerous commands
      const dangerousPatterns = [
        /rm\s+-rf\s+\//, // rm -rf /
        /:\(\)\{\s*:\|:\s*&\s*\};:/, // Fork bomb
        /dd\s+if=\/dev\/zero/, // Disk wipe
        /mkfs/, // Format disk
        />\/dev\/sd/, // Write to disk device
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(command)) {
          throw new Error("Dangerous command blocked for safety");
        }
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash"
      });

      const output = stdout || stderr || "(No output)";
      const lines = output.split("\n").filter(l => l.trim());

      return {
        type: "command_output",
        command,
        workDir,
        output: output.slice(0, 50000), // Truncate if very long
        lines: lines.length,
        exitCode: 0
      };

    } catch (error) {
      // Command failed but executed
      if (error.stdout || error.stderr) {
        return {
          type: "command_output",
          command,
          output: error.stderr || error.stdout || error.message,
          exitCode: error.code || 1,
          error: true
        };
      }
      throw new Error(`Bash failed: ${error.message}`);
    }
  }

  /**
   * Execute grep search
   */
  async executeGrep(pattern, params = {}) {
    try {
      const searchPath = params.path || process.cwd();
      const include = params.include || "*";

      // Use native grep/findstr on Windows
      const isWindows = process.platform === "win32";
      let command;

      if (isWindows) {
        // Windows findstr
        command = `findstr /s /n /i "${pattern}" "${searchPath}\\${include}"`;
      } else {
        // Unix grep
        command = `grep -rn "${pattern}" "${searchPath}" --include="${include}"`;
      }

      const { stdout } = await execAsync(command, {
        cwd: searchPath,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 5
      }).catch(e => ({ stdout: e.stdout || "" }));

      const matches = stdout
        .split("\n")
        .filter(l => l.trim())
        .slice(0, 50); // Limit results

      return {
        type: "grep_results",
        pattern,
        path: searchPath,
        matches,
        matchCount: matches.length
      };

    } catch (error) {
      return {
        type: "grep_results",
        pattern,
        matches: [],
        matchCount: 0,
        note: "No matches found"
      };
    }
  }

  /**
   * Execute glob file search
   */
  async executeGlob(pattern, params = {}) {
    try {
      const searchPath = params.path || process.cwd();

      // Simple glob implementation
      const files = this.simpleGlob(searchPath, pattern);

      return {
        type: "glob_results",
        pattern,
        path: searchPath,
        files: files.slice(0, 100),
        totalFiles: files.length
      };

    } catch (error) {
      throw new Error(`Glob failed: ${error.message}`);
    }
  }

  /**
   * Simple glob implementation
   */
  simpleGlob(basePath, pattern) {
    const results = [];

    const walkDir = (dir, depth = 0) => {
      if (depth > 10) return; // Max depth

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            // Check for ** pattern
            if (pattern.includes("**")) {
              walkDir(fullPath, depth + 1);
            }
          } else {
            // Match file against pattern
            if (this.matchGlob(entry.name, pattern)) {
              results.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    walkDir(basePath);
    return results;
  }

  /**
   * Simple glob pattern matching
   */
  matchGlob(filename, pattern) {
    // Extract the file pattern (last part after /)
    const filePattern = pattern.split("/").pop() || pattern;

    // Convert glob to regex
    const regex = filePattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    return new RegExp(`^${regex}$`, "i").test(filename);
  }

  // ===== DATA ACCESS TOOLS =====
  // These tools allow the AI chat to interact with projects, memory, and data

  /**
   * Read a specific project's data
   */
  async executeReadProject(projectId, params = {}) {
    try {
      const projectsPath = dataFile("projects.json");

      if (!fs.existsSync(projectsPath)) {
        return {
          type: "project_not_found",
          error: "No projects file found"
        };
      }

      const projects = JSON.parse(fs.readFileSync(projectsPath, "utf-8"));

      // Find by ID or name
      const project = projects.find(p =>
        p.id === projectId ||
        p.name?.toLowerCase() === projectId?.toLowerCase() ||
        p.title?.toLowerCase() === projectId?.toLowerCase()
      );

      if (!project) {
        return {
          type: "project_not_found",
          projectId,
          availableProjects: projects.map(p => ({ id: p.id, name: p.name || p.title }))
        };
      }

      return {
        type: "project_data",
        project
      };

    } catch (error) {
      throw new Error(`ReadProject failed: ${error.message}`);
    }
  }

  /**
   * List all projects
   */
  async executeListProjects(filter, params = {}) {
    try {
      const projectsPath = dataFile("projects.json");

      if (!fs.existsSync(projectsPath)) {
        return {
          type: "projects_list",
          projects: [],
          count: 0
        };
      }

      const projects = JSON.parse(fs.readFileSync(projectsPath, "utf-8"));

      // Apply filter if provided
      let filteredProjects = projects;
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        filteredProjects = projects.filter(p =>
          p.name?.toLowerCase().includes(lowerFilter) ||
          p.title?.toLowerCase().includes(lowerFilter) ||
          p.status?.toLowerCase().includes(lowerFilter)
        );
      }

      return {
        type: "projects_list",
        projects: filteredProjects.map(p => ({
          id: p.id,
          name: p.name || p.title,
          status: p.status,
          progress: p.progress,
          goalId: p.goalId
        })),
        count: filteredProjects.length
      };

    } catch (error) {
      throw new Error(`ListProjects failed: ${error.message}`);
    }
  }

  /**
   * Read from AI memory (conversation history, context)
   */
  async executeReadMemory(memoryKey, params = {}) {
    try {
      const memoryDir = dataFile("memory");

      // If specific key requested
      if (memoryKey) {
        const memoryPath = path.join(memoryDir, `${memoryKey}.json`);
        if (!fs.existsSync(memoryPath)) {
          return {
            type: "memory_not_found",
            key: memoryKey
          };
        }

        const data = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
        return {
          type: "memory_data",
          key: memoryKey,
          data
        };
      }

      // List available memory keys
      if (!fs.existsSync(memoryDir)) {
        return {
          type: "memory_list",
          keys: [],
          count: 0
        };
      }

      const files = fs.readdirSync(memoryDir)
        .filter(f => f.endsWith(".json"))
        .map(f => f.replace(".json", ""));

      return {
        type: "memory_list",
        keys: files,
        count: files.length
      };

    } catch (error) {
      throw new Error(`ReadMemory failed: ${error.message}`);
    }
  }

  /**
   * Write to AI memory
   */
  async executeWriteMemory(memoryKey, params = {}) {
    try {
      if (!memoryKey) {
        throw new Error("Memory key is required");
      }

      const memoryDir = dataFile("memory");

      // Ensure directory exists
      if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
      }

      const memoryPath = path.join(memoryDir, `${memoryKey}.json`);
      const data = params.data || params.content || {};

      // Read existing data if any
      let existingData = {};
      if (fs.existsSync(memoryPath)) {
        try {
          existingData = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
        } catch (e) {
          // Start fresh if corrupted
        }
      }

      // Merge or replace based on params
      const newData = params.merge
        ? { ...existingData, ...data, updatedAt: new Date().toISOString() }
        : { ...data, updatedAt: new Date().toISOString() };

      fs.writeFileSync(memoryPath, JSON.stringify(newData, null, 2));

      return {
        type: "memory_written",
        key: memoryKey,
        merged: !!params.merge
      };

    } catch (error) {
      throw new Error(`WriteMemory failed: ${error.message}`);
    }
  }

  /**
   * Read data from a specific data file
   */
  async executeReadData(fileName, params = {}) {
    try {
      const dataDir = getDataDir();

      if (!fileName) {
        // List available data files
        if (!fs.existsSync(dataDir)) {
          return { type: "data_list", files: [], count: 0 };
        }

        const files = fs.readdirSync(dataDir)
          .filter(f => f.endsWith(".json") && !f.includes("settings"));

        return {
          type: "data_list",
          files,
          count: files.length
        };
      }

      // Add .json extension if not present
      const file = fileName.endsWith(".json") ? fileName : `${fileName}.json`;
      const filePath = path.join(dataDir, file);

      if (!fs.existsSync(filePath)) {
        return {
          type: "data_not_found",
          file: fileName
        };
      }

      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      return {
        type: "data_content",
        file: fileName,
        data
      };

    } catch (error) {
      throw new Error(`ReadData failed: ${error.message}`);
    }
  }

  /**
   * List all goals
   */
  async executeListGoals(filter, params = {}) {
    try {
      const goalsPath = dataFile("goals.json");

      if (!fs.existsSync(goalsPath)) {
        return {
          type: "goals_list",
          goals: [],
          count: 0
        };
      }

      const data = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
      const goals = data.goals || data;

      // Apply filter
      let filteredGoals = Array.isArray(goals) ? goals : [];
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        filteredGoals = filteredGoals.filter(g =>
          g.title?.toLowerCase().includes(lowerFilter) ||
          g.status?.toLowerCase().includes(lowerFilter) ||
          g.category?.toLowerCase().includes(lowerFilter)
        );
      }

      return {
        type: "goals_list",
        goals: filteredGoals.map(g => ({
          id: g.id,
          title: g.title,
          status: g.status,
          category: g.category,
          priority: g.priority,
          progress: g.progress || g.currentValue
        })),
        count: filteredGoals.length
      };

    } catch (error) {
      throw new Error(`ListGoals failed: ${error.message}`);
    }
  }

  /**
   * Get a specific goal by ID
   */
  async executeGetGoal(goalId, params = {}) {
    try {
      const goalsPath = dataFile("goals.json");

      if (!fs.existsSync(goalsPath)) {
        return {
          type: "goal_not_found",
          goalId
        };
      }

      const data = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
      const goals = data.goals || data;

      const goal = (Array.isArray(goals) ? goals : []).find(g =>
        g.id === goalId ||
        g.title?.toLowerCase() === goalId?.toLowerCase()
      );

      if (!goal) {
        return {
          type: "goal_not_found",
          goalId,
          availableGoals: goals.slice(0, 5).map(g => ({ id: g.id, title: g.title }))
        };
      }

      return {
        type: "goal_data",
        goal
      };

    } catch (error) {
      throw new Error(`GetGoal failed: ${error.message}`);
    }
  }

  // ===== MESSAGING TOOLS =====

  /**
   * Execute send WhatsApp message
   * Sends a message to the current user's verified WhatsApp number
   */
  async executeSendWhatsApp(message, params = {}) {
    try {
      // Get current user
      const user = getCurrentFirebaseUser();
      if (!user?.id) {
        throw new Error("No user logged in");
      }

      // Send the message
      const result = await sendWhatsAppMessage(user.id, message);

      if (!result.success) {
        throw new Error(result.error || "Failed to send WhatsApp message");
      }

      return {
        type: "whatsapp_sent",
        success: true,
        message: message,
        messageId: result.messageId,
        status: result.status
      };

    } catch (error) {
      throw new Error(`SendWhatsApp failed: ${error.message}`);
    }
  }

  // ===== BROWSER/COMPUTER USE TOOLS =====

  /**
   * Execute browser navigate
   */
  async executeBrowserNavigate(url, params = {}) {
    const browser = getPlaywrightService();
    const result = await browser.navigate(url, params);

    if (!result.success) {
      throw new Error(`Browser navigate failed: ${result.error}`);
    }

    return {
      type: "browser_navigation",
      url: result.url,
      title: result.title,
      status: result.status,
      screenshot: result.screenshot
    };
  }

  /**
   * Execute browser click
   */
  async executeBrowserClick(target, params = {}) {
    const browser = getPlaywrightService();
    const result = await browser.click(target, params);

    if (!result.success) {
      throw new Error(`Browser click failed: ${result.error}`);
    }

    return {
      type: "browser_click",
      target,
      screenshot: result.screenshot
    };
  }

  /**
   * Execute browser type
   */
  async executeBrowserType(text, params = {}) {
    const browser = getPlaywrightService();
    const result = await browser.type(text, params);

    if (!result.success) {
      throw new Error(`Browser type failed: ${result.error}`);
    }

    return {
      type: "browser_type",
      textLength: text.length
    };
  }

  /**
   * Execute browser scroll
   */
  async executeBrowserScroll(direction, params = {}) {
    const browser = getPlaywrightService();
    const result = await browser.scroll(direction, params.amount || 500);

    if (!result.success) {
      throw new Error(`Browser scroll failed: ${result.error}`);
    }

    return {
      type: "browser_scroll",
      direction,
      screenshot: result.screenshot
    };
  }

  /**
   * Execute browser screenshot
   */
  async executeBrowserScreenshot(filename, params = {}) {
    const browser = getPlaywrightService();
    const result = await browser.takeScreenshot({ filename, ...params });

    if (!result.success) {
      throw new Error(`Browser screenshot failed: ${result.error}`);
    }

    return {
      type: "browser_screenshot",
      path: result.path,
      filename: result.filename
    };
  }

  /**
   * Execute browser fill form
   */
  async executeBrowserFillForm(fields, params = {}) {
    const browser = getPlaywrightService();

    // Fields can be passed as target or params
    const formFields = typeof fields === "object" ? fields : params.fields || {};
    const result = await browser.fillForm(formFields, params);

    if (!result.success) {
      throw new Error(`Browser fill form failed: ${result.error}`);
    }

    return {
      type: "browser_form_filled",
      fieldsCount: Object.keys(formFields).length,
      results: result.results,
      screenshot: result.screenshot
    };
  }

  /**
   * Execute browser get content
   */
  async executeBrowserGetContent(selector, params = {}) {
    const browser = getPlaywrightService();
    const result = await browser.getContent({ selector, ...params });

    if (!result.success) {
      throw new Error(`Browser get content failed: ${result.error}`);
    }

    return {
      type: "browser_content",
      title: result.title,
      url: result.url,
      content: result.content
    };
  }

  /**
   * Execute browser close
   */
  async executeBrowserClose(target, params = {}) {
    const browser = getPlaywrightService();
    const result = await browser.close();

    if (!result.success) {
      throw new Error(`Browser close failed: ${result.error}`);
    }

    return {
      type: "browser_closed"
    };
  }

  /**
   * Get execution history
   */
  getHistory(limit = 20) {
    return this.executionHistory.slice(0, limit);
  }

  /**
   * Get execution stats
   */
  getStats() {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => e.status === EXECUTION_STATUS.SUCCESS).length;
    const failed = total - successful;

    const byTool = {};
    for (const exec of this.executionHistory) {
      byTool[exec.action] = (byTool[exec.action] || 0) + 1;
    }

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(1) : 0,
      byTool
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.executionHistory = [];
    this.emit("history-cleared");
  }
}

// Singleton instance
let toolExecutorInstance = null;

export const getToolExecutor = () => {
  if (!toolExecutorInstance) {
    toolExecutorInstance = new ToolExecutor();
  }
  return toolExecutorInstance;
};

export default ToolExecutor;
