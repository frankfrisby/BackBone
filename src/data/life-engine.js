/**
 * Life Engine - Activity Feed for BACKBONE
 * Tracks and displays life changes and system activities
 * Doubled list size for more comprehensive view
 */

const FEED_EVENTS = [
  // Thinking & Analysis
  { state: "thinking", text: "Analyzing goal friction across domains" },
  { state: "thinking", text: "Processing market sentiment signals" },
  { state: "thinking", text: "Evaluating portfolio risk factors" },
  { state: "thinking", text: "Assessing weekly progress patterns" },

  // Research Activities
  { state: "research", text: "Scanning calendar + inbox for conflicts" },
  { state: "research", text: "Reviewing industry news and trends" },
  { state: "research", text: "Analyzing competitor movements" },
  { state: "research", text: "Gathering health metrics from Oura" },

  // Building & Creating
  { state: "building", text: "Updating weekly execution plan" },
  { state: "building", text: "Constructing new trading strategies" },
  { state: "building", text: "Generating personalized insights" },
  { state: "building", text: "Compiling performance reports" },

  // Actions & Execution
  { state: "actions", text: "Scheduling outreach + follow-ups" },
  { state: "actions", text: "Setting up alerts for opportunities" },
  { state: "actions", text: "Triggering automated workflows" },
  { state: "actions", text: "Updating social media connections" },

  // Reflecting & Learning
  { state: "reflecting", text: "Reviewing KPI trendlines" },
  { state: "reflecting", text: "Identifying behavioral patterns" },
  { state: "reflecting", text: "Assessing goal completion rates" },
  { state: "reflecting", text: "Evaluating decision outcomes" },

  // Updating & Syncing
  { state: "updating", text: "Refreshing signals + portfolio deltas" },
  { state: "updating", text: "Syncing cloud data for mobile access" },
  { state: "updating", text: "Updating LinkedIn profile insights" },
  { state: "updating", text: "Refreshing Oura health metrics" }
];

/**
 * Life change categories - for tracking significant events
 */
const LIFE_CHANGES = [
  { category: "career", text: "New job opportunity detected" },
  { category: "career", text: "Skill gap analysis completed" },
  { category: "career", text: "Network connection strengthened" },
  { category: "career", text: "Career milestone approaching" },

  { category: "health", text: "Sleep quality trend improving" },
  { category: "health", text: "Activity goal streak continues" },
  { category: "health", text: "Stress indicator detected" },
  { category: "health", text: "Recovery score trending up" },

  { category: "finance", text: "Portfolio rebalancing suggested" },
  { category: "finance", text: "Unusual market movement detected" },
  { category: "finance", text: "Savings goal progress updated" },
  { category: "finance", text: "Investment opportunity identified" },

  { category: "education", text: "Learning milestone reached" },
  { category: "education", text: "Course recommendation available" },
  { category: "education", text: "Study streak maintained" },
  { category: "education", text: "Skill certification approaching" },

  { category: "personal", text: "Relationship check-in reminder" },
  { category: "personal", text: "Personal goal deadline nearing" },
  { category: "personal", text: "Habit formation progress" },
  { category: "personal", text: "Life balance score updated" }
];

const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min));

const timestamp = () =>
  new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

/**
 * Build a single life event
 */
export const buildLifeEvent = () => {
  const event = FEED_EVENTS[randomBetween(0, FEED_EVENTS.length)];
  return {
    ...event,
    at: timestamp(),
    id: `${event.state}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  };
};

/**
 * Build a life change event
 */
export const buildLifeChange = () => {
  const change = LIFE_CHANGES[randomBetween(0, LIFE_CHANGES.length)];
  return {
    ...change,
    at: timestamp(),
    id: `${change.category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  };
};

/**
 * Build life feed - doubled from 6 to 12 items
 */
export const buildLifeFeed = (size = 12) => {
  return Array.from({ length: size }, () => buildLifeEvent());
};

/**
 * Build life changes feed - doubled list
 */
export const buildLifeChanges = (size = 10) => {
  return Array.from({ length: size }, () => buildLifeChange());
};

/**
 * State colors for display
 */
export const STATE_COLORS = {
  research: "#38bdf8",
  thinking: "#60a5fa",
  building: "#34d399",
  actions: "#f97316",
  reflecting: "#facc15",
  updating: "#22c55e"
};

/**
 * State icons for display
 */
export const STATE_ICONS = {
  research: "\u25C7", // Diamond outline
  thinking: "\u25C8", // Diamond with dot
  building: "\u25A3", // Square with fill
  actions: "\u25B8", // Right triangle
  reflecting: "\u25CE", // Bullseye
  updating: "\u25CF" // Filled circle
};

/**
 * Life change category colors
 */
export const CHANGE_COLORS = {
  career: "#8b5cf6",
  health: "#22c55e",
  finance: "#eab308",
  education: "#3b82f6",
  personal: "#ec4899"
};

/**
 * Life change category icons
 */
export const CHANGE_ICONS = {
  career: "\u{1F4BC}", // Briefcase
  health: "\u{1F3C3}", // Running
  finance: "\u{1F4B0}", // Money
  education: "\u{1F393}", // Graduation cap
  personal: "\u{2764}" // Heart
};

export { FEED_EVENTS, LIFE_CHANGES };
