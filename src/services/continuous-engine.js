/**
 * Continuous Improvement Engine
 *
 * A unified autonomous engine that forms a persistent feedback loop:
 *   OBSERVE → SEARCH → PLAN → EXECUTE → MEASURE → LEARN → repeat
 *
 * Unlike the previous fragmented approach (claude-engine + orchestrator),
 * this engine:
 *   1. Measures numeric state BEFORE and AFTER every action
 *   2. Records (state, action, outcome) tuples in SQLite
 *   3. Uses epsilon-greedy exploration to avoid local minima
 *   4. Queries past outcomes to pick highest-impact actions
 *   5. Adapts rest periods based on cumulative learning
 *
 * Execution: Prefers Agent SDK (in-process), falls back to CLI streaming.
 */

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir, getProjectsDir, dataFile, memoryFile } from "./paths.js";
import { getKnowledgeDB, searchKeyword, indexDocument } from "./memory/knowledge-db.js";
import { runClaudeCodeStreaming, getClaudeCodeStatus } from "./ai/claude-code-cli.js";

// ── Constants ──────────────────────────────────────────────────

const ENGINE_STATE_FILE = dataFile("continuous-engine.json");
const HANDOFF_FILE = dataFile("engine-handoff.json");
const MIN_REST_MS = 2 * 60 * 1000;      // 2 min minimum rest
const MAX_REST_MS = 120 * 60 * 1000;     // 2 hours max rest
const DEFAULT_REST_MS = 15 * 60 * 1000;  // 15 min default
const EXECUTE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min per action
const EPSILON_INITIAL = 0.3;  // 30% explore at start
const EPSILON_MIN = 0.05;     // 5% explore minimum (never fully exploit)
const EPSILON_DECAY = 0.995;  // Decay per cycle

// ── Action Types ───────────────────────────────────────────────
// These are the categories of work the engine can do.
// Each maps to a prompt template that gets executed.

const ACTION_TYPES = {
  // Portfolio & finance
  PORTFOLIO_ANALYSIS:    { type: "portfolio_analysis",    dimension: "finance",  label: "Analyze portfolio & signals" },
  TICKER_RESEARCH:       { type: "ticker_research",       dimension: "finance",  label: "Research top/bottom tickers" },
  TRADE_EVALUATION:      { type: "trade_evaluation",      dimension: "finance",  label: "Evaluate trade opportunities" },

  // Health
  HEALTH_ANALYSIS:       { type: "health_analysis",       dimension: "health",   label: "Analyze health data & trends" },
  HEALTH_RECOMMENDATIONS:{ type: "health_recommendations",dimension: "health",   label: "Generate health recommendations" },

  // Goals & projects
  GOAL_PROGRESS:         { type: "goal_progress",         dimension: "goals",    label: "Advance highest-priority goal" },
  PROJECT_WORK:          { type: "project_work",          dimension: "goals",    label: "Work on active project" },
  GOAL_PLANNING:         { type: "goal_planning",         dimension: "goals",    label: "Plan/refine goal strategy" },

  // Career & learning
  CAREER_RESEARCH:       { type: "career_research",       dimension: "career",   label: "Research career opportunities" },
  LEARNING_PROGRESS:     { type: "learning_progress",     dimension: "learning", label: "Advance learning goals" },

  // Market & world
  MARKET_RESEARCH:       { type: "market_research",       dimension: "finance",  label: "Research market conditions" },
  NEWS_ANALYSIS:         { type: "news_analysis",         dimension: "awareness",label: "Analyze news impact" },
  DISASTER_ASSESSMENT:   { type: "disaster_assessment",   dimension: "safety",   label: "Update threat assessments" },

  // System improvement
  KNOWLEDGE_INDEXING:    { type: "knowledge_indexing",     dimension: "system",   label: "Index & organize knowledge" },
  DELIVERABLE_PRODUCTION:{ type: "deliverable_production", dimension: "system",   label: "Produce deliverables from data" },
};

const ALL_ACTIONS = Object.values(ACTION_TYPES);

// ── State Dimensions ───────────────────────────────────────────
// These are the numeric dimensions we track to measure improvement.

const DIMENSIONS = [
  "finance",   // Portfolio value, buying power, P&L
  "health",    // Oura scores (sleep, readiness, activity)
  "goals",     // Goal completion %, active goals count
  "career",    // Career score from life-scores
  "learning",  // Learning score from life-scores
  "awareness", // How up-to-date is market/news knowledge
  "safety",    // Disaster preparedness score
  "system",    // Knowledge DB coverage, deliverables produced
];

// ── Engine Class ───────────────────────────────────────────────

export class ContinuousEngine extends EventEmitter {
  constructor() {
    super();
    this.running = false;
    this.paused = false;
    this.resting = false;
    this.currentCycle = null;
    this.cycleCount = 0;
    this.epsilon = EPSILON_INITIAL;
    this.restTimeoutId = null;
    this.executeAbort = null;

    // Load persisted state
    this._loadState();
  }

  // ── Public API ─────────────────────────────────────────────

