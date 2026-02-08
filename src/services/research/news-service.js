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
import fetch from "node-fetch";
import { sendMessage } from "../ai/claude.js";
import { getActivityTracker } from "../ui/activity-tracker.js";
import { getWhatsAppNotifications, NOTIFICATION_TYPE, NOTIFICATION_PRIORITY } from "../messaging/whatsapp-notifications.js";

import { getDataDir, getMemoryDir } from "../paths.js";
const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
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

// ── RSS Feed Sources ────────────────────────────────────────────

const RSS_SOURCES = {
  googleNews: (query) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
  googleTopStories: () =>
    "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
  yahooFinance: (symbol) =>
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
};

/**
 * Parse RSS XML into structured items.
 * Lightweight regex parser — no dependencies needed for RSS.
 */
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, "is"));
      return m ? m[1].trim() : null;
    };

    const title = get("title");
    const link = get("link");
    const pubDate = get("pubDate");
    const source = get("source");
    const description = get("description");

    if (title) {
      items.push({
        title: title.replace(/<[^>]+>/g, "").trim(),
        link,
        pubDate,
        source: source?.replace(/<[^>]+>/g, "").trim() || null,
        description: description
          ? description.replace(/<[^>]+>/g, "").trim().slice(0, 300)
          : null,
      });
    }
  }

  return items;
}

/**
 * Fetch an RSS feed with timeout and error handling.
 */
async function fetchRSS(url, label = "") {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BACKBONE-Engine/1.0" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[NewsService] RSS fetch failed (${response.status}): ${label || url}`);
      return [];
    }

    const xml = await response.text();
    return parseRSS(xml);
  } catch (err) {
    if (err.name === "AbortError") {
      console.error(`[NewsService] RSS timeout: ${label || url}`);
    } else {
      console.error(`[NewsService] RSS error (${label}): ${err.message}`);
    }
    return [];
  }
}

/**
 * Fetch real news for a search query via Google News RSS.
 * Returns structured news items with real headlines, sources, and links.
 */
