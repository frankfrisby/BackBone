# Disaster & Crisis Assessment Skill

Comprehensive threat evaluation framework covering 15 domains: financial, geopolitical, environmental, biological, technological, and societal risks. Used to assess current conditions, identify emerging threats, and recommend defensive actions across all domains that could impact the user's life, portfolio, and plans.

## When to Use
- User asks about market crashes, recessions, or economic downturns
- User asks about crisis situations, disasters, or systemic risks
- User wants to evaluate current threat levels across domains
- User asks "what could go wrong", "what are the risks", "should I be worried"
- Periodic check-in as part of planning or portfolio review
- News breaks about a major event (war, pandemic, financial collapse, natural disaster)
- User runs `/disaster assess` for a full scan

## Assessment Domains (15 Total)

### 1. Market Conditions
Evaluate equity markets, volatility, and systemic financial risk.

**Indicators:**
- S&P 500 / NASDAQ trend (bullish, sideways, bearish, crash territory)
- VIX (Volatility Index): <15 calm, 15-25 elevated, 25-35 high fear, >35 panic
- Market breadth (advance/decline ratio, % stocks above 200-day MA)
- Margin debt levels relative to GDP
- IPO/SPAC activity (excess = late cycle)
- Insider selling vs buying ratio
- Put/call ratio extremes

**Actions:**
- Read `data/tickers-cache.json` and `data/trades-log.json` for user exposure
- WebSearch for current VIX, S&P 500 level, recent drawdown %
- Compare user portfolio allocation to risk level

### 2. Credit & Debt Crisis
Evaluate credit markets, sovereign debt, and lending conditions.

**Indicators:**
- Credit spreads (investment grade and high yield vs treasuries)
- Corporate debt-to-earnings ratios
- Sovereign debt-to-GDP for major economies (US, EU, Japan, China)
- US national debt trajectory and debt ceiling status
- Bank lending standards (tightening = warning)
- Consumer credit delinquency rates (auto, credit card, student loans)
- Commercial real estate loan defaults

**Threat Levels:**
- GREEN: Spreads tight, lending loose, delinquencies low
- YELLOW: Spreads widening, lending tightening, rising delinquencies
- ORANGE: Rapid spread widening, credit freeze starting, defaults rising
- RED: Credit markets seizing, bank stress, systemic risk

### 3. Bond Market
Evaluate fixed income, yield curves, and monetary policy risk.

**Indicators:**
- Yield curve shape (normal, flat, inverted — inversion predicts recession)
- 10-year Treasury yield level and direction
- Fed funds rate and forward guidance
- Real yields (nominal minus inflation)
- Bond market liquidity (bid-ask spreads, failed trades)
- Foreign central bank Treasury holdings (selling = warning)
- Duration risk in bond portfolios

**Actions:**
- WebSearch for current yield curve, Fed policy stance
- Assess impact on user's fixed income holdings if any

### 4. Housing Market
Evaluate residential and commercial real estate risk.

