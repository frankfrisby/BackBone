/**
 * Space AI Product Agent — Autonomous product builder
 *
 * Discovers what the space industry needs, validates demand,
 * designs, builds, ships, and iterates until the product
 * generates revenue independently.
 *
 * Phases: discovery → validation → design → build → launch → mature
 *
 * Each phase has graduation criteria. The agent keeps working
 * within a phase until criteria are met, then advances.
 *
 * State persists to data/space-ai-state.json.
 * Journal persists to memory/space-ai-journal.md.
 * Project workspace at projects/space-ai-product/.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { getDataDir, getMemoryDir, getProjectsDir } from "../paths.js";

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const PROJECTS_DIR = getProjectsDir();
const STATE_PATH = path.join(DATA_DIR, "space-ai-state.json");
const JOURNAL_PATH = path.join(MEMORY_DIR, "space-ai-journal.md");
const PROJECT_DIR = path.join(PROJECTS_DIR, "space-ai-product");

const PHASES = ["discovery", "validation", "design", "build", "launch", "mature"];

const PHASE_TASKS = {
  discovery: [
    {
      id: "research-trends",
      name: "Research space industry trends",
      description: "Survey commercial space, satellite data, launch services, debris tracking, Earth observation, GPS/PNT, in-space manufacturing. Identify fast-growing segments.",
      type: "research",
    },
    {
      id: "research-frontier-tech",
      name: "Research frontier AI/ML techniques",
      description: "What novel AI/ML techniques are emerging in papers but haven't been applied to space yet? Think: new architectures, novel data fusion methods, breakthrough algorithms. NOT wrappers around existing APIs.",
      type: "research",
    },
    {
      id: "map-competitors",
      name: "Map competitive landscape",
      description: "For each segment, identify existing players, their products, pricing, funding, strengths, weaknesses. Find underserved areas where novel tech could leap ahead.",
      type: "research",
    },
    {
      id: "demand-signals",
      name: "Analyze demand signals",
      description: "Search job postings, funding rounds, patent filings, conference topics, Reddit/HN discussions, government RFPs for unmet needs.",
      type: "research",
    },
    {
      id: "derivative-mapping",
      name: "Map derivative use cases for each opportunity",
      description: "For each opportunity, identify 3+ OTHER industries/domains where the same core technology could be applied. E.g., debris tracking tech → maritime vessel tracking → drone airspace management. The tech must transfer, not just the idea.",
      type: "analysis",
    },
    {
      id: "score-opportunities",
      name: "Score and rank opportunities",
      description: "Score each opportunity on 6 dimensions (each 1-10): market_size × pain_severity × feasibility × tech_novelty × derivative_potential × uniqueness. Tech novelty and derivative potential are WEIGHTED 2x. Rank top 5.",
      type: "analysis",
    },
    {
      id: "deep-dive-top3",
      name: "Deep dive top 3 opportunities",
      description: "For the top 3: What is the core novel technology? Who are the buyers? What do they pay today? What's missing? How many derivative products could this spawn? Is there prior art that invalidates the novelty?",
      type: "research",
    },
    {
      id: "select-opportunity",
      name: "Select the winning opportunity",
      description: "Pick the #1 opportunity. Write rationale covering: the novel technology, primary space use case, 3+ derivative uses, why now, competitive moat from the tech itself. Save to DISCOVERY.md.",
      type: "decision",
    },
  ],

  validation: [
    {
      id: "define-concept",
      name: "Define product concept and core technology",
      description: "One-liner description, target customer persona, core value proposition, 'why now' thesis. Crucially: define the CORE NOVEL TECHNOLOGY — what is the AI/ML breakthrough? Why can't incumbents replicate it easily?",
      type: "analysis",
    },
    {
      id: "validate-novelty",
      name: "Validate tech novelty — prior art search",
      description: "Search patents (Google Patents), papers (arXiv, Google Scholar), GitHub repos, and startup databases for prior art. Confirm the core technology is genuinely novel. If prior art exists, identify how our approach differs.",
      type: "research",
    },
    {
      id: "map-derivatives",
      name: "Map derivative products and markets",
      description: "Define 3+ derivative products from the core technology. For each: target industry, use case, market size, adaptation effort. E.g., Primary: space debris tracking. Derivative 1: maritime vessel tracking ($4B). Derivative 2: drone airspace management ($2B). Derivative 3: autonomous vehicle obstacle prediction ($8B).",
      type: "analysis",
    },
    {
      id: "size-market",
      name: "Size the market — primary AND derivatives",
      description: "Calculate TAM/SAM/SOM for the primary space product AND each derivative. Total addressable across all derivatives = the real company value.",
      type: "research",
    },
    {
      id: "confirm-demand",
      name: "Confirm demand signals",
      description: "Find 3+ independent demand signals: search trends, forum complaints, job postings, RFPs, competitor growth, analyst reports.",
      type: "research",
    },
    {
      id: "identify-customers",
      name: "Identify first 10 target customers",
      description: "Name 10 specific companies or people who would buy this. Find their contact info or LinkedIn profiles.",
      type: "research",
    },
    {
      id: "pricing-research",
      name: "Research pricing models",
      description: "What do competitors charge? What's the willingness to pay? SaaS vs usage-based vs enterprise licensing?",
      type: "research",
    },
    {
      id: "write-validation",
      name: "Write validation report",
      description: "Compile all findings into VALIDATION.md with go/no-go recommendation. Must include: tech novelty confirmation, derivative product roadmap, combined market size, and competitive moat analysis.",
      type: "decision",
    },
  ],

  design: [
    {
      id: "define-mvp",
      name: "Define MVP feature set",
      description: "Ruthlessly minimal feature set. What's the ONE core thing it must do? Strip everything else.",
      type: "analysis",
    },
    {
      id: "tech-stack",
      name: "Choose tech stack",
      description: "Select languages, frameworks, databases, hosting, CI/CD based on the product needs. Prefer simple, cheap, scalable.",
      type: "decision",
    },
    {
      id: "data-sources",
      name: "Identify data sources and APIs",
      description: "What space data does the product need? Satellite TLEs, launch manifests, imagery, weather, orbital mechanics? Map sources and access methods.",
      type: "research",
    },
    {
      id: "architecture",
      name: "Design system architecture",
      description: "Data pipeline, AI/ML layer, API design, storage, auth. Draw the component diagram. Document in DESIGN.md.",
      type: "analysis",
    },
    {
      id: "write-criteria",
      name: "Write CRITERIA.md",
      description: "Define Must Have, Should Have, Nice to Have criteria with acceptance tests for each.",
      type: "decision",
    },
    {
      id: "estimate-timeline",
      name: "Estimate build timeline",
      description: "Break the build into sprints. Estimate effort per component. Set milestones.",
      type: "analysis",
    },
  ],

  build: [
    {
      id: "scaffold",
      name: "Set up project scaffolding",
      description: "Create repo structure, package.json, basic configs, CI/CD pipeline, hosting setup.",
      type: "build",
    },
    {
      id: "data-pipeline",
      name: "Build core data pipeline",
      description: "Data ingestion → processing → storage. Get real space data flowing.",
      type: "build",
    },
    {
      id: "ai-layer",
      name: "Build AI/ML layer",
      description: "Model selection, training/fine-tuning, inference pipeline. The AI brain of the product.",
      type: "build",
    },
    {
      id: "api",
      name: "Build API layer",
      description: "REST or GraphQL API exposing the product's capabilities. Auth, rate limiting, docs.",
      type: "build",
    },
    {
      id: "ui",
      name: "Build user interface",
      description: "Dashboard, visualizations, or CLI — whatever the product needs for users to interact with it.",
      type: "build",
    },
    {
      id: "test-deploy",
      name: "Test and deploy to staging",
      description: "Integration tests, load tests, security review. Deploy to staging environment.",
      type: "build",
    },
  ],

  launch: [
    {
      id: "deploy-prod",
      name: "Deploy to production",
      description: "Production deployment with monitoring, logging, alerts.",
      type: "build",
    },
    {
      id: "landing-page",
      name: "Create landing page",
      description: "Marketing site explaining what the product does, pricing, sign-up. SEO-optimized.",
      type: "build",
    },
    {
      id: "billing",
      name: "Set up billing",
      description: "Stripe integration, pricing tiers, free trial if applicable.",
      type: "build",
    },
    {
      id: "announce",
      name: "Announce the product",
      description: "Product Hunt, Hacker News, relevant subreddits, space industry forums, LinkedIn.",
      type: "marketing",
    },
    {
      id: "first-users",
      name: "Get first 10 users",
      description: "Reach out to the 10 target customers from validation. Get them onboarded.",
      type: "marketing",
    },
    {
      id: "feedback-loop",
      name: "Collect and act on feedback",
      description: "Track what users do, what they ask for, what frustrates them. Fix critical issues immediately.",
      type: "analysis",
    },
  ],

  mature: [
    {
      id: "iterate-features",
      name: "Iterate on features",
      description: "Add features users actually ask for. Remove what nobody uses.",
      type: "build",
    },
    {
      id: "optimize-pricing",
      name: "Optimize pricing",
      description: "A/B test pricing, add tiers, find the sweet spot between conversions and revenue.",
      type: "analysis",
    },
    {
      id: "growth-loops",
      name: "Build growth loops",
      description: "Referrals, content marketing, SEO, partnerships. Sustainable growth channels.",
      type: "marketing",
    },
    {
      id: "automate-ops",
      name: "Automate operations",
      description: "Reduce manual work. Auto-scaling, auto-monitoring, auto-billing. The product runs itself.",
      type: "build",
    },
    {
      id: "revenue-target",
      name: "Hit revenue target",
      description: "Track MRR, churn, NPS. Keep iterating until the product generates sustainable revenue.",
      type: "analysis",
    },
  ],
};

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function appendToJournal(entry) {
  const dir = path.dirname(JOURNAL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `\n## ${timestamp}\n${entry}\n`;
  fs.appendFileSync(JOURNAL_PATH, line);
}

class SpaceAIAgent extends EventEmitter {
  constructor() {
    super();
    this.state = this._loadState();
    this.isRunning = false;
  }

  _loadState() {
    const defaults = {
      phase: "discovery",
      phaseStartedAt: null,
      completedTasks: {},
      opportunities: [],
      selectedOpportunity: null,
      productConcept: null,
      marketSize: null,
      techStack: null,
      metrics: {
        users: 0,
        mrr: 0,
        churn: 0,
        nps: null,
      },
      totalCycles: 0,
      lastCycle: null,
      lastError: null,
      pivots: 0,
      createdAt: new Date().toISOString(),
    };

    const saved = readJson(STATE_PATH);
    return saved ? { ...defaults, ...saved } : defaults;
  }

  _saveState() {
    writeJson(STATE_PATH, this.state);
  }

  /**
   * Main agent cycle. Called by the engine on each run.
   * Returns the work plan for this cycle.
   */
  async run() {
    if (this.isRunning) {
      return { status: "already_running" };
    }

    this.isRunning = true;
    this.state.totalCycles++;
    this.state.lastCycle = new Date().toISOString();

    if (!this.state.phaseStartedAt) {
      this.state.phaseStartedAt = new Date().toISOString();
    }

    try {
      const phase = this.state.phase;
      const tasks = PHASE_TASKS[phase] || [];
      const pending = tasks.filter(t => !this.state.completedTasks[t.id]);

      this.emit("cycle-start", { phase, pending: pending.length, total: tasks.length });

      if (pending.length === 0) {
        // Check if we can graduate to next phase
        const canGraduate = this._checkGraduation();
        if (canGraduate) {
          const nextPhase = this._advancePhase();
          appendToJournal(`**PHASE COMPLETE: ${phase} → ${nextPhase}**\nAll tasks done. Advancing to next phase.`);
          this.isRunning = false;
          this._saveState();
          return {
            status: "phase_graduated",
            from: phase,
            to: nextPhase,
            message: `Graduated from ${phase} to ${nextPhase}`,
          };
        }
      }

      // Pick next task (max 2 per cycle to avoid long sessions)
      const workItems = pending.slice(0, 2);
      const results = [];

      for (const task of workItems) {
        this.emit("task-start", task);
        const plan = this._buildTaskPlan(task);
        results.push({ task: task.id, name: task.name, plan });
      }

      this.isRunning = false;
      this._saveState();

      return {
        status: "working",
        phase,
        progress: `${tasks.length - pending.length}/${tasks.length} tasks`,
        completionPct: Math.round(((tasks.length - pending.length) / tasks.length) * 100),
        currentWork: results,
        phaseAge: this._daysSince(this.state.phaseStartedAt),
      };
    } catch (error) {
      this.state.lastError = { message: error.message, at: new Date().toISOString() };
      this.isRunning = false;
      this._saveState();
      return { status: "error", message: error.message };
    }
  }

  /**
   * Mark a task as complete with output/findings
   */
  completeTask(taskId, output) {
    this.state.completedTasks[taskId] = {
      completedAt: new Date().toISOString(),
      output: typeof output === "string" ? output.slice(0, 500) : output,
    };
    this._saveState();

    appendToJournal(`**Task complete: ${taskId}**\n${typeof output === "string" ? output.slice(0, 300) : JSON.stringify(output).slice(0, 300)}`);

    this.emit("task-complete", { taskId, output });
    return { success: true, taskId };
  }

  /**
   * Record an opportunity during discovery
   */
  addOpportunity(opportunity) {
    // Tech novelty and derivative potential are weighted 2x
    const techNovelty = (opportunity.techNovelty || 0) * 2;
    const derivativePotential = (opportunity.derivativePotential || 0) * 2;
    const scored = {
      ...opportunity,
      totalScore: (opportunity.marketSize || 0) *
        (opportunity.painSeverity || 0) *
        (opportunity.feasibility || 0) *
        techNovelty *
        derivativePotential *
        (opportunity.uniqueness || 0),
      derivatives: opportunity.derivatives || [],
      coreTechnology: opportunity.coreTechnology || null,
      addedAt: new Date().toISOString(),
    };
    this.state.opportunities.push(scored);
    this.state.opportunities.sort((a, b) => b.totalScore - a.totalScore);
    this._saveState();

    appendToJournal(`**Opportunity found:** ${opportunity.name}\nScore: ${scored.totalScore}\n${opportunity.description || ""}`);

    return scored;
  }

  /**
   * Select the winning opportunity
   */
  selectOpportunity(index) {
    const opp = this.state.opportunities[index];
    if (!opp) return { error: "Invalid opportunity index" };

    this.state.selectedOpportunity = opp;
    this._saveState();

    appendToJournal(`**OPPORTUNITY SELECTED:** ${opp.name}\nScore: ${opp.totalScore}\n${opp.description || ""}`);

    return { selected: opp };
  }

  /**
   * Pivot — reset to a different phase if current approach isn't working
   */
  pivot(reason, resetToPhase = "discovery") {
    const oldPhase = this.state.phase;
    this.state.phase = resetToPhase;
    this.state.phaseStartedAt = new Date().toISOString();
    this.state.pivots++;

    // Clear task completions for the reset phase and all after it
    const resetIdx = PHASES.indexOf(resetToPhase);
    for (let i = resetIdx; i < PHASES.length; i++) {
      const phaseTasks = PHASE_TASKS[PHASES[i]] || [];
      for (const t of phaseTasks) {
        delete this.state.completedTasks[t.id];
      }
    }

    this._saveState();

    appendToJournal(`**PIVOT #${this.state.pivots}**\nFrom: ${oldPhase} → ${resetToPhase}\nReason: ${reason}`);

    return { pivoted: true, from: oldPhase, to: resetToPhase, reason, totalPivots: this.state.pivots };
  }

  /**
   * Update product metrics (during launch/mature phases)
   */
  updateMetrics(metrics) {
    this.state.metrics = { ...this.state.metrics, ...metrics };
    this._saveState();
    return this.state.metrics;
  }

  // === Task Plans ===

  _buildTaskPlan(task) {
    // Base plan that tells the executor what to do
    const plan = {
      taskId: task.id,
      name: task.name,
      type: task.type,
      description: task.description,
      phase: this.state.phase,
      context: {
        selectedOpportunity: this.state.selectedOpportunity,
        productConcept: this.state.productConcept,
        techStack: this.state.techStack,
        metrics: this.state.metrics,
      },
      outputFile: path.join(PROJECT_DIR, `${this.state.phase}`, `${task.id}.md`),
    };

    // Add type-specific instructions
    switch (task.type) {
      case "research":
        plan.instructions = [
          "Use web search to find current, authoritative sources",
          "Search YouTube for recent talks, interviews, and analysis",
          "Cross-reference multiple sources",
          "Save findings to the output file with sources cited",
          `Call completeTask("${task.id}", summary) when done`,
        ];
        plan.tools = ["web_search", "youtube_search", "fetch"];
        break;

      case "analysis":
        plan.instructions = [
          "Read all research files from previous tasks in this phase",
          "Synthesize findings into actionable analysis",
          "Include data tables, scores, or comparisons where appropriate",
          "Save analysis to the output file",
          `Call completeTask("${task.id}", summary) when done`,
        ];
        plan.tools = ["read", "write"];
        break;

      case "decision":
        plan.instructions = [
          "Review all research and analysis from this phase",
          "Make a clear, defensible decision with rationale",
          "Document trade-offs considered",
          "Save decision document to the output file",
          "This may require user input for high-risk decisions",
          `Call completeTask("${task.id}", decision) when done`,
        ];
        plan.tools = ["read", "write"];
        plan.mayRequireConfirmation = true;
        break;

      case "build":
        plan.instructions = [
          "Read the DESIGN.md and CRITERIA.md for requirements",
          "Write clean, production-quality code",
          "Test what you build",
          "Commit to the project directory",
          `Call completeTask("${task.id}", summary) when done`,
        ];
        plan.tools = ["read", "write", "bash"];
        break;

      case "marketing":
        plan.instructions = [
          "This requires user confirmation before any public-facing action",
          "Draft the content/message first",
          "Present to user for approval before publishing",
          `Call completeTask("${task.id}", summary) when done`,
        ];
        plan.tools = ["read", "write"];
        plan.requiresConfirmation = true;
        break;
    }

    return plan;
  }

  // === Phase Management ===

  _checkGraduation() {
    const phase = this.state.phase;
    const tasks = PHASE_TASKS[phase] || [];
    const allDone = tasks.every(t => this.state.completedTasks[t.id]);

    if (!allDone) return false;

    // Phase-specific graduation checks
    switch (phase) {
      case "discovery":
        return !!this.state.selectedOpportunity && !!this.state.selectedOpportunity.coreTechnology;
      case "validation":
        return !!this.state.productConcept && !!this.state.marketSize &&
          (this.state.selectedOpportunity?.derivatives?.length >= 3);
      case "design":
        return !!this.state.techStack;
      case "build":
        return true; // All tasks done = graduated
      case "launch":
        return this.state.metrics.users > 0;
      case "mature":
        return this.state.metrics.mrr > 0;
      default:
        return allDone;
    }
  }

  _advancePhase() {
    const currentIdx = PHASES.indexOf(this.state.phase);
    if (currentIdx < PHASES.length - 1) {
      this.state.phase = PHASES[currentIdx + 1];
      this.state.phaseStartedAt = new Date().toISOString();
      this._saveState();
    }
    return this.state.phase;
  }

  _daysSince(isoStr) {
    if (!isoStr) return 0;
    return Math.round((Date.now() - new Date(isoStr).getTime()) / (1000 * 60 * 60 * 24));
  }

  // === Status ===

  getStatus() {
    const phase = this.state.phase;
    const tasks = PHASE_TASKS[phase] || [];
    const completed = tasks.filter(t => this.state.completedTasks[t.id]).length;

    return {
      phase,
      phaseProgress: `${completed}/${tasks.length}`,
      completionPct: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
      phaseAge: `${this._daysSince(this.state.phaseStartedAt)} days`,
      totalCycles: this.state.totalCycles,
      pivots: this.state.pivots,
      selectedOpportunity: this.state.selectedOpportunity?.name || null,
      productConcept: this.state.productConcept,
      metrics: this.state.metrics,
      lastCycle: this.state.lastCycle,
      lastError: this.state.lastError,
      overallProgress: this._getOverallProgress(),
    };
  }

  _getOverallProgress() {
    let total = 0;
    let done = 0;
    for (const phase of PHASES) {
      const tasks = PHASE_TASKS[phase] || [];
      total += tasks.length;
      done += tasks.filter(t => this.state.completedTasks[t.id]).length;
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }

  getPhaseDetails() {
    return PHASES.map(phase => {
      const tasks = PHASE_TASKS[phase] || [];
      const completed = tasks.filter(t => this.state.completedTasks[t.id]);
      const isCurrent = this.state.phase === phase;
      const isPast = PHASES.indexOf(phase) < PHASES.indexOf(this.state.phase);

      return {
        phase,
        status: isCurrent ? "active" : isPast ? "complete" : "pending",
        tasks: tasks.length,
        completed: completed.length,
        pct: tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0,
        taskList: tasks.map(t => ({
          id: t.id,
          name: t.name,
          done: !!this.state.completedTasks[t.id],
          completedAt: this.state.completedTasks[t.id]?.completedAt || null,
        })),
      };
    });
  }

  getDisplayData() {
    return {
      ...this.getStatus(),
      phases: this.getPhaseDetails(),
      opportunities: this.state.opportunities.slice(0, 5),
      stateFile: STATE_PATH,
      journalFile: JOURNAL_PATH,
      projectDir: PROJECT_DIR,
    };
  }
}

// Singleton
let instance = null;
export function getSpaceAIAgent() {
  if (!instance) instance = new SpaceAIAgent();
  return instance;
}

export default SpaceAIAgent;
