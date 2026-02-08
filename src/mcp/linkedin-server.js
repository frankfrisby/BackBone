import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { getDataDir, getScreenshotsDir } from "../services/paths.js";

/**
 * BACKBONE LinkedIn MCP Server
 * Provides tools for LinkedIn profile, posts, skills, education, and connections
 */

const DATA_DIR = getDataDir();
const LINKEDIN_DATA = path.join(DATA_DIR, "linkedin-profile.json");
const SCREENSHOTS_DIR = getScreenshotsDir();

// Valid profile sections for incremental updates
const VALID_SECTIONS = [
  "about", "experience", "education", "skills", "certifications",
  "languages", "featuredItems", "posts", "recommendations",
  "volunteerExperience", "connections",
];

// Tool definitions
const TOOLS = [
  {
    name: "get_linkedin_profile",
    description: "Get the saved LinkedIn profile data including completeness score and capture method",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "scrape_linkedin_profile",
    description:
      "Returns a structured browser automation plan for Claude-in-Chrome to scrape the user's LinkedIn profile. " +
      "The plan contains step-by-step instructions that Claude executes using browser tools (navigate, screenshot, " +
      "find, read_page, get_page_text). After extracting all data, call save_linkedin_profile_data to persist it.",
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
    name: "save_linkedin_profile_data",
    description:
      "Save structured LinkedIn profile data extracted via Claude-in-Chrome browser automation. " +
      "Computes a completeness score based on which sections have data. " +
      "Call this after executing the scrape_linkedin_profile automation plan.",
    inputSchema: {
      type: "object",
      properties: {
        profileUrl: { type: "string", description: "The LinkedIn profile URL (e.g. https://www.linkedin.com/in/username/)" },
        profile: {
          type: "object",
          description: "Structured profile data with fields: name, headline, location, connections, followers, about, currentRole, currentCompany, openToWork, isCreator, experience[], education[], skills[], certifications[], languages[], featuredItems[], posts[], recommendations[], volunteerExperience[], summary",
          properties: {
            name: { type: "string" },
            headline: { type: "string" },
            location: { type: "string" },
            connections: { type: "number" },
            followers: { type: "number" },
            about: { type: "string" },
            currentRole: { type: "string" },
            currentCompany: { type: "string" },
            openToWork: { type: "boolean" },
            isCreator: { type: "boolean" },
            experience: { type: "array", items: { type: "object" } },
            education: { type: "array", items: { type: "object" } },
            skills: { type: "array", items: { type: "object" } },
            certifications: { type: "array", items: { type: "object" } },
            languages: { type: "array", items: { type: "object" } },
            featuredItems: { type: "array", items: { type: "object" } },
            posts: { type: "array", items: { type: "object" } },
            recommendations: { type: "array", items: { type: "object" } },
            volunteerExperience: { type: "array", items: { type: "object" } },
            summary: { type: "string" },
          },
        },
      },
      required: ["profileUrl", "profile"],
    },
  },
  {
    name: "update_linkedin_section",
    description:
      "Incrementally update a single section of the saved LinkedIn profile without re-scraping everything. " +
      "Valid sections: about, experience, education, skills, certifications, languages, featuredItems, posts, " +
      "recommendations, volunteerExperience, connections.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          description: "The profile section to update",
          enum: VALID_SECTIONS,
        },
        data: {
          description: "The new data for this section (replaces existing section data)",
        },
      },
      required: ["section", "data"],
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

function computeCompleteness(profile) {
  if (!profile) return 0;
  const fields = [
    { key: "name", weight: 10 },
    { key: "headline", weight: 8 },
    { key: "location", weight: 5 },
    { key: "about", weight: 10 },
    { key: "currentRole", weight: 5 },
    { key: "currentCompany", weight: 5 },
    { key: "experience", weight: 15, isArray: true },
    { key: "education", weight: 10, isArray: true },
    { key: "skills", weight: 10, isArray: true },
    { key: "posts", weight: 8, isArray: true },
    { key: "certifications", weight: 4, isArray: true },
    { key: "languages", weight: 3, isArray: true },
    { key: "featuredItems", weight: 3, isArray: true },
    { key: "recommendations", weight: 2, isArray: true },
    { key: "volunteerExperience", weight: 2, isArray: true },
  ];
  let earned = 0;
  let total = 0;
  for (const f of fields) {
    total += f.weight;
    const val = profile[f.key];
    if (f.isArray) {
      if (Array.isArray(val) && val.length > 0) earned += f.weight;
    } else {
      if (val && String(val).trim().length > 0) earned += f.weight;
    }
  }
  return Math.round((earned / total) * 100);
}

