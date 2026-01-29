import React, { memo, useMemo, useState, useEffect } from "react";
import { Box, Text } from "ink";
import { getActivityNarrator, AGENT_STATES, ACTION_COLORS, STATE_COLORS } from "../services/activity-narrator.js";
import { getAutonomousEngine } from "../services/autonomous-engine.js";
import { useCoordinatedUpdates } from "../hooks/useCoordinatedUpdates.js";
import { getAIStatus, getMultiAIConfig, getCurrentModel } from "../services/multi-ai.js";
import { BILLING_URLS } from "../services/api-quota-monitor.js";
import { isClaudeCodeLoggedIn } from "../services/claude-code-cli.js";
import { getGoalManager } from "../services/goal-manager.js";
import { getBackgroundProjectsManager, BACKGROUND_PROJECT_TYPE } from "../services/background-projects.js";

const e = React.createElement;

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE CODE STYLE ENGINE PANEL
// Matches Claude Code CLI terminal output formatting
// ═══════════════════════════════════════════════════════════════════════════

const THEME = {
  bg: "#0f172a",
  primary: "#e2e8f0",
  secondary: "#94a3b8",
  muted: "#64748b",
  dim: "#475569",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  purple: "#a855f7",
  cyan: "#06b6d4",
  white: "#ffffff",
  gray: "#6b7280",
  // Diff colors - Claude Code style
  diffAddBg: "#14532d",
  diffAddFg: "#86efac",
  diffRemoveBg: "#7f1d1d",
  diffRemoveFg: "#fca5a5",
};

// Tool color - all tools use white for consistency (Claude Code style)
const TOOL_COLOR = "#ffffff";

/**
 * Flashlight/Shimmer effect for thinking state
 * Creates moving highlight that sweeps across text (orange background on white text)
 */
const FlashlightText = memo(({ text, baseColor = "#f59e0b", bold = true, spotlightWidth = 4 }) => {
  const [pos, setPos] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPos(prev => (prev + 1) % (text.length + spotlightWidth + 2));
    }, 80);
    return () => clearInterval(interval);
  }, [text.length, spotlightWidth]);

  const before = text.slice(0, Math.max(0, pos - 1));
  const spotlight = text.slice(Math.max(0, pos - 1), Math.min(text.length, pos + spotlightWidth - 1));
  const after = text.slice(Math.min(text.length, pos + spotlightWidth - 1));

  return e(
    Box,
    { flexDirection: "row" },
    before && e(Text, { color: baseColor, bold }, before),
    spotlight && e(Text, { color: "#ffffff", backgroundColor: baseColor, bold }, spotlight),
    after && e(Text, { color: baseColor, bold }, after)
  );
});

/**
 * Blinking status dot - Claude Code style
 * ● Green = completed/success
 * ● Red = error/failed
 * ○ Gray/White blinking = working/in-progress
 */
const StatusDot = memo(({ status = "working", blink = false }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!blink) return;
    const interval = setInterval(() => setVisible(v => !v), 500);
    return () => clearInterval(interval);
  }, [blink]);

  const dotConfig = {
    done: { char: "●", color: THEME.success },
    success: { char: "●", color: THEME.success },
    completed: { char: "●", color: THEME.success },
    error: { char: "●", color: THEME.error },
    failed: { char: "●", color: THEME.error },
    working: { char: "○", color: visible ? THEME.white : THEME.dim },
    pending: { char: "○", color: THEME.gray },
  };

  const config = dotConfig[status?.toLowerCase()] || dotConfig.working;
  return e(Text, { color: config.color }, config.char);
});

/**
 * Tool call line - Claude Code format
 * ○ Read(src/services/auth.js)
 * ● Bash(npm install)
 * ○ WebSearch(AI jobs in DC)
 */
