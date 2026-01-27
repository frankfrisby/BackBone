/**
 * Skills Loader - Load skills from Claude repos and local files
 */
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const DATA_DIR = path.join(process.cwd(), "data");
const SKILLS_DIR = path.join(process.cwd(), "skills");
const SKILLS_INDEX_PATH = path.join(DATA_DIR, "skills-index.json");

const SKILL_REPOS = [
  { name: "anthropics/courses", url: "https://api.github.com/repos/anthropics/courses/contents" },
  { name: "anthropics/anthropic-cookbook", url: "https://api.github.com/repos/anthropics/anthropic-cookbook/contents" }
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

  // Media
  { id: "image-processing", name: "Image Processing", description: "Process and manipulate images", category: "Media" },
  { id: "video-processing", name: "Video Processing", description: "Process and manipulate videos with FFmpeg", category: "Media" },
  { id: "text-to-speech", name: "Text to Speech", description: "Convert text to audio", category: "Media" },

  // System & Development
  { id: "file-management", name: "File Management", description: "Manage files and directories", category: "System" },
  { id: "api-integration", name: "API Integration", description: "Integrate with external APIs and webhooks", category: "Development" },
  { id: "task-automation", name: "Task Automation", description: "Automate tasks with scheduling and workflows", category: "Automation" },
  { id: "calendar-scheduling", name: "Calendar & Scheduling", description: "Manage calendar events and scheduling", category: "Productivity" }
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
      const filepath = path.join(SKILLS_DIR, `${skill.id}.md`);
      this.defaultSkills.set(skill.id, {
        ...skill,
        filepath,
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

  async searchOnlineSkills(query) {
    const results = [];
    for (const repo of SKILL_REPOS) {
      try {
        const response = await fetch(repo.url, { headers: { "User-Agent": "backbone-app" } });
        if (response.ok) {
          const items = await response.json();
          items.filter(i => i.name.toLowerCase().includes(query.toLowerCase()) || i.type === "dir")
            .forEach(i => results.push({ name: i.name, repo: repo.name, url: i.html_url, downloadUrl: i.download_url, type: i.type }));
        }
      } catch (e) { /* ignore */ }
    }
    return results;
  }

  async downloadSkill(skillUrl, skillName) {
    try {
      const response = await fetch(skillUrl);
      if (!response.ok) throw new Error("Failed to fetch");
      const content = await response.text();
      const filename = `${skillName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
      const filepath = path.join(SKILLS_DIR, filename);
      fs.writeFileSync(filepath, content);
      const skill = { id: skillName, name: skillName, filepath, downloadedAt: new Date().toISOString(), source: skillUrl };
      this.skills.set(skillName, skill);
      this._saveIndex();
      this.emit("skill:downloaded", { skill });
      return skill;
    } catch (e) {
      this.emit("skill:error", { skillName, error: e.message });
      return null;
    }
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
      return fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md")).map(f => {
        const filepath = path.join(SKILLS_DIR, f);
        const name = f.replace(".md", "");
        return { id: name, name, filepath, isLocal: true };
      });
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
    if (!fs.existsSync(SKILLS_DIR)) return null;
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md")).sort();
    if (files.length === 0) return null;
    const lines = files.map(f => {
      const name = f.replace(/\.md$/, "");
      try {
        const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
        const firstLine = content.split("\n").find(l => l.startsWith("# "));
        const desc = firstLine ? firstLine.replace(/^#\s*/, "").replace(/\s*Skill\s*$/, "") : name;
        return `- ${name}: ${desc}`;
      } catch {
        return `- ${name}`;
      }
    });
    cachedCatalog = lines.join("\n");
    return cachedCatalog;
  } catch {
    return null;
  }
}

/**
 * Returns the full markdown content of a specific skill file.
 */
export function getSkillContent(skillName) {
  try {
    const filePath = path.join(SKILLS_DIR, `${skillName}.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
