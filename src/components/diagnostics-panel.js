import React from "react";
import { Box, Text } from "ink";

const e = React.createElement;

/**
 * Diagnostic status indicators
 */
const STATUS = {
  CHECKING: "checking",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  DISABLED: "disabled"
};

const getStatusIcon = (status) => {
  switch (status) {
    case STATUS.SUCCESS: return { icon: "●", color: "#22c55e" };
    case STATUS.WARNING: return { icon: "●", color: "#eab308" };
    case STATUS.ERROR: return { icon: "▼", color: "#ef4444" };
    case STATUS.CHECKING: return { icon: "○", color: "#64748b" };
    case STATUS.DISABLED: return { icon: "○", color: "#334155" };
    default: return { icon: "○", color: "#64748b" };
  }
};

/**
 * Individual diagnostic check result
 */
const DiagnosticRow = ({ name, status, message }) => {
  const { icon, color } = getStatusIcon(status);
  const lines = (message || "").split("\n");

  return e(
    Box,
    { flexDirection: "row", gap: 1 },
    e(Text, { color }, icon),
    e(Box, { width: 18 }, e(Text, { color: status === STATUS.ERROR ? "#ef4444" : "#94a3b8" }, name.padEnd(18))),
    e(
      Box,
      { flexDirection: "column" },
      ...lines.map((line, index) =>
        e(Text, { key: index, color: status === STATUS.ERROR ? "#ef4444" : "#64748b", dimColor: status !== STATUS.ERROR }, line)
      )
    )
  );
};

/**
 * Diagnostics Panel Component
 * Tests all system connections at startup
 */
