/**
 * Task Queue Manager
 *
 * Manages a prioritized queue of tasks for the autonomous engine.
 * Persists queue state to markdown for crash recovery.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, "../../memory");
const QUEUE_FILE = path.join(MEMORY_DIR, "task-queue.md");

/**
 * Task priorities
 */
export const PRIORITY = {
  CRITICAL: 100,    // Must do immediately
  HIGH: 75,         // Important, do soon
  NORMAL: 50,       // Standard priority
  LOW: 25,          // Do when time permits
  BACKGROUND: 10    // Do during idle time
};

/**
 * Task statuses
 */
export const TASK_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  BLOCKED: "blocked",
  WAITING: "waiting",
  COMPLETED: "completed",
  FAILED: "failed"
};

/**
 * Task class
 */
export class Task {
  constructor(options = {}) {
    this.id = options.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.title = options.title || "Untitled Task";
    this.description = options.description || "";
    this.project = options.project || null;
    this.priority = options.priority || PRIORITY.NORMAL;
    this.status = options.status || TASK_STATUS.PENDING;
    this.type = options.type || "general"; // research, planning, execute, test, reflect
    this.createdAt = options.createdAt || new Date().toISOString();
    this.startedAt = options.startedAt || null;
    this.completedAt = options.completedAt || null;
    this.blockedBy = options.blockedBy || null;
    this.blockedReason = options.blockedReason || null;
    this.attempts = options.attempts || 0;
    this.maxAttempts = options.maxAttempts || 3;
    this.context = options.context || {};
    this.result = options.result || null;
  }

  /**
   * Start the task
   */
  start() {
    this.status = TASK_STATUS.IN_PROGRESS;
    this.startedAt = new Date().toISOString();
    this.attempts++;
  }

  /**
   * Complete the task
   */
  complete(result = null) {
    this.status = TASK_STATUS.COMPLETED;
    this.completedAt = new Date().toISOString();
    this.result = result;
  }

  /**
   * Fail the task
   */
  fail(reason) {
    if (this.attempts < this.maxAttempts) {
      this.status = TASK_STATUS.PENDING; // Retry
    } else {
      this.status = TASK_STATUS.FAILED;
    }
    this.result = { error: reason };
  }

  /**
   * Block the task
   */
  block(reason, blockedBy = null) {
    this.status = TASK_STATUS.BLOCKED;
    this.blockedReason = reason;
    this.blockedBy = blockedBy;
  }

  /**
   * Unblock the task
   */
  unblock() {
    this.status = TASK_STATUS.PENDING;
    this.blockedReason = null;
    this.blockedBy = null;
  }

  /**
   * Check if task can be executed
   */
  canExecute() {
    return this.status === TASK_STATUS.PENDING && this.attempts < this.maxAttempts;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return { ...this };
  }

  /**
   * Create from plain object
   */
  static fromObject(obj) {
    return new Task(obj);
  }
}

/**
 * Task Queue class
 */
export class TaskQueue {
  constructor() {
    this.tasks = [];
    this.completedTasks = [];
    this.maxCompleted = 50; // Keep last 50 completed tasks
  }

  /**
   * Add a task to the queue
   */
  add(taskOrOptions) {
    const task = taskOrOptions instanceof Task ? taskOrOptions : new Task(taskOrOptions);

    // Prevent duplicates by ID
    if (this.tasks.find(t => t.id === task.id)) {
      console.log(`[TaskQueue] Task ${task.id} already in queue`);
      return null;
    }

    // Prevent duplicates by title+project
    const existing = this.tasks.find(t =>
      t.title === task.title &&
      t.project === task.project &&
      t.status === TASK_STATUS.PENDING
    );
    if (existing) {
      console.log(`[TaskQueue] Similar task already exists: ${existing.id}`);
      return null;
    }

    this.tasks.push(task);
    this._sort();
    return task;
  }

  /**
   * Get the next task to execute
   */
  getNext() {
    // Find first executable task
    const task = this.tasks.find(t => t.canExecute());
    return task || null;
  }

  /**
   * Get a specific task by ID
   */
  get(taskId) {
    return this.tasks.find(t => t.id === taskId) ||
           this.completedTasks.find(t => t.id === taskId);
  }

  /**
   * Start a task
   */
  start(taskId) {
    const task = this.get(taskId);
    if (task && task.canExecute()) {
      task.start();
      return task;
    }
    return null;
  }

