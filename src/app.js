import React, { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { Box, Text, useStdout, Static, useInput } from "ink";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { COMMANDS, COMMAND_DESCRIPTIONS } from "./commands.js";
import { DEFAULTS } from "./config/defaults.js";
import { buildStatusMessage } from "./data/status.js";
import {
  applyLiveChanges,
  applyLiveScores,
  buildMockTickers,
  buildInitialTickers,
  buildSignalsFromBars,
  buildTickerEngine,
  enrichTickerEngine,
  formatPercent,
  formatSignal,
  getTickerIcon
} from "./data/tickers.js";
import { buildDefaultWeights, buildScoringEngine, normalizeWeights } from "./data/scoring.js";
import { buildMockPortfolio, buildPortfolioFromAlpaca, buildEmptyPortfolio } from "./data/portfolio.js";
import {
  getAlpacaConfig,
  fetchAccount,
  fetchPositions,
  fetchLatestBars,
  fetchLatestQuotes,
  submitOrder,
  getOrders,
  cancelOrder,
  closePosition
} from "./services/alpaca.js";
import {
  loadAlpacaConfig,
  saveAlpacaConfig,
  updateSetting as updateAlpacaSetting,
  getCurrentSettings as getAlpacaSettings,
  formatStatus as formatAlpacaStatus,
  openAlpacaForKeys,
  testAlpacaConnection,
  saveKeysToEnv,
  getSetupDisplay,
  openKeysFileInEditor,
  readKeysFile,
  SETUP_STEPS
} from "./services/alpaca-setup.js";
import { getClaudeConfig, sendMessage, streamMessage } from "./services/claude.js";
import {
  buildGoals,
  buildMockProfile,
  buildProfileFromEnv,
  mergeProfileData,
  hasProfileData,
  buildEmptyProfile
} from "./data/profile.js";
import {
  getLinkedInConfig,
  buildLinkedInProfile,
  buildLinkedInProfileFromUrl,
  fetchLinkedInMessages,
  getLinkedInMeta,
  updateLinkedInMeta
} from "./services/linkedin.js";
import { getOuraConfig, buildOuraHealthSummary } from "./services/oura.js";
import { getSocialConfig, buildSocialConnectionsSummary, getConnectionPrompts } from "./services/social.js";
import { getCloudSyncConfig, syncBackboneState, checkPhoneInput } from "./services/cloud-sync.js";
import { saveAllMemory } from "./services/memory.js";
import { getEmailConfig, buildEmailSummary } from "./services/email.js";
import { getWealthConfig, buildWealthSummary } from "./services/wealth.js";
import { fetchTickers as fetchYahooTickers, startServer as startYahooServer, isServerRunning } from "./services/yahoo-client.js";
import { extractLinkedInProfile, saveLinkedInProfile, loadLinkedInProfile, isProfileIncomplete, refreshAndGenerateLinkedInMarkdown, generateLinkedInMarkdown } from "./services/linkedin-scraper.js";
import { getDataFreshnessChecker } from "./services/data-freshness-checker.js";
import { getGoalsStatus, launchGoalsVoiceApp } from "./services/goals-voice.js";
import { loadTradingStatus, saveTradingStatus, buildTradingStatusDisplay, recordTradeAttempt, resetTradingStatus } from "./services/trading-status.js";
import { deleteAllData, getResetSummary, RESET_STEPS } from "./services/reset.js";
import { sendMessage as sendMultiAI, getAIStatus, getMultiAIConfig, getCurrentModel, MODELS, TASK_TYPES, isAgenticTask, executeAgenticTask, getAgenticCapabilities } from "./services/multi-ai.js";
import { formatToolsList, getToolsSummary, enableServer, disableServer } from "./services/mcp-tools.js";
import { loadActionsQueue, getActionsDisplay, queueAction, startNextAction, completeAction, initializeDefaultActions, ACTION_TYPES } from "./services/actions-engine.js";
import { loadProfileSections, updateFromLinkedIn, updateFromHealth, updateFromPortfolio, getProfileSectionDisplay, getProfileOverview, PROFILE_SECTIONS } from "./services/profile-sections.js";
import { getGitHubConfig, getGitHubStatus } from "./services/github.js";
import { openUrl } from "./services/open-url.js";
import { SetupStatus } from "./components/setup-wizard.js";
import { LifeFeed, LifeChanges } from "./components/life-feed.js";
import { ProfilePanel } from "./components/profile-panel.js";
import { PortfolioPanel } from "./components/portfolio-panel.js";
import { StatusPanel } from "./components/status-panel.js";
import { CommandsPanel } from "./components/commands-panel.js";
import { ChatPanel } from "./components/chat-panel.js";
import { TickerPanel } from "./components/ticker-panel.js";
import { Header } from "./components/header.js";
import { ConversationPanel } from "./components/conversation-panel.js";
import { ActionsPanel } from "./components/actions-panel.js";
import { SetupOverlay, getAlpacaSetupTabs, getLinkedInSetupTabs, getOuraSetupTabs, getLLMSetupTabs, getModelsSetupTabs, getEmailSetupTabs, getCalendarSetupTabs, getProjectSetupTabs } from "./components/setup-overlay.js";
import { openAlpacaKeys, openOuraKeys, openLLMKeys, readAlpacaKeysFile, watchKeysFile, saveToEnv, SETUP_TYPES } from "./services/setup-manager.js";
import { buildLifeEvent, buildLifeFeed, buildLifeChanges } from "./data/life-engine.js";
import { DiagnosticsPanel, STATUS_TYPES } from "./components/diagnostics-panel.js";
import { createProject, createProjectAction, listProjects, createProjectsFromGoals, appendProjectResearch } from "./services/projects.js";
import { getAIBrain } from "./services/ai-brain.js";
import { getAPIQuotaMonitor, BILLING_URLS } from "./services/api-quota-monitor.js";
import { QuotaExceededAlert, QuotaWarningBadge } from "./components/quota-exceeded-alert.js";
import { calculateComprehensiveScore, getSignal, WEIGHT_PROFILES, THRESHOLDS } from "./services/scoring-criteria.js";
import { getRiskyTickers, fetchAllRiskyK8Filings, getSignificantK8Tickers } from "./services/edgar-k8.js";
import {
  PROVIDERS,
  PROVIDER_LIST,
  MODEL_TIERS,
  getConnectionStatus,
  getCurrentTier,
  setModelTier,
  cycleTier,
  getTierDisplay,
  openApiKeyPage,
  saveApiKey,
  setPrimaryProvider,
  getModelsStatusDisplay,
  testConnection,
  testAllConnections
} from "./services/models-setup.js";
import { getTradingHistory, getNextTradingTime, formatTimeAgo } from "./services/trading-history.js";
import { TradingHistoryPanel } from "./components/trading-history-panel.js";
import { TestRunnerPanel } from "./components/test-runner-panel.js";
import { SettingsPanel } from "./components/settings-panel.js";
import { LinkedInDataViewer } from "./components/linkedin-data-viewer.js";
import { loadUserSettings, saveUserSettings, updateSettings as updateUserSettings, updateSetting, getModelConfig, isProviderConfigured } from "./services/user-settings.js";
import { hasValidCredentials as hasCodexCredentials } from "./services/codex-oauth.js";
import { loadFineTuningConfig, saveFineTuningConfig, runFineTuningPipeline, queryFineTunedModel } from "./services/fine-tuning.js";
import { monitorAndTrade, loadConfig as loadTradingConfig, setTradingEnabled } from "./services/auto-trader.js";
import { isMarketOpen } from "./services/trading-status.js";
import { analyzeAllPositions, getPositionContext, explainWhyHeld } from "./services/position-analyzer.js";

// New autonomous system imports
import { getAutonomousEngine, AI_ACTION_STATUS, AI_ACTION_TYPES, EXECUTION_TOOLS } from "./services/autonomous-engine.js";
import { getGoalManager, WORK_PHASES, GOAL_PRIORITY } from "./services/goal-manager.js";
import { getToolExecutor, TOOL_TYPES, EXECUTION_STATUS } from "./services/tool-executor.js";
import { getClaudeOrchestrator, EVALUATION_DECISION, ORCHESTRATION_STATE } from "./services/claude-orchestrator.js";
import { getClaudeCodeBackend } from "./services/claude-code-backend.js";
import { initializeClaudeCodeEngine, EXECUTION_MODE, getClaudeCodeExecutor } from "./services/claude-code-executor.js";
import { getClaudeCodeStatus, isClaudeCodeLoggedIn } from "./services/claude-code-cli.js";
import { getWorkLog, LOG_SOURCE, LOG_STATUS } from "./services/work-log.js";
import { getGoalTracker, GOAL_CATEGORY } from "./services/goal-tracker.js";
import { getLifeScores } from "./services/life-scores.js";
import { getProgressResearch } from "./services/progress-research.js";
import { getTargetPerson } from "./services/person-matcher.js";
import { getLifeEngine } from "./services/life-engine.js";
import { getMobileService } from "./services/mobile.js";
import { WorkLogPanel } from "./components/work-log-panel.js";
import { GoalProgressPanel } from "./components/goal-progress-panel.js";
import { SmartGoalsPanel } from "./components/goals-panel.js";
import { ProjectsPanel } from "./components/projects-panel.js";
import { LifeScoresPanel, ParallelWorldPanel } from "./components/life-scores-panel.js";
import { EnhancedActionsPanel, CompletedActionsList } from "./components/enhanced-actions-panel.js";
import { ApprovalOverlay, QuickApprovalBar } from "./components/approval-overlay.js";
import { ConnectionPanel } from "./components/connection-bar.js";
import { WealthPanel, WealthCompact, ConnectionsStatusPanel } from "./components/wealth-panel.js";
import OuraHealthPanel from "./components/oura-health-panel.js";
import { OnboardingPanel } from "./components/onboarding-panel.js";
import { SplashScreen } from "./components/splash-screen.js";
// ToolActionsPanel removed - merged into AgentActivityPanel
import { resizeForOnboarding, resizeForMainApp, TERMINAL_SIZES } from "./services/terminal-resize.js";
import { processAndSaveContext, buildContextForAI } from "./services/conversation-context.js";
import { MENTORS, MENTOR_CATEGORIES, getMentorsByCategory, getDailyWisdom, formatMentorDisplay, getAllMentorsDisplay, getMentorAdvice } from "./services/mentors.js";
import { generateDailyInsights, generateWeeklyReport, formatInsightsDisplay, formatWeeklyReportDisplay, getQuickStatus } from "./services/insights-engine.js";
import { processMessageForGoals, getGoalSummary, formatGoalsDisplay, loadGoals } from "./services/goal-extractor.js";
import { generateGoalsFromData, generateGoalsFromInput, generateDiscoveryQuestions, processDiscoveryAnswers, saveGeneratedGoals, quickGenerateGoals } from "./services/goal-generator.js";
import { loadUserContextFiles } from "./services/service-utils.js";
import { getFreshnessReport, getSuggestedActions, runFullDataCheck } from "./services/data-freshness-checker.js";
import { getTodayHabits, getHabitsSummary, formatHabitsDisplay, addHabit, completeHabit, RECOMMENDED_HABITS } from "./services/habits.js";
import { sendDailyDigest, sendWeeklyReport, getNotificationStatus, NOTIFICATION_TYPES } from "./services/notifications.js";
import { generateRecommendations, getTopRecommendations, actOnRecommendation, dismissRecommendation, formatRecommendationsDisplay, getDailyFocus } from "./services/recommendations-engine.js";
import { isReviewDue, startReview, saveReview, getReviewHistory, getReviewStats, formatReviewDisplay } from "./services/weekly-review.js";
import { getLifeDashboard, formatDashboardDisplay, getQuickDashboard } from "./services/life-dashboard.js";
import { getAccountabilityStatus, formatAccountabilityDisplay, recordCheckIn, addCommitment, completeCommitment, getActiveCommitments, getMorningBriefing, addPartner } from "./services/accountability.js";
import { startSession, endSession, pauseSession, resumeSession, getSessionStatus, formatFocusDisplay, getTodayStats as getFocusTodayStats } from "./services/focus-timer.js";
import { addLearningItem, startLearning, updateProgress, completeLearning, addNote, getInProgress, getReadingList, formatLearningDisplay, getCurrentlyReading } from "./services/learning-tracker.js";
import { getCurrentFirebaseUser, signOutFirebase } from "./services/firebase-auth.js";
import { initializeRemoteConfig } from "./services/firebase-config.js";
import { isOuraConfigured, syncOuraData, getNextSyncTime, getHealthSummary, loadOuraData } from "./services/oura-service.js";
import { isEmailConfigured, syncEmailCalendar, getEmailSummary, getUpcomingEvents } from "./services/email-calendar-service.js";
import { getPersonalCapitalService } from "./services/personal-capital.js";
import { getPlaidService, isPlaidConfigured, syncPlaidData } from "./services/plaid-service.js";
import { runUserEvaluationCycle } from "./services/analysis-scheduler.js";

// Life Management Engine imports
import { getLifeManagementEngine, LIFE_AREAS } from "./services/life-management-engine.js";
import { getDisasterMonitor } from "./services/disaster-monitor.js";
import { getPolymarketService } from "./services/polymarket-service.js";
import { getConversationTracker } from "./services/conversation-tracker.js";
import { getProactiveEngine } from "./services/proactive-engine.js";
import { getFirebaseMessaging } from "./services/firebase-messaging.js";

// Engine state and new panels
import { getEngineStateManager, ENGINE_STATUS } from "./services/engine-state.js";
// EngineStatusPanel removed - merged into AgentActivityPanel
import { EngineStatusLine } from "./components/engine-status-panel.js";
import { TickerScoresPanel, TickerSummaryLine } from "./components/ticker-scores-panel.js";
import { getOverlayRenderer } from "./services/overlay-renderer.js";
import { getActivityNarrator, AGENT_STATES } from "./services/activity-narrator.js";

// Activity tracker for agent status display
import { getActivityTracker, ACTIVITY_STATUS } from "./services/activity-tracker.js";
import { AgentActivityPanel, AgentStatusDot } from "./components/agent-activity-panel.js";
import { useStoreSync, STATE_SLICES } from "./hooks/useStoreSync.js";

// Isolated column components for reduced flickering
import { LeftSidebar } from "./components/left-sidebar.js";
import { RightSidebar } from "./components/right-sidebar.js";
import { TopStatusBar } from "./components/top-status-bar.js";
import { BottomStatusBar } from "./components/bottom-status-bar.js";

// Note: Store sync removed - passing props directly to column components now

const e = React.createElement;

const deepEqual = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (error) {
    return a === b;
  }
};

// View modes: minimal, core (default), advanced
export const VIEW_MODES = {
  MINIMAL: "minimal",
  CORE: "core",
  ADVANCED: "advanced"
};

const VIEW_MODE_LABELS = {
  minimal: "Minimal",
  core: "Core",
  advanced: "Advanced"
};

const OVERLAY_CONNECTION_HEIGHT = 3;
const OVERLAY_ENGINE_HEIGHT = 14;
const OVERLAY_ENGINE_HEADER_HEIGHT = 3;
const CONNECTION_BAR_MARGIN = 1;
const DEFAULT_CONNECTION_STATUSES = {
  alpaca: { connected: false, status: "never", details: "" },
  claude: { connected: false, status: "never", details: "" },
  claudeCode: { connected: false, status: "never", details: "" },
  linkedin: { connected: false, status: "never", details: "" },
  oura: { connected: false, status: "never", details: "" },
  yahoo: { connected: true, status: "connected", details: "" },
  personalCapital: { connected: false, status: "never", details: "" }
};

const SCORE_REFRESH_MS = 30_000; // Reduced from 5s to 30s
const LIVE_SCORE_REFRESH_MS = 60_000; // Reduced from 30s to 60s
const QUOTE_REFRESH_MS = 10_000; // Reduced from 1s to 10s to prevent glitching
const PORTFOLIO_REFRESH_MS = 30_000; // Reduced from 5s to 30s
const CLOUD_SYNC_MS = 120_000; // Sync to cloud every 2 minutes
const MEMORY_SAVE_MS = 300_000; // Save memory every 5 minutes
const FRESHNESS_CHECK_MS = 4 * 60 * 60 * 1000; // Check data freshness every 4 hours (6x per day)

const chunkSymbols = (symbols, size) => {
  const batches = [];
  for (let i = 0; i < symbols.length; i += size) {
    batches.push(symbols.slice(i, i + size));
  }
  return batches;
};

const YAHOO_FINANCE_REFRESH_MS = 180000; // 3 minutes