export const DiagnosticsPanel = ({
  alpacaStatus,
  alpacaError,
  modelStatus,
  modelError,
  ouraStatus,
  ouraError,
  linkedInStatus,
  linkedInError,
  tradingStatus,
  tradingError,
  tickerStatus,
  tickerError,
  emailStatus,
  emailError,
  calendarStatus,
  calendarError,
  // New autonomous system props
  claudeCodeStatus,
  claudeCodeError,
  autonomousStatus,
  autonomousError,
  mobileStatus,
  mobileError,
  goalTrackerStatus,
  lifeScoresStatus,
  onRetry,
  compact = false
}) => {
  const diagnostics = [
    {
      name: "Alpaca Portfolio",
      status: alpacaStatus || STATUS.CHECKING,
      message: alpacaStatus === STATUS.SUCCESS ? "Connected" : alpacaStatus === STATUS.ERROR ? "Missing keys" : "Checking..."
    },
    {
      name: "Trading System",
      status: tradingStatus || STATUS.CHECKING,
      message: tradingStatus === STATUS.SUCCESS ? "Ready" : tradingStatus === STATUS.WARNING ? "Yahoo\nFallback" : tradingStatus === STATUS.ERROR ? "Offline" : "Checking..."
    },
    {
      name: "Ticker Analysis",
      status: tickerStatus || STATUS.CHECKING,
      message: tickerStatus === STATUS.SUCCESS ? "Live" : tickerStatus === STATUS.ERROR ? "Failed" : "Checking..."
    },
    {
      name: "AI Model",
      status: modelStatus || STATUS.CHECKING,
      message: modelStatus === STATUS.SUCCESS ? "Connected" : modelStatus === STATUS.ERROR ? "No key" : "Checking..."
    },
    {
      name: "Claude Code",
      status: claudeCodeStatus || STATUS.DISABLED,
      message: claudeCodeStatus === STATUS.SUCCESS ? "Ready" : claudeCodeStatus === STATUS.WARNING ? "Not installed" : claudeCodeStatus === STATUS.ERROR ? claudeCodeError || "Failed" : "Checking..."
    },
    {
      name: "Autonomous Engine",
      status: autonomousStatus || STATUS.DISABLED,
      message: autonomousStatus === STATUS.SUCCESS ? "Running" : autonomousStatus === STATUS.WARNING ? "Paused" : autonomousStatus === STATUS.ERROR ? "Failed" : "Idle"
    },
    {
      name: "Mobile Dashboard",
      status: mobileStatus || STATUS.DISABLED,
      message: mobileStatus === STATUS.SUCCESS ? mobileError || "Running" : mobileStatus === STATUS.ERROR ? "Failed" : "Not started"
    },
    {
      name: "Goal Tracker",
      status: goalTrackerStatus || STATUS.SUCCESS,
      message: goalTrackerStatus === STATUS.SUCCESS ? "Active" : "Inactive"
    },
    {
      name: "Life Scores",
      status: lifeScoresStatus || STATUS.SUCCESS,
      message: lifeScoresStatus === STATUS.SUCCESS ? "Tracking" : "Inactive"
    },
    {
      name: "LinkedIn",
      status: linkedInStatus || STATUS.DISABLED,
      message: linkedInStatus === STATUS.SUCCESS ? "Connected" : linkedInStatus === STATUS.ERROR ? "Failed" : "Not connected"
    },
    {
      name: "Oura Ring",
      status: ouraStatus || STATUS.DISABLED,
      message: ouraStatus === STATUS.SUCCESS ? "Syncing" : ouraStatus === STATUS.ERROR ? "Failed" : "Not connected"
    },
    {
      name: "Email",
      status: emailStatus || STATUS.DISABLED,
      message: emailStatus === STATUS.SUCCESS ? "Connected" : emailStatus === STATUS.ERROR ? "Failed" : "Not connected"
    },
    {
      name: "Calendar",
      status: calendarStatus || STATUS.DISABLED,
      message: calendarStatus === STATUS.SUCCESS ? "Synced" : calendarStatus === STATUS.ERROR ? "Failed" : "Not connected"
    }
  ];

  const errorCount = diagnostics.filter(d => d.status === STATUS.ERROR).length;
  const successCount = diagnostics.filter(d => d.status === STATUS.SUCCESS).length;
  const totalActive = diagnostics.filter(d => d.status !== STATUS.DISABLED).length;

  const errorSummary = [
    alpacaStatus === STATUS.ERROR && "Alpaca: Missing keys",
    tradingStatus === STATUS.ERROR && "Trading: Offline",
    tickerStatus === STATUS.ERROR && "Tickers: Unavailable",
    modelStatus === STATUS.ERROR && "Model: No key",
    claudeCodeStatus === STATUS.ERROR && "Claude Code: Failed",
    autonomousStatus === STATUS.ERROR && "Autonomous: Failed",
    mobileStatus === STATUS.ERROR && "Mobile: Failed",
    linkedInStatus === STATUS.ERROR && "LinkedIn: Failed",
    ouraStatus === STATUS.ERROR && "Oura: Failed",
    emailStatus === STATUS.ERROR && "Email: Failed",
    calendarStatus === STATUS.ERROR && "Calendar: Failed"
  ].filter(Boolean);

  if (compact) {
    // Compact mode - just show status summary
    return e(
      Box,
      { flexDirection: "row", gap: 2 },
      e(Text, { color: "#64748b" }, "Systems:"),
      e(Text, { color: errorCount > 0 ? "#ef4444" : "#22c55e" }, `${successCount}/${totalActive}`),
      errorCount > 0 && e(Text, { color: "#ef4444", dimColor: true }, `(${errorCount} errors)`)
    );
  }

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: errorCount > 0 ? "#ef4444" : "#1e293b",
      padding: 1,
      marginBottom: 1
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#64748b" }, "System Diagnostics"),
      e(
        Text,
        { color: errorCount > 0 ? "#ef4444" : "#22c55e" },
        errorCount > 0 ? `${errorCount} errors` : "All systems ready"
      )
    ),
    // Diagnostic rows
    ...diagnostics.map((diag, index) =>
      e(DiagnosticRow, { key: index, ...diag })
    ),
    // Error details
    errorSummary.length > 0 && e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      e(Text, { color: "#475569", dimColor: true }, "Attention needed:"),
      ...errorSummary.map((item, index) =>
        e(
          Box,
          { key: index, flexDirection: "row", gap: 1 },
          e(Text, { color: "#ef4444" }, "•"),
          e(Text, { color: "#94a3b8", dimColor: true }, item)
        )
      )
    ),
    errorCount > 0 && e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#475569", dimColor: true }, "Use /connect to configure failed services")
    )
  );
};

