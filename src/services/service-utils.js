/**
 * Service Utilities - Error resilience patterns for robust agentic work
 *
 * Provides:
 * - CircuitBreaker: Prevents cascading failures
 * - withTimeout: Adds timeouts to async operations
 * - withRetry: Adds retry logic with exponential backoff
 * - ServiceHealthMonitor: Tracks service health metrics
 */

import { EventEmitter } from "events";

/**
 * Circuit Breaker States
 */
export const CIRCUIT_STATE = {
  CLOSED: "CLOSED",     // Normal operation
  OPEN: "OPEN",         // Failing, rejecting calls
  HALF_OPEN: "HALF_OPEN" // Testing if service recovered
};

/**
 * Circuit Breaker - Prevents cascading failures
 *
 * When a service fails repeatedly, the circuit "opens" and fast-fails
 * subsequent requests instead of waiting for timeouts.
 */
export class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || "unnamed";
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000; // 30s
    this.monitorWindow = options.monitorWindow || 60000; // 1 minute

    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = [];
    this.lastFailure = null;
    this.lastSuccess = null;
    this.openedAt = null;

    // Metrics
    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      lastStateChange: null
    };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute(fn) {
    this.metrics.totalCalls++;

    // Check if circuit is open
    if (this.state === CIRCUIT_STATE.OPEN) {
      // Check if we should try half-open
      if (Date.now() - this.openedAt >= this.recoveryTimeout) {
        this.setState(CIRCUIT_STATE.HALF_OPEN);
      } else {
        this.metrics.rejectedCalls++;
        throw new CircuitOpenError(`Circuit ${this.name} is OPEN - fast failing`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  onSuccess() {
    this.metrics.successfulCalls++;
    this.lastSuccess = Date.now();

    // If half-open, close the circuit
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.setState(CIRCUIT_STATE.CLOSED);
      this.failures = [];
    }
  }

  /**
   * Handle failed execution
   */
  onFailure(error) {
    this.metrics.failedCalls++;
    this.lastFailure = Date.now();

    // Add to failures window
    this.failures.push({
      timestamp: Date.now(),
      error: error.message
    });

    // Remove old failures outside window
    const windowStart = Date.now() - this.monitorWindow;
    this.failures = this.failures.filter(f => f.timestamp > windowStart);

    // Check if we should open the circuit
    if (this.state === CIRCUIT_STATE.CLOSED && this.failures.length >= this.failureThreshold) {
      this.setState(CIRCUIT_STATE.OPEN);
    }

    // If half-open test failed, go back to open
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.setState(CIRCUIT_STATE.OPEN);
    }
  }

  /**
   * Change circuit state
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.metrics.lastStateChange = Date.now();

    if (newState === CIRCUIT_STATE.OPEN) {
      this.openedAt = Date.now();
    }

    this.emit("state-change", { from: oldState, to: newState, circuit: this.name });
  }

  /**
   * Get circuit status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures.length,
      failureThreshold: this.failureThreshold,
      metrics: { ...this.metrics },
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess
    };
  }

  /**
   * Manually reset the circuit
   */
  reset() {
    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = [];
    this.openedAt = null;
    this.emit("reset", this.name);
  }
}

/**
 * Custom error for circuit breaker
 */
export class CircuitOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = "CircuitOpenError";
    this.isCircuitOpen = true;
  }
}

/**
 * Wrap an async function with a timeout
 *
 * @param {Function} fn - Async function to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name for error messages
 */
export async function withTimeout(fn, timeoutMs, operationName = "Operation") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    fn()
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Custom error for timeouts
 */
export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimeoutError";
    this.isTimeout = true;
  }
}

/**
 * Wrap an async function with retry logic
 *
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Retry options
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry circuit open errors
      if (error.isCircuitOpen) {
        throw error;
      }

      // Check if we should retry
      if (attempt < maxAttempts && shouldRetry(error, attempt)) {
        const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);

        if (onRetry) {
          onRetry(error, attempt, delay);
        }

        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Service Health Monitor - Tracks health metrics across services
 */
export class ServiceHealthMonitor extends EventEmitter {
  constructor() {
    super();
    this.services = new Map();
    this.globalMetrics = {
      totalErrors: 0,
      lastError: null,
      healthChecksFailed: 0,
      startTime: Date.now()
    };
  }

