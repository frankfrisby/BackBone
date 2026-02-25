import fs from "fs";
import path from "path";

import { dataFile } from "../paths.js";

const BUDGET_PATH = dataFile("orchestrator-budget.json");
const TAG = "[BudgetGuard]";

function readJsonSafe(filePath, fallback) {
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
    return true;
  } catch (err) {
    console.error(`${TAG} Save failed:`, err.message);
    return false;
  }
}

function hourBucket(now = new Date()) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function dayBucket(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function defaultLimits() {
  return {
    backgroundHourlyTokens: Number.parseInt(process.env.BACKBONE_BG_HOURLY_BUDGET_TOKENS || "12000", 10),
    backgroundDailyTokens: Number.parseInt(process.env.BACKBONE_BG_DAILY_BUDGET_TOKENS || "80000", 10),
    enforceUserCaps: String(process.env.BACKBONE_ENFORCE_USER_BUDGET_CAPS || "0") === "1",
    userDailyTokens: Number.parseInt(process.env.BACKBONE_USER_DAILY_BUDGET_TOKENS || "0", 10),
  };
}

function defaultState() {
  return {
    limits: defaultLimits(),
    buckets: {
      hour: hourBucket(),
      day: dayBucket(),
    },
    usage: {
      background: { hourlyTokens: 0, dailyTokens: 0, launchesHour: 0, launchesDay: 0 },
      user: { hourlyTokens: 0, dailyTokens: 0, launchesHour: 0, launchesDay: 0 },
    },
    reservations: {},
    lastUpdated: new Date().toISOString(),
  };
}

export class BudgetGuard {
  constructor(opts = {}) {
    this.filePath = opts.filePath || BUDGET_PATH;
    this.state = readJsonSafe(this.filePath, null) || defaultState();
    this._rollover();
  }

  _save() {
    this.state.lastUpdated = new Date().toISOString();
    writeJsonSafe(this.filePath, this.state);
  }

  _rollover(now = new Date()) {
    const hb = hourBucket(now);
    const db = dayBucket(now);
    const usage = this.state.usage || {};
    if (!usage.background) usage.background = { hourlyTokens: 0, dailyTokens: 0, launchesHour: 0, launchesDay: 0 };
    if (!usage.user) usage.user = { hourlyTokens: 0, dailyTokens: 0, launchesHour: 0, launchesDay: 0 };

    if (this.state.buckets?.hour !== hb) {
      usage.background.hourlyTokens = 0;
      usage.background.launchesHour = 0;
      usage.user.hourlyTokens = 0;
      usage.user.launchesHour = 0;
      this.state.buckets.hour = hb;
    }
    if (this.state.buckets?.day !== db) {
      usage.background.dailyTokens = 0;
      usage.background.launchesDay = 0;
      usage.user.dailyTokens = 0;
      usage.user.launchesDay = 0;
      this.state.buckets.day = db;
    }
    this.state.usage = usage;
  }

  getLimits() {
    return { ...(this.state.limits || defaultLimits()) };
  }

  getStatus() {
    this._rollover();
    return {
      buckets: { ...(this.state.buckets || {}) },
      limits: this.getLimits(),
      usage: JSON.parse(JSON.stringify(this.state.usage || {})),
      reservations: { ...this.state.reservations },
    };
  }

  canLaunch(jobClass = "background", estimateTokens = 0) {
    this._rollover();
    const limits = this.getLimits();
    const cls = jobClass === "user" ? "user" : "background";
    const usage = this.state.usage[cls];
    const estimate = Math.max(0, Number(estimateTokens) || 0);

    if (cls === "background") {
      if (usage.hourlyTokens + estimate > limits.backgroundHourlyTokens) {
        return {
          allowed: false,
          reason: "background_hourly_budget_exceeded",
          remainingHourly: Math.max(0, limits.backgroundHourlyTokens - usage.hourlyTokens),
          remainingDaily: Math.max(0, limits.backgroundDailyTokens - usage.dailyTokens),
        };
      }
      if (usage.dailyTokens + estimate > limits.backgroundDailyTokens) {
        return {
          allowed: false,
          reason: "background_daily_budget_exceeded",
          remainingHourly: Math.max(0, limits.backgroundHourlyTokens - usage.hourlyTokens),
          remainingDaily: Math.max(0, limits.backgroundDailyTokens - usage.dailyTokens),
        };
      }
    } else if (limits.enforceUserCaps && limits.userDailyTokens > 0) {
      if (usage.dailyTokens + estimate > limits.userDailyTokens) {
        return { allowed: false, reason: "user_daily_budget_exceeded" };
      }
    }

    return {
      allowed: true,
      remainingHourly: cls === "background" ? Math.max(0, limits.backgroundHourlyTokens - usage.hourlyTokens) : null,
      remainingDaily: cls === "background" ? Math.max(0, limits.backgroundDailyTokens - usage.dailyTokens) : null,
    };
  }

  reserve(jobId, jobClass = "background", estimateTokens = 0) {
    this._rollover();
    const check = this.canLaunch(jobClass, estimateTokens);
    if (!check.allowed) return { ok: false, ...check };

    const cls = jobClass === "user" ? "user" : "background";
    const usage = this.state.usage[cls];
    const estimate = Math.max(0, Number(estimateTokens) || 0);
    usage.hourlyTokens += estimate;
    usage.dailyTokens += estimate;
    usage.launchesHour += 1;
    usage.launchesDay += 1;
    this.state.reservations[jobId] = {
      jobClass: cls,
      estimatedTokens: estimate,
      reservedAt: new Date().toISOString(),
    };
    this._save();
    return { ok: true, reservedTokens: estimate };
  }

  recordUsage(jobId, usage = {}) {
    this._rollover();
    const reservation = this.state.reservations[jobId];
    const actualTokens = Math.max(0, Number(usage.tokens ?? usage.totalTokens ?? usage.estimatedTokens ?? 0) || 0);
    if (!reservation) {
      this._save();
      return { ok: true, adjustedTokens: 0, actualTokens };
    }
    const cls = reservation.jobClass || "background";
    const estimated = Math.max(0, Number(reservation.estimatedTokens) || 0);
    const delta = actualTokens - estimated;
    if (delta !== 0) {
      const bucket = this.state.usage[cls];
      bucket.hourlyTokens = Math.max(0, bucket.hourlyTokens + delta);
      bucket.dailyTokens = Math.max(0, bucket.dailyTokens + delta);
    }
    delete this.state.reservations[jobId];
    this._save();
    return { ok: true, adjustedTokens: delta, actualTokens };
  }

  resetForTests() {
    this.state = defaultState();
    this._save();
  }
}

let _budgetGuard;
export function getBudgetGuard(opts) {
  if (!_budgetGuard) _budgetGuard = new BudgetGuard(opts);
  return _budgetGuard;
}

export default { BudgetGuard, getBudgetGuard };
