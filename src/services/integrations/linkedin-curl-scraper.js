import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import * as cheerio from "cheerio";

import { getDataDir, dataFile } from "../paths.js";

const DATA_DIR = getDataDir();
const PROFILE_PATH = path.join(DATA_DIR, "linkedin-profile.json");

const LINKEDIN_DIR = dataFile("linkedin");
const CURL_PATH = path.join(LINKEDIN_DIR, "curl.txt");

const DEFAULT_START_URL = "https://www.linkedin.com/me";
const FALLBACK_START_URL = "https://www.linkedin.com/in/me";

const ensureDirs = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LINKEDIN_DIR)) fs.mkdirSync(LINKEDIN_DIR, { recursive: true });
};

const readJson = (filePath) => {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {}
  return null;
};

const normalizeWhitespace = (text) => String(text || "").replace(/\s+/g, " ").trim();

const truncate = (text, limit) => {
  const s = String(text || "");
  return s.length > limit ? s.slice(0, limit) : s;
};

function tokenizeShellLike(input) {
  const s = String(input || "");
  const out = [];
  let cur = "";
  let mode = "normal"; // normal | single | double

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (mode === "normal") {
      if (/\s/.test(ch)) {
        if (cur) out.push(cur);
        cur = "";
        continue;
      }
      if (ch === "'") {
        mode = "single";
        continue;
      }
      if (ch === "\"") {
        mode = "double";
        continue;
      }
      if (ch === "\\") {
        const next = s[i + 1];
        if (next != null) {
          cur += next;
          i++;
          continue;
        }
      }
      cur += ch;
      continue;
    }

    if (mode === "single") {
      if (ch === "'") {
        mode = "normal";
        continue;
      }
      cur += ch;
      continue;
    }

    if (mode === "double") {
      if (ch === "\"") {
        mode = "normal";
        continue;
      }
      if (ch === "\\") {
        const next = s[i + 1];
        if (next === "\"" || next === "\\" || next === "$" || next === "`") {
          cur += next;
          i++;
          continue;
        }
      }
      cur += ch;
    }
  }

  if (mode !== "normal") {
    throw new Error("Unterminated quote in cURL command.");
  }
  if (cur) out.push(cur);
  return out;
}

function sanitizeCurlCommand(input) {
  let s = String(input || "").trim();
  // Handle Windows "Copy as cURL (cmd)" caret-newline continuations.
  s = s.replace(/\^\s*\r?\n/g, " ");
  // Collapse newlines to spaces for safe tokenization.
  s = s.replace(/\r?\n/g, " ");
  return s.trim();
}

function parseCurlCommand(curlCommand) {
  const raw = sanitizeCurlCommand(curlCommand);
  const tokens = tokenizeShellLike(raw);

  if (!tokens.length) throw new Error("Empty cURL command.");

  const first = tokens[0].toLowerCase();
  if (first !== "curl" && first !== "curl.exe") {
    throw new Error("Expected a cURL command starting with `curl ...`.");
  }

  let url = null;
  const headers = [];

  const takeNext = (i) => {
    if (i + 1 >= tokens.length) return { value: null, nextIndex: i };
    return { value: tokens[i + 1], nextIndex: i + 1 };
  };

  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];

    if (t === "-H" || t === "--header") {
      const { value, nextIndex } = takeNext(i);
      if (value) headers.push(String(value));
      i = nextIndex;
      continue;
    }
    if (t.startsWith("-H") && t.length > 2) {
      headers.push(t.slice(2));
      continue;
    }
    if (t === "-A" || t === "--user-agent") {
      const { value, nextIndex } = takeNext(i);
      if (value) headers.push(`user-agent: ${value}`);
      i = nextIndex;
      continue;
    }
    if (t === "-b" || t === "--cookie") {
      const { value, nextIndex } = takeNext(i);
      if (value) headers.push(`cookie: ${value}`);
      i = nextIndex;
      continue;
    }
    if (t === "--url") {
      const { value, nextIndex } = takeNext(i);
      if (value) url = String(value);
      i = nextIndex;
      continue;
    }

    if (!t.startsWith("-") && !url && (t.startsWith("https://") || t.startsWith("http://"))) {
      url = t;
    }
  }

  return { url, headers };
}

const DROP_HEADER_NAMES = new Set([
  // Prefer curl's internal handling for compression.
  "accept-encoding",
  // Request-body headers (we only do GET).
  "content-length",
  "content-type",
  // Let curl set host/SNI correctly.
  "host",
  // HTTP/2 pseudo-ish headers sometimes appear in DevTools exports.
  "authority",
  ":authority",
  ":method",
  ":path",
  ":scheme",
  // Connection-specific.
  "connection",
]);

