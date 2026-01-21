import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Setup step definitions with instructions
 */
const SETUP_STEPS = [
  {
    id: "ai",
    name: "AI Model",
    required: true,
    icon: "\u{1F916}",
    color: "#8b5cf6",
    envVars: ["ANTHROPIC_API_KEY"],
    instructions: [
      "1. Go to https://console.anthropic.com",
      "2. Create account or sign in",
      "3. Go to 'API Keys' in sidebar",
      "4. Click 'Create Key'",
      "5. Copy key (starts with sk-ant-)",
      "",
      "Add to .env:",
      "ANTHROPIC_API_KEY=sk-ant-your-key"
    ]
  },
  {
    id: "email",
    name: "Email",
    required: true,
    icon: "\u{1F4E7}",
    color: "#ef4444",
    envVars: ["USER_EMAIL"],
    instructions: [
      "Add your email to .env for profile:",
      "",
      "USER_EMAIL=you@email.com",
      "",
      "If using .edu email, education",
      "will be auto-detected!",
      "",
      "For Gmail sync, you'll need OAuth",
      "(advanced - see SETUP_GUIDE.md)"
    ]
  },
  {
    id: "stocks",
    name: "Stock Data",
    required: false,
    icon: "\u{1F4C8}",
    color: "#22c55e",
    envVars: ["ALPACA_KEY", "ALPACA_SECRET"],
    instructions: [
      "1. Go to https://alpaca.markets",
      "2. Create free account",
      "3. Go to Paper Trading",
      "4. Click 'View API Keys'",
      "5. Generate new keys",
      "",
      "Add to .env:",
      "ALPACA_KEY=your-key-id",
      "ALPACA_SECRET=your-secret"
    ]
  },
  {
    id: "health",
    name: "Oura Ring",
    required: false,
    icon: "\u{1F48D}",
    color: "#06b6d4",
    envVars: ["OURA_ACCESS_TOKEN"],
    instructions: [
      "1. Go to https://cloud.ouraring.com",
      "2. Log in with Oura account",
      "3. Go to 'Personal Access Tokens'",
      "4. Create new token",
      "5. Copy the token",
      "",
      "Add to .env:",
      "OURA_ACCESS_TOKEN=your-token"
    ]
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    required: false,
    icon: "\u{1F4BC}",
    color: "#0077b5",
    envVars: ["LINKEDIN_ACCESS_TOKEN"],
    instructions: [
      "1. Go to linkedin.com/developers",
      "2. Create new app",
      "3. Set up OAuth 2.0",
      "4. Get access token",
      "",
      "Add to .env:",
      "LINKEDIN_ACCESS_TOKEN=token",
      "",
      "(See SETUP_GUIDE.md for details)"
    ]
  },
  {
    id: "github",
    name: "GitHub",
    required: false,
    icon: "\u{1F4BB}",
    color: "#333333",
    envVars: ["GITHUB_ACCESS_TOKEN"],
    instructions: [
      "1. Go to github.com/settings/tokens",
      "2. Generate new token (classic)",
      "3. Select scopes: repo, user",
      "4. Copy token",
      "",
      "Add to .env:",
      "GITHUB_ACCESS_TOKEN=ghp_xxx",
      "GITHUB_USERNAME=your-username"
    ]
  },
  {
    id: "wealth",
    name: "Wealth",
    required: false,
    icon: "\u{1F4B0}",
    color: "#eab308",
    envVars: ["PLAID_ACCESS_TOKEN"],
    instructions: [
      "Use Plaid to connect banks:",
      "1. Go to dashboard.plaid.com",
      "2. Create developer account",
      "3. Use Plaid Link to connect",
      "",
      "Add to .env:",
      "PLAID_CLIENT_ID=xxx",
      "PLAID_SECRET=xxx",
      "PLAID_ACCESS_TOKEN=xxx"
    ]
  }
];

/**
 * Check if a step is configured
 */
const isStepConfigured = (step) => {
  return step.envVars.some((envVar) => process.env[envVar]);
};

/**
 * Setup Status Component
 */
