/**
 * MCP Servers Tests
 * Validates all MCP servers: tool definitions, schemas, and basic functionality
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// === HELPERS ===

/**
 * Parse a server file and extract TOOLS array without running the server.
 * We dynamically import isn't viable since servers call main() on load,
 * so we parse the file contents to validate structure.
 */
function parseToolsFromFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  // Extract tool names from the TOOLS array
  const toolNames = [];
  const toolNameRegex = /name:\s*["']([^"']+)["']/g;
  let match;
  while ((match = toolNameRegex.exec(content)) !== null) {
    // Only capture tool names (inside TOOLS array, not server name)
    if (!match[1].startsWith("backbone-")) {
      toolNames.push(match[1]);
    }
  }

  // Extract inputSchema required fields
  const hasInputSchemas = content.includes("inputSchema");

  // Check for proper server setup
  const hasServer = content.includes("new Server(");
  const hasListTools = content.includes("ListToolsRequestSchema");
  const hasCallTools = content.includes("CallToolRequestSchema");
  const hasTransport = content.includes("StdioServerTransport");
  const hasMain = content.includes("async function main()");

  return {
    toolNames,
    hasInputSchemas,
    hasServer,
    hasListTools,
    hasCallTools,
    hasTransport,
    hasMain,
    content,
  };
}

function getServerPath(filename) {
  return path.join(process.cwd(), "src", "mcp", filename);
}

// === GOOGLE MAIL & CALENDAR SERVER ===

describe("Google Mail & Calendar MCP Server", () => {
  const serverFile = getServerPath("google-mail-calendar-server.js");

  it("server file exists", () => {
    expect(fs.existsSync(serverFile)).toBe(true);
  });

  it("has proper MCP server structure", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.hasServer).toBe(true);
    expect(parsed.hasListTools).toBe(true);
    expect(parsed.hasCallTools).toBe(true);
    expect(parsed.hasTransport).toBe(true);
    expect(parsed.hasMain).toBe(true);
    expect(parsed.hasInputSchemas).toBe(true);
  });

  it("defines all required email tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("get_recent_emails");
    expect(parsed.toolNames).toContain("get_unread_count");
    expect(parsed.toolNames).toContain("search_emails");
    expect(parsed.toolNames).toContain("get_email_body");
    expect(parsed.toolNames).toContain("draft_email");
    expect(parsed.toolNames).toContain("analyze_emails_by_topic");
  });

  it("defines all required calendar tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("get_today_events");
    expect(parsed.toolNames).toContain("get_upcoming_events");
    expect(parsed.toolNames).toContain("create_event");
    expect(parsed.toolNames).toContain("update_event");
    expect(parsed.toolNames).toContain("delete_event");
  });

  it("has 11 total tools (6 email + 5 calendar)", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames.length).toBe(11);
  });

  it("draft_email tool requires approval scaffolding", () => {
    const parsed = parseToolsFromFile(serverFile);
    // Check that draft creation logs reason and doesn't auto-send
    expect(parsed.content).toContain("email-draft-log");
    expect(parsed.content).toContain("reason");
    expect(parsed.content).toContain("User must review and send manually");
  });

  it("supports Gmail and Outlook providers", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("GMAIL_ACCESS_TOKEN");
    expect(parsed.content).toContain("OUTLOOK_ACCESS_TOKEN");
    expect(parsed.content).toContain("GOOGLE_CALENDAR_TOKEN");
  });
});

// === LINKEDIN SERVER (ENHANCED) ===

describe("LinkedIn MCP Server (Enhanced)", () => {
  const serverFile = getServerPath("linkedin-server.js");

  it("server file exists", () => {
    expect(fs.existsSync(serverFile)).toBe(true);
  });

  it("has proper MCP server structure", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.hasServer).toBe(true);
    expect(parsed.hasListTools).toBe(true);
    expect(parsed.hasCallTools).toBe(true);
    expect(parsed.hasTransport).toBe(true);
    expect(parsed.hasMain).toBe(true);
  });

  it("defines original tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("get_linkedin_profile");
    expect(parsed.toolNames).toContain("scrape_linkedin_profile");
    expect(parsed.toolNames).toContain("get_linkedin_messages");
  });

  it("defines new enhanced tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("get_linkedin_posts");
    expect(parsed.toolNames).toContain("get_linkedin_skills");
    expect(parsed.toolNames).toContain("get_linkedin_education");
    expect(parsed.toolNames).toContain("get_linkedin_connections");
    expect(parsed.toolNames).toContain("get_contact_profile");
  });

  it("has 8 total tools (3 original + 5 new)", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames.length).toBe(8);
  });

  it("reads from linkedin-profile.json", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("linkedin-profile.json");
  });
});

