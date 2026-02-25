---
name: Empower Financial Dashboard
description: Navigate Empower (Personal Capital) to view net worth, accounts, holdings, and transactions
triggers: [empower, personal capital, net worth, financial dashboard, retirement accounts]
type: web-navigation
url: https://participant.empower-retirement.com/participant/#/login?accu=MYERIRA
---

# Empower (Personal Capital) Navigation

## When to Use
- User asks about net worth, account balances, investment holdings
- User wants to see their full financial picture
- User asks to check retirement accounts, credit cards, loans

## Preferred Method
Use MCP tools first — they're faster and more reliable:
- `empower_get_networth` — cached net worth with freshness tracking
- `empower_get_accounts` — all accounts grouped by category
- `empower_get_holdings` — investment positions
- `empower_get_overview` — full dashboard
- `empower_scrape` — fresh browser scrape (if data is stale)

## Browser Navigation (fallback)
Only use browser if MCP tools fail or user explicitly wants to see the website.

### Login Flow
1. Navigate to: `https://participant.empower-retirement.com/participant/#/login?accu=MYERIRA`
3. Email field: `input[name="username"]` or `input[type="email"]`
4. Password field: `input[name="password"]` or `input[type="password"]`
5. Submit: Look for "Log In" or "Sign In" button
6. **2FA**: Empower will ask SMS or Email — choose SMS. Send WhatsApp alert to user BEFORE triggering.
7. After 2FA: Dashboard loads with net worth prominently displayed

### Key Pages
- **Dashboard**: Shows net worth, recent transactions, spending
- **Net Worth**: `/page/login/networth` — breakdown by category
- **Holdings**: Click "Investing" → "Holdings" — shows all positions
- **Accounts**: Left sidebar lists all linked accounts

### Common Popups to Dismiss
- "What's New" overlay — click X or "Got it"
- "Complete your profile" — click "Maybe later"
- Cookie consent — click "Accept"
- Upgrade prompts — click X

### Data Extraction
- Net worth: Large dollar amount at top of dashboard
- Accounts: Listed in sidebar with balances
- Holdings: Table with ticker, shares, price, value columns