const ToolCallLine = memo(({ tool, target, status = "working", result = null, privateMode = false }) => {
  const toolColor = TOOL_COLOR;
  const isDone = status === "done" || status === "completed" || status === "success";
  const isFailed = status === "error" || status === "failed";

  // Truncate long targets
  const displayTarget = privateMode ? "••••••••" : (target?.length > 60 ? target.slice(0, 57) + "..." : target);

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // Main line: dot + Tool(target)
    e(
      Box,
      { flexDirection: "row" },
      e(StatusDot, { status: isDone ? "done" : isFailed ? "error" : "working", blink: !isDone && !isFailed }),
      e(Text, { color: THEME.muted }, " "),
      e(Text, { color: toolColor, bold: true }, tool),
      e(Text, { color: THEME.dim }, "("),
      e(Text, { color: THEME.primary }, displayTarget || ""),
      e(Text, { color: THEME.dim }, ")")
    ),
    // Result line if present (indented)
    result && !privateMode && e(
      Box,
      { paddingLeft: 3 },
      e(Text, { color: THEME.dim }, "→ "),
      e(Text, { color: THEME.secondary }, typeof result === "string" ? result.slice(0, 70) : "")
    )
  );
});

/**
 * Diff view - Claude Code style with +/- and colored backgrounds
 *
 *   35 │ - const oldAuth = require('old');     [RED BG]
 *   36 │ + const newAuth = require('new');     [GREEN BG]
 */
const DiffView = memo(({ diff, isNewFile = false }) => {
  if (!diff) return null;

  const removed = diff.removed || [];
  const added = diff.added || [];
  const startLine = diff.startLine || 1;

  // Limit lines shown
  const maxLines = 10;
  const showRemoved = removed.slice(0, maxLines);
  const showAdded = added.slice(0, maxLines);

  if (showRemoved.length === 0 && showAdded.length === 0) return null;

  return e(
    Box,
    { flexDirection: "column", paddingLeft: 3, marginTop: 0, marginBottom: 1 },

    // Header
    e(Text, { color: THEME.dim }, isNewFile ? "New file:" : `Lines ${startLine}-${startLine + removed.length + added.length}:`),
    e(Text, { color: THEME.dim }, " "),

    // Removed lines (red background with -)
    ...showRemoved.map((line, i) => {
      const lineNum = (startLine + i).toString().padStart(4, " ");
      const text = typeof line === "object" ? line.text : line;
      return e(
        Box,
        { key: `r${i}`, flexDirection: "row" },
        e(Text, { color: THEME.diffRemoveFg }, `${lineNum} │ `),
        e(Text, { color: THEME.diffRemoveFg, backgroundColor: THEME.diffRemoveBg }, `- ${text || " "} `)
      );
    }),

    // Added lines (green background with +)
    ...showAdded.map((line, i) => {
      const lineNum = (startLine + removed.length + i).toString().padStart(4, " ");
      const text = typeof line === "object" ? line.text : line;
      return e(
        Box,
        { key: `a${i}`, flexDirection: "row" },
        e(Text, { color: THEME.diffAddFg }, `${lineNum} │ `),
        e(Text, { color: THEME.diffAddFg, backgroundColor: THEME.diffAddBg }, `+ ${text || " "} `)
      );
    }),

    // Truncation notice
    (removed.length > maxLines || added.length > maxLines) && e(
      Text,
      { color: THEME.dim },
      `      ... ${Math.max(0, removed.length - maxLines) + Math.max(0, added.length - maxLines)} more lines`
    )
  );
});

/**
 * Thinking state with orange flashlight effect
 * * Thinking...  (with shimmer animation)
 */
const ThinkingState = memo(({ state = "Thinking", goal = "", projectName = "" }) => {
  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    // State line with shimmer
    e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: THEME.warning }, "* "),
      e(FlashlightText, { text: `${state}...`, baseColor: THEME.warning, bold: true })
    ),
    // Goal line (if present)
    goal && e(
      Box,
      { paddingLeft: 2, marginTop: 0 },
      e(Text, { color: THEME.muted }, "Goal: "),
      e(Text, { color: THEME.secondary }, goal.slice(0, 60) + (goal.length > 60 ? "..." : "")),
      projectName && e(Text, { color: THEME.dim }, ` · ${projectName}`)
    )
  );
});

/**
 * Idle state display
 */
