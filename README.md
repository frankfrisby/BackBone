# BACKBONE

<p align="center">
  <img src="assets/backbone-logo.png" alt="BACKBONE Logo" width="400">
</p>

<p align="center">
  <strong>AI-Powered Life Operating System</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#integrations">Integrations</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#autonomous-agents">Agents</a>
</p>

---

## Overview

**BACKBONE** is a comprehensive, AI-powered life management system built as a terminal-based application. It integrates multiple aspects of life — health, finances, career, goals, and more — into a single intelligent dashboard powered by Claude Opus 4.6.

Think of it as **Jarvis for your life**: a self-solving, proactive AI that manages your goals, trades stocks, monitors your health, scrapes your brokerage accounts, and sends you WhatsApp briefings — all autonomously.

## Features

### 🎯 Life Management
- **Goal Tracking**: Set and track goals across categories (finance, health, career, learning, personal, social)
- **Four-Level Hierarchy**: Core Beliefs → Backlog → Goals → Tasks, with a thinking engine that generates and prioritizes work
- **Thinking Engine**: Runs every 15 minutes to analyze beliefs, generate backlog items, graduate high-impact ideas to goals, and update your thesis
- **Progress Dashboard**: Real-time PWA dashboard at `localhost:3000/app` with SSE updates
- **Daily Briefings**: Morning and evening briefs delivered via WhatsApp
- **Proactive Scheduler**: 8 automated jobs (morning brief, market updates, goal checks, project nudges) with randomized windows and anti-spam

### 📈 Trading & Finance
- **Stock Scoring Engine**: Comprehensive 0-10 scoring system with technical analysis, MACD, volume sigma, price position, psychological momentum, earnings proximity, and time decay
- **Overnight Research**: AI-powered prediction system with 4-8 sentence analysis per ticker
- **Research Convictions**: Boost ticker scores based on deep research (decays over 2 weeks)
- **Auto-Trader**: Autonomous trading via Alpaca with anti-churning logic
- **Recession Score**: 14-component macro indicator (0-10) using Yahoo Finance, FRED API, VIX, yield curve, consumer sentiment, and more
- **Portfolio Tracking**: Real-time Alpaca integration for paper and live trading
- **Brokerage Scraping**: Visual browser automation scrapes Empower/Personal Capital for full net worth with account categories (Cash, Investment, Credit, Loan, Other Asset)

### 🏥 Health Integration
- **Oura Ring Sync**: Sleep, readiness, and activity scores
- **Calibrated Life Scoring**: Benchmarked against composite pinnacle (Musk wealth + Goggins health + Cook career + Gates philanthropy) on log scale
- **Health Dashboard**: Visualize trends across sleep, exercise, and wellness

### 💼 Career & Professional
- **LinkedIn Integration**: Profile capture, enrichment (33% → 93% completeness), and career tracking
- **Project Management**: Organized workspaces with PROJECT.md files and progress logs
- **Skill Discovery**: Engine detects repeated actions and auto-creates skill files
- **Excel Persistence**: Rolling data saved to spreadsheets for cross-session continuity

### 🤖 Autonomous AI Engine
- **13 Specialized Agents**: Auto-trader, LinkedIn, Space AI, Research, Health, Financial, Market, Social Media, Travel, Disaster, Housing, Startup, Attention
- **Agent Dispatcher**: Matches goals to agents via category + keyword routing
- **Continuous Engine**: Auto-starts on server boot with adaptive rest (15m success, 30m rate-limit, 60m quiet hours)
- **Handoff Chaining**: Saves context between engine cycles (expires after 4h)
- **Claude Opus 4.6**: Primary model with Sonnet 4.5 fallback for rate limits
- **Multi-Model Support**: Claude, GPT-4/GPT-5, Gemini — switch between tiers with Ctrl+T

### 📱 Messaging & Notifications
- **WhatsApp Integration**: Two-way messaging via Twilio with conversation memory (15-message context depth)
- **Proactive Outreach**: Scheduled briefings, trade alerts, goal check-ins, and achievement notifications
- **Cloud Function AI**: OpenAI GPT-4o-mini responds when local server is offline
- **Vapi Voice Calls**: AI phone calls via Vapi with Cole persona
- **Rich Formatting**: WhatsApp formatter converts markdown to WhatsApp-native formatting

### 🔐 Security
- **Credential Vault**: AES-256-GCM encrypted credential store (replaces plaintext .env)
- **PBKDF2 Key Derivation**: Master key from machine ID + auto-generated PIN
- **Migration System**: Auto-migrates legacy credentials from .env and JSON configs
- **AI Safety**: MCP tool responses never include credential values — only `configured: true/false`

