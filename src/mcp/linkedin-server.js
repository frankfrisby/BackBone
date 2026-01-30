import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";

/**
 * BACKBONE LinkedIn MCP Server
 * Provides tools for LinkedIn profile, posts, skills, education, and connections
 */

const DATA_DIR = path.join(process.cwd(), "data");
const LINKEDIN_DATA = path.join(DATA_DIR, "linkedin-profile.json");
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");

// Tool definitions
const TOOLS = [
  {
    name: "get_linkedin_profile",
    description: "Get the saved LinkedIn profile data",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "scrape_linkedin_profile",
    description: "Trigger a new LinkedIn profile scrape (opens browser)",
    inputSchema: {
      type: "object",
      properties: {
        waitForLogin: {
          type: "boolean",
          description: "Whether to wait for user to login if not already logged in",
        },
      },
      required: [],
    },
  },
  {
    name: "get_linkedin_messages",
    description: "Get recent LinkedIn messages (if available from last scrape)",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_linkedin_posts",
    description: "Get user's LinkedIn posts and reposts",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max posts to return (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_linkedin_skills",
    description: "Get skills and endorsements from LinkedIn profile",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_linkedin_education",
    description: "Get education and colleges from LinkedIn profile",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_linkedin_connections",
    description: "Get LinkedIn connection/contact list",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max connections to return (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "get_contact_profile",
    description: "Get profile details for a specific LinkedIn contact by name",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact name to look up" },
      },
      required: ["name"],
    },
  },
];

// === HELPERS ===

function loadLinkedInData() {
  try {
    if (fs.existsSync(LINKEDIN_DATA)) {
      return JSON.parse(fs.readFileSync(LINKEDIN_DATA, "utf-8"));
    }
  } catch {}
  return null;
}

function noDataResponse(hint) {
  return {
    error: "No LinkedIn profile data found",
    hint: hint || "Run /linkedin command to capture your profile",
  };
}

// === TOOL IMPLEMENTATIONS ===

function getLinkedInProfile() {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse();

    const screenshots = fs.existsSync(SCREENSHOTS_DIR)
      ? fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.startsWith("linkedin-"))
      : [];

    return {
      profile: data.profile,
      url: data.url,
      lastUpdated: data.capturedAt,
      screenshotAvailable: screenshots.length > 0,
      latestScreenshot: screenshots.length > 0 ? path.join(SCREENSHOTS_DIR, screenshots[screenshots.length - 1]) : null,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function scrapeLinkedInProfile(waitForLogin = true) {
  try {
    const existingData = getLinkedInProfile();

    return {
      message: "LinkedIn scraping requires browser interaction",
      instructions: "Use the /linkedin command in BACKBONE to scrape your profile",
      existingProfile: existingData.error ? null : existingData,
      command: "/linkedin",
    };
  } catch (error) {
    return { error: error.message };
  }
}

function getLinkedInMessages() {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse("Run /linkedin command first");

    if (!data.messages || data.messages.length === 0) {
      return {
        messages: [],
        message: "No messages captured. Messages require additional scraping.",
      };
    }

    return {
      messages: data.messages,
      count: data.messages.length,
      lastUpdated: data.capturedAt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function getLinkedInPosts(limit = 20) {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse();

    // Posts may come from profile data or a separate posts capture
    const posts = data.posts || data.profile?.posts || data.gpt4oAnalysis?.posts || [];

    if (!posts || posts.length === 0) {
      return {
        posts: [],
        message: "No posts captured. Posts require additional scraping via /linkedin.",
        hint: "Run /linkedin to capture posts data",
      };
    }

    return {
      posts: posts.slice(0, limit),
      total: posts.length,
      lastUpdated: data.capturedAt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function getLinkedInSkills() {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse();

    const profile = data.profile || data.gpt4oAnalysis || {};
    const skills = profile.skills || [];

    if (!skills || skills.length === 0) {
      return {
        skills: [],
        message: "No skills data found. Skills require profile scraping.",
      };
    }

    // Skills can be strings or objects with endorsement counts
    const formattedSkills = skills.map(s => {
      if (typeof s === "string") return { name: s, endorsements: null };
      return { name: s.name || s, endorsements: s.endorsements || s.count || null };
    });

    return {
      skills: formattedSkills,
      total: formattedSkills.length,
      lastUpdated: data.capturedAt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function getLinkedInEducation() {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse();

    const profile = data.profile || data.gpt4oAnalysis || {};
    const education = profile.education || [];

    if (!education || education.length === 0) {
      return {
        education: [],
        message: "No education data found. Education requires profile scraping.",
      };
    }

    return {
      education,
      total: education.length,
      lastUpdated: data.capturedAt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function getLinkedInConnections(limit = 50) {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse();

    const connections = data.connections || data.profile?.connections || [];

    if (!connections || connections.length === 0) {
      return {
        connections: [],
        message: "No connections data captured. Connections require additional scraping.",
        hint: "Run /linkedin to capture connections",
      };
    }

    return {
      connections: connections.slice(0, limit),
      total: connections.length,
      lastUpdated: data.capturedAt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function getContactProfile(name) {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse();

    const connections = data.connections || data.profile?.connections || [];
    const lower = name.toLowerCase();

    // Search connections by name
    const match = connections.find(c => {
      const cName = (c.name || c.fullName || "").toLowerCase();
      return cName === lower || cName.includes(lower);
    });

    if (!match) {
      return {
        error: `No connection found matching "${name}"`,
        hint: "Try a partial name or check connections list",
      };
    }

    return {
      contact: match,
      lastUpdated: data.capturedAt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

// === SERVER SETUP ===

const server = new Server(
  { name: "backbone-linkedin", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  switch (name) {
    case "get_linkedin_profile":
      result = getLinkedInProfile();
      break;
    case "scrape_linkedin_profile":
      result = await scrapeLinkedInProfile(args.waitForLogin);
      break;
    case "get_linkedin_messages":
      result = getLinkedInMessages();
      break;
    case "get_linkedin_posts":
      result = getLinkedInPosts(args.limit);
      break;
    case "get_linkedin_skills":
      result = getLinkedInSkills();
      break;
    case "get_linkedin_education":
      result = getLinkedInEducation();
      break;
    case "get_linkedin_connections":
      result = getLinkedInConnections(args.limit);
      break;
    case "get_contact_profile":
      result = getContactProfile(args.name);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE LinkedIn MCP Server running");
}

main().catch(console.error);
