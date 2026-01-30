/**
 * Center Column Component - Engine Status, Conversation, Chat Input
 *
 * Self-contained component that subscribes to its own state slices.
 * Contains the main chat interface and engine activity display.
 */

import React, { memo, useCallback } from "react";
import { Box } from "ink";
import { useAppStore, useAppStoreMultiple, STATE_SLICES } from "../hooks/useAppStore.js";
import { getAppStore, updateChat, updateOverlays, addMessage } from "../services/app-store.js";

// Import child components
import { AgentActivityPanel } from "./agent-activity-panel.js";
import { ConversationPanel } from "./conversation-panel.js";
import { ChatPanel } from "./chat-panel.js";
import { LinkedInDataViewer } from "./linkedin-data-viewer.js";
import { TestRunnerPanel } from "./test-runner-panel.js";
import { SettingsPanel } from "./settings-panel.js";
import { SetupOverlay } from "./setup-overlay.js";

const e = React.createElement;

/**
 * Center Column - Engine activity, conversation, chat input
 *
 * Props:
 * - onSubmit: Function to handle chat submission
 * - onTypingChange: Function to notify when user starts/stops typing
 * - commands: Available chat commands
 * - setupTabs: Tabs for setup overlay
 * - setupHandlers: Handlers for setup overlay
 */
const CenterColumnBase = ({
  onSubmit,
  onTypingChange,
  commands,
  setupTabs,
  setupHandlers,
  settingsHandlers,
  testRunnerProps,
}) => {
  // Subscribe to chat state
  const chatState = useAppStore(STATE_SLICES.CHAT);
  const overlaysState = useAppStore(STATE_SLICES.OVERLAYS);

  // Extract needed data
  const { messages, isProcessing, streamingText, actionStreamingText, actionStreamingTitle, cliStreaming, currentModelInfo } = chatState;
  const { showTestRunner, showSettings, showLinkedInViewer, linkedInViewerData, setupOverlay } = overlaysState;

  // Close handlers
  const closeLinkedInViewer = useCallback(() => {
    updateOverlays({ showLinkedInViewer: false });
  }, []);

  const closeTestRunner = useCallback(() => {
    updateOverlays({ showTestRunner: false });
  }, []);

  const closeSettings = useCallback(() => {
    updateOverlays({ showSettings: false });
  }, []);

  const closeSetupOverlay = useCallback(() => {
    updateOverlays({ setupOverlay: { active: false, type: null } });
  }, []);

  return e(
    Box,
    { flexDirection: "column", width: "100%", overflow: "hidden" },

    // Engine Status - shows Claude Code CLI streaming output
    e(AgentActivityPanel, { actionStreamingText, cliStreaming }),

    // Conversation Panel
    e(ConversationPanel, {
      messages,
      isLoading: isProcessing,
      streamingText,
      actionStreamingText,
      actionStreamingTitle,
    }),

    // LinkedIn Data Viewer overlay
    showLinkedInViewer &&
      e(LinkedInDataViewer, {
        data: linkedInViewerData,
        visible: showLinkedInViewer,
        onClose: closeLinkedInViewer,
      }),

    // Test Runner Panel overlay
    showTestRunner &&
      testRunnerProps &&
      e(TestRunnerPanel, {
        onClose: closeTestRunner,
        ...testRunnerProps,
      }),

    // Settings Panel overlay
    showSettings &&
      settingsHandlers &&
      e(SettingsPanel, {
        onClose: closeSettings,
        ...settingsHandlers,
      }),

    // Setup Overlay (Alpaca, Models, Oura, etc.)
    setupOverlay?.active
      ? e(SetupOverlay, {
          title: setupOverlay.title || "Setup",
          tabs: setupTabs || [],
          initialValues: setupOverlay.initialValues,
          onCancel: closeSetupOverlay,
          onComplete: (values) => {
            if (setupHandlers?.onComplete) {
              setupHandlers.onComplete(setupOverlay.type, values);
            }
            closeSetupOverlay();
          },
        })
      : // Chat Input
        e(ChatPanel, {
          commands,
          onSubmit,
          onTypingChange,
          modelInfo: currentModelInfo,
        })
  );
};

// Memoize to prevent unnecessary re-renders
export const CenterColumn = memo(CenterColumnBase);

export default CenterColumn;
