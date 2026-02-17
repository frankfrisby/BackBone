/**
 * Attention Agent — Focus monitoring and productivity nudges
 *
 * Tracks focus sessions, detects when the user may be distracted,
 * and sends WhatsApp nudges to help them re-engage.
 *
 * Lightweight: reads Oura readiness + activity data, compares
 * against the user's calendar, and provides focus recommendations.
 *
 * State persisted to agent memory directory.
 */

import fs from "fs";
import path from "path";
import { getAgentMemoryDir } from "./agent-loader.js";

const AGENT_ID = "attention-agent";

/**
 * Load attention state.
 */
export function loadState() {
  const stateFile = path.join(getAgentMemoryDir(AGENT_ID), "state.json");
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    }
  } catch {}
  return {
    focusSessions: [],
    dailyStats: {},
    lastNudge: null,
    nudgeCount: 0,
    lastUpdated: null,
  };
}

/**
 * Save attention state.
 */
export function saveState(state) {
  const memDir = getAgentMemoryDir(AGENT_ID);
  const stateFile = path.join(memDir, "state.json");
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Start a focus session.
 */
export function startFocusSession(task, durationMinutes = 25) {
  const state = loadState();
  const session = {
    id: `focus_${Date.now()}`,
    task,
    startedAt: new Date().toISOString(),
    targetMinutes: durationMinutes,
    completed: false,
  };
  state.focusSessions.push(session);
  saveState(state);
  return session.id;
}

/**
 * End a focus session.
 */
export function endFocusSession(sessionId, completed = true) {
  const state = loadState();
  const session = state.focusSessions.find(s => s.id === sessionId);
  if (!session) return false;

  session.endedAt = new Date().toISOString();
  session.completed = completed;
  session.actualMinutes = Math.round(
    (new Date(session.endedAt) - new Date(session.startedAt)) / 60000
  );

  // Update daily stats
  const today = new Date().toISOString().slice(0, 10);
  if (!state.dailyStats[today]) {
    state.dailyStats[today] = { sessions: 0, totalMinutes: 0, completed: 0 };
  }
  state.dailyStats[today].sessions++;
  state.dailyStats[today].totalMinutes += session.actualMinutes;
  if (completed) state.dailyStats[today].completed++;

  saveState(state);
  return true;
}

/**
 * Check if a nudge should be sent (max 3/day, min 2h apart).
 */
export function shouldNudge() {
  const state = loadState();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = state.dailyStats[today] || { sessions: 0 };

  // Max 3 nudges per day
  if (state.nudgeCount >= 3) return false;

  // At least 2 hours since last nudge
  if (state.lastNudge) {
    const elapsed = now - new Date(state.lastNudge).getTime();
    if (elapsed < 2 * 60 * 60 * 1000) return false;
  }

  // Only nudge during productive hours (8AM - 9PM)
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 21) return false;

  return true;
}

/**
 * Record that a nudge was sent.
 */
export function recordNudge() {
  const state = loadState();
  state.lastNudge = new Date().toISOString();
  state.nudgeCount++;
  saveState(state);
}

/**
 * Reset daily nudge counter (call at midnight or start of day).
 */
export function resetDailyNudges() {
  const state = loadState();
  state.nudgeCount = 0;
  saveState(state);
}

/**
 * Get focus recommendations based on time of day and readiness.
 */
export function getFocusRecommendation(readinessScore = null) {
  const hour = new Date().getHours();
  const state = loadState();
  const today = new Date().toISOString().slice(0, 10);
  const todayStats = state.dailyStats[today] || { sessions: 0, totalMinutes: 0 };

  let recommendation = "";

  if (readinessScore !== null && readinessScore < 60) {
    recommendation = "Low readiness today. Focus on light tasks — review, planning, reading. Save deep work for a better day.";
  } else if (hour >= 8 && hour <= 11) {
    recommendation = "Peak morning hours. Tackle your hardest, most important task now.";
  } else if (hour >= 13 && hour <= 15) {
    recommendation = "Post-lunch dip. Try a 25-min focused sprint or a quick walk first.";
  } else if (hour >= 16 && hour <= 18) {
    recommendation = "Late afternoon. Good for creative work, brainstorming, or wrapping up tasks.";
  } else {
    recommendation = "Wind-down time. Review today's progress, plan tomorrow, then disconnect.";
  }

  if (todayStats.totalMinutes >= 180) {
    recommendation += " Great focus today — you've logged 3+ hours of deep work.";
  }

  return recommendation;
}

/**
 * Append a journal entry.
 */
export function appendJournal(entry) {
  const memDir = getAgentMemoryDir(AGENT_ID);
  const journalFile = path.join(memDir, "journal.md");
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  fs.appendFileSync(journalFile, `\n## ${timestamp}\n${entry}\n`);
}
