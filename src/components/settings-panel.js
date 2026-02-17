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
import { getBrokerageStatuses, connectBrokerage, disconnectBrokerage } from "../services/brokerages/brokerage-auth.js";

const e = React.createElement;

// Available LLM providers
const LLM_PROVIDERS = {
  anthropic: {
    label: "Anthropic",
    icon: "◈",
    color: "#d97706",
    models: [
      { id: "claude-opus-4-6", label: "Claude Opus 4.6", tier: "flagship" },
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
  { id: "general", label: "General", icon: "G" },
  { id: "connections", label: "Communications", icon: "C" },
  { id: "models", label: "AI Models", icon: "M" },
  { id: "finetune", label: "Fine-Tuning", icon: "F" },
  { id: "trading", label: "Trading", icon: "T" },
  { id: "privacy", label: "Privacy", icon: "P" }
];
const DEFAULT_CATEGORY_INDEX = Math.max(
  SETTING_CATEGORIES.findIndex((cat) => cat.id === "connections"),
  0
);

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
  const currentOption = options.find(o => (o.id ?? o.value) === value) || options[0];

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
  const [activeCategory, setActiveCategory] = useState(DEFAULT_CATEGORY_INDEX);
  const [activeItem, setActiveItem] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [brokerageStatuses, setBrokerageStatuses] = useState(() => {
    try { return getBrokerageStatuses(); } catch { return {}; }
  });

  // Current settings with defaults
  const currentSettings = {
    privateMode: false,
    viewMode: "CORE",
    baseProvider: "anthropic",
    baseModel: "claude-opus-4-6",
    agenticProvider: "anthropic",
    agenticModel: "claude-opus-4-6",
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
      case "connections":
        return [
          { type: "whatsapp", key: "whatsappStatus", label: "WhatsApp Communication" },
          { type: "action", key: "refreshWhatsApp", label: "Refresh WhatsApp", description: "Check connection status" },
          { type: "action", key: "pairWhatsApp", label: "Connect WhatsApp (QR)", description: "Show QR and scan from your phone" },
          { type: "action", key: "pairCodeWhatsApp", label: "Generate Pairing Code", description: "Fallback: link with phone number" },
          { type: "action", key: "testTwilio", label: "Test Twilio", description: "Validate Twilio credentials and account auth" },
          { type: "action", key: "preferTwilio", label: "Prefer Twilio Outbound", description: "Keep Baileys available, route sends through Twilio first" },
          { type: "action", key: "preferBaileys", label: "Prefer Baileys Outbound", description: "Keep Twilio available, route sends through Baileys first" }
        ];
      case "models":
        return [
          { type: "model", key: "base", label: "Base LLM", providerKey: "baseProvider", modelKey: "baseModel" },
          { type: "model", key: "agentic", label: "Agentic Model", providerKey: "agenticProvider", modelKey: "agenticModel" },
          { type: "select", key: "pointAI", label: "Point AI (tried first)", options: [
            { value: "claude", label: "Claude Code CLI" },
            { value: "codex", label: "OpenAI Codex" }
          ] }
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
          { type: "brokerage", key: "empower", label: "Empower", brokerageId: "empower" },
          { type: "brokerage", key: "robinhood", label: "Robinhood", brokerageId: "robinhood" },
          { type: "brokerage", key: "fidelity", label: "Fidelity", brokerageId: "fidelity" },
          { type: "separator", key: "brokerage-sep", label: "Trading" },
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

  const resolveUsPhone = useCallback(() => {
    const raw = String(currentSettings.phoneNumber || currentSettings.phone || "").trim();
    const normalized = raw.replace(/[^\d+]/g, "");
    if (!normalized) return null;
    const usNormalized = normalized.startsWith("+")
      ? normalized
      : normalized.length === 10
        ? `+1${normalized}`
        : normalized.length === 11 && normalized.startsWith("1")
          ? `+${normalized}`
          : normalized;
    return /^\+1\d{10}$/.test(usNormalized) ? usNormalized : null;
  }, [currentSettings.phoneNumber, currentSettings.phone]);

  const loadWhatsAppStatus = useCallback(async ({ autoPair = false, testTwilio = false, silent = false } = {}) => {
    setWhatsAppLoading(true);
    try {
      const phone = resolveUsPhone();
      const params = new URLSearchParams();
      if (autoPair) params.set("autoPair", "1");
      if (testTwilio) params.set("testTwilio", "1");
      if (phone) params.set("phone", phone);
      const query = params.toString();
      const url = `http://localhost:3000/api/whatsapp/status${query ? `?${query}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load WhatsApp status");
      setWhatsAppStatus(data);

      const connected = data?.providers?.baileys?.connected === true;
      const qrAscii = typeof data?.providers?.baileys?.qrAscii === "string" ? data.providers.baileys.qrAscii.trim() : "";
      const generatedCode = data?.pairing?.pairingCode || null;
      if (generatedCode) {
        setPairingCode(generatedCode);
        if (!silent) {
          setMessage(`Pairing code generated for ${phone}. Enter it in WhatsApp Linked Devices.`);
        }
      } else if (connected) {
        setPairingCode(null);
        if (!silent) {
          setMessage("WhatsApp is connected.");
        }
      } else if (qrAscii && !silent) {
        setMessage("QR ready. On your phone: WhatsApp > Settings > Linked Devices > Link a device, then scan this QR.");
      } else if (testTwilio && !silent) {
        const twilioOk = data?.providers?.twilio?.authOk === true;
        if (twilioOk) {
          setMessage("Twilio auth is valid.");
        } else {
          const err = data?.providers?.twilio?.lastError || data?.twilio?.error || "Twilio auth test failed";
          setMessage(`Twilio test failed: ${err}`);
        }
      }
    } catch (err) {
      if (!silent) {
        setMessage(`WhatsApp status error: ${err.message}`);
      }
    } finally {
      setWhatsAppLoading(false);
    }
  }, [resolveUsPhone]);

  const requestPairingCode = useCallback(async ({ silent = false } = {}) => {
    const phone = resolveUsPhone();
    if (!phone) {
      setMessage("Set phone number first in onboarding (required format: +1XXXXXXXXXX).");
      return;
    }

    setWhatsAppLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/whatsapp/baileys/pairing-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not generate pairing code");

      await loadWhatsAppStatus({ autoPair: false, silent: true });

      if (!data?.pairingCode) {
        throw new Error(data?.error || "Could not generate pairing code");
      }

      setPairingCode(data.pairingCode);
      if (!silent) {
        setMessage(`Pairing code generated for ${phone}. Enter it in WhatsApp Linked Devices.`);
      }
    } catch (err) {
      if (!silent) {
        setMessage(`Pairing code error: ${err.message}`);
      }
    } finally {
      setWhatsAppLoading(false);
    }
  }, [resolveUsPhone, loadWhatsAppStatus]);

  const testTwilioConnection = useCallback(async ({ silent = false } = {}) => {
    setWhatsAppLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/whatsapp/twilio/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await res.json();
      await loadWhatsAppStatus({ autoPair: false, testTwilio: true, silent: true });
      if (!res.ok) {
        const err = data?.error || data?.twilio?.lastError || "Twilio auth test failed";
        throw new Error(err);
      }
      if (!silent) setMessage("Twilio auth is valid.");
    } catch (err) {
      if (!silent) {
        setMessage(`Twilio test error: ${err.message}`);
      }
    } finally {
      setWhatsAppLoading(false);
    }
  }, [loadWhatsAppStatus]);

  const setPreferredWhatsAppProvider = useCallback(async (provider, { silent = false } = {}) => {
    setWhatsAppLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/whatsapp/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not update provider preference");
      await loadWhatsAppStatus({ autoPair: false, testTwilio: false, silent: true });
      if (!silent) {
        setMessage(`Provider preference saved: ${provider}`);
      }
    } catch (err) {
      if (!silent) {
        setMessage(`Provider preference error: ${err.message}`);
      }
    } finally {
      setWhatsAppLoading(false);
    }
  }, [loadWhatsAppStatus]);

  useEffect(() => {
    if (currentCategory.id === "connections") {
      loadWhatsAppStatus({ autoPair: false, silent: true });
    }
  }, [currentCategory.id, loadWhatsAppStatus]);

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
        } else if (item.key === "refreshWhatsApp" && !whatsAppLoading) {
          loadWhatsAppStatus();
        } else if (item.key === "pairWhatsApp" && !whatsAppLoading) {
          loadWhatsAppStatus({ autoPair: false });
        } else if (item.key === "pairCodeWhatsApp" && !whatsAppLoading) {
          requestPairingCode();
        } else if (item.key === "testTwilio" && !whatsAppLoading) {
          testTwilioConnection();
        } else if (item.key === "preferTwilio" && !whatsAppLoading) {
          setPreferredWhatsAppProvider("twilio");
        } else if (item.key === "preferBaileys" && !whatsAppLoading) {
          setPreferredWhatsAppProvider("baileys");
        }
      } else if (item.type === "select") {
        // Cycle through options
        const currentIdx = item.options.findIndex(o => (o.id ?? o.value) === currentSettings[item.key]);
        const nextIdx = (currentIdx + 1) % item.options.length;
        onSettingChange?.(item.key, item.options[nextIdx].id ?? item.options[nextIdx].value);
      } else if (item.type === "brokerage" && !isProcessing) {
        const status = brokerageStatuses[item.brokerageId];
        if (status?.connected && !status?.expired) {
          // Disconnect
          setIsProcessing(true);
          setMessage(`Disconnecting ${item.label}...`);
          const result = disconnectBrokerage(item.brokerageId);
          setBrokerageStatuses(getBrokerageStatuses());
          setMessage(result.message);
          setIsProcessing(false);
        } else {
          // Connect via browser
          setIsProcessing(true);
          setMessage(`Opening ${item.label} login... (complete in browser)`);
          connectBrokerage(item.brokerageId).then(result => {
            setBrokerageStatuses(getBrokerageStatuses());
            setMessage(result.message);
            setIsProcessing(false);
          });
        }
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

        if (item.type === "whatsapp") {
          const bailey = whatsAppStatus?.providers?.baileys || {};
          const twilio = whatsAppStatus?.providers?.twilio || {};
          const connected = bailey.connected === true;
          const requiresPairing = bailey.requiresPairing === true || bailey.lastDisconnectCode === 401;
          const statusColor = connected ? "#22c55e" : "#f59e0b";
          const twilioAuthOk = twilio.authOk === true;
          const twilioColor = twilioAuthOk ? "#22c55e" : twilio.hasCredentials ? "#f59e0b" : "#ef4444";
          const phone = currentSettings.phoneNumber || currentSettings.phone || "not set";
          const qrAscii = typeof bailey.qrAscii === "string" ? bailey.qrAscii.trim() : "";
          const hasQr = Boolean(qrAscii);

          return e(
            Box,
            { key: item.key, backgroundColor: bgColor, paddingX: 1, flexDirection: "column" },
            e(
              Box,
              { flexDirection: "row", gap: 1 },
              e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "â–¸ " : "  "),
              e(Text, { color: "#e2e8f0", bold: true }, "WhatsApp Status"),
              whatsAppLoading && e(Spinner, { type: "dots" })
            ),
            e(
              Box,
              { paddingLeft: 3, flexDirection: "column" },
              e(Text, { color: "#94a3b8" }, `Provider: ${whatsAppStatus?.provider || "baileys"}`),
              e(Text, { color: statusColor }, `Baileys: ${connected ? "Connected" : "Not connected"}`),
              e(Text, { color: twilioColor }, `Twilio: ${twilioAuthOk ? "Authenticated" : (twilio.hasCredentials ? "Credentials loaded, auth failed" : "Credentials missing")}`),
              twilio.accountName && e(Text, { color: "#94a3b8" }, `Twilio account: ${twilio.accountName}`),
              e(Text, { color: "#94a3b8" }, `Phone: ${phone}`),
              e(Text, { color: "#94a3b8" }, `Preferred outbound provider: ${whatsAppStatus?.providerPreference || "baileys"}`),
              requiresPairing && e(Text, { color: "#f59e0b" }, "Pairing required: WhatsApp > Settings > Linked Devices"),
              hasQr && e(Text, { color: "#22c55e" }, "QR ready: scan below from WhatsApp Linked Devices"),
              hasQr && e(Text, { color: "#22c55e" }, qrAscii),
              pairingCode && e(Text, { color: "#22c55e", bold: true }, `Pairing code: ${pairingCode}`),
              pairingCode && e(Text, { color: "#94a3b8" }, "On your phone: WhatsApp > Settings > Linked Devices > Link a device > Link with phone number instead"),
              pairingCode && e(Text, { color: "#64748b" }, "Pairing codes expire quickly. If rejected, generate a new one and enter it immediately."),
              !connected && !hasQr && !pairingCode && e(Text, { color: "#64748b" }, "Use [Connect WhatsApp (QR)] to show QR first."),
              twilio.lastError && e(Text, { color: "#ef4444" }, `Twilio error: ${twilio.lastError}`),
              twilio.errorCode && e(Text, { color: "#ef4444" }, `Twilio code: ${twilio.errorCode}`),
              bailey.lastError && e(Text, { color: "#ef4444" }, `Last error: ${bailey.lastError}`)
            )
          );
        }

        if (item.type === "brokerage") {
          const bs = brokerageStatuses[item.brokerageId] || {};
          const icon = bs.connected && !bs.expired ? "\u2713" : bs.expired ? "\u26A0" : "\u25CB";
          const color = bs.connected && !bs.expired ? "#22c55e" : bs.expired ? "#f59e0b" : "#64748b";
          const detail = bs.connected && !bs.expired
            ? `Last sync: ${bs.lastSync ? new Date(bs.lastSync).toLocaleDateString() : "unknown"}`
            : bs.expired ? "Session expired" : "Not connected";
          const hint = isActive ? (bs.connected && !bs.expired ? " [Enter to disconnect]" : " [Enter to connect]") : "";
          return e(
            Box,
            { key: item.key, backgroundColor: bgColor, paddingX: 1, paddingY: 0 },
            e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "\u25B8 " : "  "),
            e(Text, { color }, `${icon} ${item.label}`),
            e(Text, { color: "#64748b" }, ` \u00B7 ${detail}${hint}`)
          );
        }

        if (item.type === "separator") {
          return e(
            Box,
            { key: item.key, paddingX: 1, paddingY: 0 },
            e(Text, { color: "#475569" }, `\u2500\u2500\u2500 ${item.label} \u2500\u2500\u2500`)
          );
        }

        if (item.type === "action") {
          return e(
            Box,
            { key: item.key, backgroundColor: bgColor, paddingX: 1, paddingY: 0 },
            e(Text, { color: isActive ? "#f59e0b" : "#334155" }, isActive ? "\u25B8 " : "  "),
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
          : currentCategory.id === "connections"
            ? "Keep both channels: use QR for Baileys, Test Twilio for cloud-function path."
            : "Press Enter to toggle, Esc to close"
      )
    )
  );
};

export default SettingsPanel;

