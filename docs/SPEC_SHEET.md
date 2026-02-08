# BACKBONE ENGINE - Technical Specification Sheet

**Version:** 3.0.0
**Last Updated:** 2026-01-21
**Platform:** Node.js CLI (Ink/React)
**Author:** AGI Engine Team

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [UI Layout Structure](#ui-layout-structure)
4. [Section 1: Header Bar (Top)](#section-1-header-bar-top)
5. [Section 2: Left Sidebar](#section-2-left-sidebar)
6. [Section 3: Center Section](#section-3-center-section)
7. [Section 4: Right Sidebar](#section-4-right-sidebar)
8. [Section 5: Bottom Control Bar](#section-5-bottom-control-bar)
9. [Services Layer](#services-layer)
10. [Data Layer](#data-layer)
11. [MCP Servers](#mcp-servers)
12. [API Integrations](#api-integrations)
13. [Autonomous Trading System](#autonomous-trading-system)
14. [Testing Framework](#testing-framework)
15. [OpenAI Fine-Tuning Setup](#openai-fine-tuning-setup)
16. [Configuration](#configuration)
17. [Commands Reference](#commands-reference)
18. [Color Palette](#color-palette)
19. [Performance Optimizations](#performance-optimizations)

---

## System Overview

BACKBONE is an AI-powered Life Operating System built as a terminal-based CLI application. It provides:

- **Autonomous Trading**: Automated stock trading via Alpaca API with score-based buy/sell signals
- **Life Progress Tracking**: Health, finance, career, family, growth, and education metrics
- **Goal Management**: Track and achieve personal and professional goals
- **AI Conversation**: Claude AI integration for intelligent assistance
- **Multi-Service Integration**: LinkedIn, Oura, Yahoo Finance, Personal Capital, and more
- **Real-time Dashboard**: Live updates with minimal flickering

### Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| UI Framework | Ink 6.6.0 (React for CLI) |
| AI Engine | Anthropic Claude API |
| Trading | Alpaca Markets API |
| Market Data | Yahoo Finance |
| Health | Oura Ring API |
| Finance | Personal Capital SDK |
| Professional | LinkedIn (Playwright scraping) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKBONE ENGINE v3.0.0                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    CONNECTION BAR (Header)                   │   │
│  │  ◆ BACKBONE ENGINE v3.0.0 │ 5/7 connected                   │   │
│  │  ● Alpaca │ ● Claude │ ● Code │ ○ LinkedIn │ ● Oura │ ● Yahoo │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌──────────────┬────────────────────────────┬──────────────────┐   │
│  │  LEFT (25%)  │      CENTER (50%)          │   RIGHT (25%)    │   │
│  │              │                            │                  │   │
│  │  Progress    │   Engine Status Panel      │   Portfolio      │   │
│  │  ├ Finance   │   ├ Status: Ready          │   ├ Equity       │   │
│  │  ├ Health    │   ├ Current Plan           │   ├ P/L Today    │   │
│  │  ├ Career    │   └ Active Projects        │   └ Positions    │   │
│  │  └ Growth    │                            │                  │   │
│  │              │   Conversation Panel       │   Trading        │   │
│  │  Goals       │   ├ User messages          │   History        │   │
│  │  ├ Goal 1    │   └ AI responses           │   ├ 8 weeks      │   │
│  │  └ Goal 2    │                            │   └ Projections  │   │
│  │              │   Chat Panel (Input)       │                  │   │
│  │  Ticker      │   ├ Command mode (/)       │   Connections    │   │
│  │  Scores      │   └ Conversation mode      │   Status         │   │
│  │  ├ Top 20    │                            │                  │   │
│  │  └ BUY/HOLD  │                            │                  │   │
│  └──────────────┴────────────────────────────┴──────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## UI Layout Structure

### Layout Distribution

| Section | Width | Position | Components |
|---------|-------|----------|------------|
| Header | 100% | Top | ConnectionBar |
| Left Sidebar | 25% | Left | LifeScoresPanel, GoalProgressPanel, TickerScoresPanel, ProjectsPanel |
| Center | 50% | Middle | EngineStatusPanel, ConversationPanel, ChatPanel |
| Right Sidebar | 25% | Right | PortfolioPanel, TradingHistoryPanel, ConnectionsStatusPanel |

### View Modes

| Mode | Description | Left Width | Center Width | Right Width |
|------|-------------|------------|--------------|-------------|
| MINIMAL | Compact view | Hidden | 75% | 25% |
| STANDARD | Default view | 25% | 50% | 25% |
| ADVANCED | Full features | 25% | 50% | 25% |

---

## Section 1: Header Bar (Top)

### Component: `ConnectionBar`

**File:** `src/components/connection-bar.js`

**Purpose:** Display application title, version, and real-time connection status for all integrated services.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| connections | object | {} | Connection status for each service |
| title | string | "BACKBONE" | Application title |
| version | string | "" | Version number |

#### Service Configuration

```javascript
const SERVICE_CONFIG = {
  alpaca: { color: "#22c55e", dimColor: "#166534", icon: "△", label: "Alpaca" },
  claude: { color: "#d97706", dimColor: "#92400e", icon: "◈", label: "Claude" },
  claudeCode: { color: "#f59e0b", dimColor: "#b45309", icon: "⟨⟩", label: "Code" },
  linkedin: { color: "#0077b5", dimColor: "#1e3a5f", icon: "in", label: "LinkedIn" },
  oura: { color: "#8b5cf6", dimColor: "#5b21b6", icon: "○", label: "Oura" },
  yahoo: { color: "#7c3aed", dimColor: "#4c1d95", icon: "Y!", label: "Yahoo" },
  personalCapital: { color: "#00a6a0", dimColor: "#006e6b", icon: "$", label: "Finance" }
};
```

#### Visual Layout

```
╭──────────────────────────────────────────────────────────────────────────╮
│ ◆ BACKBONE ENGINE v3.0.0 │ 5/7 connected  ● Alpaca │ ● Claude │ ● Code │ ○ LinkedIn │ ● Oura │ ● Yahoo │ ● Finance │
╰──────────────────────────────────────────────────────────────────────────╯
```

#### Sub-Components

**PulsingDot**
- Animates between bright and dim colors every 5 seconds
- Shows solid circle (●) when connected, hollow circle (○) when disconnected

#### State Management

| State | Type | Update Interval | Description |
|-------|------|-----------------|-------------|
| pulsePhase | boolean | 5000ms | Toggles pulse animation |

---

## Section 2: Left Sidebar

### Component: `LifeScoresPanel` (Progress)

**File:** `src/components/life-scores-panel.js`

**Purpose:** Display life progress metrics across 6 categories with trend indicators.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| data | object | null | Score data with categories array |
| title | string | "Progress" | Panel title |
| compact | boolean | false | Compact mode flag |
| comparisons | array | null | Benchmark comparisons |

#### Categories Configuration

```javascript
const CATEGORY_COLORS = {
  finance: "#eab308",   // Yellow
  health: "#22c55e",    // Green
  family: "#ec4899",    // Pink
  career: "#8b5cf6",    // Purple
  growth: "#3b82f6",    // Blue
  education: "#06b6d4"  // Cyan
};

const CATEGORY_ICONS = {
  finance: "$",
  health: "+",
  family: "*",
  career: "^",
  growth: ">",
  education: "~"
};
```

#### Data Structure

```javascript
{
  categories: [
    { category: "finance", score: 75, icon: "$" },
    { category: "health", score: 82, icon: "+" },
    { category: "career", score: 68, icon: "^" },
    { category: "growth", score: 45, icon: ">" }
  ],
  overall: 67,
  overallGrade: "B",
  trend: "up" // "up" | "down" | "stable"
}
```

#### Visual Layout

```
╭─────────────────────────────────╮
│ Progress                  67 B ↑│
│ $ Finance  ████████░░     75%   │
│ + Health   ████████░░     82%   │
│ ^ Career   ██████░░░░     68%   │
│ > Growth   ████░░░░░░     45%   │
╰─────────────────────────────────╯
```

---

### Component: `GoalProgressPanel`

**File:** `src/components/goal-progress-panel.js`

**Purpose:** Display user goals with progress tracking.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| goals | array | [] | Array of goal objects |
| title | string | "Goals" | Panel title |

#### Goal Data Structure

```javascript
{
  id: "goal_123",
  title: "Save $10,000",
  category: "finance",
  progress: 0.75,  // 0-1 scale
  icon: "$"
}
```

#### Visual Layout

```
╭─────────────────────────────────╮
│ Goals                           │
│ $ Save $10,000    ██████░░  75% │
│ + Run Marathon    ████░░░░  50% │
│ ^ Get Promotion   ██░░░░░░  25% │
╰─────────────────────────────────╯
```

---

### Component: `TickerScoresPanel`

**File:** `src/components/ticker-scores-panel.js`

**Purpose:** Display stock ticker scores with buy/sell signals.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| tickers | array | [] | Array of ticker data |
| title | string | "Ticker Scores" | Panel title |
| viewMode | string | "STANDARD" | Current view mode |
| maxItems | number | 10 | Max tickers to display |
| compact | boolean | false | Compact display mode |

#### Ticker Data Structure

```javascript
{
  symbol: "AAPL",
  score: 8.5,           // 0-10 scale
  price: 189.50,
  change: 2.34,         // Dollar change
  changePercent: 1.25,  // Percent change
  macd: {
    value: 0.45,
    trend: "bullish"    // "bullish" | "bearish" | "neutral"
  },
  volumeSigma: 1.8      // Standard deviations from average
}
```

#### Signal Logic (BUY only for Top 3 with score >= 8.0)

```javascript
const getSignalLabel = (score, isTop3 = false) => {
  if (isTop3 && score >= 9.0) return "BUY++";
  if (isTop3 && score >= 8.0) return "BUY";
  if (score >= 4.0) return "HOLD";
  if (score >= 3.0) return "SELL";
  return "SELL--";
};
```

#### Score Color Scale

| Score Range | Color | Hex |
|-------------|-------|-----|
| >= 8.0 | Bright Green | #22c55e |
| >= 6.0 | Green | #16a34a |
| >= 4.0 | Yellow | #eab308 |
| >= 2.0 | Orange | #f97316 |
| < 2.0 | Red | #ef4444 |

#### Visual Layout (Full View)

```
╭───────────────────────────────────────────────────────╮
│ Ticker Scores                         20 tickers      │
│ #   SYM    SCORE      SIGNAL   MACD    VOL    CHG    │
│ 1.  NVDA   ████ 9.2   BUY++   +0.82   2.3x  +3.4%   │
│ 2.  AAPL   ████ 8.5   BUY     +0.45   1.8x  +1.2%   │
│ 3.  MSFT   ███░ 7.8   BUY     +0.23   1.2x  +0.8%   │
│ 4.  GOOGL  ███░ 7.2   HOLD    +0.12   0.9x  +0.5%   │
│ ...                                                   │
╰───────────────────────────────────────────────────────╯
```

---

### Component: `ProjectsPanel`

**File:** `src/components/projects-panel.js`

**Purpose:** Display active projects with progress tracking.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| projects | array | [] | Array of project objects |
| title | string | "Projects" | Panel title |
| maxItems | number | 5 | Max projects to display |

#### Project Status Configuration

```javascript
const STATUS_COLORS = {
  active: "#22c55e",
  paused: "#eab308",
  blocked: "#ef4444",
  completed: "#8b5cf6",
  planning: "#3b82f6"
};

const STATUS_ICONS = {
  active: "▶",
  paused: "■",
  blocked: "●",
  completed: "✓",
  planning: "○"
};
```

---

## Section 3: Center Section

### Component: `EngineStatusPanel`

**File:** `src/components/engine-status-panel.js`

**Purpose:** Display current AI engine status, active plans, and projects.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| status | object | {} | Current engine status |
| currentPlan | array/string | null | Active plan steps |
| currentWork | string | null | Current work item |
| projects | array | [] | Active projects list |
| compact | boolean | false | Compact display mode |

#### Status States

```javascript
const STATUS_COLORS = {
  starting: "#f59e0b",
  researching: "#38bdf8",
  thinking: "#a78bfa",
  planning: "#60a5fa",
  building: "#22c55e",
  working: "#f97316",
  reflecting: "#ec4899",
  updating: "#eab308",
  connecting: "#06b6d4",
  connecting_agent: "#8b5cf6",
  connecting_provider: "#3b82f6",
  running_cron: "#64748b",
  closing: "#ef4444",
  idle: "#22c55e",
  waiting: "#94a3b8",
  analyzing: "#14b8a6",
  executing: "#22c55e",
  learning: "#f472b6",
  syncing: "#06b6d4"
};

const STATUS_ICONS = {
  starting: "⚡",
  researching: "◎",
  thinking: "◐",
  planning: "◇",
  building: "▣",
  working: "⚙",
  reflecting: "◈",
  updating: "↻",
  connecting: "◌",
  idle: "●",
  analyzing: "◈",
  executing: "▶",
  syncing: "↺"
};
```

#### Visual Layout

```
╭─────────────────────────────────────────────────────╮
│ Engine Status                            10:30:45 AM│
│ ● Ready                                             │
│                                                     │
│ PLAN                                                │
│   1. Research market conditions                     │
│   2. Analyze portfolio performance                  │
│   3. Generate trading recommendations               │
│                                                     │
│ ACTIVE PROJECTS                                     │
│   ▶ Trading Bot (12 msgs)                          │
│   ○ Portfolio Optimizer (5 msgs)                   │
╰─────────────────────────────────────────────────────╯
```

---

### Component: `ConversationPanel`

**File:** `src/components/conversation-panel.js`

**Purpose:** Display chat history with user and AI messages.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| messages | array | [] | Array of message objects |
| isLoading | boolean | false | Loading indicator |
| streamingText | string | null | Streaming response text |

#### Message Data Structure

```javascript
{
  role: "user" | "assistant",
  content: "Message text...",
  timestamp: new Date()
}
```

#### Visual Layout

```
╭─────────────────────────────────────────────────────╮
│ Conversation                           3 messages   │
│                                                     │
│ You                                    10:30 AM     │
│ ╭───────────────────────────────────────────────╮  │
│ │ What are the top stocks to buy today?         │  │
│ ╰───────────────────────────────────────────────╯  │
│                                                     │
│ BackBone                               10:30 AM     │
│ ╭───────────────────────────────────────────────╮  │
│ │ Based on my analysis, the top 3 stocks are... │  │
│ ╰───────────────────────────────────────────────╯  │
╰─────────────────────────────────────────────────────╯
```

---

### Component: `ChatPanel`

**File:** `src/components/chat-panel.js`

**Purpose:** User input with command autocomplete.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| commands | array | [] | Available slash commands |
| onSubmit | function | - | Submit callback |
| onTypingChange | function | - | Typing state callback |

#### Input Modes

| Mode | Trigger | Border Color | Prompt |
|------|---------|--------------|--------|
| Command | `/` | #f59e0b (Amber) | `⟩` |
| Conversation | Default | #334155 (Slate) | `›` |

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Submit input |
| Tab | Autocomplete command |
| ↑/↓ | Navigate command palette |
| Escape | Clear input |
| Backspace | Delete character |

#### Visual Layout

```
╭─────────────────────────────────────────────────────╮
│ ⌘ Command mode                    Tab complete │ Enter send │ Esc clear │
│ ⟩ /trading█                                        │
│                                                     │
│ ┌─ Commands (5 matches) ─────────────────────────┐ │
│ │ ▸ /trading         Execute trades              │ │
│ │   /trading status  View trading status         │ │
│ │   /trading enable  Enable auto-trading         │ │
│ │   /trading disable Disable auto-trading        │ │
│ │   /trading config  Configure trading           │ │
│ └────────────────────────────────────────────────┘ │
╰─────────────────────────────────────────────────────╯
```

---

## Section 4: Right Sidebar

### Component: `PortfolioPanel`

**File:** `src/components/portfolio-panel.js`

**Purpose:** Display Alpaca portfolio with positions and P/L.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| portfolio | object | {} | Portfolio data |
| formatPercent | function | - | Percent formatter |
| tradingStatus | object | null | Trading system status |
| lastUpdatedAgo | string | null | Last update time |
| nextTradeTime | string | null | Next scheduled trade |
| privateMode | boolean | false | Hide dollar amounts |
| tickerScores | object | {} | Score map for positions |

#### Portfolio Data Structure

```javascript
{
  equity: 125000.00,
  cash: 25000.00,
  buyingPower: 50000.00,
  dayPL: 1234.56,
  dayPLPercent: 0.99,
  totalPL: 15000.00,
  totalPLPercent: 12.0,
  positions: [
    {
      symbol: "AAPL",
      qty: "100",
      marketValue: 18950.00,
      costBasis: 17500.00,
      unrealizedPL: 1450.00,
      unrealizedPLPercent: 8.28
    }
  ]
}
```

#### Position Action Bar

4-bar indicator showing score level for each position:

| Bar | Score Range | Color | Meaning |
|-----|-------------|-------|---------|
| 1 | < 4.0 | Red (#ef4444) | Sell |
| 2 | 4.0-6.0 | Yellow (#eab308) | Hold |
| 3 | 6.0-8.0 | Dark Green (#16a34a) | Keep |
| 4 | >= 8.0 | Light Green (#22c55e) | Buy |

#### Visual Layout

```
╭─────────────────────────────────────╮
│ Portfolio               Paper Mode  │
│ ● System ready · Next at 10:40am   │
│                                     │
│ Total Value         $125,000.00    │
│ Today's P/L         +$1,234 (+0.99%)│
│ Total P/L           +$15,000 (+12%)│
│                                     │
│ ─────────────────────────────────  │
│ AAPL   100   +$1,450   +8.28% ████ │
│ MSFT   50    +$890     +5.12% ███░ │
│ NVDA   25    +$2,100   +15.3% ████ │
╰─────────────────────────────────────╯
```

---

### Component: `TradingHistoryPanel`

**File:** `src/components/trading-history-panel.js`

**Purpose:** Display 8-week trading history with SPY comparison.

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| tradingHistory | object | null | History data |
| isConnected | boolean | false | Connection status |

#### History Data Structure

```javascript
{
  weeks: [
    {
      label: "Jan 13-19",
      pnl: 1234,
      pnlPercent: 2.5,
      spyReturn: 1.8,
      beatSpy: true
    }
  ],
  totalPnL: 8500,
  totalPnLPercent: 8.5,
  growthRate: 2.1,
  projectedValue: 165000
}
```

#### Visual Layout

```
╭─────────────────────────────────────────╮
│ Trading History (8 Weeks)               │
│ Total P&L          $8,500 (+8.5%)       │
│ Growth Rate        +2.1%                │
│ Projected (1 Year) $165,000             │
│ ─────────────────────────────────────── │
│ Week           P&L      %     SPY       │
│ Jan 13-19    $1,234  +2.5%  +1.8%   ✓  │
│ Jan 6-12     $890    +1.8%  +2.1%   ✗  │
│ Dec 30-Jan 5 $1,500  +3.0%  +0.5%   ✓  │
│ ...                                     │
│ ✓ Beat SPY  ✗ Missed SPY               │
╰─────────────────────────────────────────╯
```

---

## Section 5: Bottom Control Bar

The bottom section is integrated into the Center Section's `ChatPanel` component. It provides:

- Text input for user queries
- Command palette with autocomplete
- Status indicators for typing mode
- Keyboard shortcut hints

---

## Services Layer

### Core Services

| Service | File | Description |
|---------|------|-------------|
| `auto-trader.js` | `src/services/auto-trader.js` | Autonomous trading engine |
| `alpaca.js` | `src/services/alpaca.js` | Alpaca API integration |
| `yahoo-finance.js` | `src/services/yahoo-finance.js` | Yahoo Finance data |
| `claude.js` | `src/services/claude.js` | Claude AI integration |
| `oura.js` | `src/services/oura.js` | Oura Ring health data |
| `linkedin-scraper.js` | `src/services/linkedin-scraper.js` | LinkedIn profile scraping |
| `personal-capital.js` | `src/services/personal-capital.js` | Personal Capital wealth data |

### Trading Services

| Service | File | Description |
|---------|------|-------------|
| `trading-status.js` | `src/services/trading-status.js` | Market hours and status |
| `trading-history.js` | `src/services/trading-history.js` | 8-week performance |
| `scoring-criteria.js` | `src/services/scoring-criteria.js` | Technical analysis scoring |
| `score-engine.js` | `src/services/score-engine.js` | Score calculation engine |

### AI Services

| Service | File | Description |
|---------|------|-------------|
| `autonomous-engine.js` | `src/services/autonomous-engine.js` | AI action generation |
| `claude-code-backend.js` | `src/services/claude-code-backend.js` | Claude Code integration |
| `multi-ai.js` | `src/services/multi-ai.js` | Multi-model AI routing |
| `conversation-context.js` | `src/services/conversation-context.js` | Context management |

### Life Management Services

| Service | File | Description |
|---------|------|-------------|
| `goal-tracker.js` | `src/services/goal-tracker.js` | Goal progress tracking |
| `goal-extractor.js` | `src/services/goal-extractor.js` | Goal extraction from text |
| `life-scores.js` | `src/services/life-scores.js` | Life category scores |
| `habits.js` | `src/services/habits.js` | Habit tracking |
| `weekly-review.js` | `src/services/weekly-review.js` | Weekly review system |
| `insights-engine.js` | `src/services/insights-engine.js` | AI insights generation |
| `recommendations-engine.js` | `src/services/recommendations-engine.js` | Action recommendations |

---

## Data Layer

### Data Files

| File | Location | Description |
|------|----------|-------------|
| `profile.js` | `src/data/profile.js` | User profile data |
| `portfolio.js` | `src/data/portfolio.js` | Portfolio builders |
| `tickers.js` | `src/data/tickers.js` | Ticker data structures |
| `goals.js` | `src/data/goals.js` | Goals data |
| `scoring.js` | `src/data/scoring.js` | Scoring configurations |
| `life-engine.js` | `src/data/life-engine.js` | Life engine data |
| `status.js` | `src/data/status.js` | Status configurations |

### Persistent Data (data/ directory)

| File | Description |
|------|-------------|
| `alpaca-config.json` | Alpaca API credentials |
| `trading-status.json` | Trading system state |
| `trading-history.json` | 8-week trading history |
| `trades-log.json` | All executed trades |
| `trading-config.json` | Auto-trading configuration |
| `linkedin-profile.json` | Cached LinkedIn profile |
| `goals.json` | User goals |
| `habits.json` | Habit tracking data |

---

## MCP Servers

Model Context Protocol (MCP) servers for external tool integration:

| Server | File | Description |
|--------|------|-------------|
| Trading | `src/mcp/trading-server.js` | Trading operations |
| Health | `src/mcp/health-server.js` | Health data queries |
| LinkedIn | `src/mcp/linkedin-server.js` | LinkedIn operations |
| Email | `src/mcp/email-server.js` | Email integration |
| Calendar | `src/mcp/calendar-server.js` | Calendar integration |
| Projects | `src/mcp/projects-server.js` | Project management |

---

## API Integrations

### Alpaca Markets API

**Base URLs:**
- Paper: `https://paper-api.alpaca.markets`
- Live: `https://api.alpaca.markets`

**Endpoints Used:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/account` | GET | Account information |
| `/v2/positions` | GET | Current positions |
| `/v2/orders` | POST | Submit orders |
| `/v2/orders` | GET | List orders |

**Authentication:**
```javascript
headers: {
  "APCA-API-KEY-ID": apiKey,
  "APCA-API-SECRET-KEY": apiSecret
}
```

### Yahoo Finance (via Server)

**Server:** `src/server/yahoo-finance-server.js`

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tickers` | GET | Get all ticker data with scores |
| `/api/ticker/:symbol` | GET | Get single ticker data |
| `/health` | GET | Server health check |

**Score Calculation:**
- MACD (12/26/9 EMA) - 30% weight
- RSI (14 period) - 20% weight
- Volume Sigma - 25% weight
- Price Position - 15% weight
- Momentum - 10% weight

### Oura Ring API

**Base URL:** `https://api.ouraring.com/v2`

**Endpoints:**
- `/usercollection/daily_sleep`
- `/usercollection/daily_activity`
- `/usercollection/daily_readiness`

### Claude API

**Provider:** Anthropic
**Model:** claude-opus-4-5-20251101

**Configuration:**
```javascript
{
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-opus-4-5-20251101",
  maxTokens: 4096
}
```

---

## Autonomous Trading System

### Configuration

**File:** `src/services/auto-trader.js`

```javascript
const DEFAULT_CONFIG = {
  enabled: true,
  mode: "paper",
  buyThreshold: 8.0,      // Score >= 8.0 triggers buy
  sellThreshold: 4.0,     // Score <= 4.0 triggers sell
  requireBullishMACD: false,
  requireBearishMACD: false,
  requireHighVolume: false,
  maxPositionSize: 1000,  // Max $ per position
  maxTotalPositions: 5,   // Max positions
  maxDailyTrades: 10,     // Max trades per day
  cooldownMinutes: 30,    // Minutes between trades
  notifyOnTrade: true,
  onlyTop3: true          // Only buy top 3 tickers
};
```

### Trading Loop

**Interval:** Every 10 minutes during market hours

**Market Hours:** 9:30 AM - 4:00 PM ET (Monday-Friday)

**Logic Flow:**

```
1. Check if market is open
2. Check if trading is enabled
3. Get current tickers with scores
4. Sort by score (highest first)
5. Get top 3 qualified tickers (score >= 8.0)
6. For each top 3 ticker not in portfolio:
   - Evaluate buy signal
   - Check position limits
   - Execute buy if all conditions met
7. For each position:
   - Evaluate sell signal (score <= 4.0)
   - Execute sell if conditions met
8. Log trades and send notifications
```

### Order Execution

**Order Type:** Market order
**Time in Force:** Day

```javascript
{
  symbol: "AAPL",
  qty: "10",
  side: "buy" | "sell",
  type: "market",
  time_in_force: "day"
}
```

---

## Testing Framework

### Test File

**Location:** `tests/autonomous-system.test.js`

### Running Tests

```bash
npm test
```

### Test Categories

1. **Service Tests**
   - Auto-trader configuration
   - Buy/sell signal evaluation
   - Trading status management
   - Score calculations

2. **Component Tests**
   - UI rendering
   - State management
   - Event handling

3. **Integration Tests**
   - API connectivity
   - Data flow
   - End-to-end trading

### Test Structure

```javascript
// Example test
describe("Auto-Trader", () => {
  test("evaluates buy signal correctly", () => {
    const ticker = { symbol: "AAPL", score: 8.5 };
    const result = evaluateBuySignal(ticker);
    expect(result.action).toBe("BUY");
  });

  test("only buys from top 3", async () => {
    const tickers = [...]; // 10 tickers
    const positions = [];
    const result = await monitorAndTrade(tickers, positions);
    expect(result.buySignals.length).toBeLessThanOrEqual(3);
  });
});
```

---

## OpenAI Fine-Tuning Setup

### Purpose

Create a fine-tuned model specifically trained on:
- Trading decisions and reasoning
- Life optimization strategies
- Goal achievement patterns
- User preference learning

### Training Data Format

**File:** `training/trading-decisions.jsonl`

```jsonl
{"messages": [{"role": "system", "content": "You are BACKBONE's trading analyst."}, {"role": "user", "content": "AAPL score: 8.5, MACD bullish, volume 2x average. Should I buy?"}, {"role": "assistant", "content": "BUY. Score of 8.5 exceeds threshold, bullish MACD confirms momentum, high volume suggests institutional interest."}]}
{"messages": [{"role": "system", "content": "You are BACKBONE's trading analyst."}, {"role": "user", "content": "TSLA score: 3.2, MACD bearish, P/L -15%. Should I sell?"}, {"role": "assistant", "content": "SELL. Score below threshold indicates weakness, bearish MACD confirms downtrend, cut losses before further decline."}]}
```

### Fine-Tuning Script

**File:** `scripts/finetune-openai.js`

```javascript
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function createFineTunedModel() {
  // 1. Upload training file
  const file = await openai.files.create({
    file: fs.createReadStream("training/trading-decisions.jsonl"),
    purpose: "fine-tune"
  });

  // 2. Create fine-tuning job
  const job = await openai.fineTuning.jobs.create({
    training_file: file.id,
    model: "gpt-4o-mini-2024-07-18",
    hyperparameters: {
      n_epochs: 3,
      batch_size: 4,
      learning_rate_multiplier: 1.8
    }
  });

  console.log("Fine-tuning job created:", job.id);

  // 3. Monitor job status
  let status = "running";
  while (status === "running" || status === "queued") {
    await new Promise(r => setTimeout(r, 30000));
    const updated = await openai.fineTuning.jobs.retrieve(job.id);
    status = updated.status;
    console.log("Status:", status);
  }

  // 4. Get fine-tuned model ID
  const completed = await openai.fineTuning.jobs.retrieve(job.id);
  console.log("Fine-tuned model:", completed.fine_tuned_model);

  return completed.fine_tuned_model;
}

createFineTunedModel();
```

### Training Data Categories

1. **Trading Decisions** (500+ examples)
   - Buy signals with reasoning
   - Sell signals with reasoning
   - Hold decisions
   - Position sizing

2. **Life Optimization** (300+ examples)
   - Goal prioritization
   - Habit recommendations
   - Schedule optimization

3. **Portfolio Analysis** (200+ examples)
   - Risk assessment
   - Diversification advice
   - Rebalancing suggestions

### Usage After Fine-Tuning

```javascript
const response = await openai.chat.completions.create({
  model: "ft:gpt-4o-mini-2024-07-18:backbone:trading:xxxxx",
  messages: [
    { role: "system", content: "You are BACKBONE's trading analyst." },
    { role: "user", content: "Analyze: NVDA score 9.2, bullish MACD, 3x volume" }
  ]
});
```

---

## Configuration

### Environment Variables

**File:** `.env`

```bash
# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# Alpaca Trading
ALPACA_KEY=PK...
ALPACA_SECRET=...

# Oura Ring
OURA_TOKEN=...

# OpenAI (for fine-tuning)
OPENAI_API_KEY=sk-...

# Notifications
PUSHOVER_USER_KEY=...
PUSHOVER_APP_TOKEN=...
NTFY_TOPIC=backbone-trades
```

### Default Configuration

**File:** `src/config/defaults.js`

```javascript
export const DEFAULTS = {
  alpaca: {
    environment: "paper",
    maxPositions: 5,
    maxPositionSize: 1000
  },
  trading: {
    buyThreshold: 8.0,
    sellThreshold: 4.0,
    cooldownMinutes: 30
  },
  refresh: {
    portfolio: 30000,
    tickers: 300000,
    tradingStatus: 60000
  }
};
```

---

## Commands Reference

### Trading Commands

| Command | Description |
|---------|-------------|
| `/trading` | Open trading menu |
| `/trading status` | View trading status |
| `/trading enable` | Enable auto-trading |
| `/trading disable` | Disable auto-trading |
| `/trading config` | Configure trading parameters |

### Portfolio Commands

| Command | Description |
|---------|-------------|
| `/portfolio` | View portfolio |
| `/alpaca` | Alpaca setup wizard |
| `/alpaca sync` | Force portfolio sync |

### Life Management Commands

| Command | Description |
|---------|-------------|
| `/goals` | Manage goals |
| `/habits` | View/manage habits |
| `/insights` | Get AI insights |
| `/review` | Weekly review |
| `/health` | Health data sync |

### Utility Commands

| Command | Description |
|---------|-------------|
| `/clear` | Clear conversation |
| `/help` | Show help |
| `/connect <service>` | Connect service |
| `/disconnect <service>` | Disconnect service |
| `/reset` | Reset all data |

---

## Color Palette

### Primary Colors

| Name | Hex | Usage |
|------|-----|-------|
| Amber | #f59e0b | Brand, highlights |
| Green | #22c55e | Success, positive |
| Red | #ef4444 | Error, negative |
| Blue | #3b82f6 | Info, links |
| Purple | #8b5cf6 | AI, special |

### Neutral Colors

| Name | Hex | Usage |
|------|-----|-------|
| White | #f8fafc | Primary text |
| Light Gray | #e2e8f0 | Secondary text |
| Medium Gray | #94a3b8 | Tertiary text |
| Dark Gray | #64748b | Dim text |
| Darker Gray | #475569 | Very dim text |
| Darkest Gray | #334155 | Borders |
| Slate | #1e293b | Backgrounds |

### Category Colors

| Category | Hex |
|----------|-----|
| Finance | #eab308 |
| Health | #22c55e |
| Family | #ec4899 |
| Career | #8b5cf6 |
| Growth | #3b82f6 |
| Education | #06b6d4 |

---

## Performance Optimizations

### State Update Optimizations

1. **Change Detection**: All state updates compare previous and next values before updating
2. **Reduced Intervals**: Update frequencies reduced to prevent flickering
3. **Refs for Non-Visual State**: Use refs for values that don't need re-renders
4. **Memoization**: Components wrapped in React.memo where appropriate

### Update Intervals

| Data | Interval | Reason |
|------|----------|--------|
| Portfolio | 30s | Balance API calls with freshness |
| Tickers | 5min | Yahoo rate limits |
| Trading Status | 60s | Reduce flickering |
| Connection Pulse | 5s | Visual feedback |
| Actions | 30s | Reduce re-renders |
| Life Feed | 10s | Reduce flickering |

### Memory Management

- Conversation limited to last 100 messages
- Life feed limited to 12 events
- Trading history limited to 8 weeks
- Ticker display limited to 20 items

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.0.0 | 2026-01-21 | Autonomous trading, reduced flickering |
| 2.5.0 | 2026-01-15 | Life scores, parallel worlds |
| 2.0.0 | 2026-01-01 | Complete rewrite with Ink |
| 1.0.0 | 2025-12-01 | Initial release |

---

## License

ISC License

---

*Generated by BACKBONE Engine v3.0.0*
*Last updated: 2026-01-21*
