/**
 * Worker Coordination Service
 *
 * Manages multiple client instances to prevent duplicate work.
 * Uses Firebase Firestore for leader election and coordination.
 *
 * Modes:
 * - WORKER: The primary instance that executes tasks
 * - VIEWER: Secondary instances that observe but don't execute
 *
 * Features:
 * - Automatic leader election via Firebase heartbeat
 * - Failover when worker goes offline (viewer becomes worker)
 * - Real-time state sync between instances
 * - Graceful handoff when closing
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { FIRESTORE_BASE_URL, FIREBASE_CONFIG } from "../firebase/firebase-config.js";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const COORDINATION_PATH = path.join(DATA_DIR, "worker-coordination.json");

// Coordination constants
const HEARTBEAT_INTERVAL = 15000;  // Send heartbeat every 15 seconds
const WORKER_TIMEOUT = 45000;       // Consider worker dead after 45 seconds
const ELECTION_DELAY = 5000;        // Wait 5 seconds before claiming leadership

/**
 * Worker modes
 */
export const WORKER_MODE = {
  WORKER: "worker",      // Primary instance - executes tasks
  VIEWER: "viewer",      // Secondary instance - observes only
  PENDING: "pending"     // Starting up, mode not yet determined
};

/**
 * Generate a unique instance ID
 */
const generateInstanceId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const pid = process.pid.toString(36);
  return `${timestamp}-${random}-${pid}`;
};

/**
 * Worker Coordination Manager
 */
class WorkerCoordinationManager extends EventEmitter {
  constructor() {
    super();
    this.instanceId = generateInstanceId();
    this.mode = WORKER_MODE.PENDING;
    this.isInitialized = false;
    this.heartbeatInterval = null;
    this.checkInterval = null;
    this.currentWorkerId = null;
    this.lastWorkerHeartbeat = null;
    this.userId = null;
  }

  /**
   * Initialize coordination for a user
   */
  async initialize(userId) {
    if (this.isInitialized) return;

    this.userId = userId;
    this.isInitialized = true;

    // Load local state
    this.loadLocalState();

    // Check current leader status
    await this.checkLeaderStatus();

    // Start periodic checks
    this.startHeartbeat();
    this.startLeaderCheck();

    console.log(`[WorkerCoordination] Initialized as ${this.mode} (${this.instanceId.slice(0, 8)})`);
    this.emit("initialized", { mode: this.mode, instanceId: this.instanceId });

    return this.mode;
  }

  /**
   * Load local coordination state
   */
  loadLocalState() {
    try {
      if (fs.existsSync(COORDINATION_PATH)) {
        const data = JSON.parse(fs.readFileSync(COORDINATION_PATH, "utf-8"));
        this.currentWorkerId = data.workerId || null;
        this.lastWorkerHeartbeat = data.lastHeartbeat ? new Date(data.lastHeartbeat).getTime() : null;
      }
    } catch (e) {
      console.error("[WorkerCoordination] Failed to load local state:", e.message);
    }
  }

