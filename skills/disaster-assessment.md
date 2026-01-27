# Disaster & Crisis Assessment Skill

Comprehensive threat evaluation framework covering financial, geopolitical, environmental, and societal risks. Used to assess current conditions, identify emerging threats, and recommend defensive actions across all domains that could impact the user's life, portfolio, and plans.

## When to Use
- User asks about market crashes, recessions, or economic downturns
- User asks about crisis situations, disasters, or systemic risks
- User wants to evaluate current threat levels across domains
- User asks "what could go wrong", "what are the risks", "should I be worried"
- Periodic check-in as part of planning or portfolio review
- News breaks about a major event (war, pandemic, financial collapse, natural disaster)

## Assessment Domains

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

### 7. Food Crisis
Evaluate food security, supply chains, and agricultural risk.

**Indicators:**
- Global food price index (FAO) trend
- Fertilizer prices and availability
- Crop yield forecasts (wheat, corn, rice, soybeans)
- Drought/flood conditions in major agricultural regions
- Food export bans by producing nations
- Livestock disease outbreaks
- Supply chain disruptions (shipping, ports, trucking)
- US food inflation rate (grocery CPI component)

**Actions:**
- WebSearch for current food price index, crop conditions
- Assess impact on consumer spending and inflation outlook

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

### 9. Climate Issues
Evaluate climate-related risks and extreme weather impacts.

**Indicators:**
- Extreme weather event frequency and severity (hurricanes, wildfires, floods, heat waves)
- Insurance market stress (carrier withdrawals, premium spikes)
- Infrastructure damage costs (FEMA spending, disaster declarations)
- Sea level rise trajectory and coastal risk
- Arctic ice and permafrost status
- Agricultural zone shifts
- Climate migration patterns
- Carbon regulation and compliance costs

**Actions:**
- WebSearch for recent extreme weather, insurance market status
- Assess user's geographic and portfolio exposure to climate risk

### 10. Space & Cosmic Issues
Evaluate space-related threats and disruptions.

**Indicators:**
- Solar storm activity (solar cycle, coronal mass ejection risk)
- Carrington Event probability (grid-destroying solar storm)
- Near-Earth asteroid tracking (NASA/ESA close approach data)
- Space debris density and collision risk (Kessler syndrome)
- GPS/satellite constellation vulnerability
- Geomagnetic storm impacts on communications and power
- Space weather forecasts (NOAA Space Weather Prediction Center)

**Threat Levels:**
- GREEN: Quiet sun, no close approaches, stable space environment
- YELLOW: Elevated solar activity, minor geomagnetic storms
- ORANGE: Major solar event, satellite disruptions, GPS degradation
- RED: Extreme solar storm, potential grid damage, communication blackout

### 11. Societal & National Issues
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

**Threat Levels:**
- GREEN: Stable governance, high trust, low unrest
- YELLOW: Rising polarization, protest activity, institutional stress
- ORANGE: Significant unrest, governance dysfunction, institutional failure
- RED: Civil breakdown, widespread violence, governance collapse

## Composite Threat Assessment

After evaluating all domains, produce a composite score:

```
DOMAIN              | STATUS  | LEVEL | TREND     | KEY SIGNAL
--------------------|---------|-------|-----------|---------------------------
Market Conditions   | [color] | X/10  | [up/down] | [one-line summary]
Credit & Debt       | [color] | X/10  | [up/down] | [one-line summary]
Bond Market         | [color] | X/10  | [up/down] | [one-line summary]
Housing Market      | [color] | X/10  | [up/down] | [one-line summary]
Geopolitical        | [color] | X/10  | [up/down] | [one-line summary]
Job Market          | [color] | X/10  | [up/down] | [one-line summary]
Food Crisis         | [color] | X/10  | [up/down] | [one-line summary]
Energy Crisis       | [color] | X/10  | [up/down] | [one-line summary]
Climate Issues      | [color] | X/10  | [up/down] | [one-line summary]
Space & Cosmic      | [color] | X/10  | [up/down] | [one-line summary]
Societal & National | [color] | X/10  | [up/down] | [one-line summary]
--------------------|---------|-------|-----------|---------------------------
COMPOSITE THREAT    | [color] | X/10  | [trend]   | [overall assessment]
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

## Integration with User Data
- Read `data/trades-log.json` for portfolio exposure analysis
- Read `data/tickers-cache.json` for sector concentration
- Read `memory/portfolio.md` for investment strategy context
- Read `data/goals.json` to assess which goals are at risk
- Save assessment to `data/spreadsheets/disaster-assessment.xlsx` for tracking over time
- Use `appendToSpreadsheet` to log rolling threat scores for trend analysis
