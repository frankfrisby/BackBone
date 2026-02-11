/**
 * Tool: Video Analyzer
 *
 * Analyzes YouTube videos by extracting transcripts, frames, and metadata.
 * Uses AI vision to describe what's happening in each frame.
 *
 * Pipeline:
 *   1. Fetch video metadata (title, description, duration) via yt-dlp
 *   2. Fetch transcript/captions via youtube-transcript
 *   3. Download video via yt-dlp
 *   4. Extract key frames via ffmpeg
 *   5. Analyze frames via Claude Vision API (or OpenAI GPT-4V)
 *   6. Return combined analysis
 *
 * Dependencies: yt-dlp (system), fluent-ffmpeg, @ffmpeg-installer/ffmpeg,
 *               youtube-transcript, @anthropic-ai/sdk (optional), openai (optional)
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync, exec } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKBONE_ROOT = path.resolve(__dirname, "..");

export const metadata = {
  id: "video-analyzer",
  name: "Video Analyzer",
  description: "Analyze YouTube videos — extract transcript, frames, and AI-powered visual analysis",
  category: "media"
};

// ─── Helpers ──────────────────────────────────────────────

function extractVideoId(input) {
  if (!input) return null;
  // Direct ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  // YouTube URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {}
}

// ─── Step 1: Video Metadata via yt-dlp ─────────────────

async function fetchMetadata(videoId) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const raw = execSync(
      `yt-dlp --dump-json --no-download "${url}"`,
      { encoding: "utf-8", timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    );
    const data = JSON.parse(raw);
    return {
      title: data.title || "",
      description: data.description || "",
      duration: data.duration || 0,
      uploadDate: data.upload_date || "",
      channel: data.channel || data.uploader || "",
      viewCount: data.view_count || 0,
      tags: data.tags || [],
      categories: data.categories || [],
      thumbnailUrl: data.thumbnail || ""
    };
  } catch (err) {
    return { error: `Metadata fetch failed: ${err.message}` };
  }
}

// ─── Step 2: Transcript via youtube-transcript ──────────

async function fetchTranscript(videoId) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    if (!items || items.length === 0) return { text: "", segments: [], error: "No transcript available" };

    const segments = items.map(item => ({
      time: item.offset / 1000, // seconds
      timestamp: formatTimestamp(item.offset / 1000),
      duration: item.duration / 1000,
      text: item.text
    }));

    const fullText = segments.map(s => s.text).join(" ");
    return { text: fullText, segments };
  } catch (err) {
    return { text: "", segments: [], error: `Transcript fetch failed: ${err.message}` };
  }
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Step 3: Download Video ─────────────────────────────

async function downloadVideo(videoId, outputDir) {
  const outputPath = path.join(outputDir, `${videoId}.mp4`);

  ensureDir(outputDir);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Method 1: yt-dlp with android client (avoids SABR/403 issues)
  try {
    execSync(
      `yt-dlp --extractor-args "youtube:player_client=android" -f "best[height<=480]" -o "${outputPath}" "${url}"`,
      { encoding: "utf-8", timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) return outputPath;
  } catch (err) {
    console.log(`[VideoAnalyzer] yt-dlp android client failed: ${err.message?.substring(0, 100)}`);
  }

  // Method 2: yt-dlp default
  try {
    execSync(
      `yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" --merge-output-format mp4 -o "${outputPath}" "${url}"`,
      { encoding: "utf-8", timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (fs.existsSync(outputPath)) return outputPath;
    const files = fs.readdirSync(outputDir).filter(f => f.startsWith(videoId));
    if (files.length > 0) return path.join(outputDir, files[0]);
  } catch {}

  return null;
}

// ─── Step 4: Extract Frames ─────────────────────────────

async function extractFrames(videoPath, outputDir, options = {}) {
  const { intervalSeconds = 5, maxFrames = 30 } = options;
  const framesDir = ensureDir(path.join(outputDir, "frames"));

  try {
    // Use ffmpeg-installer for the binary path
    let ffmpegPath;
    try {
      const installer = await import("@ffmpeg-installer/ffmpeg");
      ffmpegPath = installer.default?.path || installer.path;
    } catch {
      ffmpegPath = "ffmpeg"; // fallback to system ffmpeg
    }

    // Get duration first
    let duration;
    try {
      const ffprobeMod = await import("@ffprobe-installer/ffprobe");
      const ffprobePath = ffprobeMod.default?.path || ffprobeMod.path;
      const probeResult = execSync(
        `"${ffprobePath}" -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
        { encoding: "utf-8", timeout: 15000 }
      );
      duration = parseFloat(probeResult.trim());
    } catch {
      duration = 300; // default 5 min if probe fails
    }

    // Calculate frame timestamps
    const timestamps = [];
    for (let t = 0; t < duration && timestamps.length < maxFrames; t += intervalSeconds) {
      timestamps.push(t);
    }

    // Extract each frame
    const frames = [];
    for (const t of timestamps) {
      const framePath = path.join(framesDir, `frame_${String(t).padStart(6, "0")}.jpg`);
      try {
        execSync(
          `"${ffmpegPath}" -ss ${t} -i "${videoPath}" -vframes 1 -q:v 2 -y "${framePath}"`,
          { encoding: "utf-8", timeout: 15000, stdio: "pipe" }
        );
        if (fs.existsSync(framePath)) {
          frames.push({
            path: framePath,
            timestamp: t,
            timestampFormatted: formatTimestamp(t)
          });
        }
      } catch {}
    }

    return frames;
  } catch (err) {
    return [];
  }
}

// ─── Step 5: AI Vision Analysis ─────────────────────────

async function analyzeFramesWithVision(frames, context = {}) {
  // Try Anthropic first, then OpenAI
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    return analyzeWithClaude(frames, context, anthropicKey);
  } else if (openaiKey) {
    return analyzeWithOpenAI(frames, context, openaiKey);
  } else {
    return {
      provider: "none",
      note: "No API key found (ANTHROPIC_API_KEY or OPENAI_API_KEY). Frames extracted but not analyzed. Set an API key for AI vision analysis.",
      frameDescriptions: frames.map(f => ({
        timestamp: f.timestampFormatted,
        path: f.path,
        description: "[No AI analysis — API key needed]"
      }))
    };
  }
}

async function analyzeWithClaude(frames, context, apiKey) {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const descriptions = [];
    // Process in batches of 5 to avoid token limits
    const batchSize = 5;
    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);
      const content = [];

      content.push({
        type: "text",
        text: `Analyze these ${batch.length} video frames in detail. For each frame, describe: 1) What's visually shown (people, text, objects, scenes) 2) Any text visible on screen (read it exactly) 3) Any numbers, codes, symbols, or unusual details 4) Anything that seems "off" or intentionally placed.\n\nVideo context: ${context.title || "Unknown"}\n${context.description ? "Description: " + context.description.substring(0, 500) : ""}`
      });

      for (const frame of batch) {
        const imageData = fs.readFileSync(frame.path);
        const base64 = imageData.toString("base64");
        content.push({
          type: "text",
          text: `\n--- Frame at ${frame.timestampFormatted} ---`
        });
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: base64
          }
        });
      }

      try {
        const response = await client.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          messages: [{ role: "user", content }]
        });

        const text = response.content?.[0]?.text || "";
        descriptions.push({
          batchIndex: Math.floor(i / batchSize),
          framesAnalyzed: batch.map(f => f.timestampFormatted),
          analysis: text
        });
      } catch (err) {
        descriptions.push({
          batchIndex: Math.floor(i / batchSize),
          framesAnalyzed: batch.map(f => f.timestampFormatted),
          analysis: `[API error: ${err.message}]`
        });
      }
    }

    return { provider: "claude", descriptions };
  } catch (err) {
    return { provider: "claude", error: err.message, descriptions: [] };
  }
}

async function analyzeWithOpenAI(frames, context, apiKey) {
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    const descriptions = [];
    const batchSize = 5;

    for (let i = 0; i < frames.length; i += batchSize) {
      const batch = frames.slice(i, i + batchSize);
      const content = [];

      content.push({
        type: "text",
        text: `Analyze these ${batch.length} video frames in detail. For each frame, describe: 1) What's visually shown 2) Any text visible on screen (read it exactly) 3) Any numbers, codes, symbols 4) Anything unusual.\n\nVideo: ${context.title || "Unknown"}`
      });

      for (const frame of batch) {
        const imageData = fs.readFileSync(frame.path);
        const base64 = imageData.toString("base64");
        content.push({
          type: "text",
          text: `\n--- Frame at ${frame.timestampFormatted} ---`
        });
        content.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${base64}`, detail: "high" }
        });
      }

      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 4096,
          messages: [{ role: "user", content }]
        });

        descriptions.push({
          batchIndex: Math.floor(i / batchSize),
          framesAnalyzed: batch.map(f => f.timestampFormatted),
          analysis: response.choices?.[0]?.message?.content || ""
        });
      } catch (err) {
        descriptions.push({
          batchIndex: Math.floor(i / batchSize),
          framesAnalyzed: batch.map(f => f.timestampFormatted),
          analysis: `[API error: ${err.message}]`
        });
      }
    }

    return { provider: "openai", descriptions };
  } catch (err) {
    return { provider: "openai", error: err.message, descriptions: [] };
  }
}

// ─── Main Execute Function ──────────────────────────────

/**
 * Execute the video analyzer
 * @param {Object} inputs - { url, intervalSeconds, maxFrames, keepFiles, framesOnly, transcriptOnly }
 * @returns {Promise<Object>} Analysis result
 */
