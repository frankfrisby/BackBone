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
 * Provides tools for LinkedIn profile data
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
];

// Tool implementations
function getLinkedInProfile() {
  try {
    if (!fs.existsSync(LINKEDIN_DATA)) {
      return {
        error: "No LinkedIn profile data found",
        hint: "Run /linkedin command to capture your profile",
      };
    }

    const data = JSON.parse(fs.readFileSync(LINKEDIN_DATA, "utf-8"));

    // Check for screenshot
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
  // This would typically trigger the Playwright scraper
  // For MCP, we return instructions since browser automation
  // needs to run in a different context

  try {
    // Check if we have existing data
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
    if (!fs.existsSync(LINKEDIN_DATA)) {
      return {
        error: "No LinkedIn data found",
        hint: "Run /linkedin command first",
      };
    }

    const data = JSON.parse(fs.readFileSync(LINKEDIN_DATA, "utf-8"));

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

// Create server
const server = new Server(
  {
    name: "backbone-linkedin",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE LinkedIn MCP Server running");
}

main().catch(console.error);
