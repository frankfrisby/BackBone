/**
 * Person Matcher Service
 *
 * Uses AI to find the most similar successful person to the user
 * based on their goals, career, interests, and connected data.
 */

import fs from "fs";
import path from "path";
import { getGoalTracker, GOAL_CATEGORY } from "./goal-tracker.js";
import { loadUserSettings } from "./user-settings.js";
import { sendMessage } from "./claude.js";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_PATH = path.join(DATA_DIR, "person-match-cache.json");

/**
 * Database of successful people with detailed attributes
 * In production, this would be 5000+ people from a real database
 */
const PEOPLE_DATABASE = [
  // Tech Entrepreneurs
  { name: "Elon Musk", category: "tech", traits: ["ambitious", "risk-taker", "engineering", "serial-entrepreneur", "workaholic"], age: 52, netWorth: 200000000000, industry: "tech", background: "engineering", achievements: ["Tesla", "SpaceX", "PayPal"], score: 97 },
  { name: "Jeff Bezos", category: "tech", traits: ["customer-obsessed", "long-term-thinker", "analytical", "frugal-early"], age: 60, netWorth: 150000000000, industry: "tech", background: "finance", achievements: ["Amazon", "Blue Origin", "Washington Post"], score: 96 },
  { name: "Mark Zuckerberg", category: "tech", traits: ["young-founder", "persistent", "technical", "acquisitive"], age: 39, netWorth: 100000000000, industry: "tech", background: "programming", achievements: ["Facebook/Meta", "Instagram acquisition", "VR pivot"], score: 94 },
  { name: "Satya Nadella", category: "career", traits: ["empathetic-leader", "cultural-transformer", "technical", "patient"], age: 56, netWorth: 1000000000, industry: "tech", background: "engineering", achievements: ["Microsoft CEO", "Cloud transformation", "10x market cap"], score: 96 },
  { name: "Jensen Huang", category: "tech", traits: ["visionary", "technical", "patient", "persistent"], age: 61, netWorth: 50000000000, industry: "tech", background: "engineering", achievements: ["NVIDIA founder", "GPU revolution", "AI hardware leader"], score: 97 },
  { name: "Sam Altman", category: "tech", traits: ["young-leader", "ambitious", "networker", "ai-focused"], age: 38, netWorth: 500000000, industry: "tech", background: "startup", achievements: ["Y Combinator", "OpenAI CEO", "ChatGPT"], score: 93 },
  { name: "Sundar Pichai", category: "career", traits: ["humble", "technical", "diplomatic", "patient"], age: 51, netWorth: 1300000000, industry: "tech", background: "engineering", achievements: ["Google CEO", "Chrome", "Android"], score: 94 },
  { name: "Tim Cook", category: "career", traits: ["operational-excellence", "private", "ethical", "supply-chain"], age: 63, netWorth: 2000000000, industry: "tech", background: "operations", achievements: ["Apple CEO", "Doubled Apple revenue", "Privacy advocate"], score: 95 },

  // Finance
  { name: "Warren Buffett", category: "finance", traits: ["patient", "value-investor", "frugal", "reader", "long-term"], age: 93, netWorth: 120000000000, industry: "finance", background: "investing", achievements: ["Berkshire Hathaway", "57 years of 20% returns", "Philanthropist"], score: 99 },
  { name: "Ray Dalio", category: "finance", traits: ["systematic", "transparent", "philosophical", "hedge-fund"], age: 74, netWorth: 19000000000, industry: "finance", background: "trading", achievements: ["Bridgewater", "Principles", "All Weather portfolio"], score: 95 },
  { name: "Charlie Munger", category: "finance", traits: ["mental-models", "reader", "patient", "contrarian"], age: 99, netWorth: 2500000000, industry: "finance", background: "law", achievements: ["Berkshire vice chair", "Mental models", "Daily Journal"], score: 96 },
  { name: "Cathie Wood", category: "finance", traits: ["disruptive", "conviction", "transparent", "growth-focused"], age: 68, netWorth: 250000000, industry: "finance", background: "investing", achievements: ["ARK Invest", "Tesla early investor", "Innovation funds"], score: 85 },
  { name: "Jim Simons", category: "finance", traits: ["quantitative", "mathematical", "secretive", "systematic"], age: 85, netWorth: 28000000000, industry: "finance", background: "mathematics", achievements: ["Renaissance Technologies", "Medallion Fund", "66% annual returns"], score: 98 },
  { name: "Peter Lynch", category: "finance", traits: ["research-driven", "accessible", "growth-at-reasonable-price"], age: 80, netWorth: 450000000, industry: "finance", background: "investing", achievements: ["Magellan Fund", "29% annual returns", "One Up on Wall Street"], score: 94 },
  { name: "George Soros", category: "finance", traits: ["macro", "reflexivity", "philanthropist", "contrarian"], age: 93, netWorth: 6700000000, industry: "finance", background: "trading", achievements: ["Broke Bank of England", "Quantum Fund", "Open Society"], score: 95 },

  // Health & Fitness
  { name: "David Goggins", category: "health", traits: ["extreme-discipline", "mental-toughness", "military", "endurance"], age: 49, netWorth: 2500000, industry: "fitness", background: "military", achievements: ["Navy SEAL", "Ultra-marathons", "Cant Hurt Me"], score: 92 },
  { name: "Jocko Willink", category: "health", traits: ["discipline", "military", "leadership", "early-riser"], age: 52, netWorth: 5000000, industry: "fitness", background: "military", achievements: ["Navy SEAL commander", "Extreme Ownership", "4:30am discipline"], score: 90 },
  { name: "Andrew Huberman", category: "health", traits: ["scientific", "educator", "optimizing", "protocols"], age: 48, netWorth: 5000000, industry: "health", background: "neuroscience", achievements: ["Stanford professor", "Huberman Lab", "Health protocols"], score: 88 },
  { name: "Peter Attia", category: "health", traits: ["longevity", "scientific", "physician", "data-driven"], age: 51, netWorth: 10000000, industry: "health", background: "medicine", achievements: ["Longevity expert", "Outlive book", "Early Disease Detection"], score: 89 },
  { name: "Laird Hamilton", category: "health", traits: ["extreme-athlete", "innovative", "longevity", "surfing"], age: 59, netWorth: 10000000, industry: "sports", background: "athlete", achievements: ["Big wave pioneer", "Tow-in surfing", "Fitness at 59"], score: 90 },
  { name: "Rich Roll", category: "health", traits: ["transformation", "plant-based", "endurance", "podcaster"], age: 57, netWorth: 3000000, industry: "fitness", background: "law", achievements: ["Ultra-endurance", "Finding Ultra", "Plant-based athlete"], score: 85 },

  // Startup Founders
  { name: "Paul Graham", category: "startup", traits: ["essayist", "hacker", "mentor", "contrarian"], age: 59, netWorth: 200000000, industry: "tech", background: "programming", achievements: ["Y Combinator", "Viaweb", "Essays"], score: 93 },
  { name: "Marc Andreessen", category: "startup", traits: ["optimist", "technical", "investor", "contrarian"], age: 52, netWorth: 1700000000, industry: "tech", background: "programming", achievements: ["Netscape", "a16z", "Tech optimism"], score: 94 },
  { name: "Brian Chesky", category: "startup", traits: ["design-thinking", "persistent", "storyteller", "culture"], age: 42, netWorth: 10000000000, industry: "tech", background: "design", achievements: ["Airbnb", "RISD grad", "Survived 2020"], score: 91 },
  { name: "Patrick Collison", category: "startup", traits: ["young-founder", "technical", "reader", "builder"], age: 35, netWorth: 9500000000, industry: "tech", background: "programming", achievements: ["Stripe", "Teen entrepreneur", "Fast growth"], score: 93 },
  { name: "Drew Houston", category: "startup", traits: ["technical", "persistent", "product-focused"], age: 41, netWorth: 3000000000, industry: "tech", background: "programming", achievements: ["Dropbox", "YC alum", "MIT grad"], score: 88 },
  { name: "Stewart Butterfield", category: "startup", traits: ["pivot-master", "product", "culture"], age: 50, netWorth: 1500000000, industry: "tech", background: "philosophy", achievements: ["Slack", "Flickr", "Two pivots to billions"], score: 89 },

  // Creative & Media
  { name: "Jay-Z", category: "creative", traits: ["hustler", "business-minded", "brand-builder", "reinvention"], age: 54, netWorth: 2500000000, industry: "entertainment", background: "music", achievements: ["Roc Nation", "Tidal", "Music empire"], score: 94 },
  { name: "Oprah Winfrey", category: "creative", traits: ["empathetic", "brand", "media-mogul", "philanthropist"], age: 70, netWorth: 2500000000, industry: "media", background: "broadcasting", achievements: ["OWN", "Harpo", "Media empire"], score: 95 },
  { name: "Joe Rogan", category: "creative", traits: ["curious", "long-form", "authentic", "diverse-interests"], age: 56, netWorth: 200000000, industry: "media", background: "comedy", achievements: ["JRE podcast", "Spotify deal", "UFC"], score: 88 },
  { name: "MrBeast", category: "creative", traits: ["young", "data-driven", "philanthropic", "youtube"], age: 25, netWorth: 500000000, industry: "media", background: "youtube", achievements: ["Most subscribed", "Feastables", "Beast Philanthropy"], score: 90 },
  { name: "Taylor Swift", category: "creative", traits: ["business-savvy", "reinvention", "fan-connection", "songwriter"], age: 34, netWorth: 1100000000, industry: "music", background: "music", achievements: ["Re-recordings", "Eras Tour", "Billionaire musician"], score: 93 },

  // Science & Education
  { name: "Neil deGrasse Tyson", category: "education", traits: ["communicator", "scientific", "accessible", "curious"], age: 65, netWorth: 5000000, industry: "science", background: "astrophysics", achievements: ["Hayden Planetarium", "Cosmos", "Science popularizer"], score: 90 },
  { name: "Sal Khan", category: "education", traits: ["mission-driven", "accessible", "persistent", "educator"], age: 47, netWorth: 5000000, industry: "education", background: "finance", achievements: ["Khan Academy", "Free education", "150M students"], score: 92 },
  { name: "Bill Nye", category: "education", traits: ["communicator", "advocate", "entertainer", "engineer"], age: 68, netWorth: 8000000, industry: "science", background: "engineering", achievements: ["Science Guy", "Climate advocate", "Science education"], score: 85 },

  // Athletes & Sports
  { name: "Michael Jordan", category: "sports", traits: ["competitive", "clutch", "brand-builder", "winner"], age: 61, netWorth: 3200000000, industry: "sports", background: "athlete", achievements: ["6 NBA titles", "Jordan Brand", "Hornets owner"], score: 97 },
  { name: "LeBron James", category: "sports", traits: ["longevity", "business-minded", "philanthropist", "versatile"], age: 39, netWorth: 1200000000, industry: "sports", background: "athlete", achievements: ["4 NBA titles", "SpringHill", "I Promise School"], score: 96 },
  { name: "Tom Brady", category: "sports", traits: ["longevity", "discipline", "winner", "methodical"], age: 46, netWorth: 300000000, industry: "sports", background: "athlete", achievements: ["7 Super Bowls", "TB12", "Playing at 45"], score: 97 },
  { name: "Serena Williams", category: "sports", traits: ["dominant", "resilient", "business", "motherhood"], age: 42, netWorth: 300000000, industry: "sports", background: "athlete", achievements: ["23 Grand Slams", "Serena Ventures", "GOAT debate"], score: 96 },
  { name: "Cristiano Ronaldo", category: "sports", traits: ["discipline", "longevity", "brand", "work-ethic"], age: 39, netWorth: 600000000, industry: "sports", background: "athlete", achievements: ["5 Ballon dOr", "Most goals ever", "CR7 brand"], score: 96 },

  // Family & Balance
  { name: "Michelle Obama", category: "family", traits: ["balance", "advocate", "authenticity", "education"], age: 60, netWorth: 70000000, industry: "public", background: "law", achievements: ["First Lady", "Becoming", "Girls education"], score: 88 },
  { name: "Melinda French Gates", category: "family", traits: ["philanthropist", "tech", "advocate", "balance"], age: 59, netWorth: 11000000000, industry: "philanthropy", background: "tech", achievements: ["Gates Foundation", "Pivotal Ventures", "Global health"], score: 90 },
  { name: "MacKenzie Scott", category: "family", traits: ["philanthropist", "private", "writer", "generous"], age: 53, netWorth: 37000000000, industry: "philanthropy", background: "writing", achievements: ["$14B donated", "Amazon co-founder", "Quiet giving"], score: 89 },

  // More diverse backgrounds
  { name: "Howard Schultz", category: "business", traits: ["from-nothing", "culture-builder", "brand", "employee-focused"], age: 70, netWorth: 4200000000, industry: "retail", background: "sales", achievements: ["Starbucks", "From projects to billionaire", "Employee benefits"], score: 91 },
  { name: "Sara Blakely", category: "startup", traits: ["female-founder", "bootstrapped", "persistent", "creative"], age: 52, netWorth: 1200000000, industry: "retail", background: "sales", achievements: ["Spanx", "Youngest female billionaire", "Bootstrapped"], score: 90 },
  { name: "Phil Knight", category: "business", traits: ["persistent", "brand-builder", "athlete", "long-term"], age: 86, netWorth: 45000000000, industry: "retail", background: "accounting", achievements: ["Nike", "From car trunk to $45B", "Shoe Dog"], score: 95 },
  { name: "Richard Branson", category: "startup", traits: ["adventurous", "brand", "dyslexic", "fun"], age: 73, netWorth: 3000000000, industry: "conglomerate", background: "music", achievements: ["Virgin empire", "Space tourism", "400+ companies"], score: 91 },
  { name: "Mark Cuban", category: "startup", traits: ["hustler", "technical", "outspoken", "diverse"], age: 65, netWorth: 5300000000, industry: "tech", background: "sales", achievements: ["Broadcast.com", "Mavericks", "Shark Tank"], score: 90 },
  { name: "Gary Vaynerchuk", category: "startup", traits: ["hustle", "social-media", "immigrant", "content"], age: 48, netWorth: 200000000, industry: "media", background: "retail", achievements: ["VaynerMedia", "Wine Library", "Content empire"], score: 85 },
  { name: "Naval Ravikant", category: "startup", traits: ["philosopher", "investor", "wisdom", "wealth-principles"], age: 49, netWorth: 60000000, industry: "tech", background: "programming", achievements: ["AngelList", "Twitter wisdom", "How to Get Rich"], score: 88 },
  { name: "Tony Robbins", category: "growth", traits: ["motivator", "energy", "coaching", "systems"], age: 64, netWorth: 600000000, industry: "coaching", background: "sales", achievements: ["Life coaching empire", "100M+ reached", "Books"], score: 87 },
  { name: "James Clear", category: "growth", traits: ["habits", "writer", "systematic", "accessible"], age: 37, netWorth: 10000000, industry: "writing", background: "sports", achievements: ["Atomic Habits", "15M copies", "Habit systems"], score: 86 },
  { name: "Tim Ferriss", category: "growth", traits: ["experimenter", "podcaster", "author", "investor"], age: 46, netWorth: 100000000, industry: "media", background: "startup", achievements: ["4-Hour books", "Top podcast", "Angel investing"], score: 87 },
];

