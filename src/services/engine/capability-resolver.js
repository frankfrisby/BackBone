/**
 * Capability Resolver — Smart fallback chain for finding and creating capabilities
 *
 * When the system needs to do something, the resolver:
 * 1. CHECK — Search existing tools (exact match by ID, then fuzzy by description)
 * 2. MATCH — Search skills (user skills first, then system skills)
 * 3. INSTALL — Search online skill repos and install if found
 * 4. FORGE — Use tool-forge to build a new tool from scratch
 * 5. REPORT — If all fail, report what's missing to the user
 *
 * Usage:
 *   const resolver = getCapabilityResolver();
 *   const result = await resolver.resolve("send a slack message");
 *   // { found: true, type: "tool", id: "send-alert", ... }
 *   // { found: true, type: "skill", id: "sms-messaging", content: "..." }
 *   // { found: true, type: "forged", id: "slack-notifier", ... }
 *   // { found: false, suggestions: [...] }
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";
import { listTools, getTool, loadIndex } from "../../../tools/tool-loader.js";
import { getSkillsLoader, getSkillContent, getUserSkillContent } from "../projects/skills-loader.js";
import { forge, detect, loadState } from "./tool-forge-agent.js";

const TAG = "[CapResolver]";
const DATA_DIR = getDataDir();
const MISSES_PATH = path.join(DATA_DIR, "capability-misses.json");

// ── Fuzzy matching helpers ──────────────────────────────────

/**
 * Tokenize a string into lowercase words, stripping punctuation.
 */
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1);
}

/**
 * Score how well `candidate` tokens overlap with `query` tokens.
 * Returns 0-1 where 1 = perfect match.
 * Exact token matches score 1.0, substring matches score 0.5 (min 4 chars).
 * Stopwords are excluded from scoring.
 */
const STOPWORDS = new Set(["the", "to", "is", "in", "it", "of", "and", "or", "for", "my", "me", "do", "an", "at", "on", "from", "with", "can", "get", "set", "use"]);

function fuzzyScore(query, candidate) {
  const qTokens = tokenize(query).filter(t => !STOPWORDS.has(t));
  const cTokens = tokenize(candidate).filter(t => !STOPWORDS.has(t));
  const cSet = new Set(cTokens);
  if (qTokens.length === 0 || cSet.size === 0) return 0;
  let score = 0;
  for (const t of qTokens) {
    if (cSet.has(t)) {
      score += 1.0; // exact match
    } else {
      // Substring match only if both tokens are 4+ chars
      let found = false;
      if (t.length >= 4) {
        for (const c of cSet) {
          if (c.length >= 4 && (c.includes(t) || t.includes(c))) { score += 0.5; found = true; break; }
        }
      }
    }
  }
  return score / qTokens.length;
}

// ── Misses persistence ──────────────────────────────────────

function loadMisses() {
  try {
    if (fs.existsSync(MISSES_PATH)) {
      return JSON.parse(fs.readFileSync(MISSES_PATH, "utf-8"));
    }
  } catch {}
  return { misses: [] };
}

function saveMisses(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // Keep last 200 misses
    if (data.misses.length > 200) data.misses = data.misses.slice(-200);
    fs.writeFileSync(MISSES_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`${TAG} Failed to save misses:`, err.message);
  }
}

// ── Capability Resolver ─────────────────────────────────────

class CapabilityResolver {
  constructor() {
    this._skillsLoader = null;
  }

  get skillsLoader() {
    if (!this._skillsLoader) this._skillsLoader = getSkillsLoader();
    return this._skillsLoader;
  }

  // ── Main entry ──────────────────────────────────────────

  /**
   * Resolve a capability need through the fallback chain.
   * @param {string} need - Description of what's needed (e.g., "send a slack message")
   * @param {Object} [context] - Optional context for forge phase { goalTitle, errorMessage, ... }
   * @returns {Promise<Object>} Resolution result
   */
  async resolve(need, context = {}) {
    if (!need || typeof need !== "string") {
      return { found: false, error: "Need must be a non-empty string" };
    }

    console.log(`${TAG} Resolving: "${need}"`);

    // Step 1: CHECK — existing tools
    const toolMatch = this.findTool(need);
    if (toolMatch) {
      console.log(`${TAG} Found tool: ${toolMatch.id}`);
      return { found: true, type: "tool", ...toolMatch };
    }

    // Step 2: MATCH — skills (user then system)
    const skillMatch = this.findSkill(need);
    if (skillMatch) {
      console.log(`${TAG} Found skill: ${skillMatch.id}`);
      return { found: true, type: "skill", ...skillMatch };
    }

    // Step 3: INSTALL — search online repos
    try {
      const installResult = await this.installSkill(need);
      if (installResult?.installed) {
        console.log(`${TAG} Installed skill from repo: ${installResult.skill.id}`);
        return {
          found: true,
          type: "installed-skill",
          id: installResult.skill.id,
          name: installResult.skill.name,
          source: installResult.source,
          message: installResult.message,
        };
      }
    } catch (err) {
      console.log(`${TAG} Online skill search failed: ${err.message}`);
    }

    // Step 4: FORGE — build a new tool
    try {
      const forgeResult = await this.forgeIfNeeded(need, context);
      if (forgeResult?.success) {
        console.log(`${TAG} Forged new tool: ${forgeResult.toolId}`);
        return {
          found: true,
          type: "forged",
          id: forgeResult.toolId,
          spec: forgeResult.spec,
        };
      }
    } catch (err) {
      console.log(`${TAG} Forge failed: ${err.message}`);
    }

    // Step 5: REPORT — nothing found
    console.log(`${TAG} No capability found for: "${need}"`);
    this.recordMiss(need, context);

    // Gather suggestions from partial matches
    const suggestions = this._gatherSuggestions(need);
    return { found: false, need, suggestions };
  }

