/**
 * Person Matcher Service
 *
 * Finds the BEST single target person for the user:
 * - Focuses on ONE primary domain (not multiple)
 * - Represents user's future goals (aspirational)
 * - Partially reflects who the user is NOW (relatable)
 *
 * Uses AI when needed for nuanced matching.
 */

import fs from "fs";
import path from "path";
import { getGoalTracker, GOAL_CATEGORY } from "./goal-tracker.js";
import { loadUserSettings } from "./user-settings.js";
import { sendMessage } from "./claude.js";
import { getUserAge, getAgeBenchmarks } from "./age-benchmarks.js";

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_PATH = path.join(DATA_DIR, "person-match-cache.json");

/**
 * Extended database of role models organized by PRIMARY domain
 * Each person is categorized into their MAIN area of achievement
 *
 * Includes:
 * - startingPoint: Where they started (for relatability)
 * - trajectory: How they got there (for inspiration)
 * - currentAge: For age-based matching
 * - peakAge: When they achieved major success (shows timeline)
 */
const ROLE_MODELS_BY_DOMAIN = {
  // FINANCE - Wealth builders, investors, traders
  finance: [
    {
      name: "Warren Buffett",
      score: 99,
      netWorth: 130000000000,
      currentAge: 93,
      peakAge: 55, // When he became truly mega-rich
      startingPoint: "Son of congressman, middle class, started investing at 11",
      trajectory: "Paper route -> Stock broker -> Investment partnerships -> Berkshire",
      traits: ["patient", "value-investor", "reader", "long-term-thinker", "frugal"],
      achievements: ["57 years of 20%+ returns", "$130B net worth", "Pledged 99% to charity"],
      metric: "Compounded wealth at 20%+ for 57 years",
      why_relatable: "Started small, focused on fundamentals, avoided trends",
      why_aspirational: "Became richest through pure investing skill"
    },
    {
      name: "Ray Dalio",
      score: 95,
      netWorth: 19000000000,
      currentAge: 74,
      peakAge: 45,
      startingPoint: "Middle class Queens, NY - caddied at golf course",
      trajectory: "Commodities trader -> Started Bridgewater from apartment",
      traits: ["systematic", "transparent", "philosophical", "data-driven"],
      achievements: ["World's largest hedge fund", "Pioneered risk parity", "Principles book"],
      metric: "Built Bridgewater to $150B+ AUM",
      why_relatable: "Started from nothing, learned from failures",
      why_aspirational: "Created systematic approach anyone can study"
    },
    {
      name: "Cathie Wood",
      score: 88,
      netWorth: 250000000,
      currentAge: 68,
      peakAge: 65,
      startingPoint: "Immigrant family, worked through school",
      trajectory: "Economist -> Capital Group -> AllianceBernstein -> Founded ARK at 58",
      traits: ["conviction-driven", "transparent", "disruptive-focused", "late-bloomer"],
      achievements: ["Built ARK Invest", "Early Tesla believer", "Innovation investing"],
      metric: "Founded billion-dollar fund at age 58",
      why_relatable: "Started her major success late in life",
      why_aspirational: "Proves it's never too late to make it big"
    },
    {
      name: "Peter Lynch",
      score: 94,
      netWorth: 450000000,
      currentAge: 80,
      peakAge: 46,
      startingPoint: "Father died when he was 10, worked as caddy",
      trajectory: "Caddy -> Fidelity analyst -> Magellan Fund manager",
      traits: ["research-driven", "accessible", "practical", "teaches investing"],
      achievements: ["29% annual returns", "Grew Magellan from $20M to $14B"],
      metric: "Best-performing mutual fund manager 1977-1990",
      why_relatable: "Made investing understandable for everyone",
      why_aspirational: "Proved regular people can beat Wall Street"
    },
    {
      name: "Jim Simons",
      score: 98,
      netWorth: 28000000000,
      currentAge: 85,
      peakAge: 50,
      startingPoint: "Math professor, broke codes for NSA",
      trajectory: "Math professor -> Codebreaker -> Founded Renaissance at 44",
      traits: ["quantitative", "mathematical", "secretive", "systematic"],
      achievements: ["66% average returns", "Medallion Fund", "Renaissance Technologies"],
      metric: "Best track record in investing history",
      why_relatable: "Was a math nerd, not a finance guy",
      why_aspirational: "Used unique skills to dominate markets"
    }
  ],

  // TECH - Founders, builders, innovators
  tech: [
    {
      name: "Elon Musk",
      score: 97,
      netWorth: 200000000000,
      currentAge: 52,
      peakAge: 49,
      startingPoint: "Immigrated from South Africa, sold company at 28",
      trajectory: "Zip2 -> PayPal -> Tesla/SpaceX simultaneously",
      traits: ["ambitious", "risk-taker", "engineering", "serial-entrepreneur", "workaholic"],
      achievements: ["Tesla", "SpaceX", "Richest person multiple times"],
      metric: "Built multiple $100B+ companies",
      why_relatable: "Failed many times, nearly went bankrupt in 2008",
      why_aspirational: "Tackled impossible problems and won"
    },
    {
      name: "Jensen Huang",
      score: 97,
      netWorth: 50000000000,
      currentAge: 61,
      peakAge: 58,
      startingPoint: "Taiwanese immigrant, sent to boarding school at 9",
      trajectory: "Engineer at AMD -> LSI Logic -> Founded NVIDIA at 30",
      traits: ["visionary", "technical", "patient", "persistent"],
      achievements: ["Founded NVIDIA", "GPU revolution", "AI hardware leader"],
      metric: "Built NVIDIA from startup to $2T+ company",
      why_relatable: "Struggled early, company nearly died multiple times",
      why_aspirational: "Patience over 30 years led to AI revolution"
    },
    {
      name: "Sam Altman",
      score: 93,
      netWorth: 500000000,
      currentAge: 38,
      peakAge: 37,
      startingPoint: "Grew up in St. Louis, dropped out of Stanford",
      trajectory: "Loopt (failed) -> Y Combinator president -> OpenAI CEO",
      traits: ["young-leader", "ambitious", "networker", "ai-focused"],
      achievements: ["Y Combinator president at 28", "OpenAI CEO", "ChatGPT"],
      metric: "Leading the AI revolution",
      why_relatable: "First startup failed, pivoted successfully",
      why_aspirational: "Young person shaping entire industry"
    },
    {
      name: "Patrick Collison",
      score: 93,
      netWorth: 9500000000,
      currentAge: 35,
      peakAge: 30,
      startingPoint: "Rural Ireland, self-taught programmer",
      trajectory: "Teen startup sold to Live Current -> Stripe at 19",
      traits: ["young-founder", "technical", "reader", "builder"],
      achievements: ["Stripe founder", "Built $95B company", "Ireland's youngest billionaire"],
      metric: "Built Stripe from dorm room to $95B",
      why_relatable: "Started as a curious kid teaching himself to code",
      why_aspirational: "Became billionaire by solving real problems"
    },
    {
      name: "Satya Nadella",
      score: 96,
      netWorth: 1000000000,
      currentAge: 56,
      peakAge: 50,
      startingPoint: "Engineer from India, joined Microsoft as mid-level employee",
      trajectory: "Engineer -> Cloud division -> CEO at 46 -> Transformed company",
      traits: ["empathetic-leader", "cultural-transformer", "technical", "patient"],
      achievements: ["10x Microsoft market cap as CEO", "Cloud transformation"],
      metric: "Grew Microsoft from $300B to $3T",
      why_relatable: "Was not the founder, rose through corporate ladder",
      why_aspirational: "Proves employees can become legendary leaders"
    }
  ],

  // HEALTH - Fitness, longevity, transformation
  health: [
    {
      name: "David Goggins",
      score: 98,
      netWorth: 2500000,
      currentAge: 49,
      peakAge: 36,
      startingPoint: "Abused as child, 300 lbs, exterminator",
      trajectory: "Overweight -> Lost 100 lbs in 3 months -> Navy SEAL -> Ultra-runner",
      traits: ["extreme-discipline", "mental-toughness", "transformation", "endurance"],
      achievements: ["Navy SEAL", "Army Ranger", "60+ ultra-marathons"],
      metric: "Transformed from 300 lbs to world-class athlete",
      why_relatable: "Started from absolute rock bottom",
      why_aspirational: "Proves anyone can transform completely"
    },
    {
      name: "Peter Attia",
      score: 89,
      netWorth: 10000000,
      currentAge: 51,
      peakAge: 45,
      startingPoint: "Doctor who realized medicine was reactive, not preventive",
      trajectory: "Surgeon -> Longevity researcher -> Author of Outlive",
      traits: ["scientific", "data-driven", "longevity-focused", "educator"],
      achievements: ["Longevity expert", "Outlive book", "Early disease detection"],
      metric: "Pioneering longevity medicine",
      why_relatable: "Had his own health crisis that sparked transformation",
      why_aspirational: "Making cutting-edge health science accessible"
    },
    {
      name: "Rich Roll",
      score: 92,
      netWorth: 3000000,
      currentAge: 57,
      peakAge: 44,
      startingPoint: "Alcoholic lawyer, unhealthy at 40",
      trajectory: "Rock bottom at 40 -> Transformed -> Epic5 at 44",
      traits: ["transformation", "plant-based", "endurance", "late-bloomer"],
      achievements: ["5 Ironmans in 7 days", "Finding Ultra", "Top podcast"],
      metric: "Transformed health completely at 40",
      why_relatable: "Was totally out of shape at midlife",
      why_aspirational: "Proves massive transformation possible at any age"
    },
    {
      name: "Andrew Huberman",
      score: 88,
      netWorth: 5000000,
      currentAge: 48,
      peakAge: 45,
      startingPoint: "Stanford neuroscience professor",
      trajectory: "Academic -> Podcaster -> Health influencer",
      traits: ["scientific", "educator", "protocols", "accessible"],
      achievements: ["Stanford professor", "Huberman Lab podcast", "Science communication"],
      metric: "Made neuroscience practical for millions",
      why_relatable: "Regular person who shares what he learns",
      why_aspirational: "Democratizing cutting-edge health science"
    },
    {
      name: "Laird Hamilton",
      score: 90,
      netWorth: 10000000,
      currentAge: 59,
      peakAge: 35,
      startingPoint: "No father figure, raised in Hawaii surf culture",
      trajectory: "Troubled youth -> Surfing pioneer -> Fitness icon at 59",
      traits: ["extreme-athlete", "innovative", "longevity", "primal"],
      achievements: ["Big wave pioneer", "Tow-in surfing inventor", "Still elite at 59"],
      metric: "Peak athletic performance maintained into 60s",
      why_relatable: "Overcame difficult childhood through sports",
      why_aspirational: "Shows how to age while staying powerful"
    }
  ],

  // CAREER - Corporate leaders, executives
  career: [
    {
      name: "Satya Nadella",
      score: 96,
      netWorth: 1000000000,
      currentAge: 56,
      peakAge: 50,
      startingPoint: "Indian immigrant, mid-level Microsoft engineer",
      trajectory: "22 years at Microsoft -> CEO -> 10x company value",
      traits: ["empathetic-leader", "cultural-transformer", "patient", "technical"],
      achievements: ["Microsoft CEO", "10x market cap", "Cultural transformation"],
      metric: "Rose through ranks to transform $3T company",
      why_relatable: "Was not a founder, built career incrementally",
      why_aspirational: "Proves patient career building pays off"
    },
    {
      name: "Sundar Pichai",
      score: 94,
      netWorth: 1300000000,
      currentAge: 51,
      peakAge: 43,
      startingPoint: "Middle class Chennai, India - no computer growing up",
      trajectory: "McKinsey -> Product manager at Google -> CEO",
      traits: ["humble", "technical", "diplomatic", "product-focused"],
      achievements: ["Google CEO", "Chrome creator", "Android leader"],
      metric: "Rose from PM to CEO of world's most valuable company",
      why_relatable: "Humble beginnings, steady career growth",
      why_aspirational: "Shows product excellence leads to top"
    },
    {
      name: "Mary Barra",
      score: 91,
      netWorth: 100000000,
      currentAge: 62,
      peakAge: 52,
      startingPoint: "Daughter of GM die maker, started as co-op student",
      trajectory: "Intern at GM -> 33 years of progression -> First female auto CEO",
      traits: ["persistent", "technical", "transformative", "long-term"],
      achievements: ["First female auto CEO", "GM EV transformation", "Survived bankruptcy"],
      metric: "33 years at one company to become CEO",
      why_relatable: "Started at very bottom of the company",
      why_aspirational: "Proof that loyalty and skill get rewarded"
    },
    {
      name: "Tim Cook",
      score: 95,
      netWorth: 2000000000,
      currentAge: 63,
      peakAge: 51,
      startingPoint: "Alabama, modest background, operations expert",
      trajectory: "IBM -> Compaq -> Apple operations -> CEO",
      traits: ["operational-excellence", "private", "ethical", "supply-chain"],
      achievements: ["Apple CEO", "Doubled Apple revenue", "Privacy advocate"],
      metric: "Succeeded Steve Jobs and doubled company value",
      why_relatable: "Not a visionary founder, just excellent at execution",
      why_aspirational: "Shows operations expertise can reach the top"
    }
  ],

  // CREATIVE - Media, entertainment, content
  creative: [
    {
      name: "MrBeast (Jimmy Donaldson)",
      score: 90,
      netWorth: 500000000,
      currentAge: 25,
      peakAge: 24,
      startingPoint: "Small town North Carolina, obsessed with YouTube analytics",
      trajectory: "Failed videos for 6 years -> Viral at 18 -> Biggest YouTuber",
      traits: ["data-driven", "persistent", "philanthropic", "content-obsessed"],
      achievements: ["Most subscribed YouTuber", "Feastables", "Beast Philanthropy"],
      metric: "6 years of failure before massive success",
      why_relatable: "Failed for years, just kept going",
      why_aspirational: "Young person building media empire"
    },
    {
      name: "Joe Rogan",
      score: 88,
      netWorth: 200000000,
      currentAge: 56,
      peakAge: 50,
      startingPoint: "Stand-up comedian, martial artist, various odd jobs",
      trajectory: "Comedian -> Fear Factor host -> UFC -> Podcast empire",
      traits: ["curious", "authentic", "long-form", "diverse-interests"],
      achievements: ["Biggest podcast", "$200M Spotify deal", "UFC commentator"],
      metric: "Built biggest podcast through authentic curiosity",
      why_relatable: "Just talked about what interested him",
      why_aspirational: "Turned conversations into $200M deal"
    },
    {
      name: "Taylor Swift",
      score: 93,
      netWorth: 1100000000,
      currentAge: 34,
      peakAge: 33,
      startingPoint: "Pennsylvania, moved to Nashville as teen to pursue music",
      trajectory: "Teen country singer -> Pop star -> Business mogul",
      traits: ["business-savvy", "reinvention", "fan-connection", "songwriter"],
      achievements: ["Re-recorded albums", "Eras Tour ($1B+)", "Billionaire musician"],
      metric: "Turned music ownership into billion-dollar empire",
      why_relatable: "Started as regular teen with dreams",
      why_aspirational: "Took control of career and built empire"
    },
    {
      name: "Oprah Winfrey",
      score: 95,
      netWorth: 2500000000,
      currentAge: 70,
      peakAge: 45,
      startingPoint: "Born into poverty in Mississippi, teen mom, abused",
      trajectory: "Radio -> Local TV -> National show -> Media empire",
      traits: ["empathetic", "brand", "media-mogul", "overcame-trauma"],
      achievements: ["OWN network", "Harpo Productions", "Philanthropist"],
      metric: "From poverty to $2.5B through authenticity",
      why_relatable: "Overcame extreme adversity",
      why_aspirational: "Built empire by being genuine"
    }
  ],

  // GROWTH - Personal development, entrepreneurship
  growth: [
    {
      name: "Naval Ravikant",
      score: 88,
      netWorth: 60000000,
      currentAge: 49,
      peakAge: 40,
      startingPoint: "Indian immigrant, grew up poor in NYC",
      trajectory: "Struggled -> AngelList founder -> Twitter philosopher",
      traits: ["philosopher", "investor", "wisdom", "wealth-principles"],
      achievements: ["AngelList", "Invested in Uber/Twitter early", "How to Get Rich thread"],
      metric: "Made wealth and happiness principles accessible",
      why_relatable: "Was broke, figured it out, shares openly",
      why_aspirational: "Combined wealth with wisdom"
    },
    {
      name: "James Clear",
      score: 86,
      netWorth: 10000000,
      currentAge: 37,
      peakAge: 35,
      startingPoint: "Regular guy, college baseball injury changed perspective",
      trajectory: "Blogger -> Newsletter -> Atomic Habits -> 15M copies",
      traits: ["habits", "systematic", "accessible", "persistent"],
      achievements: ["Atomic Habits (15M+ copies)", "Newsletter empire"],
      metric: "Built career from simple blog about habits",
      why_relatable: "Just a guy who studied habits and shared",
      why_aspirational: "Turned simple ideas into life-changing impact"
    },
    {
      name: "Tim Ferriss",
      score: 87,
      netWorth: 100000000,
      currentAge: 46,
      peakAge: 30,
      startingPoint: "Struggled with work-life balance, burned out",
      trajectory: "Failed businesses -> 4-Hour Work Week -> Investor/podcaster",
      traits: ["experimenter", "deconstructor", "networker", "teacher"],
      achievements: ["4-Hour books", "Top podcast", "Angel investing portfolio"],
      metric: "Pioneered lifestyle design movement",
      why_relatable: "Was overwhelmed and figured out escape",
      why_aspirational: "Designed life most people dream about"
    },
    {
      name: "Gary Vaynerchuk",
      score: 85,
      netWorth: 200000000,
      currentAge: 48,
      peakAge: 35,
      startingPoint: "Soviet immigrant, worked in dad's liquor store",
      trajectory: "Wine Library -> Social media pioneer -> VaynerMedia",
      traits: ["hustler", "content", "immigrant-drive", "authentic"],
      achievements: ["VaynerMedia", "Multiple companies", "Content empire"],
      metric: "Built $200M empire through pure hustle",
      why_relatable: "Started in family store, outworked everyone",
      why_aspirational: "Proves work ethic can overcome any start"
    }
  ]
};

