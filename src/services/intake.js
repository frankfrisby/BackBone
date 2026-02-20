/**
 * Unified Intake — Single entry point for ALL work in BACKBONE
 *
 * 4-Level Router:
 *   1. QUERY   → Answer inline, no tracking. "What's the weather?" "How's my portfolio?"
 *   2. TASK    → Lightweight execution via Claude Code. No milestones. "Research blue birds."
 *   3. GOAL    → Full goal system with milestones + project. "Get healthier this month."
 *   4. BELIEF  → Permanent core belief. Never completes. "Build wealth."
 *
 * Also handles:
 *   - web_action  → Browser automation
 *   - follow_up   → Check on previous work
 *   - command      → System actions (enable/disable/schedule)
 *   - conversation → General chat (passthrough to AI)
 */

import fs from "fs";
import path from "path";
import { callTool, TOOL_MAP } from "./mcp-direct.js";
import { getWorkQueue } from "./work-queue.js";
import { getDataDir, getMemoryDir, getProjectsDir, dataFile } from "./paths.js";

const TAG = "[Intake]";

// ─── 4-Level Classification ─────────────────────────────────

/**
 * Classify intent into one of the 4 levels (or supporting types).
 *
 * Classification signals:
 *   QUERY: present-tense question, answerable in one tool call, no implied deliverable
 *   TASK:  verb implies work, has a deliverable, takes minutes-hours, specific request
 *   GOAL:  time-bounded outcome, days-weeks, has milestones, clear definition of done
 *   BELIEF: abstract, ongoing, identity-level, never "done"
 */
