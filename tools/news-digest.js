/**
 * Tool: News Digest
 *
 * Fetch and summarize latest cached news.
 */

import fs from "fs";
import { dataFile } from "../src/services/paths.js";

export const metadata = {
  id: "news-digest",
  name: "News Digest",
  description: "Get latest news headlines from cache with optional category filter",
  category: "world"
};

export async function execute(inputs = {}) {
  const { category = "all" } = inputs;

  try {
    const cachePath = dataFile("news-cache.json");
    if (!fs.existsSync(cachePath)) {
      return { success: false, error: "No news cache available. Run fetch-news tool first." };
    }

    const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    let articles = cache.articles || cache.items || cache.news || [];

    if (category !== "all" && articles.length > 0) {
      articles = articles.filter(a =>
        (a.category || "").toLowerCase().includes(category.toLowerCase()) ||
        (a.tags || []).some(t => t.toLowerCase().includes(category.toLowerCase()))
      );
    }

    const top10 = articles.slice(0, 10).map(a => ({
      title: a.title,
      source: a.source || a.publisher,
      url: a.url || a.link,
      category: a.category,
      publishedAt: a.publishedAt || a.date
    }));

    return {
      success: true,
      totalArticles: articles.length,
      filter: category,
      headlines: top10,
      marketSummary: cache.marketSummary || cache.summary || null,
      lastFetched: cache.lastFetched || cache.timestamp
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { metadata, execute };