async function fetchNewsForQuery(query) {
  const url = RSS_SOURCES.googleNews(query);
  const items = await fetchRSS(url, `Google News: ${query}`);

  return {
    query,
    items: items.slice(0, 8),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch stock-specific news from Yahoo Finance RSS.
 */
async function fetchStockNews(symbols) {
  if (!symbols || symbols.length === 0) return [];

  const allItems = [];
  // Batch symbols in groups of 3 to limit requests
  const batches = [];
  for (let i = 0; i < symbols.length; i += 3) {
    batches.push(symbols.slice(i, i + 3).join(","));
  }

  for (const batch of batches.slice(0, 3)) {
    const url = RSS_SOURCES.yahooFinance(batch);
    const items = await fetchRSS(url, `Yahoo Finance: ${batch}`);
    allItems.push(...items.slice(0, 5));
  }

  return allItems;
}

/**
 * Fetch Google News top stories.
 */
async function fetchTopStories() {
  const url = RSS_SOURCES.googleTopStories();
  const items = await fetchRSS(url, "Google Top Stories");
  return items.slice(0, 10);
}

/**
 * Analyze REAL news with AI and generate backlog items.
 * newsData now contains actual headlines from Google News + Yahoo Finance RSS.
 */
async function analyzeNewsWithAI(context, newsData) {
  const tracker = getActivityTracker();
  tracker.setState("thinking", "Analyzing news for insights...");

  // Flatten all fetched headlines into a single list
  const allHeadlines = [];
  for (const feed of newsData) {
    for (const item of feed.items || []) {
      allHeadlines.push({
        headline: item.title,
        source: item.source || "Unknown",
        date: item.pubDate || null,
        link: item.link || null,
        description: item.description || null,
      });
    }
  }

  // Also include top stories and stock news if they were fetched
  if (newsData._topStories) {
    for (const item of newsData._topStories) {
      allHeadlines.push({
        headline: item.title,
        source: item.source || "Google News",
        date: item.pubDate || null,
        link: item.link || null,
      });
    }
  }
  if (newsData._stockNews) {
    for (const item of newsData._stockNews) {
      allHeadlines.push({
        headline: item.title,
        source: item.source || "Yahoo Finance",
        date: item.pubDate || null,
        link: item.link || null,
      });
    }
  }

  // Dedupe by headline
  const seen = new Set();
  const uniqueHeadlines = allHeadlines.filter(h => {
    const key = h.headline?.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueHeadlines.length === 0) {
    console.log("[NewsService] No real headlines fetched — skipping AI analysis");
    return null;
  }

  console.log(`[NewsService] Analyzing ${uniqueHeadlines.length} real headlines`);

  // Build the headlines block for the prompt
  const headlinesBlock = uniqueHeadlines.slice(0, 40).map((h, i) =>
    `${i + 1}. "${h.headline}" — ${h.source}${h.date ? ` (${new Date(h.date).toLocaleDateString()})` : ""}`
  ).join("\n");

  const prompt = `You are analyzing REAL current news headlines to generate actionable ideas for the user.

## Real News Headlines (fetched just now)

${headlinesBlock}

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

Based on the REAL headlines above, do the following:

1. Write a brief market/world summary (2-3 sentences) based on the actual headlines
2. Pick the 5-10 most relevant headlines for this user and explain WHY they matter
3. Generate 3-5 ACTIONABLE backlog items the user should consider doing

For each backlog item, assess:
- How relevant is this to their beliefs and holdings?
- Is this time-sensitive?
- What's the potential impact?

Respond in JSON:
\`\`\`json
{
  "marketSummary": "2-3 sentence summary based on real headlines above",
  "newsItems": [
    {
      "headline": "Exact headline from the list above",
      "source": "Source name",
      "relevance": "Why this matters to this specific user",
      "link": "URL if available"
    }
  ],
  "backlogItems": [
    {
      "title": "Clear, actionable item (e.g., 'Review AMD position after earnings beat')",
      "description": "What to do and why, based on the news",
      "source": "news",
      "relatedBeliefs": ["which belief this supports"],
      "impactScore": 60,
      "urgency": "low|medium|high|critical",
      "isTimeSensitive": true,
      "suggestedProject": null
    }
  ],
  "insight": "One key pattern or observation from today's news"
}
\`\`\`

IMPORTANT: Only reference REAL headlines from the list above. Do not invent news.`;

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
 * Send WhatsApp alerts for breaking/critical news that could impact the user.
 * Only fires for genuinely abnormal events (2-sigma) — urgency "critical"
 * or "high" + impactScore >= 80. Uses URGENT priority to bypass quiet hours.
 */
async function sendBreakingNewsAlerts(analysis) {
  const whatsapp = getWhatsAppNotifications();
  if (!whatsapp.enabled) return;

  // Collect critical backlog items (these have urgency + impact scores)
  const critical = (analysis?.backlogItems || []).filter(item =>
    item.urgency === "critical" ||
    (item.urgency === "high" && (item.impactScore || 0) >= 80)
  );

  if (critical.length === 0) return;

  // Build a relevance lookup from newsItems for "why this matters" context
  const relevanceMap = {};
  (analysis?.newsItems || []).forEach(n => {
    if (n.headline && n.relevance) {
      relevanceMap[n.headline.toLowerCase().trim()] = n.relevance;
    }
  });

  let msg = `*BREAKING NEWS ALERT*\n`;
  critical.slice(0, 3).forEach(item => {
    msg += `\n*${item.title}*\n`;

    // Show what happened
    if (item.description) {
      msg += `${item.description.slice(0, 150)}\n`;
    }

    // Show HOW it impacts the user — check relevance map or related beliefs
    const matchKey = Object.keys(relevanceMap).find(k =>
      item.title.toLowerCase().includes(k.slice(0, 20)) || k.includes(item.title.toLowerCase().slice(0, 20))
    );
    const relevance = matchKey ? relevanceMap[matchKey] : null;

    if (relevance) {
      msg += `\n_How this impacts you:_ ${relevance}\n`;
    } else if (item.relatedBeliefs?.length > 0) {
      msg += `\n_Impacts your:_ ${item.relatedBeliefs.join(", ")}\n`;
    }
  });

  msg += `\n_This is outside the norm and could significantly affect you._`;

  await whatsapp.send(NOTIFICATION_TYPE.ALERT, msg, {
    identifier: `breaking_${Date.now()}`,
    priority: NOTIFICATION_PRIORITY.URGENT,
    allowDuplicate: false
  });

  console.log(`[NewsService] Sent breaking news alert for ${critical.length} critical item(s)`);
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

    // 3. Fetch news from multiple sources in parallel
    const [queryResults, topStories, stockNews] = await Promise.all([
      Promise.all(queries.map(fetchNewsForQuery)),
      fetchTopStories(),
      fetchStockNews(context.topStocks),
    ]);

    // Attach supplemental feeds so analyzeNewsWithAI can use them
    const newsData = queryResults;
    newsData._topStories = topStories;
    newsData._stockNews = stockNews;

    const totalItems = queryResults.reduce((s, r) => s + (r.items?.length || 0), 0)
      + topStories.length + stockNews.length;
    console.log(`[NewsService] Fetched ${totalItems} total items (${queryResults.length} queries, ${topStories.length} top stories, ${stockNews.length} stock news)`);

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

    // 7. Check for breaking/critical news and alert via WhatsApp
    try {
      await sendBreakingNewsAlerts(analysis);
    } catch (alertErr) {
      console.log("[NewsService] Breaking news alert skipped:", alertErr.message);
    }

    // 8. Log result
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
