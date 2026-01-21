/**
 * Focus Timer Service
 *
 * Pomodoro-style focus sessions with tracking and statistics.
 * Based on Cal Newport's Deep Work and the Pomodoro Technique.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const FOCUS_PATH = path.join(DATA_DIR, "focus-sessions.json");

// Default session configurations
const SESSION_TYPES = {
  pomodoro: { duration: 25, break: 5, label: "Pomodoro" },
  deepWork: { duration: 90, break: 20, label: "Deep Work" },
  short: { duration: 15, break: 3, label: "Quick Focus" },
  custom: { duration: 45, break: 10, label: "Custom" }
};

// Focus categories
const FOCUS_CATEGORIES = {
  coding: { icon: ">", label: "Coding" },
  writing: { icon: "~", label: "Writing" },
  learning: { icon: "*", label: "Learning" },
  planning: { icon: "^", label: "Planning" },
  reading: { icon: "#", label: "Reading" },
  creative: { icon: "@", label: "Creative" },
  other: { icon: "-", label: "Other" }
};

/**
 * Ensure data directory exists
 */
const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load focus data
 */
export const loadFocusData = () => {
  ensureDir();
  try {
    if (fs.existsSync(FOCUS_PATH)) {
      return JSON.parse(fs.readFileSync(FOCUS_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[Focus] Error loading:", err.message);
  }
  return {
    sessions: [],
    currentSession: null,
    settings: {
      defaultType: "pomodoro",
      soundEnabled: false,
      autoBreak: true
    },
    stats: {
      totalSessions: 0,
      totalMinutes: 0,
      longestStreak: 0,
      currentStreak: 0
    }
  };
};

/**
 * Save focus data
 */
export const saveFocusData = (data) => {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(FOCUS_PATH, JSON.stringify(data, null, 2));
  return { success: true };
};

/**
 * Start a focus session
 */
export const startSession = (options = {}) => {
  const data = loadFocusData();

  // Check if there's already an active session
  if (data.currentSession && data.currentSession.status === "active") {
    return { success: false, error: "Session already in progress", current: data.currentSession };
  }

  const type = options.type || data.settings.defaultType;
  const config = SESSION_TYPES[type] || SESSION_TYPES.pomodoro;

  const session = {
    id: `focus-${Date.now()}`,
    type,
    duration: options.duration || config.duration,
    breakDuration: config.break,
    category: options.category || "other",
    task: options.task || null,
    startTime: new Date().toISOString(),
    endTime: null,
    status: "active",
    pausedAt: null,
    totalPausedTime: 0,
    notes: ""
  };

  data.currentSession = session;
  saveFocusData(data);

  return {
    success: true,
    session,
    message: `Focus session started: ${config.label} (${session.duration} minutes)\n${session.task ? `Task: ${session.task}` : ""}`,
    endsAt: new Date(Date.now() + session.duration * 60 * 1000).toLocaleTimeString()
  };
};

/**
 * End the current session
 */
export const endSession = (completed = true, notes = "") => {
  const data = loadFocusData();

  if (!data.currentSession) {
    return { success: false, error: "No active session" };
  }

  const session = data.currentSession;
  session.endTime = new Date().toISOString();
  session.status = completed ? "completed" : "cancelled";
  session.notes = notes;

  // Calculate actual duration
  const startTime = new Date(session.startTime);
  const endTime = new Date(session.endTime);
  const actualMinutes = Math.round((endTime - startTime) / 60000) - session.totalPausedTime;
  session.actualMinutes = Math.max(0, actualMinutes);

  // Save to history
  data.sessions.unshift(session);
  data.sessions = data.sessions.slice(0, 500); // Keep last 500 sessions

  // Update stats
  if (completed) {
    data.stats.totalSessions++;
    data.stats.totalMinutes += session.actualMinutes;

    // Update streak
    const today = new Date().toISOString().split('T')[0];
    const lastSession = data.sessions[1]; // Previous session
    if (lastSession) {
      const lastDate = lastSession.endTime.split('T')[0];
      if (lastDate === today) {
        data.stats.currentStreak++;
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastDate === yesterday.toISOString().split('T')[0]) {
          data.stats.currentStreak++;
        } else {
          data.stats.currentStreak = 1;
        }
      }
    } else {
      data.stats.currentStreak = 1;
    }
    data.stats.longestStreak = Math.max(data.stats.longestStreak, data.stats.currentStreak);
  }

  data.currentSession = null;
  saveFocusData(data);

  return {
    success: true,
    session,
    stats: data.stats,
    message: completed
      ? `Session completed! ${session.actualMinutes} minutes of focused work.`
      : "Session cancelled."
  };
};

/**
 * Pause the current session
 */
export const pauseSession = () => {
  const data = loadFocusData();

  if (!data.currentSession || data.currentSession.status !== "active") {
    return { success: false, error: "No active session to pause" };
  }

  data.currentSession.status = "paused";
  data.currentSession.pausedAt = new Date().toISOString();
  saveFocusData(data);

  return { success: true, message: "Session paused. Use /focus resume to continue." };
};

/**
 * Resume a paused session
 */
export const resumeSession = () => {
  const data = loadFocusData();

  if (!data.currentSession || data.currentSession.status !== "paused") {
    return { success: false, error: "No paused session to resume" };
  }

  const pausedTime = Math.round(
    (new Date() - new Date(data.currentSession.pausedAt)) / 60000
  );
  data.currentSession.totalPausedTime += pausedTime;
  data.currentSession.status = "active";
  data.currentSession.pausedAt = null;
  saveFocusData(data);

  return { success: true, message: `Session resumed. Added ${pausedTime} minutes of pause time.` };
};

/**
 * Get current session status
 */
export const getSessionStatus = () => {
  const data = loadFocusData();

  if (!data.currentSession) {
    return { active: false, session: null };
  }

  const session = data.currentSession;
  const startTime = new Date(session.startTime);
  const now = new Date();
  const elapsedMs = now - startTime - (session.totalPausedTime * 60000);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const remainingMinutes = Math.max(0, session.duration - elapsedMinutes);

  return {
    active: session.status === "active",
    paused: session.status === "paused",
    session,
    elapsed: elapsedMinutes,
    remaining: remainingMinutes,
    progress: Math.min(100, Math.round((elapsedMinutes / session.duration) * 100)),
    isOvertime: remainingMinutes === 0
  };
};

/**
 * Get today's focus stats
 */
export const getTodayStats = () => {
  const data = loadFocusData();
  const today = new Date().toISOString().split('T')[0];

  const todaySessions = data.sessions.filter(s => {
    return s.endTime && s.endTime.split('T')[0] === today && s.status === "completed";
  });

  const totalMinutes = todaySessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0);

  const byCategory = {};
  for (const session of todaySessions) {
    const cat = session.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + (session.actualMinutes || 0);
  }

  return {
    sessions: todaySessions.length,
    totalMinutes,
    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    byCategory,
    currentStreak: data.stats.currentStreak
  };
};

/**
 * Get weekly focus stats
 */
export const getWeeklyStats = () => {
  const data = loadFocusData();
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const weekSessions = data.sessions.filter(s => {
    if (!s.endTime || s.status !== "completed") return false;
    return new Date(s.endTime) >= weekAgo;
  });

  const totalMinutes = weekSessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0);

  // Group by day
  const byDay = {};
  for (const session of weekSessions) {
    const day = session.endTime.split('T')[0];
    byDay[day] = (byDay[day] || 0) + (session.actualMinutes || 0);
  }

  // Group by category
  const byCategory = {};
  for (const session of weekSessions) {
    const cat = session.category || "other";
    byCategory[cat] = (byCategory[cat] || 0) + (session.actualMinutes || 0);
  }

  return {
    sessions: weekSessions.length,
    totalMinutes,
    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    avgPerDay: Math.round(totalMinutes / 7),
    byDay,
    byCategory
  };
};

