import { EventEmitter } from "events";

import { getBudgetGuard } from "./budget-guard.js";
import { getChangeJournal } from "./change-journal.js";

function sortJobs(a, b) {
  const pa = Number.isFinite(a.priority) ? a.priority : 5;
  const pb = Number.isFinite(b.priority) ? b.priority : 5;
  if (pa !== pb) return pa - pb;
  return (a.createdAtMs || 0) - (b.createdAtMs || 0);
}

function normalizeJob(job = {}) {
  const priorityClass = job.priorityClass === "user" ? "user" : "background";
  return {
    id: job.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: job.kind || "background_exec",
    domain: job.domain || "general",
    source: job.source || "unknown",
    priorityClass,
    priority: Number.isFinite(job.priority) ? job.priority : (priorityClass === "user" ? 1 : 5),
    preemptible: !!job.preemptible,
    checkpointable: !!job.checkpointable,
    estimatedTokens: Math.max(0, Number(job.estimatedTokens) || 0),
    dedupeKey: job.dedupeKey || null,
    payload: job.payload || {},
    run: typeof job.run === "function" ? job.run : null,
    createdAt: job.createdAt || new Date().toISOString(),
    createdAtMs: job.createdAt ? new Date(job.createdAt).getTime() : Date.now(),
    resumeToken: job.resumeToken || null,
    state: job.state || "queued",
    attempts: Number.isFinite(job.attempts) ? job.attempts : 0,
    maxAttempts: Number.isFinite(job.maxAttempts) ? job.maxAttempts : 3,
    labels: job.labels || {},
  };
}

