import { EventEmitter } from "events";
import express from "express";
import http from "http";

/**
 * Mobile Service for BACKBONE
 * Provides phone connectivity via web dashboard and optional SMS (Twilio)
 */

// Mobile connection types
export const MOBILE_TYPE = {
  WEB_DASHBOARD: "web-dashboard",
  SMS_TWILIO: "sms-twilio",
  PUSH_FIREBASE: "push-firebase"
};

// Message types
export const MESSAGE_TYPE = {
  STATUS_UPDATE: "status-update",
  ACTION_PROPOSAL: "action-proposal",
  MILESTONE: "milestone",
  ALERT: "alert",
  RESPONSE: "response"
};

/**
 * Mobile Service Class
 */
export class MobileService extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.app = null;
    this.clients = new Set();
    this.config = {
      port: process.env.MOBILE_PORT || 3001,
      twilioEnabled: Boolean(process.env.TWILIO_ACCOUNT_SID),
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
      userPhoneNumber: process.env.USER_PHONE_NUMBER
    };
    this.running = false;
  }

  /**
   * Start the web dashboard server
   */
  async startWebDashboard() {
    if (this.running) return;

    this.app = express();
    this.app.use(express.json());

    // CORS for mobile access
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
    });

    // Status endpoint
    this.app.get("/api/status", (req, res) => {
      this.emit("status-request");
      res.json(this.getStatusData());
    });

    // Actions endpoint
    this.app.get("/api/actions", (req, res) => {
      this.emit("actions-request");
      res.json(this.getActionsData());
    });

    // Approve action
    this.app.post("/api/actions/:id/approve", (req, res) => {
      const actionId = req.params.id;
      this.emit("action-approve", actionId);
      res.json({ success: true, actionId });
    });

    // Reject action
    this.app.post("/api/actions/:id/reject", (req, res) => {
      const actionId = req.params.id;
      this.emit("action-reject", actionId);
      res.json({ success: true, actionId });
    });

    // Send command
    this.app.post("/api/command", (req, res) => {
      const { command } = req.body;
      this.emit("command", command);
      res.json({ success: true, command });
    });

    // Goals endpoint
    this.app.get("/api/goals", (req, res) => {
      this.emit("goals-request");
      res.json(this.getGoalsData());
    });

    // Portfolio endpoint
    this.app.get("/api/portfolio", (req, res) => {
      this.emit("portfolio-request");
      res.json(this.getPortfolioData());
    });

    // Health endpoint
    this.app.get("/api/health", (req, res) => {
      this.emit("health-request");
      res.json(this.getHealthData());
    });

    // Work log endpoint
    this.app.get("/api/worklog", (req, res) => {
      this.emit("worklog-request");
      res.json(this.getWorkLogData());
    });

    // Mobile dashboard HTML
    this.app.get("/", (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // Start server
    this.server = http.createServer(this.app);

    return new Promise((resolve, reject) => {
      const onError = (err) => {
        if (err.code === "EADDRINUSE") {
          // Port in use - try next port
          this.config.port = parseInt(this.config.port) + 1;
          if (this.config.port < 3010) {
            this.server.listen(this.config.port);
          } else {
            this.emit("error", err);
            reject(new Error(`Could not find available port (tried 3001-3009)`));
          }
        } else {
          this.emit("error", err);
          reject(err);
        }
      };

      this.server.on("error", onError);

      this.server.on("listening", () => {
        this.server.removeListener("error", onError);
        this.running = true;
        this.emit("started", { port: this.config.port });
        resolve({ port: this.config.port });
      });

      this.server.listen(this.config.port);
    });
  }

  /**
   * Stop the web dashboard
   */
  async stopWebDashboard() {
    if (!this.running || !this.server) return;

    return new Promise((resolve) => {
      this.server.close(() => {
        this.running = false;
        this.emit("stopped");
        resolve();
      });
    });
  }

  /**
   * Send SMS via Twilio (if configured)
   */
  async sendSMS(message, phoneNumber = null) {
    if (!this.config.twilioEnabled) {
      return { success: false, error: "Twilio not configured" };
    }

    try {
      // Dynamic import to avoid requiring twilio if not used
      const twilio = await import("twilio");
      const client = twilio.default(this.config.twilioAccountSid, this.config.twilioAuthToken);

      const result = await client.messages.create({
        body: message,
        from: this.config.twilioPhoneNumber,
        to: phoneNumber || this.config.userPhoneNumber
      });

      this.emit("sms-sent", { to: result.to, body: message });
      return { success: true, sid: result.sid };
    } catch (error) {
      this.emit("sms-error", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification (tries web push, then SMS)
   */
  async sendNotification(title, message, type = MESSAGE_TYPE.ALERT) {
    // Emit for connected web clients
    this.emit("notification", { title, message, type, timestamp: new Date().toISOString() });

    // If critical and SMS enabled, also send SMS
    if (type === MESSAGE_TYPE.ALERT && this.config.twilioEnabled) {
      await this.sendSMS(`${title}: ${message}`);
    }

    return { sent: true };
  }

  /**
   * Notify about milestone achievement
   */
  async notifyMilestone(goal, milestone) {
    const message = `Milestone achieved! ${goal.title}: ${milestone.label}`;
    return this.sendNotification("Milestone", message, MESSAGE_TYPE.MILESTONE);
  }

  /**
   * Notify about action proposal
   */
  async notifyActionProposal(action) {
    const message = `New action proposed: ${action.title}`;
    return this.sendNotification("Action Proposal", message, MESSAGE_TYPE.ACTION_PROPOSAL);
  }

  // Data provider methods (to be connected from app.js)
  setStatusData(data) { this._statusData = data; }
  setActionsData(data) { this._actionsData = data; }
  setGoalsData(data) { this._goalsData = data; }
  setPortfolioData(data) { this._portfolioData = data; }
  setHealthData(data) { this._healthData = data; }
  setWorkLogData(data) { this._workLogData = data; }

  getStatusData() { return this._statusData || {}; }
  getActionsData() { return this._actionsData || {}; }
  getGoalsData() { return this._goalsData || { goals: [] }; }
  getPortfolioData() { return this._portfolioData || {}; }
  getHealthData() { return this._healthData || {}; }
  getWorkLogData() { return this._workLogData || { entries: [] }; }

  /**
   * Generate mobile dashboard HTML
   */
  getDashboardHTML() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BACKBONE Mobile</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 16px;
    }
    h1 { color: #f59e0b; margin-bottom: 16px; }
    h2 { color: #64748b; font-size: 14px; margin: 16px 0 8px; text-transform: uppercase; }
    .card { background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .status { display: flex; align-items: center; gap: 8px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.green { background: #22c55e; }
    .dot.yellow { background: #eab308; }
    .dot.red { background: #ef4444; }
    .progress { background: #334155; height: 8px; border-radius: 4px; margin-top: 8px; }
    .progress-fill { background: #22c55e; height: 100%; border-radius: 4px; transition: width 0.3s; }
    .action { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #334155; }
    .action:last-child { border-bottom: none; }
    .btn { padding: 8px 16px; border-radius: 4px; border: none; cursor: pointer; font-weight: 600; }
    .btn-approve { background: #22c55e; color: white; }
    .btn-reject { background: #ef4444; color: white; }
    .btn-group { display: flex; gap: 8px; }
    .metric { display: flex; justify-content: space-between; padding: 8px 0; }
    .metric-value { color: #22c55e; font-weight: 600; }
    .goal { margin-bottom: 12px; }
    .goal-title { font-size: 14px; margin-bottom: 4px; }
    .goal-progress { font-size: 12px; color: #64748b; }
    #refresh { position: fixed; bottom: 16px; right: 16px; background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>BACKBONE</h1>

  <div id="status" class="card">
    <div class="status">
      <div class="dot green"></div>
      <span>System Active</span>
    </div>
  </div>

  <h2>Goals</h2>
  <div id="goals" class="card">Loading...</div>

  <h2>Portfolio</h2>
  <div id="portfolio" class="card">Loading...</div>

  <h2>Pending Actions</h2>
  <div id="actions" class="card">Loading...</div>

  <h2>Recent Activity</h2>
  <div id="worklog" class="card">Loading...</div>

  <button id="refresh">Refresh</button>

  <script>
    async function fetchData() {
      try {
        const [status, goals, portfolio, actions, worklog] = await Promise.all([
          fetch('/api/status').then(r => r.json()),
          fetch('/api/goals').then(r => r.json()),
          fetch('/api/portfolio').then(r => r.json()),
          fetch('/api/actions').then(r => r.json()),
          fetch('/api/worklog').then(r => r.json())
        ]);

        renderStatus(status);
        renderGoals(goals);
        renderPortfolio(portfolio);
        renderActions(actions);
        renderWorklog(worklog);
      } catch (e) {
        console.error('Failed to fetch data:', e);
      }
    }

    function renderStatus(data) {
      const el = document.getElementById('status');
      const dot = data.running ? 'green' : 'red';
      const text = data.running ? 'System Active' : 'System Paused';
      el.innerHTML = '<div class="status"><div class="dot ' + dot + '"></div><span>' + text + '</span></div>';
    }

    function renderGoals(data) {
      const el = document.getElementById('goals');
      if (!data.goals || data.goals.length === 0) {
        el.innerHTML = '<p style="color: #64748b;">No goals set</p>';
        return;
      }
      el.innerHTML = data.goals.map(g =>
        '<div class="goal"><div class="goal-title">' + g.title + '</div>' +
        '<div class="progress"><div class="progress-fill" style="width: ' + (g.progress * 100) + '%"></div></div>' +
        '<div class="goal-progress">' + Math.round(g.progress * 100) + '% complete</div></div>'
      ).join('');
    }

    function renderPortfolio(data) {
      const el = document.getElementById('portfolio');
      el.innerHTML =
        '<div class="metric"><span>Equity</span><span class="metric-value">$' + (data.equity || 0).toLocaleString() + '</span></div>' +
        '<div class="metric"><span>Cash</span><span class="metric-value">$' + (data.cash || 0).toLocaleString() + '</span></div>' +
        '<div class="metric"><span>Day P/L</span><span class="metric-value" style="color: ' + ((data.dayPL || 0) >= 0 ? '#22c55e' : '#ef4444') + '">$' + (data.dayPL || 0).toLocaleString() + '</span></div>';
    }

    function renderActions(data) {
      const el = document.getElementById('actions');
      if (!data.proposed || data.proposed.length === 0) {
        el.innerHTML = '<p style="color: #64748b;">No pending actions</p>';
        return;
      }
      el.innerHTML = data.proposed.map(a =>
        '<div class="action"><span>' + a.title + '</span>' +
        '<div class="btn-group"><button class="btn btn-approve" onclick="approveAction(\\'' + a.id + '\\')">Approve</button>' +
        '<button class="btn btn-reject" onclick="rejectAction(\\'' + a.id + '\\')">Reject</button></div></div>'
      ).join('');
    }

    function renderWorklog(data) {
      const el = document.getElementById('worklog');
      if (!data.entries || data.entries.length === 0) {
        el.innerHTML = '<p style="color: #64748b;">No recent activity</p>';
        return;
      }
      el.innerHTML = data.entries.slice(0, 5).map(e =>
        '<div class="metric"><span>' + e.title + '</span><span style="color: #64748b;">' + e.time + '</span></div>'
      ).join('');
    }

    async function approveAction(id) {
      await fetch('/api/actions/' + id + '/approve', { method: 'POST' });
      fetchData();
    }

    async function rejectAction(id) {
      await fetch('/api/actions/' + id + '/reject', { method: 'POST' });
      fetchData();
    }

    document.getElementById('refresh').onclick = fetchData;
    fetchData();
    setInterval(fetchData, 10000);
  </script>
</body>
</html>`;
  }

  /**
   * Get connection info for display
   */
  getConnectionInfo() {
    return {
      webDashboard: {
        running: this.running,
        port: this.config.port,
        url: `http://localhost:${this.config.port}`
      },
      sms: {
        enabled: this.config.twilioEnabled,
        phoneNumber: this.config.userPhoneNumber ? "Configured" : "Not set"
      }
    };
  }
}

// Singleton instance
let mobileInstance = null;

export const getMobileService = () => {
  if (!mobileInstance) {
    mobileInstance = new MobileService();
  }
  return mobileInstance;
};

export default MobileService;
