/**
 * Goal Planner Tests
 * Validates the goal planning pipeline:
 * - Plan field initialization
 * - Unplanned goal detection
 * - Plan evaluation logic
 * - PLAN.md generation
 * - Life server tool definitions for plan_goal and review_goal_plan
 * - Thinking engine plan integration
 * - Idle processor PLAN work type
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { getDataDir, getProjectsDir } from "../../src/services/paths.js";

// === HELPERS ===

const DATA_DIR = getDataDir();
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const PROJECTS_DIR = getProjectsDir();

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function parseToolsFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const toolNames = [];
  const toolNameRegex = /name:\s*["']([^"']+)["']/g;
  let match;
  while ((match = toolNameRegex.exec(content)) !== null) {
    if (!match[1].startsWith("backbone-")) {
      toolNames.push(match[1]);
    }
  }
  return { toolNames, content };
}

// === GOAL PLANNER SERVICE ===

describe("Goal Planner Service", () => {
  it("initPlanFields adds plan structure to a goal", async () => {
    const { initPlanFields } = await import("../src/services/goal-planner.js");

    const goal = {
      id: "goal_test_123",
      title: "Test Goal",
      description: "A test goal",
      status: "active",
      project: "test-project",
    };

    const result = initPlanFields(goal);

    // Plan fields
    expect(result.plan).toBeDefined();
    expect(result.plan.status).toBe("none");
    expect(result.plan.planFile).toBeNull();
    expect(result.plan.phases).toEqual([]);
    expect(result.plan.durationWeeks).toBeNull();
    expect(result.plan.lastPlanReview).toBeNull();

    // Deliverables and acceptance criteria
    expect(result.deliverables).toEqual([]);
    expect(result.acceptanceCriteria).toEqual([]);

    // Preserves existing fields
    expect(result.id).toBe("goal_test_123");
    expect(result.title).toBe("Test Goal");
    expect(result.project).toBe("test-project");
  });

  it("initPlanFields preserves existing project field", async () => {
    const { initPlanFields } = await import("../src/services/goal-planner.js");

    const goal = { id: "g1", title: "Test", project: "my-project" };
    const result = initPlanFields(goal);
    expect(result.project).toBe("my-project");
  });

  it("initPlanFields sets project to null when not provided", async () => {
    const { initPlanFields } = await import("../src/services/goal-planner.js");

    const goal = { id: "g1", title: "Test" };
    const result = initPlanFields(goal);
    expect(result.project).toBeNull();
  });

  it("getUnplannedGoals returns only non-completed goals with no plan", async () => {
    const { getUnplannedGoals } = await import("../src/services/goal-planner.js");

    // Read current goals
    const goals = getUnplannedGoals();
    expect(Array.isArray(goals)).toBe(true);

    // All returned goals should not be completed
    for (const goal of goals) {
      expect(goal.status).not.toBe("completed");
    }

    // All returned goals should have no plan or plan.status === "none"
    for (const goal of goals) {
      if (goal.plan) {
        expect(goal.plan.status).toBe("none");
      }
    }
  });

  it("evaluatePlan returns needsUpdate for goal without plan", async () => {
    const { evaluatePlan } = await import("../src/services/goal-planner.js");

    const goal = { id: "g1", title: "Test" };
    const result = await evaluatePlan(goal);
    expect(result.needsUpdate).toBe(true);
    expect(result.reason).toContain("No plan exists");
  });

  it("evaluatePlan returns needsUpdate for goal with missing plan file", async () => {
    const { evaluatePlan } = await import("../src/services/goal-planner.js");

    const goal = {
      id: "g1",
      title: "Test",
      plan: {
        status: "ready",
        planFile: "projects/nonexistent/PLAN.md",
        phases: [],
        durationWeeks: 2,
        lastPlanReview: new Date().toISOString(),
      },
    };
    const result = await evaluatePlan(goal);
    expect(result.needsUpdate).toBe(true);
    expect(result.reason).toContain("missing");
  });

  it("evaluatePlan detects stale plan (7+ days since review)", async () => {
    const { evaluatePlan } = await import("../src/services/goal-planner.js");

    // Create a temporary plan file
    const testProjectDir = path.join(PROJECTS_DIR, "_test-stale-plan");
    const testPlanFile = path.join(testProjectDir, "PLAN.md");
    if (!fs.existsSync(testProjectDir)) {
      fs.mkdirSync(testProjectDir, { recursive: true });
    }
    fs.writeFileSync(testPlanFile, "# Plan: Test\n\nSome plan content");

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

    const goal = {
      id: "g1",
      title: "Test",
      status: "active",
      plan: {
        status: "ready",
        planFile: "projects/_test-stale-plan/PLAN.md",
        phases: [],
        durationWeeks: 2,
        lastPlanReview: oldDate.toISOString(),
      },
    };

    const result = await evaluatePlan(goal);
    expect(result.needsUpdate).toBe(true);
    expect(result.reason).toContain("days");

    // Cleanup
    fs.rmSync(testProjectDir, { recursive: true, force: true });
  });

  it("evaluatePlan returns no update needed for current plan", async () => {
    const { evaluatePlan } = await import("../src/services/goal-planner.js");

    // Create a temporary plan file
    const testProjectDir = path.join(PROJECTS_DIR, "_test-current-plan");
    const testPlanFile = path.join(testProjectDir, "PLAN.md");
    if (!fs.existsSync(testProjectDir)) {
      fs.mkdirSync(testProjectDir, { recursive: true });
    }
    fs.writeFileSync(testPlanFile, "# Plan: Test\n\nSome plan content");

    const goal = {
      id: "g1",
      title: "Test",
      status: "active",
      plan: {
        status: "ready",
        planFile: "projects/_test-current-plan/PLAN.md",
        phases: [{ id: 1, label: "Phase 1", status: "active", tasks: [] }],
        durationWeeks: 2,
        lastPlanReview: new Date().toISOString(),
      },
    };

    const result = await evaluatePlan(goal);
    expect(result.needsUpdate).toBe(false);
    expect(result.reason).toContain("current");

    // Cleanup
    fs.rmSync(testProjectDir, { recursive: true, force: true });
  });

  it("developPlan rejects invalid goal", async () => {
    const { developPlan } = await import("../src/services/goal-planner.js");

    const result = await developPlan(null);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid goal");

    const result2 = await developPlan({});
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("Invalid goal");
  });
});

// === GOAL SCHEMA IN GOALS.JSON ===

describe("Goal Schema - Plan Fields", () => {
  it("goals.json exists and is valid JSON", () => {
    const data = readJson(GOALS_PATH);
    expect(data).not.toBeNull();
    expect(data).toHaveProperty("goals");
    expect(Array.isArray(data.goals)).toBe(true);
  });

  it("existing goals have valid status values", () => {
    const data = readJson(GOALS_PATH);
    if (!data || !data.goals) return;

    const validStatuses = ["planning", "planned", "active", "completed", "paused"];
    for (const goal of data.goals) {
      expect(validStatuses).toContain(goal.status);
    }
  });
});

// === LIFE SERVER MCP TOOLS ===

describe("Life Server - Plan Tools", () => {
  const serverFile = path.join(process.cwd(), "src", "mcp", "life-server.js");

  it("life-server.js exists", () => {
    expect(fs.existsSync(serverFile)).toBe(true);
  });

  it("defines plan_goal tool", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("plan_goal");
  });

  it("defines review_goal_plan tool", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("review_goal_plan");
  });

  it("plan_goal requires goalId parameter", () => {
    const content = fs.readFileSync(serverFile, "utf-8");
    // Check that plan_goal has goalId in required
    const planGoalSection = content.slice(
      content.indexOf('"plan_goal"'),
      content.indexOf('"plan_goal"') + 500
    );
    expect(planGoalSection).toContain("goalId");
    expect(planGoalSection).toContain("required");
  });

  it("review_goal_plan requires goalId parameter", () => {
    const content = fs.readFileSync(serverFile, "utf-8");
    const reviewSection = content.slice(
      content.indexOf('"review_goal_plan"'),
      content.indexOf('"review_goal_plan"') + 500
    );
    expect(reviewSection).toContain("goalId");
    expect(reviewSection).toContain("required");
  });

  it("get_goals description mentions plan status", () => {
    const content = fs.readFileSync(serverFile, "utf-8");
    const getGoalsSection = content.slice(
      content.indexOf('"get_goals"'),
      content.indexOf('"get_goals"') + 300
    );
    expect(getGoalsSection.toLowerCase()).toContain("plan");
  });

  it("add_goal includes plan fields in goal creation", () => {
    const content = fs.readFileSync(serverFile, "utf-8");
    // The addGoal function should set plan.status to "none"
    expect(content).toContain('status: "planning"');
    expect(content).toContain('status: "none"');
  });

  it("handles plan_goal in switch statement", () => {
    const content = fs.readFileSync(serverFile, "utf-8");
    expect(content).toContain('case "plan_goal"');
  });

  it("handles review_goal_plan in switch statement", () => {
    const content = fs.readFileSync(serverFile, "utf-8");
    expect(content).toContain('case "review_goal_plan"');
  });

  it("still defines all original tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("get_goals");
    expect(parsed.toolNames).toContain("get_beliefs");
    expect(parsed.toolNames).toContain("get_backlog");
    expect(parsed.toolNames).toContain("get_life_scores");
    expect(parsed.toolNames).toContain("add_goal");
    expect(parsed.toolNames).toContain("add_belief");
    expect(parsed.toolNames).toContain("get_thesis");
    expect(parsed.toolNames).toContain("trigger_thinking_cycle");
  });
});

// === THINKING ENGINE INTEGRATION ===

describe("Thinking Engine - Plan Integration", () => {
  const engineFile = path.join(process.cwd(), "src", "services", "thinking-engine.js");

  it("thinking-engine.js imports goal-planner", () => {
    const content = fs.readFileSync(engineFile, "utf-8");
    expect(content).toContain("goal-planner");
    expect(content).toContain("developPlan");
    expect(content).toContain("initPlanFields");
    expect(content).toContain("getUnplannedGoals");
  });

  it("new goals use initPlanFields", () => {
    const content = fs.readFileSync(engineFile, "utf-8");
    expect(content).toContain("initPlanFields(");
  });

  it("new goals start with planning status", () => {
    const content = fs.readFileSync(engineFile, "utf-8");
    expect(content).toContain('status: "planning"');
  });

  it("runs plan development after goal creation", () => {
    const content = fs.readFileSync(engineFile, "utf-8");
    // Should call getUnplannedGoals and developPlan after creating goals
    expect(content).toContain("getUnplannedGoals()");
    expect(content).toContain("developPlan(");
    expect(content).toContain("Developing plan for");
  });
});

// === IDLE PROCESSOR INTEGRATION ===

describe("Idle Processor - PLAN Work Type", () => {
  const idleFile = path.join(process.cwd(), "src", "services", "idle-processor.js");

  it("defines PLAN work type", () => {
    const content = fs.readFileSync(idleFile, "utf-8");
    expect(content).toContain('PLAN: "plan"');
  });

  it("selectWorkItem checks for unplanned goals", () => {
    const content = fs.readFileSync(idleFile, "utf-8");
    expect(content).toContain("unplannedGoals");
    expect(content).toContain("plan.status");
  });

  it("buildPrompt handles PLAN work type", () => {
    const content = fs.readFileSync(idleFile, "utf-8");
    expect(content).toContain("WORK_TYPES.PLAN");
    expect(content).toContain("PLAN.md");
  });

  it("getWorkDescription handles PLAN type", () => {
    const content = fs.readFileSync(idleFile, "utf-8");
    expect(content).toContain("Planning goal:");
  });
});

// === GOAL PLANNER SERVICE FILE ===

describe("Goal Planner Service File", () => {
  const plannerFile = path.join(process.cwd(), "src", "services", "goal-planner.js");

  it("goal-planner.js exists", () => {
    expect(fs.existsSync(plannerFile)).toBe(true);
  });

  it("exports developPlan function", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("export async function developPlan");
  });

  it("exports evaluatePlan function", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("export async function evaluatePlan");
  });

  it("exports updatePlan function", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("export async function updatePlan");
  });

  it("exports initPlanFields function", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("export function initPlanFields");
  });

  it("exports getUnplannedGoals function", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("export function getUnplannedGoals");
  });

  it("generates PLAN.md with correct structure", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    // The generatePlanMd function should create proper markdown
    expect(content).toContain("# Plan:");
    expect(content).toContain("## Objective");
    expect(content).toContain("## Acceptance Criteria");
    expect(content).toContain("## Deliverables");
    expect(content).toContain("## Phases");
    expect(content).toContain("## Resources Needed");
    expect(content).toContain("## Risks");
    expect(content).toContain("## Progress Log");
  });

  it("reads user profile and beliefs for context", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("profile.md");
    expect(content).toContain("core-beliefs.json");
  });

  it("writes PLAN.md to project directory", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("PLAN.md");
    expect(content).toContain("PROJECTS_DIR");
  });

  it("updates goals.json with plan data", () => {
    const content = fs.readFileSync(plannerFile, "utf-8");
    expect(content).toContain("GOALS_PATH");
    expect(content).toContain("plan.status");
    expect(content).toContain('"ready"');
  });
});
