import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";

const e = React.createElement;

/**
 * Disaster & Crisis Assessment Categories
 * Full list of tracked threat domains with descriptions and indicators.
 */
const DISASTER_CATEGORIES = [
  {
    id: "market",
    num: 1,
    name: "Market Conditions",
    icon: "$$",
    color: "#22c55e",
    description: "Equity markets, volatility, systemic financial risk",
    tracks: [
      "S&P 500 / NASDAQ trend and drawdown levels",
      "VIX volatility index (<15 calm, 15-25 elevated, >35 panic)",
      "Market breadth and advance/decline ratios",
      "Margin debt levels relative to GDP",
      "Insider selling vs buying activity",
      "Put/call ratio extremes and sentiment"
    ]
  },
  {
    id: "credit",
    num: 2,
    name: "Credit & Debt Crisis",
    icon: "CR",
    color: "#f59e0b",
    description: "Credit markets, sovereign debt, lending conditions",
    tracks: [
      "Credit spreads (investment grade and high yield)",
      "Corporate debt-to-earnings ratios",
      "Sovereign debt-to-GDP for major economies",
      "US national debt trajectory and debt ceiling",
      "Bank lending standards tightening/loosening",
      "Consumer delinquency rates (auto, credit card, student)"
    ]
  },
  {
    id: "bonds",
    num: 3,
    name: "Bond Market",
    icon: "BD",
    color: "#3b82f6",
    description: "Fixed income, yield curves, monetary policy risk",
    tracks: [
      "Yield curve shape (normal, flat, inverted)",
      "10-year Treasury yield level and direction",
      "Fed funds rate and forward guidance",
      "Real yields (nominal minus inflation)",
      "Bond market liquidity and failed trades",
      "Foreign central bank Treasury holdings"
    ]
  },
  {
    id: "housing",
    num: 4,
    name: "Housing Market",
    icon: "HM",
    color: "#a855f7",
    description: "Residential and commercial real estate risk",
    tracks: [
      "Home price-to-income ratio trends",
      "Mortgage rates vs historical average",
      "Housing inventory (months of supply)",
      "Mortgage delinquency and foreclosure rates",
      "Commercial real estate vacancy rates (office, retail)",
      "REIT performance and cap rate compression"
    ]
  },
  {
    id: "geopolitical",
    num: 5,
    name: "Geopolitical Issues",
    icon: "GP",
    color: "#ef4444",
    description: "International conflict, sanctions, instability",
    tracks: [
      "Active military conflicts and escalation risk",
      "Nuclear threat level (Doomsday Clock)",
      "US-China tensions (trade, Taiwan, tech decoupling)",
      "Russia/NATO and Eastern Europe tensions",
      "Middle East stability and oil supply risk",
      "Cyber warfare incidents against critical infrastructure",
      "Alliance fractures (NATO, AUKUS, EU cohesion)",
      "Sanctions regimes and trade disruptions"
    ]
  },
  {
    id: "jobs",
    num: 6,
    name: "Job Market & Labor",
    icon: "JB",
    color: "#06b6d4",
    description: "Employment conditions, layoffs, workforce disruption",
    tracks: [
      "Unemployment rate and trend direction",
      "Initial jobless claims (4-week moving average)",
      "Job openings to unemployed ratio (JOLTS)",
      "Mass layoff announcements by sector",
      "Wage growth vs inflation (real wages)",
      "Labor force participation rate changes",
      "AI-driven job displacement acceleration"
    ]
  },
  {
    id: "food",
    num: 7,
    name: "Food Crisis & Scarcity",
    icon: "FD",
    color: "#84cc16",
    description: "Food security, supply chains, famine, agricultural collapse",
    tracks: [
      "Global food price index (FAO) trend",
      "Fertilizer prices, supply, and sanctions impact",
      "Crop yield forecasts (wheat, corn, rice, soybeans)",
      "Drought and flood conditions in agricultural regions",
      "Food export bans by producing nations",
      "Livestock disease outbreaks (avian flu, swine fever)",
      "Fishery collapse and ocean dead zones",
      "Food desert expansion in urban/rural areas",
      "Grocery price inflation vs wage growth",
      "Strategic grain reserve levels by nation",
      "Pollinator decline impact on crop production",
      "Supply chain disruptions (shipping, ports, trucking)"
    ]
  },
  {
    id: "energy",
    num: 8,
    name: "Energy Crisis",
    icon: "EN",
    color: "#f97316",
    description: "Energy supply, prices, grid stability, transition risks",
    tracks: [
      "Crude oil price and supply/demand balance",
      "Natural gas prices (US Henry Hub, EU TTF)",
      "OPEC+ production decisions and spare capacity",
      "Strategic Petroleum Reserve levels",
      "Power grid reliability (blackout/brownout incidents)",
      "Renewable buildout pace vs demand growth",
      "Nuclear plant status and new construction",
      "Energy infrastructure attacks or sabotage"
    ]
  },
  {
    id: "climate",
    num: 9,
    name: "Climate & Extreme Weather",
    icon: "CL",
    color: "#14b8a6",
    description: "Climate change impacts, extreme weather, environmental breakdown",
    tracks: [
      "Extreme weather frequency (hurricanes, typhoons, cyclones)",
      "Wildfire severity and season length",
      "Flooding events (riverine, coastal, flash floods)",
      "Heat waves, heat domes, and record temperatures",
      "Tornado outbreaks and severe storm systems",
      "Ice storms, blizzards, polar vortex events",
      "Sea level rise trajectory and coastal erosion",
      "Arctic ice loss and permafrost thaw",
      "Insurance market stress (carrier withdrawals, premium spikes)",
      "Climate migration patterns and displacement",
      "Agricultural zone shifts and growing season changes",
      "Ocean acidification and coral reef collapse"
    ]
  },
  {
    id: "natural-disasters",
    num: 10,
    name: "Major Natural Disasters",
    icon: "ND",
    color: "#dc2626",
    description: "Earthquakes, tsunamis, volcanic eruptions, catastrophic events",
    tracks: [
      "Seismic activity and major earthquake risk zones",
      "Tsunami warning systems and coastal vulnerability",
      "Volcanic eruption risk (supervolcano monitoring)",
      "Landslide and mudslide risk areas",
      "Sinkhole events and subsidence",
      "Dam failure and infrastructure collapse risk",
      "FEMA disaster declarations and response capacity",
      "Infrastructure damage costs and rebuild timelines",
      "Cascading failure scenarios (quake -> tsunami -> nuclear)"
    ]
  },
  {
    id: "biological",
    num: 11,
    name: "Biological Threats & Pathogens",
    icon: "BT",
    color: "#e879f9",
    description: "Pandemics, biowarfare, pathogen outbreaks, lab safety",
    tracks: [
      "Active pandemic and epidemic surveillance (WHO alerts)",
      "Novel pathogen emergence (spillover events, gain-of-function)",
      "Bioweapon development and proliferation risk",
      "Biosafety lab incidents and containment breaches",
      "Antimicrobial resistance (superbugs, drug-resistant TB)",
      "Vaccine development pipeline and distribution gaps",
      "Healthcare system capacity and ICU availability",
      "Zoonotic disease monitoring (bird flu, MERS, Nipah)",
      "Synthetic biology and dual-use research concerns",
      "Bioterrorism threat assessments",
      "Water supply contamination risk",
      "Vector-borne disease range expansion (mosquitoes, ticks)"
    ]
  },
  {
    id: "space",
    num: 12,
    name: "Space & Cosmic Threats",
    icon: "SP",
    color: "#818cf8",
    description: "Solar storms, asteroids, space debris, cosmic events",
    tracks: [
      "Solar storm activity and coronal mass ejections",
      "Carrington-level event probability (grid destruction)",
      "Near-Earth asteroid tracking (NASA/ESA data)",
      "Space debris density and Kessler syndrome risk",
      "GPS and satellite constellation vulnerability",
      "Geomagnetic storm impacts on power and comms",
      "Gamma ray burst proximity monitoring",
      "Space weather forecasts (NOAA SWPC)"
    ]
  },
  {
    id: "ai-tech",
    num: 13,
    name: "AI & Technological Risk",
    icon: "AI",
    color: "#6366f1",
    description: "AI advancement risks, automation displacement, tech threats",
    tracks: [
      "AGI/ASI development timeline and capability milestones",
      "AI alignment and safety research progress",
      "Autonomous weapons development and regulation",
      "Deepfake proliferation and information warfare",
      "Critical infrastructure AI dependency risk",
      "Mass automation and workforce displacement pace",
      "AI-powered cyber attacks and zero-day exploitation",
      "Algorithmic market instability (flash crashes)",
      "Surveillance state expansion and privacy erosion",
      "AI concentration of power (few companies control)",
      "Synthetic media undermining trust in evidence",
      "Quantum computing threat to encryption timelines",
      "Social media algorithmic radicalization"
    ]
  },
  {
    id: "societal",
    num: 14,
    name: "Societal & National Issues",
    icon: "SC",
    color: "#f43f5e",
    description: "Domestic stability, governance, social cohesion, civil unrest",
    tracks: [
      "Political polarization index and civil unrest",
      "Trust in institutions (government, media, judiciary)",
      "Crime rates and public safety trends",
      "Healthcare system capacity and access",
      "Infrastructure condition (ASCE report card)",
      "Education system performance and readiness",
      "Homelessness and poverty rate trends",
      "Opioid and addiction crisis metrics",
      "Immigration policy impacts on labor and services",
      "Misinformation spread rate and media literacy",
      "Domestic extremism threat level (FBI/DHS)",
      "Wealth inequality trajectory (Gini coefficient)"
    ]
  },
  {
    id: "devastation",
    num: 15,
    name: "Mass Devastation & Collapse",
    icon: "DV",
    color: "#991b1b",
    description: "Civilization-level threats, cascading failures, systemic collapse",
    tracks: [
      "Nuclear war probability and escalation ladder",
      "Electromagnetic pulse (EMP) attack scenarios",
      "Global supply chain cascading failure risk",
      "Internet and communications backbone vulnerability",
      "Financial system total collapse scenarios",
      "Mass migration and refugee crisis triggers",
      "Water scarcity and aquifer depletion",
      "Topsoil erosion and agricultural land loss",
      "Biodiversity loss and ecosystem collapse thresholds",
      "Multiple simultaneous crisis (polycrisis) probability",
      "Social contract breakdown indicators",
      "Critical mineral and rare earth supply disruption"
    ]
  }
];