// Flatten for backward compatibility
export const PEOPLE_DATABASE = Object.values(ROLE_MODELS_BY_DOMAIN).flat();

/**
 * Determine user's PRIMARY domain from their goals and data
 */
const determinePrimaryDomain = (goals = [], connectedData = {}, userProfile = {}) => {
  // If user has explicitly set their domain, use it
  if (userProfile.primaryDomain) {
    return userProfile.primaryDomain;
  }

  // Count goals by category
  const categoryCounts = {};
  goals.forEach(g => {
    const cat = g.category || "growth";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + (g.priority ? (6 - g.priority) : 1);
  });

  // Map goal categories to our domains
  const categoryToDomain = {
    finance: "finance",
    health: "health",
    career: "career",
    family: "growth",
    growth: "growth",
    education: "growth",
    tech: "tech",
    creative: "creative"
  };

  // Find highest weighted category
  let maxDomain = "finance"; // Default
  let maxWeight = 0;

  Object.entries(categoryCounts).forEach(([cat, weight]) => {
    const domain = categoryToDomain[cat] || "growth";
    if (weight > maxWeight) {
      maxWeight = weight;
      maxDomain = domain;
    }
  });

  // Boost based on connected data
  if (connectedData.portfolio?.connected && maxDomain !== "finance") {
    // If they have trading connected, finance is likely important
    if (categoryCounts.finance && categoryCounts.finance >= maxWeight * 0.5) {
      maxDomain = "finance";
    }
  }

  if (connectedData.ouraHealth?.connected && maxDomain !== "health") {
    if (categoryCounts.health && categoryCounts.health >= maxWeight * 0.5) {
      maxDomain = "health";
    }
  }

  return maxDomain;
};

