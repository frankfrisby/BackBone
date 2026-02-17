/**
 * Work Priority Tracker
 *
 * Tracks what the user is asking about and prioritizes work accordingly.
 * When the user mentions a goal/project, it gets bumped to the top.
 * The engine and idle processor should check this list to know what to work on next.
 *
 * Stored in data/work-priorities.json, survives restarts.
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const PRIORITIES_PATH = path.join(getDataDir(), "work-priorities.json");
const MAX_ITEMS = 20;

/**
 * Load the current priority list
 * @returns {{ items: Array, lastUpdated: string }}
 */
export function loadPriorities() {
  try {
    if (fs.existsSync(PRIORITIES_PATH)) {
      return JSON.parse(fs.readFileSync(PRIORITIES_PATH, "utf-8"));
    }
  } catch {}
  return { items: [], lastUpdated: null };
}

/**
 * Save the priority list
 */
function savePriorities(data) {
  data.lastUpdated = new Date().toISOString();
  // Keep only the top N items
  data.items = data.items.slice(0, MAX_ITEMS);
  fs.writeFileSync(PRIORITIES_PATH, JSON.stringify(data, null, 2));
}

/**
 * Bump an item to the top of the priority list.
 * If it already exists, move it up and increment the mention count.
 * If new, add it at the top.
 *
 * @param {Object} item - { type: "goal"|"project"|"research", id, title, source }
 */
export function bumpPriority(item) {
  const data = loadPriorities();
  const key = item.id || item.title;

  // Find existing
  const existingIdx = data.items.findIndex(i => (i.id || i.title) === key);

  if (existingIdx >= 0) {
    // Move to top and update
    const existing = data.items.splice(existingIdx, 1)[0];
    existing.mentions = (existing.mentions || 1) + 1;
    existing.lastMentioned = new Date().toISOString();
    existing.source = item.source || existing.source;
    data.items.unshift(existing);
  } else {
    // Add new at top
    data.items.unshift({
      type: item.type,
      id: item.id || null,
      title: item.title,
      source: item.source || "whatsapp",
      mentions: 1,
      firstMentioned: new Date().toISOString(),
      lastMentioned: new Date().toISOString(),
      status: "active",
      findings: null
    });
  }

  savePriorities(data);
  return data.items[0];
}

/**
 * Mark an item as having findings ready
 */
export function markFindingsReady(id, summary) {
  const data = loadPriorities();
  const item = data.items.find(i => i.id === id || i.title === id);
  if (item) {
    item.findings = summary?.slice(0, 200) || "Ready";
    item.findingsAt = new Date().toISOString();
    savePriorities(data);
  }
}

/**
 * Get the top N priorities (what should the engine work on?)
 */
export function getTopPriorities(n = 5) {
  const data = loadPriorities();
  return data.items
    .filter(i => i.status === "active")
    .slice(0, n);
}

/**
 * Mark an item as completed/resolved
 */
export function completePriority(id) {
  const data = loadPriorities();
  const item = data.items.find(i => i.id === id || i.title === id);
  if (item) {
    item.status = "completed";
    item.completedAt = new Date().toISOString();
    savePriorities(data);
  }
}

/**
 * Get the full priority list for display
 */
export function getAllPriorities() {
  return loadPriorities();
}

export default {
  loadPriorities,
  bumpPriority,
  markFindingsReady,
  getTopPriorities,
  completePriority,
  getAllPriorities
};
