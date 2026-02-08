/**
 * Profile Data for BACKBONE
 * Supports real data from integrations, no mock data displayed
 */

import { detectEducationStatus, buildEducationSection, getEducationConfig } from "../services/education.js";

const GOAL_LIBRARY = {
  startups: "Startup",
  family: "Family",
  highSchool: "High School",
  college: "College",
  gradSchool: "Grad School",
  finance: "Finance",
  health: "Health",
  work: "Work",
  growth: "Growth"
};

/**
 * Build goals with optional progress data
 * Only includes progress if real data is available
 */
export const buildGoals = (areas, progressData = null) =>
  areas.map((area) => {
    const goal = {
      area: GOAL_LIBRARY[area] || area,
      key: area
    };

    // Only add progress if we have real data
    if (progressData && progressData[area] !== undefined) {
      goal.progress = progressData[area];
      goal.hasData = true;
    } else {
      goal.hasData = false;
    }

    return goal;
  });

/**
 * Build profile from environment and integrations
 * Returns only sections with real data
 */
export const buildProfileFromEnv = (linkedInProfile = null) => {
  const name = process.env.USER_NAME || null;
  const email = process.env.USER_EMAIL || null;
  const role = process.env.USER_ROLE || null;
  const focus = process.env.USER_FOCUS || null;

  // Detect education from email and LinkedIn
  const educationStatus = detectEducationStatus(email, linkedInProfile?.education);
  const educationSection = buildEducationSection(educationStatus);

  // Build focus areas based on what data we have
  const focusAreas = [];
  if (educationSection) {
    focusAreas.push(educationSection.level);
  }

  // Add areas from environment if specified
  const envAreas = process.env.USER_FOCUS_AREAS;
  if (envAreas) {
    const areas = envAreas.split(",").map((a) => a.trim().toLowerCase());
    focusAreas.push(...areas.filter((a) => !focusAreas.includes(a)));
  }

  return {
    name,
    email,
    role,
    focus,
    hasProfile: Boolean(name || email),
    education: educationSection,
    linkedIn: linkedInProfile?.connected
      ? {
          connected: true,
          picture: linkedInProfile.picture,
          headline: linkedInProfile.headline
        }
      : null,
    goals: focusAreas.length > 0 ? buildGoals(focusAreas) : [],
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Build profile from LinkedIn data
 */
export const buildProfileFromLinkedIn = (linkedInProfile) => {
  if (!linkedInProfile || !linkedInProfile.connected) {
    return null;
  }

  const educationStatus = detectEducationStatus(linkedInProfile.email, linkedInProfile.education);
  const educationSection = buildEducationSection(educationStatus);

  return {
    name: linkedInProfile.name || null,
    email: linkedInProfile.email || null,
    role: linkedInProfile.positions?.[0]?.title || null,
    company: linkedInProfile.positions?.[0]?.company || null,
    picture: linkedInProfile.picture || null,
    hasProfile: true,
    education: educationSection,
    linkedIn: {
      connected: true,
      picture: linkedInProfile.picture
    },
    goals: educationSection ? buildGoals([educationSection.level]) : [],
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Merge profile data from multiple sources
 * Priority: LinkedIn > Environment > Defaults
 */
export const mergeProfileData = (envProfile, linkedInProfile, ouraData = null) => {
  const merged = {
    name: linkedInProfile?.name || envProfile?.name || null,
    email: linkedInProfile?.email || envProfile?.email || null,
    role: linkedInProfile?.role || envProfile?.role || null,
    focus: envProfile?.focus || null,
    hasProfile: Boolean(linkedInProfile?.name || envProfile?.name),
    picture: linkedInProfile?.picture || null,
    education: linkedInProfile?.education || envProfile?.education || null,
    linkedIn: linkedInProfile?.connected ? { connected: true } : null,
    health: ouraData?.connected
      ? {
          connected: true,
          sleepScore: ouraData.today?.sleepScore,
          readinessScore: ouraData.today?.readinessScore,
          activityScore: ouraData.today?.activityScore
        }
      : null,
    goals: [],
    lastUpdated: new Date().toISOString()
  };

  // Build goals from available data
  const focusAreas = [];

  // Add education if detected
  if (merged.education?.level) {
    focusAreas.push(merged.education.level);
  }

  // Add health if Oura connected
  if (merged.health?.connected) {
    focusAreas.push("health");
  }

  // Add from environment
  const envAreas = process.env.USER_FOCUS_AREAS;
  if (envAreas) {
    const areas = envAreas.split(",").map((a) => a.trim().toLowerCase());
    focusAreas.push(...areas.filter((a) => !focusAreas.includes(a)));
  }

  merged.goals = focusAreas.length > 0 ? buildGoals(focusAreas) : [];

  return merged;
};

/**
 * Check if profile has enough data to display
 */
export const hasProfileData = (profile) => {
  return Boolean(
    profile &&
      (profile.name || profile.email || profile.education || profile.linkedIn?.connected || profile.health?.connected)
  );
};

/**
 * Get sections to display based on available data
 */
export const getDisplaySections = (profile) => {
  const sections = [];

  if (profile?.name || profile?.role) {
    sections.push("identity");
  }

  if (profile?.education?.active) {
    sections.push("education");
  }

  if (profile?.health?.connected) {
    sections.push("health");
  }

  if (profile?.linkedIn?.connected) {
    sections.push("linkedIn");
  }

  if (profile?.goals?.length > 0) {
    sections.push("goals");
  }

  return sections;
};

/**
 * Build empty profile state (for when no integrations connected)
 */
export const buildEmptyProfile = () => ({
  name: null,
  email: null,
  role: null,
  focus: null,
  hasProfile: false,
  education: null,
  linkedIn: null,
  health: null,
  goals: [],
  needsSetup: true,
  lastUpdated: new Date().toISOString()
});

/**
 * Legacy mock profile builder - kept for backward compatibility during migration
 * Will be removed once all integrations are live
 */
export const buildMockProfile = () => {
  const focusAreas = ["startups", "family", "gradSchool", "finance", "health"];

  return {
    name: "User",
    role: "Founder \u00B7 Operator",
    focus: "Capital allocation + health rhythms",
    goals: buildGoals(focusAreas),
    isMock: true
  };
};
