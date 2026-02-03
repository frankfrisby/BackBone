import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const DATA_DIR = path.join(process.cwd(), "data");
const YOUTUBE_DIR = path.join(DATA_DIR, "youtube-research");
const COOKIES_PATH = path.join(DATA_DIR, "youtube-cookies.txt");

// Ensure directory exists
if (!fs.existsSync(YOUTUBE_DIR)) fs.mkdirSync(YOUTUBE_DIR, { recursive: true });

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(input) {
  if (!input) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── Search ──────────────────────────────────────────────────────────

/**
 * Search YouTube using youtubei.js (InnerTube API — no API key needed).
 * Falls back to page scraping if youtubei.js fails.
 */
export async function searchYouTube(query, maxResults = 10) {
  try {
    const { Innertube } = await import("youtubei.js");
    const yt = await Innertube.create({ retrieve_player: false });
    const search = await yt.search(query);
    const videos = (search.results || [])
      .filter(r => r.type === "Video")
      .slice(0, maxResults)
      .map(v => ({
        videoId: v.id,
        title: v.title?.text || "",
        channel: v.author?.name || "",
        channelUrl: v.author?.url || "",
        views: v.short_view_count?.text || v.view_count?.text || "",
        publishedTime: v.published?.text || "",
        duration: v.duration?.text || "",
        description: v.snippets?.[0]?.text?.text || v.description_snippet?.text || "",
        thumbnail: v.best_thumbnail?.url || v.thumbnails?.[0]?.url || "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
      }));
    if (videos.length > 0) return videos;
  } catch (e) {
    console.error("[YouTube] youtubei.js search failed, falling back:", e.message);
  }

  return searchYouTubeScrape(query, maxResults);
}

async function searchYouTubeScrape(query, maxResults) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: HEADERS });
  const html = await resp.text();

  const match = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s);
  if (!match) {
    const match2 = html.match(/ytInitialData\s*=\s*'({.*?})'/s);
    if (!match2) throw new Error("Could not parse YouTube search results");
    return parseSearchResults(JSON.parse(match2[1]), maxResults);
  }
  return parseSearchResults(JSON.parse(match[1]), maxResults);
}

function parseSearchResults(data, maxResults) {
  const results = [];
  try {
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents;
    if (!contents) return results;

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents;
      if (!items) continue;
      for (const item of items) {
        const video = item?.videoRenderer;
        if (!video) continue;
        if (results.length >= maxResults) break;
        results.push({
          videoId: video.videoId,
          title: video.title?.runs?.[0]?.text || "",
          channel: video.ownerText?.runs?.[0]?.text || "",
          channelUrl: video.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || "",
          views: video.viewCountText?.simpleText || video.viewCountText?.runs?.[0]?.text || "",
          publishedTime: video.publishedTimeText?.simpleText || "",
          duration: video.lengthText?.simpleText || "",
          description: video.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map(r => r.text).join("") || "",
          thumbnail: video.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || "",
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
        });
      }
    }
  } catch (e) {
    console.error("[YouTube] Parse error:", e.message);
  }
  return results;
}

// ─── Transcript ──────────────────────────────────────────────────────

/**
 * Get video transcript using yt-dlp (most reliable method).
 * Requires: yt-dlp installed (`pip install yt-dlp`)
 * Optional: data/youtube-cookies.txt for videos requiring authentication
 *
 * Falls back to youtube-transcript npm package if yt-dlp fails.
 */
export async function getTranscript(videoIdOrUrl, lang = "en") {
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) throw new Error(`Invalid video ID or URL: ${videoIdOrUrl}`);

  // Try Method 1: yt-dlp with cookies file
  try {
    return await getTranscriptYtDlp(videoId, lang);
  } catch (e) {
    console.error("[YouTube] yt-dlp transcript failed:", e.message);
  }

  // Try Method 2: youtube-transcript npm package
  try {
    return await getTranscriptNpm(videoId, lang);
  } catch (e) {
    console.error("[YouTube] npm transcript failed:", e.message);
  }

  // Try Method 3: Direct page scraping (works for some videos)
  try {
    return await getTranscriptDirect(videoId, lang);
  } catch (e) {
    throw new Error(
      `Transcript unavailable for ${videoId}. ` +
      (fs.existsSync(COOKIES_PATH) ? "Cookies may be expired — re-export from browser." : `Set up cookies: export YouTube cookies to data/youtube-cookies.txt (Netscape format).`)
    );
  }
}