// Export database for testing
export { PEOPLE_DATABASE };

/**
 * Build user profile from connected data
 */
export function buildUserProfile(connectedData = {}) {
  const profile = {
    traits: [],
    interests: [],
    goals: [],
    industry: null,
    background: null,
    age: null,
    netWorth: null,
    category: null
  };

  const goalTracker = getGoalTracker();
  const activeGoals = goalTracker.getActive();
  const settings = loadUserSettings();

  // Extract traits from goals
  if (activeGoals.length > 0) {
    profile.goals = activeGoals.map(g => ({
      category: g.category,
      title: g.title,
      progress: goalTracker.calculateProgress(g)
    }));

    // Determine primary category from goals
    const categoryCounts = {};
    activeGoals.forEach(g => {
      categoryCounts[g.category] = (categoryCounts[g.category] || 0) + 1;
    });
    profile.category = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "finance";
  }

  // Extract traits from connected services
  if (connectedData.portfolio?.connected) {
    profile.traits.push("investor", "finance-focused");
    profile.interests.push("investing", "markets");
    if (!profile.category) profile.category = "finance";
  }

  if (connectedData.ouraHealth?.connected) {
    profile.traits.push("health-conscious", "data-driven", "optimizing");
    profile.interests.push("health", "fitness", "sleep");
    if (!profile.category) profile.category = "health";
  }

  if (connectedData.linkedIn?.connected) {
    profile.traits.push("career-focused", "professional", "networker");
    profile.interests.push("career", "networking");
    if (connectedData.linkedIn.industry) {
      profile.industry = connectedData.linkedIn.industry;
    }
    if (!profile.category) profile.category = "career";
  }

  // Add traits based on app usage
  if (connectedData.firebase?.connected) {
    profile.traits.push("goal-oriented", "self-improvement");
  }

  // Default category if none determined
  if (!profile.category) {
    profile.category = "finance";
  }

  return profile;
}

