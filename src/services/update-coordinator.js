/**
 * Update Coordinator - Batches all state updates to prevent flickering
 *
 * Instead of multiple intervals each causing separate re-renders,
 * this coordinator collects all pending updates and applies them
 * in a single batch at a controlled rate.
 *
 * Inspired by SolidJS's fine-grained reactivity and game engine update loops.
 */

import { EventEmitter } from "events";

// Target update rate - reduced to prevent flickering
// 2000ms (0.5 fps) is sufficient for dashboard data display
const UPDATE_INTERVAL_MS = 2000;

class UpdateCoordinator extends EventEmitter {
  constructor() {
    super();
    this.pendingUpdates = new Map();
    this.updateCallbacks = new Map();
    this.isRunning = false;
    this.intervalId = null;
    this.lastTick = 0;
    this.tickCount = 0;

    // Error tracking for robustness
    this.callbackErrors = new Map(); // key -> error info
    this.errorMetrics = {
      totalErrors: 0,
      errorsThisTick: 0,
      lastError: null,
      errorsByCallback: {}
    };

    // Performance tracking
    this.performanceMetrics = {
      avgTickDuration: 0,
      maxTickDuration: 0,
      tickDurations: [],
      droppedUpdates: 0
    };

    // Backpressure handling
    this.maxPendingUpdates = 100;
    this.backpressureWarningEmitted = false;
  }

  /**
   * Register an update source with a callback
   * @param {string} key - Unique identifier for this update source
   * @param {Function} callback - Called on each tick, should return new data or null
   */
  register(key, callback) {
    this.updateCallbacks.set(key, callback);
  }

  /**
   * Unregister an update source
   */
  unregister(key) {
    this.updateCallbacks.delete(key);
    this.pendingUpdates.delete(key);
  }

  /**
   * Queue an update for a specific key
   * Updates are batched and emitted on the next tick
   */
  queueUpdate(key, data) {
    this.pendingUpdates.set(key, data);
  }

