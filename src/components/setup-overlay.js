import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

const e = React.createElement;

/**
 * Interactive Setup Overlay Component
 * Similar to Claude Code / opencode setup wizards
 *
 * Features:
 * - Tab headers with left/right navigation
 * - Options under each tab with up/down navigation
 * - Temporary overlay on input area
 * - Reusable for Alpaca, LinkedIn, Oura, LLM, etc.
 */

export const SetupOverlay = ({
  title,
  tabs,
  onComplete,
  onCancel,
  initialTab = 0,
  initialValues = {}
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedOption, setSelectedOption] = useState({});
  const [values, setValues] = useState(initialValues);
  const [confirmedTabs, setConfirmedTabs] = useState({}); // Track which tabs have been confirmed
  const [textInputValue, setTextInputValue] = useState(""); // For text input tabs

  const tabsKey = useMemo(() => {
    return tabs.map((tab) => {
      const optionKey = tab.options
        ? tab.options.map((option) => option.value).join("|")
        : "";
      return `${tab.key}:${optionKey}`;
    }).join("::");
  }, [tabs]);

  const initialValuesKey = useMemo(() => JSON.stringify(initialValues || {}), [initialValues]);
  const tabsResetKey = useMemo(() => `${tabsKey}::${initialValuesKey}`, [tabsKey, initialValuesKey]);

  // Initialize selected options for each tab
  useEffect(() => {
    const initial = {};
    const seedValues = { ...initialValues };

    tabs.forEach((tab, index) => {
      if (tab.options && tab.options.length > 0) {
        // Find the option that matches the initial value, or default to first
        const initialValue = initialValues[tab.key];
        const optionIndex = tab.options.findIndex(opt => opt.value === initialValue);
        const recommendedIndex = tab.options.findIndex(opt => opt.recommended);
        const resolvedIndex = optionIndex >= 0
          ? optionIndex
          : recommendedIndex >= 0
            ? recommendedIndex
            : 0;
        initial[index] = resolvedIndex;
        if (seedValues[tab.key] === undefined) {
          seedValues[tab.key] = tab.options[resolvedIndex].value;
        }
      } else {
        initial[index] = 0;
      }
    });

    setSelectedOption(initial);
    setValues(seedValues);
  }, [tabsResetKey]);

  // Handle text input change for input type tabs
  const handleTextInputChange = useCallback((value) => {
    setTextInputValue(value);
  }, []);

  // Handle text input submit
  const handleTextInputSubmit = useCallback((value) => {
    const currentTab = tabs[activeTab];
    if (currentTab.type === "input" && value.trim()) {
      const trimmedValue = value.trim();
      const newValues = { ...values, [currentTab.key]: trimmedValue };
      setValues(newValues);
      setConfirmedTabs(prev => ({ ...prev, [activeTab]: true }));
      setTextInputValue("");

      if (currentTab.onInput) {
        currentTab.onInput(trimmedValue, newValues);
      }

      // Auto-advance to next tab
      if (activeTab < tabs.length - 1) {
        setActiveTab(activeTab + 1);
      } else if (onComplete) {
        onComplete(newValues);
      }
    }
  }, [activeTab, tabs, values, onComplete]);

  // Handle keyboard input
  useInput((input, key) => {
    const currentTab = tabs[activeTab];

    // Skip navigation if on text input tab (let TextInput handle keys)
    if (currentTab.type === "input") {
      // Only handle escape and tab for text input tabs
      if (key.escape) {
        if (onCancel) {
          onCancel();
        }
        return;
      }
      // Allow tab to switch tabs even in input mode
      if (key.tab) {
        if (key.shift) {
          setActiveTab(prev => Math.max(0, prev - 1));
        } else {
          setActiveTab(prev => Math.min(tabs.length - 1, prev + 1));
        }
        setTextInputValue("");
        return;
      }
      return; // Let TextInput handle other keys
    }

    // Left/Right - switch tabs
    if (key.leftArrow) {
      setActiveTab(prev => Math.max(0, prev - 1));
      setTextInputValue("");
      return;
    }
    if (key.rightArrow) {
      setActiveTab(prev => Math.min(tabs.length - 1, prev + 1));
      setTextInputValue("");
      return;
    }

    // Up/Down - select option within tab
    if (key.upArrow && currentTab.options) {
      setSelectedOption(prev => ({
        ...prev,
        [activeTab]: Math.max(0, (prev[activeTab] || 0) - 1)
      }));
      return;
    }
    if (key.downArrow && currentTab.options) {
      setSelectedOption(prev => ({
        ...prev,
        [activeTab]: Math.min(currentTab.options.length - 1, (prev[activeTab] || 0) + 1)
      }));
      return;
    }

    // Enter - select current option or trigger action
    if (key.return) {
      if (currentTab.type === "action") {
        // Mark this tab as confirmed
        setConfirmedTabs(prev => ({ ...prev, [activeTab]: true }));

        if (currentTab.onAction) {
          currentTab.onAction(values);
        }
        if (currentTab.completeOnAction && onComplete) {
          onComplete(values);
        }
        return;
      }

      if (currentTab.options) {
        const optionIndex = selectedOption[activeTab] || 0;
        const option = currentTab.options[optionIndex];

        if (option) {
          const newValues = { ...values, [currentTab.key]: option.value };
          setValues(newValues);

          // Mark this tab as confirmed (white header)
          setConfirmedTabs(prev => ({ ...prev, [activeTab]: true }));

          // If this tab has an onSelect callback
          if (currentTab.onSelect) {
            currentTab.onSelect(option.value, newValues);
          }

          // Auto-advance to next tab if not on last tab
          if (activeTab < tabs.length - 1) {
            setActiveTab(activeTab + 1);
          } else {
            // On last tab, complete setup
            if (onComplete) {
              onComplete(newValues);
            }
          }
        }
      }
      return;
    }

    // Tab - also switch tabs
    if (key.tab) {
      if (key.shift) {
        setActiveTab(prev => Math.max(0, prev - 1));
      } else {
        setActiveTab(prev => Math.min(tabs.length - 1, prev + 1));
      }
      setTextInputValue("");
      return;
    }

    // Escape - cancel
    if (key.escape) {
      if (onCancel) {
        onCancel();
      }
      return;
    }
  });

  const currentTab = tabs[activeTab];
  const currentSelection = selectedOption[activeTab] || 0;

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "#3b82f6",
      padding: 1,
      width: "100%"
    },
    // Title
    e(
      Box,
      { marginBottom: 1 },
      e(Text, { color: "#e2e8f0", bold: true }, title)
    ),
    // Tab headers - white when confirmed, purple when active, gray when pending
    e(
      Box,
      { flexDirection: "row", marginBottom: 1 },
      ...tabs.map((tab, index) => {
        const isConfirmed = confirmedTabs[index];
        const isActive = activeTab === index;
        // Color priority: active (purple) > confirmed (white) > pending (gray)
        const headerColor = isActive ? "#c4b5fd" : isConfirmed ? "#e2e8f0" : "#64748b";

        return e(
          Box,
          { key: tab.key, marginRight: 2, flexDirection: "row", gap: 1 },
          // Checkmark for confirmed tabs
          isConfirmed && !isActive && e(Text, { color: "#22c55e" }, "✓"),
          e(
            Text,
            {
              color: headerColor,
              bold: isActive || isConfirmed,
              underline: isActive
            },
            tab.label
          )
        );
      })
    ),
    // Separator
    e(Box, null, e(Text, { color: "#334155" }, "─".repeat(50))),
    // Tab content
    e(
      Box,
      { flexDirection: "column", marginTop: 1 },
      // Tab description
      currentTab.description &&
        e(
          Box,
          { marginBottom: 1 },
          e(Text, { color: "#94a3b8" }, currentTab.description)
        ),
      // Options list
      currentTab.options &&
        e(
          Box,
          { flexDirection: "column" },
          ...currentTab.options.map((option, index) => {
            const isSelected = currentSelection === index;
            const isCurrentValue = values[currentTab.key] === option.value;

            return e(
              Box,
              { key: option.value, flexDirection: "row", gap: 1 },
              // Selection indicator
              e(
                Text,
                { color: isSelected ? "#3b82f6" : "#334155" },
                isSelected ? "▸" : " "
              ),
              // Checkbox/radio
              e(
                Text,
                { color: isCurrentValue ? "#22c55e" : "#64748b" },
                isCurrentValue ? "●" : "○"
              ),
              // Option label
              e(
                Text,
                {
                  color: isSelected ? "#e2e8f0" : "#94a3b8",
                  bold: isSelected
                },
                option.label
              ),
              // Recommended badge
              option.recommended &&
                e(
                  Text,
                  { color: "#22c55e", dimColor: true },
                  " (Recommended)"
                )
            );
          })
        ),
      // Action button for action tabs
      currentTab.type === "action" &&
        e(
          Box,
          {
            marginTop: 1,
            borderStyle: currentTab.confirm ? "round" : undefined,
            borderColor: currentTab.confirm ? "#c4b5fd" : undefined,
            paddingX: currentTab.confirm ? 1 : 0
          },
          e(
            Text,
            {
              color: currentTab.confirm ? "#e2e8f0" : "#3b82f6",
              bold: Boolean(currentTab.confirm)
            },
            `Press Enter to ${currentTab.actionLabel || "continue"}`
          )
        ),
      // Info for info tabs
      currentTab.type === "info" &&
        e(
          Box,
          { flexDirection: "column", marginTop: 1 },
          e(Text, { color: "#94a3b8" }, currentTab.content || "")
        ),
      // Text input for input tabs
      currentTab.type === "input" &&
        e(
          Box,
          { flexDirection: "column", marginTop: 1 },
          e(
            Box,
            { flexDirection: "row", gap: 1 },
            e(Text, { color: "#3b82f6", bold: true }, ">"),
            e(TextInput, {
              value: textInputValue,
              onChange: handleTextInputChange,
              onSubmit: handleTextInputSubmit,
              placeholder: currentTab.placeholder || "Type here...",
              showCursor: true
            })
          ),
          // Show current value if already set
          values[currentTab.key] &&
            e(
              Box,
              { marginTop: 1, flexDirection: "row", gap: 1 },
              e(Text, { color: "#22c55e" }, "✓"),
              e(Text, { color: "#94a3b8" }, `Current: ${values[currentTab.key]}`)
            )
        )
    ),
    // Footer with navigation hints
    e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#334155" }, "─".repeat(50))
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
      e(
        Text,
        { color: "#475569", dimColor: true },
        "← → tabs   ↑ ↓ select   Enter confirm   Esc cancel"
      ),
      e(
        Text,
        { color: "#475569", dimColor: true },
        `${activeTab + 1}/${tabs.length}`
      )
    )
  );
};

