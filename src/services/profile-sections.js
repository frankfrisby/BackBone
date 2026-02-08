import fs from "fs";
import path from "path";

import { getDataDir, getMemoryDir } from "./paths.js";
/**
 * Profile Sections Service for BACKBONE
 * Manages detailed profile information across multiple domains
 */

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const PROFILE_SECTIONS_PATH = path.join(DATA_DIR, "profile-sections.json");

// Profile section types
export const PROFILE_SECTIONS = {
  GENERAL: "general",
  WORK: "work",
  STARTUP: "startup",
  EDUCATION: "education",
  HEALTH: "health",
  FINANCE: "finance",
  SKILLS: "skills",
  GOALS: "goals",
  SOCIAL: "social"
};

/**
 * Ensure directories exist
 */
const ensureDirs = () => {
  [DATA_DIR, MEMORY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

/**
 * Load profile sections from disk
 */
export const loadProfileSections = () => {
  try {
    ensureDirs();
    if (fs.existsSync(PROFILE_SECTIONS_PATH)) {
      return JSON.parse(fs.readFileSync(PROFILE_SECTIONS_PATH, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to load profile sections:", error.message);
  }
  return getDefaultProfileSections();
};

/**
 * Save profile sections to disk
 */
export const saveProfileSections = (sections) => {
  try {
    ensureDirs();
    fs.writeFileSync(PROFILE_SECTIONS_PATH, JSON.stringify(sections, null, 2));
    // Also save to memory MD files
    saveProfileToMemory(sections);
    return true;
  } catch (error) {
    console.error("Failed to save profile sections:", error.message);
    return false;
  }
};

/**
 * Get default profile sections structure
 */
export const getDefaultProfileSections = () => ({
  general: {
    name: null,
    headline: null,
    location: null,
    about: null,
    profileUrl: null,
    picture: null,
    connections: null,
    lastUpdated: null
  },
  work: {
    currentRole: null,
    currentCompany: null,
    industry: null,
    experience: [],
    yearsOfExperience: null,
    lastUpdated: null
  },
  startup: {
    isFounder: false,
    companies: [],
    currentStartup: null,
    stage: null,
    focus: null,
    lastUpdated: null
  },
  education: {
    isStudent: false,
    currentSchool: null,
    degree: null,
    field: null,
    graduationYear: null,
    history: [],
    lastUpdated: null
  },
  health: {
    connected: false,
    sleepScore: null,
    readinessScore: null,
    activityScore: null,
    avgSleep: null,
    lastUpdated: null
  },
  finance: {
    connected: false,
    portfolioValue: null,
    dayChange: null,
    totalChange: null,
    positionsCount: null,
    lastUpdated: null
  },
  skills: {
    technical: [],
    languages: [],
    certifications: [],
    lastUpdated: null
  },
  goals: {
    shortTerm: [],
    longTerm: [],
    focusAreas: [],
    lastUpdated: null
  },
  social: {
    linkedIn: { connected: false, url: null },
    github: { connected: false, url: null },
    twitter: { connected: false, url: null },
    lastUpdated: null
  },
  metadata: {
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    version: "1.0"
  }
});

/**
 * Update profile from LinkedIn data
 */
export const updateFromLinkedIn = (linkedInProfile) => {
  if (!linkedInProfile) return null;

  const sections = loadProfileSections();
  const now = new Date().toISOString();

  // Update general section
  sections.general = {
    ...sections.general,
    name: linkedInProfile.name || sections.general.name,
    headline: linkedInProfile.headline || sections.general.headline,
    location: linkedInProfile.location || sections.general.location,
    about: linkedInProfile.about || sections.general.about,
    profileUrl: linkedInProfile.profileUrl || sections.general.profileUrl,
    connections: linkedInProfile.connections || sections.general.connections,
    lastUpdated: now
  };

  // Update work section
  if (linkedInProfile.currentRole || linkedInProfile.currentCompany) {
    sections.work = {
      ...sections.work,
      currentRole: linkedInProfile.currentRole || sections.work.currentRole,
      currentCompany: linkedInProfile.currentCompany || sections.work.currentCompany,
      lastUpdated: now
    };
  }

  // Update education section
  if (linkedInProfile.education || linkedInProfile.isStudent !== undefined) {
    sections.education = {
      ...sections.education,
      isStudent: linkedInProfile.isStudent ?? sections.education.isStudent,
      currentSchool: linkedInProfile.education?.school || sections.education.currentSchool,
      degree: linkedInProfile.education?.degree || sections.education.degree,
      field: linkedInProfile.education?.field || sections.education.field,
      graduationYear: linkedInProfile.education?.year || sections.education.graduationYear,
      lastUpdated: now
    };
  }

  // Update skills
  if (linkedInProfile.skills && Array.isArray(linkedInProfile.skills)) {
    sections.skills = {
      ...sections.skills,
      technical: linkedInProfile.skills,
      lastUpdated: now
    };
  }

  // Update social
  sections.social = {
    ...sections.social,
    linkedIn: {
      connected: true,
      url: linkedInProfile.profileUrl || sections.social.linkedIn.url
    },
    lastUpdated: now
  };

  // Update metadata
  sections.metadata.lastUpdated = now;

  saveProfileSections(sections);
  return sections;
};

/**
 * Update profile from health data (Oura)
 */
export const updateFromHealth = (healthData) => {
  if (!healthData?.connected) return null;

  const sections = loadProfileSections();
  const now = new Date().toISOString();

  sections.health = {
    connected: true,
    sleepScore: healthData.today?.sleepScore || sections.health.sleepScore,
    readinessScore: healthData.today?.readinessScore || sections.health.readinessScore,
    activityScore: healthData.today?.activityScore || sections.health.activityScore,
    avgSleep: healthData.weekAverage?.sleepScore || sections.health.avgSleep,
    lastUpdated: now
  };

  sections.metadata.lastUpdated = now;
  saveProfileSections(sections);
  return sections;
};

/**
 * Update profile from portfolio data
 */
export const updateFromPortfolio = (portfolio) => {
  if (!portfolio?.equity) return null;

  const sections = loadProfileSections();
  const now = new Date().toISOString();

  sections.finance = {
    connected: true,
    portfolioValue: portfolio.equity,
    dayChange: portfolio.dayChange,
    totalChange: portfolio.totalChange,
    positionsCount: portfolio.positions?.length || 0,
    lastUpdated: now
  };

  sections.metadata.lastUpdated = now;
  saveProfileSections(sections);
  return sections;
};

/**
 * Save profile sections to memory MD files
 */
const saveProfileToMemory = (sections) => {
  ensureDirs();

  // General profile MD
  const generalMd = buildGeneralMd(sections);
  fs.writeFileSync(path.join(MEMORY_DIR, "profile-general.md"), generalMd);

  // Work profile MD
  const workMd = buildWorkMd(sections);
  fs.writeFileSync(path.join(MEMORY_DIR, "profile-work.md"), workMd);

  // Startup profile MD
  const startupMd = buildStartupMd(sections);
  fs.writeFileSync(path.join(MEMORY_DIR, "profile-startup.md"), startupMd);

  // Education profile MD
  const educationMd = buildEducationMd(sections);
  fs.writeFileSync(path.join(MEMORY_DIR, "profile-education.md"), educationMd);
};

/**
 * Build general profile MD
 */
const buildGeneralMd = (sections) => {
  const g = sections.general || {};
  return `# Profile: General

*Last Updated: ${g.lastUpdated || "Never"}*

## Identity
- **Name**: ${g.name || "Not set"}
- **Headline**: ${g.headline || "Not set"}
- **Location**: ${g.location || "Not set"}
- **Connections**: ${g.connections || "Unknown"}

## About
${g.about || "No bio available."}

## Links
- **LinkedIn**: ${g.profileUrl || "Not connected"}

---
*Managed by BACKBONE*
`;
};

/**
 * Build work profile MD
 */
const buildWorkMd = (sections) => {
  const w = sections.work || {};
  return `# Profile: Work

*Last Updated: ${w.lastUpdated || "Never"}*

## Current Position
- **Role**: ${w.currentRole || "Not set"}
- **Company**: ${w.currentCompany || "Not set"}
- **Industry**: ${w.industry || "Not set"}
- **Years of Experience**: ${w.yearsOfExperience || "Unknown"}

## Experience History
${w.experience?.length > 0
    ? w.experience.map(exp => `### ${exp.title} at ${exp.company}
- Duration: ${exp.duration || "Unknown"}
- Description: ${exp.description || "N/A"}`).join("\n\n")
    : "No work history captured yet."}

---
*Managed by BACKBONE*
`;
};

/**
 * Build startup profile MD
 */
const buildStartupMd = (sections) => {
  const s = sections.startup || {};
  return `# Profile: Startup

*Last Updated: ${s.lastUpdated || "Never"}*

## Founder Status
- **Is Founder**: ${s.isFounder ? "Yes" : "No"}
- **Current Startup**: ${s.currentStartup || "None"}
- **Stage**: ${s.stage || "N/A"}
- **Focus Area**: ${s.focus || "N/A"}

## Companies
${s.companies?.length > 0
    ? s.companies.map(c => `### ${c.name}
- Role: ${c.role || "Founder"}
- Status: ${c.status || "Unknown"}
- Description: ${c.description || "N/A"}`).join("\n\n")
    : "No startup history captured."}

---
*Managed by BACKBONE*
`;
};

/**
 * Build education profile MD
 */
const buildEducationMd = (sections) => {
  const e = sections.education || {};
  return `# Profile: Education

*Last Updated: ${e.lastUpdated || "Never"}*

## Current Status
- **Is Student**: ${e.isStudent ? "Yes" : "No"}
- **School**: ${e.currentSchool || "N/A"}
- **Degree**: ${e.degree || "N/A"}
- **Field of Study**: ${e.field || "N/A"}
- **Graduation Year**: ${e.graduationYear || "N/A"}

## Education History
${e.history?.length > 0
    ? e.history.map(edu => `### ${edu.school}
- Degree: ${edu.degree || "N/A"}
- Field: ${edu.field || "N/A"}
- Year: ${edu.year || "N/A"}`).join("\n\n")
    : "No education history captured."}

---
*Managed by BACKBONE*
`;
};

/**
 * Get formatted profile section for display
 */
export const getProfileSectionDisplay = (section) => {
  const sections = loadProfileSections();
  const s = sections[section];

  if (!s) {
    return `Unknown profile section: ${section}\n\nAvailable sections: ${Object.keys(PROFILE_SECTIONS).join(", ").toLowerCase()}`;
  }

  switch (section) {
    case PROFILE_SECTIONS.GENERAL:
      return formatGeneralSection(s);
    case PROFILE_SECTIONS.WORK:
      return formatWorkSection(s);
    case PROFILE_SECTIONS.STARTUP:
      return formatStartupSection(s);
    case PROFILE_SECTIONS.EDUCATION:
      return formatEducationSection(s);
    case PROFILE_SECTIONS.HEALTH:
      return formatHealthSection(s);
    case PROFILE_SECTIONS.FINANCE:
      return formatFinanceSection(s);
    case PROFILE_SECTIONS.SKILLS:
      return formatSkillsSection(s);
    case PROFILE_SECTIONS.GOALS:
      return formatGoalsSection(s);
    case PROFILE_SECTIONS.SOCIAL:
      return formatSocialSection(s);
    default:
      return JSON.stringify(s, null, 2);
  }
};

const formatGeneralSection = (s) => `
Profile: General
${"─".repeat(40)}

Name:        ${s.name || "Not set"}
Headline:    ${s.headline || "Not set"}
Location:    ${s.location || "Not set"}
Connections: ${s.connections || "Unknown"}

About:
${s.about || "No bio available."}

LinkedIn: ${s.profileUrl || "Not connected"}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatWorkSection = (s) => `
Profile: Work
${"─".repeat(40)}

Current Role:    ${s.currentRole || "Not set"}
Company:         ${s.currentCompany || "Not set"}
Industry:        ${s.industry || "Not set"}
Experience:      ${s.yearsOfExperience || "Unknown"} years

${s.experience?.length > 0 ? "Experience History:\n" + s.experience.map(e => `  • ${e.title} at ${e.company}`).join("\n") : "No work history captured."}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatStartupSection = (s) => `
Profile: Startup
${"─".repeat(40)}

Founder:         ${s.isFounder ? "Yes" : "No"}
Current Startup: ${s.currentStartup || "None"}
Stage:           ${s.stage || "N/A"}
Focus:           ${s.focus || "N/A"}

${s.companies?.length > 0 ? "Companies:\n" + s.companies.map(c => `  • ${c.name} (${c.role || "Founder"})`).join("\n") : "No startup history."}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatEducationSection = (s) => `
Profile: Education
${"─".repeat(40)}

Student:     ${s.isStudent ? "Yes" : "No"}
School:      ${s.currentSchool || "N/A"}
Degree:      ${s.degree || "N/A"}
Field:       ${s.field || "N/A"}
Graduation:  ${s.graduationYear || "N/A"}

${s.history?.length > 0 ? "Education History:\n" + s.history.map(e => `  • ${e.degree} from ${e.school}`).join("\n") : "No education history."}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatHealthSection = (s) => `
Profile: Health
${"─".repeat(40)}

Connected:   ${s.connected ? "Yes (Oura)" : "No"}
Sleep:       ${s.sleepScore || "N/A"}
Readiness:   ${s.readinessScore || "N/A"}
Activity:    ${s.activityScore || "N/A"}
Avg Sleep:   ${s.avgSleep || "N/A"}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatFinanceSection = (s) => `
Profile: Finance
${"─".repeat(40)}

Connected:   ${s.connected ? "Yes (Alpaca)" : "No"}
Portfolio:   ${s.portfolioValue || "N/A"}
Day Change:  ${s.dayChange ? `${s.dayChange}%` : "N/A"}
Total Change: ${s.totalChange ? `${s.totalChange}%` : "N/A"}
Positions:   ${s.positionsCount || 0}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatSkillsSection = (s) => `
Profile: Skills
${"─".repeat(40)}

Technical:
${s.technical?.length > 0 ? s.technical.map(sk => `  • ${sk}`).join("\n") : "  None captured"}

Languages:
${s.languages?.length > 0 ? s.languages.map(l => `  • ${l}`).join("\n") : "  None captured"}

Certifications:
${s.certifications?.length > 0 ? s.certifications.map(c => `  • ${c}`).join("\n") : "  None captured"}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatGoalsSection = (s) => `
Profile: Goals
${"─".repeat(40)}

Short Term:
${s.shortTerm?.length > 0 ? s.shortTerm.map(g => `  • ${g}`).join("\n") : "  None set"}

Long Term:
${s.longTerm?.length > 0 ? s.longTerm.map(g => `  • ${g}`).join("\n") : "  None set"}

Focus Areas:
${s.focusAreas?.length > 0 ? s.focusAreas.map(f => `  • ${f}`).join("\n") : "  None set"}

Last Updated: ${s.lastUpdated || "Never"}
`;

const formatSocialSection = (s) => `
Profile: Social
${"─".repeat(40)}

LinkedIn:  ${s.linkedIn?.connected ? `Connected (${s.linkedIn.url || "URL unknown"})` : "Not connected"}
GitHub:    ${s.github?.connected ? `Connected (${s.github.url || "URL unknown"})` : "Not connected"}
Twitter:   ${s.twitter?.connected ? `Connected (${s.twitter.url || "URL unknown"})` : "Not connected"}

Last Updated: ${s.lastUpdated || "Never"}
`;

/**
 * Get profile overview for display
 */
export const getProfileOverview = () => {
  const sections = loadProfileSections();
  const g = sections.general || {};
  const w = sections.work || {};
  const e = sections.education || {};

  return `
Profile Overview
${"═".repeat(40)}

${g.name || "Name not set"}
${g.headline || ""}
${g.location || ""}

${"─".repeat(40)}
Work: ${w.currentRole ? `${w.currentRole} at ${w.currentCompany}` : "Not set"}
Education: ${e.isStudent ? `Student at ${e.currentSchool}` : e.degree ? `${e.degree}` : "Not set"}

Connections:
  LinkedIn: ${sections.social?.linkedIn?.connected ? "●" : "○"}  Oura: ${sections.health?.connected ? "●" : "○"}  Alpaca: ${sections.finance?.connected ? "●" : "○"}

${"─".repeat(40)}
Available sections: /profile general | work | startup | education | health | finance | skills | goals | social

Last Updated: ${sections.metadata?.lastUpdated || "Never"}
`;
};
