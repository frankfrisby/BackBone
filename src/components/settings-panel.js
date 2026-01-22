/**
 * Settings Panel - User Configuration Dialog
 * Provides access to all BACKBONE settings including:
 * - Privacy mode
 * - View mode
 * - Fine-tuning configuration
 * - LLM model selection
 * - Agentic model configuration
 */

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";

const e = React.createElement;

// Available LLM providers
const LLM_PROVIDERS = {
  anthropic: {
    label: "Anthropic",
    icon: "◈",
    color: "#d97706",
    models: [
      { id: "claude-opus-4-5-20251101", label: "Claude Opus 4.5", tier: "flagship" },
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", tier: "balanced" },
      { id: "claude-3-5-haiku-20241022", label: "Claude Haiku 3.5", tier: "fast" }
    ]
  },
  openai: {
    label: "OpenAI",
    icon: "◎",
    color: "#22c55e",
    models: [
      { id: "gpt-4o", label: "GPT-4o", tier: "flagship" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "balanced" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", tier: "fast" },
      { id: "o1", label: "o1 (Reasoning)", tier: "reasoning" },
      { id: "o1-mini", label: "o1 Mini", tier: "reasoning" }
    ]
  },
  google: {
    label: "Google",
    icon: "◇",
    color: "#3b82f6",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tier: "flagship" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", tier: "balanced" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", tier: "fast" }
    ]
  }
};

// View mode options
const VIEW_MODES = [
  { id: "CORE", label: "Core", description: "Essential panels only" },
  { id: "ADVANCED", label: "Advanced", description: "All panels visible" },
  { id: "MINIMAL", label: "Minimal", description: "Compact single-column" }
];

// Setting categories
const SETTING_CATEGORIES = [
  { id: "general", label: "General", icon: "⚙" },
  { id: "models", label: "AI Models", icon: "◈" },
  { id: "finetune", label: "Fine-Tuning", icon: "⚡" },
  { id: "trading", label: "Trading", icon: "△" },
  { id: "privacy", label: "Privacy", icon: "◐" }
];

/**
 * Toggle Switch Component
 */
const ToggleSwitch = ({ value, onChange, label, description }) => {
  return e(
    Box,
    { flexDirection: "row", justifyContent: "space-between", paddingY: 0 },
    e(
      Box,
      { flexDirection: "column" },
      e(Text, { color: "#e2e8f0" }, label),
      description && e(Text, { color: "#64748b", dimColor: true }, description)
    ),
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: value ? "#22c55e" : "#64748b" }, value ? "ON" : "OFF"),
      e(Text, { color: value ? "#22c55e" : "#334155" }, value ? "●" : "○")
    )
  );
};

/**
 * Select Option Component
 */
const SelectOption = ({ options, value, onChange, label }) => {
  const currentOption = options.find(o => o.id === value) || options[0];

  return e(
    Box,
    { flexDirection: "row", justifyContent: "space-between", paddingY: 0 },
    e(Text, { color: "#e2e8f0" }, label),
    e(
      Box,
      { flexDirection: "row", gap: 1 },
      e(Text, { color: "#f59e0b" }, "◀"),
      e(Text, { color: "#f8fafc", bold: true }, currentOption.label),
      e(Text, { color: "#f59e0b" }, "▶")
    )
  );
};

/**
 * Model Selector Component
 */
const ModelSelector = ({ provider, model, onProviderChange, onModelChange, label, isActive }) => {
  const providerConfig = LLM_PROVIDERS[provider] || LLM_PROVIDERS.anthropic;
  const currentModel = providerConfig.models.find(m => m.id === model) || providerConfig.models[0];

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: isActive ? "single" : undefined,
      borderColor: isActive ? "#f59e0b" : undefined,
      paddingX: isActive ? 1 : 0
    },
    e(Text, { color: "#94a3b8", marginBottom: 1 }, label),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#64748b" }, "Provider:"),
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: providerConfig.color }, providerConfig.icon),
        e(Text, { color: "#f8fafc" }, providerConfig.label)
      )
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#64748b" }, "Model:"),
      e(Text, { color: "#f8fafc" }, currentModel.label)
    ),
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between" },
      e(Text, { color: "#64748b" }, "Tier:"),
      e(Text, { color: "#8b5cf6" }, currentModel.tier)
    )
  );
};