function filterCurlHeaders(headerLines) {
  const kept = [];
  for (const line of headerLines || []) {
    const raw = String(line || "").trim();
    if (!raw) continue;
    const idx = raw.indexOf(":");
    if (idx <= 0) continue;
    const name = raw.slice(0, idx).trim().toLowerCase();
    if (!name) continue;
    if (DROP_HEADER_NAMES.has(name)) continue;
    kept.push(raw);
  }
  return kept;
}

function escapeCurlConfigString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r?\n/g, " ");
}

function buildCurlConfig({ url, headers, htmlPath, headersPath, writeOutMarker }) {
  const lines = [];
  lines.push(`url = "${escapeCurlConfigString(url)}"`);
  // Boolean flags: in curl config files, specify the option name with no value.
  lines.push("location");
  lines.push("silent");
  lines.push("show-error");
  lines.push("compressed");
  lines.push(`dump-header = "${escapeCurlConfigString(headersPath)}"`);
  lines.push(`output = "${escapeCurlConfigString(htmlPath)}"`);
  lines.push(`write-out = "${escapeCurlConfigString(writeOutMarker)}"`);
  // Keep a sane cap so a bad network doesn't hang forever.
  lines.push("max-time = 60");

  for (const h of headers || []) {
    lines.push(`header = "${escapeCurlConfigString(h)}"`);
  }

  return lines.join("\n") + "\n";
}

async function runCurlWithConfig(configPath) {
  return await new Promise((resolve, reject) => {
    const child = spawn("curl", ["--config", configPath], { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (buf) => { stdout += buf.toString("utf-8"); });
    child.stderr.on("data", (buf) => { stderr += buf.toString("utf-8"); });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve({ ok: true, stdout, stderr });
      reject(new Error(stderr.trim() || `curl exited with code ${code}`));
    });
  });
}

function extractMeta(html) {
  const $ = cheerio.load(String(html || ""));
  const meta = (property) => $(`meta[property="${property}"]`).attr("content") || null;
  const name = $("title").text().trim() || null;

  return {
    title: meta("og:title") || name,
    description: meta("og:description") || $("meta[name=\"description\"]").attr("content") || null,
    image: meta("og:image"),
    canonical: $("link[rel=canonical]").attr("href") || null,
    name,
  };
}

function extractTextSnapshot(html, limit = 12000) {
  const $ = cheerio.load(String(html || ""));
  $("script, style, noscript").remove();
  const text = normalizeWhitespace($("body").text());
  return truncate(text, limit);
}

function inferProfileFromMeta(meta) {
  const rawTitle = meta?.title || meta?.name || null;
  const name = rawTitle
    ? String(rawTitle).replace(/\s*\|\s*LinkedIn\s*$/i, "").trim()
    : null;

  // Often low-signal, but better than nothing for display.
  const headline = meta?.description || null;

  return {
    name: name || null,
    headline,
  };
}

