---
name: economic-policy
description: Analyze economic indicators, monetary policy, fiscal policy, and macroeconomic trends. Use when the user asks about interest rates, Fed policy, inflation, GDP, employment data, fiscal policy, or economic outlook. Triggers on "economic", "Fed", "interest rates", "inflation", "GDP", "fiscal policy", "monetary policy", "macro".
---

# Economic Policy Analysis

Evaluate economic conditions, central bank policy, and fiscal trends.

## Workflow

1. **Gather data** — Pull from BACKBONE's recession score + macro-knowledge, then web search for latest
2. **Analyze indicators** — Leading (yield curve, PMI, claims), coincident (GDP, employment), lagging (CPI, unemployment rate)
3. **Assess policy** — Current Fed stance, forward guidance, fiscal stimulus/austerity
4. **Model scenarios** — Rate path, growth trajectory, inflation path
5. **Portfolio implications** — Sector rotation, duration risk, currency effects

## Key Indicators

| Indicator | Source | Signal |
|-----------|--------|--------|
| Yield curve (3m-10y) | Treasury | Inversion → recession in 12-18 months |
| VIX | CBOE | >25 fear, >35 panic |
| ISM PMI | ISM | <50 contraction |
| Initial claims | BLS | Rising → labor weakness |
| CPI YoY | BLS | >3% hot, <2% cool |
| Fed funds rate | FOMC | Hiking = tightening |
| Consumer sentiment | UMich | Falling → spending pullback |

## Policy Frameworks

- **Taylor Rule**: Rate = neutral + 1.5×(inflation-target) + 0.5×(output gap)
- **Phillips Curve**: Unemployment ↔ inflation tradeoff
- **Fiscal multiplier**: Government spending impact on GDP (typically 0.5-1.5x)
- **Quantity theory**: MV = PY — money supply × velocity = price × output

## BACKBONE Integration

- **Recession score**: Read `data/recession-score.json` (0-10, 14 components)
- **Macro data**: Read `data/macro-knowledge.json` (yields, VIX, credit, SPY)
- **Trading signals**: Cross-reference with `get_trading_signals` MCP tool
- **Output**: Update `memory/portfolio.md` with macro outlook
- **Notify**: WhatsApp alert on significant policy changes
