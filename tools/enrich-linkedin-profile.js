/**
 * Tool: Enrich LinkedIn Profile
 *
 * Reusable tool for enriching any user's LinkedIn profile from public sources.
 * Works in a two-phase process:
 *
 * Phase 1 (plan): Reads current profile, identifies gaps, returns search queries
 * Phase 2 (enrich): Accepts structured data and saves to linkedin-profile.json
 *
 * The AI orchestrator (autonomous engine or CLI) handles the actual web searching
 * between phases. This tool handles data operations only.
 *
 * Usage:
 *   action: "status"  → Current profile + completeness + what's missing
 *   action: "plan"    → Search queries to fill gaps (AI executes these)
 *   action: "enrich"  → Save enriched data from AI's web search results
 *   action: "auto"    → Full enrichment flow description for autonomous engine
 */

import fs from "fs";
import path from "path";
import { getDataDir } from "../src/services/paths.js";

export const metadata = {
  id: "enrich-linkedin-profile",
  name: "Enrich LinkedIn Profile",
  description: "Enrich any user's LinkedIn profile from public web sources. Two-phase: plan (get search queries) → enrich (save results).",
  category: "profile"
};

const DATA_DIR = getDataDir();
const PROFILE_PATH = path.join(DATA_DIR, "linkedin-profile.json");

// All profile sections and their importance weights for completeness scoring
const PROFILE_SECTIONS = {
  name: { weight: 10, label: "Full Name" },
  headline: { weight: 8, label: "Headline" },
  location: { weight: 5, label: "Location" },
  about: { weight: 10, label: "About / Summary" },
  currentRole: { weight: 8, label: "Current Role" },
  currentCompany: { weight: 8, label: "Current Company" },
  experience: { weight: 15, label: "Work Experience", isArray: true },
  education: { weight: 12, label: "Education", isArray: true },
  skills: { weight: 10, label: "Skills", isArray: true },
  connections: { weight: 3, label: "Connections Count" },
  followers: { weight: 3, label: "Followers Count" },
  certifications: { weight: 4, label: "Certifications", isArray: true },
  languages: { weight: 2, label: "Languages", isArray: true },
  featuredItems: { weight: 3, label: "Featured Items", isArray: true },
  volunteerExperience: { weight: 3, label: "Volunteer Experience", isArray: true },
  recommendations: { weight: 4, label: "Recommendations", isArray: true },
  summary: { weight: 5, label: "Professional Summary" }
};

/**
 * Load current profile
 */
function loadProfile() {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Calculate completeness score and find missing sections
 */
function analyzeProfile(profileData) {
  const profile = profileData?.profile || {};
  let totalWeight = 0;
  let earnedWeight = 0;
  const missing = [];
  const populated = [];

  for (const [key, config] of Object.entries(PROFILE_SECTIONS)) {
    totalWeight += config.weight;
    const value = profile[key];

    const hasValue = config.isArray
      ? Array.isArray(value) && value.length > 0
      : value != null && value !== "" && value !== 0;

    if (hasValue) {
      earnedWeight += config.weight;
      populated.push({ section: key, label: config.label, weight: config.weight });
    } else {
      missing.push({ section: key, label: config.label, weight: config.weight });
    }
  }

  return {
    completeness: Math.round((earnedWeight / totalWeight) * 100),
    populated,
    missing: missing.sort((a, b) => b.weight - a.weight) // highest weight gaps first
  };
}

/**
 * Generate search queries to fill profile gaps
 */
function generateSearchPlan(profileData, analysis) {
  const profile = profileData?.profile || {};
  const name = profile.name || "Unknown";
  const company = profile.currentCompany || "";
  const school = profile.education?.[0]?.school || profile.education?.school || "";
  const url = profileData?.url || "";

  const queries = [];

  // Always include a general profile search
  queries.push({
    purpose: "General profile info",
    query: `"${name}" ${company} ${school} LinkedIn profile`,
    fillsSections: ["about", "headline", "currentRole", "currentCompany"]
  });

  // Experience-specific searches
  if (analysis.missing.some(m => m.section === "experience")) {
    queries.push({
      purpose: "Work experience history",
      query: `"${name}" ${company} experience resume career history`,
      fillsSections: ["experience"]
    });
    if (company) {
      queries.push({
        purpose: "Current role details",
        query: `"${name}" "${company}" role project`,
        fillsSections: ["experience", "currentRole"]
      });
    }
  }

  // Education
  if (analysis.missing.some(m => m.section === "education") ||
      (profile.education && !Array.isArray(profile.education))) {
    queries.push({
      purpose: "Education details",
      query: `"${name}" ${school || "university"} degree education`,
      fillsSections: ["education"]
    });
  }

  // Skills
  if (analysis.missing.some(m => m.section === "skills")) {
    queries.push({
      purpose: "Technical skills and expertise",
      query: `"${name}" ${company} skills expertise technology`,
      fillsSections: ["skills"]
    });
  }

  // About / summary
  if (analysis.missing.some(m => m.section === "about")) {
    queries.push({
      purpose: "Bio and about section",
      query: `"${name}" bio about AI engineer`,
      fillsSections: ["about", "summary"]
    });
  }

  // Published content / featured
  if (analysis.missing.some(m => m.section === "featuredItems")) {
    queries.push({
      purpose: "Published articles and content",
      query: `"${name}" articles published LinkedIn site:linkedin.com`,
      fillsSections: ["featuredItems"]
    });
  }

  // Personal website (often has rich info)
  queries.push({
    purpose: "Personal website with comprehensive info",
    query: `"${name}" personal website portfolio`,
    fillsSections: ["about", "experience", "skills", "education"]
  });

  return {
    profileUrl: url,
    personName: name,
    currentCompleteness: analysis.completeness,
    missingCount: analysis.missing.length,
    queries,
    instructions: [
      "Execute each search query using WebSearch",
      "For each result, use WebFetch to extract detailed information",
      "Compile ALL gathered data into a structured profile object",
      "Call this tool again with action='enrich' and the compiled data",
      "The profile object should follow LinkedIn profile structure:",
      "  name, headline, location, about, currentRole, currentCompany,",
      "  experience: [{title, company, location, description, current}],",
      "  education: [{school, degree, field, startYear, endYear, description}],",
      "  skills: [{name}],",
      "  certifications: [{name, issuer, date}],",
      "  languages: [{name, proficiency}],",
      "  featuredItems: [{title, type, date}],",
      "  volunteerExperience: [{role, organization}],",
      "  summary: 'Professional summary paragraph'"
    ]
  };
}

/**
 * Save enriched profile data
 */
function saveEnrichedProfile(profileData, enrichmentData) {
  const existing = profileData || { profile: {}, url: "" };
  const profile = existing.profile || {};

  // Merge enrichment data into existing profile (don't overwrite with empty)
  const enriched = { ...profile };
  for (const [key, value] of Object.entries(enrichmentData)) {
    if (key === "profileUrl" || key === "action") continue;

    // Only overwrite if new value is non-empty
    const isArray = Array.isArray(value);
    const isEmpty = isArray ? value.length === 0 : (value == null || value === "");

    if (!isEmpty) {
      // For arrays, merge intelligently (don't duplicate)
      if (isArray && Array.isArray(enriched[key]) && enriched[key].length > 0) {
        // Keep existing + add new unique items
        const existingNames = new Set(enriched[key].map(item =>
          JSON.stringify(item).toLowerCase()
        ));
        const newItems = value.filter(item =>
          !existingNames.has(JSON.stringify(item).toLowerCase())
        );
        enriched[key] = [...enriched[key], ...newItems];
      } else {
        enriched[key] = value;
      }
    }
  }

  // Build the save object
  const saveData = {
    profile: enriched,
    url: enrichmentData.profileUrl || existing.url || "",
    lastUpdated: new Date().toISOString(),
    captureMethod: "web-enrichment",
    completeness: 0 // Will be recalculated
  };

  // Calculate completeness
  const analysis = analyzeProfile(saveData);
  saveData.completeness = analysis.completeness;

  // Save to disk
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(saveData, null, 2));

  return {
    success: true,
    completeness: analysis.completeness,
    populated: analysis.populated.map(p => p.label),
    stillMissing: analysis.missing.map(m => m.label),
    savedTo: PROFILE_PATH
  };
}

