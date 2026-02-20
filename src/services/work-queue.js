/**
 * Work Queue — Persistent queue for rate-limited work
 *
 * When Claude is rate-limited, work gets queued instead of dropped.
 * The engine checks this queue on every wake cycle.
 */

import fs from "fs";
import { dataFile } from "./paths.js";

const QUEUE_FILE = dataFile("work-queue.json");
const TAG = "[WorkQueue]";

export class WorkQueue {
  constructor() {
    this._items = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
        this._items = Array.isArray(raw) ? raw : [];
      }
    } catch {
      this._items = [];
    }
  }

  _save() {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this._items, null, 2));
    } catch (err) {
      console.error(`${TAG} Save failed:`, err.message);
    }
  }

  /**
   * Add work item to the queue.
   */
  enqueue({ id, goalId, prompt, priority = 5, source = "unknown", createdAt = null }) {
    const item = {
      id: id || `wq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      goalId,
      prompt,
      priority,
      source,
      createdAt: createdAt || new Date().toISOString(),
      retries: 0,
    };
    this._items.push(item);
    this._save();
    console.log(`${TAG} Enqueued: ${item.id} (priority ${priority}, source: ${source})`);
    return item;
  }

  /**
   * Remove and return the highest-priority item.
   */
  dequeue() {
    if (this._items.length === 0) return null;
    this._items.sort((a, b) => (a.priority || 5) - (b.priority || 5));
    const item = this._items.shift();
    this._save();
    return item;
  }

  /**
   * Peek at the highest-priority item without removing it.
   */
  peek() {
    if (this._items.length === 0) return null;
    this._items.sort((a, b) => (a.priority || 5) - (b.priority || 5));
    return this._items[0];
  }

  size() { return this._items.length; }

  getAll() { return [...this._items]; }

  remove(id) {
    const before = this._items.length;
    this._items = this._items.filter(i => i.id !== id);
    if (this._items.length < before) {
      this._save();
      return true;
    }
    return false;
  }

  /**
   * Increment retry count for an item and re-enqueue.
   */
  retry(item, maxRetries = 3) {
    if ((item.retries || 0) >= maxRetries) {
      console.log(`${TAG} Item ${item.id} exceeded max retries (${maxRetries}), dropping`);
      return false;
    }
    item.retries = (item.retries || 0) + 1;
    item.lastRetryAt = new Date().toISOString();
    this._items.push(item);
    this._save();
    return true;
  }
}

// Singleton
let _instance;
export function getWorkQueue() {
  if (!_instance) _instance = new WorkQueue();
  return _instance;
}

export default { WorkQueue, getWorkQueue };