const IdleState = memo(({ waitingReasons = [], backgroundProjects = [] }) => {
  const bgProjectNames = {
    [BACKGROUND_PROJECT_TYPE.MARKET_RESEARCH]: "Market Research",
    [BACKGROUND_PROJECT_TYPE.FINANCIAL_GROWTH]: "Financial Growth",
    [BACKGROUND_PROJECT_TYPE.DISASTER_PLANNING]: "Disaster Planning"
  };

  return e(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    e(
      Box,
      { flexDirection: "row" },
      e(Text, { color: THEME.gray }, "○ "),
      e(Text, { color: THEME.muted }, "Idle")
    ),
    // Waiting reasons
    waitingReasons.length > 0 && e(
      Box,
      { flexDirection: "column", paddingLeft: 2, marginTop: 1 },
      e(Text, { color: THEME.dim }, "Waiting on:"),
      ...waitingReasons.slice(0, 2).map((r, i) =>
        e(Box, { key: i, paddingLeft: 2 },
          e(Text, { color: THEME.dim }, "• "),
          e(Text, { color: THEME.secondary }, `${r.project || r.goal || "Project"} - ${r.reason || "waiting"}`)
        )
      )
    ),
    // Background projects
    waitingReasons.length === 0 && backgroundProjects.length > 0 && e(
      Box,
      { flexDirection: "column", paddingLeft: 2, marginTop: 1 },
      e(Text, { color: THEME.dim }, "Background:"),
      ...backgroundProjects.slice(0, 2).map((bp, i) =>
        e(Box, { key: i, paddingLeft: 2 },
          e(Text, { color: THEME.dim }, "◐ "),
          e(Text, { color: THEME.secondary }, bgProjectNames[bp.type] || bp.title)
        )
      )
    )
  );
});

/**
 * Observation line - discovery/insight
 * ○  Found 3 matching results
 */
const ObservationLine = memo(({ text, privateMode = false }) => {
  if (!text) return null;
  const displayText = privateMode ? "[hidden]" : text;

  return e(
    Box,
    { flexDirection: "row", marginBottom: 1 },
    e(Text, { color: THEME.white }, "○"),
    e(Text, { color: THEME.muted }, "  "),
    e(Text, { color: THEME.primary }, displayText.slice(0, 70))
  );
});

/**
 * Completed goal/project line
 * ● Goal completed: Built the login system
 */
const CompletedLine = memo(({ text }) => {
  if (!text) return null;

  return e(
    Box,
    { flexDirection: "row", marginBottom: 1 },
    e(Text, { color: THEME.success }, "●"),
    e(Text, { color: THEME.muted }, " "),
    e(Text, { color: THEME.primary }, text.slice(0, 70))
  );
});

/**
 * Engine Stats Line
 * ⟨ 11.4k tokens │ 5m 33s ⟩
 */
const StatsLine = memo(({ tokens = 0, runtime = 0 }) => {
  const formatTokens = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();
  const formatTime = (ms) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
  };

  return e(
    Box,
    { flexDirection: "row" },
    e(Text, { color: THEME.dim }, `⟨ ${formatTokens(tokens)} tokens │ ${formatTime(runtime)} ⟩`)
  );
});

/**
 * Model Status Banner - shown when no model or quota exceeded
 */
const ModelStatusBanner = memo(({ hasModel, tokensExceeded, provider }) => {
  if (hasModel && !tokensExceeded) return null;

  const isError = !hasModel || tokensExceeded;
  const bgColor = isError ? "#7f1d1d" : "#1e293b";
  const borderColor = isError ? "#dc2626" : "#475569";
  const textColor = isError ? "#fca5a5" : "#f59e0b";

  return e(
    Box,
    { backgroundColor: bgColor, paddingX: 2, paddingY: 1, marginBottom: 1, borderStyle: "round", borderColor },
    e(
      Box,
      { flexDirection: "column" },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: textColor }, "⚠"),
        e(Text, { color: textColor, bold: true }, !hasModel ? "No Model Connected" : "Quota Exceeded")
      ),
      e(Text, { color: "#94a3b8" }, !hasModel ? "Add API key to .env" : `Add tokens at ${provider} billing`)
    )
  );
});

/**
 * Claude Code CLI Output Stream
 * Shows real-time output from Claude Code CLI with proper formatting
 */
