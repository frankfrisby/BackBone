/**
 * Task Executor — Lightweight task execution WITHOUT the goal system.
 *
 * For work items that need Claude Code execution but don't need milestones,
 * progress tracking, or the full goal lifecycle. Examples:
 *   - "research blue birds"
 *   - "find information on my wife online"
 *   - "summarize this article"
 *
 * Tasks are: created → executing → done (or failed).
 * No milestones. No progress %. No thinking engine integration.
 * Just do the work, deliver the result, close.
 */

import fs from "fs";
import path from "path";
import { getDataDir, getProjectsDir, getMemoryDir } from "../paths.js";

const TAG = "[TaskExecutor]";
const TASKS_PATH = path.join(getDataDir(), "active-tasks.json");

// Task status
export const TASK_STATUS = {
  PENDING: "pending",
  EXECUTING: "executing",
  DONE: "done",
  FAILED: "failed",
};

// ── Persistence ──────────────────────────────────────────────

function loadTasks() {
  try {
    if (fs.existsSync(TASKS_PATH)) {
      return JSON.parse(fs.readFileSync(TASKS_PATH, "utf-8"));
    }
  } catch {}
  return [];
}

function saveTasks(tasks) {
  try {
    const dir = path.dirname(TASKS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep last 50 tasks (including completed) for history
    fs.writeFileSync(TASKS_PATH, JSON.stringify(tasks.slice(-50), null, 2));
  } catch (err) {
    console.error(`${TAG} Save failed:`, err.message);
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Create a lightweight task record.
 * @param {object} opts
 * @param {string} opts.title - What to do
 * @param {string} opts.originalMessage - Verbatim user request
 * @param {string} opts.source - "whatsapp" | "dashboard" | "engine"
 * @param {string} opts.from - Sender identifier
 * @param {string} opts.deliveryAction - "whatsapp" | "email" | "document"
 * @param {string} opts.category - "personal" | "finance" | "health" | etc.
 * @returns {object} The created task
 */
export function createTask(opts = {}) {
  const tasks = loadTasks();

  const task = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: opts.title || "Untitled task",
    originalMessage: opts.originalMessage || opts.title,
    source: opts.source || "unknown",
    from: opts.from || null,
    deliveryAction: opts.deliveryAction || "whatsapp",
    category: opts.category || "personal",
    status: TASK_STATUS.PENDING,
    createdAt: new Date().toISOString(),
    result: null,
    error: null,
  };

  tasks.push(task);
  saveTasks(tasks);
  console.log(`${TAG} Created task: "${task.title}" (${task.id})`);
  return task;
}

/**
 * Get a task by ID.
 */
export function getTask(taskId) {
  return loadTasks().find(t => t.id === taskId) || null;
}

/**
 * Get pending tasks (not yet executed).
 */
export function getPendingTasks() {
  return loadTasks().filter(t => t.status === TASK_STATUS.PENDING);
}

/**
 * Update task status.
 */
export function updateTask(taskId, updates) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  saveTasks(tasks);
  return task;
}

/**
 * Execute a task via Claude Code CLI.
 * Builds a focused prompt with user context, runs Claude, delivers result.
 *
 * @param {object} task - The task object from createTask()
 * @param {object} userContext - Context from engine.getContext()
 * @returns {Promise<{success: boolean, result?: string, error?: string}>}
 */
export async function executeTask(task, userContext = {}) {
  if (!task) return { success: false, error: "No task provided" };

  updateTask(task.id, { status: TASK_STATUS.EXECUTING });
  console.log(`${TAG} Executing: "${task.title}"`);

  try {
    // Build a lean prompt — no milestones, no completion criteria, just DO IT
    const prompt = buildTaskPrompt(task, userContext);

    // Use Claude Code CLI
    const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");
    const result = await runClaudeCodePrompt(prompt, {
      workDir: process.cwd(),
      timeout: 5 * 60 * 1000, // 5 min max for a task (not a goal)
    });

    const output = result?.output || result?.response || result || "";

    // Save findings to project dir
    const projectName = task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    try {
      const projectDir = path.join(getProjectsDir(), projectName);
      if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, "findings.md"),
        `# ${task.title}\n\n*Task completed: ${new Date().toISOString()}*\n\n${output}`
      );
    } catch {}

    updateTask(task.id, { status: TASK_STATUS.DONE, result: output.slice(0, 5000) });

    // Deliver result
    await deliverTaskResult(task, output);

    return { success: true, result: output };
  } catch (err) {
    console.error(`${TAG} Execution failed:`, err.message);
    updateTask(task.id, { status: TASK_STATUS.FAILED, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Build a focused prompt for task execution.
 * Lighter than goal prompts — no milestones, no completion criteria.
 */
function buildTaskPrompt(task, ctx = {}) {
  const sections = [];

  // User identity
  if (ctx.profile && ctx.profile.length > 20) {
    sections.push(`WHO THE USER IS:\n${ctx.profile.slice(0, 800)}`);
  }
  if (ctx.family && ctx.family.length > 20) {
    sections.push(`USER'S FAMILY:\n${ctx.family.slice(0, 800)}`);
  }
  if (ctx.conversations && ctx.conversations.length > 20) {
    sections.push(`RECENT CONTEXT:\n${ctx.conversations.slice(0, 1000)}`);
  }

  const contextBlock = sections.length > 0
    ? `USER CONTEXT:\n${sections.join("\n\n")}\n\n`
    : "";

  return `You are BACKBONE, a personal AI assistant. The user asked you to do something. Do it now.

TASK: "${task.title}"

USER'S EXACT WORDS: "${task.originalMessage}"

${contextBlock}INSTRUCTIONS:
- This is a TASK, not a long-term goal. Just do the work and report back.
- Use WebSearch and WebFetch to find information online.
- Use Read/Write to save findings.
- Be thorough but fast — this should take minutes, not hours.
- When done, write a clear summary of what you found or did.
- Save results to: projects/${task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}/findings.md

Do the work now.`;
}

/**
 * Deliver task result to the user via their preferred channel.
 */
async function deliverTaskResult(task, output) {
  if (!output || output.length < 10) return;

  try {
    const { sendWhatsApp } = await import("../messaging/proactive-outreach.js");

    // Condense output for WhatsApp
    let message;
    if (output.length < 1200) {
      message = `*Done: ${task.title}*\n\n${output}`;
    } else {
      // Use AI to condense
      try {
        const { sendMessage } = await import("../ai/multi-ai.js");
        const condensed = await sendMessage(
          `Condense this into a brief WhatsApp message (under 1000 chars). Use *bold* for key points. Start with a brief "Here's what I found:" intro.\n\n${output.slice(0, 3000)}`,
          {}, "instant"
        );
        message = `*Done: ${task.title}*\n\n${condensed?.response || condensed?.text || output.slice(0, 1000)}`;
      } catch {
        message = `*Done: ${task.title}*\n\n${output.slice(0, 1000)}`;
      }
    }

    // Deliver via WhatsApp (or email if specified)
    if (task.deliveryAction === "email") {
      try {
        const { callTool } = await import("../mcp-direct.js");
        await callTool("backbone-google", "draft_email", {
          to: task.from || "",
          subject: `BACKBONE: ${task.title}`,
          body: output.slice(0, 5000),
          reason: `Task result delivery for: ${task.title}`,
        });
        await sendWhatsApp(`Done with "${task.title}" — I've drafted an email with the results.`, {
          type: "outcome",
          skipDedup: true,
        });
      } catch {
        await sendWhatsApp(message, { type: "outcome", skipDedup: true });
      }
    } else {
      await sendWhatsApp(message, { type: "outcome", skipDedup: true });
    }
  } catch (err) {
    console.error(`${TAG} Delivery failed:`, err.message);
  }
}

export default {
  createTask,
  getTask,
  getPendingTasks,
  updateTask,
  executeTask,
  TASK_STATUS,
};
