---
name: rare-earth-resources
description: Analyze rare earth elements, critical minerals, and strategic resource supply chains. Use when the user asks about rare earths, critical minerals, supply chain risks, mining investments, or strategic resource dependencies. Triggers on "rare earth", "critical minerals", "lithium", "cobalt", "neodymium", "supply chain", "mining".
---

# Rare Earth & Critical Resources

Analyze strategic minerals, supply chains, and investment implications.

## Workflow

1. **Identify materials** — Which elements/minerals are relevant to the query
2. **Map supply chain** — Production (who mines), processing (who refines), consumption (who uses)
3. **Assess risks** — Concentration risk, geopolitical, environmental, substitution availability
4. **Investment angle** — Mining companies, ETFs, downstream beneficiaries
5. **Output** — Save analysis to spreadsheet or project

## Key Categories

| Category | Elements | Primary Use |
|----------|----------|-------------|
| Light REE | La, Ce, Pr, Nd, Sm, Eu | Magnets, catalysts, batteries, glass |
| Heavy REE | Gd, Tb, Dy, Ho, Er, Tm, Yb, Lu | Magnets, lasers, nuclear, PET scans |
| Battery metals | Li, Co, Ni, Mn, graphite | EV batteries, grid storage |
| Semiconductor | Ga, Ge, Si, In | Chips, solar cells, fiber optics |
| Strategic | W, Ti, Pt, Pd, U | Aerospace, catalytic converters, nuclear |

## Supply Chain Risk Factors

- **China dominance**: ~60% mining, ~90% processing of rare earths
- **Single-source risk**: Some elements have 1-2 viable suppliers
- **Processing bottleneck**: Mining ≠ refining — most processing is in China
- **Environmental cost**: Mining and refining are highly polluting
- **Substitution**: Some applications have no viable substitutes

## Data Sources

Search for: USGS mineral commodity summaries, China export data, mining company reports (MP Materials, Lynas, Albemarle), IEA critical minerals outlook, EU Critical Raw Materials Act.

## BACKBONE Integration

- **Portfolio check**: Read `data/tickers-cache.json` for mining/materials exposure
- **Output**: `data/spreadsheets/rare-earth-analysis.xlsx`
- **Trading signals**: Cross-reference with recession score for cyclical sensitivity
