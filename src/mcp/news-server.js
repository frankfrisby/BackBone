import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getDataDir, getMemoryDir } from "../services/paths.js";

/**
 * BACKBONE News & Research MCP Server
 * Integrates with news-service.js for fetching, analyzing, and correlating news
 */

const DATA_DIR = getDataDir();
const MEMORY_DIR = getMemoryDir();
const NEWS_CACHE_PATH = path.join(DATA_DIR, "news-cache.json");
const BELIEFS_PATH = path.join(DATA_DIR, "core-beliefs.json");
const BACKLOG_PATH = path.join(DATA_DIR, "backlog.json");
const TICKERS_PATH = path.join(DATA_DIR, "tickers-cache.json");
const LINKEDIN_PATH = path.join(DATA_DIR, "linkedin-profile.json");

// Tool definitions
const TOOLS = [
  {
    name: "fetch_latest_news",
    description: "Fetch and analyze latest news based on user context (beliefs, portfolio, interests)",
    inputSchema: {
      type: "object",
      properties: {
        forceRefresh: { type: "boolean", description: "Force refresh even if cache is recent (default false)" },
      },
      required: [],
    },
  },
  {
    name: "get_market_summary",
    description: "Get the latest market summary from cached news analysis",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "research_topic",
    description: "Deep research on a specific topic — returns structured analysis",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic to research (e.g., 'AI chip market', 'longevity science')" },
        context: { type: "string", description: "Additional context for the research" },
      },
      required: ["topic"],
    },
  },
  {
    name: "get_news_for_beliefs",
    description: "Get news items specifically relevant to user's core beliefs",
    inputSchema: {
      type: "object",
      properties: {
        beliefName: { type: "string", description: "Specific belief to filter by (omit for all beliefs)" },
      },
      required: [],
    },
  },
  {
    name: "correlate_news_with_portfolio",
    description: "Analyze how recent news affects portfolio holdings",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Specific ticker symbol (omit for full portfolio)" },
      },
      required: [],
    },
  },
];

// === HELPERS ===

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getUserContext() {
  const beliefs = readJson(BELIEFS_PATH)?.beliefs || [];
  const tickers = readJson(TICKERS_PATH) || [];
  const linkedin = readJson(LINKEDIN_PATH);
  const profilePath = path.join(MEMORY_DIR, "profile.md");
  const profile = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, "utf-8") : "";

  const topSymbols = Array.isArray(tickers)
    ? tickers.slice(0, 10).map(t => t.symbol)
    : [];

  return {
    beliefs: beliefs.map(b => ({ name: b.name, description: b.description })),
    beliefNames: beliefs.map(b => b.name).filter(Boolean),
    topStocks: topSymbols,
    headline: linkedin?.profile?.headline || linkedin?.gpt4oAnalysis?.headline || "",
    skills: (linkedin?.profile?.skills || linkedin?.gpt4oAnalysis?.skills || []).slice(0, 10),
    profileSummary: profile.slice(0, 500),
  };
}

function shouldFetchNews(forceRefresh = false) {
  if (forceRefresh) return true;
  const cache = readJson(NEWS_CACHE_PATH);
  if (!cache?.lastUpdated) return true;
  const hoursSince = (Date.now() - new Date(cache.lastUpdated).getTime()) / (1000 * 60 * 60);
  return hoursSince >= 4;
}

// === RSS Helpers (lightweight, no extra deps) ===

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
    if (title) {
      items.push({
        title: title.replace(/<[^>]+>/g, "").trim(),
        link: get("link"),
        pubDate: get("pubDate"),
        source: get("source")?.replace(/<[^>]+>/g, "").trim() || null,
        description: get("description")?.replace(/<[^>]+>/g, "").trim().slice(0, 300) || null,
      });
    }
  }
  return items;
}

async function fetchRSS(url, label = "") {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "BACKBONE-Engine/1.0" },
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const xml = await response.text();
    return parseRSS(xml);
  } catch {
    return [];
  }
}

// === TOOL IMPLEMENTATIONS ===