  /**
   * Register a service for monitoring
   */
  registerService(name, healthCheckFn = null) {
    this.services.set(name, {
      name,
      healthCheckFn,
      status: "unknown",
      lastCheck: null,
      lastError: null,
      errorCount: 0,
      successCount: 0,
      consecutiveFailures: 0,
      circuitBreaker: new CircuitBreaker({ name })
    });

    // Forward circuit breaker events
    const service = this.services.get(name);
    service.circuitBreaker.on("state-change", (change) => {
      this.emit("circuit-state-change", { service: name, ...change });
    });
  }

  /**
   * Record a service call result
   */
  recordCall(serviceName, success, error = null) {
    const service = this.services.get(serviceName);
    if (!service) return;

    if (success) {
      service.successCount++;
      service.consecutiveFailures = 0;
      service.status = "healthy";
    } else {
      service.errorCount++;
      service.consecutiveFailures++;
      service.lastError = {
        message: error?.message || "Unknown error",
        timestamp: Date.now(),
        stack: error?.stack
      };
      this.globalMetrics.totalErrors++;
      this.globalMetrics.lastError = service.lastError;

      if (service.consecutiveFailures >= 3) {
        service.status = "degraded";
      }
      if (service.consecutiveFailures >= 5) {
        service.status = "unhealthy";
      }

      this.emit("service-error", {
        service: serviceName,
        error: service.lastError,
        consecutiveFailures: service.consecutiveFailures
      });
    }
  }

