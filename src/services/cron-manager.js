/**
 * Cron Manager Service
 *
 * Centralized management of all scheduled jobs (cron jobs).
 * Handles daily, weekly, monthly schedules with specific times.
 * Persists job state and provides status for UI display.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const CRON_STATE_PATH = path.join(DATA_DIR, "cron-jobs.json");

/**
 * Job frequency types
 */
export const JOB_FREQUENCY = {
  ONCE: "once",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  CUSTOM: "custom"  // Custom cron expression
};

/**
 * Job status
 */
export const JOB_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed"
};

/**
 * Days of week for weekly jobs
 */
export const DAYS_OF_WEEK = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6
};

/**
 * Default job definitions
 */
const DEFAULT_JOBS = [
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    shortName: "Briefing",
    description: "Daily morning summary of tasks, calendar, and priorities",
    frequency: JOB_FREQUENCY.DAILY,
    time: "08:30",
    enabled: true,
    handler: "runMorningBriefing"
  },
  {
    id: "stock-analysis",
    name: "Stock List Analysis",
    shortName: "Stock List",
    description: "Analyze watched stocks and market conditions",
    frequency: JOB_FREQUENCY.DAILY,
    time: "09:00",
    enabled: true,
    handler: "runStockAnalysis"
  },
  {
    id: "project-updates",
    name: "Project Updates",
    shortName: "Projects",
    description: "Check and update project status",
    frequency: JOB_FREQUENCY.DAILY,
    time: "10:00",
    enabled: true,
    handler: "runProjectUpdates"
  },
  {
    id: "linkedin-sync",
    name: "LinkedIn Sync",
    shortName: "LinkedIn",
    description: "Sync LinkedIn profile and connections",
    frequency: JOB_FREQUENCY.WEEKLY,
    dayOfWeek: DAYS_OF_WEEK.MONDAY,
    time: "09:00",
    enabled: true,
    handler: "runLinkedInSync"
  },
  {
    id: "health-review",
    name: "Health Review",
    shortName: "Health",
    description: "Review health metrics from Oura",
    frequency: JOB_FREQUENCY.DAILY,
    time: "07:00",
    enabled: true,
    handler: "runHealthReview"
  },
  {
    id: "weekly-summary",
    name: "Weekly Summary",
    shortName: "Summary",
    description: "Generate weekly progress summary",
    frequency: JOB_FREQUENCY.WEEKLY,
    dayOfWeek: DAYS_OF_WEEK.SUNDAY,
    time: "18:00",
    enabled: true,
    handler: "runWeeklySummary"
  },
  {
    id: "monthly-goals",
    name: "Monthly Goals Review",
    shortName: "Goals",
    description: "Review and update monthly goals",
    frequency: JOB_FREQUENCY.MONTHLY,
    dayOfMonth: 1,
    time: "09:00",
    enabled: true,
    handler: "runMonthlyGoals"
  },
  {
    id: "evening-wrap",
    name: "Evening Wrap-up",
    shortName: "Wrap-up",
    description: "End of day summary and next day prep",
    frequency: JOB_FREQUENCY.DAILY,
    time: "18:00",
    enabled: true,
    handler: "runEveningWrap"
  },
  {
    id: "market-close",
    name: "Market Close Analysis",
    shortName: "Market",
    description: "End of day market analysis",
    frequency: JOB_FREQUENCY.DAILY,
    time: "16:30",
    enabled: true,
    handler: "runMarketClose",
    weekdaysOnly: true
  },
  {
    id: "data-cleanup",
    name: "Data Cleanup",
    shortName: "Cleanup",
    description: "Clean up old data and logs",
    frequency: JOB_FREQUENCY.WEEKLY,
    dayOfWeek: DAYS_OF_WEEK.SATURDAY,
    time: "03:00",
    enabled: true,
    handler: "runDataCleanup"
  }
];

/**
 * Cron Manager Class
 */
