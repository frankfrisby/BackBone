/**
 * Skills Loader - Load skills from Claude repos and local files
 *
 * Supports two formats:
 *   1. Flat:      skills/<name>.md
 *   2. Directory: skills/<name>/SKILL.md  (Anthropic format)
 *
 * Both formats may include YAML frontmatter (name, description).
 */
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

import { getDataDir, getEngineRoot, getUserSkillsDir } from "../paths.js";
const DATA_DIR = getDataDir();
const SKILLS_DIR = path.join(getEngineRoot(), "skills");
const SKILLS_INDEX_PATH = path.join(DATA_DIR, "skills-index.json");
const USER_SKILLS_DIR = getUserSkillsDir();
const USER_SKILLS_INDEX_PATH = path.join(USER_SKILLS_DIR, "index.json");

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter: {name, description, ...}, body: "remaining markdown" }
 */
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { frontmatter: null, body: content };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: null, body: content };
  const yamlBlock = content.slice(4, end).trim();
  const fm = {};
  for (const line of yamlBlock.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[key] = val;
  }
  const body = content.slice(end + 4).trim();
  return { frontmatter: fm, body };
}

// IMPORTANT: Anthropic-only repos. Do NOT add non-Anthropic sources.
const SKILL_REPOS = [
  { name: "anthropics/courses", url: "https://api.github.com/repos/anthropics/courses/contents", description: "Anthropic official courses and tutorials" },
  { name: "anthropics/anthropic-cookbook", url: "https://api.github.com/repos/anthropics/anthropic-cookbook/contents", description: "Anthropic cookbook — patterns, examples, best practices" },
  { name: "anthropics/anthropic-quickstarts", url: "https://api.github.com/repos/anthropics/anthropic-quickstarts/contents", description: "Anthropic quickstart templates and guides" },
];

// Default skills that come bundled with the app
const DEFAULT_SKILLS = [
  // Office Suite
  { id: "word-document", name: "Word Document Creation", description: "Create professional Microsoft Word documents (.docx)", category: "Office" },
  { id: "excel-spreadsheet", name: "Excel Spreadsheet", description: "Create and manipulate Excel files (.xlsx)", category: "Office" },
  { id: "powerpoint-presentation", name: "PowerPoint Presentation", description: "Create PowerPoint presentations (.pptx)", category: "Office" },
  { id: "pdf-document", name: "PDF Document", description: "Create and manipulate PDF documents", category: "Office" },

  // Communication
  { id: "email-automation", name: "Email Automation", description: "Send emails programmatically via SMTP/Gmail", category: "Communication" },
  { id: "sms-messaging", name: "SMS Messaging", description: "Send SMS messages via Twilio", category: "Communication" },
  { id: "social-media", name: "Social Media Integration", description: "Post to Twitter, Facebook, LinkedIn", category: "Communication" },

  // AI & Voice
  { id: "claude-code-cli", name: "Claude Code CLI", description: "Use Claude Code CLI for AI-powered development", category: "AI" },
  { id: "elevenlabs-voice", name: "ElevenLabs Voice AI", description: "Generate realistic AI voices with ElevenLabs", category: "AI" },
  { id: "openai-platform", name: "OpenAI Platform", description: "Connect to OpenAI models (GPT-4, DALL-E, Whisper)", category: "AI" },

  // Data & Analysis
  { id: "web-scraping", name: "Web Scraping", description: "Extract data from websites", category: "Data" },
  { id: "data-analysis", name: "Data Analysis", description: "Analyze and visualize data with statistics", category: "Data" },
  { id: "database-operations", name: "Database Operations", description: "Work with SQLite, PostgreSQL, MongoDB", category: "Data" },

  // Research
  { id: "market-research", name: "Market Research", description: "Conduct market analysis, competitor research, consumer insights", category: "Research" },
  { id: "academic-research", name: "Academic Research", description: "Academic methodology, citations, literature review", category: "Research" },
  { id: "economic-policy", name: "Economic Policy", description: "Analyze economic indicators, monetary/fiscal policy", category: "Research" },
  { id: "geopolitical-analysis", name: "Geopolitical Analysis", description: "International relations, regional analysis, strategic assessment", category: "Research" },
  { id: "rare-earth-resources", name: "Rare Earth & Resources", description: "Critical minerals, supply chains, strategic resources", category: "Research" },
  { id: "disaster-assessment", name: "Disaster & Crisis Assessment", description: "15 threat domains: markets, credit, bonds, housing, geopolitical, jobs, food scarcity, energy, climate/storms, natural disasters, biological/pathogens, space/cosmic, AI/tech, societal, mass devastation", category: "Research" },

  // Media
  { id: "image-processing", name: "Image Processing", description: "Process and manipulate images", category: "Media" },
  { id: "video-processing", name: "Video Processing", description: "Process and manipulate videos with FFmpeg", category: "Media" },
  { id: "text-to-speech", name: "Text to Speech", description: "Convert text to audio", category: "Media" },

  // System & Development
  { id: "file-management", name: "File Management", description: "Manage files and directories", category: "System" },
  { id: "api-integration", name: "API Integration", description: "Integrate with external APIs and webhooks", category: "Development" },
  { id: "task-automation", name: "Task Automation", description: "Automate tasks with scheduling and workflows", category: "Automation" },
  { id: "calendar-scheduling", name: "Calendar & Scheduling", description: "Manage calendar events and scheduling", category: "Productivity" },

  // Meta
  { id: "skill-creator", name: "Skill Creator", description: "Create or update BACKBONE skills following the Anthropic skill format", category: "Meta" }
];