  async start() {
    if (this.running) return { success: false, reason: "Already running" };

    const status = await getClaudeCodeStatus();
    if (!status.ready) {
      return { success: false, reason: status.installed ? "Claude Code not logged in" : "Claude Code not installed" };
    }

    this.running = true;
    this.paused = false;
    this._saveState();
    this.emit("started");
    console.log("[ContinuousEngine] Started");

    // Begin the loop
    this._loop();
    return { success: true };
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this.restTimeoutId) clearTimeout(this.restTimeoutId);
    if (this.executeAbort) this.executeAbort();
    this._saveState();
    this.emit("stopped");
    console.log("[ContinuousEngine] Stopped");
  }

  pause() {
    this.paused = true;
    this._saveState();
    this.emit("paused");
  }

  resume() {
    if (!this.running) return this.start();
    this.paused = false;
    if (this.resting) this.wakeFromRest();
    this._saveState();
    this.emit("resumed");
  }

  /** Interrupt rest period immediately (e.g., user sent a message) */
  wakeFromRest() {
    if (this.restTimeoutId) {
      clearTimeout(this.restTimeoutId);
      this.restTimeoutId = null;
    }
    this.resting = false;
    this.emit("wake");
  }

  /** Force a specific action type next cycle */
  nudge(actionType) {
    this._forcedAction = actionType;
    if (this.resting) this.wakeFromRest();
  }

  getStatus() {
    const handoff = this._loadHandoff();
    return {
      running: this.running,
      paused: this.paused,
      resting: this.resting,
      cycleCount: this.cycleCount,
      epsilon: Math.round(this.epsilon * 1000) / 1000,
      currentCycle: this.currentCycle,
      nextHandoff: handoff ? {
        nextTask: handoff.nextTask,
        context: handoff.context,
        suggestedAction: handoff.suggestedAction,
        fromAction: handoff.fromAction,
        fromCycle: handoff.fromCycle,
      } : null,
      learningStats: this._getLearningStats(),
    };
  }

  // ── Main Loop ──────────────────────────────────────────────

  async _loop() {
    while (this.running) {
      if (this.paused) {
        await this._sleep(5000);
        continue;
      }

      try {
        // 0. HANDOFF — load what the previous session told us to do
        const handoff = this._loadHandoff();

        // 1. OBSERVE — snapshot current state
        const stateBefore = this._observeState();
        this.emit("observe", stateBefore);

        // 2. SEARCH — query past outcomes for context
        const pastOutcomes = this._searchPastOutcomes(stateBefore);

        // 3. PLAN — pick action (handoff-aware + epsilon-greedy)
        const action = this._planAction(stateBefore, pastOutcomes, handoff);
        this.currentCycle = { action, startedAt: Date.now(), phase: "executing" };
        this.emit("plan", action);

        // 4. EXECUTE — run the action via Agent SDK / CLI
        //    The prompt includes: handoff context, recent user needs, world changes
        const cycleId = this._beginCycle(action, stateBefore);
        const result = await this._executeAction(action, stateBefore, handoff);
        this.currentCycle.phase = "measuring";

        // 5. EXTRACT HANDOFF — parse what the agent says should happen next
        const nextHandoff = this._extractHandoff(result.output, action);
        if (nextHandoff) {
          this._saveHandoff(nextHandoff);
          console.log(`[ContinuousEngine] Handoff: "${(nextHandoff.nextTask || "none").slice(0, 80)}"`);
        }

        // 6. MEASURE — snapshot state again, compute delta
        const stateAfter = this._observeState();
        const delta = this._computeDelta(stateBefore, stateAfter);
        const reward = this._computeReward(delta, action);

        // 7. LEARN — record outcome in SQLite
        this._recordOutcome(cycleId, action, stateBefore, stateAfter, delta, reward, result);
        this._updateEffectiveness(action, reward);
        this._logExploration(action);

        // Index the action output for future search
        if (result.output) {
          try {
            await indexDocument(
              "engine_cycle",
              `cycle:${cycleId}`,
              `Action: ${action.label}\nTarget: ${action.target || "general"}\nReward: ${reward}\nHandoff: ${nextHandoff?.nextTask || "none"}\n\n${result.output.slice(0, 3000)}`,
              `Engine Cycle ${cycleId}: ${action.label}`
            );
          } catch {}
        }

        this.cycleCount++;
        this.epsilon = Math.max(EPSILON_MIN, this.epsilon * EPSILON_DECAY);
        this.currentCycle = null;

        this.emit("cycle-complete", { action, delta, reward, cycleCount: this.cycleCount, handoff: nextHandoff });
        console.log(`[ContinuousEngine] Cycle ${this.cycleCount}: ${action.label} → reward=${reward.toFixed(3)}`);

        // 8. REST — adaptive rest period
        const restMs = this._calculateRestPeriod(reward);
        this._saveState();
        await this._rest(restMs);

      } catch (err) {
        console.error("[ContinuousEngine] Cycle error:", err.message);
        this.emit("error", { error: err.message });
        this.currentCycle = null;
        // Rest longer after errors to avoid spinning
        await this._rest(DEFAULT_REST_MS);
      }
    }
  }

  // ── OBSERVE: Snapshot numeric state ────────────────────────

  _observeState() {
    const state = {};

    // Finance: portfolio value + buying power
    try {
      const alpacaCache = dataFile("alpaca-cache.json");
      if (fs.existsSync(alpacaCache)) {
        const data = JSON.parse(fs.readFileSync(alpacaCache, "utf-8"));
        const portfolio = data.portfolio || data;
        state.finance = parseFloat(portfolio.equity || portfolio.portfolio_value || 0);
        state.buying_power = parseFloat(portfolio.buying_power || 0);
      }
    } catch {}

    // Health: Oura scores
    try {
      const ouraFile = dataFile("oura-data.json");
      if (fs.existsSync(ouraFile)) {
        const oura = JSON.parse(fs.readFileSync(ouraFile, "utf-8"));
        const sleep = oura.latest?.sleep?.at?.(-1);
        const readiness = oura.latest?.readiness?.at?.(-1);
        const activity = oura.latest?.activity?.at?.(-1);
        state.health = Math.round(
          ((sleep?.score || 0) + (readiness?.score || 0) + (activity?.score || 0)) / 3
        );
      }
    } catch {}

    // Goals: completion percentage
    try {
      const goalsFile = dataFile("goals.json");
      if (fs.existsSync(goalsFile)) {
        const goals = JSON.parse(fs.readFileSync(goalsFile, "utf-8"));
        const arr = Array.isArray(goals) ? goals : goals.goals || [];
        const active = arr.filter(g => g.status === "active");
        const totalProgress = active.reduce((sum, g) => sum + (g.progress || 0), 0);
        state.goals = active.length > 0 ? Math.round(totalProgress / active.length) : 0;
        state.active_goals = active.length;
      }
    } catch {}

    // Life scores (career, learning, etc.)
    try {
      const scoresFile = dataFile("life-scores.json");
      if (fs.existsSync(scoresFile)) {
        const scores = JSON.parse(fs.readFileSync(scoresFile, "utf-8"));
        const dims = scores.dimensions || scores;
        if (typeof dims === "object") {
          for (const [key, val] of Object.entries(dims)) {
            const score = typeof val === "object" ? val.score : val;
            if (typeof score === "number") {
              state[key.toLowerCase()] = score;
            }
          }
        }
      }
    } catch {}

    // Knowledge coverage: count of indexed documents
    try {
      const db = getKnowledgeDB();
      const row = db.prepare("SELECT COUNT(*) as cnt FROM documents").get();
      state.knowledge_docs = row?.cnt || 0;
      const chunkRow = db.prepare("SELECT COUNT(*) as cnt FROM chunks").get();
      state.knowledge_chunks = chunkRow?.cnt || 0;
    } catch {}

    // Awareness: freshness of market data
    try {
      const tickersFile = dataFile("tickers-cache.json");
      if (fs.existsSync(tickersFile)) {
        const stat = fs.statSync(tickersFile);
        const hoursOld = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
        state.awareness = Math.max(0, 100 - Math.round(hoursOld * 4)); // Decays 4 pts/hr
      }
    } catch {}

    state._timestamp = Date.now();
    return state;
  }

  // ── SEARCH: Query past outcomes from SQLite ────────────────

  _searchPastOutcomes(currentState) {
    try {
      const db = getKnowledgeDB();

      // Get best actions by average reward (top 10)
      const bestActions = db.prepare(`
        SELECT action_type, action_target, avg_reward, total_runs, last_run_at, consecutive_failures
        FROM action_effectiveness
        WHERE total_runs >= 1
        ORDER BY avg_reward DESC
        LIMIT 10
      `).all();

      // Get recent cycles (last 20)
      const recentCycles = db.prepare(`
        SELECT action_type, action_description, reward, success, started_at, strategy
        FROM engine_cycles
        ORDER BY started_at DESC
        LIMIT 20
      `).all();

      // Get actions that haven't been tried recently (exploration candidates)
      const staleActions = db.prepare(`
        SELECT action_type, action_target, last_run_at
        FROM action_effectiveness
        WHERE last_run_at < ?
        ORDER BY last_run_at ASC
        LIMIT 5
      `).all(Date.now() - 24 * 60 * 60 * 1000); // Older than 24 hours

      return { bestActions, recentCycles, staleActions };
    } catch (err) {
      console.warn("[ContinuousEngine] SQLite search failed:", err.message);
      return { bestActions: [], recentCycles: [], staleActions: [] };
    }
  }

  // ── PLAN: Epsilon-greedy action selection ──────────────────

  _planAction(state, pastOutcomes, handoff = null) {
    // If user forced an action, use it
    if (this._forcedAction) {
      const forced = ALL_ACTIONS.find(a => a.type === this._forcedAction);
      this._forcedAction = null;
      if (forced) return { ...forced, strategy: "forced", target: null };
    }

    // If previous session handed off a specific action type, honor it
    if (handoff?.suggestedAction) {
      const match = ALL_ACTIONS.find(a => a.type === handoff.suggestedAction);
      if (match) {
        return { ...match, strategy: "handoff", target: handoff.nextTask, handoffContext: handoff.context };
      }
    }

    // If previous session defined a next task (even without explicit action type),
    // try to match it to an action by keyword
    if (handoff?.nextTask) {
      const taskLower = handoff.nextTask.toLowerCase();
      const keywordMap = [
        { keywords: ["portfolio", "position", "stock", "trade", "buy", "sell"], type: "portfolio_analysis" },
        { keywords: ["ticker", "score", "research ticker"], type: "ticker_research" },
        { keywords: ["health", "sleep", "oura", "readiness", "activity"], type: "health_analysis" },
        { keywords: ["goal", "progress", "milestone"], type: "goal_progress" },
        { keywords: ["project", "work on", "continue"], type: "project_work" },
        { keywords: ["market", "index", "sector", "economy"], type: "market_research" },
        { keywords: ["news", "breaking", "headline"], type: "news_analysis" },
        { keywords: ["disaster", "threat", "risk assessment"], type: "disaster_assessment" },
        { keywords: ["plan", "planning", "strategy", "tasks"], type: "goal_planning" },
        { keywords: ["career", "job", "opportunity"], type: "career_research" },
        { keywords: ["learn", "study", "education", "course"], type: "learning_progress" },
        { keywords: ["deliverable", "report", "document", "excel", "pdf"], type: "deliverable_production" },
      ];

      for (const { keywords, type } of keywordMap) {
        if (keywords.some(k => taskLower.includes(k))) {
          const match = ALL_ACTIONS.find(a => a.type === type);
          if (match) {
            return { ...match, strategy: "handoff_inferred", target: handoff.nextTask, handoffContext: handoff.context };
          }
        }
      }

      // Couldn't map to specific action — use the handoff as target for the closest match
      // but still fall through to normal planning (with handoff context injected into prompt)
    }

    const { bestActions, recentCycles } = pastOutcomes;

    // Build a set of recently-executed actions (last 5 cycles) to avoid repetition
    const recentTypes = new Set(
      (recentCycles || []).slice(0, 5).map(c => c.action_type)
    );

    // Filter out actions that just ran
    const candidates = ALL_ACTIONS.filter(a => !recentTypes.has(a.type));
    const pool = candidates.length > 0 ? candidates : ALL_ACTIONS;

    // Epsilon-greedy: explore vs exploit
    const isExplore = Math.random() < this.epsilon;

    if (isExplore) {
      // EXPLORE: pick a random action (preferring untried or stale ones)
      const staleTypes = new Set(
        (pastOutcomes.staleActions || []).map(s => s.action_type)
      );
      const stalePool = pool.filter(a => staleTypes.has(a.type));
      const chosen = stalePool.length > 0
        ? stalePool[Math.floor(Math.random() * stalePool.length)]
        : pool[Math.floor(Math.random() * pool.length)];
      return { ...chosen, strategy: "explore", target: null };
    }

    // EXPLOIT: pick the action with highest historical reward
    if (bestActions.length > 0) {
      // Map best known actions to our action types
      for (const best of bestActions) {
        if (best.consecutive_failures >= 3) continue; // Skip repeatedly failing actions
        const match = pool.find(a => a.type === best.action_type);
        if (match) {
          return { ...match, strategy: "exploit", target: best.action_target, expectedReward: best.avg_reward };
        }
      }
    }

    // Fallback: score-based selection (prefer dimensions with lowest state values)
    const dimensionScores = {};
    for (const dim of DIMENSIONS) {
      dimensionScores[dim] = state[dim] || 0;
    }
    // Sort dimensions by score ascending (weakest first)
    const weakest = Object.entries(dimensionScores)
      .sort(([, a], [, b]) => a - b)
      .map(([dim]) => dim);

    // Pick an action targeting the weakest dimension
    for (const dim of weakest) {
      const match = pool.find(a => a.dimension === dim);
      if (match) return { ...match, strategy: "exploit_weakest", target: null };
    }

    // Last resort: random from pool
    return { ...pool[Math.floor(Math.random() * pool.length)], strategy: "fallback", target: null };
  }

  // ── EXECUTE: Run the action ────────────────────────────────

  async _executeAction(action, state, handoff = null) {
    const prompt = this._buildPrompt(action, state, handoff);
    const cwd = process.cwd();

    return new Promise((resolve) => {
      let output = "";
      let toolCalls = [];
      let resolved = false;
      const startTime = Date.now();

      const finish = (success, error = null) => {
        if (resolved) return;
        resolved = true;
        resolve({
          success,
          output,
          toolCalls,
          error,
          durationMs: Date.now() - startTime,
        });
      };

      // Timeout safety
      const timeout = setTimeout(() => finish(false, "timeout"), EXECUTE_TIMEOUT_MS);
      this.executeAbort = () => {
        clearTimeout(timeout);
        finish(false, "aborted");
      };

      // Use streaming (prefers Agent SDK internally)
      runClaudeCodeStreaming(prompt, {
        cwd,
        timeout: EXECUTE_TIMEOUT_MS,
        model: undefined, // Use auto-selection (Opus → Sonnet fallback)
      }).then((emitter) => {
        emitter.on("data", (text) => {
          output += text;
          this.emit("output", { text, action: action.type });
        });
        emitter.on("tool", (t) => {
          toolCalls.push(t);
          this.emit("tool", t);
        });
        emitter.on("complete", (result) => {
          clearTimeout(timeout);
          finish(result.success !== false, result.error || null);
        });
        emitter.on("error", (err) => {
          clearTimeout(timeout);
          finish(false, err.error || "Unknown error");
        });
        emitter.on("auth-error", (err) => {
          clearTimeout(timeout);
          finish(false, `Auth: ${err.error}`);
        });
      }).catch((err) => {
        clearTimeout(timeout);
        finish(false, err.message);
      });
    });
  }

  // ── MEASURE: Compute state delta ───────────────────────────

  _computeDelta(before, after) {
    const delta = {};
    for (const key of Object.keys(after)) {
      if (key.startsWith("_")) continue;
      const b = typeof before[key] === "number" ? before[key] : 0;
      const a = typeof after[key] === "number" ? after[key] : 0;
      if (b !== 0 || a !== 0) {
        delta[key] = a - b;
      }
    }
    return delta;
  }

  _computeReward(delta, action) {
    // Reward is a weighted sum of dimension improvements
    // Range: roughly -1.0 to 1.0
    let reward = 0;
    const weights = {
      finance: 0.001,      // $1 change = 0.001 reward
      health: 0.01,        // 1 point health = 0.01 reward
      goals: 0.02,         // 1% goal progress = 0.02 reward
      career: 0.01,
      learning: 0.01,
      awareness: 0.005,
      safety: 0.005,
      knowledge_docs: 0.01, // Each new indexed doc
      knowledge_chunks: 0.001,
    };

    for (const [key, change] of Object.entries(delta)) {
      const w = weights[key] || 0;
      reward += change * w;
    }

    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, reward));
  }

  // ── LEARN: Record to SQLite ────────────────────────────────

  _beginCycle(action, stateBefore) {
    try {
      const db = getKnowledgeDB();
      const result = db.prepare(`
        INSERT INTO engine_cycles (started_at, action_type, action_description, action_target, state_before, strategy)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        Date.now(),
        action.type,
        action.label,
        action.target || null,
        JSON.stringify(stateBefore),
        action.strategy || "unknown"
      );
      return result.lastInsertRowid;
    } catch (err) {
      console.warn("[ContinuousEngine] Failed to begin cycle:", err.message);
      return 0;
    }
  }

  _recordOutcome(cycleId, action, stateBefore, stateAfter, delta, reward, result) {
    if (!cycleId) return;
    try {
      const db = getKnowledgeDB();
      db.prepare(`
        UPDATE engine_cycles
        SET finished_at = ?, state_after = ?, delta_json = ?, reward = ?,
            output_summary = ?, success = ?, error = ?, duration_ms = ?, model_used = ?
        WHERE id = ?
      `).run(
        Date.now(),
        JSON.stringify(stateAfter),
        JSON.stringify(delta),
        reward,
        (result.output || "").slice(0, 2000),
        result.success ? 1 : 0,
        result.error || null,
        result.durationMs || null,
        null,
        cycleId
      );

      // Record state snapshot for trend tracking
      for (const [dim, val] of Object.entries(stateAfter)) {
        if (dim.startsWith("_") || typeof val !== "number") continue;
        db.prepare(`
          INSERT INTO state_snapshots (timestamp, dimension, value, source)
          VALUES (?, ?, ?, ?)
        `).run(Date.now(), dim, val, `cycle:${cycleId}`);
      }
    } catch (err) {
      console.warn("[ContinuousEngine] Failed to record outcome:", err.message);
    }
  }

  _updateEffectiveness(action, reward) {
    try {
      const db = getKnowledgeDB();
      const target = action.target || "__general__";
      const existing = db.prepare(
        "SELECT * FROM action_effectiveness WHERE action_type = ? AND action_target = ?"
      ).get(action.type, target);

      if (existing) {
        const newTotal = existing.total_runs + 1;
        const newTotalReward = existing.total_reward + reward;
        const newAvg = newTotalReward / newTotal;
        const newBest = Math.max(existing.best_reward, reward);
        const newWorst = Math.min(existing.worst_reward, reward);
        const failures = reward <= -0.01 ? existing.consecutive_failures + 1 : 0;

        db.prepare(`
          UPDATE action_effectiveness
          SET total_runs = ?, total_reward = ?, avg_reward = ?, best_reward = ?,
              worst_reward = ?, last_run_at = ?, consecutive_failures = ?
          WHERE action_type = ? AND action_target = ?
        `).run(newTotal, newTotalReward, newAvg, newBest, newWorst, Date.now(), failures, action.type, target);
      } else {
        db.prepare(`
          INSERT INTO action_effectiveness (action_type, action_target, total_runs, total_reward, avg_reward, best_reward, worst_reward, last_run_at, consecutive_failures)
          VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
        `).run(action.type, target, reward, reward, reward, reward, Date.now(), reward <= -0.01 ? 1 : 0);
      }
    } catch (err) {
      console.warn("[ContinuousEngine] Failed to update effectiveness:", err.message);
    }
  }

  _logExploration(action) {
    try {
      const db = getKnowledgeDB();
      db.prepare(`
        INSERT INTO exploration_log (timestamp, epsilon, was_explore, chosen_action, best_known_action, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        Date.now(),
        this.epsilon,
        action.strategy === "explore" ? 1 : 0,
        action.type,
        null,
        action.strategy
      );
    } catch {}
  }

  // ── REST: Adaptive rest period ─────────────────────────────

  _calculateRestPeriod(lastReward) {
    // Good reward → shorter rest (momentum). Bad reward → longer rest (don't repeat).
    // Neutral → default rest.
    if (lastReward > 0.1) return Math.max(MIN_REST_MS, DEFAULT_REST_MS * 0.5);  // 7.5 min
    if (lastReward > 0.01) return DEFAULT_REST_MS;                               // 15 min
    if (lastReward > -0.01) return DEFAULT_REST_MS * 1.5;                        // 22.5 min
    if (lastReward > -0.1) return DEFAULT_REST_MS * 2;                           // 30 min
    return Math.min(MAX_REST_MS, DEFAULT_REST_MS * 4);                           // 60 min
  }

  async _rest(ms) {
    this.resting = true;
    this.emit("resting", { durationMs: ms });
    console.log(`[ContinuousEngine] Resting for ${Math.round(ms / 60000)} min`);

    return new Promise((resolve) => {
      this.restTimeoutId = setTimeout(() => {
        this.resting = false;
        this.restTimeoutId = null;
        resolve();
      }, ms);
    });
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── PROMPT BUILDING ────────────────────────────────────────

  _buildPrompt(action, state, handoff = null) {
    // Search SQLite for relevant past learnings
    let pastContext = "";
    try {
      const searchTerm = action.handoffContext || action.label;
      const results = searchKeyword(searchTerm, { limit: 3, sourceType: "engine_cycle" });
      if (results.length > 0) {
        pastContext = results.map(r => `- ${r.text.slice(0, 200)}`).join("\n");
      }
    } catch {}

    const stateStr = Object.entries(state)
      .filter(([k]) => !k.startsWith("_"))
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");

    // Gather context layers
    const userContext = this._getRecentUserContext();
    const dataChanges = this._getRecentDataChanges();

    // Build the handoff section — this is the PRIMARY directive if it exists
    let handoffSection = "";
    if (handoff?.nextTask) {
      handoffSection = `
## PREVIOUS SESSION HANDOFF (DO THIS FIRST)
The previous session completed "${handoff.fromAction}" and left these instructions:

NEXT TASK: ${handoff.nextTask}
${handoff.context ? `CONTEXT: ${handoff.context}` : ""}
${handoff.unfinishedWork ? `UNFINISHED: ${handoff.unfinishedWork}` : ""}
${handoff.filesChanged?.length > 0 ? `FILES CHANGED LAST TIME: ${handoff.filesChanged.join(", ")}` : ""}

START WITH THIS. Don't re-read everything from scratch. The previous session already did the discovery.
Pick up from where it left off.
`;
    }

    const base = `You are BACKBONE's Continuous Improvement Engine. Your job is to make measurable, forward progress every single session.
${handoffSection}
## CURRENT STATE
${stateStr}

## THIS SESSION'S ACTION
Action: ${action.label}
Dimension: ${action.dimension}
Strategy: ${action.strategy}
${action.target ? `Target: ${action.target}` : ""}

${pastContext ? `## LEARNINGS FROM SIMILAR PAST ACTIONS\n${pastContext}\n` : ""}${userContext ? `## ${userContext}\n` : ""}${dataChanges ? `## ${dataChanges}\n` : ""}
## EXECUTION RULES
1. ${handoff?.nextTask ? "START with the handoff task above — don't re-discover context" : "Read the MINIMUM files needed for context (not everything)"}
2. Take concrete actions that MEASURABLY improve the "${action.dimension}" dimension
3. Update files with real data, not placeholders
4. Prefer small, high-impact actions over large vague ones

## MANDATORY: HANDOFF FOR NEXT SESSION
Before you finish, you MUST output a handoff block so the next session knows exactly what to do.
This is CRITICAL — without it, the next session starts cold and wastes time.

Format your handoff as the LAST thing you output:

HANDOFF:
Next: [What the next session should do first — be specific]
Context: [Why this is the right next step — what did you learn/discover?]
Files: [Comma-separated list of files you changed]
Unfinished: [Anything you started but couldn't complete]
Action: [Suggested action_type for next session, e.g. portfolio_analysis, goal_progress, etc.]
---`;

    return base + this._getActionSpecificPrompt(action);
  }

  _getActionSpecificPrompt(action) {
    const prompts = {
      portfolio_analysis: `\n\nFOCUS: Read data/alpaca-cache.json, data/trades-log.json, data/tickers-cache.json. Analyze current positions, P&L, and signals. Update memory/portfolio-notes.md with findings.`,

      ticker_research: `\n\nFOCUS: Read data/prediction-cache.json for ticker scores and evaluations. Identify the top 3 and bottom 3 tickers. Do web research on catalysts. Update findings in data/ files.`,

      trade_evaluation: `\n\nFOCUS: Read current positions and trading signals. Evaluate whether any trades should be made based on scores, anti-churn rules, and market conditions. Update memory/portfolio-notes.md.`,

      health_analysis: `\n\nFOCUS: Read data/oura-data.json for sleep, readiness, activity. Look for trends. Compare to goals. Update memory/health-notes.md with analysis and recommendations.`,

      health_recommendations: `\n\nFOCUS: Based on Oura data trends, generate specific actionable health recommendations. Consider sleep hygiene, activity targets, recovery patterns. Update memory/health-notes.md.`,

      goal_progress: `\n\nFOCUS: Read data/goals.json, find the highest-priority active goal. Work on its next incomplete task. Update the goal's progress percentage. Update relevant project files.`,

      project_work: `\n\nFOCUS: Check projects/ for the most recently modified or highest-priority project. Read its PROJECT.md. Work on the next step. Add a dated progress entry.`,

      goal_planning: `\n\nFOCUS: Read data/goals.json, find goals that need better plans (low progress, no tasks). Create or refine the execution plan. Break into specific tasks with success criteria.`,

      career_research: `\n\nFOCUS: Read memory/profile-work.md for career context. Research relevant opportunities, skills in demand, industry trends. Update memory/profile-work.md or create career research notes.`,

      learning_progress: `\n\nFOCUS: Check for learning-related goals in data/goals.json. Find educational content, summarize key takeaways. Track progress on learning objectives.`,

      market_research: `\n\nFOCUS: Do web research on current market conditions — indices, sector performance, economic indicators. Update projects/market-analysis/PROJECT.md with real data.`,

      news_analysis: `\n\nFOCUS: Search for breaking news relevant to portfolio holdings and goals. Analyze impact. Update memory/tickers.md with any new information.`,

      disaster_assessment: `\n\nFOCUS: Research current threat levels across domains (market risk, geopolitical, climate, etc). Update projects/disaster-planning/PROJECT.md with current assessments.`,

      knowledge_indexing: `\n\nFOCUS: Scan memory/ and projects/ for files that need organizing. Ensure all project files are up to date. Clean up stale data. Create summaries of recent work.`,

      deliverable_production: `\n\nFOCUS: Check data/deliverables.json for pending deliverables. Produce the next most important one (Excel, PDF, or PPTX) from real data. Save to data/spreadsheets/ or data/documents/.`,
    };

    return prompts[action.type] || "";
  }

  // ── LEARNING STATS ─────────────────────────────────────────

  _getLearningStats() {
    try {
      const db = getKnowledgeDB();

      const totalCycles = db.prepare("SELECT COUNT(*) as cnt FROM engine_cycles").get()?.cnt || 0;
      const avgReward = db.prepare("SELECT AVG(reward) as avg FROM engine_cycles WHERE reward IS NOT NULL").get()?.avg || 0;
      const successRate = db.prepare("SELECT AVG(success) as rate FROM engine_cycles").get()?.rate || 0;

      const topActions = db.prepare(`
        SELECT action_type, avg_reward, total_runs
        FROM action_effectiveness
        WHERE total_runs >= 2
        ORDER BY avg_reward DESC
        LIMIT 5
      `).all();

      const recentTrend = db.prepare(`
        SELECT AVG(reward) as avg
        FROM (SELECT reward FROM engine_cycles ORDER BY started_at DESC LIMIT 10)
      `).get()?.avg || 0;

      const exploreRatio = db.prepare(`
        SELECT AVG(was_explore) as ratio
        FROM (SELECT was_explore FROM exploration_log ORDER BY timestamp DESC LIMIT 20)
      `).get()?.ratio || 0;

      return {
        totalCycles,
        avgReward: Math.round(avgReward * 1000) / 1000,
        recentTrend: Math.round(recentTrend * 1000) / 1000,
        successRate: Math.round(successRate * 100),
        exploreRatio: Math.round(exploreRatio * 100),
        topActions,
      };
    } catch {
      return { totalCycles: 0, avgReward: 0, recentTrend: 0, successRate: 0, exploreRatio: 0, topActions: [] };
    }
  }

  // ── HANDOFF: Session chaining ────────────────────────────────
  // The critical insight: before a session ends, it MUST define what the next
  // session should do. This prevents cold-start re-discovery every cycle.

  /**
   * Extract the handoff from the session's output.
   * The prompt asks the agent to output a HANDOFF block. We parse it.
   * If no structured handoff is found, we extract the last substantive paragraph.
   */
  _extractHandoff(output, action) {
    if (!output) return null;

    // Try to find a structured HANDOFF block
    const handoffMatch = output.match(/HANDOFF:\s*\n([\s\S]*?)(?:\n---|\n##|\nIMPORTANT|$)/i);
    if (handoffMatch) {
      const raw = handoffMatch[1].trim();
      return this._parseHandoffBlock(raw, action);
    }

    // Try JSON format: { "next_task": ..., "context": ..., "why": ... }
    const jsonMatch = output.match(/```(?:json)?\s*(\{[\s\S]*?"next_task"[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          nextTask: parsed.next_task || parsed.nextTask || null,
          context: parsed.context || parsed.why || null,
          filesChanged: parsed.files_changed || parsed.filesChanged || [],
          unfinishedWork: parsed.unfinished || parsed.unfinished_work || null,
          suggestedAction: parsed.suggested_action || parsed.suggestedAction || null,
          extractedAt: Date.now(),
          fromCycle: this.cycleCount,
          fromAction: action.type,
        };
      } catch {}
    }

    // Fallback: use the last meaningful paragraph as context
    const paragraphs = output.split(/\n\n+/).filter(p => p.trim().length > 40);
    const last = paragraphs.at(-1)?.trim();

    return {
      nextTask: null,
      context: last ? last.slice(0, 500) : null,
      filesChanged: [],
      unfinishedWork: null,
      suggestedAction: null,
      extractedAt: Date.now(),
      fromCycle: this.cycleCount,
      fromAction: action.type,
    };
  }

  _parseHandoffBlock(raw, action) {
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
    let nextTask = null;
    let context = null;
    let filesChanged = [];
    let unfinishedWork = null;
    let suggestedAction = null;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("next:") || lower.startsWith("next task:")) {
        nextTask = line.replace(/^next\s*(?:task)?:\s*/i, "").trim();
      } else if (lower.startsWith("context:") || lower.startsWith("because:") || lower.startsWith("why:")) {
        context = line.replace(/^(?:context|because|why):\s*/i, "").trim();
      } else if (lower.startsWith("files:") || lower.startsWith("changed:")) {
        filesChanged = line.replace(/^(?:files|changed):\s*/i, "").split(",").map(f => f.trim()).filter(Boolean);
      } else if (lower.startsWith("unfinished:") || lower.startsWith("blocked:")) {
        unfinishedWork = line.replace(/^(?:unfinished|blocked):\s*/i, "").trim();
      } else if (lower.startsWith("action:") || lower.startsWith("suggested:")) {
        suggestedAction = line.replace(/^(?:action|suggested):\s*/i, "").trim();
      } else if (!nextTask) {
        // First line without prefix is the next task
        nextTask = line;
      }
    }

    return {
      nextTask,
      context,
      filesChanged,
      unfinishedWork,
      suggestedAction,
      extractedAt: Date.now(),
      fromCycle: this.cycleCount,
      fromAction: action.type,
    };
  }

  /** Save handoff to disk so next cycle (even after restart) can read it */
  _saveHandoff(handoff) {
    if (!handoff) return;
    try {
      const dir = path.dirname(HANDOFF_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(HANDOFF_FILE, JSON.stringify(handoff, null, 2));
    } catch {}

    // Also persist to SQLite for searchability
    try {
      const db = getKnowledgeDB();
      db.prepare(`
        INSERT OR REPLACE INTO meta (key, value)
        VALUES ('last_handoff', ?)
      `).run(JSON.stringify(handoff));
    } catch {}
  }

  /** Load the handoff from the previous cycle */
  _loadHandoff() {
    try {
      if (fs.existsSync(HANDOFF_FILE)) {
        return JSON.parse(fs.readFileSync(HANDOFF_FILE, "utf-8"));
      }
    } catch {}
    return null;
  }

  /** Gather recent user context: what did the user recently ask/interact about? */
  _getRecentUserContext() {
    const context = [];

    // Check activity log for recent user messages
    try {
      const activityFile = dataFile("activity-log.json");
      if (fs.existsSync(activityFile)) {
        const data = JSON.parse(fs.readFileSync(activityFile, "utf-8"));
        const entries = Array.isArray(data) ? data : data.entries || [];
        const recent = entries
          .filter(e => e.timestamp && (Date.now() - new Date(e.timestamp).getTime()) < 2 * 60 * 60 * 1000) // last 2 hours
          .slice(-5);
        if (recent.length > 0) {
          context.push("RECENT USER ACTIVITY (last 2h):");
          for (const e of recent) {
            context.push(`  - ${e.action || e.type || "activity"}: ${(e.message || e.description || "").slice(0, 100)}`);
          }
        }
      }
    } catch {}

    // Check for recent query patterns
    try {
      const queryFile = dataFile("query-tracker.json");
      if (fs.existsSync(queryFile)) {
        const data = JSON.parse(fs.readFileSync(queryFile, "utf-8"));
        const queries = Array.isArray(data) ? data : data.queries || data.recent || [];
        const recent = queries
          .filter(q => q.timestamp && (Date.now() - new Date(q.timestamp).getTime()) < 4 * 60 * 60 * 1000)
          .slice(-5);
        if (recent.length > 0) {
          context.push("RECENT USER QUERIES:");
          for (const q of recent) {
            context.push(`  - "${(q.query || q.message || q.text || "").slice(0, 80)}"`);
          }
        }
      }
    } catch {}

    return context.length > 0 ? context.join("\n") : null;
  }

  /** Gather recent world/data changes: what files changed recently? */
  _getRecentDataChanges() {
    const changes = [];
    const checkFiles = [
      { path: dataFile("alpaca-cache.json"), label: "Portfolio data" },
      { path: dataFile("oura-data.json"), label: "Health data" },
      { path: dataFile("tickers-cache.json"), label: "Ticker data" },
      { path: dataFile("prediction-cache.json"), label: "Prediction research" },
      { path: dataFile("trades-log.json"), label: "Trades log" },
      { path: dataFile("goals.json"), label: "Goals" },
    ];

    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const { path: fp, label } of checkFiles) {
      try {
        if (fs.existsSync(fp)) {
          const stat = fs.statSync(fp);
          if (stat.mtimeMs > oneHourAgo) {
            const minutesAgo = Math.round((Date.now() - stat.mtimeMs) / 60000);
            changes.push(`  - ${label}: updated ${minutesAgo}m ago`);
          }
        }
      } catch {}
    }

    return changes.length > 0 ? "RECENTLY CHANGED DATA:\n" + changes.join("\n") : null;
  }

  // ── STATE PERSISTENCE ──────────────────────────────────────

  _loadState() {
    try {
      if (fs.existsSync(ENGINE_STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(ENGINE_STATE_FILE, "utf-8"));
        this.cycleCount = data.cycleCount || 0;
        this.epsilon = data.epsilon || EPSILON_INITIAL;
        this.running = false; // Always start stopped, must explicitly start
      }
    } catch {}
  }

  _saveState() {
    try {
      const dir = path.dirname(ENGINE_STATE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ENGINE_STATE_FILE, JSON.stringify({
        cycleCount: this.cycleCount,
        epsilon: this.epsilon,
        running: this.running,
        paused: this.paused,
        lastSaved: new Date().toISOString(),
      }, null, 2));
    } catch {}
  }
}

// ── Singleton ──────────────────────────────────────────────────

let _instance = null;

export function getContinuousEngine() {
  if (!_instance) _instance = new ContinuousEngine();
  return _instance;
}

export default ContinuousEngine;