/**
 * Calculate similarity score between user and a person
 */
function calculateSimilarity(userProfile, person) {
  let score = 0;
  let maxScore = 0;

  // Category match (highest weight)
  maxScore += 40;
  if (userProfile.category === person.category) {
    score += 40;
  } else if (
    (userProfile.category === "finance" && person.category === "startup") ||
    (userProfile.category === "startup" && person.category === "finance") ||
    (userProfile.category === "career" && person.category === "tech") ||
    (userProfile.category === "tech" && person.category === "career")
  ) {
    score += 20; // Related categories
  }

  // Trait overlap
  maxScore += 30;
  const userTraits = new Set(userProfile.traits);
  const personTraits = new Set(person.traits);
  const overlap = [...userTraits].filter(t => personTraits.has(t)).length;
  const traitScore = userTraits.size > 0 ? (overlap / userTraits.size) * 30 : 0;
  score += traitScore;

  // Industry match
  maxScore += 15;
  if (userProfile.industry && person.industry === userProfile.industry) {
    score += 15;
  } else if (userProfile.industry && person.industry === "tech") {
    score += 7; // Tech is generally relatable
  }

  // Interest overlap
  maxScore += 15;
  const userInterests = new Set(userProfile.interests);
  const personAchievements = person.achievements?.join(" ").toLowerCase() || "";
  let interestMatch = 0;
  userInterests.forEach(interest => {
    if (personAchievements.includes(interest.toLowerCase())) {
      interestMatch++;
    }
  });
  score += userInterests.size > 0 ? (interestMatch / userInterests.size) * 15 : 0;

  return {
    score: Math.round((score / maxScore) * 100),
    breakdown: {
      categoryMatch: userProfile.category === person.category,
      traitOverlap: overlap,
      industryMatch: userProfile.industry === person.industry
    }
  };
}

