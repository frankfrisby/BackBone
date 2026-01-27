import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

/**
 * Engine State Service for BACKBONE
 * Manages dynamic status display and project thread tracking
 * Shows meaningful states: Researching, Thinking, Planning, Building, etc.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "engine-state.json");
const THREADS_DIR = path.join(DATA_DIR, "threads");

// Engine status types with display info
export const ENGINE_STATUS = {
  STARTING: { id: "starting", label: "Starting up Engine", icon: "⚡", color: "#f59e0b" },
  RESEARCHING: { id: "researching", label: "Researching", icon: "🔍", color: "#38bdf8" },
  THINKING: { id: "thinking", label: "Thinking", icon: "💭", color: "#a78bfa" },
  PLANNING: { id: "planning", label: "Planning", icon: "📋", color: "#60a5fa" },
  BUILDING: { id: "building", label: "Building", icon: "🔨", color: "#22c55e" },
  WORKING: { id: "working", label: "Working", icon: "⚙️", color: "#f97316" },
  REFLECTING: { id: "reflecting", label: "Reflecting", icon: "🪞", color: "#ec4899" },
  UPDATING: { id: "updating", label: "Updating", icon: "📝", color: "#eab308" },
  CONNECTING: { id: "connecting", label: "Connecting", icon: "🔗", color: "#06b6d4" },
  CONNECTING_AGENT: { id: "connecting_agent", label: "Connecting to Agent", icon: "🤖", color: "#8b5cf6" },
  CONNECTING_PROVIDER: { id: "connecting_provider", label: "Connecting to Provider", icon: "☁️", color: "#3b82f6" },
  RUNNING_CRON: { id: "running_cron", label: "Running Cron Services", icon: "⏰", color: "#64748b" },
  CLOSING: { id: "closing", label: "Closing Down Engine", icon: "🔴", color: "#ef4444" },
  IDLE: { id: "idle", label: "Ready", icon: "●", color: "#22c55e" },
  WAITING: { id: "waiting", label: "Waiting", icon: "◐", color: "#94a3b8" },
  ANALYZING: { id: "analyzing", label: "Analyzing", icon: "📊", color: "#14b8a6" },
  EXECUTING: { id: "executing", label: "Executing", icon: "▶", color: "#22c55e" },
  LEARNING: { id: "learning", label: "Learning", icon: "📚", color: "#f472b6" },
  SYNCING: { id: "syncing", label: "Syncing", icon: "🔄", color: "#06b6d4" }
};

/**
 * State transitions based on tool/activity type
 * Maps tool actions to engine states for proper display
 */
export const STATE_FOR_ACTIVITY = {
  // Research tools
  web_search: "researching",
  WebSearch: "researching",
  WEB_SEARCH: "researching",
  read_file: "researching",
  Read: "researching",
  READ: "researching",
  Fetch: "researching",
  WEB_FETCH: "researching",

  // Analysis tools
  grep: "analyzing",
  Grep: "analyzing",
  GREP: "analyzing",
  analyze: "analyzing",
  glob: "analyzing",
  Glob: "analyzing",
  GLOB: "analyzing",

  // Building/Writing tools
  write_file: "building",
  Write: "building",
  WRITE: "building",
  create: "building",

  // Working/Editing tools
  edit_file: "working",
  Edit: "working",
  EDIT: "working",
  Update: "working",
  UPDATE: "working",

  // Execution tools
  bash_command: "executing",
  Bash: "executing",
  BASH: "executing",

  // Connection tools
  api_call: "connecting",
  API: "connecting",
  API_CALL: "connecting",

  // Thinking/Planning
  think: "thinking",
  plan: "planning",
  reflect: "reflecting"
};

/**
 * Get the appropriate engine status for an activity
 */
export const getStateForActivity = (activity) => {
  const stateId = STATE_FOR_ACTIVITY[activity];
  if (stateId) {
    return ENGINE_STATUS[stateId.toUpperCase()] || ENGINE_STATUS.WORKING;
  }
  return ENGINE_STATUS.WORKING;
};

/**
 * Autonomous state flow for goal work
 * Defines valid state transitions for the autonomous engine
 */
