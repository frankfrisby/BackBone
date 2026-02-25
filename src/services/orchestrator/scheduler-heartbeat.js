import { EventEmitter } from "events";

import { getChangeJournal } from "./change-journal.js";
import { getWorkDispatcher } from "./work-dispatcher.js";
import { getBudgetGuard } from "./budget-guard.js";
import { evaluateDefaultHeartbeat } from "./evaluators/default-evaluator.js";

export class SchedulerHeartbeat extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.journal = opts.journal || getChangeJournal();
    this.dispatcher = opts.dispatcher || getWorkDispatcher();
    this.budget = opts.budget || getBudgetGuard();
    this.orchestrator = opts.orchestrator || null;
    this.evaluator = opts.evaluator || evaluateDefaultHeartbeat;
    this.intervalMs = Number.isFinite(opts.intervalMs) ? opts.intervalMs : Number.parseInt(process.env.BACKBONE_HEARTBEAT_INTERVAL_MS || "180000", 10);
    this.jitterMs = Number.isFinite(opts.jitterMs) ? opts.jitterMs : Number.parseInt(process.env.BACKBONE_HEARTBEAT_JITTER_MS || "15000", 10);
    this.maxEvalMs = Number.isFinite(opts.maxEvalMs) ? opts.maxEvalMs : Number.parseInt(process.env.BACKBONE_HEARTBEAT_MAX_EVAL_MS || "5000", 10);

    this.running = false;
    this.inTick = false;
    this.timer = null;
    this.lastSeenVersions = {};
    this.lastSeenSeq = 0;
    this.lastTickAt = null;
    this.nextTickAt = null;
    this.stats = {
      ticks: 0,
      skippedNoChange: 0,
      ticksWithActions: 0,
      errors: 0,
      lastReason: null,
      lastChangedDomains: [],
      lastObservations: [],
      avgTickMs: 0,
    };
    this._wakeTimer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const snapshot = this.journal.getSnapshot();
    this.lastSeenVersions = snapshot.versions || this.journal.getVersions();
    this.lastSeenSeq = Number(snapshot.seq || 0);
    this.emit("started");
    this._scheduleNextTick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    if (this._wakeTimer) clearTimeout(this._wakeTimer);
    this.timer = null;
    this._wakeTimer = null;
    this.emit("stopped");
  }

  _scheduleNextTick() {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    const jitter = this.jitterMs > 0 ? Math.floor(Math.random() * this.jitterMs) : 0;
    const delay = Math.max(250, this.intervalMs + jitter);
    this.nextTickAt = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.tick({ reason: "interval" }).catch(() => {}).finally(() => {
        this._scheduleNextTick();
      });
    }, delay);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  wake(reason = "external") {
    if (!this.running || this._wakeTimer) return;
    this._wakeTimer = setTimeout(() => {
      this._wakeTimer = null;
      this.tick({ reason: `wake:${reason}` }).catch(() => {});
    }, 25);
  }

  async tick({ reason = "manual" } = {}) {
    if (!this.running && reason !== "manual-test") return { skipped: true, reason: "not-running" };
    if (this.inTick) return { skipped: true, reason: "tick-in-progress" };

    this.inTick = true;
    const started = Date.now();
    this.stats.lastReason = reason;
    this.emit("tick:start", { reason });
    try {
      const journalSnapshot = this.journal.getSnapshot();
      const snapshot = journalSnapshot.versions || this.journal.getVersions();
      const currentSeq = Number(journalSnapshot.seq || 0);
      const changedDomains = this.journal.diffVersions(this.lastSeenVersions);
      const recentEvents = currentSeq > this.lastSeenSeq ? this.journal.getEventsSinceSeq(this.lastSeenSeq, 100) : [];
      const queueStatus = this.dispatcher.getStatus();
      const hasQueues = queueStatus.queues.user.length > 0 || queueStatus.queues.background.length > 0;
      const hasReservations = Object.keys(this.budget.getStatus().reservations || {}).length > 0;
      const shouldCheck = changedDomains.length > 0 || recentEvents.length > 0 || hasQueues || hasReservations;

      if (!shouldCheck) {
        this.stats.ticks += 1;
        this.stats.skippedNoChange += 1;
        this.stats.lastChangedDomains = [];
        this.stats.lastObservations = [];
        this.lastTickAt = new Date().toISOString();
        this.emit("tick:skip", { reason: "no-change", tickReason: reason });
        return { skipped: true, reason: "no-change" };
      }

      const evalDeadline = started + this.maxEvalMs;
      const evalResult = await this.evaluator({
        changedDomains,
        snapshot,
        dispatcher: this.dispatcher,
        budget: this.budget,
        journal: this.journal,
        orchestrator: this.orchestrator,
        evalDeadline,
        recentEvents,
      });

      const jobs = Array.isArray(evalResult?.jobs) ? evalResult.jobs : [];
      const observations = Array.isArray(evalResult?.observations) ? evalResult.observations : [];
      let enqueued = 0;
      for (const job of jobs) {
        const result = this.dispatcher.enqueue(job);
        if (result?.accepted) enqueued++;
      }

      this.lastSeenVersions = snapshot;
      this.lastSeenSeq = currentSeq;
      this.stats.ticks += 1;
      if (enqueued > 0) this.stats.ticksWithActions += 1;
      this.stats.lastChangedDomains = changedDomains;
      this.stats.lastObservations = observations;
      this.lastTickAt = new Date().toISOString();
      this.emit("tick:jobs", { reason, changedDomains, enqueued, observations });
      return { skipped: false, changedDomains, enqueued, observations };
    } catch (err) {
      this.stats.ticks += 1;
      this.stats.errors += 1;
      this.lastTickAt = new Date().toISOString();
      this.emit("tick:error", { reason, error: err.message });
      throw err;
    } finally {
      const elapsed = Math.max(0, Date.now() - started);
      this.stats.avgTickMs = this.stats.avgTickMs === 0 ? elapsed : Math.round((this.stats.avgTickMs * 0.8) + (elapsed * 0.2));
      this.inTick = false;
    }
  }

  getStatus() {
    return {
      running: this.running,
      inTick: this.inTick,
      intervalMs: this.intervalMs,
      jitterMs: this.jitterMs,
      maxEvalMs: this.maxEvalMs,
      lastTickAt: this.lastTickAt,
      nextTickAt: this.nextTickAt ? new Date(this.nextTickAt).toISOString() : null,
      lastSeenVersions: { ...this.lastSeenVersions },
      lastSeenSeq: this.lastSeenSeq,
      stats: { ...this.stats },
    };
  }
}

export default { SchedulerHeartbeat };