  // ── Step 1: Tool search ─────────────────────────────────

  /**
   * Search tools by exact ID match, then fuzzy description match.
   * @param {string} need - What's needed
   * @returns {Object|null} { id, name, description, matchType, score }
   */
  findTool(need) {
    const needLower = need.toLowerCase().replace(/\s+/g, "-");
    const tools = listTools();

    // Exact ID match
    const exact = tools.find(t => t.id === needLower);
    if (exact) {
      return { id: exact.id, name: exact.name, description: exact.description, matchType: "exact" };
    }

    // Fuzzy match on name + description
    let best = null;
    let bestScore = 0;
    const THRESHOLD = 0.4;

    for (const tool of tools) {
      const corpus = `${tool.id} ${tool.name} ${tool.description}`;
      const score = fuzzyScore(need, corpus);
      if (score > bestScore && score >= THRESHOLD) {
        bestScore = score;
        best = tool;
      }
    }

    if (best) {
      return { id: best.id, name: best.name, description: best.description, matchType: "fuzzy", score: bestScore };
    }

    return null;
  }

  // ── Step 2: Skill search ────────────────────────────────

  /**
   * Search user skills first, then system skills.
   * Matches on id, name, tags, and description.
   * @param {string} need - What's needed
   * @returns {Object|null} { id, name, description, content, source }
   */
  findSkill(need) {
    const THRESHOLD = 0.4;

    // User skills first (priority)
    const userSkills = this.skillsLoader.getUserSkills();
    const userMatch = this._bestSkillMatch(need, userSkills, THRESHOLD);
    if (userMatch) {
      const content = getUserSkillContent(userMatch.skill.id);
      return {
        id: userMatch.skill.id,
        name: userMatch.skill.name || userMatch.skill.id,
        description: userMatch.skill.description || "",
        content,
        source: "user",
        score: userMatch.score,
      };
    }

    // System skills
    const allSkills = this.skillsLoader.getAllSkills().filter(s => !s.isUserSkill);
    const sysMatch = this._bestSkillMatch(need, allSkills, THRESHOLD);
    if (sysMatch) {
      const content = getSkillContent(sysMatch.skill.id);
      return {
        id: sysMatch.skill.id,
        name: sysMatch.skill.name || sysMatch.skill.id,
        description: sysMatch.skill.description || "",
        content,
        source: "system",
        score: sysMatch.score,
      };
    }

    return null;
  }

  /**
   * Find best matching skill from a list.
   */
  _bestSkillMatch(need, skills, threshold) {
    let best = null;
    let bestScore = 0;

    for (const skill of skills) {
      const corpus = [
        skill.id,
        skill.name,
        skill.description,
        ...(skill.tags || []),
        skill.category,
      ].filter(Boolean).join(" ");

      const score = fuzzyScore(need, corpus);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        best = skill;
      }
    }