**Indicators:**
- Home price-to-income ratio (national and user's metro)
- Mortgage rates vs historical average
- Housing inventory levels (months of supply)
- Mortgage delinquency and foreclosure rates
- New construction permits and starts
- Commercial real estate vacancy rates (especially office)
- REIT performance and capitalization rates

**Threat Levels:**
- GREEN: Affordable, stable prices, low delinquencies
- YELLOW: Prices elevated, affordability stretched, rates rising
- ORANGE: Prices declining, delinquencies rising, inventory building
- RED: Crash — rapid price drops, foreclosure wave, credit contagion

### 5. Geopolitical Issues
Evaluate international conflict, sanctions, and instability risk.

**Indicators:**
- Active military conflicts and escalation risk
- Nuclear threat level (Doomsday Clock position)
- US-China relations (trade, Taiwan, tech decoupling)
- Russia/NATO tensions
- Middle East stability (oil supply risk)
- Sanctions regimes and trade disruptions
- Cyber warfare incidents against infrastructure
- Alliance fractures (NATO, AUKUS, EU cohesion)

**Actions:**
- WebSearch for current geopolitical flashpoints
- Assess portfolio exposure to affected regions/sectors
- Evaluate supply chain dependencies

### 6. Job Market & Labor
Evaluate employment conditions and economic health signals.

**Indicators:**
- Unemployment rate and trend (rising = recessionary)
- Initial jobless claims (4-week moving average)
- Job openings to unemployed ratio (JOLTS)
- Layoff announcements (tech, finance, manufacturing)
- Wage growth vs inflation (negative real wages = stress)
- Labor force participation rate
- Part-time for economic reasons (underemployment)
- AI displacement acceleration rate

**Threat Levels:**
- GREEN: Low unemployment, wage growth > inflation, abundant openings
- YELLOW: Hiring slowing, layoffs starting, wage growth stalling
- ORANGE: Unemployment rising, mass layoffs, wage cuts
- RED: Rapid job losses, unemployment spike, hiring freeze across sectors

### 7. Food Crisis & Scarcity
Evaluate food security, supply chains, famine, and agricultural collapse.

**Indicators:**
- Global food price index (FAO) trend
- Fertilizer prices, supply, and sanctions impact
- Crop yield forecasts (wheat, corn, rice, soybeans)
- Drought/flood conditions in major agricultural regions
- Food export bans by producing nations
- Livestock disease outbreaks (avian flu, swine fever)
- Fishery collapse and ocean dead zones
- Food desert expansion in urban and rural areas
- Grocery price inflation vs wage growth
- Strategic grain reserve levels by nation
- Pollinator decline impact on crop production
- Supply chain disruptions (shipping, ports, trucking)

**Threat Levels:**
- GREEN: Stable prices, good harvests, reserves adequate
- YELLOW: Prices rising, regional crop failures, supply tightening
- ORANGE: Multi-region crop failures, export bans, rationing starts
- RED: Famine conditions, global shortage, food riots, mass hunger

### 8. Energy Crisis
Evaluate energy supply, prices, and transition risks.

**Indicators:**
- Crude oil price and supply/demand balance
- Natural gas prices (US Henry Hub, EU TTF)
- OPEC+ production decisions and spare capacity
- Strategic Petroleum Reserve levels
- Grid reliability (blackout/brownout incidents)
- Renewable energy buildout pace vs demand
- Nuclear plant status and new construction
- Energy infrastructure attacks or failures

**Threat Levels:**
- GREEN: Stable prices, adequate supply, reserves full
- YELLOW: Prices elevated, supply tight, reserves declining
- ORANGE: Price spikes, supply disruptions, rationing risk
- RED: Energy crisis — shortages, blackouts, economic disruption

### 9. Climate & Extreme Weather
Evaluate climate change impacts, extreme weather, and environmental breakdown.

**Indicators:**
- Extreme weather frequency (hurricanes, typhoons, cyclones)
- Wildfire severity and season length
- Flooding events (riverine, coastal, flash floods)
- Heat waves, heat domes, and record temperatures
- Tornado outbreaks and severe storm systems
- Ice storms, blizzards, polar vortex events
- Sea level rise trajectory and coastal erosion
- Arctic ice loss and permafrost thaw
- Insurance market stress (carrier withdrawals, premium spikes)
- Climate migration patterns and displacement
- Agricultural zone shifts and growing season changes
- Ocean acidification and coral reef collapse

**Threat Levels:**
- GREEN: Normal seasonal patterns, manageable events
- YELLOW: Above-average extreme events, insurance tightening
- ORANGE: Record-breaking events, infrastructure damage, mass displacement
- RED: Climate tipping points triggered, cascading environmental collapse

### 10. Major Natural Disasters
Evaluate earthquakes, tsunamis, volcanic eruptions, and catastrophic events.

**Indicators:**
- Seismic activity and major earthquake risk zones
- Tsunami warning systems and coastal vulnerability
- Volcanic eruption risk (supervolcano monitoring: Yellowstone, Campi Flegrei)
- Landslide and mudslide risk areas
- Sinkhole events and ground subsidence
- Dam failure and infrastructure collapse risk
- FEMA disaster declarations and response capacity
- Infrastructure damage costs and rebuild timelines
- Cascading failure scenarios (quake -> tsunami -> nuclear)

**Threat Levels:**
- GREEN: Normal background seismicity, no elevated volcanic risk
- YELLOW: Earthquake swarms, elevated volcanic unrest, seasonal flood risk
- ORANGE: Major earthquake, eruption, or multi-disaster event
- RED: Catastrophic event — megaquake, supervolcano, cascading infrastructure failure

### 11. Biological Threats & Pathogens
Evaluate pandemics, biowarfare, pathogen outbreaks, and biosecurity.

**Indicators:**
- Active pandemic and epidemic surveillance (WHO alerts)
- Novel pathogen emergence (spillover events, gain-of-function)
- Bioweapon development and proliferation risk
- Biosafety lab incidents and containment breaches
- Antimicrobial resistance (superbugs, drug-resistant TB, fungal threats)
- Vaccine development pipeline and distribution gaps
- Healthcare system capacity and ICU availability
- Zoonotic disease monitoring (bird flu H5N1, MERS, Nipah)
- Synthetic biology and dual-use research concerns
- Bioterrorism threat assessments
- Water supply contamination risk
- Vector-borne disease range expansion (mosquitoes, ticks)

**Threat Levels:**
- GREEN: No novel outbreaks, AMR stable, healthcare adequate
- YELLOW: Localized outbreaks, rising AMR, healthcare strain
- ORANGE: Multi-country spread, pandemic potential, hospital overflow
- RED: Global pandemic, bioweapon deployment, healthcare collapse

### 12. Space & Cosmic Threats
Evaluate space-related threats and disruptions.

**Indicators:**
- Solar storm activity (solar cycle, coronal mass ejection risk)
- Carrington Event probability (grid-destroying solar storm)
- Near-Earth asteroid tracking (NASA/ESA close approach data)
- Space debris density and collision risk (Kessler syndrome)
- GPS/satellite constellation vulnerability
- Geomagnetic storm impacts on communications and power
- Gamma ray burst proximity monitoring
- Space weather forecasts (NOAA Space Weather Prediction Center)

**Threat Levels:**
- GREEN: Quiet sun, no close approaches, stable space environment
- YELLOW: Elevated solar activity, minor geomagnetic storms
- ORANGE: Major solar event, satellite disruptions, GPS degradation
- RED: Extreme solar storm, potential grid damage, communication blackout

### 13. AI & Technological Risk
Evaluate AI advancement risks, automation displacement, and tech-driven threats.

**Indicators:**
- AGI/ASI development timeline and capability milestones
- AI alignment and safety research progress
- Autonomous weapons development and regulation
- Deepfake proliferation and information warfare
- Critical infrastructure AI dependency risk
- Mass automation and workforce displacement pace
- AI-powered cyber attacks and zero-day exploitation
- Algorithmic market instability (flash crashes)
- Surveillance state expansion and privacy erosion
- AI concentration of power (few companies control critical AI)
- Synthetic media undermining trust in evidence
- Quantum computing threat to encryption timelines
- Social media algorithmic radicalization

**Threat Levels:**
- GREEN: Steady progress, safety research keeping pace, regulation adequate
- YELLOW: Rapid capability gains, safety gaps emerging, job disruption accelerating
- ORANGE: Misaligned systems deployed, mass automation layoffs, AI-powered attacks
- RED: Loss of control, autonomous weapons deployed, critical systems compromised

### 14. Societal & National Issues
Evaluate domestic stability, governance, and social cohesion.

**Indicators:**
- Political polarization index and civil unrest incidents
- Trust in institutions (government, media, judiciary) — polling trends
- Crime rates and public safety trends
- Healthcare system capacity and pandemic preparedness
- Infrastructure condition (ASCE report card grade)
- Education system performance and workforce readiness
- Homelessness and poverty rates
- Opioid/addiction crisis metrics
- Immigration policy impacts on labor and social services
- Social media misinformation spread rate
- Domestic extremism threat level (FBI/DHS assessments)
- Wealth inequality trajectory (Gini coefficient)

**Threat Levels:**
- GREEN: Stable governance, high trust, low unrest
- YELLOW: Rising polarization, protest activity, institutional stress
- ORANGE: Significant unrest, governance dysfunction, institutional failure
- RED: Civil breakdown, widespread violence, governance collapse

### 15. Mass Devastation & Collapse
Evaluate civilization-level threats, cascading failures, and systemic collapse.

**Indicators:**
- Nuclear war probability and escalation ladder
- Electromagnetic pulse (EMP) attack scenarios
- Global supply chain cascading failure risk
- Internet and communications backbone vulnerability
- Financial system total collapse scenarios
- Mass migration and refugee crisis triggers
- Water scarcity and aquifer depletion
- Topsoil erosion and agricultural land loss
- Biodiversity loss and ecosystem collapse thresholds
- Multiple simultaneous crisis (polycrisis) probability
- Social contract breakdown indicators
- Critical mineral and rare earth supply disruption

**Threat Levels:**
- GREEN: No convergence of major threats, systems resilient
- YELLOW: Multiple domains at elevated risk, early convergence signs
- ORANGE: Polycrisis forming, cascading failures beginning
- RED: Civilization-threatening convergence, systemic collapse in progress

## Composite Threat Assessment

After evaluating all domains, produce a composite score:

```
DOMAIN                      | STATUS  | LEVEL | TREND     | KEY SIGNAL
----------------------------|---------|-------|-----------|---------------------------
 1. Market Conditions       | [color] | X/10  | [up/down] | [one-line summary]
 2. Credit & Debt           | [color] | X/10  | [up/down] | [one-line summary]
 3. Bond Market             | [color] | X/10  | [up/down] | [one-line summary]
 4. Housing Market          | [color] | X/10  | [up/down] | [one-line summary]
 5. Geopolitical            | [color] | X/10  | [up/down] | [one-line summary]
 6. Job Market              | [color] | X/10  | [up/down] | [one-line summary]
 7. Food Crisis             | [color] | X/10  | [up/down] | [one-line summary]
 8. Energy Crisis           | [color] | X/10  | [up/down] | [one-line summary]
 9. Climate & Weather       | [color] | X/10  | [up/down] | [one-line summary]
10. Natural Disasters       | [color] | X/10  | [up/down] | [one-line summary]
11. Biological Threats      | [color] | X/10  | [up/down] | [one-line summary]
12. Space & Cosmic          | [color] | X/10  | [up/down] | [one-line summary]
13. AI & Technology         | [color] | X/10  | [up/down] | [one-line summary]
14. Societal & National     | [color] | X/10  | [up/down] | [one-line summary]
15. Mass Devastation        | [color] | X/10  | [up/down] | [one-line summary]
----------------------------|---------|-------|-----------|---------------------------
COMPOSITE THREAT            | [color] | X/10  | [trend]   | [overall assessment]
```

**Scoring:**
- 1-3: Low risk (GREEN) — Normal conditions, no action needed
- 4-5: Moderate risk (YELLOW) — Monitor closely, review exposure
- 6-7: Elevated risk (ORANGE) — Take defensive action, reduce exposure
- 8-9: High risk (RED) — Urgent action required, maximum defense
- 10: Critical (BLACK) — Existential threat, full emergency posture

## Recommended Actions by Composite Level

### GREEN (1-3): Business as usual
- Continue normal investment strategy
- Maintain standard emergency fund (3-6 months expenses)
- No special preparations needed

### YELLOW (4-5): Heightened awareness
- Review portfolio for concentration risk
- Ensure emergency fund is fully funded
- Stock basic supplies (2 weeks)
- Review insurance coverage
- Diversify income sources if possible

### ORANGE (6-7): Defensive posture
- Increase cash allocation (20-30%)
- Reduce leveraged positions
- Add hedges (puts, inverse ETFs, gold)
- Extend emergency supplies (1-3 months)
- Secure important documents and backups
- Review geographic risk (evacuation routes, alternate locations)

### RED (8-10): Emergency mode
- Maximum cash and hard assets
- Exit speculative positions
- Full emergency supplies (3-6 months)
- Activate backup communication plans
- Consider geographic relocation if regional threat
- Coordinate with family on emergency plans

## Data Sources for Research
Use WebSearch to pull current data from:
- Federal Reserve (FRED economic data)
- Bureau of Labor Statistics (jobs, CPI)
- NOAA (weather, space weather)
- NASA (asteroid tracking, solar activity)
- FAO (food price index)
- EIA (energy data)
- FEMA (disaster declarations)
- Treasury.gov (yield curves, debt)
- IMF/World Bank (global economic outlook)
- WHO (disease outbreak alerts)
- CDC (pathogen surveillance)
- FBI/DHS (threat assessments)
- ASCE (infrastructure report card)

## Integration with User Data
- Read `data/trades-log.json` for portfolio exposure analysis
- Read `data/tickers-cache.json` for sector concentration
- Read `memory/portfolio.md` for investment strategy context
- Read `data/goals.json` to assess which goals are at risk
- Save assessment to `data/spreadsheets/disaster-assessment.xlsx` for tracking over time
- Use `appendToSpreadsheet` to log rolling threat scores for trend analysis

## Commands
- `/disaster` or `/disaster categories` — Open overlay showing all 15 tracked domains
- `/disaster assess` — Run full web-researched threat assessment across all domains
- `/disaster protocols` — Show Plan A/B/C/D action protocols

## Integration with Disaster Planning Project

The disaster assessment skill works in conjunction with the background project at `projects/disaster-planning/`:

### Project Files
- `PROJECT.md` — Main project file with protocols and action items
- `research/threat-assessments.json` — Current threat levels for all 15 domains
- `research/readiness-scores.json` — Personal preparedness metrics
- `research/sources.json` — Tracked data sources

### Automated Updates
When running `/disaster assess`, the system:
1. Researches current threat indicators across all 15 domains
2. Updates `threat-assessments.json` with current risk levels
3. Logs findings to the project progress log
4. Triggers Plan A/B/C/D protocols when thresholds are crossed
5. Updates readiness recommendations based on composite score

### Protocol Triggers
- **Plan A** (10-20% threat probability): Early warning indicators detected
- **Plan B** (30-50% threat probability): Elevated threat response
- **Plan C** (50%+ threat probability): Imminent threat response
- **Plan D** (Crisis materialization): Full emergency mode
