/**
 * Learning Tracker Service
 *
 * Track books, courses, skills, and learning progress.
 * Inspired by Warren Buffett's reading habits and continuous learning principles.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const LEARNING_PATH = path.join(DATA_DIR, "learning.json");
const MEMORY_DIR = path.join(process.cwd(), "memory");

// Learning types
const LEARNING_TYPES = {
  book: { icon: "#", label: "Book" },
  course: { icon: "*", label: "Course" },
  article: { icon: ">", label: "Article" },
  podcast: { icon: "~", label: "Podcast" },
  video: { icon: "^", label: "Video" },
  skill: { icon: "@", label: "Skill" }
};

// Categories
const LEARNING_CATEGORIES = {
  business: { icon: "$", label: "Business" },
  technology: { icon: ">", label: "Technology" },
  finance: { icon: "$", label: "Finance" },
  health: { icon: "+", label: "Health" },
  psychology: { icon: "*", label: "Psychology" },
  leadership: { icon: "^", label: "Leadership" },
  productivity: { icon: "~", label: "Productivity" },
  creativity: { icon: "@", label: "Creativity" },
  other: { icon: "-", label: "Other" }
};

/**
 * Ensure data directory exists
 */
const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

/**
 * Load learning data
 */
export const loadLearningData = () => {
  ensureDir();
  try {
    if (fs.existsSync(LEARNING_PATH)) {
      return JSON.parse(fs.readFileSync(LEARNING_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[Learning] Error loading:", err.message);
  }
  return {
    items: [],
    currentlyReading: null,
    readingList: [],
    stats: {
      booksCompleted: 0,
      coursesCompleted: 0,
      totalItems: 0,
      yearlyGoal: 12, // Books per year
      yearlyProgress: 0
    },
    notes: [],
    highlights: []
  };
};

/**
 * Save learning data
 */
export const saveLearningData = (data) => {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(LEARNING_PATH, JSON.stringify(data, null, 2));
  return { success: true };
};

/**
 * Add a learning item
 */
export const addLearningItem = (title, options = {}) => {
  const data = loadLearningData();

  const item = {
    id: `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    type: options.type || "book",
    category: options.category || "other",
    author: options.author || null,
    totalPages: options.pages || options.totalChapters || 0,
    currentPage: 0,
    progress: 0,
    status: "not_started", // not_started, in_progress, completed, paused
    startDate: null,
    endDate: null,
    rating: null,
    notes: [],
    keyTakeaways: [],
    createdAt: new Date().toISOString()
  };

  data.items.push(item);
  data.stats.totalItems++;
  saveLearningData(data);

  return { success: true, item };
};

/**
 * Start reading/learning an item
 */
export const startLearning = (itemId) => {
  const data = loadLearningData();
  const item = data.items.find(i => i.id === itemId);

  if (!item) {
    return { success: false, error: "Item not found" };
  }

  item.status = "in_progress";
  item.startDate = new Date().toISOString();
  data.currentlyReading = itemId;
  saveLearningData(data);

  return { success: true, item };
};

/**
 * Update progress
 */
export const updateProgress = (itemId, progress, options = {}) => {
  const data = loadLearningData();
  const item = data.items.find(i => i.id === itemId);

  if (!item) {
    return { success: false, error: "Item not found" };
  }

  // Progress can be page number or percentage
  if (options.page) {
    item.currentPage = options.page;
    if (item.totalPages > 0) {
      item.progress = Math.round((options.page / item.totalPages) * 100);
    }
  } else {
    item.progress = Math.min(100, Math.max(0, progress));
    if (item.totalPages > 0) {
      item.currentPage = Math.round((progress / 100) * item.totalPages);
    }
  }

  if (item.status === "not_started") {
    item.status = "in_progress";
    item.startDate = new Date().toISOString();
    data.currentlyReading = itemId;
  }

  // Check if completed
  if (item.progress >= 100) {
    item.status = "completed";
    item.endDate = new Date().toISOString();
    item.progress = 100;

    // Update stats
    if (item.type === "book") {
      data.stats.booksCompleted++;
      data.stats.yearlyProgress++;
    } else if (item.type === "course") {
      data.stats.coursesCompleted++;
    }

    if (data.currentlyReading === itemId) {
      data.currentlyReading = null;
    }
  }

  item.updatedAt = new Date().toISOString();
  saveLearningData(data);

  return { success: true, item };
};

/**
 * Complete an item
 */
export const completeLearning = (itemId, rating = null) => {
  const data = loadLearningData();
  const item = data.items.find(i => i.id === itemId);

  if (!item) {
    return { success: false, error: "Item not found" };
  }

  item.status = "completed";
  item.progress = 100;
  item.endDate = new Date().toISOString();
  if (rating) {
    item.rating = Math.min(5, Math.max(1, rating));
  }

  // Update stats
  if (item.type === "book") {
    data.stats.booksCompleted++;
    data.stats.yearlyProgress++;
  } else if (item.type === "course") {
    data.stats.coursesCompleted++;
  }

  if (data.currentlyReading === itemId) {
    data.currentlyReading = null;
  }

  saveLearningData(data);

  return { success: true, item };
};

/**
 * Add a note or highlight
 */
export const addNote = (itemId, note, isHighlight = false) => {
  const data = loadLearningData();
  const item = data.items.find(i => i.id === itemId);

  if (!item) {
    return { success: false, error: "Item not found" };
  }

  const noteObj = {
    id: `note-${Date.now()}`,
    text: note,
    timestamp: new Date().toISOString(),
    page: item.currentPage
  };

  if (isHighlight) {
    data.highlights.push({ ...noteObj, itemId, itemTitle: item.title });
    item.keyTakeaways = item.keyTakeaways || [];
    item.keyTakeaways.push(note);
  } else {
    item.notes.push(noteObj);
    data.notes.push({ ...noteObj, itemId, itemTitle: item.title });
  }

  saveLearningData(data);

  return { success: true, note: noteObj };
};

/**
 * Get currently reading
 */
export const getCurrentlyReading = () => {
  const data = loadLearningData();

  if (!data.currentlyReading) {
    return null;
  }

  return data.items.find(i => i.id === data.currentlyReading);
};

/**
 * Get reading list (not started items)
 */
export const getReadingList = () => {
  const data = loadLearningData();
  return data.items.filter(i => i.status === "not_started");
};

/**
 * Get in-progress items
 */
export const getInProgress = () => {
  const data = loadLearningData();
  return data.items.filter(i => i.status === "in_progress");
};

/**
 * Get completed items
 */
export const getCompleted = (limit = 10) => {
  const data = loadLearningData();
  return data.items
    .filter(i => i.status === "completed")
    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))
    .slice(0, limit);
};

/**
 * Get learning stats
 */
export const getLearningStats = () => {
  const data = loadLearningData();
  const now = new Date();
  const currentYear = now.getFullYear();

  // Calculate this year's progress
  const thisYearCompleted = data.items.filter(i => {
    if (i.status !== "completed" || !i.endDate) return false;
    return new Date(i.endDate).getFullYear() === currentYear && i.type === "book";
  }).length;

  // Calculate reading streak
  const completedItems = data.items
    .filter(i => i.status === "completed" && i.endDate)
    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate));

  // Stats by category
  const byCategory = {};
  for (const item of data.items) {
    const cat = item.category || "other";
    if (!byCategory[cat]) {
      byCategory[cat] = { total: 0, completed: 0 };
    }
    byCategory[cat].total++;
    if (item.status === "completed") {
      byCategory[cat].completed++;
    }
  }

  // Stats by type
  const byType = {};
  for (const item of data.items) {
    const type = item.type || "book";
    if (!byType[type]) {
      byType[type] = { total: 0, completed: 0 };
    }
    byType[type].total++;
    if (item.status === "completed") {
      byType[type].completed++;
    }
  }

  return {
    total: data.items.length,
    inProgress: data.items.filter(i => i.status === "in_progress").length,
    completed: data.items.filter(i => i.status === "completed").length,
    readingList: data.items.filter(i => i.status === "not_started").length,
    booksCompleted: data.stats.booksCompleted,
    coursesCompleted: data.stats.coursesCompleted,
    yearlyGoal: data.stats.yearlyGoal,
    yearlyProgress: thisYearCompleted,
    yearlyProgressPercent: Math.round((thisYearCompleted / data.stats.yearlyGoal) * 100),
    byCategory,
    byType,
    totalNotes: data.notes.length,
    totalHighlights: data.highlights.length
  };
};

/**
 * Add to reading list
 */
export const addToReadingList = (title, options = {}) => {
  const result = addLearningItem(title, options);
  return result;
};

/**
 * Set yearly goal
 */
export const setYearlyGoal = (goal) => {
  const data = loadLearningData();
  data.stats.yearlyGoal = Math.max(1, goal);
  saveLearningData(data);
  return { success: true, goal: data.stats.yearlyGoal };
};

/**
 * Get recent highlights
 */
export const getRecentHighlights = (limit = 5) => {
  const data = loadLearningData();
  return data.highlights
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
};

/**
 * Format learning display for CLI
 */
export const formatLearningDisplay = () => {
  const stats = getLearningStats();
  const current = getCurrentlyReading();
  const inProgress = getInProgress();
  const readingList = getReadingList();

  let output = "\n";
  output += "            LEARNING TRACKER\n";
  output += "                                                           \n\n";

  // Yearly progress
  const yearlyBar = "█".repeat(Math.floor(stats.yearlyProgressPercent / 10)) +
                    "░".repeat(10 - Math.floor(stats.yearlyProgressPercent / 10));
  output += `YEARLY GOAL: [${yearlyBar}] ${stats.yearlyProgress}/${stats.yearlyGoal} books (${stats.yearlyProgressPercent}%)\n\n`;

  // Currently reading
  if (current) {
    const progressBar = "█".repeat(Math.floor(current.progress / 10)) +
                        "░".repeat(10 - Math.floor(current.progress / 10));
    output += "CURRENTLY READING:\n";
    output += `  ${LEARNING_TYPES[current.type]?.icon || "#"} ${current.title}\n`;
    output += `  [${progressBar}] ${current.progress}%`;
    if (current.currentPage && current.totalPages) {
      output += ` (p.${current.currentPage}/${current.totalPages})`;
    }
    output += "\n";
    if (current.author) {
      output += `  by ${current.author}\n`;
    }
    output += "\n";
  } else {
    output += "No book currently being read.\n\n";
  }

  // In Progress
  if (inProgress.length > 0) {
    output += `IN PROGRESS (${inProgress.length}):\n`;
    inProgress.slice(0, 3).forEach(item => {
      const icon = LEARNING_TYPES[item.type]?.icon || "#";
      output += `  ${icon} ${item.title.slice(0, 40)} - ${item.progress}%\n`;
    });
    output += "\n";
  }

  // Reading list
  if (readingList.length > 0) {
    output += `READING LIST (${readingList.length}):\n`;
    readingList.slice(0, 5).forEach((item, i) => {
      const icon = LEARNING_TYPES[item.type]?.icon || "#";
      output += `  ${i + 1}. ${icon} ${item.title.slice(0, 40)}\n`;
    });
    output += "\n";
  }

  // Stats
  output += "STATS:\n";
  output += `  Total: ${stats.total} | Completed: ${stats.completed} | In Progress: ${stats.inProgress}\n`;
  output += `  Books: ${stats.booksCompleted} | Courses: ${stats.coursesCompleted}\n`;
  output += `  Notes: ${stats.totalNotes} | Highlights: ${stats.totalHighlights}\n\n`;

  // Commands
  output += "Commands:\n";
  output += "  /learn add <title> - Add book/course\n";
  output += "  /learn start <#> - Start reading\n";
  output += "  /learn progress <#> <percent> - Update progress\n";
  output += "  /learn done [rating] - Mark complete\n";
  output += "  /learn note <text> - Add a note\n";

  return output;
};

/**
 * Get quick learning status
 */
export const getQuickLearningStatus = () => {
  const current = getCurrentlyReading();
  const stats = getLearningStats();

  return {
    currentBook: current ? current.title : null,
    progress: current ? current.progress : 0,
    yearlyProgress: `${stats.yearlyProgress}/${stats.yearlyGoal}`
  };
};

export default {
  LEARNING_TYPES,
  LEARNING_CATEGORIES,
  loadLearningData,
  addLearningItem,
  startLearning,
  updateProgress,
  completeLearning,
  addNote,
  getCurrentlyReading,
  getReadingList,
  getInProgress,
  getCompleted,
  getLearningStats,
  addToReadingList,
  setYearlyGoal,
  getRecentHighlights,
  formatLearningDisplay,
  getQuickLearningStatus
};