### 🌐 Browser Automation
- **Generic Form Agent**: Reusable visual browser automation for any website
- **Popup Dismissal**: 5-strategy popup clearing (close buttons, text-based dismiss, floating banners, X icons, DOM removal)
- **Autofill Detection**: Detects browser-filled credentials and submits automatically
- **Data-First Login**: Tries data pages directly, only authenticates if redirected
- **Scroll & Capture**: 5-position scrolling with screenshots at each position for thorough data capture

### 🔄 Firebase Sync
- **Context Sync**: Comprehensive user context synced to Firebase 4x/day (7AM, 12PM, 4PM, 9PM)
- **Cloud Backup**: Projects, memory, spreadsheets, goals, and skills backed up to Firebase Storage
- **Cross-Device**: Work preserved across machines with restore capability

### 🎨 Terminal UI
- **Three View Modes**: Minimal, Core (default), Advanced — toggle with Ctrl+U
- **Agent Activity Panel**: Shows which agent is working and what it's doing
- **Onboarding Wizard**: Two-level keyboard navigation for setup (API keys, brokerages, health devices)
- **Dynamic Title**: Terminal title shows current work context ("BACKBONE · Frank · Working: goal title")
- **Responsive Layout**: Adapts to terminal size with resizable panels

### 📄 Document Generation
- **PDF/Word/PPTX/Excel Pipeline**: Generate professional documents from AI
- **Excel Spreadsheets**: Persistent data tracking with formulas and formatting
- **Skills System**: Lean Anthropic-format skill files with YAML frontmatter and progressive disclosure

## Installation

### Prerequisites
- Node.js 18+
- npm
- Git
- Playwright (auto-installed for browser automation)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/frankfrisby/BackBone.git
cd BackBone

# Install dependencies
npm install

# Start BACKBONE (launches server + CLI)
npm start
```

On first run, the onboarding wizard guides you through:
1. API key setup (Anthropic, OpenAI, Google)
2. Brokerage connections (Empower, Robinhood, Fidelity)
3. Health device linking (Oura Ring)
4. WhatsApp notifications setup

### Windows Quick Launch

```powershell
# PowerShell
.\Start-Backbone.ps1

# Or use the batch file
backbone.bat
```

## Configuration

Credentials are stored in the **encrypted vault** (`~/.backbone/users/<uid>/data/.vault.enc`). Legacy `.env` files are auto-migrated on first run.

### Required
- **Anthropic API Key**: Powers the Claude AI engine

### Optional Integrations
- **Alpaca**: Paper/live stock trading
- **Oura**: Health metrics from Oura Ring
- **Empower**: Net worth aggregation across all accounts
- **Twilio**: WhatsApp messaging (sandbox or paid)
- **Firebase**: Cloud sync and backup
- **FRED API**: Enhanced recession score with macro data
- **Vapi**: AI phone calls

## Usage

### Starting BACKBONE

```bash
npm start          # Starts server (port 3000) + terminal CLI
```

The server runs independently — closing the CLI doesn't stop background jobs (proactive scheduler, auto-trader, engine).

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | Cycle AI model tier (low/medium/high/xhigh) |
| `Ctrl+U` | Cycle view mode (Core → Advanced → Minimal) |
| `Ctrl+R` | Toggle private mode (hides sensitive data) |
| `Tab` | Autocomplete commands |
| `↑/↓` | Navigate command history / palette |
| `→` | Enter sub-menu (e.g., brokerage list) |
| `←/Esc` | Back / clear input |
| `U` | Update/re-scrape connected brokerage |

### Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/dashboard` | Life dashboard overview |
| `/goals` | Manage goals |
| `/portfolio` | View trading portfolio |
| `/tickers` | View ticker scores and signals |
| `/health` | View health metrics |
| `/thesis` | Current focus and thinking engine |
| `/backlog` | Ideas pipeline |
| `/linkedin` | LinkedIn profile management |
| `/models` | AI model configuration |
| `/project` | Create/manage projects |
| `/morning` | Morning briefing |
| `/backup` | Firebase backup status/sync |
| `/excel` | Spreadsheet management |
| `/skill` | Skill management (list/create/edit) |
| `/idle` | Idle processor status |
| `/clear` | Clear conversation |

### Ticker Scoring System

BACKBONE uses a comprehensive 0-10 scoring system:

| Score | Signal | Action |
|-------|--------|--------|
| 9.0+ | BUY++ | Extreme buy signal |
| 7.0-8.9 | BUY | Strong buy signal |
| 6.0-6.9 | BUY- | Moderate buy signal |
| 4.0-5.9 | HOLD | Hold position |
| 3.0-3.9 | SELL | Consider selling |
| <3.0 | SELL-- | Strong sell signal |

