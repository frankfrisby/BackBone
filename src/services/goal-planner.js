/**
 * Goal Planner Service
 *
 * Develops detailed plans for goals BEFORE execution begins.
 * When a backlog item graduates to a goal, this service creates:
 * - Phased plan with tasks per phase
 * - Deliverables with due dates
 * - Acceptance criteria
 * - PLAN.md in the project directory
 *
 * Lifecycle: BACKLOG → GOAL (planning) → PLAN.md created → GOAL (planned → active)
 */

import fs from "fs";
import path from "path";
import { sendMessage } from "./claude.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const PROJECTS_DIR = path.join(process.cwd(), "projects");
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const BELIEFS_PATH = path.join(DATA_DIR, "core-beliefs.json");

function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return "";
}

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
}

function writeJson(filePath, data) {
  writeFile(filePath, JSON.stringify(data, null, 2));
}

/**
 * Build context for the planner prompt
 */
function buildPlannerContext(goal) {
  const profile = readFile(path.join(MEMORY_DIR, "profile.md"));
  const beliefs = readJson(BELIEFS_PATH) || { beliefs: [] };

  // Read project's PROJECT.md if it exists
  const projectSlug = goal.project || "";
  const projectMdPath = path.join(PROJECTS_DIR, projectSlug, "PROJECT.md");
  const projectContent = readFile(projectMdPath);

  // Read existing plan if any
  const planPath = path.join(PROJECTS_DIR, projectSlug, "PLAN.md");
  const existingPlan = readFile(planPath);

  return {
    profile: profile.slice(0, 1000),
    beliefs: (beliefs.beliefs || []).map(b => `- ${b.name}: ${b.description}`).join("\n") || "No beliefs defined.",
    projectContent: projectContent.slice(0, 1000),
    existingPlan,
  };
}

/**
 * Build the prompt for plan development
 */
function buildPlanPrompt(goal, context) {
  return `You are a strategic planner for BACKBONE, a life optimization engine.

A new goal has been created and needs a detailed execution plan BEFORE any work begins.

## Goal Details
- **Title:** ${goal.title}
- **Description:** ${goal.description || "No description"}
- **Category:** ${goal.category || "general"}
- **Tasks so far:** ${(goal.tasks || []).map(t => typeof t === "string" ? t : t.text).join(", ") || "None"}

## User Context
${context.profile || "No profile available."}

## Core Beliefs
${context.beliefs}

## Existing Project Content
${context.projectContent || "No existing project content."}

---

## Your Task

Create a detailed, phased execution plan. Be practical and specific. The plan should be achievable within 1-4 weeks.

Respond in JSON:
\`\`\`json
{
  "phases": [
    {
      "id": 1,
      "label": "Phase name",
      "status": "pending",
      "durationDays": 7,
      "objective": "What this phase achieves",
      "tasks": ["Specific task 1", "Specific task 2"],
      "exitCriteria": "When this phase is done"
    }
  ],
  "deliverables": [
    {
      "id": "d1",
      "name": "Deliverable name",
      "description": "What this deliverable is",
      "status": "pending",
      "dueDate": null
    }
  ],
  "acceptanceCriteria": [
    "Criterion that must be true for the goal to be complete"
  ],
  "durationWeeks": 2,
  "objective": "One paragraph on what this goal achieves and why it matters",
  "resources": ["Resource 1"],
  "risks": [
    { "risk": "Description", "likelihood": "low|medium|high", "mitigation": "How to handle" }
  ]
}
\`\`\`

Rules:
- 2-4 phases max
- 2-5 tasks per phase
- 1-3 deliverables
- 2-5 acceptance criteria
- Be concrete and measurable
- Duration should be realistic (1-4 weeks total)`;
}

/**
 * Generate PLAN.md content from plan data
 */
function generatePlanMd(goal, planData) {
  const now = new Date().toISOString();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + (planData.durationWeeks || 2) * 7);

  const phasesSection = (planData.phases || []).map((phase, i) => {
    const startWeek = i === 0 ? 1 : planData.phases.slice(0, i).reduce((sum, p) => sum + Math.ceil((p.durationDays || 7) / 7), 0) + 1;
    const endWeek = startWeek + Math.ceil((phase.durationDays || 7) / 7) - 1;
    const weekRange = startWeek === endWeek ? `Week ${startWeek}` : `Weeks ${startWeek}-${endWeek}`;

    return `### Phase ${phase.id}: ${phase.label} (${weekRange})
**Objective:** ${phase.objective || "Complete phase tasks"}
**Tasks:**
${(phase.tasks || []).map(t => `- [ ] ${t}`).join("\n")}
**Exit criteria:** ${phase.exitCriteria || "All tasks completed"}`;
  }).join("\n\n");

  const deliverablesTable = (planData.deliverables || []).map(d =>
    `| ${d.id} | ${d.name} | ${d.dueDate || "TBD"} | ${d.status || "Pending"} |`
  ).join("\n");

  const risksTable = (planData.risks || []).map(r =>
    `| ${r.risk} | ${r.likelihood} | ${r.mitigation} |`
  ).join("\n");

  return `# Plan: ${goal.title}

**Goal ID:** ${goal.id}
**Status:** Ready
**Created:** ${now.split("T")[0]}
**Target Completion:** ${targetDate.toISOString().split("T")[0]}
**Project:** ${goal.project || "none"}

## Objective
${planData.objective || goal.description || "No objective defined."}

## Acceptance Criteria
${(planData.acceptanceCriteria || []).map(c => `- [ ] ${c}`).join("\n")}

## Deliverables
| # | Deliverable | Due | Status |
|---|-------------|-----|--------|
${deliverablesTable || "| - | No deliverables defined | - | - |"}

## Phases

${phasesSection || "No phases defined."}

## Resources Needed
${(planData.resources || []).map(r => `- ${r}`).join("\n") || "- None identified"}

## Risks
| Risk | Likelihood | Mitigation |
|------|-----------|------------|
${risksTable || "| No risks identified | - | - |"}

## Progress Log
- ${now.split("T")[0]}: Plan created
`;
}

