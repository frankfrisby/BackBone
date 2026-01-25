/**
 * Goal Generator Service
 *
 * Uses AI to generate personalized goals based on:
 * 1. Connected data sources (portfolio, health, LinkedIn, etc.)
 * 2. User conversations about what matters to them
 * 3. Direct user input about priorities
 */

import fs from "fs";
import path from "path";
import { sendMessage, TASK_TYPES, getMultiAIConfig } from "./multi-ai.js";
import { getGoalTracker, GOAL_CATEGORY, GOAL_STATUS } from "./goal-tracker.js";

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Gather all available user context for goal generation
 */
async function gatherUserContext() {
  const context = {
    hasData: false,
    sources: []
  };

  // Load user profile
  try {
    const profilePath = path.join(DATA_DIR, "user_profile.json");
    if (fs.existsSync(profilePath)) {
      context.profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
      context.hasData = true;
      context.sources.push("profile");
    }
  } catch (e) { /* ignore */ }

  // Load portfolio data
  try {
    const portfolioPath = path.join(DATA_DIR, "portfolio.json");
    if (fs.existsSync(portfolioPath)) {
      const portfolio = JSON.parse(fs.readFileSync(portfolioPath, "utf-8"));
      context.portfolio = {
        equity: portfolio.equity,
        dayPL: portfolio.dayPL,
        dayPLPercent: portfolio.dayPLPercent,
        positionCount: portfolio.positions?.length || 0,
        topPositions: (portfolio.positions || []).slice(0, 5).map(p => ({
          symbol: p.symbol,
          value: p.marketValue,
          pnlPercent: p.unrealizedPlPercent
        }))
      };
      context.hasData = true;
      context.sources.push("portfolio");
    }
  } catch (e) { /* ignore */ }

  // Load health data (Oura)
  try {
    const healthPath = path.join(DATA_DIR, "oura_data.json");
    if (fs.existsSync(healthPath)) {
      const health = JSON.parse(fs.readFileSync(healthPath, "utf-8"));
      context.health = {
        sleepScore: health.today?.sleepScore || health.sleep?.score,
        readinessScore: health.today?.readinessScore || health.readiness?.score,
        steps: health.today?.steps || health.activity?.steps,
        activeCalories: health.today?.activeCalories || health.activity?.activeCalories,
        restingHeartRate: health.today?.restingHeartRate
      };
      context.hasData = true;
      context.sources.push("health");
    }
  } catch (e) { /* ignore */ }

  // Load LinkedIn profile
  try {
    const linkedInPath = path.join(DATA_DIR, "linkedin_profile.json");
    if (fs.existsSync(linkedInPath)) {
      const linkedIn = JSON.parse(fs.readFileSync(linkedInPath, "utf-8"));
      context.linkedIn = {
        name: linkedIn.name,
        headline: linkedIn.headline,
        currentRole: linkedIn.experience?.[0]?.title,
        currentCompany: linkedIn.experience?.[0]?.company,
        connections: linkedIn.connections,
        skills: linkedIn.skills?.slice(0, 10)
      };
      context.hasData = true;
      context.sources.push("linkedin");
    }
  } catch (e) { /* ignore */ }

  // Load existing goals
  try {
    const goalTracker = getGoalTracker();
    const existingGoals = goalTracker.getActive();
    if (existingGoals.length > 0) {
      context.existingGoals = existingGoals.map(g => ({
        title: g.title,
        category: g.category,
        progress: goalTracker.calculateProgress(g)
      }));
      context.sources.push("goals");
    }
  } catch (e) { /* ignore */ }

  // Load memory/preferences
  try {
    const memoryPath = path.join(DATA_DIR, "memory.json");
    if (fs.existsSync(memoryPath)) {
      const memory = JSON.parse(fs.readFileSync(memoryPath, "utf-8"));
      context.preferences = memory.preferences || {};
      context.interests = memory.interests || [];
      if (Object.keys(context.preferences).length > 0 || context.interests.length > 0) {
        context.hasData = true;
        context.sources.push("memory");
      }
    }
  } catch (e) { /* ignore */ }

  return context;
}

/**
 * Generate goals from user data automatically
 */