class SkillsLoader extends EventEmitter {
  constructor() {
    super();
    this.skills = new Map();
    this.loadedSkills = new Set();
    this.defaultSkills = new Map();
    this._loadIndex();
    this._ensureSkillsDir();
    this._registerDefaultSkills();
  }

  _ensureSkillsDir() {
    if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  _registerDefaultSkills() {
    for (const skill of DEFAULT_SKILLS) {
      // Check directory format first (skills/<id>/SKILL.md), then flat (skills/<id>.md)
      const dirPath = path.join(SKILLS_DIR, skill.id, "SKILL.md");
      const flatPath = path.join(SKILLS_DIR, `${skill.id}.md`);
      const useDirFormat = fs.existsSync(dirPath);
      const filepath = useDirFormat ? dirPath : flatPath;

      // If file exists, try to extract frontmatter description (better trigger matching)
      let description = skill.description;
      if (fs.existsSync(filepath)) {
        try {
          const content = fs.readFileSync(filepath, "utf-8");
          const { frontmatter } = parseFrontmatter(content);
          if (frontmatter?.description) description = frontmatter.description;
        } catch { /* keep default description */ }
      }

      this.defaultSkills.set(skill.id, {
        ...skill,
        description,
        filepath,
        dirFormat: useDirFormat,
        isDefault: true,
        isAvailable: fs.existsSync(filepath)
      });
    }
  }

  _loadIndex() {
    try {
      if (fs.existsSync(SKILLS_INDEX_PATH)) {
        const data = JSON.parse(fs.readFileSync(SKILLS_INDEX_PATH, "utf8"));
        if (data.skills) data.skills.forEach(s => this.skills.set(s.id, s));
      }
    } catch (e) { /* ignore */ }
  }

  _saveIndex() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SKILLS_INDEX_PATH, JSON.stringify({ skills: Array.from(this.skills.values()), lastUpdated: new Date().toISOString() }, null, 2));
    } catch (e) { /* ignore */ }
  }

  /**
   * Search Anthropic repos for skills matching a query.
   * Searches top-level items by name.
   */
  async searchOnlineSkills(query, maxResults = 20) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    for (const repo of SKILL_REPOS) {
      try {
        const response = await fetch(repo.url, { headers: { "User-Agent": "backbone-app" } });
        if (response.ok) {
          const items = await response.json();
          for (const item of items) {
            if (item.name.toLowerCase().includes(lowerQuery) || item.type === "dir") {
              results.push({
                name: item.name,
                repo: repo.name,
                repoDescription: repo.description,
                url: item.html_url,
                downloadUrl: item.download_url,
                type: item.type,
                size: item.size,
              });
            }
            if (results.length >= maxResults) break;
          }
        }
      } catch (e) { /* ignore */ }
    }
    return results;
  }

  /**
   * Deep search into a specific Anthropic repo directory.
   * Recursively lists contents to find .md, .py, .ipynb files.
   */
  async deepSearchRepo(repoName, dirPath = "", maxDepth = 2) {
    const repo = SKILL_REPOS.find(r => r.name === repoName);
    if (!repo) return [];

    const url = dirPath ? `${repo.url}/${dirPath}` : repo.url;
    const results = [];

    try {
      const response = await fetch(url, { headers: { "User-Agent": "backbone-app" } });
      if (!response.ok) return results;
      const items = await response.json();

      for (const item of items) {
        const fullPath = dirPath ? `${dirPath}/${item.name}` : item.name;
        if (item.type === "file" && /\.(md|py|ipynb|txt)$/i.test(item.name)) {
          results.push({
            name: item.name,
            path: fullPath,
            repo: repoName,
            url: item.html_url,
            downloadUrl: item.download_url,
            size: item.size,
          });
        } else if (item.type === "dir" && maxDepth > 0 && !item.name.startsWith(".")) {
          const subResults = await this.deepSearchRepo(repoName, fullPath, maxDepth - 1);
          results.push(...subResults);
        }
      }
    } catch (e) { /* ignore */ }

    return results;
  }

  /**
   * Download a skill file from an Anthropic repo and install it locally.
   */
  async downloadSkill(skillUrl, skillName) {
    // Verify URL is from an Anthropic repo
    if (!skillUrl.includes("anthropics/") && !skillUrl.includes("raw.githubusercontent.com/anthropics/")) {
      this.emit("skill:error", { skillName, error: "Only Anthropic repos are allowed" });
      return null;
    }

    try {
      const response = await fetch(skillUrl);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
      const content = await response.text();
      const slug = skillName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const filename = `${slug}.md`;
      const filepath = path.join(SKILLS_DIR, filename);
      fs.writeFileSync(filepath, content);
      const skill = {
        id: slug,
        name: skillName,
        filepath,
        downloadedAt: new Date().toISOString(),
        source: skillUrl,
        sourceType: "anthropic-repo",
      };
      this.skills.set(slug, skill);
      this._saveIndex();
      this.emit("skill:downloaded", { skill });
      return skill;
    } catch (e) {
      this.emit("skill:error", { skillName, error: e.message });
      return null;
    }
  }

  /**
   * Search and install: find a skill online, download the best match.
   * Convenience method combining search + download.
   */
  async searchAndInstall(query) {
    const results = await this.searchOnlineSkills(query, 5);
    const downloadable = results.filter(r => r.downloadUrl && r.type === "file");

    if (downloadable.length === 0) {
      // Try deep search in each repo
      for (const repo of SKILL_REPOS) {
        const deepResults = await this.deepSearchRepo(repo.name, "", 2);
        const matches = deepResults.filter(r =>
          r.name.toLowerCase().includes(query.toLowerCase()) ||
          r.path.toLowerCase().includes(query.toLowerCase())
        );
        if (matches.length > 0) {
          downloadable.push(...matches);
          break;
        }
      }
    }

    if (downloadable.length === 0) {
      return { installed: false, message: `No matching skills found in Anthropic repos for "${query}"`, searched: SKILL_REPOS.map(r => r.name) };
    }

    const best = downloadable[0];
    const skillName = best.name.replace(/\.(md|py|ipynb|txt)$/i, "");
    const skill = await this.downloadSkill(best.downloadUrl || best.url, skillName);

    if (skill) {
      return { installed: true, skill, source: best.repo, message: `Installed "${skillName}" from ${best.repo}` };
    }
    return { installed: false, message: "Download failed" };
  }

  /**
   * List all available Anthropic repos for browsing.
   */
  getAvailableRepos() {
    return SKILL_REPOS.map(r => ({ name: r.name, url: r.url, description: r.description }));
  }

  loadSkill(skillId) {
    const skill = this.skills.get(skillId);
    if (!skill || !fs.existsSync(skill.filepath)) return null;
    try {
      const content = fs.readFileSync(skill.filepath, "utf8");
      this.loadedSkills.add(skillId);
      this.emit("skill:loaded", { skillId, content });
      return content;
    } catch (e) { return null; }
  }

  getLocalSkills() {
    try {
      const results = [];
      const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          // Flat format: skills/<name>.md
          const filepath = path.join(SKILLS_DIR, entry.name);
          const id = entry.name.replace(".md", "");
          results.push({ id, name: id, filepath, isLocal: true });
        } else if (entry.isDirectory()) {
          // Directory format: skills/<name>/SKILL.md
          const skillMd = path.join(SKILLS_DIR, entry.name, "SKILL.md");
          if (fs.existsSync(skillMd)) {
            const id = entry.name;
            let name = id;
            let description = "";
            try {
              const content = fs.readFileSync(skillMd, "utf-8");
              const { frontmatter } = parseFrontmatter(content);
              if (frontmatter?.name) name = frontmatter.name;
              if (frontmatter?.description) description = frontmatter.description;
            } catch { /* ignore */ }
            results.push({ id, name, description, filepath: skillMd, dirFormat: true, isLocal: true });
          }
        }
      }
      return results;
    } catch (e) { return []; }
  }

  getAllSkills() {
    const allSkills = new Map();

    // Add default skills first
    for (const [id, skill] of this.defaultSkills) {
      allSkills.set(id, skill);
    }

    // Add downloaded/indexed skills
    for (const [id, skill] of this.skills) {
      allSkills.set(id, skill);
    }

    // Add any other local skills
    for (const skill of this.getLocalSkills()) {
      if (!allSkills.has(skill.id)) {
        allSkills.set(skill.id, skill);
      }
    }

    // Add user-defined custom skills
    for (const skill of this.getUserSkills()) {
      allSkills.set(`user:${skill.id}`, { ...skill, isUserSkill: true });
    }

    return Array.from(allSkills.values());
  }

  getDefaultSkills() {
    return Array.from(this.defaultSkills.values());
  }

  getSkillsByCategory(category) {
    return this.getAllSkills().filter(s => s.category === category);
  }

  getCategories() {
    const categories = new Set();
    this.getAllSkills().forEach(s => {
      if (s.category) categories.add(s.category);
    });
    return Array.from(categories);
  }

  isLoaded(skillId) { return this.loadedSkills.has(skillId); }
  unloadSkill(skillId) { this.loadedSkills.delete(skillId); this.emit("skill:unloaded", { skillId }); }

  // --- User Skills CRUD ---

  _ensureUserSkillsDir() {
    if (!fs.existsSync(USER_SKILLS_DIR)) fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
  }

  _loadUserSkillsIndex() {
    try {
      if (fs.existsSync(USER_SKILLS_INDEX_PATH)) {
        return JSON.parse(fs.readFileSync(USER_SKILLS_INDEX_PATH, "utf8"));
      }
    } catch (e) { /* ignore */ }
    return { skills: [], lastUpdated: new Date().toISOString() };
  }

  _saveUserSkillsIndex(index) {
    this._ensureUserSkillsDir();
    index.lastUpdated = new Date().toISOString();
    fs.writeFileSync(USER_SKILLS_INDEX_PATH, JSON.stringify(index, null, 2));
  }

  _slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  getUserSkills() {
    const index = this._loadUserSkillsIndex();
    return index.skills || [];
  }

  getUserSkillContent(skillId) {
    const filePath = path.join(USER_SKILLS_DIR, `${skillId}.md`);
    if (!fs.existsSync(filePath)) return null;
    try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
  }

  createUserSkill(name, content, metadata = {}) {
    this._ensureUserSkillsDir();
    const id = this._slugify(name);
    const filePath = path.join(USER_SKILLS_DIR, `${id}.md`);

    // Write markdown file
    fs.writeFileSync(filePath, content);

    // Update index
    const index = this._loadUserSkillsIndex();
    const existing = index.skills.findIndex(s => s.id === id);
    const entry = {
      id,
      name,
      description: metadata.description || "",
      category: metadata.category || "custom",
      tags: metadata.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      usageCount: 0,
      lastUsedAt: null
    };

    if (existing >= 0) {
      entry.createdAt = index.skills[existing].createdAt;
      entry.version = (index.skills[existing].version || 0) + 1;
      entry.usageCount = index.skills[existing].usageCount || 0;
      index.skills[existing] = entry;
    } else {
      index.skills.push(entry);
    }

    this._saveUserSkillsIndex(index);
    cachedCatalog = null; // bust cache
    this.emit("user-skill:created", { skill: entry });
    return entry;
  }

  updateUserSkill(skillId, content, metadata = {}) {
    const index = this._loadUserSkillsIndex();
    const idx = index.skills.findIndex(s => s.id === skillId);
    if (idx < 0) return null;

    if (content) {
      fs.writeFileSync(path.join(USER_SKILLS_DIR, `${skillId}.md`), content);
    }

    const entry = index.skills[idx];
    if (metadata.name) entry.name = metadata.name;
    if (metadata.description) entry.description = metadata.description;
    if (metadata.category) entry.category = metadata.category;
    if (metadata.tags) entry.tags = metadata.tags;
    entry.updatedAt = new Date().toISOString();
    entry.version = (entry.version || 0) + 1;

    this._saveUserSkillsIndex(index);
    cachedCatalog = null;
    this.emit("user-skill:updated", { skill: entry });
    return entry;
  }

  deleteUserSkill(skillId) {
    const index = this._loadUserSkillsIndex();
    const idx = index.skills.findIndex(s => s.id === skillId);
    if (idx < 0) return false;

    const removed = index.skills.splice(idx, 1)[0];
    const filePath = path.join(USER_SKILLS_DIR, `${skillId}.md`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    this._saveUserSkillsIndex(index);
    cachedCatalog = null;
    this.emit("user-skill:deleted", { skill: removed });
    return true;
  }

  recordSkillUsage(skillId) {
    const index = this._loadUserSkillsIndex();
    const entry = index.skills.find(s => s.id === skillId);
    if (!entry) return;
    entry.usageCount = (entry.usageCount || 0) + 1;
    entry.lastUsedAt = new Date().toISOString();
    this._saveUserSkillsIndex(index);
  }

  getDisplayData() {
    const skills = this.getAllSkills();
    const categories = {};

    skills.forEach(s => {
      const cat = s.category || "Other";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({
        id: s.id,
        name: s.name,
        description: s.description,
        loaded: this.loadedSkills.has(s.id),
        isDefault: s.isDefault || false,
        isAvailable: s.isAvailable !== false
      });
    });

    return {
      total: skills.length,
      loaded: this.loadedSkills.size,
      defaultCount: this.defaultSkills.size,
      categories,
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        loaded: this.loadedSkills.has(s.id),
        isDefault: s.isDefault || false
      }))
    };
  }
}

