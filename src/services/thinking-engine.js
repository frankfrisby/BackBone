import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { sendMessage } from "./claude.js";
import { getActivityTracker } from "./activity-tracker.js";
import { developPlan, initPlanFields, getUnplannedGoals } from "./goal-planner.js";

/**
 * Thinking Engine - The brain that actually thinks and acts
 *
 * FULL PIPELINE:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CORE BELIEFS (Epics)                                           │
 * │  Ongoing forever. Fundamental things the user cares about.      │
 * │  Examples: "Be healthy", "Build wealth", "Strong family bonds"  │
 * └────────────────────────────┬────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  BACKLOG                                                        │
 * │  Generated from: news, content, role models, user desires       │
 * │  Items accumulate. When important enough → graduate to goal     │
 * │  Each item has: impact score, urgency, alignment to beliefs     │
 * └────────────────────────────┬────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  GOALS (User Stories)                                           │
 * │  Discrete, achievable in 1 day to 1 week. Has specific tasks.   │
 * │  Created when backlog items reach graduation threshold          │
 * └────────────────────────────┬────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  PROJECTS (Features)                                            │
 * │  Check for existing relevant project:                           │
 * │  - If active & relevant → connect goal to it                    │
 * │  - If stale/time-dependent → create new project                 │
 * │  - If none exists → create new project                          │
 * └────────────────────────────┬────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TASKS                                                          │
 * │  Discrete work items within the goal, executed via Claude Code  │
 * └─────────────────────────────────────────────────────────────────┘
 */

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const PROJECTS_DIR = path.join(process.cwd(), "projects");
const THESIS_PATH = path.join(MEMORY_DIR, "thesis.md");
const BELIEFS_PATH = path.join(DATA_DIR, "core-beliefs.json");
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const BACKLOG_PATH = path.join(DATA_DIR, "backlog.json");
const THINKING_LOG_PATH = path.join(DATA_DIR, "thinking-log.json");
const ROLE_MODELS_PATH = path.join(DATA_DIR, "person-match-cache.json");
const PROFILE_SECTIONS_PATH = path.join(DATA_DIR, "profile-sections.json");
const LINKEDIN_PROFILE_PATH = path.join(DATA_DIR, "linkedin-profile.json");

const CYCLE_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Backlog graduation thresholds
const GRADUATION_THRESHOLD = 75; // Impact score needed to become a goal
const MAX_BACKLOG_ITEMS = 150; // Cap backlog size
const PROJECT_STALE_DAYS = 90; // Days before a project is considered stale for time-sensitive work

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

function getUserSkillSignals() {
  const signals = {
    isExperiencedDev: false,
    skillKeywords: new Set()
  };

  const profile = readJson(PROFILE_SECTIONS_PATH);
  const linkedIn = readJson(LINKEDIN_PROFILE_PATH);

  const headline = profile?.general?.headline || linkedIn?.profile?.headline || linkedIn?.gpt4oAnalysis?.headline || "";
  const currentRole = profile?.work?.currentRole || linkedIn?.profile?.currentRole || linkedIn?.gpt4oAnalysis?.currentRole || "";
  const skills = [
    ...(profile?.skills?.technical || []),
    ...(profile?.skills?.languages || []),
    ...(linkedIn?.profile?.skills || []),
    ...(linkedIn?.gpt4oAnalysis?.skills || [])
  ].map(s => String(s).toLowerCase());

  const roleText = `${headline} ${currentRole}`.toLowerCase();
  const devSignals = /(engineer|developer|software|full\s*stack|frontend|backend|react|javascript|typescript|node|web|ai|ml)/i;
  signals.isExperiencedDev = devSignals.test(roleText);

  skills.forEach(s => signals.skillKeywords.add(s));
  roleText.split(/\W+/).forEach(token => {
    if (token.length >= 3) signals.skillKeywords.add(token);
  });

  return signals;
}

function isRedundantLearningProject(name, description, signals) {
  const text = `${name} ${description}`.toLowerCase();
  const learningWords = /(learn|learning|study|course|bootcamp|tutorial|certification)/;
  if (!learningWords.test(text)) return false;

  if (!signals.isExperiencedDev) return false;

  // If it targets common dev skills already implied by role, treat as redundant
  const skillTargets = /(react|javascript|js\b|typescript|node|frontend|backend|web\s*dev|web\s*development|full\s*stack|software)/;
  if (skillTargets.test(text)) return true;

  for (const kw of signals.skillKeywords) {
    if (kw.length >= 3 && text.includes(kw)) {
      return true;
    }
  }

  return false;
}

