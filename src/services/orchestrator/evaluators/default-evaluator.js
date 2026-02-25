import fs from "fs";
import path from "path";

import { dataFile, getProjectsDir } from "../../paths.js";
import { getPendingTasks, getTask, executeTask } from "../../engine/task-executor.js";
import { getWorkQueue } from "../../work-queue.js";

const ALERT_STATE_PATH = dataFile("alert-evaluator-state.json");
const DEFERRED_THRESHOLD_STATE_PATH = dataFile("deferred-proactive-threshold-state.json");
const TAG = "[DefaultEvaluator]";
const DEFERRED_PROACTIVE_TYPES = new Set(["brief", "market", "goals", "projects", "email", "adhoc"]);
const DEFERRED_PROACTIVE_POLICY = {
  brief: { cooldownMs: 3 * 60 * 60 * 1000, maxStalenessMs: 12 * 60 * 60 * 1000 },
  market: { cooldownMs: 60 * 60 * 1000, maxStalenessMs: 6 * 60 * 60 * 1000 },
  goals: { cooldownMs: 6 * 60 * 60 * 1000, maxStalenessMs: 24 * 60 * 60 * 1000 },
  projects: { cooldownMs: 6 * 60 * 60 * 1000, maxStalenessMs: 24 * 60 * 60 * 1000 },
  email: { cooldownMs: 2 * 60 * 60 * 1000, maxStalenessMs: 12 * 60 * 60 * 1000 },
  adhoc: { cooldownMs: 90 * 60 * 1000, maxStalenessMs: 8 * 60 * 60 * 1000 },
};

function readJsonSafe(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {}
  return fallback;
}

function writeJsonSafe(filePath, value) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  } catch {}
}

function loadAlertState() {
  return readJsonSafe(ALERT_STATE_PATH, { sent: {} }) || { sent: {} };
}

function saveAlertState(state) {
  writeJsonSafe(ALERT_STATE_PATH, state);
}

function defaultDeferredThresholdState() {
  return {
    deferredRuns: {},
    baselines: {
      news: {},
      market: {},
      health: {},
      goals: {},
      projects: {},
      email: {},
    },
    lastUpdated: null,
  };
}

function loadDeferredThresholdState() {
  const state = readJsonSafe(DEFERRED_THRESHOLD_STATE_PATH, null);
  if (!state || typeof state !== "object") return defaultDeferredThresholdState();
  return {
    deferredRuns: state.deferredRuns && typeof state.deferredRuns === "object" ? state.deferredRuns : {},
    baselines: state.baselines && typeof state.baselines === "object" ? state.baselines : defaultDeferredThresholdState().baselines,
    lastUpdated: state.lastUpdated || null,
  };
}

function saveDeferredThresholdState(state) {
  if (!state || typeof state !== "object") return;
  state.lastUpdated = new Date().toISOString();
  writeJsonSafe(DEFERRED_THRESHOLD_STATE_PATH, state);
}

function recordDeferredRun(jobId, type, meta = {}) {
  if (!jobId) return;
  const state = loadDeferredThresholdState();
  state.deferredRuns[jobId] = {
    type: String(type || ""),
    lastRunAt: new Date().toISOString(),
    success: meta.success !== false,
    skipped: !!meta.skipped,
    reason: meta.reason || null,
  };
  saveDeferredThresholdState(state);
}

function getPolicyForDeferredType(type) {
  return DEFERRED_PROACTIVE_POLICY[String(type || "").trim()] || { cooldownMs: 2 * 60 * 60 * 1000, maxStalenessMs: 12 * 60 * 60 * 1000 };
}

function getFileMtimeMsSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    return Math.floor(fs.statSync(filePath).mtimeMs || 0);
  } catch {}
  return 0;
}

function latestProjectMarkerMtimeMs() {
  try {
    const projectsDir = getProjectsDir();
    if (!fs.existsSync(projectsDir)) return 0;
    let latest = 0;
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const marker = path.join(projectsDir, entry.name, "PROJECT.md");
      const mtime = getFileMtimeMsSafe(marker);
      if (mtime > latest) latest = mtime;
    }
    return latest;
  } catch {}
  return 0;
}