async function getTranscriptYtDlp(videoId, lang) {
  const tmpDir = os.tmpdir();
  const outBase = path.join(tmpDir, `yt-sub-${videoId}`);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Build yt-dlp command
  let cmd = `yt-dlp --write-auto-sub --write-sub --sub-lang ${lang} --sub-format json3 --skip-download -o "${outBase}"`;
  if (fs.existsSync(COOKIES_PATH)) {
    cmd += ` --cookies "${COOKIES_PATH}"`;
  }
  cmd += ` "${videoUrl}"`;

  try {
    execSync(cmd, { encoding: "utf-8", timeout: 45000, stdio: "pipe" });
  } catch (e) {
    // Clean up any partial files
    cleanupTmpFiles(outBase);
    throw new Error(e.stderr?.split("\n").filter(l => l.includes("ERROR") || l.includes("WARNING")).join("; ") || "yt-dlp failed");
  }

  // Find the subtitle file
  const tmpFiles = fs.readdirSync(tmpDir).filter(f => f.startsWith(`yt-sub-${videoId}`));
  const subFile = tmpFiles.find(f => f.endsWith(".json3"));

  if (!subFile) {
    cleanupTmpFiles(outBase);
    throw new Error("No subtitle file generated");
  }

  const subPath = path.join(tmpDir, subFile);
  const data = JSON.parse(fs.readFileSync(subPath, "utf-8"));
  cleanupTmpFiles(outBase);

  const segments = (data.events || [])
    .filter(e => e.segs && e.segs.length > 0)
    .map(e => ({
      time: formatTimestamp(e.tStartMs / 1000),
      offsetMs: e.tStartMs,
      duration: e.dDurationMs || 0,
      text: e.segs.map(s => s.utf8 || "").join("").trim(),
    }))
    .filter(s => s.text.length > 0);

  const fullText = segments.map(s => s.text).join(" ");

  return {
    videoId,
    language: lang,
    method: "yt-dlp",
    segments,
    fullText,
    wordCount: fullText.split(/\s+/).filter(w => w).length,
    durationSeconds: segments.length > 0
      ? Math.round((segments[segments.length - 1].offsetMs + segments[segments.length - 1].duration) / 1000)
      : 0,
  };
}

async function getTranscriptNpm(videoId, lang) {
  const { YoutubeTranscript } = await import("youtube-transcript");
  const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });

  if (!transcript || transcript.length === 0) {
    throw new Error("Empty transcript from npm package");
  }

  const segments = transcript.map(entry => ({
    time: formatTimestamp((entry.offset || 0) / 1000),
    offsetMs: entry.offset || 0,
    duration: entry.duration || 0,
    text: (entry.text || "").trim(),
  })).filter(s => s.text.length > 0);

  if (segments.length === 0) throw new Error("No text segments in transcript");

  const fullText = segments.map(s => s.text).join(" ");

  return {
    videoId,
    language: lang,
    method: "youtube-transcript",
    segments,
    fullText,
    wordCount: fullText.split(/\s+/).filter(w => w).length,
    durationSeconds: segments.length > 0
      ? Math.round((segments[segments.length - 1].offsetMs + segments[segments.length - 1].duration) / 1000)
      : 0,
  };
}