/**
 * Calculate how RELATABLE a person is to the user's current state
 * (How much they reflect where the user is NOW)
 */
const calculateRelatability = (person, userProfile, userAge) => {
  let score = 0;
  let maxScore = 0;

  // Age proximity (closer age = more relatable)
  maxScore += 25;
  if (userAge && person.currentAge) {
    const ageDiff = Math.abs(person.currentAge - userAge);
    if (ageDiff <= 5) score += 25;
    else if (ageDiff <= 10) score += 20;
    else if (ageDiff <= 20) score += 15;
    else if (ageDiff <= 30) score += 10;
    else score += 5;
  }

  // Peak age relevance (if they succeeded at similar age to user)
  maxScore += 20;
  if (userAge && person.peakAge) {
    if (userAge < person.peakAge) {
      // User is younger than when this person peaked - very relevant
      score += 20;
    } else if (userAge <= person.peakAge + 10) {
      // User is near or slightly past peak age - still relevant
      score += 15;
    } else {
      // User is much older than when they peaked
      score += 5;
    }
  }

  // Starting point similarity (humble beginnings = more relatable)
  maxScore += 25;
  if (person.startingPoint) {
    const humbleKeywords = ["poor", "immigrant", "nothing", "middle class", "struggled", "failed", "bottom"];
    const matches = humbleKeywords.filter(k => person.startingPoint.toLowerCase().includes(k));
    score += Math.min(25, matches.length * 8);
  }

  // Late bloomer bonus (if user is older and person succeeded late)
  maxScore += 15;
  if (userAge && userAge >= 35 && person.peakAge && person.peakAge >= 40) {
    score += 15; // Late bloomer resonates with older users
  } else if (userAge && userAge < 30 && person.peakAge && person.peakAge < 35) {
    score += 15; // Young success resonates with young users
  }

  // Trait overlap
  maxScore += 15;
  const userTraits = userProfile.traits || [];
  if (userTraits.length > 0 && person.traits) {
    const overlap = userTraits.filter(t => person.traits.includes(t)).length;
    score += Math.min(15, overlap * 5);
  }

  return Math.round((score / maxScore) * 100);
};

