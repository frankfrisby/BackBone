/**
 * News Service - Fetches and analyzes news to generate AI thinking triggers
 *
 * Runs 3 times daily (morning, noon, evening) to:
 * 1. Fetch relevant news based on user's beliefs, interests, and portfolio
 * 2. Analyze with AI (Claude or OpenAI) to extract actionable insights
 * 3. Generate backlog items for the thinking engine
 */

import fs from "fs";
import path from "path";
import { sendMessage } from "./claude.js";
import { getActivityTracker } from "./activity-tracker.js";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");
const NEWS_CACHE_PATH = path.join(DATA_DIR, "news-cache.json");
const BELIEFS_PATH = path.join(DATA_DIR, "core-beliefs.json");
const BACKLOG_PATH = path.join(DATA_DIR, "backlog.json");
const TICKERS_PATH = path.join(DATA_DIR, "tickers-cache.json");
const LINKEDIN_PATH = path.join(DATA_DIR, "linkedin-profile.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Get user's interests and context for news filtering
 */
function getUserContext() {
  const beliefs = readJson(BELIEFS_PATH)?.beliefs || [];
  const tickers = readJson(TICKERS_PATH) || [];
  const linkedin = readJson(LINKEDIN_PATH);
  const profile = fs.existsSync(path.join(MEMORY_DIR, "profile.md"))
    ? fs.readFileSync(path.join(MEMORY_DIR, "profile.md"), "utf-8")
    : "";

  // Extract key interests
  const interests = new Set();

  // From beliefs
  beliefs.forEach(b => {
    if (b.name) interests.add(b.name.toLowerCase());
    if (b.description) {
      b.description.split(/\s+/).forEach(word => {
        if (word.length > 4) interests.add(word.toLowerCase());
      });
    }
  });

  // From portfolio - top tickers
  const topSymbols = Array.isArray(tickers)
    ? tickers.slice(0, 10).map(t => t.symbol)
    : [];

  // From LinkedIn
  const headline = linkedin?.profile?.headline || linkedin?.gpt4oAnalysis?.headline || "";
  const skills = linkedin?.profile?.skills || linkedin?.gpt4oAnalysis?.skills || [];

  return {
    beliefs: beliefs.map(b => b.name).filter(Boolean),
    topStocks: topSymbols,
    headline,
    skills: skills.slice(0, 10),
    profileSummary: profile.slice(0, 500)
  };
}

/**
 * Build search queries based on user context
 */
function buildNewsQueries(context) {
  const queries = [];

  // Stock/market news for top holdings
  if (context.topStocks.length > 0) {
    const top3 = context.topStocks.slice(0, 3).join(" OR ");
    queries.push(`${top3} stock news today`);
    queries.push("stock market news today investing");
  }

  // Belief-based queries
  context.beliefs.forEach(belief => {
    if (belief.toLowerCase().includes("wealth") || belief.toLowerCase().includes("finance")) {
      queries.push("personal finance wealth building strategies 2026");
    }
    if (belief.toLowerCase().includes("health")) {
      queries.push("health optimization longevity news 2026");
    }
    if (belief.toLowerCase().includes("career") || belief.toLowerCase().includes("growth")) {
      queries.push("career development professional growth trends");
    }
    if (belief.toLowerCase().includes("tech") || belief.toLowerCase().includes("ai")) {
      queries.push("AI technology breakthroughs 2026");
    }
  });

  // Always include general market/economy
  queries.push("market economy news today");

  // Dedupe and limit
  return [...new Set(queries)].slice(0, 5);
}

/**
 * Fetch news using web search (simulated via AI analysis)
 * In production, this would use a news API or web scraping
 */
async function fetchNewsForQuery(query) {
  // For now, we'll use Claude to generate relevant news topics
  // In production, integrate with NewsAPI, Google News, or similar
  return {
    query,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Analyze news with AI and generate backlog items
 */
async function analyzeNewsWithAI(context, newsData) {
  const tracker = getActivityTracker();
  tracker.setState("thinking", "Analyzing news for insights...");

  const prompt = `You are analyzing current news and market conditions to generate actionable ideas for the user.

## User Context

**Core Beliefs (What They Care About):**
${context.beliefs.length > 0 ? context.beliefs.map(b => `- ${b}`).join("\n") : "- Building wealth\n- Personal growth\n- Health optimization"}

**Top Stock Holdings:**
${context.topStocks.length > 0 ? context.topStocks.join(", ") : "General market exposure"}

**Professional Background:**
${context.headline || "Professional investor/builder"}

**Key Skills:**
${context.skills.length > 0 ? context.skills.join(", ") : "Diverse skill set"}

## Your Task

Based on CURRENT market conditions, news, and trends (as of ${new Date().toLocaleDateString()}), generate 3-5 actionable backlog items that would be relevant to this user.

Consider:
1. Market movements that affect their holdings
2. Industry trends relevant to their career/skills
3. Health/wellness developments
4. Economic policy changes
5. Technology breakthroughs
6. Investment opportunities aligned with their beliefs

For each item, assess:
- How relevant is this to their beliefs and holdings?
- Is this time-sensitive (will it lose value if not acted on)?
- What's the potential impact on their life?

Respond in JSON:
\`\`\`json
{
  "marketSummary": "Brief 1-2 sentence summary of current market conditions",
  "newsItems": [
    {
      "headline": "Concise news headline or trend",
      "relevance": "Why this matters to the user",
      "source": "news"
    }
  ],
  "backlogItems": [
    {
      "title": "Clear, actionable item (e.g., 'Review AMD position after earnings beat')",
      "description": "What to do and why",
      "source": "news",
      "relatedBeliefs": ["which belief this supports"],
      "impactScore": 60,
      "urgency": "low|medium|high|critical",
      "isTimeSensitive": true,
      "suggestedProject": null
    }
  ],
  "insight": "One key observation or pattern worth noting"
}
\`\`\`

Focus on ACTIONABLE items that could become goals. Don't just report news - suggest what the user should DO about it.`;

  try {
    const response = await sendMessage([
      { role: "user", content: prompt }
    ], {
      maxTokens: 2000,
      temperature: 0.7
    });

    if (!response?.content) {
      throw new Error("No response from AI");
    }

    // Parse JSON from response
    const content = response.content;
    let result;

    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[1]);
    } else {
      result = JSON.parse(content);
    }

    tracker.setState("idle", null);
    return result;

  } catch (error) {
    console.error("[NewsService] AI analysis failed:", error.message);
    tracker.setState("idle", null);
    return null;
  }
}

/**
 * Add news-generated items to the backlog
 */
function addNewsToBacklog(newsResult) {
  if (!newsResult?.backlogItems?.length) return 0;

  const backlog = readJson(BACKLOG_PATH) || {
    items: [],
    graduatedToGoals: [],
    dismissed: [],
    lastUpdated: null,
    stats: { totalGenerated: 0, totalGraduated: 0, totalDismissed: 0 }
  };

  let added = 0;

  for (const item of newsResult.backlogItems) {
    // Check for duplicates
    const isDuplicate = backlog.items.some(
      existing => existing.title.toLowerCase() === item.title.toLowerCase()
    );

    if (!isDuplicate) {
      backlog.items.push({
        id: `backlog_news_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        description: item.description,
        source: "news",
        relatedBeliefs: item.relatedBeliefs || [],
        impactScore: item.impactScore || 50,
        urgency: item.urgency || "low",
        isTimeSensitive: item.isTimeSensitive || false,
        suggestedProject: item.suggestedProject || null,
        newsContext: newsResult.marketSummary,
        createdAt: new Date().toISOString(),
        lastEvaluated: null
      });
      backlog.stats.totalGenerated++;
      added++;
    }
  }

  // Cap backlog at 150 items
  if (backlog.items.length > 150) {
    backlog.items.sort((a, b) => b.impactScore - a.impactScore);
    backlog.items = backlog.items.slice(0, 150);
  }

  backlog.lastUpdated = new Date().toISOString();
  writeJson(BACKLOG_PATH, backlog);

  return added;
}

/**
 * Save news analysis to cache
 */
function saveNewsCache(result) {
  const cache = readJson(NEWS_CACHE_PATH) || { history: [] };

  cache.latest = {
    ...result,
    fetchedAt: new Date().toISOString()
  };

  cache.history.unshift(cache.latest);
  if (cache.history.length > 30) {
    cache.history = cache.history.slice(0, 30);
  }

  cache.lastUpdated = new Date().toISOString();
  writeJson(NEWS_CACHE_PATH, cache);
}

/**
 * Main news fetch and analysis function
 */
export async function fetchAndAnalyzeNews() {
  const tracker = getActivityTracker();
  console.log("[NewsService] Starting news fetch and analysis...");
  tracker.setState("analyzing", "Fetching news...");

  try {
    // 1. Get user context
    const context = getUserContext();
    console.log(`[NewsService] User has ${context.beliefs.length} beliefs, ${context.topStocks.length} stocks`);

    // 2. Build queries (for future API integration)
    const queries = buildNewsQueries(context);
    console.log(`[NewsService] Built ${queries.length} search queries`);

    // 3. Fetch news data (placeholder for API integration)
    const newsData = await Promise.all(queries.map(fetchNewsForQuery));

    // 4. Analyze with AI
    const analysis = await analyzeNewsWithAI(context, newsData);

    if (!analysis) {
      console.log("[NewsService] No analysis results");
      return { success: false, error: "AI analysis failed" };
    }

    // 5. Add to backlog
    const itemsAdded = addNewsToBacklog(analysis);
    console.log(`[NewsService] Added ${itemsAdded} items to backlog`);

    // 6. Save to cache
    saveNewsCache(analysis);

    // 7. Log result
    tracker.action("NEWS", `Analyzed news, added ${itemsAdded} backlog items`);
    tracker.setState("idle", null);

    return {
      success: true,
      itemsAdded,
      marketSummary: analysis.marketSummary,
      insight: analysis.insight,
      newsItems: analysis.newsItems?.length || 0
    };

  } catch (error) {
    console.error("[NewsService] Error:", error.message);
    tracker.setState("idle", null);
    return { success: false, error: error.message };
  }
}

/**
 * Get cached news data
 */
export function getNewsCache() {
  return readJson(NEWS_CACHE_PATH);
}

/**
 * Get latest market summary
 */
export function getMarketSummary() {
  const cache = readJson(NEWS_CACHE_PATH);
  return cache?.latest?.marketSummary || null;
}

/**
 * Check if we should fetch news (avoid fetching too frequently)
 */
export function shouldFetchNews() {
  const cache = readJson(NEWS_CACHE_PATH);
  if (!cache?.lastUpdated) return true;

  const lastFetch = new Date(cache.lastUpdated);
  const hoursSince = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60);

  // Don't fetch if less than 4 hours since last fetch
  return hoursSince >= 4;
}

/**
 * Get news-generated backlog items
 */
export function getNewsBacklogItems() {
  const backlog = readJson(BACKLOG_PATH);
  if (!backlog?.items) return [];

  return backlog.items
    .filter(item => item.source === "news")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
}

export default {
  fetchAndAnalyzeNews,
  getNewsCache,
  getMarketSummary,
  shouldFetchNews,
  getNewsBacklogItems
};
