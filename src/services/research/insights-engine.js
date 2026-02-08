/**
 * Insights Engine - AI-Powered Life Analysis
 *
 * Analyzes all your data sources and generates:
 * - Daily/Weekly progress reports
 * - Trend analysis
 * - Actionable recommendations
 * - Goal tracking insights
 */

import fs from "fs";
import path from "path";
import { getDailyWisdom, getMentorAdvice, MENTORS } from "../mentors.js";

import { getDataDir, getMemoryDir } from "../paths.js";
const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const REPORTS_DIR = path.join(DATA_DIR, "reports");

// Ensure directories exist
const ensureDirs = () => {
  [DATA_DIR, REPORTS_DIR, MEMORY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

/**
 * Load all available data for analysis
 */
const loadAllData = () => {
  ensureDirs();
  const data = {};

  const files = {
    "linkedin": "linkedin-profile.json",
    "personalCapital": "personal-capital.json",
    "oura": "oura-cache.json",
    "alpaca": "alpaca-portfolio.json",
    "goals": "goals.json",
    "lifeScores": "life-scores.json",
    "tradingHistory": "trading-history.json",
    "suggestedActions": "suggested-actions.json",
    "workLog": "work-log.json"
  };

  for (const [key, filename] of Object.entries(files)) {
    try {
      const filePath = path.join(DATA_DIR, filename);
      if (fs.existsSync(filePath)) {
        data[key] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
    } catch (err) {
      // Skip files that can't be read
    }
  }

  // Also load memory files
  try {
    const memoryFiles = ["goals.md", "finance.md", "health.md", "career.md", "family.md"];
    data.memory = {};
    for (const mf of memoryFiles) {
      const memPath = path.join(MEMORY_DIR, mf);
      if (fs.existsSync(memPath)) {
        data.memory[mf.replace(".md", "")] = fs.readFileSync(memPath, "utf-8");
      }
    }
  } catch (err) {
    // Ignore
  }

  return data;
};

/**
 * Calculate life score from available data
 */
const calculateLifeScore = (data) => {
  const scores = {
    finance: 0,
    health: 0,
    career: 0,
    growth: 0,
    overall: 0
  };

  let totalWeight = 0;

  // Finance score
  if (data.personalCapital) {
    const netWorth = data.personalCapital.netWorth?.total || 0;
    // Simple scoring based on net worth (adjust thresholds as needed)
    if (netWorth > 1000000) scores.finance = 95;
    else if (netWorth > 500000) scores.finance = 85;
    else if (netWorth > 100000) scores.finance = 75;
    else if (netWorth > 50000) scores.finance = 65;
    else if (netWorth > 10000) scores.finance = 55;
    else if (netWorth > 0) scores.finance = 45;
    else scores.finance = 30;
    totalWeight += 1;
  }

  if (data.alpaca) {
    const equity = parseFloat(data.alpaca.equity?.replace(/[$,]/g, "") || 0);
    if (equity > 0) {
      const tradingScore = Math.min(80, 50 + (equity / 1000));
      scores.finance = (scores.finance + tradingScore) / 2;
    }
  }

  // Health score from Oura
  if (data.oura) {
    const sleepScore = data.oura.sleepScore || data.oura.sleep?.score || 0;
    const activityScore = data.oura.activityScore || data.oura.activity?.score || 0;
    const readinessScore = data.oura.readinessScore || data.oura.readiness?.score || 0;

    if (sleepScore || activityScore || readinessScore) {
      const validScores = [sleepScore, activityScore, readinessScore].filter(s => s > 0);
      scores.health = validScores.reduce((a, b) => a + b, 0) / validScores.length;
      totalWeight += 1;
    }
  }

  // Career score from LinkedIn
  if (data.linkedin && data.linkedin.profile) {
    scores.career = 60; // Base score for having LinkedIn
    if (data.linkedin.profile.headline) scores.career += 10;
    if (data.linkedin.profile.about) scores.career += 10;
    if (data.linkedin.profile.connections) {
      const connCount = parseInt(data.linkedin.profile.connections) || 0;
      if (connCount > 500) scores.career += 15;
      else if (connCount > 200) scores.career += 10;
      else if (connCount > 100) scores.career += 5;
    }
    scores.career = Math.min(95, scores.career);
    totalWeight += 1;
  }

  // Growth score from goals
  if (data.goals) {
    const goals = Array.isArray(data.goals) ? data.goals : data.goals.goals || [];
    if (goals.length > 0) {
      const avgProgress = goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length;
      scores.growth = Math.round(avgProgress * 100);
      totalWeight += 1;
    }
  }

  // Calculate overall
  if (totalWeight > 0) {
    scores.overall = Math.round(
      (scores.finance + scores.health + scores.career + scores.growth) / 4
    );
  }

  return scores;
};

/**
 * Generate daily insights
 */
export const generateDailyInsights = () => {
  ensureDirs();
  const data = loadAllData();
  const scores = calculateLifeScore(data);
  const wisdom = getDailyWisdom();
  const now = new Date();

  const insights = {
    generatedAt: now.toISOString(),
    date: now.toISOString().split("T")[0],
    scores,
    highlights: [],
    alerts: [],
    recommendations: [],
    mentorWisdom: wisdom
  };

  // Generate highlights
  if (scores.overall >= 70) {
    insights.highlights.push("You're doing well across multiple life areas!");
  }
  if (scores.finance >= 75) {
    insights.highlights.push("Finances are in good shape.");
  }
  if (scores.health >= 80) {
    insights.highlights.push("Health metrics are excellent.");
  }

  // Generate alerts
  if (scores.health < 60 && scores.health > 0) {
    insights.alerts.push("Health score is below optimal. Prioritize sleep and activity.");
  }
  if (scores.finance < 50 && scores.finance > 0) {
    insights.alerts.push("Financial health needs attention. Review budget and investments.");
  }
  if (scores.growth < 30 && scores.growth > 0) {
    insights.alerts.push("Goal progress is stalling. Time to refocus on priorities.");
  }

  // Generate recommendations based on lowest scores
  const scoreEntries = Object.entries(scores).filter(([k, v]) => k !== "overall" && v > 0);
  scoreEntries.sort((a, b) => a[1] - b[1]);

  if (scoreEntries.length > 0) {
    const [lowestArea, lowestScore] = scoreEntries[0];
    const mentorAdvice = getMentorAdvice(lowestArea);

    if (mentorAdvice.length > 0) {
      const advisor = mentorAdvice[0];
      insights.recommendations.push({
        area: lowestArea,
        action: `Focus on improving ${lowestArea} (currently ${lowestScore}/100)`,
        mentorTip: `${advisor.name} says: "${advisor.quotes[0]}"`
      });
    }
  }

  // Add general recommendations
  insights.recommendations.push({
    area: "growth",
    action: "Set a specific, measurable goal for today",
    mentorTip: `Today's wisdom from ${wisdom.mentor}: ${wisdom.principle}`
  });

  return insights;
};

/**
 * Generate weekly report
 */
export const generateWeeklyReport = () => {
  ensureDirs();
  const data = loadAllData();
  const scores = calculateLifeScore(data);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const report = {
    generatedAt: now.toISOString(),
    period: `${weekStart.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
    type: "weekly",
    summary: {
      overallScore: scores.overall,
      scores
    },
    sections: [],
    actionItems: [],
    nextWeekFocus: []
  };

  // Finance section
  if (data.personalCapital || data.alpaca) {
    const financeSection = {
      title: "Financial Health",
      score: scores.finance,
      insights: []
    };

    if (data.personalCapital) {
      const nw = data.personalCapital.netWorth?.total || 0;
      financeSection.insights.push(`Net Worth: $${nw.toLocaleString()}`);
    }
    if (data.alpaca) {
      const equity = data.alpaca.equity || "N/A";
      financeSection.insights.push(`Trading Portfolio: ${equity}`);
    }

    report.sections.push(financeSection);
  }

  // Health section
  if (data.oura) {
    const healthSection = {
      title: "Health & Wellness",
      score: scores.health,
      insights: []
    };

    if (data.oura.sleepScore) {
      healthSection.insights.push(`Sleep Score: ${data.oura.sleepScore}`);
    }
    if (data.oura.activityScore) {
      healthSection.insights.push(`Activity Score: ${data.oura.activityScore}`);
    }

    report.sections.push(healthSection);
  }

  // Career section
  if (data.linkedin) {
    const careerSection = {
      title: "Career & Professional",
      score: scores.career,
      insights: []
    };

    if (data.linkedin.profile?.headline) {
      careerSection.insights.push(`Current: ${data.linkedin.profile.headline}`);
    }

    report.sections.push(careerSection);
  }

  // Goals section
  if (data.goals) {
    const goals = Array.isArray(data.goals) ? data.goals : data.goals.goals || [];
    const goalsSection = {
      title: "Goals & Progress",
      score: scores.growth,
      insights: goals.slice(0, 5).map(g =>
        `${g.title || g.category}: ${Math.round((g.progress || 0) * 100)}%`
      )
    };

    report.sections.push(goalsSection);
  }

  // Generate action items based on analysis
  if (scores.health < 70) {
    report.actionItems.push("Prioritize sleep - aim for 8 hours");
    report.actionItems.push("Increase daily movement - take walking breaks");
  }
  if (scores.finance < 70) {
    report.actionItems.push("Review monthly budget");
    report.actionItems.push("Check investment allocations");
  }
  if (scores.growth < 50) {
    report.actionItems.push("Break down one goal into smaller steps");
    report.actionItems.push("Schedule focused work time");
  }

  // Next week focus
  const lowestArea = Object.entries(scores)
    .filter(([k]) => k !== "overall")
    .sort((a, b) => a[1] - b[1])[0];

  if (lowestArea) {
    report.nextWeekFocus.push(`Primary focus: ${lowestArea[0].charAt(0).toUpperCase() + lowestArea[0].slice(1)}`);

    // Get mentor advice for focus area
    const mentors = getMentorAdvice(lowestArea[0]);
    if (mentors.length > 0) {
      const mentor = mentors[0];
      report.nextWeekFocus.push(`Mentor guidance: ${mentor.name} - "${mentor.principles[0]}"`);
    }
  }

  // Save report
  const reportPath = path.join(REPORTS_DIR, `weekly-${now.toISOString().split("T")[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return report;
};

/**
 * Format insights for CLI display
 */
export const formatInsightsDisplay = (insights) => {
  let output = "\n═══════════════════════════════════════════\n";
  output += "           DAILY INSIGHTS\n";
  output += `           ${insights.date}\n`;
  output += "═══════════════════════════════════════════\n\n";

  // Scores
  output += "LIFE SCORES:\n";
  output += `  Overall:  ${insights.scores.overall || "--"}/100\n`;
  output += `  Finance:  ${insights.scores.finance || "--"}/100\n`;
  output += `  Health:   ${insights.scores.health || "--"}/100\n`;
  output += `  Career:   ${insights.scores.career || "--"}/100\n`;
  output += `  Growth:   ${insights.scores.growth || "--"}/100\n\n`;

  // Highlights
  if (insights.highlights.length > 0) {
    output += "✓ HIGHLIGHTS:\n";
    insights.highlights.forEach(h => {
      output += `  • ${h}\n`;
    });
    output += "\n";
  }

  // Alerts
  if (insights.alerts.length > 0) {
    output += "⚠ ALERTS:\n";
    insights.alerts.forEach(a => {
      output += `  • ${a}\n`;
    });
    output += "\n";
  }

  // Recommendations
  if (insights.recommendations.length > 0) {
    output += "→ RECOMMENDATIONS:\n";
    insights.recommendations.forEach(r => {
      output += `  [${r.area.toUpperCase()}] ${r.action}\n`;
      if (r.mentorTip) {
        output += `    ${r.mentorTip}\n`;
      }
    });
    output += "\n";
  }

  // Daily wisdom
  if (insights.mentorWisdom) {
    output += "─────────────────────────────────────────\n";
    output += "💡 TODAY'S WISDOM\n";
    output += `   ${insights.mentorWisdom.mentor} (${insights.mentorWisdom.role})\n`;
    output += `   "${insights.mentorWisdom.quote}"\n`;
    output += `   Habit: ${insights.mentorWisdom.habit}\n`;
  }

  output += "\n═══════════════════════════════════════════\n";

  return output;
};

/**
 * Format weekly report for CLI display
 */
export const formatWeeklyReportDisplay = (report) => {
  let output = "\n═══════════════════════════════════════════\n";
  output += "           WEEKLY PROGRESS REPORT\n";
  output += `           ${report.period}\n`;
  output += "═══════════════════════════════════════════\n\n";

  output += `OVERALL SCORE: ${report.summary.overallScore}/100\n\n`;

  // Sections
  report.sections.forEach(section => {
    output += `${section.title.toUpperCase()} (${section.score}/100)\n`;
    section.insights.forEach(i => {
      output += `  • ${i}\n`;
    });
    output += "\n";
  });

  // Action items
  if (report.actionItems.length > 0) {
    output += "ACTION ITEMS FOR THIS WEEK:\n";
    report.actionItems.forEach((item, i) => {
      output += `  ${i + 1}. ${item}\n`;
    });
    output += "\n";
  }

  // Focus
  if (report.nextWeekFocus.length > 0) {
    output += "FOCUS FOR NEXT WEEK:\n";
    report.nextWeekFocus.forEach(f => {
      output += `  → ${f}\n`;
    });
  }

  output += "\n═══════════════════════════════════════════\n";

  return output;
};

/**
 * Get quick status summary
 */
export const getQuickStatus = () => {
  const data = loadAllData();
  const scores = calculateLifeScore(data);
  const wisdom = getDailyWisdom();

  return {
    scores,
    wisdom: {
      mentor: wisdom.mentor,
      quote: wisdom.quote.slice(0, 100) + (wisdom.quote.length > 100 ? "..." : "")
    },
    dataConnected: {
      linkedin: !!data.linkedin,
      personalCapital: !!data.personalCapital,
      oura: !!data.oura,
      alpaca: !!data.alpaca,
      goals: !!data.goals
    }
  };
};

export default {
  generateDailyInsights,
  generateWeeklyReport,
  formatInsightsDisplay,
  formatWeeklyReportDisplay,
  getQuickStatus
};