**Score Components:**
1. **Technical Score** (0-10): RSI-based momentum
2. **Prediction Score** (0-10): Overnight AI research analysis
3. **MACD Adjustment** (-2.5 to +2.5): Multi-timeframe momentum
4. **Volume Score** (-1.5 to +1.5): Volume sigma anomaly
5. **Price Position** (-1.5 to +1.5): 60-day range position
6. **Psychological** (-3.5 to +3.5): Price momentum
7. **Earnings Boost** (0 to +2): Proximity to earnings
8. **Conviction Boost** (0 to +5): Research-based conviction (decays over 2 weeks)
9. **Recession Adjustment**: Sector-specific (boosts defensive, penalizes cyclical)
10. **Penalties** (-3 to 0): Extreme price movements

## Autonomous Agents

BACKBONE runs 13 specialized AI agents, each with a unique identity and skill set:

| Agent | Domain | Description |
|-------|--------|-------------|
| **Auto-Trader** | Finance | Executes trades based on scoring algorithm |
| **Financial** | Finance | Budget analysis, savings optimization |
| **Market** | Finance | Market research and competitive analysis |
| **Health** | Health | Oura data analysis, wellness recommendations |
| **LinkedIn** | Career | Profile optimization, networking strategy |
| **Research** | Learning | Deep research on any topic |
| **Space AI** | Technology | Space industry and satellite analysis |
| **Startup** | Business | Idea evaluation state machine |
| **Social Media** | Social | Content strategy and posting |
| **Travel** | Personal | Trip planning and optimization |
| **Disaster** | Safety | 15-domain threat assessment |
| **Housing** | Personal | Real estate analysis |
| **Attention** | Productivity | Focus tracking and distraction management |

Agents are matched to goals via the **Agent Dispatcher** using category + keyword routing. Each agent has an `IDENTITY.md` file that gets injected into the Claude prompt.

## Integrations

