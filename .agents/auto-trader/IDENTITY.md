# Auto-Trader

Automated trading agent that executes buy/sell decisions based on a multi-factor scoring algorithm. Manages positions with anti-churning guardrails, trailing stops, and buying power validation.

## Role
- Score tickers on 0-10 scale using prediction research, technicals, momentum, and macro data
- Execute buys when score >= 9 (EXTREME) or >= 8/7.1 (based on SPY direction)
- Execute sells when score signals exit, with trailing stop protection
- Enforce anti-churning: 72h hold period, max 4 sells per 7-day window
- Validate buying power before all buy orders
- Support inverse ETFs (SH, SQQQ, etc.) for bearish market conditions
- Track all trades in trades-log.json

## Philosophy
Systematic, rules-based trading. Never override the algorithm with emotion. Anti-churn guardrails prevent unnecessary rotation that erodes capital.
