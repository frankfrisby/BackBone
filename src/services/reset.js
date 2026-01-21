import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const MEMORY_DIR = path.join(process.cwd(), "memory");

/**
 * List of all persistent data files to reset
 */
const DATA_FILES = [
  "trading-status.json",
  "linkedin-profile.json",
  "linkedin.json",
  "portfolio-history.json",
  "user-settings.json",
  "weights.json"
];

const MEMORY_FILES = [
  "BACKBONE.md",
  "profile.md",
  "portfolio.md",
  "health.md",
  "tickers.md",
  "integrations.md"
];

/**
 * Get list of all data files that exist
 */
export const getDataFiles = () => {
  const files = [];

  // Check data directory
  DATA_FILES.forEach(file => {
    const filePath = path.join(DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      files.push({ name: file, path: filePath, dir: "data" });
    }
  });

  // Check memory directory
  MEMORY_FILES.forEach(file => {
    const filePath = path.join(MEMORY_DIR, file);
    if (fs.existsSync(filePath)) {
      files.push({ name: file, path: filePath, dir: "memory" });
    }
  });

  return files;
};

/**
 * Delete all persistent data files
 */
export const deleteAllData = () => {
  const results = {
    deleted: [],
    failed: [],
    notFound: []
  };

  // Delete data files
  DATA_FILES.forEach(file => {
    const filePath = path.join(DATA_DIR, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        results.deleted.push(file);
      } else {
        results.notFound.push(file);
      }
    } catch (error) {
      results.failed.push({ file, error: error.message });
    }
  });

  // Delete memory files
  MEMORY_FILES.forEach(file => {
    const filePath = path.join(MEMORY_DIR, file);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        results.deleted.push(file);
      } else {
        results.notFound.push(file);
      }
    } catch (error) {
      results.failed.push({ file, error: error.message });
    }
  });

  // Also delete screenshots folder contents
  const screenshotsDir = path.join(process.cwd(), "screenshots");
  if (fs.existsSync(screenshotsDir)) {
    try {
      const screenshots = fs.readdirSync(screenshotsDir);
      screenshots.forEach(file => {
        const filePath = path.join(screenshotsDir, file);
        fs.unlinkSync(filePath);
        results.deleted.push(`screenshots/${file}`);
      });
    } catch (error) {
      results.failed.push({ file: "screenshots/*", error: error.message });
    }
  }

  return results;
};

/**
 * Get summary of what will be deleted
 */
export const getResetSummary = () => {
  const files = getDataFiles();
  const dataCount = files.filter(f => f.dir === "data").length;
  const memoryCount = files.filter(f => f.dir === "memory").length;

  return {
    totalFiles: files.length,
    dataFiles: dataCount,
    memoryFiles: memoryCount,
    files: files.map(f => f.name)
  };
};

/**
 * Reset confirmation steps
 */
export const RESET_STEPS = {
  INITIAL: "initial",
  CONFIRM_INTENT: "confirm_intent",
  CONFIRM_DELETE: "confirm_delete",
  COMPLETED: "completed",
  CANCELLED: "cancelled"
};

/**
 * Reset flow state management
 */
export const createResetFlow = () => {
  return {
    step: RESET_STEPS.INITIAL,
    selectedOption: null
  };
};