async function getTranscriptDirect(videoId, lang) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { headers: HEADERS });
  const html = await resp.text();

  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s);
  if (!playerMatch) throw new Error("No player response found");

  const player = JSON.parse(playerMatch[1]);
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length === 0) throw new Error("No caption tracks");

  let track = tracks.find(t => t.languageCode === lang) || tracks.find(t => t.languageCode === "en") || tracks[0];

  // Try fetching the transcript XML
  const capResp = await fetch(track.baseUrl + "&fmt=json3", { headers: HEADERS });
  const capText = await capResp.text();

  if (!capText || capText.length === 0) {
    // Try XML format
    const xmlResp = await fetch(track.baseUrl, { headers: HEADERS });
    const xmlText = await xmlResp.text();
    if (!xmlText || xmlText.length === 0) throw new Error("Empty caption response");

    // Parse XML
    const $ = cheerio.load(xmlText, { xmlMode: true });
    const segments = [];
    $("text").each((i, el) => {
      const $el = $(el);
      segments.push({
        time: formatTimestamp(parseFloat($el.attr("start") || "0")),
        offsetMs: Math.round(parseFloat($el.attr("start") || "0") * 1000),
        duration: Math.round(parseFloat($el.attr("dur") || "0") * 1000),
        text: $el.text().trim(),
      });
    });
    if (segments.length === 0) throw new Error("No text in XML");

    const fullText = segments.map(s => s.text).join(" ");
    return { videoId, language: track.languageCode, method: "direct-xml", segments, fullText, wordCount: fullText.split(/\s+/).length, durationSeconds: 0 };
  }

  // Parse json3
  const json = JSON.parse(capText);
  const segments = (json.events || [])
    .filter(e => e.segs)
    .map(e => ({
      time: formatTimestamp(e.tStartMs / 1000),
      offsetMs: e.tStartMs,
      duration: e.dDurationMs || 0,
      text: e.segs.map(s => s.utf8 || "").join("").trim(),
    }))
    .filter(s => s.text.length > 0);

  if (segments.length === 0) throw new Error("No text segments");

  const fullText = segments.map(s => s.text).join(" ");
  return { videoId, language: track.languageCode, method: "direct-json3", segments, fullText, wordCount: fullText.split(/\s+/).length, durationSeconds: 0 };
}

function cleanupTmpFiles(basePath) {
  const dir = path.dirname(basePath);
  const prefix = path.basename(basePath);
  try {
    fs.readdirSync(dir)
      .filter(f => f.startsWith(prefix))
      .forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ } });
  } catch { /* ignore */ }
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Video Info ──────────────────────────────────────────────────────

/**
 * Get video metadata via oEmbed + page scraping
 */
export async function getVideoInfo(videoIdOrUrl) {
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) throw new Error(`Invalid video ID or URL: ${videoIdOrUrl}`);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let oembedData = {};
  try {
    const oResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, { headers: HEADERS });
    if (oResp.ok) oembedData = await oResp.json();
  } catch { /* oEmbed failed */ }

  let pageData = {};
  try {
    const resp = await fetch(videoUrl, { headers: HEADERS });
    const html = await resp.text();
    const $ = cheerio.load(html);

    pageData.description = $('meta[name="description"]').attr("content") || "";
    pageData.keywords = $('meta[name="keywords"]').attr("content") || "";
    pageData.ogImage = $('meta[property="og:image"]').attr("content") || "";

    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|<\/script>)/s);
    if (playerMatch) {
      try {
        const pd = JSON.parse(playerMatch[1]);
        const vd = pd?.videoDetails;
        if (vd) {
          pageData.viewCount = vd.viewCount;
          pageData.lengthSeconds = vd.lengthSeconds;
          pageData.channelId = vd.channelId;
          pageData.shortDescription = vd.shortDescription;
          pageData.isLive = vd.isLiveContent;
          pageData.keywords = vd.keywords || [];
        }
      } catch { /* parse failed */ }
    }
  } catch { /* page failed */ }

  return {
    videoId,
    url: videoUrl,
    title: oembedData.title || "",
    author: oembedData.author_name || "",
    authorUrl: oembedData.author_url || "",
    thumbnail: pageData.ogImage || oembedData.thumbnail_url || "",
    description: pageData.shortDescription || pageData.description || "",
    viewCount: pageData.viewCount ? parseInt(pageData.viewCount) : null,
    durationSeconds: pageData.lengthSeconds ? parseInt(pageData.lengthSeconds) : null,
    channelId: pageData.channelId || null,
    keywords: Array.isArray(pageData.keywords)
      ? pageData.keywords
      : (pageData.keywords || "").split(",").map(k => k.trim()).filter(Boolean),
    isLive: pageData.isLive || false,
  };
}

// ─── Channel Videos ──────────────────────────────────────────────────

