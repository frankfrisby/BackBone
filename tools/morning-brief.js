/**
 * Tool: Morning Brief
 *
 * Generate and optionally deliver the morning brief.
 */

import { generateDailyBrief, generateAndDeliverBrief } from "../src/services/briefs/daily-brief-generator.js";

export const metadata = {
  id: "morning-brief",
  name: "Generate Morning Brief",
  description: "Generate and optionally deliver the morning brief",
  category: "daily"
};

/**
 * Execute the tool
 * @param {Object} inputs - { deliver }
 * @returns {Promise<Object>} Result
 */
export async function execute(inputs = {}) {
  const { deliver = false } = inputs;

  try {
    if (deliver) {
      // Generate and deliver via all channels
      const result = await generateAndDeliverBrief("morning");
      return {
        success: result.success,
        delivered: true,
        channels: result.delivery,
        chartUrl: result.chartUrl,
        sectionsWithData: result.brief?.sectionsWithData,
        summary: result.brief?.summary
      };
    }

    // Just generate without delivering
    const brief = generateDailyBrief();

    return {
      success: true,
      delivered: false,
      brief: {
        greeting: brief.greeting,
        summary: brief.summary,
        mood: brief.mood,
        sectionsWithData: brief.sectionsWithData,
        health: brief.health,
        portfolio: brief.portfolio ? {
          equity: brief.portfolio.equity,
          dayPL: brief.portfolio.dayPL,
          topPositions: brief.portfolio.topPositions?.slice(0, 3)
        } : null,
        goals: brief.goals ? {
          totalActive: brief.goals.totalActive,
          avgProgress: brief.goals.avgProgress
        } : null,
        actionItems: brief.actionItems?.slice(0, 3),
        calendar: brief.calendar?.slice(0, 3)
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