export async function generateGoalsFromData() {
  const context = await gatherUserContext();

  if (!context.hasData) {
    return {
      success: false,
      error: "No user data available. Connect some data sources first (portfolio, health, LinkedIn).",
      goals: []
    };
  }

  const prompt = `Based on the user's connected data, suggest 3-5 personalized life goals.

USER DATA:
${JSON.stringify(context, null, 2)}

For each goal, provide:
1. title: Clear, specific goal title
2. category: One of: finance, health, family, career, growth, education
3. rationale: Why this goal makes sense given their data
4. targetValue: Numeric target
5. unit: Unit of measurement
6. priority: 1-5 (1=critical, 5=someday)

Focus on:
- Building on their current strengths
- Addressing areas that need improvement
- Realistic but ambitious targets
- Avoiding duplicates with existing goals

Return JSON format:
{
  "goals": [
    {
      "title": "Goal title",
      "category": "category",
      "rationale": "Why this goal",
      "targetValue": 100,
      "unit": "unit",
      "priority": 2
    }
  ],
  "summary": "Brief overview of the goal recommendations"
}`;

  try {
    const result = await sendMessage(prompt, {}, TASK_TYPES.COMPLEX);

    // Parse JSON response
    let parsed;
    try {
      let jsonStr = result.response;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      return {
        success: false,
        error: "Failed to parse AI response",
        raw: result.response
      };
    }

    return {
      success: true,
      goals: parsed.goals || [],
      summary: parsed.summary || "",
      sources: context.sources
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      goals: []
    };
  }
}

/**
 * Generate goals from user's description of what matters to them
 */
export async function generateGoalsFromInput(userInput) {
  if (!userInput || userInput.trim().length < 10) {
    return {
      success: false,
      error: "Please describe what matters to you in more detail (at least 10 characters).",
      goals: []
    };
  }

  const context = await gatherUserContext();

  const prompt = `The user has shared what matters to them. Generate 2-4 specific, actionable life goals based on their input.

USER'S INPUT:
"${userInput}"

${context.hasData ? `ADDITIONAL CONTEXT:\n${JSON.stringify(context, null, 2)}` : ""}

Create goals that:
1. Directly address what the user said matters to them
2. Are specific and measurable
3. Have clear targets and timeframes
4. Are categorized appropriately

Return JSON format:
{
  "goals": [
    {
      "title": "Specific goal title (be detailed, at least 15 words describing what exactly to achieve)",
      "category": "finance|health|family|career|growth|education",
      "rationale": "How this connects to what the user said",
      "targetValue": 100,
      "startValue": 0,
      "unit": "unit of measurement",
      "priority": 1-5
    }
  ],
  "acknowledgment": "Brief message acknowledging what the user shared and how these goals will help"
}`;

  try {
    const result = await sendMessage(prompt, {}, TASK_TYPES.COMPLEX);

    // Parse JSON response
    let parsed;
    try {
      let jsonStr = result.response;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      return {
        success: false,
        error: "Failed to parse AI response",
        raw: result.response
      };
    }

    return {
      success: true,
      goals: parsed.goals || [],
      acknowledgment: parsed.acknowledgment || "",
      model: result.modelInfo?.name || "AI"
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      goals: []
    };
  }
}

/**
 * Generate discovery questions to help user articulate their goals
 */
