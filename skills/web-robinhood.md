---
name: Robinhood Trading
description: Navigate Robinhood to view portfolio, positions, trade history, and execute trades
triggers: [robinhood, stock portfolio, trading account, buy stock, sell stock, robinhood positions]
type: web-navigation
url: https://robinhood.com/
---

# Robinhood Navigation

## When to Use
- User asks about their Robinhood portfolio or positions
- User wants to check stock prices or trade
- User asks about recent trades or P&L

## Preferred Method
Use MCP tools first:
- `backbone-brokerage` → `robinhood_get_positions`, `robinhood_get_balances`, `robinhood_get_accounts`
- `backbone-trading` → `get_portfolio`, `get_positions`, `get_trade_history`

## Browser Navigation (fallback)
User is logged into Robinhood in Chrome.

### Key URLs
- Portfolio: `https://robinhood.com/`
- Stock detail: `https://robinhood.com/stocks/NVDA`
- History: `https://robinhood.com/account/history`
- Transfers: `https://robinhood.com/account/transfers`
- Tax docs: `https://robinhood.com/account/tax-center`
- Crypto: `https://robinhood.com/crypto/BTC`

### Login Flow (if needed)
1. Navigate to `https://robinhood.com/login`
2. Email field → Password field → "Log In"
3. 2FA: SMS code or Authenticator app
4. Device approval may be required (email link)

### Portfolio View
- Total portfolio value: Large number at top
- Daily change: Green/red next to portfolio value
- Holdings list: Each position shows ticker, shares, value, daily change
- Buying power: Shows available cash

### Viewing a Stock
1. Search bar at top: type ticker symbol
2. Click result to see stock detail page
3. Shows: price, chart, news, analyst ratings
4. Buy/Sell buttons on right side

### Trade Execution (REQUIRES USER CONFIRMATION — Risk 8+)
1. Click Buy or Sell on stock page
2. Enter shares or dollar amount
3. Review order details
4. Swipe/click to confirm
5. **NEVER auto-confirm trades without explicit user approval**

### History
1. Navigate to `/account/history`
2. Shows: recent orders, dividends, transfers
3. Filter by: stocks, crypto, options, all

### Data Extraction
- Portfolio value: top of main page
- Positions: scrollable list with ticker, shares, avg cost, current value
- P&L: shown per position and total