let instance = null;
export const getSkillsLoader = () => { if (!instance) instance = new SkillsLoader(); return instance; };
export default getSkillsLoader;

// --- Lightweight catalog functions for AI context injection ---

let cachedCatalog = null;

/**
 * Returns a compact skills catalog string for AI context.
 * One line per skill: "- name: description". Cached after first call.
 */
export function getSkillsCatalog() {
  if (cachedCatalog) return cachedCatalog;
  try {
    const sections = [];

    // System skills — scan both flat .md files and directory-based SKILL.md
    if (fs.existsSync(SKILLS_DIR)) {
      const lines = [];
      const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        let skillPath = null;
        let id = null;

        if (entry.isFile() && entry.name.endsWith(".md")) {
          id = entry.name.replace(/\.md$/, "");
          skillPath = path.join(SKILLS_DIR, entry.name);
        } else if (entry.isDirectory()) {
          const dirSkill = path.join(SKILLS_DIR, entry.name, "SKILL.md");
          if (fs.existsSync(dirSkill)) {
            id = entry.name;
            skillPath = dirSkill;
          }
        }

        if (!id || !skillPath) continue;
        try {
          const content = fs.readFileSync(skillPath, "utf-8");
          const { frontmatter } = parseFrontmatter(content);
          if (frontmatter?.description) {
            // Truncate long descriptions for catalog (first sentence or 120 chars)
            let desc = frontmatter.description;
            const firstSentence = desc.match(/^[^.!?]+[.!?]/);
            if (firstSentence && firstSentence[0].length < 150) desc = firstSentence[0];
            else if (desc.length > 150) desc = desc.slice(0, 147) + "...";
            lines.push(`- ${id}: ${desc}`);
          } else {
            const firstLine = content.split("\n").find(l => l.startsWith("# "));
            const desc = firstLine ? firstLine.replace(/^#\s*/, "").replace(/\s*Skill\s*$/, "") : id;
            lines.push(`- ${id}: ${desc}`);
          }
        } catch {
          lines.push(`- ${id}`);
        }
      }
      if (lines.length > 0) sections.push(`### System Skills\n${lines.join("\n")}`);
    }

    // User-defined custom skills
    if (fs.existsSync(USER_SKILLS_INDEX_PATH)) {
      try {
        const index = JSON.parse(fs.readFileSync(USER_SKILLS_INDEX_PATH, "utf-8"));
        if (index.skills && index.skills.length > 0) {
          const userLines = index.skills.map(s => {
            const tag = s.category ? ` [${s.category}]` : "";
            return `- ${s.id}: ${s.description || s.name}${tag}`;
          });
          sections.push(`### Your Custom Skills\n${userLines.join("\n")}`);
        }
      } catch { /* ignore */ }
    }

    if (sections.length === 0) return null;
    cachedCatalog = sections.join("\n\n");
    return cachedCatalog;
  } catch {
    return null;
  }
}

/**
 * Returns the full markdown content of a specific skill file.
 * Checks directory format (skills/<name>/SKILL.md) first, then flat (skills/<name>.md).
 */
export function getSkillContent(skillName) {
  try {
    // Directory format takes priority
    const dirPath = path.join(SKILLS_DIR, skillName, "SKILL.md");
    if (fs.existsSync(dirPath)) return fs.readFileSync(dirPath, "utf-8");
    // Flat format
    const flatPath = path.join(SKILLS_DIR, `${skillName}.md`);
    if (fs.existsSync(flatPath)) return fs.readFileSync(flatPath, "utf-8");
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns the path to a skill's directory (for accessing scripts/references/assets).
 * Returns null for flat-format skills.
 */
export function getSkillDir(skillName) {
  const dirPath = path.join(SKILLS_DIR, skillName);
  if (fs.existsSync(path.join(dirPath, "SKILL.md"))) return dirPath;
  return null;
}

/**
 * Parse frontmatter from a skill file. Exported for use by other modules.
 */
export { parseFrontmatter };

/**
 * Returns the full markdown content of a user-defined custom skill.
 */
export function getUserSkillContent(skillId) {
  try {
    const filePath = path.join(USER_SKILLS_DIR, `${skillId}.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
