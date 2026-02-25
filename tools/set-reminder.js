/**
 * Tool: Set Reminder
 *
 * Schedule a WhatsApp reminder message for a future time.
 */

import fs from "fs";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "set-reminder",
  name: "Set Reminder",
  description: "Schedule a WhatsApp reminder for a future time (absolute or relative)",
  category: "messaging"
};

function parseWhen(when) {
  const now = new Date();

  // Relative: "30m", "2h", "1d"
  const relMatch = when.match(/^(\d+)(m|h|d)$/i);
  if (relMatch) {
    const [, val, unit] = relMatch;
    const ms = { m: 60000, h: 3600000, d: 86400000 }[unit.toLowerCase()];
    return new Date(now.getTime() + parseInt(val) * ms);
  }

  // "tomorrow 9am"
  const tmrMatch = when.match(/^tomorrow\s+(\d{1,2})(am|pm)?$/i);
  if (tmrMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    let hour = parseInt(tmrMatch[1]);
    if (tmrMatch[2]?.toLowerCase() === "pm" && hour < 12) hour += 12;
    d.setHours(hour, 0, 0, 0);
    return d;
  }

  // ISO or parseable date
  const parsed = new Date(when);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

export async function execute(inputs = {}) {
  const { message, when } = inputs;
  if (!message) return { success: false, error: "message is required" };
  if (!when) return { success: false, error: "when is required (e.g., '2h', 'tomorrow 9am', ISO datetime)" };

  const sendAt = parseWhen(when);
  if (!sendAt) return { success: false, error: `Could not parse time: "${when}"` };
  if (sendAt <= new Date()) return { success: false, error: "Scheduled time must be in the future" };

  try {
    const remindersPath = dataFile("scheduled-reminders.json");
    let reminders = [];
    if (fs.existsSync(remindersPath)) {
      reminders = JSON.parse(fs.readFileSync(remindersPath, "utf-8"));
    }

    const reminder = {
      id: `rem_${Date.now()}`,
      message,
      sendAt: sendAt.toISOString(),
      createdAt: new Date().toISOString(),
      delivered: false
    };

    reminders.push(reminder);
    fs.writeFileSync(remindersPath, JSON.stringify(reminders, null, 2));

    return { success: true, reminder, humanTime: sendAt.toLocaleString() };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
