import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { getBackboneHome, getDataDir, getMemoryDir, getProjectsDir } from "../services/paths.js";

/**
 * BACKBONE Life Management MCP Server
 * Manages goals, beliefs, backlog, life scores, and thinking engine cycles
 */

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const PROJECTS_DIR = getProjectsDir();
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const BELIEFS_PATH = path.join(DATA_DIR, "core-beliefs.json");
const BACKLOG_PATH = path.join(DATA_DIR, "backlog.json");
const LIFE_SCORES_PATH = path.join(DATA_DIR, "life-scores.json");
const THESIS_PATH = path.join(MEMORY_DIR, "thesis.md");

// Tool definitions
const TOOLS = [
  {
    name: "get_goals",
    description: "Get all goals or filter by status/category. Includes plan status, deliverables, and acceptance criteria.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: planning, planned, active, completed, paused (omit for all)" },
        category: { type: "string", description: "Filter by category: health, finance, career, learning, personal, social" },
      },
      required: [],
    },
  },
  {
    name: "get_beliefs",
    description: "Get user's core beliefs (epics)",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_backlog",
    description: "Get backlog items with optional filtering",
    inputSchema: {
      type: "object",
      properties: {
        minScore: { type: "number", description: "Minimum impact score (0-100)" },
        source: { type: "string", description: "Filter by source: news, role-model, belief-aligned, thinking-engine" },
        limit: { type: "number", description: "Max items to return (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_life_scores",
    description: "Get life dimension scores (health, wealth, career, etc.)",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "add_goal",
    description: "Create a new goal with plan fields. Goal starts in 'planning' status until a plan is developed.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Goal title" },
        category: {
          type: "string",
          description: "Category: health, finance, career, learning, personal, social",
        },
        description: { type: "string", description: "Goal description" },
        priority: { type: "number", description: "Priority 1-5 (1=highest)" },
        tasks: {
          type: "array",
          items: { type: "string" },
          description: "List of tasks for this goal",
        },
        project: { type: "string", description: "Project slug to associate with (optional)" },
      },
      required: ["title", "category"],
    },
  },
  {
    name: "add_belief",
    description: "Add a new core belief",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Belief name (e.g., 'Build wealth')" },
        description: { type: "string", description: "What this belief means to you" },
      },
      required: ["name", "description"],
    },
  },
  {
    name: "get_thesis",
    description: "Get current thesis/focus from the thinking engine",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "trigger_thinking_cycle",
    description: "Force a thinking engine cycle to run now",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "plan_goal",
    description: "Develop a detailed execution plan for a goal. Creates PLAN.md in the project directory with phases, deliverables, and acceptance criteria.",
    inputSchema: {
      type: "object",
      properties: {
        goalId: { type: "string", description: "The goal ID to plan" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "review_goal_plan",
    description: "Evaluate whether a goal's plan needs updating. Returns needsUpdate status and reason.",
    inputSchema: {
      type: "object",
      properties: {
        goalId: { type: "string", description: "The goal ID whose plan to review" },
      },
      required: ["goalId"],
    },
  },
];

// === HELPERS ===

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
  } catch {}
  return "";
}

// === TOOL IMPLEMENTATIONS ===

function getGoals(status, category) {
  const data = readJson(GOALS_PATH) || { goals: [] };
  let goals = data.goals || [];

  if (status) {
    goals = goals.filter(g => g.status === status);
  }
  if (category) {
    goals = goals.filter(g => g.category === category);
  }

  // Sort: planning first, then active, then by priority
  goals.sort((a, b) => {
    const statusOrder = { planning: 0, planned: 1, active: 2, paused: 3, completed: 4 };
    const aOrder = statusOrder[a.status] ?? 5;
    const bOrder = statusOrder[b.status] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.priority || 3) - (b.priority || 3);
  });

  return {
    goals: goals.map(g => ({
      ...g,
      planStatus: g.plan?.status || "none",
      hasDeliverables: (g.deliverables || []).length > 0,
      hasAcceptanceCriteria: (g.acceptanceCriteria || []).length > 0,
    })),
    total: goals.length,
    filters: { status: status || "all", category: category || "all" },
    summary: {
      planning: data.goals.filter(g => g.status === "planning").length,
      planned: data.goals.filter(g => g.status === "planned").length,
      active: data.goals.filter(g => g.status === "active").length,
      completed: data.goals.filter(g => g.status === "completed").length,
      paused: data.goals.filter(g => g.status === "paused").length,
    },
  };
}

function getBeliefs() {
  const data = readJson(BELIEFS_PATH) || { beliefs: [] };
  return {
    beliefs: data.beliefs || [],
    total: (data.beliefs || []).length,
    lastUpdated: data.lastUpdated || null,
  };
}