export const STATE_FLOW = {
  idle: ["thinking", "researching"],
  thinking: ["planning", "researching", "idle"],
  planning: ["researching", "executing", "building"],
  researching: ["analyzing", "thinking", "building"],
  analyzing: ["planning", "building", "working"],
  building: ["executing", "reflecting", "working"],
  working: ["building", "reflecting", "executing"],
  executing: ["reflecting", "building", "working"],
  reflecting: ["idle", "researching", "planning"],
  connecting: ["researching", "executing", "idle"],
  learning: ["reflecting", "planning", "idle"]
};

/**
 * Check if a state transition is valid
 */
export const isValidTransition = (fromState, toState) => {
  const from = fromState.toLowerCase();
  const to = toState.toLowerCase();

  // Always allow transition to self
  if (from === to) return true;

  // Check if transition is in the flow
  const validNext = STATE_FLOW[from];
  if (validNext && validNext.includes(to)) {
    return true;
  }

  // Allow any transition to/from idle
  if (from === "idle" || to === "idle") {
    return true;
  }

  return false;
};

// Project domains/categories
export const PROJECT_DOMAINS = {
  HEALTH: { id: "health", label: "Health", icon: "❤️", color: "#22c55e" },
  FINANCES: { id: "finances", label: "Finances", icon: "💰", color: "#eab308" },
  WORK: { id: "work", label: "Work", icon: "💼", color: "#3b82f6" },
  FAMILY: { id: "family", label: "Family", icon: "👨‍👩‍👧", color: "#ec4899" },
  EDUCATION: { id: "education", label: "Education", icon: "🎓", color: "#8b5cf6" },
  PERSONAL: { id: "personal", label: "Personal", icon: "🌟", color: "#f59e0b" },
  PROJECTS: { id: "projects", label: "Projects", icon: "📁", color: "#06b6d4" }
};

/**
 * Default engine state
 */
const getDefaultState = () => ({
  status: ENGINE_STATUS.IDLE.id,
  statusDetail: null,
  engineProvider: "Claude Code CLI",
  currentPlan: null,
  currentWork: null,
  activeProject: null,
  lastUpdated: new Date().toISOString(),
  history: [],
  metrics: {
    startedAt: new Date().toISOString(),
    cyclesRun: 0,
    actionsCompleted: 0,
    projectsWorked: []
  }
});

/**
 * Load engine state from disk
 */
export const loadEngineState = () => {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
      return { ...getDefaultState(), ...state };
    }
  } catch (error) {
    console.error("Failed to load engine state:", error.message);
  }
  return getDefaultState();
};

/**
 * Save engine state to disk
 */
export const saveEngineState = (state) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error("Failed to save engine state:", error.message);
    return false;
  }
};

/**
 * Thread message structure for project work tracking
 */
const createThreadMessage = (content, role = "system", metadata = {}) => ({
  id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  role, // system, ai, user, action, result
  content,
  timestamp: new Date().toISOString(),
  metadata
});

/**
 * Engine State Manager Class
 */
export class EngineStateManager extends EventEmitter {
  constructor() {
    super();
    this.state = loadEngineState();
    this.threads = new Map(); // projectId -> messages[]
    this.ensureThreadsDir();
    this.loadActiveThreads();
  }

  ensureThreadsDir() {
    if (!fs.existsSync(THREADS_DIR)) {
      fs.mkdirSync(THREADS_DIR, { recursive: true });
    }
  }

  /**
   * Set the current engine status
   */
  setStatus(statusId, detail = null) {
    const statusInfo = Object.values(ENGINE_STATUS).find(s => s.id === statusId);
    if (!statusInfo) {
      console.error(`Unknown status: ${statusId}`);
      return;
    }

    const previousStatus = this.state.status;
    this.state.status = statusId;
    this.state.statusDetail = detail;
    this.state.lastUpdated = new Date().toISOString();

    // Add to history (keep last 50)
    this.state.history.unshift({
      from: previousStatus,
      to: statusId,
      detail,
      timestamp: this.state.lastUpdated
    });
    this.state.history = this.state.history.slice(0, 50);

    saveEngineState(this.state);
    this.emit("status-changed", { status: statusId, detail, previous: previousStatus });
  }