class CronManager extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.jobHistory = [];
    this.timers = new Map();
    this.isRunning = false;
    this.checkInterval = null;
    this.lastCheck = null;

    this._loadState();
    this._initializeDefaultJobs();
  }

  /**
   * Load persisted state
   */
  _loadState() {
    try {
      if (fs.existsSync(CRON_STATE_PATH)) {
        const data = JSON.parse(fs.readFileSync(CRON_STATE_PATH, "utf8"));

        // Restore jobs
        if (data.jobs) {
          data.jobs.forEach(job => {
            this.jobs.set(job.id, job);
          });
        }

        // Restore history (last 100 entries)
        if (data.history) {
          this.jobHistory = data.history.slice(-100);
        }
      }
    } catch (error) {
      console.error("[CronManager] Error loading state:", error.message);
    }
  }

  /**
   * Save state to disk
   */
  _saveState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const data = {
        jobs: Array.from(this.jobs.values()),
        history: this.jobHistory.slice(-100),
        lastSaved: new Date().toISOString()
      };

      fs.writeFileSync(CRON_STATE_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("[CronManager] Error saving state:", error.message);
    }
  }

  /**
   * Initialize default jobs if not already present
   */
  _initializeDefaultJobs() {
    DEFAULT_JOBS.forEach(jobDef => {
      if (!this.jobs.has(jobDef.id)) {
        const job = {
          ...jobDef,
          status: JOB_STATUS.ACTIVE,
          lastRun: null,
          nextRun: null,
          runCount: 0,
          failCount: 0,
          createdAt: new Date().toISOString()
        };
        job.nextRun = this._calculateNextRun(job);
        this.jobs.set(job.id, job);
      } else {
        // Update next run time for existing jobs
        const job = this.jobs.get(jobDef.id);
        if (job.enabled && job.status === JOB_STATUS.ACTIVE) {
          job.nextRun = this._calculateNextRun(job);
          this.jobs.set(job.id, job);
        }
      }
    });

    this._saveState();
  }

  /**
   * Calculate next run time for a job
   */
  _calculateNextRun(job) {
    if (!job.enabled || job.status === JOB_STATUS.PAUSED) {
      return null;
    }

    const now = new Date();
    const [hours, minutes] = (job.time || "09:00").split(":").map(Number);
    let nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);

    switch (job.frequency) {
      case JOB_FREQUENCY.DAILY:
        // If time has passed today, schedule for tomorrow
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        // Skip weekends if weekdaysOnly
        if (job.weekdaysOnly) {
          while (nextRun.getDay() === 0 || nextRun.getDay() === 6) {
            nextRun.setDate(nextRun.getDate() + 1);
          }
        }
        break;

      case JOB_FREQUENCY.WEEKLY:
        const targetDay = job.dayOfWeek ?? DAYS_OF_WEEK.MONDAY;
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil < 0 || (daysUntil === 0 && nextRun <= now)) {
          daysUntil += 7;
        }
        nextRun.setDate(now.getDate() + daysUntil);
        nextRun.setHours(hours, minutes, 0, 0);
        break;

      case JOB_FREQUENCY.MONTHLY:
        const targetDate = job.dayOfMonth ?? 1;
        nextRun.setDate(targetDate);
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        nextRun.setHours(hours, minutes, 0, 0);
        break;

      case JOB_FREQUENCY.ONCE:
        if (job.scheduledFor) {
          nextRun = new Date(job.scheduledFor);
          if (nextRun <= now) {
            return null; // Already passed
          }
        }
        break;

      default:
        return null;
    }

    return nextRun.toISOString();
  }

  /**
   * Start the cron manager
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Check every minute
    this.checkInterval = setInterval(() => this._checkJobs(), 60000);

    // Initial check
    this._checkJobs();

    this.emit("started");
  }

  /**
   * Stop the cron manager
   */
  stop() {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    this.emit("stopped");
  }

  /**
   * Check and run due jobs
   */
  _checkJobs() {
    const now = new Date();
    this.lastCheck = now.toISOString();

    this.jobs.forEach((job, id) => {
      if (!job.enabled || job.status !== JOB_STATUS.ACTIVE) return;
      if (!job.nextRun) return;

      const nextRun = new Date(job.nextRun);

      // Allow 30 second window for job execution
      if (nextRun <= now && (now - nextRun) < 30000) {
        this._executeJob(job);
      }
    });
  }

  /**
   * Execute a job
   */
  async _executeJob(job) {
    if (job.status === JOB_STATUS.RUNNING) return;

    const startTime = new Date();
    job.status = JOB_STATUS.RUNNING;
    this.jobs.set(job.id, job);

    this.emit("job:start", { jobId: job.id, job });

    try {
      // Emit event for handler
      this.emit(`run:${job.handler}`, { job });

      // Update job state
      job.status = JOB_STATUS.ACTIVE;
      job.lastRun = startTime.toISOString();
      job.runCount = (job.runCount || 0) + 1;
      job.nextRun = this._calculateNextRun(job);
      job.lastResult = "success";

      // Record history
      this.jobHistory.push({
        jobId: job.id,
        jobName: job.name,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        status: "success"
      });

      this.emit("job:complete", { jobId: job.id, job });
    } catch (error) {
      job.status = JOB_STATUS.ACTIVE;
      job.failCount = (job.failCount || 0) + 1;
      job.lastError = error.message;
      job.lastResult = "failed";
      job.nextRun = this._calculateNextRun(job);

      this.jobHistory.push({
        jobId: job.id,
        jobName: job.name,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        status: "failed",
        error: error.message
      });

      this.emit("job:error", { jobId: job.id, job, error });
    }

    this.jobs.set(job.id, job);
    this._saveState();
  }

  /**
   * Add a new job
   */
  addJob(jobConfig) {
    const job = {
      id: jobConfig.id || `job_${Date.now()}`,
      name: jobConfig.name,
      shortName: jobConfig.shortName || jobConfig.name.split(" ").slice(0, 2).join(" "),
      description: jobConfig.description || "",
      frequency: jobConfig.frequency || JOB_FREQUENCY.DAILY,
      time: jobConfig.time || "09:00",
      dayOfWeek: jobConfig.dayOfWeek,
      dayOfMonth: jobConfig.dayOfMonth,
      weekdaysOnly: jobConfig.weekdaysOnly || false,
      enabled: jobConfig.enabled !== false,
      handler: jobConfig.handler || "customJob",
      status: JOB_STATUS.ACTIVE,
      lastRun: null,
      nextRun: null,
      runCount: 0,
      failCount: 0,
      createdAt: new Date().toISOString(),
      metadata: jobConfig.metadata || {}
    };

    job.nextRun = this._calculateNextRun(job);
    this.jobs.set(job.id, job);
    this._saveState();

    this.emit("job:added", { job });
    return job;
  }

  /**
   * Remove a job
   */
  removeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    this.jobs.delete(jobId);
    this._saveState();

    this.emit("job:removed", { jobId, job });
    return true;
  }

  /**
   * Update a job
   */
  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    Object.assign(job, updates);
    job.nextRun = this._calculateNextRun(job);
    this.jobs.set(jobId, job);
    this._saveState();

    this.emit("job:updated", { jobId, job });
    return job;
  }

  /**
   * Enable/disable a job
   */
  setJobEnabled(jobId, enabled) {
    return this.updateJob(jobId, { enabled });
  }

  /**
   * Pause/resume a job
   */
  setJobPaused(jobId, paused) {
    return this.updateJob(jobId, {
      status: paused ? JOB_STATUS.PAUSED : JOB_STATUS.ACTIVE
    });
  }

  /**
   * Run a job immediately
   */
  runJobNow(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    this._executeJob(job);
    return true;
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get enabled jobs
   */
  getEnabledJobs() {
    return this.getAllJobs().filter(job => job.enabled);
  }

  /**
   * Get jobs scheduled for today
   */
  getJobsToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.getEnabledJobs().filter(job => {
      if (!job.nextRun) return false;
      const nextRun = new Date(job.nextRun);
      return nextRun >= today && nextRun < tomorrow;
    });
  }

  /**
   * Get the next job to run
   */
  getNextJob() {
    const enabledJobs = this.getEnabledJobs()
      .filter(job => job.nextRun && job.status === JOB_STATUS.ACTIVE)
      .sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun));

    return enabledJobs[0] || null;
  }

  /**
   * Get job count for today
   */
  getTodayJobCount() {
    return this.getJobsToday().length;
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const todayJobs = this.getJobsToday();
    const nextJob = this.getNextJob();
    const completedToday = this.jobHistory.filter(h => {
      const runDate = new Date(h.startTime);
      const today = new Date();
      return runDate.toDateString() === today.toDateString();
    });

    return {
      totalJobs: this.jobs.size,
      enabledJobs: this.getEnabledJobs().length,
      todayCount: todayJobs.length,
      completedToday: completedToday.length,
      nextJob: nextJob ? {
        id: nextJob.id,
        name: nextJob.name,
        shortName: nextJob.shortName,
        time: nextJob.nextRun ? new Date(nextJob.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        nextRun: nextJob.nextRun
      } : null,
      todayJobs: todayJobs.map(j => ({
        id: j.id,
        name: j.name,
        shortName: j.shortName,
        time: j.nextRun ? new Date(j.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        status: j.status
      })),
      recentHistory: this.jobHistory.slice(-5).reverse()
    };
  }

  /**
   * Get job by ID
   */
  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }
}

// Singleton instance
let cronManagerInstance = null;

/**
 * Get the cron manager instance
 */
export const getCronManager = () => {
  if (!cronManagerInstance) {
    cronManagerInstance = new CronManager();
  }
  return cronManagerInstance;
};

/**
 * Initialize and start the cron manager
 */
export const initCronManager = () => {
  const manager = getCronManager();
  manager.start();
  return manager;
};

export default getCronManager;
