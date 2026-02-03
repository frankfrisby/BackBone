"use client";

import { useQuery } from "@tanstack/react-query";
import { Newspaper, ExternalLink, Clock, TrendingUp } from "lucide-react";

interface NewsViewProps {
  data?: any;
}

interface NewsItem {
  title: string;
  source: string;
  url?: string;
  timestamp?: string;
  category?: string;
  summary?: string;
  imageUrl?: string;
  relevanceScore?: number;
}

async function fetchNews(): Promise<NewsItem[]> {
  try {
    const resp = await fetch("http://localhost:3000/api/news", {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error("Failed");
    const data = await resp.json();
    return data.articles || data.news || data || [];
  } catch {
    return [];
  }
}

function timeAgo(timestamp: string): string {
  if (!timestamp) return "";
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const CATEGORY_COLORS: Record<string, string> = {
  market: "text-green-400 bg-green-500/10",
  tech: "text-blue-400 bg-blue-500/10",
  health: "text-purple-400 bg-purple-500/10",
  finance: "text-yellow-400 bg-yellow-500/10",
  crypto: "text-orange-400 bg-orange-500/10",
  ai: "text-cyan-400 bg-cyan-500/10",
  default: "text-neutral-400 bg-neutral-500/10",
};

export function NewsView({ data }: NewsViewProps) {
  const { data: news } = useQuery({
    queryKey: ["news"],
    queryFn: fetchNews,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 min
  });

  const articles: NewsItem[] = news || data?.articles || data?.news || (Array.isArray(data) ? data : []);

  if (articles.length === 0) {
    return (
      <div className="h-full overflow-auto p-5 space-y-3">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
          </div>
          <span className="text-[11px] text-neutral-600">Fetching news</span>
        </div>
      </div>
    );
  }

  // Featured article (first one)
  const featured = articles[0];
  const rest = articles.slice(1);

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Newspaper className="h-4 w-4 text-neutral-500" />
          <h2 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium">
            News Feed
          </h2>
        </div>
        <p className="text-[13px] text-neutral-600">
          Curated for your beliefs and interests
        </p>
      </div>

      {/* Featured article */}
      <div className="px-5 pb-3">
        <div className="card-interactive p-5 animate-fade-up">
          {featured.category && (
            <span
              className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider mb-3 ${
                CATEGORY_COLORS[featured.category.toLowerCase()] || CATEGORY_COLORS.default
              }`}
            >
              {featured.category}
            </span>
          )}
          <h3 className="text-[16px] font-semibold text-white leading-snug mb-2">
            {featured.title}
          </h3>
          {featured.summary && (
            <p className="text-[12px] text-neutral-500 leading-relaxed mb-3 line-clamp-2">
              {featured.summary}
            </p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-neutral-500 font-medium">
                {featured.source}
              </span>
              {featured.timestamp && (
                <span className="text-[11px] text-neutral-600 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo(featured.timestamp)}
                </span>
              )}
            </div>
            {featured.url && (
              <ExternalLink className="h-3.5 w-3.5 text-neutral-600" />
            )}
          </div>
        </div>
      </div>

      {/* Article list */}
      <div className="px-5 pb-8 space-y-1.5">
        {rest.map((article, i) => (
          <div
            key={i}
            className="card-interactive flex items-start gap-4 px-4 py-3.5 animate-fade-up"
            style={{ animationDelay: `${(i + 1) * 50}ms` }}
          >
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-medium text-neutral-200 leading-snug mb-1.5 line-clamp-2">
                {article.title}
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-neutral-500 font-medium">
                  {article.source}
                </span>
                {article.timestamp && (
                  <span className="text-[10px] text-neutral-600">
                    {timeAgo(article.timestamp)}
                  </span>
                )}
                {article.category && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                      CATEGORY_COLORS[article.category.toLowerCase()] || CATEGORY_COLORS.default
                    }`}
                  >
                    {article.category}
                  </span>
                )}
              </div>
            </div>
            {article.relevanceScore && article.relevanceScore >= 80 && (
              <div className="flex-shrink-0 mt-1">
                <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