/**
 * Calculate how ASPIRATIONAL a person is for the user's goals
 * (How much they represent where the user WANTS to be)
 */
const calculateAspirational = (person, goals, userProfile) => {
  let score = 0;
  let maxScore = 0;

  // Achievement level (higher = more aspirational)
  maxScore += 30;
  score += Math.min(30, person.score * 0.3);

  // Goal alignment
  maxScore += 40;
  if (goals.length > 0) {
    const goalTexts = goals.map(g => `${g.title} ${g.description || ""}`).join(" ").toLowerCase();
    const achievements = (person.achievements || []).join(" ").toLowerCase();
    const metric = (person.metric || "").toLowerCase();

    // Check for keyword matches
    const financeKeywords = ["money", "million", "wealth", "invest", "trading", "financial", "rich", "$"];
    const healthKeywords = ["health", "fitness", "sleep", "exercise", "weight", "strong"];
    const careerKeywords = ["career", "job", "promotion", "leadership", "ceo", "manager"];
    const techKeywords = ["tech", "software", "ai", "app", "startup", "founder", "build"];

    let matchCount = 0;
    [financeKeywords, healthKeywords, careerKeywords, techKeywords].forEach(keywords => {
      const goalHas = keywords.some(k => goalTexts.includes(k));
      const personHas = keywords.some(k => achievements.includes(k) || metric.includes(k));
      if (goalHas && personHas) matchCount++;
    });

    score += matchCount * 10;
  }

  // Clear path/trajectory (shows it's achievable)
  maxScore += 20;
  if (person.trajectory) {
    score += 15;
  }
  if (person.why_aspirational) {
    score += 5;
  }

  // Success magnitude appropriate to user's goals
  maxScore += 10;
  const primaryGoal = goals.find(g => g.priority === 1) || goals[0];
  if (primaryGoal && primaryGoal.targetValue) {
    // Check if person's success is in the right ballpark
    // (Too big might seem unattainable, about right is more inspiring)
    if (person.netWorth) {
      const ratio = person.netWorth / primaryGoal.targetValue;
      if (ratio >= 10 && ratio <= 10000) {
        score += 10; // Successful but not unreachably so
      } else if (ratio >= 1 && ratio < 10) {
        score += 8; // Very achievable
      } else if (ratio > 10000) {
        score += 5; // Inspiring but distant
      }
    }
  }

  return Math.round((score / maxScore) * 100);
};