/**
 * Alpaca Setup Configuration
 * Default: Live mode, Conservative risk
 */
export const getAlpacaSetupTabs = (currentConfig = {}, handlers = {}) => {
  const mode = currentConfig.mode || "paper";
  const keyPreview = currentConfig.apiKey ? `••••${currentConfig.apiKey.slice(-4)}` : null;
  const secretPreview = currentConfig.apiSecret ? `••••${currentConfig.apiSecret.slice(-4)}` : null;
  const hasKeys = keyPreview && secretPreview;
  const pendingKeyPreview = currentConfig.pendingKey ? `••••${currentConfig.pendingKey.slice(-4)}` : null;
  const pendingSecretPreview = currentConfig.pendingSecret ? `••••${currentConfig.pendingSecret.slice(-4)}` : null;
  const hasPendingKeys = pendingKeyPreview && pendingSecretPreview;

  return [
    {
      key: "mode",
      label: "Account",
      description: "Select your trading account type:",
      options: [
        { value: "paper", label: "Paper Trading", recommended: true, description: "Practice with simulated money" },
        { value: "live", label: "Live Trading", description: "Real money trading" }
      ],
      onSelect: handlers.onModeSelect
    },
    {
      key: "risk",
      label: "Risk",
      description: "Select your risk tolerance:",
      options: [
        { value: "conservative", label: "Conservative", recommended: true, description: "Blue chip, steady gains" },
        { value: "risky", label: "Risky", description: "AI/Tech/Biotech + Edgar K8 data" }
      ],
      onSelect: handlers.onRiskSelect
    },
    {
      key: "strategy",
      label: "Strategy",
      description: "Select your trading strategy:",
      options: [
        { value: "swing", label: "Swing Trading", recommended: true, description: "Hold for days/weeks" },
        { value: "daytrading", label: "Day Trading", description: "Intraday positions" },
        { value: "options", label: "Options Trading", description: "Trade options contracts" }
      ],
      onSelect: handlers.onStrategySelect
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "input",
      description: hasKeys
        ? `Current key: ${keyPreview}\n\nEnter new API Key ID to change (from Alpaca dashboard):`
        : "Enter your Alpaca API Key ID (from Alpaca dashboard):",
      placeholder: "PK...",
      onInput: handlers.onKeyInput
    },
    {
      key: "apiSecret",
      label: "Secret",
      type: "input",
      description: hasKeys
        ? `Current secret: ${secretPreview}\n\nEnter new Secret Key to change:`
        : "Enter your Alpaca Secret Key:",
      placeholder: "Your secret key...",
      onInput: handlers.onSecretInput
    },
    {
      key: "connect",
      label: "Connect",
      type: "action",
      confirm: true,
      completeOnAction: true,
      description: hasPendingKeys
        ? `Ready to connect with new keys:\n  Key: ${pendingKeyPreview}\n  Secret: ${pendingSecretPreview}\n\nPress Enter to test and save.`
        : hasKeys
          ? `Connected with: Key ${keyPreview}\n\nPress Enter to reconnect or enter new keys above.`
          : "Enter your API Key and Secret above first.",
      actionLabel: "connect to Alpaca"
    }
  ];
};

