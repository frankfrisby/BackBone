/**
 * Skill Gap Detector
 *
 * Jarvis-style system that analyzes projects, goals, and user requests
 * to detect when the AI needs new tools/skills it doesn't have.
 *
 * When a gap is detected:
 * 1. Creates a user skill (.md) describing HOW to do the task
 * 2. Optionally generates an MCP server if execution tooling is needed
 * 3. Registers the new MCP server in .mcp.json
 *
 * Think of skills as knowledge (how to do something) and MCP servers
 * as tools (the actual execution capability).
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { sendMessage } from "../ai/claude.js";

import { getDataDir, getProjectsDir, getEngineRoot, engineFile } from "../paths.js";
const DATA_DIR = getDataDir();
const SKILLS_DIR = path.join(DATA_DIR, "user-skills");
const SKILLS_INDEX = path.join(SKILLS_DIR, "index.json");
const MCP_DIR = path.join(getEngineRoot(), "src", "mcp");
const MCP_CONFIG_PATH = engineFile(".mcp.json");
const PROJECTS_DIR = getProjectsDir();
const GOALS_PATH = path.join(DATA_DIR, "goals.json");
const GAP_LOG_PATH = path.join(DATA_DIR, "skill-gaps.json");

// Built-in capabilities (skills + MCP servers already available)
const BUILTIN_CAPABILITIES = new Set([
  "trading", "portfolio", "stocks", "buy_stock", "sell_stock",
  "email", "gmail", "calendar", "events",
  "linkedin", "profile", "connections",
  "contacts", "directory",
  "news", "market_summary", "research",
  "goals", "beliefs", "backlog", "life_scores",
  "health", "sleep", "readiness", "activity", "oura",
  "projects", "workspace",
  "youtube", "video", "transcript",
  "voice", "phone", "call",
  "word", "excel", "spreadsheet", "powerpoint", "pdf",
  "web_scraping", "data_analysis", "database",
  "sms", "social_media", "image", "video_processing",
  "text_to_speech", "file_management", "api_integration",
  "task_automation", "calendar_scheduling",
  "disaster", "geopolitical", "economic_policy",
  "rare_earth", "academic_research", "market_research"
]);

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

class SkillGapDetector extends EventEmitter {
  constructor() {
    super();
    this.gapLog = this._loadGapLog();
    this.detectedGaps = [];
  }

  _loadGapLog() {
    return readJson(GAP_LOG_PATH) || {
      gaps: [],
      skillsCreated: [],
      mcpServersCreated: [],
      lastAnalysis: null
    };
  }

  _saveGapLog() {
    writeJson(GAP_LOG_PATH, this.gapLog);
  }

  /**
   * Analyze all goals and projects to find skill gaps
   * Returns an array of detected gaps with suggested solutions
   */
  async analyzeGaps() {
    const goals = readJson(GOALS_PATH) || { goals: [] };
    const projects = this._getProjects();
    const existingSkills = this._getExistingSkills();
    const existingMcpServers = this._getExistingMcpServers();

    // Build context of what we need vs what we have
    const context = {
      activeGoals: goals.goals.filter(g => g.status === "active" || g.status === "planning"),
      projects: projects.slice(0, 20),
      existingSkills: existingSkills.map(s => s.id),
      existingMcpServers: Object.keys(existingMcpServers),
      builtinCapabilities: Array.from(BUILTIN_CAPABILITIES)
    };

    if (context.activeGoals.length === 0 && context.projects.length === 0) {
      return { gaps: [], message: "No active goals or projects to analyze" };
    }

    // Use AI to detect gaps
    const prompt = this._buildGapDetectionPrompt(context);

    try {
      const response = await sendMessage([
        { role: "user", content: prompt }
      ], { maxTokens: 2000, temperature: 0.3 });

      if (!response?.content) return { gaps: [], message: "No response from AI" };

      const content = response.content;
      let result;
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        result = JSON.parse(content);
      }

      this.detectedGaps = result.gaps || [];
      this.gapLog.lastAnalysis = new Date().toISOString();
      this.gapLog.gaps = this.detectedGaps;
      this._saveGapLog();

      this.emit("gaps-detected", this.detectedGaps);
      return { gaps: this.detectedGaps, message: `Found ${this.detectedGaps.length} skill gaps` };
    } catch (error) {
      console.error("[SkillGapDetector] Analysis error:", error.message);
      return { gaps: [], message: error.message };
    }
  }

  /**
   * Create a user skill from a detected gap
   */
  async createSkillFromGap(gap) {
    const prompt = `Create a detailed user skill document for BACKBONE.

Skill needed: "${gap.skillName}"
Description: ${gap.description}
Related goals: ${gap.relatedGoals?.join(", ") || "general"}
Category: ${gap.category || "custom"}

Create a comprehensive markdown skill document with these sections:
# ${gap.skillName}

## Category
${gap.category || "custom"}

## Tags
(relevant tags)

## Description
(what this skill enables)

## When to Use
(clear criteria for when to apply this skill)

## Process
(step-by-step process with numbered steps)

## Decision Framework
(how to make decisions within this skill)

## My Preferences
(placeholder for user preferences)

## Examples
(2-3 practical examples)

## Required Tools
(list any MCP servers or tools needed)

Write the complete markdown content.`;

    try {
      const response = await sendMessage([
        { role: "user", content: prompt }
      ], { maxTokens: 2000, temperature: 0.3 });

      if (!response?.content) return null;

      const content = response.content;
      // Extract markdown content (remove code fences if present)
      const mdContent = content.replace(/^```(?:markdown|md)?\n?/m, "").replace(/\n?```$/m, "");

      // Create the skill
      const slug = gap.skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const skillPath = path.join(SKILLS_DIR, `${slug}.md`);

      if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
      fs.writeFileSync(skillPath, mdContent);

      // Update index
      const index = readJson(SKILLS_INDEX) || { skills: [], lastUpdated: null };
      const existing = index.skills.findIndex(s => s.id === slug);
      const entry = {
        id: slug,
        name: gap.skillName,
        description: gap.description,
        category: gap.category || "custom",
        tags: gap.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        usageCount: 0,
        lastUsedAt: null,
        source: "skill-gap-detector",
        relatedGoals: gap.relatedGoals || []
      };

      if (existing >= 0) {
        entry.version = (index.skills[existing].version || 0) + 1;
        index.skills[existing] = entry;
      } else {
        index.skills.push(entry);
      }
      index.lastUpdated = new Date().toISOString();
      writeJson(SKILLS_INDEX, index);

      // Log creation
      this.gapLog.skillsCreated.push({
        id: slug,
        name: gap.skillName,
        createdAt: new Date().toISOString(),
        fromGap: gap
      });
      this._saveGapLog();

      this.emit("skill-created", { id: slug, name: gap.skillName, path: skillPath });
      return { id: slug, name: gap.skillName, path: skillPath };
    } catch (error) {
      console.error("[SkillGapDetector] Skill creation error:", error.message);
      return null;
    }
  }

  /**
   * Generate an MCP server from a detected gap that needs execution tooling
   */
  async createMcpServerFromGap(gap) {
    if (!gap.needsMcpServer) return null;

    const serverName = `backbone-${gap.mcpServerSlug || gap.skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const serverFileName = `${gap.mcpServerSlug || gap.skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-server.js`;
    const serverPath = path.join(MCP_DIR, serverFileName);

    // Check if already exists
    if (fs.existsSync(serverPath)) {
      return { exists: true, serverName, path: serverPath };
    }

    const prompt = `Generate a complete MCP server for BACKBONE.

Server name: "${serverName}"
Purpose: ${gap.description}
Tools needed: ${JSON.stringify(gap.mcpTools || [])}

Follow this exact pattern (based on existing BACKBONE MCP servers):

\`\`\`javascript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDataDir, getProjectsDir } from "../paths.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOOLS = [
  // Define each tool with:
  // name, description, inputSchema (JSON Schema with properties and required)
];

const server = new Server(
  { name: "${serverName}", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      // Handle each tool
      default:
        return { content: [{ type: "text", text: JSON.stringify({ error: \`Unknown tool: \${name}\` }) }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: JSON.stringify({ error: error.message }) }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[${serverName}] MCP server running");
}
main().catch(console.error);
\`\`\`

Important:
- Use dynamic imports for any service dependencies
- Tools should be universal and reusable
- Each tool must have clear inputSchema with types and descriptions
- Include proper error handling
- Return JSON results

Generate the complete server code.`;

    try {
      const response = await sendMessage([
        { role: "user", content: prompt }
      ], { maxTokens: 3000, temperature: 0.2 });

      if (!response?.content) return null;

      let code = response.content;
      // Extract code from markdown fences
      const codeMatch = code.match(/```(?:javascript|js)?\n?([\s\S]*?)\n?```/);
      if (codeMatch) code = codeMatch[1];

      // Write the server file
      fs.writeFileSync(serverPath, code);

      // Register in .mcp.json
      const mcpConfig = readJson(MCP_CONFIG_PATH) || { mcpServers: {} };
      mcpConfig.mcpServers[serverName] = {
        command: "node",
        args: [`src/mcp/${serverFileName}`]
      };
      writeJson(MCP_CONFIG_PATH, mcpConfig);

      // Log creation
      this.gapLog.mcpServersCreated.push({
        name: serverName,
        file: serverFileName,
        createdAt: new Date().toISOString(),
        fromGap: gap
      });
      this._saveGapLog();

      this.emit("mcp-server-created", { name: serverName, path: serverPath });
      return { name: serverName, path: serverPath, file: serverFileName };
    } catch (error) {
      console.error("[SkillGapDetector] MCP server creation error:", error.message);
      return null;
    }
  }

  /**
   * Full pipeline: detect gaps, create skills, create MCP servers
   */
  async processGaps() {
    console.log("[SkillGapDetector] Starting gap analysis...");

    // 1. Detect gaps
    const analysis = await this.analyzeGaps();
    if (!analysis.gaps || analysis.gaps.length === 0) {
      console.log("[SkillGapDetector] No gaps detected");
      return { gaps: 0, skillsCreated: 0, serversCreated: 0 };
    }

    console.log(`[SkillGapDetector] Found ${analysis.gaps.length} gaps`);

    let skillsCreated = 0;
    let serversCreated = 0;

    // 2. Process each gap (max 3 per cycle)
    for (const gap of analysis.gaps.slice(0, 3)) {
      // Check if already created
      const existingSkill = this._skillExists(gap.skillName);
      if (existingSkill) {
        console.log(`[SkillGapDetector] Skill "${gap.skillName}" already exists, skipping`);
        continue;
      }

      // Create the skill
      const skill = await this.createSkillFromGap(gap);
      if (skill) {
        skillsCreated++;
        console.log(`[SkillGapDetector] Created skill: ${skill.name}`);
      }

      // Create MCP server if needed
      if (gap.needsMcpServer) {
        const server = await this.createMcpServerFromGap(gap);
        if (server && !server.exists) {
          serversCreated++;
          console.log(`[SkillGapDetector] Created MCP server: ${server.name}`);
        }
      }
    }

    return { gaps: analysis.gaps.length, skillsCreated, serversCreated };
  }

  // --- Private helpers ---

  _buildGapDetectionPrompt(context) {
    const goalsList = context.activeGoals.map(g =>
      `- ${g.title}: ${g.description || ""} (tasks: ${(g.tasks || []).join(", ")})`
    ).join("\n");

    const projectsList = context.projects.map(p =>
      `- ${p.name}: ${p.description?.slice(0, 100) || "no description"}`
    ).join("\n");

    return `You are analyzing a user's goals and projects to detect SKILL GAPS - capabilities the AI system doesn't have yet.

## Current Capabilities (already available)
Skills: ${context.existingSkills.join(", ") || "none"}
MCP Servers: ${context.existingMcpServers.join(", ")}
Built-in: ${context.builtinCapabilities.slice(0, 30).join(", ")}...

## User's Active Goals
${goalsList || "None"}

## User's Projects
${projectsList || "None"}

## Your Task

Identify 0-5 skill gaps where the AI NEEDS a new capability to help achieve these goals.

Rules:
- Only identify REAL gaps (things the system truly can't do yet)
- Skills should be UNIVERSAL (usable across many contexts, not one-off)
- MCP servers are needed when the skill requires API calls or external tool execution
- Don't duplicate existing capabilities
- Focus on high-impact, frequently-needed capabilities

Respond in JSON:
\`\`\`json
{
  "gaps": [
    {
      "skillName": "Human-readable skill name",
      "description": "What this skill/tool does and why it's needed",
      "category": "data|communication|automation|research|finance|development|media",
      "tags": ["tag1", "tag2"],
      "relatedGoals": ["goal title 1"],
      "needsMcpServer": true/false,
      "mcpServerSlug": "short-name-for-server",
      "mcpTools": [
        {"name": "tool_name", "description": "what it does"}
      ],
      "priority": "high|medium|low",
      "reasoning": "Why this gap matters"
    }
  ]
}
\`\`\`

If no real gaps exist, return empty gaps array. Be conservative - only flag genuine missing capabilities.`;
  }

  _getProjects() {
    const projects = [];
    try {
      if (!fs.existsSync(PROJECTS_DIR)) return projects;
      const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("."));

      for (const dir of dirs.slice(0, 20)) {
        const mdPath = path.join(PROJECTS_DIR, dir.name, "PROJECT.md");
        let description = "";
        try {
          if (fs.existsSync(mdPath)) {
            const content = fs.readFileSync(mdPath, "utf-8");
            const descMatch = content.match(/## (?:Description|Overview)\n+([\s\S]*?)(?:\n##|$)/i);
            description = descMatch ? descMatch[1].trim().slice(0, 200) : content.slice(0, 200);
          }
        } catch {}
        projects.push({ name: dir.name, description });
      }
    } catch {}
    return projects;
  }

  _getExistingSkills() {
    const index = readJson(SKILLS_INDEX);
    return index?.skills || [];
  }

  _getExistingMcpServers() {
    const config = readJson(MCP_CONFIG_PATH);
    return config?.mcpServers || {};
  }

  _skillExists(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return fs.existsSync(path.join(SKILLS_DIR, `${slug}.md`));
  }

  /**
   * Get display data
   */
  getDisplayData() {
    return {
      lastAnalysis: this.gapLog.lastAnalysis,
      gapsDetected: this.gapLog.gaps?.length || 0,
      skillsCreated: this.gapLog.skillsCreated?.length || 0,
      mcpServersCreated: this.gapLog.mcpServersCreated?.length || 0,
      recentGaps: (this.gapLog.gaps || []).slice(0, 5),
      recentSkills: (this.gapLog.skillsCreated || []).slice(-5)
    };
  }
}

// Singleton
let instance = null;
export const getSkillGapDetector = () => {
  if (!instance) instance = new SkillGapDetector();
  return instance;
};

export default SkillGapDetector;