  /**
   * Run health checks for all services
   */
  async runHealthChecks() {
    const results = {};

    for (const [name, service] of this.services) {
      try {
        if (service.healthCheckFn) {
          await withTimeout(service.healthCheckFn, 5000, `Health check: ${name}`);
          service.status = "healthy";
          service.lastCheck = Date.now();
          results[name] = { status: "healthy" };
        } else {
          results[name] = { status: service.status };
        }
      } catch (error) {
        service.status = "unhealthy";
        service.lastCheck = Date.now();
        service.lastError = { message: error.message, timestamp: Date.now() };
        this.globalMetrics.healthChecksFailed++;
        results[name] = { status: "unhealthy", error: error.message };

        this.emit("health-check-failed", { service: name, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get overall system health
   */
  getSystemHealth() {
    const services = {};
    let healthyCount = 0;
    let totalCount = 0;

    for (const [name, service] of this.services) {
      totalCount++;
      if (service.status === "healthy") healthyCount++;

      services[name] = {
        status: service.status,
        errorCount: service.errorCount,
        successCount: service.successCount,
        consecutiveFailures: service.consecutiveFailures,
        lastError: service.lastError,
        circuitState: service.circuitBreaker.state
      };
    }

    const overallStatus = healthyCount === totalCount ? "healthy"
      : healthyCount > totalCount / 2 ? "degraded"
      : "unhealthy";

    return {
      status: overallStatus,
      healthyServices: healthyCount,
      totalServices: totalCount,
      services,
      globalMetrics: { ...this.globalMetrics },
      uptime: Date.now() - this.globalMetrics.startTime
    };
  }

  /**
   * Get circuit breaker for a service
   */
  getCircuitBreaker(serviceName) {
    const service = this.services.get(serviceName);
    return service?.circuitBreaker;
  }

  /**
   * Execute through a service's circuit breaker
   */
  async executeWithCircuit(serviceName, fn) {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Unknown service: ${serviceName}`);
    }

    try {
      const result = await service.circuitBreaker.execute(fn);
      this.recordCall(serviceName, true);
      return result;
    } catch (error) {
      this.recordCall(serviceName, false, error);
      throw error;
    }
  }
}

// Singleton health monitor
let healthMonitor = null;

export const getServiceHealthMonitor = () => {
  if (!healthMonitor) {
    healthMonitor = new ServiceHealthMonitor();
  }
  return healthMonitor;
};

/**
 * Structured logger for consistent logging
 */
export class StructuredLogger {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.logs = [];
    this.maxLogs = 1000;
  }

  log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...data
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Also log to console with appropriate level
    const consoleMethod = level === "error" ? console.error
      : level === "warn" ? console.warn
      : console.log;

    consoleMethod(`[${entry.timestamp}] [${level.toUpperCase()}] [${this.serviceName}] ${message}`,
      Object.keys(data).length > 0 ? data : "");

    return entry;
  }

  info(message, data) { return this.log("info", message, data); }
  warn(message, data) { return this.log("warn", message, data); }
  error(message, data) { return this.log("error", message, data); }
  debug(message, data) { return this.log("debug", message, data); }

  getRecentLogs(count = 50, level = null) {
    let logs = this.logs;
    if (level) {
      logs = logs.filter(l => l.level === level);
    }
    return logs.slice(0, count);
  }
}

/**
 * Create a resilient function wrapper that combines timeout, retry, and circuit breaker
 */
export function createResilientFunction(fn, options = {}) {
  const {
    name = "operation",
    timeout = 30000,
    maxRetries = 3,
    circuitBreaker = null,
    onError = null
  } = options;

  return async (...args) => {
    const operation = async () => {
      return await withTimeout(
        () => fn(...args),
        timeout,
        name
      );
    };

    const retryableOperation = () => withRetry(operation, {
      maxAttempts: maxRetries,
      onRetry: (error, attempt, delay) => {
        if (onError) {
          onError(error, { attempt, delay, name });
        }
      }
    });

    if (circuitBreaker) {
      return await circuitBreaker.execute(retryableOperation);
    }

    return await retryableOperation();
  };
}

/**
 * Check if Claude Code CLI is installed
 */
export async function isClaudeCodeInstalled() {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    // Try running claude --version
    const { stdout } = await execAsync("claude --version", { timeout: 5000 });
    return { installed: true, version: stdout.trim() };
  } catch (error) {
    // Claude not found in PATH
    return { installed: false, version: null };
  }
}

/**
 * Core Competencies - What the engine should focus on
 */
export const CORE_COMPETENCIES = {
  SWING_TRADING: {
    id: "swing_trading",
    name: "Swing Trading",
    description: "Trading the best you can - finding optimal entry/exit points",
    priority: 10,
    actionTypes: ["research", "analyze", "execute"],
    examples: [
      "Research NVDA technical patterns for swing trade entry",
      "Analyze RSI divergence on SPY for reversal signal",
      "Execute limit buy order for AAPL at support level"
    ]
  },
  STOCK_RESEARCH: {
    id: "stock_research",
    name: "Stock Market Research",
    description: "Figuring out what's going on in markets, finding hidden truths globally",
    priority: 9,
    actionTypes: ["research", "analyze", "plan"],
    examples: [
      "Research semiconductor supply chain disruptions affecting AMD",
      "Analyze Fed rate decision impact on growth stocks",
      "Research institutional buying patterns in tech sector"
    ]
  },
  USER_ISSUES: {
    id: "user_issues",
    name: "User Issue Resolution",
    description: "Work improvements, financial growth, portfolio management, health, disaster prep, housing, family",
    priority: 8,
    actionTypes: ["research", "analyze", "plan", "execute"],
    subcategories: [
      "work_improvements",
      "financial_growth",
      "portfolio_management",
      "health_improvements",
      "disaster_management",
      "housing_improvements",
      "family_improvements"
    ]
  },
  PROJECTS_AND_GOALS: {
    id: "projects_goals",
    name: "Projects & Goals",
    description: "User's personal projects - should be 50%+ of all work",
    priority: 10,
    targetWorkPercentage: 50,
    actionTypes: ["research", "analyze", "plan", "execute", "build"]
  }
};

/**
 * Get suggested actions based on core competencies
 */
export function getSuggestedActions(context) {
  const suggestions = [];

  // Swing trading suggestions based on portfolio
  if (context.portfolio?.positions?.length > 0) {
    context.portfolio.positions.forEach(pos => {
      suggestions.push({
        competency: CORE_COMPETENCIES.SWING_TRADING,
        action: `Research ${pos.symbol} price action for swing trade optimization`,
        priority: 9
      });
    });
  }

  // Stock research suggestions based on watchlist
  if (context.tickers?.length > 0) {
    context.tickers.slice(0, 3).forEach(ticker => {
      suggestions.push({
        competency: CORE_COMPETENCIES.STOCK_RESEARCH,
        action: `Analyze ${ticker} fundamentals and recent news for trading signals`,
        priority: 8
      });
    });
  }

  // Health improvements based on metrics
  if (context.health?.readinessScore && context.health.readinessScore < 80) {
    suggestions.push({
      competency: CORE_COMPETENCIES.USER_ISSUES,
      subcategory: "health_improvements",
      action: `Research methods to improve recovery - current readiness ${context.health.readinessScore}`,
      priority: 7
    });
  }

  // Goal-based suggestions
  if (context.goals?.active?.length > 0) {
    context.goals.active.forEach(goal => {
      suggestions.push({
        competency: CORE_COMPETENCIES.PROJECTS_AND_GOALS,
        action: `Work on goal: ${goal.title} - research next actionable steps`,
        priority: 10
      });
    });
  }

  // Sort by priority
  suggestions.sort((a, b) => b.priority - a.priority);

  return suggestions;
}

/**
 * Load all user context from data files for AI conversations
 * Returns a comprehensive context object with profile, goals, projects, etc.
 */
export async function loadUserContextFiles() {
  const fs = await import("fs");
  const path = await import("path");

  const DATA_DIR = path.default.join(process.cwd(), "data");
  const context = {};

  // Helper to safely load JSON
  const loadJson = (filename) => {
    try {
      const filepath = path.default.join(DATA_DIR, filename);
      if (fs.default.existsSync(filepath)) {
        return JSON.parse(fs.default.readFileSync(filepath, "utf-8"));
      }
    } catch (e) { /* ignore */ }
    return null;
  };

  // Helper to safely load markdown
  const loadMarkdown = (filename) => {
    try {
      const filepath = path.default.join(DATA_DIR, filename);
      if (fs.default.existsSync(filepath)) {
        return fs.default.readFileSync(filepath, "utf-8");
      }
    } catch (e) { /* ignore */ }
    return null;
  };

  // Load LinkedIn profile (markdown has the summary, JSON has details)
  const linkedInMd = loadMarkdown("linkedin.md");
  const linkedInJson = loadJson("linkedin-profile.json");
  if (linkedInMd || linkedInJson) {
    context.linkedIn = {
      summary: linkedInMd,
      details: linkedInJson
    };
  }

  // Load user conversations history
  const conversationsMd = loadMarkdown("user_conversations.md");
  if (conversationsMd) {
    context.conversationHistory = conversationsMd.slice(-2000); // Last 2000 chars
  }

  // Load profile sections
  const profileSections = loadJson("profile-sections.json");
  if (profileSections) {
    context.profile = profileSections;
  }

  // Load goals
  const goals = loadJson("goals.json");
  if (goals?.goals?.length > 0) {
    context.goals = goals.goals;
  }

  // Load life scores
  const lifeScores = loadJson("life-scores.json");
  if (lifeScores) {
    context.lifeScores = {
      overall: lifeScores.overall,
      areas: lifeScores.areas
    };
  }

  // Load evaluation history (markdown)
  const evaluationMd = loadMarkdown("evaluation-history.md");
  if (evaluationMd) {
    context.evaluationHistory = evaluationMd.slice(-1500); // Last 1500 chars
  }

  // Load user settings/preferences
  const userSettings = loadJson("user-settings.json");
  if (userSettings) {
    context.userSettings = {
      theme: userSettings.theme,
      privateMode: userSettings.privateMode,
      coreModelProvider: userSettings.coreModelProvider
    };
  }

  // Load Firebase user info
  const firebaseUser = loadJson("firebase-user.json");
  if (firebaseUser) {
    context.user = {
      displayName: firebaseUser.displayName,
      email: firebaseUser.email
    };
  }

  // Load projects (if exists)
  const projectsDir = path.default.join(DATA_DIR, "projects");
  if (fs.default.existsSync(projectsDir)) {
    try {
      const projectFiles = fs.default.readdirSync(projectsDir).filter(f => f.endsWith(".json")).slice(0, 5);
      context.projects = projectFiles.map(f => {
        const project = loadJson(path.default.join("projects", f));
        return project ? { name: project.name, status: project.status, goal: project.goal } : null;
      }).filter(Boolean);
    } catch (e) { /* ignore */ }
  }

  return context;
}

export default {
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  withTimeout,
  withRetry,
  sleep,
  ServiceHealthMonitor,
  getServiceHealthMonitor,
  StructuredLogger,
  createResilientFunction,
  isClaudeCodeInstalled,
  CORE_COMPETENCIES,
  getSuggestedActions,
  CIRCUIT_STATE,
  loadUserContextFiles
};
