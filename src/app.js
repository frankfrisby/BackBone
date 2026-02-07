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
  getTickerIcon,
  validateTickerUniverse,
  TICKER_UNIVERSE
} from "./data/tickers.js";
import { buildDefaultWeights, buildScoringEngine, normalizeWeights } from "./data/scoring.js";
import { buildMockPortfolio, buildPortfolioFromAlpaca, buildEmptyPortfolio } from "./data/portfolio.js";
import {
  getAlpacaConfig,
  getTradingSettings,
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
import { fetchTickers as fetchYahooTickers, startServer as startYahooServer, restartServer as restartYahooServer, isServerRunning, triggerFullScan, refreshTickers } from "./services/yahoo-client.js";
import { extractLinkedInProfile, scrapeLinkedInProfile, saveLinkedInProfile, loadLinkedInProfile, isProfileIncomplete, refreshAndGenerateLinkedInMarkdown, generateLinkedInMarkdown, scrapeLinkedInPosts, updateLinkedInViaBrowserAgent } from "./services/linkedin-scraper.js";
import { getDataFreshnessChecker } from "./services/data-freshness-checker.js";
import { getCronManager, JOB_FREQUENCY } from "./services/cron-manager.js";
import { captureSnapshot as captureLinkedInSnapshot, getHistory as getLinkedInHistory, getPostsHistory as getLinkedInPostsHistory, trackPosts as trackLinkedInPosts } from "./services/linkedin-tracker.js";
import { loadTradingStatus, saveTradingStatus, buildTradingStatusDisplay, recordTradeAttempt, resetTradingStatus } from "./services/trading-status.js";
import { deleteAllData, getResetSummary, RESET_STEPS } from "./services/reset.js";
import { sendMessage as sendMultiAI, getAIStatus, getMultiAIConfig, getCurrentModel, MODELS, TASK_TYPES, isAgenticTask, executeAgenticTask } from "./services/multi-ai.js";
import { formatToolsList, getToolsSummary, enableServer, disableServer } from "./services/mcp-tools.js";
import { loadActionsQueue, getActionsDisplay, queueAction, startNextAction, completeAction, initializeDefaultActions, ACTION_TYPES } from "./services/actions-engine.js";
import { getSkillsCatalog, getUserSkillContent } from "./services/skills-loader.js";
import { getSkillsLoader } from "./services/skills-loader.js";
import { listSpreadsheets, readSpreadsheet, createSpreadsheet } from "./services/excel-manager.js";
import { backupToFirebase, restoreFromFirebase, getBackupStatus } from "./services/firebase-storage.js";
import { forceUpdate, checkVersion, consumeUpdateState } from "./services/auto-updater.js";
import { startApiServer } from "./services/api-server-client.js";
import { loadProfileSections, updateFromLinkedIn, updateFromHealth, updateFromPortfolio, getProfileSectionDisplay, getProfileOverview, PROFILE_SECTIONS } from "./services/profile-sections.js";
import { getGitHubConfig, getGitHubStatus } from "./services/github.js";
import { openUrl } from "./services/open-url.js";
import { trackUserQuery, QUERY_SOURCE, getQueryTracker } from "./services/query-tracker.js";
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
import { calculateMACDScore } from "./services/score-engine.js";
import { updateChat } from "./services/app-store.js";
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
import { DisasterOverlay } from "./components/disaster-overlay.js";
import { loadUserSettings, saveUserSettings, updateSettings as updateUserSettings, updateSetting, getModelConfig, isProviderConfigured, getAppName, DEFAULT_SETTINGS } from "./services/user-settings.js";
import { archiveCurrentProfile, restoreProfile, hasArchivedProfile, listProfiles as listArchivedProfiles } from "./services/profile-manager.js";
import { hasValidCredentials as hasCodexCredentials } from "./services/codex-oauth.js";
import { loadFineTuningConfig, saveFineTuningConfig, runFineTuningPipeline, queryFineTunedModel } from "./services/fine-tuning.js";
import { monitorAndTrade, loadConfig as loadTradingConfig, setTradingEnabled, sendTradeNotification } from "./services/auto-trader.js";
import { shouldUpdateStops, applyStopsToAllPositions } from "./services/trailing-stop-manager.js";
import { recordMomentumSnapshot } from "./services/momentum-drift.js";
import { isMarketOpen } from "./services/trading-status.js";
import { analyzeAllPositions, getPositionContext, explainWhyHeld } from "./services/position-analyzer.js";

// New autonomous system imports
import { getAutonomousEngine, AI_ACTION_STATUS, AI_ACTION_TYPES, EXECUTION_TOOLS } from "./services/autonomous-engine.js";
import { getEngineSupervisor } from "./services/engine-supervisor.js";
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
import { getTargetPerson, findBestMatch } from "./services/person-matcher.js";
import { getLifeEngine } from "./services/life-engine.js";
import { getMobileService } from "./services/mobile.js";
import { sendWhatsAppMessage, isPhoneVerified } from "./services/phone-auth.js";
import { getChatActionsManager, RISK_LEVEL, ACTION_CATEGORY, CONFIRMATION_STATUS } from "./services/chat-actions.js";
import { getSessionState, startFreshSession, recordAction, getResumeSummary } from "./services/session-state.js";
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
import { resizeForOnboarding, resizeForMainApp, TERMINAL_SIZES, setBaseTitle, showActivityTitle, showNotificationTitle, restoreBaseTitle } from "./services/terminal-resize.js";
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
import { fetchAndAnalyzeNews, shouldFetchNews } from "./services/news-service.js";
import { isEmailConfigured, syncEmailCalendar, getEmailSummary, getUpcomingEvents, startTokenAutoRefresh, startOAuthFlow as startEmailOAuth } from "./services/email-calendar-service.js";
import { getPersonalCapitalService } from "./services/personal-capital.js";
import { getPlaidService, isPlaidConfigured, syncPlaidData } from "./services/plaid-service.js";
import { getThinkingEngine, calculateDataCompleteness } from "./services/thinking-engine.js";
import { getIdleProcessor } from "./services/idle-processor.js";
import { getClaudeCodeMonitor } from "./services/claude-code-monitor.js";
import { getStartupEngine } from "./services/startup-engine.js";
import { getClaudeEngine } from "./services/claude-engine.js";
import { startRealtimeSync, stopRealtimeSync, isAuthenticated as isFirestoreAuthenticated, pushTickers } from "./services/firestore-sync.js";
import { getDashboardSync } from "./services/firebase-dashboard-sync.js";
import { generateDailyBrief, generateAndDeliverBrief, pushBriefToFirestore } from "./services/daily-brief-generator.js";
// Initialize Claude Code connection monitor
console.log("[App] Initializing Claude Code monitor...");
const _claudeCodeMonitor = getClaudeCodeMonitor();
_claudeCodeMonitor.start();

// Initialize Claude Engine (does NOT auto-start — user types /engine start)
const _claudeEngine = getClaudeEngine();
{
  const _engineStatus = _claudeEngine.getStatus();
  if (_engineStatus.lastRunMinutesAgo !== null) {
    console.log(`[App] Claude Engine last ran ${_engineStatus.lastRunMinutesAgo} min ago${_engineStatus.cooldown ? ` (cooldown ${_engineStatus.cooldownRemainingMin} min)` : ""}`);
  } else {
    console.log("[App] Claude Engine initialized — type /engine start to begin");
  }
}

// Life Management Engine imports
import { getLifeManagementEngine, LIFE_AREAS } from "./services/life-management-engine.js";
import { getDisasterMonitor } from "./services/disaster-monitor.js";
import { getPolymarketService } from "./services/polymarket-service.js";
import { getConversationTracker } from "./services/conversation-tracker.js";
import { getProactiveEngine } from "./services/proactive-engine.js";
import { getFirebaseMessaging } from "./services/firebase-messaging.js";
import { getRealtimeMessaging } from "./services/realtime-messaging.js";
import { getUnifiedMessageLog, MESSAGE_CHANNEL } from "./services/unified-message-log.js";
import { getWhatsAppNotifications } from "./services/whatsapp-notifications.js";
import { classifyMessage } from "./services/message-classifier.js";
import { selectChannel, routeResponse, CHANNEL } from "./services/response-router.js";
import { tryDirectCommand, buildContextualSystemPrompt } from "./services/app-command-handler.js";

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
  yahoo: { connected: false, status: "never", details: "" },
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

// Placeholder goals shown while real data loads
const PLACEHOLDER_GOALS = [
  { id: "loading-1", title: "Loading your personalized goals and objectives from your connected accounts and preferences to display your current priorities and track progress", project: "Goal Loading", category: "personal", status: "pending", progress: 0 },
  { id: "loading-2", title: "Syncing with your calendar, task manager, and project tools to gather all relevant deadlines and milestones for comprehensive goal tracking", project: "Data Sync", category: "work", status: "pending", progress: 0 },
  { id: "loading-3", title: "Analyzing your recent activity patterns and achievements to provide intelligent recommendations and insights for goal completion", project: "Activity Analysis", category: "health", status: "pending", progress: 0 },
  { id: "loading-4", title: "Connecting to your linked services including health tracking, financial accounts, and productivity tools to gather real-time data for comprehensive insights", project: "Service Connections", category: "system", status: "pending", progress: 0 }
];

// Placeholder observations shown while real data loads (4 during load, then 2 after)
const PLACEHOLDER_OBSERVATIONS = [
  { text: "Initializing your personal AI assistant and loading all configuration settings, preferences, and historical context to provide personalized assistance tailored to your needs", timestamp: Date.now(), status: "observation" },
  { text: "Loading your recent activity and progress history including completed tasks, ongoing projects, and performance metrics to give you a comprehensive overview of your achievements", timestamp: Date.now(), status: "observation" },
  { text: "Preparing today's insights and recommendations by analyzing your goals, schedule, and priorities to suggest the most impactful actions you can take right now", timestamp: Date.now(), status: "observation" },
  { text: "Connecting to cloud services for real-time sync ensuring all your data is backed up, accessible across devices, and protected with enterprise-grade security measures", timestamp: Date.now(), status: "observation" }
];

/**
 * Check if a timestamp falls within the current "ticker day" (4 AM to 4 AM).
 * A ticker day starts at 4:00 AM and ends at 3:59 AM the next day.
 */
const isTickerToday = (timestamp) => {
  if (!timestamp) return false;
  const now = new Date();
  const ts = new Date(timestamp);
  // Calculate the start of the current ticker day (4 AM today, or 4 AM yesterday if before 4 AM)
  const tickerDayStart = new Date(now);
  tickerDayStart.setHours(4, 0, 0, 0);
  if (now < tickerDayStart) {
    // Before 4 AM — ticker day started yesterday at 4 AM
    tickerDayStart.setDate(tickerDayStart.getDate() - 1);
  }
  return ts >= tickerDayStart;
};

/**
 * Generate a short (2-4 word) reason why no trade happened this cycle.
 * Used for the persistent trade status indicator next to "Live".
 */
function _getShortTradeReason(result, tickers) {
  if (!result || !result.monitored) return "Market closed";

  // Check if positions are at max
  const posCount = result.reasoning?.find(r => r.startsWith("Positions:"));
  if (posCount && posCount.includes(`/${result.reasoning?.[0]?.includes?.("2") ? "2" : ""}`)) {
    // Position limit full — check if scores are too low to sell
  }

  // SPY direction gate blocked buys
  if (result.spyBlocked) {
    return "SPY dropping";
  }

  // SPY is negative but allowed (recovering or flat intraday)
  if (result.spyPositive === false) {
    const threshold = result.effectiveBuyThreshold;
    const topTicker = tickers?.sort?.((a, b) => (b.score || 0) - (a.score || 0))?.[0];
    if (topTicker && topTicker.score < threshold) {
      return "SPY down (ok), low";
    }
    return "SPY down (ok)";
  }

  // Check buying power / position limits
  const posLimitSkip = result.skipped?.find(s => s.reason?.includes?.("Position limit"));
  if (posLimitSkip) return "Positions full";

  // Check cooldown
  const cooldownSkip = result.skipped?.find(s => s.reason?.includes?.("Cooldown"));
  if (cooldownSkip) return `${cooldownSkip.symbol} cooldown`;

  // No tickers above threshold
  if (!result.buySignals || result.buySignals.length === 0) {
    const topTicker = tickers?.sort?.((a, b) => (b.score || 0) - (a.score || 0))?.[0];
    if (topTicker) {
      return `${topTicker.symbol} ${topTicker.score?.toFixed(1)} too low`;
    }
    return "Scores too low";
  }

  return "No signal";
}

/**
 * Handle complex WhatsApp messages via Claude Code CLI
 * Builds a WhatsApp-optimized prompt, executes with full MCP tool access,
 * and extracts the final response. Falls back to aiBrain.chat() on failure.
 */
async function _handleComplexMessage(userMessage, userId, aiBrain, channel = "app") {
  const COMPLEX_TIMEOUT = 120000; // 2 minutes

  try {
    const executor = getClaudeCodeExecutor();
    const isReady = await executor.isReady();

    if (!isReady) {
      console.log(`[App] Claude Code not ready, falling back to aiBrain.chat() for ${channel}`);
      const systemPrompt = buildContextualSystemPrompt(channel);
      try {
        const response = await aiBrain.chat(userMessage, { userId, channel, systemPrompt });
        return response.content;
      } catch {
        const result = await sendMultiAI(userMessage, { systemPrompt }, "auto");
        return result.response;
      }
    }

    const prompt = _buildMessageCLIPrompt(userMessage, channel);

    // Execute with timeout
    const result = await Promise.race([
      executor.execute({
        id: `whatsapp_${Date.now()}`,
        title: `WhatsApp: ${userMessage.substring(0, 50)}`,
        executionPlan: { prompt, workDir: process.cwd(), timeout: COMPLEX_TIMEOUT }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), COMPLEX_TIMEOUT))
    ]);

    if (result.success && result.output) {
      const extracted = _extractFinalResponse(result.output);
      if (extracted && extracted.length > 10) {
        return extracted;
      }
    }

    // Fallback if execution didn't produce usable output
    console.log(`[App] Claude Code output not usable, falling back to aiBrain.chat() for ${channel}`);
    const systemPrompt = buildContextualSystemPrompt(channel);
    try {
      const response = await aiBrain.chat(userMessage, { userId, channel, systemPrompt });
      return response.content;
    } catch {
      const result = await sendMultiAI(userMessage, { systemPrompt }, "auto");
      return result.response;
    }

  } catch (error) {
    console.error(`[App] Complex ${channel} handler error:`, error.message);
    const systemPrompt = buildContextualSystemPrompt(channel);
    try {
      const response = await aiBrain.chat(userMessage, { userId, channel, systemPrompt });
      return response.content;
    } catch {
      const result = await sendMultiAI(userMessage, { systemPrompt }, "auto");
      return result.response;
    }
  }
}

/**
 * Build a channel-optimized prompt for Claude Code CLI
 */
function _buildMessageCLIPrompt(userMessage, channel = "app") {
  const charLimit = channel === "whatsapp" ? 1500 : 3000;
  return `You are BACKBONE AI responding to a user message via ${channel}. You have access to all MCP tools (trading, health, news, contacts, calendar, etc.) and can read memory files from the data/ and memory/ directories.

USER MESSAGE: "${userMessage}"

INSTRUCTIONS:
1. Read relevant memory/data files for context (memory/profile.md, memory/portfolio.md, memory/health.md, data/goals.json, etc.)
2. Use MCP tools to get real-time data if needed (get_positions, get_health_summary, fetch_latest_news, etc.)
3. Take real actions when asked (create goals, research topics, check positions, etc.)
4. Respond with a clear, concise answer (under ${charLimit} characters)
5. Use short paragraphs, bullet points where helpful
6. Be conversational but informative

Your final output should be ONLY the response message to send to the user. No explanations of your process.`;
}

/**
 * Extract the final response from Claude Code execution output
 * Looks for the last text block that isn't a tool call or system message
 */
function _extractFinalResponse(output) {
  if (!output) return null;

  // If output is JSON (stream-json format), try to parse the last assistant message
  const lines = output.split("\n").filter(Boolean);
  let lastAssistantText = "";

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "assistant" && parsed.message?.content) {
        // Extract text blocks from content array
        const textBlocks = Array.isArray(parsed.message.content)
          ? parsed.message.content.filter(b => b.type === "text").map(b => b.text).join("\n")
          : typeof parsed.message.content === "string" ? parsed.message.content : "";
        if (textBlocks) lastAssistantText = textBlocks;
      }
      // Also check for result type
      if (parsed.type === "result" && parsed.result) {
        return typeof parsed.result === "string" ? parsed.result : JSON.stringify(parsed.result);
      }
    } catch {
      // Not JSON, accumulate as plain text
      if (line.trim() && !line.startsWith("[") && !line.startsWith("Running")) {
        lastAssistantText = line;
      }
    }
  }

  return lastAssistantText || output.substring(output.length - 1500);
}

function _isClaudeRateLimited(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("429") ||
    lower.includes("overloaded") ||
    lower.includes("capacity") ||
    lower.includes("too many requests") ||
    lower.includes("quota exceeded");
}