/**
 * Run diagnostic checks
 */
export const runDiagnostics = async (config) => {
  const results = {
    alpaca: { status: STATUS.CHECKING, error: null },
    trading: { status: STATUS.CHECKING, error: null },
    ticker: { status: STATUS.CHECKING, error: null },
    model: { status: STATUS.CHECKING, error: null },
    linkedin: { status: STATUS.DISABLED, error: null },
    oura: { status: STATUS.DISABLED, error: null },
    email: { status: STATUS.DISABLED, error: null },
    calendar: { status: STATUS.DISABLED, error: null }
  };

  // Check Alpaca
  try {
    if (config.alpaca?.apiKey && config.alpaca?.apiSecret) {
      const baseUrl = config.alpaca.mode === "live"
        ? "https://api.alpaca.markets"
        : "https://paper-api.alpaca.markets";

      const response = await fetch(`${baseUrl}/v2/account`, {
        headers: {
          "APCA-API-KEY-ID": config.alpaca.apiKey,
          "APCA-API-SECRET-KEY": config.alpaca.apiSecret
        }
      });

      if (response.ok) {
        results.alpaca = { status: STATUS.SUCCESS, error: null };
        results.trading = { status: STATUS.SUCCESS, error: null };
        results.ticker = { status: STATUS.SUCCESS, error: null };
      } else {
        const errorText = await response.text();
        results.alpaca = { status: STATUS.ERROR, error: `HTTP ${response.status}` };
        results.trading = { status: STATUS.ERROR, error: "No portfolio" };
      }
    } else {
      results.alpaca = { status: STATUS.ERROR, error: "No API keys" };
      results.trading = { status: STATUS.WARNING, error: "Using Yahoo" };
      results.ticker = { status: STATUS.SUCCESS, error: null }; // Yahoo fallback
    }
  } catch (error) {
    results.alpaca = { status: STATUS.ERROR, error: error.message };
  }

  // Check AI Model
  try {
    if (config.claude?.apiKey) {
      results.model = { status: STATUS.SUCCESS, error: null, provider: "Claude" };
    } else if (config.openai?.apiKey) {
      results.model = { status: STATUS.SUCCESS, error: null, provider: "OpenAI" };
    } else if (process.env.ANTHROPIC_API_KEY) {
      results.model = { status: STATUS.SUCCESS, error: null, provider: "Claude (env)" };
    } else if (process.env.OPENAI_API_KEY) {
      results.model = { status: STATUS.SUCCESS, error: null, provider: "OpenAI (env)" };
    } else {
      results.model = { status: STATUS.ERROR, error: "No API key" };
    }
  } catch (error) {
    results.model = { status: STATUS.ERROR, error: error.message };
  }

  // Check LinkedIn
  if (config.linkedin?.profileUrl || config.linkedin?.connected) {
    results.linkedin = { status: STATUS.SUCCESS, error: null };
  }

  // Check Oura
  if (config.oura?.accessToken) {
    try {
      const response = await fetch("https://api.ouraring.com/v2/usercollection/personal_info", {
        headers: { Authorization: `Bearer ${config.oura.accessToken}` }
      });
      if (response.ok) {
        results.oura = { status: STATUS.SUCCESS, error: null };
      } else {
        results.oura = { status: STATUS.ERROR, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      results.oura = { status: STATUS.ERROR, error: error.message };
    }
  }

  // Check Email
  if (config.email?.connected) {
    results.email = { status: STATUS.SUCCESS, error: null };
  }

  // Check Calendar
  if (config.calendar?.connected) {
    results.calendar = { status: STATUS.SUCCESS, error: null };
  }

  return results;
};

export const STATUS_TYPES = STATUS;

export default DiagnosticsPanel;
