import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

import { dataFile } from "../paths.js";

const JOURNAL_PATH = dataFile("orchestrator-change-journal.json");
const TAG = "[ChangeJournal]";
const MAX_EVENTS_DEFAULT = 500;

function nowIso() {
  return new Date().toISOString();
}

function readJsonSafe(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
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

function summarizePayload(payload) {
  if (payload == null) return null;
  if (typeof payload === "string") return payload.slice(0, 240);
  if (typeof payload !== "object") return payload;
  const summary = {};
  for (const key of Object.keys(payload).slice(0, 12)) {
    const value = payload[key];
    if (value == null) {
      summary[key] = value;
    } else if (typeof value === "string") {
      summary[key] = value.slice(0, 240);
    } else if (typeof value === "number" || typeof value === "boolean") {
      summary[key] = value;
    } else if (Array.isArray(value)) {
      summary[key] = { type: "array", length: value.length };
    } else if (typeof value === "object") {
      summary[key] = { type: "object", keys: Object.keys(value).slice(0, 8) };
    }
  }
  return summary;
}

export class ChangeJournal extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.filePath = opts.filePath || JOURNAL_PATH;
    this.maxEvents = Number.isFinite(opts.maxEvents) ? opts.maxEvents : MAX_EVENTS_DEFAULT;
    this.state = this._load();
  }

  _load() {
    const raw = readJsonSafe(this.filePath, null);
    if (!raw || typeof raw !== "object") {
      return {
        versions: {},
        events: [],
        seq: 0,
        lastUpdated: null,
      };
    }
    return {
      versions: raw.versions && typeof raw.versions === "object" ? raw.versions : {},
      events: Array.isArray(raw.events) ? raw.events.slice(-this.maxEvents) : [],
      seq: Number.isFinite(raw.seq) ? raw.seq : 0,
      lastUpdated: raw.lastUpdated || null,
    };
  }

  _save() {
    this.state.lastUpdated = nowIso();
    writeJsonSafe(this.filePath, this.state);
  }

  emitChange(domain, eventType = "change", payload = null, opts = {}) {
    if (!domain || typeof domain !== "string") {
      throw new Error("domain is required");
    }
    const nextVersion = (this.state.versions[domain] || 0) + 1;
    this.state.versions[domain] = nextVersion;
    this.state.seq += 1;

    const event = {
      id: `chg_${this.state.seq}`,
      seq: this.state.seq,
      ts: nowIso(),
      domain,
      type: eventType || "change",
      version: nextVersion,
      payload: opts.storePayload ? payload : undefined,
      summary: summarizePayload(payload),
      source: opts.source || null,
    };

    this.state.events.push(event);
    if (this.state.events.length > this.maxEvents) {
      this.state.events = this.state.events.slice(-this.maxEvents);
    }
    this._save();

    this.emit("change", event);
    this.emit(`change:${domain}`, event);
    return event;
  }

  bump(domain, payload = null, opts = {}) {
    return this.emitChange(domain, "change", payload, opts);
  }

  getVersions() {
    return { ...this.state.versions };
  }

  getSnapshot() {
    return {
      seq: this.state.seq,
      versions: this.getVersions(),
      lastUpdated: this.state.lastUpdated,
    };
  }

  diffVersions(previous = {}) {
    const changed = [];
    const current = this.state.versions || {};
    const allDomains = new Set([...Object.keys(current), ...Object.keys(previous || {})]);
    for (const domain of allDomains) {
      if ((current[domain] || 0) !== (previous[domain] || 0)) changed.push(domain);
    }
    return changed;
  }

  getRecentEvents(limit = 20) {
    const n = Math.max(0, Number(limit) || 0);
    return this.state.events.slice(-n);
  }

  getEventsSinceSeq(seq = 0, limit = 100) {
    const max = Math.max(1, Number(limit) || 100);
    return this.state.events.filter(e => (e.seq || 0) > seq).slice(-max);
  }

  resetForTests() {
    this.state = { versions: {}, events: [], seq: 0, lastUpdated: null };
    this._save();
  }
}

let _journal;
export function getChangeJournal(opts) {
  if (!_journal) _journal = new ChangeJournal(opts);
  return _journal;
}

export default { ChangeJournal, getChangeJournal };
