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

// Target update rate - 2fps is enough for data display, prevents flicker
const UPDATE_INTERVAL_MS = 500;

class UpdateCoordinator extends EventEmitter {
  constructor() {
    super();
    this.pendingUpdates = new Map();
    this.updateCallbacks = new Map();
    this.isRunning = false;
    this.intervalId = null;
    this.lastTick = 0;
    this.tickCount = 0;
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
    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;
    this.tickCount++;

    // Collect updates from all registered callbacks
    for (const [key, callback] of this.updateCallbacks) {
      try {
        const data = callback(delta, this.tickCount);
        if (data !== null && data !== undefined) {
          this.pendingUpdates.set(key, data);
        }
      } catch (err) {
        // Silently ignore callback errors
      }
    }

    // If we have any updates, emit them all at once
    if (this.pendingUpdates.size > 0) {
      const updates = Object.fromEntries(this.pendingUpdates);
      this.pendingUpdates.clear();
      this.emit("update", updates, this.tickCount);
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
      updateRate: `${1000 / UPDATE_INTERVAL_MS} fps`
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
