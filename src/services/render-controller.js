/**
 * Render Controller - Centralized animation and update batching
 *
 * Prevents flickering by:
 * 1. Consolidating all animations into a single timer
 * 2. Batching state updates into single render cycles
 * 3. Providing a global "tick" that components can subscribe to
 *
 * This mimics how game engines prevent tearing/flickering.
 */

import { EventEmitter } from "events";

class RenderController extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);

    this.isRunning = false;
    this.tickCount = 0;
    this.lastTickTime = Date.now();

    // Animation frame rate (updates per second)
    // Lower = less flickering, higher = smoother animations
    this.fps = 2; // 2 FPS is enough for status indicators
    this.frameInterval = 1000 / this.fps;

    // Pending updates to batch
    this.pendingUpdates = new Map();

    // Animation states (centralized)
    this.animationStates = {
      pulseOn: true,
      dotPhase: 0,
      shimmerPos: 0
    };

    this.intervalId = null;
  }

  /**
   * Start the render loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.frameInterval);
  }

  /**
   * Stop the render loop
   */
  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Single tick - updates all animation states and emits one render event
   */
  tick() {
    const now = Date.now();
    this.tickCount++;

    // Update animation states
    this.animationStates.pulseOn = this.tickCount % 2 === 0;
    this.animationStates.dotPhase = this.tickCount % 4;
    this.animationStates.shimmerPos = this.tickCount % 20;

    // Emit single tick event with all states
    this.emit("tick", {
      tickCount: this.tickCount,
      timestamp: now,
      animations: { ...this.animationStates }
    });

    // Process any pending updates
    if (this.pendingUpdates.size > 0) {
      const updates = new Map(this.pendingUpdates);
      this.pendingUpdates.clear();
      this.emit("batch-update", updates);
    }

    this.lastTickTime = now;
  }

  /**
   * Queue an update to be batched into the next render cycle
   */
  queueUpdate(key, value) {
    this.pendingUpdates.set(key, value);
  }

  /**
   * Get current animation states (for components that don't need reactivity)
   */
  getAnimationStates() {
    return { ...this.animationStates };
  }

  /**
   * Get current tick count
   */
  getTickCount() {
    return this.tickCount;
  }
}

// Singleton instance
let instance = null;

export const getRenderController = () => {
  if (!instance) {
    instance = new RenderController();
  }
  return instance;
};

export default RenderController;
