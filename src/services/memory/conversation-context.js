import fs from "node:fs";
import path from "node:path";

import { getMemoryDir } from "../paths.js";
/**
 * Conversation Context Service for BACKBONE
 * Parses AI conversations to extract user data and build context over time.
 *
 * Domains tracked:
 * - Goals: User's goals, aspirations, objectives
 * - Finances: Investments, savings, income, expenses
 * - Health: Exercise, diet, sleep, wellness goals
 * - Career: Job, skills, professional development
 * - Family: Family members, relationships, activities
 * - Learning: Skills to learn, courses, knowledge areas
 */

const CONTEXT_DIR = process.env.BACKBONE_MEMORY_DIR || getMemoryDir();
const CONTEXT_FILES = {
  goals: "user-goals.md",
  finances: "user-finances.md",
  health: "user-health.md",
  career: "user-career.md",
  family: "user-family.md",
  learning: "user-learning.md",
  preferences: "user-preferences.md",
  insights: "conversation-insights.md"
};

// Patterns to detect different types of information
const EXTRACTION_PATTERNS = {
  goals: [
    /(?:i want to|i'd like to|my goal is|i'm trying to|i aim to|planning to)\s+(.{10,100})/gi,
    /(?:goal|objective|target|aim)(?:s)?(?:\s+is|\s+are|:)\s*(.{10,100})/gi,
    /(?:i need to|i should|i must|i have to)\s+(.{10,100})/gi
  ],
  finances: [
    /\$[\d,]+(?:\.\d{2})?(?:\s+(?:invested|saved|income|salary|worth|in\s+\w+))?/gi,
    /(?:i have|i've got|i invested|i own|my portfolio|my savings|net worth)\s+(?:of\s+)?\$?[\d,]+/gi,
    /(?:invested|investment|savings?|retirement|401k|ira|stocks?|bonds?|etf|portfolio)\s+(?:of\s+)?(?:about\s+)?\$?[\d,]+/gi,
    /(?:income|salary|earn|making)\s+(?:of\s+|about\s+|around\s+)?\$?[\d,]+/gi,
    /(?:debt|loan|mortgage|owe|owing)\s+(?:of\s+|about\s+)?\$?[\d,]+/gi
  ],
  health: [
    /(?:i weigh|my weight is|weight:?)\s+\d+\s*(?:lbs?|kg|pounds?)?/gi,
    /(?:sleep|sleeping)\s+(?:about\s+)?\d+(?:\.\d+)?\s*(?:hours?)?/gi,
    /(?:exercise|workout|gym|run|running|walking|walk)\s+\d+\s*(?:times?|days?|hours?)/gi,
    /(?:blood pressure|bp|heart rate|cholesterol)\s*(?:is|:)?\s*[\d/]+/gi,
    /(?:i'm|i am)\s+(?:trying to lose|trying to gain|losing|gaining)\s+(?:weight|muscle)/gi
  ],
  career: [
    /(?:i work|i'm working|working)\s+(?:at|for|as)\s+(.{5,50})/gi,
    /(?:my job|my role|my position|my title)\s+(?:is|as)\s+(.{5,50})/gi,
    /(?:i'm a|i am a|i'm an|i am an)\s+([\w\s]+(?:developer|engineer|manager|designer|analyst|consultant|director|specialist|expert))/gi,
    /(?:salary|making|earn|income)\s+(?:of\s+|about\s+)?\$?[\d,]+(?:k|K)?(?:\s*\/?\s*(?:year|yr|annually|month|mo))?/gi
  ],
  family: [
    /(?:my wife|my husband|my spouse|my partner)\s*(?:'s name is|is)?\s*(\w+)?/gi,
    /(?:my son|my daughter|my child|my kid)\s*(?:'s name is|is named|is)?\s*(\w+)?/gi,
    /(?:i have|we have)\s+(\d+)\s+(?:children|kids|sons?|daughters?)/gi,
    /(?:my mother|my father|my mom|my dad|my parents)/gi
  ],
  preferences: [
    /(?:i prefer|i like|i love|i enjoy|i hate|i don't like)\s+(.{5,50})/gi,
    /(?:my favorite|my preferred)\s+(.{5,50})/gi
  ]
};

/**
 * Ensure context directory exists
 */
const ensureContextDir = () => {
  if (!fs.existsSync(CONTEXT_DIR)) {
    fs.mkdirSync(CONTEXT_DIR, { recursive: true });
  }
  return CONTEXT_DIR;
};

/**
 * Get context file path
 */
const getContextPath = (domain) => {
  const filename = CONTEXT_FILES[domain] || `user-${domain}.md`;
  return path.join(ensureContextDir(), filename);
};

/**
 * Read context file
 */
const readContextFile = (domain) => {
  const filePath = getContextPath(domain);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf-8");
};

/**
 * Write context file
 */
const writeContextFile = (domain, content) => {
  const filePath = getContextPath(domain);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
};

/**
 * Append to context file with timestamp
 */
const appendToContext = (domain, entry) => {
  const filePath = getContextPath(domain);
  const timestamp = new Date().toISOString().split("T")[0];
  const formattedEntry = `\n- [${timestamp}] ${entry}`;

  if (!fs.existsSync(filePath)) {
    // Create new file with header
    const header = buildContextHeader(domain);
    fs.writeFileSync(filePath, header + formattedEntry, "utf-8");
  } else {
    fs.appendFileSync(filePath, formattedEntry, "utf-8");
  }
  return filePath;
};

/**
 * Build header for context files
 */
const buildContextHeader = (domain) => {
  const titles = {
    goals: "User Goals & Aspirations",
    finances: "Financial Information",
    health: "Health & Wellness",
    career: "Career & Professional",
    family: "Family & Relationships",
    learning: "Learning & Education",
    preferences: "User Preferences",
    insights: "Conversation Insights"
  };

  return `# ${titles[domain] || domain.charAt(0).toUpperCase() + domain.slice(1)}

*Automatically extracted from conversations by BACKBONE*
*Last Updated: ${new Date().toISOString()}*

## Extracted Information
`;
};

/**
 * Extract information from a message based on patterns
 */
const extractFromMessage = (message, domain) => {
  const patterns = EXTRACTION_PATTERNS[domain] || [];
  const extractions = [];

  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const extracted = match[1] || match[0];
      // Clean up and normalize
      const cleaned = extracted.trim().replace(/\s+/g, " ");
      if (cleaned.length > 3 && !extractions.includes(cleaned)) {
        extractions.push(cleaned);
      }
    }
  }

  return extractions;
};

/**
 * Parse a conversation and extract all relevant information
 */
export const parseConversation = (messages) => {
  const extracted = {
    goals: [],
    finances: [],
    health: [],
    career: [],
    family: [],
    learning: [],
    preferences: []
  };

  for (const msg of messages) {
    if (msg.role !== "user") continue;

    const content = msg.content || "";

    for (const domain of Object.keys(extracted)) {
      const domainExtractions = extractFromMessage(content, domain);
      extracted[domain].push(...domainExtractions);
    }
  }

  // Deduplicate
  for (const domain of Object.keys(extracted)) {
    extracted[domain] = [...new Set(extracted[domain])];
  }

  return extracted;
};

/**
 * Process a single user message and extract context
 */
export const processUserMessage = (message) => {
  if (!message || typeof message !== "string") return null;

  const extracted = {
    goals: extractFromMessage(message, "goals"),
    finances: extractFromMessage(message, "finances"),
    health: extractFromMessage(message, "health"),
    career: extractFromMessage(message, "career"),
    family: extractFromMessage(message, "family"),
    preferences: extractFromMessage(message, "preferences")
  };

  // Count how many items were extracted
  const totalExtracted = Object.values(extracted).flat().length;

  if (totalExtracted === 0) return null;

  return extracted;
};

/**
 * Save extracted context to files
 */
export const saveExtractedContext = (extracted) => {
  ensureContextDir();
  const savedTo = [];

  for (const [domain, items] of Object.entries(extracted)) {
    if (items.length === 0) continue;

    for (const item of items) {
      appendToContext(domain, item);
    }
    savedTo.push(domain);
  }

  return savedTo;
};

/**
 * Process and save context from a user message
 * This is the main function to call after each user message
 */
export const processAndSaveContext = (userMessage) => {
  const extracted = processUserMessage(userMessage);
  if (!extracted) return { saved: false, domains: [] };

  const savedDomains = saveExtractedContext(extracted);
  return {
    saved: savedDomains.length > 0,
    domains: savedDomains,
    extracted
  };
};

/**
 * Get all context for a specific domain
 */
export const getContext = (domain) => {
  return readContextFile(domain);
};

/**
 * Get summary of all stored context
 */
export const getContextSummary = () => {
  ensureContextDir();
  const summary = {};

  for (const [domain, filename] of Object.entries(CONTEXT_FILES)) {
    const filePath = path.join(CONTEXT_DIR, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter(l => l.startsWith("- ["));
      summary[domain] = {
        exists: true,
        entryCount: lines.length,
        lastModified: fs.statSync(filePath).mtime
      };
    } else {
      summary[domain] = { exists: false, entryCount: 0 };
    }
  }

  return summary;
};

/**
 * Build context string for AI prompts
 * Returns relevant user context to include in AI conversations
 */
export const buildContextForAI = () => {
  const contextParts = [];

  for (const domain of ["goals", "finances", "career", "health", "family"]) {
    const content = readContextFile(domain);
    if (content) {
      // Get last 5 entries from each domain
      const lines = content.split("\n").filter(l => l.startsWith("- [")).slice(-5);
      if (lines.length > 0) {
        contextParts.push(`## ${domain.charAt(0).toUpperCase() + domain.slice(1)}\n${lines.join("\n")}`);
      }
    }
  }

  if (contextParts.length === 0) {
    return null;
  }

  return `# Known User Context\n\n${contextParts.join("\n\n")}`;
};

/**
 * Update specific financial data point
 */
export const updateFinancialData = (type, value, source = "conversation") => {
  const entry = `${type}: ${value} (source: ${source})`;
  appendToContext("finances", entry);
};

/**
 * Add a user goal
 */
export const addUserGoal = (goal, category = "general") => {
  const entry = `[${category}] ${goal}`;
  appendToContext("goals", entry);
};

/**
 * Clear all context for a domain
 */
export const clearContext = (domain) => {
  const filePath = getContextPath(domain);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

/**
 * Clear all context files
 */
export const clearAllContext = () => {
  const cleared = [];
  for (const domain of Object.keys(CONTEXT_FILES)) {
    if (clearContext(domain)) {
      cleared.push(domain);
    }
  }
  return cleared;
};

export default {
  processAndSaveContext,
  parseConversation,
  getContext,
  getContextSummary,
  buildContextForAI,
  updateFinancialData,
  addUserGoal,
  clearContext,
  clearAllContext,
  CONTEXT_FILES
};
