/**
 * Notifications Service
 *
 * Sends email notifications with daily digests, weekly reports,
 * and important alerts to keep you informed about your progress.
 */

import fs from "fs";
import path from "path";
import { generateDailyInsights, generateWeeklyReport } from "../research/insights-engine.js";
import { getDailyWisdom } from "../mentors.js";
import { getSuggestedActions } from "../data-freshness-checker.js";

import { getDataDir } from "../paths.js";
// Lazy load nodemailer to avoid import errors if not installed
let nodemailer = null;
const getNodemailer = async () => {
  if (nodemailer === null) {
    try {
      const module = await import("nodemailer");
      nodemailer = module.default || module;
    } catch (err) {
      console.log("[Notifications] nodemailer not installed. Run: npm install nodemailer");
      nodemailer = false;
    }
  }
  return nodemailer;
};

const DATA_DIR = getDataDir();
const NOTIFICATIONS_LOG_PATH = path.join(DATA_DIR, "notifications-log.json");

/**
 * Notification types
 */
export const NOTIFICATION_TYPES = {
  DAILY_DIGEST: "daily_digest",
  WEEKLY_REPORT: "weekly_report",
  ALERT: "alert",
  GOAL_REMINDER: "goal_reminder",
  ACTION_SUGGESTED: "action_suggested"
};

/**
 * Get email configuration from environment
 */
export const getEmailConfig = () => {
  return {
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
      }
    },
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || "backbone@example.com",
    to: process.env.EMAIL_TO || process.env.USER_EMAIL,
    enabled: Boolean(
      (process.env.SMTP_USER || process.env.EMAIL_USER) &&
      (process.env.SMTP_PASS || process.env.EMAIL_PASS)
    )
  };
};

/**
 * Create email transporter
 */
const createTransporter = async () => {
  const config = getEmailConfig();
  if (!config.enabled) {
    return null;
  }

  const mailer = await getNodemailer();
  if (!mailer) {
    return null;
  }

  return mailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.auth
  });
};

/**
 * Load notification log
 */
