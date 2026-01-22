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
  fetchLinkedInMessages
} from "./services/linkedin.js";
import { getOuraConfig, buildOuraHealthSummary } from "./services/oura.js";
import { getSocialConfig, buildSocialConnectionsSummary, getConnectionPrompts } from "./services/social.js";
import { getCloudSyncConfig, syncBackboneState, checkPhoneInput } from "./services/cloud-sync.js";
import { saveAllMemory } from "./services/memory.js";
import { getEmailConfig, buildEmailSummary } from "./services/email.js";
import { getWealthConfig, buildWealthSummary } from "./services/wealth.js";
import { fetchTickers as fetchYahooTickers, startServer as startYahooServer, isServerRunning } from "./services/yahoo-client.js";
import { extractLinkedInProfile, saveLinkedInProfile, loadLinkedInProfile } from "./services/linkedin-scraper.js";
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
import { loadFineTuningConfig, saveFineTuningConfig, runFineTuningPipeline, queryFineTunedModel } from "./services/fine-tuning.js";
import { monitorAndTrade, loadConfig as loadTradingConfig, setTradingEnabled } from "./services/auto-trader.js";
import { isMarketOpen } from "./services/trading-status.js";

// New autonomous system imports
import { getAutonomousEngine, AI_ACTION_STATUS, AI_ACTION_TYPES, EXECUTION_TOOLS } from "./services/autonomous-engine.js";
import { getClaudeCodeBackend } from "./services/claude-code-backend.js";
import { getWorkLog, LOG_SOURCE, LOG_STATUS } from "./services/work-log.js";
import { getGoalTracker, GOAL_CATEGORY } from "./services/goal-tracker.js";
import { getLifeScores } from "./services/life-scores.js";
import { getMobileService } from "./services/mobile.js";
import { WorkLogPanel } from "./components/work-log-panel.js";
import { GoalProgressPanel } from "./components/goal-progress-panel.js";
import { ProjectsPanel } from "./components/projects-panel.js";
import { LifeScoresPanel, ParallelWorldPanel } from "./components/life-scores-panel.js";
import { EnhancedActionsPanel, CompletedActionsList } from "./components/enhanced-actions-panel.js";
import { ApprovalOverlay, QuickApprovalBar } from "./components/approval-overlay.js";
import { ConnectionBar, ConnectionPanel } from "./components/connection-bar.js";
import { WealthPanel, WealthCompact, ConnectionsStatusPanel } from "./components/wealth-panel.js";
import OuraHealthPanel from "./components/oura-health-panel.js";
import { OnboardingPanel } from "./components/onboarding-panel.js";
import { SplashScreen } from "./components/splash-screen.js";
import { ToolActionsPanel } from "./components/tool-actions-panel.js";
import { resizeForOnboarding, resizeForMainApp } from "./services/terminal-resize.js";
import { processAndSaveContext, buildContextForAI } from "./services/conversation-context.js";
import { MENTORS, MENTOR_CATEGORIES, getMentorsByCategory, getDailyWisdom, formatMentorDisplay, getAllMentorsDisplay, getMentorAdvice } from "./services/mentors.js";
import { generateDailyInsights, generateWeeklyReport, formatInsightsDisplay, formatWeeklyReportDisplay, getQuickStatus } from "./services/insights-engine.js";
import { processMessageForGoals, getGoalSummary, formatGoalsDisplay, loadGoals } from "./services/goal-extractor.js";
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

// Engine state and new panels
import { getEngineStateManager, ENGINE_STATUS } from "./services/engine-state.js";
import { EngineStatusPanel, EngineStatusLine } from "./components/engine-status-panel.js";
import { TickerScoresPanel, TickerSummaryLine } from "./components/ticker-scores-panel.js";