/**
 * Build user profile from connected data
 */
export function buildUserProfile(connectedData = {}) {
  const settings = loadUserSettings();
  const profile = settings.userProfile || {};
  const goalTracker = getGoalTracker();
  const activeGoals = goalTracker.getActive();

  const userProfile = {
    traits: [],
    interests: [],
    goals: activeGoals,
    primaryDomain: profile.primaryDomain || null,
    age: getUserAge(),
    netWorth: profile.currentNetWorth,
    occupation: profile.occupation,
    aspirations: profile.aspirations || []
  };

  // Extract traits from goals and connected services
  if (activeGoals.length > 0) {
    userProfile.goals = activeGoals.map(g => ({
      category: g.category,
      title: g.title,
      priority: g.priority
    }));
  }

  // Add traits from connected services
  if (connectedData.portfolio?.connected) {
    userProfile.traits.push("investor", "finance-focused", "data-driven");
    userProfile.interests.push("investing", "markets", "wealth-building");
  }

  if (connectedData.ouraHealth?.connected) {
    userProfile.traits.push("health-conscious", "data-driven", "optimizing");
    userProfile.interests.push("health", "fitness", "sleep", "longevity");
  }

  if (connectedData.linkedIn?.connected) {
    userProfile.traits.push("career-focused", "professional", "networker");
    userProfile.interests.push("career", "networking");
  }

  // Determine primary domain
  userProfile.primaryDomain = determinePrimaryDomain(
    activeGoals,
    connectedData,
    profile
  );

  return userProfile;
}

