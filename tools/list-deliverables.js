#!/usr/bin/env node
/**
 * List Deliverables — Show status of all project deliverables
 */
import { getDeliverablesSummary, getAllDeliverables } from "../src/services/documents/deliverables-tracker.js";

const args = process.argv.slice(2);
const projectFilter = args.find(a => a.startsWith("--project="))?.split("=")[1];

const all = getAllDeliverables();
const filtered = projectFilter ? all.filter(d => d.projectId === projectFilter) : all;

const produced = filtered.filter(d => d.status === "produced");
const pending = filtered.filter(d => d.status === "pending");

console.log("\n=== BACKBONE DELIVERABLES STATUS ===\n");
console.log(`Total: ${filtered.length} | Produced: ${produced.length} | Pending: ${pending.length}\n`);

if (produced.length > 0) {
  console.log("PRODUCED:");
  for (const d of produced) {
    console.log(`  [DONE] ${d.type.toUpperCase().padEnd(5)} ${d.name}`);
    console.log(`         ${d.description}`);
    console.log(`         File: ${d.file || "N/A"}`);
  }
  console.log();
}

if (pending.length > 0) {
  console.log("PENDING:");
  for (const d of pending) {
    console.log(`  [TODO] ${d.type.toUpperCase().padEnd(5)} ${d.name}`);
    console.log(`         ${d.description}`);
  }
  console.log();
}

if (!projectFilter) {
  console.log("--- Per Project ---\n");
  console.log(getDeliverablesSummary());
}
