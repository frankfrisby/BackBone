/**
 * LinkedIn Historical Tracker
 *
 * Captures snapshots of LinkedIn profile data over time,
 * tracks posts (original vs reposts), and stores historical diffs.
 */

import fs from "fs";
import path from "path";

import { getDataDir } from "../paths.js";
const DATA_DIR = getDataDir();
const HISTORY_DIR = path.join(DATA_DIR, "linkedin-history");
const INDEX_PATH = path.join(HISTORY_DIR, "index.json");
const POSTS_PATH = path.join(HISTORY_DIR, "posts.json");
const PROFILE_PATH = path.join(DATA_DIR, "linkedin-profile.json");

const ensureDir = () => {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
};

const loadJSON = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return null;
};

const saveJSON = (filePath, data) => {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

/**
 * Capture a snapshot of the current LinkedIn profile
 */
export const captureSnapshot = () => {
  ensureDir();

  const profile = loadJSON(PROFILE_PATH);
  if (!profile) {
    return { success: false, error: "No LinkedIn profile data found" };
  }

  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const snapshotPath = path.join(HISTORY_DIR, `snapshot-${date}.json`);

  // Save timestamped snapshot
  const snapshot = {
    date,
    capturedAt: new Date().toISOString(),
    profile: profile.profile || profile,
    profileUrl: profile.profileUrl || null
  };
  saveJSON(snapshotPath, snapshot);

  // Load index and get previous snapshot for diff
  const index = loadJSON(INDEX_PATH) || { snapshots: [] };
  const previousEntry = index.snapshots[index.snapshots.length - 1];
  let changes = [];

  if (previousEntry) {
    const prevSnapshot = loadJSON(path.join(HISTORY_DIR, `snapshot-${previousEntry.date}.json`));
    if (prevSnapshot) {
      changes = diffSnapshots(prevSnapshot.profile, snapshot.profile);
    }
  }

  // Update index - avoid duplicate dates
  const existingIdx = index.snapshots.findIndex(s => s.date === date);
  const entry = {
    date,
    capturedAt: snapshot.capturedAt,
    changes: changes.length > 0 ? changes : [],
    changeCount: changes.length
  };

  if (existingIdx >= 0) {
    index.snapshots[existingIdx] = entry;
  } else {
    index.snapshots.push(entry);
  }

  saveJSON(INDEX_PATH, index);

  return {
    success: true,
    date,
    changes,
    snapshotPath,
    isFirst: !previousEntry
  };
};

/**
 * Diff two profile snapshots and return list of changes
 */
export const diffSnapshots = (oldProfile, newProfile) => {
  if (!oldProfile || !newProfile) return [];

  const changes = [];
  const fieldsToTrack = [
    "name", "headline", "location", "about", "currentRole", "currentTitle",
    "currentCompany", "connections", "followers", "isStudent"
  ];

  for (const field of fieldsToTrack) {
    const oldVal = oldProfile[field];
    const newVal = newProfile[field];
    if (oldVal !== newVal && (oldVal || newVal)) {
      changes.push({
        field,
        from: oldVal ?? null,
        to: newVal ?? null
      });
    }
  }

  // Track experience changes
  const oldExp = JSON.stringify(oldProfile.experience || []);
  const newExp = JSON.stringify(newProfile.experience || []);
  if (oldExp !== newExp) {
    changes.push({
      field: "experience",
      from: `${(oldProfile.experience || []).length} entries`,
      to: `${(newProfile.experience || []).length} entries`
    });
  }

  // Track education changes
  const oldEdu = JSON.stringify(oldProfile.education || []);
  const newEdu = JSON.stringify(newProfile.education || []);
  if (oldEdu !== newEdu) {
    changes.push({
      field: "education",
      from: `${(oldProfile.education || []).length} entries`,
      to: `${(newProfile.education || []).length} entries`
    });
  }

  // Track skills changes
  const oldSkills = JSON.stringify(oldProfile.skills || []);
  const newSkills = JSON.stringify(newProfile.skills || []);
  if (oldSkills !== newSkills) {
    changes.push({
      field: "skills",
      from: `${(oldProfile.skills || []).length} skills`,
      to: `${(newProfile.skills || []).length} skills`
    });
  }

  return changes;
};

/**
 * Track LinkedIn posts, categorized as original or repost
 */
export const trackPosts = (posts) => {
  ensureDir();

  const existing = loadJSON(POSTS_PATH) || { posts: [], lastUpdated: null };

  // Deduplicate by URL or content+date
  const existingKeys = new Set(
    existing.posts.map(p => p.url || `${p.content?.slice(0, 50)}_${p.date}`)
  );

  const newPosts = posts.filter(p => {
    const key = p.url || `${p.content?.slice(0, 50)}_${p.date}`;
    return !existingKeys.has(key);
  });

  existing.posts.push(...newPosts);
  existing.lastUpdated = new Date().toISOString();

  saveJSON(POSTS_PATH, existing);

  return {
    success: true,
    added: newPosts.length,
    total: existing.posts.length
  };
};

/**
 * Get all historical snapshots with diffs
 */
export const getHistory = () => {
  const index = loadJSON(INDEX_PATH);
  if (!index || !index.snapshots || index.snapshots.length === 0) {
    return { success: false, snapshots: [], message: "No snapshots captured yet" };
  }

  return {
    success: true,
    snapshots: index.snapshots,
    totalSnapshots: index.snapshots.length,
    firstCapture: index.snapshots[0].date,
    lastCapture: index.snapshots[index.snapshots.length - 1].date
  };
};

/**
 * Get all tracked posts
 */
export const getPostsHistory = () => {
  const data = loadJSON(POSTS_PATH);
  if (!data || !data.posts || data.posts.length === 0) {
    return { success: false, posts: [], message: "No posts tracked yet" };
  }

  const originals = data.posts.filter(p => p.type === "original").length;
  const reposts = data.posts.filter(p => p.type === "repost").length;

  return {
    success: true,
    posts: data.posts,
    total: data.posts.length,
    originals,
    reposts,
    lastUpdated: data.lastUpdated
  };
};

/**
 * Load a specific snapshot by date
 */
export const loadSnapshot = (date) => {
  const snapshotPath = path.join(HISTORY_DIR, `snapshot-${date}.json`);
  return loadJSON(snapshotPath);
};