export async function getChannelVideos(channelIdOrUrl, maxResults = 15) {
  let channelId = channelIdOrUrl;

  if (channelIdOrUrl.includes("youtube.com")) {
    const handleMatch = channelIdOrUrl.match(/@([^\/\s?]+)/);
    if (handleMatch) {
      const resp = await fetch(`https://www.youtube.com/@${handleMatch[1]}`, { headers: HEADERS });
      const html = await resp.text();
      const cidMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
      if (cidMatch) channelId = cidMatch[1];
    } else {
      const cidMatch = channelIdOrUrl.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
      if (cidMatch) channelId = cidMatch[1];
    }
  }

  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const resp = await fetch(rssUrl, { headers: HEADERS });
  if (!resp.ok) throw new Error(`Could not fetch channel feed for ${channelId}`);

  const xml = await resp.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const videos = [];

  $("entry").each((i, el) => {
    if (i >= maxResults) return false;
    const $el = $(el);
    const vid = $el.find("yt\\:videoId").text();
    videos.push({
      videoId: vid,
      title: $el.find("title").text(),
      published: $el.find("published").text(),
      updated: $el.find("updated").text(),
      author: $el.find("author name").text(),
      url: `https://www.youtube.com/watch?v=${vid}`,
      thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
      views: $el.find("media\\:community media\\:statistics").attr("views") || null,
    });
  });

  return { channelId, videoCount: videos.length, videos };
}

// ─── Research ────────────────────────────────────────────────────────

export async function researchVideo(videoIdOrUrl) {
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) throw new Error(`Invalid video ID or URL: ${videoIdOrUrl}`);

  const info = await getVideoInfo(videoId);

  let transcript = null;
  try {
    transcript = await getTranscript(videoId);
  } catch (e) {
    transcript = { error: e.message, fullText: null, wordCount: 0, segments: [] };
  }

  const research = {
    videoId,
    url: info.url,
    title: info.title,
    author: info.author,
    authorUrl: info.authorUrl,
    description: info.description,
    viewCount: info.viewCount,
    durationSeconds: info.durationSeconds,
    keywords: info.keywords,
    transcript: transcript?.fullText || null,
    transcriptWordCount: transcript?.wordCount || 0,
    transcriptSegments: transcript?.segments?.length || 0,
    hasTranscript: !!(transcript?.fullText),
    transcriptMethod: transcript?.method || null,
    researchedAt: new Date().toISOString(),
  };

  const filename = `${videoId}-${slugify(info.title || "untitled")}.json`;
  fs.writeFileSync(path.join(YOUTUBE_DIR, filename), JSON.stringify(research, null, 2));

  return research;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

// ─── Saved Research ──────────────────────────────────────────────────

export function listResearch() {
  if (!fs.existsSync(YOUTUBE_DIR)) return [];
  return fs.readdirSync(YOUTUBE_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(YOUTUBE_DIR, f), "utf-8"));
        return {
          file: f,
          videoId: data.videoId,
          title: data.title,
          author: data.author,
          hasTranscript: data.hasTranscript,
          transcriptWordCount: data.transcriptWordCount,
          researchedAt: data.researchedAt,
        };
      } catch {
        return { file: f, error: "Could not parse" };
      }
    });
}

export function getResearch(videoId) {
  if (!fs.existsSync(YOUTUBE_DIR)) return null;
  const files = fs.readdirSync(YOUTUBE_DIR).filter(f => f.startsWith(videoId) && f.endsWith(".json"));
  if (files.length === 0) return null;
  return JSON.parse(fs.readFileSync(path.join(YOUTUBE_DIR, files[0]), "utf-8"));
}

/**
 * Check if cookies file exists and transcript capability status
 */
export function getYouTubeStatus() {
  const hasCookies = fs.existsSync(COOKIES_PATH);
  let hasYtDlp = false;
  try {
    execSync("yt-dlp --version", { encoding: "utf-8", stdio: "pipe" });
    hasYtDlp = true;
  } catch { /* not installed */ }

  const researchCount = fs.existsSync(YOUTUBE_DIR)
    ? fs.readdirSync(YOUTUBE_DIR).filter(f => f.endsWith(".json")).length
    : 0;

  return {
    searchAvailable: true,
    videoInfoAvailable: true,
    transcriptAvailable: hasCookies && hasYtDlp,
    transcriptPartial: hasYtDlp,
    ytDlpInstalled: hasYtDlp,
    cookiesConfigured: hasCookies,
    cookiesPath: COOKIES_PATH,
    researchCount,
    note: hasCookies
      ? "Full YouTube access (search, info, transcripts)"
      : "Search and video info work. For transcripts, export YouTube cookies to data/youtube-cookies.txt (Netscape format). Use a browser extension like 'Get cookies.txt LOCALLY'.",
  };
}