/**
 * Find the BEST single target person for the user
 * Focuses on ONE domain, balances relatable + aspirational
 */
export function findBestMatch(connectedData = {}) {
  const userProfile = buildUserProfile(connectedData);
  const userAge = userProfile.age;
  const primaryDomain = userProfile.primaryDomain;

  // Get role models from the user's primary domain ONLY
  const domainRoleModels = ROLE_MODELS_BY_DOMAIN[primaryDomain] || ROLE_MODELS_BY_DOMAIN.finance;

  // Score each person on both relatability AND aspirational value
  const scored = domainRoleModels.map(person => {
    const relatability = calculateRelatability(person, userProfile, userAge);
    const aspirational = calculateAspirational(person, userProfile.goals, userProfile);

    // Combined score: 40% relatable (current state), 60% aspirational (future goals)
    const combined = Math.round(relatability * 0.4 + aspirational * 0.6);

    return {
      person,
      relatability,
      aspirational,
      combined
    };
  });

  // Sort by combined score
  scored.sort((a, b) => b.combined - a.combined);

  return {
    bestMatch: scored[0],
    topMatches: scored.slice(0, 3),
    userProfile,
    primaryDomain,
    totalAnalyzed: domainRoleModels.length
  };
}

/**
 * Get the target person for display (simplified for UI)
 * Uses cached AI result if available, otherwise algorithm match
 */
