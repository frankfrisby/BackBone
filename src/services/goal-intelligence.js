/**
 * Goal Intelligence Service
 *
 * The learning layer on top of the autonomous engine. This service:
 * 1. LEARNS from user — observes conversations, habits, patterns
 * 2. PROPOSES goals — based on what it learns about the user
 * 3. EVALUATES — re-evaluates goals periodically against user's reality
 * 4. PLANS — creates detailed execution plans with acceptance criteria
 * 5. EXECUTES — delegates to autonomous loop for actual work
 * 6. REFLECTS — after work, checks criteria, updates plan if conditions changed
 * 7. PRESERVES criteria — only updates if user's goals changed or conditions differ
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getGoalTracker, GOAL_CATEGORY, GOAL_STATUS } from "./goal-tracker.js";
import { sendMessage, TASK_TYPES } from "./multi-ai.js";
import { getDataDir, getMemoryDir, getProjectsDir } from "./paths.js";

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const PROJECTS_DIR = getProjectsDir();

const INTELLIGENCE_STATE_PATH = path.join(DATA_DIR, "goal-intelligence.json");
const USER_PROFILE_PATH = path.join(DATA_DIR, "user-understanding.json");

/**
 * Default state
 */
const DEFAULT_STATE = {
  // What we've learned about the user
  userUnderstanding: {
    patterns: [],        // Behavioral patterns observed
    preferences: [],     // User preferences (communication style, work hours, etc.)
    strengths: [],       // Identified strengths
    challenges: [],      // Identified challenges
    lastUpdated: null,
  },
  // Goal proposals waiting for user review
  proposedGoals: [],
  // Evaluation history
  evaluations: [],
  // Plan revisions (track why criteria changed)
  criteriaChanges: [],
  // Cycle tracking
  lastLearnCycle: null,
  lastEvalCycle: null,
  lastReflectCycle: null,
  cycleCount: 0,
};

/**
 * Goal Intelligence Service
 */