function getLinkedInProfile() {
  try {
    const data = loadLinkedInData();
    if (!data) return noDataResponse();

    const screenshots = fs.existsSync(SCREENSHOTS_DIR)
      ? fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.startsWith("linkedin-"))
      : [];

    const profile = data.profile || data.gpt4oAnalysis || {};
    const completeness = data.completeness != null ? data.completeness : computeCompleteness(profile);
    const captureMethod = data.captureMethod || (data.rawData ? "playwright" : "unknown");

    return {
      profile,
      url: data.url || data.profileUrl,
      lastUpdated: data.capturedAt,
      completeness,
      captureMethod,
      screenshotAvailable: screenshots.length > 0,
      latestScreenshot: screenshots.length > 0 ? path.join(SCREENSHOTS_DIR, screenshots[screenshots.length - 1]) : null,
    };
  } catch (error) {
    return { error: error.message };
  }
}

async function scrapeLinkedInProfile(waitForLogin = true) {
  try {
    const existingData = loadLinkedInData();
    const existingUrl = existingData?.url || existingData?.profileUrl || null;

    return {
      method: "claude-in-chrome",
      message:
        "Execute this automation plan step-by-step using Claude-in-Chrome browser tools. " +
        "After extracting all data, call save_linkedin_profile_data with the compiled results.",
      existingProfileUrl: existingUrl,
      waitForLogin,
      plan: [
        {
          step: 1,
          action: "setup",
          description: "Get browser tab context and create a new tab for scraping",
          tools: ["tabs_context_mcp", "tabs_create_mcp"],
          instructions:
            "Call tabs_context_mcp to get available tabs. Then create a new tab with tabs_create_mcp. " +
            "Use this new tab for all subsequent steps.",
        },
        {
          step: 2,
          action: "navigate_to_profile",
          description: "Navigate to the user's LinkedIn profile and verify login",
          tools: ["navigate", "computer(screenshot)", "get_page_text"],
          instructions:
            "Navigate to 'https://www.linkedin.com/in/me' — this redirects to the user's actual profile URL. " +
            "Take a screenshot to verify the page loaded. If a login page appears and waitForLogin is true, " +
            "inform the user they need to log in and wait. Once on the profile page, capture the final URL from " +
            "the browser (it will be linkedin.com/in/<username>/). This is the profileUrl to use in later steps.",
        },
        {
          step: 3,
          action: "extract_hero",
          description: "Extract name, headline, location, connections, followers from the top section",
          tools: ["computer(screenshot)", "get_page_text", "read_page", "find"],
          instructions:
            "Take a screenshot of the top/hero section of the profile. Use get_page_text and read_page to extract: " +
            "name, headline, location, connection count, follower count. Check for 'Open to Work' or 'Creator' badges. " +
            "Also identify current role and company from the headline or top experience entry.",
        },
        {
          step: 4,
          action: "extract_about",
          description: "Extract the full About section text",
          tools: ["find", "computer(left_click)", "get_page_text", "read_page"],
          instructions:
            "Scroll to or find the 'About' section. If there is a '...see more' or '...more' button, click it to expand " +
            "the full text. Then extract the complete About text using get_page_text or read_page.",
        },
        {
          step: 5,
          action: "extract_experience",
          description: "Extract all work experience entries",
          tools: ["find", "computer(left_click|scroll|screenshot)", "get_page_text", "read_page"],
          instructions:
            "Find the 'Experience' section. If there is a 'Show all X experiences' button, click it to see all entries. " +
            "For each job, extract: title, company, duration (start-end), location, and description. " +
            "If descriptions are truncated, click 'see more' on each. Scroll as needed to capture all entries.",
        },
        {
          step: 6,
          action: "extract_education",
          description: "Extract all education entries",
          tools: ["find", "computer(scroll|screenshot)", "get_page_text", "read_page"],
          instructions:
            "Find the 'Education' section. For each entry extract: school name, degree, field of study, and years. " +
            "If there is a 'Show all' button, click it first.",
        },
        {
          step: 7,
          action: "extract_skills",
          description: "Navigate to skills detail page and extract all skills with endorsement counts",
          tools: ["navigate", "computer(scroll|screenshot)", "get_page_text", "read_page"],
          instructions:
            "Navigate to '{profileUrl}/details/skills/' (replace {profileUrl} with the actual profile URL). " +
            "Scroll through the entire page to load all skills. Extract each skill name and its endorsement count. " +
            "Skills may be grouped by category (e.g., 'Industry Knowledge', 'Tools & Technologies').",
        },
        {
          step: 8,
          action: "extract_featured",
          description: "Navigate to featured items page and extract all items",
          tools: ["navigate", "computer(scroll|screenshot)", "get_page_text", "read_page"],
          instructions:
            "Navigate to '{profileUrl}/details/featured/'. If the page exists, scroll through and extract " +
            "featured items: title, description, type (post/article/link/media), and URL if available. " +
            "If page returns 404 or no items, record an empty array.",
        },
        {
          step: 9,
          action: "extract_posts",
          description: "Navigate to recent activity and extract up to 20 posts",
          tools: ["navigate", "computer(scroll|screenshot)", "get_page_text", "read_page"],
          instructions:
            "Navigate to '{profileUrl}/recent-activity/all/'. Scroll to load posts (up to 20). " +
            "For each post extract: content text (first ~300 chars), type (text/image/video/article/repost), " +
            "approximate date, likes count, comments count, and post URL if available.",
        },
        {
          step: 10,
          action: "extract_additional",
          description: "Go back to profile and scan for certifications, languages, recommendations, volunteer work",
          tools: ["navigate", "computer(scroll|screenshot)", "get_page_text", "read_page", "find"],
          instructions:
            "Navigate back to the main profile URL. Scroll through the entire page looking for these sections: " +
            "Licenses & Certifications, Languages, Recommendations, Volunteer Experience. " +
            "Extract any data found in each section. If a section doesn't exist, record an empty array.",
        },
        {
          step: 11,
          action: "save_data",
          description: "Compile all extracted data and save via save_linkedin_profile_data tool",
          tools: ["save_linkedin_profile_data"],
          instructions:
            "Compile all data from steps 3-10 into the profile object matching this schema: " +
            "{ name, headline, location, connections, followers, about, currentRole, currentCompany, " +
            "openToWork, isCreator, experience: [{title, company, duration, location, description}], " +
            "education: [{school, degree, field, years}], skills: [{name, endorsements}], " +
            "certifications: [], languages: [], featuredItems: [], " +
            "posts: [{content, type, date, likes, comments, url}], " +
            "recommendations: [], volunteerExperience: [], summary: '' }. " +
            "Then call save_linkedin_profile_data with profileUrl and the compiled profile object.",
        },
      ],
    };
  } catch (error) {
    return { error: error.message };
  }
}

