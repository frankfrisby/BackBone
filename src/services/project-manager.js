/**
 * Project Manager - Manages user project directories
 *
 * Projects are stored in the `projects/` directory (gitignored).
 * Each project is a directory containing:
 * - PROJECT.md - Main project file with description, updates, status
 * - research/ - Research notes and findings
 * - documents/ - Generated documents
 * - data/ - Any data files
 *
 * On reset, projects are moved to projects/.backup/ with 7-day retention.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

// Project root relative to backbone
const PROJECTS_DIR = path.join(process.cwd(), "projects");
const BACKUP_DIR = path.join(PROJECTS_DIR, ".backup");
const BACKUP_RETENTION_DAYS = 7;

class ProjectManager extends EventEmitter {
  constructor() {
    super();
    this.currentProject = null;
    this.ensureDirectories();
  }

  /**
   * Ensure projects and backup directories exist
   */
  ensureDirectories() {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  /**
   * Sanitize project name for use as directory name
   * @param {string} name - Project display name
   * @returns {string} Safe directory name
   */
  sanitizeName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  }

  /**
   * Get path to a project directory
   * @param {string} name - Project name
   * @returns {string} Full path to project directory
   */
  getProjectPath(name) {
    const safeName = this.sanitizeName(name);
    return path.join(PROJECTS_DIR, safeName);
  }

  /**
   * Create a new project
   * @param {string} name - Project display name (max 5 words)
   * @param {string} goal - The goal this project is working towards
   * @param {Object} options - Additional options
   * @returns {Object} Project info { name, path, mdPath, createdAt }
   */
  createProject(name, goal, options = {}) {
    // Enforce max 5 words
    const words = name.trim().split(/\s+/).slice(0, 5);
    const displayName = words.join(" ");
    const safeName = this.sanitizeName(displayName);
    const projectPath = path.join(PROJECTS_DIR, safeName);

    // Check if project already exists
    if (fs.existsSync(projectPath)) {
      return this.loadProject(displayName);
    }

    // Create project directory structure
    fs.mkdirSync(projectPath, { recursive: true });
    fs.mkdirSync(path.join(projectPath, "research"), { recursive: true });
    fs.mkdirSync(path.join(projectPath, "documents"), { recursive: true });
    fs.mkdirSync(path.join(projectPath, "data"), { recursive: true });

    // Create PROJECT.md
    const createdAt = new Date().toISOString();
    const mdContent = this.generateProjectMd({
      name: displayName,
      goal,
      createdAt,
      status: "active",
      updates: [
        {
          date: createdAt,
          type: "created",
          message: "Project created"
        }
      ],
      ...options
    });

    const mdPath = path.join(projectPath, "PROJECT.md");
    fs.writeFileSync(mdPath, mdContent, "utf-8");

    const project = {
      name: displayName,
      safeName,
      path: projectPath,
      mdPath,
      createdAt,
      goal,
      status: "active"
    };

    this.currentProject = project;
    this.emit("project-created", project);
    return project;
  }

  /**
   * Generate PROJECT.md content
   */
  generateProjectMd(data) {
    const { name, goal, createdAt, status, updates = [], description = "" } = data;

    let md = `# ${name}\n\n`;
    md += `**Status:** ${status}\n`;
    md += `**Created:** ${new Date(createdAt).toLocaleString()}\n\n`;
    md += `## Goal\n\n${goal}\n\n`;

    if (description) {
      md += `## Description\n\n${description}\n\n`;
    }

    md += `## Updates\n\n`;
    for (const update of updates) {
      const date = new Date(update.date).toLocaleString();
      md += `- **${date}** [${update.type}]: ${update.message}\n`;
    }

    md += `\n## Research\n\n_Research notes will be added here or in the research/ directory._\n\n`;
    md += `## Documents\n\n_Generated documents will be stored in the documents/ directory._\n\n`;
    md += `## Notes\n\n_Additional notes can be added here._\n`;

    return md;
  }

  /**
   * Load an existing project
   * @param {string} name - Project name
   * @returns {Object|null} Project info or null if not found
   */
  loadProject(name) {
    const safeName = this.sanitizeName(name);
    const projectPath = path.join(PROJECTS_DIR, safeName);
    const mdPath = path.join(projectPath, "PROJECT.md");

    if (!fs.existsSync(projectPath)) {
      return null;
    }

    // Parse PROJECT.md to get project info
    let goal = "";
    let status = "active";
    let createdAt = null;

    if (fs.existsSync(mdPath)) {
      const content = fs.readFileSync(mdPath, "utf-8");

      // Extract goal
      const goalMatch = content.match(/## Goal\n\n([^\n#]+)/);
      if (goalMatch) goal = goalMatch[1].trim();

      // Extract status
      const statusMatch = content.match(/\*\*Status:\*\* ([^\n]+)/);
      if (statusMatch) status = statusMatch[1].trim();

      // Extract created date
      const createdMatch = content.match(/\*\*Created:\*\* ([^\n]+)/);
      if (createdMatch) {
        try {
          createdAt = new Date(createdMatch[1].trim()).toISOString();
        } catch {
          createdAt = null;
        }
      }
    }

    const project = {
      name: name.trim().split(/\s+/).slice(0, 5).join(" "),
      safeName,
      path: projectPath,
      mdPath,
      createdAt: createdAt || fs.statSync(projectPath).birthtime.toISOString(),
      goal,
      status
    };

    this.currentProject = project;
    this.emit("project-loaded", project);
    return project;
  }

  /**
   * Find or create a project
   * @param {string} name - Project name
   * @param {string} goal - Goal (used if creating)
   * @returns {Object} Project info
   */
  findOrCreate(name, goal) {
    const existing = this.loadProject(name);
    if (existing) {
      return existing;
    }
    return this.createProject(name, goal);
  }

  /**
   * Add an update to the project's PROJECT.md
   * @param {string} type - Update type (research, document, progress, note)
   * @param {string} message - Update message
   */
  addUpdate(type, message) {
    if (!this.currentProject) {
      throw new Error("No active project");
    }

    const mdPath = this.currentProject.mdPath;
    if (!fs.existsSync(mdPath)) {
      return;
    }

    let content = fs.readFileSync(mdPath, "utf-8");
    const date = new Date().toLocaleString();
    const updateLine = `- **${date}** [${type}]: ${message}\n`;

    // Insert after "## Updates\n\n"
    const updatesIndex = content.indexOf("## Updates\n\n");
    if (updatesIndex !== -1) {
      const insertIndex = updatesIndex + "## Updates\n\n".length;
      content = content.slice(0, insertIndex) + updateLine + content.slice(insertIndex);
      fs.writeFileSync(mdPath, content, "utf-8");
    }

    this.emit("update-added", { type, message, project: this.currentProject.name });
  }

  /**
   * Write content to a file within the project
   * @param {string} subPath - Path relative to project (e.g., "research/findings.md")
   * @param {string} content - File content
   */
  writeFile(subPath, content) {
    if (!this.currentProject) {
      throw new Error("No active project");
    }

    const filePath = path.join(this.currentProject.path, subPath);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");
    this.addUpdate("file", `Created/updated ${subPath}`);

    return filePath;
  }

  /**
   * Read a file from the project
   * @param {string} subPath - Path relative to project
   * @returns {string|null} File content or null
   */
  readFile(subPath) {
    if (!this.currentProject) {
      return null;
    }

    const filePath = path.join(this.currentProject.path, subPath);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, "utf-8");
  }

  /**
   * List all projects
   * @returns {Array} List of project info objects
   */
  listProjects() {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return [];
    }

    const projects = [];
    const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden directories (starting with .) and backup
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const projectPath = path.join(PROJECTS_DIR, entry.name);
        const mdPath = path.join(projectPath, "PROJECT.md");

        let name = entry.name;
        let goal = "";
        let status = "unknown";

        if (fs.existsSync(mdPath)) {
          const content = fs.readFileSync(mdPath, "utf-8");

          // Extract name from first line
          const nameMatch = content.match(/^# ([^\n]+)/);
          if (nameMatch) name = nameMatch[1].trim();

          // Extract goal
          const goalMatch = content.match(/## Goal\n\n([^\n#]+)/);
          if (goalMatch) goal = goalMatch[1].trim();

          // Extract status
          const statusMatch = content.match(/\*\*Status:\*\* ([^\n]+)/);
          if (statusMatch) status = statusMatch[1].trim();
        }

        projects.push({
          name,
          safeName: entry.name,
          path: projectPath,
          goal,
          status,
          modifiedAt: fs.statSync(projectPath).mtime
        });
      }
    }

    // Sort by modified date, most recent first
    projects.sort((a, b) => b.modifiedAt - a.modifiedAt);
    return projects;
  }

  /**
   * Backup a project (move to .backup with timestamp)
   * @param {string} name - Project name
   * @returns {string|null} Backup path or null if project not found
   */
  backupProject(name) {
    const safeName = this.sanitizeName(name);
    const projectPath = path.join(PROJECTS_DIR, safeName);

    if (!fs.existsSync(projectPath)) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `${safeName}_${timestamp}`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    // Move project to backup
    fs.renameSync(projectPath, backupPath);

    this.emit("project-backed-up", { name, backupPath });
    return backupPath;
  }

  /**
   * Reset all projects - moves everything to backup
   * User can recover within 7 days
   */
  resetAllProjects() {
    const projects = this.listProjects();
    const backups = [];

    for (const project of projects) {
      const backupPath = this.backupProject(project.name);
      if (backupPath) {
        backups.push({ name: project.name, backupPath });
      }
    }

    this.currentProject = null;
    this.emit("all-projects-reset", { backups, recoveryDays: BACKUP_RETENTION_DAYS });
    return backups;
  }

  /**
   * Clean up old backups (older than retention period)
   */
  cleanupOldBackups() {
    if (!fs.existsSync(BACKUP_DIR)) {
      return { deleted: 0, kept: 0 };
    }

    const now = Date.now();
    const retentionMs = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });

    let deleted = 0;
    let kept = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const backupPath = path.join(BACKUP_DIR, entry.name);
        const stats = fs.statSync(backupPath);
        const age = now - stats.mtime.getTime();

        if (age > retentionMs) {
          // Delete old backup
          fs.rmSync(backupPath, { recursive: true, force: true });
          deleted++;
        } else {
          kept++;
        }
      }
    }

    this.emit("backups-cleaned", { deleted, kept });
    return { deleted, kept };
  }

  /**
   * List available backups for recovery
   * @returns {Array} Backup info with recovery dates
   */
  listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) {
      return [];
    }

    const now = Date.now();
    const retentionMs = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
    const backups = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const backupPath = path.join(BACKUP_DIR, entry.name);
        const stats = fs.statSync(backupPath);
        const age = now - stats.mtime.getTime();
        const expiresIn = retentionMs - age;
        const expiresInDays = Math.ceil(expiresIn / (24 * 60 * 60 * 1000));

        // Extract original name (remove timestamp suffix)
        const originalName = entry.name.replace(/_\d{4}-\d{2}-\d{2}.*$/, "");

        backups.push({
          backupName: entry.name,
          originalName,
          path: backupPath,
          backedUpAt: stats.mtime,
          expiresInDays: Math.max(0, expiresInDays),
          canRecover: expiresIn > 0
        });
      }
    }

    // Sort by backup date, most recent first
    backups.sort((a, b) => b.backedUpAt - a.backedUpAt);
    return backups;
  }

  /**
   * Recover a project from backup
   * @param {string} backupName - Name of the backup folder
   * @returns {Object|null} Recovered project info or null
   */
  recoverProject(backupName) {
    const backupPath = path.join(BACKUP_DIR, backupName);

    if (!fs.existsSync(backupPath)) {
      return null;
    }

    // Extract original name
    const originalName = backupName.replace(/_\d{4}-\d{2}-\d{2}.*$/, "");
    const projectPath = path.join(PROJECTS_DIR, originalName);

    // Check if project already exists (would overwrite)
    if (fs.existsSync(projectPath)) {
      // Backup the current one first
      this.backupProject(originalName);
    }

    // Move backup back to projects
    fs.renameSync(backupPath, projectPath);

    const project = this.loadProject(originalName);
    this.addUpdate("recovery", "Project recovered from backup");

    this.emit("project-recovered", project);
    return project;
  }

  /**
   * Get current project info
   */
  getCurrentProject() {
    return this.currentProject;
  }

  /**
   * Set current project (switch context)
   * @param {string} name - Project name to switch to
   * @returns {Object|null} Project info or null if not found
   */
  switchProject(name) {
    return this.loadProject(name);
  }
}

// Singleton instance
let instance = null;

export const getProjectManager = () => {
  if (!instance) {
    instance = new ProjectManager();
    // Clean up old backups on startup
    instance.cleanupOldBackups();
  }
  return instance;
};

export default ProjectManager;
