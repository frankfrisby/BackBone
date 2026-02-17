---
name: disaster-assessment
description: Comprehensive threat evaluation across 15 domains — markets, credit, bonds, housing, geopolitical, jobs, food, energy, climate, natural disasters, biological, space, AI/tech, societal, and mass devastation. Use when the user asks about risks, threats, crisis scenarios, disaster preparedness, "what could go wrong", or runs /disaster. Also triggers on market crash concerns, recession fears, or any systemic risk question.
---

# Disaster & Crisis Assessment

Evaluate threats across 15 domains and recommend defensive actions.

## Quick Assessment

1. Read existing scores: `data/recession-score.json` (macro), `data/tickers-cache.json` (market)
2. WebSearch each domain for current threat indicators
3. Score each domain 1-10 using threat level definitions in [references/domains.md](references/domains.md)
4. Produce composite threat table and recommended actions
5. Save to `data/spreadsheets/disaster-assessment.xlsx` for trend tracking

## 15 Domains

| # | Domain | Key Signals |
|---|--------|-------------|
| 1 | Market Conditions | VIX, S&P trend, breadth, margin debt |
| 2 | Credit & Debt | Spreads, delinquencies, lending standards |
| 3 | Bond Market | Yield curve, real yields, liquidity |
| 4 | Housing | Price-to-income, mortgage rates, inventory |
| 5 | Geopolitical | Active conflicts, US-China, cyber warfare |
| 6 | Job Market | Unemployment, claims, JOLTS, AI displacement |
| 7 | Food Crisis | FAO index, crop yields, export bans |
| 8 | Energy Crisis | Oil/gas prices, OPEC, grid reliability |
| 9 | Climate & Weather | Extreme events, insurance stress, migration |
| 10 | Natural Disasters | Seismic activity, volcanic risk, dam failures |
| 11 | Biological Threats | Pandemics, AMR, bioweapon risk |
| 12 | Space & Cosmic | Solar storms, asteroid tracking, GPS risk |
| 13 | AI & Technology | Alignment, autonomous weapons, deepfakes |
| 14 | Societal & National | Polarization, trust, infrastructure |
| 15 | Mass Devastation | Nuclear, polycrisis, systemic collapse |

## Scoring

- **1-3 GREEN**: Normal — no action needed
- **4-5 YELLOW**: Monitor — review exposure, fund emergency reserves
- **6-7 ORANGE**: Defensive — increase cash, add hedges, extend supplies
- **8-9 RED**: Urgent — maximum defense, exit speculation
- **10 BLACK**: Existential — full emergency posture

## Output Format

```
DOMAIN                  | STATUS | LEVEL | TREND | KEY SIGNAL
------------------------|--------|-------|-------|------------------
1. Markets              | GREEN  | 3/10  | →     | VIX 18, SPY flat
...
COMPOSITE               | YELLOW | 4/10  | ↑     | Credit tightening
```

## BACKBONE Integration

- **Recession score**: Read `data/recession-score.json` for automated macro signals
- **Portfolio exposure**: Read `data/tickers-cache.json` + `data/trades-log.json`
- **Tracking**: Save to `data/spreadsheets/disaster-assessment.xlsx` using `appendToSpreadsheet`
- **Project**: `projects/disaster-planning/` has protocols and readiness scores
- **Notify**: WhatsApp alert when composite score changes by 2+ points

## Action Protocols

| Level | Cash | Hedges | Supplies | Action |
|-------|------|--------|----------|--------|
| GREEN (1-3) | Normal | None | 2 weeks | Business as usual |
| YELLOW (4-5) | 10-20% | Review | 1 month | Diversify, review insurance |
| ORANGE (6-7) | 20-30% | Puts/gold | 1-3 months | Reduce leverage, secure docs |
| RED (8-10) | Maximum | Full hedge | 3-6 months | Exit speculation, emergency plan |

## Deep Reference

Full indicators, data sources, and project integration details: [references/domains.md](references/domains.md)