  /**
   * Complete a task
   */
  complete(taskId, result = null) {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      const task = this.tasks[idx];
      task.complete(result);
      this.tasks.splice(idx, 1);
      this.completedTasks.unshift(task);

      // Trim completed tasks
      if (this.completedTasks.length > this.maxCompleted) {
        this.completedTasks = this.completedTasks.slice(0, this.maxCompleted);
      }

      // Unblock any tasks waiting on this one
      this.tasks.forEach(t => {
        if (t.blockedBy === taskId) {
          t.unblock();
        }
      });

      return task;
    }
    return null;
  }

  /**
   * Fail a task
   */
  fail(taskId, reason) {
    const task = this.get(taskId);
    if (task) {
      task.fail(reason);
      if (task.status === TASK_STATUS.FAILED) {
        // Move to completed (as failed)
        const idx = this.tasks.findIndex(t => t.id === taskId);
        if (idx >= 0) {
          this.tasks.splice(idx, 1);
          this.completedTasks.unshift(task);
        }
      }
      return task;
    }
    return null;
  }

  /**
   * Block a task
   */
  block(taskId, reason, blockedBy = null) {
    const task = this.get(taskId);
    if (task) {
      task.block(reason, blockedBy);
      return task;
    }
    return null;
  }

  /**
   * Get all pending tasks
   */
  getPending() {
    return this.tasks.filter(t => t.status === TASK_STATUS.PENDING);
  }

  /**
   * Get all blocked tasks
   */
  getBlocked() {
    return this.tasks.filter(t => t.status === TASK_STATUS.BLOCKED);
  }

  /**
   * Get tasks for a project
   */
  getByProject(projectId) {
    return this.tasks.filter(t => t.project === projectId);
  }

  /**
   * Get queue length
   */
  get length() {
    return this.tasks.length;
  }

  /**
   * Get pending count
   */
  get pendingCount() {
    return this.getPending().length;
  }

  /**
   * Sort tasks by priority (highest first)
   */
  _sort() {
    this.tasks.sort((a, b) => {
      // First by status (pending first)
      if (a.status === TASK_STATUS.PENDING && b.status !== TASK_STATUS.PENDING) return -1;
      if (b.status === TASK_STATUS.PENDING && a.status !== TASK_STATUS.PENDING) return 1;
      // Then by priority
      return b.priority - a.priority;
    });
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      tasks: this.tasks.map(t => t.toObject()),
      completedTasks: this.completedTasks.map(t => t.toObject())
    };
  }

  /**
   * Load from plain object
   */
  static fromObject(obj) {
    const queue = new TaskQueue();
    queue.tasks = (obj.tasks || []).map(t => Task.fromObject(t));
    queue.completedTasks = (obj.completedTasks || []).map(t => Task.fromObject(t));
    return queue;
  }
}

/**
 * Save queue to markdown file
 */
export async function saveQueue(queue) {
  const md = `# BACKBONE Task Queue

**Last Updated**: ${new Date().toISOString()}
**Pending Tasks**: ${queue.pendingCount}
**Total in Queue**: ${queue.length}

---

## Pending Tasks

${queue.getPending().length > 0
    ? queue.getPending().map(t => formatTaskMd(t)).join("\n\n")
    : "_No pending tasks_"}

---

## Blocked Tasks

${queue.getBlocked().length > 0
    ? queue.getBlocked().map(t => formatTaskMd(t)).join("\n\n")
    : "_No blocked tasks_"}

---

## Recently Completed (Last 10)

${queue.completedTasks.slice(0, 10).length > 0
    ? queue.completedTasks.slice(0, 10).map(t => formatTaskMd(t, true)).join("\n\n")
    : "_No completed tasks_"}

---

## Queue Data (JSON)

\`\`\`json
${JSON.stringify(queue.toObject(), null, 2)}
\`\`\`
`;

  await fs.promises.writeFile(QUEUE_FILE, md, "utf-8");
  return true;
}

/**
 * Format a task for markdown display
 */
function formatTaskMd(task, completed = false) {
  const status = completed
    ? (task.status === TASK_STATUS.COMPLETED ? "✅" : "❌")
    : (task.status === TASK_STATUS.BLOCKED ? "🚫" : "⬜");

  return `### ${status} ${task.title}
- **ID**: \`${task.id}\`
- **Project**: ${task.project || "none"}
- **Priority**: ${task.priority}
- **Type**: ${task.type}
- **Status**: ${task.status}
- **Created**: ${task.createdAt}
${task.startedAt ? `- **Started**: ${task.startedAt}` : ""}
${task.completedAt ? `- **Completed**: ${task.completedAt}` : ""}
${task.blockedReason ? `- **Blocked**: ${task.blockedReason}` : ""}
${task.description ? `\n${task.description}` : ""}`;
}

/**
 * Load queue from markdown file
 */
export async function loadQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) {
      return new TaskQueue();
    }

    const md = await fs.promises.readFile(QUEUE_FILE, "utf-8");

    // Extract JSON from markdown
    const jsonMatch = md.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[1]);
      return TaskQueue.fromObject(data);
    }

    return new TaskQueue();
  } catch (error) {
    console.error("[TaskQueue] Failed to load queue:", error.message);
    return new TaskQueue();
  }
}

// Singleton instance
let _queue = null;

/**
 * Get the global task queue instance
 */
export async function getTaskQueue() {
  if (!_queue) {
    _queue = await loadQueue();
  }
  return _queue;
}

/**
 * Save the global task queue
 */
export async function saveTaskQueue() {
  if (_queue) {
    await saveQueue(_queue);
  }
}