  /**
   * Set current plan being executed
   */
  setPlan(plan) {
    this.state.currentPlan = plan;
    this.state.lastUpdated = new Date().toISOString();
    saveEngineState(this.state);
    this.emit("plan-updated", plan);
  }

  /**
   * Set current work description
   */
  setWork(workDescription) {
    this.state.currentWork = workDescription;
    this.state.lastUpdated = new Date().toISOString();
    saveEngineState(this.state);
    this.emit("work-updated", workDescription);
  }

  /**
   * Get current status display info
   */
  getStatusDisplay() {
    const statusInfo = Object.values(ENGINE_STATUS).find(s => s.id === this.state.status);
    return {
      ...statusInfo,
      detail: this.state.statusDetail,
      currentPlan: this.state.currentPlan,
      currentWork: this.state.currentWork,
      lastUpdated: this.state.lastUpdated
    };
  }

  // ========== PROJECT THREAD MANAGEMENT ==========

  /**
   * Load active project threads from disk
   */
  loadActiveThreads() {
    try {
      const threadFiles = fs.readdirSync(THREADS_DIR).filter(f => f.endsWith(".json"));
      for (const file of threadFiles) {
        const projectId = file.replace(".json", "");
        const threadPath = path.join(THREADS_DIR, file);
        const messages = JSON.parse(fs.readFileSync(threadPath, "utf-8"));
        this.threads.set(projectId, messages);
      }
    } catch (error) {
      // Threads dir may not exist yet
    }
  }

  /**
   * Start or resume a project thread
   */
  startProjectThread(projectId, projectName, domain = "projects") {
    if (!this.threads.has(projectId)) {
      this.threads.set(projectId, []);
      this.addThreadMessage(projectId, `Project "${projectName}" started`, "system", { domain });
    }

    this.state.activeProject = { id: projectId, name: projectName, domain };
    saveEngineState(this.state);
    this.emit("project-started", { projectId, projectName, domain });
    return this.threads.get(projectId);
  }

  /**
   * Add message to project thread
   */
  addThreadMessage(projectId, content, role = "system", metadata = {}) {
    if (!this.threads.has(projectId)) {
      this.threads.set(projectId, []);
    }

    const message = createThreadMessage(content, role, metadata);
    this.threads.get(projectId).push(message);

    // Save thread to disk
    this.saveThread(projectId);

    this.emit("thread-message", { projectId, message });
    return message;
  }

  /**
   * Save thread to disk
   */
  saveThread(projectId) {
    const threadPath = path.join(THREADS_DIR, `${projectId}.json`);
    const messages = this.threads.get(projectId) || [];
    fs.writeFileSync(threadPath, JSON.stringify(messages, null, 2));
  }

  /**
   * Get thread messages for a project
   */
  getThread(projectId) {
    return this.threads.get(projectId) || [];
  }

  /**
   * Complete a project - archive thread and update .md file
   */
  completeProject(projectId, summary = null) {
    const messages = this.threads.get(projectId) || [];

    // Generate robust .md file from thread messages
    const mdContent = this.generateProjectMd(projectId, messages, summary);

    // Save .md file to memory
    const mdPath = path.join(process.cwd(), "memory", `project-${projectId}.md`);
    fs.writeFileSync(mdPath, mdContent);

    // Clear thread messages (they're archived in .md)
    this.threads.delete(projectId);

    // Remove thread JSON file
    const threadPath = path.join(THREADS_DIR, `${projectId}.json`);
    if (fs.existsSync(threadPath)) {
      fs.unlinkSync(threadPath);
    }

    // Update state
    if (this.state.activeProject?.id === projectId) {
      this.state.activeProject = null;
    }
    this.state.metrics.actionsCompleted++;
    if (!this.state.metrics.projectsWorked.includes(projectId)) {
      this.state.metrics.projectsWorked.push(projectId);
    }
    saveEngineState(this.state);

    this.emit("project-completed", { projectId, mdPath, summary });
    return { success: true, mdPath };
  }

