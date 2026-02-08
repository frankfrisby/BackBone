/**
 * Setup Wizard Service
 *
 * A beautiful local web-based setup wizard that walks users through
 * all BACKBONE integrations step by step.
 *
 * Features:
 * - Accordion-style UI (one step at a time)
 * - shadcn dark mode colors (neutral grays)
 * - Real company icons (SVG)
 * - Progress bar
 * - Auto-advance on completion
 * - Reset/reconnect capability
 * - Multiple AI providers support
 */

import http from "http";
import fs from "fs";
import path from "path";
import { URL } from "url";
import { EventEmitter } from "events";
import { openUrl } from "../open-url.js";

// Import actual services for real integrations
import { signInWithGoogle, getCurrentFirebaseUser, isSignedIn } from "../firebase/firebase-auth.js";
import { requestPhoneCode, verifyPhoneCode, isPhoneVerified, getVerifiedPhone } from "../firebase/phone-auth.js";
import { isProviderConfigured, saveApiKeyToEnv, validateApiKey, PROVIDERS } from "./model-key-setup.js";
import { loadAlpacaConfig, saveKeysToEnv as saveAlpacaKeys, testAlpacaConnection } from "./alpaca-setup.js";
import { isOuraConfigured, validateOuraToken, saveOuraToken } from "../health/oura-service.js";
import { isEmailConfigured, startOAuthFlow as startEmailOAuth } from "../integrations/email-calendar-service.js";
import { isPlaidConfigured, hasPlaidCredentials } from "../integrations/plaid-service.js";

import { getDataDir } from "../paths.js";
const WIZARD_PORT = 3850;
const DATA_DIR = getDataDir();

/**
 * Company SVG Icons (official brand colors and shapes)
 */
const ICONS = {
  google: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>`,

  whatsapp: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>`,

  openai: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#10a37f" d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
  </svg>`,

  anthropic: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#d4a27f" d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.521zm3.629 10.238l-2.07-5.323-2.07 5.323h4.14z"/>
  </svg>`,

  alpaca: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#FFCD00" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
    <path fill="#FFCD00" d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 9H9v-2h2v2zm0-4H9V7h2v4zm4 4h-2v-2h2v2zm0-4h-2V7h2v4z"/>
  </svg>`,

  oura: `<svg viewBox="0 0 24 24" width="24" height="24">
    <circle fill="none" stroke="#a1a1aa" stroke-width="2" cx="12" cy="12" r="10"/>
    <circle fill="none" stroke="#a1a1aa" stroke-width="2" cx="12" cy="12" r="6"/>
    <circle fill="#a1a1aa" cx="12" cy="12" r="2"/>
  </svg>`,

  gmail: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#4285F4" d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z"/>
    <path fill="#EA4335" d="M22 6l-10 7L2 6"/>
    <path fill="#FBBC05" d="M2 6v12h4V9l6 4.5"/>
    <path fill="#34A853" d="M22 6v12h-4V9l-6 4.5"/>
    <path fill="#C5221F" d="M22 6l-10 7L2 6h20z"/>
    <path fill="#fff" d="M4 8v10h3V10.5l5 3.75 5-3.75V18h3V8l-8 6-8-6z"/>
  </svg>`,

  twitter: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#fff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>`,

  linkedin: `<svg viewBox="0 0 24 24" width="24" height="24">
    <path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>`,

  plaid: `<svg viewBox="0 0 24 24" width="24" height="24">
    <rect fill="#a1a1aa" x="2" y="2" width="8" height="8" rx="1"/>
    <rect fill="#71717a" x="14" y="2" width="8" height="8" rx="1"/>
    <rect fill="#71717a" x="2" y="14" width="8" height="8" rx="1"/>
    <rect fill="#a1a1aa" x="14" y="14" width="8" height="8" rx="1"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" width="20" height="20">
    <circle cx="12" cy="12" r="11" fill="#22c55e"/>
    <path fill="#fff" d="M10 15.17l-3.17-3.17-1.41 1.41L10 18l8-8-1.41-1.41z"/>
  </svg>`,

  chevronDown: `<svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
  </svg>`,

  chevronUp: `<svg viewBox="0 0 24 24" width="20" height="20">
    <path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z"/>
  </svg>`,

  refresh: `<svg viewBox="0 0 24 24" width="16" height="16">
    <path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>`
};

/**
 * Setup steps configuration
 */
const SETUP_STEPS = [
  {
    id: "google",
    name: "Google Account",
    icon: "google",
    description: "Sign in with Google for authentication",
    required: true,
    allowMultiple: false
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "whatsapp",
    description: "Connect WhatsApp for notifications & messaging",
    required: true,
    allowMultiple: false
  },
  {
    id: "ai",
    name: "AI Models",
    icon: "openai",
    description: "Configure AI providers (can connect multiple)",
    required: true,
    allowMultiple: true,
    providers: [
      { id: "openai", name: "OpenAI", icon: "openai", description: "GPT-4, GPT-5 models" },
      { id: "anthropic", name: "Anthropic", icon: "anthropic", description: "Claude models" }
    ]
  },
  {
    id: "alpaca",
    name: "Alpaca Trading",
    icon: "alpaca",
    description: "Connect for stock trading & market data",
    required: false,
    allowMultiple: false
  },
  {
    id: "oura",
    name: "Oura Health",
    icon: "oura",
    description: "Sync health & sleep data from Oura Ring",
    required: false,
    allowMultiple: false
  },
  {
    id: "email",
    name: "Email & Calendar",
    icon: "gmail",
    description: "Connect Gmail for email access",
    required: false,
    allowMultiple: true,
    providers: [
      { id: "gmail", name: "Gmail", icon: "gmail", description: "Google email & calendar" }
    ]
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    icon: "twitter",
    description: "Connect your X account",
    required: false,
    allowMultiple: false
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: "linkedin",
    description: "Connect your LinkedIn profile",
    required: false,
    allowMultiple: false
  },
  {
    id: "plaid",
    name: "Banking (Plaid)",
    icon: "plaid",
    description: "Connect bank accounts securely",
    required: false,
    allowMultiple: true
  }
];