export function getTargetPerson(connectedData = {}) {
  // Check if we have a cached AI match
  if (cachedAIMatch) {
    const best = cachedAIMatch.bestMatch;
    return {
      name: best.person.name,
      score: best.person.score,
      domain: cachedAIMatch.primaryDomain,
      achievements: best.person.achievements,
      metric: best.person.metric,
      relatability: best.relatability,
      aspirational: best.aspirational,
      combined: best.combined,
      why_relatable: best.person.why_relatable,
      why_aspirational: best.person.why_aspirational,
      matchReason: cachedAIMatch.aiReason || `${best.combined}% match`,
      aiSelected: true
    };
  }

  // Fallback to algorithm match
  const result = findBestMatch(connectedData);
  const best = result.bestMatch;

  return {
    name: best.person.name,
    score: best.person.score,
    domain: result.primaryDomain,
    achievements: best.person.achievements,
    metric: best.person.metric,
    relatability: best.relatability,
    aspirational: best.aspirational,
    combined: best.combined,
    why_relatable: best.person.why_relatable,
    why_aspirational: best.person.why_aspirational,
    matchReason: `${best.combined}% match: ${best.relatability}% like you now, ${best.aspirational}% where you're going`,
    aiSelected: false
  };
}

/**
 * Use AI to analyze user profile and find the BEST target person
 * This is the primary method - always uses AI for best results
 */
export async function findBestMatchWithAI(connectedData = {}) {
  const userProfile = buildUserProfile(connectedData);
  const algorithmMatch = findBestMatch(connectedData);
  const domainRoleModels = ROLE_MODELS_BY_DOMAIN[algorithmMatch.primaryDomain] || [];

  // Always use AI to make the final decision
  try {
    const prompt = `You are helping someone find their ideal role model - ONE person who best represents:
1. WHERE THEY ARE NOW (relatable - similar starting point, struggles, background)
2. WHERE THEY WANT TO BE (aspirational - achieved what they're working toward)

The target person should be in ONE domain only, matching the user's primary focus.

===== USER PROFILE =====
Age: ${userProfile.age || "Not specified (assume 30s)"}
Primary Domain: ${algorithmMatch.primaryDomain.toUpperCase()}
Current Situation: ${userProfile.netWorth ? `Net worth ~$${userProfile.netWorth.toLocaleString()}` : "Building wealth"}
Occupation: ${userProfile.occupation || "Professional"}

Goals (in priority order):
${userProfile.goals.map((g, i) => `${i + 1}. ${g.title}`).join("\n") || "- Build significant wealth\n- Achieve financial freedom"}

Traits/Interests: ${userProfile.traits.join(", ") || "ambitious, driven, analytical"}
Aspirations: ${userProfile.aspirations?.join(", ") || "financial independence, success"}

===== CANDIDATES IN ${algorithmMatch.primaryDomain.toUpperCase()} DOMAIN =====
${domainRoleModels.map((p, i) => `
${i + 1}. ${p.name} (Score: ${p.score}/100)
   - Started: ${p.startingPoint}
   - Path: ${p.trajectory}
   - Achievement: ${p.metric}
   - Current Age: ${p.currentAge} | Peak Success Age: ${p.peakAge}
   - Why Relatable: ${p.why_relatable}
   - Why Aspirational: ${p.why_aspirational}
`).join("")}

===== YOUR TASK =====
Analyze deeply:
1. Which person's STARTING POINT most closely mirrors where the user is now?
2. Which person's ACHIEVEMENTS align with the user's specific goals?
3. Which person's TRAJECTORY is most realistic/inspiring for this user?
4. Consider AGE - if user is younger, someone who peaked later gives hope; if older, late bloomers are more relatable.

Pick the SINGLE BEST match. Reply in this exact format:
MATCH: [Name]
REASON: [2-3 sentences explaining why this person is the perfect target - be specific about the user's goals and the person's journey]`;

    const response = await sendMessage(prompt, { maxTokens: 250 });
    const aiText = response?.content?.[0]?.text?.trim() || "";

    // Parse AI response
    const matchLine = aiText.match(/MATCH:\s*(.+)/i);
    const reasonLine = aiText.match(/REASON:\s*(.+)/is);

    const matchedName = matchLine ? matchLine[1].trim() : null;
    const reason = reasonLine ? reasonLine[1].trim() : aiText;

    // Find AI's choice in our database
    const aiMatch = matchedName
      ? domainRoleModels.find(p => p.name.toLowerCase().includes(matchedName.toLowerCase()) ||
                                    matchedName.toLowerCase().includes(p.name.toLowerCase()))
      : null;

    if (aiMatch) {
      const relatability = calculateRelatability(aiMatch, userProfile, userProfile.age);
      const aspirational = calculateAspirational(aiMatch, userProfile.goals, userProfile);
      const combined = Math.round(relatability * 0.4 + aspirational * 0.6);

      const result = {
        ...algorithmMatch,
        bestMatch: {
          person: aiMatch,
          relatability,
          aspirational,
          combined
        },
        aiRefined: true,
        aiReason: reason,
        aiSelectedName: aiMatch.name
      };

      // Cache the AI result
      cachedAIMatch = result;
      cachedAIMatchTime = Date.now();

      return result;
    }
  } catch (e) {
    console.error("[PersonMatcher] AI matching failed:", e.message);
  }

  // Fallback to algorithm match
  return algorithmMatch;
}

