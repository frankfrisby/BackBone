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

class SkillsLoader extends EventEmitter {
  constructor() {
    super();
    this.skills = new Map();
    this.loadedSkills = new Set();
    this._loadIndex();
    this._ensureSkillsDir();
  }

  _ensureSkillsDir() {
    if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
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

  getAllSkills() { return [...Array.from(this.skills.values()), ...this.getLocalSkills().filter(s => !this.skills.has(s.id))]; }
  isLoaded(skillId) { return this.loadedSkills.has(skillId); }
  unloadSkill(skillId) { this.loadedSkills.delete(skillId); this.emit("skill:unloaded", { skillId }); }

  getDisplayData() {
    return { total: this.getAllSkills().length, loaded: this.loadedSkills.size, skills: this.getAllSkills().map(s => ({ id: s.id, name: s.name, loaded: this.loadedSkills.has(s.id) })) };
  }
}

let instance = null;
export const getSkillsLoader = () => { if (!instance) instance = new SkillsLoader(); return instance; };
export default getSkillsLoader;
