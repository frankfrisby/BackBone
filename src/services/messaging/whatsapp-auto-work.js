/**
 * WhatsApp Auto-Work
 *
 * @deprecated Use src/services/intake.js instead. This module's functionality
 * has been subsumed by the unified intake pipeline:
 * - classifyWorkIntent() → replaced by LLM classification in intake.js
 * - startBackgroundWork() → replaced by goal creation + engine execution
 * - loadGoalsAndProjects() / loadProjectFindings() → still used by intake.js (re-exported)
 *
 * When the user asks about a goal or project via WhatsApp, this module:
 * 1. Detects the intent (goal inquiry, project question, research request)
 * 2. Matches it to an existing goal/project (or creates one)
 * 3. Kicks off background research using Claude Code CLI
 * 4. Saves findings to the project folder
 * 5. Sends a follow-up WhatsApp message with what it found
 *
 * The result: next time the user asks, there's real data — not vague answers.
 */

import fs from "fs";
import path from "path";
import { getDataDir, getMemoryDir, getProjectsDir } from "../paths.js";
import { bumpPriority, markFindingsReady } from "./work-priority.js";

const TAG = "[AutoWork]";

// Track active background work to avoid duplicate runs
const activeWork = new Map();

/**
 * Classify a WhatsApp message to see if it's about a goal or project
 * that we should start working on.
 *
 * Returns { type, match, shouldWork } or null if it's just casual chat.
 */
export function classifyWorkIntent(message, goals = [], projects = []) {
  const lower = message.toLowerCase().trim();

  // Skip very short messages or greetings
  if (lower.length < 5) return null;
  const greetings = ["hey", "hi", "hello", "yo", "sup", "thanks", "thank you", "ok", "okay", "cool", "nice", "good"];
  if (greetings.includes(lower)) return null;

  // Check for goal-related keywords
  const goalKeywords = [
    "goal", "goals", "progress", "how am i doing", "how's my",
    "milestone", "target", "on track", "status on", "update on",
    "working on", "what about my", "how far", "any progress"
  ];
  const isGoalQuery = goalKeywords.some(kw => lower.includes(kw));

  // Check for project-related keywords
  const projectKeywords = [
    "project", "research", "look into", "find out", "dig into",
    "investigate", "analyze", "analysis", "what do you know about",
    "what have you found", "any updates on", "status of"
  ];
  const isProjectQuery = projectKeywords.some(kw => lower.includes(kw));

  // Check for work/action-oriented language
  const actionKeywords = [
    "can you", "figure out", "help me with", "work on",
    "start on", "get me", "pull up", "run the numbers",
    "what's happening with", "check on", "look up", "find me"
  ];
  const isActionRequest = actionKeywords.some(kw => lower.includes(kw));

  if (!isGoalQuery && !isProjectQuery && !isActionRequest) {
    // Try fuzzy matching against actual goal/project names
    const matchedGoal = goals.find(g => {
      const gTitle = (g.title || "").toLowerCase();
      // Check if the message contains significant words from the goal title
      const goalWords = gTitle.split(/\s+/).filter(w => w.length > 3);
      return goalWords.some(w => lower.includes(w));
    });

    const matchedProject = projects.find(p => {
      const pName = (p.name || "").toLowerCase();
      const projectWords = pName.split(/\s+/).filter(w => w.length > 3);
      return projectWords.some(w => lower.includes(w));
    });

    if (matchedGoal) {
      return { type: "goal", match: matchedGoal, shouldWork: true };
    }
    if (matchedProject) {
      return { type: "project", match: matchedProject, shouldWork: true };
    }

    return null;
  }

  // Try to match to a specific goal
  const matchedGoal = goals.find(g => {
    const gTitle = (g.title || "").toLowerCase();
    const gCategory = (g.category || "").toLowerCase();
    return lower.includes(gTitle.slice(0, 20).toLowerCase()) ||
           (gCategory && lower.includes(gCategory));
  });

  if (matchedGoal) {
    return { type: "goal", match: matchedGoal, shouldWork: true };
  }

  // Try to match to a specific project
  const matchedProject = projects.find(p => {
    const pName = (p.name || "").toLowerCase();
    const words = pName.split(/\s+/).filter(w => w.length > 3);
    return words.some(w => lower.includes(w));
  });

  if (matchedProject) {
    return { type: "project", match: matchedProject, shouldWork: true };
  }

  // It's work-oriented but doesn't match existing items — new research topic
  return { type: "research", match: null, topic: message, shouldWork: true };
}

