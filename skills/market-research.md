---
name: market-research
description: Conduct market research, competitive analysis, market sizing, and trend analysis. Use when the user asks about market size (TAM/SAM/SOM), competitor landscapes, industry trends, consumer segments, or needs a market research report. Triggers on "market research", "competitive analysis", "market size", "industry analysis", "SWOT", "Porter's five forces".
---

# Market Research

Conduct structured market analysis using established frameworks.

## Workflow

1. **Define scope** — Industry, geography, timeframe, target segments
2. **Size the market** — TAM (top-down from reports) → SAM (segment filtering) → SOM (realistic capture)
3. **Map competitors** — Identify 5-10 key players, their positioning, strengths/weaknesses
4. **Analyze forces** — Apply Porter's Five Forces or PESTEL as appropriate
5. **Segment customers** — Demographics, psychographics, behaviors, pain points
6. **Identify trends** — Growth drivers, disruptions, regulatory changes
7. **Deliver output** — Save to `data/spreadsheets/` and/or create a PDF report

## Frameworks

- **TAM/SAM/SOM** — Market sizing from broad to obtainable
- **Porter's Five Forces** — Rivalry, supplier power, buyer power, substitutes, new entrants
- **SWOT** — Strengths, weaknesses, opportunities, threats
- **PESTEL** — Political, economic, social, technological, environmental, legal
- **NPS** — Net Promoter Score (promoters 9-10, detractors 0-6)
- **Competitive positioning** — 2-axis map plotting competitors by key dimensions

## Data Sources

Search the web for current data from:
- SEC EDGAR (company filings), Yahoo Finance (stocks/financials)
- Statista, IBISWorld, Grand View Research (industry reports)
- Google Trends (search interest), SimilarWeb (web traffic)
- Census Bureau, BLS, World Bank (demographics, labor, global data)
- Crunchbase (startups, funding rounds)

## BACKBONE Integration

- **Output**: `data/spreadsheets/<industry>-market-research.xlsx`
- **Projects**: Create/update `projects/<research-name>/PROJECT.md`
- **Notify**: WhatsApp summary of key findings when complete

## Pitfalls

- Market size estimates vary wildly between sources — always cite methodology
- Growth rates compound; a 20% CAGR over 5 years is 2.5x, not 2x
- TAM is not revenue — SOM is typically 1-5% of TAM for new entrants