const CLIOutputStream = memo(({ text, isStreaming, scrollOffset = 0, goal = "", state = "" }) => {
  if (!text && !isStreaming) return null;

  // Split into lines and handle scrolling
  const allLines = (text || "").split("\n").filter(l => l.trim());
  const visibleCount = 12;
  const endLine = Math.max(0, allLines.length - scrollOffset);
  const startLine = Math.max(0, endLine - visibleCount);
  const visibleLines = allLines.slice(startLine, endLine);

  // Format a single line based on content
  const formatLine = (line, idx) => {
    const trimmed = line.trim();

    // Tool call pattern: Read(...), Bash(...), etc.
    const toolMatch = trimmed.match(/^[●○◆◇▣⚡→]?\s*(Read|Write|Edit|Update|Bash|WebSearch|WebFetch|Fetch|Grep|Glob|Task|Delete)\((.+)\)$/i);
    if (toolMatch) {
      const [, tool, arg] = toolMatch;
      return e(
        Box,
        { key: idx, flexDirection: "row" },
        e(Text, { color: THEME.gray }, "○ "),
        e(Text, { color: TOOL_COLOR, bold: true }, tool),
        e(Text, { color: THEME.dim }, "("),
        e(Text, { color: THEME.primary }, arg.slice(0, 50) + (arg.length > 50 ? "..." : "")),
        e(Text, { color: THEME.dim }, ")")
      );
    }

    // State pattern: Thinking:, Reading:, etc.
    const stateMatch = trimmed.match(/^(Thinking|Reading|Searching|Analyzing|Processing|Writing|Updating|Planning|Building):\s*(.*)$/i);
    if (stateMatch) {
      const [, action, detail] = stateMatch;
      const isThinkingWord = action.toLowerCase() === "thinking";
      return e(
        Box,
        { key: idx, flexDirection: "row" },
        e(Text, { color: THEME.warning }, "◐ "),
        // Use flashlight animation for "Thinking", regular text for others
        isThinkingWord
          ? e(FlashlightText, { text: action, baseColor: THEME.warning, bold: true, spotlightWidth: 3 })
          : e(Text, { color: THEME.warning, bold: true }, action),
        detail && e(Text, { color: THEME.secondary }, ` ${detail.slice(0, 50)}`)
      );
    }

    // Diff lines: + or -
    if (trimmed.startsWith("+") && !trimmed.startsWith("++")) {
      return e(
        Box,
        { key: idx, flexDirection: "row" },
        e(Text, { color: THEME.diffAddFg, backgroundColor: THEME.diffAddBg }, trimmed.slice(0, 70))
      );
    }
    if (trimmed.startsWith("-") && !trimmed.startsWith("--")) {
      return e(
        Box,
        { key: idx, flexDirection: "row" },
        e(Text, { color: THEME.diffRemoveFg, backgroundColor: THEME.diffRemoveBg }, trimmed.slice(0, 70))
      );
    }

    // Success indicators
    if (trimmed.includes("✓") || trimmed.toLowerCase().includes("done") || trimmed.toLowerCase().includes("complete")) {
      return e(
        Box,
        { key: idx, flexDirection: "row" },
        e(Text, { color: THEME.success }, "● "),
        e(Text, { color: THEME.diffAddFg }, trimmed.replace(/[✓]/g, "").trim().slice(0, 65))
      );
    }

    // Headers
    if (trimmed.startsWith("##") || trimmed.startsWith("**")) {
      return e(
        Box,
        { key: idx },
        e(Text, { color: THEME.primary, bold: true }, trimmed.replace(/[#*]/g, "").trim().slice(0, 65))
      );
    }

    // Standalone "thinking" word (no colon) - orange with flashlight
    if (trimmed.toLowerCase() === "thinking" || trimmed.toLowerCase() === "thinking...") {
      return e(
        Box,
        { key: idx, flexDirection: "row" },
        e(Text, { color: THEME.warning }, "◐ "),
        e(FlashlightText, { text: trimmed, baseColor: THEME.warning, bold: true, spotlightWidth: 3 })
      );
    }

    // Default line
    return e(
      Box,
      { key: idx },
      e(Text, { color: THEME.secondary }, "  " + trimmed.slice(0, 68))
    );
  };

  const statusColor = isStreaming ? THEME.warning : THEME.success;
  const statusIcon = isStreaming ? "▶" : "✓";
  const statusText = isStreaming ? "Running" : "Completed";

  return e(
    Box,
    { flexDirection: "column" },
    // Header
    e(
      Box,
      { flexDirection: "row", marginBottom: 1 },
      e(Text, { color: statusColor }, statusIcon + " "),
      e(Text, { color: statusColor, bold: true }, statusText),
      e(Text, { color: THEME.dim }, " · "),
      e(Text, { color: THEME.purple }, "claude-sonnet-4"),
      startLine > 0 && e(Text, { color: THEME.dim }, ` · ↑${startLine} more`)
    ),
    // Goal/State
    (goal || state) && e(
      Box,
      { marginBottom: 1 },
      e(Text, { color: THEME.dim }, "State: "),
      e(Text, { color: THEME.warning, bold: true }, state || "WORKING"),
      goal && e(Text, { color: THEME.dim }, ` · ${goal.slice(0, 40)}`)
    ),
    // Output lines
    ...visibleLines.map((line, idx) => formatLine(line, idx))
  );
});

/**
 * Main Engine Panel - Claude Code Style
 */
const AgentActivityPanelBase = ({
  overlayHeader = false,
  compact = false,
  scrollOffset = 0,
  privateMode = false,
  actionStreamingText = "",
  cliStreaming = false
}) => {
  const narrator = getActivityNarrator();
  const autonomousEngine = getAutonomousEngine();

  // Blinking animation for header dot
  const [dotVisible, setDotVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => setDotVisible(v => !v), 1000);
    return () => clearInterval(interval);
  }, []);

  // Model status
  const modelStatus = useMemo(() => {
    const config = getMultiAIConfig();
    const aiStatus = getAIStatus();
    const hasOpenAI = config.gptInstant?.ready || config.gptThinking?.ready;
    const hasClaude = config.claude?.ready;
    const hasClaudeCode = config.claudeCode?.ready;
    const hasModel = hasOpenAI || hasClaude || hasClaudeCode;
    const tokensExceeded = (hasOpenAI && (aiStatus.gptInstant?.quotaExceeded || aiStatus.gptThinking?.quotaExceeded)) ||
                          (hasClaude && aiStatus.claude?.quotaExceeded && !hasOpenAI);
    return { hasModel, tokensExceeded, isPaused: !hasModel || tokensExceeded, provider: "openai" };
  }, []);

  // Get narrator data
  const data = useCoordinatedUpdates("agent-narrator", () => narrator.getDisplayData(), { initialData: narrator.getDisplayData() }) || narrator.getDisplayData();
  const engineData = autonomousEngine?.getDisplayData() || {};

  const state = data.state || "OBSERVING";
  const stateInfo = data.stateInfo || AGENT_STATES.OBSERVING;
  const goal = data.goal || data.workDescription || engineData.currentAction?.title || "";
  const projectName = data.projectName || null;
  const actions = data.actions || [];
  const observations = data.observations || [];
  const stats = data.stats || { tokens: 0, runtime: 0 };
  const claudeCode = data.claudeCode || { active: false };
  const isClaudeCodeActive = claudeCode.active;

  // Waiting reasons for idle state
  const waitingReasons = useMemo(() => {
    const stateKey = (state || "IDLE").toUpperCase();
    if (stateKey === "IDLE" || modelStatus.isPaused) {
      try {
        return getGoalManager().getWaitingReasons();
      } catch { return []; }
    }
    return [];
  }, [state, modelStatus.isPaused]);

  // Background projects
  const backgroundProjects = useMemo(() => {
    if ((state || "").toUpperCase() !== "IDLE") return [];
    try {
      const bgManager = getBackgroundProjectsManager();
      const displayData = bgManager.getDisplayData();
      if (!displayData.initialized) return [];
      return displayData.projects.filter(p => p.status === "active" || p.status === "triggered");
    } catch { return []; }
  }, [state]);

  // Build action timeline
  const timeline = useMemo(() => {
    const items = actions.map(a => ({ ...a, itemType: "action" }));
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (modelStatus.isPaused) {
      return items.filter(i => i.status === "DONE" || i.status === "completed").slice(0, 3);
    }
    const start = Math.min(scrollOffset, Math.max(0, items.length - 4));
    return items.slice(start, start + 4);
  }, [actions, modelStatus.isPaused, scrollOffset]);

  // Get model info for header
  const claudeCodeStatus = isClaudeCodeLoggedIn();
  const config = getMultiAIConfig();
  let modelName = "No Model";
  let modelColor = THEME.error;

  if (claudeCodeStatus.loggedIn) {
    modelName = "Claude Code CLI";
    modelColor = "#f59e0b";
  } else if (config.gptInstant?.ready || config.gptThinking?.ready) {
    modelName = "GPT-5.2";
    modelColor = "#10a37f";
  } else if (config.claude?.ready) {
    modelName = "Claude";
    modelColor = "#d97706";
  }

  const isThinking = state && !["IDLE", "OBSERVING"].includes(state.toUpperCase());
  const isIdle = (state || "IDLE").toUpperCase() === "IDLE";

  return e(
    Box,
    { flexDirection: "column", paddingX: compact ? 0 : 1 },

    // ═══════════════════════════════════════════════════════════════════════
    // HEADER: ENGINE ● Model · Stats
    // ═══════════════════════════════════════════════════════════════════════
    !overlayHeader && e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between" },
        // Left: ENGINE + dot + model
        e(
          Box,
          { flexDirection: "row" },
          e(Text, { color: THEME.muted, bold: true }, "ENGINE"),
          e(Text, { color: dotVisible ? THEME.gray : THEME.dim }, " ● "),
          e(Text, { color: modelColor, bold: true }, modelName),
          isClaudeCodeActive && e(Text, { color: THEME.dim }, " · "),
          isClaudeCodeActive && e(Text, { color: "#f97316", backgroundColor: "#7c2d12", bold: true }, " ACTIVE "),
          !isClaudeCodeActive && claudeCodeStatus.loggedIn && e(Text, { color: THEME.dim }, " · Ready")
        ),
        // Right: Stats
        e(StatsLine, { tokens: stats.tokens, runtime: stats.runtime })
      ),
      e(Text, { color: "#1e293b" }, "─".repeat(60))
    ),

    // ═══════════════════════════════════════════════════════════════════════
    // BODY: CLI Output OR Normal Engine Display
    // ═══════════════════════════════════════════════════════════════════════

    // If CLI is streaming, show its output
    (cliStreaming || actionStreamingText) ? e(
      CLIOutputStream,
      { text: actionStreamingText, isStreaming: cliStreaming, scrollOffset, goal, state }
    ) : e(
      Box,
      { flexDirection: "column" },

      // Model status banner (when paused)
      modelStatus.isPaused && e(ModelStatusBanner, { hasModel: modelStatus.hasModel, tokensExceeded: modelStatus.tokensExceeded, provider: modelStatus.provider }),

      // State display: Thinking (orange shimmer) or Idle
      isThinking && !modelStatus.isPaused && e(ThinkingState, { state: stateInfo?.text || state, goal, projectName }),
      isIdle && e(IdleState, { waitingReasons, backgroundProjects }),

      // Space before actions
      e(Text, { color: THEME.dim }, " "),

      // Actions timeline
      ...timeline.map((action, i) => {
        const tool = action.verb || action.type || "Action";
        const target = action.target || action.detail || "";
        const status = action.status?.toLowerCase() || "working";
        const result = action.result;

        return e(
          Box,
          { key: action.id || i, flexDirection: "column", marginBottom: 1 },
          e(ToolCallLine, { tool, target, status, result, privateMode }),
          // Diff view for file operations
          action.diff && e(DiffView, { diff: action.diff, isNewFile: tool === "Write" })
        );
      }),

      // Observations
      !compact && observations.slice(0, 2).map((obs, i) =>
        e(ObservationLine, { key: i, text: obs.text || obs, privateMode })
      )
    )
  );
};

export const AgentActivityPanel = memo(AgentActivityPanelBase);

/**
 * Compact status dot for headers
 */
export const AgentStatusDot = memo(({ state = "OBSERVING" }) => {
  const stateInfo = AGENT_STATES[state] || AGENT_STATES.OBSERVING;
  return e(Text, { color: stateInfo?.color || THEME.gray }, "●");
});

export default AgentActivityPanel;
