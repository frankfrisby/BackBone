/**
 * Mentors Service - Insights from Successful People
 *
 * Provides wisdom, strategies, and advice from successful people
 * in various fields to help guide your growth journey.
 */

// Categories of mentors
export const MENTOR_CATEGORIES = {
  startups: "Startups & Entrepreneurship",
  business: "Business & Leadership",
  finance: "Finance & Investing",
  tech: "Technology & Innovation",
  health: "Health & Wellness",
  sports: "Sports & Athletics",
  music: "Music & Creativity",
  writing: "Writing & Communication",
  science: "Science & Research",
  mindset: "Mindset & Psychology"
};

// Database of mentors with their key insights
export const MENTORS = {
  // Startups & Entrepreneurship
  elonMusk: {
    name: "Elon Musk",
    category: "startups",
    role: "CEO of Tesla, SpaceX",
    principles: [
      "First principles thinking - break problems down to fundamental truths",
      "Work extremely hard - 80-100 hour weeks when starting",
      "Focus on product - make something people actually want",
      "Take calculated risks others won't",
      "Iterate rapidly and learn from failures"
    ],
    quotes: [
      "When something is important enough, you do it even if the odds are not in your favor.",
      "If you get up in the morning and think the future is going to be better, it is a bright day.",
      "Persistence is very important. You should not give up unless you are forced to give up."
    ],
    dailyHabits: [
      "Skip breakfast, drink coffee",
      "Schedule in 5-minute blocks",
      "Sleep 6 hours minimum",
      "Read constantly - physics, engineering, sci-fi"
    ]
  },

  paulGraham: {
    name: "Paul Graham",
    category: "startups",
    role: "Co-founder of Y Combinator",
    principles: [
      "Make something people want - it's the most important thing",
      "Launch early and iterate - don't wait for perfection",
      "Do things that don't scale in the beginning",
      "Work on hard problems that seem too ambitious",
      "Talk to your users constantly"
    ],
    quotes: [
      "The way to get startup ideas is not to try to think of startup ideas.",
      "Be relentlessly resourceful.",
      "Live in the future, then build what's missing."
    ],
    dailyHabits: [
      "Write regularly - essays, code",
      "Think deeply about problems",
      "Have long conversations with smart people"
    ]
  },

  samAltman: {
    name: "Sam Altman",
    category: "startups",
    role: "CEO of OpenAI, Former Y Combinator President",
    principles: [
      "Compound growth - optimize for the long term",
      "Focus on what matters most ruthlessly",
      "Have conviction and act on it",
      "Build a strong network of exceptional people",
      "Stay optimistic about technology's potential"
    ],
    quotes: [
      "Great execution is at least 10 times more important than a great idea.",
      "Move fast. Speed is one of your main advantages over large companies.",
      "The best founders are execution machines."
    ],
    dailyHabits: [
      "Exercise regularly",
      "Prioritize sleep",
      "Maintain focus time blocks"
    ]
  },

  // Business & Leadership
  jeffBezos: {
    name: "Jeff Bezos",
    category: "business",
    role: "Founder of Amazon",
    principles: [
      "Customer obsession over competitor focus",
      "Think long-term - be willing to be misunderstood",
      "Day 1 mentality - always act like a startup",
      "High-velocity decision making",
      "Embrace failure as path to invention"
    ],
    quotes: [
      "Your brand is what people say about you when you're not in the room.",
      "If you double the number of experiments, you double your inventiveness.",
      "Work hard, have fun, make history."
    ],
    dailyHabits: [
      "8 hours of sleep",
      "No meetings before 10am",
      "Read extensively",
      "Make few but high-quality decisions"
    ]
  },

  // Finance & Investing
  warrenBuffett: {
    name: "Warren Buffett",
    category: "finance",
    role: "CEO of Berkshire Hathaway",
    principles: [
      "Invest in what you understand",
      "Buy wonderful companies at fair prices",
      "Think long-term - our favorite holding period is forever",
      "Be fearful when others are greedy",
      "Compound interest is the eighth wonder"
    ],
    quotes: [
      "Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1.",
      "The stock market is designed to transfer money from the active to the patient.",
      "Price is what you pay. Value is what you get."
    ],
    dailyHabits: [
      "Read 500 pages a day",
      "Start day early",
      "Keep schedule relatively empty for thinking"
    ]
  },

  rayDalio: {
    name: "Ray Dalio",
    category: "finance",
    role: "Founder of Bridgewater Associates",
    principles: [
      "Radical transparency and radical truth",
      "Embrace reality and deal with it",
      "Pain + Reflection = Progress",
      "Understand the machine - cause and effect",
      "Create systems and algorithms for decisions"
    ],
    quotes: [
      "He who lives by the crystal ball will eat shattered glass.",
      "Principles are ways of successfully dealing with reality.",
      "The greatest tragedy of mankind is people holding wrong opinions."
    ],
    dailyHabits: [
      "20 minutes of meditation twice daily",
      "Regular reflection and journaling",
      "Exercise regularly"
    ]
  },

  // Technology
  steveJobs: {
    name: "Steve Jobs",
    category: "tech",
    role: "Co-founder of Apple",
    principles: [
      "Focus on simplicity - eliminate the unnecessary",
      "Design is how it works, not just how it looks",
      "Stay hungry, stay foolish",
      "Connect the dots looking backwards",
      "Quality matters - be a perfectionist"
    ],
    quotes: [
      "Innovation distinguishes between a leader and a follower.",
      "Your time is limited, don't waste it living someone else's life.",
      "The people who are crazy enough to think they can change the world are the ones who do."
    ],
    dailyHabits: [
      "Long walks for thinking",
      "Extreme focus on few priorities",
      "Regular meditation"
    ]
  },

  // Health & Wellness
  andrewHuberman: {
    name: "Andrew Huberman",
    category: "health",
    role: "Neuroscientist, Stanford Professor",
    principles: [
      "Morning sunlight exposure for circadian rhythm",
      "Non-sleep deep rest (NSDR) for recovery",
      "Cold exposure for dopamine and focus",
      "Optimize sleep as foundation of health",
      "Use protocols backed by peer-reviewed science"
    ],
    quotes: [
      "Tools exist to control your nervous system to be more focused, calm, or energized.",
      "Sleep is the foundation of all mental and physical health.",
      "The brain is plastic throughout the lifespan."
    ],
    dailyHabits: [
      "Sunlight within 30 min of waking",
      "Delay caffeine 90-120 min",
      "Cold shower/plunge",
      "90 min focus blocks"
    ]
  },

  // Sports & Athletics
  kobeByrant: {
    name: "Kobe Bryant",
    category: "sports",
    role: "NBA Legend",
    principles: [
      "Mamba Mentality - obsessive focus on craft",
      "Outwork everyone - 4am workouts",
      "Study the greats and learn from them",
      "Embrace pressure and competition",
      "Never stop learning and improving"
    ],
    quotes: [
      "The moment you give up is the moment you let someone else win.",
      "Everything negative - pressure, challenges - are all an opportunity for me to rise.",
      "I can't relate to lazy people. We don't speak the same language."
    ],
    dailyHabits: [
      "4am workout before others wake",
      "Watch film obsessively",
      "Practice weak points until they're strengths"
    ]
  },

  michaelJordan: {
    name: "Michael Jordan",
    category: "sports",
    role: "NBA Legend, Businessman",
    principles: [
      "Use failure as fuel - turn setbacks into motivation",
      "Practice harder than you play",
      "Mental toughness wins championships",
      "Demand excellence from yourself and teammates",
      "Compete with yourself to be better than yesterday"
    ],
    quotes: [
      "I've failed over and over again in my life. And that is why I succeed.",
      "Some people want it to happen, some wish it would happen, others make it happen.",
      "My best skill was that I was coachable."
    ],
    dailyHabits: [
      "Intense morning workouts",
      "Visualization before games",
      "Study opponents obsessively"
    ]
  },

  // Music & Creativity
  jayz: {
    name: "Jay-Z (Shawn Carter)",
    category: "music",
    role: "Rapper, Entrepreneur",
    principles: [
      "Turn your struggles into strengths",
      "Own your masters - control your work",
      "Diversify into business beyond music",
      "Stay authentic to your story",
      "Build empire through multiple revenue streams"
    ],
    quotes: [
      "I'm not a businessman, I'm a business, man.",
      "Everyone can tell you the risk. An entrepreneur can see the reward.",
      "Belief in oneself is one of the most important bricks in building any successful venture."
    ],
    dailyHabits: [
      "Write constantly",
      "Study business and history",
      "Mentor others"
    ]
  },

  // Mindset & Psychology
  timFerriss: {
    name: "Tim Ferriss",
    category: "mindset",
    role: "Author, Podcaster, Investor",
    principles: [
      "Define your fears, not just your goals",
      "80/20 principle - focus on vital few",
      "Experiment and test assumptions",
      "Learn from the best through interviews",
      "Build systems for productivity"
    ],
    quotes: [
      "Focus on being productive instead of busy.",
      "What we fear doing most is usually what we most need to do.",
      "A person's success in life can usually be measured by the number of uncomfortable conversations they're willing to have."
    ],
    dailyHabits: [
      "Morning journaling - 5-minute journal",
      "30-60 min exercise",
      "No email until 11am",
      "Meditation or breathwork"
    ]
  },

  jamesCleer: {
    name: "James Clear",
    category: "mindset",
    role: "Author of Atomic Habits",
    principles: [
      "Habits are compound interest of self-improvement",
      "1% better every day = 37x better in a year",
      "Make good habits obvious, attractive, easy, satisfying",
      "Identity-based habits - become the person who does X",
      "Environment design beats willpower"
    ],
    quotes: [
      "You do not rise to the level of your goals. You fall to the level of your systems.",
      "Every action you take is a vote for the type of person you wish to become.",
      "The task of breaking a bad habit is like uprooting a powerful oak within us."
    ],
    dailyHabits: [
      "Habit stacking",
      "Track key habits",
      "Weekly review of progress"
    ]
  }
};

