/**
 * Project Manager - Manages user project directories
 *
 * Projects are stored in the `projects/` directory (gitignored).
 * Each project is a directory containing:
 * - PROJECT.md - Main project file with description, updates, status
 * - CRITERIA.md - Success criteria with completion tracking
 * - research/ - Research notes and findings
 * - documents/ - Generated documents
 * - data/ - Any data files
 *
 * On reset, projects are moved to projects/.backup/ with 7-day retention.
 *
 * COMPLETION TRACKING:
 * - Each project has a completion percentage (0-100%)
 * - Completion is calculated from CRITERIA.md if it exists
 * - Projects are grouped by their parent goal
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

  /**
   * Create a project for a goal
   * This creates the project directory and generates an initial plan
   * @param {Object} goal - Goal object from goal tracker
   * @returns {Object} Project info
   */
  async createProjectForGoal(goal) {
    if (!goal || !goal.title) {
      throw new Error("Goal must have a title");
    }

    // Generate project name from goal (max 5 words)
    const projectName = this.generateProjectNameFromGoal(goal);

    // Create or load the project
    const project = this.findOrCreate(projectName, goal.title);

    // Generate initial plan structure in the PROJECT.md
    await this.generateInitialPlan(project, goal);

    return project;
  }

  /**
   * Generate a short project name from a goal
   * @param {Object} goal - Goal object
   * @returns {string} Short project name (max 5 words)
   */
  generateProjectNameFromGoal(goal) {
    // If goal already has a project name, use it
    if (goal.project && typeof goal.project === "string" && goal.project !== goal.category) {
      return goal.project;
    }

    // Generate from title - take first 5 meaningful words
    const title = goal.title || "Untitled Goal";
    const words = title
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !["the", "and", "for", "with", "from", "into"].includes(w.toLowerCase()))
      .slice(0, 5);

    if (words.length === 0) {
      return goal.category || "project";
    }

    return words.join(" ");
  }

  /**
   * Generate initial plan in PROJECT.md
   * @param {Object} project - Project info
   * @param {Object} goal - Goal object
   */
  async generateInitialPlan(project, goal) {
    if (!fs.existsSync(project.mdPath)) {
      return;
    }

    let content = fs.readFileSync(project.mdPath, "utf-8");

    // Check if plan section already exists
    if (content.includes("## Plan")) {
      return; // Already has a plan
    }

    // Generate plan section based on goal type
    const planSection = this.generatePlanSection(goal);

    // Insert plan section after Goal section
    const goalSectionEnd = content.indexOf("## Updates");
    if (goalSectionEnd !== -1) {
      content = content.slice(0, goalSectionEnd) + planSection + "\n" + content.slice(goalSectionEnd);
      fs.writeFileSync(project.mdPath, content, "utf-8");
    }

    this.addUpdate("plan", "Initial plan generated");
  }

  /**
   * Generate plan section content based on goal
   * @param {Object} goal - Goal object
   * @returns {string} Plan section markdown
   */
  generatePlanSection(goal) {
    const category = goal.category || "general";

    let plan = "## Plan\n\n";
    plan += `**Target:** ${goal.targetValue || "Not specified"} ${goal.unit || ""}\n`;
    plan += `**Current:** ${goal.currentValue || 0} ${goal.unit || ""}\n`;
    plan += `**Priority:** ${goal.priority || 5}\n\n`;

    // Generate category-specific phases
    const phases = this.getPhasesForCategory(category);

    plan += "### Phases\n\n";
    phases.forEach((phase, i) => {
      plan += `${i + 1}. **${phase.name}** - ${phase.description}\n`;
      plan += `   - Status: Pending\n`;
      plan += `   - Tasks: ${phase.tasks.join(", ")}\n\n`;
    });

    plan += "### Next Actions\n\n";
    plan += "- [ ] Research current state and opportunities\n";
    plan += "- [ ] Identify key milestones\n";
    plan += "- [ ] Create detailed action items\n\n";

    return plan;
  }

  /**
   * Get phases for a goal category
   * @param {string} category - Goal category
   * @returns {Array} Phases with tasks
   */
  getPhasesForCategory(category) {
    const categoryPhases = {
      finance: [
        { name: "Research", description: "Analyze opportunities and risks", tasks: ["Market analysis", "Risk assessment", "Strategy review"] },
        { name: "Planning", description: "Create detailed financial plan", tasks: ["Set milestones", "Define metrics", "Create timeline"] },
        { name: "Execution", description: "Implement strategy", tasks: ["Start small", "Track progress", "Adjust as needed"] },
        { name: "Optimization", description: "Improve returns", tasks: ["Analyze performance", "Reduce losses", "Scale winners"] }
      ],
      health: [
        { name: "Assessment", description: "Evaluate current health state", tasks: ["Baseline metrics", "Identify issues", "Set targets"] },
        { name: "Planning", description: "Create health improvement plan", tasks: ["Nutrition plan", "Exercise routine", "Sleep optimization"] },
        { name: "Implementation", description: "Execute health changes", tasks: ["Daily habits", "Track metrics", "Regular reviews"] },
        { name: "Maintenance", description: "Sustain improvements", tasks: ["Habit solidification", "Progress tracking", "Continuous improvement"] }
      ],
      family: [
        { name: "Understanding", description: "Assess current family dynamics", tasks: ["Identify needs", "Find opportunities", "Set intentions"] },
        { name: "Planning", description: "Plan quality time activities", tasks: ["Schedule activities", "Plan outings", "Create traditions"] },
        { name: "Engagement", description: "Active participation", tasks: ["Regular check-ins", "Shared activities", "Present moments"] },
        { name: "Reflection", description: "Review and improve", tasks: ["Family feedback", "Adjust approach", "Celebrate wins"] }
      ],
      career: [
        { name: "Discovery", description: "Identify career opportunities", tasks: ["Market research", "Skill assessment", "Network mapping"] },
        { name: "Preparation", description: "Build required skills", tasks: ["Learning plan", "Portfolio building", "Resume updates"] },
        { name: "Action", description: "Pursue opportunities", tasks: ["Applications", "Networking", "Interviews"] },
        { name: "Growth", description: "Advance in role", tasks: ["Performance", "Visibility", "Development"] }
      ],
      growth: [
        { name: "Exploration", description: "Identify growth areas", tasks: ["Self-assessment", "Goal setting", "Resource gathering"] },
        { name: "Learning", description: "Acquire new knowledge", tasks: ["Study plan", "Practice", "Feedback"] },
        { name: "Application", description: "Apply learnings", tasks: ["Projects", "Real-world use", "Teaching others"] },
        { name: "Mastery", description: "Achieve expertise", tasks: ["Deep practice", "Refinement", "Innovation"] }
      ],
      education: [
        { name: "Planning", description: "Define learning objectives", tasks: ["Course selection", "Schedule", "Resources"] },
        { name: "Study", description: "Active learning", tasks: ["Reading", "Notes", "Practice"] },
        { name: "Application", description: "Use knowledge", tasks: ["Projects", "Problems", "Teaching"] },
        { name: "Assessment", description: "Evaluate progress", tasks: ["Tests", "Reviews", "Certifications"] }
      ]
    };

    return categoryPhases[category] || categoryPhases.growth;
  }

  /**
   * Update project status
   * @param {string} projectName - Project name
   * @param {string} status - New status (active, paused, completed, blocked)
   */
  updateProjectStatus(projectName, status) {
    const project = this.loadProject(projectName);
    if (!project || !fs.existsSync(project.mdPath)) {
      return null;
    }

    let content = fs.readFileSync(project.mdPath, "utf-8");
    content = content.replace(/\*\*Status:\*\* [^\n]+/, `**Status:** ${status}`);
    fs.writeFileSync(project.mdPath, content, "utf-8");

    this.addUpdate("status", `Status changed to ${status}`);
    return project;
  }

  /**
   * Add a task completion to the project
   * @param {string} task - Task description that was completed
   */
  completeTask(task) {
    if (!this.currentProject || !fs.existsSync(this.currentProject.mdPath)) {
      return;
    }

    let content = fs.readFileSync(this.currentProject.mdPath, "utf-8");

    // Find and check off the task if it exists
    const taskPattern = new RegExp(`- \\[ \\] ${task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    if (taskPattern.test(content)) {
      content = content.replace(taskPattern, `- [x] ${task}`);
      fs.writeFileSync(this.currentProject.mdPath, content, "utf-8");
    }

    this.addUpdate("task", `Completed: ${task}`);
  }

  /**
   * Add a task to the project's Next Actions
   * @param {string} task - Task description to add
   */
  addTask(task) {
    if (!this.currentProject || !fs.existsSync(this.currentProject.mdPath)) {
      return;
    }

    let content = fs.readFileSync(this.currentProject.mdPath, "utf-8");

    // Find Next Actions section and add task
    const nextActionsIndex = content.indexOf("### Next Actions");
    if (nextActionsIndex !== -1) {
      const insertIndex = content.indexOf("\n", nextActionsIndex) + 1;
      const newContent = content.slice(0, insertIndex) + `\n- [ ] ${task}` + content.slice(insertIndex);
      fs.writeFileSync(this.currentProject.mdPath, newContent, "utf-8");
    }

    this.addUpdate("task", `Added: ${task}`);
  }
}

  /**
   * Calculate completion percentage for a project
   * Reads CRITERIA.md if it exists, otherwise estimates from tasks
   * @param {string} projectPath - Path to project directory
   * @returns {number} Completion percentage (0-100)
   */
  calculateCompletion(projectPath) {
    // First check for CRITERIA.md
    const criteriaPath = path.join(projectPath, "CRITERIA.md");
    if (fs.existsSync(criteriaPath)) {
      const content = fs.readFileSync(criteriaPath, "utf-8");
      const completionMatch = content.match(/\*\*(?:Current )?Completion\*\*:\s*(\d+)%/);
      if (completionMatch) {
        return parseInt(completionMatch[1]);
      }

      // Calculate from checkboxes if no explicit completion
      const checked = (content.match(/- \[x\]/gi) || []).length;
      const total = (content.match(/- \[[ x]\]/gi) || []).length;
      if (total > 0) {
        return Math.round((checked / total) * 100);
      }
    }

    // Fall back to PROJECT.md task count
    const projectMd = path.join(projectPath, "PROJECT.md");
    if (fs.existsSync(projectMd)) {
      const content = fs.readFileSync(projectMd, "utf-8");
      const checked = (content.match(/- \[x\]/gi) || []).length;
      const total = (content.match(/- \[[ x]\]/gi) || []).length;
      if (total > 0) {
        return Math.round((checked / total) * 100);
      }

      // Check for explicit completion in PROJECT.md
      const completionMatch = content.match(/\*\*Completion\*\*:\s*(\d+)%/);
      if (completionMatch) {
        return parseInt(completionMatch[1]);
      }
    }

    return 0;
  }

  /**
   * Get the parent goal ID for a project
   * @param {string} projectPath - Path to project directory
   * @returns {string|null} Goal ID or null
   */
  getProjectGoalId(projectPath) {
    const projectMd = path.join(projectPath, "PROJECT.md");
    if (!fs.existsSync(projectMd)) {
      return null;
    }

    const content = fs.readFileSync(projectMd, "utf-8");

    // Check for Goal field
    const goalMatch = content.match(/\*\*Goal\*\*:\s*([^\n]+)/);
    if (goalMatch && goalMatch[1].trim() !== "none" && goalMatch[1].trim() !== "") {
      return goalMatch[1].trim();
    }

    // Check for GoalId field
    const goalIdMatch = content.match(/\*\*GoalId\*\*:\s*([^\n]+)/);
    if (goalIdMatch) {
      return goalIdMatch[1].trim();
    }

    return null;
  }

  /**
   * List all projects with completion percentages
   * @returns {Array} List of projects with completion info
   */
  listProjectsWithCompletion() {
    const projects = this.listProjects();

    return projects.map(project => ({
      ...project,
      completion: this.calculateCompletion(project.path),
      goalId: this.getProjectGoalId(project.path)
    }));
  }

  /**
   * Get projects grouped by goal with completion percentages
   * This is the main function for UI display
   * @returns {Object} Projects grouped by goal ID
   */
  getProjectsByGoal() {
    const projects = this.listProjectsWithCompletion();
    const byGoal = {};

    for (const project of projects) {
      const goalId = project.goalId || "unassigned";
      if (!byGoal[goalId]) {
        byGoal[goalId] = [];
      }
      byGoal[goalId].push({
        id: project.safeName,
        name: project.name,
        status: project.status,
        completion: project.completion,
        modifiedAt: project.modifiedAt
      });
    }

    // Sort projects within each goal by completion (lowest first for priority)
    for (const goalId of Object.keys(byGoal)) {
      byGoal[goalId].sort((a, b) => a.completion - b.completion);
    }

    return byGoal;
  }

  /**
   * Update completion percentage in PROJECT.md
   * @param {string} projectName - Project name
   * @param {number} completion - Completion percentage (0-100)
   */
  updateCompletion(projectName, completion) {
    const project = this.loadProject(projectName);
    if (!project || !fs.existsSync(project.mdPath)) {
      return null;
    }

    let content = fs.readFileSync(project.mdPath, "utf-8");

    // Check if Completion field exists
    if (content.includes("**Completion:**")) {
      content = content.replace(/\*\*Completion:\*\* \d+%/, `**Completion:** ${completion}%`);
    } else {
      // Add after Status line
      content = content.replace(
        /(\*\*Status:\*\* [^\n]+)/,
        `$1\n**Completion:** ${completion}%`
      );
    }

    fs.writeFileSync(project.mdPath, content, "utf-8");
    return project;
  }

  /**
   * Set the parent goal for a project
   * @param {string} projectName - Project name
   * @param {string} goalId - Goal ID to link to
   */
  setProjectGoal(projectName, goalId) {
    const project = this.loadProject(projectName);
    if (!project || !fs.existsSync(project.mdPath)) {
      return null;
    }

    let content = fs.readFileSync(project.mdPath, "utf-8");

    // Check if Goal field exists
    if (content.includes("**Goal:**")) {
      content = content.replace(/\*\*Goal:\*\* [^\n]+/, `**Goal:** ${goalId}`);
    } else {
      // Add after Status line
      content = content.replace(
        /(\*\*Status:\*\* [^\n]+)/,
        `$1\n**Goal:** ${goalId}`
      );
    }

    fs.writeFileSync(project.mdPath, content, "utf-8");
    this.addUpdate("link", `Linked to goal: ${goalId}`);
    return project;
  }

  /**
   * Get summary for goals view display
   * Returns data formatted for UI rendering
   * @returns {Object} Summary with goals and their projects
   */
  async getGoalsViewData() {
    const projectsByGoal = this.getProjectsByGoal();

    // Load goals data
    const goalsPath = path.join(process.cwd(), "data", "goals.json");
    let goals = [];
    if (fs.existsSync(goalsPath)) {
      try {
        goals = JSON.parse(fs.readFileSync(goalsPath, "utf-8"));
      } catch (e) {
        console.error("Failed to load goals:", e);
      }
    }

    // Also check parsed-goals.json for core goals
    const parsedGoalsPath = path.join(process.cwd(), "data", "parsed-goals.json");
    let coreGoals = [];
    if (fs.existsSync(parsedGoalsPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(parsedGoalsPath, "utf-8"));
        coreGoals = parsed.goals || [];
      } catch (e) {
        console.error("Failed to load parsed goals:", e);
      }
    }

    // Build the view data
    const viewData = {
      coreGoals: coreGoals.map(goal => {
        const projects = projectsByGoal[goal.id] || projectsByGoal[goal.title] || [];
        const avgCompletion = projects.length > 0
          ? Math.round(projects.reduce((sum, p) => sum + p.completion, 0) / projects.length)
          : 0;

        return {
          id: goal.id,
          title: goal.title,
          type: goal.type,
          completion: avgCompletion,
          projects: projects
        };
      }),
      goals: goals.map(goal => {
        const projects = projectsByGoal[goal.id] || projectsByGoal[goal.title] || [];
        return {
          id: goal.id,
          title: goal.title,
          category: goal.category,
          progress: goal.progress || 0,
          projects: projects
        };
      }),
      unassigned: projectsByGoal["unassigned"] || []
    };

    return viewData;
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

/**
 * Quick access to projects by goal (for API/UI)
 */
export const getProjectsByGoal = () => {
  return getProjectManager().getProjectsByGoal();
};

/**
 * Quick access to goals view data (for API/UI)
 */
export const getGoalsViewData = async () => {
  return getProjectManager().getGoalsViewData();
};

export default ProjectManager;