  /**
   * Generate a robust .md file from thread messages
   * This file should contain enough context to resume work later
   */
  generateProjectMd(projectId, messages, summary = null) {
    const now = new Date().toISOString();
    const firstMsg = messages[0];
    const metadata = firstMsg?.metadata || {};

    let md = `# Project: ${metadata.name || projectId}\n\n`;
    md += `**Domain:** ${metadata.domain || "general"}\n`;
    md += `**Created:** ${firstMsg?.timestamp || now}\n`;
    md += `**Last Updated:** ${now}\n`;
    md += `**Status:** Completed\n\n`;

    if (summary) {
      md += `## Summary\n\n${summary}\n\n`;
    }

    md += `## Work Log\n\n`;

    // Group messages by date
    const messagesByDate = {};
    for (const msg of messages) {
      const date = msg.timestamp.split("T")[0];
      if (!messagesByDate[date]) {
        messagesByDate[date] = [];
      }
      messagesByDate[date].push(msg);
    }

    for (const [date, dayMessages] of Object.entries(messagesByDate)) {
      md += `### ${date}\n\n`;
      for (const msg of dayMessages) {
        const time = msg.timestamp.split("T")[1].split(".")[0];
        const roleIcon = msg.role === "ai" ? "🤖" :
                         msg.role === "user" ? "👤" :
                         msg.role === "action" ? "▶" :
                         msg.role === "result" ? "✓" : "📌";
        md += `- **${time}** ${roleIcon} ${msg.content}\n`;
      }
      md += "\n";
    }

    md += `## Context for Resumption\n\n`;
    md += `This project can be resumed by referencing:\n`;
    md += `- Project ID: \`${projectId}\`\n`;
    md += `- Total messages in thread: ${messages.length}\n`;
    md += `- Domain focus: ${metadata.domain || "general"}\n\n`;

    // Extract key decisions and actions from messages
    const keyActions = messages.filter(m =>
      m.role === "action" || m.role === "result" ||
      (m.metadata && m.metadata.important)
    );

    if (keyActions.length > 0) {
      md += `### Key Actions Taken\n\n`;
      for (const action of keyActions) {
        md += `- ${action.content}\n`;
      }
      md += "\n";
    }

    md += `---\n*Generated by BACKBONE Engine*\n`;

    return md;
  }

  /**
   * Get rolling list of active projects with their work states
   */
  getRollingProjects() {
    const projects = [];

    for (const [projectId, messages] of this.threads.entries()) {
      const lastMsg = messages[messages.length - 1];
      const firstMsg = messages[0];

      projects.push({
        id: projectId,
        name: firstMsg?.metadata?.name || projectId,
        domain: firstMsg?.metadata?.domain || "general",
        messageCount: messages.length,
        lastActivity: lastMsg?.timestamp || null,
        lastMessage: lastMsg?.content?.slice(0, 100) || null,
        isActive: this.state.activeProject?.id === projectId
      });
    }

    // Sort by last activity
    projects.sort((a, b) => {
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return new Date(b.lastActivity) - new Date(a.lastActivity);
    });

    return projects;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const statusDisplay = this.getStatusDisplay();
    const projects = this.getRollingProjects();

    return {
      status: statusDisplay,
      engineProvider: this.state.engineProvider || "Claude Code CLI",
      activeProject: this.state.activeProject,
      projects: projects.slice(0, 10),
      metrics: this.state.metrics,
      lastUpdated: this.state.lastUpdated
    };
  }

  /**
   * Increment cycle counter
   */
  incrementCycle() {
    this.state.metrics.cyclesRun++;
    saveEngineState(this.state);
  }

  /**
   * Reset engine state
   */
  reset() {
    this.state = getDefaultState();
    saveEngineState(this.state);
    this.emit("reset");
  }
}

// Singleton instance
let engineStateInstance = null;

export const getEngineStateManager = () => {
  if (!engineStateInstance) {
    engineStateInstance = new EngineStateManager();
  }
  return engineStateInstance;
};

export default EngineStateManager;