function saveLinkedInProfileData(profileUrl, profile) {
  try {
    if (!profileUrl || !profile) {
      return { error: "profileUrl and profile are required" };
    }

    // Ensure data dir exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Load existing data to preserve rawData/gpt4oAnalysis from old captures
    const existing = loadLinkedInData() || {};

    const completeness = computeCompleteness(profile);
    const now = new Date().toISOString();

    const data = {
      success: true,
      profileUrl,
      url: profileUrl,
      profile,
      completeness,
      capturedAt: now,
      captureMethod: "claude-in-chrome",
      // Preserve legacy fields if they exist
      ...(existing.rawData ? { rawData: existing.rawData } : {}),
      ...(existing.gpt4oAnalysis ? { gpt4oAnalysis: existing.gpt4oAnalysis } : {}),
      // Preserve messages and connections at the top level if they existed
      ...(existing.messages ? { messages: existing.messages } : {}),
      ...(existing.connections && !profile.connections ? { connections: existing.connections } : {}),
    };

    fs.writeFileSync(LINKEDIN_DATA, JSON.stringify(data, null, 2));

    return {
      success: true,
      completeness,
      capturedAt: now,
      captureMethod: "claude-in-chrome",
      profileUrl,
      sectionsPopulated: Object.entries(profile)
        .filter(([, v]) => {
          if (Array.isArray(v)) return v.length > 0;
          if (typeof v === "string") return v.trim().length > 0;
          if (typeof v === "number") return v > 0;
          return v != null;
        })
        .map(([k]) => k),
      message: `Profile saved with ${completeness}% completeness`,
    };
  } catch (error) {
    return { error: error.message };
  }
}

function updateLinkedInSection(section, data) {
  try {
    if (!VALID_SECTIONS.includes(section)) {
      return {
        error: `Invalid section: "${section}"`,
        validSections: VALID_SECTIONS,
      };
    }

    const existing = loadLinkedInData();
    if (!existing) {
      return {
        error: "No LinkedIn profile data found. Run a full scrape first.",
        hint: "Call scrape_linkedin_profile to get the automation plan",
      };
    }

    // Ensure profile object exists
    if (!existing.profile) {
      existing.profile = existing.gpt4oAnalysis || {};
    }

    // Update the section
    if (section === "about") {
      existing.profile.about = data;
    } else {
      existing.profile[section] = data;
    }

    // Recompute completeness
    existing.completeness = computeCompleteness(existing.profile);
    existing.capturedAt = new Date().toISOString();

    // If this is the first claude-in-chrome update, mark it
    if (existing.captureMethod !== "claude-in-chrome") {
      existing.captureMethod = "hybrid";
    }

    fs.writeFileSync(LINKEDIN_DATA, JSON.stringify(existing, null, 2));

    return {
      success: true,
      section,
      completeness: existing.completeness,
      updatedAt: existing.capturedAt,
      message: `Section "${section}" updated. Completeness: ${existing.completeness}%`,
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
    case "save_linkedin_profile_data":
      result = saveLinkedInProfileData(args.profileUrl, args.profile);
      break;
    case "update_linkedin_section":
      result = updateLinkedInSection(args.section, args.data);
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
