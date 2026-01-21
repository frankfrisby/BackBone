import fs from "fs";
import path from "path";

/**
 * Memory System for BACKBONE
 * Creates and manages MD files for persistent memory
 */

const MEMORY_DIR = process.env.BACKBONE_MEMORY_DIR || path.join(process.cwd(), "memory");

/**
 * Ensure memory directory exists
 */
export const ensureMemoryDir = () => {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
  return MEMORY_DIR;
};

/**
 * Get memory file path
 */
const getMemoryPath = (filename) => {
  return path.join(ensureMemoryDir(), filename);
};

/**
 * Read memory file
 */
export const readMemory = (filename) => {
  const filePath = getMemoryPath(filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf-8");
};

/**
 * Write memory file
 */
export const writeMemory = (filename, content) => {
  const filePath = getMemoryPath(filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
};

/**
 * Append to memory file
 */
export const appendMemory = (filename, content) => {
  const filePath = getMemoryPath(filename);
  fs.appendFileSync(filePath, `\n${content}`, "utf-8");
  return filePath;
};

/**
 * Generate timestamp for memory entries
 */
const memoryTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Build main memory file content
 */
export const buildMainMemory = (state) => {
  const { profile, portfolio, health, integrations } = state;

  return `# BACKBONE Memory

*Last Updated: ${memoryTimestamp()}*

## User Profile
- **Name**: ${profile?.name || "Not set"}
- **Email**: ${profile?.email || "Not set"}
- **Role**: ${profile?.role || "Not set"}
- **Focus**: ${profile?.focus || "Not set"}

## Education
${
  profile?.education?.active
    ? `- **Status**: Active Student
- **Level**: ${profile.education.displayName || "Unknown"}
- **School**: ${profile.education.school || "Unknown"}
- **Field**: ${profile.education.field || "Not specified"}`
    : "- No education data detected"
}

## Integrations Status
${Object.entries(integrations || {})
  .map(([key, status]) => `- **${key}**: ${status}`)
  .join("\n")}

## Portfolio Summary
- **Equity**: ${portfolio?.equity || "Not connected"}
- **Cash**: ${portfolio?.cash || "N/A"}
- **Day P/L**: ${portfolio?.dayChangeDollar || "N/A"} (${portfolio?.dayChange || 0}%)
- **Total P/L**: ${portfolio?.totalChangeDollar || "N/A"} (${portfolio?.totalChange || 0}%)

## Health Metrics (Oura)
${
  health?.connected
    ? `- **Sleep Score**: ${health.today?.sleepScore || "N/A"}
- **Readiness Score**: ${health.today?.readinessScore || "N/A"}
- **Activity Score**: ${health.today?.activityScore || "N/A"}
- **Resting HR**: ${health.today?.restingHeartRate || "N/A"} bpm`
    : "- Oura Ring not connected"
}

## Goals
${
  profile?.goals?.length > 0
    ? profile.goals.map((g) => `- ${g.area}${g.hasData ? `: ${g.progress}%` : ""}`).join("\n")
    : "- No goals set"
}

---
*Memory managed by BACKBONE v2.0.0*
`;
};

/**
 * Build profile memory file
 */
export const buildProfileMemory = (profile) => {
  return `# Profile Memory

*Last Updated: ${memoryTimestamp()}*

## Identity
- Name: ${profile?.name || "Unknown"}
- Email: ${profile?.email || "Not set"}
- Role: ${profile?.role || "Not set"}

## Education History
${
  profile?.education?.active
    ? `### Current
- Level: ${profile.education.level}
- School: ${profile.education.school || "Unknown"}
- Field: ${profile.education.field || "Not specified"}`
    : "No active education detected."
}

## LinkedIn
${
  profile?.linkedIn?.connected
    ? `- Connected: Yes
- Last Synced: ${memoryTimestamp()}`
    : "- Not connected"
}

## Focus Areas
${profile?.goals?.map((g) => `- ${g.area}`).join("\n") || "None set"}

---
*Profile data from LinkedIn and environment*
`;
};

/**
 * Build portfolio memory file
 */
export const buildPortfolioMemory = (portfolio) => {
  return `# Portfolio Memory

*Last Updated: ${memoryTimestamp()}*

## Account Summary
- Status: ${portfolio?.status || "Unknown"}
- Mode: ${portfolio?.mode || "Unknown"}
- Equity: ${portfolio?.equity || "N/A"}
- Cash: ${portfolio?.cash || "N/A"}
- Buying Power: ${portfolio?.buyingPower || "N/A"}

## Performance
- Day P/L: ${portfolio?.dayChangeDollar || "N/A"} (${portfolio?.dayChange || 0}%)
- Total P/L: ${portfolio?.totalChangeDollar || "N/A"} (${portfolio?.totalChange || 0}%)

## Positions
${
  portfolio?.positions?.length > 0
    ? portfolio.positions
        .map(
          (p) =>
            `### ${p.symbol}
- Shares: ${p.shares}
- Price: ${p.lastPrice}
- Change: ${p.change}%`
        )
        .join("\n\n")
    : "No positions"
}

---
*Portfolio data from Alpaca*
`;
};

/**
 * Build health memory file
 */
export const buildHealthMemory = (health) => {
  if (!health?.connected) {
    return `# Health Memory

*Last Updated: ${memoryTimestamp()}*

## Status
Oura Ring not connected.

To connect:
1. Get Personal Access Token from cloud.ouraring.com
2. Add OURA_ACCESS_TOKEN to .env file
3. Restart BACKBONE

---
*Health data from Oura Ring*
`;
  }

  return `# Health Memory

*Last Updated: ${memoryTimestamp()}*

## Today's Metrics
- Sleep Score: ${health.today?.sleepScore || "N/A"}
- Readiness Score: ${health.today?.readinessScore || "N/A"}
- Activity Score: ${health.today?.activityScore || "N/A"}
- Total Sleep: ${health.today?.totalSleepHours || "N/A"} hours
- Steps: ${health.today?.steps || "N/A"}
- Active Calories: ${health.today?.activeCalories || "N/A"}
- Resting Heart Rate: ${health.today?.restingHeartRate || "N/A"} bpm

## 7-Day Averages
- Sleep: ${health.weekAverage?.sleepScore || "N/A"}
- Readiness: ${health.weekAverage?.readinessScore || "N/A"}
- Activity: ${health.weekAverage?.activityScore || "N/A"}

## Biometrics
- Age: ${health.age || "N/A"}
- Weight: ${health.weight || "N/A"} kg
- Height: ${health.height || "N/A"} cm

---
*Health data from Oura Ring*
`;
};

/**
 * Build tickers memory file
 */
export const buildTickersMemory = (tickers, weights) => {
  const topTickers = tickers?.slice(0, 20) || [];

  return `# Ticker Analysis Memory

*Last Updated: ${memoryTimestamp()}*

## Scoring Weights
- Momentum: ${(weights?.momentum || 0.4) * 100}%
- Volume: ${(weights?.volume || 0.25) * 100}%
- Volatility: ${(weights?.volatility || 0.2) * 100}%
- Sentiment: ${(weights?.sentiment || 0.15) * 100}%

## Top 20 Tickers
| Rank | Symbol | Score | Change | MACD | Volume |
|------|--------|-------|--------|------|--------|
${topTickers
  .map(
    (t, i) =>
      `| ${i + 1} | ${t.symbol} | ${Math.round(t.score)} | ${t.change >= 0 ? "+" : ""}${t.change?.toFixed(2)}% | ${t.macd?.trend || "N/A"} | ${t.volumeScore?.status || "N/A"} |`
  )
  .join("\n")}

---
*Ticker data from Alpaca Markets*
`;
};

/**
 * Build integrations memory file
 */
export const buildIntegrationsMemory = (integrations, socialConnections) => {
  return `# Integrations Memory

*Last Updated: ${memoryTimestamp()}*

## Core Integrations
${Object.entries(integrations || {})
  .map(([key, status]) => `- **${key}**: ${status}`)
  .join("\n")}

## Social Media Connections
${
  socialConnections?.connections?.length > 0
    ? socialConnections.connections.map((c) => `- **${c.name}**: ${c.connected ? "Connected" : "Not connected"}`).join("\n")
    : "No social connections configured"
}

## Connection URLs
- LinkedIn Developer: https://www.linkedin.com/developers/apps
- Oura Cloud: https://cloud.ouraring.com
- Alpaca: https://app.alpaca.markets
- Anthropic: https://console.anthropic.com

---
*Integration status for BACKBONE*
`;
};

/**
 * Save all memory files
 */
export const saveAllMemory = async (state) => {
  ensureMemoryDir();

  const files = [
    { name: "BACKBONE.md", content: buildMainMemory(state) },
    { name: "profile.md", content: buildProfileMemory(state.profile) },
    { name: "portfolio.md", content: buildPortfolioMemory(state.portfolio) },
    { name: "health.md", content: buildHealthMemory(state.health) },
    { name: "tickers.md", content: buildTickersMemory(state.tickers, state.weights) },
    { name: "integrations.md", content: buildIntegrationsMemory(state.integrations, state.social) }
  ];

  for (const file of files) {
    writeMemory(file.name, file.content);
  }

  return files.map((f) => f.name);
};

/**
 * Load memory summary
 */
export const loadMemorySummary = () => {
  const mainMemory = readMemory("BACKBONE.md");
  if (!mainMemory) {
    return null;
  }

  return {
    exists: true,
    content: mainMemory,
    lastModified: fs.statSync(getMemoryPath("BACKBONE.md")).mtime
  };
};