class GoalIntelligence extends EventEmitter {
  constructor() {
    super();
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(INTELLIGENCE_STATE_PATH)) {
        return JSON.parse(fs.readFileSync(INTELLIGENCE_STATE_PATH, "utf-8"));
      }
    } catch (e) {
      console.error("[GoalIntelligence] Failed to load state:", e.message);
    }
    return { ...DEFAULT_STATE };
  }

  saveState() {
    try {
      fs.mkdirSync(path.dirname(INTELLIGENCE_STATE_PATH), { recursive: true });
      fs.writeFileSync(INTELLIGENCE_STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("[GoalIntelligence] Failed to save state:", e.message);
    }
  }

  // ========================================
  // PHASE 1: LEARN — Observe user patterns
  // ========================================

  /**
   * Learn from a user conversation/interaction.
   * Called after each user message to build understanding.
   */
  async learnFromInteraction(message, response, context = {}) {
    const now = new Date().toISOString();

    // Extract insights from the interaction
    const insight = this.extractInsight(message, context);
    if (insight) {
      this.state.userUnderstanding.patterns.push({
        type: insight.type,
        detail: insight.detail,
        timestamp: now,
        source: "conversation",
      });

      // Keep last 100 patterns
      if (this.state.userUnderstanding.patterns.length > 100) {
        this.state.userUnderstanding.patterns =
          this.state.userUnderstanding.patterns.slice(-100);
      }
    }

    this.state.userUnderstanding.lastUpdated = now;
    this.saveState();
  }

  /**
   * Extract behavioral insight from a user message.
   */
  extractInsight(message, context) {
    if (!message || typeof message !== "string") return null;
    const lower = message.toLowerCase();

    // Detect goal-related intent
    if (lower.match(/i want to|i need to|my goal|i'm trying to|i should/)) {
      return { type: "goal_intent", detail: message.substring(0, 200) };
    }
    // Detect frustration
    if (lower.match(/frustrated|annoyed|not working|broken|stuck|confused/)) {
      return { type: "frustration", detail: message.substring(0, 200) };
    }
    // Detect interest areas
    if (lower.match(/interested in|curious about|tell me about|what about/)) {
      return { type: "interest", detail: message.substring(0, 200) };
    }
    // Detect financial focus
    if (lower.match(/stock|portfolio|invest|trade|money|savings|income/)) {
      return { type: "financial_focus", detail: message.substring(0, 200) };
    }
    // Detect health focus
    if (lower.match(/sleep|exercise|health|workout|diet|weight|run|gym/)) {
      return { type: "health_focus", detail: message.substring(0, 200) };
    }
    // Detect career focus
    if (lower.match(/job|career|work|promotion|salary|interview|resume/)) {
      return { type: "career_focus", detail: message.substring(0, 200) };
    }

    return null;
  }

  /**
   * Build a comprehensive user understanding summary.
   * Called periodically (every 6 hours) to synthesize patterns.
   */
  async buildUserUnderstanding() {
    const patterns = this.state.userUnderstanding.patterns;
    if (patterns.length < 5) return; // Need enough data

    // Load existing context
    const goalsData = this.loadJsonSafe(path.join(DATA_DIR, "goals.json"));
    const beliefs = this.loadJsonSafe(path.join(DATA_DIR, "core-beliefs.json"));
    const profile = this.loadMemoryFile("profile.md");

    const prompt = `Analyze these user interaction patterns and build a concise understanding:

PATTERNS (last ${patterns.length}):
${patterns.slice(-30).map(p => `- [${p.type}] ${p.detail}`).join("\n")}

EXISTING GOALS: ${JSON.stringify(goalsData?.slice?.(0, 5) || [], null, 1)}
BELIEFS: ${JSON.stringify(beliefs?.beliefs?.slice?.(0, 5) || [], null, 1)}
PROFILE: ${(profile || "Not set").substring(0, 500)}

Synthesize into:
1. TOP 3 PRIORITIES — What the user cares about most right now
2. COMMUNICATION STYLE — How they prefer to interact (brief/detailed, formal/casual)
3. STRENGTHS — What they're good at based on their behavior
4. CHALLENGES — What they struggle with
5. OPPORTUNITIES — Goals they should consider but haven't stated

Output as JSON: { priorities: [], communicationStyle: "", strengths: [], challenges: [], opportunities: [] }`;

    try {
      const response = await sendMessage(prompt, {
        taskType: TASK_TYPES.REASONING,
        maxTokens: 1000,
      });

      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const understanding = JSON.parse(jsonMatch[0]);
        this.state.userUnderstanding.preferences = understanding.priorities || [];
        this.state.userUnderstanding.strengths = understanding.strengths || [];
        this.state.userUnderstanding.challenges = understanding.challenges || [];
        this.state.userUnderstanding.communicationStyle = understanding.communicationStyle || "";
        this.state.userUnderstanding.opportunities = understanding.opportunities || [];
      }

      this.state.lastLearnCycle = new Date().toISOString();
      this.saveState();
      this.emit("understanding-updated", this.state.userUnderstanding);
    } catch (e) {
      console.error("[GoalIntelligence] Failed to build understanding:", e.message);
    }
  }

  // ========================================
  // PHASE 2: EVALUATE — Re-evaluate goals
  // ========================================

  /**
   * Evaluate all active goals against current reality.
   * Returns goals that need attention, adjustment, or removal.
   */
  async evaluateGoals() {
    const goalTracker = getGoalTracker();
    const activeGoals = goalTracker.getActive();

    if (activeGoals.length === 0) return { needsAttention: [], summary: "No active goals" };

    const understanding = this.state.userUnderstanding;
    const evaluations = [];

    for (const goal of activeGoals) {
      const evaluation = await this.evaluateSingleGoal(goal, understanding);
      evaluations.push(evaluation);
    }

    // Store evaluation
    this.state.evaluations.push({
      timestamp: new Date().toISOString(),
      results: evaluations.map(e => ({
        goalId: e.goalId,
        status: e.status,
        reason: e.reason,
      })),
    });

    // Keep last 30 evaluations
    if (this.state.evaluations.length > 30) {
      this.state.evaluations = this.state.evaluations.slice(-30);
    }

    this.state.lastEvalCycle = new Date().toISOString();
    this.saveState();

    return {
      needsAttention: evaluations.filter(e => e.status !== "on_track"),
      onTrack: evaluations.filter(e => e.status === "on_track"),
      summary: `Evaluated ${evaluations.length} goals: ${evaluations.filter(e => e.status === "on_track").length} on track`,
    };
  }

  /**
   * Evaluate a single goal — is it still relevant? Making progress?
   */
  async evaluateSingleGoal(goal, understanding) {
    const goalTracker = getGoalTracker();
    const progress = goalTracker.calculateProgress(goal);
    const daysSinceCreation = (Date.now() - new Date(goal.createdAt || 0).getTime()) / 86400000;
    const progressRate = daysSinceCreation > 0 ? progress / daysSinceCreation : 0;

    // Quick evaluation without AI for most cases
    if (progress >= 0.9) {
      return { goalId: goal.id, status: "near_complete", reason: "Almost done", progress, goal };
    }
    if (progress >= 0.3 && progressRate > 0.01) {
      return { goalId: goal.id, status: "on_track", reason: "Making progress", progress, goal };
    }
    if (daysSinceCreation > 30 && progress < 0.1) {
      return { goalId: goal.id, status: "stalled", reason: "No progress in 30+ days", progress, goal };
    }
    if (daysSinceCreation > 7 && progress < 0.05) {
      return { goalId: goal.id, status: "needs_plan", reason: "Needs a detailed plan", progress, goal };
    }

    return { goalId: goal.id, status: "on_track", reason: "In progress", progress, goal };
  }

  // ========================================
  // PHASE 3: PLAN — Create detailed plans
  // ========================================

  /**
   * Create a detailed execution plan for a goal.
   * Plan includes phases, deliverables, and acceptance criteria.
   * Criteria are ONLY updated if conditions have changed.
   */
  async createGoalPlan(goal) {
    const projectDir = path.join(PROJECTS_DIR, this.slugify(goal.title));
    const planPath = path.join(projectDir, "PLAN.md");
    const criteriaPath = path.join(projectDir, "CRITERIA.md");

    // Check if plan already exists
    const existingPlan = this.loadFileSafe(planPath);
    const existingCriteria = this.loadFileSafe(criteriaPath);

    if (existingPlan && existingCriteria) {
      // Plan exists — check if conditions have changed
      const shouldUpdate = await this.shouldUpdatePlan(goal, existingPlan, existingCriteria);
      if (!shouldUpdate.update) {
        return { status: "unchanged", reason: shouldUpdate.reason, planPath };
      }
      // Record the criteria change
      this.state.criteriaChanges.push({
        goalId: goal.id,
        timestamp: new Date().toISOString(),
        reason: shouldUpdate.reason,
        previousCriteria: existingCriteria.substring(0, 500),
      });
    }

    // Generate new plan
    const understanding = this.state.userUnderstanding;
    const prompt = `Create a detailed execution plan for this goal:

GOAL: ${goal.title}
CATEGORY: ${goal.category}
DESCRIPTION: ${goal.description || ""}
CURRENT PROGRESS: ${Math.round((goal.progress || 0) * 100)}%

USER CONTEXT:
- Priorities: ${(understanding.preferences || []).join(", ") || "Not yet learned"}
- Strengths: ${(understanding.strengths || []).join(", ") || "Not yet learned"}
- Challenges: ${(understanding.challenges || []).join(", ") || "Not yet learned"}

Create a plan with:
1. PHASES (2-4 phases, each 1-3 days)
2. DELIVERABLES per phase (concrete outputs)
3. ACCEPTANCE CRITERIA (Must Have / Should Have / Nice to Have)

Output as markdown with clear structure.`;

    try {
      const plan = await sendMessage(prompt, {
        taskType: TASK_TYPES.PLANNING,
        maxTokens: 2000,
      });

      // Save plan and criteria
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(planPath, plan);

      // Extract criteria from plan (or generate separately)
      const criteria = this.extractCriteria(plan) || await this.generateCriteria(goal);
      fs.writeFileSync(criteriaPath, criteria);

      // Save PROJECT.md
      const projectMd = `# ${goal.title}

**Status**: active
**Category**: ${goal.category}
**Created**: ${new Date().toISOString().split("T")[0]}
**Goal ID**: ${goal.id}

## Overview
${goal.description || goal.title}

## Progress
- Current: ${Math.round((goal.progress || 0) * 100)}%
`;
      const projectMdPath = path.join(projectDir, "PROJECT.md");
      if (!fs.existsSync(projectMdPath)) {
        fs.writeFileSync(projectMdPath, projectMd);
      }

      this.saveState();
      this.emit("plan-created", { goalId: goal.id, planPath, criteriaPath });

      return { status: "created", planPath, criteriaPath };
    } catch (e) {
      console.error("[GoalIntelligence] Failed to create plan:", e.message);
      return { status: "error", reason: e.message };
    }
  }

  /**
   * Check if an existing plan should be updated.
   * Only update if: user's goal changed, conditions are different, or plan is failing.
   */
  async shouldUpdatePlan(goal, existingPlan, existingCriteria) {
    const goalTracker = getGoalTracker();
    const progress = goalTracker.calculateProgress(goal);
    const daysSinceCreation = (Date.now() - new Date(goal.createdAt || 0).getTime()) / 86400000;

    // Don't update if goal is going well
    if (progress > 0.3 && daysSinceCreation < 14) {
      return { update: false, reason: "Goal on track, no changes needed" };
    }

    // Update if goal has been stalled for 14+ days
    if (daysSinceCreation > 14 && progress < 0.1) {
      return { update: true, reason: "Goal stalled for 14+ days, plan needs revision" };
    }

    // Update if user understanding has new priorities that conflict
    const understanding = this.state.userUnderstanding;
    const priorities = understanding.preferences || [];
    const goalCategory = goal.category;
    const categoryMentions = priorities.filter(p =>
      p.toLowerCase().includes(goalCategory)
    ).length;

    // If the category isn't in priorities anymore, might need to adjust
    if (priorities.length > 0 && categoryMentions === 0 && daysSinceCreation > 7) {
      return { update: true, reason: "User priorities have shifted away from this category" };
    }

    return { update: false, reason: "No significant changes detected" };
  }

  // ========================================
  // PHASE 4: REFLECT — Post-execution review
  // ========================================

  /**
   * Reflect after a task is completed.
   * Check if criteria are being met, update plan if needed.
   */
  async reflectOnGoal(goal, completedTask) {
    const projectDir = path.join(PROJECTS_DIR, this.slugify(goal.title));
    const criteriaPath = path.join(projectDir, "CRITERIA.md");
    const criteria = this.loadFileSafe(criteriaPath);

    if (!criteria) return { reflected: false, reason: "No criteria file" };

    const goalTracker = getGoalTracker();
    const progress = goalTracker.calculateProgress(goal);

    // Check criteria against progress
    const mustHaves = this.parseCriteria(criteria, "Must Have");
    const shouldHaves = this.parseCriteria(criteria, "Should Have");

    const prompt = `Reflect on this goal's progress:

GOAL: ${goal.title}
PROGRESS: ${Math.round(progress * 100)}%
COMPLETED TASK: ${completedTask?.title || "Unknown"}
TASK RESULT: ${completedTask?.result?.substring?.(0, 300) || "No result"}

MUST HAVE CRITERIA:
${mustHaves.map(c => `- ${c}`).join("\n") || "None defined"}

SHOULD HAVE CRITERIA:
${shouldHaves.map(c => `- ${c}`).join("\n") || "None defined"}

Evaluate:
1. Which criteria are being met?
2. Which are at risk?
3. Should the plan be adjusted? (Only if conditions changed, NOT just because of slow progress)
4. What should happen next?

Output brief, actionable reflection.`;

    try {
      const reflection = await sendMessage(prompt, {
        taskType: TASK_TYPES.REASONING,
        maxTokens: 800,
      });

      // Log reflection
      const reflectionLog = path.join(projectDir, "REFLECTIONS.md");
      const entry = `\n## ${new Date().toISOString().split("T")[0]} — After: ${completedTask?.title || "Task"}\n\n${reflection}\n\n---\n`;
      fs.appendFileSync(reflectionLog, entry);

      this.state.lastReflectCycle = new Date().toISOString();
      this.saveState();

      this.emit("reflected", { goalId: goal.id, reflection });
      return { reflected: true, reflection };
    } catch (e) {
      console.error("[GoalIntelligence] Reflection failed:", e.message);
      return { reflected: false, reason: e.message };
    }
  }

  // ========================================
  // PHASE 5: PROPOSE — Suggest new goals
  // ========================================

  /**
   * Propose new goals based on user understanding.
   * Called periodically (every 24 hours).
   */
  async proposeGoals() {
    const understanding = this.state.userUnderstanding;
    const opportunities = understanding.opportunities || [];
    const existingGoals = getGoalTracker().getActive();

    if (opportunities.length === 0 && understanding.patterns.length < 10) {
      return []; // Not enough data
    }

    const prompt = `Based on what I know about this user, suggest 1-3 new goals:

OPPORTUNITIES IDENTIFIED: ${opportunities.join(", ") || "None yet"}
CURRENT GOALS: ${existingGoals.map(g => g.title).join(", ") || "None"}
USER PRIORITIES: ${(understanding.preferences || []).join(", ") || "Unknown"}
USER CHALLENGES: ${(understanding.challenges || []).join(", ") || "Unknown"}

Rules:
- Goals must be specific and achievable in 1-7 days
- Don't duplicate existing goals
- Focus on the user's biggest gaps
- Each goal needs: title, category (finance/health/career/growth/education/family), description

Output as JSON array: [{ title, category, description, reason }]`;

    try {
      const response = await sendMessage(prompt, {
        taskType: TASK_TYPES.REASONING,
        maxTokens: 1000,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const proposals = JSON.parse(jsonMatch[0]);
        this.state.proposedGoals.push(...proposals.map(p => ({
          ...p,
          proposedAt: new Date().toISOString(),
          status: "pending",
        })));
        this.saveState();
        return proposals;
      }
    } catch (e) {
      console.error("[GoalIntelligence] Failed to propose goals:", e.message);
    }

    return [];
  }

  // ========================================
  // RUN CYCLE — Main intelligence loop
  // ========================================

  /**
   * Run a full intelligence cycle. Called by the autonomous engine.
   */
  async runCycle() {
    this.state.cycleCount++;
    const now = Date.now();

    // 1. Learn — build understanding every 6 hours
    const lastLearn = this.state.lastLearnCycle
      ? new Date(this.state.lastLearnCycle).getTime() : 0;
    if (now - lastLearn > 6 * 3600000) {
      await this.buildUserUnderstanding();
    }

    // 2. Evaluate — check goals every 12 hours
    const lastEval = this.state.lastEvalCycle
      ? new Date(this.state.lastEvalCycle).getTime() : 0;
    if (now - lastEval > 12 * 3600000) {
      const evaluation = await this.evaluateGoals();
      this.emit("evaluation", evaluation);

      // Create plans for goals that need them
      for (const item of evaluation.needsAttention) {
        if (item.status === "needs_plan" || item.status === "stalled") {
          await this.createGoalPlan(item.goal);
        }
      }
    }

    // 3. Propose — suggest new goals every 24 hours
    const lastPropose = this.state.proposedGoals.length > 0
      ? new Date(this.state.proposedGoals[this.state.proposedGoals.length - 1].proposedAt).getTime()
      : 0;
    if (now - lastPropose > 24 * 3600000) {
      await this.proposeGoals();
    }

    this.saveState();
    return { cycleCount: this.state.cycleCount };
  }

  // ========================================
  // UTILITIES
  // ========================================

  extractCriteria(planText) {
    const criteriaMatch = planText.match(/(?:criteria|acceptance|requirements)([\s\S]*?)(?:##|$)/i);
    if (criteriaMatch) {
      return `# Acceptance Criteria\n\n${criteriaMatch[1].trim()}`;
    }
    return null;
  }

  async generateCriteria(goal) {
    const prompt = `Generate acceptance criteria for this goal:

GOAL: ${goal.title}
CATEGORY: ${goal.category}

Output in this format:
# Acceptance Criteria

## Must Have
- [ ] Criterion 1
- [ ] Criterion 2

## Should Have
- [ ] Criterion 1

## Nice to Have
- [ ] Criterion 1`;

    try {
      return await sendMessage(prompt, {
        taskType: TASK_TYPES.PLANNING,
        maxTokens: 500,
      });
    } catch (e) {
      return `# Acceptance Criteria\n\n## Must Have\n- [ ] ${goal.title} completed\n\n## Should Have\n- [ ] Quality verified\n\n## Nice to Have\n- [ ] Documentation added\n`;
    }
  }

  parseCriteria(criteriaText, section) {
    const sectionMatch = criteriaText.match(
      new RegExp(`##\\s*${section}([\\s\\S]*?)(?:##|$)`, "i")
    );
    if (!sectionMatch) return [];
    return sectionMatch[1]
      .split("\n")
      .filter(l => l.trim().startsWith("- "))
      .map(l => l.replace(/^-\s*\[[ x]\]\s*/, "").trim());
  }

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 50);
  }

  loadJsonSafe(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
    } catch (e) {}
    return null;
  }

  loadFileSafe(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8");
      }
    } catch (e) {}
    return null;
  }

  loadMemoryFile(filename) {
    return this.loadFileSafe(path.join(MEMORY_DIR, filename));
  }

  /**
   * Get current state summary for display
   */
  getStatus() {
    return {
      cycleCount: this.state.cycleCount,
      lastLearn: this.state.lastLearnCycle,
      lastEval: this.state.lastEvalCycle,
      lastReflect: this.state.lastReflectCycle,
      patternsCount: this.state.userUnderstanding.patterns.length,
      proposedGoals: this.state.proposedGoals.filter(g => g.status === "pending").length,
      totalEvaluations: this.state.evaluations.length,
      userPriorities: this.state.userUnderstanding.preferences || [],
    };
  }
}

// Singleton
let instance = null;

export const getGoalIntelligence = () => {
  if (!instance) {
    instance = new GoalIntelligence();
  }
  return instance;
};

export default GoalIntelligence;