    return best ? { skill: best, score: bestScore } : null;
  }

  // ── Step 3: Install from online repos ───────────────────

  /**
   * Search online skill repos and install if found.
   * @param {string} query - Search query
   * @returns {Promise<Object|null>} Install result
   */
  async installSkill(query) {
    return this.skillsLoader.searchAndInstall(query);
  }

  // ── Step 4: Forge a new tool ────────────────────────────

  /**
   * Trigger tool-forge agent to build a new tool.
   * @param {string} need - What's needed
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Forge result
   */
  async forgeIfNeeded(need, context = {}) {
    const forgeContext = {
      userRequest: need,
      goalTitle: context.goalTitle || need,
      goalOutput: context.goalOutput || "",
      errorMessage: context.errorMessage || "",
    };

    // Check if forge detects a need (it should, since we're explicitly asking)
    const detection = detect(forgeContext);
    if (!detection.needed) {
      // Force it — we already know we need something
      forgeContext.userRequest = `Build a tool to: ${need}`;
    }

    return forge(forgeContext);
  }

  // ── Capability inventory ────────────────────────────────

  /**
   * Returns full inventory of what the system can do.
   * @returns {Object} { tools, systemSkills, userSkills, agents, totals }
   */
  getCapabilityMap() {
    const tools = listTools();
    const allSkills = this.skillsLoader.getAllSkills();
    const userSkills = allSkills.filter(s => s.isUserSkill);
    const systemSkills = allSkills.filter(s => !s.isUserSkill);

    // Load agents if directory exists
    let agents = [];
    try {
      const agentsDir = path.join(path.dirname(DATA_DIR), "../../.agents");
      if (fs.existsSync(agentsDir)) {
        agents = fs.readdirSync(agentsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
      }
    } catch {}

    return {
      tools: tools.map(t => ({ id: t.id, name: t.name, description: t.description, category: t.category })),
      systemSkills: systemSkills.map(s => ({ id: s.id, name: s.name, description: s.description, category: s.category })),
      userSkills: userSkills.map(s => ({ id: s.id, name: s.name, description: s.description, category: s.category })),
      agents,
      totals: {
        tools: tools.length,
        systemSkills: systemSkills.length,
        userSkills: userSkills.length,
        agents: agents.length,
        total: tools.length + allSkills.length + agents.length,
      },
    };
  }

  // ── Health check ────────────────────────────────────────

  /**
   * Verify tools load correctly, skills are readable, forge agent works.
   * @returns {Object} Health status per subsystem
   */
  checkHealth() {
    const health = { tools: false, skills: false, forge: false, errors: [] };

    // Tools
    try {
      const tools = listTools();
      health.tools = tools.length > 0;
      if (!health.tools) health.errors.push("No tools found in index");
    } catch (err) {
      health.errors.push(`Tools: ${err.message}`);
    }

    // Skills
    try {
      const skills = this.skillsLoader.getAllSkills();
      health.skills = skills.length > 0;
      if (!health.skills) health.errors.push("No skills found");
    } catch (err) {
      health.errors.push(`Skills: ${err.message}`);
    }

    // Forge — if the top-level import succeeded, forge is available
    try {
      const state = loadState();
      health.forge = true;
      health.forgeStats = state.stats || {};
    } catch (err) {
      health.errors.push(`Forge: ${err.message}`);
    }

    health.healthy = health.tools && health.skills && health.forge;
    return health;
  }

  // ── Miss tracking ───────────────────────────────────────

  /**
   * Record a capability that was requested but not found.
   * @param {string} need - What was requested
   * @param {Object} context - Additional context
   */
  recordMiss(need, context = {}) {
    const data = loadMisses();
    data.misses.push({
      need,
      context: {
        goalTitle: context.goalTitle || null,
        errorMessage: context.errorMessage || null,
      },
      timestamp: new Date().toISOString(),
    });
    saveMisses(data);
    console.log(`${TAG} Recorded miss: "${need}"`);
  }

  /**
   * Get all recorded misses, optionally filtered by recency.
   * @param {number} [maxAgeHours] - Only return misses newer than this
   * @returns {Array} Misses
   */
  getMisses(maxAgeHours = null) {
    const data = loadMisses();
    if (!maxAgeHours) return data.misses;
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    return data.misses.filter(m => new Date(m.timestamp).getTime() > cutoff);
  }

  /**
   * Clear resolved misses (after a forge batch succeeds).
   * @param {string[]} resolvedNeeds - Needs that have been resolved
   */
  clearMisses(resolvedNeeds) {
    const resolved = new Set(resolvedNeeds.map(n => n.toLowerCase()));
    const data = loadMisses();
    data.misses = data.misses.filter(m => !resolved.has(m.need.toLowerCase()));
    saveMisses(data);
  }

  // ── Suggestions from partial matches ────────────────────

  /**
   * Gather partial matches from tools and skills as suggestions.
   */
  _gatherSuggestions(need) {
    const suggestions = [];
    const LOW_THRESHOLD = 0.2;

    // Partial tool matches
    for (const tool of listTools()) {
      const corpus = `${tool.id} ${tool.name} ${tool.description}`;
      const score = fuzzyScore(need, corpus);
      if (score >= LOW_THRESHOLD) {
        suggestions.push({ type: "tool", id: tool.id, name: tool.name, score });
      }
    }

    // Partial skill matches
    for (const skill of this.skillsLoader.getAllSkills()) {
      const corpus = [skill.id, skill.name, skill.description].filter(Boolean).join(" ");
      const score = fuzzyScore(need, corpus);
      if (score >= LOW_THRESHOLD) {
        suggestions.push({ type: "skill", id: skill.id, name: skill.name, score });
      }
    }

    // Sort by score descending, take top 5
    return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
  }
}

// ── Singleton ───────────────────────────────────────────────

let instance = null;

export function getCapabilityResolver() {
  if (!instance) instance = new CapabilityResolver();
  return instance;
}

export default getCapabilityResolver;
