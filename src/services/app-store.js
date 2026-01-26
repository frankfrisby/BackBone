/**
 * App Store - Centralized state management for isolated component updates
 *
 * Inspired by OpenTUI's dirty region tracking - components subscribe only to
 * the state they need, preventing cascading re-renders.
 *
 * Pattern: Similar to Zustand/Jotai but simpler - uses EventEmitter for subscriptions
 */

import { EventEmitter } from "events";

// State slices - each can be subscribed to independently
const STATE_SLICES = {
  // UI State
  UI: "ui",
  // User/Auth
  USER: "user",
  // Connections (Alpaca, LinkedIn, Oura, etc.)
  CONNECTIONS: "connections",
  // Portfolio & Trading
  PORTFOLIO: "portfolio",
  // Tickers & Scores
  TICKERS: "tickers",
  // Chat & Messages
  CHAT: "chat",
  // Engine status
  ENGINE: "engine",
  // Goals & Progress
  GOALS: "goals",
  // Life scores
  LIFE_SCORES: "lifeScores",
  // Health (Oura)
  HEALTH: "health",
  // Projects
  PROJECTS: "projects",
  // Overlays (settings, test runner, etc.)
  OVERLAYS: "overlays",
};

class AppStore extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Allow many component subscriptions

    // Initialize all state slices
    this.state = {
      [STATE_SLICES.UI]: {
        viewMode: "core",
        privateMode: false,
        currentTier: "medium",
        isInitializing: true,
        mainViewReady: false,
        lastAction: "Ready",
        uiClock: Date.now(),
      },
      [STATE_SLICES.USER]: {
        firebaseUser: null,
        userSettings: {},
        showOnboarding: false,
        firebaseUserDisplay: "",
        userDisplayName: "",
      },
      [STATE_SLICES.CONNECTIONS]: {
        alpaca: { status: "Not connected", mode: "paper" },
        linkedin: { connected: false },
        oura: { connected: false },
        claude: { status: "Checking..." },
        claudeCode: { initialized: false, available: false },
        google: { connected: false },
        plaid: { connected: false },
        personalCapital: { connected: false },
      },
      [STATE_SLICES.PORTFOLIO]: {
        portfolio: null,
        tradingStatus: null,
        tradingHistory: null,
        lastUpdated: null,
        nextTradeTime: null,
        alpacaStatus: "Not connected",
        alpacaMode: "paper",
        personalCapitalData: null,
      },
      [STATE_SLICES.TICKERS]: {
        tickers: [],
        weights: null,
        priceHistory: {},
        lastQuoteUpdate: "--:--",
        tickerStatus: {
          refreshing: false,
          lastRefresh: null,
          error: null,
          scanCount: 0,
          scanDone: false,
          lastFullScan: null,      // Last full 800+ ticker scan timestamp
          updateHistory: [],       // Array of update timestamps for today (for 2hr gap check)
        },
      },
      [STATE_SLICES.CHAT]: {
        messages: [],
        isProcessing: false,
        streamingText: "",
        actionStreamingText: "",
        actionStreamingTitle: "",
        currentModelInfo: null,
      },
      [STATE_SLICES.ENGINE]: {
        status: null,
        toolEvents: [],
      },
      [STATE_SLICES.GOALS]: {
        goals: [],
      },
      [STATE_SLICES.LIFE_SCORES]: {
        data: null,
      },
      [STATE_SLICES.HEALTH]: {
        ouraHealth: null,
        ouraHistory: [],
        aiHealthResponse: null,
      },
      [STATE_SLICES.PROJECTS]: {
        projects: [],
      },
      [STATE_SLICES.OVERLAYS]: {
        showTestRunner: false,
        showSettings: false,
        showLinkedInViewer: false,
        showApprovalOverlay: false,
        setupOverlay: { active: false, type: null },
        linkedInViewerData: null,
      },
    };

    // Track which slices have changed this tick (for batching)
    this.dirtySlices = new Set();
    this.batchTimeout = null;
  }

  /**
   * Get current state for a slice
   */
  get(slice) {
    return this.state[slice];
  }

  /**
   * Get entire state (for debugging)
   */
  getAll() {
    return this.state;
  }

  /**
   * Update a specific slice - batches updates and emits once per tick
   */
  set(slice, updates) {
    const current = this.state[slice];
    if (!current) {
      console.warn(`AppStore: Unknown slice "${slice}"`);
      return;
    }

    // Merge updates
    this.state[slice] = { ...current, ...updates };
    this.dirtySlices.add(slice);

    // Batch updates - emit after microtask
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.flush();
      }, 0);
    }
  }

  /**
   * Update multiple slices at once
   */
  setMultiple(updates) {
    for (const [slice, data] of Object.entries(updates)) {
      if (this.state[slice]) {
        this.state[slice] = { ...this.state[slice], ...data };
        this.dirtySlices.add(slice);
      }
    }

    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.flush();
      }, 0);
    }
  }

  /**
   * Flush pending updates - emits events for dirty slices
   */
  flush() {
    this.batchTimeout = null;

    if (this.dirtySlices.size === 0) return;

    // Emit individual slice updates
    for (const slice of this.dirtySlices) {
      this.emit(`update:${slice}`, this.state[slice]);
    }

    // Emit combined update for components that need multiple slices
    this.emit("update", {
      slices: Array.from(this.dirtySlices),
      state: this.state,
    });

    this.dirtySlices.clear();
  }

  /**
   * Subscribe to a specific slice
   * Returns unsubscribe function
   */
  subscribe(slice, callback) {
    const event = `update:${slice}`;
    this.on(event, callback);

    // Immediately call with current state
    callback(this.state[slice]);

    return () => this.off(event, callback);
  }

  /**
   * Subscribe to multiple slices
   * Callback receives object with all subscribed slices
   */
  subscribeMultiple(slices, callback) {
    const handler = () => {
      const data = {};
      for (const slice of slices) {
        data[slice] = this.state[slice];
      }
      callback(data);
    };

    // Subscribe to each slice
    for (const slice of slices) {
      this.on(`update:${slice}`, handler);
    }

    // Immediately call with current state
    handler();

    return () => {
      for (const slice of slices) {
        this.off(`update:${slice}`, handler);
      }
    };
  }

  /**
   * Reset a slice to initial state
   */
  reset(slice) {
    // Store initial states for reset
    const initialStates = {
      [STATE_SLICES.CHAT]: {
        messages: [],
        isProcessing: false,
        streamingText: "",
        actionStreamingText: "",
        actionStreamingTitle: "",
        currentModelInfo: null,
      },
      [STATE_SLICES.OVERLAYS]: {
        showTestRunner: false,
        showSettings: false,
        showLinkedInViewer: false,
        showApprovalOverlay: false,
        setupOverlay: { active: false, type: null },
        linkedInViewerData: null,
      },
    };

    if (initialStates[slice]) {
      this.set(slice, initialStates[slice]);
    }
  }
}