/**
 * Find the best matching person for the user
 */
export function findBestMatch(connectedData = {}) {
  const userProfile = buildUserProfile(connectedData);

  // Calculate similarity for all people
  const matches = PEOPLE_DATABASE.map(person => ({
    person,
    similarity: calculateSimilarity(userProfile, person)
  }));

  // Sort by similarity score
  matches.sort((a, b) => b.similarity.score - a.similarity.score);

  // Get top 5 matches
  const topMatches = matches.slice(0, 5);

  return {
    bestMatch: topMatches[0],
    topMatches,
    userProfile,
    totalPeopleAnalyzed: PEOPLE_DATABASE.length
  };
}

/**
 * Get the target person for display
 */
export function getTargetPerson(connectedData = {}) {
  const result = findBestMatch(connectedData);
  const best = result.bestMatch;

  return {
    name: best.person.name,
    score: best.person.score,
    category: best.person.category,
    achievements: best.person.achievements,
    similarity: best.similarity.score,
    metric: best.person.achievements?.[0] || "Industry leader",
    matchReason: `${best.similarity.score}% match based on your goals and data`
  };
}

/**
 * Use AI to find even better match (for complex profiles)
 */
export async function findBestMatchWithAI(connectedData = {}) {
  const userProfile = buildUserProfile(connectedData);
  const algorithmMatch = findBestMatch(connectedData);

  // For simple cases, use algorithm
  if (algorithmMatch.bestMatch.similarity.score > 70) {
    return algorithmMatch;
  }

  // For complex cases, use AI to refine
  try {
    const prompt = `Given this user profile:
- Category focus: ${userProfile.category}
- Traits: ${userProfile.traits.join(", ") || "none identified"}
- Interests: ${userProfile.interests.join(", ") || "none identified"}
- Goals: ${userProfile.goals.map(g => g.title).join(", ") || "none set"}

And these top matches from our algorithm:
${algorithmMatch.topMatches.slice(0, 3).map(m =>
  `- ${m.person.name} (${m.similarity.score}% match, ${m.person.category})`
).join("\n")}

Which person is the BEST aspirational match and why? Reply with just the name.`;

    const response = await sendMessage(prompt, { maxTokens: 50 });
    const aiChoice = response?.content?.[0]?.text?.trim();

    // Find AI's choice in our database
    const aiMatch = PEOPLE_DATABASE.find(p =>
      aiChoice?.toLowerCase().includes(p.name.toLowerCase())
    );

    if (aiMatch) {
      return {
        ...algorithmMatch,
        bestMatch: {
          person: aiMatch,
          similarity: calculateSimilarity(userProfile, aiMatch)
        },
        aiRefined: true
      };
    }
  } catch (e) {
    // Fallback to algorithm match
  }

  return algorithmMatch;
}

// Cache for performance
let cachedMatch = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get cached target person (for UI performance)
 */
export function getCachedTargetPerson(connectedData = {}) {
  const now = Date.now();

  if (cachedMatch && (now - cacheTime) < CACHE_DURATION) {
    return cachedMatch;
  }

  cachedMatch = getTargetPerson(connectedData);
  cacheTime = now;

  return cachedMatch;
}

export default {
  findBestMatch,
  getTargetPerson,
  findBestMatchWithAI,
  getCachedTargetPerson,
  buildUserProfile,
  PEOPLE_DATABASE
};
