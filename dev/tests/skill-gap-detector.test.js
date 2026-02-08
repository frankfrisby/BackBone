/**
 * Skill Gap Detector Tests
 * Validates the Jarvis-style skill gap detection and creation system
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SKILLS_DIR = path.join(DATA_DIR, "user-skills");
const SKILLS_INDEX = path.join(SKILLS_DIR, "index.json");
const MCP_DIR = path.join(process.cwd(), "src", "mcp");
const MCP_CONFIG_PATH = path.join(process.cwd(), ".mcp.json");
const GAP_LOG_PATH = path.join(DATA_DIR, "skill-gaps.json");
const SERVICE_PATH = path.join(process.cwd(), "src", "services", "skill-gap-detector.js");

// === STRUCTURE TESTS (no side effects) ===

describe("Skill Gap Detector - File Structure", () => {
  it("service file exists", () => {
    expect(fs.existsSync(SERVICE_PATH)).toBe(true);
  });

  it("exports getSkillGapDetector singleton", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("export const getSkillGapDetector");
    expect(content).toContain("if (!instance) instance = new SkillGapDetector()");
  });

  it("exports default SkillGapDetector class", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("export default SkillGapDetector");
    expect(content).toContain("class SkillGapDetector extends EventEmitter");
  });

  it("has analyzeGaps method", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("async analyzeGaps()");
  });

  it("has createSkillFromGap method", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("async createSkillFromGap(gap)");
  });

  it("has createMcpServerFromGap method", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("async createMcpServerFromGap(gap)");
  });

  it("has processGaps pipeline method", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("async processGaps()");
  });

  it("has getDisplayData method", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("getDisplayData()");
  });
});

describe("Skill Gap Detector - AI Integration", () => {
  it("uses sendMessage from claude.js", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain('import { sendMessage } from "./claude.js"');
    expect(content).toContain("await sendMessage(");
  });

  it("builds gap detection prompt with goals and projects", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("_buildGapDetectionPrompt(context)");
    expect(content).toContain("activeGoals");
    expect(content).toContain("existingSkills");
    expect(content).toContain("existingMcpServers");
    expect(content).toContain("builtinCapabilities");
  });

  it("parses JSON response from AI", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("JSON.parse");
    expect(content).toContain("jsonMatch");
  });

  it("emits events for gaps detected, skills created, and MCP servers created", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain('this.emit("gaps-detected"');
    expect(content).toContain('this.emit("skill-created"');
    expect(content).toContain('this.emit("mcp-server-created"');
  });
});

describe("Skill Gap Detector - Builtin Capabilities", () => {
  it("defines BUILTIN_CAPABILITIES set", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("BUILTIN_CAPABILITIES = new Set(");
  });

  it("includes trading capabilities", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain('"trading"');
    expect(content).toContain('"portfolio"');
    expect(content).toContain('"stocks"');
  });

  it("includes communication capabilities", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain('"email"');
    expect(content).toContain('"sms"');
    expect(content).toContain('"voice"');
  });

  it("includes health capabilities", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain('"health"');
    expect(content).toContain('"sleep"');
    expect(content).toContain('"oura"');
  });

  it("includes document capabilities", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain('"word"');
    expect(content).toContain('"excel"');
    expect(content).toContain('"pdf"');
  });
});

describe("Skill Gap Detector - Skill Creation", () => {
  it("creates skill files in data/user-skills/ directory", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("SKILLS_DIR");
    expect(content).toContain("user-skills");
    expect(content).toContain('fs.writeFileSync(skillPath, mdContent)');
  });

  it("generates slug from skill name", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain(".toLowerCase().replace(/[^a-z0-9]+/g");
  });

  it("updates skills index with new entries", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("SKILLS_INDEX");
    expect(content).toContain("index.skills.push(entry)");
  });

  it("tracks skill creation in gap log", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("this.gapLog.skillsCreated.push(");
  });

  it("checks for existing skills before creating duplicates", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("_skillExists(gap.skillName)");
    expect(content).toContain("already exists, skipping");
  });
});

describe("Skill Gap Detector - MCP Server Generation", () => {
  it("only creates MCP server when gap.needsMcpServer is true", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("if (!gap.needsMcpServer) return null");
  });

  it("generates server file in src/mcp/ directory", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("MCP_DIR");
    expect(content).toContain('path.join(MCP_DIR, serverFileName)');
  });

  it("registers new server in .mcp.json", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("MCP_CONFIG_PATH");
    expect(content).toContain('mcpConfig.mcpServers[serverName]');
  });

  it("checks if server already exists before creating", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("if (fs.existsSync(serverPath))");
    expect(content).toContain("exists: true");
  });

  it("follows MCP SDK server pattern in prompt", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("@modelcontextprotocol/sdk/server/index.js");
    expect(content).toContain("StdioServerTransport");
    expect(content).toContain("ListToolsRequestSchema");
    expect(content).toContain("CallToolRequestSchema");
  });

  it("tracks MCP server creation in gap log", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("this.gapLog.mcpServersCreated.push(");
  });
});

describe("Skill Gap Detector - Pipeline", () => {
  it("processGaps limits to 3 gaps per cycle", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("analysis.gaps.slice(0, 3)");
  });

  it("returns summary with counts", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("gaps: analysis.gaps.length, skillsCreated, serversCreated");
  });

  it("persists gap log to data/skill-gaps.json", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("GAP_LOG_PATH");
    expect(content).toContain("skill-gaps.json");
    expect(content).toContain("this._saveGapLog()");
  });
});

// === INTEGRATION WITH THINKING ENGINE ===

describe("Thinking Engine Integration", () => {
  const thinkingEnginePath = path.join(process.cwd(), "src", "services", "thinking-engine.js");

  it("thinking engine imports skill gap detector", () => {
    const content = fs.readFileSync(thinkingEnginePath, "utf-8");
    expect(content).toContain('import { getSkillGapDetector } from "./skill-gap-detector.js"');
  });

  it("thinking engine calls processGaps during cycle", () => {
    const content = fs.readFileSync(thinkingEnginePath, "utf-8");
    expect(content).toContain("getSkillGapDetector()");
    expect(content).toContain("skillGapDetector.processGaps()");
  });

  it("thinking engine handles skill gap errors gracefully", () => {
    const content = fs.readFileSync(thinkingEnginePath, "utf-8");
    expect(content).toContain("Skill gap detection error");
  });
});

// === INTEGRATION WITH IDLE PROCESSOR ===

describe("Idle Processor Integration", () => {
  const idleProcessorPath = path.join(process.cwd(), "src", "services", "idle-processor.js");

  it("idle processor imports skill gap detector", () => {
    const content = fs.readFileSync(idleProcessorPath, "utf-8");
    expect(content).toContain('import { getSkillGapDetector } from "./skill-gap-detector.js"');
  });

  it("idle processor has SKILL_GAP work type", () => {
    const content = fs.readFileSync(idleProcessorPath, "utf-8");
    expect(content).toContain('SKILL_GAP: "skill_gap"');
  });

  it("idle processor checks skill gap analysis timing", () => {
    const content = fs.readFileSync(idleProcessorPath, "utf-8");
    expect(content).toContain("hoursSinceAnalysis > 2");
    expect(content).toContain("Skill gap analysis needed");
  });

  it("idle processor has SKILL_GAP prompt", () => {
    const content = fs.readFileSync(idleProcessorPath, "utf-8");
    expect(content).toContain("case WORK_TYPES.SKILL_GAP:");
    expect(content).toContain("missing skills and tools");
  });

  it("idle processor has SKILL_GAP work description", () => {
    const content = fs.readFileSync(idleProcessorPath, "utf-8");
    expect(content).toContain("Analyzing skill gaps and building capabilities");
  });
});

// === DATA STRUCTURE VALIDATION ===

describe("Gap Log Data Structure", () => {
  it("initializes with correct structure", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("gaps: []");
    expect(content).toContain("skillsCreated: []");
    expect(content).toContain("mcpServersCreated: []");
    expect(content).toContain("lastAnalysis: null");
  });
});

describe("Skill Index Entry Structure", () => {
  it("creates entries with all required fields", () => {
    const content = fs.readFileSync(SERVICE_PATH, "utf-8");
    expect(content).toContain("id: slug");
    expect(content).toContain("name: gap.skillName");
    expect(content).toContain("description: gap.description");
    expect(content).toContain("category:");
    expect(content).toContain("tags:");
    expect(content).toContain("createdAt:");
    expect(content).toContain("version:");
    expect(content).toContain("usageCount: 0");
    expect(content).toContain('source: "skill-gap-detector"');
  });
});