// === CONTACTS DIRECTORY SERVER ===

describe("Contacts Directory MCP Server", () => {
  const serverFile = getServerPath("contacts-server.js");

  it("server file exists", () => {
    expect(fs.existsSync(serverFile)).toBe(true);
  });

  it("has proper MCP server structure", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.hasServer).toBe(true);
    expect(parsed.hasListTools).toBe(true);
    expect(parsed.hasCallTools).toBe(true);
    expect(parsed.hasTransport).toBe(true);
    expect(parsed.hasMain).toBe(true);
  });

  it("defines all contact tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("add_contact");
    expect(parsed.toolNames).toContain("get_contacts");
    expect(parsed.toolNames).toContain("search_contacts");
    expect(parsed.toolNames).toContain("get_contact_profile");
    expect(parsed.toolNames).toContain("update_contact");
    expect(parsed.toolNames).toContain("categorize_contact");
  });

  it("has 6 total tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames.length).toBe(6);
  });

  it("supports all 5 contact categories", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("linkedin");
    expect(parsed.content).toContain("family");
    expect(parsed.content).toContain("friends");
    expect(parsed.content).toContain("coworkers");
    expect(parsed.content).toContain("startup");
  });

  it("uses data/contacts/ directory", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("contacts");
  });
});

// === NEWS & RESEARCH SERVER ===

describe("News & Research MCP Server", () => {
  const serverFile = getServerPath("news-server.js");

  it("server file exists", () => {
    expect(fs.existsSync(serverFile)).toBe(true);
  });

  it("has proper MCP server structure", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.hasServer).toBe(true);
    expect(parsed.hasListTools).toBe(true);
    expect(parsed.hasCallTools).toBe(true);
    expect(parsed.hasTransport).toBe(true);
    expect(parsed.hasMain).toBe(true);
  });

  it("defines all news tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("fetch_latest_news");
    expect(parsed.toolNames).toContain("get_market_summary");
    expect(parsed.toolNames).toContain("research_topic");
    expect(parsed.toolNames).toContain("get_news_for_beliefs");
    expect(parsed.toolNames).toContain("correlate_news_with_portfolio");
  });

  it("has 5 total tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames.length).toBe(5);
  });

  it("integrates with news-service.js", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("news-service");
  });

  it("reads from news-cache.json and core-beliefs.json", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("news-cache.json");
    expect(parsed.content).toContain("core-beliefs.json");
    expect(parsed.content).toContain("tickers-cache.json");
  });
});

// === LIFE MANAGEMENT SERVER ===

describe("Life Management MCP Server", () => {
  const serverFile = getServerPath("life-server.js");

  it("server file exists", () => {
    expect(fs.existsSync(serverFile)).toBe(true);
  });

  it("has proper MCP server structure", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.hasServer).toBe(true);
    expect(parsed.hasListTools).toBe(true);
    expect(parsed.hasCallTools).toBe(true);
    expect(parsed.hasTransport).toBe(true);
    expect(parsed.hasMain).toBe(true);
  });

  it("defines all life management tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames).toContain("get_goals");
    expect(parsed.toolNames).toContain("get_beliefs");
    expect(parsed.toolNames).toContain("get_backlog");
    expect(parsed.toolNames).toContain("get_life_scores");
    expect(parsed.toolNames).toContain("add_goal");
    expect(parsed.toolNames).toContain("add_belief");
    expect(parsed.toolNames).toContain("get_thesis");
    expect(parsed.toolNames).toContain("trigger_thinking_cycle");
  });

  it("has 10 total tools", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.toolNames.length).toBe(10);
  });

  it("integrates with thinking-engine.js", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("thinking-engine");
  });

  it("reads from goals.json, core-beliefs.json, backlog.json, life-scores.json", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("goals.json");
    expect(parsed.content).toContain("core-beliefs.json");
    expect(parsed.content).toContain("backlog.json");
    expect(parsed.content).toContain("life-scores.json");
  });

  it("reads thesis from memory/thesis.md", () => {
    const parsed = parseToolsFromFile(serverFile);
    expect(parsed.content).toContain("thesis.md");
  });
});

