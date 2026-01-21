/**
 * Accountability Service
 *
 * Track commitments, set reminders, and maintain accountability
 * for habits and goals through structured check-ins.
 */

import fs from "fs";
import path from "path";
import { getHabitsSummary, getTodayHabits } from "./habits.js";
import { getGoalSummary, loadGoals } from "./goal-extractor.js";
import { isReviewDue } from "./weekly-review.js";

const DATA_DIR = path.join(process.cwd(), "data");
const ACCOUNTABILITY_PATH = path.join(DATA_DIR, "accountability.json");

// Default check-in times (24h format)
const DEFAULT_CHECK_INS = {
  morning: { hour: 8, label: "Morning Check-in" },
  midday: { hour: 12, label: "Midday Progress" },
  evening: { hour: 20, label: "Evening Review" }
};

// Commitment types
const COMMITMENT_TYPES = {
  habit: { icon: "~", label: "Habit" },
  goal: { icon: ">", label: "Goal" },
  task: { icon: "*", label: "Task" },
  deadline: { icon: "!", label: "Deadline" }
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
 * Load accountability data
 */
export const loadAccountability = () => {
  ensureDir();
  try {
    if (fs.existsSync(ACCOUNTABILITY_PATH)) {
      return JSON.parse(fs.readFileSync(ACCOUNTABILITY_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[Accountability] Error loading:", err.message);
  }
  return {
    commitments: [],
    checkIns: [],
    partners: [],
    settings: {
      enabled: true,
      checkInTimes: DEFAULT_CHECK_INS,
      reminderEnabled: true
    },
    lastCheckIn: null,
    streaks: {
      checkIn: 0,
      commitment: 0
    }
  };
};

/**
 * Save accountability data
 */
export const saveAccountability = (data) => {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ACCOUNTABILITY_PATH, JSON.stringify(data, null, 2));
  return { success: true };
};

/**
 * Add a commitment
 */
export const addCommitment = (text, options = {}) => {
  const data = loadAccountability();

  const commitment = {
    id: `commit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    type: options.type || "task",
    dueDate: options.dueDate || null,
    priority: options.priority || "medium",
    linkedGoalId: options.goalId || null,
    linkedHabitId: options.habitId || null,
    createdAt: new Date().toISOString(),
    status: "active",
    progress: 0,
    checkIns: []
  };

  data.commitments.push(commitment);
  saveAccountability(data);

  return { success: true, commitment };
};

/**
 * Update commitment progress
 */
export const updateCommitment = (commitmentId, updates) => {
  const data = loadAccountability();
  const commitment = data.commitments.find(c => c.id === commitmentId);

  if (!commitment) {
    return { success: false, error: "Commitment not found" };
  }

  if (updates.progress !== undefined) {
    commitment.progress = Math.min(100, Math.max(0, updates.progress));
  }
  if (updates.status) {
    commitment.status = updates.status;
  }
  if (updates.note) {
    commitment.checkIns.push({
      timestamp: new Date().toISOString(),
      note: updates.note,
      progress: commitment.progress
    });
  }

  commitment.updatedAt = new Date().toISOString();

  if (commitment.progress >= 100 && commitment.status !== "completed") {
    commitment.status = "completed";
    commitment.completedAt = new Date().toISOString();
  }

  saveAccountability(data);
  return { success: true, commitment };
};

/**
 * Complete a commitment
 */
export const completeCommitment = (commitmentId) => {
  return updateCommitment(commitmentId, { progress: 100, status: "completed" });
};

/**
 * Get active commitments
 */
export const getActiveCommitments = () => {
  const data = loadAccountability();
  return data.commitments.filter(c => c.status === "active");
};

/**
 * Record a check-in
 */
export const recordCheckIn = (type = "general", notes = "") => {
  const data = loadAccountability();
  const today = new Date().toISOString().split('T')[0];

  const checkIn = {
    id: `checkin-${Date.now()}`,
    type,
    timestamp: new Date().toISOString(),
    date: today,
    notes,
    metrics: {
      habitCompletion: getHabitsSummary().completionRate,
      activeCommitments: getActiveCommitments().length,
      goalProgress: getGoalSummary().avgProgress
    }
  };

  data.checkIns.unshift(checkIn);

  // Keep last 100 check-ins
  data.checkIns = data.checkIns.slice(0, 100);

  // Update streak
  const lastDate = data.lastCheckIn ? new Date(data.lastCheckIn).toISOString().split('T')[0] : null;
  if (lastDate === today) {
    // Same day, no streak change
  } else {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastDate === yesterdayStr) {
      data.streaks.checkIn = (data.streaks.checkIn || 0) + 1;
    } else {
      data.streaks.checkIn = 1;
    }
  }

  data.lastCheckIn = checkIn.timestamp;
  saveAccountability(data);

  return { success: true, checkIn, streak: data.streaks.checkIn };
};

/**
 * Get today's check-in status
 */
export const getTodayCheckInStatus = () => {
  const data = loadAccountability();
  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();

  const todayCheckIns = data.checkIns.filter(c => c.date === today);

  // Determine what check-ins are due
  const dueCheckIns = [];
  for (const [name, config] of Object.entries(data.settings?.checkInTimes || DEFAULT_CHECK_INS)) {
    if (currentHour >= config.hour) {
      const alreadyDone = todayCheckIns.some(c => c.type === name);
      if (!alreadyDone) {
        dueCheckIns.push({ type: name, label: config.label, hour: config.hour });
      }
    }
  }

  return {
    completed: todayCheckIns.length,
    due: dueCheckIns,
    checkIns: todayCheckIns,
    streak: data.streaks?.checkIn || 0
  };
};

/**
 * Generate accountability status report
 */
export const getAccountabilityStatus = () => {
  const data = loadAccountability();
  const activeCommitments = getActiveCommitments();
  const checkInStatus = getTodayCheckInStatus();
  const habitsSummary = getHabitsSummary();
  const goalsSummary = getGoalSummary();

  // Find overdue commitments
  const today = new Date();
  const overdue = activeCommitments.filter(c => {
    if (!c.dueDate) return false;
    return new Date(c.dueDate) < today;
  });

  // Find commitments due soon (next 3 days)
  const dueSoon = activeCommitments.filter(c => {
    if (!c.dueDate) return false;
    const dueDate = new Date(c.dueDate);
    const daysUntil = (dueDate - today) / (1000 * 60 * 60 * 24);
    return daysUntil > 0 && daysUntil <= 3;
  });

  // Calculate accountability score
  let score = 50;
  if (checkInStatus.completed > 0) score += 15;
  if (habitsSummary.completionRate > 70) score += 15;
  if (overdue.length === 0) score += 10;
  if (data.streaks?.checkIn > 7) score += 10;
  score = Math.min(100, score);

  return {
    score,
    commitments: {
      active: activeCommitments.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      completed: data.commitments.filter(c => c.status === "completed").length
    },
    checkIns: checkInStatus,
    streaks: data.streaks,
    habits: {
      completionRate: habitsSummary.completionRate,
      bestStreak: habitsSummary.longestCurrentStreak
    },
    alerts: generateAccountabilityAlerts(data, overdue, dueSoon, habitsSummary)
  };
};

/**
 * Generate alerts for accountability
 */
const generateAccountabilityAlerts = (data, overdue, dueSoon, habitsSummary) => {
  const alerts = [];

  // Overdue commitments
  if (overdue.length > 0) {
    alerts.push({
      type: "urgent",
      message: `${overdue.length} overdue commitment${overdue.length > 1 ? "s" : ""}!`,
      priority: 1
    });
  }

  // Due soon
  if (dueSoon.length > 0) {
    alerts.push({
      type: "warning",
      message: `${dueSoon.length} commitment${dueSoon.length > 1 ? "s" : ""} due in 3 days`,
      priority: 2
    });
  }

  // Low habit completion late in day
  const hour = new Date().getHours();
  if (hour >= 18 && habitsSummary.completionRate < 50) {
    alerts.push({
      type: "reminder",
      message: `Only ${habitsSummary.completionRate}% habits done today`,
      priority: 2
    });
  }

  // Check-in due
  const checkInStatus = getTodayCheckInStatus();
  if (checkInStatus.due.length > 0) {
    alerts.push({
      type: "info",
      message: `${checkInStatus.due[0].label} check-in due`,
      priority: 3
    });
  }

  // Review reminder
  if (isReviewDue()) {
    alerts.push({
      type: "info",
      message: "Weekly review is due",
      priority: 3
    });
  }

  return alerts.sort((a, b) => a.priority - b.priority);
};

/**
 * Add accountability partner
 */
export const addPartner = (name, contact, type = "email") => {
  const data = loadAccountability();

  const partner = {
    id: `partner-${Date.now()}`,
    name,
    contact,
    type, // email, phone, app
    addedAt: new Date().toISOString(),
    active: true,
    notifyOn: ["missed_checkin", "overdue_commitment", "weekly_summary"]
  };

  data.partners.push(partner);
  saveAccountability(data);

  return { success: true, partner };
};

/**
 * Get all partners
 */
export const getPartners = () => {
  const data = loadAccountability();
  return data.partners.filter(p => p.active);
};

/**
 * Format accountability display for CLI
 */
export const formatAccountabilityDisplay = () => {
  const status = getAccountabilityStatus();
  const commitments = getActiveCommitments();
  const partners = getPartners();

  let output = "\n";
  output += "            ACCOUNTABILITY\n";
  output += "                                                           \n\n";

  // Score
  const scoreBar = "█".repeat(Math.floor(status.score / 10)) +
                   "░".repeat(10 - Math.floor(status.score / 10));
  output += `Score: [${scoreBar}] ${status.score}%\n\n`;

  // Check-in status
  output += "CHECK-IN STATUS:\n";
  output += `  Today: ${status.checkIns.completed} completed | Streak: ${status.streaks.checkIn} days\n`;
  if (status.checkIns.due.length > 0) {
    output += `  Due now: ${status.checkIns.due.map(d => d.label).join(", ")}\n`;
  }
  output += "\n";

  // Commitments
  output += "COMMITMENTS:\n";
  output += `  Active: ${status.commitments.active} | Overdue: ${status.commitments.overdue} | Due Soon: ${status.commitments.dueSoon}\n`;

  if (commitments.length > 0) {
    output += "\n  Active:\n";
    commitments.slice(0, 5).forEach((c, i) => {
      const typeInfo = COMMITMENT_TYPES[c.type] || COMMITMENT_TYPES.task;
      const progressBar = "█".repeat(Math.floor(c.progress / 20)) + "░".repeat(5 - Math.floor(c.progress / 20));
      output += `  ${i + 1}. ${typeInfo.icon} ${c.text.slice(0, 40)}${c.text.length > 40 ? "..." : ""}\n`;
      output += `     [${progressBar}] ${c.progress}%`;
      if (c.dueDate) {
        output += ` | Due: ${new Date(c.dueDate).toLocaleDateString()}`;
      }
      output += "\n";
    });
  }
  output += "\n";

  // Alerts
  if (status.alerts.length > 0) {
    output += "ALERTS:\n";
    status.alerts.slice(0, 3).forEach(alert => {
      const icon = alert.type === "urgent" ? "!" : alert.type === "warning" ? "*" : ">";
      output += `  ${icon} ${alert.message}\n`;
    });
    output += "\n";
  }

  // Partners
  if (partners.length > 0) {
    output += "PARTNERS:\n";
    partners.forEach(p => {
      output += `  @ ${p.name} (${p.type})\n`;
    });
    output += "\n";
  }

  output += "Commands:\n";
  output += "  /account checkin [notes] - Record check-in\n";
  output += "  /account commit <text> - Add commitment\n";
  output += "  /account done <#> - Complete commitment\n";
  output += "  /account partner <name> <email> - Add partner\n";

  return output;
};

/**
 * Get morning briefing for accountability
 */
export const getMorningBriefing = () => {
  const status = getAccountabilityStatus();
  const habits = getTodayHabits();
  const goals = loadGoals().goals || [];
  const activeGoals = goals.filter(g => g.status === "active").slice(0, 3);

  let briefing = "MORNING BRIEFING\n\n";

  // Today's habits
  briefing += `${habits.length} habits to complete today:\n`;
  const morningHabits = habits.filter(h => h.timeOfDay === "morning").slice(0, 3);
  morningHabits.forEach(h => {
    briefing += `  - ${h.title}\n`;
  });
  if (habits.length > morningHabits.length) {
    briefing += `  ...and ${habits.length - morningHabits.length} more\n`;
  }
  briefing += "\n";

  // Active commitments
  const commitments = getActiveCommitments();
  if (commitments.length > 0) {
    briefing += `${commitments.length} active commitment${commitments.length > 1 ? "s" : ""}:\n`;
    commitments.slice(0, 3).forEach(c => {
      briefing += `  - ${c.text.slice(0, 50)}\n`;
    });
    briefing += "\n";
  }

  // Top goals
  if (activeGoals.length > 0) {
    briefing += "Focus on these goals:\n";
    activeGoals.forEach(g => {
      briefing += `  - ${g.title.slice(0, 50)} (${Math.round((g.progress || 0) * 100)}%)\n`;
    });
    briefing += "\n";
  }

  // Alerts
  if (status.alerts.length > 0) {
    briefing += "Alerts:\n";
    status.alerts.forEach(a => {
      briefing += `  ! ${a.message}\n`;
    });
  }

  return briefing;
};

export default {
  loadAccountability,
  addCommitment,
  updateCommitment,
  completeCommitment,
  getActiveCommitments,
  recordCheckIn,
  getTodayCheckInStatus,
  getAccountabilityStatus,
  addPartner,
  getPartners,
  formatAccountabilityDisplay,
  getMorningBriefing
};