/**
 * Format focus display for CLI
 */
export const formatFocusDisplay = () => {
  const status = getSessionStatus();
  const todayStats = getTodayStats();
  const weekStats = getWeeklyStats();
  const data = loadFocusData();

  let output = "\n";
  output += "            FOCUS TIMER\n";
  output += "                                                           \n\n";

  // Current session
  if (status.active || status.paused) {
    const progressBar = "█".repeat(Math.floor(status.progress / 10)) +
                        "░".repeat(10 - Math.floor(status.progress / 10));
    output += "CURRENT SESSION:\n";
    output += `  [${progressBar}] ${status.progress}%\n`;
    output += `  ${status.paused ? "PAUSED" : "Active"}: ${status.elapsed}/${status.session.duration} min\n`;
    if (status.session.task) {
      output += `  Task: ${status.session.task}\n`;
    }
    output += `  Remaining: ${status.remaining} minutes\n\n`;
  } else {
    output += "No active session. Use /focus start to begin.\n\n";
  }

  // Today's stats
  output += "TODAY:\n";
  output += `  Sessions: ${todayStats.sessions} | Time: ${todayStats.totalMinutes} min (${todayStats.totalHours} hrs)\n`;
  if (Object.keys(todayStats.byCategory).length > 0) {
    output += "  By category: ";
    output += Object.entries(todayStats.byCategory)
      .map(([cat, mins]) => `${cat}: ${mins}m`)
      .join(", ");
    output += "\n";
  }
  output += "\n";

  // Week stats
  output += "THIS WEEK:\n";
  output += `  Sessions: ${weekStats.sessions} | Total: ${weekStats.totalHours} hrs | Avg: ${weekStats.avgPerDay} min/day\n\n`;

  // Streaks
  output += "STREAKS:\n";
  output += `  Current: ${data.stats.currentStreak} days | Best: ${data.stats.longestStreak} days\n`;
  output += `  All-time: ${data.stats.totalSessions} sessions, ${Math.round(data.stats.totalMinutes / 60)} hours\n\n`;

  // Commands
  output += "Commands:\n";
  output += "  /focus start [task] - Start pomodoro (25 min)\n";
  output += "  /focus deep [task] - Start deep work (90 min)\n";
  output += "  /focus end - Complete current session\n";
  output += "  /focus pause/resume - Pause or resume\n";
  output += "  /focus stats - View detailed statistics\n";

  return output;
};

/**
 * Get focus quick status for status bar
 */
export const getFocusQuickStatus = () => {
  const status = getSessionStatus();

  if (!status.active && !status.paused) {
    return null;
  }

  return {
    active: status.active,
    paused: status.paused,
    remaining: status.remaining,
    progress: status.progress,
    task: status.session?.task
  };
};

export default {
  SESSION_TYPES,
  FOCUS_CATEGORIES,
  loadFocusData,
  startSession,
  endSession,
  pauseSession,
  resumeSession,
  getSessionStatus,
  getTodayStats,
  getWeeklyStats,
  formatFocusDisplay,
  getFocusQuickStatus
};
