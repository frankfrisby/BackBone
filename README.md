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
  <a href="#architecture">Architecture</a>
</p>

---

## Overview

**BACKBONE** is a comprehensive, AI-powered life management system built as a terminal-based application. It integrates multiple aspects of life - health, finances, career, goals, and more - into a single intelligent dashboard that helps you track progress, make decisions, and automate routine tasks.

Think of it as your personal AI assistant that understands your life holistically and helps you make better decisions across all domains.

## Features

### 🎯 Life Management
- **Goal Tracking**: Set and track goals across categories (finance, health, career, education, personal)
- **Progress Dashboard**: Real-time visualization of life metrics and progress
- **Daily Accountability**: Morning briefings, check-ins, and commitment tracking
- **Focus Timer**: Pomodoro-style focus sessions with streak tracking
- **Learning Tracker**: Track books, courses, and educational progress

### 📈 Trading & Finance
- **Stock Scoring Engine**: Comprehensive 0-10 scoring system with:
  - Technical analysis (RSI, MACD, volume sigma)
  - Price position analysis (60-day range)
  - Psychological momentum adjustments
  - Earnings proximity boost
  - Time decay penalties
- **Top 3 Buy Signals**: Automatically identifies best trading opportunities
- **Portfolio Tracking**: Real-time Alpaca integration for live trading
- **Wealth Management**: Personal Capital/Empower integration

### 🏥 Health Integration
- **Oura Ring Sync**: Sleep, readiness, and activity scores
- **Health Goals**: Track sleep, exercise, and wellness metrics
- **Health Dashboard**: Visualize trends and correlations

### 💼 Career & Professional
- **LinkedIn Integration**: Profile capture and career tracking
- **Work Projects**: Organize and track professional projects
- **Skill Development**: Track learning and growth

### 🤖 AI Engine
- **Dynamic Status**: Shows what the AI is doing (Researching, Thinking, Planning, Building, etc.)
- **Project Threading**: Rolling message history for each project
- **Autonomous Actions**: AI proposes and executes tasks with approval workflow
- **Multi-Model Support**: Claude, GPT-4, Gemini - switch between tiers

### 📦 Solution Manager
- **Isolated Packages**: Install packages for specific solutions without affecting core
- **Container-like**: Each solution has its own dependencies
- **Clean Removal**: Delete solutions and their packages cleanly

### 🎨 Flexible UI
- **Three View Modes**: Minimal, Core (default), Advanced
- **Ctrl+U Toggle**: Quickly switch between views
- **Responsive Layout**: Adapts to terminal size

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/frankfrisby/BackBone.git
cd BackBone

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your API keys in .env
# See Configuration section below

# Start BACKBONE
npm start
```

## Configuration

Create a `.env` file with your API keys:

```env
# AI Models (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Trading (optional)
ALPACA_KEY=...
ALPACA_SECRET=...
ALPACA_PAPER=true  # Set to false for live trading

# Health (optional)
OURA_ACCESS_TOKEN=...

# Finance (optional)
PERSONAL_CAPITAL_EMAIL=...
PERSONAL_CAPITAL_PASSWORD=...
```

## Usage

### Starting BACKBONE

```bash
npm start
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | Cycle AI model tier (low/medium/high/xhigh) |
| `Ctrl+U` | Cycle view mode (Core → Advanced → Minimal) |
| `Ctrl+R` | Toggle private mode (hides sensitive data) |
| `Tab` | Autocomplete commands |
| `↑/↓` | Navigate command palette |
| `Esc` | Clear input / close overlay |

### Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/dashboard` | Life dashboard overview |
| `/goals` | Manage goals |
| `/portfolio` | View trading portfolio |
| `/tickers` | View ticker scores |
| `/health` | View health metrics |
| `/linkedin` | Capture LinkedIn profile |
| `/models` | AI model configuration |
| `/project` | Create/manage projects |
| `/focus` | Start focus timer |
| `/learn` | Learning tracker |
| `/morning` | Morning briefing |
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

**Top 3 Candidates**: Tickers with score ≥6.0 are highlighted with green background.

### Score Components

1. **Technical Score** (0-10): RSI-based momentum
2. **MACD Adjustment** (-2.5 to +2.5): Multi-timeframe momentum
3. **Volume Score** (-1.5 to +1.5): Volume sigma anomaly
4. **Price Position** (-1.5 to +1.5): 60-day range position
5. **Psychological** (-3.5 to +3.5): Price momentum
6. **Earnings Boost** (0 to +2): Proximity to earnings
7. **Penalties** (-3 to 0): Extreme price movements

## Integrations

### Alpaca Trading
Real-time portfolio tracking and trade execution.
- Paper trading for testing
- Live trading support
- Position monitoring
- Order management

### Oura Ring
Health metrics integration.
- Sleep score and stages
- Readiness score
- Activity tracking
- Heart rate data

### LinkedIn
Career profile capture.
- Profile data extraction
- Connection tracking
- Career progress

### Personal Capital / Empower
Wealth management integration.
- Account aggregation
- Net worth tracking
- Investment analysis

### AI Models
Multi-model support with tier switching.
- **Claude** (Anthropic): Primary AI
- **GPT-4** (OpenAI): Alternative
- **Gemini** (Google): Backup

## Architecture

```
backbone/
├── src/
│   ├── app.js                 # Main React/Ink application
│   ├── commands.js            # Command registry
│   ├── components/            # UI components
│   │   ├── ticker-scores-panel.js
│   │   ├── engine-status-panel.js
│   │   ├── projects-panel.js
│   │   └── ...
│   ├── services/              # Business logic
│   │   ├── score-engine.js    # Ticker scoring
│   │   ├── engine-state.js    # Engine status
│   │   ├── solution-manager.js # Package isolation
│   │   ├── autonomous-engine.js
│   │   └── ...
│   ├── data/                  # Data models
│   └── config/                # Configuration
├── bin/                       # CLI entry point
├── memory/                    # Persistent markdown files
├── projects/                  # Project workspaces
├── solutions/                 # Isolated solution packages
└── data/                      # Runtime data (JSON)
```

### Key Services

- **Score Engine**: Calculates comprehensive ticker scores (0-10)
- **Engine State**: Manages dynamic status display
- **Solution Manager**: Isolated package management
- **Autonomous Engine**: AI-driven task automation
- **Goal Tracker**: Life goal management
- **Work Log**: Activity logging

## Development

### Running in Development

```bash
# Run with auto-reload
npm run dev

# Run with mock data
USE_MOCK_DATA=true npm start
```

### Testing

```bash
npm test
```

### Building

```bash
npm run build
```

## Solution Manager

BACKBONE includes a unique solution manager for isolated package installations:

```javascript
// Create a solution with specific packages
const solution = await solutionManager.createSolution({
  name: "Calendar Manager",
  description: "Manage Google Calendar",
  packages: ["googleapis", "google-auth-library"]
});

// Run the solution
const result = await solutionManager.runSolution(solution.id, context);

// Delete when done (removes all packages)
await solutionManager.deleteSolution(solution.id);
```

This keeps solutions isolated from the core project dependencies.

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
- Powered by [Claude](https://anthropic.com) AI
- Trading via [Alpaca](https://alpaca.markets)
- Health data from [Oura](https://ouraring.com)

---

<p align="center">
  <strong>BACKBONE</strong> - Your AI-Powered Life Operating System
</p>

<p align="center">
  Made with ❤️ by Frank Frisby
</p>
