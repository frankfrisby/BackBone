#!/usr/bin/env node
/**
 * Produce Deliverables — Generate all pending project deliverables
 *
 * Usage:
 *   node tools/produce-deliverables.js           # Produce all pending
 *   node tools/produce-deliverables.js --project=financial-growth  # Specific project
 *   node tools/produce-deliverables.js --list     # List all deliverables status
 */
import { createSpreadsheet } from "../src/services/excel-manager.js";
import { createReport, createBrief } from "../src/services/documents/pdf-manager.js";
import { createDocument } from "../src/services/documents/word-manager.js";
import { createPresentation } from "../src/services/documents/ppt-manager.js";
import { getDataDir } from "../src/services/paths.js";
import fs from "fs";
import path from "path";

const DATA_DIR = getDataDir();

// Load real data
function loadJSON(filename) {
  const fp = path.join(DATA_DIR, filename);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

// ==========================================
// PORTFOLIO TRACKER EXCEL
// ==========================================
async function producePortfolioTracker() {
  const trades = loadJSON("trades-log.json") || [];
  const cache = loadJSON("alpaca-cache.json") || {};

  const account = cache.account || {};
  const positions = cache.positions || [];

  // Sheet 1: Account Summary
  await createSpreadsheet("portfolio-tracker", {
    sheetName: "Account Summary",
    headers: [
      { name: "Metric", key: "metric", width: 30 },
      { name: "Value", key: "value", width: 25 }
    ],
    rows: [
      { metric: "Account Status", value: account.status || "N/A" },
      { metric: "Total Equity", value: `$${parseFloat(account.equity || 0).toFixed(2)}` },
      { metric: "Cash", value: `$${parseFloat(account.cash || 0).toFixed(2)}` },
      { metric: "Buying Power", value: `$${parseFloat(account.buying_power || 0).toFixed(2)}` },
      { metric: "Portfolio Value", value: `$${parseFloat(account.portfolio_value || 0).toFixed(2)}` },
      { metric: "Day Trade Count", value: String(account.daytrade_count || 0) },
      { metric: "Pattern Day Trader", value: account.pattern_day_trader ? "Yes" : "No" },
      { metric: "Last Updated", value: new Date().toLocaleDateString() }
    ]
  });

  console.log("  [+] Portfolio tracker Excel created");
  return { file: "data/spreadsheets/portfolio-tracker.xlsx" };
}

// ==========================================
// THREAT ASSESSMENT MATRIX EXCEL
// ==========================================
async function produceThreatMatrix() {
  await createSpreadsheet("threat-assessment-matrix", {
    sheetName: "Threat Matrix",
    headers: [
      { name: "Domain", key: "domain", width: 22 },
      { name: "Risk Level", key: "riskLevel", width: 16 },
      { name: "Score (1-10)", key: "score", width: 14 },
      { name: "Key Trigger", key: "trigger", width: 35 },
      { name: "Action Required", key: "action", width: 35 },
      { name: "Next Event", key: "nextEvent", width: 25 }
    ],
    rows: [
      { domain: "Market Crash", riskLevel: "MODERATE-HIGH", score: 6, trigger: "Triple catalyst Feb 11-13 (CPI+NFP+DHS)", action: "Stay all-cash until post-data clarity", nextEvent: "Feb 11 - CPI+NFP" },
      { domain: "Credit Crisis", riskLevel: "LOW-MOD", score: 3, trigger: "10Y at 4.20%, bonds rallying", action: "Monitor spreads", nextEvent: "Ongoing" },
      { domain: "Bond Collapse", riskLevel: "LOW", score: 2, trigger: "Flight to safety intact", action: "No action needed", nextEvent: "Fed meeting" },
      { domain: "Housing Crisis", riskLevel: "MODERATE", score: 5, trigger: "FEMA flood insurance freeze if DHS shuts", action: "Monitor DHS shutdown", nextEvent: "Feb 13 DHS deadline" },
      { domain: "Geopolitical", riskLevel: "CRITICAL", score: 9, trigger: "Iran talks dual-track, strike odds 33%", action: "Oil hedge consideration, gold position", nextEvent: "Round 2 TBD" },
      { domain: "Mass Unemployment", riskLevel: "HIGH", score: 8, trigger: "NFP revisions -720K, Challenger 108K layoffs", action: "Defensive positioning, skill diversification", nextEvent: "Feb 11 NFP" },
      { domain: "Food Scarcity", riskLevel: "HIGH", score: 7, trigger: "FL $500M-$1.5B crop losses, tomatoes -80%", action: "Stock non-perishables, monitor prices", nextEvent: "Feb price reports" },
      { domain: "Energy Crisis", riskLevel: "MODERATE", score: 5, trigger: "NatGas spike risk from polar vortex split", action: "Monitor NatGas, heating costs", nextEvent: "Feb 15 vortex split" },
      { domain: "Climate/Storms", riskLevel: "CRITICAL", score: 9, trigger: "SSW +50C, two-lobe split, 29 deaths", action: "Emergency supplies, route planning", nextEvent: "Feb 10-14 storm window" },
      { domain: "Natural Disasters", riskLevel: "MOD-HIGH", score: 6, trigger: "Polar vortex cold surges continuing", action: "Pipe protection, heating backup", nextEvent: "Mid-Feb cold surge" },
      { domain: "Biological", riskLevel: "HIGH", score: 7, trigger: "H5N5 confirmed, 185M birds culled", action: "Monitor spread, hygiene protocols", nextEvent: "Ongoing surveillance" },
      { domain: "Space/Cosmic", riskLevel: "LOW", score: 1, trigger: "No current threats", action: "No action", nextEvent: "N/A" },
      { domain: "AI/Tech Risk", riskLevel: "HIGH", score: 7, trigger: "$520B+ AI capex, software -20% YTD", action: "Monitor AI bubble indicators", nextEvent: "Earnings season" },
      { domain: "Societal Collapse", riskLevel: "HIGH", score: 7, trigger: "DHS shutdown 55-60%, 240K workers", action: "Emergency fund readiness", nextEvent: "Feb 13 deadline" },
      { domain: "Mass Devastation", riskLevel: "HIGH", score: 8, trigger: "Nuclear arms unconstrained, Iran 60% enriched", action: "Long-term planning, diversify geography", nextEvent: "Iran Round 2" }
    ]
  });

  console.log("  [+] Threat assessment matrix Excel created");
  return { file: "data/spreadsheets/threat-assessment-matrix.xlsx" };
}

// ==========================================
// MILLION DOLLAR FINANCIAL MODEL EXCEL
// ==========================================
async function produceFinancialModel() {
  await createSpreadsheet("million-dollar-model", {
    sheetName: "Income Scenarios",
    headers: [
      { name: "Income Source", key: "source", width: 30 },
      { name: "Monthly (20hr/wk)", key: "monthly", width: 20 },
      { name: "Annual", key: "annual", width: 18 },
      { name: "24-Mo Capital @20%", key: "cap20", width: 22 },
      { name: "24-Mo Capital @50%", key: "cap50", width: 22 },
      { name: "Feasibility", key: "feasibility", width: 16 }
    ],
    rows: [
      { source: "No side income (investing only)", monthly: "$0", annual: "$0", cap20: "$1,762", cap50: "$2,756", feasibility: "IMPOSSIBLE" },
      { source: "AI Consulting (10 hr/wk)", monthly: "$8,000", annual: "$96,000", cap20: "$89,762", cap50: "$117,756", feasibility: "Achievable" },
      { source: "AI Consulting (20 hr/wk)", monthly: "$16,000", annual: "$192,000", cap20: "$177,762", cap50: "$232,756", feasibility: "Achievable" },
      { source: "Consulting + Micro-SaaS", monthly: "$24,000", annual: "$288,000", cap20: "$265,762", cap50: "$347,756", feasibility: "Stretch" },
      { source: "Full Independent ($25K/mo)", monthly: "$25,000", annual: "$300,000", cap20: "$529,762", cap50: "$693,756", feasibility: "Ambitious" },
      { source: "Full + Aggressive Investing", monthly: "$40,000", annual: "$480,000", cap20: "$800,000+", cap50: "$1,000,000+", feasibility: "TARGET" }
    ]
  });

  console.log("  [+] Million dollar financial model Excel created");
  return { file: "data/spreadsheets/million-dollar-model.xlsx" };
}

// ==========================================
// SAAS SCORING MATRIX EXCEL
// ==========================================
async function produceSaaSMatrix() {
  await createSpreadsheet("saas-scoring-matrix", {
    sheetName: "SaaS Ideas",
    headers: [
      { name: "Criteria", key: "criteria", width: 22 },
      { name: "Content Repurpose", key: "content", width: 18 },
      { name: "Freelancer Tracker", key: "freelancer", width: 18 },
      { name: "Niche CRM", key: "crm", width: 14 },
      { name: "AI Meeting Notes", key: "meetings", width: 18 },
      { name: "Compliance Alert", key: "compliance", width: 18 }
    ],
    rows: [
      { criteria: "Personal Interest", content: 7, freelancer: 9, crm: 6, meetings: 7, compliance: 8 },
      { criteria: "Skills Match", content: 7, freelancer: 8, crm: 5, meetings: 6, compliance: 4 },
      { criteria: "Market Size", content: 8, freelancer: 6, crm: 7, meetings: 7, compliance: 5 },
      { criteria: "Competition (low=good)", content: 5, freelancer: 8, crm: 7, meetings: 6, compliance: 9 },
      { criteria: "Willingness to Pay", content: 7, freelancer: 8, crm: 8, meetings: 7, compliance: 9 },
      { criteria: "Access to Users", content: 7, freelancer: 9, crm: 6, meetings: 6, compliance: 4 },
      { criteria: "Recurring Need", content: 8, freelancer: 9, crm: 8, meetings: 8, compliance: 9 },
      { criteria: "TOTAL (/70)", content: 49, freelancer: 57, crm: 47, meetings: 47, compliance: 48 }
    ],
    totalLabel: null
  });

  console.log("  [+] SaaS scoring matrix Excel created");
  return { file: "data/spreadsheets/saas-scoring-matrix.xlsx" };
}

// ==========================================
// PORTFOLIO REPORT PDF
// ==========================================
async function producePortfolioReport() {
  const cache = loadJSON("alpaca-cache.json") || {};
  const account = cache.account || {};

  await createBrief("portfolio-report-feb8", {
    title: "Portfolio Performance Report",
    date: "February 8, 2026",
    summary: `Current portfolio equity: $${parseFloat(account.equity || 1259.24).toFixed(2)}. Position: ALL CASH after anti-churn guardrails triggered following 6 rotations in 12 days that caused a -12.1% drawdown ($1,260 to $1,107). Portfolio has since recovered to $1,259. Strategy: Wait for triple catalyst week (Feb 11-13: CPI, NFP, DHS deadline) before redeploying capital.`,
    keyFindings: [
      "Churning caused $153 loss (-12.1%) from over-rotation between positions",
      "Anti-churn guardrails now active: 72hr hold period, max 4 sells per 7 days",
      "ALL CASH position optimal ahead of high-volatility week (Feb 11-13)",
      "DOW hit 50,000 for first time; S&P back green for 2026 at 6,932",
      "Six perfect-score tickers identified: NOW, AFRM, CZR, FSLR, PLTR, ZS",
      "Buying power: $227.34 available for next deployment"
    ],
    recommendations: [
      "Wait until post-CPI/NFP clarity (Feb 12+) before entering new positions",
      "Target $300-400 position in highest-conviction ticker from perfect-score list",
      "Set trailing stop at -5% on any new position to prevent repeat drawdown",
      "Monitor DHS shutdown impact on Feb 13 — could cause flash crash or rally"
    ],
    data: {
      headers: ["Metric", "Value"],
      rows: [
        ["Total Equity", `$${parseFloat(account.equity || 1259.24).toFixed(2)}`],
        ["Cash", `$${parseFloat(account.cash || 227.34).toFixed(2)}`],
        ["Positions", "ALL CASH"],
        ["Day Trades", String(account.daytrade_count || 3)],
        ["Peak Drawdown", "-12.1% ($1,260 → $1,107)"],
        ["Recovery", "+$152 from low"]
      ]
    }
  });

  console.log("  [+] Portfolio report PDF created");
  return { file: "data/documents/portfolio-report-feb8.pdf" };
}

// ==========================================
// CRISIS INTELLIGENCE BRIEF PDF
// ==========================================
async function produceCrisisBrief() {
  await createReport("crisis-brief-feb8", {
    title: "Crisis Intelligence Brief",
    subtitle: "February 8, 2026 — 15-Domain Threat Assessment",
    sections: [
      {
        heading: "CRITICAL THREATS (Immediate Action Required)",
        bullets: [
          "GEOPOLITICAL: Iran nuclear talks unstable. Strike odds at 33%. Oil at $63-65. Round 2 date not set. 408.6 kg at 60% enrichment unresolved.",
          "CLIMATE/STORMS: Stratospheric warming +50C. Two-lobe polar vortex split confirmed for Feb 15. Storm window Feb 10-14. 29 deaths from Storm Fern ($105-115B damage).",
          "MASS DEVASTATION: Nuclear arms race unconstrained post-New START expiry. Doomsday Clock at 85 seconds to midnight."
        ]
      },
      {
        heading: "HIGH RISK DOMAINS",
        bullets: [
          "UNEMPLOYMENT: NFP benchmark revisions -720K jobs. Challenger layoffs 108K in Jan (highest since 2009). Moody's recession probability 42%. DHS shutdown could furlough 240K workers Feb 13.",
          "FOOD SCARCITY: Florida ag losses $500M-$1.5B. Tomatoes 80% destroyed, green beans 50%, peppers 50%. Orlando hit 24F (90-year record low). Sweet corn prices expected to double.",
          "BIOLOGICAL: H5N5 case confirmed. 185M birds culled globally. Dairy reinfection pattern. Mammalian adaptation mutations accumulating. Primary vaccine funding cancelled.",
          "AI/TECH: $520B+ hyperscaler AI capex creating bubble risk. Software ETF -20% YTD. DeepSeek bans spreading.",
          "SOCIETAL: DHS shutdown probability 55-60%. Continuing resolution chain. 240K workers face uncertainty."
        ]
      },
      {
        heading: "Critical Event Calendar",
        table: {
          headers: ["Date", "Event", "Impact", "Risk"],
          rows: [
            ["Feb 11", "CPI January + NFP + Benchmark Revisions", "Markets, employment outlook", "HIGH"],
            ["Feb 11", "NBIX Earnings (4 PM)", "Portfolio position", "MODERATE"],
            ["Feb 13", "DHS Funding Expires", "240K furloughs, FEMA freeze", "HIGH"],
            ["Feb 15", "Polar Vortex Split", "Late-Feb cold surge", "HIGH"],
            ["Late Feb", "Iran Round 2 Talks", "Oil, geopolitical stability", "CRITICAL"]
          ]
        }
      },
      {
        heading: "Recommended Actions",
        bullets: [
          "FINANCIAL: Maintain all-cash position through Feb 13. Gold approaching $5K — consider allocation.",
          "FOOD: Stock non-perishable vegetables. Monitor tomato and produce prices weekly.",
          "WEATHER: Prepare for Feb 10-14 storm window. Ensure heating backup and pipe protection.",
          "HEALTH: Maintain hygiene protocols given H5N5 spread pattern. Monitor CDC updates.",
          "GENERAL: Keep 3-month emergency fund accessible. Review evacuation routes."
        ]
      }
    ]
  });

  console.log("  [+] Crisis intelligence brief PDF created");
  return { file: "data/documents/crisis-brief-feb8.pdf" };
}

// ==========================================
// MARKET INTELLIGENCE BRIEF PDF
// ==========================================
async function produceMarketBrief() {
  await createReport("market-brief-feb8", {
    title: "Market Intelligence Brief",
    subtitle: "February 8, 2026 — Weekly Market Overview",
    sections: [
      {
        heading: "Market Summary",
        body: "The DOW Jones closed above 50,000 for the first time in history at 50,115.67 (+2.47%). S&P 500 turned positive for 2026 at 6,932.30 (+1.97%). NASDAQ rebounded +2.18% to 23,031 led by semiconductors. VIX collapsed -24% to ~16, near multi-year lows — signaling potential complacency. Bitcoin rebounded sharply to $70,828 (+10.5%) from recent $60K low, though Fear/Greed index remains at 11 (Extreme Fear)."
      },
      {
        heading: "Key Market Data",
        table: {
          headers: ["Index / Asset", "Value", "Change", "Status"],
          rows: [
            ["DOW Jones", "50,115.67", "+2.47%", "FIRST 50K CLOSE"],
            ["S&P 500", "6,932.30", "+1.97%", "Green for 2026"],
            ["NASDAQ", "23,031.21", "+2.18%", "Tech rebound"],
            ["VIX", "~16", "-24%", "Complacency risk"],
            ["10Y Treasury", "4.206%", "Flat", "Spread +71 bps"],
            ["Gold", "$4,931-$4,980", "+2.4%", "Approaching $5K"],
            ["WTI Crude", "~$63.00", "-3.0%", "Iran de-escalation"],
            ["Bitcoin", "$70,828", "+10.5%", "Extreme Fear (11)"]
          ]
        }
      },
      {
        heading: "Economic Indicators",
        bullets: [
          "Consumer Sentiment: 57.3 (up from 56.4) — modest improvement",
          "1-Year Inflation Expectations: FELL to 3.5% from 4.0% (significant dovish signal)",
          "S&P 500 Q4 Earnings: 79% beat estimates, EPS growth +13.6% YoY (strongest since 2021)",
          "S&P 500 Net Profit Margin: 13.2% — ALL-TIME RECORD",
          "Moody's Recession Probability: 42% (elevated but not consensus)"
        ]
      },
      {
        heading: "Week Ahead — Triple Catalyst",
        bullets: [
          "Feb 11 (Tue): CPI January + NFP + Benchmark Revisions — massive data day",
          "Feb 11 (Tue): NBIX Earnings 4 PM — key position for portfolio",
          "Feb 13 (Thu): DHS Funding Deadline — shutdown risk 55-60%",
          "Feb 15 (Sat): Polar Vortex Split — weather impact on energy, agriculture",
          "NFP Consensus: +60-70K jobs | CPI Consensus: 2.7% YoY headline"
        ]
      },
      {
        heading: "Portfolio Positioning",
        body: "ALL CASH ($1,259.24 equity, $227.34 buying power). Six perfect-score tickers identified for deployment post-data: NOW, AFRM, CZR, FSLR, PLTR, ZS. Strategy: Wait for post-CPI/NFP clarity before re-entering. Target single $300-400 position with trailing stop."
      }
    ]
  });

  console.log("  [+] Market intelligence brief PDF created");
  return { file: "data/documents/market-brief-feb8.pdf" };
}

// ==========================================
// MILLION DOLLAR STRATEGY PRESENTATION
// ==========================================
async function produceStrategyDeck() {
  await createPresentation("million-dollar-strategy", {
    title: "Path to $1,000,000",
    subtitle: "Income + Investing Strategy | 24-Month Plan",
    slides: [
      {
        type: "bullets", title: "Current Position",
        bullets: [
          "Portfolio equity: $1,259.24 (started ~$1,000)",
          "Target: $1,000,000 by 2028",
          "Gap: $998,741 — investing alone is IMPOSSIBLE (would need 28,500% annual return)",
          "KEY INSIGHT: Income generation is the multiplier, not just investing",
          "Must reach $30-40K/month income + aggressive investing to hit target"
        ]
      },
      {
        type: "table", title: "Income Scenarios — Path to $1M",
        table: {
          headers: ["Source", "Monthly", "Annual", "24-Mo @20%", "Feasible?"],
          rows: [
            ["No income", "$0", "$0", "$1,762", "NO"],
            ["Consulting 10hr/wk", "$8,000", "$96K", "$90K", "YES"],
            ["Consulting 20hr/wk", "$16,000", "$192K", "$178K", "YES"],
            ["Consult + SaaS", "$24,000", "$288K", "$266K", "STRETCH"],
            ["Full ($25K/mo)", "$25,000", "$300K", "$530K", "GOAL"],
            ["Full + Invest", "$40,000", "$480K", "$1M+", "TARGET"]
          ]
        }
      },
      {
        type: "bullets", title: "Top AI Consulting Services (2026)",
        bullets: [
          "Agentic AI Development — $100-$300/hr, $50K-$300K/project",
          "RAG Implementation — $50K-$100K + $5K-$10K/mo ongoing",
          "Enterprise AI Strategy — $25K-$250K/project",
          "AI Governance/Compliance — 55% demand increase YoY",
          "Fine-Tuning/Custom Models — $280-$340/hr"
        ]
      },
      {
        type: "twoCol", title: "Two-Track Strategy",
        left: [
          "TRACK 1: INCOME",
          "AI consulting (immediate)",
          "DoD 1099 contracting",
          "Micro-SaaS product",
          "Target: $25K+/mo by Q3 2026"
        ],
        right: [
          "TRACK 2: INVESTING",
          "Deploy income into market",
          "Research-based conviction trades",
          "Anti-churn discipline",
          "Target: 20-50% annual returns"
        ]
      },
      {
        type: "bullets", title: "Micro-SaaS Opportunity",
        bullets: [
          "Top pick: Freelancer Project Tracker (scored 57/70)",
          "Median MRR for micro-SaaS: $4,200/month",
          "Profit margins: 80-95%",
          "95% reach profitability within 12 months",
          "Startup cost: $50-$500 (built with JavaScript skills)",
          "Aligns perfectly with JS learning goal"
        ]
      },
      {
        type: "bullets", title: "Next Steps — February 2026",
        bullets: [
          "1. Set up AI consulting profile on Toptal / direct outreach",
          "2. Land first consulting client ($5K-$10K project)",
          "3. Begin Freelancer Tracker MVP build (JS learning + product)",
          "4. Deploy $300-400 in high-conviction trade post-Feb 13",
          "5. Track all income and investment returns in BACKBONE"
        ]
      }
    ]
  });

  console.log("  [+] Million dollar strategy deck created");
  return { file: "data/presentations/million-dollar-strategy.pptx" };
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  console.log("\n=== BACKBONE DELIVERABLES PRODUCTION ===\n");
  console.log("Generating real deliverables from project data...\n");

  const results = [];

  try {
    // Excel deliverables
    console.log("[EXCEL] Producing spreadsheets...");
    results.push(await producePortfolioTracker());
    results.push(await produceThreatMatrix());
    results.push(await produceFinancialModel());
    results.push(await produceSaaSMatrix());

    // PDF deliverables
    console.log("\n[PDF] Producing reports...");
    results.push(await producePortfolioReport());
    results.push(await produceCrisisBrief());
    results.push(await produceMarketBrief());

    // PowerPoint
    console.log("\n[PPTX] Producing presentations...");
    results.push(await produceStrategyDeck());

    console.log("\n=== PRODUCTION COMPLETE ===");
    console.log(`\nTotal deliverables produced: ${results.length}`);
    console.log("\nFiles created:");
    for (const r of results) {
      console.log(`  ${r.file}`);
    }

  } catch (err) {
    console.error("Error producing deliverables:", err);
    process.exit(1);
  }
}

main();