/**
 * LinkedIn Setup Configuration
 */
export const getLinkedInSetupTabs = (currentConfig = {}, handlers = {}) => [
  {
    key: "method",
    label: "Connection",
    description: "How would you like to connect LinkedIn?",
    options: [
      { value: "browser", label: "Open Browser", recommended: true, description: "Log in and capture profile" },
      { value: "manual", label: "Manual Entry", description: "Enter profile URL manually" }
    ],
    onSelect: handlers.onMethodSelect
  },
  {
    key: "capture",
    label: "Capture",
    type: "action",
    description: "Opens your browser to LinkedIn. Log in if needed.",
    actionLabel: "open LinkedIn",
    onAction: handlers.onCapture
  },
  {
    key: "confirm",
    label: "Confirm",
    type: "action",
    confirm: true,
    completeOnAction: true,
    description: "Confirm your LinkedIn setup choices.",
    actionLabel: "confirm setup"
  }
];

/**
 * Oura Ring Setup Configuration
 * API docs: https://cloud.ouraring.com/docs
 * Endpoints: /v2/usercollection/daily_activity, /v2/usercollection/sleep, etc.
 */
export const getOuraSetupTabs = (currentConfig = {}, handlers = {}) => [
  {
    key: "connection",
    label: "Connection",
    description: "Connect your Oura Ring for health metrics:",
    options: [
      { value: "token", label: "Personal Access Token", recommended: true, description: "Get from cloud.ouraring.com/personal-access-tokens" },
      { value: "oauth", label: "OAuth 2.0", description: "App-based authentication" }
    ],
    onSelect: handlers.onConnectionSelect
  },
  {
    key: "metrics",
    label: "Metrics",
    description: "Select which health data to sync:",
    options: [
      { value: "all", label: "All Metrics", recommended: true, description: "Sleep, activity, readiness, heart rate" },
      { value: "sleep", label: "Sleep Only", description: "Sleep stages, duration, quality" },
      { value: "activity", label: "Activity Only", description: "Steps, calories, movement" }
    ],
    onSelect: handlers.onMetricsSelect
  },
  {
    key: "keys",
    label: "Token",
    type: "action",
    description: "1. Go to cloud.ouraring.com/personal-access-tokens\n2. Create new token\n3. Paste in the keys file",
    actionLabel: "open keys file",
    onAction: handlers.onOpenOura
  },
  {
    key: "confirm",
    label: "Confirm",
    type: "action",
    confirm: true,
    completeOnAction: true,
    description: "Confirm your Oura setup choices.",
    actionLabel: "confirm setup"
  }
];