/**
 * Load current goals and projects for intent matching
 */
export function loadGoalsAndProjects() {
  const dataDir = getDataDir();
  const projectsDir = getProjectsDir();

  let goals = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "goals.json"), "utf-8"));
    goals = Array.isArray(raw) ? raw : (raw?.goals || []);
  } catch {}

  let projects = [];
  try {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const [datePart, slugPart] = d.name.split("__");
        return slugPart ? {
          id: d.name,
          name: slugPart.replace(/_/g, " "),
          path: path.join(projectsDir, d.name)
        } : null;
      })
      .filter(Boolean);
    projects = dirs;
  } catch {}

  return { goals, projects };
}

/**
 * Read existing findings from a project so the AI can use them in responses
 */
export function loadProjectFindings(projectId) {
  const projectsDir = getProjectsDir();
  const projectPath = path.join(projectsDir, projectId);
  const findings = {};

  // Read work.md
  try {
    const workPath = path.join(projectPath, "work.md");
    if (fs.existsSync(workPath)) {
      findings.workLog = fs.readFileSync(workPath, "utf-8").slice(0, 2000);
    }
  } catch {}

  // Read research.json
  try {
    const researchPath = path.join(projectPath, "research.json");
    if (fs.existsSync(researchPath)) {
      const data = JSON.parse(fs.readFileSync(researchPath, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        // Get the 3 most recent research entries
        findings.research = data.slice(0, 3).map(r => ({
          summary: (r.summary || r.content || "").slice(0, 500),
          savedAt: r.savedAt,
          source: r.source
        }));
      }
    }
  } catch {}

  // Read findings.md (our auto-work output)
  try {
    const findingsPath = path.join(projectPath, "findings.md");
    if (fs.existsSync(findingsPath)) {
      findings.autoFindings = fs.readFileSync(findingsPath, "utf-8").slice(0, 3000);
    }
  } catch {}

  // List images
  try {
    const imagesDir = path.join(projectPath, "images");
    if (fs.existsSync(imagesDir)) {
      const images = fs.readdirSync(imagesDir)
        .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
      if (images.length > 0) {
        findings.images = images;
      }
    }
  } catch {}

  return Object.keys(findings).length > 0 ? findings : null;
}

/**
 * Kick off background research on a goal/project.
 * Uses Claude Code CLI to do actual work, saves results, sends WhatsApp follow-up.
 *
 * @param {Object} intent - From classifyWorkIntent()
 * @param {string} originalMessage - The user's WhatsApp message
 * @param {string} from - User's phone number for WhatsApp reply
 */
export async function startBackgroundWork(intent, originalMessage, from) {
  const workKey = intent.match?.id || intent.topic || originalMessage.slice(0, 50);

  // Don't duplicate work that's already running
  if (activeWork.has(workKey)) {
    console.log(`${TAG} Work already in progress for: ${workKey}`);
    return;
  }

  activeWork.set(workKey, { startedAt: Date.now(), intent });
  console.log(`${TAG} Starting background work: ${intent.type} — "${workKey}"`);

  // Bump priority so the engine knows this is what the user cares about
  bumpPriority({
    type: intent.type,
    id: intent.match?.id || workKey,
    title: intent.match?.title || intent.match?.name || intent.topic || originalMessage.slice(0, 80),
    source: "whatsapp"
  });

  try {
    const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");
    const dataDir = getDataDir();
    const memoryDir = getMemoryDir();
    const projectsDir = getProjectsDir();

    // Build context for the research prompt
    let existingContext = "";
    let projectPath = null;

    if (intent.type === "goal" && intent.match) {
      existingContext = `GOAL: "${intent.match.title}" (${intent.match.category}, progress: ${intent.match.progress || 0}%)`;
      if (intent.match.project) {
        projectPath = path.join(projectsDir, intent.match.project);
      }
    } else if (intent.type === "project" && intent.match) {
      projectPath = intent.match.path || path.join(projectsDir, intent.match.id);
      existingContext = `PROJECT: "${intent.match.name}" at ${projectPath}`;

      // Load existing project data
      const findings = loadProjectFindings(intent.match.id);
      if (findings) {
        existingContext += `\n\nEXISTING FINDINGS:\n${JSON.stringify(findings, null, 2).slice(0, 2000)}`;
      }
    }

    // Load user context files
    let thesis = "";
    let portfolio = "";
    try { thesis = fs.readFileSync(path.join(memoryDir, "thesis.md"), "utf-8").slice(0, 500); } catch {}
    try { portfolio = fs.readFileSync(path.join(memoryDir, "portfolio.md"), "utf-8").slice(0, 500); } catch {}

    const prompt = `You are BACKBONE, working autonomously in the background. The user asked about something on WhatsApp and you need to do real research and produce actual findings.

USER'S MESSAGE: "${originalMessage}"

${existingContext}

${thesis ? `CURRENT THESIS:\n${thesis}\n` : ""}
${portfolio ? `PORTFOLIO CONTEXT:\n${portfolio}\n` : ""}

YOUR TASK:
MANDATORY: You MUST use tools to do this research. Do NOT answer from memory alone.
- Use WebSearch for current data, prices, news, comparisons
- Use Read to check existing user files in memory/ and data/
- Use Write to save your findings persistently
- Use MCP tools (backbone-trading, backbone-health, etc.) for live data
- Use Bash if you need to run any system commands

1. Research this topic thoroughly — use web search, check the user's data, analyze what you find
2. Produce concrete, actionable findings (not vague summaries)
3. Include specific numbers, dates, comparisons, or data points where possible
4. If this relates to a financial topic, check current prices/data
5. If this relates to a goal, check what progress has been made and what's next
6. Think about what the user would want to know NEXT and include that too

OUTPUT FORMAT:
Write your findings as a structured markdown document. Include:
- Key findings (the most important things)
- Data and numbers (specific, not vague)
- Recommended next steps
- Any risks or things to watch

Keep it under 3000 characters. Be thorough but concise.`;

    const result = await runClaudeCodePrompt(prompt, { timeout: 300000 }); // 5 min timeout

    if (result.success && result.output?.trim()) {
      const findings = result.output.trim();

      // Save findings to the project
      if (projectPath && fs.existsSync(projectPath)) {
        const findingsPath = path.join(projectPath, "findings.md");
        const header = `# Auto-Research Findings\n\nLast updated: ${new Date().toISOString()}\nTriggered by: "${originalMessage.slice(0, 100)}"\n\n---\n\n`;
        fs.writeFileSync(findingsPath, header + findings, "utf-8");

        // Also append to work.md
        const workPath = path.join(projectPath, "work.md");
        if (fs.existsSync(workPath)) {
          const date = new Date().toISOString().split("T")[0];
          const appendEntry = `\n- ${date}: Auto-research triggered by WhatsApp query. Findings saved to findings.md.\n`;
          fs.appendFileSync(workPath, appendEntry, "utf-8");
        }

        console.log(`${TAG} Findings saved to ${findingsPath}`);
        markFindingsReady(intent.match.id, findings.slice(0, 200));
      } else {
        // No project — save to a general research file
        const researchDir = path.join(dataDir, "auto-research");
        if (!fs.existsSync(researchDir)) fs.mkdirSync(researchDir, { recursive: true });
        const slug = originalMessage.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
        const researchPath = path.join(researchDir, `${slug}-${Date.now()}.md`);
        fs.writeFileSync(researchPath, findings, "utf-8");
        console.log(`${TAG} Findings saved to ${researchPath}`);
        markFindingsReady(slug, findings.slice(0, 200));
      }

      // Send WhatsApp follow-up with the key findings
      await sendFollowUpMessage(findings, from, intent);
    } else {
      console.log(`${TAG} Background work produced no output:`, result.error);
    }
  } catch (err) {
    console.error(`${TAG} Background work failed:`, err.message);
  } finally {
    activeWork.delete(workKey);
  }
}

/**
 * Send a condensed follow-up WhatsApp message with findings.
 * Not the full report — just the highlights so the user gets value.
 */
async function sendFollowUpMessage(fullFindings, from, intent) {
  try {
    const { getTwilioWhatsApp } = await import("./twilio-whatsapp.js");
    const { formatAIResponse } = await import("./whatsapp-formatter.js");
    const { getUnifiedMessageLog, MESSAGE_CHANNEL } = await import("./unified-message-log.js");

    const wa = getTwilioWhatsApp();
    if (!wa.initialized) {
      console.log(`${TAG} Twilio not initialized — skipping follow-up`);
      return;
    }

    // Condense the findings into a WhatsApp-friendly message
    // Use the first 1200 chars of findings, reformatted
    const { runClaudeCodePrompt } = await import("../ai/claude-code-cli.js");

    const condensePompt = `Take these research findings and write a WhatsApp follow-up message. You're updating the user on work you did in the background.

FINDINGS:
${fullFindings.slice(0, 2500)}

RULES:
- Start casually: "Hey, dug into that..." or "Circling back —" or "Got some findings on that"
- Hit the KEY points only (most important 3-5 things)
- Include specific numbers/data, not vague summaries
- Use WhatsApp formatting: *bold*, _italic_, bullet points
- Keep under 1400 characters total
- End with a question or next step suggestion
- Don't say "I researched" or "I found" too many times — just present the info naturally
- You can use ---MSG--- to split into 2 messages if needed (first: highlights, second: next steps)

Return ONLY the message text.`;

    const condenseResult = await runClaudeCodePrompt(condensePompt, { timeout: 90000 });

    let followUpText;
    if (condenseResult.success && condenseResult.output?.trim()) {
      followUpText = condenseResult.output.trim();
    } else {
      // Fallback: use the first few lines of findings
      const lines = fullFindings.split("\n").filter(l => l.trim() && !l.startsWith("#")).slice(0, 8);
      followUpText = `Hey, dug into that — here's what I found:\n\n${lines.join("\n").slice(0, 1200)}`;
    }

    // Split on ---MSG--- and send multiple messages
    const parts = followUpText.split(/---MSG---/i).map(m => m.trim()).filter(Boolean);

    const messageLog = getUnifiedMessageLog();

    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
      }
      const formatted = formatAIResponse(parts[i]);
      await wa.sendMessage(from, formatted);
      messageLog.addAssistantMessage(parts[i], MESSAGE_CHANNEL.WHATSAPP);
    }

    console.log(`${TAG} Follow-up sent (${parts.length} message${parts.length > 1 ? "s" : ""})`);

    // If there are project images, send the most recent one
    if (intent.match?.id) {
      try {
        const { getMostRecentImage, uploadProjectImage } = await import("../projects/project-images.js");
        const img = getMostRecentImage(intent.match.id);
        if (img) {
          const { url } = await uploadProjectImage(intent.match.id, img.filename);
          if (url) {
            await wa.sendMediaMessage(from, `_${img.filename}_`, url);
            console.log(`${TAG} Sent project image: ${img.filename}`);
          }
        }
      } catch (imgErr) {
        // Non-critical — just skip image
        console.log(`${TAG} Image send skipped: ${imgErr.message}`);
      }
    }
  } catch (err) {
    console.error(`${TAG} Follow-up message failed:`, err.message);
  }
}

/**
 * Get status of active background work
 */
export function getActiveWork() {
  return Array.from(activeWork.entries()).map(([key, val]) => ({
    key,
    startedAt: new Date(val.startedAt).toISOString(),
    type: val.intent?.type,
    runningMs: Date.now() - val.startedAt
  }));
}

export default {
  classifyWorkIntent,
  loadGoalsAndProjects,
  loadProjectFindings,
  startBackgroundWork,
  getActiveWork
};