/**
 * Get mentors by category
 */
export const getMentorsByCategory = (category) => {
  return Object.values(MENTORS).filter(m => m.category === category);
};

/**
 * Get random mentor insight
 */
export const getRandomMentorInsight = () => {
  const mentors = Object.values(MENTORS);
  const mentor = mentors[Math.floor(Math.random() * mentors.length)];
  const quote = mentor.quotes[Math.floor(Math.random() * mentor.quotes.length)];
  const principle = mentor.principles[Math.floor(Math.random() * mentor.principles.length)];

  return {
    mentor: mentor.name,
    role: mentor.role,
    quote,
    principle
  };
};

/**
 * Get mentor advice for a specific situation
 */
export const getMentorAdvice = (situation) => {
  const advice = [];
  const keywords = situation.toLowerCase();

  // Match mentors based on situation keywords
  if (keywords.includes("startup") || keywords.includes("business") || keywords.includes("company")) {
    advice.push(...getMentorsByCategory("startups"));
    advice.push(...getMentorsByCategory("business"));
  }
  if (keywords.includes("money") || keywords.includes("invest") || keywords.includes("finance")) {
    advice.push(...getMentorsByCategory("finance"));
  }
  if (keywords.includes("health") || keywords.includes("sleep") || keywords.includes("exercise")) {
    advice.push(...getMentorsByCategory("health"));
  }
  if (keywords.includes("habit") || keywords.includes("productivity") || keywords.includes("mindset")) {
    advice.push(...getMentorsByCategory("mindset"));
  }
  if (keywords.includes("creative") || keywords.includes("music") || keywords.includes("art")) {
    advice.push(...getMentorsByCategory("music"));
  }
  if (keywords.includes("sports") || keywords.includes("athletic") || keywords.includes("compete")) {
    advice.push(...getMentorsByCategory("sports"));
  }

  // If no specific match, return top mentors from each category
  if (advice.length === 0) {
    advice.push(MENTORS.elonMusk, MENTORS.warrenBuffett, MENTORS.jamesCleer);
  }

  return advice;
};