/**
 * AI Models Setup Configuration
 * Supports: Claude Opus 4.5, GPT-5.2, Gemini 3
 * Priority: Pro account (browser) -> API key fallback
 */
export const getLLMSetupTabs = (currentConfig = {}, handlers = {}) => [
  {
    key: "model",
    label: "Select Model",
    description: "Choose your AI model (Pro account or API key):",
    options: [
      {
        value: "gpt-5.2",
        label: "◇ OpenAI GPT-5.2",
        recommended: true,
        description: "#1 Recommended - versatile & powerful"
      },
      {
        value: "claude-opus-4.5",
        label: "◈ Anthropic Claude Opus 4.5",
        description: "#2 Recommended - deep reasoning & analysis"
      },
      {
        value: "gemini-3",
        label: "◆ Google Gemini 3",
        description: "#3 Recommended - multimodal AI"
      }
    ],
    onSelect: handlers.onModelSelect
  },
  {
    key: "connection",
    label: "Connect",
    description: "How would you like to connect?",
    options: [
      {
        value: "pro",
        label: "Pro Account (Recommended)",
        recommended: true,
        description: "Use your Claude/ChatGPT/Gemini Pro subscription"
      },
      {
        value: "api",
        label: "API Key",
        description: "Use a developer API key"
      }
    ],
    onSelect: handlers.onConnectionSelect
  },
  {
    key: "auth",
    label: "Authenticate",
    type: "action",
    description: "Opens browser to connect your account.\nIf Pro doesn't work, we'll set up API keys.",
    actionLabel: "open browser",
    onAction: handlers.onOpenAuth
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "input",
    description: "Paste your API key here (if using API method):",
    placeholder: "sk-... or AIza...",
    onInput: handlers.onApiKeyInput
  },
  {
    key: "confirm",
    label: "Confirm",
    type: "action",
    confirm: true,
    completeOnAction: true,
    description: "Confirm your AI model setup.",
    actionLabel: "confirm setup"
  }
];