function getBacklog(minScore, source, limit = 20) {
  const data = readJson(BACKLOG_PATH) || { items: [], stats: {} };
  let items = data.items || [];

  if (minScore !== undefined && minScore !== null) {
    items = items.filter(i => i.impactScore >= minScore);
  }
  if (source) {
    items = items.filter(i => i.source === source);
  }

  // Sort by impact score descending
  items.sort((a, b) => b.impactScore - a.impactScore);

  return {
    items: items.slice(0, limit),
    total: items.length,
    fullBacklogSize: (data.items || []).length,
    stats: data.stats || {},
    filters: {
      minScore: minScore || "none",
      source: source || "all",
      limit,
    },
    graduationThreshold: 75,
    readyToGraduate: (data.items || []).filter(i => i.impactScore >= 75).length,
  };
}

async function getLifeScores() {
  const data = readJson(LIFE_SCORES_PATH) || {};

  // Extract scores, excluding metadata
  const scores = {};
  const metaKeys = ["lastUpdated", "history", "updatedBy"];

  for (const [key, value] of Object.entries(data)) {
    if (!metaKeys.includes(key)) {
      scores[key] = value;
    }
  }

  // Include calibrated comparison (User vs Role Model vs Average)
  let calibrated = null;
  try {
    const { getCalibratedScores } = await import("../services/health/calibrated-scores.js");

    const portfolioData = readJson(path.join(DATA_DIR, "alpaca-cache.json"));
    const ouraData = readJson(path.join(DATA_DIR, "oura-data.json"));
    const linkedinData = readJson(path.join(DATA_DIR, "linkedin-profile.json"));
    const goalsData = readJson(path.join(DATA_DIR, "goals.json"));
    const ouraLatest = ouraData?.latest || {};

    calibrated = getCalibratedScores({
      portfolio: {
        equity: portfolioData?.account?.equity,
        positions: portfolioData?.positions,
      },
      oura: {
        sleep: ouraLatest.sleep?.at?.(-1),
        readiness: ouraLatest.readiness?.at?.(-1),
        activity: ouraLatest.activity?.at?.(-1),
      },
      linkedin: linkedinData?.profile || linkedinData,
      goals: Array.isArray(goalsData) ? goalsData : goalsData?.goals || [],
    });
  } catch {}

  return {
    scores,
    calibrated,
    lastUpdated: data.lastUpdated || null,
    dimensions: Object.keys(scores).length,
  };
}

