# BACKBONE Engine — Claude Memory

## Alpaca Trading Integration
- MCP trading server: `src/mcp/trading-server.js`
- Alpaca client: `src/services/alpaca.js` — `getAlpacaConfig()` loads keys from env vars first, falls back to `data/alpaca-config.json`
- Auto-trader: `src/services/auto-trader.js` — handles buy/sell signals, position management
- **Key bug fixed (Feb 4, 2026)**: MCP server needed explicit import of `getAlpacaConfig` — without it, `process.env` vars are empty in MCP child processes since dotenv isn't loaded
- Account mode: LIVE (real money). Handle with care.
- Config file: `data/alpaca-config.json` — contains API keys, mode, risk, strategy settings

## Portfolio Context
- Account equity: ~$1,241 (as of Feb 4, 2026)
- Current position: COUR 170 shares (~$1,014)
- Cash: ~$227
- NBIX previously held, auto-trader rotated out
- Day trade count: 3 (at PDT limit)
- $1M goal requires income generation, not just trading

## User Profile
- Frank, CMU background, DoD AI work
- Building BACKBONE as life optimization engine
- JavaScript learning in progress (Week 1)
- Goals: $1M net worth by 2028, income diversification
- Health tracked via Oura Ring
- Finance score: 15/100, overall life score: 37/100

## Project Structure
- `data/goals/` — Goal markdown files with progress tracking
- `projects/` — Project workspaces with PROJECT.md files
- `memory/` — AI memory files (portfolio, health, goals, tickers, thesis)
- `data/alpaca-config.json` — Trading credentials and settings
- `src/mcp/` — MCP servers (trading, health, google, contacts, news, life, projects, linkedin, youtube, vapi)

## Common Issues
- MCP servers don't inherit .env — always use config file fallbacks
- Trades stuck in `pending_new` mean API was down when order was attempted
- `onlyTop3: true` limits auto-trader to top 3 signals only