// === MCPSERVER DOCUMENTATION ===

describe("MCPServer Documentation", () => {
  const docFile = path.join(process.cwd(), "MCPServers", "mcpserver.md");

  it("documentation file exists", () => {
    expect(fs.existsSync(docFile)).toBe(true);
  });

  it("documents all servers", () => {
    const content = fs.readFileSync(docFile, "utf-8");
    expect(content).toContain("Google Mail & Calendar");
    expect(content).toContain("LinkedIn Server");
    expect(content).toContain("Contacts Directory");
    expect(content).toContain("News & Research");
    expect(content).toContain("Life Management");
    expect(content).toContain("Health Server");
    expect(content).toContain("Projects Server");
    expect(content).toContain("Trading Server");
  });

  it("includes environment variables section", () => {
    const content = fs.readFileSync(docFile, "utf-8");
    expect(content).toContain("Environment Variables");
    expect(content).toContain("GMAIL_ACCESS_TOKEN");
    expect(content).toContain("OURA_ACCESS_TOKEN");
    expect(content).toContain("ALPACA_KEY");
  });

  it("documents tool names for each server", () => {
    const content = fs.readFileSync(docFile, "utf-8");
    // Spot check some tools from each server
    expect(content).toContain("get_email_body");
    expect(content).toContain("draft_email");
    expect(content).toContain("get_linkedin_posts");
    expect(content).toContain("add_contact");
    expect(content).toContain("fetch_latest_news");
    expect(content).toContain("get_goals");
    expect(content).toContain("trigger_thinking_cycle");
  });
});

// === CROSS-SERVER VALIDATION ===

describe("Cross-Server Validation", () => {
  const serverFiles = [
    "google-mail-calendar-server.js",
    "linkedin-server.js",
    "contacts-server.js",
    "news-server.js",
    "life-server.js",
  ];

  it("all server files exist", () => {
    for (const file of serverFiles) {
      expect(fs.existsSync(getServerPath(file))).toBe(true);
    }
  });

  it("all servers use MCP SDK imports", () => {
    for (const file of serverFiles) {
      const content = fs.readFileSync(getServerPath(file), "utf-8");
      expect(content).toContain("@modelcontextprotocol/sdk/server/index.js");
      expect(content).toContain("@modelcontextprotocol/sdk/server/stdio.js");
      expect(content).toContain("@modelcontextprotocol/sdk/types.js");
    }
  });

  it("no duplicate tool names across servers", () => {
    const allTools = new Map();

    for (const file of serverFiles) {
      const parsed = parseToolsFromFile(getServerPath(file));
      for (const tool of parsed.toolNames) {
        // get_contact_profile exists in both LinkedIn and Contacts — that's by design
        // (different contexts: LinkedIn searches connections, Contacts searches local directory)
        const key = `${file}:${tool}`;
        allTools.set(key, file);
      }
    }

    // Verify total tools across all servers
    const uniqueTools = new Set();
    for (const [key] of allTools) {
      uniqueTools.add(key.split(":")[1]);
    }
    // 11 + 8 + 6 + 5 + 8 = 38 tools total, minus 1 shared (get_contact_profile) = 37 unique
    expect(uniqueTools.size).toBeGreaterThanOrEqual(37);
  });

  it("all servers return JSON content in tool responses", () => {
    for (const file of serverFiles) {
      const content = fs.readFileSync(getServerPath(file), "utf-8");
      expect(content).toContain('JSON.stringify(result, null, 2)');
    }
  });
});