/**
 * Execute the tool
 */
export async function execute(inputs) {
  const { action = "status" } = inputs;
  const profileData = loadProfile();

  switch (action) {
    case "status": {
      if (!profileData) {
        return {
          success: true,
          hasProfile: false,
          completeness: 0,
          message: "No LinkedIn profile data found. Set a LinkedIn URL in user settings, then run with action='plan' to start enrichment."
        };
      }
      const analysis = analyzeProfile(profileData);
      return {
        success: true,
        hasProfile: true,
        url: profileData.url,
        name: profileData.profile?.name,
        completeness: analysis.completeness,
        lastUpdated: profileData.lastUpdated,
        captureMethod: profileData.captureMethod,
        populated: analysis.populated.map(p => p.label),
        missing: analysis.missing.map(m => `${m.label} (weight: ${m.weight})`),
        needsEnrichment: analysis.completeness < 70
      };
    }

    case "plan": {
      if (!profileData) {
        return {
          success: false,
          error: "No profile data. Save a LinkedIn URL first via save_linkedin_profile_data MCP tool."
        };
      }
      const analysis = analyzeProfile(profileData);
      if (analysis.completeness >= 90) {
        return {
          success: true,
          completeness: analysis.completeness,
          message: "Profile is already well-populated (90%+). No enrichment needed.",
          missing: analysis.missing.map(m => m.label)
        };
      }
      return {
        success: true,
        ...generateSearchPlan(profileData, analysis)
      };
    }

    case "enrich": {
      const enrichmentData = { ...inputs };
      delete enrichmentData.action;

      if (Object.keys(enrichmentData).length === 0) {
        return {
          success: false,
          error: "No enrichment data provided. Pass profile fields (name, about, experience, education, skills, etc.)"
        };
      }

      return saveEnrichedProfile(profileData, enrichmentData);
    }

    case "auto": {
      // Returns the full autonomous enrichment flow for the engine
      const analysis = profileData ? analyzeProfile(profileData) : { completeness: 0, missing: [] };
      return {
        success: true,
        flow: "linkedin-profile-enrichment",
        description: "Autonomous LinkedIn profile enrichment from public web sources",
        currentCompleteness: analysis.completeness,
        triggerCondition: "completeness < 70%",
        shouldRun: analysis.completeness < 70,
        steps: [
          {
            step: 1,
            action: "Call enrich-linkedin-profile tool with action='plan'",
            output: "List of search queries and missing sections"
          },
          {
            step: 2,
            action: "Execute each search query via WebSearch",
            output: "Search results with URLs"
          },
          {
            step: 3,
            action: "Fetch top results via WebFetch to extract detailed info",
            output: "Structured data about the person"
          },
          {
            step: 4,
            action: "Compile all data into a profile object",
            output: "Structured profile with all available fields"
          },
          {
            step: 5,
            action: "Call enrich-linkedin-profile tool with action='enrich' + compiled data",
            output: "Updated profile with new completeness score"
          }
        ]
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}. Use: status, plan, enrich, auto` };
  }
}

export default { metadata, execute };
