/**
 * Parallel Agents Manager
 *
 * Runs 1-5 Claude Code agents simultaneously, each with a distinct task.
 * Tracks progress, streams output, and reports results for all agents.
 *
 * Usage:
 *   const manager = getParallelAgentsManager();
 *   const session = await manager.runParallel([
 *     { name: "Research NVDA", task: "Research NVDA earnings and catalysts" },
 *     { name: "Update Portfolio", task: "Analyze current portfolio and suggest rebalancing" },
 *     { name: "Health Review", task: "Summarize this week's Oura data and suggest improvements" },
 *   ]);
 *
 * API:
 *   GET  /api/agents/status      — Current session status + per-agent progress
 *   POST /api/agents/run         — Start a parallel session { tasks: [...] }
 *   POST /api/agents/stop        — Stop all running agents
 *   POST /api/agents/stop/:id    — Stop a specific agent
 */

import { EventEmitter } from "events";
import { runClaudeCodeStreaming, getClaudeCodeStatus } from "./claude-code-cli.js";
import { getBackboneRoot } from "../paths.js";

const TAG = "[ParallelAgents]";

// Limits
const MAX_CONCURRENT_AGENTS = 5;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per agent

/**
 * Agent states
 */
export const AGENT_STATE = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  STOPPED: "stopped",
  TIMEOUT: "timeout"
};

/**
 * Single agent tracker
 */
class AgentRunner {
  constructor(id, { name, task, timeout, model }) {
    this.id = id;
    this.name = name || `Agent-${id}`;
    this.task = task;
    this.timeout = timeout || DEFAULT_TIMEOUT_MS;
    this.model = model || null; // null = use default
    this.state = AGENT_STATE.PENDING;
    this.startedAt = null;
    this.completedAt = null;
    this.output = "";
    this.toolCalls = [];
    this.lastActivity = null;
    this.lastActivityText = "";
    this.error = null;
    this.emitter = null; // EventEmitter from Claude streaming
    this._aborted = false;
  }

  /**
   * Run this agent. Returns a promise that resolves when the agent finishes.
   */
  async run(onEvent) {
    this.state = AGENT_STATE.RUNNING;
    this.startedAt = Date.now();
    this.lastActivity = Date.now();

    const prompt = `You are an autonomous BACKBONE agent running in parallel with other agents. Your specific task:

TASK: ${this.task}

INSTRUCTIONS:
- Work autonomously — do not ask for user input
- Use web search, file reads, MCP tools — whatever is needed
- Be thorough but efficient — other agents are running simultaneously
- Write your final findings/results clearly at the end
- If you create or modify files, mention which files
- Stay focused on YOUR task only`;

    return new Promise(async (resolve) => {
      try {
        this.emitter = await runClaudeCodeStreaming(prompt, {
          cwd: getBackboneRoot(),
          timeout: this.timeout,
          ...(this.model ? { model: this.model } : {})
        });

        this.emitter.on("data", (text) => {
          if (this._aborted) return;
          this.output += text;
          this.lastActivity = Date.now();
          // Extract a short activity summary from the last line
          const lines = text.split("\n").filter(l => l.trim());
          if (lines.length > 0) {
            this.lastActivityText = lines[lines.length - 1].slice(0, 120);
          }
          if (onEvent) onEvent({ agentId: this.id, type: "data", text });
        });

        this.emitter.on("tool", (tool) => {
          if (this._aborted) return;
          this.toolCalls.push({ ...tool, timestamp: Date.now() });
          this.lastActivity = Date.now();
          this.lastActivityText = `[Tool] ${tool.tool}: ${(tool.input || "").slice(0, 80)}`;
          if (onEvent) onEvent({ agentId: this.id, type: "tool", tool });
        });

        this.emitter.on("complete", (result) => {
          if (this._aborted) return;
          this.completedAt = Date.now();
          this.state = result.success ? AGENT_STATE.COMPLETED : AGENT_STATE.FAILED;
          if (result.output) this.output = result.output;
          if (!result.success) this.error = result.error || "Unknown error";
          if (onEvent) onEvent({ agentId: this.id, type: "complete", result });
          resolve(this.getStatus());
        });

        this.emitter.on("error", (err) => {
          if (this._aborted) return;
          this.completedAt = Date.now();
          this.state = AGENT_STATE.FAILED;
          this.error = err.error || err.message || "Unknown error";
          if (onEvent) onEvent({ agentId: this.id, type: "error", error: this.error });
          resolve(this.getStatus());
        });

        // Safety timeout (in case emitter doesn't fire complete/error)
        setTimeout(() => {
          if (this.state === AGENT_STATE.RUNNING) {
            this.stop("timeout");
            resolve(this.getStatus());
          }
        }, this.timeout + 5000);

      } catch (err) {
        this.completedAt = Date.now();
        this.state = AGENT_STATE.FAILED;
        this.error = err.message || "Failed to start agent";
        if (onEvent) onEvent({ agentId: this.id, type: "error", error: this.error });
        resolve(this.getStatus());
      }
    });
  }