  /**
   * Save local coordination state
   */
  saveLocalState() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(COORDINATION_PATH, JSON.stringify({
        workerId: this.currentWorkerId,
        lastHeartbeat: this.lastWorkerHeartbeat ? new Date(this.lastWorkerHeartbeat).toISOString() : null,
        instanceId: this.instanceId,
        mode: this.mode,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error("[WorkerCoordination] Failed to save local state:", e.message);
    }
  }

  /**
   * Check leader status from Firebase
   */
  async checkLeaderStatus() {
    if (!this.userId) return;

    try {
      const response = await fetch(
        `${FIRESTORE_BASE_URL}/users/${this.userId}/coordination/leader`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const fields = data.fields || {};

        const workerId = fields.workerId?.stringValue || null;
        const lastHeartbeat = fields.lastHeartbeat?.timestampValue
          ? new Date(fields.lastHeartbeat.timestampValue).getTime()
          : null;

        this.currentWorkerId = workerId;
        this.lastWorkerHeartbeat = lastHeartbeat;

        // Check if current worker is still alive
        const workerAlive = lastHeartbeat && (Date.now() - lastHeartbeat < WORKER_TIMEOUT);

        if (!workerId || !workerAlive) {
          // No active worker - claim leadership
          await this.claimLeadership();
        } else if (workerId === this.instanceId) {
          // We are the leader
          this.setMode(WORKER_MODE.WORKER);
        } else {
          // Another instance is the leader
          this.setMode(WORKER_MODE.VIEWER);
        }
      } else if (response.status === 404) {
        // No leader document - claim leadership
        await this.claimLeadership();
      }
    } catch (e) {
      console.error("[WorkerCoordination] Failed to check leader status:", e.message);
      // On error, assume viewer mode to be safe
      this.setMode(WORKER_MODE.VIEWER);
    }

    this.saveLocalState();
  }

  /**
   * Claim leadership (become worker)
   */
  async claimLeadership() {
    if (!this.userId) return;

    // Small random delay to prevent race conditions
    await new Promise(resolve => setTimeout(resolve, Math.random() * ELECTION_DELAY));

    try {
      const response = await fetch(
        `${FIRESTORE_BASE_URL}/users/${this.userId}/coordination/leader`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              workerId: { stringValue: this.instanceId },
              lastHeartbeat: { timestampValue: new Date().toISOString() },
              claimedAt: { timestampValue: new Date().toISOString() },
              hostname: { stringValue: process.env.COMPUTERNAME || process.env.HOSTNAME || "unknown" }
            }
          })
        }
      );

      if (response.ok) {
        this.currentWorkerId = this.instanceId;
        this.lastWorkerHeartbeat = Date.now();
        this.setMode(WORKER_MODE.WORKER);
        console.log("[WorkerCoordination] Claimed leadership successfully");
      } else {
        // Another instance might have claimed it first
        await this.checkLeaderStatus();
      }
    } catch (e) {
      console.error("[WorkerCoordination] Failed to claim leadership:", e.message);
      this.setMode(WORKER_MODE.VIEWER);
    }
  }

  /**
   * Send heartbeat to Firebase
   */
  async sendHeartbeat() {
    if (!this.userId || this.mode !== WORKER_MODE.WORKER) return;

    try {
      const response = await fetch(
        `${FIRESTORE_BASE_URL}/users/${this.userId}/coordination/leader?updateMask.fieldPaths=lastHeartbeat`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              lastHeartbeat: { timestampValue: new Date().toISOString() }
            }
          })
        }
      );

      if (response.ok) {
        this.lastWorkerHeartbeat = Date.now();
        this.saveLocalState();
      }
    } catch (e) {
      console.error("[WorkerCoordination] Heartbeat failed:", e.message);
    }
  }

  /**
   * Set mode and emit change event
   */
  setMode(newMode) {
    if (this.mode !== newMode) {
      const previousMode = this.mode;
      this.mode = newMode;
      this.emit("mode-changed", {
        mode: newMode,
        previousMode,
        instanceId: this.instanceId
      });
    }
  }

  /**
   * Start sending heartbeats (if worker)
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.mode === WORKER_MODE.WORKER) {
        this.sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Start checking leader status (for viewers)
   */
  startLeaderCheck() {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(async () => {
      if (this.mode === WORKER_MODE.VIEWER) {
        try {
          await this.checkLeaderStatus();
        } catch (err) {
          console.error("[WorkerCoordination] Leader check failed:", err.message);
        }
      }
    }, WORKER_TIMEOUT);
  }

  /**
   * Gracefully release leadership
   */
  async releaseLeadership() {
    if (this.mode !== WORKER_MODE.WORKER || !this.userId) return;

    try {
      // Clear the leader document
      await fetch(
        `${FIRESTORE_BASE_URL}/users/${this.userId}/coordination/leader`,
        {
          method: "DELETE"
        }
      );

      console.log("[WorkerCoordination] Released leadership");
    } catch (e) {
      console.error("[WorkerCoordination] Failed to release leadership:", e.message);
    }
  }

  /**
   * Shutdown coordination
   */
  async shutdown() {
    // Stop intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Release leadership if we're the worker
    await this.releaseLeadership();

    this.isInitialized = false;
  }

  /**
   * Check if this instance should execute work
   */
  shouldExecute() {
    return this.mode === WORKER_MODE.WORKER;
  }

  /**
   * Check if this instance is viewer only
   */
  isViewer() {
    return this.mode === WORKER_MODE.VIEWER;
  }

  /**
   * Get current coordination status
   */
  getStatus() {
    return {
      instanceId: this.instanceId,
      mode: this.mode,
      currentWorkerId: this.currentWorkerId,
      isWorker: this.mode === WORKER_MODE.WORKER,
      isViewer: this.mode === WORKER_MODE.VIEWER,
      lastHeartbeat: this.lastWorkerHeartbeat,
      workerAlive: this.lastWorkerHeartbeat && (Date.now() - this.lastWorkerHeartbeat < WORKER_TIMEOUT)
    };
  }

  /**
   * Get display data for UI
   */
  getDisplayData() {
    const status = this.getStatus();
    return {
      mode: status.mode,
      modeLabel: status.isWorker ? "Worker" : status.isViewer ? "Viewer" : "Pending",
      modeColor: status.isWorker ? "#22c55e" : status.isViewer ? "#3b82f6" : "#64748b",
      instanceId: this.instanceId.slice(0, 8),
      workerAlive: status.workerAlive
    };
  }
}

// Singleton instance
let instance = null;

export const getWorkerCoordination = () => {
  if (!instance) {
    instance = new WorkerCoordinationManager();
  }
  return instance;
};

/**
 * Initialize worker coordination
 */
export const initializeWorkerCoordination = async (userId) => {
  const coordination = getWorkerCoordination();
  return coordination.initialize(userId);
};

/**
 * Check if current instance should execute work
 */
export const shouldExecuteWork = () => {
  const coordination = getWorkerCoordination();
  return coordination.shouldExecute();
};

/**
 * Shutdown worker coordination
 */
export const shutdownWorkerCoordination = async () => {
  const coordination = getWorkerCoordination();
  return coordination.shutdown();
};

export default WorkerCoordinationManager;
