#!/usr/bin/env node
/**
 * Autonomous Engine CLI
 *
 * Start, stop, and monitor the autonomous engine.
 *
 * Usage:
 *   node tools/autonomous-engine.js start    # Start the engine
 *   node tools/autonomous-engine.js stop     # Stop the engine
 *   node tools/autonomous-engine.js status   # Check status
 *   node tools/autonomous-engine.js pause    # Pause the engine
 *   node tools/autonomous-engine.js resume   # Resume the engine
 */

import { getAutonomousLoop } from "../src/services/engine/autonomous-loop.js";
import { getTaskQueue, saveTaskQueue, Task, PRIORITY } from "../src/services/engine/task-queue.js";

const args = process.argv.slice(2);
const command = args[0] || "status";

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           BACKBONE AUTONOMOUS ENGINE                          ║
╠══════════════════════════════════════════════════════════════╣
║  A continuously running, self-improving AI system             ║
║  Think → Research → Plan → Execute → Test → Reflect → Repeat  ║
╚══════════════════════════════════════════════════════════════╝
`);

  const loop = await getAutonomousLoop();

  switch (command) {
    case "start":
      await startEngine(loop);
      break;

    case "stop":
      await stopEngine(loop);
      break;

    case "status":
      showStatus(loop);
      break;

    case "pause":
      loop.pause();
      console.log("✋ Engine paused");
      break;

    case "resume":
      loop.resume();
      console.log("▶️  Engine resumed");
      break;

    case "add-task":
      await addTask(args.slice(1));
      break;

    case "queue":
      await showQueue();
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log(`
Commands:
  start   - Start the autonomous engine
  stop    - Stop the engine gracefully
  status  - Show current engine status
  pause   - Pause execution (keep running)
  resume  - Resume from pause
  queue   - Show task queue
  add-task <title> - Add a task to the queue
`);
  }
}

async function startEngine(loop) {
  console.log("🚀 Starting autonomous engine...\n");

  // Set up event listeners
  loop.on("started", ({ sessionId }) => {
    console.log(`✅ Engine started (session: ${sessionId})`);
  });

  loop.on("thinking", () => {
    console.log("🤔 Thinking...");
  });

  loop.on("researching", ({ task }) => {
    console.log(`🔍 Researching: ${task.title}`);
  });

  loop.on("planning", ({ task }) => {
    console.log(`📝 Planning: ${task.title}`);
  });

  loop.on("executing", ({ task }) => {
    console.log(`⚡ Executing: ${task.title}`);
  });

  loop.on("building", ({ task }) => {
    console.log(`🔨 Building: ${task.title}`);
  });

  loop.on("testing", ({ task }) => {
    console.log(`🧪 Testing: ${task.title}`);
  });

  loop.on("reflecting", () => {
    console.log("💭 Reflecting on progress...");
  });

  loop.on("taskCompleted", ({ task, result }) => {
    console.log(`✅ Completed: ${task.title}`);
  });

  loop.on("taskFailed", ({ task, error }) => {
    console.log(`❌ Failed: ${task.title} - ${error.message}`);
  });

  loop.on("error", ({ error }) => {
    console.log(`⚠️  Error: ${error.message}`);
  });

  loop.on("paused", () => {
    console.log("⏸️  Engine paused");
  });

  loop.on("resumed", () => {
    console.log("▶️  Engine resumed");
  });

  loop.on("stopped", () => {
    console.log("🛑 Engine stopped");
    process.exit(0);
  });

  // Handle shutdown signals
  process.on("SIGINT", async () => {
    console.log("\n\n🛑 Shutting down gracefully...");
    await loop.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n\n🛑 Received SIGTERM, shutting down...");
    await loop.stop();
    process.exit(0);
  });

  // Start the loop (blocks until stopped)
  await loop.start();
}

async function stopEngine(loop) {
  if (!loop.running) {
    console.log("Engine is not running");
    return;
  }

  console.log("🛑 Stopping engine...");
  await loop.stop();
  console.log("✅ Engine stopped");
}

function showStatus(loop) {
  const status = loop.getStatus();

  console.log("ENGINE STATUS");
  console.log("─".repeat(40));
  console.log(`Running:     ${status.running ? "✅ Yes" : "❌ No"}`);
  console.log(`Paused:      ${status.paused ? "⏸️  Yes" : "No"}`);
  console.log(`Status:      ${status.status}`);
  console.log(`Queue:       ${status.queueLength} tasks`);
  console.log(`Errors:      ${status.consecutiveErrors}`);

  if (status.currentTask) {
    console.log(`\nCURRENT TASK`);
    console.log("─".repeat(40));
    console.log(`Title:       ${status.currentTask.title}`);
    console.log(`Project:     ${status.currentTask.project || "none"}`);
    console.log(`Started:     ${status.currentTask.started || "not started"}`);
  }

  if (status.session?.id) {
    console.log(`\nSESSION`);
    console.log("─".repeat(40));
    console.log(`ID:          ${status.session.id}`);
    console.log(`Started:     ${status.session.started}`);
    console.log(`Completed:   ${status.session.tasksCompleted} tasks`);
  }
}

async function addTask(taskArgs) {
  if (taskArgs.length === 0) {
    console.log("Usage: add-task <title> [--priority <0-100>] [--project <name>]");
    return;
  }

  const queue = await getTaskQueue();

  // Parse args
  let title = "";
  let priority = PRIORITY.NORMAL;
  let project = null;

  for (let i = 0; i < taskArgs.length; i++) {
    if (taskArgs[i] === "--priority" && taskArgs[i + 1]) {
      priority = parseInt(taskArgs[i + 1]);
      i++;
    } else if (taskArgs[i] === "--project" && taskArgs[i + 1]) {
      project = taskArgs[i + 1];
      i++;
    } else {
      title += (title ? " " : "") + taskArgs[i];
    }
  }

  const task = queue.add(new Task({
    title,
    priority,
    project
  }));

  if (task) {
    await saveTaskQueue();
    console.log(`✅ Added task: ${task.title}`);
    console.log(`   ID: ${task.id}`);
    console.log(`   Priority: ${task.priority}`);
    console.log(`   Project: ${task.project || "none"}`);
  } else {
    console.log("❌ Failed to add task (may be duplicate)");
  }
}

async function showQueue() {
  const queue = await getTaskQueue();

  console.log("TASK QUEUE");
  console.log("─".repeat(60));
  console.log(`Total: ${queue.length} | Pending: ${queue.pendingCount}`);
  console.log("");

  const pending = queue.getPending();
  if (pending.length > 0) {
    console.log("PENDING:");
    pending.forEach((t, i) => {
      console.log(`  ${i + 1}. [${t.priority}] ${t.title}`);
      if (t.project) console.log(`     └─ Project: ${t.project}`);
    });
  } else {
    console.log("No pending tasks");
  }

  const blocked = queue.getBlocked();
  if (blocked.length > 0) {
    console.log("\nBLOCKED:");
    blocked.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.title}`);
      console.log(`     └─ Reason: ${t.blockedReason}`);
    });
  }

  console.log("");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