  /**
   * Stop this agent
   */
  stop(reason = "user") {
    this._aborted = true;
    if (this.emitter?.abort) {
      try { this.emitter.abort(); } catch {}
    }
    if (this.state === AGENT_STATE.RUNNING) {
      this.completedAt = Date.now();
      this.state = reason === "timeout" ? AGENT_STATE.TIMEOUT : AGENT_STATE.STOPPED;
      this.error = reason === "timeout" ? "Agent timed out" : "Stopped by user";
    }
  }

  /**
   * Get compact status for this agent
   */
  getStatus() {
    const elapsed = this.startedAt
      ? (this.completedAt || Date.now()) - this.startedAt
      : 0;

    return {
      id: this.id,
      name: this.name,
      task: this.task.slice(0, 200),
      state: this.state,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      completedAt: this.completedAt ? new Date(this.completedAt).toISOString() : null,
      elapsedMs: elapsed,
      elapsedFormatted: formatDuration(elapsed),
      toolCallCount: this.toolCalls.length,
      lastActivity: this.lastActivityText.slice(0, 120),
      outputLength: this.output.length,
      // Only include output summary in status (full output via separate call)
      outputPreview: this.output.slice(-500),
      error: this.error
    };
  }

  /**
   * Get full output
   */
  getFullOutput() {
    return {
      id: this.id,
      name: this.name,
      output: this.output,
      toolCalls: this.toolCalls,
      state: this.state,
      error: this.error
    };
  }
}

/**
 * Parallel Agents Manager — singleton
 */
class ParallelAgentsManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = []; // history of sessions
    this.activeSession = null;
  }

  /**
   * Run multiple agents in parallel
   *
   * @param {Array<{name: string, task: string, timeout?: number, model?: string}>} tasks
   * @returns {Promise<Object>} Session result with all agent statuses
   */
  async runParallel(tasks, options = {}) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { success: false, error: "No tasks provided" };
    }
    if (tasks.length > MAX_CONCURRENT_AGENTS) {
      return { success: false, error: `Maximum ${MAX_CONCURRENT_AGENTS} concurrent agents allowed` };
    }

    // Check if another session is running
    if (this.activeSession?.state === "running") {
      return { success: false, error: "A parallel session is already running. Stop it first." };
    }

    // Verify Claude Code is ready
    const status = await getClaudeCodeStatus();
    if (!status.ready) {
      return {
        success: false,
        error: status.installed ? "Claude Code not logged in" : "Claude Code not installed"
      };
    }

    // Create session
    const sessionId = `par_${Date.now()}`;
    const session = {
      id: sessionId,
      state: "running",
      startedAt: Date.now(),
      completedAt: null,
      agents: [],
      results: []
    };

    // Create agent runners
    const runners = tasks.map((t, i) => {
      const runner = new AgentRunner(`${sessionId}_agent_${i}`, {
        name: t.name || `Agent ${i + 1}`,
        task: t.task,
        timeout: t.timeout || options.timeout || DEFAULT_TIMEOUT_MS,
        model: t.model || options.model || null
      });
      session.agents.push(runner);
      return runner;
    });

    this.activeSession = session;
    this.sessions.push(session);

    // Keep only last 10 sessions
    if (this.sessions.length > 10) {
      this.sessions = this.sessions.slice(-10);
    }

    console.log(`${TAG} Starting parallel session ${sessionId} with ${runners.length} agents`);
    this.emit("session-started", { sessionId, agentCount: runners.length, tasks: tasks.map(t => t.name || t.task.slice(0, 60)) });

    // Event handler — forward per-agent events
    const onAgentEvent = (event) => {
      this.emit("agent-event", event);

      // Broadcast SSE event for dashboard
      if (event.type === "tool" || event.type === "complete" || event.type === "error") {
        this.emit("agent-progress", {
          sessionId,
          agentId: event.agentId,
          type: event.type,
          detail: event.type === "tool"
            ? event.tool?.tool
            : event.type === "complete"
              ? event.result?.success ? "completed" : "failed"
              : event.error
        });
      }
    };

    // Launch ALL agents concurrently
    const promises = runners.map(runner => runner.run(onAgentEvent));

    // Wait for all to complete
    const results = await Promise.allSettled(promises);

    session.state = "completed";
    session.completedAt = Date.now();
    session.results = results.map((r, i) => ({
      agentName: runners[i].name,
      status: r.status,
      ...(r.status === "fulfilled" ? r.value : { error: r.reason?.message || "Unknown error" })
    }));

    const succeeded = session.results.filter(r => r.state === AGENT_STATE.COMPLETED).length;
    const failed = session.results.filter(r => r.state === AGENT_STATE.FAILED || r.state === AGENT_STATE.TIMEOUT).length;

    console.log(`${TAG} Session ${sessionId} completed: ${succeeded} succeeded, ${failed} failed, ${Date.now() - session.startedAt}ms total`);

    this.emit("session-completed", {
      sessionId,
      succeeded,
      failed,
      totalMs: Date.now() - session.startedAt,
      results: session.results
    });

    // Clear active session reference (but keep in history)
    if (this.activeSession?.id === sessionId) {
      this.activeSession = session; // keep reference for status queries
    }

    return {
      success: true,
      sessionId,
      duration: Date.now() - session.startedAt,
      durationFormatted: formatDuration(Date.now() - session.startedAt),
      succeeded,
      failed,
      total: runners.length,
      results: session.results
    };
  }

  /**
   * Stop all running agents in the active session
   */
  stopAll() {
    if (!this.activeSession || this.activeSession.state !== "running") {
      return { success: false, error: "No active session to stop" };
    }

    let stopped = 0;
    for (const agent of this.activeSession.agents) {
      if (agent.state === AGENT_STATE.RUNNING) {
        agent.stop("user");
        stopped++;
      }
    }

    console.log(`${TAG} Stopped ${stopped} agents`);
    return { success: true, stopped };
  }

  /**
   * Stop a specific agent by ID
   */
  stopAgent(agentId) {
    if (!this.activeSession) {
      return { success: false, error: "No active session" };
    }

    const agent = this.activeSession.agents.find(a => a.id === agentId);
    if (!agent) {
      return { success: false, error: `Agent ${agentId} not found` };
    }

    if (agent.state !== AGENT_STATE.RUNNING) {
      return { success: false, error: `Agent ${agent.name} is not running (${agent.state})` };
    }

    agent.stop("user");
    return { success: true, agentName: agent.name };
  }

  /**
   * Get current session status
   */
  getStatus() {
    if (!this.activeSession) {
      return { active: false, lastSession: this.sessions.at(-1)?.id || null };
    }

    const session = this.activeSession;
    const agents = session.agents.map(a => a.getStatus());

    return {
      active: session.state === "running",
      sessionId: session.id,
      state: session.state,
      startedAt: new Date(session.startedAt).toISOString(),
      elapsed: formatDuration(Date.now() - session.startedAt),
      agents,
      summary: {
        total: agents.length,
        running: agents.filter(a => a.state === AGENT_STATE.RUNNING).length,
        completed: agents.filter(a => a.state === AGENT_STATE.COMPLETED).length,
        failed: agents.filter(a => a.state === AGENT_STATE.FAILED).length,
        stopped: agents.filter(a => a.state === AGENT_STATE.STOPPED).length,
      }
    };
  }

  /**
   * Get full output for a specific agent
   */
  getAgentOutput(agentId) {
    for (const session of [...this.sessions].reverse()) {
      const agent = session.agents.find(a => a.id === agentId);
      if (agent) return agent.getFullOutput();
    }
    return null;
  }

  /**
   * Get session history
   */
  getHistory() {
    return this.sessions.map(s => ({
      id: s.id,
      state: s.state,
      startedAt: new Date(s.startedAt).toISOString(),
      completedAt: s.completedAt ? new Date(s.completedAt).toISOString() : null,
      agentCount: s.agents.length,
      results: s.results?.map(r => ({
        name: r.agentName,
        state: r.state,
        error: r.error || null
      }))
    }));
  }
}

// Singleton
let managerInstance = null;
export function getParallelAgentsManager() {
  if (!managerInstance) {
    managerInstance = new ParallelAgentsManager();
  }
  return managerInstance;
}

/**
 * Format milliseconds into human-readable duration
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export default {
  getParallelAgentsManager,
  AGENT_STATE
};