### Alpaca Trading
Real-time portfolio tracking and autonomous trade execution.
- Paper and live trading modes
- Anti-churning logic (won't re-buy recently sold tickers)
- Position monitoring with score-based sell signals

### Oura Ring
Health metrics from your Oura Ring.
- Sleep score, stages, and duration
- Readiness score with contributors
- Activity tracking and calories
- Calibrated scoring vs. pinnacle benchmarks

### Empower / Personal Capital
Full net worth aggregation via browser automation.
- Scrapes all linked accounts (bank, investment, retirement, credit, loans)
- Categorized view: Cash, Investment, Credit, Loan, Other Asset
- Holdings with prices, shares, and daily changes
- Data bridged to MCP tools for AI queries

### LinkedIn
Career profile management.
- Automated profile scraping and enrichment
- Connection tracking
- Post and activity monitoring

### WhatsApp (Twilio)
Two-way AI messaging.
- Proactive briefings (morning/evening/market)
- Trade alerts and goal notifications
- Conversation memory (15-message context)
- Cloud function fallback when server is offline

### Firebase
Cloud sync and persistence.
- User context synced 4x/day
- File backup to Firebase Storage
- Cross-device restore
- Real-time messaging bridge

## Architecture

```
backbone/
├── src/
│   ├── app.js                          # Main React/Ink terminal application
│   ├── server.js                       # Express server (port 3000)
│   ├── commands.js                     # Command registry
│   ├── components/                     # Terminal UI components
│   │   ├── center-column.js            # Main conversation view
│   │   ├── onboarding-panel.js         # Setup wizard with keyboard nav
│   │   ├── agent-activity-panel.js     # Agent status display
│   │   ├── settings-panel.js           # Settings UI
│   │   └── ...
│   ├── mcp/                            # MCP (Model Context Protocol) servers
│   │   ├── trading-server.js           # Alpaca trading tools
│   │   ├── health-server.js            # Oura health tools
│   │   ├── brokerage-server.js         # Empower/brokerage tools
│   │   ├── whatsapp-server.js          # WhatsApp messaging tools
│   │   └── vapi-server.js              # Voice call tools
│   ├── services/
│   │   ├── ai/                         # AI orchestration
│   │   │   ├── claude-orchestrator.js  # Main AI orchestrator with agent identity
│   │   │   ├── claude-code-cli.js      # Claude Code CLI integration
│   │   │   ├── multi-ai.js            # Multi-model support (Claude/GPT/Gemini)
│   │   │   ├── model-registry.js       # Model definitions and tiers
│   │   │   └── parallel-agents.js      # Parallel agent execution
│   │   ├── engine/                     # Autonomous engine
│   │   │   ├── autonomous-engine.js    # Continuous work-rest engine
│   │   │   ├── thinking-engine.js      # Belief→backlog→goal pipeline
│   │   │   ├── agent-dispatcher.js     # Goal-to-agent matching
│   │   │   ├── startup-agent.js        # Startup idea state machine
│   │   │   └── attention-agent.js      # Focus tracking
│   │   ├── trading/                    # Trading systems
│   │   │   ├── macro-research.js       # Yahoo Finance + FRED macro data
│   │   │   └── recession-score.js      # 14-component recession indicator
│   │   ├── brokerages/                 # Brokerage integrations
│   │   │   ├── brokerage-auth.js       # Browser-based scraping + auth
│   │   │   └── brokerage-sync.js       # Data synchronization
│   │   ├── messaging/                  # Communication
│   │   │   ├── whatsapp-poller.js      # Twilio polling (30s)
│   │   │   ├── whatsapp-notifications.js
│   │   │   ├── proactive-scheduler.js  # 8 scheduled jobs
│   │   │   ├── realtime-messaging.js   # Cloud↔local bridge
│   │   │   └── conversation-memory.js  # Message persistence
│   │   ├── firebase/                   # Cloud services
│   │   │   ├── firebase-context-sync.js # 4x/day context sync
│   │   │   └── firebase-config.js      # Firebase initialization
│   │   ├── browser-form-agent.js       # Generic browser automation
│   │   ├── credential-vault.js         # AES-256-GCM encrypted vault
│   │   └── paths.js                    # Path resolution (multi-user)
├── .agents/                            # 13 agent identities
│   ├── auto-trader/                    # config.json + IDENTITY.md
│   ├── research-agent/
│   ├── health-agent/
│   └── ...
├── skills/                             # Lean Anthropic-format skill files
│   ├── skill-creator/SKILL.md          # Meta-skill for creating skills
│   ├── disaster-assessment/SKILL.md    # Directory-based with references/
│   ├── market-research.md              # Flat format skills
│   └── ...
├── tools/                              # Executable AI tools
│   ├── tool-loader.js                  # Tool discovery and execution
│   └── cli.js                          # CLI for running tools
├── apps/web/                           # PWA dashboard (Next.js)
├── dev/                                # Firebase functions, scripts, tests
├── bin/                                # CLI entry points
│   ├── backbone.js                     # Main entry
│   ├── backbone.cmd                    # Windows launcher
│   └── bootstrap-runtime.cjs          # Runtime bootstrapper
└── installer/                          # Windows installer (Inno Setup)
```

### Data Location (Per-User)

User data lives outside the codebase at `~/.backbone/users/<uid>/`:

```
~/.backbone/
  active-user.json                      # Active Google account
  users/
    <firebase-uid>/
      data/                             # Goals, settings, caches, configs
        .vault.enc                      # Encrypted credential vault
        goals.json                      # Goal definitions
        core-beliefs.json               # Core beliefs (epics)
        backlog.json                    # Ideas pipeline
        user-settings.json              # User preferences
        spreadsheets/                   # Persistent Excel files
        user-skills/                    # Custom user-defined skills
      memory/                           # AI memory (markdown)
        thesis.md                       # Current focus
        profile.md                      # User profile
        portfolio.md                    # Portfolio snapshot
        health.md                       # Health snapshot
      projects/                         # Active project workspaces
      screenshots/                      # Visual captures
```

### Key Design Decisions

- **Multi-user isolation**: All paths resolved via `paths.js` per Firebase UID
- **MCP servers**: Run as child processes, access vault directly (same OS user)
- **Credential vault**: AES-256-GCM with PBKDF2, backward-compatible with .env fallback
- **Engine adaptive rest**: 15m (success) → 30m (rate limit) → 60m (quiet hours)
- **WhatsApp poller**: Polls Twilio every 30s (no webhook server needed)
- **Skills format**: Lean YAML frontmatter + concise body, progressive disclosure via references/

## Development

### Running in Development

```bash
# Start with auto-reload
npm run dev

# Start server only (no CLI)
node src/server.js
```

### Project Structure

- `src/` — Engine source code (ES modules)
- `apps/web/` — PWA dashboard (Next.js static export)
- `tools/` — AI-executable tools with registry
- `skills/` — Task instruction files (Anthropic format)
- `dev/` — Firebase functions, build scripts, tests
- `.agents/` — Agent identity files (config.json + IDENTITY.md)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Ink](https://github.com/vadimdemedes/ink) for terminal UI
- Powered by [Claude](https://anthropic.com) AI (Opus 4.6)
- Trading via [Alpaca](https://alpaca.markets)
- Health data from [Oura](https://ouraring.com)
- Browser automation via [Playwright](https://playwright.dev)
- Messaging via [Twilio](https://twilio.com) WhatsApp API

---

<p align="center">
  <strong>BACKBONE</strong> — Your AI-Powered Life Operating System
</p>

<p align="center">
  Made with ❤️ by Frank Frisby
</p>