export const SetupStatus = ({ compact = false }) => {
  const configuredSteps = SETUP_STEPS.filter(isStepConfigured);
  const missingRequired = SETUP_STEPS.filter((s) => s.required && !isStepConfigured(s));
  const missingOptional = SETUP_STEPS.filter((s) => !s.required && !isStepConfigured(s));

  if (compact) {
    return e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#64748b" }, "Setup:"),
      e(
        Text,
        { color: missingRequired.length > 0 ? "#ef4444" : "#22c55e" },
        `${configuredSteps.length}/${SETUP_STEPS.length}`
      ),
      missingRequired.length > 0 &&
        e(Text, { color: "#ef4444" }, `(${missingRequired.length} required)`)
    );
  }

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { color: "#64748b", marginBottom: 1 }, "Setup Progress"),
    ...SETUP_STEPS.map((step) => {
      const configured = isStepConfigured(step);
      return e(
        Box,
        { key: step.id, flexDirection: "row", gap: 1 },
        e(Text, { color: configured ? "#22c55e" : "#64748b" }, configured ? "\u2713" : "\u25CB"),
        e(Text, null, step.icon),
        e(
          Text,
          { color: configured ? "#94a3b8" : step.required ? "#ef4444" : "#64748b" },
          step.name
        ),
        step.required && !configured && e(Text, { color: "#ef4444" }, "(required)")
      );
    })
  );
};

/**
 * Setup Instructions Component
 */
export const SetupInstructions = ({ stepId }) => {
  const step = SETUP_STEPS.find((s) => s.id === stepId);
  if (!step) return null;

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: step.color,
      padding: 1
    },
    e(
      Box,
      { flexDirection: "row", gap: 1, marginBottom: 1 },
      e(Text, null, step.icon),
      e(Text, { color: "#e2e8f0", bold: true }, `Setup ${step.name}`)
    ),
    ...step.instructions.map((line, i) =>
      e(
        Text,
        { key: i, color: line.startsWith("Add to") ? "#22c55e" : "#94a3b8" },
        line
      )
    )
  );
};

/**
 * Full Setup Wizard Component
 */
export const SetupWizard = ({ onComplete }) => {
  const missingRequired = SETUP_STEPS.filter((s) => s.required && !isStepConfigured(s));
  const missingOptional = SETUP_STEPS.filter((s) => !s.required && !isStepConfigured(s));

  if (missingRequired.length === 0 && missingOptional.length === 0) {
    return e(
      Box,
      { flexDirection: "column", padding: 1 },
      e(Text, { color: "#22c55e", bold: true }, "\u2713 All integrations connected!"),
      e(Text, { color: "#64748b" }, "BACKBONE is fully configured.")
    );
  }

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { color: "#e2e8f0", bold: true, marginBottom: 1 }, "BACKBONE Setup"),
    e(Text, { color: "#64748b", marginBottom: 1 }, "Let's get you connected:"),

    // Required steps
    missingRequired.length > 0 &&
      e(
        Box,
        { flexDirection: "column", marginBottom: 1 },
        e(Text, { color: "#ef4444", marginBottom: 1 }, "\u26A0 Required:"),
        ...missingRequired.map((step) => e(SetupInstructions, { key: step.id, stepId: step.id }))
      ),

    // Optional steps
    missingOptional.length > 0 &&
      e(
        Box,
        { flexDirection: "column" },
        e(Text, { color: "#64748b", marginBottom: 1 }, "Optional (connect when ready):"),
        ...missingOptional.slice(0, 3).map((step) =>
          e(
            Box,
            { key: step.id, flexDirection: "row", gap: 1 },
            e(Text, null, step.icon),
            e(Text, { color: "#64748b" }, step.name)
          )
        ),
        missingOptional.length > 3 &&
          e(Text, { color: "#475569", dimColor: true }, `+${missingOptional.length - 3} more`)
      ),

    e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#64748b", dimColor: true }, "See SETUP_GUIDE.md for detailed instructions")
    )
  );
};

/**
 * Connection Prompt Component
 */
export const ConnectionPrompt = ({ integration, onDismiss }) => {
  const step = SETUP_STEPS.find((s) => s.id === integration);
  if (!step) return null;

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "single",
      borderColor: step.color,
      padding: 1,
      marginBottom: 1
    },
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, null, step.icon),
        e(Text, { color: "#e2e8f0", bold: true }, `Connect ${step.name}`)
      ),
      e(Text, { color: "#475569", dimColor: true }, "[ESC to dismiss]")
    ),
    e(
      Box,
      { marginTop: 1 },
      ...step.instructions.slice(0, 5).map((line, i) =>
        e(Text, { key: i, color: "#94a3b8" }, line)
      )
    )
  );
};

export { SETUP_STEPS, isStepConfigured };