function addGoal(args) {
  const data = readJson(GOALS_PATH) || { goals: [] };

  const goal = {
    id: `goal_${args.category || "general"}_${Date.now().toString(36)}`,
    title: args.title,
    category: args.category,
    description: args.description || "",
    priority: args.priority || 3,
    status: "planning",
    progress: 0,
    tasks: (args.tasks || []).map(t => ({ text: t, done: false })),
    milestones: [
      { target: 25, label: "Getting started", achieved: false },
      { target: 50, label: "Halfway", achieved: false },
      { target: 75, label: "Almost there", achieved: false },
      { target: 100, label: "Complete", achieved: false },
    ],
    plan: {
      status: "none",
      planFile: null,
      phases: [],
      durationWeeks: null,
      lastPlanReview: null,
    },
    deliverables: [],
    acceptanceCriteria: [],
    project: args.project || null,
    createdAt: new Date().toISOString(),
    createdBy: "mcp-life-server",
  };

  data.goals.push(goal);
  data.lastUpdated = new Date().toISOString();
  writeJson(GOALS_PATH, data);

  // Also create goal directory
  const slug = (args.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const goalDir = path.join(DATA_DIR, "goals", slug);
  if (!fs.existsSync(goalDir)) {
    fs.mkdirSync(goalDir, { recursive: true });
  }

  const goalMd = `# ${args.title}

**Category:** ${args.category}
**Priority:** ${args.priority || 3}
**Status:** planning
**Created:** ${new Date().toISOString()}

## Description

${args.description || "No description provided."}

## Tasks

${(args.tasks || []).map(t => `- [ ] ${t}`).join("\n") || "- [ ] Define tasks"}

## Progress

_Plan pending. Use \`plan_goal\` to develop execution plan._
`;

  fs.writeFileSync(path.join(goalDir, "README.md"), goalMd);

  return {
    success: true,
    goal,
    message: `Created goal: ${args.title} (status: planning - use plan_goal to develop execution plan)`,
  };
}

function addBelief(name, description) {
  const data = readJson(BELIEFS_PATH) || { beliefs: [] };

  // Check for duplicates
  const existing = data.beliefs.find(b => b.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return {
      error: `Belief "${name}" already exists`,
      existing,
    };
  }

  const belief = {
    id: `belief_${Date.now()}`,
    name,
    description,
    createdAt: new Date().toISOString(),
    createdBy: "mcp-life-server",
  };

  data.beliefs.push(belief);
  data.lastUpdated = new Date().toISOString();
  writeJson(BELIEFS_PATH, data);

  return {
    success: true,
    belief,
    totalBeliefs: data.beliefs.length,
    message: `Added belief: ${name}`,
  };
}

function getThesis() {
  const thesis = readFile(THESIS_PATH);

  if (!thesis) {
    return {
      thesis: null,
      message: "No thesis generated yet. Trigger a thinking cycle to generate one.",
    };
  }

  return {
    thesis,
    lastUpdated: thesis.match(/\*Last Updated: (.*?)\*/)?.[1] || null,
  };
}

async function triggerThinkingCycle() {
  try {
    const thinkingEngine = await import("../services/engine/thinking-engine.js");
    const engine = thinkingEngine.getThinkingEngine();

    if (!engine.isRunning) {
      engine.start();
    }

    await engine.triggerCycle();

    return {
      success: true,
      message: "Thinking cycle triggered",
      status: engine.getStatus(),
    };
  } catch (error) {
    return {
      success: false,
      error: `Thinking engine unavailable: ${error.message}`,
      hint: "The thinking engine may not be initialized. Start BACKBONE first.",
    };
  }
}

async function planGoal(goalId) {
  try {
    const data = readJson(GOALS_PATH) || { goals: [] };
    const goal = data.goals.find(g => g.id === goalId);

    if (!goal) {
      return { success: false, error: `Goal not found: ${goalId}` };
    }

    if (goal.plan && goal.plan.status === "ready") {
      return {
        success: true,
        message: "Plan already exists",
        planFile: goal.plan.planFile,
        plan: goal.plan,
        deliverables: goal.deliverables,
        acceptanceCriteria: goal.acceptanceCriteria,
      };
    }

    const planner = await import("../services/goals/goal-planner.js");
    const result = await planner.developPlan(goal);

    if (result.success) {
      // Re-read to get updated data
      const updatedData = readJson(GOALS_PATH) || { goals: [] };
      const updatedGoal = updatedData.goals.find(g => g.id === goalId);

      return {
        success: true,
        message: `Plan developed for: ${goal.title}`,
        planFile: result.planFile,
        plan: updatedGoal?.plan || null,
        deliverables: updatedGoal?.deliverables || [],
        acceptanceCriteria: updatedGoal?.acceptanceCriteria || [],
      };
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: `Plan development failed: ${error.message}`,
    };
  }
}

async function reviewGoalPlan(goalId) {
  try {
    const data = readJson(GOALS_PATH) || { goals: [] };
    const goal = data.goals.find(g => g.id === goalId);

    if (!goal) {
      return { success: false, error: `Goal not found: ${goalId}` };
    }

    const planner = await import("../services/goals/goal-planner.js");
    const evaluation = await planner.evaluatePlan(goal);

    // If plan needs update, include the current plan content
    let planContent = null;
    if (goal.plan?.planFile) {
      planContent = readFile(path.join(getBackboneHome(), goal.plan.planFile));
    }

    return {
      success: true,
      goalId: goal.id,
      goalTitle: goal.title,
      planStatus: goal.plan?.status || "none",
      ...evaluation,
      planContent: evaluation.needsUpdate ? planContent : null,
    };
  } catch (error) {
    return {
      success: false,
      error: `Plan review failed: ${error.message}`,
    };
  }
}

// === SERVER SETUP ===

const server = new Server(
  { name: "backbone-life", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  switch (name) {
    case "get_goals":
      result = getGoals(args.status, args.category);
      break;
    case "get_beliefs":
      result = getBeliefs();
      break;
    case "get_backlog":
      result = getBacklog(args.minScore, args.source, args.limit);
      break;
    case "get_life_scores":
      result = await getLifeScores();
      break;
    case "add_goal":
      result = addGoal(args);
      break;
    case "add_belief":
      result = addBelief(args.name, args.description);
      break;
    case "get_thesis":
      result = getThesis();
      break;
    case "trigger_thinking_cycle":
      result = await triggerThinkingCycle();
      break;
    case "plan_goal":
      result = await planGoal(args.goalId);
      break;
    case "review_goal_plan":
      result = await reviewGoalPlan(args.goalId);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Life Management MCP Server running");
}

main().catch(console.error);
