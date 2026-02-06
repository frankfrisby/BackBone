#!/usr/bin/env node

/**
 * Overnight Research CLI Tool
 *
 * Commands:
 *   status   - Show overnight research status
 *   start    - Start overnight research service
 *   stop     - Stop overnight research service
 *   cycle    - Run a single research cycle
 *   macro    - Show macro knowledge summary
 *   recession - Show recession score with macro adjustments
 */

import { getOvernightResearch, runResearchCycle, getRecessionAdjustmentFromMacro } from "../src/services/overnight-research.js";
import { getRecessionScore, getRecessionLabel, getRecessionColor } from "../src/services/recession-score.js";

const command = process.argv[2] || "status";

async function main() {
  const service = getOvernightResearch();

  switch (command) {
    case "status": {
      const status = service.getStatus();
      console.log("\n=== OVERNIGHT RESEARCH STATUS ===\n");
      console.log(`Running:           ${status.isRunning ? "YES" : "NO"}`);
      console.log(`Overnight Hours:   ${status.isOvernightHours ? "YES (8 PM - 6 AM)" : "NO"}`);
      console.log(`Current Cycle:     ${status.currentCycle}`);
      console.log(`Last Cycle:        ${status.lastCycleTime || "Never"}`);
      console.log(`Last Macro Update: ${status.lastMacroResearch || "Never"}`);
      console.log(`Macro Themes:      ${status.macroThemeCount}`);
      console.log(`\nMacro Recession Adjustment: ${status.recessionAdjustment >= 0 ? "+" : ""}${status.recessionAdjustment.toFixed(2)}`);
      console.log(`\nConfig:`);
      console.log(`  - Operating Hours: ${status.config.startHour}:00 - ${status.config.endHour}:00`);
      console.log(`  - Tickers/Cycle:   ${status.config.tickersPerCycle}`);
      console.log(`  - Macro Interval:  ${status.config.macroIntervalMin} min`);
      break;
    }

    case "start": {
      console.log("Starting overnight research service...");
      if (!service.isOvernightHours()) {
        console.log("\nWarning: Not in overnight hours (8 PM - 6 AM)");
        console.log("Service will wait until overnight hours to begin research.");
      }
      await service.start();
      break;
    }

    case "stop": {
      service.stop();
      console.log("Overnight research service stopped.");
      break;
    }

    case "cycle": {
      console.log("Running single research cycle...\n");
      const result = await runResearchCycle();
      console.log("\n=== CYCLE RESULTS ===");
      console.log(`Tickers Researched: ${result.tickersResearched || 0}`);
      console.log(`Macro Themes:       ${result.macroThemesResearched || 0}`);
      if (result.errors?.length > 0) {
        console.log(`Errors:             ${result.errors.length}`);
      }
      if (result.skipped) {
        console.log(`Skipped:            ${result.reason}`);
      }
      break;
    }

    case "macro": {
      const summary = service.getMacroSummary();
      console.log("\n=== MACRO KNOWLEDGE SUMMARY ===\n");

      if (summary.length === 0) {
        console.log("No macro knowledge available. Run 'cycle' to gather data.");
        break;
      }

      for (const theme of summary) {
        const sentimentLabel = theme.sentiment > 0.2 ? "BULLISH" :
                               theme.sentiment < -0.2 ? "BEARISH" : "NEUTRAL";
        const sentimentColor = theme.sentiment > 0.2 ? "\x1b[32m" :
                               theme.sentiment < -0.2 ? "\x1b[31m" : "\x1b[33m";

        console.log(`${theme.theme}`);
        console.log(`  Sentiment: ${sentimentColor}${theme.sentiment.toFixed(2)} (${sentimentLabel})\x1b[0m`);
        console.log(`  Confidence: ${(theme.confidence * 100).toFixed(0)}%`);
        console.log(`  Articles: ${theme.articles}`);
        console.log(`  Age: ${theme.age}`);
        if (theme.topInsight) {
          console.log(`  Insight: ${theme.topInsight.slice(0, 80)}...`);
        }
        console.log(`  Affects: ${theme.affectedSectors?.join(", ") || "N/A"}`);
        console.log();
      }

      // Show overall recession adjustment
      const adj = getRecessionAdjustmentFromMacro();
      console.log(`\nOverall Recession Adjustment: ${adj >= 0 ? "+" : ""}${adj.toFixed(2)}`);
      console.log(`(Positive = more recession risk, Negative = less risk)`);
      break;
    }

    case "recession": {
      const score = getRecessionScore();
      console.log("\n=== RECESSION SCORE ===\n");
      console.log(`Score:  ${score.score.toFixed(1)} / 10`);
      console.log(`Label:  ${getRecessionLabel(score.score)}`);
      console.log(`Source: ${score.source}`);

      if (score.macroAdjustment) {
        console.log(`\nMacro Adjustment: ${score.macroAdjustment >= 0 ? "+" : ""}${score.macroAdjustment.toFixed(2)}`);
      }

      if (score.data) {
        console.log(`\nMarket Data:`);
        console.log(`  SPY Change:     ${score.data.spyChange}%`);
        console.log(`  Declining:      ${score.data.decliningPct}%`);
        console.log(`  Avg Decline:    ${score.data.avgDecline}%`);
        console.log(`  VIX Estimate:   ${score.data.vixEstimate}`);
        console.log(`  Tickers:        ${score.data.tickerCount}`);
      }

      console.log(`\nCalculated: ${score.calculatedAt}`);
      break;
    }

    default:
      console.log(`
Overnight Research CLI

Commands:
  status    - Show overnight research status
  start     - Start overnight research service
  stop      - Stop overnight research service
  cycle     - Run a single research cycle
  macro     - Show macro knowledge summary
  recession - Show recession score with macro adjustments

Usage: node tools/overnight-research.js <command>
      `);
  }
}

main().catch(console.error);