/**
 * Get models setup tabs with current status
 */
export const getModelsSetupTabs = (currentConfig = {}, handlers = {}) => {
  const selectedModel = currentConfig.selectedModel || "gpt-5.2";
  const connectionType = currentConfig.connectionType || "pro";

  return [
    {
      key: "model",
      label: "Model",
      description: "Select your AI model:",
      options: [
        {
          value: "gpt-5.2",
          label: "◇ OpenAI GPT-5.2",
          recommended: true,
          description: "#1 Recommended - versatile & powerful"
        },
        {
          value: "claude-opus-4.5",
          label: "◈ Anthropic Claude Opus 4.5",
          description: "#2 Recommended - deep reasoning & analysis"
        },
        {
          value: "gemini-3",
          label: "◆ Google Gemini 3",
          description: "#3 Recommended - multimodal AI"
        }
      ],
      onSelect: handlers.onModelSelect
    },
    {
      key: "connection",
      label: "Connection",
      description: "How to connect:",
      options: [
        {
          value: "pro",
          label: "Pro Account",
          recommended: true,
          description: "Use existing Pro subscription"
        },
        {
          value: "api",
          label: "API Key",
          description: "Use developer API key"
        }
      ],
      onSelect: handlers.onConnectionSelect
    },
    {
      key: "connect",
      label: "Connect",
      type: "action",
      description: connectionType === "pro"
        ? "Opens browser to sign in with your Pro account."
        : "Opens browser to get your API key.",
      actionLabel: connectionType === "pro" ? "open Pro account" : "get API key",
      onAction: handlers.onConnect
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "input",
      description: "Paste your API key (skip if using Pro):",
      placeholder: "sk-ant-... or sk-... or AIza...",
      onInput: handlers.onApiKeyInput
    },
    {
      key: "done",
      label: "Done",
      type: "action",
      confirm: true,
      completeOnAction: true,
      description: "Save your model configuration.",
      actionLabel: "save & connect"
    }
  ];
};