export { DISASTER_CATEGORIES };

/**
 * Disaster Categories Overlay
 * Full-screen overlay showing all tracked threat categories with descriptions.
 */
export const DisasterOverlay = ({ visible = true, onClose }) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const maxVisibleLines = 30;

  const buildLines = () => {
    const lines = [];

    lines.push({ text: "DISASTER & CRISIS ASSESSMENT", style: "title" });
    lines.push({ text: "Issues We Track For You", style: "subtitle" });
    lines.push({ text: "═".repeat(70), style: "divider" });
    lines.push({ text: "", style: "blank" });
    lines.push({ text: `${DISASTER_CATEGORIES.length} threat domains monitored across financial, environmental, technological, and societal risks.`, style: "desc" });
    lines.push({ text: "Each domain is scored 1-10 with GREEN/YELLOW/ORANGE/RED/BLACK threat levels.", style: "desc" });
    lines.push({ text: "", style: "blank" });

    if (selectedCategory !== null) {
      // Detail view for a single category
      const cat = DISASTER_CATEGORIES[selectedCategory];
      lines.push({ text: `─── ${cat.num}. ${cat.name} ───`, style: "section", color: cat.color });
      lines.push({ text: cat.description, style: "desc" });
      lines.push({ text: "", style: "blank" });
      lines.push({ text: "What we track:", style: "label" });
      for (const item of cat.tracks) {
        lines.push({ text: `  * ${item}`, style: "track", color: cat.color });
      }
      lines.push({ text: "", style: "blank" });
      lines.push({ text: "Threat Levels:", style: "label" });
      lines.push({ text: "  1-3  GREEN   Normal conditions, no action needed", style: "level", color: "#22c55e" });
      lines.push({ text: "  4-5  YELLOW  Monitor closely, review exposure", style: "level", color: "#f59e0b" });
      lines.push({ text: "  6-7  ORANGE  Defensive action, reduce exposure", style: "level", color: "#f97316" });
      lines.push({ text: "  8-9  RED     Urgent action, maximum defense", style: "level", color: "#ef4444" });
      lines.push({ text: "  10   BLACK   Existential threat, full emergency", style: "level", color: "#991b1b" });
      lines.push({ text: "", style: "blank" });
      lines.push({ text: "Press ESC to go back to list", style: "hint" });
    } else {
      // List all categories
      for (const cat of DISASTER_CATEGORIES) {
        lines.push({ text: `─── ${cat.num}. ${cat.name} ───`, style: "section", color: cat.color });
        lines.push({ text: `    ${cat.description}`, style: "desc" });
        const preview = cat.tracks.slice(0, 3).map(t => t).join(" | ");
        lines.push({ text: `    ${preview}`, style: "preview" });
        lines.push({ text: `    + ${cat.tracks.length} indicators tracked`, style: "count", color: cat.color });
        lines.push({ text: "", style: "blank" });
      }

      lines.push({ text: "═".repeat(70), style: "divider" });
      lines.push({ text: "", style: "blank" });
      lines.push({ text: "COMPOSITE THREAT = weighted average across all domains", style: "desc" });
      lines.push({ text: "Updated via web research, portfolio data, and connected services.", style: "desc" });
      lines.push({ text: "", style: "blank" });
      lines.push({ text: "Press 1-9, 0, A-F to view category details | ESC/Q to close | Arrows to scroll", style: "hint" });
    }

    return lines;
  };

  const lines = buildLines();
  const totalLines = lines.length;
  const maxScroll = Math.max(0, totalLines - maxVisibleLines);

  useInput((input, key) => {
    if (!visible) return;

    if (key.escape || input === "q" || input === "Q") {
      if (selectedCategory !== null) {
        setSelectedCategory(null);
        setScrollOffset(0);
      } else {
        onClose?.();
      }
      return;
    }

    // Number keys to select category (1-9 for first 9, 0 for 10)
    const numMap = { "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "8": 7, "9": 8, "0": 9 };
    // Letters for 11+
    const letterMap = { "a": 10, "b": 11, "c": 12, "d": 13, "e": 14, "f": 15 };

    if (selectedCategory === null) {
      const idx = numMap[input] ?? letterMap[input?.toLowerCase()];
      if (idx !== undefined && idx < DISASTER_CATEGORIES.length) {
        setSelectedCategory(idx);
        setScrollOffset(0);
        return;
      }
    }

    if (key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
    } else if (key.pageUp) {
      setScrollOffset(prev => Math.max(0, prev - maxVisibleLines));
    } else if (key.pageDown) {
      setScrollOffset(prev => Math.min(maxScroll, prev + maxVisibleLines));
    }
  }, { isActive: visible });

  useEffect(() => {
    setScrollOffset(0);
    setSelectedCategory(null);
  }, [visible]);

  if (!visible) return null;

  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxVisibleLines);

  const renderLine = (line, index) => {
    const lineNum = scrollOffset + index + 1;
    const numStr = String(lineNum).padStart(3) + " ";

    let textColor = "#94a3b8";
    let bold = false;

    switch (line.style) {
      case "title": textColor = "#f97316"; bold = true; break;
      case "subtitle": textColor = "#f59e0b"; break;
      case "divider": textColor = "#475569"; break;
      case "section": textColor = line.color || "#e2e8f0"; bold = true; break;
      case "desc": textColor = "#cbd5e1"; break;
      case "preview": textColor = "#64748b"; break;
      case "count": textColor = line.color || "#64748b"; break;
      case "track": textColor = line.color || "#94a3b8"; break;
      case "label": textColor = "#e2e8f0"; bold = true; break;
      case "level": textColor = line.color || "#94a3b8"; break;
      case "hint": textColor = "#475569"; break;
      case "blank": break;
    }

    return e(
      Box,
      { key: `dl-${lineNum}`, flexDirection: "row" },
      e(Text, { color: "#334155", dimColor: true }, numStr),
      e(Text, { color: textColor, bold }, line.text)
    );
  };

  return e(
    Box,
    {
      flexDirection: "column",
      borderStyle: "double",
      borderColor: "#f97316",
      padding: 1,
      width: "100%",
      minHeight: 20
    },
    // Header bar
    e(
      Box,
      { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
      e(Text, { color: "#f97316", bold: true }, selectedCategory !== null
        ? `DISASTER TRACKER  >  ${DISASTER_CATEGORIES[selectedCategory].name}`
        : "DISASTER & CRISIS TRACKER"),
      e(Text, { color: "#475569" },
        `${scrollOffset + 1}-${Math.min(scrollOffset + maxVisibleLines, totalLines)} of ${totalLines}`)
    ),

    // Scroll up indicator
    scrollOffset > 0 && e(Text, { color: "#475569", dimColor: true }, "  ... scroll up ..."),

    // Content
    e(
      Box,
      { flexDirection: "column" },
      ...visibleLines.map(renderLine)
    ),

    // Scroll down indicator
    scrollOffset < maxScroll && e(Text, { color: "#475569", dimColor: true }, "  ... scroll down ...")
  );
};

export default DisasterOverlay;