async function fetchLatestNews(forceRefresh = false) {
  // Check cache freshness
  if (!shouldFetchNews(forceRefresh)) {
    const cache = readJson(NEWS_CACHE_PATH);
    return {
      cached: true,
      lastUpdated: cache.lastUpdated,
      marketSummary: cache.latest?.marketSummary || null,
      newsItems: cache.latest?.newsItems || [],
      backlogItems: cache.latest?.backlogItems?.length || 0,
      insight: cache.latest?.insight || null,
      message: "Using cached news (less than 4 hours old). Use forceRefresh=true to override.",
    };
  }

  // Try to import and call news service
  try {
    const newsService = await import("../services/research/news-service.js");
    const result = await newsService.fetchAndAnalyzeNews();
    return result;
  } catch (importError) {
    // Fallback: return cached data with error
    const cache = readJson(NEWS_CACHE_PATH);
    return {
      error: `News service unavailable: ${importError.message}`,
      cached: true,
      lastUpdated: cache?.lastUpdated || null,
      marketSummary: cache?.latest?.marketSummary || null,
      newsItems: cache?.latest?.newsItems || [],
    };
  }
}

function getMarketSummary() {
  const cache = readJson(NEWS_CACHE_PATH);

  if (!cache?.latest) {
    return {
      marketSummary: null,
      message: "No market summary available. Run fetch_latest_news first.",
    };
  }

  return {
    marketSummary: cache.latest.marketSummary,
    insight: cache.latest.insight,
    newsItems: cache.latest.newsItems || [],
    lastUpdated: cache.lastUpdated,
  };
}

async function researchTopic(topic, context = "") {
  const userContext = getUserContext();

  // Fetch REAL news for this topic via Google News RSS
  const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
  const liveItems = await fetchRSS(googleUrl, `Research: ${topic}`);

  const liveNews = liveItems.slice(0, 15).map(item => ({
    headline: item.title,
    source: item.source || "Google News",
    date: item.pubDate || null,
    link: item.link || null,
    description: item.description || null,
  }));

  // Also check cached history for additional context
  const cache = readJson(NEWS_CACHE_PATH);
  const cachedRelated = [];
  if (cache?.history) {
    for (const entry of cache.history.slice(0, 10)) {
      for (const item of entry.newsItems || []) {
        if (
          item.headline?.toLowerCase().includes(topic.toLowerCase()) ||
          item.relevance?.toLowerCase().includes(topic.toLowerCase())
        ) {
          cachedRelated.push(item);
        }
      }
    }
  }

  // Check backlog for related items
  const backlog = readJson(BACKLOG_PATH);
  const relatedBacklog = (backlog?.items || []).filter(item =>
    item.title?.toLowerCase().includes(topic.toLowerCase()) ||
    item.description?.toLowerCase().includes(topic.toLowerCase())
  ).slice(0, 5);

  return {
    topic,
    liveNews,
    cachedNews: cachedRelated.slice(0, 10),
    relatedBacklogItems: relatedBacklog,
    userRelevance: {
      matchesBeliefs: userContext.beliefNames.filter(b =>
        b.toLowerCase().includes(topic.toLowerCase()) ||
        topic.toLowerCase().includes(b.toLowerCase())
      ),
      matchesStocks: userContext.topStocks.filter(s =>
        topic.toUpperCase().includes(s)
      ),
    },
    totalResults: liveNews.length + cachedRelated.length,
    researchedAt: new Date().toISOString(),
  };
}

