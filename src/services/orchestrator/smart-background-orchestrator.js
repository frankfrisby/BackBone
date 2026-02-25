import { EventEmitter } from "events";

import { getChangeJournal } from "./change-journal.js";
import { getBudgetGuard } from "./budget-guard.js";
import { WorkDispatcher } from "./work-dispatcher.js";
import { SchedulerHeartbeat } from "./scheduler-heartbeat.js";

const TAG = "[SmartBackground]";

export class SmartBackgroundOrchestrator extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.journal = opts.journal || getChangeJournal();
    this.budget = opts.budget || getBudgetGuard();
    this.engine = null;
    this.started = false;

    this.dispatcher = new WorkDispatcher({
      journal: this.journal,
      budget: this.budget,
      onUserPriorityStart: ({ reason }) => {
        if (this.engine) {
          try {
            this.engine.signalChange?.(`user-priority:${reason}`);
            this.engine.wakeFromRest?.();
          } catch {}
        }
      },
      onUserPriorityEnd: ({ reason }) => {
        if (this.engine) {
          try { this.engine.signalChange?.(`user-priority-end:${reason}`); } catch {}
        }
      },
    });

    this.heartbeat = new SchedulerHeartbeat({
      journal: this.journal,
      dispatcher: this.dispatcher,
      budget: this.budget,
      orchestrator: this,
    });

    this._wireEvents();
  }

  _wireEvents() {
    this.dispatcher.on("job-queued", ({ job }) => this.emit("job-queued", { job }));
    this.dispatcher.on("job-started", ({ job }) => this.emit("job-started", { job }));
    this.dispatcher.on("job-completed", ({ job, result }) => this.emit("job-completed", { job, result }));
    this.dispatcher.on("job-failed", ({ job, error, result }) => this.emit("job-failed", { job, error, result }));
    this.heartbeat.on("tick:jobs", (payload) => this.emit("heartbeat:jobs", payload));
    this.heartbeat.on("tick:skip", (payload) => this.emit("heartbeat:skip", payload));
    this.heartbeat.on("tick:error", (payload) => this.emit("heartbeat:error", payload));
  }

  start() {
    if (this.started) return this;
    this.dispatcher.start();
    this.heartbeat.start();
    this.started = true;
    this.emit("started");
    console.log(`${TAG} Started (heartbeat ${this.heartbeat.intervalMs}ms)`);
    return this;
  }

  stop() {
    if (!this.started) return;
    this.heartbeat.stop();
    this.dispatcher.stop();
    this.started = false;
    this.emit("stopped");
  }

  registerEngine(engine) {
    this.engine = engine || null;
    this.emit("engine-registered", { running: !!engine?.running });
    return this;
  }

  emitSignal(domain, eventType = "change", payload = null, opts = {}) {
    const event = this.journal.emitChange(domain, eventType, payload, opts);
    if (this.engine) {
      try {
        if (["messages", "goals", "projects", "news", "market", "health", "calendar", "memory"].includes(domain)) {
          this.engine.signalChange?.(`${domain}:${eventType}`);
        }
      } catch {}
    }
    this.heartbeat.wake(`${domain}:${eventType}`);
    return event;
  }

  notifyUserActivity(reason = "user-message", payload = {}) {
    this.dispatcher.noteUserActivity(reason);
    try {
      this.emitSignal("messages", "user-activity", { reason, ...payload }, { source: payload.source || "server" });
    } catch {}
    if (this.engine) {
      try {
        this.engine.signalChange?.(`user:${reason}`);
        this.engine.wakeFromRest?.();
      } catch {}
    }
  }

  async runWithUserPriority(label, fn, opts = {}) {
    return await this.dispatcher.withUserPriority(label, fn, opts);
  }

  queueBackgroundJob(job) {
    return this.dispatcher.enqueue({ ...job, priorityClass: "background" });
  }

  queueUserJob(job) {
    return this.dispatcher.enqueue({ ...job, priorityClass: "user" });
  }

  getStatus() {
    return {
      started: this.started,
      engineRegistered: !!this.engine,
      journal: this.journal.getSnapshot(),
      heartbeat: this.heartbeat.getStatus(),
      dispatcher: this.dispatcher.getStatus(),
    };
  }
}

let _orchestrator;
export function getSmartBackgroundOrchestrator(opts) {
  if (!_orchestrator) _orchestrator = new SmartBackgroundOrchestrator(opts);
  return _orchestrator;
}

export default { SmartBackgroundOrchestrator, getSmartBackgroundOrchestrator };
