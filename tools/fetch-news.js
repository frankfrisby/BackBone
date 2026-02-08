/**
 * Tool: Fetch News
 *
 * Fetch latest news from various sources:
 * - Financial news (markets, stocks)
 * - Tech news
 * - World news
 *
 * Stores in news cache for other tools to use.
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { getDataDir, dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "fetch-news",
  name: "Fetch News",
  description: "Fetch latest news from financial and world sources",
  category: "world"
};

const DATA_DIR = getDataDir();
const NEWS_CACHE_PATH = dataFile("news-cache.json");

// RSS feeds to check
const NEWS_SOURCES = [
  {
    name: "Yahoo Finance",
    url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY&region=US&lang=en-US",
    category: "markets"
  },
  {
    name: "MarketWatch",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/",
    category: "markets"
  },
  {
    name: "Reuters Business",
    url: "https://feeds.reuters.com/reuters/businessNews",
    category: "business"
  }
];

/**
 * Execute the tool
 * @param {Object} inputs - { category, maxArticles }
 * @returns {Promise<Object>} Fetched news
 */
export async function execute(inputs = {}) {
  const { category = "all", maxArticles = 20 } = inputs;

  const allArticles = [];
  const errors = [];

  // Fetch from each source
  for (const source of NEWS_SOURCES) {
    if (category !== "all" && source.category !== category) continue;

    try {
      const articles = await fetchRssFeed(source);
      allArticles.push(...articles);
    } catch (error) {
      errors.push({ source: source.name, error: error.message });
    }
  }

  // Also try to get news via Yahoo Finance quote news
  try {
    const yahooNews = await fetchYahooNews();
    allArticles.push(...yahooNews);
  } catch { /* ignore */ }

  // Sort by date and dedupe
  const sorted = allArticles
    .filter(a => a.title && a.publishedAt)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const seen = new Set();
  const unique = sorted.filter(a => {
    const key = a.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxArticles);

  // Update cache
  const cache = {
    articles: unique,
    lastFetched: new Date().toISOString(),
    sourceCount: NEWS_SOURCES.length,
    errors
  };

  try {
    fs.writeFileSync(NEWS_CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch { /* ignore */ }

  return {
    success: true,
    articleCount: unique.length,
    articles: unique.map(a => ({
      title: a.title,
      source: a.source,
      category: a.category,
      publishedAt: a.publishedAt,
      link: a.link
    })),
    errors: errors.length > 0 ? errors : undefined,
    summary: `Fetched ${unique.length} articles from ${NEWS_SOURCES.length} sources`
  };
}

async function fetchRssFeed(source) {
  const articles = [];

  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();

    // Simple XML parsing for RSS items
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

    for (const item of items.slice(0, 10)) {
      const title = extractTag(item, "title");
      const link = extractTag(item, "link");
      const pubDate = extractTag(item, "pubDate");
      const description = extractTag(item, "description");

      if (title) {
        articles.push({
          title: cleanHtml(title),
          description: cleanHtml(description),
          link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          source: source.name,
          category: source.category
        });
      }
    }
  } catch (error) {
    throw error;
  }

  return articles;
}

async function fetchYahooNews() {
  const articles = [];

  try {
    // Fetch news for major tickers
    const symbols = ["SPY", "QQQ", "AAPL", "NVDA"];
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbols.join(",")}&newsCount=10`;

    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return articles;

    const data = await res.json();
    const news = data.news || [];

    for (const item of news) {
      articles.push({
        title: item.title,
        description: item.title,
        link: item.link,
        publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
        source: item.publisher || "Yahoo Finance",
        category: "markets"
      });
    }
  } catch { /* ignore */ }

  return articles;
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : null;
}

function cleanHtml(text) {
  if (!text) return "";
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export default { metadata, execute };