/**
 * Get daily mentor wisdom
 */
export const getDailyWisdom = () => {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const mentors = Object.values(MENTORS);

  // Deterministic selection based on day
  const mentor = mentors[dayOfYear % mentors.length];
  const quoteIndex = dayOfYear % mentor.quotes.length;
  const principleIndex = dayOfYear % mentor.principles.length;

  return {
    date: today.toISOString().split('T')[0],
    mentor: mentor.name,
    role: mentor.role,
    category: MENTOR_CATEGORIES[mentor.category],
    quote: mentor.quotes[quoteIndex],
    principle: mentor.principles[principleIndex],
    habit: mentor.dailyHabits[dayOfYear % mentor.dailyHabits.length]
  };
};

/**
 * Format mentor display for CLI
 */
export const formatMentorDisplay = (mentor) => {
  let output = `\n${mentor.name} - ${mentor.role}\n`;
  output += "─".repeat(40) + "\n\n";

  output += "KEY PRINCIPLES:\n";
  mentor.principles.forEach((p, i) => {
    output += `  ${i + 1}. ${p}\n`;
  });

  output += "\nQUOTES:\n";
  mentor.quotes.forEach(q => {
    output += `  "${q}"\n`;
  });

  output += "\nDAILY HABITS:\n";
  mentor.dailyHabits.forEach(h => {
    output += `  • ${h}\n`;
  });

  return output;
};

/**
 * Get all mentors formatted for display
 */
export const getAllMentorsDisplay = () => {
  let output = "MENTORS DATABASE\n";
  output += "═".repeat(40) + "\n\n";

  for (const [catKey, catName] of Object.entries(MENTOR_CATEGORIES)) {
    const categoryMentors = getMentorsByCategory(catKey);
    if (categoryMentors.length > 0) {
      output += `${catName.toUpperCase()}\n`;
      categoryMentors.forEach(m => {
        output += `  • ${m.name} - ${m.role}\n`;
      });
      output += "\n";
    }
  }

  return output;
};
