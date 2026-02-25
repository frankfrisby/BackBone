/**
 * Tool: Web Research
 *
 * Generate a structured research plan for any topic.
 * Returns search queries and a research plan for the AI to execute.
 */

export const metadata = {
  id: "web-research",
  name: "Web Research",
  description: "Generate a structured research plan with search queries for any topic",
  category: "research"
};

export async function execute(inputs = {}) {
  const { topic, depth = "standard" } = inputs;
  if (!topic) return { success: false, error: "topic is required" };

  const queryCount = { quick: 2, standard: 4, deep: 7 }[depth] || 4;

  const baseQueries = [
    `${topic} latest news ${new Date().getFullYear()}`,
    `${topic} analysis overview`,
  ];

  const standardQueries = [
    `${topic} trends data statistics`,
    `${topic} expert opinion forecast`,
  ];

  const deepQueries = [
    `${topic} research papers academic`,
    `${topic} risks challenges concerns`,
    `${topic} opportunities future outlook`,
  ];

  let searchQueries = baseQueries;
  if (depth === "standard" || depth === "deep") searchQueries = [...searchQueries, ...standardQueries];
  if (depth === "deep") searchQueries = [...searchQueries, ...deepQueries];
  searchQueries = searchQueries.slice(0, queryCount);

  const suggestedSources = [
    "reuters.com", "bloomberg.com", "ft.com", "wsj.com",
    "arxiv.org", "nature.com", "techcrunch.com", "arstechnica.com"
  ];

  return {
    success: true,
    topic,
    depth,
    searchQueries,
    researchPlan: [
      `Search for: ${searchQueries[0]}`,
      "Collect key facts, statistics, and expert opinions",
      "Identify trends and patterns across sources",
      depth === "deep" ? "Analyze risks, opportunities, and contrarian views" : "Summarize findings",
      "Compile structured findings with sources"
    ].filter(Boolean),
    suggestedSources: suggestedSources.slice(0, depth === "deep" ? 8 : 4)
  };
}

export default { metadata, execute };