const loadNotificationLog = () => {
  try {
    if (fs.existsSync(NOTIFICATIONS_LOG_PATH)) {
      return JSON.parse(fs.readFileSync(NOTIFICATIONS_LOG_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[Notifications] Error loading log:", err.message);
  }
  return { sent: [], lastDaily: null, lastWeekly: null };
};

/**
 * Save notification log
 */
const saveNotificationLog = (log) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(NOTIFICATIONS_LOG_PATH, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error("[Notifications] Error saving log:", err.message);
  }
};

/**
 * Format daily digest email
 */
const formatDailyDigestEmail = (insights, wisdom, actions) => {
  const subject = `BACKBONE Daily Digest - ${new Date().toLocaleDateString()}`;

  let html = `
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #1a1a2e; color: #fff; padding: 20px; text-align: center; }
        .header h1 { margin: 0; color: #f59e0b; }
        .section { padding: 20px; border-bottom: 1px solid #eee; }
        .score { display: inline-block; padding: 8px 16px; border-radius: 4px; margin: 4px; }
        .score-high { background: #dcfce7; color: #166534; }
        .score-medium { background: #fef3c7; color: #92400e; }
        .score-low { background: #fee2e2; color: #991b1b; }
        .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 8px 0; }
        .recommendation { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 12px; margin: 8px 0; }
        .wisdom { background: #faf5ff; border-left: 4px solid #a855f7; padding: 12px; margin: 8px 0; font-style: italic; }
        .action-item { background: #f0fdf4; padding: 8px 12px; margin: 4px 0; border-radius: 4px; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>BACKBONE</h1>
        <p>Your Daily Progress Digest</p>
      </div>
  `;

  // Life Scores Section
  html += `
    <div class="section">
      <h2>Life Scores</h2>
      <p>
        <span class="score ${insights.scores.overall >= 70 ? 'score-high' : insights.scores.overall >= 50 ? 'score-medium' : 'score-low'}">
          Overall: ${insights.scores.overall || '--'}/100
        </span>
      </p>
      <p>
        <span class="score ${insights.scores.finance >= 70 ? 'score-high' : insights.scores.finance >= 50 ? 'score-medium' : 'score-low'}">Finance: ${insights.scores.finance || '--'}</span>
        <span class="score ${insights.scores.health >= 70 ? 'score-high' : insights.scores.health >= 50 ? 'score-medium' : 'score-low'}">Health: ${insights.scores.health || '--'}</span>
        <span class="score ${insights.scores.career >= 70 ? 'score-high' : insights.scores.career >= 50 ? 'score-medium' : 'score-low'}">Career: ${insights.scores.career || '--'}</span>
        <span class="score ${insights.scores.growth >= 70 ? 'score-high' : insights.scores.growth >= 50 ? 'score-medium' : 'score-low'}">Growth: ${insights.scores.growth || '--'}</span>
      </p>
    </div>
  `;

  // Alerts Section
  if (insights.alerts && insights.alerts.length > 0) {
    html += `<div class="section"><h2>Alerts</h2>`;
    insights.alerts.forEach(alert => {
      html += `<div class="alert">${alert}</div>`;
    });
    html += `</div>`;
  }

  // Recommendations Section
  if (insights.recommendations && insights.recommendations.length > 0) {
    html += `<div class="section"><h2>Today's Recommendations</h2>`;
    insights.recommendations.forEach(rec => {
      html += `
        <div class="recommendation">
          <strong>[${rec.area.toUpperCase()}]</strong> ${rec.action}
          ${rec.mentorTip ? `<br><small>${rec.mentorTip}</small>` : ''}
        </div>
      `;
    });
    html += `</div>`;
  }

  // Suggested Actions
  if (actions && actions.length > 0) {
    html += `<div class="section"><h2>Suggested Actions</h2>`;
    actions.slice(0, 5).forEach((action, i) => {
      html += `<div class="action-item">${i + 1}. <strong>${action.title}</strong> - ${action.description}</div>`;
    });
    html += `</div>`;
  }

  // Daily Wisdom
  if (wisdom) {
    html += `
      <div class="section">
        <h2>Today's Wisdom</h2>
        <div class="wisdom">
          <p>"${wisdom.quote}"</p>
          <p><strong>— ${wisdom.mentor}</strong>, ${wisdom.role}</p>
        </div>
        <p><strong>Today's Principle:</strong> ${wisdom.principle}</p>
        <p><strong>Today's Habit:</strong> ${wisdom.habit}</p>
      </div>
    `;
  }

  html += `
      <div class="footer">
        <p>Generated by BACKBONE Engine</p>
        <p>Type /insights in the app for more details</p>
      </div>
    </body>
    </html>
  `;

  // Plain text version
  let text = `BACKBONE DAILY DIGEST - ${new Date().toLocaleDateString()}\n\n`;
  text += `LIFE SCORES\n`;
  text += `Overall: ${insights.scores.overall || '--'}/100\n`;
  text += `Finance: ${insights.scores.finance || '--'} | Health: ${insights.scores.health || '--'} | Career: ${insights.scores.career || '--'} | Growth: ${insights.scores.growth || '--'}\n\n`;

  if (insights.alerts?.length > 0) {
    text += `ALERTS:\n`;
    insights.alerts.forEach(a => text += `- ${a}\n`);
    text += `\n`;
  }

  if (wisdom) {
    text += `TODAY'S WISDOM from ${wisdom.mentor}:\n`;
    text += `"${wisdom.quote}"\n`;
    text += `Principle: ${wisdom.principle}\n`;
    text += `Habit: ${wisdom.habit}\n`;
  }

  return { subject, html, text };
};

/**
 * Format weekly report email
 */
const formatWeeklyReportEmail = (report) => {
  const subject = `BACKBONE Weekly Report - ${report.period}`;

  let html = `
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #1a1a2e; color: #fff; padding: 20px; text-align: center; }
        .header h1 { margin: 0; color: #f59e0b; }
        .section { padding: 20px; border-bottom: 1px solid #eee; }
        .big-score { font-size: 48px; font-weight: bold; color: ${report.summary.overallScore >= 70 ? '#22c55e' : report.summary.overallScore >= 50 ? '#f59e0b' : '#ef4444'}; }
        .progress-bar { background: #e5e7eb; border-radius: 4px; height: 20px; overflow: hidden; }
        .progress-fill { background: #22c55e; height: 100%; transition: width 0.3s; }
        .action-item { background: #f0fdf4; padding: 12px; margin: 8px 0; border-radius: 4px; border-left: 4px solid #22c55e; }
        .focus-item { background: #faf5ff; padding: 12px; margin: 8px 0; border-radius: 4px; border-left: 4px solid #a855f7; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>BACKBONE</h1>
        <p>Weekly Progress Report</p>
        <p>${report.period}</p>
      </div>

      <div class="section" style="text-align: center;">
        <h2>Overall Score</h2>
        <div class="big-score">${report.summary.overallScore}/100</div>
      </div>
  `;

  // Sections
  if (report.sections?.length > 0) {
    html += `<div class="section"><h2>Life Areas</h2>`;
    report.sections.forEach(section => {
      html += `
        <div style="margin: 16px 0;">
          <h3>${section.title} (${section.score}/100)</h3>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${section.score}%;"></div>
          </div>
          <ul>
            ${section.insights.map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      `;
    });
    html += `</div>`;
  }

  // Action Items
  if (report.actionItems?.length > 0) {
    html += `<div class="section"><h2>Action Items for This Week</h2>`;
    report.actionItems.forEach((item, i) => {
      html += `<div class="action-item"><strong>${i + 1}.</strong> ${item}</div>`;
    });
    html += `</div>`;
  }

  // Next Week Focus
  if (report.nextWeekFocus?.length > 0) {
    html += `<div class="section"><h2>Focus for Next Week</h2>`;
    report.nextWeekFocus.forEach(focus => {
      html += `<div class="focus-item">${focus}</div>`;
    });
    html += `</div>`;
  }

  html += `
      <div class="footer">
        <p>Generated by BACKBONE Engine</p>
        <p>Type /report in the app for more details</p>
      </div>
    </body>
    </html>
  `;

  // Plain text
  let text = `BACKBONE WEEKLY REPORT\n${report.period}\n\n`;
  text += `OVERALL SCORE: ${report.summary.overallScore}/100\n\n`;

  if (report.sections) {
    report.sections.forEach(s => {
      text += `${s.title}: ${s.score}/100\n`;
      s.insights.forEach(i => text += `  - ${i}\n`);
      text += `\n`;
    });
  }

  if (report.actionItems?.length > 0) {
    text += `ACTION ITEMS:\n`;
    report.actionItems.forEach((item, i) => {
      text += `${i + 1}. ${item}\n`;
    });
  }

  return { subject, html, text };
};

/**
 * Send email notification
 */
export const sendEmail = async (type, options = {}) => {
  const config = getEmailConfig();

  if (!config.enabled) {
    console.log("[Notifications] Email not configured. Set SMTP_USER and SMTP_PASS in .env");
    return { success: false, error: "Email not configured" };
  }

  const transporter = await createTransporter();
  if (!transporter) {
    return { success: false, error: "nodemailer not installed. Run: npm install nodemailer" };
  }

  let emailContent;

  switch (type) {
    case NOTIFICATION_TYPES.DAILY_DIGEST: {
      const insights = generateDailyInsights();
      const wisdom = getDailyWisdom();
      const actions = getSuggestedActions();
      emailContent = formatDailyDigestEmail(insights, wisdom, actions);
      break;
    }
    case NOTIFICATION_TYPES.WEEKLY_REPORT: {
      const report = generateWeeklyReport();
      emailContent = formatWeeklyReportEmail(report);
      break;
    }
    case NOTIFICATION_TYPES.ALERT: {
      emailContent = {
        subject: `BACKBONE Alert: ${options.title || "Important Update"}`,
        text: options.message || "You have a new alert from BACKBONE.",
        html: `<div style="padding: 20px;"><h2>${options.title || "Alert"}</h2><p>${options.message || ""}</p></div>`
      };
      break;
    }
    default:
      return { success: false, error: "Unknown notification type" };
  }

  try {
    const result = await transporter.sendMail({
      from: config.from,
      to: options.to || config.to,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html
    });

    // Log the notification
    const log = loadNotificationLog();
    log.sent.push({
      type,
      timestamp: new Date().toISOString(),
      messageId: result.messageId,
      to: options.to || config.to
    });

    // Keep only last 100 entries
    if (log.sent.length > 100) {
      log.sent = log.sent.slice(-100);
    }

    // Update last sent timestamps
    if (type === NOTIFICATION_TYPES.DAILY_DIGEST) {
      log.lastDaily = new Date().toISOString();
    } else if (type === NOTIFICATION_TYPES.WEEKLY_REPORT) {
      log.lastWeekly = new Date().toISOString();
    }

    saveNotificationLog(log);

    console.log(`[Notifications] Email sent: ${emailContent.subject}`);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error("[Notifications] Email send failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send daily digest (checks if not already sent today)
 */
export const sendDailyDigest = async () => {
  const log = loadNotificationLog();
  const today = new Date().toISOString().split('T')[0];
  const lastDaily = log.lastDaily ? log.lastDaily.split('T')[0] : null;

  if (lastDaily === today) {
    console.log("[Notifications] Daily digest already sent today");
    return { success: false, error: "Already sent today" };
  }

  return await sendEmail(NOTIFICATION_TYPES.DAILY_DIGEST);
};

/**
 * Send weekly report (checks if not already sent this week)
 */
export const sendWeeklyReport = async () => {
  const log = loadNotificationLog();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)

  if (log.lastWeekly) {
    const lastWeeklyDate = new Date(log.lastWeekly);
    if (lastWeeklyDate >= weekStart) {
      console.log("[Notifications] Weekly report already sent this week");
      return { success: false, error: "Already sent this week" };
    }
  }

  return await sendEmail(NOTIFICATION_TYPES.WEEKLY_REPORT);
};

/**
 * Get notification status
 */
export const getNotificationStatus = () => {
  const config = getEmailConfig();
  const log = loadNotificationLog();

  return {
    configured: config.enabled,
    to: config.to,
    lastDaily: log.lastDaily,
    lastWeekly: log.lastWeekly,
    totalSent: log.sent?.length || 0,
    recentNotifications: (log.sent || []).slice(-5).reverse()
  };
};

export default {
  NOTIFICATION_TYPES,
  sendEmail,
  sendDailyDigest,
  sendWeeklyReport,
  getNotificationStatus,
  getEmailConfig
};
