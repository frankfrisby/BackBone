/**
 * Tool: Health Check
 *
 * Get latest health data from Oura (sleep, readiness, activity).
 */

import fs from "fs";
import path from "path";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "health-check",
  name: "Health Check",
  description: "Get latest health data from Oura",
  category: "health"
};

/**
 * Execute the tool
 * @returns {Promise<Object>} Result
 */
export async function execute() {
  try {
    const ouraPath = dataFile("oura-data.json");

    if (!fs.existsSync(ouraPath)) {
      return { success: false, error: "No Oura data available" };
    }

    const oura = JSON.parse(fs.readFileSync(ouraPath, "utf-8"));
    const latest = oura.latest || oura;

    const sleepArr = Array.isArray(latest.sleep) ? latest.sleep : [];
    const readinessArr = Array.isArray(latest.readiness) ? latest.readiness : [];
    const activityArr = Array.isArray(latest.activity) ? latest.activity : [];

    const sleep = sleepArr.at(-1);
    const readiness = readinessArr.at(-1);
    const activity = activityArr.at(-1);

    return {
      success: true,
      date: sleep?.day || readiness?.day || new Date().toISOString().split("T")[0],
      sleep: sleep ? {
        score: sleep.score,
        duration: sleep.total_sleep_duration ? Math.round(sleep.total_sleep_duration / 3600) + "h" : null,
        efficiency: sleep.contributors?.efficiency,
        deepSleep: sleep.contributors?.deep_sleep,
        remSleep: sleep.contributors?.rem_sleep
      } : null,
      readiness: readiness ? {
        score: readiness.score,
        hrv: readiness.contributors?.hrv_balance,
        restingHR: readiness.contributors?.resting_heart_rate,
        bodyTemp: readiness.contributors?.body_temperature
      } : null,
      activity: activity ? {
        score: activity.score,
        steps: activity.steps,
        calories: activity.total_calories || activity.active_calories,
        activeMinutes: activity.high_activity_met_minutes
      } : null,
      summary: buildSummary(sleep, readiness, activity)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function buildSummary(sleep, readiness, activity) {
  const parts = [];

  if (sleep?.score) {
    if (sleep.score >= 85) parts.push(`Excellent sleep (${sleep.score})`);
    else if (sleep.score >= 70) parts.push(`Good sleep (${sleep.score})`);
    else parts.push(`Poor sleep (${sleep.score}) — prioritize rest`);
  }

  if (readiness?.score) {
    if (readiness.score >= 85) parts.push(`High readiness (${readiness.score}) — great day for challenge`);
    else if (readiness.score >= 70) parts.push(`Good readiness (${readiness.score})`);
    else parts.push(`Low readiness (${readiness.score}) — take it easy`);
  }

  if (activity?.steps) {
    parts.push(`${activity.steps.toLocaleString()} steps`);
  }

  return parts.join(". ") || "No health data available";
}

export default { metadata, execute };