export function getStoredLinkedInCurlCommand() {
  try {
    if (!fs.existsSync(CURL_PATH)) return null;
    const raw = fs.readFileSync(CURL_PATH, "utf-8");
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/paste/i.test(trimmed)) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function saveLinkedInCurlCommand(curlCommand) {
  ensureDirs();
  fs.writeFileSync(CURL_PATH, String(curlCommand || "").trim() + "\n", "utf-8");
  return { success: true, path: CURL_PATH };
}

export function clearLinkedInCurlCommand() {
  try {
    if (fs.existsSync(CURL_PATH)) fs.unlinkSync(CURL_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function looksLikeLoggedOut({ httpCode, effectiveUrl }) {
  const u = String(effectiveUrl || "").toLowerCase();
  return (
    httpCode === 0 ||
    httpCode === 999 ||
    httpCode === 429 ||
    httpCode === 401 ||
    httpCode === 403 ||
    u.includes("/login") ||
    u.includes("/authwall") ||
    u.includes("/checkpoint")
  );
}

async function fetchOnce({ url, headers, outputPrefix }) {
  ensureDirs();

  const htmlPath = path.join(LINKEDIN_DIR, `${outputPrefix}.html`);
  const headersPath = path.join(LINKEDIN_DIR, `${outputPrefix}.headers.txt`);
  const configPath = path.join(LINKEDIN_DIR, `${outputPrefix}.curl-config.txt`);

  const marker = "__BB_CURL__%{http_code}__%{url_effective}__";
  const config = buildCurlConfig({
    url,
    headers,
    htmlPath,
    headersPath,
    writeOutMarker: marker,
  });
  fs.writeFileSync(configPath, config, "utf-8");

  let stdout = "";
  try {
    ({ stdout } = await runCurlWithConfig(configPath));
  } finally {
    // Contains cookies in headers: delete regardless of success/failure.
    try { fs.unlinkSync(configPath); } catch {}
  }

  let httpCode = 0;
  let effectiveUrl = null;
  const match = String(stdout || "").match(/__BB_CURL__(\d{3})__(.*?)__/);
  if (match) {
    httpCode = Number.parseInt(match[1], 10) || 0;
    effectiveUrl = match[2] || null;
  }

  return {
    httpCode,
    effectiveUrl,
    htmlPath,
    headersPath,
  };
}

export async function scrapeLinkedInProfileViaCurl(options = {}) {
  const startUrl = options.startUrl || DEFAULT_START_URL;
  const fallbackUrl = options.fallbackUrl || FALLBACK_START_URL;
  const persistCurl = Boolean(options.persistCurl);

  const curlCommand = options.curlCommand || getStoredLinkedInCurlCommand();
  if (!curlCommand) {
    return {
      success: false,
      error: "Missing LinkedIn cURL command. Run /linkedin and paste a DevTools 'Copy as cURL (bash)' request.",
      hint:
        "Open https://www.linkedin.com/me in your browser, open DevTools -> Network, reload, then Copy as cURL (bash) and paste it into BACKBONE.",
    };
  }

  let parsed;
  try {
    parsed = parseCurlCommand(curlCommand);
  } catch (e) {
    return { success: false, error: e.message };
  }

  if (persistCurl) {
    // Intentionally stored on disk so automated refresh (cron) can reuse it.
    // Contains cookies: treat this as sensitive local data.
    saveLinkedInCurlCommand(curlCommand);
  }

  const filteredHeaders = filterCurlHeaders(parsed.headers);

  let fetchResult;
  try {
    fetchResult = await fetchOnce({
      url: startUrl,
      headers: filteredHeaders,
      outputPrefix: "me",
    });

    if (looksLikeLoggedOut(fetchResult) && fallbackUrl && fallbackUrl !== startUrl) {
      fetchResult = await fetchOnce({
        url: fallbackUrl,
        headers: filteredHeaders,
        outputPrefix: "in-me",
      });
    }
  } catch (error) {
    return {
      success: false,
      error: `curl fetch failed: ${error.message}`,
      hint: "Make sure curl is available on your system and the pasted cURL command includes a valid Cookie header.",
    };
  }

  const html = fs.existsSync(fetchResult.htmlPath) ? fs.readFileSync(fetchResult.htmlPath, "utf-8") : "";
  const meta = extractMeta(html);
  const textSnapshot = extractTextSnapshot(html, 12000);

  const metaPath = path.join(LINKEDIN_DIR, "me.meta.json");
  const textPath = path.join(LINKEDIN_DIR, "me.txt");
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  fs.writeFileSync(textPath, textSnapshot, "utf-8");

  const minimalProfile = inferProfileFromMeta(meta);

  const loggedOut = looksLikeLoggedOut(fetchResult);
  const payload = loggedOut
    ? {
        success: false,
        error: "LinkedIn request looks logged out/authwalled. Update the stored cURL headers (cookies) and try again.",
        hint:
          "Open https://www.linkedin.com/me in your browser, open DevTools -> Network, reload, then Copy as cURL (bash) and paste it into BACKBONE.",
        profileUrl: fetchResult.effectiveUrl || meta.canonical || startUrl,
        htmlPath: fetchResult.htmlPath,
        headersPath: fetchResult.headersPath,
        metaPath,
        textPath,
        httpCode: fetchResult.httpCode,
        captureMethod: "curl",
        capturedAt: new Date().toISOString(),
      }
    : {
        success: true,
        profileUrl: fetchResult.effectiveUrl || meta.canonical || startUrl,
        profile: {
          name: minimalProfile.name,
          headline: minimalProfile.headline,
        },
        htmlPath: fetchResult.htmlPath,
        headersPath: fetchResult.headersPath,
        metaPath,
        textPath,
        httpCode: fetchResult.httpCode,
        captureMethod: "curl",
        capturedAt: new Date().toISOString(),
      };

  // If we got authwalled/logged out, do NOT clobber the last good profile.
  // Write a sidecar failure payload for debugging and return the error.
  if (loggedOut) {
    const failurePath = path.join(LINKEDIN_DIR, "last-failure.json");
    fs.writeFileSync(failurePath, JSON.stringify(payload, null, 2), "utf-8");
    return { ...payload, failurePath };
  }

  // Merge into the existing Playwright-based output so the rest of the app can
  // keep richer extracted fields (experience, about, etc) while we update:
  // profileUrl + html snapshot paths.
  const existing = readJson(PROFILE_PATH) || {};
  const mergedProfile = { ...(existing.profile || {}), ...(payload.profile || {}) };
  const next = { ...existing, ...payload, profile: mergedProfile };

  ensureDirs();
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(next, null, 2), "utf-8");

  return next;
}