const e = React.createElement;

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
  const [activeCommand, setActiveCommand] = useState("/account");
  const [lastAction, setLastAction] = useState("Ready");
  const [currentTier, setCurrentTier] = useState(() => getCurrentTier());
  const [privateMode, setPrivateMode] = useState(false);
  const [viewMode, setViewMode] = useState(VIEW_MODES.CORE); // Core is default
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const initialSettingsRef = useRef(loadUserSettings());
  const [userSettings, setUserSettings] = useState(initialSettingsRef.current);
  const [showOnboarding, setShowOnboarding] = useState(!initialSettingsRef.current.onboardingComplete);
  const [firebaseUser, setFirebaseUser] = useState(() => initialSettingsRef.current.firebaseUser || getCurrentFirebaseUser());
  const firebaseUserDisplay = useMemo(() => {
    if (!firebaseUser) return "";
    const nameOrEmail = firebaseUser.name || firebaseUser.email || "User";
    const email = firebaseUser.email;
    return email && !nameOrEmail.includes(email)
      ? `${nameOrEmail} (${email})`
      : nameOrEmail;
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

  // Initialize app: load remote config from Firebase, then show main app
  useEffect(() => {
    const init = async () => {
      // Load API keys from Firebase (Plaid, Google, Alpaca, OpenAI)
      await initializeRemoteConfig();

      // Wait minimum 2 seconds for splash screen
      setTimeout(() => {
        setIsInitializing(false);
      }, 2000);
    };
    init();
  }, []);

  const resizeTimersRef = useRef([]);
  const scheduleResize = useCallback(() => {
    resizeTimersRef.current.forEach((id) => clearTimeout(id));
    const delays = [0, 400, 900, 1500];
    resizeTimersRef.current = delays.map((delay) => {
      const timeout = setTimeout(() => resizeForMainApp(), delay);
      return timeout;
    });
  }, []);

  // Resize terminal to full size only after onboarding completes
  useEffect(() => {
    if (showOnboarding || isInitializing) {
      resizeTimersRef.current.forEach((id) => clearTimeout(id));
      resizeTimersRef.current = [];
      resizeForOnboarding();
      return () => {
        resizeTimersRef.current.forEach((id) => clearTimeout(id));
        resizeTimersRef.current = [];
      };
    }

    scheduleResize();
    return () => {
      resizeTimersRef.current.forEach((id) => clearTimeout(id));
      resizeTimersRef.current = [];
    };
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
  const { stdout } = useStdout();

  // Engine state manager
  const engineState = useMemo(() => getEngineStateManager(), []);
  const [engineStatus, setEngineStatus] = useState(() => engineState.getDisplayData());

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
    if (key.ctrl && input === "s") {
      // Ctrl+S: Open settings panel
      setShowSettings(true);
      setLastAction("Settings opened");
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
    if (key.ctrl && !key.shift && lower === "s") {
      // Ctrl+S: Open onboarding/setup wizard
      setShowOnboarding(true);
      setLastAction("Setup wizard opened");
    }
    if (key.ctrl && key.shift && lower === "s") {
      // Ctrl+Shift+S: Open settings panel
      setShowSettings(true);
      setLastAction("Settings opened");
    }
  });
  const [pauseUpdates, setPauseUpdates] = useState(false);
  const pauseUpdatesRef = useRef(false); // Use ref to avoid re-renders in intervals
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
  const claudeCodeBackend = useMemo(() => getClaudeCodeBackend(), []);
  const workLog = useMemo(() => getWorkLog(), []);
  const goalTracker = useMemo(() => getGoalTracker(), []);
  const lifeScores = useMemo(() => getLifeScores(), []);
  const mobileService = useMemo(() => getMobileService(), []);
  const personalCapitalRef = useRef(null);

  const [workLogEntries, setWorkLogEntries] = useState(() => workLog.getDisplayData(15));
  const [goals, setGoals] = useState(() => goalTracker.getDisplayData());
  const [projects, setProjects] = useState(() => listProjects());
  const [lifeScoresData, setLifeScoresData] = useState(() => lifeScores.getDisplayData());
  const [autonomousState, setAutonomousState] = useState(() => autonomousEngine.getDisplayData());
  const [completedActions, setCompletedActions] = useState(() => autonomousEngine.getRecentCompleted(10));
  const [claudeCodeStatus, setClaudeCodeStatus] = useState({ initialized: false, available: false });
  const [showApprovalOverlay, setShowApprovalOverlay] = useState(false);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const [connectionStatuses, setConnectionStatuses] = useState({});
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
  const toolEventKeysRef = useRef(new Set());
  const [uiClock, setUiClock] = useState(() => Date.now());

  // Current AI model tracking for display
  const [currentModelInfo, setCurrentModelInfo] = useState(() => {
    const initial = getCurrentModel();
    return { ...initial.model, taskType: initial.taskType };
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

  const TOOL_REGEX = /\b(WebSearch|WebFetch|Fetch|Grep|Glob|Read|Bash|Copy|Mkdir|Write|Edit|Delete)\s*\(([^)]{0,200})\)/g;

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
      addToolEvent({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        tool,
        target,
        status: "working",
        startedAt: Date.now(),
        source,
        tokens: "n/a",
        diffLines: []
      });
    }

    const diffLines = lines.filter((line) => line.startsWith("+") || line.startsWith("-") || line.startsWith("@@"));
    if (diffLines.length > 0 && toolEventsRef.current.length > 0) {
      const latest = toolEventsRef.current[0];
      updateToolEvent(latest.id, {
        diffLines: [...(latest.diffLines || []), ...diffLines].slice(-10)
      });
    }
  }, [addToolEvent, updateToolEvent]);

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

      // Initialize Claude Code backend
      const backend = await claudeCodeBackend.initialize();
      setClaudeCodeStatus({ initialized: true, available: backend.installed });

      if (backend.installed) {
        workLog.logConnection(LOG_SOURCE.CLAUDE_CODE, "Claude Code Connected", backend.version, LOG_STATUS.SUCCESS);
      } else {
        workLog.logConnection(LOG_SOURCE.CLAUDE_CODE, "Claude Code Not Installed", "Using API fallback", LOG_STATUS.INFO);
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

      // Register executor for Claude Code tasks
      autonomousEngine.registerExecutor(EXECUTION_TOOLS.CLAUDE_CODE, async (action) => {
        workLog.logAction(LOG_SOURCE.CLAUDE_CODE, `Executing: ${action.title}`, action.executionPlan.prompt.slice(0, 50), LOG_STATUS.PENDING);
        const result = await claudeCodeBackend.executeTask({
          id: action.id,
          prompt: action.executionPlan.prompt,
          workDir: action.executionPlan.workDir,
          allowedTools: action.executionPlan.allowedTools,
          timeout: action.executionPlan.timeout
        });
        if (result.success) {
          workLog.logResult(LOG_SOURCE.CLAUDE_CODE, `Completed: ${action.title}`, "Task succeeded", LOG_STATUS.SUCCESS);
        } else {
          workLog.logError(LOG_SOURCE.CLAUDE_CODE, `Failed: ${action.title}`, result.error);
        }
        return result;
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
        workLog.logAction(LOG_SOURCE.AUTONOMOUS, `Started: ${action.title}`, action.type, LOG_STATUS.PENDING);
        currentActionIdRef.current = action.id;
        resetActionStream(action.title);
        resetToolEvents();
        setAutonomousState(autonomousEngine.getDisplayData());
      });

      autonomousEngine.on("action-completed", (action) => {
        workLog.logResult(LOG_SOURCE.AUTONOMOUS, `Completed: ${action.title}`, "", LOG_STATUS.SUCCESS);
        currentActionIdRef.current = null;
        resetActionStream("");
        setToolEvents((prev) => prev.map((entry) => (
          entry.status === "working"
            ? { ...entry, status: "done", endedAt: Date.now() }
            : entry
        )));
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
        setAutonomousState(autonomousEngine.getDisplayData());
        setCompletedActions(autonomousEngine.getRecentCompleted(10));
      });

      autonomousEngine.on("action-failed", (action) => {
        workLog.logError(LOG_SOURCE.AUTONOMOUS, `Failed: ${action.title}`, action.error);
        currentActionIdRef.current = null;
        resetActionStream("");
        setToolEvents((prev) => prev.map((entry) => (
          entry.status === "working"
            ? { ...entry, status: "error", endedAt: Date.now() }
            : entry
        )));
        setAutonomousState(autonomousEngine.getDisplayData());
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
      setLifeScoresData(lifeScores.getDisplayData());
    }
  }, [portfolio?.equity]);

  useEffect(() => {
    if (ouraHealth?.sleep?.score) {
      goalTracker.syncHealthGoal(ouraHealth.sleep.score);
      lifeScores.syncAllScores({
        portfolio,
        goals: goalTracker.getActive(),
        oura: ouraHealth,
        linkedin: linkedInProfile
      });
      setLifeScoresData(lifeScores.getDisplayData());
    }
  }, [ouraHealth?.sleep?.score]);

  // Update connection statuses for ConnectionBar (with change detection to reduce flickering)
  // NOTE: Only track connection status changes, not details like timestamps
  useEffect(() => {
    setConnectionStatuses((prev) => {
      const next = {
        alpaca: { connected: alpacaStatus === "Live", details: alpacaMode },
        claude: { connected: claudeStatus === "Connected", details: "" },
        claudeCode: { connected: claudeCodeStatus.available, details: claudeCodeStatus.available ? "Ready" : "Not installed" },
        linkedin: { connected: linkedInProfile?.connected, details: "" },
        oura: { connected: ouraHealth?.connected, details: "" },
        yahoo: { connected: true, details: "" }, // Removed lastQuoteUpdate to prevent flickering
        personalCapital: { connected: personalCapitalData?.connected || false, details: "" }
      };
      // Only update if connection status actually changed (ignore details)
      const prevConnected = Object.keys(prev).map(k => prev[k]?.connected).join(",");
      const nextConnected = Object.keys(next).map(k => next[k]?.connected).join(",");
      if (prevConnected === nextConnected) {
        return prev;
      }
      return next;
    });
  }, [alpacaStatus, alpacaMode, claudeStatus, claudeCodeStatus.available, linkedInProfile?.connected, ouraHealth?.connected, personalCapitalData?.connected]);

  // AI Action Generation function
  const generateAIActions = useCallback(async (context, needed) => {
    const config = getClaudeConfig();
    if (!config.ready) return [];

    const prompt = `Based on the user's current state:
- Portfolio: ${context.portfolio?.equity ? `$${context.portfolio.equity.toLocaleString()} equity` : "Not connected"}
- Health: ${context.health?.sleep?.score ? `Sleep score ${context.health.sleep.score}` : "Not connected"}
- Goals: ${context.goals?.map(g => `${g.title}: ${Math.round(g.progress * 100)}%`).join(", ") || "None set"}
- Top Tickers: ${context.tickers?.map(t => `${t.symbol} (score: ${t.score})`).join(", ") || "None"}
- Time: ${new Date().toLocaleTimeString()}

Generate ${needed} actionable tasks as JSON array. Each task should have:
- title: Brief action title
- type: One of: research, execute, analyze, health, family, plan
- description: What this action will accomplish
- prompt: The detailed prompt to execute this action

Focus on concrete, executable actions for:
1. Finance: Stock research, portfolio analysis, trading opportunities
2. Health: Sleep optimization, exercise, nutrition
3. Family: Quality time, activities, communication

Return ONLY a JSON array, no other text.`;

    try {
      const result = await sendMultiAI(prompt, context, "complex");
      const parsed = JSON.parse(result.response);
      return parsed.map(p => ({
        title: p.title,
        type: p.type || AI_ACTION_TYPES.RESEARCH,
        description: p.description,
        executionPlan: {
          tool: claudeCodeStatus.available ? EXECUTION_TOOLS.CLAUDE_CODE : EXECUTION_TOOLS.CLAUDE_API,
          prompt: p.prompt
        },
        requiresApproval: true,
        priority: 5
      }));
    } catch (error) {
      return [];
    }
  }, [claudeCodeStatus.available]);

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
      if (savedProfile && savedProfile.success && savedProfile.profile) {
        const linkedInData = {
          ...savedProfile.profile,
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
          setActionStreamingTitle(agenticCaps.claudeCode ? "Claude Code" : "Codex");
          setActionStreamingText("Starting task...");

          // Execute agentic task with streaming output
          const result = await executeAgenticTask(
            userMessage,
            process.cwd(),
            (event) => {
              if (event.type === "stdout" || event.type === "stderr") {
                // Show last 500 chars of output
                const displayText = event.output.slice(-500);
                setActionStreamingText(displayText);
              } else if (event.type === "done") {
                setActionStreamingText("");
                setActionStreamingTitle("");
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

      // Build context from current state (includes conversation history for profile building)
      const savedUserContext = buildContextForAI(); // Include previously extracted user context
      const context = {
        portfolio: {
          equity: portfolio.equity,
          cash: portfolio.cash,
          dayPL: portfolio.dayPL,
          positions: portfolio.positions?.slice(0, 5)
        },
        goals: profile.goals,
        topTickers: tickers.slice(0, 5).map((t) => ({ symbol: t.symbol, score: t.score })),
        health: ouraHealth?.today || null,
        education: profile.education || null,
        userContext: savedUserContext, // Previously learned user information
        recentMessages: messages.slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 200) })) // Include recent conversation for context
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
          if (result.modelInfo) {
            setCurrentModelInfo({ ...result.modelInfo, taskType: result.taskType });
          }
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: result.response,
              timestamp: new Date(),
              model: result.model,
              modelInfo: result.modelInfo
            }
          ]);
          setIsProcessing(false);
          engineState.setStatus("idle");
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
    [portfolio, profile.goals, profile.education, tickers, ouraHealth, engineState]
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
                content: `LinkedIn profile captured!\n\n${profileSummary}\n\nData saved. View with /profile or /profile general`,
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
          `AI Models · Tier: ${status.tierLabel}`,
          `Press Ctrl+T to change tier (low/medium/high/xhigh)`,
          ""
        ];

        for (const provider of PROVIDER_LIST) {
          const p = status.providers[provider.id];
          const icon = p.connected ? "●" : "○";
          const connStatus = p.connected ? `Connected · ${p.model}` : "Not connected";
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

  const terminalWidth = stdout?.columns || 160;
  const terminalHeight = stdout?.rows || 40;
  const minHeight = 30;
  const minWidth = 120;
  // Use full terminal height
  const appHeight = terminalHeight - 1;
  const isCompact = terminalWidth < minWidth;
  // Responsive mode: narrow/sidebar layout when width < 80
  const isNarrow = terminalWidth < 80;
  // Medium width: hide some panels but keep horizontal layout
  const isMedium = terminalWidth >= 80 && terminalWidth < 140;

  // Action approval handlers
  const handleApproveAction = useCallback((actionId) => {
    autonomousEngine.approveAction(actionId);
    setAutonomousState(autonomousEngine.getDisplayData());
    workLog.logAction(LOG_SOURCE.USER, "Action Approved", "", LOG_STATUS.SUCCESS);
  }, [autonomousEngine, workLog]);

  const handleRejectAction = useCallback((actionId) => {
    autonomousEngine.rejectAction(actionId);
    setAutonomousState(autonomousEngine.getDisplayData());
    workLog.logAction(LOG_SOURCE.USER, "Action Rejected", "", LOG_STATUS.INFO);
  }, [autonomousEngine, workLog]);

  const handleApproveAll = useCallback(() => {
    autonomousEngine.approveAll();
    setAutonomousState(autonomousEngine.getDisplayData());
    workLog.logAction(LOG_SOURCE.USER, "All Actions Approved", "", LOG_STATUS.SUCCESS);
  }, [autonomousEngine, workLog]);

  const handleStartAutonomous = useCallback(() => {
    autonomousEngine.start(generateAIActions);
    setAutonomousState(autonomousEngine.getDisplayData());
    workLog.logSystem("Autonomous Mode Started", "AI will generate and execute actions");
  }, [autonomousEngine, generateAIActions, workLog]);

  const handleStopAutonomous = useCallback(() => {
    autonomousEngine.stop();
    setAutonomousState(autonomousEngine.getDisplayData());
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
    claudeStatus !== "Connected" && "Type /models · connect an AI model",
    !personalCapitalData?.connected && "Type /finances · connect your financial wealth",
    !ouraHealth?.connected && "Type /oura · connect your health data",
    !linkedInProfile?.connected && "Type /linkedin · connect your career profile"
  ].filter(Boolean);


  // Show splash screen during initialization
  if (isInitializing) {
    return e(SplashScreen, { message: "Initializing" });
  }

  // Show onboarding wizard for first-time users or when requested
  if (showOnboarding) {
    return e(
      Box,
      { flexDirection: "column", paddingTop: 1, paddingX: 2 },
      e(OnboardingPanel, {
        userDisplay: firebaseUserDisplay,
        onComplete: () => {
          updateSetting("onboardingComplete", true);
          setShowOnboarding(false);
          pauseUpdatesRef.current = false;
          setPauseUpdates(false);
          setLastAction("Setup complete!");
        }
      })
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

  // Calculate available height (terminal height minus header/footer)
  const contentHeight = Math.max(20, appHeight - 6);

  // Narrow/sidebar layout - stacks vertically with scrolling
  if (isNarrow) {
    return e(
      Box,
      { flexDirection: "column", height: appHeight, overflow: "hidden" },
      // Compact header
      e(
        Box,
        { flexDirection: "row", justifyContent: "space-between", paddingX: 1, borderStyle: "single", borderColor: "#1e293b", borderBottom: true, borderTop: false, borderLeft: false, borderRight: false },
        e(Text, { color: "#f59e0b", bold: true }, "BACKBONE"),
        e(Text, { color: "#64748b" }, firebaseUserDisplay ? firebaseUserDisplay.split(" ")[0] : "")
      ),
      // Scrollable content area
      e(
        Box,
        { flexDirection: "column", flexGrow: 1, overflow: "hidden", paddingX: 1 },
        // Oura Health Panel (compact)
        e(OuraHealthPanel, { data: ouraHealth, history: ouraHistory, compact: true }),
        // Life Scores (compact)
        e(LifeScoresPanel, { data: lifeScoresData, title: "Progress", compact: true }),
        // Goals (compact)
        e(GoalProgressPanel, { goals: goals.slice(0, 2), title: "Goals" }),
        // Portfolio (compact)
        e(PortfolioPanel, {
          portfolio: { ...portfolio, status: alpacaStatus, mode: alpacaMode },
          formatPercent,
          tradingStatus,
          lastUpdatedAgo: portfolioLastUpdated ? formatTimeAgo(portfolioLastUpdated) : null,
          nextTradeTime: nextTradeTimeDisplay,
          privateMode,
          tickerScores: tickers.reduce((acc, t) => {
            if (t.symbol && typeof t.score === "number") acc[t.symbol] = t.score;
            return acc;
          }, {})
        }),
        // Ticker scores (compact list)
        e(TickerScoresPanel, {
          tickers: topTickers,
          title: "Top Tickers",
          viewMode: VIEW_MODES.MINIMAL,
          maxItems: 5,
          compact: true,
          timestamp: uiClock
        }),
        // Conversation/Chat at bottom
        e(ConversationPanel, { messages, isLoading: isProcessing, streamingText, actionStreamingText, actionStreamingTitle }),
        // Chat input
        setupOverlay.active
          ? e(SetupOverlay, { title: "Setup", tabs: [], onCancel: closeSetupOverlay, onComplete: closeSetupOverlay })
          : e(ChatPanel, { commands: COMMANDS, onSubmit, onTypingChange: handleTypingChange, modelInfo: currentModelInfo })
      )
    );
  }

  return e(
    Box,
    { flexDirection: "column", height: appHeight, overflow: "hidden" },
    // Connection Bar at top
    e(ConnectionBar, {
      connections: connectionStatuses,
      title: "BACKBONE",
      version: "3.0.0",
      userDisplay: firebaseUserDisplay
    }),
    e(
      Box,
      { flexDirection: "row", height: contentHeight, overflow: "hidden" },
      // ===== LEFT COLUMN: Progress, Goals, Tickers (based on view mode) =====
      // Hide left column in medium width mode to give more space to chat
      viewMode !== VIEW_MODES.MINIMAL && !isMedium && e(
        Box,
        { flexDirection: "column", width: "25%", paddingRight: 1, overflow: "hidden" },
        e(LifeScoresPanel, { data: lifeScoresData, title: "Progress", compact: true }),
        e(OuraHealthPanel, { data: ouraHealth, history: ouraHistory }),
        e(GoalProgressPanel, { goals: goals.slice(0, 2), title: "Goals" }),
        // Ticker scores panel (shows based on view mode)
        e(TickerScoresPanel, {
          tickers: topTickers,
          title: "Ticker Scores",
          viewMode: viewMode,
          maxItems: viewMode === VIEW_MODES.MINIMAL ? 3 : viewMode === VIEW_MODES.ADVANCED ? 20 : 10,
          compact: viewMode === VIEW_MODES.MINIMAL,
          timestamp: uiClock
        }),
        // Projects panel in advanced mode
        viewMode === VIEW_MODES.ADVANCED && e(ProjectsPanel, {
          projects: projects.slice(0, 3),
          title: "Active Projects",
          maxItems: 3
        })
      ),
      // ===== CENTER COLUMN: Engine Status, Chat =====
      e(
        Box,
        { flexDirection: "column", width: viewMode === VIEW_MODES.MINIMAL || isMedium ? "75%" : "50%", paddingX: 1, overflow: "hidden" },
        e(ToolActionsPanel, { items: toolEvents }),
        // Engine Status Panel - shows what AI is doing (replaces Actions)
        e(EngineStatusPanel, {
          status: engineStatus.status,
          currentPlan: engineStatus.status.currentPlan,
          currentWork: engineStatus.status.currentWork,
          projects: engineStatus.projects,
          compact: viewMode === VIEW_MODES.MINIMAL,
          actionStreamingText: actionStreamingText
        }),
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
          portfolio
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
      // ===== RIGHT COLUMN: Portfolio, Wealth (hidden in medium width) =====
      !isMedium && e(
        Box,
        { flexDirection: "column", width: "25%", paddingLeft: 1, overflow: "hidden" },
        // Portfolio Panel
        e(PortfolioPanel, {
          portfolio: {
            ...portfolio,
            status: alpacaStatus,
            mode: alpacaMode
          },
          formatPercent,
          tradingStatus,
          lastUpdatedAgo: portfolioLastUpdated ? formatTimeAgo(portfolioLastUpdated) : null,
          nextTradeTime: nextTradeTimeDisplay,
          privateMode,
          // Pass ticker scores for position action indicators
          tickerScores: tickers.reduce((acc, t) => {
            if (t.symbol && typeof t.score === "number") {
              acc[t.symbol] = t.score;
            }
            return acc;
          }, {})
        }),
        // Trading History Panel (8 weeks)
        viewMode !== VIEW_MODES.MINIMAL && e(TradingHistoryPanel, {
          tradingHistory,
          isConnected: alpacaStatus === "Live",
          timestamp: uiClock
        }),
        // Wealth Panel or Connections Panel
        personalCapitalData?.connected
          ? e(WealthPanel, { data: personalCapitalData, compact: true, privateMode })
          : e(ConnectionsStatusPanel, { connections: connectionStatuses })
      )
    ),
    // Footer bar with tier indicator and shortcuts
    e(
      Box,
      {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingX: 2,
        paddingY: 0,
        borderStyle: "single",
        borderColor: "#1e293b",
        borderTop: true,
        borderBottom: false,
        borderLeft: false,
        borderRight: false
      },
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#64748b" }, "Tier:"),
        e(Text, { color: "#f59e0b", bold: true }, MODEL_TIERS[currentTier]?.label || "Medium"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#64748b" }, "View:"),
        e(Text, { color: "#3b82f6", bold: true }, VIEW_MODE_LABELS[viewMode]),
        privateMode && e(Text, { color: "#f59e0b", bold: true }, " [PRIVATE]")
      ),
      e(
        Box,
        { flexDirection: "row", gap: 3 },
        e(Text, { color: "#475569" }, "Ctrl+T"),
        e(Text, { color: "#64748b" }, "tier"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#3b82f6" }, "Ctrl+U"),
        e(Text, { color: "#64748b" }, "view"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: privateMode ? "#f59e0b" : "#475569" }, "Ctrl+R"),
        e(Text, { color: privateMode ? "#f59e0b" : "#64748b" }, "private"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, "/help"),
        e(Text, { color: "#64748b" }, "commands")
      )
    ),
    // Approval Overlay (modal)
    showApprovalOverlay && e(ApprovalOverlay, {
      actions: autonomousState.proposedActions || [],
      selectedIndex: selectedActionIndex,
      onApprove: handleApproveAction,
      onReject: handleRejectAction,
      onApproveAll: handleApproveAll,
      onRejectAll: () => {
        autonomousState.proposedActions?.forEach(a => autonomousEngine.rejectAction(a.id));
        setAutonomousState(autonomousEngine.getDisplayData());
        setShowApprovalOverlay(false);
      },
      onSelect: setSelectedActionIndex,
      onClose: () => setShowApprovalOverlay(false),
      visible: showApprovalOverlay
    })
  );
};

export default App;
