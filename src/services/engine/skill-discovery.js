/**
 * Skill Discovery Service
 *
 * Observes engine actions and automatically discovers/creates skills.
 * When the AI does something new, it records the capability as a skill.
 * Notifies the user via WhatsApp when new skills are unlocked.
 *
 * Flow:
 *   1. Engine completes an action (research, build, trade, analyze, etc.)
 *   2. Skill discovery checks: "Is this a new capability?"
 *   3. If new → creates skill file in data/user-skills/
 *   4. Sends WhatsApp notification: "New skill unlocked: X"
 *   5. Explains what the skill enables
 *
 * Skills are biased toward UTILITY — only meaningful capabilities get tracked.
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../paths.js";

const DATA_DIR = getDataDir();
const SKILLS_DIR = path.join(DATA_DIR, "user-skills");
const SKILLS_INDEX_PATH = path.join(SKILLS_DIR, "index.json");
const DISCOVERY_LOG_PATH = path.join(DATA_DIR, "skill-discovery-log.json");

// Minimum actions before a pattern becomes a skill
const MIN_ACTIONS_FOR_SKILL = 2;

// Categories of discoverable skills
const SKILL_CATEGORIES = {
  research: "Research & Analysis",
  trading: "Trading & Finance",
  health: "Health & Wellness",
  communication: "Communication",
  automation: "Automation",
  data: "Data & Documents",
  integration: "Integrations",
  creative: "Creative & Content",
};

/**
 * Skill Discovery Engine
 */
class SkillDiscovery {
  constructor() {
    this.actionLog = this._loadActionLog();
    this.knownSkills = this._loadKnownSkills();
  }

  _loadActionLog() {
    try {
      if (fs.existsSync(DISCOVERY_LOG_PATH)) {
        return JSON.parse(fs.readFileSync(DISCOVERY_LOG_PATH, "utf-8"));
      }
    } catch {}
    return { actions: [], discoveredSkills: [], lastCheck: null };
  }