/**
 * Email Setup Configuration
 * Supports Google, Microsoft Outlook, and Playwright browser capture
 */
export const getEmailSetupTabs = (currentConfig = {}, handlers = {}) => [
  {
    key: "provider",
    label: "Provider",
    description: "Select your email provider:",
    options: [
      { value: "google", label: "Google Gmail", recommended: true, description: "OAuth via Google Cloud" },
      { value: "microsoft", label: "Microsoft Outlook", description: "OAuth via Azure AD" },
      { value: "playwright", label: "Browser Capture", description: "Use Playwright to scrape" }
    ],
    onSelect: handlers.onProviderSelect
  },
  {
    key: "auth",
    label: "Authentication",
    type: "action",
    description: "Google: Enable Gmail API in Google Cloud Console\nMicrosoft: Register app in Azure AD portal",
    actionLabel: "authenticate",
    onAction: handlers.onAuthenticate
  },
  {
    key: "confirm",
    label: "Confirm",
    type: "action",
    confirm: true,
    completeOnAction: true,
    description: "Confirm email setup.",
    actionLabel: "confirm setup"
  }
];

/**
 * Calendar Setup Configuration
 * Supports Google Calendar, Microsoft Outlook, and Playwright browser capture
 */
export const getCalendarSetupTabs = (currentConfig = {}, handlers = {}) => [
  {
    key: "provider",
    label: "Provider",
    description: "Select your calendar provider:",
    options: [
      { value: "google", label: "Google Calendar", recommended: true, description: "OAuth via Google Cloud" },
      { value: "microsoft", label: "Microsoft Outlook", description: "OAuth via Azure AD" },
      { value: "playwright", label: "Browser Capture", description: "Use Playwright to scrape" }
    ],
    onSelect: handlers.onProviderSelect
  },
  {
    key: "sync",
    label: "Sync Options",
    description: "What to sync from your calendar:",
    options: [
      { value: "all", label: "All Events", recommended: true, description: "Sync all calendar events" },
      { value: "work", label: "Work Only", description: "Only work calendar" },
      { value: "personal", label: "Personal Only", description: "Only personal calendar" }
    ],
    onSelect: handlers.onSyncSelect
  },
  {
    key: "auth",
    label: "Authentication",
    type: "action",
    description: "Google: Enable Calendar API in Google Cloud Console\nMicrosoft: Register app in Azure AD portal",
    actionLabel: "authenticate",
    onAction: handlers.onAuthenticate
  },
  {
    key: "confirm",
    label: "Confirm",
    type: "action",
    confirm: true,
    completeOnAction: true,
    description: "Confirm calendar setup.",
    actionLabel: "confirm setup"
  }
];

/**
 * Project Creation Wizard Configuration
 * Multi-step wizard for creating new projects
 */
export const getProjectSetupTabs = (currentConfig = {}, handlers = {}) => [
  {
    key: "name",
    label: "Name",
    type: "input",
    description: "Enter a name for your project (max 5 words):",
    placeholder: "My New Project",
    onInput: handlers.onNameInput
  },
  {
    key: "description",
    label: "Description",
    type: "input",
    description: "Add a brief description (optional):",
    placeholder: "What this project is about...",
    onInput: handlers.onDescriptionInput
  },
  {
    key: "domain",
    label: "Domain",
    description: "Select the project's life domain:",
    options: [
      { value: "work", label: "Work & Career", description: "Professional projects" },
      { value: "personal", label: "Personal Growth", description: "Self-improvement, learning" },
      { value: "health", label: "Health & Wellness", description: "Fitness, nutrition, mental health" },
      { value: "finance", label: "Finance", description: "Money, investments, budgeting" },
      { value: "relationships", label: "Relationships", description: "Family, friends, networking" },
      { value: "creative", label: "Creative", description: "Art, music, writing, hobbies" }
    ],
    onSelect: handlers.onDomainSelect
  },
  {
    key: "confirm",
    label: "Create",
    type: "action",
    confirm: true,
    completeOnAction: true,
    description: "Review and create your project.",
    actionLabel: "create project"
  }
];

export default SetupOverlay;