export async function execute(inputs) {
  const { url, intervalSeconds = 5, maxFrames = 30, keepFiles = false, framesOnly = false, transcriptOnly = false } = inputs;

  if (!url) {
    return { success: false, error: "URL or video ID is required" };
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return { success: false, error: `Could not extract video ID from: ${url}` };
  }

  const workDir = ensureDir(path.join(os.tmpdir(), `video-analyzer-${videoId}-${Date.now()}`));
  const result = {
    success: true,
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    analyzedAt: new Date().toISOString()
  };

  try {
    // Step 1: Metadata
    console.log(`[VideoAnalyzer] Fetching metadata for ${videoId}...`);
    result.metadata = await fetchMetadata(videoId);

    // Step 2: Transcript
    if (!framesOnly) {
      console.log(`[VideoAnalyzer] Fetching transcript...`);
      result.transcript = await fetchTranscript(videoId);
    }

    // Step 3-5: Video download, frame extraction, vision analysis
    if (!transcriptOnly) {
      console.log(`[VideoAnalyzer] Downloading video...`);
      const videoPath = await downloadVideo(videoId, workDir);

      if (videoPath) {
        console.log(`[VideoAnalyzer] Extracting frames every ${intervalSeconds}s (max ${maxFrames})...`);
        const frames = await extractFrames(videoPath, workDir, { intervalSeconds, maxFrames });
        result.framesExtracted = frames.length;

        if (frames.length > 0) {
          console.log(`[VideoAnalyzer] Analyzing ${frames.length} frames with AI vision...`);
          result.visionAnalysis = await analyzeFramesWithVision(frames, result.metadata || {});

          // Save frame paths if keeping files
          if (keepFiles) {
            const persistDir = ensureDir(path.join(BACKBONE_ROOT, "data", "video-analysis", videoId));
            // Copy frames
            const savedFrames = [];
            for (const frame of frames) {
              const destPath = path.join(persistDir, path.basename(frame.path));
              fs.copyFileSync(frame.path, destPath);
              savedFrames.push({ timestamp: frame.timestampFormatted, path: destPath });
            }
            result.savedFrames = savedFrames;
            result.outputDir = persistDir;

            // Save analysis JSON
            fs.writeFileSync(
              path.join(persistDir, "analysis.json"),
              JSON.stringify(result, null, 2)
            );
          }
        } else {
          result.framesNote = "No frames extracted — ffmpeg may not be available";
        }
      } else {
        result.downloadNote = "Video download failed — yt-dlp may need updating or video may be unavailable";
      }
    }

    return result;
  } catch (err) {
    return { success: false, error: err.message, videoId };
  } finally {
    // Cleanup temp files
    if (!keepFiles) {
      cleanupDir(workDir);
    }
  }
}

export default { metadata, execute };
