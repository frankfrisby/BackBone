/**
 * WhatsApp Image Handler
 *
 * Downloads images from Twilio, saves locally to screenshots/,
 * and uploads to Firebase Storage for cross-device access.
 *
 * Flow:
 *   1. Twilio delivers image via media URL (requires Basic auth)
 *   2. Download image buffer
 *   3. Save to local screenshots/ dir
 *   4. Upload to Firebase Storage at backbone/whatsapp-images/{uid}/{filename}
 */

import fs from "fs";
import path from "path";
import { getScreenshotsDir, getActiveUserId } from "../paths.js";

// Extension map from MIME type
const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

/**
 * Download an image from Twilio's media URL using Basic auth.
 *
 * @param {string} mediaUrl - Twilio media URL
 * @param {{ accountSid: string, authToken: string }} twilioConfig
 * @returns {Promise<{ buffer: Buffer, contentType: string, ext: string }>}
 */
export async function downloadTwilioImage(mediaUrl, twilioConfig) {
  const auth = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString("base64");

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Twilio media download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const ext = MIME_TO_EXT[contentType] || "jpg";
  const buffer = Buffer.from(await response.arrayBuffer());

  return { buffer, contentType, ext };
}

/**
 * Save a WhatsApp image to the local screenshots directory.
 *
 * @param {Buffer} buffer - Image data
 * @param {string} ext - File extension (jpg, png, etc.)
 * @param {string} [description] - Optional description for filename
 * @returns {string} - Full path to saved file
 */
export function saveWhatsAppImage(buffer, ext, description = "") {
  const screenshotsDir = getScreenshotsDir();
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const ts = Date.now();
  const desc = description
    ? `-${description.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 30)}`
    : "";
  const filename = `whatsapp-${date}${desc}-${ts}.${ext}`;
  const filePath = path.join(screenshotsDir, filename);

  fs.writeFileSync(filePath, buffer);
  console.log(`[WhatsAppImage] Saved to ${filePath} (${(buffer.length / 1024).toFixed(1)} KB)`);

  return filePath;
}

/**
 * Upload a local image to Firebase Storage.
 *
 * @param {string} localPath - Path to the local file
 * @param {string} [uid] - User ID (defaults to active user)
 * @returns {Promise<{ downloadUrl: string } | null>}
 */
export async function uploadWhatsAppImage(localPath, uid) {
  try {
    const { uploadFile } = await import("../firebase/firebase-storage.js");
    const userId = uid || getActiveUserId();
    const filename = path.basename(localPath);
    const remotePath = `backbone/whatsapp-images/${userId}/${filename}`;

    const result = await uploadFile(localPath, remotePath);
    console.log(`[WhatsAppImage] Uploaded to Firebase Storage: ${remotePath}`);
    return result;
  } catch (err) {
    console.error("[WhatsAppImage] Firebase upload failed:", err.message);
    return null;
  }
}

/**
 * Full pipeline: download from Twilio → save locally → upload to Firebase.
 *
 * @param {{ mediaUrl: string, contentType?: string }} mediaInfo
 * @param {{ accountSid: string, authToken: string }} twilioConfig
 * @param {string} [uid] - User ID
 * @returns {Promise<{ localPath: string, firebaseUrl?: string, buffer: Buffer, ext: string }>}
 */
export async function processWhatsAppImage(mediaInfo, twilioConfig, uid) {
  // Download
  const { buffer, contentType, ext } = await downloadTwilioImage(
    mediaInfo.mediaUrl,
    twilioConfig
  );

  // Save locally
  const localPath = saveWhatsAppImage(buffer, ext, mediaInfo.description || "");

  // Upload to Firebase (non-blocking — don't fail the pipeline if upload fails)
  let firebaseUrl = null;
  try {
    const result = await uploadWhatsAppImage(localPath, uid);
    firebaseUrl = result?.downloadUrl || null;
  } catch {
    // Upload is best-effort
  }

  return { localPath, firebaseUrl, buffer, ext, contentType };
}

/**
 * Describe an image using OpenAI vision API (gpt-5-mini).
 * Quick preprocessing so the main AI prompt has text context about the image.
 *
 * @param {Buffer} buffer - Image data
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - Short description of the image
 */
export async function describeImageWithVision(buffer, contentType = "image/jpeg") {
  try {
    const dataDir = path.dirname(getScreenshotsDir());
    const configPath = path.join(dataDir, "openai-config.json");

    // Try OpenAI config from multiple locations
    let apiKey = null;
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      apiKey = config.apiKey;
    }

    // Try data dir root
    if (!apiKey) {
      const altPath = path.join(path.dirname(getScreenshotsDir()), "..", "data", "openai-config.json");
      try { if (fs.existsSync(altPath)) apiKey = JSON.parse(fs.readFileSync(altPath, "utf-8")).apiKey; } catch {}
    }

    // Try environment
    if (!apiKey) apiKey = process.env.OPENAI_API_KEY;

    // Try fetching from Firestore config (same source as cloud function)
    if (!apiKey) {
      try {
        const resp = await fetch("https://firestore.googleapis.com/v1/projects/backboneai/databases/(default)/documents/config/config_openai?key=AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0");
        if (resp.ok) {
          const doc = await resp.json();
          apiKey = doc.fields?.apiKey?.stringValue;
          // Cache it locally for next time
          if (apiKey) {
            try { fs.writeFileSync(configPath, JSON.stringify({ apiKey }, null, 2)); } catch {}
          }
        }
      } catch {}
    }

    if (!apiKey) return "";

    const base64 = buffer.toString("base64");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Describe this image in 1-2 sentences. Be specific about what you see — people, objects, text, location, context." },
            { type: "image_url", image_url: { url: `data:${contentType};base64,${base64}` } },
          ],
        }],
        max_tokens: 200,
      }),
    });

    if (!response.ok) return "";

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim() || "";
    console.log(`[WhatsAppImage] Vision description: ${description.slice(0, 100)}`);
    return description;
  } catch (err) {
    console.error("[WhatsAppImage] Vision describe failed:", err.message);
    return "";
  }
}

export default { downloadTwilioImage, saveWhatsAppImage, uploadWhatsAppImage, processWhatsAppImage, describeImageWithVision };