/**
 * Settings Panel Component
 */
export const SettingsPanel = ({
  onClose,
  settings,
  onSettingChange,
  fineTuningStatus,
  onStartFineTuning,
  onTestFineTuning
}) => {
  const [activeCategory, setActiveCategory] = useState(0);
  const [activeItem, setActiveItem] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState(null);

  // Current settings with defaults
  const currentSettings = {
    privateMode: false,
    viewMode: "CORE",
    baseProvider: "anthropic",
    baseModel: "claude-opus-4-5-20251101",
    agenticProvider: "anthropic",
    agenticModel: "claude-opus-4-5-20251101",
    fineTuningEnabled: false,
    autoTrading: true,
    ...settings
  };

  // Get items for current category
  const getCategoryItems = (categoryId) => {
    switch (categoryId) {
      case "general":
        return [
          { type: "toggle", key: "privateMode", label: "Private Mode", description: "Hide dollar amounts" },
          { type: "select", key: "viewMode", label: "View Mode", options: VIEW_MODES }
        ];
      case "models":
        return [
          { type: "model", key: "base", label: "Base LLM", providerKey: "baseProvider", modelKey: "baseModel" },
          { type: "model", key: "agentic", label: "Agentic Model", providerKey: "agenticProvider", modelKey: "agenticModel" }
        ];
      case "finetune":
        return [
          { type: "toggle", key: "fineTuningEnabled", label: "Fine-Tuning", description: "Create personalized AI model" },
          { type: "action", key: "startFineTune", label: "Start Fine-Tuning", description: "Generate training data and train model" },
          { type: "action", key: "testFineTune", label: "Test Model", description: "Test your fine-tuned model" },
          { type: "info", key: "ftStatus", label: "Status" }
        ];
      case "trading":
        return [
          { type: "toggle", key: "autoTrading", label: "Auto Trading", description: "Enable autonomous trading" },
          { type: "info", key: "tradingThresholds", label: "Buy: >= 8.0, Sell: <= 4.0" }
        ];
      case "privacy":
        return [
          { type: "toggle", key: "privateMode", label: "Private Mode", description: "Hide sensitive data" },
          { type: "info", key: "dataInfo", label: "Your data stays local" }
        ];
      default:
        return [];
    }
  };

  const currentCategory = SETTING_CATEGORIES[activeCategory];
  const categoryItems = getCategoryItems(currentCategory.id);

  // Handle keyboard input
  useInput((input, key) => {
    if (key.escape) {
      onClose?.();
      return;
    }

    // Category navigation with left/right
    if (key.leftArrow) {
      setActiveCategory(prev => (prev - 1 + SETTING_CATEGORIES.length) % SETTING_CATEGORIES.length);
      setActiveItem(0);
      return;
    }
    if (key.rightArrow) {
      setActiveCategory(prev => (prev + 1) % SETTING_CATEGORIES.length);
      setActiveItem(0);
      return;
    }

    // Item navigation with up/down
    if (key.upArrow && categoryItems.length > 0) {
      setActiveItem(prev => (prev - 1 + categoryItems.length) % categoryItems.length);
      return;
    }
    if (key.downArrow && categoryItems.length > 0) {
      setActiveItem(prev => (prev + 1) % categoryItems.length);
      return;
    }

    // Toggle/action with Enter or Space
    if (key.return || input === " ") {
      const item = categoryItems[activeItem];
      if (!item) return;

      if (item.type === "toggle") {
        onSettingChange?.(item.key, !currentSettings[item.key]);
      } else if (item.type === "action") {
        if (item.key === "startFineTune" && !isProcessing) {
          setIsProcessing(true);
          setMessage("Starting fine-tuning...");
          onStartFineTuning?.().then(result => {
            setIsProcessing(false);
            setMessage(result.success ? "Fine-tuning started!" : result.error);
          });
        } else if (item.key === "testFineTune" && !isProcessing) {
          setIsProcessing(true);
          setMessage("Testing model...");
          onTestFineTuning?.().then(result => {
            setIsProcessing(false);
            setMessage("Test complete - check console");
          });
        }
      } else if (item.type === "select") {
        // Cycle through options
        const currentIdx = item.options.findIndex(o => o.id === currentSettings[item.key]);
        const nextIdx = (currentIdx + 1) % item.options.length;
        onSettingChange?.(item.key, item.options[nextIdx].id);
      }
      return;
    }

    // Model provider/model cycling for model type items
    const item = categoryItems[activeItem];
    if (item?.type === "model") {
      const providers = Object.keys(LLM_PROVIDERS);
      const currentProviderIdx = providers.indexOf(currentSettings[item.providerKey]);

      if (input === "[" || input === "{") {
        // Previous provider
        const prevIdx = (currentProviderIdx - 1 + providers.length) % providers.length;
        const newProvider = providers[prevIdx];
        onSettingChange?.(item.providerKey, newProvider);
        onSettingChange?.(item.modelKey, LLM_PROVIDERS[newProvider].models[0].id);
      } else if (input === "]" || input === "}") {
        // Next provider
        const nextIdx = (currentProviderIdx + 1) % providers.length;
        const newProvider = providers[nextIdx];
        onSettingChange?.(item.providerKey, newProvider);
        onSettingChange?.(item.modelKey, LLM_PROVIDERS[newProvider].models[0].id);
      } else if (input === "-" || input === "_") {
        // Previous model
        const providerConfig = LLM_PROVIDERS[currentSettings[item.providerKey]];
        const currentModelIdx = providerConfig.models.findIndex(m => m.id === currentSettings[item.modelKey]);
        const prevIdx = (currentModelIdx - 1 + providerConfig.models.length) % providerConfig.models.length;
        onSettingChange?.(item.modelKey, providerConfig.models[prevIdx].id);
      } else if (input === "=" || input === "+") {
        // Next model
        const providerConfig = LLM_PROVIDERS[currentSettings[item.providerKey]];
        const currentModelIdx = providerConfig.models.findIndex(m => m.id === currentSettings[item.modelKey]);
        const nextIdx = (currentModelIdx + 1) % providerConfig.models.length;
        onSettingChange?.(item.modelKey, providerConfig.models[nextIdx].id);
      }
    }
  });

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "double",
      borderColor: "#f59e0b",
      padding: 1,
      width: "100%"
    },
    // Header
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(
        Box,
        { flexDirection: "row", gap: 1 },
        e(Text, { color: "#f59e0b", bold: true }, "⚙"),
        e(Text, { color: "#f59e0b", bold: true }, "SETTINGS"),
        isProcessing && e(Spinner, { type: "dots" })
      ),
      e(
        Box,
        { flexDirection: "row", gap: 2 },
        e(Text, { color: "#475569" }, "←/→"),
        e(Text, { color: "#64748b" }, "category"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, "↑/↓"),
        e(Text, { color: "#64748b" }, "navigate"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, "Enter"),
        e(Text, { color: "#64748b" }, "toggle"),
        e(Text, { color: "#334155" }, "│"),
        e(Text, { color: "#475569" }, "Esc"),
        e(Text, { color: "#64748b" }, "close")
      )
    ),

    // Category tabs
    e(
      Box,
      { flexDirection: "row", gap: 2, marginBottom: 1 },
      ...SETTING_CATEGORIES.map((cat, idx) => {
        const isActive = idx === activeCategory;
        return e(
          Box,
          {
            key: cat.id,
            paddingX: 1,
            borderStyle: isActive ? "single" : undefined,
            borderColor: isActive ? "#f59e0b" : undefined
          },
          e(Text, { color: isActive ? "#f59e0b" : "#64748b" }, `${cat.icon} ${cat.label}`)
        );
      })
    ),

    // Separator
    e(Text, { color: "#334155" }, "─".repeat(70)),

    // Settings content
    e(
      Box,
      { flexDirection: "column", paddingY: 1 },
      ...categoryItems.map((item, idx) => {
        const isActive = idx === activeItem;
        const bgColor = isActive ? "#1e293b" : undefined;

        if (item.type === "toggle") {
          return e(
            Box,
            { key: item.key, backgroundColor: bgColor, paddingX: 1, paddingY: 0 },
            e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "▸ " : "  "),
            e(ToggleSwitch, {
              value: currentSettings[item.key],
              label: item.label,
              description: item.description
            })
          );
        }

        if (item.type === "select") {
          return e(
            Box,
            { key: item.key, backgroundColor: bgColor, paddingX: 1, paddingY: 0 },
            e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "▸ " : "  "),
            e(SelectOption, {
              options: item.options,
              value: currentSettings[item.key],
              label: item.label
            })
          );
        }

        if (item.type === "model") {
          return e(
            Box,
            { key: item.key, backgroundColor: bgColor, paddingX: 1, flexDirection: "row" },
            e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "▸ " : "  "),
            e(ModelSelector, {
              provider: currentSettings[item.providerKey],
              model: currentSettings[item.modelKey],
              label: item.label,
              isActive
            }),
            isActive && e(
              Box,
              { marginLeft: 2, flexDirection: "column" },
              e(Text, { color: "#475569" }, "[/] provider"),
              e(Text, { color: "#475569" }, "-/= model")
            )
          );
        }

        if (item.type === "action") {
          return e(
            Box,
            { key: item.key, backgroundColor: bgColor, paddingX: 1, paddingY: 0 },
            e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "▸ " : "  "),
            e(Text, { color: isActive ? "#22c55e" : "#64748b" }, `[${item.label}]`),
            e(Text, { color: "#64748b" }, ` - ${item.description}`)
          );
        }

        if (item.type === "info") {
          if (item.key === "ftStatus" && fineTuningStatus) {
            return e(
              Box,
              { key: item.key, paddingX: 3, flexDirection: "column" },
              e(
                Box,
                { flexDirection: "row", gap: 2 },
                e(Text, { color: "#64748b" }, "Model:"),
                e(Text, { color: fineTuningStatus.hasFineTunedModel ? "#22c55e" : "#64748b" },
                  fineTuningStatus.hasFineTunedModel ? fineTuningStatus.fineTunedModelId : "Not trained yet")
              ),
              e(
                Box,
                { flexDirection: "row", gap: 2 },
                e(Text, { color: "#64748b" }, "Training Data:"),
                e(Text, { color: "#94a3b8" }, `${fineTuningStatus.trainingExamples || 0} examples`)
              ),
              fineTuningStatus.lastTrainingDate && e(
                Box,
                { flexDirection: "row", gap: 2 },
                e(Text, { color: "#64748b" }, "Last Trained:"),
                e(Text, { color: "#94a3b8" }, new Date(fineTuningStatus.lastTrainingDate).toLocaleDateString())
              )
            );
          }
          return e(
            Box,
            { key: item.key, paddingX: 3 },
            e(Text, { color: "#475569" }, item.label)
          );
        }

        return null;
      })
    ),

    // Message display
    message && e(
      Box,
      { marginTop: 1, paddingX: 1 },
      e(Text, { color: "#f59e0b" }, message)
    ),

    // Footer
    e(
      Box,
      { marginTop: 1 },
      e(Text, { color: "#475569", dimColor: true },
        currentCategory.id === "models"
          ? "Use [ ] to change provider, - = to change model"
          : "Press Enter to toggle, Esc to close"
      )
    )
  );
};

export default SettingsPanel;