const App = ({ updateConsoleTitle }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [lifeEngineCoverage, setLifeEngineCoverage] = useState(0);
  const [lifeEngineReady, setLifeEngineReady] = useState(false);
  // Pulsing dot for connection status (toggles every 500ms)
  const [pulsingDotVisible, setPulsingDotVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setPulsingDotVisible(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, []);
  const [activeCommand, setActiveCommand] = useState("/account");
  const [lastAction, setLastAction] = useState("Ready");
  const [currentTier, setCurrentTier] = useState(() => getCurrentTier());
  const [privateMode, setPrivateMode] = useState(false);
  const [viewMode, setViewMode] = useState(VIEW_MODES.CORE); // Core is default
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pauseUpdates, setPauseUpdates] = useState(false);
  const pauseUpdatesRef = useRef(false); // Use ref to avoid re-renders in intervals
  const [mainViewReady, setMainViewReady] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [forceRenderKey, setForceRenderKey] = useState(0); // Force re-render after layout adjusts
  const readinessTimerRef = useRef(null);
  const layoutKickTimerRef = useRef(null);
  const linkedInCheckTimerRef = useRef(null);
  const { stdout } = useStdout();
  const initialSettingsRef = useRef(loadUserSettings());
  const [userSettings, setUserSettings] = useState(initialSettingsRef.current);
  const [showOnboarding, setShowOnboarding] = useState(!initialSettingsRef.current.onboardingComplete);
  const [firebaseUser, setFirebaseUser] = useState(() => initialSettingsRef.current.firebaseUser || getCurrentFirebaseUser());

  const getOpenAIModelSource = (modelInfo) => {
    if (!modelInfo) return null;
    const modelId = modelInfo.id || "";
    const modelName = modelInfo.name || "";
    const isOpenAIModel = modelId.startsWith("gpt-") || modelName.startsWith("GPT-");
    if (!isOpenAIModel) return null;

    const hasCodexAuth = hasCodexCredentials();
    const prefersCodex = userSettings?.coreModelProvider === "openai-codex";

    if (prefersCodex && hasCodexAuth) return "Codex";
    if (process.env.OPENAI_API_KEY) return "API";
    if (hasCodexAuth) return "Codex";
    return null;
  };

  const buildModelDisplayInfo = (modelInfo, taskType) => {
    if (!modelInfo) return null;
    const sourceLabel = getOpenAIModelSource(modelInfo);
    const suffix = sourceLabel ? ` (${sourceLabel})` : "";
    const nameBase = modelInfo.name || modelInfo.shortName || "GPT-5.2";
    const shortNameBase = modelInfo.shortName || modelInfo.name || "GPT-5.2";

    return {
      ...modelInfo,
      taskType,
      sourceLabel,
      displayName: `${nameBase}${suffix}`,
      shortNameWithSource: `${shortNameBase}${suffix}`
    };
  };
  // Basic firebase user name (job title added later when linkedInProfile is available)
  const firebaseUserName = useMemo(() => {
    if (!firebaseUser) return "";
    return firebaseUser.name || firebaseUser.email?.split("@")[0] || "User";
  }, [firebaseUser]);

  const syncUserSettings = useCallback(() => {
    setUserSettings(loadUserSettings());
  }, []);

  useEffect(() => {
    if (!showOnboarding) {
      syncUserSettings();
    }
  }, [showOnboarding, syncUserSettings]);

  useEffect(() => {
    const latestUser = userSettings?.firebaseUser || getCurrentFirebaseUser();
    setFirebaseUser(latestUser);
  }, [userSettings]);

  const nudgeStdoutSize = useCallback((preset) => {
    if (!stdout) return;
    const size = TERMINAL_SIZES[preset] || TERMINAL_SIZES.main;
    stdout.columns = size.cols;
    stdout.rows = size.rows;
    if (stdout.emit) {
      stdout.emit("resize");
    }
  }, [stdout]);

  // Initialize app: load remote config from Firebase, then show main app
  useEffect(() => {
    const init = async () => {
      // Load API keys from Firebase (Plaid, Google, Alpaca, OpenAI)
      await initializeRemoteConfig();

      // Run API health check to verify tokens are available
      // This clears quota exceeded state if tokens were added
      try {
        const quotaMonitor = getAPIQuotaMonitor();
        await quotaMonitor.checkAllProviders();
      } catch (e) {
        // Silent fail - health check is optional
      }

      // Wait minimum 1 second for splash screen (reduced for faster startup)
      setTimeout(() => {
        // Clear screen before transitioning from splash to main view
        process.stdout.write("\x1b[2J\x1b[1;1H");
        setIsInitializing(false);
        // Don't resize terminal - run in current terminal size
        // Emit resize event to ensure layout calculates correctly
        setTimeout(() => {
          if (process.stdout.emit) {
            process.stdout.emit("resize");
          }
        }, 50);
      }, 1000);
    };
    init();
  }, [nudgeStdoutSize]);

  const resizeTimersRef = useRef([]);
  const mainViewTimersRef = useRef([]);

  const clearResizeTimers = useCallback(() => {
    resizeTimersRef.current.forEach((id) => clearTimeout(id));
    resizeTimersRef.current = [];
  }, []);

  const clearMainViewTimers = useCallback(() => {
    mainViewTimersRef.current.forEach((id) => clearTimeout(id));
    mainViewTimersRef.current = [];
  }, []);

  // Force layout recalculation by emitting resize event and clearing screen
  const forceLayoutRefresh = useCallback(() => {
    // Clear screen and reset cursor (more aggressive than just nudging)
    process.stdout.write("\x1b[2J\x1b[1;1H");
    // Emit resize event to force Ink to recalculate layout
    if (process.stdout.emit) {
      process.stdout.emit("resize");
    }
    // Also trigger a state update to force re-render
    setForceRenderKey((k) => k + 1);
  }, []);

  // Simple layout setup - no multiple refreshes, just show the view
  const scheduleResize = useCallback(() => {
    clearResizeTimers();
    // Clear screen once
    process.stdout.write("\x1b[2J\x1b[1;1H");
    // Mark layout ready immediately - no delays
    setLayoutReady(true);
  }, [clearResizeTimers]);

  // Layout setup after onboarding completes - simple, no glitching
  useEffect(() => {
    if (showOnboarding || isInitializing) {
      setLayoutReady(false);
      return;
    }
    // Just mark ready, no multiple refreshes
    scheduleResize();
  }, [showOnboarding, isInitializing, scheduleResize]);

  // Oura Ring data sync scheduler (8am and 8pm daily)
  useEffect(() => {
    if (!isOuraConfigured()) return;

    const scheduleNextSync = () => {
      const nextSync = getNextSyncTime();
      const msUntilSync = nextSync.getTime() - Date.now();

      return setTimeout(async () => {
        await syncOuraData();
        // Schedule the next sync after this one completes
        scheduleNextSync();
      }, msUntilSync);
    };

    // Initial sync on startup
    syncOuraData();
    const timerId = scheduleNextSync();

    return () => clearTimeout(timerId);
  }, []);

  // Email & Calendar sync scheduler (every 15 minutes)
  useEffect(() => {
    if (!isEmailConfigured()) return;

    // Initial sync on startup
    syncEmailCalendar();

    // Sync every 15 minutes
    const intervalId = setInterval(() => {
      syncEmailCalendar();
    }, 15 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Personal Capital sync scheduler (once daily at 6am, and on startup)
  useEffect(() => {
    const pcService = getPersonalCapitalService();
    const config = pcService.getConfig();
    if (!config.authenticated) return;

    // Sync on startup if data is stale
    if (pcService.isStale()) {
      pcService.fetchAll();
    }

    // Schedule daily sync at 6am
    const scheduleNextSync = () => {
      const now = new Date();
      const next6am = new Date(now);
      next6am.setHours(6, 0, 0, 0);
      if (now >= next6am) {
        next6am.setDate(next6am.getDate() + 1);
      }
      const msUntilSync = next6am.getTime() - now.getTime();

      return setTimeout(async () => {
        await pcService.fetchAll();
        scheduleNextSync();
      }, msUntilSync);
    };

    const timerId = scheduleNextSync();
    return () => clearTimeout(timerId);
  }, []);

  // Plaid sync scheduler (every 4 hours, and on startup)
  useEffect(() => {
    if (!isPlaidConfigured()) return;

    const plaidService = getPlaidService();

    // Sync on startup if data is stale
    if (plaidService.isStale()) {
      syncPlaidData();
    }

    // Sync every 4 hours
    const intervalId = setInterval(() => {
      syncPlaidData();
    }, 4 * 60 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  const [fineTuningStatus, setFineTuningStatus] = useState(() => loadFineTuningConfig());
  const overlayRendererRef = useRef(null);
  const overlaySuspendTimerRef = useRef(null);
  const [overlaySuspended, setOverlaySuspended] = useState(false);
  const overlayDataRef = useRef({});
  const activityNarrator = useMemo(() => getActivityNarrator(), []);

  // Engine state manager
  const engineState = useMemo(() => getEngineStateManager(), []);
  const [engineStatus, setEngineStatus] = useState(() => engineState.getDisplayData());

  // Engine scroll offset for keyboard navigation (up/down arrows when not typing)
  const [engineScrollOffset, setEngineScrollOffset] = useState(0);
  const maxEngineScroll = 20; // Maximum number of actions to scroll through

  // Typing state refs - declared early so keyboard shortcuts can check them
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef(null);

  // Handle keyboard shortcuts: Ctrl+T (tier), Ctrl+R (test runner), Ctrl+P (private mode), Ctrl+U (view mode), Ctrl+S (settings)
  // NOTE: These shortcuts only work when NOT typing in the chat input
  useInput((input, key) => {
    // Skip all shortcuts while user is typing in chat
    if (isTypingRef.current) return;

    const lower = input.toLowerCase();
    if (!showTestRunner && !showSettings) {
      if (lower === "l" && !firebaseUser) {
        setShowOnboarding(true);
        setLastAction("Sign-in requested");
        return;
      }
      if (lower === "o" && firebaseUser) {
        handleLogout();
        return;
      }
    }
    if (showTestRunner || showSettings) return;

    if (key.ctrl && input === "t") {
      const result = cycleTier();
      if (result.success) {
        setCurrentTier(result.tier);
        setLastAction(`Tier: ${result.label}`);
      }
    }
    if (key.ctrl && input === "r") {
      // Ctrl+R: Open test runner
      setShowTestRunner(true);
      setLastAction("Test Runner opened");
    }
    if (key.ctrl && !key.shift && input === "s") {
      // Ctrl+S: Go to onboarding/setup view
      setShowOnboarding(true);
      setLastAction("Setup opened");
    }
    if (key.ctrl && input === "p") {
      // Ctrl+P: Toggle private mode
      setPrivateMode(prev => !prev);
      setLastAction(privateMode ? "Private mode OFF" : "Private mode ON");
    }
    if (key.ctrl && input === "u") {
      // Cycle view mode: core -> advanced -> minimal -> core
      setViewMode(prev => {
        const next = prev === VIEW_MODES.CORE ? VIEW_MODES.ADVANCED :
                     prev === VIEW_MODES.ADVANCED ? VIEW_MODES.MINIMAL :
                     VIEW_MODES.CORE;
        setLastAction(`View: ${VIEW_MODE_LABELS[next]}`);
        return next;
      });
    }
    if (key.ctrl && key.shift && lower === "s") {
      // Ctrl+Shift+S: Open onboarding/setup wizard
      setShowOnboarding(true);
      setLastAction("Setup wizard opened");
    }
    // Arrow keys: Scroll engine section when not typing
    if (key.upArrow) {
      setEngineScrollOffset(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setEngineScrollOffset(prev => Math.min(maxEngineScroll, prev + 1));
      return;
    }

    if (key.ctrl && input === "m") {
      // Ctrl+M: Go to main view (close any overlays if allowed)
      if (showOnboarding) {
        // Only allow if required steps are complete (google login and model)
        const hasLogin = !!firebaseUser;
        const hasModel = isProviderConfigured("anthropic") || isProviderConfigured("openai") || isProviderConfigured("google");
        if (hasLogin && hasModel) {
          // Clear screen to prevent layout artifacts during transition
          process.stdout.write("\x1b[2J\x1b[1;1H");
          setShowOnboarding(false);
          setLastAction("Returned to main");
          // Force layout recalculation
          setTimeout(() => {
            if (process.stdout.emit) {
              process.stdout.emit("resize");
            }
            setForceRenderKey((k) => k + 1);
          }, 50);
        }
      } else if (showSettings) {
        setShowSettings(false);
        setLastAction("Returned to main");
      } else if (showTestRunner) {
        setShowTestRunner(false);
        setLastAction("Returned to main");
      }
    }
  });
  const handleLogout = useCallback(() => {
    signOutFirebase();
    const currentSettings = loadUserSettings();
    updateUserSettings({
      firebaseUser: null,
      onboardingComplete: false,
      connections: { ...currentSettings.connections, google: false }
    });
    syncUserSettings();
    pauseUpdatesRef.current = true;
    setPauseUpdates(true);
    setShowOnboarding(true);
    setFirebaseUser(null);
    setLastAction("Logged out");
  }, [syncUserSettings]);
  const [weights, setWeights] = useState(() => buildDefaultWeights());
  const [setupOverlay, setSetupOverlay] = useState({
    active: false,
    type: null
  });
  const [modelsConfig, setModelsConfig] = useState({
    selectedModel: "claude-opus-4.5",
    connectionType: "pro"
  });
  const scoringEngine = useMemo(() => buildScoringEngine(weights), [weights]);
  const tickerEngine = useMemo(() => {
    const baseEngine = buildTickerEngine();
    return enrichTickerEngine(baseEngine, scoringEngine);
  }, [scoringEngine]);

  // Initialize with mock data for development, initial tickers for production
  const useMockData = process.env.USE_MOCK_DATA === "true";
  const [tickers, setTickers] = useState(() => (useMockData ? buildMockTickers(tickerEngine) : buildInitialTickers()));
  const [portfolio, setPortfolio] = useState(() => {
    if (useMockData) return buildMockPortfolio();
    return buildEmptyPortfolio();
  });

  // Fetch portfolio data immediately on mount
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    const config = getAlpacaConfig();
    if (!config.ready) return;

    // Immediate fetch on startup
    (async () => {
      try {
        const [account, positions] = await Promise.all([
          fetchAccount(config),
          fetchPositions(config)
        ]);
        const newPortfolio = buildPortfolioFromAlpaca(account, positions);
        setPortfolio(newPortfolio);
        setAlpacaStatus("Live");
        setAlpacaMode(config.mode === "live" ? "Live" : "Paper");
        isLiveRef.current = true;
      } catch (err) {
        process.stderr.write(`[Alpaca Init Error] ${err.message}\n`);
      }
    })();
  }, []);
  const [priceHistory, setPriceHistory] = useState({});
  const [profile, setProfile] = useState(() => (useMockData ? buildMockProfile() : buildEmptyProfile()));

  // New integration states
  const [linkedInProfile, setLinkedInProfile] = useState(null);
  const [linkedInMessages, setLinkedInMessages] = useState([]);
  const [ouraHealth, setOuraHealth] = useState(null);
  const [ouraHistory, setOuraHistory] = useState(() => {
    const stored = loadOuraData();
    return stored?.history || [];
  });
  const [personalCapitalData, setPersonalCapitalData] = useState(null);
  const [socialConnections, setSocialConnections] = useState(null);

  // User display with job title from LinkedIn (shows that data is being tracked)
  const firebaseUserDisplay = useMemo(() => {
    const baseName = firebaseUserName || "User";
    // Get job title from LinkedIn profile headline
    const jobTitle = linkedInProfile?.headline || linkedInProfile?.currentPosition?.title;
    if (jobTitle) {
      return `${baseName} (${jobTitle})`;
    }
    return baseName;
  }, [firebaseUserName, linkedInProfile]);

  const userDisplayName = useMemo(() => {
    return linkedInProfile?.name || profile?.name || process.env.USER_NAME || "Frank";
  }, [linkedInProfile?.name, profile?.name]);

  const weightsRef = useRef(weights);
  const portfolioRef = useRef(portfolio);
  const profileRef = useRef(profile);
  const ouraHealthRef = useRef(ouraHealth);
  const socialConnectionsRef = useRef(socialConnections);
  const integrationsRef = useRef(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(null);
  const [lifeChanges, setLifeChanges] = useState(() => buildLifeChanges(10));

  // Trading status (persistent)
  const [tradingStatus, setTradingStatus] = useState(() => buildTradingStatusDisplay(loadTradingStatus()));

  // Trading history (8-week performance)
  const [tradingHistory, setTradingHistory] = useState(null);
  const [portfolioLastUpdated, setPortfolioLastUpdated] = useState(null);
  const [nextTradeTimeDisplay, setNextTradeTimeDisplay] = useState(null);

  // LinkedIn data viewer
  const [showLinkedInViewer, setShowLinkedInViewer] = useState(false);
  const [linkedInViewerData, setLinkedInViewerData] = useState(null);

  // ===== NEW AUTONOMOUS SYSTEM STATE =====
  const autonomousEngine = useMemo(() => getAutonomousEngine(), []);
  const goalManager = useMemo(() => getGoalManager(), []);
  const toolExecutor = useMemo(() => getToolExecutor(), []);
  const claudeCodeBackend = useMemo(() => getClaudeCodeBackend(), []);
  const workLog = useMemo(() => getWorkLog(), []);
  const goalTracker = useMemo(() => getGoalTracker(), []);
  const lifeScores = useMemo(() => getLifeScores(), []);
  const mobileService = useMemo(() => getMobileService(), []);
  const personalCapitalRef = useRef(null);

  // ===== LIFE MANAGEMENT ENGINE =====
  const lifeManagementEngine = useMemo(() => getLifeManagementEngine(), []);
  const disasterMonitor = useMemo(() => getDisasterMonitor(), []);
  const polymarketService = useMemo(() => getPolymarketService(), []);
  const conversationTracker = useMemo(() => getConversationTracker(), []);
  const proactiveEngine = useMemo(() => getProactiveEngine(), []);
  const firebaseMessaging = useMemo(() => getFirebaseMessaging(), []);

  // ===== AI BRAIN - Real AI-driven decision engine =====
  const aiBrain = useMemo(() => getAIBrain(), []);

  // ===== AUTONOMOUS ENGINE AUTO-START =====
  // Connect all systems and auto-start the autonomous loop on app launch
  const autonomousEngineInitializedRef = useRef(false);

  useEffect(() => {
    if (autonomousEngineInitializedRef.current) return;
    if (showOnboarding) return; // Don't auto-start during onboarding

    const initializeAutonomousEngine = async () => {
      try {
        // Connect systems
        autonomousEngine.setGoalManager(goalManager);
        autonomousEngine.setAIBrain(aiBrain);
        autonomousEngine.setNarrator(getActivityNarrator());
        autonomousEngine.setToolExecutor(toolExecutor);

        // Initialize goal manager
        await goalManager.initialize();

        // Check for existing goals or create from context
        const existingGoals = goalManager.getActiveGoals();
        if (existingGoals.length === 0) {
          // No goals - generate from user context (portfolio, health, profile)
          const narrator = getActivityNarrator();
          narrator.setState("THINKING");
          narrator.observe("Analyzing your data to identify priorities...");

          const suggestedGoals = await aiBrain.generateGoalsFromContext();
          if (suggestedGoals.length > 0) {
            for (const goal of suggestedGoals) {
              goalManager.addGoal(goal, false);
            }
          }
        }

        // AUTO-START: Start the autonomous loop
        // Engine will auto-select highest priority goal
        const config = getMultiAIConfig();
        const hasModel = config.gptInstant?.ready || config.gptThinking?.ready || config.claude?.ready;

        // Always start the autonomous loop - it will handle missing models gracefully
        console.log("[App] Starting autonomous engine, hasModel:", hasModel);
        autonomousEngine.startAutonomousLoop();

        autonomousEngineInitializedRef.current = true;
      } catch (error) {
        console.error("[App] Failed to initialize autonomous engine:", error.message);
      }
    };

    // Delay initialization to let other systems start first
    const timer = setTimeout(initializeAutonomousEngine, 3000);
    return () => clearTimeout(timer);
  }, [showOnboarding, autonomousEngine, goalManager, aiBrain, toolExecutor]);

  // ===== API QUOTA MONITOR =====
  const quotaMonitor = useMemo(() => getAPIQuotaMonitor(), []);

  // Activity tracker for visual status display (panel subscribes directly to avoid re-renders)
  const activityTracker = useMemo(() => getActivityTracker(), []);

  const [workLogEntries, setWorkLogEntries] = useState(() => workLog.getDisplayData(15));
  const [goals, setGoals] = useState(() => goalTracker.getDisplayData());
  const [projects, setProjects] = useState(() => listProjects());
  const [lifeScoresData, setLifeScoresData] = useState(() => lifeScores.getDisplayData());
  const [autonomousState, setAutonomousState] = useState(() => autonomousEngine.getDisplayData());
  const [completedActions, setCompletedActions] = useState(() => autonomousEngine.getRecentCompleted(10));

  const updateLifeScoresData = useCallback(() => {
    const next = lifeScores.getDisplayData();
    setLifeScoresData((prev) => (deepEqual(prev, next) ? prev : next));
  }, [lifeScores]);

  const refreshAutonomousState = useCallback(() => {
    const next = autonomousEngine.getDisplayData();
    setAutonomousState((prev) => (deepEqual(prev, next) ? prev : next));
  }, [autonomousEngine]);
  const [claudeCodeStatus, setClaudeCodeStatus] = useState({ initialized: false, available: false });
  const [quotaExceeded, setQuotaExceeded] = useState(() => {
    const status = quotaMonitor.getStatus();
    return {
      openai: status.openai.quotaExceeded,
      anthropic: status.anthropic.quotaExceeded,
      showAlert: status.openai.quotaExceeded || status.anthropic.quotaExceeded,
      provider: status.openai.quotaExceeded ? "openai" : "anthropic"
    };
  });
  const [showApprovalOverlay, setShowApprovalOverlay] = useState(false);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const [connectionStatuses, setConnectionStatuses] = useState(() => ({ ...DEFAULT_CONNECTION_STATUSES }));
  const evaluationContextRef = useRef({
    tickers: [],
    portfolio: null,
    oura: null,
    profile: null,
    linkedIn: null,
    goals: [],
    emails: null,
    projects: []
  });

  useEffect(() => {
    evaluationContextRef.current = {
      tickers: tickers.slice(0, 6),
      portfolio,
      oura: ouraHealth,
      profile,
      linkedIn: linkedInProfile,
      goals,
      emails: getEmailSummary(),
      projects
    };
  }, [tickers, portfolio, ouraHealth, profile, linkedInProfile, goals, projects]);

  // Actions queue (persistent)
  const [actionsDisplay, setActionsDisplay] = useState(() => {
    initializeDefaultActions();
    return getActionsDisplay();
  });

  // Reset flow state
  const [resetFlow, setResetFlow] = useState({ step: RESET_STEPS.INITIAL, selectedOption: null });

  // Diagnostics state (startup checks)
  const [diagnostics, setDiagnostics] = useState({
    alpaca: { status: STATUS_TYPES.CHECKING },
    trading: { status: STATUS_TYPES.CHECKING },
    ticker: { status: STATUS_TYPES.CHECKING },
    model: { status: STATUS_TYPES.CHECKING },
    linkedin: { status: STATUS_TYPES.DISABLED },
    oura: { status: STATUS_TYPES.DISABLED },
    email: { status: STATUS_TYPES.DISABLED },
    calendar: { status: STATUS_TYPES.DISABLED }
  });

  // Risk mode state (conservative vs risky)
  const [riskMode, setRiskMode] = useState(() => {
    const config = loadAlpacaConfig();
    return config.risk || "conservative";
  });

  const [alpacaStatus, setAlpacaStatus] = useState("Not connected");
  const [alpacaMode, setAlpacaMode] = useState(DEFAULTS.alpaca.environment);
  const alpacaConfigRef = useRef(loadAlpacaConfig());
  const [lastQuoteUpdate, setLastQuoteUpdate] = useState("--:--");
  const lastQuoteUpdateRef = useRef("--:--");
  const [lifeFeed, setLifeFeed] = useState(() => buildLifeFeed(12)); // Doubled from 6
  const [lifeUpdatedAt, setLifeUpdatedAt] = useState("--:--:--");
  const isLive = alpacaStatus === "Live";
  const isLiveRef = useRef(false);
  const tickersRef = useRef(tickers);

  // Claude AI state
  const [claudeStatus, setClaudeStatus] = useState("Checking...");
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [actionStreamingText, setActionStreamingText] = useState("");
  const [actionStreamingTitle, setActionStreamingTitle] = useState("");
  const actionStreamBufferRef = useRef("");
  const actionStreamTimerRef = useRef(null);
  const currentActionIdRef = useRef(null);
  const [toolEvents, setToolEvents] = useState([]);
  const toolEventsRef = useRef([]);
  const toolEventActionMapRef = useRef(new Map());
  const toolEventKeysRef = useRef(new Set());
  const [uiClock, setUiClock] = useState(() => Date.now());

  // Recent user queries for conversation display (shows under ENGINE panel)
  // Each entry: { id, content, expiresAt }
  const [recentUserQueries, setRecentUserQueries] = useState([]);

  // Calculate display time based on word count (reading + thinking time)
  // Min 1 minute, max 5 minutes
  // Formula: ~200 words/min reading + 30 sec thinking time
  const calculateQueryDisplayTime = useCallback((text) => {
    const wordCount = text.trim().split(/\s+/).length;
    const readingTimeSeconds = (wordCount / 200) * 60; // 200 words per minute
    const thinkingTimeSeconds = 30; // Base thinking time
    const totalSeconds = readingTimeSeconds + thinkingTimeSeconds;
    // Clamp between 60 seconds (1 min) and 300 seconds (5 min)
    return Math.max(60, Math.min(300, totalSeconds)) * 1000; // Return milliseconds
  }, []);

  // Clean up expired user queries
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setRecentUserQueries((prev) => prev.filter((q) => q.expiresAt > now));
    }, 5000); // Check every 5 seconds
    return () => clearInterval(cleanupInterval);
  }, []);

  // Current AI model tracking for display
  const [currentModelInfo, setCurrentModelInfo] = useState(() => {
    const initial = getCurrentModel();
    return buildModelDisplayInfo(initial.model, initial.taskType) || { ...initial.model, taskType: initial.taskType };
  });

  useEffect(() => {
    if (!currentModelInfo) return;
    const refreshed = buildModelDisplayInfo(currentModelInfo, currentModelInfo.taskType);
    if (!refreshed) return;
    if (
      refreshed.displayName !== currentModelInfo.displayName ||
      refreshed.shortNameWithSource !== currentModelInfo.shortNameWithSource ||
      refreshed.sourceLabel !== currentModelInfo.sourceLabel
    ) {
      setCurrentModelInfo(refreshed);
    }
  }, [userSettings?.coreModelProvider]);

  useStoreSync({
    [STATE_SLICES.UI]: {
      viewMode,
      privateMode,
      currentTier,
      isInitializing,
      mainViewReady,
      lastAction,
      uiClock,
    },
    [STATE_SLICES.USER]: {
      firebaseUser,
      userSettings,
      showOnboarding,
      firebaseUserDisplay,
      userDisplayName,
    },
    [STATE_SLICES.CONNECTIONS]: connectionStatuses,
    [STATE_SLICES.PORTFOLIO]: {
      portfolio,
      tradingStatus,
      tradingHistory,
      lastUpdated: portfolioLastUpdated,
      nextTradeTime: nextTradeTimeDisplay,
      alpacaStatus,
      alpacaMode,
      personalCapitalData,
    },
    [STATE_SLICES.TICKERS]: { tickers },
    [STATE_SLICES.HEALTH]: { ouraHealth, ouraHistory },
    [STATE_SLICES.PROJECTS]: { projects },
    [STATE_SLICES.CHAT]: {
      messages,
      isProcessing,
      streamingText,
      actionStreamingText,
      actionStreamingTitle,
      currentModelInfo,
    },
    [STATE_SLICES.OVERLAYS]: {
      showTestRunner,
      showSettings,
      showLinkedInViewer,
      setupOverlay,
      linkedInViewerData,
      showApprovalOverlay,
    },
  });

  // Check AI model connection on mount
  useEffect(() => {
    const claudeConfig = getClaudeConfig();
    const multiConfig = getMultiAIConfig();
    if (claudeConfig.ready) {
      setClaudeStatus("Connected");
    } else if (multiConfig.gptMini?.ready || multiConfig.gptAgentic?.ready) {
      setClaudeStatus("OpenAI");
    } else {
      setClaudeStatus("Missing key");
    }
  }, []);

  // UI clock tick for time displays (twice per minute)
  useEffect(() => {
    const interval = setInterval(() => {
      setUiClock(Date.now());
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const resetActionStream = useCallback((title = "") => {
    actionStreamBufferRef.current = "";
    if (actionStreamTimerRef.current) {
      clearTimeout(actionStreamTimerRef.current);
      actionStreamTimerRef.current = null;
    }
    setActionStreamingText("");
    setActionStreamingTitle(title);
  }, []);

  const resetToolEvents = useCallback(() => {
    toolEventKeysRef.current = new Set();
    toolEventsRef.current = [];
    setToolEvents([]);
    toolEventActionMapRef.current.clear();
  }, []);

  const addToolEvent = useCallback((event) => {
    const next = [event, ...toolEventsRef.current].slice(0, 12);
    toolEventsRef.current = next;
    setToolEvents(next);
  }, []);

  const updateToolEvent = useCallback((id, updates) => {
    const next = toolEventsRef.current.map((entry) => (
      entry.id === id ? { ...entry, ...updates } : entry
    ));
    toolEventsRef.current = next;
    setToolEvents(next);
  }, []);

  const TOOL_REGEX = /\b(WebSearch|WebFetch|Fetch|Grep|Glob|Read|Bash|Copy|Mkdir|Write|Edit|Update|Move|Delete)\s*\(([^)]{0,200})\)/g;
  const TOOL_OUTPUT_GUIDE = useMemo(() => [
    "ACTION LOG FORMAT (required for tool use):",
    "- Before each tool call, print exactly one line in this format:",
    "  Bash(<command>)",
    "  Read(<path>)",
    "  Write(<path>)",
    "  Update(<path>)",
    "  Edit(<path>)",
    "  Delete(<path>)",
    "  Copy(<source -> dest>)",
    "  Move(<source -> dest>)",
    "  Mkdir(<path>)",
    "  Grep(<pattern> <path>)",
    "  Glob(<pattern>)",
    "  WebSearch(<query>)",
    "  Fetch(<url>)",
    "- Then immediately run the tool.",
    "- Only print a tool line when you are about to run that tool.",
    "- Use real paths/commands/urls. Keep targets under 200 characters.",
    "- Do not wrap tool lines in backticks or code blocks."
  ].join("\n"), []);
  const withToolGuide = useCallback((prompt) => {
    if (!prompt) return TOOL_OUTPUT_GUIDE;
    if (prompt.includes("ACTION LOG FORMAT")) return prompt;
    return `${prompt}\n\n${TOOL_OUTPUT_GUIDE}`;
  }, [TOOL_OUTPUT_GUIDE]);

  const mapToolNameToActionType = (tool) => {
    switch (tool) {
      case "WebSearch":
        return "WEB_SEARCH";
      case "WebFetch":
      case "Fetch":
        return "WEB_FETCH";
      case "Grep":
        return "GREP";
      case "Glob":
        return "GLOB";
      case "Read":
        return "READ";
      case "Write":
        return "WRITE";
      case "Update":
        return "UPDATE";
      case "Edit":
        return "EDIT";
      case "Delete":
        return "DELETE";
      case "Copy":
        return "COPY";
      case "Move":
        return "MOVE";
      case "Mkdir":
        return "MKDIR";
      case "Bash":
      default:
        return "BASH";
    }
  };

  const buildDiffFromLines = (lines) => {
    if (!lines || lines.length === 0) return null;
    const hunkLine = lines.find((line) => line.startsWith("@@"));
    const hunkMatch = hunkLine
      ? /@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/.exec(hunkLine)
      : null;
    const startLine = hunkMatch ? Number(hunkMatch[1]) : 1;

    const removed = lines
      .filter((line) => line.startsWith("-") && !line.startsWith("---"))
      .map((line) => line.slice(1));
    const added = lines
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1));

    if (removed.length === 0 && added.length === 0) return null;

    return {
      startLine,
      removed,
      added
    };
  };

  const extractToolEvents = useCallback((chunk, source = "claude-code") => {
    if (!chunk) return;
    const lines = chunk.split(/\r?\n/);
    let match;
    while ((match = TOOL_REGEX.exec(chunk)) !== null) {
      const tool = match[1];
      const target = match[2]?.trim() || "";
      const key = `${tool}:${target}`;
      if (toolEventKeysRef.current.has(key)) {
        continue;
      }
      toolEventKeysRef.current.add(key);
      const eventId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      addToolEvent({
        id: eventId,
        tool,
        target,
        status: "working",
        startedAt: Date.now(),
        source,
        tokens: "n/a",
        diffLines: []
      });
      const actionType = mapToolNameToActionType(tool);
      const actionId = activityNarrator.action(actionType, target);
      if (actionId) {
        toolEventActionMapRef.current.set(eventId, actionId);
      }
    }

    const diffLines = lines.filter((line) => line.startsWith("+") || line.startsWith("-") || line.startsWith("@@"));
    if (diffLines.length > 0 && toolEventsRef.current.length > 0) {
      const latest = toolEventsRef.current[0];
      updateToolEvent(latest.id, {
        diffLines: [...(latest.diffLines || []), ...diffLines].slice(-10)
      });
      const actionId = toolEventActionMapRef.current.get(latest.id);
      if (actionId) {
        const diff = buildDiffFromLines(diffLines);
        if (diff) {
          activityNarrator.attachDiff(actionId, diff);
        }
      }
    }
  }, [addToolEvent, updateToolEvent, activityNarrator]);

  const appendActionStream = useCallback((chunk) => {
    if (!chunk) return;
    actionStreamBufferRef.current += chunk;
    if (actionStreamBufferRef.current.length > 2000) {
      actionStreamBufferRef.current = actionStreamBufferRef.current.slice(-2000);
    }
    if (!actionStreamTimerRef.current) {
      actionStreamTimerRef.current = setTimeout(() => {
        actionStreamTimerRef.current = null;
        setActionStreamingText(actionStreamBufferRef.current);
      }, 50);
    }
  }, []);

  // Run startup diagnostics
  useEffect(() => {
    const runStartupDiagnostics = async () => {
      try {
        // Check Alpaca
        const alpacaConfig = getAlpacaConfig();
        if (alpacaConfig.ready) {
          setDiagnostics(prev => ({
            ...prev,
            alpaca: { status: STATUS_TYPES.SUCCESS },
            trading: { status: STATUS_TYPES.SUCCESS },
            ticker: { status: STATUS_TYPES.SUCCESS }
          }));
        } else {
          setDiagnostics(prev => ({
            ...prev,
            alpaca: { status: STATUS_TYPES.ERROR, error: "No API keys" },
            trading: { status: STATUS_TYPES.WARNING, error: "Yahoo fallback" },
            ticker: { status: STATUS_TYPES.SUCCESS }
          }));
        }

        // Check AI Model
        const claudeConfig = getClaudeConfig();
        if (claudeConfig.ready || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
          setDiagnostics(prev => ({
            ...prev,
            model: { status: STATUS_TYPES.SUCCESS }
          }));
        } else {
          setDiagnostics(prev => ({
            ...prev,
            model: { status: STATUS_TYPES.ERROR, error: "No API key" }
          }));
        }

        // Check LinkedIn (from saved profile)
        const linkedInData = loadLinkedInProfile();
        if (linkedInData) {
          setDiagnostics(prev => ({
            ...prev,
            linkedin: { status: STATUS_TYPES.SUCCESS }
          }));
        }

        // Check Oura
        const ouraConfig = getOuraConfig();
        if (ouraConfig.ready) {
          setDiagnostics(prev => ({
            ...prev,
            oura: { status: STATUS_TYPES.SUCCESS }
          }));
        }

      } catch (error) {
        console.error("Diagnostics error:", error);
      }
    };

    runStartupDiagnostics();
  }, []);

  // ===== INITIALIZE AUTONOMOUS SYSTEM =====
  useEffect(() => {
      const handleTaskOutput = ({ taskId, output }) => {
        if (!currentActionIdRef.current || taskId !== currentActionIdRef.current) return;
        appendActionStream(output);
        extractToolEvents(output, "claude-code");
      };

    const initAutonomousSystem = async () => {
      // Log system startup
      workLog.logSystem("BACKBONE Started", "Autonomous system initializing");

      // Initialize Claude Code backend and check full status
      const backend = await claudeCodeBackend.initialize();
      const cliStatus = await getClaudeCodeStatus();
      setClaudeCodeStatus({
        initialized: true,
        available: backend.installed,
        loggedIn: cliStatus.loggedIn,
        model: cliStatus.model,
        ready: cliStatus.ready
      });

      if (cliStatus.ready) {
        // Fully ready - installed and logged in
        workLog.logConnection(LOG_SOURCE.CLAUDE_CODE, "Claude Code Ready",
          `${backend.version || "CLI"} | ${cliStatus.model || "Opus 4.5"}`, LOG_STATUS.SUCCESS);
      } else if (backend.installed && !cliStatus.loggedIn) {
        // Installed but not logged in
        workLog.logConnection(LOG_SOURCE.CLAUDE_CODE, "Claude Code - Login Required",
          "Run 'claude' in terminal to authenticate", LOG_STATUS.WARNING);
        const narrator = getActivityNarrator();
        narrator.observe("Claude Code installed but not logged in. Run 'claude' to authenticate with your Pro/Max subscription.");
      } else {
        // Not installed
        workLog.logConnection(LOG_SOURCE.CLAUDE_CODE, "Claude Code Not Available",
          "Install: npm install -g @anthropic-ai/claude-code", LOG_STATUS.WARNING);
        const narrator = getActivityNarrator();
        narrator.observe("Claude Code CLI not installed - install for advanced automation: npm install -g @anthropic-ai/claude-code");
      }

      // Register context providers for autonomous engine
      autonomousEngine.registerContextProvider("portfolio", async () => ({
        equity: portfolioRef.current?.equity,
        cash: portfolioRef.current?.cash,
        dayPL: portfolioRef.current?.dayPL,
        positions: portfolioRef.current?.positions?.slice(0, 5)
      }));

      autonomousEngine.registerContextProvider("health", async () => ouraHealthRef.current);

      autonomousEngine.registerContextProvider("goals", async () => goalTracker.getDisplayData());

      autonomousEngine.registerContextProvider("tickers", async () =>
        tickersRef.current.slice(0, 10).map(t => ({ symbol: t.symbol, score: t.score, change: t.change }))
      );

      // Position analysis context - explains why positions are held/sold
      autonomousEngine.registerContextProvider("positionAnalysis", async () => {
        try {
          const positions = portfolioRef.current?.positions || [];
          const tickers = tickersRef.current || [];
          const analyses = analyzeAllPositions(tickers, positions);
          return {
            count: positions.length,
            positions: analyses.map(a => ({
              symbol: a.symbol,
              score: a.score,
              plPercent: a.plPercent,
              holdTime: a.holdTime?.formatted,
              decision: a.decision,
              isProtected: a.isProtected,
              explanation: a.explanation
            })),
            summary: analyses.map(a =>
              `${a.symbol}: Score ${a.score?.toFixed(1) || "?"}/10, P&L ${a.plPercent?.toFixed(1) || "?"}%, ` +
              `Held ${a.holdTime?.formatted || "?"} - ${a.decision}`
            ).join("\n")
          };
        } catch (error) {
          return { error: error.message, positions: [] };
        }
      });

      // ===== WIRE AI BRAIN CONTEXT PROVIDERS =====
      // The AI Brain uses these for real AI-driven reasoning
      aiBrain.registerContextProvider("portfolio", async () => {
        const p = portfolioRef.current;
        if (!p || p.equity === "--") return { connected: false };
        return {
          connected: true,
          equity: p.equity,
          cash: p.cash,
          dayChange: p.dayChange,
          dayChangeDollar: p.dayChangeDollar,
          positions: p.positions?.slice(0, 8).map(pos => ({
            symbol: pos.symbol,
            shares: pos.shares,
            marketValue: pos.marketValue,
            todayChange: pos.todayChange,
            totalPnL: pos.pnlPercent
          }))
        };
      });

      aiBrain.registerContextProvider("health", async () => {
        const h = ouraHealthRef.current;
        if (!h) return { connected: false };
        return {
          connected: true,
          sleep: h.sleep,
          readiness: h.readiness,
          activity: h.activity
        };
      });

      aiBrain.registerContextProvider("goals", async () => {
        const g = goalTracker.getDisplayData();
        return g.filter(goal => goal.status !== "completed").slice(0, 5).map(goal => ({
          title: goal.title,
          progress: Math.round((goal.progress || 0) * 100),
          category: goal.category,
          dueDate: goal.dueDate
        }));
      });

      aiBrain.registerContextProvider("tickers", async () => {
        const t = tickersRef.current || [];
        return t.slice(0, 6).map(ticker => ({
          symbol: ticker.symbol,
          score: ticker.score?.toFixed(1),
          change: ticker.change,
          signal: ticker.signal
        }));
      });

      aiBrain.registerContextProvider("projects", async () => {
        const p = listProjects();
        return p.slice(0, 3).map(proj => ({
          name: proj.name,
          status: proj.status,
          lastUpdated: proj.lastUpdated
        }));
      });

      // Load files into memory for AI execution
      aiBrain.loadFilesForExecution().catch(err => {
        console.error("Failed to load files for AI execution:", err.message);
      });

      // Initialize Claude Code executor with streaming support
      const claudeExecutor = initializeClaudeCodeEngine(autonomousEngine, {
        mode: EXECUTION_MODE.SUPERVISED, // Auto-approve writes, but not bash
        workDir: process.cwd(),
        maxTurns: 50,
        timeout: 300000 // 5 minutes
      });

      // Forward Claude Code events for real-time display
      autonomousEngine.on("claude-text", ({ text, actionId }) => {
        if (text && actionId === currentActionIdRef.current) {
          appendActionStream(text);
        }
      });

      autonomousEngine.on("claude-tool-use", ({ tool, input, actionId }) => {
        if (actionId === currentActionIdRef.current) {
          const inputPreview = typeof input === "string"
            ? input.slice(0, 60)
            : JSON.stringify(input).slice(0, 60);
          workLog.logAction(LOG_SOURCE.CLAUDE_CODE, `Tool: ${tool}`, inputPreview, LOG_STATUS.PENDING);

          // Add to tool events display
          const eventId = `tool_${Date.now()}`;
          setToolEvents((prev) => [...prev, {
            id: eventId,
            tool,
            input: inputPreview,
            status: "working",
            startedAt: Date.now()
          }]);
          toolEventActionMapRef.current.set(eventId, tool);
        }
      });

      autonomousEngine.on("claude-tool-result", ({ result, actionId }) => {
        if (actionId === currentActionIdRef.current) {
          // Mark last tool event as done
          setToolEvents((prev) => {
            const updated = [...prev];
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].status === "working") {
                updated[i] = { ...updated[i], status: "done", endedAt: Date.now() };
                break;
              }
            }
            return updated;
          });
        }
      });

      autonomousEngine.on("claude-start", ({ action }) => {
        workLog.logAction(LOG_SOURCE.CLAUDE_CODE, `Starting: ${action.title}`, action.executionPlan?.prompt?.slice(0, 50) || "", LOG_STATUS.PENDING);
      });

      autonomousEngine.on("claude-end", ({ success, actionId }) => {
        if (success) {
          workLog.logResult(LOG_SOURCE.CLAUDE_CODE, "Task completed", "", LOG_STATUS.SUCCESS);
        }
      });

      autonomousEngine.on("claude-error", ({ error }) => {
        workLog.logError(LOG_SOURCE.CLAUDE_CODE, "Error", error);
      });

      // Register executor for API fallback
      autonomousEngine.registerExecutor(EXECUTION_TOOLS.CLAUDE_API, async (action) => {
        workLog.logAction(LOG_SOURCE.CLAUDE, `API Task: ${action.title}`, "", LOG_STATUS.PENDING);
        try {
          let output = "";
          let streamError = null;
          await streamMessage(action.executionPlan.prompt, (chunk) => {
            if (chunk.type === "text") {
              output += chunk.text;
              appendActionStream(chunk.text);
              extractToolEvents(chunk.text, "claude-api");
            } else if (chunk.type === "error") {
              streamError = chunk.error || "Streaming error";
            }
          }, {
            portfolio: portfolioRef.current,
            goals: goalTracker.getDisplayData()
          });
          if (streamError) {
            throw new Error(streamError);
          }
          workLog.logResult(LOG_SOURCE.CLAUDE, `Completed: ${action.title}`, "", LOG_STATUS.SUCCESS);
          return { success: true, output };
        } catch (error) {
          workLog.logError(LOG_SOURCE.CLAUDE, `Failed: ${action.title}`, error.message);
          return { success: false, error: error.message };
        }
      });

      // Listen for autonomous engine events
      autonomousEngine.on("action-started", (action) => {
        const actionTitle = action.title || `${action.action || action.type || "Task"}(${(action.target || "").slice(0, 30)})`;
        workLog.logAction(LOG_SOURCE.AUTONOMOUS, `Started: ${actionTitle}`, action.type || action.action, LOG_STATUS.PENDING);
        currentActionIdRef.current = action.id;
        resetActionStream(actionTitle);
        resetToolEvents();
        refreshAutonomousState();
      });

      autonomousEngine.on("action-completed", (action) => {
        const actionTitle = action.title || `${action.action || action.type || "Task"}(${(action.target || "").slice(0, 30)})`;
        workLog.logResult(LOG_SOURCE.AUTONOMOUS, `Completed: ${actionTitle}`, "", LOG_STATUS.SUCCESS);
        currentActionIdRef.current = null;
        resetActionStream("");
        setToolEvents((prev) => prev.map((entry) => (
          entry.status === "working"
            ? { ...entry, status: "done", endedAt: Date.now() }
            : entry
        )));
        toolEventActionMapRef.current.forEach((actionId) => {
          activityNarrator.completeAction(actionId);
        });
        if (action?.result?.output) {
          const projectId = engineState.state?.activeProject?.id;
          if (projectId) {
            appendProjectResearch(projectId, {
              actionId: action.id,
              title: action.title,
              type: action.type,
              output: action.result.output.slice(0, 4000)
            });
          }
        }
        refreshAutonomousState();
        setCompletedActions(autonomousEngine.getRecentCompleted(10));
      });

      autonomousEngine.on("action-failed", (action) => {
        const actionTitle = action.title || `${action.action || action.type || "Task"}(${(action.target || "").slice(0, 30)})`;
        workLog.logError(LOG_SOURCE.AUTONOMOUS, `Failed: ${actionTitle}`, action.error);
        currentActionIdRef.current = null;
        resetActionStream("");
        setToolEvents((prev) => prev.map((entry) => (
          entry.status === "working"
            ? { ...entry, status: "error", endedAt: Date.now() }
            : entry
        )));
        toolEventActionMapRef.current.forEach((actionId) => {
          activityNarrator.failAction(actionId);
        });
        refreshAutonomousState();
      });

      autonomousEngine.on("proposals-updated", () => {
        setAutonomousState((prev) => {
          const next = autonomousEngine.getDisplayData();
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      });

      // Listen for engine state events (with change detection to reduce flickering)
      const updateEngineStatus = () => {
        setEngineStatus((prev) => {
          const next = engineState.getDisplayData();
          // Only update if something actually changed
          if (prev && prev.status?.status === next.status?.status &&
              prev.status?.detail === next.status?.detail &&
              JSON.stringify(prev.projects) === JSON.stringify(next.projects)) {
            return prev;
          }
          return next;
        });
      };
      engineState.on("status-changed", updateEngineStatus);
      engineState.on("plan-updated", updateEngineStatus);
      engineState.on("work-updated", updateEngineStatus);
      engineState.on("project-started", updateEngineStatus);
      engineState.on("project-completed", updateEngineStatus);

      claudeCodeBackend.on("task-output", handleTaskOutput);

      // Sync autonomous engine actions with engine state
      autonomousEngine.on("action-started", (action) => {
        const statusMap = {
          research: "researching",
          execute: "executing",
          analyze: "analyzing",
          plan: "planning",
          health: "working",
          family: "working"
        };
        engineState.setStatus(statusMap[action.type] || "working", action.title);
      });

      autonomousEngine.on("action-completed", () => {
        engineState.setStatus("idle");
      });

      // Listen for goal tracker events (with change detection)
      const updateGoals = () => {
        setGoals((prev) => {
          const next = goalTracker.getDisplayData();
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      };
      goalTracker.on("milestone-achieved", ({ goal, milestone }) => {
        workLog.logMilestone(LOG_SOURCE.GOAL, `Milestone: ${milestone.label}`, goal.title);
        updateGoals();
      });

      goalTracker.on("progress-updated", updateGoals);

      // Listen for work log events (with change detection)
      workLog.on("entry", () => {
        setWorkLogEntries((prev) => {
          const next = workLog.getDisplayData(15);
          // Only update if entries actually changed
          if (prev.length === next.length &&
              prev[0]?.id === next[0]?.id &&
              prev[0]?.status === next[0]?.status) {
            return prev;
          }
          return next;
        });
      });

      // Update work log entries periodically
      setWorkLogEntries(workLog.getDisplayData(15));

      // ===== ACTIVITY TRACKER WIRING (Claude Code Style) =====
      // Wire activity tracker to autonomous engine events
      // NOTE: The fake cycle-start actions were removed - now using real AI-generated actions
      // from the autonomous loop (Claude Code CLI or AI Brain fallback)

      autonomousEngine.on("proposals-updated", (proposals) => {
        if (proposals.length > 0) {
          activityTracker.setAgentState("PLANNING");
        }
      });

      autonomousEngine.on("action-started", (action) => {
        // Determine action type based on title/type
        const actionTitle = action.title || "task";
        let actionType = "BASH";
        let stateType = "WORKING";

        if (actionTitle.toLowerCase().includes("read") || actionTitle.toLowerCase().includes("fetch")) {
          actionType = "READ";
          stateType = "RESEARCHING";
        } else if (actionTitle.toLowerCase().includes("search") || actionTitle.toLowerCase().includes("find")) {
          actionType = "SEARCH";
          stateType = "RESEARCHING";
        } else if (actionTitle.toLowerCase().includes("update") || actionTitle.toLowerCase().includes("write")) {
          actionType = "UPDATE";
          stateType = "BUILDING";
        } else if (actionTitle.toLowerCase().includes("web") || actionTitle.toLowerCase().includes("browse")) {
          actionType = "WEB_SEARCH";
          stateType = "RESEARCHING";
        } else if (actionTitle.toLowerCase().includes("think") || actionTitle.toLowerCase().includes("analyze")) {
          actionType = "THINK";
          stateType = "THINKING";
        } else if (actionTitle.toLowerCase().includes("test")) {
          actionType = "BASH";
          stateType = "TESTING";
        }

        activityTracker.setAgentState(stateType);
        activityTracker.action(actionType, actionTitle);
        // Build a detailed goal sentence (15+ words) from action info
        const goalBase = action.description || actionTitle;
        const userName = firebaseUserDisplay ? firebaseUserDisplay.split(" ")[0] : "the user";
        const detailedGoal = goalBase.split(" ").length >= 15 ? goalBase :
          `${actionTitle} - ${goalBase} to help ${userName} achieve their objectives and improve their daily workflow`;
        activityTracker.setGoal(detailedGoal);

        const actId = activityTracker.log("executing", actionTitle, ACTIVITY_STATUS.WORKING);
        action._activityId = actId;
      });

      autonomousEngine.on("action-completed", (action) => {
        if (action._activityId) {
          activityTracker.complete(action._activityId);
        }
        // Build title from action type and target if title is missing
        const actionTitle = action.title || `${action.action || action.type || "Task"}(${(action.target || "").slice(0, 30)})`;
        activityTracker.addObservation(`Completed: ${actionTitle}`);
        activityTracker.setAgentState("OBSERVING");
        activityTracker.setGoal(null);
      });

      autonomousEngine.on("action-failed", (action) => {
        if (action._activityId) {
          activityTracker.error(action._activityId, action.error);
        }
        const failedTitle = action.title || `${action.action || action.type || "Task"}(${(action.target || "").slice(0, 30)})`;
        activityTracker.addObservation(`Failed: ${failedTitle} - ${action.error?.slice(0, 30) || "unknown error"}`);
        activityTracker.setAgentState("REFLECTING");
      });

      // Activity tracker updates are handled by AgentActivityPanel directly
      // to prevent full app re-renders

      // ===== QUOTA MONITOR EVENTS =====
      quotaMonitor.on("quota-exceeded", ({ provider, errorMessage }) => {
        setQuotaExceeded(prev => ({
          ...prev,
          [provider]: true,
          showAlert: true,
          provider
        }));
        workLog.logError(LOG_SOURCE.SYSTEM, `${provider.toUpperCase()} Quota Exceeded`, "Add credits to continue using AI");
        activityTracker.addObservation(`API quota exceeded - add credits at billing page`);
      });

      quotaMonitor.on("quota-cleared", ({ provider }) => {
        setQuotaExceeded(prev => ({
          ...prev,
          [provider]: false,
          showAlert: prev.openai || prev.anthropic
        }));
        workLog.logSystem(LOG_SOURCE.SYSTEM, `${provider.toUpperCase()} quota restored`);
      });

      quotaMonitor.on("low-balance-warning", async ({ provider, balance, threshold, urgency, message }) => {
        workLog.logError(LOG_SOURCE.SYSTEM, `Low Balance: ${provider}`, `$${balance.toFixed(2)} remaining`);
        activityTracker.addObservation(`${urgency}: ${provider} balance at $${balance.toFixed(2)}`);

        // Send SMS if messaging is available
        if (firebaseMessaging?.getStatus()?.phoneVerified) {
          try {
            await firebaseMessaging.sendAlert(message);
          } catch (err) {
            console.error("Failed to send balance warning SMS:", err.message);
          }
        }
      });

      // Start mobile dashboard
      try {
        await mobileService.startWebDashboard();
        workLog.logConnection(LOG_SOURCE.SYSTEM, "Mobile Dashboard", `Running on port ${mobileService.config.port}`, LOG_STATUS.SUCCESS);
      } catch (error) {
        // Mobile dashboard is optional, don't fail on error
      }
    };

    initAutonomousSystem();

    return () => {
      autonomousEngine.stop();
      activityTracker.setRunning(false);
      mobileService.stopWebDashboard();
      claudeCodeBackend.off("task-output", handleTaskOutput);
    };
  }, []);

  const runEvaluationJob = useCallback(() => {
    if (!autonomousEngine) return 0;
    const context = evaluationContextRef.current || {};
    try {
      const added = runUserEvaluationCycle(autonomousEngine, context);
      if (added > 0) {
        setLastAction(`Evaluation queued ${added} actions`);
      }
      return added;
    } catch (error) {
      console.error("[Evaluation Job] Failed:", error);
      setLastAction("Evaluation job failed - check logs");
      return 0;
    }
  }, [autonomousEngine]);

  useEffect(() => {
    if (!autonomousEngine) return () => {};

    let intervalId;
    let timeoutId;

    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds();
    const remainder = minutes % 30;
    const offsetMinutes = remainder === 0 ? 30 : 30 - remainder;
    const delay = offsetMinutes * 60000 - seconds * 1000 - ms;

    runEvaluationJob();

    timeoutId = setTimeout(() => {
      runEvaluationJob();
      intervalId = setInterval(() => runEvaluationJob(), 30 * 60 * 1000);
    }, Math.max(0, delay));

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [autonomousEngine, runEvaluationJob]);

  // Sync goals and life scores with portfolio/health data
  useEffect(() => {
    if (portfolio?.equity && typeof portfolio.equity === "number") {
      goalTracker.syncFinanceGoal(portfolio.equity);
      lifeScores.syncAllScores({
        portfolio,
        goals: goalTracker.getActive(),
        oura: ouraHealth,
        linkedin: linkedInProfile
      });
      updateLifeScoresData();
    }
  }, [portfolio?.equity, updateLifeScoresData]);

  useEffect(() => {
    if (ouraHealth?.sleep?.score) {
      goalTracker.syncHealthGoal(ouraHealth.sleep.score);
      lifeScores.syncAllScores({
        portfolio,
        goals: goalTracker.getActive(),
        oura: ouraHealth,
        linkedin: linkedInProfile
      });
      updateLifeScoresData();
    }
  }, [ouraHealth?.sleep?.score, updateLifeScoresData]);

  // Update connection statuses for ConnectionBar (with change detection to reduce flickering)
  // NOTE: Only track connection status changes, not details like timestamps
  useEffect(() => {
    setConnectionStatuses((prev) => {
      const alpacaConnected = alpacaStatus === "Live";
      const alpacaStatusState = alpacaConnected ? "connected" : (alpacaStatus === "Offline" ? "broken" : "never");
      const claudeConnected = claudeStatus === "Connected" || claudeStatus === "OpenAI";
      const claudeStatusState = claudeConnected
        ? "connected"
        : (claudeStatus === "Missing key" || claudeStatus === "Checking..." ? "never" : "broken");
      const claudeCodeConnected = claudeCodeStatus.available;
      const claudeCodeStatusState = claudeCodeConnected ? "connected" : "never";
      const linkedinConnected = linkedInProfile?.connected;
      const linkedinStatusState = linkedinConnected ? "connected" : "never";
      const ouraConnected = ouraHealth?.connected;
      const ouraStatusState = ouraConnected ? "connected" : "never";
      const yahooConnected = true;
      const yahooStatusState = "connected";
      const personalCapitalConnected = personalCapitalData?.connected || false;
      const personalCapitalStatusState = personalCapitalConnected ? "connected" : "never";

      const next = {
        alpaca: { connected: alpacaConnected, status: alpacaStatusState, details: alpacaMode },
        claude: { connected: claudeConnected, status: claudeStatusState, details: "" },
        claudeCode: { connected: claudeCodeConnected, status: claudeCodeStatusState, details: claudeCodeStatus.available ? "Ready" : "Not installed" },
        linkedin: { connected: linkedinConnected, status: linkedinStatusState, details: "" },
        oura: { connected: ouraConnected, status: ouraStatusState, details: "" },
        yahoo: { connected: yahooConnected, status: yahooStatusState, details: "" }, // Removed lastQuoteUpdate to prevent flickering
        personalCapital: { connected: personalCapitalConnected, status: personalCapitalStatusState, details: "" }
      };
      // Only update if connection status actually changed (ignore details)
      const prevKey = Object.keys(prev).map(k => `${prev[k]?.connected}:${prev[k]?.status || ""}`).join(",");
      const nextKey = Object.keys(next).map(k => `${next[k]?.connected}:${next[k]?.status || ""}`).join(",");
      if (prevKey === nextKey) {
        return prev;
      }
      return next;
    });
  }, [alpacaStatus, alpacaMode, claudeStatus, claudeCodeStatus.available, linkedInProfile?.connected, ouraHealth?.connected, personalCapitalData?.connected]);

  // Simple main view readiness - no delays, no multiple refreshes
  useEffect(() => {
    if (isInitializing || showOnboarding) {
      setMainViewReady(false);
      return;
    }
    // Show main view immediately when layout is ready
    if (layoutReady) {
      setMainViewReady(true);
    }
  }, [isInitializing, showOnboarding, layoutReady]);


  // Life Engine Boot - Gather all data sources and start optimization when ready
  useEffect(() => {
    if (isInitializing || showOnboarding) return;

    const bootLifeEngine = async () => {
      try {
        const lifeEngine = getLifeEngine();
        const goalTracker = getGoalTracker();

        // Boot with all available data sources
        const result = await lifeEngine.boot({
          linkedInProfile,
          ouraHealth,
          portfolio,
          goals: goalTracker.getActive(),
          calendar: null, // TODO: Add calendar integration
          email: null, // TODO: Add email integration
          aiStatus: {
            ready: getMultiAIConfig().ready,
            provider: getMultiAIConfig().gptThinking?.ready ? "openai" : "anthropic",
            quotaExceeded: getAIStatus().gptThinking?.quotaExceeded
          }
        });

        setLifeEngineCoverage(result.coverage);
        setLifeEngineReady(result.ready);

        // Log coverage status
        if (result.coverage < 80) {
          console.log(`Life Engine: ${result.coverage}% coverage. Need 80% to start optimization.`);
          if (result.missing.length > 0) {
            console.log(`Missing: ${result.missing.slice(0, 3).map(m => m.name).join(", ")}`);
          }
        } else {
          console.log(`Life Engine: ${result.coverage}% coverage. Optimization active.`);
        }
      } catch (e) {
        console.error("Life Engine boot failed:", e.message);
      }
    };

    // Boot after a short delay to let other data load
    const timer = setTimeout(bootLifeEngine, 3000);
    return () => clearTimeout(timer);
  }, [isInitializing, showOnboarding, linkedInProfile?.connected, ouraHealth?.connected, portfolio?.connected]);

  // AI Action Generation function - Uses AI Brain for real reasoning
  const generateAIActions = useCallback(async (context, needed) => {
    const claudeConfig = getClaudeConfig();
    const multiConfig = getMultiAIConfig();

    // Check if any AI is available
    if (!claudeConfig.ready && !multiConfig.ready) return [];

    // Update activity to show we're working (not just thinking)
    activityTracker.setAgentState("RESEARCHING");

    try {
      // Step 1: Use AI Brain to analyze and find ACTIONABLE work
      // Focus on core competencies: trading, research, user issues, projects
      const thinkResult = await aiBrain.think();

      if (thinkResult.success && thinkResult.observation) {
        // Only show if it's actionable insight, not just restating facts
        const observation = thinkResult.observation.split("\n")[0];
        // The narrator will filter out useless observations
        activityTracker.addObservation(observation);
        activityTracker.setAgentState("PLANNING");
      }

      // Step 2: Generate REAL actions that DO WORK
      const actionResult = await aiBrain.generateActions(needed);

      if (!actionResult.success || actionResult.actions.length === 0) {
        // Don't show useless "no changes" observations
        return [];
      }

      const applyToolGuide = (prompt) => (
        claudeCodeStatus.available ? withToolGuide(prompt) : prompt
      );

      // Actions that auto-execute (research and analysis are safe)
      const safeTypes = ["research", "analyze", "plan"];

      // Convert to autonomous engine format with REAL prompts
      const actions = actionResult.actions.map(a => {
        const actionType = a.type || AI_ACTION_TYPES.RESEARCH;
        const isSafe = safeTypes.includes(actionType);

        // Build a real, actionable prompt
        let prompt = "";
        if (actionType === "research") {
          prompt = applyToolGuide(`RESEARCH TASK: ${a.title}

You are doing real research. Find specific, actionable information:
- Search for relevant data, news, and analysis
- Extract specific numbers, dates, and facts
- Provide a summary with 3-5 key findings
- Recommend specific next actions

${a.rationale || ""}

Output your findings in a structured format.`);
        } else if (actionType === "analyze") {
          prompt = applyToolGuide(`ANALYSIS TASK: ${a.title}

Perform deep analysis:
- Examine the data for patterns and signals
- Calculate relevant metrics
- Identify opportunities or risks
- Provide specific recommendations

${a.rationale || ""}

Output specific, actionable insights.`);
        } else {
          prompt = applyToolGuide(`TASK: ${a.title}

${a.rationale || a.description || ""}

Execute this task and provide concrete results.`);
        }

        return {
          title: a.title,
          type: actionType,
          description: a.rationale || a.description,
          executionPlan: {
            tool: claudeCodeStatus.available ? EXECUTION_TOOLS.CLAUDE_CODE : EXECUTION_TOOLS.CLAUDE_API,
            prompt
          },
          requiresApproval: !isSafe,
          priority: a.priority === "high" ? 8 : a.priority === "medium" ? 5 : 3
        };
      });

      // Log the planned work (not just observation)
      if (actions.length > 0) {
        const firstAction = actions[0];
        // Use WEB_SEARCH for research actions to show proper format
        if (firstAction.type === "research") {
          activityTracker.action("WEB_SEARCH", firstAction.title);
        } else {
          // Build detailed goal (15+ words) from action info
          const goalTitle = firstAction.title || firstAction.description || "task";
          const userName = firebaseUserDisplay ? firebaseUserDisplay.split(" ")[0] : "the user";
          const detailedGoal = goalTitle.split(" ").length >= 15 ? goalTitle :
            `${goalTitle} as part of the ongoing effort to help ${userName} optimize their daily workflow and achieve success`;
          activityTracker.setGoal(detailedGoal);
        }
      }

      return actions;
    } catch (error) {
      // Don't log useless error observations
      console.error("Action generation error:", error.message);
      return [];
    }
  }, [claudeCodeStatus.available, activityTracker, aiBrain, withToolGuide]);

  // ===== AUTO-START AUTONOMOUS ENGINE =====
  // This runs once generateAIActions is available
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!autonomousEngine || !generateAIActions) return;

    // Delay to let other initialization complete
    const startTimer = setTimeout(() => {
      if (autoStartedRef.current) return;
      autoStartedRef.current = true;

      // Start the engine - show realistic startup state
      activityTracker.setAgentState("THINKING");
      const userName = firebaseUserDisplay ? firebaseUserDisplay.split(" ")[0] : "the user";
      activityTracker.setGoal(`Initializing AI systems for ${userName}...`);
      activityTracker.addObservation("Connecting to AI services and preparing autonomous workflow");

      // Configure auto-approval for safe action types
      autonomousEngine.updateConfig({
        autoApproveTypes: ["research", "analyze", "plan"],
        cycleIntervalMs: 60000,
        requireApproval: false
      });

      // NOTE: OLD loop removed - using NEW autonomous loop (startAutonomousLoop)
      // which uses Claude Code CLI with GPT-5.2 supervision, or AI Brain fallback
      // The NEW loop was already started in the initialization useEffect above
      activityTracker.setRunning(true);
      activityTracker.setAgentState("THINKING");
      workLog.logSystem("Autonomous Engine", "AI Brain initialized - using Claude Code CLI or AI Brain fallback");

      // Initialize Life Management Engine services (but DON'T start its rule-based cycle)
      // The AI Brain now handles intelligent decision-making
      lifeManagementEngine.initialize().then(() => {
        workLog.logSystem("Life Engine", "Services initialized (AI Brain is primary)");

        // Polymarket data is useful context for the AI Brain
        if (polymarketService.shouldFetch()) {
          polymarketService.refresh();
        }
      });

      // Initial AI Brain observation after a short delay
      setTimeout(async () => {
        try {
          const result = await aiBrain.think();
          if (result.success && result.observation) {
            // Show the AI's first observation (real AI reasoning)
            const firstLine = result.observation.split("\n")[0];
            activityTracker.addObservation(firstLine);
          }
        } catch (err) {
          // Silently handle - the regular cycle will pick up
        }
      }, 5000);
    }, 3000);

    return () => clearTimeout(startTimer);
  }, [autonomousEngine, generateAIActions, activityTracker, workLog, lifeManagementEngine, polymarketService, aiBrain]);

  // Refresh trading status display every 10 seconds
  useEffect(() => {
    const refreshTradingStatus = () => {
      // Skip updates while typing
      if (isTypingRef.current) return;
      const status = loadTradingStatus();
      const next = buildTradingStatusDisplay(status);
      setTradingStatus((prev) => {
        // Deep compare to prevent unnecessary re-renders
        if (prev && prev.statusText === next.statusText &&
            prev.marketOpen === next.marketOpen &&
            JSON.stringify(prev.lastAttempt) === JSON.stringify(next.lastAttempt)) {
          return prev;
        }
        return next;
      });
    };

    // Initial load
    refreshTradingStatus();

    // Refresh every 60 seconds to update "Next at" time (increased to reduce flickering)
    const interval = setInterval(refreshTradingStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Refresh actions display every 10 seconds (reduced to prevent glitching)
  useEffect(() => {
    const refreshActions = () => {
      // Skip updates while typing
      if (isTypingRef.current) return;
      setActionsDisplay((prev) => {
        const next = getActionsDisplay();
        const prevKey = JSON.stringify(prev);
        const nextKey = JSON.stringify(next);
        return prevKey === nextKey ? prev : next;
      });
    };

    // Process actions queue - start next action if none active
    const processQueue = () => {
      // Skip while typing
      if (isTypingRef.current) return;
      const display = getActionsDisplay();
      if (!display.active && display.queueLength > 0) {
        startNextAction();
        refreshActions();
      }
    };

    refreshActions();
    const interval = setInterval(() => {
      processQueue();
      refreshActions();
    }, 30_000); // Increased from 10s to 30s to reduce flickering

    return () => clearInterval(interval);
  }, []);

  // Initialize LinkedIn profile - check saved file first, then API
  useEffect(() => {
    const initLinkedIn = async () => {
      // First, try to load saved profile from disk (persistent)
      const savedProfile = loadLinkedInProfile();
      if (savedProfile && savedProfile.success) {
        // Check if profile data is complete or needs refresh
        if (isProfileIncomplete(savedProfile)) {
          // Profile is connected but data is incomplete - refresh from screenshot and generate markdown
          console.log("LinkedIn connected but profile data incomplete, refreshing...");
          const refreshResult = await refreshAndGenerateLinkedInMarkdown();
          if (refreshResult.success) {
            const refreshedProfile = refreshResult.profile;
            const linkedInData = {
              ...(refreshedProfile.profile || {}),
              ...(refreshedProfile.gpt4oAnalysis || {}),
              profileUrl: refreshedProfile.profileUrl,
              connected: true,
              verified: true,
              capturedAt: refreshedProfile.capturedAt
            };
            setLinkedInProfile(linkedInData);
            updateFromLinkedIn(linkedInData);
            console.log("LinkedIn profile refreshed and markdown generated");
            return;
          }
        }

        // Profile data is complete, use it directly
        const linkedInData = {
          ...savedProfile.profile,
          ...(savedProfile.gpt4oAnalysis || {}),
          profileUrl: savedProfile.profileUrl,
          connected: true,
          verified: true,
          capturedAt: savedProfile.capturedAt
        };
        setLinkedInProfile(linkedInData);
        // Update profile sections with LinkedIn data
        updateFromLinkedIn(linkedInData);
        return; // Use saved profile
      }

      // Fall back to API-based loading if no saved profile
      const config = getLinkedInConfig();
      if (config.ready) {
        try {
          const linkedIn = await buildLinkedInProfile(config);
          setLinkedInProfile(linkedIn);
          // Update profile sections with LinkedIn data
          updateFromLinkedIn(linkedIn);
          const messages = await fetchLinkedInMessages(config);
          setLinkedInMessages(messages || []);
        } catch (error) {
          console.error("LinkedIn init failed:", error.message);
        }
      }
    };
    initLinkedIn();
  }, []);

  const runLinkedInCheck = useCallback(async () => {
    const config = getLinkedInConfig();
    if (!config.ready) return;
    if (!linkedInProfile?.connected) return;
    const meta = getLinkedInMeta();
    const yesterday = meta?.lastCheckedAt ? new Date(meta.lastCheckedAt) : null;
    const today = new Date();
    if (yesterday && yesterday.toDateString() === today.toDateString()) {
      return;
    }
    try {
      const linkedIn = await buildLinkedInProfile(config);
      setLinkedInProfile(linkedIn);
      updateFromLinkedIn(linkedIn);
      const messages = await fetchLinkedInMessages(config);
      setLinkedInMessages(messages || []);
      updateLinkedInMeta({
        lastCheckedAt: new Date().toISOString(),
        lastFetchedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("LinkedIn weekly check failed:", error.message);
    }
  }, [linkedInProfile?.connected]);

  useEffect(() => {
    if (!linkedInProfile?.connected) return;
    const config = getLinkedInConfig();
    if (!config.ready) return;
    let cancelled = false;

    const scheduleNextCheck = () => {
      const now = new Date();
      const nextCheck = new Date(now);
      nextCheck.setHours(8, 0, 0, 0);
      if (now >= nextCheck) {
        nextCheck.setDate(nextCheck.getDate() + 1);
      }
      const delay = nextCheck.getTime() - now.getTime();
      linkedInCheckTimerRef.current = setTimeout(async () => {
        if (cancelled) return;
        await runLinkedInCheck();
        scheduleNextCheck();
      }, delay);
    };

    runLinkedInCheck();
    scheduleNextCheck();

    return () => {
      cancelled = true;
      if (linkedInCheckTimerRef.current) {
        clearTimeout(linkedInCheckTimerRef.current);
        linkedInCheckTimerRef.current = null;
      }
    };
  }, [linkedInProfile?.connected, runLinkedInCheck]);


  // Initialize Oura health data - check both env var and file-based token
  useEffect(() => {
    const initOura = async () => {
      // First try env var approach
      const config = getOuraConfig();
      if (config.ready) {
        try {
          const health = await buildOuraHealthSummary(config);
          setOuraHealth(health);
          return;
        } catch (error) {
          console.error("Oura init from env failed:", error.message);
        }
      }

      // Fall back to file-based token (oura-service.js)
      if (isOuraConfigured()) {
        try {
          const stored = loadOuraData();
          if (stored?.latest) {
            // Transform stored data to match expected format
            const latestSleep = stored.latest.sleep?.[stored.latest.sleep.length - 1];
            const latestReadiness = stored.latest.readiness?.[stored.latest.readiness.length - 1];
            const latestActivity = stored.latest.activity?.[stored.latest.activity.length - 1];

            // Calculate week averages
            const avgSleepScore = stored.latest.sleep?.length
              ? Math.round(stored.latest.sleep.reduce((sum, d) => sum + (d.score || 0), 0) / stored.latest.sleep.length)
              : null;
            const avgReadinessScore = stored.latest.readiness?.length
              ? Math.round(stored.latest.readiness.reduce((sum, d) => sum + (d.score || 0), 0) / stored.latest.readiness.length)
              : null;
            const avgActivityScore = stored.latest.activity?.length
              ? Math.round(stored.latest.activity.reduce((sum, d) => sum + (d.score || 0), 0) / stored.latest.activity.length)
              : null;

            setOuraHealth({
              connected: true,
              today: {
                sleepScore: latestSleep?.score || null,
                readinessScore: latestReadiness?.score || null,
                activityScore: latestActivity?.score || null,
                totalSleepHours: latestSleep?.total_sleep_duration
                  ? (latestSleep.total_sleep_duration / 3600).toFixed(1)
                  : null,
                steps: latestActivity?.steps || null,
                activeCalories: latestActivity?.active_calories || null
              },
              weekAverage: {
                sleepScore: avgSleepScore,
                readinessScore: avgReadinessScore,
                activityScore: avgActivityScore
              },
              lastUpdated: stored.lastUpdated || stored.latest.fetchedAt
            });
          }
        } catch (error) {
          console.error("Oura init from file failed:", error.message);
        }
      }
    };
    initOura();
  }, []);

  useEffect(() => {
    const stored = loadOuraData();
    if (stored?.history) {
      setOuraHistory(stored.history);
    }
  }, [ouraHealth]);

  // Initialize social connections
  useEffect(() => {
    const config = getSocialConfig();
    const summary = buildSocialConnectionsSummary(config);
    setSocialConnections(summary);
  }, []);

  // Build merged profile from all sources
  useEffect(() => {
    const envProfile = buildProfileFromEnv(linkedInProfile);
    const merged = mergeProfileData(envProfile, linkedInProfile, ouraHealth);
    setProfile(merged);
  }, [linkedInProfile, ouraHealth]);

  // Update console title when LinkedIn profile is loaded
  useEffect(() => {
    if (updateConsoleTitle && linkedInProfile?.name) {
      updateConsoleTitle(linkedInProfile.name);
    }
  }, [linkedInProfile?.name, updateConsoleTitle]);

  // Cloud sync interval
  useEffect(() => {
    const config = getCloudSyncConfig();
    if (!config.ready) return;

    const sync = async () => {
      // Skip updates while typing
      if (isTypingRef.current) return;
      try {
        const state = {
          profile: profileRef.current,
          portfolio: portfolioRef.current,
          tickers: tickersRef.current.slice(0, 10),
          health: ouraHealthRef.current,
          lastActivity: new Date().toISOString()
        };
        const result = await syncBackboneState(config, state);
        // Check again after async operation
        if (isTypingRef.current) return;
        const nextStatus = result?.success ? "Synced" : "Failed";
        setCloudSyncStatus((prev) => (prev === nextStatus ? prev : nextStatus));
      } catch (error) {
        if (isTypingRef.current) return;
        setCloudSyncStatus((prev) => (prev === "Error" ? prev : "Error"));
      }
    };

    sync();
    const interval = setInterval(sync, CLOUD_SYNC_MS);
    return () => clearInterval(interval);
  }, []);

  // Check for phone input
  useEffect(() => {
    const config = getCloudSyncConfig();
    if (!config.ready) return;

    const checkInput = async () => {
      // Skip while typing to prevent interruptions
      if (isTypingRef.current) return;
      try {
        const { hasInput, commands } = await checkPhoneInput(config);
        // Check again after async operation
        if (isTypingRef.current) return;
        if (hasInput && commands.length > 0) {
          // Process phone commands
          commands.forEach((cmd) => {
            if (cmd.type === "message") {
              handleAIMessage(cmd.text);
            }
          });
        }
      } catch (error) {
        // Silently fail phone input check
      }
    };

    const interval = setInterval(checkInput, 30000); // Reduced from 5s to 30s
    return () => clearInterval(interval);
  }, []);

  // Save memory periodically
  useEffect(() => {
    const save = async () => {
      try {
        const state = {
          profile: profileRef.current,
          portfolio: portfolioRef.current,
          tickers: tickersRef.current.slice(0, 20),
          weights: weightsRef.current,
          health: ouraHealthRef.current,
          integrations: integrationsRef.current,
          social: socialConnectionsRef.current
        };
        await saveAllMemory(state);
      } catch (error) {
        console.error("Memory save failed:", error.message);
      }
    };

    const interval = setInterval(save, MEMORY_SAVE_MS);
    return () => clearInterval(interval);
  }, []);

  // Data freshness checker - auto-updates stale data and generates suggested actions
  useEffect(() => {
    const freshnessChecker = getDataFreshnessChecker({
      checkIntervalMs: FRESHNESS_CHECK_MS,
      autoUpdate: true,
    });

    freshnessChecker.on("updateStart", ({ source }) => {
      console.log(`[Backbone] Auto-updating stale data: ${source}`);
      setLastAction(`Updating ${source}...`);
    });

    freshnessChecker.on("updateComplete", ({ source, result }) => {
      if (result.success) {
        console.log(`[Backbone] ${source} updated successfully`);
        setLastAction(`${source} updated`);
      }
    });

    freshnessChecker.on("actionsGenerated", (actions) => {
      console.log(`[Backbone] Generated ${actions.length} suggested actions`);
      // Could update UI with suggested actions here
    });

    // Start the scheduler - runs every 4 hours
    freshnessChecker.start();

    // Also run an initial action generation after a short delay
    setTimeout(() => {
      freshnessChecker.generateSuggestedActions().catch(err => {
        console.error("[Backbone] Initial action generation failed:", err.message);
      });
    }, 5000);

    return () => freshnessChecker.stop();
  }, []);

  const handleAIMessage = useCallback(
    async (userMessage) => {
      const claudeConfig = getClaudeConfig();
      const multiAIConfig = getMultiAIConfig();

      // Check if any AI model is available
      if (!claudeConfig.ready && !multiAIConfig.ready) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "No AI model configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to your .env file.",
            timestamp: new Date()
          }
        ]);
        return;
      }

      // Add user message
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: userMessage,
          timestamp: new Date()
        }
      ]);

      // Add to recent user queries for conversation display
      const queryId = `query-${Date.now()}`;
      const displayTime = calculateQueryDisplayTime(userMessage);
      setRecentUserQueries((prev) => {
        // Keep only last 2 + new one = 3 max
        const recent = prev.slice(-2);
        return [
          ...recent,
          {
            id: queryId,
            content: userMessage,
            timestamp: Date.now(),
            expiresAt: Date.now() + displayTime
          }
        ];
      });

      // Extract and save user context from the message
      try {
        const contextResult = processAndSaveContext(userMessage);
        if (contextResult.saved && contextResult.domains.length > 0) {
          // Silently save context - no need to notify user
        }
      } catch (e) {
        // Silently fail context extraction
      }

      // Check if this is an agentic task that requires code execution
      const needsAgentic = isAgenticTask(userMessage);

      if (needsAgentic) {
        // Check if agentic tools are available
        const agenticCaps = await getAgenticCapabilities();

        if (agenticCaps.available) {
          setIsProcessing(true);
          engineState.setStatus("working", "Running agentic task...");
          const agenticTitle = agenticCaps.claudeCode ? "Claude Code" : "Codex";
          resetActionStream(agenticTitle);
          resetToolEvents();
          setActionStreamingText("Starting task...");

          // Execute agentic task with streaming output
          const agenticPrompt = withToolGuide(userMessage);
          const result = await executeAgenticTask(
            agenticPrompt,
            process.cwd(),
            (event) => {
              if (event.type === "stdout" || event.type === "stderr") {
                extractToolEvents(event.text, agenticCaps.claudeCode ? "claude-code" : "codex");
                // Show last 500 chars of output
                const displayText = event.output.slice(-500);
                setActionStreamingText(displayText);
              } else if (event.type === "done") {
                setActionStreamingText("");
                setActionStreamingTitle("");
                setToolEvents((prev) => prev.map((entry) => (
                  entry.status === "working"
                    ? { ...entry, status: "done", endedAt: Date.now() }
                    : entry
                )));
                toolEventActionMapRef.current.forEach((actionId) => {
                  activityNarrator.completeAction(actionId);
                });
              }
            }
          );

          // Add result as assistant message
          const resultMessage = result.success
            ? `Task completed successfully.\n\n${result.output.slice(-1000)}`
            : `Task failed: ${result.error}\n\n${result.output.slice(-500)}`;

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: resultMessage,
              timestamp: new Date(),
              isAgentic: true,
              tool: result.tool
            }
          ]);

          setIsProcessing(false);
          engineState.setStatus("idle");
          return;
        }
        // If no agentic tools, fall through to regular AI response
      }

      setIsProcessing(true);
      setStreamingText("");

      // Set engine state to thinking
      engineState.setStatus("thinking", "Processing your message...");

      // Build context from current state AND from data files (LinkedIn, projects, etc.)
      const savedUserContext = buildContextForAI(); // Include previously extracted user context
      const fileContext = await loadUserContextFiles(); // Load rich context from files
      const context = {
        // User identity from files
        user: fileContext.user,
        linkedIn: fileContext.linkedIn,
        profile: fileContext.profile,
        // Live data from state
        portfolio: {
          equity: portfolio.equity,
          cash: portfolio.cash,
          dayPL: portfolio.dayPL,
          dayPLPercent: portfolio.dayPLPercent,
          positions: portfolio.positions?.slice(0, 5)
        },
        goals: fileContext.goals || profile.goals,
        lifeScores: fileContext.lifeScores,
        projects: fileContext.projects,
        topTickers: tickers.slice(0, 5).map((t) => ({ symbol: t.symbol, score: t.score })),
        health: ouraHealth?.today || ouraHealth || null,
        education: profile.education || null,
        userContext: savedUserContext, // Previously learned user information
        conversationHistory: fileContext.conversationHistory,
        recentMessages: messages.slice(-5).map(m => ({ role: m.role, content: m.content.slice(0, 300) }))
      };

      // Use Claude streaming if available, otherwise use multi-ai (OpenAI fallback)
      if (claudeConfig.ready) {
        try {
          let fullText = "";
          await streamMessage(
            userMessage,
            (chunk) => {
              if (chunk.type === "text") {
                fullText += chunk.text;
                setStreamingText(fullText);
              } else if (chunk.type === "done") {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: fullText,
                    timestamp: new Date()
                  }
                ]);
                setStreamingText("");
                setIsProcessing(false);
                engineState.setStatus("idle");

                // Track conversation for learning
                conversationTracker.record(userMessage, fullText, {
                  category: conversationTracker.categorizeMessage(userMessage)
                });
              } else if (chunk.type === "error") {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: `Error: ${chunk.error}`,
                    timestamp: new Date()
                  }
                ]);
                setStreamingText("");
                setIsProcessing(false);
                engineState.setStatus("idle");
              }
            },
            context
          );
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Error: ${error.message}`,
              timestamp: new Date()
            }
          ]);
          setStreamingText("");
          setIsProcessing(false);
          engineState.setStatus("idle");
        }
      } else {
        // Use OpenAI via multi-ai service (GPT-5.2)
        try {
          const result = await sendMultiAI(userMessage, context, "auto");
          // Update model info for display
          let resolvedModelInfo = result.modelInfo || null;
          if (resolvedModelInfo) {
            resolvedModelInfo = buildModelDisplayInfo(resolvedModelInfo, result.taskType) || { ...resolvedModelInfo, taskType: result.taskType };
            setCurrentModelInfo(resolvedModelInfo);
          }
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: result.response,
              timestamp: new Date(),
              model: result.model,
              modelInfo: resolvedModelInfo || result.modelInfo
            }
          ]);
          setIsProcessing(false);
          engineState.setStatus("idle");

          // Track conversation for learning
          conversationTracker.record(userMessage, result.response, {
            category: conversationTracker.categorizeMessage(userMessage)
          });

          // Check if user is expressing goals/priorities and offer to create goals
          const goalIndicators = [
            /\bi want to\b/i, /\bi need to\b/i, /\bi wish\b/i, /\bmy goal is\b/i,
            /\bwhat matters (to me|most)\b/i, /\bi care about\b/i, /\bi'm trying to\b/i,
            /\bi hope to\b/i, /\bi'd like to\b/i, /\bi want\b/i, /\bimportant to me\b/i
          ];
          const isGoalExpression = goalIndicators.some(pattern => pattern.test(userMessage));
          const goalTracker = getGoalTracker();
          const hasNoGoals = goalTracker.getActive().length === 0;

          if (isGoalExpression && hasNoGoals && userMessage.length > 20) {
            // User is expressing goals/priorities and has no goals set - offer to create them
            setTimeout(() => {
              setMessages((prev) => [...prev, {
                role: "assistant",
                content: "I notice you're sharing what's important to you. Would you like me to create trackable goals from this? Use: /goals ai " + userMessage.slice(0, 50) + "...",
                timestamp: new Date(),
                isSystemHint: true
              }]);
            }, 1500);
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Error: ${error.message}`,
              timestamp: new Date()
            }
          ]);
          setIsProcessing(false);
          engineState.setStatus("idle");
        }
      }
    },
    [
      portfolio,
      profile.goals,
      profile.education,
      tickers,
      ouraHealth,
      engineState,
      withToolGuide,
      resetActionStream,
      resetToolEvents,
      extractToolEvents,
      activityNarrator,
      conversationTracker
    ]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLiveRef.current && !pauseUpdatesRef.current && useMockData) {
        setTickers(buildMockTickers(tickerEngine));
      }
    }, SCORE_REFRESH_MS);

    return () => clearInterval(interval);
  }, [tickerEngine, useMockData]);

  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);

  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);

  useEffect(() => {
    portfolioRef.current = portfolio;
  }, [portfolio]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    ouraHealthRef.current = ouraHealth;
  }, [ouraHealth]);



  useEffect(() => {
    socialConnectionsRef.current = socialConnections;
  }, [socialConnections]);

  useEffect(() => {
    integrationsRef.current = {
      alpaca: alpacaStatus,
      oura: ouraHealth?.connected ? "Connected" : "Missing",
      linkedin: linkedInProfile?.connected ? "Connected" : "Missing",
      claude: claudeStatus
    };
  }, [alpacaStatus, ouraHealth, linkedInProfile, claudeStatus]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Life feed updates - reduced frequency to prevent flickering
  // Only update if there's actually new content
  const lifeFeedRef = useRef(null);
  useEffect(() => {
    const interval = setInterval(() => {
      if (pauseUpdatesRef.current || isTypingRef.current) {
        return;
      }
      const newEvent = buildLifeEvent();
      // Only add if it's actually different from the last event
      if (lifeFeedRef.current !== newEvent.id) {
        lifeFeedRef.current = newEvent.id;
        setLifeFeed((prev) => [newEvent, ...prev].slice(0, 12));
      }
    }, 15_000); // Increased from 10s to 15s to reduce flickering further

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncAlpaca = async () => {
      if (isTypingRef.current) {
        return;
      }

      // Always update the config ref so we show key previews
      alpacaConfigRef.current = loadAlpacaConfig();
      const config = getAlpacaConfig();

      if (!config.ready) {
        setAlpacaStatus("Missing keys");
        setAlpacaMode(DEFAULTS.alpaca.environment);
        if (!useMockData && !portfolioRef.current?.positions?.length) {
          setPortfolio(buildEmptyPortfolio());
        }
        isLiveRef.current = false;
        return;
      }

      try {
        const [account, positions] = await Promise.all([fetchAccount(config), fetchPositions(config)]);

        if (cancelled || isTypingRef.current) {
          return;
        }

        // Successfully got data - update everything (with change detection)
        const newPortfolio = buildPortfolioFromAlpaca(account, positions);
        setPortfolio((prev) => {
          // Only update if equity or positions changed
          if (prev && prev.equity === newPortfolio.equity &&
              JSON.stringify(prev.positions) === JSON.stringify(newPortfolio.positions)) {
            return prev;
          }
          return newPortfolio;
        });
        setAlpacaStatus((prev) => prev === "Live" ? prev : "Live");
        setAlpacaMode((prev) => {
          const newMode = config.mode === "live" ? "Live" : "Paper";
          return prev === newMode ? prev : newMode;
        });
        setPortfolioLastUpdated(new Date());
        isLiveRef.current = true;
      } catch (error) {
        // Log the actual error so we can debug
        process.stderr.write(`[Alpaca Error] ${error.message}\n`);
        // Fetch failed - but keep any existing data, just update status
        if (!cancelled) {
          // Only set to offline if we don't have data yet
          if (portfolioRef.current?.equity === "--") {
            setAlpacaStatus("Offline");
          }
        }
      }
    };

    // Run immediately
    syncAlpaca();

    // Then run every 5 seconds
    const interval = setInterval(syncAlpaca, PORTFOLIO_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [useMockData]);

  // Note: Alpaca quote sync disabled - free tier doesn't have market data access
  // Ticker data now comes from Yahoo Finance instead

  // Note: Alpaca live scores sync disabled - free tier doesn't have market data access
  // Ticker scores now come from Yahoo Finance instead

  // Fetch trading history (8 weeks) and update next trade time
  useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      if (!isLiveRef.current) return;

      try {
        const history = await getTradingHistory();
        if (!cancelled && history) {
          setTradingHistory((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(history)) return prev;
            return history;
          });
        }
      } catch (error) {
        // Silently fail - trading history is supplementary
      }
    };

    const updateNextTradeTime = () => {
      const nextTrade = getNextTradingTime();
      setNextTradeTimeDisplay((prev) => prev === nextTrade.formatted ? prev : nextTrade.formatted);
    };

    // Initial fetch
    fetchHistory();
    updateNextTradeTime();

    // Refresh trading history every 5 minutes
    const historyInterval = setInterval(fetchHistory, 5 * 60 * 1000);
    // Update next trade time every minute
    const tradeTimeInterval = setInterval(updateNextTradeTime, 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(historyInterval);
      clearInterval(tradeTimeInterval);
    };
  }, [alpacaStatus]);

  // Autonomous trading loop - runs every 10 minutes during market hours
  useEffect(() => {
    let cancelled = false;

    const runAutoTrading = async () => {
      // Skip if not connected to Alpaca or no tickers
      if (!alpacaStatus || alpacaStatus === "Offline" || alpacaStatus === "Missing keys") {
        return;
      }

      // Skip if market is closed
      if (!isMarketOpen()) {
        return;
      }

      // Skip if no ticker data
      if (!tickers || tickers.length === 0) {
        return;
      }

      // Skip if no positions data
      if (!portfolio || !portfolio.positions) {
        return;
      }

      try {
        // Load trading config
        const config = loadTradingConfig();

        // Skip if trading is disabled
        if (!config.enabled) {
          return;
        }

        // Run the auto-trading monitor
        const result = await monitorAndTrade(tickers, portfolio.positions);

        if (result.executed && result.executed.length > 0) {
          // Trades were executed - refresh portfolio
          setLastAction(`Auto-trade: ${result.executed.map(t => `${t.side} ${t.symbol}`).join(", ")}`);
        }
      } catch (error) {
        console.error("Auto-trading error:", error.message);
      }
    };

    // Run immediately on mount (if conditions are met)
    runAutoTrading();

    // Run every 10 minutes
    const interval = setInterval(runAutoTrading, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [alpacaStatus, tickers, portfolio]);

  // Start Yahoo Finance server and fetch tickers (always - Alpaca free tier doesn't have market data)
  useEffect(() => {
    let cancelled = false;

    const initYahooFinance = async () => {
      // Start Yahoo Finance server in background
      await startYahooServer();
    };

    // Helper to check if ticker data actually changed
    const tickersChanged = (prevTickers, nextTickers) => {
      if (prevTickers.length !== nextTickers.length) return true;
      for (let i = 0; i < Math.min(20, prevTickers.length); i++) {
        const prev = prevTickers[i];
        const next = nextTickers[i];
        if (!prev || !next) return true;
        if (prev.symbol !== next.symbol) return true;
        if (prev.score !== next.score) return true;
        if (prev.change !== next.change) return true;
      }
      return false;
    };

    const fetchFromYahoo = async () => {
      // Skip if typing or paused
      if (pauseUpdatesRef.current || isTypingRef.current) {
        return;
      }

      try {
        const result = await fetchYahooTickers();

        if (cancelled || isTypingRef.current) return;

        if (result.success && result.tickers.length > 0) {
          // Only update state if data actually changed (prevents glitchy re-renders)
          let didChange = false;
          setTickers((prevTickers) => {
            if (tickersChanged(prevTickers, result.tickers)) {
              didChange = true;
              return result.tickers;
            }
            return prevTickers;
          });
          // Only update timestamp if tickers actually changed
          if (didChange) {
            const nextTime = new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit"
            });
            if (nextTime !== lastQuoteUpdateRef.current) {
              lastQuoteUpdateRef.current = nextTime;
              setLastQuoteUpdate(nextTime);
            }
          }
        }
      } catch (error) {
        // Silently handle errors - server might still be starting
      }
    };

    // Initialize server
    initYahooFinance();

    // Initial fetch after delay for server startup
    setTimeout(fetchFromYahoo, 3000);

    // Refresh every 5 minutes (user requested)
    const interval = setInterval(fetchFromYahoo, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const updateWeight = (metric, value) => {
    setWeights((prev) => {
      const updated = {
        ...prev,
        [metric]: value
      };
      return normalizeWeights(updated);
    });
  };

  const handleTypingChange = useCallback((typing) => {
    // Use ref to prevent re-renders in intervals
    pauseUpdatesRef.current = typing;
    isTypingRef.current = typing;
    // Only update state occasionally to avoid re-render storms
    if (!typing) {
      setPauseUpdates(false);
    }
  }, []);

  const openSetupOverlay = useCallback((type) => {
    pauseUpdatesRef.current = true;
    isTypingRef.current = true;
    setPauseUpdates(true);
    setSetupOverlay({ active: true, type });
  }, []);

  const closeSetupOverlay = useCallback(() => {
    pauseUpdatesRef.current = false;
    isTypingRef.current = false;
    setPauseUpdates(false);
    setSetupOverlay({ active: false, type: null });
  }, []);

  const onSubmit = async (value) => {
    const trimmed = value.trim();
    const resolved = trimmed;
    isTypingRef.current = false;
    setPauseUpdates(false);

    if (setupOverlay.active) {
      closeSetupOverlay();
    }

    if (resolved.startsWith("/")) {
      setActiveCommand(resolved);

      // Set engine status based on command type
      if (resolved.startsWith("/linkedin")) {
        engineState.setStatus("connecting", "Opening LinkedIn...");
      } else if (resolved.startsWith("/oura") || resolved.startsWith("/health")) {
        engineState.setStatus("syncing", "Syncing health data...");
      } else if (resolved.startsWith("/alpaca") || resolved.startsWith("/portfolio") || resolved.startsWith("/trading")) {
        engineState.setStatus("connecting_provider", "Connecting to trading...");
      } else if (resolved.startsWith("/sync") || resolved.startsWith("/finances")) {
        engineState.setStatus("syncing", "Syncing data...");
      } else if (resolved.startsWith("/plan") || resolved.startsWith("/goals")) {
        engineState.setStatus("planning", "Processing goals...");
      } else if (resolved.startsWith("/insights") || resolved.startsWith("/report") || resolved.startsWith("/dashboard")) {
        engineState.setStatus("analyzing", "Generating insights...");
      } else if (resolved.startsWith("/project")) {
        engineState.setStatus("building", "Managing projects...");
      }

      if (resolved === "/clear") {
        setMessages([]);
        setLastAction("Conversation cleared");
        return;
      }

      if (resolved === "/setup") {
        setShowOnboarding(true);
        setLastAction("Setup wizard opened");
        return;
      }

      if (resolved === "/logout") {
        handleLogout();
        return;
      }

      if (resolved === "/connect") {
        const prompts = getConnectionPrompts(getSocialConfig());
        const promptText = prompts.length > 0
          ? prompts.map((p) => `○ ${p.platform}: ${p.message}\n   Add ${p.envVar} to .env`).join("\n\n")
          : "All integrations connected!";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Connect Integrations:\n\n${promptText}`,
            timestamp: new Date()
          }
        ]);
        setLastAction("Showing connections");
        
        return;
      }

      // LinkedIn data command - show stored profile data in viewer
      if (resolved === "/linkedin data") {
        const storedProfile = loadLinkedInProfile();

        if (!storedProfile || !storedProfile.profile) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "No LinkedIn data found.\n\nRun /linkedin to capture your profile first.",
              timestamp: new Date()
            }
          ]);
          return;
        }

        // Show the LinkedIn data viewer
        setLinkedInViewerData(storedProfile);
        setShowLinkedInViewer(true);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Opening LinkedIn Data Viewer...\nPress ESC or Q to close.",
            timestamp: new Date()
          }
        ]);
        return;
      }

      // Single LinkedIn command - opens browser, captures profile URL and data
      if (resolved === "/linkedin") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Opening LinkedIn...\nIf not logged in, please log in when the browser opens.\nYour profile will be captured automatically.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Opening LinkedIn...");

        try {
          const result = await extractLinkedInProfile();

          if (result.success) {
            // Update state with captured profile
            const linkedInData = {
              ...result.profile,
              profileUrl: result.profileUrl,
              connected: true,
              verified: true
            };
            setLinkedInProfile(linkedInData);

            // Update profile sections with LinkedIn data
            updateFromLinkedIn(linkedInData);

            // Generate linkedin.md file using LLM
            const mdResult = await generateLinkedInMarkdown(result);
            const mdStatus = mdResult.success ? "linkedin.md generated" : "markdown generation failed";

            // Build readable profile summary
            const p = result.profile || {};
            const profileSummary = [
              `URL: ${result.profileUrl}`,
              p.name && `Name: ${p.name}`,
              p.headline && `Headline: ${p.headline}`,
              p.location && `Location: ${p.location}`,
              p.currentRole && `Role: ${p.currentRole}`,
              p.currentCompany && `Company: ${p.currentCompany}`,
              p.isStudent !== undefined && `Student: ${p.isStudent ? "Yes" : "No"}`,
              p.connections && `Connections: ${p.connections}`,
              result.screenshotPath && `Screenshot: ${result.screenshotPath}`
            ].filter(Boolean).join("\n");

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `LinkedIn profile captured!\n\n${profileSummary}\n\n${mdStatus}\n\nData saved. View with /profile or /profile general`,
                timestamp: new Date()
              }
            ]);
            setLastAction("LinkedIn captured");
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `LinkedIn capture failed: ${result.error}`,
                timestamp: new Date()
              }
            ]);
            setLastAction("LinkedIn failed");
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Error: ${error.message}`,
              timestamp: new Date()
            }
          ]);
          setLastAction("LinkedIn error");
        }
        return;
      }

      // Profile command with subcommands
      if (resolved === "/profile" || resolved === "/profile overview") {
        const overview = getProfileOverview();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: overview,
            timestamp: new Date()
          }
        ]);
        setLastAction("Profile overview");
        
        return;
      }

      if (resolved.startsWith("/profile ")) {
        const section = resolved.split(" ")[1]?.toLowerCase();
        const validSections = Object.values(PROFILE_SECTIONS);

        if (validSections.includes(section)) {
          const sectionDisplay = getProfileSectionDisplay(section);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: sectionDisplay,
              timestamp: new Date()
            }
          ]);
          setLastAction(`Profile: ${section}`);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Unknown section: ${section}\n\nAvailable: /profile general | work | startup | education | health | finance | skills | goals | social`,
              timestamp: new Date()
            }
          ]);
        }
        
        return;
      }

      if (resolved === "/mcp-tools" || resolved === "/mcp") {
        const toolsList = formatToolsList();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: toolsList,
            timestamp: new Date()
          }
        ]);
        setLastAction("MCP tools list");
        
        return;
      }

      if (resolved.startsWith("/mcp enable ")) {
        const serverId = resolved.split(" ")[2];
        if (enableServer(serverId)) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Enabled MCP server: ${serverId}`,
              timestamp: new Date()
            }
          ]);
          setLastAction(`Enabled ${serverId}`);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Unknown server: ${serverId}. Use /mcp-tools to see available servers.`,
              timestamp: new Date()
            }
          ]);
        }
        
        return;
      }

      if (resolved.startsWith("/mcp disable ")) {
        const serverId = resolved.split(" ")[2];
        if (disableServer(serverId)) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Disabled MCP server: ${serverId}`,
              timestamp: new Date()
            }
          ]);
          setLastAction(`Disabled ${serverId}`);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Unknown server: ${serverId}. Use /mcp-tools to see available servers.`,
              timestamp: new Date()
            }
          ]);
        }
        
        return;
      }

      // Models command - consolidated AI provider management
      if (resolved === "/models" || resolved === "/model" || resolved === "/models status" || resolved === "/model status") {
        const status = getConnectionStatus();
        const lines = [
          `AI Models - Tier: ${status.tierLabel}`,
          `Press Ctrl+T to change tier (low/medium/high/xhigh)`,
          ""
        ];

        for (const provider of PROVIDER_LIST) {
          const p = status.providers[provider.id];
          const icon = p.connected ? "●" : "○";
          const connStatus = p.connected ? `Connected - ${p.model}` : "Not connected";
          const primary = status.primary === provider.id ? " [PRIMARY]" : "";

          lines.push(`${p.icon} ${p.displayName}${primary}`);
          lines.push(`  ${icon} ${connStatus}`);
          if (p.keyPreview) lines.push(`  Key: ${p.keyPreview}`);
          lines.push("");
        }

        lines.push("Commands:");
        lines.push("  /models connect openai   - Connect OpenAI (GPT)");
        lines.push("  /models connect anthropic - Connect Anthropic (Claude)");
        lines.push("  /models connect google   - Connect Google (Gemini)");
        lines.push("  /models primary <provider> - Set primary provider");
        lines.push("  /models tier <low|medium|high|xhigh> - Set tier");
        lines.push("  /models test - Test all connections");

        setMessages((prev) => [...prev, { role: "assistant", content: lines.join("\n"), timestamp: new Date() }]);
        setLastAction("Models status");
        return;
      }

      // Models connect <provider>
      if (resolved.startsWith("/models connect ")) {
        const providerId = resolved.replace("/models connect ", "").trim().toLowerCase();
        const provider = PROVIDERS[providerId];

        if (!provider) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Unknown provider: ${providerId}\n\nValid providers: openai, anthropic, google`,
            timestamp: new Date()
          }]);
          return;
        }

        // Open API key page
        const result = await openApiKeyPage(providerId);
        if (result.success) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `${result.message}\n\n${result.instructions.join("\n")}\n\nAfter adding the key to .env, restart BACKBONE or run /models test`,
            timestamp: new Date()
          }]);
          setLastAction(`Opening ${provider.displayName} setup`);
        }
        return;
      }

      // Models primary <provider>
      if (resolved.startsWith("/models primary ")) {
        const providerId = resolved.replace("/models primary ", "").trim().toLowerCase();
        const result = setPrimaryProvider(providerId);

        if (result.success) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Primary AI provider set to: ${PROVIDERS[providerId]?.displayName || providerId}`,
            timestamp: new Date()
          }]);
          setLastAction("Primary set");
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error: ${result.error}`,
            timestamp: new Date()
          }]);
        }
        return;
      }

      // Models tier <tier>
      if (resolved.startsWith("/models tier ")) {
        const tier = resolved.replace("/models tier ", "").trim().toLowerCase();
        const result = setModelTier(tier);

        if (result.success) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Model tier set to: ${result.label}\n\nThis affects which model version is used for each provider.`,
            timestamp: new Date()
          }]);
          setLastAction(`Tier: ${result.label}`);
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error: ${result.error}`,
            timestamp: new Date()
          }]);
        }
        return;
      }

      // Models test
      if (resolved === "/models test") {
        setLastAction("Testing connections...");
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: "Testing AI provider connections...",
          timestamp: new Date()
        }]);

        const results = await testAllConnections();
        const lines = ["Connection Test Results:", ""];

        for (const [providerId, result] of Object.entries(results)) {
          const provider = PROVIDERS[providerId];
          const icon = result.success ? "✓" : "✗";
          lines.push(`${icon} ${provider?.displayName || providerId}: ${result.message || (result.success ? "Connected" : "Not connected")}`);
        }

        setMessages((prev) => [...prev, {
          role: "assistant",
          content: lines.join("\n"),
          timestamp: new Date()
        }]);
        setLastAction("Test complete");
        return;
      }

      // Oura setup wizard
      if (resolved === "/oura" || resolved === "/oura setup") {
        openSetupOverlay(SETUP_TYPES.OURA);
        setLastAction("Oura setup");
        return;
      }

      // Oura status command
      if (resolved === "/oura status") {
        const config = getOuraConfig();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: config.ready
              ? `Oura Ring: Connected\n\nUse /oura to reconfigure.`
              : `Oura Ring: Not connected\n\nUse /oura to set up your Oura Ring.`,
            timestamp: new Date()
          }
        ]);
        setLastAction("Oura status");
        return;
      }

      // Personal Capital / Finances commands
      if (resolved === "/finances" || resolved === "/finances setup") {
        setLastAction("Checking Personal Capital...");

        // Lazy load personal capital service
        if (!personalCapitalRef.current) {
          try {
            const { getPersonalCapitalService } = await import("./services/personal-capital.js");
            personalCapitalRef.current = getPersonalCapitalService();
          } catch (error) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Error loading Personal Capital service: ${error.message}`,
                timestamp: new Date()
              }
            ]);
            setLastAction("Error");
            return;
          }
        }

        const pcConfig = personalCapitalRef.current.getConfig();

        if (!pcConfig.hasCredentials) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Personal Capital Setup\n\nTo connect your financial accounts, add these to your .env file:\n\n  PERSONAL_CAPITAL_EMAIL=your@email.com\n  PERSONAL_CAPITAL_PASSWORD=your_password\n\nNote: Personal Capital (Empower) doesn't have an official API.\nThis uses an unofficial SDK that requires 2FA via SMS.\n\nAfter adding credentials, run /finances connect`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Personal Capital needs setup");
          return;
        }

        // Credentials exist, show status
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Personal Capital Status\n\nCredentials: Configured (${pcConfig.email})\nAuthenticated: ${pcConfig.authenticated ? "Yes" : "No"}\nAccounts: ${pcConfig.accountCount}\nLast Updated: ${pcConfig.lastUpdated || "Never"}\n\nCommands:\n  /finances connect - Connect and sync data\n  /finances status - View account summary\n  /finances reset - Clear cached data`,
            timestamp: new Date()
          }
        ]);
        setLastAction("Personal Capital setup");
        return;
      }

      if (resolved === "/finances connect") {
        setLastAction("Connecting to Personal Capital...");

        // Lazy load if not already loaded
        if (!personalCapitalRef.current) {
          try {
            const { getPersonalCapitalService } = await import("./services/personal-capital.js");
            personalCapitalRef.current = getPersonalCapitalService();
          } catch (error) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${error.message}`, timestamp: new Date() }]);
            return;
          }
        }

        try {
          const authResult = await personalCapitalRef.current.authenticate();

          if (authResult.needsTwoFactor) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Two-Factor Authentication Required\n\n${authResult.message}\n\nEnter your 2FA code with:\n  /finances 2fa <code>`,
                timestamp: new Date()
              }
            ]);
            setLastAction("2FA required");
            return;
          }

          if (authResult.success) {
            // Fetch all data
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "Authenticated! Fetching financial data...",
                timestamp: new Date()
              }
            ]);

            const dataResult = await personalCapitalRef.current.fetchAll();
            setPersonalCapitalData(personalCapitalRef.current.getDisplayData());

            const summary = personalCapitalRef.current.getDisplayData();
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Personal Capital Connected\n\nAccounts: ${summary.accountCount}\nNet Worth: $${summary.netWorth?.total?.toLocaleString() || "N/A"}\n\nUse /finances status for details.`,
                timestamp: new Date()
              }
            ]);
            setLastAction("Personal Capital connected");
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Connection Failed: ${authResult.message}\n\nCheck your credentials in .env`,
                timestamp: new Date()
              }
            ]);
            setLastAction("Connection failed");
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Error: ${error.message}\n\nMake sure personal-capital-sdk is installed:\n  npm install personal-capital-sdk`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Error connecting");
        }
        return;
      }

      if (resolved.startsWith("/finances 2fa ")) {
        const code = resolved.replace("/finances 2fa ", "").trim();

        // Lazy load if not already loaded
        if (!personalCapitalRef.current) {
          try {
            const { getPersonalCapitalService } = await import("./services/personal-capital.js");
            personalCapitalRef.current = getPersonalCapitalService();
          } catch (error) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${error.message}`, timestamp: new Date() }]);
            return;
          }
        }

        if (!code) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Usage: /finances 2fa <code>",
              timestamp: new Date()
            }
          ]);
          return;
        }

        setLastAction("Verifying 2FA...");
        const result = await personalCapitalRef.current.completeTwoFactor(code);

        if (result.success) {
          const dataResult = await personalCapitalRef.current.fetchAll();
          setPersonalCapitalData(personalCapitalRef.current.getDisplayData());

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `2FA Verified! Personal Capital is now connected.\n\nUse /finances status for account details.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("2FA complete");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `2FA Failed: ${result.message}\n\nTry again with /finances 2fa <code>`,
              timestamp: new Date()
            }
          ]);
          setLastAction("2FA failed");
        }
        return;
      }

      if (resolved === "/finances status") {
        // Lazy load if not already loaded
        if (!personalCapitalRef.current) {
          try {
            const { getPersonalCapitalService } = await import("./services/personal-capital.js");
            personalCapitalRef.current = getPersonalCapitalService();
          } catch (error) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${error.message}`, timestamp: new Date() }]);
            return;
          }
        }

        const data = personalCapitalRef.current.getDisplayData();

        if (!data.connected) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Personal Capital not connected.\n\nUse /finances to set up.",
              timestamp: new Date()
            }
          ]);
          setLastAction("Not connected");
          return;
        }

        let statusLines = [
          "Personal Capital Status",
          "",
          `Net Worth: $${data.netWorth?.total?.toLocaleString() || "N/A"}`,
          `  Assets: $${data.netWorth?.assets?.toLocaleString() || "N/A"}`,
          `  Liabilities: $${data.netWorth?.liabilities?.toLocaleString() || "N/A"}`,
          "",
          `Accounts: ${data.accountCount}`,
        ];

        if (data.topHoldings?.length > 0) {
          statusLines.push("", "Top Holdings:");
          for (const h of data.topHoldings) {
            statusLines.push(`  ${h.ticker || h.name}: $${h.value?.toLocaleString() || "N/A"}`);
          }
        }

        statusLines.push("", `Last Updated: ${data.lastUpdated || "Never"}`);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: statusLines.join("\n"),
            timestamp: new Date()
          }
        ]);
        setLastAction("Finances status");
        return;
      }

      if (resolved === "/finances reset") {
        // Lazy load if not already loaded
        if (!personalCapitalRef.current) {
          try {
            const { getPersonalCapitalService } = await import("./services/personal-capital.js");
            personalCapitalRef.current = getPersonalCapitalService();
          } catch (error) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${error.message}`, timestamp: new Date() }]);
            return;
          }
        }

        personalCapitalRef.current.reset();
        setPersonalCapitalData(null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Personal Capital data cleared.\n\nUse /finances connect to reconnect.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Finances reset");
        return;
      }

      // Alpaca commands - setup overlay
      if (resolved === "/alpaca" || resolved === "/alpaca setup") {
        alpacaConfigRef.current = loadAlpacaConfig();
        openSetupOverlay(SETUP_TYPES.ALPACA);
        setLastAction("Alpaca setup");

        return;
      }

      // Alpaca status
      if (resolved === "/alpaca status") {
        setLastAction("Checking Alpaca...");
        const status = await formatAlpacaStatus();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: status,
            timestamp: new Date()
          }
        ]);
        setLastAction("Alpaca status");
        
        return;
      }

      // Alpaca mode switching
      if (resolved === "/alpaca live") {
        updateAlpacaSetting("mode", "live");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Mode set to Live trading.\n\n⚠️  Warning: Live mode uses real money!\n\nUse /alpaca status to check connection.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Mode: Live");
        
        return;
      }

      if (resolved === "/alpaca paper") {
        updateAlpacaSetting("mode", "paper");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Mode set to Paper trading (Recommended).\n\nPractice with fake money - no risk!\n\nUse /alpaca status to check connection.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Mode: Paper");
        
        return;
      }

      // Alpaca strategy switching
      if (resolved === "/alpaca swing") {
        updateAlpacaSetting("strategy", "swing");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Strategy set to Swing Trading.\n\nHold positions for days/weeks for larger moves.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Strategy: Swing");
        
        return;
      }

      if (resolved === "/alpaca options") {
        updateAlpacaSetting("strategy", "options");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Strategy set to Options Trading.\n\nTrade options contracts for leverage.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Strategy: Options");
        
        return;
      }

      // Alpaca risk switching
      if (resolved === "/alpaca conservative") {
        updateAlpacaSetting("risk", "conservative");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Risk level set to Conservative (Recommended).\n\nLower risk, steady gains.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Risk: Conservative");
        
        return;
      }

      if (resolved === "/alpaca risky") {
        updateAlpacaSetting("risk", "risky");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Risk level set to Risky.\n\n⚠️  Higher risk, potential for larger gains AND losses.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Risk: Risky");
        
        return;
      }

      // Alpaca keys - open browser
      if (resolved === "/alpaca keys") {
        const config = loadAlpacaConfig();
        setLastAction("Opening Alpaca...");

        const result = await openAlpacaForKeys(config.mode);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Opening Alpaca dashboard...\n\nURL: ${result.url}\n\n1. Log in to your Alpaca account\n2. Go to API Keys section\n3. Generate new keys if needed\n4. Copy your Key and Secret\n5. Use:\n   /alpaca key <your-key>\n   /alpaca secret <your-secret>`,
            timestamp: new Date()
          }
        ]);
        setLastAction("Alpaca dashboard opened");
        
        return;
      }

      // Set API key
      if (resolved.startsWith("/alpaca key ")) {
        const key = resolved.slice(12).trim();
        if (key) {
          updateAlpacaSetting("key", key);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `API Key saved: ••••••${key.slice(-4)}\n\nNow set your secret:\n/alpaca secret <your-secret>`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Key saved");
        }
        
        return;
      }

      // Set API secret
      if (resolved.startsWith("/alpaca secret ")) {
        const secret = resolved.slice(15).trim();
        if (secret) {
          updateAlpacaSetting("secret", secret);

          // Try to connect
          const config = loadAlpacaConfig();
          setLastAction("Testing connection...");

          const testResult = await testAlpacaConnection(config.apiKey, secret, config.mode);

          if (testResult.success) {
            // Save to .env for persistence
            saveKeysToEnv(config.apiKey, secret);

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Secret saved and connected!\n\n✓ Account: ${testResult.account.status}\n✓ Equity: $${parseFloat(testResult.account.equity).toLocaleString()}\n✓ Mode: ${config.mode === "live" ? "Live" : "Paper"}\n\nAlpaca is ready to trade!`,
                timestamp: new Date()
              }
            ]);
            setLastAction("Connected!");
          } else {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Secret saved but connection failed:\n${testResult.error}\n\nCheck your keys and try again:\n/alpaca keys - Open Alpaca to get new keys`,
                timestamp: new Date()
              }
            ]);
            setLastAction("Connection failed");
          }
        }
        
        return;
      }

      // Legacy mode command for backwards compatibility
      if (resolved.startsWith("/alpaca mode ")) {
        const mode = resolved.split(" ")[2];
        if (mode === "paper" || mode === "live") {
          updateAlpacaSetting("mode", mode);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Mode set to ${mode === "live" ? "Live" : "Paper"} trading.`,
              timestamp: new Date()
            }
          ]);
          setLastAction(`Mode: ${mode}`);
        }
        
        return;
      }

      if (resolved.startsWith("/ask ")) {
        const question = resolved.slice(5).trim();
        if (question) {
          handleAIMessage(question);
          setLastAction("Asking Claude...");
        }
        
        return;
      }

      if (resolved === "/plan" || resolved.startsWith("/plan ")) {
        const topic = resolved.slice(5).trim() || "my day";
        handleAIMessage(`Help me create a focused plan for ${topic}. Keep it actionable and prioritized.`);
        setLastAction("Planning...");
        
        return;
      }

      if (resolved === "/reflect") {
        handleAIMessage(
          "Based on my current goals and portfolio, what patterns do you notice? What should I focus on? Give me honest, actionable insights."
        );
        setLastAction("Reflecting...");
        
        return;
      }

      // Reset command with two-step confirmation
      if (resolved === "/reset") {
        const summary = getResetSummary();
        setResetFlow({ step: RESET_STEPS.CONFIRM_INTENT, selectedOption: 0 });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Reset will delete ${summary.totalFiles} files (${summary.dataFiles} data, ${summary.memoryFiles} memory).\n\nUse arrow keys to select, Enter to confirm:\n\n  > I'm sure I want to reset\n    Cancel`,
            timestamp: new Date()
          }
        ]);
        setLastAction("Reset confirmation required");
        
        return;
      }

      // Handle reset confirmation steps
      if (resolved === "/reset confirm" || resolved === "/reset yes") {
        if (resetFlow.step === RESET_STEPS.CONFIRM_INTENT) {
          setResetFlow({ step: RESET_STEPS.CONFIRM_DELETE, selectedOption: 0 });
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "This will DELETE ALL your data. Are you sure?\n\nUse arrow keys to select, Enter to confirm:\n\n  > Yes, delete everything\n    Cancel",
              timestamp: new Date()
            }
          ]);
          setLastAction("Final confirmation required");
          
          return;
        }

        if (resetFlow.step === RESET_STEPS.CONFIRM_DELETE) {
          // Actually perform the reset
          const results = deleteAllData();
          resetTradingStatus();

          // Reset all state
          setLinkedInProfile(null);
          setOuraHealth(null);
          setTradingStatus(buildTradingStatusDisplay());
          setMessages([]);

          setResetFlow({ step: RESET_STEPS.COMPLETED, selectedOption: null });
          setMessages([
            {
              role: "assistant",
              content: `Reset complete. Deleted ${results.deleted.length} files.\n\nBackbone has been reset to starting point.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Reset complete");
          
          return;
        }
      }

      if (resolved === "/reset cancel" || resolved === "/reset no") {
        setResetFlow({ step: RESET_STEPS.CANCELLED, selectedOption: null });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Reset cancelled. Your data is safe.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Reset cancelled");
        
        return;
      }

      if (resolved.startsWith("/models weight")) {
        const parts = resolved.split(" ").filter(Boolean);
        const metric = parts[2];
        const rawValue = Number.parseFloat(parts[3]);
        if (["momentum", "volume", "volatility", "sentiment"].includes(metric) && Number.isFinite(rawValue)) {
          const normalizedValue = rawValue > 1 ? rawValue / 100 : rawValue;
          updateWeight(metric, normalizedValue);
          setLastAction(`Weight ${metric} -> ${normalizedValue.toFixed(2)}`);
        } else {
          setLastAction("Usage: /models weight momentum 0.4");
        }
      }

      if (resolved.startsWith("/models weights")) {
        setLastAction("Weights refreshed");
      }

      // Open project wizard for /project (without arguments)
      if (resolved === "/project") {
        openSetupOverlay(SETUP_TYPES.PROJECT);
        setLastAction("Project wizard");
        return;
      }

      if (resolved === "/projects" || resolved === "/project list") {
        const projects = listProjects();
        if (projects.length === 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "No projects yet. Use /project to create one.",
              timestamp: new Date()
            }
          ]);
          setLastAction("Projects: none");

          return;
        }

        const listText = projects
          .map((project, index) => {
            const line = `${index + 1}. ${project.displayName}`;
            return `${line}
   Folder: ${project.id}`;
          })
          .join("\n");

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Projects:\n\n${listText}\n\nUse /project to create a new one.`,
            timestamp: new Date()
          }
        ]);
        setLastAction(`Projects: ${projects.length}`);

        return;
      }

      if (resolved.startsWith("/project new ")) {
        const rawName = resolved.slice(13).trim();
        const result = createProject(rawName, { source: "manual", initialMessage: "Workspace initialized." });
        if (!result.success) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Project create failed: ${result.error}`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Project create failed");
          
          return;
        }

        if (result.existing) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Project already exists: ${result.project.displayName}
Folder: ${result.project.id}`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Project exists");
          
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Project created: ${result.project.displayName}
Folder: ${result.project.id}
Files: goals.md, work.md`,
            timestamp: new Date()
          }
        ]);
        setProjects(listProjects()); // Refresh projects list
        setLastAction("Project created");

        return;
      }

      if (resolved.startsWith("/project action ")) {
        const rawArgs = resolved.slice(16).trim();
        const [projectToken, ...actionParts] = rawArgs.split(" ");
        const actionName = actionParts.join(" ").trim();

        if (!projectToken || !actionName) {
          setLastAction("Usage: /project action <project> <action>");
          
          return;
        }

        const result = createProjectAction(projectToken, actionName);
        if (!result.success) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Action create failed: ${result.error}`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Action create failed");
          
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Action created for ${result.project.displayName}
Action: ${result.action.name}
Folder: ${result.action.id}`,
            timestamp: new Date()
          }
        ]);
        setLastAction("Project action created");
        
        return;
      }

      if (resolved.startsWith("/models weights")) {
        setLastAction("Weights refreshed");
      }

      // /goals voice - Launch voice conversation for setting goals
      if (resolved === "/goals voice" || resolved === "/goals") {
        const goalsStatus = getGoalsStatus();

        if (!goalsStatus.openaiReady) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "OpenAI API key required for voice goals.\n\nTo set up:\n1. Run /models to configure your API keys\n2. Add OPENAI_API_KEY to your .env file\n3. Then run /goals voice again\n\nOr use /goals set <category> to set goals manually.",
              timestamp: new Date()
            }
          ]);
          setLastAction("OpenAI API key required - run /models");
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Starting Goals Voice Coach...\n\nRun this command in your terminal:\n  node scripts/goals-voice.js\n\nThis will start a voice conversation to help you set meaningful goals.\n\nCurrent goals: ${goalsStatus.goalsCount || "none set"}`,
            timestamp: new Date()
          }
        ]);
        setLastAction("Goals voice ready - run: node scripts/goals-voice.js");
        return;
      }

      if (resolved.startsWith("/goals set")) {
        const parts = resolved.split(" ").filter(Boolean).slice(2);
        if (parts.length) {
          const nextGoals = buildGoals(parts);
          setProfile((prev) => ({
            ...prev,
            goals: nextGoals
          }));

          const goalNames = nextGoals.map((goal) => goal.area).filter(Boolean);
          const projectResults = createProjectsFromGoals(goalNames);
          const createdCount = projectResults.created.length;
          const existingCount = projectResults.existing.length;
          setProjects(listProjects()); // Refresh projects list

          const projectNote = createdCount > 0 || existingCount > 0
            ? ` Projects: ${createdCount} created, ${existingCount} existing.`
            : "";
          setLastAction(`Goals set: ${parts.join(", ")}.${projectNote}`.trim());
        } else {
          setLastAction("Usage: /goals set startups family");
        }
        return;
      }

      // /goals generate - AI-powered goal generation from connected data
      if (resolved === "/goals generate" || resolved === "/goals auto") {
        setIsProcessing(true);
        engineState.setStatus("thinking", "Analyzing your data to generate goals...");
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: "Analyzing your connected data to generate personalized goals...",
          timestamp: new Date()
        }]);

        try {
          const result = await generateGoalsFromData();
          if (result.success && result.goals.length > 0) {
            const saved = saveGeneratedGoals(result.goals);
            let content = `Generated ${result.goals.length} goals based on your data (${result.sources.join(", ")}):\n\n`;
            result.goals.forEach((g, i) => {
              content += `${i + 1}. ${g.title}\n   Category: ${g.category} | Priority: ${g.priority}\n   ${g.rationale}\n\n`;
            });
            content += `${result.summary}\n\n${saved.message}`;
            setMessages((prev) => [...prev, { role: "assistant", content, timestamp: new Date() }]);
            setLastAction(`Generated ${result.goals.length} goals`);
          } else {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: result.error || "Could not generate goals. Try connecting more data sources (portfolio, health, LinkedIn).",
              timestamp: new Date()
            }]);
            setLastAction("Goal generation failed");
          }
        } catch (error) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error generating goals: ${error.message}`,
            timestamp: new Date()
          }]);
        }
        setIsProcessing(false);
        engineState.setStatus("idle");
        return;
      }

      // /goals discover - Start a discovery conversation to help articulate goals
      if (resolved === "/goals discover" || resolved === "/goals help") {
        setIsProcessing(true);
        engineState.setStatus("thinking", "Preparing discovery questions...");

        try {
          const result = await generateDiscoveryQuestions();
          if (result.success) {
            let content = `${result.intro}\n\n`;
            content += "Answer these questions to help me understand what matters most to you:\n\n";
            result.questions.forEach((q, i) => {
              content += `${i + 1}. ${q.question}\n`;
            });
            content += "\nType your answers naturally, or use: /goals ai <your answer>";
            setMessages((prev) => [...prev, { role: "assistant", content, timestamp: new Date() }]);
            setLastAction("Discovery questions ready");
          } else {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: "Default questions: What would you do if money wasn't a concern? What aspect of your health would you most like to improve? Who are the most important people in your life?",
              timestamp: new Date()
            }]);
          }
        } catch (error) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error: ${error.message}`,
            timestamp: new Date()
          }]);
        }
        setIsProcessing(false);
        engineState.setStatus("idle");
        return;
      }

      // /goals ai <text> - Generate goals from user's description of what matters
      if (resolved.startsWith("/goals ai ")) {
        const userInput = resolved.replace("/goals ai ", "").trim();
        if (userInput.length < 10) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: "Please describe what matters to you in more detail.\n\nExample: /goals ai I want to build wealth, improve my health, and spend more time with my family",
            timestamp: new Date()
          }]);
          return;
        }

        setIsProcessing(true);
        engineState.setStatus("thinking", "Creating goals from your priorities...");
        setMessages((prev) => [...prev, {
          role: "user",
          content: userInput,
          timestamp: new Date()
        }]);

        try {
          const result = await generateGoalsFromInput(userInput);
          if (result.success && result.goals.length > 0) {
            const saved = saveGeneratedGoals(result.goals);
            let content = `${result.acknowledgment}\n\nCreated ${result.goals.length} goals:\n\n`;
            result.goals.forEach((g, i) => {
              content += `${i + 1}. ${g.title}\n   ${g.category} - ${g.rationale}\n\n`;
            });
            content += saved.message;
            setMessages((prev) => [...prev, { role: "assistant", content, timestamp: new Date() }]);
            setLastAction(`Created ${result.goals.length} goals from your input`);
          } else {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: result.error || "Could not generate goals from your input. Please try being more specific.",
              timestamp: new Date()
            }]);
          }
        } catch (error) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error: ${error.message}`,
            timestamp: new Date()
          }]);
        }
        setIsProcessing(false);
        engineState.setStatus("idle");
        return;
      }

      // /data - Data scheduler commands
      if (resolved === "/data" || resolved === "/data status") {
        const report = getFreshnessReport();
        let content = "DATA FRESHNESS STATUS\n\n";

        content += `Overall: ${report.overallHealth.toUpperCase()}\n`;
        content += `Fresh: ${report.healthyCount} | Stale: ${report.staleCount} | Updating: ${report.updatingCount}\n\n`;

        content += "SOURCES:\n";
        for (const [source, info] of Object.entries(report.sources)) {
          const status = info.stale ? "⚠️ STALE" : info.updating ? "🔄 UPDATING" : "✓ FRESH";
          content += `  ${source}: ${status} (${info.ageHuman})\n`;
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Data status");
        return;
      }

      if (resolved === "/data refresh") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Running full data refresh...\nThis will update all stale sources and generate suggested actions.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Refreshing data...");

        runFullDataCheck().then(result => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Data refresh complete!\n\nUpdated: ${result.updated.length > 0 ? result.updated.join(", ") : "none"}\nSkipped: ${result.skipped.length > 0 ? result.skipped.map(s => s.source).join(", ") : "none"}\nSuggested actions: ${result.suggestedActions?.length || 0}`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Data refreshed");
        });
        return;
      }

      if (resolved === "/data actions") {
        const actions = getSuggestedActions();
        if (actions.length === 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "No suggested actions yet.\n\nRun /data refresh to generate actions based on your data.",
              timestamp: new Date()
            }
          ]);
        } else {
          let content = "SUGGESTED ACTIONS\n\n";
          actions.forEach((action, i) => {
            content += `${i + 1}. [${action.type?.toUpperCase() || "TASK"}] ${action.title}\n`;
            content += `   ${action.description}\n\n`;
          });
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content,
              timestamp: new Date()
            }
          ]);
        }
        setLastAction("Actions shown");
        return;
      }

      // /insights - Daily insights
      if (resolved === "/insights") {
        const insights = generateDailyInsights();
        const display = formatInsightsDisplay(insights);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Insights generated");
        return;
      }

      // /report - Progress reports
      if (resolved === "/report" || resolved === "/report weekly") {
        const report = generateWeeklyReport();
        const display = formatWeeklyReportDisplay(report);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Weekly report");
        return;
      }

      if (resolved === "/report daily") {
        const insights = generateDailyInsights();
        const display = formatInsightsDisplay(insights);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Daily report");
        return;
      }

      // /mentors - Learn from successful people
      if (resolved === "/mentors") {
        const display = getAllMentorsDisplay();
        const wisdom = getDailyWisdom();
        let content = display + "\n";
        content += "═".repeat(40) + "\n";
        content += `TODAY'S WISDOM from ${wisdom.mentor}\n`;
        content += `"${wisdom.quote}"\n\n`;
        content += `Principle: ${wisdom.principle}\n`;
        content += `Habit: ${wisdom.habit}\n`;

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Mentors shown");
        return;
      }

      if (resolved.startsWith("/mentors ")) {
        const category = resolved.replace("/mentors ", "").trim().toLowerCase();
        const mentors = getMentorsByCategory(category);

        if (mentors.length === 0) {
          const categories = Object.keys(MENTOR_CATEGORIES).join(", ");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `No mentors found for "${category}".\n\nAvailable categories: ${categories}`,
              timestamp: new Date()
            }
          ]);
        } else {
          let content = `MENTORS: ${MENTOR_CATEGORIES[category] || category.toUpperCase()}\n\n`;
          mentors.forEach(mentor => {
            content += formatMentorDisplay(mentor);
            content += "\n";
          });

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content,
              timestamp: new Date()
            }
          ]);
        }
        setLastAction(`Mentors: ${category}`);
        return;
      }

      // /habits - Track daily habits
      if (resolved === "/habits") {
        const display = formatHabitsDisplay();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Habits shown");
        return;
      }

      if (resolved.startsWith("/habits add ")) {
        const habitName = resolved.replace("/habits add ", "").trim();
        if (habitName) {
          const result = addHabit(habitName);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Habit added: "${habitName}"\n\nUse /habits to see all habits or /habits complete to mark as done.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Habit added");
        }
        return;
      }

      if (resolved.startsWith("/habits complete")) {
        const habits = getTodayHabits();
        const indexStr = resolved.replace("/habits complete", "").trim();
        const index = parseInt(indexStr) - 1;

        if (habits.length === 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "No habits set up yet. Use /habits add <name> to add a habit.",
              timestamp: new Date()
            }
          ]);
        } else if (index >= 0 && index < habits.length) {
          const habit = habits[index];
          const result = completeHabit(habit.id);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `✓ Completed: "${habit.title}"\n\nStreak: ${result.streak} day${result.streak !== 1 ? 's' : ''}!`,
              timestamp: new Date()
            }
          ]);
          setLastAction(`Habit completed: ${habit.title.slice(0, 20)}`);
        } else {
          // Show habits list with numbers
          let content = "Which habit did you complete?\n\n";
          habits.forEach((h, i) => {
            const status = h.completed ? "✓" : "○";
            content += `${i + 1}. ${status} ${h.title}\n`;
          });
          content += `\nUse: /habits complete <number>`;
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content,
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved === "/habits suggest") {
        let content = "RECOMMENDED HABITS\n\n";
        RECOMMENDED_HABITS.slice(0, 10).forEach((h, i) => {
          content += `${i + 1}. ${h.title}\n`;
          content += `   Category: ${h.category} | Time: ${h.timeOfDay}\n`;
          content += `   Source: ${h.source}\n\n`;
        });
        content += "Use /habits add <name> to add a habit.";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Habits suggested");
        return;
      }

      // /notify - Send notifications
      if (resolved === "/notify" || resolved === "/notify status") {
        const status = getNotificationStatus();
        let content = "NOTIFICATION STATUS\n\n";
        content += `Configured: ${status.configured ? "Yes" : "No"}\n`;
        if (status.configured) {
          content += `Send to: ${status.to}\n`;
        } else {
          content += "\nTo enable email notifications, add to .env:\n";
          content += "  SMTP_USER=your@email.com\n";
          content += "  SMTP_PASS=your_app_password\n";
          content += "  EMAIL_TO=recipient@email.com\n";
        }
        content += `\nLast daily: ${status.lastDaily || "Never"}\n`;
        content += `Last weekly: ${status.lastWeekly || "Never"}\n`;
        content += `Total sent: ${status.totalSent}\n`;
        content += `\nCommands:\n`;
        content += `  /notify daily - Send daily digest now\n`;
        content += `  /notify weekly - Send weekly report now\n`;

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Notify status");
        return;
      }

      if (resolved === "/notify daily") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sending daily digest...",
            timestamp: new Date()
          }
        ]);
        setLastAction("Sending...");

        sendDailyDigest().then(result => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: result.success
                ? "Daily digest sent! Check your email."
                : `Failed to send: ${result.error}`,
              timestamp: new Date()
            }
          ]);
          setLastAction(result.success ? "Email sent" : "Send failed");
        });
        return;
      }

      if (resolved === "/notify weekly") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sending weekly report...",
            timestamp: new Date()
          }
        ]);
        setLastAction("Sending...");

        sendWeeklyReport().then(result => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: result.success
                ? "Weekly report sent! Check your email."
                : `Failed to send: ${result.error}`,
              timestamp: new Date()
            }
          ]);
          setLastAction(result.success ? "Email sent" : "Send failed");
        });
        return;
      }

      // /recs - AI Recommendations
      if (resolved === "/recs") {
        const display = formatRecommendationsDisplay();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Recommendations");
        return;
      }

      if (resolved === "/recs refresh") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Generating new recommendations...",
            timestamp: new Date()
          }
        ]);

        const result = generateRecommendations();
        let content = `Generated ${result.new} new recommendations.\n\n`;

        if (result.situation) {
          content += `Detected focus: ${result.situation.type}\n\n`;
        }

        const recs = getTopRecommendations(5);
        recs.forEach((rec, i) => {
          const mentor = rec.mentor ? ` (${rec.mentor.name})` : "";
          content += `${i + 1}. ${rec.text}${mentor}\n`;
          content += `   [${rec.area}] ${rec.category}\n\n`;
        });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Recs refreshed");
        return;
      }

      if (resolved.startsWith("/recs done ")) {
        const indexStr = resolved.replace("/recs done ", "").trim();
        const index = parseInt(indexStr, 10) - 1;

        const recs = getTopRecommendations(10);
        if (index >= 0 && index < recs.length) {
          const rec = recs[index];
          const result = actOnRecommendation(rec.id);

          if (result.success) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Marked as done: "${rec.text.slice(0, 50)}..."\n\nGreat job taking action!`,
                timestamp: new Date()
              }
            ]);
            setLastAction("Rec completed");
          }
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Invalid recommendation number. Use /recs to see available recommendations.`,
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved.startsWith("/recs dismiss ")) {
        const indexStr = resolved.replace("/recs dismiss ", "").trim();
        const index = parseInt(indexStr, 10) - 1;

        const recs = getTopRecommendations(10);
        if (index >= 0 && index < recs.length) {
          const rec = recs[index];
          dismissRecommendation(rec.id);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Dismissed: "${rec.text.slice(0, 50)}..."`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Rec dismissed");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Invalid recommendation number. Use /recs to see available recommendations.`,
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved === "/recs focus") {
        const focus = getDailyFocus();
        let content = "TODAY'S FOCUS\n\n";
        content += focus.message + "\n\n";

        if (focus.recommendation) {
          content += `Main Recommendation:\n  ${focus.recommendation.text}\n`;
          if (focus.recommendation.mentor) {
            content += `  - ${focus.recommendation.mentor.name}\n`;
          }
        }

        if (focus.habit) {
          content += `\nPriority Habit:\n  ${focus.habit.title} (streak: ${focus.habit.streak})\n`;
        }

        content += `\nHabit Progress: ${focus.habitProgress}%`;

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Daily focus");
        return;
      }

      // /review - Weekly Review
      if (resolved === "/review" || resolved === "/review status") {
        const display = formatReviewDisplay();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Review status");
        return;
      }

      if (resolved === "/review start") {
        const review = startReview();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: review.instructions,
            timestamp: new Date()
          }
        ]);
        setLastAction("Review started");
        return;
      }

      if (resolved === "/review history") {
        const history = getReviewHistory(4);
        let content = "REVIEW HISTORY\n\n";
        content += `Total Reviews: ${history.total} | Streak: ${history.streak} weeks\n\n`;

        if (history.reviews.length === 0) {
          content += "No reviews yet. Start your first review with /review start\n";
        } else {
          history.reviews.forEach((r, i) => {
            content += `Week ${r.week}, ${r.year} - ${new Date(r.completedAt).toLocaleDateString()}\n`;
            content += `  Habits: ${r.metrics.habits.completionRate}% | Goals: ${r.metrics.goals.avgProgress}%\n`;
            if (r.nextWeekPriorities?.length > 0) {
              content += `  Top Priority: ${r.nextWeekPriorities[0]}\n`;
            }
            content += "\n";
          });
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Review history");
        return;
      }

      if (resolved === "/review stats") {
        const stats = getReviewStats();
        let content = "REVIEW STATISTICS\n\n";
        content += `Total Reviews: ${stats.totalReviews}\n`;
        content += `Review Streak: ${stats.streak} consecutive weeks\n`;
        content += `Status: ${stats.isDue ? "Due now!" : "Up to date"}\n\n`;

        if (stats.totalReviews > 0) {
          content += "HISTORICAL AVERAGES:\n";
          content += `  Habit Completion: ${stats.avgHabitCompletion}%\n`;
          content += `  Goal Progress: ${stats.avgGoalProgress}%\n\n`;

          if (stats.lastReview) {
            content += `Last Review: ${new Date(stats.lastReview).toLocaleDateString()}\n`;
          }
        } else {
          content += "Complete your first review to see statistics!\n";
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Review stats");
        return;
      }

      if (resolved === "/review save" || resolved.startsWith("/review save ")) {
        // Quick save with auto-generated data
        const notes = resolved.replace("/review save", "").trim();
        const result = saveReview({
          notes,
          reflections: {},
          priorities: []
        });

        if (result.success) {
          let content = `Review saved for Week ${result.review.week}!\n\n`;
          content += `Review Streak: ${result.streak} weeks\n\n`;
          content += "Metrics captured:\n";
          content += `  - Habits: ${result.review.metrics.habits.completionRate}% completion\n`;
          content += `  - Goals: ${result.review.metrics.goals.avgProgress}% average progress\n`;
          content += `  - Best Streak: ${result.review.metrics.habits.bestStreak} days\n`;

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content,
              timestamp: new Date()
            }
          ]);
          setLastAction("Review saved");
        }
        return;
      }

      // /dashboard - Life Dashboard
      if (resolved === "/dashboard" || resolved === "/dash") {
        const display = formatDashboardDisplay();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Dashboard");
        return;
      }

      // /account - Accountability
      if (resolved === "/account" || resolved === "/account status") {
        const display = formatAccountabilityDisplay();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Accountability");
        return;
      }

      if (resolved === "/account checkin" || resolved.startsWith("/account checkin ")) {
        const notes = resolved.replace("/account checkin", "").trim();
        const result = recordCheckIn("manual", notes);

        let content = `Check-in recorded!\n\n`;
        content += `Streak: ${result.streak} days\n`;
        content += `Habit Completion: ${result.checkIn.metrics.habitCompletion}%\n`;
        content += `Active Commitments: ${result.checkIn.metrics.activeCommitments}\n`;
        content += `Goal Progress: ${result.checkIn.metrics.goalProgress}%\n`;

        if (notes) {
          content += `\nNotes: ${notes}\n`;
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Checked in");
        return;
      }

      if (resolved.startsWith("/account commit ")) {
        const text = resolved.replace("/account commit ", "").trim();
        if (text) {
          const result = addCommitment(text);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Commitment added: "${text}"\n\nUse /account to see all commitments or /account done <#> to complete.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Commitment added");
        }
        return;
      }

      if (resolved.startsWith("/account done ")) {
        const indexStr = resolved.replace("/account done ", "").trim();
        const index = parseInt(indexStr, 10) - 1;

        const commitments = getActiveCommitments();
        if (index >= 0 && index < commitments.length) {
          const commitment = commitments[index];
          completeCommitment(commitment.id);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Completed: "${commitment.text.slice(0, 50)}..."\n\nGreat job!`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Commitment done");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Invalid commitment number. Use /account to see active commitments.",
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved.startsWith("/account partner ")) {
        const parts = resolved.replace("/account partner ", "").trim().split(" ");
        if (parts.length >= 2) {
          const name = parts[0];
          const contact = parts.slice(1).join(" ");
          const result = addPartner(name, contact, contact.includes("@") ? "email" : "phone");

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Accountability partner added: ${name} (${contact})\n\nThey'll be notified of your progress.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Partner added");
        }
        return;
      }

      // /morning - Morning Briefing
      if (resolved === "/morning" || resolved === "/briefing") {
        const briefing = getMorningBriefing();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: briefing,
            timestamp: new Date()
          }
        ]);
        setLastAction("Morning briefing");
        return;
      }

      // /focus - Focus Timer
      if (resolved === "/focus" || resolved === "/focus status") {
        const display = formatFocusDisplay();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Focus status");
        return;
      }

      if (resolved === "/focus start" || resolved.startsWith("/focus start ")) {
        const task = resolved.replace("/focus start", "").trim() || null;
        const result = startSession({ type: "pomodoro", task });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.success
              ? `${result.message}\n\nEnds at: ${result.endsAt}`
              : result.error,
            timestamp: new Date()
          }
        ]);
        setLastAction(result.success ? "Focus started" : "Focus error");
        return;
      }

      if (resolved === "/focus deep" || resolved.startsWith("/focus deep ")) {
        const task = resolved.replace("/focus deep", "").trim() || null;
        const result = startSession({ type: "deepWork", task });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.success
              ? `${result.message}\n\nEnds at: ${result.endsAt}`
              : result.error,
            timestamp: new Date()
          }
        ]);
        setLastAction(result.success ? "Deep work started" : "Focus error");
        return;
      }

      if (resolved === "/focus short" || resolved.startsWith("/focus short ")) {
        const task = resolved.replace("/focus short", "").trim() || null;
        const result = startSession({ type: "short", task });

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.success
              ? `${result.message}\n\nEnds at: ${result.endsAt}`
              : result.error,
            timestamp: new Date()
          }
        ]);
        setLastAction(result.success ? "Quick focus started" : "Focus error");
        return;
      }

      if (resolved === "/focus end" || resolved === "/focus done") {
        const result = endSession(true);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.success
              ? `${result.message}\n\nTotal sessions: ${result.stats.totalSessions} | Streak: ${result.stats.currentStreak} days`
              : result.error,
            timestamp: new Date()
          }
        ]);
        setLastAction(result.success ? "Focus completed" : "Focus error");
        return;
      }

      if (resolved === "/focus cancel") {
        const result = endSession(false);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.success ? result.message : result.error,
            timestamp: new Date()
          }
        ]);
        setLastAction("Focus cancelled");
        return;
      }

      if (resolved === "/focus pause") {
        const result = pauseSession();

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.success ? result.message : result.error,
            timestamp: new Date()
          }
        ]);
        setLastAction(result.success ? "Focus paused" : "Focus error");
        return;
      }

      if (resolved === "/focus resume") {
        const result = resumeSession();

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.success ? result.message : result.error,
            timestamp: new Date()
          }
        ]);
        setLastAction(result.success ? "Focus resumed" : "Focus error");
        return;
      }

      if (resolved === "/focus stats") {
        const todayStats = getFocusTodayStats();
        let content = "FOCUS STATISTICS\n\n";
        content += `Today: ${todayStats.sessions} sessions, ${todayStats.totalMinutes} minutes\n`;
        content += `Streak: ${todayStats.currentStreak} days\n\n`;

        if (Object.keys(todayStats.byCategory).length > 0) {
          content += "By Category:\n";
          Object.entries(todayStats.byCategory).forEach(([cat, mins]) => {
            content += `  ${cat}: ${mins} min\n`;
          });
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content,
            timestamp: new Date()
          }
        ]);
        setLastAction("Focus stats");
        return;
      }

      // /learn - Learning Tracker
      if (resolved === "/learn" || resolved === "/learn status") {
        const display = formatLearningDisplay();
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: display,
            timestamp: new Date()
          }
        ]);
        setLastAction("Learning status");
        return;
      }

      if (resolved.startsWith("/learn add ")) {
        const title = resolved.replace("/learn add ", "").trim();
        if (title) {
          const result = addLearningItem(title, { type: "book" });

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Added: "${title}"\n\nUse /learn start <#> to begin reading or /learn to see your list.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Book added");
        }
        return;
      }

      if (resolved.startsWith("/learn course ")) {
        const title = resolved.replace("/learn course ", "").trim();
        if (title) {
          const result = addLearningItem(title, { type: "course" });

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Course added: "${title}"\n\nUse /learn start <#> to begin or /learn to see your list.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Course added");
        }
        return;
      }

      if (resolved.startsWith("/learn start ")) {
        const indexStr = resolved.replace("/learn start ", "").trim();
        const index = parseInt(indexStr, 10) - 1;

        const readingList = getReadingList();
        if (index >= 0 && index < readingList.length) {
          const item = readingList[index];
          const result = startLearning(item.id);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Started reading: "${item.title}"\n\nUse /learn progress <percent> to track progress.`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Started reading");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Invalid number. Use /learn to see your reading list.",
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved.startsWith("/learn progress ")) {
        const parts = resolved.replace("/learn progress ", "").trim().split(" ");
        let progress = parseInt(parts[0], 10);

        const current = getCurrentlyReading();
        if (current) {
          if (parts.length > 1) {
            // Second arg is progress
            progress = parseInt(parts[1], 10);
          }

          const result = updateProgress(current.id, progress);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: result.success
                ? `Progress updated: ${result.item.title} - ${result.item.progress}%`
                : result.error,
              timestamp: new Date()
            }
          ]);
          setLastAction("Progress updated");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "No book currently being read. Use /learn start <#> to begin.",
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved === "/learn done" || resolved.startsWith("/learn done ")) {
        const current = getCurrentlyReading();
        if (current) {
          const ratingStr = resolved.replace("/learn done", "").trim();
          const rating = ratingStr ? parseInt(ratingStr, 10) : null;

          const result = completeLearning(current.id, rating);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Completed: "${current.title}"!\n\n${rating ? `Rating: ${"★".repeat(rating)}` : "Great job finishing it!"}`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Book completed");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "No book currently being read to complete.",
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved.startsWith("/learn note ")) {
        const noteText = resolved.replace("/learn note ", "").trim();
        const current = getCurrentlyReading();

        if (current && noteText) {
          const result = addNote(current.id, noteText, false);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Note added to "${current.title}"`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Note added");
        } else if (!current) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "No book currently being read. Notes are linked to the current book.",
              timestamp: new Date()
            }
          ]);
        }
        return;
      }

      if (resolved.startsWith("/learn highlight ")) {
        const highlightText = resolved.replace("/learn highlight ", "").trim();
        const current = getCurrentlyReading();

        if (current && highlightText) {
          const result = addNote(current.id, highlightText, true);

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Highlight saved from "${current.title}"`,
              timestamp: new Date()
            }
          ]);
          setLastAction("Highlight saved");
        }
        return;
      }

      // Reset engine status after command processing (for sync commands)
      // Async commands reset status in their callbacks
      setTimeout(() => {
        if (engineState.state.status !== "idle" && !isProcessing) {
          engineState.setStatus("idle");
        }
      }, 100);

    } else if (trimmed.length > 0) {
      // Extract goals from the conversation
      const goalResult = processMessageForGoals(trimmed);
      if (goalResult.found && goalResult.added > 0) {
        console.log(`[Backbone] Extracted ${goalResult.added} goals from conversation`);
      }

      handleAIMessage(trimmed);
      setLastAction("Thinking...");
    }

  };

  const commandList = useMemo(() => COMMANDS.join("  "), []);
  const topTickers = useMemo(() => {
    return [...tickers].sort((a, b) => b.score - a.score).slice(0, 20);
  }, [tickers]);

  const rawTerminalWidth = stdout?.columns || 160;
  const rawTerminalHeight = stdout?.rows || 40;
  const maxViewWidth = 2200;
  const maxViewHeight = 1100;
  const terminalWidth = isInitializing ? rawTerminalWidth : Math.min(rawTerminalWidth, maxViewWidth);
  const terminalHeight = isInitializing ? rawTerminalHeight : Math.min(rawTerminalHeight, maxViewHeight);
  const minHeight = 30;
  const minWidth = 120;
  // Use full terminal height
  const appHeight = terminalHeight - 1;
  // Calculate available height for content (terminal height minus header/footer)
  const contentHeight = Math.max(20, appHeight - 6);
  const isCompact = terminalWidth < minWidth;
  // Responsive mode: narrow/sidebar layout when width < 80
  const isNarrow = terminalWidth < 80;
  // Medium width: hide some panels but keep horizontal layout
  const isMedium = terminalWidth >= 80 && terminalWidth < 140;
  // Overlay only for full view (width >= 140), not for compact/medium views
  const overlayEnabled = !isNarrow && !isMedium && !showOnboarding && !isInitializing && mainViewReady && !overlaySuspended;
  const overlayEngineHeaderEnabled = true;

  useEffect(() => {
    overlayDataRef.current = {
      terminalWidth,
      terminalHeight,
      appHeight,
      isMedium,
      viewMode,
      firebaseUserDisplay,
      connectionStatuses
    };
  }, [
    terminalWidth,
    terminalHeight,
    appHeight,
    isMedium,
    viewMode,
    firebaseUserDisplay,
    connectionStatuses
  ]);

  useEffect(() => {
    if (!stdout?.on) return;
    const handleResize = () => {
      if (overlaySuspendTimerRef.current) {
        clearTimeout(overlaySuspendTimerRef.current);
      }
      setOverlaySuspended(true);
      overlaySuspendTimerRef.current = setTimeout(() => {
        setOverlaySuspended(false);
      }, 250);
    };
    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
      if (overlaySuspendTimerRef.current) {
        clearTimeout(overlaySuspendTimerRef.current);
        overlaySuspendTimerRef.current = null;
      }
    };
  }, [stdout]);

  useEffect(() => {
    if (!overlayEnabled) {
      overlayRendererRef.current?.stop();
      return;
    }
    const renderer = getOverlayRenderer({ fps: 8, silent: true });
    overlayRendererRef.current = renderer;
    renderer.start();
    return () => renderer.stop();
  }, [overlayEnabled]);

  useEffect(() => {
    if (!overlayEnabled) return;
    const renderer = overlayRendererRef.current;
    if (!renderer) return;

    const leftWidth = viewMode !== VIEW_MODES.MINIMAL && !isMedium
      ? Math.floor(terminalWidth * 0.25)
      : 0;
    const centerWidth = Math.floor(
      terminalWidth * ((viewMode === VIEW_MODES.MINIMAL || isMedium) ? 0.75 : 0.5)
    );
    const centerCol = leftWidth + 1; // account for center paddingX
    const innerCenterWidth = Math.max(10, centerWidth - 2);
    const engineHeaderCol = centerCol + 1; // AgentActivityPanel paddingX
    const engineHeaderWidth = Math.max(10, centerWidth - 4);
    const engineHeaderRow = OVERLAY_CONNECTION_HEIGHT + CONNECTION_BAR_MARGIN;

    renderer.setRegion("connection-bar", {
      row: 0,
      col: 0,
      width: terminalWidth,
      height: OVERLAY_CONNECTION_HEIGHT
    });

    if (overlayEngineHeaderEnabled) {
      renderer.setRegion("engine-header", {
        row: engineHeaderRow,
        col: engineHeaderCol,
        width: engineHeaderWidth,
        height: OVERLAY_ENGINE_HEADER_HEIGHT
      });
    }

    renderer.render();
  }, [overlayEnabled, overlayEngineHeaderEnabled, terminalWidth, isMedium, viewMode]);

  useEffect(() => {
    if (!overlayEnabled) return;
    const renderer = overlayRendererRef.current;
    if (!renderer) return;

    const segmentLength = (segments) =>
      segments.reduce((sum, seg) => sum + (seg?.text?.length || 0), 0);

    const truncateSegments = (segments, maxLen) => {
      const out = [];
      let remaining = maxLen;
      for (const seg of segments) {
        if (remaining <= 0) break;
        const text = seg.text || "";
        if (text.length <= remaining) {
          out.push(seg);
          remaining -= text.length;
        } else {
          out.push({ ...seg, text: text.slice(0, remaining) });
          remaining = 0;
        }
      }
      return out;
    };

    const buildBorderLine = (width, left, mid, right) => {
      if (width < 2) return [{ text: "".padEnd(width, " ") }];
      return [{ text: `${left}${mid.repeat(width - 2)}${right}` }];
    };

    const formatRuntime = (ms) => {
      const secs = Math.floor(ms / 1000);
      const mins = Math.floor(secs / 60);
      if (mins > 0) return `${mins}m ${secs % 60}s`;
      return `${secs}s`;
    };

    const highlightPalette = {
      "#f59e0b": { bright: "#fbbf24", base: "#d97706" },
      "#60a5fa": { bright: "#93c5fd", base: "#3b82f6" },
      "#22c55e": { bright: "#4ade80", base: "#16a34a" },
      "#a855f7": { bright: "#c084fc", base: "#9333ea" }
    };

    const buildConnectionLines = (width, data) => {
      const innerWidth = Math.max(0, width - 2);
      const services = [
        { key: "alpaca", label: "Alpaca" },
        { key: "claude", label: "Claude" },
        { key: "claudeCode", label: "Code" },
        { key: "linkedin", label: "LinkedIn" },
        { key: "oura", label: "Oura" },
        { key: "yahoo", label: "Yahoo" },
        { key: "personalCapital", label: "Finance" }
      ];

      const statuses = data.connectionStatuses || {};
      const connectedCount = services.filter((s) => statuses[s.key]?.connected).length;

      const leftSegments = [
        { text: "◇ ", color: "#f59e0b" },
        { text: "BACKBONE", color: "#f59e0b" },
        { text: " ENGINE", color: "#64748b" },
        { text: " v3.0.0", color: "#475569" },
        { text: " | ", color: "#1e293b" },
        { text: `${connectedCount}/${services.length}`, color: connectedCount > 0 ? "#22c55e" : "#64748b" },
        { text: " connected", color: "#475569" }
      ];

      if (data.firebaseUserDisplay) {
        leftSegments.push({ text: " | ", color: "#1e293b" });
        leftSegments.push({ text: data.firebaseUserDisplay, color: "#94a3b8" });
      }

      const rightSegments = [];
      services.forEach((service, idx) => {
        const connected = statuses[service.key]?.connected || false;
        rightSegments.push({
          text: connected ? "●" : "○",
          color: connected ? "#22c55e" : "#475569"
        });
        rightSegments.push({ text: ` ${service.label}`, color: "#94a3b8" });
        if (idx < services.length - 1) {
          rightSegments.push({ text: " | ", color: "#1e293b" });
        }
      });

      const leftLen = segmentLength(leftSegments);
      const rightLen = segmentLength(rightSegments);
      const space = innerWidth - leftLen - rightLen;
      const spacer = space > 0 ? " ".repeat(space) : " ";
      const trimmedRight = space > 0 ? rightSegments : truncateSegments(rightSegments, Math.max(0, innerWidth - leftLen - 1));

      const content = [
        { text: "│", color: "#0f172a" },
        ...leftSegments,
        { text: spacer },
        ...trimmedRight,
        { text: "│", color: "#0f172a" }
      ];

      return [
        buildBorderLine(width, "╭", "─", "╮"),
        content,
        buildBorderLine(width, "╰", "─", "╯")
      ];
    };

    const buildEngineHeaderLines = (width, data) => {
      const lines = [];
      const innerWidth = width;
      const stateId = data.state || "OBSERVING";
      const stateInfo = data.stateInfo || AGENT_STATES.OBSERVING;
      const stateText = stateInfo.text || stateId;
      const stats = data.stats || { tokens: 0, runtime: 0 };
      const metrics = data.metricsLine || `✧ ${stats.tokens.toLocaleString()} tokens | ${formatRuntime(stats.runtime)}`;

      const headerLeft = [{ text: "ENGINE", color: "#64748b" }];
      const headerRight = [{ text: metrics, color: "#475569" }];
      const headerSpace = innerWidth - segmentLength(headerLeft) - segmentLength(headerRight);
      lines.push([
        ...headerLeft,
        { text: headerSpace > 0 ? " ".repeat(headerSpace) : " " },
        ...truncateSegments(headerRight, Math.max(0, innerWidth - segmentLength(headerLeft) - 1))
      ]);

      lines.push([{ text: "-".repeat(innerWidth), color: "#1e293b" }]);

      const baseColor = stateInfo.color || "#f59e0b";
      const palette = highlightPalette[baseColor] || { bright: "#ffffff", base: baseColor };
      const spotlightCount = Math.min(2, stateText.length);
      const brightText = stateText.slice(0, spotlightCount);
      const restText = stateText.slice(spotlightCount);

      lines.push([
        { text: "  ", color: "#1e293b" },
        { text: brightText, color: palette.bright },
        { text: restText, color: palette.base },
        { text: "...", color: palette.base }
      ]);

      while (lines.length < OVERLAY_ENGINE_HEADER_HEIGHT) {
        lines.push([{ text: " " }]);
      }

      return lines.slice(0, OVERLAY_ENGINE_HEADER_HEIGHT);
    };

    const tick = () => {
      const data = overlayDataRef.current;
      if (!data) return;
      const connectionLines = buildConnectionLines(data.terminalWidth, data);
      renderer.updateRegion("connection-bar", connectionLines);

      if (overlayEngineHeaderEnabled) {
        const leftWidth = data.viewMode !== VIEW_MODES.MINIMAL && !data.isMedium
          ? Math.floor(data.terminalWidth * 0.25)
          : 0;
        const centerWidth = Math.floor(
          data.terminalWidth * ((data.viewMode === VIEW_MODES.MINIMAL || data.isMedium) ? 0.75 : 0.5)
        );
        const engineWidth = Math.max(10, centerWidth - 4);
        const engineData = activityNarrator.getDisplayData();
        const engineLines = buildEngineHeaderLines(engineWidth, engineData);
        renderer.updateRegion("engine-header", engineLines);
      }
    };

    tick();
    const intervalId = setInterval(tick, 120);
    return () => clearInterval(intervalId);
  }, [overlayEnabled, overlayEngineHeaderEnabled, activityNarrator]);

  // Action approval handlers
  const handleApproveAction = useCallback((actionId) => {
    autonomousEngine.approveAction(actionId);
    refreshAutonomousState();
    workLog.logAction(LOG_SOURCE.USER, "Action Approved", "", LOG_STATUS.SUCCESS);
  }, [autonomousEngine, workLog]);

  const handleRejectAction = useCallback((actionId) => {
    autonomousEngine.rejectAction(actionId);
    refreshAutonomousState();
    workLog.logAction(LOG_SOURCE.USER, "Action Rejected", "", LOG_STATUS.INFO);
  }, [autonomousEngine, workLog]);

  const handleApproveAll = useCallback(() => {
    autonomousEngine.approveAll();
    refreshAutonomousState();
    workLog.logAction(LOG_SOURCE.USER, "All Actions Approved", "", LOG_STATUS.SUCCESS);
  }, [autonomousEngine, workLog]);

  const handleStartAutonomous = useCallback(() => {
    // Use the NEW autonomous loop with Claude Code CLI or AI Brain fallback
    autonomousEngine.startAutonomousLoop();
    refreshAutonomousState();
    workLog.logSystem("Autonomous Mode Started", "Using Claude Code CLI with GPT-5.2 supervision");
  }, [autonomousEngine, workLog]);

  const handleStopAutonomous = useCallback(() => {
    autonomousEngine.stop();
    refreshAutonomousState();
    workLog.logSystem("Autonomous Mode Stopped", "");
  }, [autonomousEngine, workLog]);

  const integrations = {
    alpaca: alpacaStatus,
    oura: ouraHealth?.connected ? "Connected" : "Missing",
    linkedin: linkedInProfile?.connected ? "Connected" : "Missing",
    claude: claudeStatus
  };


  const sizeWarning = terminalWidth < minWidth || terminalHeight < minHeight
    ? `Resize terminal to at least ${minWidth}x${minHeight} for best layout.`
    : null;

  const notifications = [
    sizeWarning,
    claudeStatus !== "Connected" && "Type /models - connect an AI model",
    !personalCapitalData?.connected && "Type /finances - connect your financial wealth",
    !ouraHealth?.connected && "Type /oura - connect your health data",
    !linkedInProfile?.connected && "Type /linkedin - connect your career profile"
  ].filter(Boolean);


  // Show splash screen during initialization
  if (isInitializing) {
    return e(SplashScreen, { message: "Initializing" });
  }

  // Show onboarding wizard for first-time users or when requested
  // Fullscreen centered - nothing else visible
  if (showOnboarding) {
    return e(
      Box,
      {
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: terminalWidth,
        height: terminalHeight
      },
      e(OnboardingPanel, {
        userDisplay: firebaseUserDisplay,
        onComplete: () => {
          // Clear screen and transition to main view
          process.stdout.write("\x1b[2J\x1b[1;1H");
          updateSetting("onboardingComplete", true);
          setShowOnboarding(false);
          pauseUpdatesRef.current = false;
          setPauseUpdates(false);
          setLastAction("Setup complete!");
        }
      })
    );
  }

  if (!showOnboarding && !mainViewReady) {
    // Use same structure as main view so Ink calculates correct layout
    return e(
      Box,
      {
        key: "loading-view",
        flexDirection: "column",
        height: appHeight,
        overflow: "hidden"
      },
      e(TopStatusBar, null),
      e(
        Box,
        { flexDirection: "row", height: contentHeight, overflow: "hidden" },
        // Match main view column structure for proper layout calculation
        viewMode !== VIEW_MODES.MINIMAL && !isMedium && e(
          Box,
          { flexDirection: "column", width: "25%", paddingRight: 1, overflow: "hidden" }
        ),
        e(
          Box,
          {
            flexDirection: "column",
            width: viewMode === VIEW_MODES.MINIMAL || isMedium ? "75%" : "50%",
            paddingX: 1,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center"
          },
          e(Text, { color: "#f97316", bold: true }, "Loading..."),
          e(Text, { color: "#94a3b8" }, "Preparing your workspace")
        ),
        viewMode !== VIEW_MODES.MINIMAL && e(
          Box,
          { flexDirection: "column", width: "25%", paddingLeft: 1, overflow: "hidden" }
        )
      ),
      e(BottomStatusBar, null)
    );
  }

  // Show simple view if terminal is too small (minimum 40x20 for sidebar mode)
  if (terminalWidth < 40 || terminalHeight < 20) {
    return e(
      Box,
      { flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" },
      e(Text, { color: "#f59e0b", bold: true }, "BACKBONE"),
      e(Text, { color: "#64748b" }, ""),
      e(Text, { color: "#94a3b8" }, "Resize terminal"),
      e(Text, { color: "#64748b" }, `${terminalWidth}x${terminalHeight}`),
      e(Text, { color: "#64748b" }, "Min: 40x20")
    );
  }

  // Compact layout for default terminal sizes (< 140 width)
  // Engine-focused view with essentials only
  if (isNarrow || isMedium) {
    // Calculate connected services count
    const connectedServices = Object.values(connectionStatuses || {}).filter(s => s?.connected).length;
    const totalServices = Object.keys(connectionStatuses || {}).length || 7;

    return e(
      Box,
      { flexDirection: "column", height: appHeight, overflow: "hidden" },

      // ===== COMPACT HEADER (always visible) =====
      e(
        Box,
        { flexDirection: "column" },
        // Header row: BACKBONE ENGINE · x/n services · CONNECTED/OFFLINE
        e(
          Box,
          { flexDirection: "row", justifyContent: "space-between", paddingX: 1 },
          // Left: Logo + services + status (always shows, even when disconnected)
          e(
            Box,
            { flexDirection: "row" },
            e(Text, { color: "#f59e0b", bold: true }, "BACKBONE"),
            e(Text, { color: "#64748b", bold: true }, " ENGINE"),
            e(Text, { color: "#475569" }, " · "),
            // Services count: green if >=5, orange if 2-4, red if <=1
            e(Text, { color: connectedServices >= 5 ? "#22c55e" : connectedServices >= 2 ? "#f59e0b" : "#ef4444" }, `${connectedServices}/${totalServices} services`),
            e(Text, { color: "#475569" }, " · "),
            // Connection status - CONNECTED with pulsing green dot or OFFLINE
            connectedServices > 0
              ? e(Box, { flexDirection: "row" },
                  e(Text, { color: "#22c55e", bold: true }, "CONNECTED "),
                  e(Text, { color: pulsingDotVisible ? "#22c55e" : "#14532d" }, "●")
                )
              : e(Text, { color: "#ef4444", bold: true }, "OFFLINE")
          ),
          // Right: User name and profession from LinkedIn
          e(
            Box,
            { flexDirection: "row", gap: 1 },
            // User name (from LinkedIn first, then Firebase)
            e(Text, { color: "#f59e0b", bold: true }, linkedInProfile?.name?.split(" ")[0] || firebaseUserDisplay?.split(" ")[0] || ""),
            // Profession/headline from LinkedIn
            linkedInProfile?.headline && e(Text, { color: "#64748b" }, `· ${linkedInProfile.headline.split(/\s+at\s+|\s*[|,]\s*/i)[0]?.slice(0, 30)}`)
          )
        ),
        // Separator line below header - dark gray, full width
        e(Text, { color: "#1e293b" }, "─".repeat(terminalWidth > 0 ? terminalWidth : 80))
      ),

      // ===== MAIN CONTENT ROW (two columns) =====
      e(
        Box,
        { flexDirection: "row", flexGrow: 1, overflow: "hidden" },

        // ===== LEFT COLUMN: Main content (75%) =====
        e(
          Box,
          { flexDirection: "column", width: "75%", paddingX: 1, overflow: "hidden" },

          // USER PROGRESS - Frank vs Target vs Average (all lined up)
          (() => {
          // Build connected data for person matching
          const connectedData = {
            firebase: { connected: !!firebaseUserDisplay },
            ouraHealth: { connected: !!ouraHealth?.connected },
            portfolio: { connected: !!(alpacaStatus === "connected" || portfolio?.equity) },
            linkedIn: { connected: !!linkedInProfile?.connected }
          };

          // Get dynamically matched target person based on user's data
          const targetPerson = getTargetPerson(connectedData);
          const progressData = getProgressResearch().getProgressComparison();

          const userName = firebaseUserDisplay ? firebaseUserDisplay.split(" ")[0] : "Frank";
          const userScore = progressData?.user?.score || 0;
          const targetName = targetPerson.name;
          const targetScore = targetPerson.score;
          const avgScore = progressData?.avgPerson?.score || 27;

          const getScoreColor = (score) => score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

          return e(
            Box,
            { flexDirection: "row", gap: 2, marginTop: 1, height: 1 },
            // User
            e(Text, { color: "#f59e0b", bold: true }, userName),
            e(Text, { color: getScoreColor(userScore), bold: true }, ` ${userScore}%`),
            e(Text, { color: "#334155" }, " | "),
            // Target person (full name)
            e(Text, { color: "#22c55e" }, targetName),
            e(Text, { color: "#22c55e", bold: true }, ` ${targetScore}%`),
            e(Text, { color: "#334155" }, " | "),
            // Average Person
            e(Text, { color: "#64748b" }, "Avg Person"),
            e(Text, { color: "#64748b" }, ` ${avgScore}%`)
          );
        })(),

        // ENGINE PANEL - Primary focus (takes most space, no header in compact)
        e(
          Box,
          { flexDirection: "column", flexGrow: 1, marginTop: 1 },
          e(AgentActivityPanel, { overlayHeader: false, compact: true, scrollOffset: engineScrollOffset })
        ),

        // CONVERSATION DISPLAY - Shows recent messages and AI responses (fixed height to preserve header)
        (messages.length > 0 || isProcessing) && e(
          Box,
          { flexDirection: "column", marginTop: 1, paddingX: 1, borderStyle: "round", borderColor: "#0f172a", height: 6, overflow: "hidden" },
          e(Text, { color: "#475569", dimColor: true }, "Chat:"),
          // Show last 2 messages - truncate to prevent overflow
          ...messages.slice(-2).map((msg, i) => {
            const isUser = msg.role === "user";
            // Truncate messages to ~100 chars to fit in fixed height
            const truncated = msg.content.length > 100 ? msg.content.slice(0, 97) + "..." : msg.content;
            return e(
              Box,
              { key: `msg-${i}-${msg.timestamp}`, flexDirection: "row" },
              e(Text, { color: isUser ? "#f59e0b" : "#22c55e", bold: true }, isUser ? "You: " : "AI: "),
              e(Text, { color: isUser ? "#94a3b8" : "#e2e8f0" }, truncated)
            );
          }),
          // Show streaming response if processing (truncated)
          isProcessing && streamingText && e(
            Box,
            { flexDirection: "row" },
            e(Text, { color: "#22c55e", bold: true }, "AI: "),
            e(Text, { color: "#a3e635" }, streamingText.slice(-80) || "Thinking...")
          ),
          // Show loading indicator if processing but no streaming text yet
          isProcessing && !streamingText && e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: "#22c55e", bold: true }, "AI:"),
            e(Text, { color: "#64748b" }, "Thinking...")
          )
        ),

        // PORTFOLIO SUMMARY - One line with equity, day %, top 2 positions
        portfolio && portfolio.equity && e(
          Box,
          { flexDirection: "row", gap: 1, marginTop: 1, height: 1 },
          e(Text, { color: "#64748b" }, "$"),
          e(Text, { color: "#e2e8f0", bold: true }, privateMode ? "***" : (portfolio.equity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })),
          e(Text, { color: "#334155" }, " | "),
          // Today's change as % (not amount)
          (() => {
            const dayPct = portfolio.dayPLPercent || (portfolio.dayPL && portfolio.equity ? (portfolio.dayPL / (portfolio.equity - portfolio.dayPL)) * 100 : 0);
            const isUp = dayPct >= 0;
            const color = privateMode ? "#64748b" : (isUp ? "#22c55e" : "#ef4444");
            return e(Text, { color, bold: !privateMode }, privateMode ? "**%" : `${isUp ? "+" : ""}${dayPct.toFixed(2)}%`);
          })(),
          e(Text, { color: "#334155" }, " | "),
          e(Text, { color: "#64748b" }, `${(portfolio.positions || []).length} pos`),
          // Top 2 positions - background = today's change, percentage = total position
          ...(portfolio.positions || []).slice(0, 2).flatMap((pos, i) => {
            // Today's change for background color (todayChange is already a percentage)
            const todayPct = pos.todayChange || 0;
            const todayUp = todayPct >= 0;
            // Total position P/L for percentage display (unrealizedPlPercent is already a percentage)
            const totalPct = pos.unrealizedPlPercent || pos.pnlPercent || 0;
            const totalUp = totalPct >= 0;
            // Background based on TODAY (green/red tells user how today is going)
            const symBg = privateMode ? undefined : (todayUp ? "#14532d" : "#7f1d1d");
            const symColor = privateMode ? "#94a3b8" : "#ffffff";
            // Percentage color based on TOTAL position gain/loss
            const pctColor = privateMode ? "#64748b" : (totalUp ? "#22c55e" : "#ef4444");
            return [
              e(Text, { key: `sep${i}`, color: "#334155" }, " | "),
              e(Text, { key: `sym${i}`, color: symColor, backgroundColor: symBg, bold: true }, ` ${pos.symbol} `),
              e(Text, { key: `val${i}`, color: pctColor, bold: true }, privateMode ? "**%" : `${totalUp ? "+" : ""}${totalPct.toFixed(1)}%`)
            ];
          })
        ),

        // TOP 5 TICKERS - Compact inline display with decimals, green if > 8
        topTickers.length > 0 && e(
          Box,
          { flexDirection: "row", gap: 1, marginTop: 1, height: 1 },
          e(Text, { color: "#64748b" }, "TOP "),
          ...topTickers.slice(0, 5).map((t, i) => {
            const score = t.score || 0;
            const isHigh = score > 8;
            const isTop3 = i < 3;
            return e(
              Box,
              { key: t.symbol, flexDirection: "row", gap: 0, backgroundColor: isTop3 && isHigh ? "#14532d" : undefined },
              e(Text, { color: isTop3 && isHigh ? "#22c55e" : "#f59e0b", backgroundColor: isTop3 && isHigh ? "#14532d" : undefined }, ` ${t.symbol} `),
              e(Text, { color: isHigh ? "#22c55e" : "#94a3b8", backgroundColor: isTop3 && isHigh ? "#14532d" : undefined, bold: isHigh }, score.toFixed(1)),
              i < 4 && e(Text, { color: "#334155" }, " ")
            );
          })
        ),

        // HEALTH SUMMARY - Readiness, Sleep, Calories, HR with backgrounds and trend arrows
        ouraHealth?.connected && e(
          Box,
          { flexDirection: "row", gap: 1, marginTop: 1, height: 1 },
          e(Text, { color: "#64748b" }, "HEALTH "),
          // Readiness with background (high = relaxed, low = stressed)
          (() => {
            const score = ouraHealth.today?.readinessScore ?? ouraHealth.readiness?.score;
            const avgScore = ouraHealth.weekAverage?.readinessScore;
            if (score == null) return e(Text, { color: "#64748b" }, "Ready --");
            const isGood = score >= 70;
            const bg = isGood ? "#14532d" : "#7f1d1d";
            const trend = avgScore ? (score > avgScore ? " ↑ " : score < avgScore ? " ↓ " : "") : "";
            const trendColor = score > avgScore ? "#22c55e" : "#ef4444";
            const trendBg = score > avgScore ? "#14532d" : "#7f1d1d";
            return e(Box, { flexDirection: "row" },
              e(Text, { backgroundColor: bg, color: "#ffffff", bold: true }, ` ${isGood ? "Relaxed" : "Stressed"} ${score} `),
              trend && e(Text, { color: "#ffffff", backgroundColor: trendBg, bold: true }, trend)
            );
          })(),
          e(Text, { color: "#334155" }, " | "),
          // Sleep with background
          (() => {
            const score = ouraHealth.today?.sleepScore ?? ouraHealth.sleep?.score;
            const avgScore = ouraHealth.weekAverage?.sleepScore;
            if (score == null) return e(Text, { color: "#64748b" }, "Sleep --");
            const isGood = score >= 70;
            const bg = isGood ? "#14532d" : "#7f1d1d";
            const trend = avgScore ? (score > avgScore ? " ↑ " : score < avgScore ? " ↓ " : "") : "";
            const trendColor = score > avgScore ? "#22c55e" : "#ef4444";
            const trendBg = score > avgScore ? "#14532d" : "#7f1d1d";
            return e(Box, { flexDirection: "row" },
              e(Text, { backgroundColor: bg, color: "#ffffff", bold: true }, ` Sleep ${score} `),
              trend && e(Text, { color: "#ffffff", backgroundColor: trendBg, bold: true }, trend)
            );
          })(),
          // Calories burned - goal is 500 active calories per day
          (() => {
            const cals = ouraHealth.today?.activeCalories ?? ouraHealth.activity?.activeCalories;
            if (!cals) return null;
            const calorieGoal = 500; // Daily active calorie goal
            const isGood = cals >= calorieGoal;
            return [
              e(Text, { key: "calsep", color: "#334155" }, " | "),
              e(Text, { key: "cal", color: isGood ? "#22c55e" : "#ef4444" }, `${cals} cal`)
            ];
          })(),
          // Resting heart rate
          (() => {
            const hr = ouraHealth.today?.restingHeartRate;
            if (!hr) return null;
            const isGood = hr <= 65;
            return [
              e(Text, { key: "hrsep", color: "#334155" }, " | "),
              e(Text, { key: "hr", color: isGood ? "#22c55e" : "#f59e0b" }, `${hr} bpm`)
            ];
          })(),
          // Steps - goal is 10,000 steps per day
          (() => {
            const steps = ouraHealth.today?.steps ?? ouraHealth.activity?.steps;
            if (!steps) return null;
            const stepGoal = 10000; // Daily step goal
            const isGood = steps >= stepGoal;
            return [
              e(Text, { key: "stepsep", color: "#334155" }, " | "),
              e(Text, { key: "steps", color: isGood ? "#22c55e" : "#ef4444" }, `${(steps / 1000).toFixed(1)}k steps`)
            ];
          })()
        ),

        // CHAT INPUT - Compact mode (no header/footer)
        e(
          Box,
          { marginTop: 1 },
          setupOverlay.active
            ? e(SetupOverlay, { title: "Setup", tabs: [], onCancel: closeSetupOverlay, onComplete: closeSetupOverlay })
            : e(ChatPanel, { commands: COMMANDS, onSubmit, onTypingChange: handleTypingChange, modelInfo: currentModelInfo, compact: true })
        )
      ),

      // ===== RIGHT COLUMN: Goals Sidebar (28% - wider for better readability) =====
        e(
          Box,
          {
            flexDirection: "column",
            width: "28%",
            paddingLeft: 2,  // More padding for dot spacing
            borderStyle: "single",
            borderColor: "#1e293b",
            borderLeft: true,
            borderTop: false,
            borderBottom: false,
            borderRight: false,
            overflow: "hidden"
          },
          // Smart Goals Panel - auto-generates 5-7 SPECIFIC goals on load
          // Format: ● Goal title (can wrap to 2 lines)
          //           Project Name (gray, below)
          // Dots: gray=pending, gray-blink=working, green=complete, red=failed
          e(SmartGoalsPanel, { autoGenerate: true }),

          // Current work (from narrator - has goal info)
          e(
            Box,
            { flexDirection: "column", marginTop: 1 },
            e(Text, { color: "#64748b" }, "Working on:"),
            e(
              Box,
              { flexDirection: "row", marginTop: 0 },
              e(Text, { color: "#f59e0b" }, "● "),
              e(Text, { color: "#94a3b8", wrap: "wrap" },
                (() => {
                  const data = activityNarrator.getDisplayData();
                  return data.goal || data.workDescription || "Initializing...";
                })()
              )
            )
          ),

          // Observations (from narrator)
          e(
            Box,
            { flexDirection: "column", marginTop: 1, flexGrow: 1 },
            e(Text, { color: "#64748b" }, "Observations:"),
            ...(() => {
              const data = activityNarrator.getDisplayData();
              const observations = data.observations || [];
              if (observations.length === 0) {
                return [e(Text, { key: "no-obs", color: "#475569", dimColor: true }, "  No observations yet")];
              }
              return observations.slice(0, 3).map((obs, i) => {
                const text = obs.text?.toLowerCase() || (typeof obs === "string" ? obs.toLowerCase() : "");
                const isCompleted = text.includes("completed") || text.includes("done") || text.includes("success");
                const isAbandoned = text.includes("abandoned") || text.includes("cancelled") || text.includes("stopped");
                const isFailed = text.includes("failed") || text.includes("error");
                const dotColor = isCompleted ? "#22c55e" : isAbandoned ? "#ef4444" : isFailed ? "#ef4444" : "#f59e0b";
                const textColor = isCompleted ? "#22c55e" : isAbandoned ? "#64748b" : isFailed ? "#64748b" : "#94a3b8";
                return e(
                  Box,
                  { key: `obs-${i}`, flexDirection: "row", marginTop: 0 },
                  e(Text, { color: dotColor }, "● "),
                  e(Text, { color: textColor, wrap: "truncate-end" }, (obs.text || obs).slice(0, 28))
                );
              });
            })()
          )
        )
      ),

      // ===== COMPACT FOOTER =====
      e(
        Box,
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 1,
          height: 1,
          borderStyle: "single",
          borderColor: "#1e293b",
          borderTop: true,
          borderBottom: false,
          borderLeft: false,
          borderRight: false
        },
        // Left: Key commands
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#f59e0b" }, "/"),
          e(Text, { color: "#64748b" }, "cmds"),
          e(Text, { color: "#334155" }, "|"),
          e(Text, { color: "#f59e0b" }, "/models"),
          e(Text, { color: "#334155" }, "|"),
          e(Text, { color: "#f59e0b" }, "/portfolio")
        ),
        // Right: Expand hint
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          e(Text, { color: "#475569" }, "Expand terminal for full view"),
          e(Text, { color: "#64748b" }, `${terminalWidth}x${terminalHeight}`)
        )
      )
    );
  }

  return e(
    Box,
    { key: "main-view-" + forceRenderKey, flexDirection: "column", height: appHeight, overflow: "hidden" },
    // Connection Bar at top (Ink base + overlay for smooth updates)
    e(TopStatusBar, null),
    // Main content row
    e(
      Box,
      { flexDirection: "row", height: contentHeight, overflow: "hidden" },
      // ===== LEFT COLUMN: Progress, Goals, Tickers (isolated component) =====
      viewMode !== VIEW_MODES.MINIMAL && !isMedium && e(
        Box,
        { flexDirection: "column", width: "25%", paddingRight: 1, overflow: "hidden" },
        e(LeftSidebar, null)
      ),
      // ===== CENTER COLUMN: Engine Status, Chat =====
      e(
        Box,
        { flexDirection: "column", width: viewMode === VIEW_MODES.MINIMAL || isMedium ? "75%" : "50%", paddingX: 1, overflow: "hidden" },
        // Engine Status - overlay-rendered when enabled
        e(AgentActivityPanel, { overlayHeader: overlayEnabled && overlayEngineHeaderEnabled, scrollOffset: engineScrollOffset }),
        // Conversation Panel
        e(ConversationPanel, { messages, isLoading: isProcessing, streamingText, actionStreamingText, actionStreamingTitle }),
        // LinkedIn Data Viewer overlay
        showLinkedInViewer && e(LinkedInDataViewer, {
          data: linkedInViewerData,
          visible: showLinkedInViewer,
          onClose: () => setShowLinkedInViewer(false)
        }),
        // Test Runner Panel overlay (Ctrl+R)
        showTestRunner && e(TestRunnerPanel, {
          onClose: () => setShowTestRunner(false),
          getAlpacaConfig,
          fetchYahooTickers,
          loadTradingStatus,
          loadConfig: loadTradingConfig,
          tickers,
          portfolio,
          connections: connectionStatuses,
          engineStatus,
          toolEvents
        }),
        // Settings Panel overlay (Ctrl+S)
        showSettings && e(SettingsPanel, {
          onClose: () => setShowSettings(false),
          settings: userSettings,
          onSettingChange: (key, value) => {
            const newSettings = { ...userSettings, [key]: value };
            setUserSettings(newSettings);
            saveUserSettings(newSettings);
            // Sync private mode and view mode with app state
            if (key === "privateMode") setPrivateMode(value);
            if (key === "viewMode") setViewMode(value);
          },
          fineTuningStatus: fineTuningStatus,
          onStartFineTuning: async () => {
            try {
              const result = await runFineTuningPipeline();
              setFineTuningStatus(loadFineTuningConfig());
              return result;
            } catch (error) {
              return { success: false, error: error.message };
            }
          },
          onTestFineTuning: async () => {
            try {
              const result = await queryFineTunedModel("Hello, tell me about myself.");
              return { success: true, result };
            } catch (error) {
              return { success: false, error: error.message };
            }
          }
        }),
        setupOverlay.active
          ? e(SetupOverlay, {
              title: setupOverlay.type === SETUP_TYPES.ALPACA
                ? "Alpaca Setup"
                : setupOverlay.type === SETUP_TYPES.LLM
                  ? "Model Setup"
                  : setupOverlay.type === SETUP_TYPES.MODELS
                    ? "AI Models"
                    : setupOverlay.type === SETUP_TYPES.OURA
                      ? "Oura Setup"
                      : setupOverlay.type === SETUP_TYPES.PROJECT
                        ? "Create Project"
                        : "LinkedIn Setup",
              tabs: setupOverlay.type === SETUP_TYPES.ALPACA
                ? getAlpacaSetupTabs(alpacaConfigRef.current, {
                    onModeSelect: (mode) => {
                      updateAlpacaSetting("mode", mode);
                      alpacaConfigRef.current = loadAlpacaConfig();
                    },
                    onRiskSelect: (risk) => {
                      updateAlpacaSetting("risk", risk);
                      alpacaConfigRef.current = loadAlpacaConfig();
                    },
                    onStrategySelect: (strategy) => {
                      updateAlpacaSetting("strategy", strategy);
                      alpacaConfigRef.current = loadAlpacaConfig();
                    },
                    onOpenAlpaca: async () => {
                      const config = alpacaConfigRef.current || loadAlpacaConfig();
                      const result = await openAlpacaForKeys(config.mode || "paper");
                      if (result.success) {
                        setMessages((prev) => [
                          ...prev,
                          {
                            role: "assistant",
                            content: `Opening Alpaca dashboard...\n\n1. Log in or sign up for Alpaca\n2. Go to API Keys section\n3. Generate new keys if needed\n4. Keep the page open - you'll copy keys in the next step`,
                            timestamp: new Date()
                          }
                        ]);
                      }
                    },
                    onOpenKeysFile: async () => {
                      const config = alpacaConfigRef.current || loadAlpacaConfig();
                      const result = await openKeysFileInEditor(config.mode || "paper");
                      if (result.success) {
                        setMessages((prev) => [
                          ...prev,
                          {
                            role: "assistant",
                            content: `Opening keys file in Notepad...\n\nFile: ${result.filePath}\n\n1. Copy your API Key ID from Alpaca\n2. Paste it after ALPACA_KEY=\n3. Copy your Secret Key from Alpaca\n4. Paste it after ALPACA_SECRET=\n5. Save the file (Ctrl+S)\n6. Come back here and click Connect`,
                            timestamp: new Date()
                          }
                        ]);
                      }
                    }
                  })
                : setupOverlay.type === SETUP_TYPES.MODELS
                  ? getModelsSetupTabs(modelsConfig, {
                      onModelSelect: (model) => setModelsConfig(prev => ({ ...prev, selectedModel: model })),
                      onConnectionSelect: (type) => setModelsConfig(prev => ({ ...prev, connectionType: type })),
                      onConnect: async () => {
                        const model = modelsConfig.selectedModel;
                        // Open API key page for the selected model
                        const result = await openApiKeyPage(model);
                        if (result.success) {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `${result.message}\n\n${result.instructions?.join("\n") || ""}`,
                              timestamp: new Date()
                            }
                          ]);
                        }
                      },
                      onApiKeyInput: (key) => {
                        const model = modelsConfig.selectedModel;
                        const result = saveApiKey(model, key);
                        if (result.success) {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `API key saved for ${model}`,
                              timestamp: new Date()
                            }
                          ]);
                          // Set as primary model
                          const provider = model.includes("claude") ? "claude"
                            : model.includes("gpt") ? "openai"
                            : "google";
                          setPrimaryModel(provider);
                        }
                      }
                    })
                  : setupOverlay.type === SETUP_TYPES.OURA
                    ? getOuraSetupTabs({}, {
                        onConnectionSelect: () => {},
                        onOpenOura: async () => {
                          await openOuraKeys();
                        }
                      })
                    : setupOverlay.type === SETUP_TYPES.LLM
                      ? getLLMSetupTabs({}, {
                          onProviderSelect: () => {},
                          onModelSelect: () => {},
                          onOpenKeys: async () => {
                            await openLLMKeys();
                          }
                        })
                      : setupOverlay.type === SETUP_TYPES.PROJECT
                        ? getProjectSetupTabs({}, {
                            onNameInput: () => {},
                            onDescriptionInput: () => {},
                            onDomainSelect: () => {}
                          })
                        : getLinkedInSetupTabs({}, {
                            onMethodSelect: () => {},
                            onCapture: async () => {
                              await extractLinkedInProfile();
                            }
                          }),
              initialValues: setupOverlay.type === SETUP_TYPES.ALPACA
                ? alpacaConfigRef.current
                : setupOverlay.type === SETUP_TYPES.MODELS
                  ? modelsConfig
                  : undefined,
              onCancel: closeSetupOverlay,
              onComplete: (values) => {
                if (setupOverlay.type === SETUP_TYPES.ALPACA && values) {
                  if (values.mode) updateAlpacaSetting("mode", values.mode);
                  if (values.risk) updateAlpacaSetting("risk", values.risk);
                  if (values.strategy) updateAlpacaSetting("strategy", values.strategy);

                  // Read keys from file
                  const fileKeys = readKeysFile();
                  let config = loadAlpacaConfig();

                  // Use file keys if available
                  if (fileKeys.key && fileKeys.secret) {
                    updateAlpacaSetting("key", fileKeys.key);
                    updateAlpacaSetting("secret", fileKeys.secret);
                    config = loadAlpacaConfig();
                  }

                  // Final connection test
                  if (config.apiKey && config.apiSecret) {
                    // Save to .env for persistence
                    saveKeysToEnv(config.apiKey, config.apiSecret);

                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: "Testing Alpaca connection...",
                        timestamp: new Date()
                      }
                    ]);

                    testAlpacaConnection(config.apiKey, config.apiSecret, config.mode || "paper")
                      .then((result) => {
                        if (result.success) {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `Alpaca Connected!\n\nAccount: ${result.account.status}\nEquity: $${parseFloat(result.account.equity).toLocaleString()}\nCash: $${parseFloat(result.account.cash).toLocaleString()}\nMode: ${config.mode === "live" ? "Live" : "Paper"}\nRisk: ${config.risk}\nStrategy: ${config.strategy}\n\nYou're ready to trade!`,
                              timestamp: new Date()
                            }
                          ]);
                          setLastAction("Alpaca ready");
                        } else {
                          setMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `Connection failed: ${result.error}\n\nPlease check your API keys in the file and try again.\nUse /alpaca to reopen the setup.`,
                              timestamp: new Date()
                            }
                          ]);
                          setLastAction("Connection failed");
                        }
                      });
                  } else {
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: "No API keys found.\n\n1. Use /alpaca to open setup\n2. Click 'Get Keys' to open Alpaca dashboard\n3. Click 'Paste Keys' to open the keys file\n4. Paste your keys and save\n5. Click 'Connect'",
                        timestamp: new Date()
                      }
                    ]);
                    setLastAction("Keys missing");
                  }
                }
                // Handle models setup completion
                if (setupOverlay.type === SETUP_TYPES.MODELS && values) {
                  if (values.model) {
                    const provider = values.model.includes("claude") ? "claude"
                      : values.model.includes("gpt") ? "openai"
                      : "google";
                    setPrimaryModel(provider);
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Model configured: ${values.model}\nUse /models status to check connection.`,
                        timestamp: new Date()
                      }
                    ]);
                  }
                  setLastAction("Models configured");
                }
                // Handle project creation
                if (setupOverlay.type === SETUP_TYPES.PROJECT && values && values.name) {
                  const result = createProject(values.name, {
                    source: "wizard",
                    initialMessage: values.description || "Workspace initialized."
                  });

                  if (result.success && !result.existing) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Project created: ${result.project.displayName}\nDomain: ${values.domain || "General"}\nFolder: ${result.project.id}`,
                        timestamp: new Date()
                      }
                    ]);
                    setLastAction("Project created");
                  } else if (result.existing) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Project already exists: ${result.project.displayName}`,
                        timestamp: new Date()
                      }
                    ]);
                    setLastAction("Project exists");
                  } else {
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: `Failed to create project: ${result.error}`,
                        timestamp: new Date()
                      }
                    ]);
                    setLastAction("Project failed");
                  }
                }
                closeSetupOverlay();
              }
            })
          : e(ChatPanel, {
              commands: COMMANDS,
              onSubmit,
              onTypingChange: handleTypingChange,
              modelInfo: currentModelInfo
            })
      ),
      // ===== RIGHT COLUMN: Portfolio, Wealth (isolated component) =====
      !isMedium && e(
        Box,
        { flexDirection: "column", width: "25%", paddingLeft: 1, overflow: "hidden" },
        e(RightSidebar, null)
      )
    ),
    // Footer bar
    e(BottomStatusBar, null),
    // Approval Overlay (modal)
    showApprovalOverlay && e(ApprovalOverlay, {
      actions: autonomousState.proposedActions || [],
      selectedIndex: selectedActionIndex,
      onApprove: handleApproveAction,
      onReject: handleRejectAction,
      onApproveAll: handleApproveAll,
      onRejectAll: () => {
        autonomousState.proposedActions?.forEach(a => autonomousEngine.rejectAction(a.id));
        refreshAutonomousState();
        setShowApprovalOverlay(false);
      },
      onSelect: setSelectedActionIndex,
      onClose: () => setShowApprovalOverlay(false),
      visible: showApprovalOverlay
    })
  );
};

export default App;