// Singleton instance
let instance = null;

export const getAppStore = () => {
  if (!instance) {
    instance = new AppStore();
  }
  return instance;
};

// Export slice names for type safety
export { STATE_SLICES };

// Convenience functions for common operations
export const updateUI = (updates) => getAppStore().set(STATE_SLICES.UI, updates);
export const updateUser = (updates) => getAppStore().set(STATE_SLICES.USER, updates);
export const updateConnections = (updates) => getAppStore().set(STATE_SLICES.CONNECTIONS, updates);
export const updatePortfolio = (updates) => getAppStore().set(STATE_SLICES.PORTFOLIO, updates);
export const updateTickers = (updates) => getAppStore().set(STATE_SLICES.TICKERS, updates);
export const updateChat = (updates) => getAppStore().set(STATE_SLICES.CHAT, updates);
export const updateEngine = (updates) => getAppStore().set(STATE_SLICES.ENGINE, updates);
export const updateGoals = (updates) => getAppStore().set(STATE_SLICES.GOALS, updates);
export const updateLifeScores = (updates) => getAppStore().set(STATE_SLICES.LIFE_SCORES, updates);
export const updateHealth = (updates) => getAppStore().set(STATE_SLICES.HEALTH, updates);
export const updateProjects = (updates) => getAppStore().set(STATE_SLICES.PROJECTS, updates);
export const updateOverlays = (updates) => getAppStore().set(STATE_SLICES.OVERLAYS, updates);

// Add message helper
export const addMessage = (message) => {
  const store = getAppStore();
  const current = store.get(STATE_SLICES.CHAT);
  store.set(STATE_SLICES.CHAT, {
    messages: [...current.messages, { ...message, timestamp: new Date() }],
  });
};

export default AppStore;
