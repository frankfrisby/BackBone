# BACKBONE MCP Server Catalog

All MCP (Model Context Protocol) servers used by the BACKBONE engine. Each server exposes tools that can be called by AI agents.

---

## Servers

### 1. Google Mail & Calendar Server
- **Name:** `backbone-google`
- **Source:** `src/mcp/google-mail-calendar-server.js`
- **Provider:** Google (Gmail API, Google Calendar API) / Microsoft (Outlook, Graph API)
- **Added:** 2026-01-29
- **Purpose:** Unified email and calendar integration with AI analysis
- **Tools:**
  - `get_recent_emails` — Fetch recent inbox emails
  - `get_unread_count` — Count unread messages
  - `search_emails` — Search emails by query
  - `get_email_body` — Read full email content by ID
  - `draft_email` — Create email draft (requires approval)
  - `analyze_emails_by_topic` — AI-correlate emails with user interests/news
  - `get_today_events` — Get today's calendar events
  - `get_upcoming_events` — Get upcoming events for N days
  - `create_event` — Create a new calendar event
  - `update_event` — Update an existing calendar event
  - `delete_event` — Delete a calendar event

### 2. LinkedIn Server
- **Name:** `backbone-linkedin`
- **Source:** `src/mcp/linkedin-server.js`
- **Provider:** LinkedIn (local profile data + browser scraping)
- **Added:** 2026-01-29 (enhanced)
- **Purpose:** LinkedIn profile, posts, skills, education, and connections
- **Tools:**
  - `get_linkedin_profile` — Get saved LinkedIn profile data
  - `scrape_linkedin_profile` — Trigger profile scrape via browser
  - `get_linkedin_messages` — Get recent LinkedIn messages
  - `get_linkedin_posts` — Get user's posts and reposts
  - `get_linkedin_skills` — Get skills and endorsements
  - `get_linkedin_education` — Get education and colleges
  - `get_linkedin_connections` — Get contact/connection list
  - `get_contact_profile` — Get profile details for a specific contact

### 3. Contacts Directory Server
- **Name:** `backbone-contacts`
- **Source:** `src/mcp/contacts-server.js`
- **Provider:** Local filesystem (`data/contacts/`)
- **Added:** 2026-01-29
- **Purpose:** Manage contacts across categories (LinkedIn, family, friends, coworkers, startup)
- **Tools:**
  - `add_contact` — Add a new contact
  - `get_contacts` — List contacts, optionally filtered by category
  - `search_contacts` — Search contacts by name, company, or notes
  - `get_contact_profile` — Get full profile for a specific contact
  - `update_contact` — Update contact details
  - `categorize_contact` — Move a contact to a different category

### 4. News & Research Server
- **Name:** `backbone-news`
- **Source:** `src/mcp/news-server.js`
- **Provider:** Internal news-service.js + AI analysis
- **Added:** 2026-01-29
- **Purpose:** Fetch and analyze news, market data, and research topics
- **Tools:**
  - `fetch_latest_news` — Fetch and analyze latest news for user context
  - `get_market_summary` — Get latest market summary from news cache
  - `research_topic` — Deep research on a specific topic using AI
  - `get_news_for_beliefs` — Get news relevant to user's core beliefs
  - `correlate_news_with_portfolio` — Analyze news impact on portfolio holdings

### 5. Life Management Server
- **Name:** `backbone-life`
- **Source:** `src/mcp/life-server.js`
- **Provider:** Internal thinking-engine.js + local data files
- **Added:** 2026-01-29
- **Purpose:** Manage goals, beliefs, backlog, life scores, and thinking cycles
- **Tools:**
  - `get_goals` — Get all goals or filter by status/category
  - `get_beliefs` — Get core beliefs
  - `get_backlog` — Get backlog items with optional filtering
  - `get_life_scores` — Get life dimension scores
  - `add_goal` — Create a new goal
  - `add_belief` — Add a new core belief
  - `get_thesis` — Get current thesis/focus
  - `trigger_thinking_cycle` — Force a thinking engine cycle

### 6. Health Server (existing)
- **Name:** `backbone-health`
- **Source:** `src/mcp/health-server.js`
- **Provider:** Oura Ring API v2
- **Added:** Pre-existing
- **Purpose:** Sleep, readiness, and activity data from Oura Ring
- **Tools:**
  - `get_sleep_data` — Sleep metrics by date range
  - `get_readiness_score` — Readiness score and contributors
  - `get_activity_data` — Activity and movement metrics
  - `get_health_summary` — Comprehensive health snapshot

### 7. Projects Server (existing)
- **Name:** `backbone-projects`
- **Source:** `src/mcp/projects-server.js`
- **Provider:** Internal projects service
- **Added:** Pre-existing
- **Purpose:** Create and manage project workspaces
- **Tools:**
  - `create_project` — Create a new project workspace
  - `list_projects` — List existing projects
  - `create_project_action` — Create action folder within project

### 8. Trading Server (existing)
- **Name:** `backbone-trading`
- **Source:** `src/mcp/trading-server.js`
- **Provider:** Alpaca Markets API
- **Added:** Pre-existing
- **Purpose:** Portfolio management, stock trading, and analysis
- **Tools:**
  - `get_portfolio` — Portfolio summary
  - `get_positions` — Current stock positions
  - `buy_stock` — Market order buy
  - `sell_stock` — Market order sell
  - `get_ticker_analysis` — Buy/sell signal analysis
  - `get_trading_signals` — Current signals across tickers
  - `enable_auto_trading` — Toggle auto-trading mode
  - `get_trade_history` — Recent trade history
  - `analyze_position` — Detailed position reasoning
  - `explain_why_position_held` — Natural language explanation

---

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `GMAIL_ACCESS_TOKEN` | Google Mail & Calendar | Gmail OAuth bearer token |
| `GOOGLE_CALENDAR_TOKEN` | Google Mail & Calendar | Google Calendar OAuth token |
| `OUTLOOK_ACCESS_TOKEN` | Google Mail & Calendar | Microsoft Graph API token |
| `OURA_ACCESS_TOKEN` | Health | Oura Ring API v2 token |
| `ALPACA_KEY` | Trading | Alpaca API key |
| `ALPACA_SECRET` | Trading | Alpaca API secret |
| `ANTHROPIC_API_KEY` | News, Life | Claude API for AI analysis |

## Architecture

All servers follow the MCP SDK pattern:
1. Import `Server`, `StdioServerTransport`, and request schemas from `@modelcontextprotocol/sdk`
2. Define `TOOLS` array with name, description, and JSON Schema `inputSchema`
3. Implement tool functions
4. Create server with `new Server({ name, version }, { capabilities: { tools: {} } })`
5. Register `ListToolsRequestSchema` and `CallToolRequestSchema` handlers
6. Connect via `StdioServerTransport` in `main()`

## Data Directories

- `data/contacts/` — Contact categories (linkedin, family, friends, coworkers, startup)
- `data/email-cache.json` — Email fetch cache
- `data/calendar-cache.json` — Calendar fetch cache
- `data/news-cache.json` — News analysis cache
- `data/linkedin-profile.json` — LinkedIn profile data
- `data/core-beliefs.json` — User's core beliefs
- `data/goals.json` — Structured goals
- `data/backlog.json` — Ideas pipeline
- `data/life-scores.json` — Life dimension scores