  /**
   * Start the update loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTick = Date.now();

    this.intervalId = setInterval(() => {
      this.tick();
    }, UPDATE_INTERVAL_MS);

    // Run initial tick
    this.tick();
  }

  /**
   * Stop the update loop
   */
  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Single update tick - collects all updates and emits them
   */
  tick() {
    const tickStart = Date.now();
    const delta = tickStart - this.lastTick;
    this.lastTick = tickStart;
    this.tickCount++;
    this.errorMetrics.errorsThisTick = 0;

    // Backpressure check
    if (this.pendingUpdates.size > this.maxPendingUpdates) {
      const dropped = this.pendingUpdates.size - this.maxPendingUpdates;
      this.performanceMetrics.droppedUpdates += dropped;

      // Keep only the most recent updates
      const entries = Array.from(this.pendingUpdates.entries());
      this.pendingUpdates = new Map(entries.slice(-this.maxPendingUpdates));

      if (!this.backpressureWarningEmitted) {
        this.emit("backpressure-warning", {
          droppedUpdates: dropped,
          pendingCount: this.pendingUpdates.size
        });
        this.backpressureWarningEmitted = true;
      }
    } else {
      this.backpressureWarningEmitted = false;
    }

    // Collect updates from all registered callbacks
    for (const [key, callback] of this.updateCallbacks) {
      try {
        const data = callback(delta, this.tickCount);
        if (data !== null && data !== undefined) {
          this.pendingUpdates.set(key, data);
        }
        // Clear error state on success
        if (this.callbackErrors.has(key)) {
          this.callbackErrors.delete(key);
        }
      } catch (err) {
        // Track callback errors instead of silently ignoring
        this.errorMetrics.totalErrors++;
        this.errorMetrics.errorsThisTick++;
        this.errorMetrics.lastError = {
          callback: key,
          message: err.message,
          timestamp: Date.now()
        };

        // Track per-callback error count
        if (!this.errorMetrics.errorsByCallback[key]) {
          this.errorMetrics.errorsByCallback[key] = 0;
        }
        this.errorMetrics.errorsByCallback[key]++;

        // Store error for the callback
        this.callbackErrors.set(key, {
          message: err.message,
          count: (this.callbackErrors.get(key)?.count || 0) + 1,
          lastOccurrence: Date.now()
        });

        // Emit error event for monitoring
        this.emit("callback-error", {
          callback: key,
          error: err.message,
          errorCount: this.errorMetrics.errorsByCallback[key],
          tickCount: this.tickCount
        });

        // If a callback fails repeatedly, consider disabling it
        if (this.errorMetrics.errorsByCallback[key] >= 10) {
          this.emit("callback-disabled-warning", {
            callback: key,
            errorCount: this.errorMetrics.errorsByCallback[key]
          });
        }
      }
    }

    // If we have any updates, emit them all at once
    if (this.pendingUpdates.size > 0) {
      const updates = Object.fromEntries(this.pendingUpdates);
      this.pendingUpdates.clear();
      this.emit("update", updates, this.tickCount);
    }

    // Track tick duration
    const tickDuration = Date.now() - tickStart;
    this.performanceMetrics.tickDurations.push(tickDuration);
    if (this.performanceMetrics.tickDurations.length > 100) {
      this.performanceMetrics.tickDurations.shift();
    }
    this.performanceMetrics.avgTickDuration =
      this.performanceMetrics.tickDurations.reduce((a, b) => a + b, 0) /
      this.performanceMetrics.tickDurations.length;
    this.performanceMetrics.maxTickDuration = Math.max(
      this.performanceMetrics.maxTickDuration,
      tickDuration
    );

    // Warn if tick is taking too long (>100ms is concerning)
    if (tickDuration > 100) {
      this.emit("slow-tick-warning", {
        duration: tickDuration,
        tickCount: this.tickCount,
        callbackCount: this.updateCallbacks.size
      });
    }

    this.emit("tick", this.tickCount, delta);
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      tickCount: this.tickCount,
      registeredSources: this.updateCallbacks.size,
      pendingUpdates: this.pendingUpdates.size,
      updateRate: `${1000 / UPDATE_INTERVAL_MS} fps`,
      errors: {
        total: this.errorMetrics.totalErrors,
        lastError: this.errorMetrics.lastError,
        byCallback: { ...this.errorMetrics.errorsByCallback }
      },
      performance: {
        avgTickDuration: Math.round(this.performanceMetrics.avgTickDuration * 100) / 100,
        maxTickDuration: this.performanceMetrics.maxTickDuration,
        droppedUpdates: this.performanceMetrics.droppedUpdates
      },
      callbackHealth: this.getCallbackHealth()
    };
  }

  /**
   * Get health status of all callbacks
   */
  getCallbackHealth() {
    const health = {};
    for (const [key] of this.updateCallbacks) {
      const errorInfo = this.callbackErrors.get(key);
      health[key] = {
        status: errorInfo ? (errorInfo.count >= 5 ? "degraded" : "warning") : "healthy",
        errorCount: errorInfo?.count || 0,
        lastError: errorInfo?.message || null
      };
    }
    return health;
  }

  /**
   * Reset error metrics
   */
  resetErrorMetrics() {
    this.callbackErrors.clear();
    this.errorMetrics = {
      totalErrors: 0,
      errorsThisTick: 0,
      lastError: null,
      errorsByCallback: {}
    };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    this.performanceMetrics = {
      avgTickDuration: 0,
      maxTickDuration: 0,
      tickDurations: [],
      droppedUpdates: 0
    };
  }
}

// Singleton instance
let instance = null;

export const getUpdateCoordinator = () => {
  if (!instance) {
    instance = new UpdateCoordinator();
  }
  return instance;
};

/**
 * React hook for using the update coordinator
 * Returns a function to queue updates and subscribes to the tick event
 */
export const useUpdateCoordinator = (key, onUpdate) => {
  const coordinator = getUpdateCoordinator();

  // This would be implemented as a React hook in the component
  // For now, just return the coordinator methods
  return {
    queueUpdate: (data) => coordinator.queueUpdate(key, data),
    register: (callback) => coordinator.register(key, callback),
    unregister: () => coordinator.unregister(key)
  };
};

export default UpdateCoordinator;