function numOrNull(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function getLatestHealthSnapshot() {
  const oura = readJsonSafe(dataFile("oura-data.json"), null);
  if (!oura) return { readiness: null, sleepScore: null, fileMtimeMs: 0 };
  const latest = oura.latest || oura;
  const readinessEntry = Array.isArray(latest?.readiness) ? latest.readiness.at(-1) : (latest?.readiness || null);
  const sleepEntry = Array.isArray(latest?.sleep) ? latest.sleep.at(-1) : (latest?.sleep || null);
  return {
    readiness: numOrNull(
      readinessEntry?.score,
      readinessEntry?.readinessScore,
      readinessEntry?.readiness_score,
      latest?.today?.readinessScore,
    ),
    sleepScore: numOrNull(
      sleepEntry?.score,
      sleepEntry?.sleepScore,
      sleepEntry?.sleep_score,
      latest?.today?.sleepScore,
    ),
    fileMtimeMs: getFileMtimeMsSafe(dataFile("oura-data.json")),
  };
}

function getMarketSnapshot() {
  const alpaca = readJsonSafe(dataFile("alpaca-cache.json"), null);
  const tickers = readJsonSafe(dataFile("tickers-cache.json"), null);
  const positions = Array.isArray(alpaca?.positions) ? alpaca.positions : [];
  let maxPositionMovePct = 0;
  for (const p of positions) {
    const pct = Math.abs(Number.parseFloat(p.unrealized_plpc ?? p.change_today ?? 0) * 100);
    if (Number.isFinite(pct) && pct > maxPositionMovePct) maxPositionMovePct = pct;
  }
  const tickerList = Array.isArray(tickers?.tickers) ? tickers.tickers : [];
  const spy = tickerList.find((t) => String(t.symbol || "").toUpperCase() === "SPY");
  const spyMovePct = Math.abs(numOrNull(spy?.changePercent, spy?.percentChange) || 0);
  return {
    maxPositionMovePct,
    spyMovePct,
    alpacaMtimeMs: getFileMtimeMsSafe(dataFile("alpaca-cache.json")),
    tickersMtimeMs: getFileMtimeMsSafe(dataFile("tickers-cache.json")),
  };
}

function getNewsSnapshot() {
  const newsCache = readJsonSafe(dataFile("news-cache.json"), null);
  const candidatesRaw = readJsonSafe(dataFile("alert-candidates.json"), { candidates: [] });
  const articles = Array.isArray(newsCache?.articles) ? newsCache.articles : [];
  const cutoff = Date.now() - (6 * 60 * 60 * 1000);
  const recentArticles = articles.filter((a) => {
    const ts = new Date(a?.publishedAt || a?.date || 0).getTime();
    return Number.isFinite(ts) && ts > cutoff;
  }).length;
  const candidates = Array.isArray(candidatesRaw) ? candidatesRaw : (Array.isArray(candidatesRaw?.candidates) ? candidatesRaw.candidates : []);
  const highImpactCount = candidates.filter((c) => isHighImpactCandidate(c)).length;
  return {
    articleCount: articles.length,
    recentArticles,
    highImpactCount,
    newsCacheMtimeMs: getFileMtimeMsSafe(dataFile("news-cache.json")),
    alertCandidatesMtimeMs: getFileMtimeMsSafe(dataFile("alert-candidates.json")),
  };
}

function summarizeRecentEvents(recentEvents = []) {
  const summary = {
    nonProactiveByDomain: {},
    opsFailures: 0,
    macroRefreshes: 0,
    healthUpdates: 0,
  };
  for (const event of recentEvents) {
    if (!event) continue;
    const domain = String(event.domain || "").trim();
    const type = String(event.type || "").trim();
    if (!domain) continue;
    if (type !== "proactive-job") {
      summary.nonProactiveByDomain[domain] = (summary.nonProactiveByDomain[domain] || 0) + 1;
    }
    if (domain === "runtime") {
      const state = String(getEventField(event, "state") || "").toLowerCase();
      if (state === "failed" || /error/i.test(type)) summary.opsFailures += 1;
    }
    if (domain === "market" && type === "macro-refresh") summary.macroRefreshes += 1;
    if (domain === "health" && type !== "proactive-job") summary.healthUpdates += 1;
  }
  return summary;
}

function computeDomainMateriality({ changedDomains = [], recentEvents = [], thresholdState }) {
  const domains = new Set(changedDomains || []);
  const eventSummary = summarizeRecentEvents(recentEvents);
  const observations = [];

  const newsSnapshot = getNewsSnapshot();
  const prevNews = thresholdState.baselines.news || {};
  const newsCacheChanged = newsSnapshot.newsCacheMtimeMs > Number(prevNews.newsCacheMtimeMs || 0);
  const newsCandidatesChanged = newsSnapshot.alertCandidatesMtimeMs > Number(prevNews.alertCandidatesMtimeMs || 0);
  const minRecentArticles = Number.parseInt(process.env.BACKBONE_NEWS_MATERIAL_MIN_RECENT_ARTICLES || "3", 10);
  const newsMaterial = (
    newsSnapshot.highImpactCount > 0 ||
    (newsCacheChanged && newsSnapshot.recentArticles >= minRecentArticles) ||
    (eventSummary.nonProactiveByDomain.news || 0) > 0 ||
    (eventSummary.nonProactiveByDomain.alerts || 0) > 0
  );
  if (newsMaterial) observations.push(`news-material:${newsSnapshot.highImpactCount}/${newsSnapshot.recentArticles}`);
  thresholdState.baselines.news = { ...newsSnapshot };

  const marketSnapshot = getMarketSnapshot();
  const prevMarket = thresholdState.baselines.market || {};
  const marketDataChanged = marketSnapshot.alpacaMtimeMs > Number(prevMarket.alpacaMtimeMs || 0) ||
    marketSnapshot.tickersMtimeMs > Number(prevMarket.tickersMtimeMs || 0);
  const marketMoveThreshold = Number.parseFloat(process.env.BACKBONE_MARKET_MATERIAL_MOVE_PCT || "2.5");
  const spyMoveThreshold = Number.parseFloat(process.env.BACKBONE_MARKET_SPY_MOVE_PCT || "1.0");
  const marketMaterial = (
    eventSummary.macroRefreshes > 0 ||
    ((domains.has("market") || (eventSummary.nonProactiveByDomain.market || 0) > 0) && marketDataChanged &&
      (marketSnapshot.maxPositionMovePct >= marketMoveThreshold || marketSnapshot.spyMovePct >= spyMoveThreshold))
  );
  if (marketMaterial) observations.push(`market-material:${marketSnapshot.maxPositionMovePct.toFixed(1)}/${marketSnapshot.spyMovePct.toFixed(1)}`);
  thresholdState.baselines.market = { ...marketSnapshot };

  const opsMaterial = eventSummary.opsFailures > 0;
  if (opsMaterial) observations.push(`ops-failures:${eventSummary.opsFailures}`);

  const healthSnapshot = getLatestHealthSnapshot();
  const prevHealth = thresholdState.baselines.health || {};
  const lowReadinessThreshold = Number.parseInt(process.env.BACKBONE_HEALTH_LOW_READINESS_SCORE || "65", 10);
  const lowSleepThreshold = Number.parseInt(process.env.BACKBONE_HEALTH_LOW_SLEEP_SCORE || "65", 10);
  const deltaThreshold = Number.parseInt(process.env.BACKBONE_HEALTH_DELTA_SCORE || "10", 10);
  const readinessDelta = (healthSnapshot.readiness != null && prevHealth.readiness != null) ? Math.abs(Number(healthSnapshot.readiness) - Number(prevHealth.readiness)) : 0;
  const sleepDelta = (healthSnapshot.sleepScore != null && prevHealth.sleepScore != null) ? Math.abs(Number(healthSnapshot.sleepScore) - Number(prevHealth.sleepScore)) : 0;
  const healthMaterial = (
    (domains.has("health") || eventSummary.healthUpdates > 0) &&
    (
      (healthSnapshot.readiness != null && healthSnapshot.readiness <= lowReadinessThreshold) ||
      (healthSnapshot.sleepScore != null && healthSnapshot.sleepScore <= lowSleepThreshold) ||
      readinessDelta >= deltaThreshold ||
      sleepDelta >= deltaThreshold
    )
  );
  if (healthMaterial) observations.push(`health-material:${healthSnapshot.readiness ?? "na"}/${healthSnapshot.sleepScore ?? "na"}`);
  thresholdState.baselines.health = { ...healthSnapshot };

  const goalsMtimeMs = getFileMtimeMsSafe(dataFile("goals.json"));
  const prevGoals = thresholdState.baselines.goals || {};
  const goalsChanged = goalsMtimeMs > Number(prevGoals.mtimeMs || 0);
  thresholdState.baselines.goals = { mtimeMs: goalsMtimeMs };

  const projectsMtimeMs = latestProjectMarkerMtimeMs();
  const prevProjects = thresholdState.baselines.projects || {};
  const projectsChanged = projectsMtimeMs > Number(prevProjects.mtimeMs || 0);
  thresholdState.baselines.projects = { mtimeMs: projectsMtimeMs };

  const memorySignals = (eventSummary.nonProactiveByDomain.memory || 0) + (eventSummary.nonProactiveByDomain.calendar || 0);
  thresholdState.baselines.email = { lastSignalAt: memorySignals > 0 ? new Date().toISOString() : (thresholdState.baselines.email?.lastSignalAt || null) };

  return {
    observations,
    eventSummary,
    news: { material: newsMaterial, ...newsSnapshot, cacheChanged: newsCacheChanged || newsCandidatesChanged },
    market: { material: marketMaterial, ...marketSnapshot, dataChanged: marketDataChanged },
    ops: { material: opsMaterial, failures: eventSummary.opsFailures },
    health: { material: healthMaterial, ...healthSnapshot, readinessDelta, sleepDelta },
    goals: { changed: goalsChanged, mtimeMs: goalsMtimeMs },
    projects: { changed: projectsChanged, mtimeMs: projectsMtimeMs },
    email: { changed: memorySignals > 0, signalCount: memorySignals },
  };
}

function shouldQueueDeferredProactive({ jobId, type, materiality, thresholdState }) {
  const safeType = String(type || "").trim();
  const policy = getPolicyForDeferredType(safeType);
  const now = Date.now();
  const lastRunAt = thresholdState.deferredRuns?.[jobId]?.lastRunAt ? new Date(thresholdState.deferredRuns[jobId].lastRunAt).getTime() : 0;
  const ageMs = lastRunAt ? Math.max(0, now - lastRunAt) : Number.POSITIVE_INFINITY;
  const onCooldown = Number.isFinite(ageMs) && ageMs < policy.cooldownMs;
  const stale = !lastRunAt || ageMs >= policy.maxStalenessMs;

  let material = false;
  switch (safeType) {
    case "brief":
      material = !!(materiality.news.material || materiality.market.material || materiality.ops.material || materiality.health.material || materiality.goals.changed || materiality.projects.changed || materiality.email.changed);
      break;
    case "market":
      material = !!(materiality.market.material || (materiality.ops.material && materiality.market.dataChanged));
      break;
    case "adhoc":
      material = !!(materiality.news.material || materiality.market.material || materiality.ops.material || materiality.health.material);
      break;
    case "goals":
      material = !!materiality.goals.changed;
      break;
    case "projects":
      material = !!materiality.projects.changed;
      break;
    case "email":
      material = !!materiality.email.changed || !!materiality.ops.material;
      break;
    default:
      material = true;
  }

  if (onCooldown && !(safeType === "adhoc" && (materiality.ops.material || materiality.news.highImpactCount > 0))) {
    return { allow: false, reason: "cooldown" };
  }
  if (material) return { allow: true, reason: "material" };
  if (stale) return { allow: true, reason: "stale" };
  return { allow: false, reason: "not-material" };
}

function isHighImpactCandidate(candidate = {}) {
  const severity = String(candidate.severity || "").toLowerCase();
  const impactScore = Number(candidate.impactScore || 0);
  const distanceMiles = Number(candidate.distanceMiles ?? candidate.distance ?? Infinity);
  if (severity === "critical") return true;
  if (severity === "high" && (impactScore >= 70 || distanceMiles <= 100)) return true;
  if (impactScore >= 90) return true;
  return false;
}

function shouldSendCandidate(candidate, state) {
  if (!isHighImpactCandidate(candidate)) return false;
  const id = String(candidate.id || candidate.eventId || candidate.title || "").trim();
  if (!id) return false;
  const cooldownMs = Number(candidate.cooldownMs || 6 * 60 * 60 * 1000);
  const last = state.sent[id] ? new Date(state.sent[id]).getTime() : 0;
  return !last || (Date.now() - last) > cooldownMs;
}

function buildAlertMessage(candidate) {
  const title = candidate.title || "High-impact alert";
  const summary = candidate.summary || candidate.description || "A new high-impact event may affect you.";
  const distance = Number.isFinite(Number(candidate.distanceMiles)) ? ` (${Number(candidate.distanceMiles).toFixed(0)} miles away)` : "";
  return `*Heads up:* ${title}${distance}\n\n${summary}`.slice(0, 1200);
}

function getEventField(event, key) {
  if (event?.payload && Object.prototype.hasOwnProperty.call(event.payload, key)) {
    return event.payload[key];
  }
  if (event?.summary && Object.prototype.hasOwnProperty.call(event.summary, key)) {
    return event.summary[key];
  }
  return undefined;
}

function estimateDeferredProactiveTokens(type) {
  const map = {
    brief: Number.parseInt(process.env.BACKBONE_BG_PROACTIVE_BRIEF_EST_TOKENS || "6000", 10),
    market: Number.parseInt(process.env.BACKBONE_BG_PROACTIVE_MARKET_EST_TOKENS || "3500", 10),
    goals: Number.parseInt(process.env.BACKBONE_BG_PROACTIVE_GOALS_EST_TOKENS || "2500", 10),
    projects: Number.parseInt(process.env.BACKBONE_BG_PROACTIVE_PROJECTS_EST_TOKENS || "2500", 10),
    email: Number.parseInt(process.env.BACKBONE_BG_PROACTIVE_EMAIL_EST_TOKENS || "4500", 10),
    adhoc: Number.parseInt(process.env.BACKBONE_BG_PROACTIVE_ADHOC_EST_TOKENS || "5000", 10),
  };
  return Math.max(0, Number(map[String(type || "").trim()] || 3000));
}

async function createDeferredProactiveJob({ jobId, type }) {
  const safeType = String(type || "unknown");
  return {
    id: `deferred_proactive_${jobId}_${Date.now()}`,
    dedupeKey: `deferred-proactive:${jobId}`,
    kind: "background_exec",
    domain: safeType === "market" ? "market" : "memory",
    source: "heartbeat",
    priorityClass: "background",
    priority: 3,
    preemptible: true,
    estimatedTokens: estimateDeferredProactiveTokens(safeType),
    payload: { jobId, type: safeType, deferredFrom: "proactive-collector" },
    run: async ({ checkpoint }) => {
      const ck = await checkpoint(`before-proactive:${jobId}`);
      if (ck?.yielded) {
        return {
          yielded: true,
          resumeToken: { type: "deferred-proactive", jobId, proactiveType: safeType },
          usage: { estimatedTokens: 0 },
        };
      }
      try {
        const { getProactiveScheduler } = await import("../../messaging/proactive-scheduler.js");
        const scheduler = getProactiveScheduler();
        const result = await scheduler.triggerJob(jobId, { forceCollectorMode: false, source: "heartbeat-deferred" });
        const estimated = (!result?.skipped && !result?.collectorOnly) ? estimateDeferredProactiveTokens(safeType) : 0;
        return {
          success: !!result?.success,
          skipped: !!result?.skipped,
          error: result?.error || null,
          output: result?.reason || result?.error || "",
          usage: { estimatedTokens: estimated },
        };
      } catch (err) {
        console.error(`${TAG} Deferred proactive run failed:`, err.message);
        return { success: false, error: err.message, usage: { estimatedTokens: 0 } };
      }
    }
  };
}

async function createDeferredProactiveJobWithTracking({ jobId, type, gateReason }) {
  const job = await createDeferredProactiveJob({ jobId, type });
  const originalRun = job.run;
  job.labels = { ...(job.labels || {}), gateReason: gateReason || null };
  job.run = async (ctx) => {
    const result = await originalRun(ctx);
    if (result?.success && !result?.skipped) {
      recordDeferredRun(jobId, type, { success: true, reason: gateReason || null });
    }
    return result;
  };
  return job;
}

async function createPendingTaskJob(task, orchestrator) {
  return {
    id: `pending_task_${task.id}`,
    dedupeKey: `pending-task:${task.id}`,
    kind: "background_exec",
    domain: "tasks",
    source: "heartbeat",
    priorityClass: "background",
    priority: 2,
    preemptible: false,
    estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_TASK_EST_TOKENS || "4000", 10),
    payload: { taskId: task.id, title: task.title },
    run: async () => {
      const current = getTask(task.id);
      if (!current || current.status !== "pending") {
        return { success: true, output: "Task no longer pending", usage: { estimatedTokens: 0 } };
      }
      let ctx = {};
      try {
        if (orchestrator.engine?.getContext) ctx = await orchestrator.engine.getContext();
      } catch {}
      const result = await executeTask(current, ctx);
      return {
        success: !!result.success,
        output: result.result || result.error || "",
        error: result.error || null,
        usage: { estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_TASK_EST_TOKENS || "4000", 10) },
      };
    }
  };
}

