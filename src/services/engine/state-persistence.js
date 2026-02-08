/**
 * State Persistence Service
 *
 * Saves and restores engine state for crash recovery.
 * All state is stored in markdown files for human readability.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../../memory");
const ENGINE_STATE_FILE = path.join(MEMORY_DIR, "engine-state.md");
const THINKING_JOURNAL_FILE = path.join(MEMORY_DIR, "thinking-journal.md");

/**
 * Engine state object
 */
class EngineState {
  constructor() {
    this.status = "IDLE"; // IDLE, THINKING, RESEARCHING, PLANNING, EXECUTING, TESTING, REFLECTING
    this.lastUpdated = new Date().toISOString();
    this.version = 1;
    this.currentTask = null;
    this.taskQueue = [];
    this.activeProjects = [];
    this.checkpoints = [];
    this.session = {
      id: null,
      started: null,
      tasksCompleted: 0,
      errors: 0
    };
    this.recoveryNotes = "";
  }

  /**
   * Start a new session
   */
  startSession() {
    this.session.id = `session_${Date.now()}`;
    this.session.started = new Date().toISOString();
    this.session.tasksCompleted = 0;
    this.session.errors = 0;
    this.status = "THINKING";
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Set current task
   */
  setCurrentTask(task) {
    this.currentTask = task;
    this.status = task ? "EXECUTING" : "IDLE";
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Complete current task
   */
  completeCurrentTask() {
    if (this.currentTask) {
      this.session.tasksCompleted++;
    }
    this.currentTask = null;
    this.status = "THINKING";
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Add a checkpoint
   */
  addCheckpoint(checkpoint) {
    this.checkpoints.push({
      id: `checkpoint_${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...checkpoint
    });
    // Keep only last 10 checkpoints
    if (this.checkpoints.length > 10) {
      this.checkpoints = this.checkpoints.slice(-10);
    }
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Record an error
   */
  recordError(error) {
    this.session.errors++;
    this.recoveryNotes = `Last error: ${error.message} at ${new Date().toISOString()}`;
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Update status
   */
  setStatus(status) {
    this.status = status;
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Add task to queue
   */
  addToQueue(task) {
    // Prevent duplicates
    if (!this.taskQueue.find(t => t.id === task.id)) {
      this.taskQueue.push(task);
      this.taskQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Get next task from queue
   */
  getNextTask() {
    return this.taskQueue.shift() || null;
  }

  /**
   * Update active project
   */
  updateProject(project) {
    const idx = this.activeProjects.findIndex(p => p.id === project.id);
    if (idx >= 0) {
      this.activeProjects[idx] = { ...this.activeProjects[idx], ...project };
    } else {
      this.activeProjects.push(project);
    }
    this.lastUpdated = new Date().toISOString();
  }
}

/**
 * Save state to markdown file
 */
export async function saveState(state) {
  const md = `# BACKBONE Engine State

## Status
**State**: ${state.status}
**Last Updated**: ${state.lastUpdated}
**Version**: ${state.version}

## Current Task
${state.currentTask ? formatTask(state.currentTask) : "None"}

## Task Queue
${state.taskQueue.length > 0
    ? state.taskQueue.map((t, i) => `${i + 1}. [${t.priority || 0}] ${t.title || t.id}`).join("\n")
    : "(empty)"}

## Active Projects
| Project | Status | Completion | Last Activity |
|---------|--------|------------|---------------|
${state.activeProjects.length > 0
    ? state.activeProjects.map(p =>
      `| ${p.name || p.id} | ${p.status || "unknown"} | ${p.completion || 0}% | ${p.lastActivity || "unknown"} |`
    ).join("\n")
    : "| (none active) | | | |"}

## Checkpoints
${state.checkpoints.length > 0
    ? state.checkpoints.map(c => `- [${c.timestamp}] ${c.description || c.id}`).join("\n")
    : "(none)"}

## Session Info
- **Session ID**: ${state.session.id || "(not started)"}
- **Started**: ${state.session.started || "(not started)"}
- **Tasks Completed**: ${state.session.tasksCompleted}
- **Errors**: ${state.session.errors}

## Recovery Notes
${state.recoveryNotes || "No recovery needed - clean state."}
`;

  await fs.promises.writeFile(ENGINE_STATE_FILE, md, "utf-8");
  return true;
}

/**
 * Format a task for display
 */
function formatTask(task) {
  if (!task) return "None";
  return `**${task.title || task.id}**
- ID: ${task.id}
- Project: ${task.project || "none"}
- Priority: ${task.priority || 0}
- Status: ${task.status || "pending"}
- Started: ${task.started || "not started"}`;
}

/**
 * Load state from markdown file
 */
export async function loadState() {
  try {
    if (!fs.existsSync(ENGINE_STATE_FILE)) {
      return new EngineState();
    }

    const md = await fs.promises.readFile(ENGINE_STATE_FILE, "utf-8");
    const state = new EngineState();

    // Parse status
    const statusMatch = md.match(/\*\*State\*\*:\s*(\w+)/);
    if (statusMatch) state.status = statusMatch[1];

    const lastUpdatedMatch = md.match(/\*\*Last Updated\*\*:\s*(.+)/);
    if (lastUpdatedMatch) state.lastUpdated = lastUpdatedMatch[1].trim();

    const versionMatch = md.match(/\*\*Version\*\*:\s*(\d+)/);
    if (versionMatch) state.version = parseInt(versionMatch[1]);

    // Parse session info
    const sessionIdMatch = md.match(/\*\*Session ID\*\*:\s*(.+)/);
    if (sessionIdMatch && sessionIdMatch[1].trim() !== "(not started)") {
      state.session.id = sessionIdMatch[1].trim();
    }

    const startedMatch = md.match(/\*\*Started\*\*:\s*(.+)/);
    if (startedMatch && startedMatch[1].trim() !== "(not started)") {
      state.session.started = startedMatch[1].trim();
    }

    const tasksCompletedMatch = md.match(/\*\*Tasks Completed\*\*:\s*(\d+)/);
    if (tasksCompletedMatch) state.session.tasksCompleted = parseInt(tasksCompletedMatch[1]);

    const errorsMatch = md.match(/\*\*Errors\*\*:\s*(\d+)/);
    if (errorsMatch) state.session.errors = parseInt(errorsMatch[1]);

    // Parse recovery notes
    const recoveryMatch = md.match(/## Recovery Notes\n([\s\S]*?)(?=\n##|$)/);
    if (recoveryMatch) {
      state.recoveryNotes = recoveryMatch[1].trim();
    }

    return state;
  } catch (error) {
    console.error("[StatePersistence] Failed to load state:", error.message);
    return new EngineState();
  }
}

/**
 * Add entry to thinking journal
 */
export async function logThinking(entry) {
  try {
    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split("T")[0];

    let journal = "";
    if (fs.existsSync(THINKING_JOURNAL_FILE)) {
      journal = await fs.promises.readFile(THINKING_JOURNAL_FILE, "utf-8");
    }

    // Check if today's date header exists
    if (!journal.includes(`## ${dateStr}`)) {
      // Add date header
      journal += `\n---\n\n## ${dateStr}\n`;
    }

    // Add entry
    const entryMd = `
### Entry: ${entry.title}
**Time**: ${new Date().toLocaleTimeString()}
**Context**: ${entry.context || "General"}
**Decision**: ${entry.decision || "(none)"}
**Reasoning**:
${entry.reasoning || "(none)"}

**Outcome**: ${entry.outcome || "(pending)"}

`;

    // Insert after the date header
    const dateHeaderIdx = journal.lastIndexOf(`## ${dateStr}`);
    const insertIdx = journal.indexOf("\n", dateHeaderIdx) + 1;
    journal = journal.slice(0, insertIdx) + entryMd + journal.slice(insertIdx);

    await fs.promises.writeFile(THINKING_JOURNAL_FILE, journal, "utf-8");
    return true;
  } catch (error) {
    console.error("[StatePersistence] Failed to log thinking:", error.message);
    return false;
  }
}

/**
 * Create a checkpoint for crash recovery
 */
export async function createCheckpoint(state, description) {
  state.addCheckpoint({
    description,
    taskId: state.currentTask?.id,
    queueLength: state.taskQueue.length
  });
  await saveState(state);
  return state.checkpoints[state.checkpoints.length - 1];
}

/**
 * Get the last checkpoint for recovery
 */
export async function getLastCheckpoint(state) {
  return state.checkpoints[state.checkpoints.length - 1] || null;
}

/**
 * Archive old journal entries (older than 7 days)
 */
export async function archiveOldJournalEntries() {
  try {
    if (!fs.existsSync(THINKING_JOURNAL_FILE)) return;

    const journal = await fs.promises.readFile(THINKING_JOURNAL_FILE, "utf-8");
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    // Find entries older than cutoff
    const lines = journal.split("\n");
    const archiveLines = [];
    const keepLines = [];
    let currentDate = null;
    let archiving = false;

    for (const line of lines) {
      const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        currentDate = dateMatch[1];
        archiving = currentDate < cutoffStr;
      }

      if (archiving) {
        archiveLines.push(line);
      } else {
        keepLines.push(line);
      }
    }

    // Save archive if there are old entries
    if (archiveLines.length > 10) {
      const archiveFile = path.join(MEMORY_DIR, `thinking-journal-archive-${cutoffStr}.md`);
      await fs.promises.writeFile(archiveFile, archiveLines.join("\n"), "utf-8");
      await fs.promises.writeFile(THINKING_JOURNAL_FILE, keepLines.join("\n"), "utf-8");
      console.log(`[StatePersistence] Archived ${archiveLines.length} journal lines`);
    }
  } catch (error) {
    console.error("[StatePersistence] Failed to archive journal:", error.message);
  }
}

// Export the EngineState class for direct instantiation
export { EngineState };

// Convenience functions
export async function quickSave(state) {
  return saveState(state);
}

export async function quickLoad() {
  return loadState();
}
