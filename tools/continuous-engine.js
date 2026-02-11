#!/usr/bin/env node

/**
 * CLI tool for the Continuous Improvement Engine
 *
 * Usage:
 *   node tools/continuous-engine.js status      — Show engine status + learning stats
 *   node tools/continuous-engine.js start       — Start the engine
 *   node tools/continuous-engine.js stop        — Stop the engine
 *   node tools/continuous-engine.js pause       — Pause the engine
 *   node tools/continuous-engine.js resume      — Resume the engine
 *   node tools/continuous-engine.js nudge <act> — Force next action type
 *   node tools/continuous-engine.js history     — Show recent cycles
 *   node tools/continuous-engine.js top         — Show best actions by reward
 *   node tools/continuous-engine.js trends      — Show dimension trends
 */

import { getContinuousEngine } from "../src/services/continuous-engine.js";
import { getKnowledgeDB } from "../src/services/memory/knowledge-db.js";

const cmd = process.argv[2] || "status";
const arg = process.argv[3];

async function main() {
  const engine = getContinuousEngine();

  switch (cmd) {
    case "status": {
      const status = engine.getStatus();
      console.log("\n=== Continuous Improvement Engine ===\n");
      console.log(`  Running:    ${status.running ? "YES" : "NO"}`);
      console.log(`  Paused:     ${status.paused ? "YES" : "NO"}`);
      console.log(`  Resting:    ${status.resting ? "YES" : "NO"}`);
      console.log(`  Cycles:     ${status.cycleCount}`);
      console.log(`  Epsilon:    ${status.epsilon} (${Math.round(status.epsilon * 100)}% explore)`);

      const s = status.learningStats;
      if (s.totalCycles > 0) {
        console.log(`\n--- Learning Stats ---`);
        console.log(`  Total cycles:    ${s.totalCycles}`);
        console.log(`  Avg reward:      ${s.avgReward}`);
        console.log(`  Recent trend:    ${s.recentTrend} (last 10)`);
        console.log(`  Success rate:    ${s.successRate}%`);
        console.log(`  Explore ratio:   ${s.exploreRatio}%`);

        if (s.topActions.length > 0) {
          console.log(`\n--- Top Actions ---`);
          for (const a of s.topActions) {
            console.log(`  ${a.action_type.padEnd(25)} avg=${a.avg_reward.toFixed(3)}  runs=${a.total_runs}`);
          }
        }
      } else {
        console.log("\n  No learning data yet. Start the engine to begin.");
      }
      break;
    }

    case "start": {
      const result = await engine.start();
      console.log(result.success ? "Engine started." : `Failed: ${result.reason}`);
      if (result.success) {
        // Run for a while, then exit (use API for persistent operation)
        console.log("Running... (Ctrl+C to stop, or use API for persistent mode)");
        process.on("SIGINT", () => { engine.stop(); process.exit(0); });
      }
      break;
    }

    case "stop":
      engine.stop();
      console.log("Engine stopped.");
      process.exit(0);
      break;

    case "pause":
      engine.pause();
      console.log("Engine paused.");
      process.exit(0);
      break;

    case "resume":
      engine.resume();
      console.log("Engine resumed.");
      break;

    case "nudge":
      if (!arg) {
        console.log("Usage: node tools/continuous-engine.js nudge <action_type>");
        console.log("\nAvailable actions:");
        console.log("  portfolio_analysis, ticker_research, trade_evaluation");
        console.log("  health_analysis, health_recommendations");
        console.log("  goal_progress, project_work, goal_planning");
        console.log("  career_research, learning_progress");
        console.log("  market_research, news_analysis, disaster_assessment");
        console.log("  knowledge_indexing, deliverable_production");
        process.exit(1);
      }
      engine.nudge(arg);
      console.log(`Nudged engine to: ${arg}`);
      process.exit(0);
      break;

    case "history": {
      const db = getKnowledgeDB();
      const rows = db.prepare(`
        SELECT id, action_type, action_description, reward, success, strategy,
               started_at, duration_ms, error
        FROM engine_cycles
        ORDER BY started_at DESC
        LIMIT 20
      `).all();

      if (rows.length === 0) {
        console.log("No cycles recorded yet.");
        break;
      }

      console.log("\n=== Recent Cycles ===\n");
      for (const r of rows) {
        const time = new Date(r.started_at).toLocaleString();
        const dur = r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : "?";
        const status = r.success ? "OK" : "FAIL";
        const reward = r.reward !== null ? r.reward.toFixed(3) : "?";
        console.log(`  #${String(r.id).padStart(3)} ${time}  ${r.strategy.padEnd(8)} ${r.action_type.padEnd(25)} ${status.padEnd(5)} r=${reward} (${dur})${r.error ? ` ERR: ${r.error.slice(0, 40)}` : ""}`);
      }
      break;
    }

    case "top": {
      const db = getKnowledgeDB();
      const rows = db.prepare(`
        SELECT action_type, action_target, total_runs, avg_reward, best_reward, worst_reward, consecutive_failures
        FROM action_effectiveness
        ORDER BY avg_reward DESC
      `).all();

      if (rows.length === 0) {
        console.log("No effectiveness data yet.");
        break;
      }

      console.log("\n=== Action Effectiveness ===\n");
      console.log("  Action                      Runs  Avg     Best    Worst   Fails");
      console.log("  " + "-".repeat(75));
      for (const r of rows) {
        console.log(`  ${r.action_type.padEnd(28)} ${String(r.total_runs).padStart(4)}  ${r.avg_reward.toFixed(3).padStart(7)}  ${r.best_reward.toFixed(3).padStart(7)}  ${r.worst_reward.toFixed(3).padStart(7)}  ${String(r.consecutive_failures).padStart(5)}`);
      }
      break;
    }

    case "trends": {
      const db = getKnowledgeDB();
      const dims = db.prepare(`
        SELECT DISTINCT dimension FROM state_snapshots ORDER BY dimension
      `).all();

      if (dims.length === 0) {
        console.log("No state snapshots yet.");
        break;
      }

      console.log("\n=== Dimension Trends (last 10 snapshots each) ===\n");
      for (const { dimension } of dims) {
        const rows = db.prepare(`
          SELECT value, timestamp
          FROM state_snapshots
          WHERE dimension = ?
          ORDER BY timestamp DESC
          LIMIT 10
        `).all(dimension);

        if (rows.length < 2) continue;

        const latest = rows[0].value;
        const oldest = rows[rows.length - 1].value;
        const change = latest - oldest;
        const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";

        console.log(`  ${dimension.padEnd(20)} ${latest.toFixed(1).padStart(8)} ${arrow} (${change >= 0 ? "+" : ""}${change.toFixed(1)} over ${rows.length} samples)`);
      }
      break;
    }

    default:
      console.log("Usage: node tools/continuous-engine.js [status|start|stop|pause|resume|nudge|history|top|trends]");
      process.exit(1);
  }
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