export async function evaluateDefaultHeartbeat({ changedDomains = [], orchestrator, recentEvents = [] }) {
  const jobs = [];
  const observations = [];
  const domains = new Set(changedDomains || []);
  const thresholdState = loadDeferredThresholdState();
  const domainMateriality = computeDomainMateriality({ changedDomains, recentEvents, thresholdState });
  if (domainMateriality.observations.length > 0) observations.push(...domainMateriality.observations);

  if (Array.isArray(recentEvents) && recentEvents.length > 0) {
    const deferredCandidates = [];
    for (const event of recentEvents) {
      if (!event || event.type !== "proactive-job") continue;
      const jobId = String(getEventField(event, "jobId") || "").trim();
      const type = String(getEventField(event, "type") || "").trim();
      const collectorOnly = !!getEventField(event, "collectorOnly");
      const success = getEventField(event, "success");
      const skipped = !!getEventField(event, "skipped");
      if (!jobId || !type || !collectorOnly) continue;
      if (!DEFERRED_PROACTIVE_TYPES.has(type)) continue;
      if (success === false || skipped) continue;
      const decision = shouldQueueDeferredProactive({ jobId, type, materiality: domainMateriality, thresholdState });
      if (!decision.allow) {
        observations.push(`deferredSkip:${type}:${decision.reason}`);
        continue;
      }
      deferredCandidates.push({ jobId, type, gateReason: decision.reason });
    }

    if (deferredCandidates.length > 0) {
      observations.push(`deferredProactive:${deferredCandidates.length}`);
      for (const candidate of deferredCandidates.slice(0, 4)) {
        jobs.push(await createDeferredProactiveJobWithTracking(candidate));
      }
    }
  }

  const pendingTasks = getPendingTasks();
  if (pendingTasks.length > 0) {
    observations.push(`pendingTasks:${pendingTasks.length}`);
    const engineRunning = !!orchestrator?.engine?.running;
    if (engineRunning) {
      jobs.push({
        id: `engine_wake_tasks_${Date.now()}`,
        dedupeKey: "engine-wake:tasks",
        kind: "background_eval",
        domain: "engine",
        source: "heartbeat",
        priorityClass: "background",
        priority: 1,
        preemptible: true,
        estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_ENGINE_WAKE_EST_TOKENS || "500", 10),
        run: async ({ checkpoint }) => {
          const ck = await checkpoint("before-engine-wake");
          if (ck.yielded) return { yielded: true, resumeToken: { type: "engine-wake" }, usage: { estimatedTokens: 0 } };
          try {
            orchestrator.engine.signalChange?.("pending-task");
            orchestrator.engine.wakeFromRest?.();
          } catch {}
          return { success: true, usage: { estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_ENGINE_WAKE_EST_TOKENS || "500", 10) } };
        }
      });
    } else {
      jobs.push(await createPendingTaskJob(pendingTasks[0], orchestrator));
    }
  }

  let workQueueSize = 0;
  try { workQueueSize = getWorkQueue().size(); } catch {}
  if (workQueueSize > 0) {
    observations.push(`workQueue:${workQueueSize}`);
    if (orchestrator?.engine?.running) {
      jobs.push({
        id: `engine_wake_workq_${Date.now()}`,
        dedupeKey: "engine-wake:work-queue",
        kind: "background_eval",
        domain: "engine",
        source: "heartbeat",
        priorityClass: "background",
        priority: 2,
        preemptible: true,
        estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_ENGINE_WAKE_EST_TOKENS || "500", 10),
        run: async ({ checkpoint }) => {
          const ck = await checkpoint("before-engine-wake");
          if (ck.yielded) return { yielded: true, usage: { estimatedTokens: 0 } };
          try {
            orchestrator.engine.signalChange?.("work-queue");
            orchestrator.engine.wakeFromRest?.();
          } catch {}
          return { success: true, usage: { estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_ENGINE_WAKE_EST_TOKENS || "500", 10) } };
        }
      });
    }
  }

  const plannerDomains = ["news", "market", "health", "projects", "goals", "calendar", "memory"];
  if (plannerDomains.some(d => domains.has(d)) && orchestrator?.engine?.running) {
    observations.push("planner-signal");
    jobs.push({
      id: `engine_wake_signal_${Date.now()}`,
      dedupeKey: "engine-wake:changed-domain",
      kind: "background_eval",
      domain: "engine",
      source: "heartbeat",
      priorityClass: "background",
      priority: 4,
      preemptible: true,
      estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_ENGINE_WAKE_EST_TOKENS || "500", 10),
      run: async ({ checkpoint }) => {
        const ck = await checkpoint("before-engine-wake");
        if (ck.yielded) return { yielded: true, usage: { estimatedTokens: 0 } };
        try {
          orchestrator.engine.signalChange?.("heartbeat-change");
          orchestrator.engine.wakeFromRest?.();
        } catch {}
        return { success: true, usage: { estimatedTokens: Number.parseInt(process.env.BACKBONE_BG_ENGINE_WAKE_EST_TOKENS || "500", 10) } };
      }
    });
  }

  if (domains.has("news") || domains.has("alerts")) {
    try {
      const candidates = readJsonSafe(dataFile("alert-candidates.json"), { candidates: [] });
      const list = Array.isArray(candidates) ? candidates : (candidates?.candidates || []);
      if (list.length > 0) {
        const state = loadAlertState();
        const sendable = list.filter(c => shouldSendCandidate(c, state)).slice(0, 3);
        for (const candidate of sendable) {
          const id = String(candidate.id || candidate.title);
          jobs.push({
            id: `alert_${id}_${Date.now()}`,
            dedupeKey: `alert:${id}`,
            kind: "alert",
            domain: "alerts",
            source: "heartbeat",
            priorityClass: "background",
            priority: 1,
            preemptible: false,
            estimatedTokens: 0,
            payload: { candidateId: id },
            run: async () => {
              try {
                const { sendWhatsApp } = await import("../../messaging/proactive-outreach.js");
                await sendWhatsApp(buildAlertMessage(candidate), { type: "alert", skipDedup: true });
                state.sent[id] = new Date().toISOString();
                saveAlertState(state);
                return { success: true, usage: { estimatedTokens: 0 } };
              } catch (err) {
                console.error(`${TAG} Alert send failed:`, err.message);
                return { success: false, error: err.message, usage: { estimatedTokens: 0 } };
              }
            }
          });
        }
        if (sendable.length > 0) observations.push(`alerts:${sendable.length}`);
      }
    } catch {}
  }

  saveDeferredThresholdState(thresholdState);
  return { jobs, observations };
}

export default { evaluateDefaultHeartbeat };