  _saveActionLog() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      // Keep last 500 actions
      this.actionLog.actions = this.actionLog.actions.slice(-500);
      fs.writeFileSync(DISCOVERY_LOG_PATH, JSON.stringify(this.actionLog, null, 2));
    } catch {}
  }

  _loadKnownSkills() {
    try {
      if (fs.existsSync(SKILLS_INDEX_PATH)) {
        return JSON.parse(fs.readFileSync(SKILLS_INDEX_PATH, "utf-8"));
      }
    } catch {}
    return { skills: [], lastUpdated: null };
  }

  _saveSkillIndex() {
    try {
      if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
      this.knownSkills.lastUpdated = new Date().toISOString();
      fs.writeFileSync(SKILLS_INDEX_PATH, JSON.stringify(this.knownSkills, null, 2));
    } catch {}
  }

  /**
   * Record an engine action for pattern detection.
   * Call this every time the engine does something meaningful.
   *
   * @param {string} actionType - e.g., "research", "trade", "analyze", "build", "notify"
   * @param {string} description - What was done
   * @param {Object} metadata - Additional context
   */
  recordAction(actionType, description, metadata = {}) {
    this.actionLog.actions.push({
      type: actionType,
      description,
      metadata,
      timestamp: new Date().toISOString(),
    });
    this._saveActionLog();

    // Check if this action reveals a new skill
    return this._checkForNewSkill(actionType, description, metadata);
  }

  /**
   * Check if recent actions reveal a new skill pattern.
   */
  _checkForNewSkill(actionType, description, metadata) {
    // Count how many times this action type has occurred
    const similarActions = this.actionLog.actions.filter(a => a.type === actionType);

    if (similarActions.length < MIN_ACTIONS_FOR_SKILL) return null;

    // Generate a skill slug from the action type
    const skillSlug = this._generateSkillSlug(actionType, description);

    // Check if already discovered
    if (this.actionLog.discoveredSkills.includes(skillSlug)) return null;

    // Check if a skill file already exists (system or user)
    const existingSkill = this.knownSkills.skills?.find(s => s.slug === skillSlug);
    if (existingSkill) return null;

    // New skill detected — create it
    const skill = this._createSkill(actionType, description, similarActions, metadata);
    if (skill) {
      this.actionLog.discoveredSkills.push(skillSlug);
      this._saveActionLog();
      return skill;
    }

    return null;
  }

  /**
   * Generate a slug for a potential skill.
   */
  _generateSkillSlug(actionType, description) {
    const base = actionType.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // Add context from description if useful
    const keywords = description.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 2)
      .join("-");
    return keywords ? `${base}-${keywords}` : base;
  }

  /**
   * Create a new skill file from observed actions.
   */
  _createSkill(actionType, description, similarActions, metadata) {
    const category = this._categorize(actionType);
    const slug = this._generateSkillSlug(actionType, description);
    const title = this._generateTitle(actionType, description);

    // Build the skill content from observed patterns
    const examples = similarActions.slice(-3).map(a =>
      `- ${a.description} (${new Date(a.timestamp).toLocaleDateString()})`
    ).join("\n");

    const skillContent = `# ${title}

## Category
${category}

## Tags
${actionType}, auto-discovered, ${metadata.tags?.join(", ") || "engine"}

## Description
${description}. This skill was automatically discovered by BACKBONE after observing repeated successful actions of this type.

## When to Use
- When the user or engine needs to ${actionType} similar tasks
- When a goal requires ${category.toLowerCase()} capabilities
- Automatically triggered by matching queries

## Process
1. Identify the task matching this skill pattern
2. Gather required context and data
3. Execute the action using established patterns
4. Verify results and report outcomes

## Recent Examples
${examples}

## My Preferences
- Prioritize accuracy over speed
- Use real data, never fabricate
- Report results concisely

## Discovery Info
- *Discovered:* ${new Date().toISOString()}
- *Action count:* ${similarActions.length} successful executions
- *Source:* Auto-discovered by engine observation
`;

    // Write skill file
    try {
      if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
      const filePath = path.join(SKILLS_DIR, `${slug}.md`);
      fs.writeFileSync(filePath, skillContent);

      // Update index
      const skillEntry = {
        slug,
        name: title,
        category,
        file: `${slug}.md`,
        autoDiscovered: true,
        discoveredAt: new Date().toISOString(),
        actionCount: similarActions.length,
        description: description.slice(0, 200),
      };

      if (!this.knownSkills.skills) this.knownSkills.skills = [];
      this.knownSkills.skills.push(skillEntry);
      this._saveSkillIndex();

      console.log(`[SkillDiscovery] New skill unlocked: ${title}`);

      return skillEntry;
    } catch (err) {
      console.error(`[SkillDiscovery] Failed to create skill:`, err.message);
      return null;
    }
  }

  /**
   * Categorize an action type.
   */
  _categorize(actionType) {
    const type = actionType.toLowerCase();
    if (type.includes("research") || type.includes("analyz") || type.includes("search")) return SKILL_CATEGORIES.research;
    if (type.includes("trade") || type.includes("buy") || type.includes("sell") || type.includes("portfolio")) return SKILL_CATEGORIES.trading;
    if (type.includes("health") || type.includes("sleep") || type.includes("oura")) return SKILL_CATEGORIES.health;
    if (type.includes("message") || type.includes("whatsapp") || type.includes("email") || type.includes("notify")) return SKILL_CATEGORIES.communication;
    if (type.includes("automat") || type.includes("schedule") || type.includes("cron")) return SKILL_CATEGORIES.automation;
    if (type.includes("excel") || type.includes("pdf") || type.includes("document") || type.includes("data")) return SKILL_CATEGORIES.data;
    if (type.includes("connect") || type.includes("integrat") || type.includes("api")) return SKILL_CATEGORIES.integration;
    return SKILL_CATEGORIES.creative;
  }

  /**
   * Generate a human-readable title from action type and description.
   */
  _generateTitle(actionType, description) {
    // Capitalize first letter of each word in actionType
    const typeTitle = actionType.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    return typeTitle;
  }

  /**
   * Notify the user about a newly discovered skill via WhatsApp.
   */
  async notifyNewSkill(skill) {
    try {
      const { getWhatsAppNotifications } = await import("../messaging/whatsapp-notifications.js");
      const notif = getWhatsAppNotifications();
      if (!notif.enabled) {
        try { await notif.initialize("default"); } catch {}
      }
      if (!notif.enabled) return;

      const msg = `*New Skill Unlocked* 🔓\n\n` +
        `*${skill.name}*\n` +
        `_${skill.category}_\n\n` +
        `${skill.description}\n\n` +
        `_Discovered after ${skill.actionCount} successful executions. ` +
        `I can now do this automatically when needed._`;

      await notif.send("breakthrough", msg, {
        identifier: `skill_${skill.slug}`,
        priority: 2,
      });
    } catch (err) {
      console.log(`[SkillDiscovery] WhatsApp notification failed:`, err.message);
    }
  }

  /**
   * Get all discovered skills with stats.
   */
  getDiscoveredSkills() {
    return {
      skills: this.knownSkills.skills?.filter(s => s.autoDiscovered) || [],
      totalActions: this.actionLog.actions.length,
      totalDiscovered: this.actionLog.discoveredSkills.length,
      lastCheck: this.actionLog.lastCheck,
    };
  }

  /**
   * Get skill capabilities summary for WhatsApp reporting.
   */
  getCapabilitiesSummary() {
    const skills = this.knownSkills.skills || [];
    const autoSkills = skills.filter(s => s.autoDiscovered);
    const systemSkills = skills.filter(s => !s.autoDiscovered);

    const byCategory = {};
    for (const s of autoSkills) {
      const cat = s.category || "Other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(s.name);
    }

    let summary = `*BACKBONE Capabilities*\n─────────────────\n`;
    summary += `📚 *${systemSkills.length}* system skills\n`;
    summary += `🔓 *${autoSkills.length}* discovered skills\n\n`;

    for (const [cat, names] of Object.entries(byCategory)) {
      summary += `*${cat}:*\n`;
      for (const name of names.slice(0, 5)) {
        summary += `  • ${name}\n`;
      }
    }

    return summary;
  }
}

// Singleton
let instance = null;

export function getSkillDiscovery() {
  if (!instance) {
    instance = new SkillDiscovery();
  }
  return instance;
}

export default SkillDiscovery;
