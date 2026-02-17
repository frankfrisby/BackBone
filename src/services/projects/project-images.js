/**
 * Project Image Management
 *
 * Ensures every project has an `images/` folder. Provides utilities for:
 * - Saving images with descriptive names (e.g., "market-analysis-2026-02-11.png")
 * - Uploading images to Firebase Storage for public URLs
 * - Listing available images for WhatsApp delivery
 *
 * Naming convention: <descriptive-slug>-<YYYY-MM-DD>.<ext>
 * Firebase path:     users/<uid>/projects/<project-id>/images/<filename>
 */

import fs from "fs";
import path from "path";
import { getProjectsDir } from "../paths.js";

const PROJECTS_DIR = getProjectsDir();

/**
 * Ensure a project has an images/ directory
 * @param {string} projectId - Project folder name
 * @returns {string} Absolute path to images directory
 */
export function ensureImagesDir(projectId) {
  const imagesDir = path.join(PROJECTS_DIR, projectId, "images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  return imagesDir;
}

/**
 * Ensure ALL existing projects have an images/ directory
 * @returns {{ created: string[], existing: string[] }}
 */
export function ensureAllProjectImageDirs() {
  const created = [];
  const existing = [];

  if (!fs.existsSync(PROJECTS_DIR)) return { created, existing };

  const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const imagesDir = path.join(PROJECTS_DIR, dir, "images");
    if (fs.existsSync(imagesDir)) {
      existing.push(dir);
    } else {
      fs.mkdirSync(imagesDir, { recursive: true });
      created.push(dir);
    }
  }

  return { created, existing };
}

/**
 * Build a descriptive filename for a project image
 * @param {string} description - What the image is (e.g., "market analysis", "competitor comparison")
 * @param {string} [ext="png"] - File extension
 * @returns {string} Filename like "market-analysis-2026-02-11.png"
 */
export function buildImageFilename(description, ext = "png") {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `${slug}-${date}.${ext}`;
}

/**
 * Save an image buffer to a project's images/ folder
 * @param {string} projectId - Project folder name
 * @param {Buffer} buffer - Image data
 * @param {string} description - What the image shows (used for filename)
 * @param {string} [ext="png"] - File extension
 * @returns {{ localPath: string, filename: string }}
 */
export function saveProjectImage(projectId, buffer, description, ext = "png") {
  const imagesDir = ensureImagesDir(projectId);
  const filename = buildImageFilename(description, ext);
  const localPath = path.join(imagesDir, filename);

  fs.writeFileSync(localPath, buffer);
  console.log(`[ProjectImages] Saved: ${projectId}/images/${filename}`);

  return { localPath, filename };
}

/**
 * Upload a project image to Firebase Storage and return the public URL.
 * @param {string} projectId - Project folder name
 * @param {string} filename - Image filename within images/
 * @returns {Promise<{ url: string, remotePath: string }>}
 */
export async function uploadProjectImage(projectId, filename) {
  const { uploadFile, getDownloadUrl, getBucket } = await import("../firebase/firebase-storage.js");
  const localPath = path.join(PROJECTS_DIR, projectId, "images", filename);

  if (!fs.existsSync(localPath)) {
    throw new Error(`Image not found: ${localPath}`);
  }

  const remotePath = `projects/${projectId}/images/${filename}`;
  await uploadFile(localPath, remotePath);

  const bucket = getBucket();
  const url = getDownloadUrl(bucket, remotePath);

  console.log(`[ProjectImages] Uploaded: ${remotePath}`);
  return { url, remotePath };
}

/**
 * Save an image to a project AND upload to Firebase Storage.
 * Returns the public URL for use in WhatsApp messages.
 * @param {string} projectId - Project folder name
 * @param {Buffer} buffer - Image data
 * @param {string} description - What the image shows
 * @param {string} [ext="png"] - File extension
 * @returns {Promise<{ localPath: string, filename: string, url: string }>}
 */
export async function saveAndUploadImage(projectId, buffer, description, ext = "png") {
  const { localPath, filename } = saveProjectImage(projectId, buffer, description, ext);

  try {
    const { url } = await uploadProjectImage(projectId, filename);
    return { localPath, filename, url };
  } catch (err) {
    console.warn(`[ProjectImages] Upload failed (saved locally): ${err.message}`);
    return { localPath, filename, url: null };
  }
}

/**
 * List all images in a project
 * @param {string} projectId - Project folder name
 * @returns {{ filename: string, localPath: string, size: number, modified: string }[]}
 */
export function listProjectImages(projectId) {
  const imagesDir = path.join(PROJECTS_DIR, projectId, "images");
  if (!fs.existsSync(imagesDir)) return [];

  const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

  return fs.readdirSync(imagesDir)
    .filter(f => imageExts.has(path.extname(f).toLowerCase()))
    .map(f => {
      const fp = path.join(imagesDir, f);
      const stat = fs.statSync(fp);
      return {
        filename: f,
        localPath: fp,
        size: stat.size,
        modified: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified)); // newest first
}

/**
 * Get the most recent image from a project (for quick WhatsApp sends)
 * @param {string} projectId - Project folder name
 * @returns {{ filename: string, localPath: string } | null}
 */
export function getMostRecentImage(projectId) {
  const images = listProjectImages(projectId);
  return images.length > 0 ? images[0] : null;
}

/**
 * Upload all un-uploaded images from a project to Firebase Storage.
 * Returns array of { filename, url } for each uploaded image.
 * @param {string} projectId - Project folder name
 * @returns {Promise<{ filename: string, url: string }[]>}
 */
export async function uploadAllProjectImages(projectId) {
  const images = listProjectImages(projectId);
  const results = [];

  for (const img of images) {
    try {
      const { url } = await uploadProjectImage(projectId, img.filename);
      results.push({ filename: img.filename, url });
    } catch (err) {
      console.warn(`[ProjectImages] Failed to upload ${img.filename}: ${err.message}`);
    }
  }

  return results;
}

export default {
  ensureImagesDir,
  ensureAllProjectImageDirs,
  buildImageFilename,
  saveProjectImage,
  uploadProjectImage,
  saveAndUploadImage,
  listProjectImages,
  getMostRecentImage,
  uploadAllProjectImages
};