/**
 * Generate the wizard HTML page with accordion design
 */
const generateWizardPage = (stepStatuses = {}, activeStep = 'google', connectedProviders = {}) => {
  const completedCount = Object.values(stepStatuses).filter(s => s === 'completed').length;
  const totalSteps = SETUP_STEPS.length;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BACKBONE Setup</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      /* shadcn neutral dark mode colors */
      --bg-base: #09090b;
      --bg-card: #18181b;
      --bg-elevated: #27272a;
      --bg-hover: #3f3f46;
      --border: #27272a;
      --border-hover: #3f3f46;
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent: #f97316;
      --accent-hover: #ea580c;
      --success: #22c55e;
      --success-bg: rgba(34, 197, 94, 0.1);
      --warning: #eab308;
      --error: #ef4444;
      --radius: 8px;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-base);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.5;
    }

    .container {
      max-width: 640px;
      margin: 0 auto;
      padding: 48px 24px;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo {
      font-size: 28px;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: -0.5px;
      margin-bottom: 4px;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
    }

    /* Progress Bar */
    .progress-container {
      margin-bottom: 32px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .progress-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .progress-count {
      font-size: 13px;
      color: var(--text-muted);
    }

    .progress-bar {
      height: 6px;
      background: var(--bg-elevated);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    /* Accordion */
    .accordion {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .accordion-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      transition: border-color 0.2s;
    }

    .accordion-item:hover {
      border-color: var(--border-hover);
    }

    .accordion-item.active {
      border-color: var(--accent);
    }

    .accordion-item.completed {
      border-color: var(--success);
    }

    .accordion-header {
      display: flex;
      align-items: center;
      padding: 16px;
      cursor: pointer;
      gap: 12px;
      user-select: none;
    }

    .accordion-header:hover {
      background: var(--bg-elevated);
    }

    .step-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-elevated);
      border-radius: var(--radius);
      flex-shrink: 0;
    }

    .step-icon svg {
      width: 24px;
      height: 24px;
    }

    .step-info {
      flex: 1;
      min-width: 0;
    }

    .step-name {
      font-weight: 600;
      font-size: 15px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .step-name .badge {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .badge.required {
      background: rgba(249, 115, 22, 0.15);
      color: var(--accent);
    }

    .badge.optional {
      background: var(--bg-elevated);
      color: var(--text-muted);
    }

    .step-desc {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .step-status {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .status-badge.connected {
      background: transparent;
      color: var(--success);
      padding: 0;
    }

    .status-badge.connected svg {
      display: block;
    }

    .chevron {
      color: var(--text-muted);
      transition: transform 0.2s;
    }

    .accordion-item.active .chevron {
      transform: rotate(180deg);
    }

    .accordion-content {
      display: none;
      padding: 0 16px 16px;
    }

    .accordion-item.active .accordion-content {
      display: block;
    }

    .content-divider {
      height: 1px;
      background: var(--border);
      margin-bottom: 16px;
    }

    /* Form elements */
    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text-primary);
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .form-input::placeholder {
      color: var(--text-muted);
    }

    .form-hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      font-family: inherit;
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: var(--bg-elevated);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-hover);
      border-color: var(--border-hover);
    }

    .btn-ghost {
      background: transparent;
      color: var(--text-muted);
      padding: 8px 12px;
    }

    .btn-ghost:hover {
      background: var(--bg-elevated);
      color: var(--text-primary);
    }

    .btn-link {
      background: none;
      border: none;
      color: var(--accent);
      font-size: 13px;
      cursor: pointer;
      padding: 4px;
    }

    .btn-link:hover {
      text-decoration: underline;
    }

    .btn-group {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    /* Provider cards for multi-select */
    .provider-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .provider-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.2s;
    }

    .provider-card:hover {
      border-color: var(--border-hover);
      background: var(--bg-elevated);
    }

    .provider-card.connected {
      border-color: var(--success);
      background: var(--success-bg);
    }

    .provider-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .provider-info {
      flex: 1;
    }

    .provider-name {
      font-weight: 500;
      font-size: 14px;
    }

    .provider-desc {
      font-size: 12px;
      color: var(--text-muted);
    }

    .provider-status {
      font-size: 12px;
      color: var(--success);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Connected state */
    .connected-info {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--success-bg);
      border-radius: var(--radius);
      margin-bottom: 16px;
    }

    .connected-icon {
      color: var(--success);
    }

    .connected-text {
      flex: 1;
    }

    .connected-title {
      font-weight: 500;
      font-size: 14px;
      color: var(--success);
    }

    .connected-detail {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Message */
    .message {
      padding: 12px;
      border-radius: var(--radius);
      font-size: 13px;
      margin-bottom: 16px;
    }

    .message.success {
      background: var(--success-bg);
      color: var(--success);
    }

    .message.error {
      background: rgba(239, 68, 68, 0.1);
      color: var(--error);
    }

    .message.info {
      background: var(--bg-elevated);
      color: var(--text-secondary);
    }

    /* Loading spinner */
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--bg-elevated);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Skip link */
    .skip-section {
      text-align: center;
      margin-top: 8px;
    }

    .skip-link {
      color: var(--text-muted);
      font-size: 13px;
      text-decoration: none;
    }

    .skip-link:hover {
      color: var(--text-secondary);
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    .footer-text {
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo">BACKBONE</div>
      <div class="subtitle">Setup your integrations</div>
    </div>

    <!-- Progress Bar -->
    <div class="progress-container">
      <div class="progress-header">
        <span class="progress-label">Setup Progress</span>
        <span class="progress-count">${completedCount} of ${totalSteps} complete</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
    </div>

    <!-- Accordion Steps -->
    <div class="accordion" id="accordion">
      ${SETUP_STEPS.map((step, index) => {
        const status = stepStatuses[step.id] || 'pending';
        const isActive = step.id === activeStep;
        const isCompleted = status === 'completed';
        const providers = connectedProviders[step.id] || [];

        return `
          <div class="accordion-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" data-step="${step.id}">
            <div class="accordion-header" onclick="toggleStep('${step.id}')">
              <div class="step-icon">
                ${ICONS[step.icon] || ''}
              </div>
              <div class="step-info">
                <div class="step-name">
                  ${step.name}
                  <span class="badge ${step.required ? 'required' : 'optional'}">${step.required ? 'Required' : 'Optional'}</span>
                </div>
                <div class="step-desc">${step.description}</div>
              </div>
              <div class="step-status">
                ${isCompleted ? `
                  <span class="status-badge connected">
                    ${ICONS.check} Connected
                  </span>
                ` : ''}
                <span class="chevron">${ICONS.chevronDown}</span>
              </div>
            </div>
            <div class="accordion-content">
              <div class="content-divider"></div>
              <div id="content-${step.id}">
                ${generateStepContent(step, status, providers)}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-text">Press Ctrl+C in terminal or close this tab when done</p>
    </div>
  </div>

  <script>
    let currentStep = '${activeStep}';
    let stepStatuses = ${JSON.stringify(stepStatuses)};
    let connectedProviders = ${JSON.stringify(connectedProviders)};

    function toggleStep(stepId) {
      const items = document.querySelectorAll('.accordion-item');
      items.forEach(item => {
        if (item.dataset.step === stepId) {
          item.classList.toggle('active');
          if (item.classList.contains('active')) {
            currentStep = stepId;
          }
        } else {
          item.classList.remove('active');
        }
      });
    }

    function goToStep(stepId) {
      const items = document.querySelectorAll('.accordion-item');
      items.forEach(item => {
        if (item.dataset.step === stepId) {
          item.classList.add('active');
          currentStep = stepId;
          item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          item.classList.remove('active');
        }
      });
    }

    function nextStep() {
      const steps = ${JSON.stringify(SETUP_STEPS.map(s => s.id))};
      const currentIndex = steps.indexOf(currentStep);
      if (currentIndex < steps.length - 1) {
        goToStep(steps[currentIndex + 1]);
      }
    }

    function skipStep() {
      nextStep();
    }

    async function submitStep(stepId, data = {}) {
      const contentEl = document.getElementById('content-' + stepId);
      contentEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:20px;justify-content:center;"><div class="spinner"></div><span style="color:var(--text-muted)">Processing...</span></div>';

      try {
        const response = await fetch('/api/step/' + stepId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await response.json();

        if (result.success) {
          if (result.pending) {
            // Step needs more input (e.g., WhatsApp code verification)
            let html = '<div class="message success">' + result.message + '</div>';
            if (result.testMode && result.testCode) {
              html += '<div class="message info">Test mode - Code: ' + result.testCode + '</div>';
            }
            html += generateVerificationForm(stepId);
            contentEl.innerHTML = html;
          } else {
            // Step completed successfully
            stepStatuses[stepId] = 'completed';
            connectedProviders[stepId] = result.data ? [JSON.stringify(result.data)] : ['Connected'];
            updateStepUI(stepId, 'completed', result.data);
            updateProgressBar();

            // Auto-advance to next step after a brief delay
            setTimeout(() => nextStep(), 800);
          }
        } else {
          const step = stepsConfig.find(s => s.id === stepId);
          contentEl.innerHTML = '<div class="message error">' + (result.error || 'An error occurred') + '</div>' +
            '<button class="btn btn-secondary" onclick="location.reload()" style="margin-top:12px;">Try Again</button>';
        }
      } catch (err) {
        contentEl.innerHTML = '<div class="message error">Connection error: ' + err.message + '</div>' +
          '<button class="btn btn-secondary" onclick="location.reload()" style="margin-top:12px;">Retry</button>';
      }
    }

    function generateVerificationForm(stepId) {
      if (stepId === 'whatsapp') {
        return '<form data-step="whatsapp" style="margin-top:16px;"><div class="form-group"><label class="form-label">Verification Code</label><input type="text" name="code" class="form-input" placeholder="Enter 6-digit code" maxlength="6" required autofocus></div><button type="submit" class="btn btn-primary" style="width:100%;">Verify Code</button></form>';
      }
      return '';
    }

    function updateProgressBar() {
      const completed = Object.values(stepStatuses).filter(s => s === 'completed').length;
      const total = stepsConfig.length;
      const percent = Math.round((completed / total) * 100);
      const bar = document.querySelector('.progress-fill');
      const count = document.querySelector('.progress-count');
      if (bar) bar.style.width = percent + '%';
      if (count) count.textContent = completed + ' of ' + total + ' complete';
    }

    const stepsConfig = ${JSON.stringify(SETUP_STEPS)};
    const checkIcon = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="11" fill="#22c55e"/><path fill="#fff" d="M10 15.17l-3.17-3.17-1.41 1.41L10 18l8-8-1.41-1.41z"/></svg>';
    const refreshIcon = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';

    // Google Auth functions
    let googleAuthPollInterval = null;

    async function startGoogleAuth() {
      const buttons = document.getElementById('google-buttons');
      const status = document.getElementById('google-status');

      try {
        const response = await fetch('/api/step/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' })
        });
        const result = await response.json();

        if (result.pending) {
          // Show the status section with Check button
          if (buttons) buttons.style.display = 'none';
          if (status) status.style.display = 'block';

          // Start polling for completion every 2 seconds
          googleAuthPollInterval = setInterval(checkGoogleAuthSilent, 2000);
        } else if (result.success) {
          // Already signed in
          stepStatuses['google'] = 'completed';
          updateStepUI('google', 'completed', result.data);
          updateProgressBar();
          setTimeout(() => nextStep(), 800);
        } else {
          alert(result.error || 'Failed to start Google sign-in');
        }
      } catch (err) {
        alert('Connection error: ' + err.message);
      }
    }

    async function checkGoogleAuthSilent() {
      try {
        const response = await fetch('/api/step/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' })
        });
        const result = await response.json();

        if (result.success) {
          // Stop polling
          if (googleAuthPollInterval) {
            clearInterval(googleAuthPollInterval);
            googleAuthPollInterval = null;
          }

          stepStatuses['google'] = 'completed';
          connectedProviders['google'] = [result.data?.email || 'Google Account'];
          updateStepUI('google', 'completed', result.data);
          updateProgressBar();
          setTimeout(() => nextStep(), 800);
        }
        // If not success, just continue polling silently
      } catch (err) {
        // Ignore errors during silent polling
      }
    }

    async function checkGoogleAuth() {
      try {
        const response = await fetch('/api/step/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' })
        });
        const result = await response.json();

        if (result.success) {
          // Stop polling if running
          if (googleAuthPollInterval) {
            clearInterval(googleAuthPollInterval);
            googleAuthPollInterval = null;
          }

          stepStatuses['google'] = 'completed';
          connectedProviders['google'] = [result.data?.email || 'Google Account'];
          updateStepUI('google', 'completed', result.data);
          updateProgressBar();
          setTimeout(() => nextStep(), 800);
        } else {
          alert(result.error || 'Sign-in not complete. Please finish signing in with Google.');
        }
      } catch (err) {
        alert('Connection error: ' + err.message);
      }
    }

    // Submit AI API keys
    async function submitAIKeys() {
      const openaiKey = document.getElementById('openai-key')?.value?.trim();
      const anthropicKey = document.getElementById('anthropic-key')?.value?.trim();

      if (!openaiKey && !anthropicKey) {
        alert('Please enter at least one API key');
        return;
      }

      const providers = [];
      const errors = [];

      // Submit OpenAI key if provided
      if (openaiKey) {
        const result = await fetch('/api/step/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'openai', apiKey: openaiKey })
        }).then(r => r.json());
        if (result.success) {
          providers.push('OpenAI');
        } else {
          errors.push('OpenAI: ' + (result.error || 'Failed'));
        }
      }

      // Submit Anthropic key if provided
      if (anthropicKey) {
        const result = await fetch('/api/step/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'anthropic', apiKey: anthropicKey })
        }).then(r => r.json());
        if (result.success) {
          providers.push('Anthropic');
        } else {
          errors.push('Anthropic: ' + (result.error || 'Failed'));
        }
      }

      if (providers.length > 0) {
        stepStatuses['ai'] = 'completed';
        connectedProviders['ai'] = providers;
        updateStepUI('ai', 'completed', { providers });
        updateProgressBar();
        setTimeout(() => nextStep(), 800);
      } else if (errors.length > 0) {
        alert('Errors:\\n' + errors.join('\\n'));
      }
    }

    async function resetStep(stepId) {
      if (!confirm('Are you sure you want to disconnect this integration?')) return;

      try {
        const response = await fetch('/api/reset/' + stepId, {
          method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
          stepStatuses[stepId] = 'pending';
          connectedProviders[stepId] = [];
          updateStepUI(stepId, 'pending', null);
        }
      } catch (err) {
        alert('Failed to reset: ' + err.message);
      }
    }

    function updateStepUI(stepId, status, data) {
      const item = document.querySelector('.accordion-item[data-step="' + stepId + '"]');
      if (!item) return;

      if (status === 'completed') {
        item.classList.add('completed');
        const statusEl = item.querySelector('.step-status');
        if (statusEl && !statusEl.querySelector('.status-badge.connected')) {
          statusEl.insertAdjacentHTML('afterbegin', '<span class="status-badge connected">' + checkIcon + '</span>');
        }
      } else {
        item.classList.remove('completed');
        const badge = item.querySelector('.status-badge.connected');
        if (badge) badge.remove();
      }

      // Refresh content
      const step = stepsConfig.find(s => s.id === stepId);
      const contentEl = document.getElementById('content-' + stepId);
      if (contentEl && step) {
        contentEl.innerHTML = generateStepContentJS(step, status, connectedProviders[stepId] || []);
      }
    }

    function generateStepContentJS(step, status, providers) {
      if (status === 'completed') {
        const detail = providers.length > 0 ? providers.join(', ') : 'Integration is active';
        return '<div class="connected-info"><span class="connected-icon">' + checkIcon + '</span><div class="connected-text"><div class="connected-title">Connected</div><div class="connected-detail">' + detail + '</div></div><button class="btn-ghost" onclick="resetStep(\\'' + step.id + '\\')">' + refreshIcon + ' Reconnect</button></div>';
      }
      return '<button class="btn btn-primary" onclick="submitStep(\\'' + step.id + '\\')">Connect ' + step.name + '</button>';
    }

    // Handle form submissions
    document.addEventListener('submit', function(e) {
      if (e.target.dataset.step) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        submitStep(e.target.dataset.step, data);
      }
    });

    // Heartbeat - keeps server alive while browser is open
    // Only send when page is visible to avoid closing on tab switch
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
      }
    }, 3000); // Send heartbeat every 3 seconds

    // Notify server when tab is closing
    window.addEventListener('beforeunload', function() {
      // Use sendBeacon for reliable delivery on page close
      navigator.sendBeacon('/api/close', '{}');
    });
  </script>
</body>
</html>`;
};

/**
 * Generate content for a specific step
 */
function generateStepContent(step, status, connectedProviders = []) {
  const isCompleted = status === 'completed';

  if (isCompleted) {
    // Show connected state with reconnect option
    let detail = 'Integration is active';
    if (connectedProviders.length > 0) {
      detail = connectedProviders.join(', ');
    }

    return `
      <div class="connected-info">
        <span class="connected-icon">${ICONS.check}</span>
        <div class="connected-text">
          <div class="connected-title">Connected</div>
          <div class="connected-detail">${detail}</div>
        </div>
        <button class="btn-ghost" onclick="resetStep('${step.id}')">
          ${ICONS.refresh} Reconnect
        </button>
      </div>
    `;
  }

  // Generate form based on step type
  switch (step.id) {
    case 'google':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Sign in with your Google account to enable authentication and access to Google services.
        </p>
        <div id="google-buttons">
          <button class="btn btn-primary" onclick="startGoogleAuth()" style="width: 100%; margin-bottom: 8px;">
            ${ICONS.google} Sign in with Google
          </button>
        </div>
        <div id="google-status" style="display: none;">
          <div class="message info">Sign-in window opened. Complete authentication then click below.</div>
          <button class="btn btn-primary" onclick="checkGoogleAuth()" style="width: 100%; margin-top: 12px;">
            Check Sign-in Status
          </button>
        </div>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'whatsapp':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Connect WhatsApp to receive notifications and communicate with BACKBONE via messaging.
        </p>
        <form data-step="whatsapp">
          <div class="form-group">
            <label class="form-label">Phone Number</label>
            <input type="tel" name="phone" class="form-input" placeholder="+1 (555) 123-4567" required>
            <div class="form-hint">Enter your WhatsApp phone number with country code</div>
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary" style="flex: 1;">Send Verification Code</button>
          </div>
        </form>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'ai':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Enter your API key for at least one AI provider.
        </p>
        <div id="ai-providers-container">
          <div class="form-group" style="margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              ${ICONS.openai}
              <label class="form-label" style="margin: 0;">OpenAI API Key</label>
            </div>
            <input type="password" id="openai-key" class="form-input" placeholder="sk-...">
            <div class="form-hint">Get your key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color: var(--accent);">OpenAI Dashboard</a></div>
          </div>
          <div class="form-group" style="margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              ${ICONS.anthropic}
              <label class="form-label" style="margin: 0;">Anthropic API Key</label>
            </div>
            <input type="password" id="anthropic-key" class="form-input" placeholder="sk-ant-...">
            <div class="form-hint">Get your key from <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color: var(--accent);">Anthropic Console</a></div>
          </div>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" onclick="submitAIKeys()" style="flex: 1;">Save & Continue</button>
        </div>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'alpaca':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Connect your Alpaca account for stock trading and market data access.
        </p>
        <form data-step="alpaca">
          <div class="form-group">
            <label class="form-label">API Key</label>
            <input type="text" name="apiKey" class="form-input" placeholder="PK..." required>
          </div>
          <div class="form-group">
            <label class="form-label">Secret Key</label>
            <input type="password" name="secretKey" class="form-input" placeholder="Your secret key" required>
          </div>
          <div class="form-group">
            <label class="form-label">Environment</label>
            <select name="environment" class="form-input">
              <option value="paper">Paper Trading (Sandbox)</option>
              <option value="live">Live Trading</option>
            </select>
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary" style="flex: 1;">Connect Alpaca</button>
          </div>
        </form>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'oura':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Connect your Oura Ring to sync health, sleep, and activity data.
        </p>
        <form data-step="oura">
          <div class="form-group">
            <label class="form-label">Personal Access Token</label>
            <input type="password" name="token" class="form-input" placeholder="Your Oura access token" required>
            <div class="form-hint">Get your token from <a href="https://cloud.ouraring.com/personal-access-tokens" target="_blank" style="color: var(--accent);">Oura Cloud</a></div>
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary" style="flex: 1;">Connect Oura</button>
          </div>
        </form>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'email':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Connect your email account for email and calendar access.
        </p>
        <div class="provider-list">
          <div class="provider-card" onclick="submitStep('email', {provider: 'gmail'})">
            <div class="provider-icon">${ICONS.gmail}</div>
            <div class="provider-info">
              <div class="provider-name">Gmail</div>
              <div class="provider-desc">Google email & calendar</div>
            </div>
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;">Connect</button>
          </div>
        </div>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'twitter':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Connect your X (Twitter) account to enable social features.
        </p>
        <button class="btn btn-primary" onclick="submitStep('twitter')" style="width: 100%; background: #000;">
          ${ICONS.twitter} Sign in with X
        </button>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'linkedin':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Connect your LinkedIn profile for professional networking features.
        </p>
        <button class="btn btn-primary" onclick="submitStep('linkedin')" style="width: 100%; background: #0A66C2;">
          ${ICONS.linkedin} Sign in with LinkedIn
        </button>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    case 'plaid':
      return `
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
          Securely connect your bank accounts, credit cards, and investment accounts.
        </p>
        <button class="btn btn-primary" onclick="submitStep('plaid')" style="width: 100%;">
          ${ICONS.plaid} Connect with Plaid
        </button>
        <div class="form-hint" style="text-align: center; margin-top: 8px;">
          Bank-level security. We never see your login credentials.
        </div>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;

    default:
      return `
        <button class="btn btn-primary" onclick="submitStep('${step.id}')" style="width: 100%;">
          Connect ${step.name}
        </button>
        <div class="skip-section">
          <a href="#" class="skip-link" onclick="skipStep(); return false;">Skip for now</a>
        </div>
      `;
  }
}

/**
 * Setup Wizard Server Class
 */
export class SetupWizard extends EventEmitter {
  constructor() {
    super();
    this.server = null;
    this.userId = null;
    this.stepStatuses = {};
    this.connectedProviders = {};
    this.activeStep = 'google';
    this.lastHeartbeat = null;
    this.heartbeatTimer = null;
    this.HEARTBEAT_TIMEOUT = 10000; // 10 seconds without heartbeat = close
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeatMonitor() {
    this.lastHeartbeat = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > this.HEARTBEAT_TIMEOUT) {
        console.log('[SetupWizard] Browser disconnected (no heartbeat), stopping server');
        this.stop();
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeatMonitor() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.lastHeartbeat = null;
  }

  /**
   * Record a heartbeat from the browser
   */
  recordHeartbeat() {
    this.lastHeartbeat = Date.now();
  }

  /**
   * Load saved statuses from data file and check real service statuses
   */
  loadStatuses() {
    const statusFile = path.join(DATA_DIR, 'setup-wizard-status.json');
    try {
      if (fs.existsSync(statusFile)) {
        const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
        this.stepStatuses = data.stepStatuses || {};
        this.connectedProviders = data.connectedProviders || {};
        this.activeStep = data.activeStep || 'google';
      }
    } catch (err) {
      console.warn('[SetupWizard] Could not load statuses:', err.message);
    }

    // Always check real service statuses (overrides saved state if service is actually configured)
    this.checkRealStatuses();
  }

  /**
   * Save statuses to data file
   */
  saveStatuses() {
    const statusFile = path.join(DATA_DIR, 'setup-wizard-status.json');
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(statusFile, JSON.stringify({
        stepStatuses: this.stepStatuses,
        connectedProviders: this.connectedProviders,
        activeStep: this.activeStep
      }, null, 2));
    } catch (err) {
      console.warn('[SetupWizard] Could not save statuses:', err.message);
    }
  }

  /**
   * Find the first incomplete step
   */
  findFirstIncomplete() {
    for (const step of SETUP_STEPS) {
      if (this.stepStatuses[step.id] !== 'completed') {
        return step.id;
      }
    }
    return SETUP_STEPS[0].id;
  }

  /**
   * Handle API requests
   */
  async handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${WIZARD_PORT}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Serve main page
    if (url.pathname === '/' && req.method === 'GET') {
      this.activeStep = this.findFirstIncomplete();
      const html = generateWizardPage(this.stepStatuses, this.activeStep, this.connectedProviders);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // Handle step submission
    if (url.pathname.startsWith('/api/step/') && req.method === 'POST') {
      const stepId = url.pathname.split('/').pop();
      let body = '';

      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const result = await this.processStep(stepId, data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Handle step reset
    if (url.pathname.startsWith('/api/reset/') && req.method === 'POST') {
      const stepId = url.pathname.split('/').pop();
      this.stepStatuses[stepId] = 'pending';
      this.connectedProviders[stepId] = [];
      this.saveStatuses();
      this.emit('stepReset', stepId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Handle heartbeat (keeps server alive while browser is open)
    if (url.pathname === '/api/heartbeat' && req.method === 'POST') {
      this.recordHeartbeat();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Handle close request (browser tab closing)
    if (url.pathname === '/api/close' && req.method === 'POST') {
      console.log('[SetupWizard] Browser requested close');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      // Stop server after response is sent
      setTimeout(() => this.stop(), 100);
      return;
    }

    // Handle status request
    if (url.pathname === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        stepStatuses: this.stepStatuses,
        connectedProviders: this.connectedProviders,
        activeStep: this.activeStep
      }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Check actual status of all integrations from real services
   */
  checkRealStatuses() {
    // Google - check if signed in
    if (isSignedIn()) {
      const user = getCurrentFirebaseUser();
      this.stepStatuses.google = 'completed';
      this.connectedProviders.google = [user?.email || 'Google Account'];
    }

    // WhatsApp - check if phone verified
    const user = getCurrentFirebaseUser();
    if (user && isPhoneVerified(user.id)) {
      const phone = getVerifiedPhone(user.id);
      this.stepStatuses.whatsapp = 'completed';
      this.connectedProviders.whatsapp = [phone || 'Verified'];
    }

    // AI Models - check for any configured provider
    const aiProviders = [];
    if (isProviderConfigured('openai')) aiProviders.push('OpenAI');
    if (isProviderConfigured('anthropic')) aiProviders.push('Anthropic');
    if (isProviderConfigured('google')) aiProviders.push('Google AI');
    if (aiProviders.length > 0) {
      this.stepStatuses.ai = 'completed';
      this.connectedProviders.ai = aiProviders;
    }

    // Alpaca - check config
    const alpacaConfig = loadAlpacaConfig();
    if (alpacaConfig.apiKey && !alpacaConfig.apiKey.includes('PASTE')) {
      this.stepStatuses.alpaca = 'completed';
      this.connectedProviders.alpaca = [alpacaConfig.environment === 'live' ? 'Live Trading' : 'Paper Trading'];
    }

    // Oura - check if configured
    if (isOuraConfigured()) {
      this.stepStatuses.oura = 'completed';
      this.connectedProviders.oura = ['Oura Ring'];
    }

    // Email - check if configured
    if (isEmailConfigured()) {
      this.stepStatuses.email = 'completed';
      this.connectedProviders.email = ['Gmail'];
    }

    // Plaid - check if configured
    if (isPlaidConfigured() || hasPlaidCredentials()) {
      this.stepStatuses.plaid = 'completed';
      this.connectedProviders.plaid = ['Bank Account'];
    }
  }

  /**
   * Process a step submission - uses REAL services
   */
  async processStep(stepId, data) {
    const step = SETUP_STEPS.find(s => s.id === stepId);
    if (!step) {
      return { success: false, error: 'Unknown step' };
    }

    try {
      let result = { success: true, data: {} };

      switch (stepId) {
        case 'google': {
          // Check if already signed in
          if (isSignedIn()) {
            const user = getCurrentFirebaseUser();
            result.data = { email: user?.email };
            this.connectedProviders[stepId] = [user?.email || 'Google Account'];
            break;
          }

          // If action is 'start', initiate OAuth flow asynchronously
          if (data.action === 'start') {
            // Start OAuth flow in background - this opens a browser window
            signInWithGoogle().then(authResult => {
              if (authResult.success) {
                this.stepStatuses.google = 'completed';
                this.connectedProviders.google = [authResult.user?.email || 'Google Account'];
                this.saveStatuses();
                this.emit('stepComplete', 'google', { email: authResult.user?.email });
              }
            }).catch(err => {
              console.error('[SetupWizard] Google auth error:', err);
            });

            // Return immediately - the wizard page should poll for completion
            return {
              success: true,
              pending: true,
              message: 'Google sign-in window opened. Please complete sign-in and click "Check Status".',
              authUrl: 'http://localhost:3847'
            };
          }

          // If action is 'check', verify if sign-in completed
          if (data.action === 'check') {
            if (isSignedIn()) {
              const user = getCurrentFirebaseUser();
              result.data = { email: user?.email };
              this.connectedProviders[stepId] = [user?.email || 'Google Account'];
              break;
            } else {
              return { success: false, error: 'Not signed in yet. Please complete Google sign-in.' };
            }
          }

          // Default: start the flow
          return { success: false, error: 'Click "Sign in with Google" to start' };
        }

        case 'whatsapp': {
          // Handle phone verification - two phases: request code, then verify
          if (data.code) {
            // Phase 2: Verify the code
            const firebaseUser = getCurrentFirebaseUser();
            if (!firebaseUser) {
              return { success: false, error: 'Please sign in with Google first' };
            }
            const verifyResult = await verifyPhoneCode(firebaseUser.id, data.code);
            if (!verifyResult.success) {
              return { success: false, error: verifyResult.error, attemptsRemaining: verifyResult.attemptsRemaining };
            }
            result.data = { phone: verifyResult.phoneNumber, verified: true };
            this.connectedProviders[stepId] = [verifyResult.phoneNumber];
          } else if (data.phone) {
            // Phase 1: Request verification code
            const firebaseUser = getCurrentFirebaseUser();
            if (!firebaseUser) {
              return { success: false, error: 'Please sign in with Google first' };
            }
            const codeResult = await requestPhoneCode(firebaseUser.id, data.phone);
            if (!codeResult.success) {
              return { success: false, error: codeResult.error };
            }
            // Return pending state - need code verification
            return {
              success: true,
              pending: true,
              message: 'Verification code sent to WhatsApp',
              testMode: codeResult.testMode,
              testCode: codeResult.code // Only in test mode
            };
          } else {
            return { success: false, error: 'Phone number required' };
          }
          break;
        }

        case 'ai': {
          // Handle AI provider configuration
          let keyAdded = false;
          if (data.provider === 'openai' && data.apiKey) {
            const validation = await validateApiKey('openai', data.apiKey);
            if (!validation.valid) {
              return { success: false, error: validation.error || 'Invalid OpenAI API key' };
            }
            await saveApiKeyToEnv('openai', data.apiKey);
            const existing = this.connectedProviders[stepId] || [];
            if (!existing.includes('OpenAI')) {
              this.connectedProviders[stepId] = [...existing, 'OpenAI'];
            }
            keyAdded = true;
          } else if (data.provider === 'anthropic' && data.apiKey) {
            const validation = await validateApiKey('anthropic', data.apiKey);
            if (!validation.valid) {
              return { success: false, error: validation.error || 'Invalid Anthropic API key' };
            }
            await saveApiKeyToEnv('anthropic', data.apiKey);
            const existing = this.connectedProviders[stepId] || [];
            if (!existing.includes('Anthropic')) {
              this.connectedProviders[stepId] = [...existing, 'Anthropic'];
            }
            keyAdded = true;
          }

          // If a key was just added successfully, mark as complete
          if (keyAdded) {
            result.data = { providers: this.connectedProviders[stepId] };
            break;
          }

          // Otherwise, check if any AI is already configured
          if (!isProviderConfigured('openai') && !isProviderConfigured('anthropic')) {
            return { success: false, error: 'Please configure at least one AI provider' };
          }
          result.data = { providers: this.connectedProviders[stepId] || [] };
          break;
        }

        case 'alpaca': {
          if (!data.apiKey || !data.secretKey) {
            return { success: false, error: 'API key and secret key required' };
          }
          // Save the keys
          await saveAlpacaKeys(data.apiKey, data.secretKey, data.environment || 'paper');
          // Test the connection
          const testResult = await testAlpacaConnection();
          if (!testResult.success) {
            return { success: false, error: testResult.error || 'Failed to connect to Alpaca' };
          }
          result.data = { environment: data.environment || 'paper', account: testResult.account };
          this.connectedProviders[stepId] = [data.environment === 'live' ? 'Live Trading' : 'Paper Trading'];
          break;
        }

        case 'oura': {
          if (!data.token) {
            return { success: false, error: 'Oura access token required' };
          }
          // Validate the token
          const validation = await validateOuraToken(data.token);
          if (!validation.valid) {
            return { success: false, error: validation.error || 'Invalid Oura token' };
          }
          // Save the token
          await saveOuraToken(data.token);
          result.data = { connected: true };
          this.connectedProviders[stepId] = ['Oura Ring'];
          break;
        }

        case 'email': {
          // Start email OAuth flow
          const emailResult = await startEmailOAuth(data.provider || 'google');
          if (!emailResult.success) {
            return { success: false, error: emailResult.error || 'Email connection failed' };
          }
          result.data = { provider: data.provider || 'gmail' };
          this.connectedProviders[stepId] = ['Gmail'];
          break;
        }

        case 'twitter': {
          // Twitter/X OAuth - placeholder for now
          result.data = { message: 'X integration coming soon' };
          this.connectedProviders[stepId] = ['X Account'];
          break;
        }

        case 'linkedin': {
          // LinkedIn OAuth - placeholder for now
          result.data = { message: 'LinkedIn integration coming soon' };
          this.connectedProviders[stepId] = ['LinkedIn Profile'];
          break;
        }

        case 'plaid': {
          // Plaid Link - placeholder for now
          result.data = { message: 'Plaid integration coming soon' };
          this.connectedProviders[stepId] = ['Bank Account'];
          break;
        }

        default:
          result.data = { completed: true };
      }

      // Mark step as completed
      this.stepStatuses[stepId] = 'completed';
      this.saveStatuses();

      // Emit event for terminal UI sync
      this.emit('stepComplete', stepId, result.data);

      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Start the wizard server
   */
  async start(userId = null) {
    if (this.server) {
      return { success: true, url: `http://localhost:${WIZARD_PORT}` };
    }

    this.userId = userId;
    this.loadStatuses();

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[SetupWizard] Port ${WIZARD_PORT} in use, wizard may already be running`);
          resolve({ success: true, url: `http://localhost:${WIZARD_PORT}`, alreadyRunning: true });
        } else {
          reject(err);
        }
      });

      this.server.listen(WIZARD_PORT, () => {
        console.log(`[SetupWizard] Server running at http://localhost:${WIZARD_PORT}`);
        this.startHeartbeatMonitor();
        resolve({ success: true, url: `http://localhost:${WIZARD_PORT}` });
      });
    });
  }

  /**
   * Stop the wizard server
   */
  stop() {
    this.stopHeartbeatMonitor();
    if (this.server) {
      this.server.close();
      this.server = null;
      this.emit('stopped');
      console.log('[SetupWizard] Server stopped');
    }
  }
}

// Singleton instance
let wizardInstance = null;

export const getSetupWizard = () => {
  if (!wizardInstance) {
    wizardInstance = new SetupWizard();
  }
  return wizardInstance;
};

export const startSetupWizard = async (userId = null) => {
  const wizard = getSetupWizard();
  const result = await wizard.start(userId);
  if (result.success) {
    await openUrl(result.url);
  }
  return result;
};

export const stopSetupWizard = () => {
  if (wizardInstance) {
    wizardInstance.stop();
  }
};

export default SetupWizard;