export async function generateDiscoveryQuestions() {
  const context = await gatherUserContext();

  const prompt = `Generate 3-4 thought-provoking questions to help a user discover what goals matter most to them.

${context.hasData ? `USER'S CURRENT CONTEXT:\n${JSON.stringify(context, null, 2)}` : "No user data connected yet."}

The questions should:
1. Be personal and meaningful
2. Cover different life areas (finance, health, relationships, career, growth)
3. Be open-ended to encourage reflection
4. If user has data, reference it to make questions more relevant

Return JSON:
{
  "questions": [
    {
      "question": "The question text",
      "category": "finance|health|family|career|growth|education",
      "followUp": "A follow-up prompt if they answer yes/positively"
    }
  ],
  "intro": "Brief intro message to start the conversation"
}`;

  try {
    const result = await sendMessage(prompt, {}, TASK_TYPES.ROUTING);

    let parsed;
    try {
      let jsonStr = result.response;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      // Return default questions if parsing fails
      return {
        success: true,
        questions: [
          { question: "What would you do if money wasn't a concern?", category: "growth", followUp: "What's stopping you from starting now?" },
          { question: "What aspect of your health would you most like to improve?", category: "health", followUp: "What's one small step you could take this week?" },
          { question: "Who are the most important people in your life, and are you spending enough time with them?", category: "family", followUp: "What would 'enough time' look like?" },
          { question: "Where do you want to be professionally in 5 years?", category: "career", followUp: "What skills do you need to develop to get there?" }
        ],
        intro: "Let's discover what matters most to you. Answer honestly - there are no wrong answers."
      };
    }

    return {
      success: true,
      questions: parsed.questions || [],
      intro: parsed.intro || "Let's discover what matters most to you."
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      questions: []
    };
  }
}

/**
 * Process discovery answers and generate personalized goals
 */
export async function processDiscoveryAnswers(answers) {
  if (!answers || Object.keys(answers).length === 0) {
    return {
      success: false,
      error: "No answers provided",
      goals: []
    };
  }

  const context = await gatherUserContext();

  const prompt = `Based on the user's answers to discovery questions, create personalized goals.

USER'S ANSWERS:
${Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n")}

${context.hasData ? `USER'S CURRENT DATA:\n${JSON.stringify(context, null, 2)}` : ""}

Create 3-5 goals that:
1. Directly reflect what the user expressed in their answers
2. Are specific, measurable, and achievable
3. Include appropriate targets based on their current situation
4. Cover the life areas they showed interest in

Return JSON:
{
  "goals": [
    {
      "title": "Detailed goal title (at least 15 words describing the specific achievement)",
      "category": "finance|health|family|career|growth|education",
      "rationale": "How this connects to their answer",
      "targetValue": 100,
      "startValue": 0,
      "unit": "unit",
      "priority": 1-5,
      "sourceQuestion": "The question this goal came from"
    }
  ],
  "insights": "Key insights from their answers",
  "nextSteps": "Suggested immediate actions"
}`;

  try {
    const result = await sendMessage(prompt, {}, TASK_TYPES.COMPLEX);

    let parsed;
    try {
      let jsonStr = result.response;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      return {
        success: false,
        error: "Failed to parse AI response",
        raw: result.response
      };
    }

    return {
      success: true,
      goals: parsed.goals || [],
      insights: parsed.insights || "",
      nextSteps: parsed.nextSteps || ""
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      goals: []
    };
  }
}

/**
 * Save generated goals to the goal tracker
 */
export function saveGeneratedGoals(goals) {
  const goalTracker = getGoalTracker();
  const saved = [];
  const errors = [];

  for (const goal of goals) {
    try {
      const created = goalTracker.createGoal({
        title: goal.title,
        category: goal.category || GOAL_CATEGORY.GROWTH,
        priority: goal.priority || 3,
        targetValue: goal.targetValue || 100,
        startValue: goal.startValue || 0,
        currentValue: goal.startValue || 0,
        unit: goal.unit || "progress"
      });
      saved.push(created);
    } catch (error) {
      errors.push({ goal: goal.title, error: error.message });
    }
  }

  return {
    success: errors.length === 0,
    saved,
    errors,
    message: `Saved ${saved.length} of ${goals.length} goals`
  };
}

/**
 * Quick goal generation - combines data analysis with a simple prompt
 */
export async function quickGenerateGoals(userHint = "") {
  const context = await gatherUserContext();

  const basePrompt = userHint
    ? `The user wants to focus on: "${userHint}". Generate 2-3 specific goals.`
    : "Generate 2-3 goals based on the user's current situation and data.";

  const prompt = `${basePrompt}

USER CONTEXT:
${JSON.stringify(context, null, 2)}

Return JSON with goals that are specific (15+ word titles), measurable, and actionable:
{
  "goals": [
    {
      "title": "Detailed specific goal",
      "category": "finance|health|family|career|growth|education",
      "targetValue": number,
      "startValue": number,
      "unit": "string",
      "priority": 1-5
    }
  ]
}`;

  try {
    const result = await sendMessage(prompt, {}, TASK_TYPES.COMPLEX);

    let parsed;
    try {
      let jsonStr = result.response;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      return { success: false, error: "Failed to parse response", goals: [] };
    }

    return {
      success: true,
      goals: parsed.goals || []
    };
  } catch (error) {
    return { success: false, error: error.message, goals: [] };
  }
}

// Export singleton functions
export default {
  generateGoalsFromData,
  generateGoalsFromInput,
  generateDiscoveryQuestions,
  processDiscoveryAnswers,
  saveGeneratedGoals,
  quickGenerateGoals,
  gatherUserContext
};