const App = ({ updateConsoleTitle, updateState }) => {
  // Pre-render phase: render main view first (invisible) to set terminal rows, then show splash
  const [preRenderPhase, setPreRenderPhase] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  // Track how many outcomes to show (4 during loading, then dynamic 2-5 based on height)
  const [maxOutcomesToShow, setMaxOutcomesToShow] = useState(4);
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

  // Engine supervisor status for header display
  const [engineHeaderStatus, setEngineHeaderStatus] = useState({ status: "stopped", uptimeStr: "0m", color: "#64748b" });
  const engineSupervisorRef = useRef(null);
  const [activeCommand, setActiveCommand] = useState("/account");
  const [lastAction, setLastAction] = useState("Ready");
  // Persistent trade status: { type: "trade"|"no-trade", text: "Bought HIMS", color: "green"|"red" }
  const [tradeAction, setTradeAction] = useState({ type: "idle", text: "Waiting", color: "dim" });
  const [currentTier, setCurrentTier] = useState(() => getCurrentTier());
  const [privateMode, setPrivateMode] = useState(false);
  const [viewMode, setViewMode] = useState(VIEW_MODES.CORE); // Core is default
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pauseUpdates, setPauseUpdates] = useState(false);
  const pauseUpdatesRef = useRef(false); // Use ref to avoid re-renders in intervals
  const lastSweepTriggerRef = useRef(0); // Track last sweep auto-restart to debounce
  const [mainViewReady, setMainViewReady] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [conversationScrollOffset, setConversationScrollOffset] = useState(0);
  const [forceRenderKey, setForceRenderKey] = useState(0); // Force re-render after layout adjusts
  const readinessTimerRef = useRef(null);
  const layoutKickTimerRef = useRef(null);
  const linkedInCheckTimerRef = useRef(null);
  const { stdout } = useStdout();
  const initialSettingsRef = useRef(loadUserSettings());
  const [userSettings, setUserSettings] = useState(initialSettingsRef.current);
  const [showOnboarding, setShowOnboarding] = useState(!initialSettingsRef.current.onboardingComplete);
  const [onboardingOverride, setOnboardingOverride] = useState({ stepId: null, notice: null, modelProviderId: null, autoOpenProvider: false });
  const normalizeFirebaseUser = (user) => {
    if (!user) return null;
    if (user.uid) return user;
    if (user.id) return { ...user, uid: user.id };
    return user;
  };
  const [firebaseUser, setFirebaseUser] = useState(() => normalizeFirebaseUser(initialSettingsRef.current.firebaseUser || getCurrentFirebaseUser()));

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
    const nameBase = modelInfo.name || modelInfo.shortName || "Claude Code";
    const shortNameBase = modelInfo.shortName || modelInfo.name || "Claude Code";

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
    const latestUser = normalizeFirebaseUser(userSettings?.firebaseUser || getCurrentFirebaseUser());
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

  // Build morning brief from live data sources for both conversation + WhatsApp
  const buildMorningBrief = () => {
    try {
      const now = new Date();
      const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
      const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });

      // Gather health data (Oura structure: { latest: { sleep: [...], readiness: [...] } })
      let health = null;
      try {
        const oura = loadOuraData();
        if (oura) {
          const latest = oura.latest || oura;
          const sleepArr = Array.isArray(latest.sleep) ? latest.sleep : [];
          const readinessArr = Array.isArray(latest.readiness) ? latest.readiness : [];
          const lastSleep = sleepArr.at(-1);
          const lastReadiness = readinessArr.at(-1);
          if (lastSleep || lastReadiness) {
            health = {
              sleepScore: lastSleep?.score || null,
              readiness: lastReadiness?.score || null
            };
          }
        }
      } catch (e) { /* no health data */ }

      // Gather active goals
      const priorities = [];
      try {
        const goals = getGoalTracker().getActive();
        goals.slice(0, 3).forEach(g => {
          priorities.push(g.title.length > 50 ? g.title.slice(0, 47) + "..." : g.title);
        });
      } catch (e) { /* no goals */ }

      // Gather calendar events
      let calendar = [];
      try {
        const events = getUpcomingEvents(3);
        calendar = events.map(ev => ({
          time: new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          title: (ev.summary || ev.subject || "Event").slice(0, 40)
        }));
      } catch (e) { /* no calendar */ }

      // Gather portfolio snapshot
      let portfolio = null;
      try {
        const cachePath = path.join(process.cwd(), "data", "tickers-cache.json");
        if (fs.existsSync(cachePath)) {
          const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
          const tickers = cache.tickers || [];
          if (tickers.length > 0) {
            const movers = [...tickers]
              .filter(t => t.changePercent != null)
              .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
              .slice(0, 3);
            if (movers.length > 0) {
              const avgChange = movers.reduce((s, t) => s + (t.changePercent || 0), 0) / movers.length;
              portfolio = {
                change: 0,
                changePercent: avgChange,
                topMovers: movers.map(t => `${t.symbol} ${t.changePercent >= 0 ? "+" : ""}${t.changePercent.toFixed(1)}%`)
              };
            }
          }
        }
      } catch (e) { /* no portfolio */ }

      // Skip if nothing to report
      if (!health && priorities.length === 0 && calendar.length === 0 && !portfolio) {
        return null;
      }

      const greeting = `Good morning! Here's your ${dayName}, ${dateStr} brief.`;

      // Build clean conversation text
      let conversationText = `MORNING BRIEFING — ${dayName}, ${dateStr}\n\n`;
      if (health) {
        conversationText += `Sleep: ${health.sleepScore || "—"} | Readiness: ${health.readiness || "—"}\n\n`;
      }
      if (calendar.length > 0) {
        conversationText += "Today:\n";
        calendar.forEach(ev => { conversationText += `  ${ev.time} — ${ev.title}\n`; });
        conversationText += "\n";
      }
      if (priorities.length > 0) {
        conversationText += "Focus:\n";
        priorities.forEach((p, i) => { conversationText += `  ${i + 1}. ${p}\n`; });
        conversationText += "\n";
      }
      if (portfolio) {
        conversationText += "Markets: " + portfolio.topMovers.join(", ") + "\n";
      }

      return {
        greeting,
        health,
        calendar,
        priorities,
        portfolio,
        conversationText
      };
    } catch (e) {
      console.error("[MorningBrief] Build failed:", e.message);
      return null;
    }
  };

  // Initialize app: load remote config from Firebase, then show main app
  useEffect(() => {
    const init = async () => {
      // Load API keys from Firebase (Plaid, Google, Alpaca, OpenAI)
      await initializeRemoteConfig();

      // Start API server for web app (background process on port 3000)
      startApiServer().catch(err => console.error("[Boot] API server:", err.message));

      // Initialize session state tracking
      const sessionState = getSessionState();
      const sessionInfo = sessionState.startSession();
      if (sessionInfo.hasState && sessionInfo.isResume) {
        const summary = sessionState.getResumeSummary();
        console.log(`[Session] Resuming: ${summary.session.actionCount} actions, last: ${summary.workingOn || summary.currentGoal?.title || "none"}`);
      }

      // Start cron manager — checks jobs every 60s
      const cronManager = getCronManager();
      cronManager.start();

      // Wire cron job handlers
      cronManager.on("run:runLinkedInSync", async () => {
        try {
          const profile = loadLinkedInProfile();
          const profileUrl = profile?.profileUrl;
          if (profileUrl) {
            await scrapeLinkedInProfile({ headless: true });
            captureLinkedInSnapshot();
            const postsResult = await scrapeLinkedInPosts(profileUrl);
            if (postsResult.success && postsResult.posts?.length) {
              trackLinkedInPosts(postsResult.posts);
            }
          }
        } catch (e) {
          console.error("[Cron] LinkedIn sync failed:", e.message);
        }
      });
      cronManager.on("run:runTickerSweep", () => {
        console.log("[Cron] 5:30am ticker sweep triggered");
        triggerFullScan().catch(() => {});
      });
      cronManager.on("run:runStockAnalysis", () => {
        triggerFullScan().catch(() => {});
      });
      cronManager.on("run:runHealthReview", () => {
        syncOuraData().catch(() => {});
      });
      cronManager.on("run:runMarketClose", () => {
        triggerFullScan().catch(() => {});
      });
      cronManager.on("run:runNewsFetch", async () => {
        // News fetch - generates backlog items for thinking engine
        if (shouldFetchNews()) {
          console.log("[Cron] Fetching and analyzing news...");
          const result = await fetchAndAnalyzeNews();
          if (result.success) {
            console.log(`[Cron] News: ${result.itemsAdded} backlog items added. ${result.insight || ""}`);
          }
        } else {
          console.log("[Cron] News fetch skipped (too recent)");
        }
      });
      cronManager.on("run:runMorningBriefing", async () => {
        try {
          // Generate rich daily brief and deliver via all channels (Firestore + WhatsApp + Push)
          const result = await generateAndDeliverBrief("morning");
          if (result.success) {
            // Also inject a conversation-friendly version into the chat panel
            const brief = buildMorningBrief();
            if (brief) {
              setMessages(prev => [...prev, {
                role: "assistant",
                content: brief.conversationText,
                timestamp: new Date()
              }]);
            }
            console.log("[Cron] Morning brief generated and delivered");
          }
        } catch (e) {
          console.error("[Cron] Morning brief failed:", e.message);
        }
      });
      cronManager.on("run:runEveningBriefing", async () => {
        try {
          const result = await generateAndDeliverBrief("evening");
          if (result.success) {
            console.log("[Cron] Evening brief generated and delivered");
          }
        } catch (e) {
          console.error("[Cron] Evening brief failed:", e.message);
        }
      });

      // Prediction research - 8 PM primary run
      cronManager.on("run:runPredictionResearch", async () => {
        try {
          const { runDailyPredictionResearch } = await import("./services/ticker-prediction-research.js");
          const result = await runDailyPredictionResearch();
          if (result.success) {
            console.log(`[Cron] Prediction research: ${result.success}/${result.total} tickers researched`);
          }
        } catch (e) {
          console.error("[Cron] Prediction research failed:", e.message);
        }
      });

      // Prediction research fallback - 4 AM if primary missed
      cronManager.on("run:runPredictionResearchFallback", async () => {
        try {
          const { getTickerPredictionResearch } = await import("./services/ticker-prediction-research.js");
          const predictionService = getTickerPredictionResearch();

          // Only run if primary didn't run yesterday/today
          if (predictionService.needsFallbackRun()) {
            console.log("[Cron] Prediction research fallback triggered - primary missed");
            const result = await predictionService.runDailyResearch();
            if (result.success) {
              console.log(`[Cron] Prediction research fallback: ${result.success}/${result.total} tickers`);
            }
          } else {
            console.log("[Cron] Prediction research fallback skipped - primary already ran");
          }
        } catch (e) {
          console.error("[Cron] Prediction research fallback failed:", e.message);
        }
      });

      // Overnight research - continuous 8 PM to 6 AM
      cronManager.on("run:runOvernightResearch", async () => {
        try {
          const { getOvernightResearch } = await import("./services/overnight-research.js");
          const overnightService = getOvernightResearch();

          // Check if already running
          if (overnightService.isRunning) {
            console.log("[Cron] Overnight research already running");
            return;
          }

          console.log("[Cron] Starting overnight research service");
          // Start in background - it will run continuously until 6 AM
          overnightService.start().catch(e => {
            console.error("[Cron] Overnight research error:", e.message);
          });
        } catch (e) {
          console.error("[Cron] Overnight research start failed:", e.message);
        }
      });

      // Startup catch-up: send daily brief if missed today
      try {
        const today = new Date().toISOString().split("T")[0];
        const briefStatePath = path.join(process.cwd(), "data", "daily-brief-state.json");
        let morningLastSent = null;
        if (fs.existsSync(briefStatePath)) {
          const state = JSON.parse(fs.readFileSync(briefStatePath, "utf-8"));
          // Support both old flat format and new split format
          morningLastSent = state.morning?.lastSentDate || state.lastSentDate || null;
        }
        if (morningLastSent !== today) {
          const now = new Date();
          const hour = now.getHours();
          // Only auto-send if it's after 8:30 and before midnight
          if (hour >= 9) {
            const result = await generateAndDeliverBrief("morning");
            if (result.success) {
              const brief = buildMorningBrief();
              if (brief) {
                setMessages(prev => [...prev, {
                  role: "assistant",
                  content: brief.conversationText,
                  timestamp: new Date()
                }]);
              }
              console.log("[App] Startup catch-up: morning brief sent");
            }
          }
        }
      } catch (e) {
        console.error("[App] Startup briefing check failed:", e.message);
      }

      // Startup catch-up: send evening brief if missed today
      try {
        const today = new Date().toISOString().split("T")[0];
        const briefStatePath = path.join(process.cwd(), "data", "daily-brief-state.json");
        let eveningLastSent = null;
        if (fs.existsSync(briefStatePath)) {
          const state = JSON.parse(fs.readFileSync(briefStatePath, "utf-8"));
          eveningLastSent = state.evening?.lastSentDate || null;
        }
        if (eveningLastSent !== today) {
          const now = new Date();
          const hour = now.getHours();
          // Only auto-send if it's after 19:45 (7:45 PM) and before midnight
          if (hour >= 20) {
            console.log("[App] Startup catch-up: evening brief not sent today, sending now...");
            const result = await generateAndDeliverBrief("evening");
            if (result.success) {
              console.log("[App] Startup catch-up: evening brief sent");
            }
          }
        }
      } catch (e) {
        console.error("[App] Evening briefing catch-up failed:", e.message);
      }

      // Run API health check to verify tokens are available
      // This clears quota exceeded state if tokens were added
      try {
        const quotaMonitor = getAPIQuotaMonitor();
        await quotaMonitor.checkAllProviders();
      } catch (e) {
        // Silent fail - health check is optional
      }

      // Start automatic Google/Microsoft token refresh (every 30 min)
      startTokenAutoRefresh();

      // Initialize AI-powered role model matching (background task)
      // This uses AI to find the best target person for the user
      try {
        const progressResearch = getProgressResearch();
        progressResearch.initializeAIMatching().catch(e => {
          console.error("[App] AI matching init failed:", e.message);
        });
      } catch (e) {
        // Silent fail - AI matching will fall back to algorithm
      }

      // QR code for mobile app connection — shown in-app only, no secondary window
      // Previously spawned a secondary CLI window which was disruptive.
      // The /connect command can be used to display the QR code in the chat.

      // Phase 1: Pre-render main view (invisible) to set terminal rows based on content
      // Emit resize event immediately to capture terminal size
      if (process.stdout.emit) {
        process.stdout.emit("resize");
      }
      // After 150ms, switch to splash screen (gives time for layout calculation)
      setTimeout(() => {
        process.stdout.write("\x1b[2J\x1b[1;1H"); // Clear pre-render
        setPreRenderPhase(false);
        // Phase 2: Show splash screen for 1 second
        setTimeout(() => {
          // Clear screen before transitioning from splash to main view
          process.stdout.write("\x1b[2J\x1b[1;1H");
          setIsInitializing(false);
          // Set outcomes count based on terminal height (default 2, expand to 5 for tall terminals)
          // Each outcome row takes ~1 line; base threshold 40 rows for 2, +1 outcome per 8 extra rows
          const rows = process.stdout.rows || 40;
          const heightBasedOutcomes = Math.min(5, Math.max(2, 2 + Math.floor((rows - 40) / 8)));
          setMaxOutcomesToShow(heightBasedOutcomes);
          // Restore terminal title after splash (ensure "Backbone · [User]" shows)
          restoreBaseTitle();
          // Emit resize event to ensure layout calculates correctly
          setTimeout(() => {
            if (process.stdout.emit) {
              process.stdout.emit("resize");
            }
          }, 50);
        }, 1000);
      }, 150);
    };
    init();
  }, [nudgeStdoutSize]);

  // Update outcomes count on terminal resize (2 default, up to 5 for tall terminals)
  useEffect(() => {
    if (isInitializing) return;
    const onResize = () => {
      const rows = process.stdout.rows || 40;
      const heightBased = Math.min(5, Math.max(2, 2 + Math.floor((rows - 40) / 8)));
      setMaxOutcomesToShow(heightBased);
    };
    process.stdout.on("resize", onResize);
    return () => process.stdout.removeListener("resize", onResize);
  }, [isInitializing]);

  // Show post-update notification if we just restarted after an auto-update
  useEffect(() => {
    if (!isInitializing && updateState) {
      const msg = `## Updated to v${updateState.newVersion}\n\n` +
        `Previous version: v${updateState.previousVersion}\n` +
        (updateState.changelog ? `\n**Changelog:**\n${updateState.changelog}\n` : "") +
        `\nUpdated at ${new Date(updateState.updatedAt).toLocaleString()}`;
      setMessages((prev) => [...prev, { role: "assistant", content: msg, timestamp: new Date() }]);
      setLastAction(`Updated to v${updateState.newVersion}`);
    }
  }, [isInitializing]);

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

  // Oura Ring data sync scheduler (every 10 minutes when connected)
  // Only saves data if health metrics have changed (prevents duplicate entries)
  useEffect(() => {
    if (!isOuraConfigured()) return;

    const scheduleNextSync = () => {
      const nextSync = getNextSyncTime();
      const msUntilSync = nextSync.getTime() - Date.now();

      return setTimeout(async () => {
        try {
          await syncOuraData();
        } catch (e) {
          console.error("[Oura] Scheduled sync failed:", e.message);
        }
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
        try {
          await pcService.fetchAll();
        } catch (e) {
          console.error("[PC] Scheduled sync failed:", e.message);
        }
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
    if (key.ctrl && input === "f") {
      // Ctrl+F: Start fresh session (clear session state)
      startFreshSession();
      setMessages([]);
      setLastAction("Started fresh session");
    }
    if (key.ctrl && key.shift && lower === "s") {
      // Ctrl+Shift+S: Open onboarding/setup wizard
      setShowOnboarding(true);
      setLastAction("Setup wizard opened");
    }
    // Escape: Clear conversation to show AI work (when input is empty)
    // The chat-panel handles escape when input has content
    // This handles escape when input is empty - clears conversation to show engine
    if (key.escape) {
      // If there are messages showing, clear them to show AI work
      if (messages.length > 0 && !isProcessing && !streamingText) {
        setMessages([]);
        setShowConversation(false);
        setLastAction("Showing AI work");
        return;
      }
      // If conversation overlay is showing, hide it
      if (showConversation) {
        setShowConversation(false);
        return;
      }
    }
    // Arrow keys: Scroll engine and conversation panels
    // Up/Down: scroll engine panel (CLI streaming, actions, goals)
    // Shift+Up/Down: scroll conversation history
    if (key.upArrow) {
      if (key.shift) {
        setConversationScrollOffset(prev => Math.min(Math.max(0, messages.length - 1), prev + 1));
      } else {
        setEngineScrollOffset(prev => Math.max(0, prev - 1));
      }
      return;
    }
    if (key.downArrow) {
      if (key.shift) {
        setConversationScrollOffset(prev => Math.max(0, prev - 1));
      } else {
        setEngineScrollOffset(prev => Math.min(maxEngineScroll, prev + 1));
      }
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
          // Restore terminal title (Backbone · [User])
          restoreBaseTitle();
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
  const handleLogout = useCallback(async () => {
    // Archive current profile before signing out
    try {
      const result = await archiveCurrentProfile();
      if (result.success) {
        setLastAction(`Profile archived for ${result.uid}`);
      }
    } catch (err) {
      console.error("[logout] Archive failed:", err.message);
    }
    signOutFirebase();
    saveUserSettings({ ...DEFAULT_SETTINGS });
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
  const [tickerStatus, setTickerStatus] = useState({
    refreshing: false,
    lastRefresh: null,
    error: null,
    scanCount: 0,
    scanDone: false,
    lastFullScan: null,      // Last full scan timestamp
    fullScanRunning: false,  // Whether full scan is currently running
    updateHistory: [],       // Array of update timestamps for today (for 2hr gap check)
  });
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

        // Validate ticker universe against Alpaca (runs in background, cached daily)
        validateTickerUniverse(config).then((result) => {
          if (result.removed.length > 0) {
            process.stderr.write(`[Ticker Validation] Removed ${result.removed.length} invalid tickers: ${result.removed.join(", ")}\n`);
          }
        }).catch(() => {});
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
  const [plaidData, setPlaidData] = useState(null);
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

  // Set terminal title to "Backbone · [username]" across all views
  // This should persist unless temporarily changed by notifications (WhatsApp, trades)
  useEffect(() => {
    const firstName = firebaseUserName?.split(" ")[0] || null;
    setBaseTitle(firstName);
  }, [firebaseUserName]);

  // Restore base title when view mode changes (ensure title persists across mini/main views)
  useEffect(() => {
    restoreBaseTitle();
  }, [viewMode]);

  const userDisplayName = useMemo(() => {
    return linkedInProfile?.name || profile?.name || process.env.USER_NAME || "Frank";
  }, [linkedInProfile?.name, profile?.name]);

  const weightsRef = useRef(weights);
  const portfolioRef = useRef(portfolio);
  const profileRef = useRef(profile);
  const ouraHealthRef = useRef(ouraHealth);
  const plaidDataRef = useRef(plaidData);
  const socialConnectionsRef = useRef(socialConnections);
  const integrationsRef = useRef(null);
  const dashboardSyncInitRef = useRef(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState(null);
  const [lifeChanges, setLifeChanges] = useState(() => buildLifeChanges(10));

  // Trading status (persistent)
  const [tradingStatus, setTradingStatus] = useState(() => buildTradingStatusDisplay(loadTradingStatus()));

  // Trading history (8-week performance)
  const [tradingHistory, setTradingHistory] = useState(null);
  const [portfolioLastUpdated, setPortfolioLastUpdated] = useState(null);
  const [trailingStops, setTrailingStops] = useState({});
  const [nextTradeTimeDisplay, setNextTradeTimeDisplay] = useState(null);

  // LinkedIn data viewer
  const [showLinkedInViewer, setShowLinkedInViewer] = useState(false);
  const [linkedInViewerData, setLinkedInViewerData] = useState(null);

  // Disaster overlay
  const [showDisasterOverlay, setShowDisasterOverlay] = useState(false);

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
  const realtimeMessaging = useMemo(() => getRealtimeMessaging(), []);
  const unifiedMessageLog = useMemo(() => getUnifiedMessageLog(), []);
  const whatsappNotifications = useMemo(() => getWhatsAppNotifications(), []);

  // ── Broadcast CLI responses to WhatsApp + Firebase ──
  // Sends AI responses to WhatsApp for mobile reading and saves to Firebase for persistence
  const broadcastResponse = useCallback(async (responseText, source = "cli") => {
    if (!responseText || responseText.length < 10) return;

    // 1. Save to Firebase (Firestore) so user can read later
    try {
      if (realtimeMessaging?.userId) {
        await realtimeMessaging.sendMessage(responseText, {
          type: "ai",
          metadata: { source, timestamp: new Date().toISOString() }
        });
      }
    } catch (err) {
      // Non-fatal — don't break the response flow
      console.error("[Broadcast] Firebase save failed:", err.message);
    }

    // 2. Send to WhatsApp (truncate long responses for SMS readability)
    try {
      if (whatsappNotifications?.enabled && whatsappNotifications?.phoneNumber) {
        const { getTwilioWhatsApp } = await import("./services/twilio-whatsapp.js");
        const whatsapp = getTwilioWhatsApp();
        if (whatsapp.initialized || await whatsapp.initialize?.()) {
          // Truncate to 1500 chars for WhatsApp readability
          const truncated = responseText.length > 1500
            ? responseText.slice(0, 1500) + "..."
            : responseText;
          await whatsapp.sendMessage(whatsappNotifications.phoneNumber, truncated);
        }
      }
    } catch (err) {
      console.error("[Broadcast] WhatsApp send failed:", err.message);
    }
  }, [realtimeMessaging, whatsappNotifications]);

  // WhatsApp poll countdown state
  const [whatsappPollCountdown, setWhatsappPollCountdown] = useState(null);
  const [whatsappPollingMode, setWhatsappPollingMode] = useState("idle");

  // Data completeness (cached, refreshed every 60s)
  const dataCompletenessRef = useRef(calculateDataCompleteness());
  useEffect(() => {
    const refresh = () => { dataCompletenessRef.current = calculateDataCompleteness(); };
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, []);

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

  // ===== ENGINE SUPERVISOR — continuous running monitor =====
  useEffect(() => {
    if (showOnboarding) return;

    const supervisor = getEngineSupervisor();
    engineSupervisorRef.current = supervisor;

    // Start supervisor (tracks sessions, gaps, auto-restart)
    supervisor.start(autonomousEngine);

    // Poll status every 5 seconds for header display
    const updateStatus = () => {
      try {
        const status = supervisor.getHeaderStatus();
        setEngineHeaderStatus(status);
      } catch {}
    };
    updateStatus();
    const statusInterval = setInterval(updateStatus, 5000);

    return () => {
      clearInterval(statusInterval);
      supervisor.stop();
    };
  }, [showOnboarding, autonomousEngine]);

  // ===== WHATSAPP / REALTIME MESSAGING =====
  // Initialize realtime messaging and poll countdown
  const realtimeMessagingInitRef = useRef(false);
  const hourlyReconcileTimeoutRef = useRef(null);
  const hourlyReconcileIntervalRef = useRef(null);

  useEffect(() => {
    if (realtimeMessagingInitRef.current) return;
    if (!firebaseUser?.uid) return;
    if (showOnboarding) return;

    const initMessaging = async () => {
      try {
        // Initialize realtime messaging with user ID
        await realtimeMessaging.initialize(firebaseUser.uid);

        // Initialize WhatsApp notifications
        await whatsappNotifications.initialize(firebaseUser.uid);

        // Set up message handler — classify, route, and respond
        realtimeMessaging.setMessageHandler(async (message) => {
          // Detect actual channel from message (app vs whatsapp vs unknown)
          // WhatsApp messages come with channel: "twilio_whatsapp" from Firebase webhook
          const msgChannel = message.channel?.includes("whatsapp") ||
                             message.source?.includes("whatsapp") ||
                             message.channel === "twilio_whatsapp"
            ? MESSAGE_CHANNEL.WHATSAPP
            : MESSAGE_CHANNEL.APP;

          // Log to unified message log with correct channel
          unifiedMessageLog.addUserMessage(message.content, msgChannel, {
            from: message.from,
            messageId: message.id
          });

          // Add to conversation (so it shows in chat panel)
          setMessages(prev => [...prev, {
            role: "user",
            content: message.content,
            timestamp: new Date(message.createdAt || Date.now()),
            channel: msgChannel
          }]);

          try {
            let responseContent;

            // ── STEP 1: Try direct command handler (instant, no AI needed) ──
            const commandResult = await tryDirectCommand(message.content);
            if (commandResult.matched) {
              console.log(`[App] ${msgChannel} direct command: ${commandResult.handler}`);
              responseContent = commandResult.response;
            } else {
              // ── STEP 2: Classify for AI routing ──
              const classification = classifyMessage(message.content);
              console.log(`[App] ${msgChannel} message classified: ${classification.type} (${classification.confidence}) — ${classification.reason}`);

              if (classification.type === "quick") {
                // ── QUICK PATH: aiBrain.chat() with rich context ──
                const systemPrompt = buildContextualSystemPrompt(msgChannel);
                const response = await aiBrain.chat(message.content, {
                  userId: firebaseUser.uid,
                  channel: msgChannel,
                  systemPrompt
                });
                responseContent = response.content;
              } else {
                // ── COMPLEX PATH: ack → Claude Code CLI → full response ──
                // Send immediate acknowledgment via the correct channel
                if (msgChannel === MESSAGE_CHANNEL.WHATSAPP) {
                  await whatsappNotifications.sendAIResponse(
                    "Got it, working on that now...",
                    msgChannel
                  );
                }
                // For app messages, the "processing" status in Firebase shows the ack

                responseContent = await _handleComplexMessage(message.content, firebaseUser.uid, aiBrain, msgChannel);
              }
            }

            // Log AI response with correct channel
            unifiedMessageLog.addAssistantMessage(responseContent, msgChannel);

            // Add to conversation
            setMessages(prev => [...prev, {
              role: "assistant",
              content: responseContent,
              timestamp: new Date(),
              channel: msgChannel
            }]);

            // Route response to external channels only for WhatsApp messages
            // App messages are already sent back via Firebase by realtimeMessaging.processMessage()
            if (msgChannel === MESSAGE_CHANNEL.WHATSAPP) {
              const routing = selectChannel(responseContent, {
                userMessage: message.content,
                userId: firebaseUser.uid
              });
              console.log(`[App] Routing WhatsApp response via ${routing.channel} — ${routing.reason}`);
              await routeResponse(responseContent, routing.channel, {
                chunks: routing.chunks,
                userId: firebaseUser.uid
              });
            }

            return { content: responseContent, type: "ai" };
          } catch (err) {
            console.error(`[App] ${msgChannel} message handler error:`, err.message);
            return { content: "Sorry, I encountered an error processing your message. Please try again.", type: "system" };
          }
        });

        // Start listening for messages
        await realtimeMessaging.startListening();

        // Reconcile any pending WhatsApp replies on startup
        await realtimeMessaging.reconcileWhatsAppReplies();

        // Schedule hourly reconciliation on the hour
        const scheduleHourlyReconcile = () => {
          const now = new Date();
          const next = new Date(now);
          next.setMinutes(0, 0, 0);
          if (next <= now) {
            next.setHours(next.getHours() + 1);
          }
          const delay = next.getTime() - now.getTime();
          hourlyReconcileTimeoutRef.current = setTimeout(async () => {
            await realtimeMessaging.reconcileWhatsAppReplies();
            hourlyReconcileIntervalRef.current = setInterval(async () => {
              await realtimeMessaging.reconcileWhatsAppReplies();
            }, 60 * 60 * 1000);
          }, delay);
        };
        scheduleHourlyReconcile();

        realtimeMessagingInitRef.current = true;
        console.log("[App] Realtime messaging initialized");
      } catch (err) {
        console.error("[App] Failed to init realtime messaging:", err.message);
      }
    };

    // Delay to let other systems start
    const timer = setTimeout(initMessaging, 2000);
    return () => {
      clearTimeout(timer);
      if (hourlyReconcileTimeoutRef.current) {
        clearTimeout(hourlyReconcileTimeoutRef.current);
        hourlyReconcileTimeoutRef.current = null;
      }
      if (hourlyReconcileIntervalRef.current) {
        clearInterval(hourlyReconcileIntervalRef.current);
        hourlyReconcileIntervalRef.current = null;
      }
    };
  }, [firebaseUser?.uid, showOnboarding, realtimeMessaging, whatsappNotifications, unifiedMessageLog, aiBrain]);

  // ===== PROACTIVE ENGINE → EXTERNAL CHANNELS =====
  // Route proactive notifications to WhatsApp / Vapi / Push based on urgency
  const proactiveWiredRef = useRef(false);
  useEffect(() => {
    if (proactiveWiredRef.current) return;
    if (!firebaseUser?.uid) return;

    const handleProactiveNotification = async (notification) => {
      try {
        const routing = selectChannel(notification.message, {
          isProactive: true,
          notificationType: notification.type,
          priority: notification.type === "urgent" ? 4 : 2,
          userId: firebaseUser.uid
        });

        console.log(`[App] Proactive notification → ${routing.channel} (${routing.reason})`);

        await routeResponse(notification.message, routing.channel, {
          chunks: routing.chunks,
          userId: firebaseUser.uid,
          pushTitle: "BACKBONE Alert"
        });
      } catch (err) {
        console.error("[App] Proactive notification routing error:", err.message);
      }
    };

    proactiveEngine.on("notification", handleProactiveNotification);
    proactiveWiredRef.current = true;

    return () => {
      proactiveEngine.removeListener("notification", handleProactiveNotification);
      proactiveWiredRef.current = false;
    };
  }, [firebaseUser?.uid, proactiveEngine]);

  // Update poll countdown every second
  useEffect(() => {
    if (!realtimeMessaging.listening) return;

    const updateCountdown = () => {
      const countdown = realtimeMessaging.getPollCountdown();
      const status = realtimeMessaging.getStatus();
      setWhatsappPollCountdown(countdown);
      setWhatsappPollingMode(status.pollingMode);
    };

    // Initial update
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [realtimeMessaging.listening]);

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
    if (dashboardSyncInitRef.current) getDashboardSync().triggerImmediateSync("lifeScores");
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

  // Trailing stop detection: track previous position symbols to detect fills
  const prevPositionSymbolsRef = useRef(new Set());
  const recentAutoTraderSellsRef = useRef(new Set()); // symbols sold by auto-trader this cycle

  // Proactive market updates: track what's been notified today (reset daily)
  const proactiveNotifiedRef = useRef({
    spyMoves: new Set(),       // "up_1.5", "down_1.5", "up_2.0", etc.
    positionAlerts: new Set(),  // "NVDA_up_5", "NVDA_down_5"
    scoreFlips: new Set(),      // "NVDA_sell", "AMD_extreme"
    marketOpenSent: false,
    marketCloseSent: false,
    lastResetDate: null
  });

  // Internet connectivity state
  const [isInternetConnected, setIsInternetConnected] = useState(false);

  // Claude AI state
  const [claudeStatus, setClaudeStatus] = useState("Checking...");
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(null); // For action confirmations
  const [awaitingPriority, setAwaitingPriority] = useState(null); // For priority questions
  const [streamingText, setStreamingText] = useState("");
  const [actionStreamingText, setActionStreamingText] = useState("");
  const [actionStreamingTitle, setActionStreamingTitle] = useState("");
  const [cliStreaming, setCliStreaming] = useState(false); // true when Claude Code CLI is actively executing (chat or autonomous)
  const [claudeCodeAlert, setClaudeCodeAlert] = useState(null); // Alert message when Claude Code disconnects
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

  // Sync streaming state to app store for AgentActivityPanel
  useEffect(() => {
    updateChat({ actionStreamingText, cliStreaming });
  }, [actionStreamingText, cliStreaming]);

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
      trailingStops,
      tradeAction,
    },
    [STATE_SLICES.TICKERS]: {
      tickers,
      tickerStatus,
      tradingStatus: (() => {
        const settings = getTradingSettings();
        const tradingConfig = loadTradingConfig();
        return {
          enabled: tradingConfig.enabled !== false,
          nextTime: nextTradeTimeDisplay?.replace("Next: ", "").split(" (")[0] || null,
          mode: settings.strategy || "swing",
          riskLevel: settings.risk || "conservative",
          lastTrade: tradingStatus?.lastAttempt ? {
            success: tradingStatus.lastAttempt.success,
            symbol: tradingStatus.lastAttempt.symbol,
            action: tradingStatus.lastAttempt.action,
            message: tradingStatus.lastAttempt.message,
            timestamp: tradingStatus.lastAttempt.timestamp
          } : null
        };
      })()
    },
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

  // Internet connectivity check - runs on mount and every 30 seconds
  useEffect(() => {
    const checkConnectivity = async () => {
      try {
        // Use a lightweight endpoint to check connectivity
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch("https://www.google.com/favicon.ico", {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        setIsInternetConnected(true);
      } catch (err) {
        setIsInternetConnected(false);
      }
    };

    // Check immediately on mount
    checkConnectivity();

    // Then check every 30 seconds
    const interval = setInterval(checkConnectivity, 30_000);
    return () => clearInterval(interval);
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
          `${backend.version || "CLI"} | ${cliStatus.model || "Claude Code"}`, LOG_STATUS.SUCCESS);
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

      autonomousEngine.registerContextProvider("netWorth", async () => {
        const data = plaidDataRef.current;
        if (!data?.connected) return { connected: false };
        return {
          connected: true,
          total: data.netWorth?.total || 0,
          assets: data.netWorth?.assets || 0,
          liabilities: data.netWorth?.liabilities || 0,
          accountCount: data.accountCount || 0,
          institutions: data.institutions || [],
          lastUpdated: data.lastUpdated
        };
      });

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

      aiBrain.registerContextProvider("netWorth", async () => {
        const data = plaidDataRef.current;
        if (!data?.connected) return { connected: false };
        return {
          connected: true,
          total: data.netWorth?.total || 0,
          assets: data.netWorth?.assets || 0,
          liabilities: data.netWorth?.liabilities || 0,
          accountCount: data.accountCount || 0,
          accountsByType: data.accountsByType || {},
          institutions: data.institutions || []
        };
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
      autonomousEngine.on("claude-text", ({ text }) => {
        if (text) {
          appendActionStream(text);
        }
      });

      // Stream raw Claude Code output to engine section
      autonomousEngine.on("claude-stream", ({ chunk, type }) => {
        if (chunk && type === "stdout") {
          // Ensure cliStreaming is true when we receive data
          setCliStreaming(true);
          // Append streaming output to action stream for real-time display
          appendActionStream(chunk);
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

      autonomousEngine.on("claude-start", (data) => {
        const title = data?.goal?.title || data?.action?.title || "Goal execution";
        const prompt = data?.action?.executionPlan?.prompt?.slice(0, 50) || "";
        workLog.logAction(LOG_SOURCE.CLAUDE_CODE, `Starting: ${title}`, prompt, LOG_STATUS.PENDING);
        setCliStreaming(true);
        setActionStreamingText("Starting Claude Code CLI...");
      });

      autonomousEngine.on("claude-end", (data) => {
        if (data?.success) {
          workLog.logResult(LOG_SOURCE.CLAUDE_CODE, "Task completed", "", LOG_STATUS.SUCCESS);
        }
        setCliStreaming(false);
        // Keep streaming text visible - don't clear it. Only update title to show completion.
        setActionStreamingTitle("Completed");
      });

      autonomousEngine.on("claude-error", ({ error }) => {
        workLog.logError(LOG_SOURCE.CLAUDE_CODE, "Error", error);
        setCliStreaming(false);
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
        setCliStreaming(true);
        resetActionStream(actionTitle);
        resetToolEvents();
        refreshAutonomousState();
      });

      autonomousEngine.on("action-completed", (action) => {
        const actionTitle = action.title || `${action.action || action.type || "Task"}(${(action.target || "").slice(0, 30)})`;
        workLog.logResult(LOG_SOURCE.AUTONOMOUS, `Completed: ${actionTitle}`, "", LOG_STATUS.SUCCESS);
        currentActionIdRef.current = null;
        setCliStreaming(false);
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
        setCliStreaming(false);
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
        if (dashboardSyncInitRef.current) getDashboardSync().triggerImmediateSync("goals");
      });

      goalTracker.on("progress-updated", () => {
        updateGoals();
        if (dashboardSyncInitRef.current) getDashboardSync().triggerImmediateSync("goals");
      });

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
        // Build descriptive outcome (10-15 words) from action details
        const actionType = action.action || action.type || "Task";
        const target = action.target || "";
        const result = action.result || action.output || "";

        // Generate a descriptive outcome based on action type
        let outcomeText = "";
        if (actionType === "WebSearch" || actionType === "WEB_SEARCH") {
          outcomeText = `Successfully searched for "${target.slice(0, 30)}" and retrieved relevant results for analysis`;
        } else if (actionType === "Fetch" || actionType === "WEB_FETCH") {
          outcomeText = `Downloaded and processed content from ${target.slice(0, 40)} for further analysis`;
        } else if (actionType === "Read" || actionType === "READ") {
          outcomeText = `Read and analyzed file ${target.split(/[/\\]/).pop()?.slice(0, 25) || target.slice(0, 25)} successfully`;
        } else if (actionType === "Write" || actionType === "WRITE") {
          outcomeText = `Created or updated file ${target.split(/[/\\]/).pop()?.slice(0, 25) || target.slice(0, 25)} with new content`;
        } else if (actionType === "Bash" || actionType === "BASH") {
          outcomeText = `Executed command successfully and processed the output for next steps`;
        } else {
          outcomeText = `Completed ${actionType} operation on ${target.slice(0, 30) || "target"} successfully`;
        }

        // Use activityNarrator for outcomes (not activityTracker)
        const narrator = getActivityNarrator();
        narrator.observe(outcomeText);

        activityTracker.setAgentState("OBSERVING");
        activityTracker.setGoal(null);
      });

      autonomousEngine.on("action-failed", (action) => {
        if (action._activityId) {
          activityTracker.error(action._activityId, action.error);
        }
        const actionType = action.action || action.type || "Task";
        const target = action.target || "";
        const errorMsg = action.error?.slice(0, 40) || "unknown error";

        // Generate descriptive failure outcome
        const failureText = `Failed to complete ${actionType} on ${target.slice(0, 25) || "target"}: ${errorMsg}`;

        // Use activityNarrator for outcomes
        const narrator = getActivityNarrator();
        narrator.observe(failureText);
        activityTracker.setAgentState("REFLECTING");
      });

      // Activity tracker updates are handled by AgentActivityPanel directly
      // to prevent full app re-renders

      // ===== QUOTA MONITOR EVENTS =====
      quotaMonitor.on("quota-exceeded", ({ provider, errorMessage }) => {
        setQuotaExceeded(prev => {
          // Only log and show alert if not already flagged (prevent repeated noise)
          if (prev[provider]) return prev;
          workLog.logError(LOG_SOURCE.SYSTEM, `${provider.toUpperCase()} Quota Exceeded`, "Using fallback models — add credits when ready");
          activityTracker.addObservation(`${provider} API credits exhausted — system using fallback chain`);
          return {
            ...prev,
            [provider]: true,
            showAlert: true,
            provider
          };
        });
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

  // Thinking Engine - runs every 15 mins, analyzes user context, updates thesis
  const thinkingEngineRef = useRef(null);

  useEffect(() => {
    if (!autonomousEngine) return () => {};

    const thinkingEngine = getThinkingEngine();
    thinkingEngineRef.current = thinkingEngine;

    // Start the thinking engine
    thinkingEngine.start();

    return () => {
      thinkingEngine.stop();
    };
  }, [autonomousEngine]);

  // Idle Processor - works on backlog when user is idle
  const idleProcessorRef = useRef(null);

  useEffect(() => {
    console.log("========================================");
    console.log("[App] IDLE PROCESSOR INIT - autonomousEngine exists:", !!autonomousEngine);
    console.log("========================================");

    // Connect Claude Engine to UI
    console.log("[App] Connecting Claude Engine to UI...");
    const claudeEngine = getClaudeEngine();

    const onStarted = () => {
      setActionStreamingTitle("Claude Engine");
      setActionStreamingText("Claude is working...\n");
      setCliStreaming(true);
    };

    const onStatus = (statusText) => {
      // Show status updates in the ENGINE panel
      if (statusText) {
        // Filter out raw JSON responses (from Vapi, MCP, etc.)
        const trimmed = statusText.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.includes('"type":"')) {
          // Skip raw JSON - don't display
          return;
        }

        // Detect billing errors and pause engine
        const lower = trimmed.toLowerCase();
        if (lower.includes("credit balance") || lower.includes("billing") || lower.includes("insufficient")) {
          // Billing error - pause and show clear message
          setActionStreamingTitle("Billing Issue");
          setActionStreamingText("⚠️ API credit balance is too low.\n\nCheck your Anthropic billing at:\nhttps://console.anthropic.com/settings/billing");
          setCliStreaming(false);
          // Pause the autonomous engine
          const engine = getAutonomousEngine();
          if (engine) engine.pause();
          return;
        }

        setCliStreaming(true);
        setActionStreamingText((prev) => {
          const lines = prev.split("\n").slice(-20); // Keep last 20 lines
          lines.push(statusText);
          return lines.join("\n");
        });
      }
    };

    const onComplete = (result) => {
      console.log(`[ClaudeEngine] Completed: ${result.success ? "success" : "failed"}`);
      if (result.reason === "auth-error") {
        // Auth error - show clear message to user
        setActionStreamingTitle("Auth Error");
        setActionStreamingText((prev) => prev + `\n✗ ${result.error || "Authentication failed"}\n\nRun 'claude login' in a terminal to authenticate with your Pro/Max subscription.\n`);
        // Update connection status
        setClaudeCodeAlert(result.error || "Claude Code auth error");
      } else if (result.success) {
        setActionStreamingTitle("Work completed");
        setActionStreamingText((prev) => prev + "\n✓ Work done. Next run in 2 minutes.\n\nCheck memory/current-work.md for details.");
      } else {
        setActionStreamingTitle("Work failed");
        setActionStreamingText((prev) => prev + `\n✗ Failed with code ${result.code}\n`);
      }
      setCliStreaming(false);
    };

    const onAuthError = (data) => {
      console.error("[ClaudeEngine] Auth error:", data.error);
      setActionStreamingTitle("Auth Error");
      setActionStreamingText((prev) => prev + `\n✗ ${data.error}\n`);
      setClaudeCodeAlert(data.error);
      setCliStreaming(false);
    };

    const onError = (error) => {
      console.error("[ClaudeEngine] Error:", error);
      setActionStreamingText((prev) => prev + `\n[Error] ${error.error}\n`);
      setCliStreaming(false);
    };

    const onStopped = () => {
      setCliStreaming(false);
      setActionStreamingText("");
    };

    claudeEngine.on("started", onStarted);
    claudeEngine.on("status", onStatus);
    claudeEngine.on("complete", onComplete);
    claudeEngine.on("auth-error", onAuthError);
    claudeEngine.on("error", onError);
    claudeEngine.on("stopped", onStopped);

    return () => {
      claudeEngine.off("started", onStarted);
      claudeEngine.off("status", onStatus);
      claudeEngine.off("complete", onComplete);
      claudeEngine.off("auth-error", onAuthError);
      claudeEngine.off("error", onError);
      claudeEngine.off("stopped", onStopped);
    };
  }, []);

  // Claude Code connection monitor - shows alert when disconnected
  useEffect(() => {
    const monitor = getClaudeCodeMonitor();

    const onStatusChecked = ({ statusMessage }) => {
      setClaudeCodeAlert(statusMessage);
    };

    const onDisconnected = () => {
      console.log("[App] Claude Code disconnected - showing alert");
    };

    const onConnected = () => {
      console.log("[App] Claude Code connected - clearing alert");
      setClaudeCodeAlert(null);
    };

    monitor.on("status-checked", onStatusChecked);
    monitor.on("disconnected", onDisconnected);
    monitor.on("connected", onConnected);

    // Get initial status
    const initialStatus = monitor.getDisplayStatus();
    if (initialStatus.statusMessage) {
      setClaudeCodeAlert(initialStatus.statusMessage);
    }

    return () => {
      monitor.off("status-checked", onStatusChecked);
      monitor.off("disconnected", onDisconnected);
      monitor.off("connected", onConnected);
    };
  }, []);

  // Firestore real-time sync - pushes tickers, profile, positions to Firebase
  useEffect(() => {
    // Only start if user is authenticated with Firebase
    if (isFirestoreAuthenticated()) {
      console.log("[App] Starting Firestore real-time sync...");
      // Sync every 5 minutes (tickers internally throttle to 4 hours)
      startRealtimeSync(5 * 60 * 1000);
    } else {
      console.log("[App] Firestore sync skipped - user not authenticated");
    }

    return () => {
      stopRealtimeSync();
    };
  }, []);

  // ===== DASHBOARD SYNC (CLI → Firestore → Web App) =====
  useEffect(() => {
    if (dashboardSyncInitRef.current) return;
    if (!firebaseUser?.uid) return;

    dashboardSyncInitRef.current = true;
    const dashSync = getDashboardSync();

    // Register data providers — each returns a minimal snapshot
    dashSync.registerDataProvider("portfolio", () => {
      const p = portfolioRef.current;
      if (!p) return null;
      const equityNum = p.equityRaw || (typeof p.equity === "string" ? parseFloat(p.equity.replace(/[$,]/g, "")) : p.equity);
      return {
        equity: equityNum || 0,
        cash: typeof p.cash === "string" ? parseFloat(p.cash.replace(/[$,]/g, "")) : (p.cash || 0),
        dayPL: p.dayPL || 0,
        dayPLPercent: p.dayPLPercent || 0,
        totalPL: p.totalPL || 0,
        totalPLPercent: p.totalPLPercent || 0,
        positions: (p.positions || []).slice(0, 10).map(pos => ({
          symbol: pos.symbol,
          qty: pos.qty,
          currentPrice: pos.currentPrice,
          avgEntryPrice: pos.avgEntryPrice,
          unrealizedPL: pos.unrealizedPL,
          unrealizedPLPercent: pos.unrealizedPLPercent,
          marketValue: pos.marketValue
        }))
      };
    });

    dashSync.registerDataProvider("health", () => {
      const h = ouraHealthRef.current;
      if (!h?.connected) return null;
      return {
        sleep: { score: h.sleep?.score, duration: h.sleep?.duration, efficiency: h.sleep?.efficiency },
        readiness: { score: h.readiness?.score },
        activity: { score: h.activity?.score, steps: h.activity?.steps, calories: h.activity?.calories },
        hrv: h.hrv || null,
        rhr: h.rhr || null
      };
    });

    dashSync.registerDataProvider("goals", () => {
      const active = goalTracker.getActive();
      if (!active || active.length === 0) return null;
      return {
        goals: active.slice(0, 10).map(g => ({
          id: g.id,
          title: g.title,
          category: g.category,
          progress: g.progress || 0,
          status: g.status,
          milestones: (g.milestones || []).map(m => ({ label: m.label, target: m.target, achieved: m.achieved }))
        })),
        totalActive: active.length
      };
    });

    dashSync.registerDataProvider("tickers", () => {
      const t = tickersRef.current;
      if (!t || t.length === 0) return null;
      return {
        tickers: t.slice(0, 15).map(tk => ({
          symbol: tk.symbol || tk.ticker,
          score: tk.score,
          price: tk.price || tk.lastPrice,
          change: tk.change || tk.changePercent,
          macdTrend: tk.macdTrend || tk.trend
        }))
      };
    });

    dashSync.registerDataProvider("trading", () => {
      const tradingConfig = loadTradingConfig();
      return {
        autoTradingEnabled: tradingConfig?.enabled || false,
        mode: tradingConfig?.mode || "paper",
        todayTradeCount: tradingConfig?.todayTradeCount || 0,
        lastTradeTime: tradingConfig?.lastTradeTime || null
      };
    });

    dashSync.registerDataProvider("lifeScores", () => {
      const data = lifeScores.getDisplayData();
      if (!data) return null;
      return {
        overall: data.overall || 0,
        categories: data.categories || {},
        trends: data.trends || {}
      };
    });

    // Initialize the sync service
    dashSync.initialize(firebaseUser.uid);

    // Push connected sources
    dashSync.setConnectedSources({
      alpaca: alpacaStatus === "Live",
      oura: !!ouraHealth?.connected,
      goals: goalTracker.getActive().length > 0,
      linkedin: !!linkedInProfile?.connected
    });

    return () => {
      getDashboardSync().stop();
    };
  }, [firebaseUser?.uid]);

  // Mark portfolio/tickers dirty when they update (high-freq 3-min batch)
  useEffect(() => {
    if (dashboardSyncInitRef.current) getDashboardSync().markDirty("portfolio");
  }, [portfolio?.equity]);

  useEffect(() => {
    if (dashboardSyncInitRef.current) getDashboardSync().markDirty("tickers");
  }, [tickers]);

  // Trigger immediate sync for low-freq sources
  useEffect(() => {
    if (dashboardSyncInitRef.current && ouraHealth?.connected) {
      getDashboardSync().triggerImmediateSync("health");
    }
  }, [ouraHealth?.sleep?.score]);

  // Sync goals and life scores with portfolio/health data
  useEffect(() => {
    const equityNum = portfolio?.equityRaw || (typeof portfolio?.equity === "string" ? parseFloat(portfolio.equity.replace(/[$,]/g, "")) : portfolio?.equity);
    if (equityNum && typeof equityNum === "number" && !isNaN(equityNum)) {
      goalTracker.syncFinanceGoal(equityNum);
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
      const claudeCodeConnected = claudeCodeStatus.ready || false;
      const claudeCodeStatusState = claudeCodeConnected
        ? "connected"
        : claudeCodeStatus.available
          ? "broken"  // installed but not logged in
          : "never";  // not installed
      const linkedinConnected = linkedInProfile?.connected;
      const linkedinStatusState = linkedinConnected ? "connected" : "never";
      const ouraConnected = ouraHealth?.connected;
      const ouraStatusState = ouraConnected ? "connected" : "never";
      const yahooConnected = isInternetConnected;
      const yahooStatusState = isInternetConnected ? "connected" : "never";
      const personalCapitalConnected = personalCapitalData?.connected || false;
      const personalCapitalStatusState = personalCapitalConnected ? "connected" : "never";

      const next = {
        alpaca: { connected: alpacaConnected, status: alpacaStatusState, details: alpacaMode },
        claude: { connected: claudeConnected, status: claudeStatusState, details: "" },
        claudeCode: {
          connected: claudeCodeConnected,
          status: claudeCodeStatusState,
          details: claudeCodeConnected
            ? "Ready"
            : claudeCodeStatus.available
              ? "Not logged in — run 'claude login'"
              : "Not installed"
        },
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

    // Update dashboard connected sources when integrations change
    if (dashboardSyncInitRef.current) {
      getDashboardSync().setConnectedSources({
        alpaca: alpacaStatus === "Live",
        oura: !!ouraHealth?.connected,
        goals: goalTracker.getActive().length > 0,
        linkedin: !!linkedInProfile?.connected
      });
    }
  }, [alpacaStatus, alpacaMode, claudeStatus, claudeCodeStatus.available, claudeCodeStatus.ready, linkedInProfile?.connected, ouraHealth?.connected, personalCapitalData?.connected, isInternetConnected]);

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
      // which uses Claude Code CLI as the primary engine, or AI Brain fallback
      // The NEW loop was already started in the initialization useEffect above
      activityTracker.setRunning(true);
      activityTracker.setAgentState("THINKING");
      workLog.logSystem("Autonomous Engine", "AI Brain initialized - powered by Claude Code CLI");

      // Initialize Life Management Engine services (but DON'T start its rule-based cycle)
      // The AI Brain now handles intelligent decision-making
      lifeManagementEngine.initialize().then(() => {
        workLog.logSystem("Life Engine", "Services initialized (AI Brain is primary)");

        // Polymarket data is useful context for the AI Brain
        if (polymarketService.shouldFetch()) {
          polymarketService.refresh();
        }
      });

      // Auto-start Claude Engine after 30 seconds if not in cooldown
      // This enables background work (idle processing) without manual /engine start
      setTimeout(() => {
        const claudeEngine = getClaudeEngine();
        const engineStatus = claudeEngine.getStatus();
        if (!engineStatus.isRunning && !engineStatus.cooldown) {
          console.log("[App] Auto-starting Claude Engine for background work...");
          claudeEngine.start().then((result) => {
            if (result?.success) {
              workLog.logSystem("Claude Engine", "Auto-started for background work");
            }
          }).catch(() => {});
        } else if (engineStatus.cooldown) {
          console.log(`[App] Claude Engine in cooldown (${engineStatus.cooldownRemainingMin} min left) — skipping auto-start`);
        }
      }, 30000);

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

  // Initialize Plaid/Net Worth data
  useEffect(() => {
    const initPlaid = async () => {
      const plaidService = getPlaidService();
      await plaidService.initFromFirebase();

      if (plaidService.isConfigured()) {
        // Load cached data first
        const displayData = plaidService.getDisplayData();
        setPlaidData(displayData);

        // Sync if stale
        if (plaidService.isStale()) {
          try {
            await plaidService.sync();
            setPlaidData(plaidService.getDisplayData());
          } catch (error) {
            console.error("Plaid sync failed:", error.message);
          }
        }
      }
    };
    initPlaid();
  }, []);

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
          netWorth: plaidDataRef.current?.netWorth,
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

  // Listen for chat action events (progress, confirmations needed during execution)
  useEffect(() => {
    const chatActions = getChatActionsManager();

    const handleActionProgress = ({ actionId, message, progress }) => {
      setLastAction(`${message} (${progress}%)`);
    };

    const handleActionStarted = (pending) => {
      setLastAction(`Executing: ${pending.action?.analysis?.summary || "action"}...`);
      engineState.setStatus("working", "Executing action...");
    };

    const handleActionCompleted = (pending) => {
      setLastAction("Action completed");
      engineState.setStatus("idle");
    };

    const handleActionFailed = ({ pending, error }) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Action failed: ${error.message}`, timestamp: new Date(), isError: true }
      ]);
      setLastAction("Action failed");
      engineState.setStatus("idle");
    };

    const handleGoalCreated = ({ goal, analysis }) => {
      console.log(`[Backbone] Goal created from chat: ${goal.title}`);
    };

    const handleActionConfirmationNeeded = async ({ actionId, message, stepIndex }) => {
      const confirmationMessage = [
        `Confirmation needed before step ${stepIndex + 1}:`,
        message,
        "",
        'Reply "yes" to proceed or "no" to cancel.'
      ].join("\n");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: confirmationMessage, timestamp: new Date() }
      ]);
      unifiedMessageLog.addAssistantMessage(confirmationMessage, MESSAGE_CHANNEL.CHAT, {
        actionId,
        stepIndex,
        type: "action_confirmation"
      });
      setLastAction("Awaiting confirmation");

      // Proactively notify external channels when available
      if (firebaseUser?.uid) {
        const routing = selectChannel(confirmationMessage, {
          isProactive: true,
          priority: 3,
          userId: firebaseUser.uid
        });
        await routeResponse(confirmationMessage, routing.channel, {
          chunks: routing.chunks,
          userId: firebaseUser.uid,
          pushTitle: "BACKBONE Confirmation"
        });
      }
    };

    chatActions.on("action-progress", handleActionProgress);
    chatActions.on("action-started", handleActionStarted);
    chatActions.on("action-completed", handleActionCompleted);
    chatActions.on("action-failed", handleActionFailed);
    chatActions.on("goal-created", handleGoalCreated);
    chatActions.on("action-confirmation-needed", handleActionConfirmationNeeded);

    return () => {
      chatActions.off("action-progress", handleActionProgress);
      chatActions.off("action-started", handleActionStarted);
      chatActions.off("action-completed", handleActionCompleted);
      chatActions.off("action-failed", handleActionFailed);
      chatActions.off("goal-created", handleGoalCreated);
      chatActions.off("action-confirmation-needed", handleActionConfirmationNeeded);
    };
  }, [firebaseUser?.uid, unifiedMessageLog]);

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
          netWorth: plaidDataRef.current?.netWorth,
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
        unifiedMessageLog.addAssistantMessage(
          "No AI model configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to your .env file.",
          MESSAGE_CHANNEL.CHAT,
          { source: "system" }
        );
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

      // Add user message and show conversation immediately
      unifiedMessageLog.addUserMessage(userMessage, MESSAGE_CHANNEL.CHAT, {
        source: "cli"
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: userMessage,
          timestamp: new Date()
        }
      ]);
      setShowConversation(true);
      setConversationScrollOffset(0);

      // Track user query for goals/insights analysis
      trackUserQuery(userMessage, QUERY_SOURCE.CLI, {
        conversationId: Date.now().toString()
      });

      // Wake engine from rest if it's sleeping (user query takes priority)
      try { autonomousEngine.wakeFromRest(); } catch {}

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

      // Claude Code CLI is the default for ALL queries
      // Only fall back to API if CLI not available
      const claudeCodeReady = claudeCodeStatus.available;

      if (claudeCodeReady) {
        // Use Claude Code CLI as the default handler for all queries
        setIsProcessing(true);
        setCliStreaming(true);
        setShowConversation(true);
        setConversationScrollOffset(0);
        engineState.setStatus("executing", "Claude Code CLI");
        resetActionStream("Claude Code CLI");
        resetToolEvents();
        setActionStreamingText("Processing...");

        // Build context for Claude Code CLI (same as API path)
        const savedUserContext = buildContextForAI();
        const fileContext = await loadUserContextFiles();

        // Build conversation history from recent messages
        const recentMsgs = messages.slice(-10).map(m =>
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 500)}`
        ).join("\n\n");

        // Build context prompt
        const contextParts = [];

        // Add user identity
        if (fileContext.linkedIn?.summary) {
          contextParts.push(`## User Profile\n${fileContext.linkedIn.summary.slice(0, 500)}`);
        }

        // Add goals
        if (fileContext.goals?.length > 0) {
          const goalsText = fileContext.goals.slice(0, 5).map(g => `- ${g.description || g.text || g}`).join("\n");
          contextParts.push(`## Current Goals\n${goalsText}`);
        }

        // Add skills catalog (user skills have higher priority)
        const skillsList = getSkillsCatalog();
        if (skillsList) {
          contextParts.push(`## Available Skills\n${skillsList}\n\nCustom user skills take priority over system skills. When a query matches a custom skill's description or "When to Use" section, read the full skill file from data/user-skills/ and follow its process.`);
        }

        // Add saved user context
        if (savedUserContext) {
          contextParts.push(savedUserContext.slice(0, 800));
        }

        // Add conversation history
        if (recentMsgs) {
          contextParts.push(`## Recent Conversation\n${recentMsgs}`);
        }

        // Build full prompt with context
        const contextSection = contextParts.length > 0
          ? `# Context\n${contextParts.join("\n\n")}\n\n# Current Request\n`
          : "";

        const agenticPrompt = withToolGuide(`${contextSection}${userMessage}`);
        const result = await executeAgenticTask(
          agenticPrompt,
          process.cwd(),
          (event) => {
            if (event.type === "stdout") {
              extractToolEvents(event.text, "claude-code");
              const displayText = (event.output || "").slice(-500);
              // Filter out raw JSON and billing errors
              const trimmed = displayText.trim();
              if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.includes('"type":"')) {
                if (trimmed.toLowerCase().includes("credit balance")) {
                  setActionStreamingText("⚠️ API credit balance is too low");
                } else {
                  setActionStreamingText(displayText || "Processing...");
                }
              }
            } else if (event.type === "stderr") {
              extractToolEvents(event.text, "claude-code");
              const displayText = (event.error || "").slice(-500);
              // Filter out raw JSON
              const trimmed = (displayText || "").trim();
              if (displayText && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
                setActionStreamingText(displayText);
              }
            } else if (event.type === "done") {
              // Don't clear streaming text here — let the result handler below
              // add the final message, which will naturally replace the streaming display.
              // Just clean up tool events.
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
        const outputText = (result.output || "").trim();
        const errorText = (result.error || "").trim();

        // Check if we got a meaningful response
        if (result.success && outputText && !_isClaudeRateLimited(outputText)) {
          const resultMessage = outputText.slice(-2000);
          unifiedMessageLog.addAssistantMessage(resultMessage, MESSAGE_CHANNEL.CHAT, {
            source: "claude-code"
          });
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: resultMessage,
              timestamp: new Date(),
              isAgentic: true,
              tool: "claude-code"
            }
          ]);

          // Track conversation for learning
          conversationTracker.record(userMessage, resultMessage, {
            category: conversationTracker.categorizeMessage(userMessage)
          });

          // Broadcast to WhatsApp + Firebase
          broadcastResponse(resultMessage, "claude-code");

          // Keep last streaming output visible - don't clear actionStreamingText
          setActionStreamingTitle("Completed");
          setIsProcessing(false);
          setCliStreaming(false);
          engineState.setStatus("idle");
          return;
        }

        // Claude Code CLI returned empty or failed
        const fallbackMessage = errorText || "Claude Code CLI returned no response.";
        const rateLimited = _isClaudeRateLimited(fallbackMessage) || _isClaudeRateLimited(outputText);

        if (rateLimited) {
          setActionStreamingTitle("Claude Code rate limited — switching to Codex");
          setCliStreaming(false);
          setIsProcessing(true);
          try {
            const result = await sendMultiAI(userMessage, {
              user: fileContext.user,
              linkedIn: fileContext.linkedIn,
              profile: fileContext.profile,
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
              netWorth: plaidData?.netWorth ? {
                total: plaidData.netWorth.total,
                assets: plaidData.netWorth.assets,
                liabilities: plaidData.netWorth.liabilities,
                accounts: plaidData.accountCount
              } : null,
              education: profile.education || null,
              userContext: savedUserContext,
              conversationHistory: fileContext.conversationHistory,
              recentMessages: messages.slice(-5).map(m => ({ role: m.role, content: m.content.slice(0, 300) }))
            }, "auto");

            let resolvedModelInfo = result.modelInfo || null;
            if (resolvedModelInfo) {
              resolvedModelInfo = buildModelDisplayInfo(resolvedModelInfo, result.taskType) || { ...resolvedModelInfo, taskType: result.taskType };
              setCurrentModelInfo(resolvedModelInfo);
            }
            unifiedMessageLog.addAssistantMessage(result.response, MESSAGE_CHANNEL.CHAT, {
              source: "openai"
            });
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

            // Broadcast to WhatsApp + Firebase
            broadcastResponse(result.response, "openai-fallback");
          } catch (error) {
            unifiedMessageLog.addAssistantMessage(`Error: ${error.message}`, MESSAGE_CHANNEL.CHAT, {
              source: "openai"
            });
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `Error: ${error.message}`,
                timestamp: new Date()
              }
            ]);
          }
          setIsProcessing(false);
          setCliStreaming(false);
          engineState.setStatus("idle");
          return;
        }

        unifiedMessageLog.addSystemMessage(`Claude CLI: ${fallbackMessage}`, {
          source: "claude-code"
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `Claude CLI: ${fallbackMessage}`,
            timestamp: new Date()
          }
        ]);
        setActionStreamingTitle("Claude Code CLI error");
        setIsProcessing(false);
        setCliStreaming(false);
        engineState.setStatus("idle");
        return;
      }

      // Fallback: Claude Code CLI not available - use API
      setIsProcessing(true);
      setShowConversation(true);
      setConversationScrollOffset(0);
      setStreamingText("");

      // Set engine state to thinking
      engineState.setStatus("thinking", "Processing your message (API fallback)...");

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
        netWorth: plaidData?.netWorth ? {
          total: plaidData.netWorth.total,
          assets: plaidData.netWorth.assets,
          liabilities: plaidData.netWorth.liabilities,
          accounts: plaidData.accountCount
        } : null,
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
                // Anthropic API uses Claude models - include model info
                const claudeModelInfo = {
                  name: chunk.model || "claude-3-opus",
                  displayName: chunk.model?.includes("opus") ? "Opus 4.5" :
                               chunk.model?.includes("sonnet") ? "Sonnet" : "Claude Code"
                };
                unifiedMessageLog.addAssistantMessage(fullText, MESSAGE_CHANNEL.CHAT, {
                  source: "claude-api",
                  model: chunk.model || "claude"
                });
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    content: fullText,
                    timestamp: new Date(),
                    modelInfo: claudeModelInfo
                  }
                ]);
                setStreamingText("");
                setIsProcessing(false);
                engineState.setStatus("idle");

                // Track conversation for learning
                conversationTracker.record(userMessage, fullText, {
                  category: conversationTracker.categorizeMessage(userMessage)
                });

                // Broadcast to WhatsApp + Firebase
                broadcastResponse(fullText, "claude-api");
              } else if (chunk.type === "error") {
                unifiedMessageLog.addAssistantMessage(`Error: ${chunk.error}`, MESSAGE_CHANNEL.CHAT, {
                  source: "claude-api"
                });
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
          unifiedMessageLog.addAssistantMessage(`Error: ${error.message}`, MESSAGE_CHANNEL.CHAT, {
            source: "claude-api"
          });
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
        // Use OpenAI via multi-ai service (API fallback)
        try {
          const result = await sendMultiAI(userMessage, context, "auto");
          // Update model info for display
          let resolvedModelInfo = result.modelInfo || null;
          if (resolvedModelInfo) {
            resolvedModelInfo = buildModelDisplayInfo(resolvedModelInfo, result.taskType) || { ...resolvedModelInfo, taskType: result.taskType };
            setCurrentModelInfo(resolvedModelInfo);
          }
          unifiedMessageLog.addAssistantMessage(result.response, MESSAGE_CHANNEL.CHAT, {
            source: "openai"
          });
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

          // Broadcast to WhatsApp + Firebase
          broadcastResponse(result.response, "openai");

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
          unifiedMessageLog.addAssistantMessage(`Error: ${error.message}`, MESSAGE_CHANNEL.CHAT, {
            source: "openai"
          });
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
    plaidDataRef.current = plaidData;
  }, [plaidData]);

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
        const [account, positions, openOrders] = await Promise.all([
          fetchAccount(config),
          fetchPositions(config),
          getOrders(config, "open").catch(() => []),
        ]);

        if (cancelled || isTypingRef.current) {
          return;
        }

        // Build trailing stop map from open orders
        const stops = {};
        for (const o of openOrders) {
          if (o.type === "trailing_stop" && o.side === "sell") {
            const sym = o.symbol;
            const pos = positions.find(p => p.symbol === sym);
            const entry = parseFloat(pos?.avg_entry_price || 0);
            const current = parseFloat(pos?.current_price || 0);
            const gainPct = entry > 0 ? ((current - entry) / entry) * 100 : 0;
            stops[sym] = {
              trailPercent: parseFloat(o.trail_percent),
              gainPercent: +gainPct.toFixed(2),
              orderId: o.id,
            };
          }
        }
        setTrailingStops((prev) => {
          const prevKeys = Object.keys(prev).sort().join(",");
          const nextKeys = Object.keys(stops).sort().join(",");
          if (prevKeys === nextKeys) {
            // Check if values changed
            let same = true;
            for (const k of Object.keys(stops)) {
              if (prev[k]?.trailPercent !== stops[k].trailPercent ||
                  prev[k]?.gainPercent !== stops[k].gainPercent) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return stops;
        });

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
      // Display format: "9:33 AM ET" or "Mon 9:33 AM ET" with market status
      const displayText = nextTrade.isMarketOpen
        ? `Next: ${nextTrade.formatted} (${nextTrade.minutesUntil}m)`
        : `${nextTrade.formatted} | ${nextTrade.marketStatus}`;
      setNextTradeTimeDisplay((prev) => prev === displayText ? prev : displayText);
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

        // Re-evaluate trailing stops hourly — updates Alpaca trailing_stop orders
        // if the gain threshold has changed (no-ops if stop already matches)
        if (shouldUpdateStops()) {
          try {
            const stopResult = await applyStopsToAllPositions();
            const changed = (stopResult.summary?.created || 0) + (stopResult.summary?.replaced || 0);
            if (changed > 0) {
              setLastAction(`Trailing stops updated: ${changed} order(s) changed`);
            }
          } catch (err) {
            console.error("Trailing stop update error:", err.message);
          }
        }

        // Record momentum snapshot for drift analysis
        recordMomentumSnapshot(tickers);

        // Run the auto-trading monitor
        const result = await monitorAndTrade(tickers, portfolio.positions);

        // Log reasoning every cycle to console
        if (result.reasoning && result.reasoning.length > 0) {
          const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });
          console.log(`\n[AutoTrader ${time} ET] ─── Evaluation ───`);
          for (const line of result.reasoning) {
            console.log(`  ${line}`);
          }
          console.log("");
        }

        if (result.executed && result.executed.length > 0) {
          // Trades were executed — green check, persist until next trade
          const summary = result.executed.map(t => `${t.side === "buy" ? "Bought" : "Sold"} ${t.symbol}`).join(", ");
          setTradeAction({ type: "trade", text: summary, color: "green" });
          setLastAction(`Auto-trade: ${summary}`);
          if (dashboardSyncInitRef.current) getDashboardSync().triggerImmediateSync("trading");
        } else if (result.monitored) {
          // No trades — red X with concise reason (max ~3 words)
          const reason = _getShortTradeReason(result, tickers);
          setTradeAction(prev => {
            // If we previously had a trade, keep showing it (persist until next trade)
            if (prev.type === "trade") return prev;
            return { type: "no-trade", text: reason, color: "red" };
          });
        }
      } catch (error) {
        console.error("Auto-trading error:", error.message);
      }
    };

    // Apply trailing stops to any unprotected positions on startup
    (async () => {
      try {
        const stopResult = await applyStopsToAllPositions();
        const changed = (stopResult.summary?.created || 0) + (stopResult.summary?.replaced || 0);
        if (changed > 0) {
          setLastAction(`Startup: applied trailing stops to ${changed} position(s)`);
        }
      } catch (err) {
        console.error("Startup trailing stop error:", err.message);
      }
    })();

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
      // Restart Yahoo Finance server to ensure latest code is running
      await restartYahooServer();
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
        if (prev.changePercent !== next.changePercent) return true;
      }
      return false;
    };

    const fetchFromYahoo = async () => {
      // Skip if typing or paused
      if (pauseUpdatesRef.current || isTypingRef.current) {
        return;
      }

      // Set status to refreshing
      setTickerStatus(prev => ({ ...prev, refreshing: true, error: null }));

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
          // Update status: done refreshing, record count and time
          setTickerStatus(prev => {
            const now = new Date();
            const nowISO = now.toISOString();
            const today = now.toDateString();

            // Track if this was a full scan (500+ tickers from 800+ real universe)
            const isFullScan = result.tickers.length >= 500;
            const lastFullScan = isFullScan ? nowISO : prev.lastFullScan;

            // Track update history (keep only today's entries for gap checking)
            const updateHistory = [
              ...(prev.updateHistory || []).filter(ts => {
                const tsDate = new Date(ts).toDateString();
                return tsDate === today;
              }),
              nowISO
            ].slice(-50); // Keep last 50 updates max

            const universeSize = (result.evaluatedToday ?? 0) > 0
              ? result.evaluatedToday
              : (result.universeSize || result.tickers.length || TICKER_UNIVERSE.length);

            return {
              refreshing: false,
              lastRefresh: nowISO,
              error: null,
              scanCount: result.tickers.length,
              scanDone: result.tickers.length >= 50,
              lastFullScan: result.lastFullScan || lastFullScan,
              fullScanRunning: result.fullScanRunning || false,
              scanProgress: result.scanProgress || 0,
              scanTotal: result.scanTotal || 0,
              evaluatedToday: result.evaluatedToday ?? result.tickers.filter(t => isTickerToday(t.lastEvaluated)).length,
              universeSize,
              updateHistory,
            };
          });
        } else {
          // No data or unsuccessful - mark as pending
          setTickerStatus(prev => ({
            ...prev,
            refreshing: false,
            error: result.error || null,
          }));
        }
      } catch (error) {
        // Set error status
        setTickerStatus(prev => ({
          ...prev,
          refreshing: false,
          error: error.message || "Failed to fetch",
        }));
      }
    };

    // Initialize server
    initYahooFinance();

    // Initial fetch after delay for server startup
    // Note: The server auto-triggers full scan on startup if not done today
    setTimeout(fetchFromYahoo, 3000);

    // Check if we're in pre-market or market hours (5:30 AM - 4:00 PM ET)
    const shouldRefreshTickers = () => {
      const now = new Date();
      const etOptions = { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false };
      const etString = now.toLocaleString('en-US', etOptions);
      const [time] = etString.split(', ');
      const [hours, minutes] = time.split(':').map(Number);
      const dayOptions = { timeZone: 'America/New_York', weekday: 'short' };
      const dayOfWeek = now.toLocaleString('en-US', dayOptions);

      // Weekend - no refresh
      if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') return false;

      const currentMinutes = hours * 60 + minutes;
      const marketOpen = 7 * 60;             // 7:00 AM ET
      const marketClose = 16 * 60;          // 4:00 PM ET

      // Refresh from 7:00 AM to 4:00 PM ET
      return currentMinutes >= marketOpen && currentMinutes < marketClose;
    };

    // Smart refresh - full scan every 10 minutes during market hours (7am-4pm ET)
    const smartRefresh = async () => {
      if (shouldRefreshTickers()) {
        try {
          await triggerFullScan();
        } catch (e) {
          // Fall back to regular fetch if full scan fails
        }
      }
      // Always pull latest data into client state
      await fetchFromYahoo();
    };

    // Refresh every 10 minutes (pulls latest server data into client)
    const interval = setInterval(smartRefresh, 10 * 60 * 1000);

    // Poll scan progress + ticker counts (every 5 seconds)
    // Uses full fetch to get evaluatedToday counts; skips ticker state update unless scan finishes
    let lastPollEvaluated = -1;
    const scanPollInterval = setInterval(async () => {
      if (cancelled || pauseUpdatesRef.current || isTypingRef.current) return;
      try {
        const result = await fetchYahooTickers();
        if (!result.success) return;

        const todayCount = result.evaluatedToday ?? result.tickers.filter(t => isTickerToday(t.lastEvaluated)).length;
        const totalCount = todayCount > 0
          ? todayCount
          : (result.universeSize || result.tickers.length || TICKER_UNIVERSE.length);

        setTickerStatus(prev => {
          const scanRunning = result.fullScanRunning || false;
          const progress = result.scanProgress || 0;
          const total = result.scanTotal || 0;

          // Check if anything changed
          if (prev.fullScanRunning === scanRunning &&
              prev.scanProgress === progress &&
              prev.scanTotal === total &&
              prev.evaluatedToday === todayCount) {
            return prev;
          }

          const updated = {
            ...prev,
            fullScanRunning: scanRunning,
            scanProgress: progress,
            scanTotal: total,
            lastFullScan: result.lastFullScan || prev.lastFullScan,
            evaluatedToday: todayCount,
            universeSize: totalCount,
          };

          // If scan just finished, pull in updated tickers + scores
          if (prev.fullScanRunning && !scanRunning && result.tickers.length > 0) {
            setTickers(result.tickers);
            updated.lastRefresh = new Date().toISOString();
            updated.scanCount = result.tickers.length;
          }

          return updated;
        });

        // Update tickers when evaluatedToday changes or on first poll
        if (lastPollEvaluated !== todayCount || lastPollEvaluated === -1) {
          lastPollEvaluated = todayCount;
          setTickers(result.tickers);
        }
      } catch {
        // Silently ignore poll errors
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(scanPollInterval);
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

    // Record user activity for idle processor
    if (idleProcessorRef.current) {
      idleProcessorRef.current.recordUserActivity();
    }

    // Record action in session state for persistence
    recordAction({
      type: resolved.startsWith("/") ? "command" : "query",
      description: resolved.slice(0, 100),
      metadata: { timestamp: new Date().toISOString() }
    });

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
      } else if (resolved.startsWith("/insights") || resolved.startsWith("/report") || resolved.startsWith("/dashboard") || resolved.startsWith("/progress")) {
        engineState.setStatus("analyzing", "Generating insights...");
      } else if (resolved.startsWith("/project")) {
        engineState.setStatus("building", "Managing projects...");
      }

      // /progress - Show overall progress score and goal completion status
      if (resolved === "/progress") {
        const tracker = getGoalTracker();
        const progressResearch = getProgressResearch();
        const goals = tracker.getActive();

        // Calculate overall progress score
        let overallProgress = 0;
        let completedGoals = 0;
        let totalGoals = goals.length;

        if (totalGoals > 0) {
          for (const goal of goals) {
            const progress = tracker.calculateProgress(goal);
            overallProgress += progress * 100;
            if (progress >= 1.0) completedGoals++;
          }
          overallProgress = Math.round(overallProgress / totalGoals);
        }

        // Get category breakdown
        const categories = {};
        for (const goal of goals) {
          const cat = goal.category || "general";
          if (!categories[cat]) {
            categories[cat] = { count: 0, totalProgress: 0 };
          }
          categories[cat].count++;
          categories[cat].totalProgress += tracker.calculateProgress(goal) * 100;
        }

        // Build progress display
        let progressContent = "📊 **Progress Score**\n\n";
        progressContent += `**Overall Progress:** ${overallProgress}%\n`;
        progressContent += `**Active Goals:** ${totalGoals}\n`;
        progressContent += `**Completed:** ${completedGoals}\n\n`;

        progressContent += "**By Category:**\n";
        for (const [cat, data] of Object.entries(categories)) {
          const avgProgress = Math.round(data.totalProgress / data.count);
          const barFilled = Math.round(avgProgress / 10);
          const bar = "█".repeat(barFilled) + "░".repeat(10 - barFilled);
          progressContent += `${cat.charAt(0).toUpperCase() + cat.slice(1)}: ${bar} ${avgProgress}%\n`;
        }

        progressContent += "\n**Goals:**\n";
        for (const goal of goals) {
          const progress = Math.round(tracker.calculateProgress(goal) * 100);
          const status = progress >= 100 ? "✓" : progress > 0 ? "●" : "○";
          progressContent += `${status} ${goal.title.slice(0, 40)}... ${progress}%\n`;
        }

        // Get AI-powered comparison data
        try {
          const comparison = progressResearch.getProgressComparison();
          if (comparison.aspiration) {
            progressContent += "\n**Your Target Role Model:**\n";
            progressContent += `🎯 **${comparison.aspiration.name}** (${comparison.aspiration.domain})\n`;
            progressContent += `   ${comparison.aspiration.metric}\n`;
            if (comparison.aspiration.matchReason) {
              progressContent += `   _${comparison.aspiration.matchReason}_\n`;
            }
          }
          if (comparison.top10Percent) {
            progressContent += `\n**Age ${comparison.user.age || "?"} Benchmarks:**\n`;
            progressContent += `   Average Net Worth: ${comparison.avgPerson.ageBenchmark?.netWorth?.formatted?.average || "N/A"}\n`;
            progressContent += `   Top 10%: ${comparison.top10Percent.netWorth}\n`;
          }
        } catch (e) {
          // Skip comparison if not available
        }

        setMessages((prev) => [
          ...prev,
          { role: "user", content: "/progress", timestamp: new Date() },
          { role: "assistant", content: progressContent, timestamp: new Date() }
        ]);
        setLastAction("Progress score calculated");
        return;
      }

      // WhatsApp message command
      if (resolved.startsWith("/whatsapp ")) {
        const message = resolved.slice(10).trim();
        if (!message) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: "/whatsapp", timestamp: new Date() },
            { role: "assistant", content: "Usage: /whatsapp <message>\n\nSend a WhatsApp message to your verified phone number.", timestamp: new Date() }
          ]);
          return;
        }

        const user = getCurrentFirebaseUser();
        if (!user?.id) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: resolved, timestamp: new Date() },
            { role: "assistant", content: "You need to be logged in to send WhatsApp messages. Run /setup to sign in.", timestamp: new Date() }
          ]);
          return;
        }

        if (!isPhoneVerified(user.id)) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: resolved, timestamp: new Date() },
            { role: "assistant", content: "Your phone number is not verified. Run /setup and complete WhatsApp verification first.", timestamp: new Date() }
          ]);
          return;
        }

        // Send the WhatsApp message
        setLastAction("Sending WhatsApp message...");
        try {
          const result = await sendWhatsAppMessage(user.id, message);
          if (result.success) {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: resolved, timestamp: new Date() },
              { role: "assistant", content: `WhatsApp message sent successfully!\n\nMessage: "${message}"`, timestamp: new Date() }
            ]);
            setLastAction("WhatsApp message sent");
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "user", content: resolved, timestamp: new Date() },
              { role: "assistant", content: `Failed to send WhatsApp message: ${result.error}`, timestamp: new Date() }
            ]);
            setLastAction("WhatsApp send failed");
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "user", content: resolved, timestamp: new Date() },
            { role: "assistant", content: `Error sending WhatsApp message: ${error.message}`, timestamp: new Date() }
          ]);
          setLastAction("WhatsApp error");
        }
        return;
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

      if (resolved === "/profiles") {
        const profiles = listArchivedProfiles();
        if (profiles.length === 0) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "No archived profiles found.", timestamp: new Date() }
          ]);
        } else {
          const lines = profiles.map((p, i) => {
            const date = p.archivedAt ? new Date(p.archivedAt).toLocaleDateString() : "unknown";
            return `${i + 1}. ${p.name || "Unknown"} (${p.email || p.uid}) — archived ${date}`;
          });
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Archived Profiles:\n\n${lines.join("\n")}`, timestamp: new Date() }
          ]);
        }
        setLastAction("Listed profiles");
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

      // Connect Google email/calendar via OAuth
      if (resolved === "/connect email" || resolved === "/connect google email") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Opening Google sign-in in your browser...\nAuthorize Gmail & Calendar access, then return here.", timestamp: new Date() }
        ]);
        setLastAction("Connecting Google email");
        try {
          await startEmailOAuth("google");
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Google email connected! Syncing emails and calendar...", timestamp: new Date() }
          ]);
          await syncEmailCalendar();
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Email and calendar synced successfully.", timestamp: new Date() }
          ]);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Google email connection failed: ${err.message}`, timestamp: new Date() }
          ]);
        }
        return;
      }

      // Connect phone — show QR code to install PWA for push notifications
      if (resolved === "/connect phone") {
        setLastAction("Connecting phone");
        try {
          const qrcode = await import("qrcode-terminal");
          const pwaUrl = "https://backboneai.web.app";

          // Generate QR code as string
          const qrString = await new Promise((resolve) => {
            qrcode.default.generate(pwaUrl, { small: true }, (code) => resolve(code));
          });

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: [
                "Scan this QR code with your phone to install BACKBONE:\n",
                qrString,
                `\nOr visit: ${pwaUrl}`,
                "\nSteps:",
                "1. Scan QR code or open URL on your phone",
                "2. Sign in with Google",
                "3. Tap \"Enable Notifications\"",
                "4. Tap \"Add to Home Screen\"",
                "\nYou'll receive push notifications for morning briefs, trades, and goal updates."
              ].join("\n"),
              timestamp: new Date()
            }
          ]);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Install BACKBONE on your phone:\n\nVisit: https://backboneai.web.app\n\n1. Sign in with Google\n2. Enable Notifications\n3. Add to Home Screen\n\n(qrcode-terminal not available: ${err.message})`,
              timestamp: new Date()
            }
          ]);
        }
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

            // Capture historical snapshot
            const snapResult = captureLinkedInSnapshot();
            const snapMsg = snapResult.success
              ? snapResult.isFirst
                ? "First snapshot saved to history."
                : snapResult.changes.length > 0
                  ? `Snapshot saved. ${snapResult.changes.length} change(s) detected.`
                  : "Snapshot saved. No changes from last capture."
              : "";

            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: `LinkedIn profile captured!\n\n${profileSummary}\n\n${mdStatus}${snapMsg ? `\n${snapMsg}` : ""}\n\nData saved. View with /profile or /profile general`,
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
          setPlaidData(null);
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

      // /talk - Launch voice conversation with BACKBONE
      if (resolved === "/talk") {
        if (!process.env.OPENAI_API_KEY) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "OpenAI API key required for voice conversation.\n\nTo set up:\n1. Run /models to configure your API keys\n2. Add OPENAI_API_KEY to your .env file\n3. Then run /talk again",
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
            content: "Opening voice conversation...",
            timestamp: new Date()
          }
        ]);
        try {
          const scriptPath = path.join(process.cwd(), "scripts", "voice-server.js");
          spawn("node", [scriptPath], {
            detached: true,
            stdio: "ignore",
            env: { ...process.env }
          }).unref();
          setLastAction("Voice conversation launched");
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Failed to launch voice: ${err.message}`, timestamp: new Date() }
          ]);
          setLastAction("Voice launch failed");
        }
        return;
      }

      // /call - Vapi AI phone call
      if (resolved === "/call" || resolved.startsWith("/call ")) {
        const subCommand = resolved.split(" ").slice(1).join(" ").trim();

        if (subCommand === "status") {
          try {
            const { getVapiService } = await import("./services/vapi-service.js");
            const vapi = getVapiService();
            const status = vapi.getCallStatus();
            if (!status.active) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "No active call.", timestamp: new Date() }
              ]);
            } else {
              const transcriptText = status.transcript.length > 0
                ? status.transcript.map(t => `  ${t.role}: ${t.text}`).join("\n")
                : "  (no transcript yet)";
              const tasksText = Object.keys(status.backgroundTasks).length > 0
                ? Object.entries(status.backgroundTasks).map(([id, t]) => `  ${id}: ${t.status} — ${t.description}`).join("\n")
                : "  (none)";
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content: `**Active Call**\nID: ${status.call.id}\nStatus: ${status.call.status}\nTunnel: ${status.tunnelUrl}\n\n**Transcript:**\n${transcriptText}\n\n**Background Tasks:**\n${tasksText}`,
                  timestamp: new Date()
                }
              ]);
            }
            setLastAction("Call status displayed");
          } catch (err) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Call status error: ${err.message}`, timestamp: new Date() }
            ]);
          }
          return;
        }

        if (subCommand === "end") {
          try {
            const { getVapiService } = await import("./services/vapi-service.js");
            const vapi = getVapiService();
            await vapi.endCall();
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Call ended.", timestamp: new Date() }
            ]);
            setLastAction("Call ended");
          } catch (err) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `End call error: ${err.message}`, timestamp: new Date() }
            ]);
          }
          return;
        }

        // Default: /call or /call start — initiate call
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Initiating phone call via Vapi...", timestamp: new Date() }
        ]);

        try {
          const { getVapiService } = await import("./services/vapi-service.js");
          const vapi = getVapiService();

          vapi.removeAllListeners();

          vapi.on("tunnel-ready", ({ url }) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Tunnel ready: ${url}`, timestamp: new Date() }
            ]);
          });

          vapi.on("call-started", ({ callId }) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Phone is ringing... (call ${callId})`, timestamp: new Date() }
            ]);
          });

          vapi.on("transcript", ({ role, text }) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `[${role}]: ${text}`, timestamp: new Date() }
            ]);
          });

          vapi.on("call-ended", ({ reason }) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Call ended (${reason}).`, timestamp: new Date() }
            ]);
          });

          vapi.on("call-failed", ({ error }) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Call failed: ${error}`, timestamp: new Date() }
            ]);
          });

          vapi.on("task-completed", ({ taskId, result }) => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Background task ${taskId} completed: ${result}`, timestamp: new Date() }
            ]);
          });

          await vapi.initialize();
          await vapi.callUser();
          setLastAction("Vapi call initiated");
        } catch (err) {
          const msg = err.message.includes("not configured")
            ? `Vapi not configured.\n\n**Setup:**\n1. Create Firestore doc \`config/config_vapi\` with:\n   - privateKey: vapi_sk_...\n   - publicKey: vapi_pk_...\n   - phoneNumberId: phn_...\n   - userPhoneNumber: +1XXXXXXXXXX\n2. Install ngrok: https://ngrok.com/download\n3. Install SDK: npm install @vapi-ai/server-sdk\n4. Start server: npm run server`
            : `Call failed: ${err.message}`;
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: msg, timestamp: new Date() }
          ]);
          setLastAction("Call failed");
        }
        return;
      }

      // /thesis - View current thesis, beliefs, and projects
      if (resolved === "/thesis" || resolved.startsWith("/thesis ")) {
        const thinkingEngine = thinkingEngineRef.current || getThinkingEngine();
        const subCommand = resolved.split(" ")[1];

        if (subCommand === "trigger" || subCommand === "run") {
          // Manually trigger a thinking cycle
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Triggering thinking cycle...", timestamp: new Date() }
          ]);
          thinkingEngine.triggerCycle().then(() => {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Thinking cycle complete. Run /thesis to see updates.", timestamp: new Date() }
            ]);
          });
          setLastAction("Thinking cycle triggered");
          return;
        }

        if (subCommand === "beliefs") {
          // Show core beliefs
          const beliefs = thinkingEngine.getBeliefs();
          if (beliefs.length === 0) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "No core beliefs defined yet. Run `/thesis trigger` to have the engine infer them from your profile.", timestamp: new Date() }
            ]);
          } else {
            const beliefsText = beliefs.map((b, i) =>
              `${i + 1}. **${b.name}**\n   ${b.description}`
            ).join("\n\n");
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `## Core Beliefs (Epics)\n\nThese are your fundamental, ongoing priorities:\n\n${beliefsText}\n\nUse \`/thesis add-belief <name> | <description>\` to add one.`, timestamp: new Date() }
            ]);
          }
          setLastAction("Viewed beliefs");
          return;
        }

        if (subCommand === "add-belief") {
          // Add a core belief manually
          const rest = resolved.slice("/thesis add-belief ".length);
          const parts = rest.split("|").map(s => s.trim());
          if (parts.length < 2) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Usage: `/thesis add-belief <name> | <description>`\n\nExample: `/thesis add-belief Build Wealth | Grow net worth through smart investments and multiple income streams`", timestamp: new Date() }
            ]);
            return;
          }
          const belief = thinkingEngine.addBelief(parts[0], parts[1]);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Added core belief: **${belief.name}**`, timestamp: new Date() }
          ]);
          setLastAction("Added belief");
          return;
        }

        if (subCommand === "projects") {
          // Show projects
          const projects = thinkingEngine.getProjects();
          if (projects.length === 0) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "No projects yet. The thinking engine will create them as needed.", timestamp: new Date() }
            ]);
          } else {
            const projectsText = projects.map(p =>
              `- **${p.name}** (${p.status}): ${p.description.slice(0, 100)}...`
            ).join("\n");
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `## Projects\n\n${projectsText}`, timestamp: new Date() }
            ]);
          }
          setLastAction("Viewed projects");
          return;
        }

        // Default: show current thesis
        const thesis = thinkingEngine.getThesis();
        const insights = thinkingEngine.getInsights();
        const status = thinkingEngine.getStatus();
        const beliefs = thinkingEngine.getBeliefs();

        let content = "";
        if (thesis) {
          content = thesis;
        } else {
          content = "## Thesis\n\nNo thesis generated yet. The thinking engine will analyze your data and build one.\n";
        }

        content += `\n---\n**Engine Status:** ${status.isRunning ? "Running" : "Stopped"} | Cycles: ${status.cycleCount}`;
        if (beliefs.length > 0) {
          content += ` | Beliefs: ${beliefs.length}`;
        }
        if (status.backlogStats) {
          content += ` | Backlog: ${status.backlogStats.total} items (${status.backlogStats.highImpact} ready)`;
        }
        content += `\n\nCommands: \`/thesis beliefs\` · \`/thesis projects\` · \`/thesis trigger\` · \`/backlog\``;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content, timestamp: new Date() }
        ]);
        setLastAction("Viewed thesis");
        return;
      }

      // /backlog - View and manage the backlog of ideas
      // /knowledge - Show AI knowledge depth breakdown across all domains
      if (resolved === "/knowledge" || resolved === "/knowledge breakdown") {
        const dc = calculateDataCompleteness();
        const pct = dc.percentage;
        const barColor = pct >= 75 ? "green" : pct >= 40 ? "yellow" : "red";

        const domainLabels = {
          profile: "Profile",
          goals: "Goals",
          beliefs: "Beliefs",
          financials: "Financials",
          health: "Health",
          markets: "Markets",
          disaster: "Disaster",
          contacts: "Contacts",
          projects: "Projects",
          backlog: "Backlog",
          lifeScores: "Life Scores",
          thesis: "Thesis",
          research: "Research"
        };

        let content = `## Knowledge Depth — ${pct}%\n\n`;
        const overallFilled = Math.round((pct / 100) * 20);
        const overallEmpty = 20 - overallFilled;
        content += `${"█".repeat(overallFilled)}${"░".repeat(overallEmpty)} **${pct}%**\n\n`;
        content += `| Domain | Score | Depth |\n|--------|-------|-------|\n`;

        for (const [key, score] of Object.entries(dc.scores)) {
          const label = domainLabels[key] || key;
          const filled = score;
          const empty = 10 - score;
          const bar = "█".repeat(filled) + "░".repeat(empty);
          content += `| ${label} | ${score}/10 | ${bar} |\n`;
        }

        content += `\n**Total:** ${dc.total}/${dc.maxPossible} points across ${Object.keys(dc.scores).length} domains\n`;
        content += `\nThe AI is always learning. 95% is peak — there is always more to discover.`;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content, timestamp: new Date() }
        ]);
        setLastAction("Knowledge breakdown");
        return;
      }

      if (resolved === "/backlog" || resolved.startsWith("/backlog ")) {
        const thinkingEngine = thinkingEngineRef.current || getThinkingEngine();
        const parts = resolved.split(" ").filter(Boolean);
        const subCommand = parts[1];

        if (subCommand === "add") {
          // /backlog add <title> | <description>
          const rest = resolved.slice("/backlog add ".length);
          const itemParts = rest.split("|").map(s => s.trim());
          if (itemParts.length < 1 || !itemParts[0]) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Usage: `/backlog add <title>` or `/backlog add <title> | <description>`\n\nExample: `/backlog add Research AMD earnings call | Analyze Q4 earnings for investment decision`", timestamp: new Date() }
            ]);
            return;
          }
          const backlog = thinkingEngine.addBacklogItem({
            title: itemParts[0],
            description: itemParts[1] || itemParts[0],
            source: "user-desire",
            impactScore: 50,
            urgency: "medium"
          });
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Added to backlog: **${itemParts[0]}**\n\nBacklog now has ${backlog.items.length} items. Items with impact score >= 75 will graduate to goals.`, timestamp: new Date() }
          ]);
          setLastAction("Added backlog item");
          return;
        }

        if (subCommand === "boost") {
          // /backlog boost <id> <score>
          const id = parts[2];
          const newScore = parseInt(parts[3], 10);
          if (!id || isNaN(newScore)) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Usage: `/backlog boost <id> <score>`\n\nExample: `/backlog boost backlog_1706000000000_abc1 85`", timestamp: new Date() }
            ]);
            return;
          }
          const item = thinkingEngine.boostBacklogItem(id, newScore);
          if (item) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Boosted **${item.title}** to impact score ${newScore}${newScore >= 75 ? " - Ready to graduate!" : ""}`, timestamp: new Date() }
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Backlog item not found: ${id}`, timestamp: new Date() }
            ]);
          }
          setLastAction("Boosted backlog item");
          return;
        }

        if (subCommand === "dismiss") {
          // /backlog dismiss <id>
          const id = parts[2];
          if (!id) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Usage: `/backlog dismiss <id>`", timestamp: new Date() }
            ]);
            return;
          }
          const removed = thinkingEngine.dismissBacklogItem(id, "Manual dismissal");
          if (removed) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Dismissed: **${removed.title}**`, timestamp: new Date() }
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Backlog item not found: ${id}`, timestamp: new Date() }
            ]);
          }
          setLastAction("Dismissed backlog item");
          return;
        }

        // Default: show backlog overview
        const backlog = thinkingEngine.getBacklog();
        const status = thinkingEngine.getStatus();

        let content = "## Backlog\n\n";
        content += `The backlog contains ideas generated from your beliefs, role models, and desires.\n`;
        content += `Items with impact score >= 75 graduate to goals.\n\n`;
        content += `**Stats:** ${backlog.items.length} items | ${status.backlogStats?.highImpact || 0} ready to graduate | ${backlog.stats.totalGraduated} graduated\n\n`;

        if (backlog.items.length === 0) {
          content += "_Backlog is empty. Run `/thesis trigger` to generate ideas._\n";
        } else {
          // Show top 15 items by impact score
          const sortedItems = [...backlog.items]
            .sort((a, b) => b.impactScore - a.impactScore)
            .slice(0, 15);

          content += "### Top Items by Impact\n\n";
          content += "| Score | Title | Source | Urgency |\n";
          content += "|-------|-------|--------|----------|\n";
          for (const item of sortedItems) {
            const scoreEmoji = item.impactScore >= 75 ? "🔥" : (item.impactScore >= 50 ? "📈" : "📝");
            content += `| ${scoreEmoji} ${item.impactScore} | ${item.title.slice(0, 40)}${item.title.length > 40 ? "..." : ""} | ${item.source} | ${item.urgency} |\n`;
          }

          if (backlog.items.length > 15) {
            content += `\n_...and ${backlog.items.length - 15} more items_\n`;
          }
        }

        content += `\n---\n**Commands:** \`/backlog add <title>\` · \`/backlog boost <id> <score>\` · \`/backlog dismiss <id>\``;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content, timestamp: new Date() }
        ]);
        setLastAction("Viewed backlog");
        return;
      }

      // /engine - Claude Engine control (replaces /idle)
      if (resolved === "/engine" || resolved.startsWith("/engine ") || resolved === "/idle" || resolved.startsWith("/idle ")) {
        const claudeEngine = getClaudeEngine();
        const status = claudeEngine.getStatus();

        const isForce = resolved === "/engine start!" || resolved === "/idle force";
        const isStart = resolved === "/engine start" || resolved === "/idle on" || resolved === "/idle work" || isForce;

        if (isStart) {
          if (status.isRunning) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Claude Engine is already running. Output is streaming to ENGINE panel.", timestamp: new Date() }
            ]);
            return;
          }

          // If in cooldown and not forcing, show message with override hint
          if (status.cooldown && !isForce) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Engine ran ${status.lastRunMinutesAgo} min ago — cooldown has ${status.cooldownRemainingMin} min left.\n\nUse \`/engine start!\` to force start now.`, timestamp: new Date() }
            ]);
            return;
          }

          // Force past cooldown if needed
          if (isForce && status.cooldown) {
            claudeEngine.lastRunCompletedAt = null;
          }

          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Starting Claude Engine... Watch the ENGINE panel for output.", timestamp: new Date() }
          ]);

          claudeEngine.start().then((result) => {
            if (!result.success) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Could not start: ${result.reason}`, timestamp: new Date() }
              ]);
            }
          });
          setLastAction("Started Claude Engine");
          return;
        }

        if (resolved === "/engine stop" || resolved === "/idle off") {
          claudeEngine.stop();
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "Claude Engine **stopped**.", timestamp: new Date() }
          ]);
          setLastAction("Stopped Claude Engine");
          return;
        }

        // Default: show status with how-to
        let content = `## Claude Engine\n\n`;
        content += `**Status:** ${status.isRunning ? "Running" : "Stopped"}\n`;
        if (status.lastRunMinutesAgo !== null) {
          content += `**Last ran:** ${status.lastRunMinutesAgo} min ago\n`;
        } else {
          content += `**Last ran:** never\n`;
        }
        if (status.cooldown) {
          content += `**Cooldown:** ${status.cooldownRemainingMin} min remaining\n`;
        }
        content += `**Runs completed:** ${status.workCount}\n`;
        content += `\n### Commands\n`;
        content += `- \`/engine start\` — Start the engine\n`;
        content += `- \`/engine start!\` — Force start (skip cooldown)\n`;
        content += `- \`/engine stop\` — Stop the engine\n`;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content, timestamp: new Date() }
        ]);
        setLastAction("Viewed Claude Engine status");
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

      // /goals clear - Clear goals and archive projects
      if (resolved === "/goals clear") {
        setIsProcessing(true);
        engineState.setStatus("working");
        setLastAction("Clearing goals...");

        try {
          const goalManager = getGoalManager();
          const tracker = getGoalTracker();

          // Archive all current projects
          const allGoals = tracker.getAll();
          let archivedCount = 0;
          for (const goal of allGoals) {
            if (goal.status !== "completed" && goal.status !== "archived") {
              tracker.updateStatus(goal.id, "archived");
              archivedCount++;
            }
          }

          // Clear active goal
          if (goalManager.currentGoal) {
            goalManager.currentGoal = null;
            goalManager.currentWorkPlan = null;
            goalManager.saveActiveGoal();
          }

          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Goals cleared!\n\nArchived ${archivedCount} goals/projects.\n\nTell me what you'd like to focus on next, and I'll create new goals for you.\n\nOr type /goals reset to have me analyze your data and suggest goals.`,
            timestamp: new Date()
          }]);
          setLastAction(`Cleared ${archivedCount} goals`);
        } catch (error) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error clearing goals: ${error.message}`,
            timestamp: new Date()
          }]);
        }

        setIsProcessing(false);
        engineState.setStatus("idle");
        return;
      }

      // /goals reset - Delete projects and regenerate goals based on user data
      if (resolved === "/goals reset") {
        setIsProcessing(true);
        engineState.setStatus("working");
        setLastAction("Resetting goals...");

        try {
          const goalManager = getGoalManager();
          const tracker = getGoalTracker();
          const { generateGoalsFromContext } = await import("./services/goal-generator.js");

          // Delete all current goals (not just archive)
          const allGoals = tracker.getAll();
          let deletedCount = 0;
          for (const goal of allGoals) {
            tracker.deleteGoal(goal.id);
            deletedCount++;
          }

          // Clear active goal
          goalManager.currentGoal = null;
          goalManager.currentWorkPlan = null;
          goalManager.saveActiveGoal();

          // Generate new goals from user context
          const newGoals = await generateGoalsFromContext({
            portfolio: portfolioData,
            health: ouraHealth,
            profile: linkedInProfile
          });

          let content = "";
          if (newGoals && newGoals.length > 0) {
            // Save new goals
            for (const goal of newGoals) {
              tracker.addGoal(goal);
            }
            content = `Goals reset!\n\nDeleted ${deletedCount} old goals.\nCreated ${newGoals.length} new goals based on your data:\n\n`;
            newGoals.forEach((g, i) => {
              content += `${i + 1}. ${g.title}\n`;
            });
          } else {
            content = `Goals reset!\n\nDeleted ${deletedCount} old goals.\n\n─────────────────────\n\n💡 Help me help you\n\nTell me what you need and I'll do the work.\n\n─────────────────────`;
          }

          setMessages((prev) => [...prev, {
            role: "assistant",
            content,
            timestamp: new Date()
          }]);
          setLastAction(`Reset: ${deletedCount} deleted, ${newGoals?.length || 0} created`);
        } catch (error) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error resetting goals: ${error.message}`,
            timestamp: new Date()
          }]);
        }

        setIsProcessing(false);
        engineState.setStatus("idle");
        return;
      }

      // /goals update - Re-evaluate and update goals based on recent conversation
      if (resolved === "/goals update") {
        setIsProcessing(true);
        engineState.setStatus("working");
        setLastAction("Updating goals...");

        try {
          const goalManager = getGoalManager();
          const tracker = getGoalTracker();
          const aiBrain = getAIBrain();
          const { generateGoalsFromInput } = await import("./services/goal-generator.js");

          // Get recent conversation context
          const recentMessages = messages.slice(-10);
          const conversationContext = recentMessages
            .map(m => `${m.role === "user" ? "User" : "AI"}: ${m.content?.slice(0, 200)}`)
            .join("\n");

          // Generate goals from recent conversation
          const result = await generateGoalsFromInput(conversationContext);

          if (result.success && result.goals && result.goals.length > 0) {
            // Archive old goals first
            const allGoals = tracker.getAll();
            for (const goal of allGoals) {
              if (goal.status === "active" || goal.status === "pending") {
                tracker.updateStatus(goal.id, "archived");
              }
            }

            // Add new goals
            for (const goal of result.goals) {
              tracker.addGoal(goal);
            }

            let content = `Goals updated based on our conversation!\n\n`;
            content += `Created ${result.goals.length} new goals:\n\n`;
            result.goals.forEach((g, i) => {
              content += `${i + 1}. ${g.title}\n   ${g.rationale || ""}\n\n`;
            });

            setMessages((prev) => [...prev, {
              role: "assistant",
              content,
              timestamp: new Date()
            }]);
            setLastAction(`Updated to ${result.goals.length} new goals`);
          } else {
            setMessages((prev) => [...prev, {
              role: "assistant",
              content: "I couldn't identify specific goals from our recent conversation. Try telling me what you'd like to achieve, and I'll create goals for you.\n\nExample: \"I want to improve my fitness and grow my investment portfolio\"",
              timestamp: new Date()
            }]);
          }
        } catch (error) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error updating goals: ${error.message}`,
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

      // /run stock sweep - Full 800+ ticker sweep (always force-restarts from scratch)
      if (resolved === "/run stock sweep") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Force-starting full stock sweep — recalculating all tickers from scratch...", timestamp: new Date() }
        ]);
        try {
          const result = await triggerFullScan(true);
          if (result.success !== false) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Sweep ${result.force ? "restarted" : "started"}. Evaluating all ${TICKER_UNIVERSE.length || "800+"} tickers in background.`, timestamp: new Date() }
            ]);
            setTickerStatus(prev => ({ ...prev, fullScanRunning: true }));
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Sweep failed: ${result.error || "Unknown error"}`, timestamp: new Date() }
            ]);
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Sweep error: ${error.message}`, timestamp: new Date() }
          ]);
        }
        setLastAction("Full sweep triggered");
        return;
      }

      // /run stock refresh - Refresh core tickers
      if (resolved === "/run stock refresh") {
        setTickerStatus(prev => ({ ...prev, refreshing: true, error: null }));
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Refreshing stock tickers...", timestamp: new Date() }
        ]);
        try {
          await refreshTickers();
          const result = await fetchYahooTickers();
          if (result.success && result.tickers.length > 0) {
            setTickers(result.tickers);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `Refreshed ${result.tickers.length} tickers.`, timestamp: new Date() }
            ]);
            setTickerStatus(prev => ({
              ...prev,
              refreshing: false,
              lastRefresh: new Date().toISOString(),
              scanCount: result.tickers.length,
            }));
          } else {
            setTickerStatus(prev => ({ ...prev, refreshing: false }));
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Refresh completed but no ticker data returned.", timestamp: new Date() }
            ]);
          }
        } catch (error) {
          setTickerStatus(prev => ({ ...prev, refreshing: false, error: error.message }));
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Refresh error: ${error.message}`, timestamp: new Date() }
          ]);
        }
        setLastAction("Tickers refreshed");
        return;
      }

      // /update stock tickers - Display top scored tickers
      if (resolved === "/update stock tickers") {
        try {
          const result = await fetchYahooTickers();
          if (result.success && result.tickers.length > 0) {
            setTickers(result.tickers);
            const sorted = [...result.tickers].sort((a, b) => (b.score || 0) - (a.score || 0));
            const top = sorted.slice(0, 20);
            let content = "TOP TICKERS BY SCORE\n\n";
            content += "Symbol     Score  Change%    MACD  Trend     Scored\n";
            content += "──────────────────────────────────────────────────────\n";
            top.forEach(t => {
              const sym = (t.symbol || "").padEnd(10);
              const score = ((t.score || 0).toFixed(1)).padStart(5);
              const change = ((t.changePercent || 0).toFixed(2) + "%").padStart(8);
              const macdVal = t.macdValue != null ? t.macdValue.toFixed(2).padStart(7) : "    —  ";
              const trend = (t.macdTrend || (t.macd?.trend) || "—").padEnd(10);
              const scoredDate = t.scoredAt ? new Date(t.scoredAt) : (t.lastEvaluated ? new Date(t.lastEvaluated) : null);
              const scored = scoredDate ? scoredDate.toLocaleDateString() + " " + scoredDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }) : "—";
              content += `${sym} ${score} ${change} ${macdVal}  ${trend} ${scored}\n`;
            });
            content += `\nTotal: ${result.tickers.length} tickers`;
            content += ` | History: ${top[0]?.historyDays || "?"}d`;
            if (result.lastUpdate) {
              content += ` | Last refresh: ${new Date(result.lastUpdate).toLocaleString()}`;
            }
            if (result.lastFullScan) {
              content += `\nLast full scan: ${new Date(result.lastFullScan).toLocaleString()}`;
            }
            if (result.fullScanRunning) {
              content += " | Full scan running...";
            }
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content, timestamp: new Date() }
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "No ticker data available. Run /refresh or /sweep first.", timestamp: new Date() }
            ]);
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Tickers error: ${error.message}`, timestamp: new Date() }
          ]);
        }
        setLastAction("Tickers displayed");
        return;
      }

      // /top stocks - Refresh and show top 10 tickers by score
      if (resolved === "/top stocks") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Refreshing stock data...", timestamp: new Date() }
        ]);
        try {
          // Refresh first so user sees latest data
          await refreshTickers();
          const result = await fetchYahooTickers();
          if (result.success && result.tickers.length > 0) {
            setTickers(result.tickers);
            const sorted = [...result.tickers].sort((a, b) => (b.score || 0) - (a.score || 0));
            const top = sorted.slice(0, 10);
            let content = "TOP 10 STOCKS\n\n";
            content += "#   Symbol     Name                    Score  MACDsc  Signal       Price     Change%\n";
            content += "──────────────────────────────────────────────────────────────────────────────\n";
            top.forEach((t, i) => {
              const rank = String(i + 1).padEnd(3);
              const sym = (t.symbol || "").padEnd(10);
              const name = (t.name || t.shortName || "").substring(0, 23).padEnd(23);
              const score = ((t.score || 0).toFixed(1)).padStart(5);
              const macdRaw = -calculateMACDScore(t.macd);
              const macdScore = Math.max(-2.5, Math.min(2.5, macdRaw));
              const macdScoreStr = (macdScore >= 0 ? "+" : "") + macdScore.toFixed(2);
              const macdPad = macdScoreStr.padStart(6);
              const signal = (t.signal || t.macdTrend || "—").padEnd(12);
              const price = t.price ? ("$" + t.price.toFixed(2)).padStart(9) : "      N/A";
              const change = ((t.changePercent || 0) >= 0 ? "+" : "") + (t.changePercent || 0).toFixed(2) + "%";
              content += `${rank} ${sym} ${name} ${score}  ${macdPad}  ${signal} ${price}  ${change}\n`;
            });
            content += `\nLast refreshed: ${new Date().toLocaleString()}`;
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content, timestamp: new Date() }
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "No ticker data available. Run /run stock sweep first.", timestamp: new Date() }
            ]);
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Top stocks error: ${error.message}`, timestamp: new Date() }
          ]);
        }
        setLastAction("Top stocks shown");
        return;
      }

      // /top stocks detail - Show top 5 with full score breakdown
      if (resolved === "/top stocks detail" || resolved.startsWith("/top stocks detail ")) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Computing detailed score breakdown...", timestamp: new Date() }
        ]);
        try {
          await refreshTickers();
          const result = await fetchYahooTickers();
          if (result.success && result.tickers.length > 0) {
            setTickers(result.tickers);
            const sorted = [...result.tickers].sort((a, b) => (b.score || 0) - (a.score || 0));
            const top = sorted.slice(0, 5);

            let content = "═══════════════════════════════════════════════════════════════════════════════\n";
            content += "                         TOP 5 STOCKS — DETAILED BREAKDOWN\n";
            content += "═══════════════════════════════════════════════════════════════════════════════\n\n";

            // Header row
            content += "Ticker   Score  Signal    MACD  MACDsc  Vol σ   Psych   PricePos   RSI    Chg%\n";
            content += "───────────────────────────────────────────────────────────────────────────────\n";

            top.forEach((t, i) => {
              const sym = (t.symbol || "").padEnd(8);
              const score = ((t.score || 0).toFixed(1)).padStart(5);
              const signal = (t.macdTrend || t.signal || "—").substring(0, 8).padEnd(9);

              // MACD histogram
              const macdHist = t.macd?.histogram != null ? (t.macd.histogram >= 0 ? "+" : "") + t.macd.histogram.toFixed(2) : "  N/A";
              const macdStr = macdHist.padStart(6);

              // MACD score (used in score-engine)
              const macdScore = calculateMACDScore(t.macd);
              const macdScoreStr = (macdScore >= 0 ? "+" : "") + macdScore.toFixed(2);
              const macdScorePad = macdScoreStr.padStart(7);

              // Volume sigma
              const volSigma = t.volumeSigma != null ? t.volumeSigma.toFixed(2) : "N/A";
              const volStr = volSigma.padStart(7);

              // Psychological adjustment (computed from changePercent)
              const pct = t.changePercent || 0;
              const absPct = Math.abs(pct);
              let psych = 0;
              if (absPct <= 15) {
                psych = (absPct / 2) * 0.5;
                psych = pct > 0 ? -psych : psych;
              }
              const psychStr = (psych >= 0 ? "+" : "") + psych.toFixed(2);
              const psychPad = psychStr.padStart(7);

              // Price Position Score (60-day range)
              let pricePos = 0;
              let pricePosStr = "   N/A";
              if (t.price60dMin != null && t.price60dMax != null && t.price != null) {
                const range = t.price60dMax - t.price60dMin;
                if (range > 0) {
                  const position = (t.price - t.price60dMin) / range;
                  if (position <= 0.1) pricePos = 1.5;
                  else if (position >= 0.9) pricePos = -1.5;
                  else pricePos = (1.0 - ((position - 0.1) / 0.8) * 2.0) * 1.5;
                  pricePosStr = (pricePos >= 0 ? "+" : "") + pricePos.toFixed(2);
                }
              } else if (t.pricePositionScore != null) {
                pricePos = t.pricePositionScore;
                pricePosStr = (pricePos >= 0 ? "+" : "") + pricePos.toFixed(2);
              }
              const pricePosStrPad = pricePosStr.padStart(8);

              // RSI
              const rsiStr = t.rsi != null ? String(t.rsi).padStart(5) : "  N/A";

              // Change %
              const change = ((t.changePercent || 0) >= 0 ? "+" : "") + (t.changePercent || 0).toFixed(2) + "%";
              const changeStr = change.padStart(7);

              content += `${sym} ${score}  ${signal} ${macdStr} ${macdScorePad} ${volStr} ${psychPad} ${pricePosStrPad} ${rsiStr} ${changeStr}\n`;
            });

            content += "───────────────────────────────────────────────────────────────────────────────\n\n";

            // Detailed breakdown for each
            content += "SCORE COMPONENTS:\n";
            content += "─────────────────\n";
            top.forEach((t, i) => {
              const pct = t.changePercent || 0;
              const absPct = Math.abs(pct);
              let psych = 0;
              if (absPct <= 15) {
                psych = (absPct / 2) * 0.5;
                psych = pct > 0 ? -psych : psych;
              }

              // Estimate MACD contribution using slope when available
              let macdAdj = 0;
              let macdMethod = "value";
              if (t.macd?.histogramArray && t.macd.histogramArray.length >= 6) {
                // Slope-based: direction of histogram matters, not value
                const ha = t.macd.histogramArray;
                const pts = [];
                ha.forEach((v, idx) => { if (v != null) pts.push({ x: 5 - idx, y: v }); });
                if (pts.length >= 3) {
                  const n = pts.length;
                  const xM = pts.reduce((s, p) => s + p.x, 0) / n;
                  const yM = pts.reduce((s, p) => s + p.y, 0) / n;
                  let num = 0, den = 0;
                  for (const p of pts) { num += (p.x - xM) * (p.y - yM); den += (p.x - xM) ** 2; }
                  if (den !== 0) {
                    const slope = -(num / den);
                    const dir = Math.abs(slope) > 0.01 ? (slope > 0 ? 1 : -1) : 0;
                    const mag = Math.min(1, Math.abs(slope) * 10);
                    let raw = dir * mag;
                    // Position-in-range factor
                    if (t.macd.macdLine != null && t.macd.macdLineMin != null && t.macd.macdLineMax != null) {
                      const range = t.macd.macdLineMax - t.macd.macdLineMin;
                      if (range > 0) {
                        const pos = (t.macd.macdLine - t.macd.macdLineMin) / range;
                        const posFactor = 1 - Math.abs(pos - 0.5) * 1.2;
                        raw *= Math.max(0.3, Math.min(1.0, posFactor));
                      }
                    }
                    macdAdj = Math.max(-2.5, Math.min(2.5, raw * 2.5));
                    macdMethod = "slope";
                  }
                }
              }
              if (macdMethod === "value" && t.macd?.histogram != null) {
                // Fallback: simple histogram value (legacy)
                const hist = t.macd.histogram;
                if (hist > 0.5) macdAdj = Math.min(1, hist / 2) * 1.5;
                else if (hist < -0.5) macdAdj = Math.max(-1, hist / 2) * 1.5;
                else macdAdj = (hist / 0.5) * 0.5 * 1.5;
              }

              // Volume score estimate
              const sigma = t.volumeSigma || 1;
              let volScore = 2.5 * ((sigma - 1) / 10) - 1;
              volScore = pct < -0.05 ? -Math.abs(volScore) : Math.abs(volScore);
              volScore = Math.max(-1.5, Math.min(1.5, volScore));

              // Price Position Score for detailed view
              let detailPricePos = 0;
              let pricePosLabel = "N/A";
              if (t.price60dMin != null && t.price60dMax != null && t.price != null) {
                const range = t.price60dMax - t.price60dMin;
                if (range > 0) {
                  const position = (t.price - t.price60dMin) / range;
                  if (position <= 0.1) detailPricePos = 1.5;
                  else if (position >= 0.9) detailPricePos = -1.5;
                  else detailPricePos = (1.0 - ((position - 0.1) / 0.8) * 2.0) * 1.5;
                  const pctInRange = (position * 100).toFixed(0);
                  pricePosLabel = `${pctInRange}% of 60d range`;
                }
              } else if (t.pricePositionScore != null) {
                detailPricePos = t.pricePositionScore;
                pricePosLabel = "from cache";
              }

              content += `\n${i + 1}. ${t.symbol} (${t.name?.substring(0, 25) || ""})\n`;
              const macdScore = calculateMACDScore(t.macd);
              content += `   MACD: ${t.macd?.macd?.toFixed(2) || "N/A"} | Signal: ${t.macd?.signal?.toFixed(2) || "N/A"} | Hist: ${t.macd?.histogram?.toFixed(2) || "N/A"} | Score: ${macdScore >= 0 ? "+" : ""}${macdScore.toFixed(2)}\n`;
              content += `   MACD Adj (legacy): ${macdAdj >= 0 ? "+" : ""}${macdAdj.toFixed(2)} (${macdMethod})\n`;
              content += `   RSI: ${t.rsi || "N/A"} ${t.rsi && t.rsi < 30 ? "(OVERSOLD)" : t.rsi && t.rsi > 70 ? "(OVERBOUGHT)" : ""}\n`;
              content += `   Volume: ${sigma.toFixed(2)}σ → Score: ${volScore >= 0 ? "+" : ""}${volScore.toFixed(2)}\n`;
              content += `   PricePos: ${pricePosLabel} → Score: ${detailPricePos >= 0 ? "+" : ""}${detailPricePos.toFixed(2)} (×1.25 = ${(detailPricePos * 1.25) >= 0 ? "+" : ""}${(detailPricePos * 1.25).toFixed(2)})\n`;
              content += `   Psych (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%): ${psych >= 0 ? "+" : ""}${psych.toFixed(2)}\n`;
            });

            content += `\n───────────────────────────────────────────────────────────────────────────────\n`;
            content += `Last refreshed: ${new Date().toLocaleString()}\n`;
            content += `\nLEGEND: MACD [-2.5,+2.5] | Vol [-1.5,+1.5] | PricePos [-1.5,+1.5]×1.25 | Psych [-3.75,+3.75]`;

            setMessages((prev) => [
              ...prev,
              { role: "assistant", content, timestamp: new Date() }
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "No ticker data available. Run /run stock sweep first.", timestamp: new Date() }
            ]);
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Top stocks detail error: ${error.message}`, timestamp: new Date() }
          ]);
        }
        setLastAction("Top stocks detail shown");
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

      // /cron - Show all scheduled cron jobs
      if (resolved === "/cron") {
        const cronManager = getCronManager();
        const allJobs = cronManager.getAllJobs();

        // Sort: daily (by time) → weekly (by day) → monthly
        const freqOrder = { daily: 0, weekly: 1, monthly: 2, once: 3, custom: 4 };
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const sorted = [...allJobs].sort((a, b) => {
          const fa = freqOrder[a.frequency] ?? 5;
          const fb = freqOrder[b.frequency] ?? 5;
          if (fa !== fb) return fa - fb;
          return (a.time || "00:00").localeCompare(b.time || "00:00");
        });

        const dailyCount = sorted.filter(j => j.frequency === "daily").length;
        const weeklyCount = sorted.filter(j => j.frequency === "weekly").length;
        const monthlyCount = sorted.filter(j => j.frequency === "monthly").length;
        const parts = [];
        if (dailyCount) parts.push(`${dailyCount} daily`);
        if (weeklyCount) parts.push(`${weeklyCount} weekly`);
        if (monthlyCount) parts.push(`${monthlyCount} monthly`);

        const header = `CRON JOBS SCHEDULE                                    ${sorted.length} jobs | ${parts.join(", ")}`;
        const sep = "─".repeat(78);

        const fmtDate = (iso) => {
          if (!iso) return "Never";
          const d = new Date(iso);
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
                 d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        };

        let content = `${header}\n${sep}\n`;
        content += ` #  JOB                    FREQUENCY    SCHEDULE             LAST RUN             NEXT RUN             RUNS  STATUS\n`;
        content += `${sep}\n`;

        sorted.forEach((job, i) => {
          const num = String(i + 1).padStart(2, " ");
          const name = (job.name || job.id).padEnd(22, " ").slice(0, 22);
          const freq = (job.frequency || "daily").charAt(0).toUpperCase() + (job.frequency || "daily").slice(1);
          const freqCol = freq.padEnd(12, " ").slice(0, 12);

          let schedule = "";
          if (job.frequency === "daily") {
            schedule = job.weekdaysOnly ? `Weekdays ${job.time || "09:00"}` : `Every day ${job.time || "09:00"}`;
          } else if (job.frequency === "weekly") {
            const day = dayNames[job.dayOfWeek ?? 1] || "Monday";
            schedule = `${day} ${job.time || "09:00"}`;
          } else if (job.frequency === "monthly") {
            const d = job.dayOfMonth ?? 1;
            const suffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
            schedule = `${d}${suffix} at ${job.time || "09:00"}`;
          } else {
            schedule = job.time || "—";
          }
          schedule = schedule.padEnd(20, " ").slice(0, 20);

          const lastRun = fmtDate(job.lastRun).padEnd(20, " ").slice(0, 20);
          const nextRun = fmtDate(job.nextRun).padEnd(20, " ").slice(0, 20);
          const runs = String(job.runCount || 0).padStart(4, " ");
          const status = job.enabled ? (job.status === "paused" ? "Paused" : "Active") : "Disabled";

          content += `${num}  ${name} ${freqCol} ${schedule} ${lastRun} ${nextRun} ${runs}  ${status}\n`;
        });

        content += sep;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content, timestamp: new Date() }
        ]);
        setLastAction("Cron jobs");
        return;
      }

      // /linkedin history - Show LinkedIn snapshot timeline
      if (resolved === "/linkedin history") {
        const history = getLinkedInHistory();
        const postsHistory = getLinkedInPostsHistory();

        let content = "LINKEDIN PROFILE HISTORY\n";
        content += "─".repeat(60) + "\n\n";

        if (!history.success) {
          content += "No snapshots captured yet.\n\n";
          content += "Snapshots are captured automatically by the weekly LinkedIn Sync cron job,\n";
          content += "or when you run /linkedin to update your profile.\n";
        } else {
          content += `Tracking since: ${history.firstCapture}\n`;
          content += `Last snapshot: ${history.lastCapture}\n`;
          content += `Total snapshots: ${history.totalSnapshots}\n\n`;

          content += "TIMELINE:\n";
          for (const snap of history.snapshots.slice().reverse()) {
            const changeStr = snap.changeCount > 0
              ? `  ${snap.changeCount} change(s):`
              : "  No changes";
            content += `  ${snap.date}${changeStr}\n`;
            if (snap.changes && snap.changes.length > 0) {
              for (const c of snap.changes) {
                content += `    • ${c.field}: "${c.from || "—"}" → "${c.to || "—"}"\n`;
              }
            }
          }
        }

        content += "\n" + "─".repeat(60) + "\n";
        content += "POSTS TRACKING\n";
        if (!postsHistory.success) {
          content += "  No posts tracked yet.\n";
        } else {
          content += `  Total: ${postsHistory.total} | Original: ${postsHistory.originals} | Reposts: ${postsHistory.reposts}\n`;
          content += `  Last updated: ${postsHistory.lastUpdated}\n`;
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content, timestamp: new Date() }
        ]);
        setLastAction("LinkedIn history");
        return;
      }

      // /linkedin refresh - Force a fresh scrape with improved scraper
      if (resolved === "/linkedin refresh") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Refreshing LinkedIn profile...\nOpening browser to capture fresh data with full-page screenshot.\nThis will scroll through your entire profile to capture all sections.",
            timestamp: new Date()
          }
        ]);
        setLastAction("Refreshing LinkedIn...");

        try {
          // Force a fresh scrape (not headless so user can verify login)
          const result = await extractLinkedInProfile({ headless: false });

          if (result.success) {
            // Update state
            const linkedInData = {
              ...result.profile,
              profileUrl: result.profileUrl,
              connected: true,
              verified: true
            };
            setLinkedInProfile(linkedInData);
            updateFromLinkedIn(linkedInData);

            // Generate updated linkedin.md
            await generateLinkedInMarkdown(result);

            // Capture snapshot
            const snapResult = captureLinkedInSnapshot();

            // Build summary showing what was captured
            const p = result.profile || {};
            const gpt = result.gpt4oAnalysis || {};
            const exp = gpt.experience || [];
            const edu = gpt.education || [];
            const skills = gpt.skills || p.skills || [];

            let summary = `LinkedIn profile refreshed!\n\n`;
            summary += `URL: ${result.profileUrl}\n`;
            summary += `Name: ${p.name || gpt.name || "—"}\n`;
            summary += `Headline: ${p.headline || gpt.headline || "—"}\n`;
            summary += `Location: ${p.location || gpt.location || "—"}\n`;
            summary += `About: ${(p.about || gpt.about || "—").substring(0, 100)}${(p.about || gpt.about || "").length > 100 ? "..." : ""}\n`;
            summary += `\nExperience: ${exp.length} position(s) captured\n`;
            summary += `Education: ${edu.length} school(s) captured\n`;
            summary += `Skills: ${skills.length} skill(s) captured\n`;
            summary += `\nScreenshot: ${result.screenshotPath}\n`;
            summary += snapResult.success ? `\n${snapResult.changes?.length || 0} change(s) detected since last capture.` : "";
            summary += `\n\nView full data with /linkedin data`;

            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: summary, timestamp: new Date() }
            ]);
            setLastAction("LinkedIn refreshed");
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `LinkedIn refresh failed: ${result.error}`, timestamp: new Date() }
            ]);
            setLastAction("LinkedIn refresh failed");
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${error.message}`, timestamp: new Date() }
          ]);
          setLastAction("LinkedIn error");
        }
        return;
      }

      // /linkedin update - Full update via Claude vision browser agent
      if (resolved === "/linkedin update") {
        const hasAnthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
        if (!hasAnthropicKey) {
          const apiResult = await openApiKeyPage("anthropic");
          const url = apiResult?.url || "https://console.anthropic.com/settings/keys";
          const envKey = apiResult?.envKey || "ANTHROPIC_API_KEY";
          const notice = [
            "LinkedIn update requires an Anthropic API key.",
            "We opened the API keys page in your browser.",
            `URL: ${url}`,
            `Paste your key into .env as ${envKey}=your-key`,
            "Restart BACKBONE, then run /linkedin update again."
          ].join("\n");
          setOnboardingOverride({
            stepId: "model",
            notice,
            modelProviderId: "anthropic",
            autoOpenProvider: true
          });
          setShowOnboarding(true);
          setLastAction("LinkedIn update needs Anthropic API key");
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Running full LinkedIn update...\nOpening LinkedIn and capturing multiple screenshots.\nClaude Vision will extract profile data from the images.",
            timestamp: new Date()
          }
        ]);
        setLastAction("LinkedIn update (vision)");

        try {
          const updateEvents = new Set(["task-started", "navigation", "step-analysis", "step-error", "task-failed", "task-completed", "download-complete"]);
          let firstAnalysisShown = false;
          const result = await updateLinkedInViaBrowserAgent({
            onEvent: (evt, data) => {
              if (!updateEvents.has(evt)) return;
              if (evt === "task-started") {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: "Browser agent started. Watching LinkedIn in Chrome...", timestamp: new Date() }
                ]);
                return;
              }
              if (evt === "navigation") {
                const url = data?.url || data?.startUrl || "unknown";
                const looksLinkedIn = typeof url === "string" && url.includes("linkedin.com");
                const note = looksLinkedIn
                  ? `Navigated to ${url}`
                  : `Navigation landed on ${url}. If this isn't LinkedIn, make sure Chrome profile '${process.env.CHROME_PROFILE_DIRECTORY || "Default"}' is logged in, or set CHROME_PROFILE_DIRECTORY.`;
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: note, timestamp: new Date() }
                ]);
                return;
              }
              if (evt === "step-analysis") {
                if (firstAnalysisShown) return;
                firstAnalysisShown = true;
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `Agent analyzing page… next action: ${data?.action || "unknown"}`, timestamp: new Date() }
                ]);
                return;
              }
              if (evt === "download-complete") {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `Downloaded: ${data?.fileName || "file"}`, timestamp: new Date() }
                ]);
                return;
              }
              if (evt === "step-error") {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `Browser agent error: ${data?.error || "unknown error"}`, timestamp: new Date() }
                ]);
                return;
              }
              if (evt === "task-failed") {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `Browser task failed: ${data?.error || "unknown error"}`, timestamp: new Date() }
                ]);
                return;
              }
              if (evt === "task-completed") {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: `Browser task completed: ${data?.message || "done"}`, timestamp: new Date() }
                ]);
              }
            }
          });

          if (result.success) {
            const linkedInData = {
              ...result.profile,
              profileUrl: result.profileUrl,
              connected: true,
              verified: true
            };
            setLinkedInProfile(linkedInData);
            updateFromLinkedIn(linkedInData);

            await generateLinkedInMarkdown(result);
            const snapResult = captureLinkedInSnapshot();

            let summary = `LinkedIn profile updated!\n\n`;
            summary += `Name: ${result.profile?.name || "-"}\n`;
            summary += `Headline: ${result.profile?.headline || "-"}\n`;
            summary += `Location: ${result.profile?.location || "-"}\n`;
            summary += `About: ${(result.profile?.about || "-").substring(0, 100)}${(result.profile?.about || "").length > 100 ? "..." : ""}\n`;
            summary += `\nScreenshots captured: ${result.screenshots?.length || 0}\n`;
            summary += snapResult.success ? `\n${snapResult.changes?.length || 0} change(s) detected since last capture.` : "";
            summary += `\n\nView full data with /linkedin data`;

            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: summary, timestamp: new Date() }
            ]);
            setLastAction("LinkedIn updated");
          } else {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `LinkedIn update failed: ${result.error}`, timestamp: new Date() }
            ]);
            setLastAction("LinkedIn update failed");
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${error.message}`, timestamp: new Date() }
          ]);
          setLastAction("LinkedIn update error");
        }
        return;
      }

      // /disaster - Disaster & Crisis Assessment overlay
      if (resolved === "/disaster" || resolved === "/disaster categories") {
        setShowDisasterOverlay(true);
        setLastAction("Disaster tracker");
        return;
      }

      if (resolved === "/disaster assess" || resolved === "/disaster scan") {
        handleAIMessage(
          `Run a full disaster and crisis assessment. Read the skill file at skills/disaster-assessment.md for the framework. ` +
          `Evaluate all 15 threat domains using web research for current data. Produce a composite threat table with scores 1-10 ` +
          `for each domain, color-coded threat levels, trend direction, and key signals. ` +
          `Then save the results to data/spreadsheets/disaster-assessment.xlsx using appendToSpreadsheet for historical tracking. ` +
          `Give me the full assessment with recommended actions based on the composite score.`
        );
        setLastAction("Running disaster assessment...");
        return;
      }

      // /role model - Explain current role model selection
      if (resolved === "/role model" || resolved === "/rolemodel") {
        const connectedData = {
          firebase: { connected: !!firebaseUserDisplay },
          ouraHealth: { connected: !!ouraHealth?.connected },
          portfolio: { connected: !!(alpacaStatus === "connected" || portfolio?.equity) },
          linkedIn: { connected: !!linkedInProfile?.connected }
        };
        const result = findBestMatch(connectedData);
        const best = result.bestMatch;
        const top3 = result.topMatches;

        let display = `## Your Role Model: ${best.person.name}\n\n`;
        display += `**Domain:** ${result.primaryDomain}\n`;
        display += `**Match Score:** ${best.combined}% (Relatability ${best.relatability}% × 0.4 + Aspirational ${best.aspirational}% × 0.6)\n\n`;
        display += `**Who:** ${best.person.achievements || best.person.name}\n`;
        display += `**Starting Point:** ${best.person.starting_point || "N/A"}\n`;
        display += `**Trajectory:** ${best.person.trajectory || "N/A"}\n`;
        display += `**Why Relatable:** ${best.person.why_relatable || "N/A"}\n`;
        display += `**Why Aspirational:** ${best.person.why_aspirational || "N/A"}\n\n`;
        display += `### How This Was Selected\n`;
        display += `Your primary domain is **${result.primaryDomain}**, determined by your goals and connected services. `;
        display += `${result.totalAnalyzed} candidates in this domain were scored on two axes:\n`;
        display += `- **Relatability (40%):** Age proximity, humble starting point, trait overlap, late-bloomer bonus\n`;
        display += `- **Aspirational (60%):** Achievement level, goal alignment, clear trajectory, success scale\n\n`;
        display += `### Top 3 Matches\n`;
        for (const match of top3) {
          display += `- **${match.person.name}** — ${match.combined}% (rel: ${match.relatability}%, asp: ${match.aspirational}%)\n`;
        }
        display += `\n### How It Changes\n`;
        display += `Your role model updates when your goals change, you connect new services (Alpaca, Oura), or your profile traits shift. `;
        display += `The system re-evaluates on each dashboard render.\n`;

        setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
        setLastAction("Role model info");
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

      // /morning or /brief - Daily Brief (show in conversation + push to all channels)
      // /brief test - Also sends to WhatsApp + push
      if (resolved === "/morning" || resolved === "/briefing" || resolved === "/brief" ||
          resolved === "/morning test" || resolved === "/briefing test" || resolved === "/brief test") {
        const isTest = resolved.includes("test");

        // Show conversation version
        const brief = buildMorningBrief();
        if (brief) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: brief.conversationText,
            timestamp: new Date()
          }]);
        }

        // Generate and push rich daily brief to Firestore (always) + WhatsApp/Push (if test or first today)
        (async () => {
          try {
            if (isTest) {
              // Force send to all channels
              const richBrief = generateDailyBrief();
              if (richBrief) {
                await pushBriefToFirestore(richBrief);
                const { sendBriefToWhatsApp, sendBriefPushNotification } = await import("./services/daily-brief-generator.js");
                const [waResult, pushResult] = await Promise.allSettled([
                  sendBriefToWhatsApp(richBrief),
                  sendBriefPushNotification(richBrief)
                ]);
                const waSent = waResult.status === "fulfilled" && waResult.value?.success;
                const pushSent = pushResult.status === "fulfilled" && pushResult.value?.success;
                setMessages((prev) => [...prev, {
                  role: "assistant",
                  content: `Daily brief pushed to Firestore${waSent ? " + WhatsApp" : ""}${pushSent ? " + Push" : ""}.`,
                  timestamp: new Date()
                }]);
              }
            } else {
              // Just push to Firestore for the web app
              const richBrief = generateDailyBrief();
              if (richBrief) {
                await pushBriefToFirestore(richBrief);
              }
            }
          } catch (e) {
            console.error("[Brief] Delivery error:", e.message);
          }
        })();

        setLastAction("Daily brief");
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

      // /skill - Custom User Skills
      if (resolved === "/skill" || resolved === "/skill list") {
        const loader = getSkillsLoader();
        const userSkills = loader.getUserSkills();
        const systemSkills = loader.getDefaultSkills();
        let display = "## Skills\n\n";
        display += `### System Skills (${systemSkills.length})\n`;
        display += systemSkills.map(s => `- **${s.id}**: ${s.description || s.name}`).join("\n");
        display += "\n\n";
        if (userSkills.length > 0) {
          display += `### Your Custom Skills (${userSkills.length})\n`;
          display += userSkills.map(s => {
            const tag = s.category ? ` [${s.category}]` : "";
            const usage = s.usageCount ? ` (used ${s.usageCount}x)` : "";
            return `- **${s.id}**: ${s.description || s.name}${tag}${usage}`;
          }).join("\n");
        } else {
          display += "### Your Custom Skills\nNo custom skills yet. Use `/skill create <name>` to create one.";
        }
        setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
        setLastAction("Skills list");
        return;
      }

      if (resolved.startsWith("/skill create ")) {
        const skillName = resolved.replace("/skill create ", "").trim();
        if (!skillName) {
          setMessages((prev) => [...prev, { role: "assistant", content: "Usage: /skill create <name>", timestamp: new Date() }]);
          return;
        }
        // Use AI to help generate the skill content
        handleAIMessage(
          `The user wants to create a custom skill called "${skillName}". Help them define it by generating a structured skill file. ` +
          `Use this template format:\n\n` +
          `# ${skillName}\n\n## Category\n<category>\n\n## Tags\n<tags>\n\n## Description\n<description>\n\n## When to Use\n<when to use this skill>\n\n## Process\n<numbered steps>\n\n## Decision Framework\n<decision criteria>\n\n## My Preferences\n<preferences>\n\n## Examples\n<example interactions>\n\n` +
          `Ask the user questions to fill in the details, then once you have enough info, save the skill by writing the file to data/user-skills/${getSkillsLoader()._slugify(skillName)}.md ` +
          `and updating the index at data/user-skills/index.json. Tell the user when the skill is saved.`
        );
        setLastAction("Creating skill...");
        return;
      }

      if (resolved.startsWith("/skill show ")) {
        const skillId = resolved.replace("/skill show ", "").trim();
        const loader = getSkillsLoader();
        const content = loader.getUserSkillContent(skillId);
        if (content) {
          setMessages((prev) => [...prev, { role: "assistant", content, timestamp: new Date() }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: `Skill "${skillId}" not found. Use /skill list to see available skills.`, timestamp: new Date() }]);
        }
        setLastAction("Skill details");
        return;
      }

      if (resolved.startsWith("/skill edit ")) {
        const skillId = resolved.replace("/skill edit ", "").trim();
        const loader = getSkillsLoader();
        const content = loader.getUserSkillContent(skillId);
        if (!content) {
          setMessages((prev) => [...prev, { role: "assistant", content: `Skill "${skillId}" not found. Use /skill list to see available skills.`, timestamp: new Date() }]);
          return;
        }
        handleAIMessage(
          `The user wants to edit their custom skill "${skillId}". Here is the current content:\n\n${content}\n\n` +
          `Help them update it. Ask what they want to change, then save the updated version to data/user-skills/${skillId}.md ` +
          `and update data/user-skills/index.json accordingly.`
        );
        setLastAction("Editing skill...");
        return;
      }

      if (resolved.startsWith("/skill delete ")) {
        const skillId = resolved.replace("/skill delete ", "").trim();
        const loader = getSkillsLoader();
        const deleted = loader.deleteUserSkill(skillId);
        if (deleted) {
          setMessages((prev) => [...prev, { role: "assistant", content: `Skill "${skillId}" deleted.`, timestamp: new Date() }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: `Skill "${skillId}" not found.`, timestamp: new Date() }]);
        }
        setLastAction("Skill deleted");
        return;
      }

      if (resolved === "/skill learn") {
        handleAIMessage(
          `Analyze our recent conversation history and identify repeated patterns, preferences, or decision frameworks that could be codified as custom skills. ` +
          `For each suggestion, provide:\n- Skill name\n- What it would encode\n- Why it would be useful\n\n` +
          `Then ask the user which ones they want to create. For approved ones, save them to data/user-skills/ using the standard skill template format ` +
          `and update data/user-skills/index.json.`
        );
        setLastAction("Learning skills...");
        return;
      }

      // /excel - Excel Spreadsheet Management
      if (resolved === "/excel" || resolved === "/excel list") {
        const sheets = listSpreadsheets();
        let display = "## Spreadsheets\n\n";
        if (sheets.length > 0) {
          display += sheets.map(s => `- **${s.name}** — ${(s.size / 1024).toFixed(1)} KB — modified ${new Date(s.modified).toLocaleDateString()}`).join("\n");
        } else {
          display += "No spreadsheets yet. Use `/excel create <name>` or ask me to track data in a spreadsheet.";
        }
        setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
        setLastAction("Spreadsheet list");
        return;
      }

      if (resolved.startsWith("/excel read ")) {
        const name = resolved.replace("/excel read ", "").trim();
        (async () => {
          try {
            const result = await readSpreadsheet(name);
            if (!result) {
              setMessages((prev) => [...prev, { role: "assistant", content: `Spreadsheet "${name}" not found. Use /excel list to see available files.`, timestamp: new Date() }]);
              return;
            }
            let display = `## Spreadsheet: ${name}\n\n`;
            for (const sheet of result.sheets) {
              display += `### ${sheet.name} (${sheet.rows.length} rows)\n`;
              if (sheet.headers.length > 0) display += `**Columns:** ${sheet.headers.join(" | ")}\n\n`;
              const preview = sheet.rows.slice(0, 20);
              for (const row of preview) {
                display += sheet.headers.map(h => `${h}: ${row[h] ?? ""}`).join(" | ") + "\n";
              }
              if (sheet.rows.length > 20) display += `\n... and ${sheet.rows.length - 20} more rows\n`;
              display += "\n";
            }
            setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Error reading spreadsheet: ${err.message}`, timestamp: new Date() }]);
          }
        })();
        setLastAction("Reading spreadsheet...");
        return;
      }

      if (resolved.startsWith("/excel create ")) {
        const name = resolved.replace("/excel create ", "").trim();
        handleAIMessage(
          `The user wants to create an Excel spreadsheet called "${name}". Ask them what columns/data they want to track. ` +
          `Once you have the details, use the excel-manager service to create the spreadsheet at data/spreadsheets/${name}.xlsx. ` +
          `The createSpreadsheet function takes (name, { sheetName, headers: [{name, key, width}], rows: [objects], formulas: {key: "formula with {row}"}, totalLabel }). ` +
          `Create a well-structured spreadsheet with proper headers, formatting, and formulas where appropriate.`
        );
        setLastAction("Creating spreadsheet...");
        return;
      }

      // /update - Auto-update
      if (resolved === "/update check") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Checking for updates...", timestamp: new Date() }]);
        setLastAction("Checking for updates...");
        (async () => {
          try {
            const info = await checkVersion();
            let display = "## Update Check\n\n";
            display += `**Current version:** v${info.current}\n`;
            if (info.latest) {
              display += `**Latest version:** v${info.latest}\n`;
              if (info.updateAvailable) {
                display += `**Status:** Update available!\n`;
                if (info.sizeBytes) display += `**Size:** ${(info.sizeBytes / 1024 / 1024).toFixed(1)} MB\n`;
                if (info.releaseDate) display += `**Released:** ${new Date(info.releaseDate).toLocaleString()}\n`;
                if (info.changelog) display += `\n**Changelog:**\n${info.changelog}\n`;
                display += `\nRun \`/update\` to download and install.`;
              } else {
                display += `**Status:** Up to date`;
              }
            } else {
              display += `**Status:** Could not reach update server`;
            }
            setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Update check failed: ${err.message}`, timestamp: new Date() }]);
          }
        })();
        return;
      }

      if (resolved === "/update") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Checking for updates and installing if available...", timestamp: new Date() }]);
        setLastAction("Updating...");
        (async () => {
          try {
            const result = await forceUpdate((msg) => {
              setLastAction(msg);
            });
            if (!result.updated && !result.error) {
              setMessages((prev) => [...prev, { role: "assistant", content: "Already on the latest version.", timestamp: new Date() }]);
              setLastAction("Up to date");
            } else if (result.error) {
              setMessages((prev) => [...prev, { role: "assistant", content: `Update failed: ${result.error}`, timestamp: new Date() }]);
              setLastAction("Update failed");
            }
            // If update succeeded, process.exit(0) was called — we won't reach here
          } catch (err) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Update failed: ${err.message}`, timestamp: new Date() }]);
            setLastAction("Update failed");
          }
        })();
        return;
      }

      // /backup - Firebase Storage Backup
      if (resolved === "/backup" || resolved === "/backup status") {
        const status = getBackupStatus();
        let display = "## Backup Status\n\n";
        display += `**Bucket:** ${status.bucket}\n`;
        display += `**Total files:** ${status.total}\n`;
        display += `**Synced:** ${status.synced}\n`;
        display += `**Pending upload:** ${status.pending}\n`;
        display += `**Last sync:** ${status.lastSync ? new Date(status.lastSync).toLocaleString() : "Never"}\n`;
        if (status.pending > 0) display += `\nRun \`/backup now\` to upload pending changes.`;
        setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
        setLastAction("Backup status");
        return;
      }

      if (resolved === "/backup now") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Starting backup to Firebase Storage...", timestamp: new Date() }]);
        setLastAction("Backing up...");
        (async () => {
          try {
            const result = await backupToFirebase();
            let display = "## Backup Complete\n\n";
            display += `**Uploaded:** ${result.uploaded} files\n`;
            display += `**Skipped (unchanged):** ${result.skipped}\n`;
            display += `**Duration:** ${(result.duration / 1000).toFixed(1)}s\n`;
            if (result.errors.length > 0) {
              display += `\n**Errors:**\n${result.errors.map(e => `- ${e}`).join("\n")}`;
            }
            setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Backup failed: ${err.message}`, timestamp: new Date() }]);
          }
        })();
        return;
      }

      if (resolved === "/backup restore") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Restoring from Firebase Storage...", timestamp: new Date() }]);
        setLastAction("Restoring...");
        (async () => {
          try {
            const result = await restoreFromFirebase();
            let display = "## Restore Complete\n\n";
            display += `**Downloaded:** ${result.downloaded} files\n`;
            display += `**Skipped (already exists):** ${result.skipped}\n`;
            if (result.errors.length > 0) {
              display += `\n**Errors:**\n${result.errors.map(e => `- ${e}`).join("\n")}`;
            }
            setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Restore failed: ${err.message}`, timestamp: new Date() }]);
          }
        })();
        return;
      }

      // /sync firebase - Push data to Firestore
      if (resolved === "/sync firebase" || resolved === "/sync firestore") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Pushing data to Firestore...", timestamp: new Date() }]);
        setLastAction("Syncing to Firestore...");
        (async () => {
          try {
            if (!isFirestoreAuthenticated()) {
              setMessages((prev) => [...prev, { role: "assistant", content: "Not authenticated. Please sign in with `/account` first.", timestamp: new Date() }]);
              return;
            }
            // Force push tickers immediately (bypass 4-hour throttle)
            const tickerResult = await pushTickers(null, true);
            let display = "## Firestore Sync Complete\n\n";
            display += `**Tickers pushed:** ${tickerResult?.count || 0}\n`;
            display += `**Updated at:** ${tickerResult?.updatedAt || "N/A"}\n`;
            display += `\nTickers are stored in the shared \`tickers/realtime\` collection and daily snapshot \`tickers/${new Date().toISOString().split("T")[0]}\`.`;
            setMessages((prev) => [...prev, { role: "assistant", content: display, timestamp: new Date() }]);
          } catch (err) {
            setMessages((prev) => [...prev, { role: "assistant", content: `Firestore sync failed: ${err.message}`, timestamp: new Date() }]);
          }
        })();
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
      // Get chat actions manager
      const chatActions = getChatActionsManager();

      // Check if this is a response to a pending confirmation
      if (pendingConfirmation && chatActions.isConfirmationResponse(trimmed)) {
        setLastAction("Processing confirmation...");
        unifiedMessageLog.addUserMessage(trimmed, MESSAGE_CHANNEL.CHAT, {
          source: "cli",
          confirmationResponse: true
        });
        setMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed, timestamp: new Date() }
        ]);

        try {
          const confirmResult = await chatActions.processConfirmationResponse(trimmed);
          if (confirmResult.handled) {
            setPendingConfirmation(null);
            unifiedMessageLog.addAssistantMessage(confirmResult.response, MESSAGE_CHANNEL.CHAT, {
              source: "confirmation"
            });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: confirmResult.response, timestamp: new Date() }
            ]);
            setLastAction(confirmResult.confirmed ? "Action executed" : "Action cancelled");
            return;
          }
        } catch (error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${error.message}`, timestamp: new Date() }
          ]);
          setPendingConfirmation(null);
          return;
        }
      }

      // Check if this is a response to a priority question
      if (awaitingPriority) {
        const priority = chatActions.parsePriorityResponse(trimmed);
        if (priority !== null) {
          unifiedMessageLog.addUserMessage(trimmed, MESSAGE_CHANNEL.CHAT, {
            source: "cli",
            priorityResponse: true
          });
          setMessages((prev) => [
            ...prev,
            { role: "user", content: trimmed, timestamp: new Date() }
          ]);

          // Update the goal priority
          try {
            const goalManager = getGoalManager();
            if (awaitingPriority.goal) {
              awaitingPriority.goal.priority = priority;
              await goalManager.setCurrentGoal(awaitingPriority.goal);
              // Track goal in session state for persistence
              getSessionState().setCurrentGoal({
                title: awaitingPriority.goal.title,
                priority,
                category: awaitingPriority.goal.category,
                setAt: new Date().toISOString()
              });
            }
            const priorityMessage = `Got it! I've set this as ${["", "urgent", "high", "medium", "low"][priority]} priority and added it to your goals.`;
            unifiedMessageLog.addAssistantMessage(priorityMessage, MESSAGE_CHANNEL.CHAT, {
              source: "priority"
            });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: priorityMessage, timestamp: new Date() }
            ]);
          } catch (e) {
            console.error("[Backbone] Failed to update priority:", e.message);
          }

          setAwaitingPriority(null);
          setLastAction("Priority set");
          return;
        }
      }

      // Analyze message for actionable requests
      setLastAction("Analyzing...");
      try {
        const actionResult = await chatActions.processUserMessage(trimmed);

        if (actionResult.isActionable) {
          // Add user message
          unifiedMessageLog.addUserMessage(trimmed, MESSAGE_CHANNEL.CHAT, {
            source: "cli",
            actionRequest: true
          });
          setMessages((prev) => [
            ...prev,
            { role: "user", content: trimmed, timestamp: new Date() }
          ]);

          // Handle different outcomes
          if (actionResult.needsPriority) {
            // AI wants to ask about priority
            setAwaitingPriority({ goal: actionResult.goal, analysis: actionResult.analysis });
            unifiedMessageLog.addAssistantMessage(actionResult.response, MESSAGE_CHANNEL.CHAT, {
              source: "priority"
            });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: actionResult.response, timestamp: new Date() }
            ]);
            setLastAction("Waiting for priority");
            return;
          }

          if (actionResult.needsConfirmation) {
            // Action needs user confirmation
            setPendingConfirmation(actionResult.pendingAction);
            unifiedMessageLog.addAssistantMessage(actionResult.response, MESSAGE_CHANNEL.CHAT, {
              source: "confirmation"
            });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: actionResult.response, timestamp: new Date() }
            ]);
            setLastAction("Awaiting confirmation");
            return;
          }

          if (actionResult.executed) {
            // Action was executed (low/medium risk)
            unifiedMessageLog.addAssistantMessage(actionResult.response, MESSAGE_CHANNEL.CHAT, {
              source: "action"
            });
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: actionResult.response, timestamp: new Date() }
            ]);
            setLastAction("Action complete");

            // If there's also a goal, mention it
            if (actionResult.goal) {
              unifiedMessageLog.addAssistantMessage(`Added to goals: "${actionResult.goal.title}"`, MESSAGE_CHANNEL.CHAT, {
                source: "goals"
              });
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Added to goals: "${actionResult.goal.title}"`, timestamp: new Date(), isGoalNotice: true }
              ]);
            }
            return;
          }
        }
      } catch (error) {
        console.error("[Backbone] Chat action processing failed:", error.message);
        // Fall through to normal AI handling
      }

      // Extract goals from the conversation (existing behavior)
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
      connectionStatuses,
      dataCompleteness: dataCompletenessRef.current
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

      // Data completeness bar — shown only in MINIMAL view
      if (data.viewMode === VIEW_MODES.MINIMAL) {
        const dc = data.dataCompleteness || { percentage: 0 };
        const pct = dc.percentage;
        const barWidth = 10;
        const filled = Math.round((pct / 100) * barWidth);
        const empty = barWidth - filled;
        const barColor = pct >= 75 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
        rightSegments.push({ text: "Knowledge ", color: "#64748b" });
        if (filled > 0) rightSegments.push({ text: "█".repeat(filled), color: barColor });
        if (empty > 0) rightSegments.push({ text: "░".repeat(empty), color: "#334155" });
        rightSegments.push({ text: ` ${pct}%`, color: barColor });
        rightSegments.push({ text: " | ", color: "#1e293b" });
      }

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

      const headerLeft = [{ text: "ENGINE", color: "#64748b" }, { text: " · Claude Code CLI", color: "#f59e0b" }];
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
    workLog.logSystem("Autonomous Mode Started", "Powered by Claude Code CLI");
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


  // Pre-render phase: render main view structure to set terminal rows
  // This ensures the layout is calculated based on actual content before showing splash
  // Content flashes briefly then gets cleared, so user sees splash next
  if (preRenderPhase) {
    // Render actual main view structure with placeholders to set correct terminal size
    // Text is black (#000000) so invisible on dark background
    // The screen will be cleared immediately after, so this is not visible to user
    return e(
      Box,
      {
        key: "pre-render",
        flexDirection: "column",
        height: 70,
        width: terminalWidth,
        overflow: "hidden"
      },
      // Header placeholder
      e(Box, { height: 3 },
        e(Text, { color: "#000000" }, "Loading BACKBONE Engine...")
      ),
      // Main content area with goals and outcomes structure
      e(Box, { flexDirection: "row", height: 55, overflow: "hidden" },
        // Left column placeholder (25%)
        e(Box, { flexDirection: "column", width: "25%", paddingRight: 1 },
          e(Text, { color: "#000000" }, "Progress Section Loading..."),
          e(Box, { height: 15 },
            e(Text, { color: "#000000" }, "Loading health metrics and daily progress data from connected services...")
          ),
          e(Box, { height: 15 },
            e(Text, { color: "#000000" }, "Loading financial portfolio data and market analysis...")
          )
        ),
        // Center column placeholder (50%)
        e(Box, { flexDirection: "column", width: "50%", paddingX: 1 },
          // Engine area
          e(Box, { flexDirection: "column", height: 25 },
            e(Text, { color: "#000000" }, "Engine Status Loading..."),
            e(Text, { color: "#000000" }, "Initializing AI engine and loading your current task context and priorities...")
          ),
          // Outcomes area - taller with more content
          e(Box, { flexDirection: "column", height: 25 },
            e(Text, { color: "#000000" }, "Outcomes Loading..."),
            ...PLACEHOLDER_OBSERVATIONS.map((obs, i) =>
              e(Box, { key: `obs-${i}`, marginBottom: 2 },
                e(Text, { color: "#000000" }, obs.text)
              )
            )
          )
        ),
        // Right column placeholder (25%) - Goals - taller
        e(Box, { flexDirection: "column", width: "25%", paddingLeft: 1 },
          e(Text, { color: "#000000" }, "Goals Loading..."),
          ...PLACEHOLDER_GOALS.map((goal, i) =>
            e(Box, { key: `goal-${i}`, flexDirection: "column", marginBottom: 3 },
              e(Text, { color: "#000000" }, goal.title),
              e(Text, { color: "#000000" }, goal.project)
            )
          )
        )
      ),
      // Footer placeholder - taller
      e(Box, { height: 12 },
        e(Text, { color: "#000000" }, "Loading chat interface and command palette...")
      )
    );
  }

  // Show CLEAN splash screen during initialization (no skeletons visible)
  if (isInitializing) {
    return e(
      Box,
      {
        key: "splash-clean",
        flexDirection: "column",
        height: appHeight,
        width: terminalWidth,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 6,
        paddingBottom: 6,
        marginTop: 4,
        marginBottom: 4
      },
      e(SplashScreen, { message: "Initializing" })
    );
  }

  // Show onboarding wizard for first-time users or when requested (Ctrl+S)
  // Fullscreen centered - nothing else visible - must check BEFORE skeleton
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
        initialStepId: onboardingOverride.stepId,
        notice: onboardingOverride.notice,
        modelProviderId: onboardingOverride.modelProviderId,
        autoOpenProvider: onboardingOverride.autoOpenProvider,
        onComplete: () => {
          // Clear screen and transition to main view
          process.stdout.write("\x1b[2J\x1b[1;1H");
          updateSetting("onboardingComplete", true);
          setShowOnboarding(false);
          setOnboardingOverride({ stepId: null, notice: null, modelProviderId: null, autoOpenProvider: false });
          pauseUpdatesRef.current = false;
          setPauseUpdates(false);
          setLastAction("Setup complete!");
          // Restore terminal title (Backbone · [User])
          restoreBaseTitle();
        },
        onProfileRestored: (user) => {
          // Profile restored from archive — skip onboarding entirely
          process.stdout.write("\x1b[2J\x1b[1;1H");
          setShowOnboarding(false);
          setOnboardingOverride({ stepId: null, notice: null, modelProviderId: null, autoOpenProvider: false });
          pauseUpdatesRef.current = false;
          setPauseUpdates(false);
          setFirebaseUser(user);
          syncUserSettings();
          setLastAction(`Profile restored for ${user.name || user.email}`);
          restoreBaseTitle();
        }
      })
    );
  }

  // Show skeleton placeholders AFTER splash ends but BEFORE data is ready
  // This provides visual structure while data loads
  if (!mainViewReady) {
    // Multi-line pulsing colors - alternating shades for depth
    const skeletonLight = pulsingDotVisible ? "#4a5568" : "#2d3748";
    const skeletonMid = pulsingDotVisible ? "#3f4f5f" : "#252f3a";
    const skeletonDark = pulsingDotVisible ? "#374151" : "#1f2937";
    const skeletonDimColor = pulsingDotVisible ? "#374151" : "#1f2937";

    // Multi-line skeleton block - creates multiple pulsing lines with varying widths
    const SkeletonBlock = (baseWidth, lines = 3, indent = 0) => e(
      Box,
      { flexDirection: "column", paddingLeft: indent },
      ...Array.from({ length: lines }, (_, i) => {
        const width = Math.max(8, baseWidth - (i * 3) + (i % 2 === 0 ? 2 : -1));
        const color = i % 3 === 0 ? skeletonLight : i % 3 === 1 ? skeletonMid : skeletonDark;
        return e(Text, { key: i, color }, "░".repeat(Math.min(width, 30)));
      })
    );

    // Skeleton line helper - single pulsing line
    const SkeletonLine = (width, indent = 0) => e(
      Box,
      { paddingLeft: indent, marginBottom: 1 },
      e(Text, { color: skeletonLight }, "░".repeat(Math.min(width, 30)))
    );

    // Skeleton goal - 4 lines per goal (spacious layout)
    const SkeletonGoal = (titleWidth) => e(
      Box,
      { flexDirection: "column", marginBottom: 2 },
      // Line 1: Title line with dot
      e(Box, { flexDirection: "row", gap: 1 },
        e(Text, { color: pulsingDotVisible ? "#f59e0b" : "#92400e" }, "●"),
        e(Text, { color: skeletonLight }, "░".repeat(titleWidth))
      ),
      // Line 2: Progress detail
      e(Box, { paddingLeft: 3 },
        e(Text, { color: skeletonMid }, "░".repeat(Math.floor(titleWidth * 0.8)))
      ),
      // Line 3: Status detail
      e(Box, { paddingLeft: 3 },
        e(Text, { color: skeletonDark }, "░".repeat(Math.floor(titleWidth * 0.65)))
      ),
      // Line 4: Metric
      e(Box, { paddingLeft: 3 },
        e(Text, { color: skeletonMid }, "░".repeat(Math.floor(titleWidth * 0.5)))
      )
    );

    // Skeleton outcome - 4 lines per outcome with green dot
    const SkeletonOutcome = (textWidth) => e(
      Box,
      { flexDirection: "column", marginBottom: 1 },
      // Line 1: Main outcome with dot
      e(Box, { flexDirection: "row", gap: 1 },
        e(Text, { color: pulsingDotVisible ? "#22c55e" : "#166534" }, "●"),
        e(Text, { color: skeletonLight }, "░".repeat(textWidth))
      ),
      // Line 2: Detail line
      e(Box, { paddingLeft: 3 },
        e(Text, { color: skeletonMid }, "░".repeat(Math.floor(textWidth * 0.8)))
      ),
      // Line 3: Progress/metric
      e(Box, { paddingLeft: 3 },
        e(Text, { color: skeletonDark }, "░".repeat(Math.floor(textWidth * 0.65)))
      ),
      // Line 4: Additional info
      e(Box, { paddingLeft: 3 },
        e(Text, { color: skeletonMid }, "░".repeat(Math.floor(textWidth * 0.5)))
      )
    );

    // For narrow terminals (< 80), show compact skeleton
    if (isNarrow) {
      return e(
        Box,
        {
          key: "skeleton-narrow",
          flexDirection: "column",
          height: appHeight,
          width: terminalWidth,
          overflow: "hidden"
        },
        // Compact header
        e(Box, { height: 2, flexDirection: "row", justifyContent: "space-between", paddingX: 1 },
          e(Text, { color: skeletonLight }, "░░░░░░░░░░"),
          e(Text, { color: skeletonMid }, "░░░░░")
        ),
        // Compact content - just engine and chat
        e(Box, { flexDirection: "column", flexGrow: 1, paddingX: 1, overflow: "hidden" },
          // Engine header
          e(Text, { color: skeletonDimColor, bold: true }, "Engine"),
          e(Text, { color: "#1e293b" }, "─".repeat(Math.min(terminalWidth - 4, 30))),
          e(Box, { marginTop: 1 }),
          // 4 compact outcomes - 4 lines each
          SkeletonOutcome(20),
          SkeletonOutcome(18),
          SkeletonOutcome(22),
          SkeletonOutcome(19),
          // Chat input placeholder
          e(Box, { flexGrow: 1, justifyContent: "flex-end" },
            e(Box, { height: 4, borderStyle: "round", borderColor: "#1e293b", padding: 1 },
              e(Box, { flexDirection: "row" },
                e(Text, { color: skeletonDimColor }, "> "),
                e(Text, { color: skeletonLight }, "░░░░░░░░░░░░░░░░░░░░")
              ),
              e(Text, { color: skeletonMid }, "  ░░░░░░░░░░░░░░░░")
            )
          )
        )
      );
    }

    return e(
      Box,
      {
        key: "skeleton-layout",
        flexDirection: "column",
        height: appHeight,
        width: terminalWidth,
        overflow: "hidden"
      },
      // Header placeholder - multi-line pulsing
      e(Box, { height: 3, flexDirection: "row", justifyContent: "space-between", paddingX: 1 },
        e(Box, { flexDirection: "column" },
          e(Text, { color: skeletonLight }, "░░░░░░░░░░░░░"),
          e(Text, { color: skeletonMid }, "░░░░░░░░░░")
        ),
        e(Box, { flexDirection: "column", alignItems: "flex-end" },
          e(Text, { color: skeletonDark }, "░░░░░░░░"),
          e(Text, { color: skeletonMid }, "░░░░░░")
        )
      ),

      // Main content area with proper column structure - respects view mode
      e(
        Box,
        { flexDirection: "row", height: contentHeight, overflow: "hidden" },

        // Left column (25%) - Progress + Health + Tickers - HIDDEN in MINIMAL/medium views
        viewMode !== VIEW_MODES.MINIMAL && !isMedium && e(Box, { flexDirection: "column", width: "25%", paddingRight: 1, overflow: "hidden" },
          // Progress section - multi-line pulsing
          e(Box, { height: 12, flexDirection: "column", marginBottom: 2 },
            e(Text, { color: skeletonDimColor }, "Progress"),
            e(Text, { color: "#1e293b" }, "─".repeat(20)),
            e(Box, { marginTop: 1 }),
            SkeletonBlock(20, 4),
            e(Box, { height: 1 }),
            SkeletonBlock(18, 3)
          ),
          // Health section - multi-line pulsing
          e(Box, { height: 12, flexDirection: "column", marginBottom: 2 },
            e(Text, { color: skeletonDimColor }, "Health"),
            e(Text, { color: "#1e293b" }, "─".repeat(20)),
            e(Box, { marginTop: 1 }),
            SkeletonBlock(22, 4),
            e(Box, { height: 1 }),
            SkeletonBlock(18, 3)
          ),
          // Ticker section - multi-line pulsing
          e(Box, { height: 14, flexDirection: "column" },
            e(Text, { color: skeletonDimColor }, "Scores"),
            e(Text, { color: "#1e293b" }, "─".repeat(20)),
            e(Box, { marginTop: 1 }),
            SkeletonBlock(24, 5),
            e(Box, { height: 1 }),
            SkeletonBlock(20, 4)
          )
        ),

        // Center column - Engine + Chat area with multi-line blocks
        // Width: 75% in MINIMAL/medium, 50% otherwise
        e(
          Box,
          {
            flexDirection: "column",
            width: viewMode === VIEW_MODES.MINIMAL || isMedium ? "75%" : "50%",
            paddingX: 1,
            overflow: "hidden"
          },
          // Engine section with working on - multi-line pulsing
          e(Box, { flexDirection: "column", height: 24, marginBottom: 2 },
            e(Text, { color: skeletonDimColor, bold: true }, "Engine"),
            e(Text, { color: "#1e293b" }, "─".repeat(viewMode === VIEW_MODES.MINIMAL || isMedium ? 50 : 40)),
            e(Box, { marginTop: 1 }),
            // 4 Outcome placeholders - 4 lines each
            SkeletonOutcome(34),
            SkeletonOutcome(30),
            SkeletonOutcome(32),
            SkeletonOutcome(28)
          ),
          // Chat input placeholder area - multi-line
          e(Box, { flexGrow: 1, flexDirection: "column", justifyContent: "flex-end" },
            e(Box, { height: 6, borderStyle: "round", borderColor: "#1e293b", padding: 1 },
              e(Box, { flexDirection: "row" },
                e(Text, { color: skeletonDimColor }, "> "),
                e(Text, { color: skeletonLight }, "░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░")
              ),
              e(Text, { color: skeletonMid }, "  ░░░░░░░░░░░░░░░░░░░░░░░░"),
              e(Text, { color: skeletonDark }, "  ░░░░░░░░░░░░░░░░░░")
            )
          )
        ),

        // Right column (25%) - 4 Goals skeleton - HIDDEN in MINIMAL view
        viewMode !== VIEW_MODES.MINIMAL && e(Box, { flexDirection: "column", width: "25%", paddingLeft: 1, overflow: "hidden" },
          e(Text, { color: "#f59e0b", bold: true }, "Goals"),
          e(Text, { color: "#1e293b" }, "─".repeat(22)),
          e(Box, { marginTop: 1 }),
          // 4 Goal placeholders - each has 4 lines
          SkeletonGoal(22),
          SkeletonGoal(20),
          SkeletonGoal(24),
          SkeletonGoal(19)
        )
      ),

      // Footer placeholder - multi-line
      e(Box, { height: 5, flexDirection: "column", justifyContent: "center" },
        e(Text, { color: "#1e293b" }, "─".repeat(Math.min(terminalWidth - 2, 90))),
        e(Box, { flexDirection: "column", paddingX: 1, marginTop: 1 },
          e(Box, { flexDirection: "row" },
            e(Text, { color: skeletonDimColor }, "Loading data..."),
            e(Text, { color: skeletonLight }, " ░░░░░░░░░░░░░░")
          ),
          e(Text, { color: skeletonMid }, "░░░░░░░░░░░░░░░░░░░░")
        )
      )
    );
  }

  if (!mainViewReady) {
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
        // Claude Code Alert Banner (if disconnected)
        claudeCodeAlert && e(
          Box,
          { backgroundColor: "#7f1d1d", paddingX: 2, justifyContent: "center" },
          e(Text, { color: "#fca5a5", bold: true }, `⚠️ ${claudeCodeAlert}`)
        ),
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
            // Connection status - CONNECTED with pulsing green dot or OFFLINE (based on actual internet connectivity)
            isInternetConnected
              ? e(Box, { flexDirection: "row" },
                  e(Text, { color: "#22c55e", bold: true }, "CONNECTED "),
                  e(Text, { color: pulsingDotVisible ? "#22c55e" : "#14532d" }, "●")
                )
              : e(Box, { flexDirection: "row" },
                  e(Text, { color: "#ef4444", bold: true }, "OFFLINE "),
                  e(Text, { color: "#ef4444" }, "✕")
                ),
            // Engine running status — shows uptime and pulsing indicator
            e(Text, { color: "#475569" }, " · "),
            e(Box, { flexDirection: "row" },
              e(Text, { color: engineHeaderStatus.color, bold: true },
                engineHeaderStatus.status === "running" ? "ENGINE " :
                engineHeaderStatus.status === "resting" ? "RESTING " :
                engineHeaderStatus.status === "stalled" ? "STALLED " :
                engineHeaderStatus.status === "paused" ? "PAUSED " : "ENGINE OFF "
              ),
              e(Text, { color: engineHeaderStatus.status === "running"
                ? (pulsingDotVisible ? "#22c55e" : "#14532d")
                : engineHeaderStatus.status === "resting"
                ? (pulsingDotVisible ? "#3b82f6" : "#1e3a5f")
                : engineHeaderStatus.color }, "●"),
              engineHeaderStatus.status === "resting" && engineHeaderStatus.restStatus
                ? e(Text, { color: "#64748b" }, ` ${engineHeaderStatus.restStatus.remainingMin}/${engineHeaderStatus.restStatus.totalRestMin}m`)
                : engineHeaderStatus.uptimeStr && e(Text, { color: "#64748b" }, ` ${engineHeaderStatus.uptimeStr}`)
            )
          ),
          // Right: Profile completeness + User name and profession from LinkedIn
          e(
            Box,
            { flexDirection: "row", gap: 1, alignItems: "center" },
            // Profile completeness bar (left of username)
            (() => {
              const pct = dataCompletenessRef.current?.percentage || 0;
              const barWidth = 8;
              const filled = Math.round((pct / 100) * barWidth);
              const empty = barWidth - filled;
              const barColor = pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
              return e(Box, { flexDirection: "row" },
                e(Text, { color: barColor }, "█".repeat(filled)),
                e(Text, { color: "#1e293b" }, "░".repeat(empty)),
                e(Text, { color: barColor, bold: true }, ` ${pct}%`)
              );
            })(),
            e(Text, { color: "#334155" }, "│"),
            // User name (from LinkedIn first, then Firebase)
            e(Text, { color: "#f59e0b", bold: true }, linkedInProfile?.name?.split(" ")[0] || firebaseUserDisplay?.split(" ")[0] || ""),
            // Profession/headline from LinkedIn
            linkedInProfile?.headline && e(Text, { color: "#64748b" }, `· ${linkedInProfile.headline.split(/\s+at\s+|\s*[|,]\s*/i)[0]?.slice(0, 30)}`)
          )
        ),
        // Separator line below header - dark gray, full width
        e(Text, { color: claudeCodeAlert ? "#dc2626" : "#1e293b" }, "─".repeat(terminalWidth > 0 ? terminalWidth : 80))
      ),

      // ===== MAIN CONTENT ROW (two columns) =====
      e(
        Box,
        { flexDirection: "row", flexGrow: 1, flexShrink: 1, overflow: "hidden" },

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

          const userName = linkedInProfile?.name?.split(" ")[0] || firebaseUserName?.split(" ")[0] || "Frank";
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

        // ENGINE + CONVERSATION — show engine when idle, conversation when user is chatting
        e(
          Box,
          { flexDirection: "column", flexGrow: 1, marginTop: 1, overflow: "hidden" },
          // Show conversation only when:
          // 1. User has sent messages (messages.length > 0), OR
          // 2. AI is processing user input (isProcessing), OR
          // 3. User conversation is actively streaming (streamingText)
          // Note: actionStreamingText is for CLI background work - show ENGINE for that
          (messages.length > 0 || isProcessing || streamingText)
            ? e(ConversationPanel, {
                messages,
                isLoading: isProcessing,
                streamingText,
                actionStreamingText: cliStreaming ? actionStreamingText : "", // Only pass if actively streaming
                actionStreamingTitle,
                whatsappPollCountdown,
                whatsappPollingMode,
                scrollOffset: conversationScrollOffset
              })
            : e(AgentActivityPanel, {
                overlayHeader: false,
                compact: true,
                scrollOffset: engineScrollOffset,
                privateMode,
                actionStreamingText,
                cliStreaming
              })
        ),

        // PORTFOLIO SUMMARY - One line with equity, day %, top 2 positions
        portfolio && portfolio.equity && e(
          Box,
          { flexDirection: "row", gap: 1, marginTop: 1, height: 1 },
          e(Text, { color: "#64748b" }, "$"),
          e(Text, { color: "#e2e8f0", bold: true }, privateMode ? "***" : (portfolio.equity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })),
          e(Text, { color: "#334155" }, " | "),
          // Today's change: dollar amount + percentage
          (() => {
            const dayPct = portfolio.dayPLPercent || (portfolio.dayPL && portfolio.equity ? (portfolio.dayPL / (portfolio.equity - portfolio.dayPL)) * 100 : 0);
            const dayDollar = portfolio.dayPL || 0;
            const isUp = dayPct >= 0;
            const color = privateMode ? "#64748b" : (isUp ? "#22c55e" : "#ef4444");
            const label = privateMode ? "Today" : (isUp ? "Gained" : "Lost");
            const dollarStr = privateMode ? "$***" : `${isUp ? "+" : ""}$${Math.abs(dayDollar).toFixed(2)}`;
            const pctStr = privateMode ? "**%" : `${isUp ? "+" : ""}${dayPct.toFixed(2)}%`;
            return e(Box, { flexDirection: "row", gap: 1 },
              e(Text, { color, bold: true }, label),
              e(Text, { color, bold: !privateMode }, `${dollarStr} ${pctStr}`)
            );
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

        // TOP 4 TICKERS - Compact inline display with decimals, green if > 8, plus Tickers/Sweep/Trading status
        topTickers.length > 0 && e(
          Box,
          { flexDirection: "row", gap: 1, marginTop: 1, height: 1 },
          e(Text, { color: "#64748b" }, "TOP "),
          ...topTickers.slice(0, 4).map((t, i) => {
            const score = t.score || 0;
            const isHigh = score > 8;
            const isTop3 = i < 3;
            return e(
              Box,
              { key: t.symbol, flexDirection: "row", gap: 0, backgroundColor: isTop3 && isHigh ? "#14532d" : undefined },
              e(Text, { color: isTop3 && isHigh ? "#22c55e" : "#f59e0b", backgroundColor: isTop3 && isHigh ? "#14532d" : undefined }, ` ${t.symbol} `),
              e(Text, { color: isHigh ? "#22c55e" : "#94a3b8", backgroundColor: isTop3 && isHigh ? "#14532d" : undefined, bold: isHigh }, score.toFixed(1)),
              i < 3 && e(Text, { color: "#334155" }, " ")
            );
          })
        ),

        // NET WORTH SUMMARY - Assets, Liabilities, Total
        plaidData?.connected && e(
          Box,
          { flexDirection: "row", gap: 1, marginTop: 1, height: 1 },
          e(Text, { color: "#64748b" }, "NET WORTH "),
          // Total net worth with background (positive = green, negative = red)
          (() => {
            const total = plaidData.netWorth?.total || 0;
            const isPositive = total >= 0;
            const bg = isPositive ? "#14532d" : "#7f1d1d";
            const formatted = new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(Math.abs(total));
            return e(Text, { backgroundColor: bg, color: "#ffffff", bold: true }, ` ${isPositive ? "" : "-"}${formatted} `);
          })(),
          e(Text, { color: "#334155" }, " | "),
          // Assets
          (() => {
            const assets = plaidData.netWorth?.assets || 0;
            const formatted = new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(assets);
            return e(Text, { color: "#22c55e" }, `↑ ${formatted}`);
          })(),
          e(Text, { color: "#334155" }, " | "),
          // Liabilities
          (() => {
            const liabilities = plaidData.netWorth?.liabilities || 0;
            const formatted = new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0
            }).format(liabilities);
            return e(Text, { color: "#ef4444" }, `↓ ${formatted}`);
          })(),
          // Account count
          plaidData.accountCount > 0 && [
            e(Text, { key: "accsep", color: "#334155" }, " | "),
            e(Text, { key: "acccount", color: "#94a3b8" }, `${plaidData.accountCount} accounts`)
          ]
        ),

        // HEALTH SUMMARY - Readiness, Sleep, Calories, HR with backgrounds and trend arrows
        // When privateMode is ON, all health values are masked with "**"
        ouraHealth?.connected && e(
          Box,
          { flexDirection: "row", gap: 1, marginTop: 1, height: 1 },
          e(Text, { color: "#64748b" }, "HEALTH "),
          // Readiness with background (high = relaxed, low = stressed)
          (() => {
            if (privateMode) return e(Text, { color: "#64748b" }, "Ready **");
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
            if (privateMode) return e(Text, { color: "#64748b" }, "Sleep **");
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
            if (privateMode) return [e(Text, { key: "calsep", color: "#334155" }, " | "), e(Text, { key: "cal", color: "#64748b" }, "** cal")];
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
            if (privateMode) return [e(Text, { key: "hrsep", color: "#334155" }, " | "), e(Text, { key: "hr", color: "#64748b" }, "** bpm")];
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
            if (privateMode) return [e(Text, { key: "stepsep", color: "#334155" }, " | "), e(Text, { key: "steps", color: "#64748b" }, "**k steps")];
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
          { marginTop: 1, width: "100%", flexGrow: 1 },
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
          e(SmartGoalsPanel, { autoGenerate: true, privateMode }),

          // Outcomes: completed goals + narrator observations (total capped by maxOutcomesToShow)
          e(
            Box,
            { flexDirection: "column", marginTop: 1, flexGrow: 1 },
            e(Text, { color: "#64748b" }, "Outcomes:"),
            // Combined outcomes: completed goals first, then narrator observations, total limited
            ...(() => {
              const outcomeItems = [];

              // 1. Completed goals (green dots with 100%)
              try {
                const completedGoals = getGoalTracker().getAll().filter(g => g.status === "completed");
                for (const goal of completedGoals) {
                  if (outcomeItems.length >= maxOutcomesToShow) break;
                  const projectName = goal.project || goal.projectName || goal.category || "";
                  const label = projectName ? `${goal.title} (${projectName})` : goal.title;
                  outcomeItems.push(e(
                    Box,
                    { key: `cg-${outcomeItems.length}`, flexDirection: "row", marginBottom: 1 },
                    e(Text, { color: "#22c55e" }, "●  "),
                    e(Text, { color: "#22c55e", wrap: "wrap" }, label.slice(0, 70)),
                    e(Text, { color: "#22c55e", bold: true }, " 100%")
                  ));
                }
              } catch (err) { /* ignore */ }

              // 2. Narrator observations (fill remaining slots)
              const data = activityNarrator.getDisplayData();
              const observations = data.observations || [];
              for (const obs of observations) {
                if (outcomeItems.length >= maxOutcomesToShow) break;
                const text = obs.text?.toLowerCase() || (typeof obs === "string" ? obs.toLowerCase() : "");
                const isCompleted = text.includes("completed") || text.includes("done") || text.includes("success");
                const isAbandoned = text.includes("abandoned") || text.includes("cancelled") || text.includes("stopped");
                const isFailed = text.includes("failed") || text.includes("error");
                const dotColor = isCompleted ? "#22c55e" : isAbandoned ? "#ef4444" : isFailed ? "#ef4444" : "#f59e0b";
                const textColor = isCompleted ? "#22c55e" : isAbandoned ? "#64748b" : isFailed ? "#64748b" : "#94a3b8";
                outcomeItems.push(e(
                  Box,
                  { key: `obs-${outcomeItems.length}`, flexDirection: "column", marginBottom: 1 },
                  e(
                    Box,
                    { flexDirection: "row" },
                    e(Text, { color: dotColor }, "●  "),
                    e(Text, { color: textColor, wrap: "wrap" }, (obs.text || obs).slice(0, 80))
                  )
                ));
              }

              if (outcomeItems.length === 0) {
                outcomeItems.push(e(Text, { key: "no-obs", color: "#475569", dimColor: true }, "  No outcomes yet"));
              }

              return outcomeItems;
            })()
          )
        )
      ),

      // ===== COMPACT FOOTER =====
      e(Text, { color: "#1e293b" }, "─".repeat(terminalWidth > 0 ? terminalWidth : 80)),
      e(
        Box,
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 1,
          height: 1,
          flexShrink: 0,
        },
        // Left: Tickers, Sweep, Trading
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          // Tickers: x/n (sweep status based on actual count, not timestamp)
          (() => {
            const evaluated = tickerStatus?.evaluatedToday || 0;
            const universe = tickerStatus?.universeSize || 0;
            const scanning = tickerStatus?.fullScanRunning;
            const allDone = evaluated >= universe && universe > 0;

            // Auto-restart sweep if incomplete and not currently scanning (debounced to every 30s)
            const now = Date.now();
            if (!allDone && !scanning && universe > 0 && evaluated < universe) {
              if (now - lastSweepTriggerRef.current > 30000) {
                lastSweepTriggerRef.current = now;
                triggerFullScan().catch(() => {});
              }
            }

            if (scanning) {
              const progress = tickerStatus?.scanProgress || 0;
              const total = tickerStatus?.scanTotal || universe;
              return e(Text, { color: "#9ca3af" }, `Tickers: ${progress}/${total}`);
            }
            return e(
              Text,
              { color: allDone ? "#22c55e" : "#ef4444" },
              `Tickers: ${evaluated}/${universe}`
            );
          })(),
          // Sweep status + timestamp (compact)
          e(Text, { color: "#334155" }, "|"),
          (() => {
            const evaluated = tickerStatus?.evaluatedToday || 0;
            const universe = tickerStatus?.universeSize || 0;
            const allDone = evaluated >= universe && universe > 0;
            const scanning = tickerStatus?.fullScanRunning;
            const lastFullScan = tickerStatus?.lastFullScan;

            if (scanning) {
              return e(Text, { color: "#9ca3af" }, "Sweep running");
            }
            if (!lastFullScan) {
              return e(Text, { color: allDone ? "#22c55e" : "#ef4444" }, "Sweep —");
            }
            const d = new Date(lastFullScan);
            const date = `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
            const time = d.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true
            });
            const timeCompact = time.replace(" AM", "a").replace(" PM", "p").replace(" am", "a").replace(" pm", "p").replace(/\s+/g, "");
            return e(Text, { color: allDone ? "#22c55e" : "#ef4444" }, `Sweep ${date} ${timeCompact}`);
          })(),
          // Trading mode/strategy (shows OFFLINE when no internet)
          e(Text, { color: "#334155" }, "|"),
          (() => {
            // Show OFFLINE if not connected to internet
            if (!isInternetConnected) {
              return [
                e(Text, { key: "tm", color: "#ef4444", bold: true }, "OFFLINE"),
                e(Text, { key: "ts", color: "#64748b" }, " ✕")
              ];
            }
            const config = alpacaConfigRef.current || {};
            const strategy = config.strategy || "swing";
            const mode = config.mode || "paper";
            const risk = config.risk || "conservative";
            const modeColor = mode === "live" ? "#22c55e" : "#f59e0b";
            const toTitle = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
            const modeLabel = mode === "live" ? "Live" : "Paper";
            const stratLabel = toTitle(strategy);
            const riskLabel = toTitle(risk);
            return [
              e(Text, { key: "tm", color: modeColor, bold: true }, modeLabel),
              e(Text, { key: "ts", color: "#94a3b8" }, ` ${stratLabel} ${riskLabel}`)
            ];
          })()
        ),
        // Right: Cron + commands
        e(
          Box,
          { flexDirection: "row", gap: 1 },
          (() => {
            const cronData = getCronManager().getDisplayData();
            const nextJob = cronData.nextJob;
            return [
              e(Text, { key: "clock", color: "#64748b" }, "⏰"),
              e(Text, { key: "count", color: "#94a3b8" }, `${cronData.completedToday}/${cronData.todayCount}`),
              nextJob && e(Text, { key: "sep", color: "#334155" }, "|"),
              nextJob && e(Text, { key: "next", color: "#f59e0b" }, `${nextJob.shortName}`)
            ].filter(Boolean);
          })(),
          e(Text, { color: "#334155" }, "|"),
          e(Text, { color: "#38bdf8" }, "Ctrl+S"),
          e(Text, { color: "#64748b" }, "setup"),
          e(Text, { color: "#334155" }, "|"),
          // Session state indicator with Ctrl+F hint
          (() => {
            const sessionState = getSessionState();
            const hasState = sessionState.hasResumableState();
            const stats = sessionState.getStats();
            if (hasState) {
              return [
                e(Text, { key: "session-icon", color: "#22c55e" }, "●"),
                e(Text, { key: "session-count", color: "#64748b" }, `${stats.actionCount}`),
                e(Text, { key: "session-sep", color: "#334155" }, "|"),
                e(Text, { key: "fresh-key", color: "#38bdf8" }, "^F"),
                e(Text, { key: "fresh-label", color: "#64748b" }, "fresh"),
                e(Text, { key: "sep2", color: "#334155" }, "|")
              ];
            }
            return null;
          })(),
          e(Text, { color: "#f59e0b" }, "/"),
          e(Text, { color: "#64748b" }, "cmds")
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
        // Engine Status OR Disaster Overlay (disaster replaces engine panel)
        showDisasterOverlay
          ? e(DisasterOverlay, {
              visible: showDisasterOverlay,
              onClose: () => setShowDisasterOverlay(false)
            })
          : e(AgentActivityPanel, { overlayHeader: overlayEnabled && overlayEngineHeaderEnabled, scrollOffset: engineScrollOffset, privateMode, actionStreamingText, cliStreaming }),
        // Conversation Panel (always visible)
        e(ConversationPanel, {
          messages,
          isLoading: isProcessing,
          streamingText,
          actionStreamingText,
          actionStreamingTitle,
          whatsappPollCountdown,
          whatsappPollingMode,
          scrollOffset: conversationScrollOffset
        }),
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
                      alpacaConfigRef.current = { ...alpacaConfigRef.current, ...loadAlpacaConfig() };
                    },
                    onRiskSelect: (risk) => {
                      updateAlpacaSetting("risk", risk);
                      alpacaConfigRef.current = { ...alpacaConfigRef.current, ...loadAlpacaConfig() };
                    },
                    onStrategySelect: (strategy) => {
                      updateAlpacaSetting("strategy", strategy);
                      alpacaConfigRef.current = { ...alpacaConfigRef.current, ...loadAlpacaConfig() };
                    },
                    onKeyInput: (key) => {
                      // Store pending key - don't apply until Connect
                      alpacaConfigRef.current = { ...alpacaConfigRef.current, pendingKey: key };
                    },
                    onSecretInput: (secret) => {
                      // Store pending secret - don't apply until Connect
                      alpacaConfigRef.current = { ...alpacaConfigRef.current, pendingSecret: secret };
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

                  // Check for pending keys from direct input (preferred)
                  const pendingKey = alpacaConfigRef.current?.pendingKey || values.apiKey;
                  const pendingSecret = alpacaConfigRef.current?.pendingSecret || values.apiSecret;

                  // Fall back to file keys if no pending keys
                  const fileKeys = readKeysFile();
                  let config = loadAlpacaConfig();

                  // Use pending keys (direct input) or file keys
                  const finalKey = pendingKey || fileKeys.key || config.apiKey;
                  const finalSecret = pendingSecret || fileKeys.secret || config.apiSecret;

                  // Final connection test
                  if (finalKey && finalSecret) {
                    setMessages((prev) => [
                      ...prev,
                      {
                        role: "assistant",
                        content: "Testing Alpaca connection...",
                        timestamp: new Date()
                      }
                    ]);

                    testAlpacaConnection(finalKey, finalSecret, config.mode || "paper")
                      .then((result) => {
                        if (result.success) {
                          // Only save keys after successful connection
                          updateAlpacaSetting("key", finalKey);
                          updateAlpacaSetting("secret", finalSecret);
                          saveKeysToEnv(finalKey, finalSecret);

                          // Clear pending keys
                          alpacaConfigRef.current = { ...alpacaConfigRef.current, pendingKey: null, pendingSecret: null };

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
                              content: `Connection failed: ${result.error}\n\nPlease check your API keys and try again.\nUse /alpaca to reopen the setup.`,
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
                        content: "No API keys provided.\n\n1. Use /alpaca to open setup\n2. Go to API Key and Secret tabs\n3. Enter your keys from Alpaca dashboard\n4. Click Connect",
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