export class WorkDispatcher extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.budget = opts.budget || getBudgetGuard();
    this.journal = opts.journal || getChangeJournal();
    this.executeJob = opts.executeJob || (async (job, ctx) => {
      if (!job.run) return { success: false, error: "No run handler" };
      return await job.run(ctx);
    });
    this.onUserPriorityStart = opts.onUserPriorityStart || null;
    this.onUserPriorityEnd = opts.onUserPriorityEnd || null;
    this.userHoldMs = Number.isFinite(opts.userHoldMs) ? opts.userHoldMs : 120_000;

    this.userQueue = [];
    this.backgroundQueue = [];
    this.runningUserJob = null;
    this.runningBackgroundJob = null;
    this.userPriorityDepth = 0;
    this.userPriorityUntil = 0;
    this.running = false;

    this._draining = false;
    this._drainScheduled = false;
    this._activeDedupe = new Set();
    this._priorityHoldTimer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.emit("started");
    this._scheduleDrain();
  }

  stop() {
    this.running = false;
    if (this._priorityHoldTimer) clearTimeout(this._priorityHoldTimer);
    this._priorityHoldTimer = null;
    this.emit("stopped");
  }

  _schedulePriorityExpiryDrain() {
    if (this._priorityHoldTimer) {
      clearTimeout(this._priorityHoldTimer);
      this._priorityHoldTimer = null;
    }
    if (!this.running || !this.userPriorityUntil) return;
    const delay = Math.max(0, this.userPriorityUntil - Date.now()) + 5;
    this._priorityHoldTimer = setTimeout(() => {
      this._priorityHoldTimer = null;
      this._scheduleDrain();
    }, delay);
    if (typeof this._priorityHoldTimer.unref === "function") this._priorityHoldTimer.unref();
  }

  _emitQueueSignal(reason = "queue") {
    try {
      this.journal.emitChange("queue", reason, {
        userQueued: this.userQueue.length,
        backgroundQueued: this.backgroundQueue.length,
        userPriorityDepth: this.userPriorityDepth,
        userPriorityUntil: this.userPriorityUntil || null,
      }, { source: "dispatcher" });
    } catch {}
  }

  _hasDuplicate(job) {
    if (!job.dedupeKey) return false;
    if (this._activeDedupe.has(job.dedupeKey)) return true;
    return this.userQueue.some(j => j.dedupeKey === job.dedupeKey) ||
      this.backgroundQueue.some(j => j.dedupeKey === job.dedupeKey);
  }

  enqueue(jobInput) {
    const job = normalizeJob(jobInput);
    if (this._hasDuplicate(job)) {
      return { accepted: false, duplicate: true, job };
    }
    if (job.dedupeKey) this._activeDedupe.add(job.dedupeKey);
    if (job.priorityClass === "user") {
      this.userQueue.push(job);
      this.userQueue.sort(sortJobs);
    } else {
      this.backgroundQueue.push(job);
      this.backgroundQueue.sort(sortJobs);
    }
    this.emit("job-queued", { job });
    this._emitQueueSignal("job-queued");
    this._scheduleDrain();
    return { accepted: true, job };
  }

  noteUserActivity(reason = "user-activity", opts = {}) {
    const holdMs = Number.isFinite(opts.holdMs) ? opts.holdMs : this.userHoldMs;
    this.userPriorityUntil = Math.max(this.userPriorityUntil || 0, Date.now() + holdMs);
    this.emit("user-activity", { reason, holdMs, until: this.userPriorityUntil });
    if (this.onUserPriorityStart) {
      try { this.onUserPriorityStart({ reason, passive: true, until: this.userPriorityUntil }); } catch {}
    }
    this._emitQueueSignal("user-activity");
    this._schedulePriorityExpiryDrain();
    this._scheduleDrain();
  }

  async withUserPriority(label, fn, opts = {}) {
    this.userPriorityDepth += 1;
    this.userPriorityUntil = Math.max(this.userPriorityUntil || 0, Date.now() + (opts.holdMs || this.userHoldMs));
    this.emit("user-priority-start", { label, depth: this.userPriorityDepth });
    if (this.onUserPriorityStart) {
      try { this.onUserPriorityStart({ reason: label || "user-work", passive: false, until: this.userPriorityUntil }); } catch {}
    }
    this._emitQueueSignal("user-priority-start");
    this._schedulePriorityExpiryDrain();
    this._scheduleDrain();
    try {
      return await fn();
    } finally {
      this.userPriorityDepth = Math.max(0, this.userPriorityDepth - 1);
      this.userPriorityUntil = Math.max(this.userPriorityUntil || 0, Date.now() + (opts.holdMs || this.userHoldMs));
      this.emit("user-priority-end", { label, depth: this.userPriorityDepth });
      if (this.onUserPriorityEnd) {
        try { this.onUserPriorityEnd({ reason: label || "user-work" }); } catch {}
      }
      this._emitQueueSignal("user-priority-end");
      this._schedulePriorityExpiryDrain();
      this._scheduleDrain();
    }
  }

  _isUserPriorityActive() {
    return this.userPriorityDepth > 0 || (this.userPriorityUntil && Date.now() < this.userPriorityUntil);
  }

  _scheduleDrain() {
    if (!this.running || this._drainScheduled) return;
    this._drainScheduled = true;
    setTimeout(() => {
      this._drainScheduled = false;
      this._drain().catch(() => {});
    }, 0);
  }

  async _drain() {
    if (!this.running || this._draining) return;
    this._draining = true;
    try {
      while (this.running) {
        if (this.runningUserJob || this.runningBackgroundJob) break;

        if (this.userQueue.length > 0) {
          const job = this.userQueue.shift();
          await this._runJob(job);
          continue;
        }

        if (this._isUserPriorityActive()) break;

        if (this.backgroundQueue.length > 0) {
          const job = this.backgroundQueue.shift();
          await this._runJob(job);
          continue;
        }

        break;
      }
    } finally {
      this._draining = false;
    }
  }

  async _runJob(job) {
    job.state = "running";
    job.startedAt = new Date().toISOString();
    const isUser = job.priorityClass === "user";
    if (isUser) this.runningUserJob = job;
    else this.runningBackgroundJob = job;
    this.emit("job-started", { job });
    this._emitQueueSignal("job-started");

    const budgetReservation = isUser ? { ok: true } : this.budget.reserve(job.id, "background", job.estimatedTokens || 0);
    if (!budgetReservation.ok) {
      job.state = "skipped_budget";
      job.finishedAt = new Date().toISOString();
      this.emit("job-skipped", { job, reason: budgetReservation.reason });
      if (job.dedupeKey) this._activeDedupe.delete(job.dedupeKey);
      this.runningBackgroundJob = null;
      this._emitQueueSignal("job-skipped");
      return;
    }

    const context = {
      job,
      shouldYield: () => job.preemptible && this._isUserPriorityActive(),
      checkpoint: async (label = "checkpoint") => {
        if (!job.preemptible) return { yielded: false };
        return { yielded: this._isUserPriorityActive(), label };
      },
      dispatcher: this,
    };

    try {
      const result = await this.executeJob(job, context);
      const yielded = !!result?.yielded;
      const resumeToken = result?.resumeToken || null;
      const usage = result?.usage || {};

      if (yielded && job.preemptible) {
        job.state = "paused";
        job.resumeToken = resumeToken;
        job.attempts += 1;
        job.startedAt = null;
        job.finishedAt = null;
        job.pauseRequestedAt = new Date().toISOString();
        if (isUser) {
          job.state = "failed";
          this.emit("job-failed", { job, error: "user job yielded unexpectedly" });
        } else {
          this.backgroundQueue.push(job);
          this.backgroundQueue.sort(sortJobs);
          this.emit("job-paused", { job });
        }
        this.budget.recordUsage(job.id, usage);
      } else {
        job.state = result?.success === false ? "failed" : "done";
        job.finishedAt = new Date().toISOString();
        this.budget.recordUsage(job.id, usage);
        if (job.state === "done") this.emit("job-completed", { job, result });
        else this.emit("job-failed", { job, result, error: result?.error || "Job failed" });
      }
    } catch (err) {
      job.state = "failed";
      job.finishedAt = new Date().toISOString();
      this.budget.recordUsage(job.id, {});
      this.emit("job-failed", { job, error: err.message });
    } finally {
      if (job.dedupeKey && job.state !== "paused") this._activeDedupe.delete(job.dedupeKey);
      if (isUser) this.runningUserJob = null;
      else this.runningBackgroundJob = null;
      try {
        this.journal.emitChange("runtime", "job-state", {
          id: job.id,
          kind: job.kind,
          domain: job.domain,
          state: job.state,
          priorityClass: job.priorityClass,
        }, { source: "dispatcher" });
      } catch {}
      this._emitQueueSignal("job-finished");
      this._scheduleDrain();
    }
  }

  getQueues() {
    return {
      user: this.userQueue.map(j => ({ id: j.id, kind: j.kind, domain: j.domain, state: j.state, priority: j.priority })),
      background: this.backgroundQueue.map(j => ({ id: j.id, kind: j.kind, domain: j.domain, state: j.state, priority: j.priority })),
    };
  }

  getStatus() {
    return {
      running: this.running,
      userPriorityDepth: this.userPriorityDepth,
      userPriorityUntil: this.userPriorityUntil || null,
      userPriorityActive: this._isUserPriorityActive(),
      runningUserJob: this.runningUserJob ? { id: this.runningUserJob.id, kind: this.runningUserJob.kind } : null,
      runningBackgroundJob: this.runningBackgroundJob ? { id: this.runningBackgroundJob.id, kind: this.runningBackgroundJob.kind } : null,
      queues: this.getQueues(),
      budget: this.budget.getStatus(),
    };
  }
}

let _dispatcher;
export function getWorkDispatcher(opts) {
  if (!_dispatcher) _dispatcher = new WorkDispatcher(opts);
  return _dispatcher;
}

export default { WorkDispatcher, getWorkDispatcher };
