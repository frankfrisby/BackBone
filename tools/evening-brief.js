/**
 * Tool: Evening Brief
 *
 * Generate an evening summary: today's accomplishments, portfolio P&L, health score, tomorrow's calendar.
 */

import { generateDailyBrief, generateAndDeliverBrief } from "../src/services/briefs/daily-brief-generator.js";

export const metadata = {
  id: "evening-brief",
  name: "Generate Evening Brief",
  description: "Generate evening recap: accomplishments, portfolio P&L, health, tomorrow's calendar",
  category: "daily"
};

export async function execute(inputs = {}) {
  const { deliver = false } = inputs;

  try {
    if (deliver) {
      const result = await generateAndDeliverBrief("evening");
      return {
        success: result.success,
        delivered: true,
        channels: result.delivery,
        sectionsWithData: result.brief?.sectionsWithData,
        summary: result.brief?.summary
      };
    }

    const brief = generateDailyBrief();

    return {
      success: true,
      delivered: false,
      brief: {
        summary: brief.summary,
        health: brief.health,
        portfolio: brief.portfolio ? {
          equity: brief.portfolio.equity,
          dayPL: brief.portfolio.dayPL,
          topPositions: brief.portfolio.topPositions?.slice(0, 5)
        } : null,
        goals: brief.goals ? {
          totalActive: brief.goals.totalActive,
          avgProgress: brief.goals.avgProgress,
          completed: brief.goals.completedToday
        } : null,
        calendar: brief.calendar?.slice(0, 5),
        actionItems: brief.actionItems?.slice(0, 5)
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