async function classify(content, context = {}) {
  const lower = content.toLowerCase().trim();

  // ── Greetings / very short ─────────────────────────────────
  const greetings = ["hey", "hi", "hello", "yo", "sup", "what's up", "good morning", "good evening", "gm", "thanks", "thank you", "ok", "okay", "cool", "nice", "lol", "haha", "yes", "no", "yep", "nah", "nope"];
  if (greetings.includes(lower) || lower.length < 4) {
    return { type: "conversation" };
  }

  // ── Web actions (browser automation) ───────────────────────
  const urlMatch = content.match(/https?:\/\/[^\s]+/i);
  const domainMatch = content.match(/\b([a-z0-9-]+\.(com|org|net|io|dev|ai|co|edu|gov|app|xyz|me))\b/i);
  const webActionRe = /\b(open|go\s*to|browse|visit|navigate|scrape|capture|look\s*at|pull\s*up|show\s*me|read.*from|log\s*into|sign\s*into)\b/i;
  const hasWebKeyword = webActionRe.test(lower);
  const hasSiteRef = /\b(website|site|page|url|browser|web)\b/i.test(lower) || !!domainMatch;

  if (urlMatch || (hasWebKeyword && domainMatch) || (hasWebKeyword && hasSiteRef)) {
    let url = urlMatch ? urlMatch[0] : null;
    if (!url && domainMatch) url = `https://${domainMatch[1]}`;
    if (!url) {
      const siteMap = {
        "yahoo finance": "https://finance.yahoo.com",
        "gmail": "https://mail.google.com",
        "outlook": "https://outlook.live.com",
        "hotmail": "https://outlook.live.com",
        "google": "https://www.google.com",
        "reddit": "https://www.reddit.com",
        "linkedin": "https://www.linkedin.com",
        "amazon": "https://www.amazon.com",
        "youtube": "https://www.youtube.com",
        "github": "https://github.com",
        "twitter": "https://twitter.com",
        "cnn": "https://www.cnn.com",
        "bloomberg": "https://www.bloomberg.com",
      };
      for (const [name, siteUrl] of Object.entries(siteMap)) {
        if (lower.includes(name)) { url = siteUrl; break; }
      }
    }
    return { type: "web_action", url, originalContent: content };
  }

  // ── Quick query patterns (QUERY level) ─────────────────────
  // These map directly to MCP tools — answer inline, no tracking
  const queryPatterns = [
    { re: /\b(net\s*worth|total\s*value|how\s*much.*worth)\b/i, tool: "get_total_brokerage_value" },
    { re: /\b(portfolio|positions?|stocks?|holdings?|investments?|what.*own|what.*hold)\b/i, tool: "get_positions" },
    { re: /\b(trading|alpaca|account\s*value|buying\s*power)\b/i, tool: "get_portfolio" },
    { re: /\b(sleep|readiness|activity|oura|health|how.*sleep|how.*feel)\b/i, tool: "get_health_summary" },
    { re: /\b(goals?|what.*working|priorities)\b/i, tool: "get_goals" },
    { re: /\b(life\s*scores?|dimensions?|scores?)\b/i, tool: "get_life_scores" },
    { re: /\b(thesis|focus|what.*focused)\b/i, tool: "get_thesis" },
    { re: /\b(recession|macro|economic)\b/i, tool: "get_recession_score" },
    { re: /\b(top\s*tickers?|best\s*stocks?|buy\s*signals?)\b/i, tool: "get_top_tickers" },
    { re: /\b(worst\s*tickers?|sell\s*signals?)\b/i, tool: "get_worst_tickers" },
    { re: /\b(calendar|events?|schedule|today|upcoming)\b/i, tool: "get_today_events" },
    { re: /\b(emails?|inbox|unread)\b/i, tool: "get_unread_count" },
    { re: /\bquote\s+(\w+)\b|price\s+(of\s+)?(\w+)/i, tool: "get_stock_quote" },
    { re: /\b(trade\s*history|recent\s*trades)\b/i, tool: "get_trade_history" },
    { re: /\b(convictions?|research\s*picks)\b/i, tool: "get_research_convictions" },
  ];

  for (const { re, tool } of queryPatterns) {
    if (re.test(lower)) {
      const args = {};
      if (tool === "get_stock_quote") {
        const sym = lower.match(/\bquote\s+(\w+)|price\s+(?:of\s+)?(\w+)/i);
        if (sym) args.symbol = (sym[1] || sym[2]).toUpperCase();
      }
      return { type: "query", toolName: tool, toolArgs: args };
    }
  }

  // ── Follow-up patterns ─────────────────────────────────────
  const followUpRe = /\b(how'?s\s*that|any\s*updates?|status\s*(?:on|of)|progress\s*on|what\s*happened\s*with|where.*stand|how.*going)\b/i;
  if (followUpRe.test(lower)) {
    const topic = content.replace(followUpRe, "").replace(/^[\s?.,]+|[\s?.,]+$/g, "").slice(0, 60);
    return { type: "follow_up", topic };
  }

  // ── Command patterns ───────────────────────────────────────
  const commandRe = /\b(turn\s*on|turn\s*off|enable|disable|schedule|set|remind|add.*calendar|delete.*calendar|cancel)\b/i;
  if (commandRe.test(lower)) {
    return { type: "command", action: lower };
  }

  // ── BELIEF level — abstract, ongoing, identity-level ───────
  // "I want to be healthier" "I believe in building wealth" "I care about family"
  const beliefRe = /\b(i\s+(believe|value|care\s+about|want\s+to\s+be|strive|aspire)|my\s+(mission|purpose|core\s+value)|always\s+(be|stay|keep))\b/i;
  if (beliefRe.test(lower) && lower.length > 20) {
    // Extract belief name
    const beliefTitle = content.replace(beliefRe, "").replace(/^[\s,]+|[\s,]+$/g, "").slice(0, 80) || content.slice(0, 80);
    return { type: "belief", beliefTitle };
  }

  // ── GOAL level — time-bounded, multi-day, outcome-oriented ─
  // Signals: explicit time references, "this week/month", measurable outcomes
  const goalTimeRe = /\b(this\s+(week|month|quarter|year)|by\s+(friday|monday|end\s+of|next|tomorrow)|within\s+\d|over\s+the\s+next|in\s+\d+\s*(days?|weeks?|months?))\b/i;
  const goalOutcomeRe = /\b(lose\s+\d+|gain\s+\d+|save\s+\$|earn\s+\$|run\s+\d+|read\s+\d+|complete\s+\d+|finish\s+(the|my|all)|achieve|accomplish|hit\s+\d+|reach\s+\d+)\b/i;
  const goalPlanRe = /\b(plan\s+(to|for|out)|set\s+a\s+goal|i\s+want\s+to\s+(start|begin|improve|grow)|make\s+a\s+plan|work\s+towards)\b/i;

  if (goalTimeRe.test(lower) || goalOutcomeRe.test(lower) || goalPlanRe.test(lower)) {
    const goalTitle = content.slice(0, 80);
    let category = guessCategory(lower);
    return { type: "goal", goalTitle, goalCategory: category };
  }

  // ── TASK level — actionable work with a deliverable ────────
  // "Research X" "Find info on Y" "Analyze Z" "Write a report on..."
  const taskRe = /\b(research|find|look\s*(?:up|into)|analyze|analyse|create|build|write|compare|investigate|review|summarize|calculate|dig\s*into|figure\s*out|check\s*(?:out|on)|get\s*me|help\s*me\s*with|send|draft|make\s*me|pull\s*together|put\s*together)\b/i;
  if (lower.length > 12 && taskRe.test(lower)) {
    const taskTitle = content.replace(taskRe, "").replace(/^[\s,]+|[\s,]+$/g, "").slice(0, 80) || content.slice(0, 80);
    let category = guessCategory(lower);
    // Detect delivery intent
    const deliveryAction = detectDeliveryAction(content);
    return { type: "task", taskTitle, taskCategory: category, deliveryAction };
  }

  // ── Default: conversation ──────────────────────────────────
  // Longer messages default to conversation (the AI will handle them)
  return { type: "conversation" };
}

/**
 * Guess category from message content.
 */
function guessCategory(lower) {
  if (/stock|invest|trading|portfolio|market|finance|money|budget|wealth/i.test(lower)) return "finance";
  if (/health|sleep|exercise|workout|diet|weight|run|gym/i.test(lower)) return "health";
  if (/career|job|resume|interview|linkedin|work|salary/i.test(lower)) return "career";
  if (/learn|course|study|book|read|education/i.test(lower)) return "learning";
  if (/family|wife|husband|kid|children|son|daughter|parent/i.test(lower)) return "personal";
  return "personal";
}

/**
 * Detect delivery intent from message text.
 */
function detectDeliveryAction(text) {
  const lower = (text || "").toLowerCase();
  if (/\b(email|e-mail)\s*(me|it|that|the|this|results?)?/i.test(lower)) return "email";
  if (/\b(write|create|generate)\s*(a\s+)?(report|document|doc|pdf|paper)/i.test(lower)) return "document";
  if (/\b(text|whatsapp|message|send)\s*(me|it|that|back)?/i.test(lower)) return "whatsapp";
  return "whatsapp"; // default
}

// ─── Format Quick Results ────────────────────────────────────

function formatQuickResult(toolName, result, question) {
  try {
    if (toolName === "get_positions" && Array.isArray(result)) {
      const positions = result.filter(p => p.marketValue);
      if (positions.length === 0) return "You don't have any open positions right now.";
      const lines = positions.map(p => {
        const pl = p.unrealizedPL >= 0 ? `+$${p.unrealizedPL?.toFixed(2)}` : `-$${Math.abs(p.unrealizedPL)?.toFixed(2)}`;
        return `• *${p.symbol}* — ${p.qty} shares @ $${p.currentPrice?.toFixed(2)} (${pl})`;
      });
      const totalValue = positions.reduce((s, p) => s + (p.marketValue || 0), 0);
      return `Here are your current positions:\n\n${lines.join("\n")}\n\n*Total positions value:* $${totalValue.toFixed(2)}`;
    }
    if (toolName === "get_portfolio") {
      return `*Portfolio Summary*\n• Account value: *$${result.totalAccountValue?.toFixed(2)}*\n• Cash: $${result.cash?.toFixed(2)}\n• Day change: ${result.dayChange >= 0 ? "+" : ""}$${result.dayChange?.toFixed(2)} (${result.dayChangePercent}%)\n• Mode: ${result.mode}`;
    }
    if (toolName === "get_health_summary") {
      const sleep = result.sleep;
      const readiness = result.readiness;
      const activity = result.activity;
      let msg = "*Health Summary*\n";
      if (sleep?.score) msg += `• Sleep: *${sleep.score}* `;
      if (readiness?.score) msg += `• Readiness: *${readiness.score}* `;
      if (activity?.score) msg += `• Activity: *${activity.score}*`;
      return msg.trim();
    }
    if (toolName === "get_goals" && Array.isArray(result)) {
      if (result.length === 0) return "No active goals right now.";
      const active = result.filter(g => g.status === "active" || !g.status).slice(0, 8);
      const lines = active.map(g => `• *${g.title}* (${g.category})`);
      return `*Your goals:*\n${lines.join("\n")}`;
    }
    if (toolName === "get_total_brokerage_value") {
      const nw = result.netWorth || result.totalValue || result.total;
      if (nw) return `Your net worth is *$${Number(nw).toLocaleString()}*`;
    }
    if (toolName === "get_recession_score") {
      const score = result.score ?? result;
      return `*Recession probability score:* ${score}/10`;
    }
    return JSON.stringify(result, null, 2).slice(0, 1000);
  } catch {
    return JSON.stringify(result, null, 2).slice(0, 1000);
  }
}

// ─── Route Handlers ──────────────────────────────────────────

/**
 * Handle QUERY — call MCP tool directly, format result. No tracking.
 */
async function handleQuery(classification, content) {
  const { toolName, toolArgs = {} } = classification;
  const mapping = TOOL_MAP[toolName];

  if (!mapping) return { type: "conversation", response: null };

  try {
    const result = await callTool(mapping.server, mapping.tool, toolArgs);
    const formatted = formatQuickResult(toolName, result, content);
    return { type: "query", response: formatted };
  } catch (err) {
    console.error(`${TAG} Query failed:`, err.message);
    return { type: "conversation", response: null };
  }
}

/**
 * Handle TASK — create lightweight task record, queue for Claude Code execution.
 * NO milestones, NO progress tracking, NO goal system involvement.
 */
async function handleTask(classification, content, from, source) {
  const { taskTitle, taskCategory = "personal", deliveryAction = "whatsapp" } = classification;
  const title = taskTitle || content.slice(0, 80);

  try {
    const { createTask } = await import("./engine/task-executor.js");

    const task = createTask({
      title,
      originalMessage: content,
      source,
      from,
      deliveryAction,
      category: taskCategory,
    });

    // Wake the engine to pick up this task
    try {
      const { getAutonomousEngine } = await import("./engine/autonomous-engine.js");
      const engine = getAutonomousEngine();
      if (engine && engine.isResting) {
        engine.wakeFromRest();
        console.log(`${TAG} Woke engine for task: ${task.id}`);
      }
    } catch {}

    const acks = [
      `On it. I'll ${title.toLowerCase().startsWith("research") ? "dig into" : "work on"} that and send you what I find.`,
      `Got it — working on "${title}" now. I'll report back.`,
      `On it. I'll get that done and send you results.`,
    ];
    return {
      type: "task",
      response: acks[Math.floor(Math.random() * acks.length)],
      taskId: task.id,
    };
  } catch (err) {
    console.error(`${TAG} Task creation failed:`, err.message);
    return { type: "task", response: "Got it — let me work on that." };
  }
}

/**
 * Handle GOAL — full goal system with milestones, project, engine integration.
 */
async function handleGoal(classification, content, from, source) {
  const { goalTitle, goalCategory = "personal" } = classification;
  const title = goalTitle || content.slice(0, 80);

  try {
    const { getGoalManager } = await import("./goals/goal-manager.js");
    const gm = getGoalManager();

    const newGoal = await gm.addGoal({
      title,
      category: goalCategory,
      priority: 1,
      source,
      from,
      description: `User goal: "${content}"`,
      originalMessage: content,
    }, false);

    if (newGoal) {
      newGoal.source = source;
      newGoal.from = from;
      newGoal.originalMessage = content;

      // Find or create project (reuses existing if same topic)
      try {
        const { getProjectManager } = await import("./projects/project-manager.js");
        const pm = getProjectManager();
        const project = await pm.createProjectForGoal(newGoal);
        if (project) newGoal.project = project.safeName || project.name;
      } catch {}

      // Wake engine
      try {
        const { getAutonomousEngine } = await import("./engine/autonomous-engine.js");
        const engine = getAutonomousEngine();
        if (engine && engine.isResting) engine.wakeFromRest();
      } catch {}

      return {
        type: "goal",
        response: `I've set a goal: *${title}*. I'll track progress and work on this over time.`,
        goalId: newGoal.id,
      };
    }
  } catch (err) {
    console.error(`${TAG} Goal creation failed:`, err.message);
  }

  return { type: "goal", response: "I've noted that goal. I'll work towards it." };
}

/**
 * Handle BELIEF — add to core beliefs, never completes.
 */
async function handleBelief(classification, content) {
  const { beliefTitle } = classification;

  try {
    const beliefsPath = dataFile("core-beliefs.json");
    let data = { beliefs: [] };
    try {
      if (fs.existsSync(beliefsPath)) {
        data = JSON.parse(fs.readFileSync(beliefsPath, "utf-8"));
      }
    } catch {}

    const beliefs = data.beliefs || data || [];
    beliefs.push({
      name: beliefTitle,
      description: content,
      createdAt: new Date().toISOString(),
    });

    fs.writeFileSync(beliefsPath, JSON.stringify({ beliefs }, null, 2));

    return {
      type: "belief",
      response: `Added to your core beliefs: *${beliefTitle}*. This will guide my decisions and goal suggestions going forward.`,
    };
  } catch (err) {
    console.error(`${TAG} Belief creation failed:`, err.message);
    return { type: "belief", response: "Noted — I'll keep that in mind going forward." };
  }
}

/**
 * Handle follow_up — load project findings, generate contextual response.
 */
async function handleFollowUp(classification, content) {
  const { topic } = classification;

  const { loadGoalsAndProjects, loadProjectFindings } = await import("./messaging/whatsapp-auto-work.js");
  const { goals, projects } = loadGoalsAndProjects();

  let findings = null;
  let matchedItem = null;

  const lowerTopic = (topic || content).toLowerCase();

  for (const g of goals) {
    if ((g.title || "").toLowerCase().includes(lowerTopic) ||
        lowerTopic.includes((g.title || "").toLowerCase().slice(0, 20))) {
      matchedItem = g;
      if (g.project) findings = loadProjectFindings(g.project);
      break;
    }
  }

  if (!matchedItem) {
    for (const p of projects) {
      if ((p.name || "").toLowerCase().includes(lowerTopic)) {
        matchedItem = p;
        findings = loadProjectFindings(p.id);
        break;
      }
    }
  }

  if (findings) {
    let summary = `*Update on "${matchedItem.title || matchedItem.name}":*\n\n`;
    if (findings.autoFindings) summary += findings.autoFindings.slice(0, 1000);
    else if (findings.workLog) summary += findings.workLog.slice(0, 800);
    else if (findings.research) summary += findings.research.map(r => r.summary).join("\n\n").slice(0, 800);
    return { type: "follow_up", response: summary.trim() };
  }

  return { type: "follow_up", response: "I don't have findings on that yet. Want me to look into it?" };
}

/**
 * Handle command — direct system actions.
 */
async function handleCommand(classification, content) {
  const { action } = classification;

  if (content.includes("calendar") || content.includes("schedule") || content.includes("remind")) {
    return { type: "command", response: null, passthrough: true };
  }

  if (action === "enable_auto_trading") {
    try {
      await callTool("backbone-trading", "enable_auto_trading", { enabled: true, mode: "paper" });
      return { type: "command", response: "Auto-trading enabled (paper mode)." };
    } catch (err) {
      return { type: "command", response: `Couldn't enable auto-trading: ${err.message}` };
    }
  }

  return { type: "command", response: null, passthrough: true };
}

/**
 * Handle web_action — browser automation.
 */
async function handleWebAction(classification, content, from, source) {
  const { originalContent } = classification;
  const request = originalContent || content;

  try {
    const { browserAgent } = await import("../../tools/browser-agent.js");

    const result = await browserAgent({
      request,
      autoApprove: true,
      onPlan: async (plan) => {
        console.log(`${TAG} Plan created for: ${plan.understanding}`);
        if (plan.riskyActions?.length > 0) return false;
        return true;
      },
      onStep: async (step) => {
        console.log(`${TAG} Step ${step.step}: ${step.action}`);
      },
    });

    if (result.success && result.result) {
      let response = typeof result.result === "string"
        ? result.result.slice(0, 1500)
        : JSON.stringify(result.result).slice(0, 1500);
      return { type: "web_action", response };
    }

    if (result.plan) {
      let response = "";
      if (result.plan.needsInfo?.length) {
        response = `I need a bit more info:\n\n`;
        result.plan.needsInfo.forEach(q => { response += `• ${q}\n`; });
      } else if (result.plan.riskyActions?.length) {
        response = `*Here's what I'd do:*\n\n_${result.plan.understanding}_\n\n`;
        response += `*Steps:*\n`;
        result.plan.steps?.forEach((s, i) => { response += `${i + 1}. ${s.detail}\n`; });
        response += `\n*This involves:*\n`;
        result.plan.riskyActions.forEach(a => { response += `• ${a}\n`; });
        response += `\nReply *"go ahead"* to proceed.`;
      } else {
        response = result.result || "I couldn't figure out how to do that.";
      }
      return { type: "web_action", response };
    }

    return { type: "web_action", response: result.result || "Couldn't complete that request." };
  } catch (err) {
    console.error(`${TAG} Browser agent failed:`, err.message);
    return { type: "web_action", response: `I couldn't do that right now: ${err.message}` };
  }
}

/**
 * Handle conversation — passthrough to full AI pipeline.
 */
async function handleConversation(content, context = {}) {
  return { type: "conversation", response: null, passthrough: true };
}

// ─── Main Entry Point ────────────────────────────────────────

/**
 * Process any input through the 4-level intake pipeline.
 *
 * @param {object} opts
 * @param {string} opts.source - "whatsapp" | "dashboard" | "engine" | "proactive"
 * @param {string} opts.content - The message/input text
 * @param {string} [opts.from] - Sender identifier (phone number for WhatsApp)
 * @param {Array}  [opts.mediaList] - Attached media (images)
 * @param {Function} [opts.replyFn] - Callback to send the reply
 * @returns {{ type, response, goalId?, taskId?, passthrough? }}
 */
export async function process({ source = "unknown", content, from, mediaList, replyFn } = {}) {
  if (!content || !content.trim()) {
    return { type: "empty", response: null };
  }

  const start = Date.now();
  console.log(`${TAG} Processing [${source}]: "${content.slice(0, 80)}"`);

  // Load active goals for context
  let activeGoals = [];
  try {
    const goalsRaw = JSON.parse(fs.readFileSync(dataFile("goals.json"), "utf-8"));
    activeGoals = (Array.isArray(goalsRaw) ? goalsRaw : goalsRaw?.goals || [])
      .filter(g => g.status === "active" || !g.status);
  } catch {}

  // Phase 1: Classify
  const classification = await classify(content, { activeGoals });
  const elapsed = Date.now() - start;
  console.log(`${TAG} Classified as "${classification.type}" in ${elapsed}ms`);

  // Phase 2: Route & Execute
  let result;
  switch (classification.type) {
    case "query":
      result = await handleQuery(classification, content);
      if (!result.response) result = await handleConversation(content);
      break;

    case "task":
      result = await handleTask(classification, content, from, source);
      break;

    case "goal":
      result = await handleGoal(classification, content, from, source);
      break;

    case "belief":
      result = await handleBelief(classification, content);
      break;

    case "web_action":
      result = await handleWebAction(classification, content, from, source);
      break;

    case "follow_up":
      result = await handleFollowUp(classification, content);
      break;

    case "command":
      result = await handleCommand(classification, content);
      break;

    case "conversation":
    default:
      result = await handleConversation(content);
      break;
  }

  // Send reply if handler produced one
  if (result.response && replyFn) {
    try {
      await replyFn(result.response);
    } catch (err) {
      console.error(`${TAG} replyFn error:`, err.message);
    }
  }

  const total = Date.now() - start;
  console.log(`${TAG} Done [${result.type}] in ${total}ms`);
  return result;
}

/**
 * Load project findings for a completed goal — used by engine for WhatsApp notification.
 */
export async function condenseFindingsForWhatsApp(projectName) {
  try {
    const { loadProjectFindings } = await import("./messaging/whatsapp-auto-work.js");
    const findings = loadProjectFindings(projectName);
    if (!findings) return null;

    const { sendMessage } = await import("./ai/multi-ai.js");
    const prompt = `Condense these project findings into a brief WhatsApp message (under 1200 chars).
Use *bold* for key points. Be conversational — "Hey, wrapped up that research — here's what I found:"

Findings:
${JSON.stringify(findings, null, 2).slice(0, 3000)}`;

    const result = await sendMessage(prompt, {}, "instant");
    return result?.response || result?.text || null;
  } catch {
    return null;
  }
}

export default { process, condenseFindingsForWhatsApp };