function normalizeProjectNameForLearning(name, description, signals) {
  if (!isRedundantLearningProject(name, description, signals)) {
    return { name, description, adjusted: false };
  }

  return {
    name: "engineering-execution",
    description: "Apply and deepen existing engineering skills through real deliverables and measurable outcomes.",
    adjusted: true
  };
}

// Get all projects with their status and metadata
function getProjects() {
  const projects = [];
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return projects;
    const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith("."))
      .map(d => d.name);

    for (const dir of dirs) {
      const projectMd = path.join(PROJECTS_DIR, dir, "PROJECT.md");
      const content = readFile(projectMd);

      // Parse status from PROJECT.md
      let status = "unknown";
      let description = "";
      let createdDate = null;
      let lastUpdated = null;
      let relatedBeliefs = [];

      const statusMatch = content.match(/\*\*Status:\*\*\s*(\w+)/i) || content.match(/Status:\s*(\w+)/i);
      if (statusMatch) status = statusMatch[1].toLowerCase();

      const createdMatch = content.match(/\*\*Created:\*\*\s*(.+)/i);
      if (createdMatch) {
        try {
          createdDate = new Date(createdMatch[1]).toISOString();
        } catch {}
      }

      const updatedMatch = content.match(/\*\*Last Updated:\*\*\s*(.+)/i);
      if (updatedMatch) {
        try {
          lastUpdated = new Date(updatedMatch[1]).toISOString();
        } catch {}
      }

      const beliefsMatch = content.match(/\*\*Related Beliefs:\*\*\s*(.+)/i);
      if (beliefsMatch) {
        relatedBeliefs = beliefsMatch[1].split(",").map(b => b.trim()).filter(Boolean);
      }

      const descMatch = content.match(/## (?:Description|Overview|Summary|Goal)\n+([\s\S]*?)(?:\n##|$)/i);
      if (descMatch) description = descMatch[1].trim().slice(0, 300);
      else description = content.slice(0, 300);

      // Calculate days since last update
      let daysSinceUpdate = null;
      if (lastUpdated || createdDate) {
        const refDate = new Date(lastUpdated || createdDate);
        daysSinceUpdate = Math.floor((Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      projects.push({
        name: dir,
        path: path.join(PROJECTS_DIR, dir),
        status, // active, paused, completed, unknown
        description,
        hasProjectMd: !!content,
        createdDate,
        lastUpdated,
        relatedBeliefs,
        daysSinceUpdate,
        isStale: daysSinceUpdate !== null && daysSinceUpdate > PROJECT_STALE_DAYS
      });
    }
  } catch {}
  return projects;
}

/**
 * Check if a project is suitable for a new goal
 * Returns: { suitable: boolean, reason: string }
 */
function isProjectSuitableForGoal(project, goalContext) {
  // If project is stale and the goal is time-sensitive, don't reuse
  if (project.isStale && goalContext.isTimeSensitive) {
    return {
      suitable: false,
      reason: `Project "${project.name}" is ${project.daysSinceUpdate} days old - too stale for time-sensitive goal`
    };
  }

  // If project is completed, it can be reopened unless stale
  if (project.status === "completed" && project.isStale) {
    return {
      suitable: false,
      reason: `Project "${project.name}" is completed and ${project.daysSinceUpdate} days old - create new project`
    };
  }

  // Active projects are suitable
  if (project.status === "active") {
    return { suitable: true, reason: "Project is active and current" };
  }

  // Paused projects can be reopened if not stale
  if (project.status === "paused" && !project.isStale) {
    return { suitable: true, reason: "Project can be reopened" };
  }

  return { suitable: false, reason: "Project not suitable" };
}

// Update or create a project
function ensureProject(name, description, beliefs = []) {
  const projectPath = path.join(PROJECTS_DIR, name);
  const projectMd = path.join(projectPath, "PROJECT.md");

  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const existingContent = readFile(projectMd);
  const now = new Date().toISOString();

  if (!existingContent) {
    // Create new PROJECT.md
    const content = `# ${name}

**Status:** active
**Created:** ${now}
**Last Updated:** ${now}
**Related Beliefs:** ${beliefs.join(", ") || "general"}

## Description

${description}

## Goals

_Goals will be added here as work progresses._

## Progress Log

- ${now.split("T")[0]}: Project created by thinking engine

---
*Managed by BACKBONE*
`;
    writeFile(projectMd, content);
    return { created: true, path: projectPath };
  } else {
    // Update existing - mark as active if was paused/completed
    let updated = existingContent;
    if (updated.includes("**Status:** paused") || updated.includes("**Status:** completed")) {
      updated = updated.replace(/\*\*Status:\*\*\s*\w+/, "**Status:** active");
      updated = updated.replace(/\*\*Last Updated:\*\*.*/, `**Last Updated:** ${now}`);

      // Add to progress log
      const logEntry = `- ${now.split("T")[0]}: Project reopened by thinking engine\n`;
      if (updated.includes("## Progress Log")) {
        updated = updated.replace("## Progress Log\n", `## Progress Log\n${logEntry}`);
      }
      writeFile(projectMd, updated);
      return { reopened: true, path: projectPath };
    }
    return { exists: true, path: projectPath };
  }
}

// Add a goal to a project
function addGoalToProject(projectName, goal) {
  const projectMd = path.join(PROJECTS_DIR, projectName, "PROJECT.md");
  let content = readFile(projectMd);
  if (!content) return false;

  const now = new Date().toISOString();
  const goalEntry = `\n### ${goal.title}\n**Status:** active | **Due:** ${goal.dueDate || "this week"}\n\n${goal.description}\n\n**Tasks:**\n${goal.tasks.map(t => `- [ ] ${t}`).join("\n")}\n`;

  // Add under Goals section
  if (content.includes("## Goals")) {
    content = content.replace("## Goals\n", `## Goals\n${goalEntry}`);
  } else {
    content += `\n## Goals\n${goalEntry}`;
  }

  // Update timestamp
  content = content.replace(/\*\*Last Updated:\*\*.*/, `**Last Updated:** ${now}`);

  writeFile(projectMd, content);
  return true;
}

// Get role models for context
function getRoleModels() {
  // Try to get cached matched role models
  const cache = readJson(ROLE_MODELS_PATH);
  if (cache && cache.topMatches) {
    return cache.topMatches.slice(0, 5);
  }

  // Fallback: return top finance/tech role models
  return [
    { name: "Ray Dalio", domain: "finance", trait: "systematic investor", advice: "Focus on principles and systematic decision-making" },
    { name: "Warren Buffett", domain: "finance", trait: "value investor", advice: "Be patient, focus on value, avoid trends" },
    { name: "Elon Musk", domain: "tech", trait: "ambitious builder", advice: "Think big, iterate fast, solve real problems" },
    { name: "Peter Attia", domain: "health", trait: "longevity focused", advice: "Optimize health metrics, track data, prevent disease" },
    { name: "David Goggins", domain: "health", trait: "mental toughness", advice: "Push limits, build discipline, transform through action" }
  ];
}

// Load backlog data
function loadBacklog() {
  const data = readJson(BACKLOG_PATH) || {
    items: [],
    graduatedToGoals: [],
    dismissed: [],
    lastUpdated: null,
    stats: { totalGenerated: 0, totalGraduated: 0, totalDismissed: 0 }
  };
  return data;
}

// Save backlog data
function saveBacklog(data) {
  data.lastUpdated = new Date().toISOString();
  writeJson(BACKLOG_PATH, data);
}

// Add items to backlog
function addToBacklog(items) {
  const backlog = loadBacklog();

  for (const item of items) {
    // Check for duplicates (by similar title)
    const isDuplicate = backlog.items.some(
      existing => existing.title.toLowerCase() === item.title.toLowerCase()
    );

    if (!isDuplicate) {
      backlog.items.push({
        id: `backlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        description: item.description,
        source: item.source || "thinking-engine", // news, content, role-model, user-desire
        relatedBeliefs: item.relatedBeliefs || [],
        impactScore: item.impactScore || 50, // 0-100
        urgency: item.urgency || "low", // low, medium, high, critical
        isTimeSensitive: item.isTimeSensitive || false,
        suggestedProject: item.suggestedProject || null,
        roleModelInspiration: item.roleModelInspiration || null,
        createdAt: new Date().toISOString(),
        lastEvaluated: null
      });
      backlog.stats.totalGenerated++;
    }
  }

  // Cap backlog size - remove oldest low-impact items
  if (backlog.items.length > MAX_BACKLOG_ITEMS) {
    backlog.items.sort((a, b) => b.impactScore - a.impactScore);
    backlog.items = backlog.items.slice(0, MAX_BACKLOG_ITEMS);
  }

  saveBacklog(backlog);
  return backlog;
}

// Graduate backlog items to goals
function graduateBacklogItems(backlog, projects) {
  const graduated = [];
  const now = new Date().toISOString();

  // Find items ready to graduate (high impact score)
  const readyItems = backlog.items
    .filter(item => item.impactScore >= GRADUATION_THRESHOLD)
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 3); // Graduate max 3 at a time

  for (const item of readyItems) {
    // Find suitable project
    let targetProject = null;
    let shouldCreateNew = false;

    if (item.suggestedProject) {
      const existingProject = projects.find(p =>
        p.name === item.suggestedProject ||
        p.name.includes(item.suggestedProject) ||
        item.suggestedProject.includes(p.name)
      );

      if (existingProject) {
        const suitability = isProjectSuitableForGoal(existingProject, {
          isTimeSensitive: item.isTimeSensitive
        });

        if (suitability.suitable) {
          targetProject = existingProject.name;
        } else {
          shouldCreateNew = true;
          console.log(`[ThinkingEngine] ${suitability.reason}`);
        }
      } else {
        shouldCreateNew = true;
      }
    } else {
      // No suggested project - find one by related beliefs
      const matchingProject = projects.find(p =>
        p.status === "active" &&
        !p.isStale &&
        item.relatedBeliefs.some(b =>
          p.relatedBeliefs.includes(b) ||
          p.description.toLowerCase().includes(b.toLowerCase())
        )
      );

      if (matchingProject) {
        targetProject = matchingProject.name;
      } else {
        shouldCreateNew = true;
      }
    }

    graduated.push({
      ...item,
      targetProject,
      shouldCreateNew,
      graduatedAt: now
    });

    // Move from items to graduatedToGoals
    backlog.items = backlog.items.filter(i => i.id !== item.id);
    backlog.graduatedToGoals.push({
      id: item.id,
      title: item.title,
      targetProject,
      graduatedAt: now
    });
    backlog.stats.totalGraduated++;
  }

  saveBacklog(backlog);
  return graduated;
}

function buildContext() {
  const profile = readFile(path.join(MEMORY_DIR, "profile.md"));
  const goalsMemory = readFile(path.join(MEMORY_DIR, "goals.md"));
  const health = readFile(path.join(MEMORY_DIR, "health.md"));
  const portfolio = readFile(path.join(MEMORY_DIR, "portfolio.md"));
  const currentThesis = readFile(THESIS_PATH);
  const beliefs = readJson(BELIEFS_PATH) || { beliefs: [] };
  const goalsJson = readJson(GOALS_PATH) || { goals: [] };
  const lifeScores = readJson(path.join(DATA_DIR, "life-scores.json")) || {};
  const projects = getProjects();
  const backlog = loadBacklog();
  const roleModels = getRoleModels();

  return {
    profile,
    goalsMemory,
    health,
    portfolio,
    currentThesis,
    beliefs: beliefs.beliefs || [],
    goalsJson: goalsJson.goals || [],
    lifeScores,
    projects,
    backlog,
    roleModels,
    timestamp: new Date().toISOString()
  };
}

function buildThinkingPrompt(context) {
  const beliefsList = context.beliefs.length > 0
    ? context.beliefs.map(b => `- **${b.name}**: ${b.description}`).join("\n")
    : "No core beliefs defined yet. Infer from profile and goals.";

  const projectsList = context.projects.length > 0
    ? context.projects.map(p => {
        const staleWarning = p.isStale ? ` [STALE: ${p.daysSinceUpdate} days]` : "";
        return `- **${p.name}** (${p.status}${staleWarning}): ${p.description.slice(0, 150)}`;
      }).join("\n")
    : "No projects yet.";

  const activeGoals = context.goalsJson.filter(g => g.status === "active");
  const goalsList = activeGoals.length > 0
    ? activeGoals.map(g => `- ${g.title} (${g.category}, ${g.progress || 0}%)`).join("\n")
    : "No active goals.";

  const backlogSummary = context.backlog.items.length > 0
    ? `${context.backlog.items.length} items in backlog. Top 5 by impact:\n` +
      context.backlog.items
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, 5)
        .map(i => `- [${i.impactScore}] ${i.title} (${i.source})`)
        .join("\n")
    : "Backlog is empty.";

  const roleModelsList = context.roleModels.slice(0, 5)
    .map(r => `- **${r.name}** (${r.domain}): ${r.advice || r.trait}`)
    .join("\n");

  const scoresText = Object.entries(context.lifeScores)
    .filter(([k]) => k !== "lastUpdated" && k !== "history")
    .map(([k, v]) => `- ${k}: ${typeof v === "object" ? v.score || JSON.stringify(v) : v}`)
    .join("\n") || "No life scores.";

  return `You are the Thinking Engine for BACKBONE, a life optimization system.

## THE PIPELINE

1. **Core Beliefs (Epics)** → What the user cares about forever
2. **Backlog** → Ideas generated from news, content, role models, desires
3. **Goals** → When backlog items are impactful enough, they become goals
4. **Projects** → Goals connect to existing projects OR create new ones
5. **Tasks** → Discrete work executed via Claude Code

## IMPORTANT RULES

- **Backlog items** are ideas, NOT commitments. Generate many.
- **Goals** are created when backlog items have HIGH IMPACT (score >= 75).
- **Projects** should be REUSED when possible, but NOT if stale (${PROJECT_STALE_DAYS}+ days old) for time-sensitive work.
- **Time-sensitive** work (stock analysis, news-based decisions) needs FRESH projects.
- Role models provide INSPIRATION for what kinds of ideas to generate.

## Current User Context

### Profile
${context.profile || "No profile data."}

### Core Beliefs (What They Care About Forever)
${beliefsList}

### Role Models for Inspiration
${roleModelsList}

### Existing Projects
${projectsList}

### Active Goals
${goalsList}

### Current Backlog
${backlogSummary}

### Health Summary
${context.health || "No health data."}

### Portfolio Summary
${context.portfolio || "No portfolio data."}

### Life Scores
${scoresText}

### Current Thesis
${context.currentThesis || "No thesis yet."}

---

## Your Task

Analyze the context and run the thinking cycle.

### 1. THESIS (2-3 sentences)
What should the user focus on right now, based on their beliefs and current state?

### 2. INFERRED BELIEFS
If no beliefs defined, infer 2-3 from profile/goals. Format: { name, description }

### 3. NEW BACKLOG ITEMS
Generate 3-7 new backlog ideas inspired by:
- User's core beliefs and desires
- What their role models would suggest
- Current market/world conditions (if relevant to their beliefs)
- Gaps between their current state and goals

Each item needs:
- title: Clear, actionable idea
- description: What it involves
- source: "role-model" | "belief-aligned" | "market-opportunity" | "health-optimization" | "skill-building"
- relatedBeliefs: Which beliefs this supports
- impactScore: 0-100 (how much this moves the needle)
- urgency: "low" | "medium" | "high" | "critical"
- isTimeSensitive: true/false (does this lose value over time?)
- suggestedProject: Which existing project could handle this, or null

### 4. EVALUATE EXISTING BACKLOG
Look at the current backlog items. Should any be:
- **Boosted**: Increase impactScore if now more relevant
- **Dismissed**: Remove if no longer relevant (return list of IDs)

### 5. GOALS TO CREATE
Items with impactScore >= ${GRADUATION_THRESHOLD} should graduate to goals.
For each graduated item:
- Check if a suitable project exists (active, not stale for time-sensitive work)
- If no suitable project, specify a new project to create
- Include 2-5 specific tasks

Be conservative with goals. Only 0-2 per cycle.

### 6. PROJECT ACTIONS
What projects need attention? Can an EXISTING project be reopened?
Only create NEW project if nothing fits.

### 7. INSIGHT
One key observation about patterns or what's working/missing.

---

Respond in JSON:
\`\`\`json
{
  "thesis": "...",
  "inferredBeliefs": [{ "name": "...", "description": "..." }],
  "newBacklogItems": [{
    "title": "...",
    "description": "...",
    "source": "...",
    "relatedBeliefs": ["..."],
    "impactScore": 75,
    "urgency": "medium",
    "isTimeSensitive": false,
    "suggestedProject": "existing-project-name or null"
  }],
  "backlogUpdates": {
    "boost": [{ "id": "...", "newScore": 85, "reason": "..." }],
    "dismiss": [{ "id": "...", "reason": "..." }]
  },
  "goals": [{
    "title": "...",
    "project": "...",
    "shouldCreateProject": false,
    "description": "...",
    "tasks": ["..."],
    "dueDate": "...",
    "fromBacklogItem": "backlog_item_id or null"
  }],
  "projectActions": [{ "action": "reopen|create", "name": "...", "description": "...", "relatedBeliefs": ["..."] }],
  "insight": "..."
}
\`\`\``;
}

class ThinkingEngine extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.cycleTimer = null;
    this.lastCycle = null;
    this.cycleCount = 0;
    this.thinkingLog = this.loadLog();
  }

  loadLog() {
    return readJson(THINKING_LOG_PATH) || { cycles: [], insights: [] };
  }

  saveLog() {
    writeJson(THINKING_LOG_PATH, this.thinkingLog);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[ThinkingEngine] Started - will run every 15 minutes");

    // Run first cycle after a short delay
    setTimeout(() => this.runCycle(), 10000);

    // Schedule recurring cycles
    this.cycleTimer = setInterval(() => this.runCycle(), CYCLE_INTERVAL);
    this.emit("started");
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    console.log("[ThinkingEngine] Stopped");
    this.emit("stopped");
  }

  async runCycle() {
    if (!this.isRunning) return;

    const tracker = getActivityTracker();
    const cycleStart = Date.now();
    this.cycleCount++;

    console.log(`[ThinkingEngine] Starting cycle #${this.cycleCount}`);
    tracker.setState("thinking", "Analyzing user context...");
    tracker.setGoal("Understanding patterns and identifying what needs attention");

    try {
      // 1. Build context
      const context = buildContext();
      tracker.action("READ", "data/profile.json, data/core-beliefs.json, projects/, data/goals.json, data/backlog.json");

      // 2. Send to Claude for analysis
      tracker.setState("analyzing", "Processing patterns...");
      const prompt = buildThinkingPrompt(context);

      const response = await sendMessage([
        { role: "user", content: prompt }
      ], {
        maxTokens: 3000,
        temperature: 0.7
      });

      if (!response || !response.content) {
        throw new Error("No response from Claude");
      }

      // 3. Parse response
      const content = response.content;
      let result;

      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        result = JSON.parse(content);
      }

      // 4. Update thesis
      if (result.thesis) {
        tracker.setState("building", "Updating thesis...");
        const thesisContent = `# Current Focus

*Last Updated: ${new Date().toISOString()}*

${result.thesis}

## Latest Insight

${result.insight || "No specific insight this cycle."}

## Backlog Summary

- Total Items: ${context.backlog.items.length}
- High Impact (ready to graduate): ${context.backlog.items.filter(i => i.impactScore >= GRADUATION_THRESHOLD).length}
- Recently Graduated: ${context.backlog.stats.totalGraduated}
`;
        writeFile(THESIS_PATH, thesisContent);
        tracker.action("UPDATE", "memory/thesis.md");
      }

      // 5. Save inferred beliefs if none exist
      if (result.inferredBeliefs && result.inferredBeliefs.length > 0) {
        const beliefs = readJson(BELIEFS_PATH) || { beliefs: [] };
        if (beliefs.beliefs.length === 0) {
          beliefs.beliefs = result.inferredBeliefs.map(b => ({
            ...b,
            id: `belief_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            createdAt: new Date().toISOString(),
            createdBy: "thinking-engine"
          }));
          beliefs.lastUpdated = new Date().toISOString();
          writeJson(BELIEFS_PATH, beliefs);
          tracker.action("WRITE", `created ${beliefs.beliefs.length} core beliefs`);
          console.log(`[ThinkingEngine] Inferred ${beliefs.beliefs.length} core beliefs`);
        }
      }

      // 6. Add new backlog items
      if (result.newBacklogItems && result.newBacklogItems.length > 0) {
        const backlog = addToBacklog(result.newBacklogItems);
        tracker.action("WRITE", `added ${result.newBacklogItems.length} backlog items`);
        console.log(`[ThinkingEngine] Added ${result.newBacklogItems.length} items to backlog (total: ${backlog.items.length})`);
      }

      // 7. Process backlog updates (boost/dismiss)
      if (result.backlogUpdates) {
        const backlog = loadBacklog();

        // Boost items
        if (result.backlogUpdates.boost) {
          for (const boost of result.backlogUpdates.boost) {
            const item = backlog.items.find(i => i.id === boost.id);
            if (item) {
              item.impactScore = boost.newScore;
              item.lastEvaluated = new Date().toISOString();
              console.log(`[ThinkingEngine] Boosted "${item.title}" to ${boost.newScore}`);
            }
          }
        }

        // Dismiss items
        if (result.backlogUpdates.dismiss) {
          for (const dismiss of result.backlogUpdates.dismiss) {
            const index = backlog.items.findIndex(i => i.id === dismiss.id);
            if (index !== -1) {
              const [removed] = backlog.items.splice(index, 1);
              backlog.dismissed.push({
                ...removed,
                dismissedAt: new Date().toISOString(),
                dismissReason: dismiss.reason
              });
              backlog.stats.totalDismissed++;
              console.log(`[ThinkingEngine] Dismissed "${removed.title}": ${dismiss.reason}`);
            }
          }
        }

        saveBacklog(backlog);
      }

      // 8. Handle project actions
      if (result.projectActions && result.projectActions.length > 0) {
        const signals = getUserSkillSignals();
        for (const action of result.projectActions) {
          if (!action.name) continue;

          const adjusted = normalizeProjectNameForLearning(action.name, action.description || "", signals);
          if (adjusted.adjusted) {
            console.log(`[ThinkingEngine] Adjusted learning project "${action.name}" -> "${adjusted.name}"`);
          }

          const projectResult = ensureProject(
            adjusted.name.toLowerCase().replace(/\s+/g, "-"),
            adjusted.description || "",
            action.relatedBeliefs || []
          );

          if (projectResult.created) {
            tracker.action("MKDIR", `projects/${adjusted.name}`);
            console.log(`[ThinkingEngine] Created project: ${adjusted.name}`);
          } else if (projectResult.reopened) {
            tracker.action("UPDATE", `projects/${adjusted.name}/PROJECT.md`);
            console.log(`[ThinkingEngine] Reopened project: ${adjusted.name}`);
          }
        }
      }

      // 9. Create goals from graduated backlog items
      if (result.goals && result.goals.length > 0) {
        const goalsData = readJson(GOALS_PATH) || { goals: [] };
        const existingTitles = new Set(goalsData.goals.map(g => g.title.toLowerCase()));
        const currentProjects = getProjects();

        const signals = getUserSkillSignals();
        for (const goal of result.goals) {
          if (!goal.title || !goal.project) continue;
          if (existingTitles.has(goal.title.toLowerCase())) continue;

          const adjusted = normalizeProjectNameForLearning(goal.project, goal.description || "", signals);
          if (adjusted.adjusted) {
            console.log(`[ThinkingEngine] Adjusted learning project "${goal.project}" -> "${adjusted.name}"`);
            goal.project = adjusted.name;
            goal.description = adjusted.description || goal.description;
          }

          const projectName = goal.project.toLowerCase().replace(/\s+/g, "-");

          // Check if we need to create a new project
          if (goal.shouldCreateProject) {
            ensureProject(projectName, goal.description || "", []);
            console.log(`[ThinkingEngine] Created new project for goal: ${projectName}`);
          } else {
            // Verify existing project is suitable
            const existingProject = currentProjects.find(p => p.name === projectName);
            if (existingProject) {
              const suitability = isProjectSuitableForGoal(existingProject, {
                isTimeSensitive: goal.isTimeSensitive || false
              });

              if (!suitability.suitable) {
                // Create new project instead
                const newProjectName = `${projectName}-${new Date().toISOString().slice(0, 10)}`;
                ensureProject(newProjectName, goal.description || "", []);
                goal.project = newProjectName;
                console.log(`[ThinkingEngine] Created fresh project: ${newProjectName} (original was stale)`);
              }
            } else {
              ensureProject(projectName, goal.description || "", []);
            }
          }

          // Add goal to project's PROJECT.md
          addGoalToProject(goal.project || projectName, goal);

          // Add to goals.json with plan fields
          const newGoal = initPlanFields({
            id: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: goal.title,
            project: goal.project || projectName,
            description: goal.description,
            tasks: goal.tasks || [],
            dueDate: goal.dueDate,
            status: "planning",
            progress: 0,
            createdAt: new Date().toISOString(),
            createdBy: "thinking-engine",
            fromBacklogItem: goal.fromBacklogItem || null
          });

          goalsData.goals.push(newGoal);
          existingTitles.add(goal.title.toLowerCase());

          tracker.action("WRITE", `data/goals.json: ${goal.title}`);
          console.log(`[ThinkingEngine] Created goal: ${goal.title} in ${projectName} (status: planning)`);
        }

        goalsData.lastUpdated = new Date().toISOString();
        writeJson(GOALS_PATH, goalsData);

        // Develop plans for newly created goals
        tracker.setState("planning", "Developing goal plans...");
        const unplanned = getUnplannedGoals();
        for (const unplannedGoal of unplanned.slice(0, 2)) { // Plan max 2 per cycle
          try {
            console.log(`[ThinkingEngine] Developing plan for: ${unplannedGoal.title}`);
            const planResult = await developPlan(unplannedGoal);
            if (planResult.success) {
              tracker.action("WRITE", `${planResult.planFile}`);
              console.log(`[ThinkingEngine] Plan created: ${planResult.planFile}`);
            } else {
              console.log(`[ThinkingEngine] Plan failed for ${unplannedGoal.title}: ${planResult.error}`);
            }
          } catch (planError) {
            console.error(`[ThinkingEngine] Plan error for ${unplannedGoal.title}:`, planError.message);
          }
        }
      }

      // 10. Log the cycle
      const cycleLog = {
        cycle: this.cycleCount,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - cycleStart,
        thesis: result.thesis?.slice(0, 200),
        projectActions: result.projectActions?.length || 0,
        goalsCreated: result.goals?.length || 0,
        backlogItemsAdded: result.newBacklogItems?.length || 0,
        backlogTotal: loadBacklog().items.length,
        insight: result.insight
      };

      this.thinkingLog.cycles.unshift(cycleLog);
      if (this.thinkingLog.cycles.length > 100) {
        this.thinkingLog.cycles = this.thinkingLog.cycles.slice(0, 100);
      }

      if (result.insight) {
        this.thinkingLog.insights.unshift({
          timestamp: new Date().toISOString(),
          insight: result.insight
        });
        if (this.thinkingLog.insights.length > 50) {
          this.thinkingLog.insights = this.thinkingLog.insights.slice(0, 50);
        }
      }

      this.saveLog();
      this.lastCycle = cycleLog;

      // Done
      tracker.setState("idle", null);
      console.log(`[ThinkingEngine] Cycle #${this.cycleCount} complete (${Date.now() - cycleStart}ms)`);
      this.emit("cycle-complete", cycleLog);

    } catch (error) {
      console.error(`[ThinkingEngine] Cycle error:`, error.message);
      tracker.setState("idle", null);
      this.emit("cycle-error", error);
    }
  }

  getStatus() {
    const backlog = loadBacklog();
    return {
      isRunning: this.isRunning,
      cycleCount: this.cycleCount,
      lastCycle: this.lastCycle,
      nextCycleIn: this.cycleTimer ? CYCLE_INTERVAL : null,
      backlogStats: {
        total: backlog.items.length,
        highImpact: backlog.items.filter(i => i.impactScore >= GRADUATION_THRESHOLD).length,
        totalGraduated: backlog.stats.totalGraduated
      }
    };
  }

  getThesis() {
    return readFile(THESIS_PATH);
  }

  getBeliefs() {
    const data = readJson(BELIEFS_PATH) || { beliefs: [] };
    return data.beliefs;
  }

  getBacklog() {
    return loadBacklog();
  }

  getInsights() {
    return this.thinkingLog.insights.slice(0, 10);
  }

  getProjects() {
    return getProjects();
  }

  // Force a cycle now
  async triggerCycle() {
    console.log("[ThinkingEngine] Manual cycle triggered");
    await this.runCycle();
  }

  // Add a core belief manually
  addBelief(name, description) {
    const data = readJson(BELIEFS_PATH) || { beliefs: [] };
    const belief = {
      id: `belief_${Date.now()}`,
      name,
      description,
      createdAt: new Date().toISOString(),
      createdBy: "user"
    };
    data.beliefs.push(belief);
    data.lastUpdated = new Date().toISOString();
    writeJson(BELIEFS_PATH, data);
    return belief;
  }

  // Manually add a backlog item
  addBacklogItem(item) {
    return addToBacklog([item]);
  }

  // Manually boost a backlog item
  boostBacklogItem(id, newScore, reason = "Manual boost") {
    const backlog = loadBacklog();
    const item = backlog.items.find(i => i.id === id);
    if (item) {
      item.impactScore = newScore;
      item.lastEvaluated = new Date().toISOString();
      saveBacklog(backlog);
      return item;
    }
    return null;
  }

  // Manually dismiss a backlog item
  dismissBacklogItem(id, reason = "Manual dismissal") {
    const backlog = loadBacklog();
    const index = backlog.items.findIndex(i => i.id === id);
    if (index !== -1) {
      const [removed] = backlog.items.splice(index, 1);
      backlog.dismissed.push({
        ...removed,
        dismissedAt: new Date().toISOString(),
        dismissReason: reason
      });
      backlog.stats.totalDismissed++;
      saveBacklog(backlog);
      return removed;
    }
    return null;
  }
}

// Singleton
let engineInstance = null;

export const getThinkingEngine = () => {
  if (!engineInstance) {
    engineInstance = new ThinkingEngine();
  }
  return engineInstance;
};

export default ThinkingEngine;
