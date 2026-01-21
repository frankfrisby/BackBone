import React, { memo } from "react";
import { Box, Text } from "ink";
import { hasProfileData, getDisplaySections } from "../data/profile.js";

const e = React.createElement;

const buildBar = (value, length = 12) => {
  if (value === null || value === undefined) return null;
  const filled = Math.round((value / 100) * length);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(length - filled);
  return bar;
};

const progressColor = (value) => {
  if (value >= 75) return "#22c55e";
  if (value >= 55) return "#eab308";
  return "#f97316";
};

/**
 * Get health score color
 */
const healthScoreColor = (score) => {
  if (!score) return "#64748b";
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#eab308";
  return "#f97316";
};

/**
 * Connection status indicator
 */
const ConnectionIndicator = ({ connected, label }) =>
  e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color: connected ? "#22c55e" : "#64748b" }, connected ? "\u25CF" : "\u25CB"),
    e(Text, { color: connected ? "#94a3b8" : "#64748b" }, label)
  );

const ProfilePanelBase = ({ profile, integrations = {}, showDateTime = true, linkedInProfile = null }) => {
  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  // Get user info from LinkedIn if available
  const userName = linkedInProfile?.name || profile?.name;
  const userHeadline = linkedInProfile?.headline || profile?.role;
  const userLocation = linkedInProfile?.location;
  const userCompany = linkedInProfile?.currentCompany;
  const userRole = linkedInProfile?.currentRole;

  // Check if profile needs setup (no real data)
  const needsSetup = !hasProfileData(profile) || profile.needsSetup;
  const sections = getDisplaySections(profile);

  // Empty state - prompt user to connect integrations
  if (needsSetup) {
    return e(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "#1e293b",
        padding: 1
      },
      // Header with date/time
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
        e(Text, { color: "#64748b" }, "Profile"),
        showDateTime && e(Text, { color: "#475569", dimColor: true }, dateTimeStr)
      ),
      // Setup prompt
      e(
        Box,
        { flexDirection: "column", marginTop: 1 },
        e(Text, { color: "#94a3b8", bold: true }, "Setup Required"),
        e(Text, { color: "#64748b", marginTop: 1 }, "Connect integrations to get started:"),
        e(Box, { marginTop: 1 }, e(Text, { color: "#64748b" }, "\u2500".repeat(24))),
        // Connection prompts
        e(
          Box,
          { flexDirection: "column", marginTop: 1 },
          e(Text, { color: "#f97316" }, "\u25CB LinkedIn - Career & education"),
          e(Text, { color: "#f97316" }, "\u25CB Oura Ring - Health metrics"),
          e(Text, { color: "#f97316" }, "\u25CB Email - .edu detection"),
          e(Text, { color: "#f97316" }, "\u25CB Alpaca - Portfolio data")
        ),
        e(
          Box,
          { marginTop: 1 },
          e(Text, { color: "#475569", dimColor: true }, "Add credentials to .env file")
        )
      )
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#1e293b",
      padding: 1
    },
    // Header with date/time
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "Profile"),
      showDateTime && e(Text, { color: "#475569", dimColor: true }, dateTimeStr)
    ),
    // User identity - show LinkedIn data when available
    (userName || sections.includes("identity")) &&
      e(
        Box,
        { flexDirection: "column" },
        userName && e(Text, { color: "#e2e8f0", bold: true }, userName),
        userHeadline && e(Text, { color: "#94a3b8" }, userHeadline),
        (userRole && userCompany) && e(Text, { color: "#94a3b8" }, `${userRole} at ${userCompany}`),
        userLocation && e(Text, { color: "#64748b", dimColor: true }, userLocation),
        !userName && profile.focus && e(Text, { color: "#64748b", dimColor: true }, profile.focus)
      ),
    // Education section (only if detected)
    profile.education?.active &&
      e(
        Box,
        { flexDirection: "column", marginTop: 1 },
        e(Box, { marginBottom: 1 }, e(Text, { color: "#475569" }, "\u2500".repeat(24))),
        e(Text, { color: "#64748b" }, "Education"),
        e(
          Box,
          { flexDirection: "row", justifyContent: "space-between" },
          e(Text, { color: "#94a3b8" }, profile.education.displayName),
          profile.education.school && e(Text, { color: "#64748b" }, profile.education.school)
        ),
        profile.education.field &&
          e(Text, { color: "#475569", dimColor: true }, profile.education.field)
      ),
    // Health section (only if Oura connected)
    profile.health?.connected &&
      e(
        Box,
        { flexDirection: "column", marginTop: 1 },
        e(Box, { marginBottom: 1 }, e(Text, { color: "#475569" }, "\u2500".repeat(24))),
        e(Text, { color: "#64748b", marginBottom: 1 }, "Health (Oura)"),
        e(
          Box,
          { flexDirection: "row", justifyContent: "space-between" },
          e(Text, { color: "#94a3b8" }, "Sleep"),
          profile.health.sleepScore &&
            e(Text, { color: healthScoreColor(profile.health.sleepScore) }, `${profile.health.sleepScore}`)
        ),
        e(
          Box,
          { flexDirection: "row", justifyContent: "space-between" },
          e(Text, { color: "#94a3b8" }, "Readiness"),
          profile.health.readinessScore &&
            e(
              Text,
              { color: healthScoreColor(profile.health.readinessScore) },
              `${profile.health.readinessScore}`
            )
        ),
        e(
          Box,
          { flexDirection: "row", justifyContent: "space-between" },
          e(Text, { color: "#94a3b8" }, "Activity"),
          profile.health.activityScore &&
            e(
              Text,
              { color: healthScoreColor(profile.health.activityScore) },
              `${profile.health.activityScore}`
            )
        )
      ),
    // Integrations status
    e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Box, { marginBottom: 1 }, e(Text, { color: "#475569" }, "\u2500".repeat(24))),
      e(Text, { color: "#64748b", marginBottom: 1 }, "Connections"),
      e(
        Box,
        { flexDirection: "column" },
        // LinkedIn with sub-option for crawl data
        e(ConnectionIndicator, { connected: profile.linkedIn?.connected, label: "LinkedIn Connect" }),
        e(
          Box,
          { flexDirection: "row", marginLeft: 2 },
          e(Text, { color: profile.linkedIn?.connected ? "#64748b" : "#475569" }, "\u21B3 "),
          e(
            Text,
            { color: profile.linkedIn?.connected ? "#94a3b8" : "#475569" },
            "LinkedIn (Crawl Data)"
          ),
          profile.linkedIn?.connected && e(Text, { color: "#64748b", dimColor: true }, "  /linkedin data")
        ),
        e(ConnectionIndicator, { connected: profile.health?.connected, label: "Oura Ring" }),
        e(ConnectionIndicator, { connected: integrations.Alpaca === "Connected", label: "Alpaca" }),
        e(ConnectionIndicator, { connected: integrations.Claude === "Connected", label: "Claude" })
      )
    ),
    // Goals section (only if we have goals with data)
    profile.goals &&
      profile.goals.length > 0 &&
      e(
        Box,
        { flexDirection: "column", marginTop: 1 },
        e(Box, { marginBottom: 1 }, e(Text, { color: "#475569" }, "\u2500".repeat(24))),
        e(Text, { color: "#64748b", marginBottom: 1 }, "Focus Areas"),
        ...profile.goals.map((goal) =>
          e(
            Box,
            { key: goal.key || goal.area, flexDirection: "row", justifyContent: "space-between" },
            e(Text, { color: "#94a3b8" }, goal.area.padEnd(12)),
            // Only show progress bar if we have real data
            goal.hasData &&
              e(
                Box,
                { flexDirection: "row", gap: 1 },
                e(Text, { color: progressColor(goal.progress) }, buildBar(goal.progress)),
                e(Text, { color: progressColor(goal.progress) }, `${goal.progress}%`.padStart(4))
              )
          )
        )
      )
  );
};

// Memoize to prevent re-renders during typing
export const ProfilePanel = memo(ProfilePanelBase);