/**
 * Develop a plan for a goal.
 * Sends goal context to Claude, parses the response, writes PLAN.md,
 * and updates goals.json with plan metadata.
 *
 * @param {object} goal - The goal object from goals.json
 * @returns {object} { success, planData, planFile }
 */
export async function developPlan(goal) {
  if (!goal || !goal.id) {
    return { success: false, error: "Invalid goal - missing id" };
  }

  const projectSlug = goal.project || goal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const planFile = path.join(PROJECTS_DIR, projectSlug, "PLAN.md");

  console.log(`[GoalPlanner] Developing plan for: ${goal.title}`);

  try {
    // Build context
    const context = buildPlannerContext(goal);

    // Send to Claude for plan generation
    const prompt = buildPlanPrompt(goal, context);
    const response = await sendMessage([
      { role: "user", content: prompt }
    ], {
      maxTokens: 2000,
      temperature: 0.5
    });

    if (!response || !response.content) {
      throw new Error("No response from Claude");
    }

    // Parse response
    const content = response.content;
    let planData;

    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      planData = JSON.parse(jsonMatch[1]);
    } else {
      planData = JSON.parse(content);
    }

    // Ensure project directory exists
    const projectDir = path.join(PROJECTS_DIR, projectSlug);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Write PLAN.md
    const planMd = generatePlanMd(goal, planData);
    writeFile(planFile, planMd);
    console.log(`[GoalPlanner] Wrote PLAN.md to ${planFile}`);

    // Update goals.json
    const goalsData = readJson(GOALS_PATH) || { goals: [] };
    const goalIndex = goalsData.goals.findIndex(g => g.id === goal.id);
    if (goalIndex !== -1) {
      const now = new Date().toISOString();
      goalsData.goals[goalIndex].plan = {
        status: "ready",
        planFile: `projects/${projectSlug}/PLAN.md`,
        phases: (planData.phases || []).map(p => ({
          id: p.id,
          label: p.label,
          status: p.status || "pending",
          tasks: p.tasks || []
        })),
        durationWeeks: planData.durationWeeks || 2,
        lastPlanReview: now
      };
      goalsData.goals[goalIndex].deliverables = (planData.deliverables || []).map(d => ({
        id: d.id,
        name: d.name,
        status: d.status || "pending",
        dueDate: d.dueDate || null
      }));
      goalsData.goals[goalIndex].acceptanceCriteria = planData.acceptanceCriteria || [];
      goalsData.goals[goalIndex].project = projectSlug;
      goalsData.goals[goalIndex].status = "planned";
      goalsData.goals[goalIndex].updatedAt = now;

      goalsData.lastUpdated = now;
      writeJson(GOALS_PATH, goalsData);
      console.log(`[GoalPlanner] Updated goals.json for ${goal.id}`);
    }

    // Update PROJECT.md progress log
    const projectMdPath = path.join(projectDir, "PROJECT.md");
    const projectContent = readFile(projectMdPath);
    if (projectContent && projectContent.includes("## Progress Log")) {
      const logEntry = `- ${new Date().toISOString().split("T")[0]}: Plan developed for goal "${goal.title}"\n`;
      const updated = projectContent.replace("## Progress Log\n", `## Progress Log\n${logEntry}`);
      writeFile(projectMdPath, updated);
    }

    return {
      success: true,
      planData,
      planFile: `projects/${projectSlug}/PLAN.md`
    };
  } catch (error) {
    console.error(`[GoalPlanner] Error developing plan for ${goal.title}:`, error.message);

    // Set plan status to none so it gets retried
    const goalsData = readJson(GOALS_PATH) || { goals: [] };
    const goalIndex = goalsData.goals.findIndex(g => g.id === goal.id);
    if (goalIndex !== -1) {
      goalsData.goals[goalIndex].plan = {
        status: "none",
        planFile: null,
        phases: [],
        durationWeeks: null,
        lastPlanReview: null
      };
      goalsData.lastUpdated = new Date().toISOString();
      writeJson(GOALS_PATH, goalsData);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Evaluate an existing plan to determine if it needs updating.
 *
 * @param {object} goal - The goal object from goals.json
 * @returns {object} { needsUpdate, reason }
 */
export async function evaluatePlan(goal) {
  if (!goal || !goal.plan || !goal.plan.planFile) {
    return { needsUpdate: true, reason: "No plan exists" };
  }

  const planFile = path.join(process.cwd(), goal.plan.planFile);
  const planContent = readFile(planFile);

  if (!planContent) {
    return { needsUpdate: true, reason: "Plan file missing" };
  }

  // Check if plan is stale (not reviewed in 7+ days)
  if (goal.plan.lastPlanReview) {
    const daysSinceReview = (Date.now() - new Date(goal.plan.lastPlanReview).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceReview > 7) {
      return { needsUpdate: true, reason: `Plan not reviewed in ${Math.floor(daysSinceReview)} days` };
    }
  }

  // Check if all phases are done but goal not completed
  const allPhasesDone = (goal.plan.phases || []).every(p => p.status === "done");
  if (allPhasesDone && goal.status !== "completed") {
    return { needsUpdate: true, reason: "All phases done but goal not completed - needs review" };
  }

  return { needsUpdate: false, reason: "Plan is current" };
}

/**
 * Update an existing plan with changes.
 *
 * @param {object} goal - The goal object from goals.json
 * @param {object} changes - Object describing what to change
 * @returns {object} { success, updatedPlan }
 */
export async function updatePlan(goal, changes = {}) {
  if (!goal || !goal.plan || !goal.plan.planFile) {
    return { success: false, error: "No plan to update" };
  }

  const planFilePath = path.join(process.cwd(), goal.plan.planFile);
  const existingPlan = readFile(planFilePath);

  if (!existingPlan) {
    // No plan file - develop from scratch
    return developPlan(goal);
  }

  try {
    const context = buildPlannerContext(goal);

    const prompt = `You are updating an existing plan for a BACKBONE goal.

## Current Plan
${existingPlan}

## Goal
- **Title:** ${goal.title}
- **Status:** ${goal.status}
- **Progress:** ${goal.progress || 0}%

## Requested Changes
${changes.reason || "General review and update needed."}
${changes.phaseUpdates ? `Phase updates: ${JSON.stringify(changes.phaseUpdates)}` : ""}
${changes.newTasks ? `New tasks to add: ${changes.newTasks.join(", ")}` : ""}

## User Context
${context.profile || "No profile."}

---

Update the plan. Keep the same structure but adjust what's needed. Mark completed items.
Set the Status to "Needs Update" if significant changes, or keep "Active" if minor.

Return the FULL updated plan as markdown (not JSON). Keep the exact same format as the current plan.`;

    const response = await sendMessage([
      { role: "user", content: prompt }
    ], {
      maxTokens: 2000,
      temperature: 0.3
    });

    if (!response || !response.content) {
      throw new Error("No response from Claude");
    }

    // Write updated plan
    writeFile(planFilePath, response.content);

    // Update review timestamp
    const goalsData = readJson(GOALS_PATH) || { goals: [] };
    const goalIndex = goalsData.goals.findIndex(g => g.id === goal.id);
    if (goalIndex !== -1) {
      goalsData.goals[goalIndex].plan.lastPlanReview = new Date().toISOString();
      if (changes.phaseUpdates) {
        // Apply phase status updates
        for (const update of changes.phaseUpdates) {
          const phase = goalsData.goals[goalIndex].plan.phases.find(p => p.id === update.id);
          if (phase && update.status) {
            phase.status = update.status;
          }
        }
      }
      goalsData.goals[goalIndex].plan.status = "ready";
      goalsData.lastUpdated = new Date().toISOString();
      writeJson(GOALS_PATH, goalsData);
    }

    console.log(`[GoalPlanner] Updated plan for: ${goal.title}`);
    return { success: true, planFile: goal.plan.planFile };
  } catch (error) {
    console.error(`[GoalPlanner] Error updating plan:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize plan fields on a goal object (used when creating new goals).
 * Does NOT call Claude - just sets the default structure.
 *
 * @param {object} goal - A goal object to add plan fields to
 * @returns {object} The goal with plan fields added
 */
export function initPlanFields(goal) {
  return {
    ...goal,
    plan: {
      status: "none",
      planFile: null,
      phases: [],
      durationWeeks: null,
      lastPlanReview: null
    },
    deliverables: [],
    acceptanceCriteria: [],
    project: goal.project || null
  };
}

/**
 * Get goals that need plans developed.
 *
 * @returns {Array} Goals with plan.status === "none"
 */
export function getUnplannedGoals() {
  const goalsData = readJson(GOALS_PATH) || { goals: [] };
  return goalsData.goals.filter(g =>
    g.status !== "completed" &&
    (!g.plan || g.plan.status === "none")
  );
}

export default {
  developPlan,
  evaluatePlan,
  updatePlan,
  initPlanFields,
  getUnplannedGoals
};
