# Disaster Assessment — Domain Reference

Detailed indicators and data sources for each of the 15 threat domains.

## 1. Market Conditions

**Indicators:** S&P 500/NASDAQ trend, VIX (<15 calm, 15-25 elevated, 25-35 high, >35 panic), market breadth (A/D ratio, % above 200-day MA), margin debt/GDP, IPO/SPAC activity, insider sell/buy ratio, put/call extremes.

**Data:** `data/tickers-cache.json`, `data/trades-log.json`, `data/recession-score.json`

## 2. Credit & Debt

**Indicators:** Credit spreads (IG and HY vs treasuries), corporate debt-to-earnings, sovereign debt-to-GDP, US debt trajectory, bank lending standards, consumer credit delinquencies (auto, card, student), CRE defaults.

**Threat progression:** Tight spreads → widening → credit freeze → systemic seizure

## 3. Bond Market

**Indicators:** Yield curve (normal/flat/inverted), 10Y direction, fed funds + guidance, real yields, bond liquidity (bid-ask, failed trades), foreign central bank Treasury holdings.

## 4. Housing

**Indicators:** Price-to-income ratio, mortgage rates vs historical, inventory (months of supply), delinquency/foreclosure rates, new construction, CRE vacancy, REIT performance.

## 5. Geopolitical

**Indicators:** Active conflicts, nuclear threat (Doomsday Clock), US-China (trade/Taiwan/tech), Russia-NATO, Middle East (oil supply), sanctions, cyber attacks on infrastructure, alliance fractures.

## 6. Job Market

**Indicators:** Unemployment rate + trend, initial claims (4w MA), JOLTS openings/unemployed ratio, layoff announcements, real wage growth, participation rate, underemployment, AI displacement rate.

## 7. Food Crisis

**Indicators:** FAO food price index, fertilizer prices/supply, crop yield forecasts (wheat/corn/rice/soy), drought/flood in ag regions, export bans, livestock disease, fishery collapse, food deserts, grocery inflation vs wages, strategic grain reserves, pollinator decline.

## 8. Energy Crisis

**Indicators:** Crude oil price/supply-demand, natural gas (Henry Hub, EU TTF), OPEC+ decisions/spare capacity, SPR levels, grid reliability (blackout/brownout), renewable buildout vs demand, nuclear status, infrastructure attacks.

## 9. Climate & Weather

**Indicators:** Hurricane/typhoon frequency, wildfire severity, flooding, heat waves/domes, tornado outbreaks, ice storms, sea level rise, Arctic ice loss, insurance stress (carrier withdrawals, premium spikes), climate migration, ag zone shifts, ocean acidification.

## 10. Natural Disasters

**Indicators:** Seismic activity, tsunami risk, volcanic eruption risk (Yellowstone, Campi Flegrei), landslide/mudslide areas, sinkhole events, dam failure risk, FEMA capacity, cascading failure scenarios (quake→tsunami→nuclear).

## 11. Biological Threats

**Indicators:** WHO alerts, novel pathogen emergence, bioweapon risk, lab incidents, AMR (superbugs, drug-resistant TB, fungi), vaccine pipeline gaps, healthcare capacity, zoonotic monitoring (H5N1, MERS, Nipah), synthetic biology concerns, water contamination, vector-borne disease expansion.

## 12. Space & Cosmic

**Indicators:** Solar cycle/CME risk, Carrington Event probability, near-Earth asteroid tracking, space debris (Kessler syndrome), GPS/satellite vulnerability, geomagnetic storm impacts, gamma ray burst monitoring, NOAA space weather.

## 13. AI & Technology

**Indicators:** AGI timeline/capabilities, alignment research progress, autonomous weapons, deepfake proliferation, infrastructure AI dependency, automation displacement pace, AI cyber attacks, algorithmic instability (flash crashes), surveillance expansion, AI power concentration, synthetic media trust erosion, quantum encryption timeline, algorithmic radicalization.

## 14. Societal & National

**Indicators:** Polarization index, civil unrest, institutional trust (gov/media/judiciary), crime trends, healthcare capacity, infrastructure grade (ASCE), education performance, homelessness/poverty, opioid/addiction metrics, immigration impacts, misinformation spread, domestic extremism (FBI/DHS), wealth inequality (Gini).

## 15. Mass Devastation

**Indicators:** Nuclear war probability, EMP scenarios, supply chain cascading failure, internet/comms backbone vulnerability, financial system collapse, mass migration triggers, water scarcity/aquifer depletion, topsoil erosion, biodiversity loss thresholds, polycrisis probability, social contract breakdown, critical mineral supply disruption.

## Data Sources

| Source | URL | Data |
|--------|-----|------|
| FRED | fred.stlouisfed.org | Economic indicators |
| BLS | bls.gov | Jobs, CPI |
| NOAA | noaa.gov | Weather, space weather |
| NASA | nasa.gov | Asteroids, solar activity |
| FAO | fao.org | Food price index |
| EIA | eia.gov | Energy data |
| FEMA | fema.gov | Disaster declarations |
| Treasury | treasury.gov | Yields, debt |
| IMF/World Bank | data.worldbank.org | Global outlook |
| WHO | who.int | Disease alerts |
| CDC | cdc.gov | Pathogen surveillance |
| FBI/DHS | — | Threat assessments |
| ASCE | asce.org | Infrastructure grades |