function getNewsForBeliefs(beliefName) {
  const beliefs = readJson(BELIEFS_PATH)?.beliefs || [];
  const cache = readJson(NEWS_CACHE_PATH);
  const backlog = readJson(BACKLOG_PATH);

  // Filter beliefs
  const targetBeliefs = beliefName
    ? beliefs.filter(b => b.name.toLowerCase().includes(beliefName.toLowerCase()))
    : beliefs;

  if (targetBeliefs.length === 0) {
    return {
      error: beliefName ? `No belief matching "${beliefName}" found` : "No beliefs defined",
      hint: "Add beliefs via the thinking engine or life-server",
    };
  }

  // Find news items related to each belief
  const beliefNews = targetBeliefs.map(belief => {
    const beliefLower = belief.name.toLowerCase();
    const descLower = (belief.description || "").toLowerCase();

    // Search news cache
    const matchingNews = [];
    if (cache?.history) {
      for (const entry of cache.history.slice(0, 15)) {
        for (const item of entry.newsItems || []) {
          if (
            item.headline?.toLowerCase().includes(beliefLower) ||
            item.relevance?.toLowerCase().includes(beliefLower) ||
            item.headline?.toLowerCase().includes(descLower.slice(0, 20))
          ) {
            matchingNews.push({
              ...item,
              fetchedAt: entry.fetchedAt,
            });
          }
        }
      }
    }

    // Search backlog for belief-related items
    const matchingBacklog = (backlog?.items || []).filter(item =>
      item.relatedBeliefs?.some(rb =>
        rb.toLowerCase().includes(beliefLower) || beliefLower.includes(rb.toLowerCase())
      )
    ).slice(0, 5);

    return {
      belief: belief.name,
      description: belief.description,
      relatedNews: matchingNews.slice(0, 5),
      relatedBacklog: matchingBacklog,
    };
  });

  return {
    beliefs: beliefNews,
    totalNewsMatches: beliefNews.reduce((sum, b) => sum + b.relatedNews.length, 0),
    totalBacklogMatches: beliefNews.reduce((sum, b) => sum + b.relatedBacklog.length, 0),
  };
}

function correlateNewsWithPortfolio(symbol) {
  const tickers = readJson(TICKERS_PATH) || [];
  const cache = readJson(NEWS_CACHE_PATH);

  // Get target tickers
  const targetTickers = symbol
    ? (Array.isArray(tickers) ? tickers : []).filter(t => t.symbol?.toUpperCase() === symbol.toUpperCase())
    : (Array.isArray(tickers) ? tickers.slice(0, 10) : []);

  if (targetTickers.length === 0) {
    return {
      error: symbol ? `Ticker ${symbol} not found in portfolio` : "No tickers in portfolio",
    };
  }

  // Find news mentions for each ticker
  const correlations = targetTickers.map(ticker => {
    const sym = ticker.symbol?.toUpperCase() || "";
    const company = ticker.name?.toLowerCase() || "";

    const mentions = [];
    if (cache?.history) {
      for (const entry of cache.history.slice(0, 15)) {
        for (const item of entry.newsItems || []) {
          const headline = (item.headline || "").toUpperCase();
          const relevance = (item.relevance || "").toLowerCase();
          if (headline.includes(sym) || relevance.includes(sym.toLowerCase()) || relevance.includes(company)) {
            mentions.push({
              ...item,
              fetchedAt: entry.fetchedAt,
            });
          }
        }

        for (const bItem of entry.backlogItems || []) {
          const title = (bItem.title || "").toUpperCase();
          if (title.includes(sym)) {
            mentions.push({
              headline: bItem.title,
              relevance: bItem.description,
              source: "backlog",
              fetchedAt: entry.fetchedAt,
            });
          }
        }
      }
    }

    return {
      symbol: sym,
      name: ticker.name || sym,
      currentPrice: ticker.price || null,
      mentions: mentions.slice(0, 5),
      mentionCount: mentions.length,
    };
  });

  return {
    correlations,
    totalMentions: correlations.reduce((sum, c) => sum + c.mentionCount, 0),
    analyzedAt: new Date().toISOString(),
    lastNewsUpdate: cache?.lastUpdated || null,
  };
}

// === SERVER SETUP ===

const server = new Server(
  { name: "backbone-news", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  switch (name) {
    case "fetch_latest_news":
      result = await fetchLatestNews(args.forceRefresh);
      break;
    case "get_market_summary":
      result = getMarketSummary();
      break;
    case "research_topic":
      result = await researchTopic(args.topic, args.context);
      break;
    case "get_news_for_beliefs":
      result = getNewsForBeliefs(args.beliefName);
      break;
    case "correlate_news_with_portfolio":
      result = correlateNewsWithPortfolio(args.symbol);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE News & Research MCP Server running");
}

main().catch(console.error);