/**
 * Get target person using AI (async version for UI)
 * Call this when you want the best possible match
 */
export async function getTargetPersonWithAI(connectedData = {}) {
  const result = await findBestMatchWithAI(connectedData);
  const best = result.bestMatch;

  return {
    name: best.person.name,
    score: best.person.score,
    domain: result.primaryDomain,
    achievements: best.person.achievements,
    metric: best.person.metric,
    relatability: best.relatability,
    aspirational: best.aspirational,
    combined: best.combined,
    why_relatable: best.person.why_relatable,
    why_aspirational: best.person.why_aspirational,
    matchReason: result.aiReason || `${best.combined}% match`,
    aiSelected: result.aiRefined || false
  };
}

/**
 * Initialize AI matching on startup (call this early in app lifecycle)
 * This pre-warms the cache so getTargetPerson() returns AI results
 */
export async function initializeAIMatching(connectedData = {}) {
  try {
    console.log("[PersonMatcher] Initializing AI-powered role model matching...");
    await findBestMatchWithAI(connectedData);
    console.log("[PersonMatcher] AI matching initialized, target:", cachedAIMatch?.bestMatch?.person?.name);
    return true;
  } catch (e) {
    console.error("[PersonMatcher] Failed to initialize AI matching:", e.message);
    return false;
  }
}

// Cache for performance
let cachedMatch = null;
let cacheTime = 0;
let cachedAIMatch = null;
let cachedAIMatchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const AI_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for AI results (more expensive)

/**
 * Get cached target person (for UI performance)
 * Prefers AI-cached result if available
 */
export function getCachedTargetPerson(connectedData = {}) {
  const now = Date.now();

  // Check AI cache first (longer duration)
  if (cachedAIMatch && (now - cachedAIMatchTime) < AI_CACHE_DURATION) {
    return getTargetPerson(connectedData); // Will use cachedAIMatch
  }

  // Fall back to regular cache
  if (cachedMatch && (now - cacheTime) < CACHE_DURATION) {
    return cachedMatch;
  }

  cachedMatch = getTargetPerson(connectedData);
  cacheTime = now;

  return cachedMatch;
}

/**
 * Get cached target person with AI (async - triggers AI if not cached)
 */
export async function getCachedTargetPersonWithAI(connectedData = {}) {
  const now = Date.now();

  // Check AI cache first
  if (cachedAIMatch && (now - cachedAIMatchTime) < AI_CACHE_DURATION) {
    return getTargetPerson(connectedData);
  }

  // Need to refresh AI match
  return await getTargetPersonWithAI(connectedData);
}

/**
 * Clear the cache (call when user profile changes)
 */
export function clearCache() {
  cachedMatch = null;
  cacheTime = 0;
  cachedAIMatch = null;
  cachedAIMatchTime = 0;
}

/**
 * Check if AI matching is initialized
 */
export function isAIMatchingInitialized() {
  return cachedAIMatch !== null;
}

export default {
  findBestMatch,
  getTargetPerson,
  getTargetPersonWithAI,
  findBestMatchWithAI,
  initializeAIMatching,
  getCachedTargetPerson,
  getCachedTargetPersonWithAI,
  isAIMatchingInitialized,
  buildUserProfile,
  clearCache,
  ROLE_MODELS_BY_DOMAIN,
  PEOPLE_DATABASE
};
