import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";

const testRoot = path.join(os.tmpdir(), `bb-orchestrator-test-${Date.now()}`);
fs.mkdirSync(testRoot, { recursive: true });
process.env.BACKBONE_HOME = testRoot;

const { ChangeJournal } = await import("../../src/services/orchestrator/change-journal.js");
const { BudgetGuard } = await import("../../src/services/orchestrator/budget-guard.js");
const { WorkDispatcher } = await import("../../src/services/orchestrator/work-dispatcher.js");
const { SchedulerHeartbeat } = await import("../../src/services/orchestrator/scheduler-heartbeat.js");
const { evaluateDefaultHeartbeat } = await import("../../src/services/orchestrator/evaluators/default-evaluator.js");
const { default: ProactiveScheduler } = await import("../../src/services/messaging/proactive-scheduler.js");
const { dataFile } = await import("../../src/services/paths.js");

const results = { passed: 0, failed: 0 };
function logPass(name) { results.passed++; console.log(`PASS ${name}`); }
function logFail(name, err) { results.failed++; console.log(`FAIL ${name}: ${err.message}`); }
async function run(name, fn) {
  try { await fn(); logPass(name); } catch (err) { logFail(name, err); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function writeDataJson(name, value) {
  const file = dataFile(name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

await run("ChangeJournal increments versions and diffs", async () => {
  const file = path.join(testRoot, "journal-test.json");
  const journal = new ChangeJournal({ filePath: file, maxEvents: 20 });
  journal.resetForTests();
  const snap1 = journal.getVersions();
  journal.emitChange("messages", "inbound", { text: "hi" }, { source: "test" });
  journal.emitChange("news", "refresh", { count: 10 }, { source: "test" });
  const versions = journal.getVersions();
  assert.strictEqual(versions.messages, 1);
  assert.strictEqual(versions.news, 1);
  const diff = journal.diffVersions(snap1);
  assert(diff.includes("messages"));
  assert(diff.includes("news"));
  assert.strictEqual(journal.getRecentEvents(2).length, 2);
});

await run("BudgetGuard enforces background hard caps", async () => {
  const file = path.join(testRoot, "budget-test.json");
  const bg = new BudgetGuard({ filePath: file });
  bg.resetForTests();
  bg.state.limits.backgroundHourlyTokens = 100;
  bg.state.limits.backgroundDailyTokens = 200;
  let check = bg.canLaunch("background", 80);
  assert.strictEqual(check.allowed, true);
  let r1 = bg.reserve("job1", "background", 80);
  assert.strictEqual(r1.ok, true);
  check = bg.canLaunch("background", 30);
  assert.strictEqual(check.allowed, false);
  assert.strictEqual(check.reason, "background_hourly_budget_exceeded");
  bg.recordUsage("job1", { tokens: 50 });
  check = bg.canLaunch("background", 30);
  assert.strictEqual(check.allowed, true);
});

await run("WorkDispatcher pauses background and runs user work first", async () => {
  const journal = new ChangeJournal({ filePath: path.join(testRoot, "dispatcher-journal.json") });
  journal.resetForTests();
  const budget = new BudgetGuard({ filePath: path.join(testRoot, "dispatcher-budget.json") });
  budget.resetForTests();
  budget.state.limits.backgroundHourlyTokens = 999999;
  budget.state.limits.backgroundDailyTokens = 999999;

  const events = [];
  const dispatcher = new WorkDispatcher({ journal, budget, userHoldMs: 25 });
  dispatcher.start();
  let bgStarted = false;
  dispatcher.on("job-started", ({ job }) => {
    if (job.id === "bg1") bgStarted = true;
  });

  dispatcher.enqueue({
    id: "bg1",
    dedupeKey: "bg1",
    kind: "background_exec",
    domain: "tests",
    priorityClass: "background",
    preemptible: true,
    estimatedTokens: 10,
    run: async ({ checkpoint }) => {
      events.push("bg-start");
      for (let i = 0; i < 8; i++) {
        await sleep(10);
        const ck = await checkpoint(`mid-${i}`);
        if (ck.yielded) {
          events.push("bg-yield");
          return { yielded: true, resumeToken: { step: `after-${i}` }, usage: { tokens: 5 } };
        }
      }
      events.push("bg-done");
      return { success: true, usage: { tokens: 5 } };
    }
  });

  const startDeadline = Date.now() + 500;
  while (!bgStarted && Date.now() < startDeadline) await sleep(5);
  assert(bgStarted, "Background job did not start");
  dispatcher.noteUserActivity("test", { holdMs: 20 });
  dispatcher.enqueue({
    id: "user1",
    dedupeKey: "user1",
    kind: "user_task",
    domain: "tests",
    priorityClass: "user",
    priority: 1,
    run: async () => {
      events.push("user-run");
      await sleep(5);
      events.push("user-done");
      return { success: true, usage: { tokens: 0 } };
    }
  });

  const deadline = Date.now() + 1000;
  while (!events.includes("bg-done") && Date.now() < deadline) {
    await sleep(20);
  }
  dispatcher.stop();

  assert(events.includes("bg-yield"), `Expected bg-yield, got ${events.join(",")}`);
  assert(events.includes("user-done"), `Expected user-done, got ${events.join(",")}`);
  assert(events.includes("bg-done"), `Expected bg resume completion, got ${events.join(",")}`);
  assert(events.indexOf("bg-yield") < events.indexOf("user-run"), "Background should yield before user runs");
  assert(events.indexOf("user-done") < events.lastIndexOf("bg-done"), "Background should resume after user finishes");
});

await run("SchedulerHeartbeat skips no-change and enqueues on change", async () => {
  const journal = new ChangeJournal({ filePath: path.join(testRoot, "hb-journal.json") });
  journal.resetForTests();
  const budget = new BudgetGuard({ filePath: path.join(testRoot, "hb-budget.json") });
  budget.resetForTests();
  budget.state.limits.backgroundHourlyTokens = 999999;
  budget.state.limits.backgroundDailyTokens = 999999;
  const events = [];

  const dispatcher = new WorkDispatcher({ journal, budget });
  dispatcher.on("job-completed", ({ job }) => events.push(`done:${job.id}`));
  dispatcher.start();

  const heartbeat = new SchedulerHeartbeat({
    journal,
    dispatcher,
    budget,
    intervalMs: 100000,
    jitterMs: 0,
    evaluator: async ({ changedDomains }) => {
      if (!changedDomains.includes("news")) return { jobs: [], observations: [] };
      return {
        observations: ["news-change"],
        jobs: [{
          id: "hb-job",
          dedupeKey: "hb-job",
          kind: "background_eval",
          domain: "news",
          priorityClass: "background",
          estimatedTokens: 1,
          run: async () => ({ success: true, usage: { tokens: 1 } })
        }]
      };
    }
  });
  heartbeat.start();

  const t1 = await heartbeat.tick({ reason: "manual-test" });
  assert.strictEqual(t1.skipped, true);
  assert.strictEqual(t1.reason, "no-change");

  journal.emitChange("news", "refresh", { count: 3 }, { source: "test" });
  const t2 = await heartbeat.tick({ reason: "manual-test" });
  assert.strictEqual(t2.skipped, false);
  assert.strictEqual(t2.enqueued, 1);

  const deadline = Date.now() + 500;
  while (!events.includes("done:hb-job") && Date.now() < deadline) {
    await sleep(10);
  }

  heartbeat.stop();
  dispatcher.stop();
  assert(events.includes("done:hb-job"), "Expected heartbeat job to complete");
});

await run("ProactiveScheduler collector mode defers heavy jobs", async () => {
  process.env.BACKBONE_PROACTIVE_COLLECTOR_MODE = "1";
  const scheduler = new ProactiveScheduler();
  scheduler.jobs.set("morning-brief", {
    def: { id: "morning-brief", type: "brief" },
    targetMinute: 0,
    firedToday: false,
    lastResult: null,
  });

  let heavyCalled = false;
  scheduler._executeBrief = async () => {
    heavyCalled = true;
    return { success: true };
  };
  const firedEvents = [];
  scheduler.on("job-fired", (payload) => firedEvents.push(payload));

  const job = scheduler.jobs.get("morning-brief");
  const result = await scheduler._executeJob(job);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.collectorOnly, true);
  assert.strictEqual(heavyCalled, false);
  assert.strictEqual(scheduler.dailyMessageCount, 0);
  assert.strictEqual(firedEvents.length, 1);
  assert.strictEqual(firedEvents[0].result.collectorOnly, true);
});

await run("ProactiveScheduler can force full execution from heartbeat", async () => {
  process.env.BACKBONE_PROACTIVE_COLLECTOR_MODE = "1";
  const scheduler = new ProactiveScheduler();
  scheduler.jobs.set("morning-brief", {
    def: { id: "morning-brief", type: "brief" },
    targetMinute: 0,
    firedToday: false,
    lastResult: null,
  });

  let heavyCalled = 0;
  scheduler._executeBrief = async () => {
    heavyCalled += 1;
    return { success: true, mode: "full" };
  };

  const result = await scheduler.triggerJob("morning-brief", { forceCollectorMode: false });
  assert.strictEqual(result.success, true);
  assert.strictEqual(Boolean(result.collectorOnly), false);
  assert.strictEqual(heavyCalled, 1);
  assert.strictEqual(scheduler.dailyMessageCount, 1);
});

await run("Default evaluator creates deferred job from collector-only proactive event", async () => {
  writeDataJson("deferred-proactive-threshold-state.json", {
    deferredRuns: {},
    baselines: { news: {}, market: {}, health: {}, goals: {}, projects: {}, email: {} }
  });
  const evalResult = await evaluateDefaultHeartbeat({
    changedDomains: ["memory"],
    recentEvents: [{
      type: "proactive-job",
      summary: {
        jobId: "morning-brief",
        type: "brief",
        success: true,
        skipped: false,
        collectorOnly: true,
      }
    }],
    orchestrator: { engine: null },
  });

  const deferredJob = (evalResult.jobs || []).find((j) => String(j.dedupeKey || "").startsWith("deferred-proactive:morning-brief"));
  assert(deferredJob, "Expected deferred proactive job");
  assert.strictEqual(deferredJob.priorityClass, "background");
  assert.strictEqual(typeof deferredJob.run, "function");
});

await run("Default evaluator suppresses quiet brief when not material and not stale", async () => {
  const fourHoursAgo = new Date(Date.now() - (4 * 60 * 60 * 1000)).toISOString();
  writeDataJson("deferred-proactive-threshold-state.json", {
    deferredRuns: {
      "morning-brief": { type: "brief", lastRunAt: fourHoursAgo }
    },
    baselines: { news: {}, market: {}, health: {}, goals: {}, projects: {}, email: {} }
  });

  const evalResult = await evaluateDefaultHeartbeat({
    changedDomains: ["memory"],
    recentEvents: [{
      type: "proactive-job",
      summary: {
        jobId: "morning-brief",
        type: "brief",
        success: true,
        skipped: false,
        collectorOnly: true,
      }
    }],
    orchestrator: { engine: null },
  });

  const deferredJob = (evalResult.jobs || []).find((j) => String(j.dedupeKey || "").startsWith("deferred-proactive:morning-brief"));
  assert.strictEqual(Boolean(deferredJob), false);
  assert((evalResult.observations || []).some((o) => String(o).includes("deferredSkip:brief")));
});

await run("Default evaluator allows market deferred job on material market move", async () => {
  const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString(); // past cooldown (1h), below stale (6h)
  writeDataJson("deferred-proactive-threshold-state.json", {
    deferredRuns: {
      "market-open": { type: "market", lastRunAt: twoHoursAgo }
    },
    baselines: {
      news: {},
      market: { alpacaMtimeMs: 0, tickersMtimeMs: 0 },
      health: {},
      goals: {},
      projects: {},
      email: {}
    }
  });
  writeDataJson("alpaca-cache.json", {
    positions: [{ symbol: "AAPL", unrealized_plpc: 0.041 }]
  });
  writeDataJson("tickers-cache.json", {
    tickers: [{ symbol: "SPY", changePercent: 1.2, price: 500 }]
  });

  const evalResult = await evaluateDefaultHeartbeat({
    changedDomains: ["market"],
    recentEvents: [{
      type: "proactive-job",
      domain: "market",
      summary: {
        jobId: "market-open",
        type: "market",
        success: true,
        skipped: false,
        collectorOnly: true,
      }
    }],
    orchestrator: { engine: null },
  });

  const deferredJob = (evalResult.jobs || []).find((j) => String(j.dedupeKey || "").startsWith("deferred-proactive:market-open"));
  assert(deferredJob, "Expected deferred market job");
  assert.strictEqual(deferredJob.labels?.gateReason, "material");
});

console.log(`\nSummary: ${results.passed} passed, ${results.failed} failed`);
if (results.failed > 0) process.exit(1);
