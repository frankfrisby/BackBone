import fetch from "node-fetch";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const LINKEDIN_DATA_PATH = path.join(DATA_DIR, "linkedin.json");

const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
};

const readLinkedInData = () => {
  ensureDataDir();
  if (!fs.existsSync(LINKEDIN_DATA_PATH)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(LINKEDIN_DATA_PATH, "utf-8");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error("LinkedIn data read failed:", error.message);
    return null;
  }
};

const writeLinkedInData = (payload) => {
  ensureDataDir();
  const current = readLinkedInData() || {};
  const next = {
    ...current,
    ...payload,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(LINKEDIN_DATA_PATH, JSON.stringify(next, null, 2), "utf-8");
  return next;
};

const encodeBase64Url = (value) =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const buildPkce = () => {
  const verifier = encodeBase64Url(crypto.randomBytes(32));
  const challenge = encodeBase64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

export const createLinkedInAuthRequest = (config, redirectUri) => {
  const { verifier, challenge } = buildPkce();
  const state = crypto.randomUUID();
  writeLinkedInData({
    oauth: {
      state,
      codeVerifier: verifier,
      redirectUri
    }
  });

  const scope = encodeURIComponent("r_liteprofile r_emailaddress r_member_social w_member_social");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state,
    scope,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
};

export const exchangeLinkedInCode = async (config, code, state, redirectUri) => {
  const stored = readLinkedInData();
  const verifier = stored?.oauth?.codeVerifier;
  if (!verifier) {
    throw new Error("Missing PKCE verifier. Restart OAuth flow.");
  }
  if (!state || state !== stored?.oauth?.state) {
    throw new Error("Invalid OAuth state. Restart OAuth flow.");
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: verifier
  });

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `LinkedIn token exchange failed: ${response.status}`);
  }

  const token = await response.json();
  const updated = writeLinkedInData({
    oauth: {
      ...stored?.oauth,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || stored?.oauth?.refreshToken || null,
      expiresIn: token.expires_in,
      scope: token.scope,
      obtainedAt: new Date().toISOString()
    }
  });

  return updated.oauth;
};

export const getStoredLinkedInAuth = () => readLinkedInData()?.oauth || null;

export const saveLinkedInSync = (payload) => writeLinkedInData({ sync: payload });

export const loadLinkedInSync = () => readLinkedInData()?.sync || null;

export const getLinkedInMeta = () => readLinkedInData()?.meta || {};

export const updateLinkedInMeta = (updates = {}) => {
  ensureDataDir();
  const current = readLinkedInData() || {};
  const next = {
    ...current,
    meta: {
      ...(current.meta || {}),
      ...updates
    }
  };
  fs.writeFileSync(LINKEDIN_DATA_PATH, JSON.stringify(next, null, 2), "utf-8");
  return next.meta;
};

/**
 * LinkedIn API Service
 * Requires LinkedIn OAuth access token
 * https://developer.linkedin.com/docs/rest-api
 */

export const getLinkedInConfig = () => {
  const stored = getStoredLinkedInAuth();
  const accessToken = stored?.accessToken || process.env.LINKEDIN_ACCESS_TOKEN;
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  return {
    accessToken,
    clientId,
    clientSecret,
    ready: Boolean(accessToken && clientId && clientSecret),
    baseUrl: "https://api.linkedin.com/v2"
  };
};

const buildHeaders = (config) => ({
  Authorization: `Bearer ${config.accessToken}`,
  "Content-Type": "application/json",
  "X-Restli-Protocol-Version": "2.0.0"
});

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `LinkedIn request failed: ${response.status}`);
  }
  return response.json();
};

/**
 * Fetch basic profile information
 */
export const fetchProfile = async (config) => {
  if (!config.ready) {
    return null;
  }

  const url = `${config.baseUrl}/userinfo`;
  return fetchJson(url, { headers: buildHeaders(config) });
};

/**
 * Fetch user's education history
 */
export const fetchEducation = async (config) => {
  if (!config.ready) {
    return null;
  }

  try {
    const url = `${config.baseUrl}/me?projection=(id,firstName,lastName,educations)`;
    return fetchJson(url, { headers: buildHeaders(config) });
  } catch (error) {
    console.error("LinkedIn education fetch failed:", error.message);
    return null;
  }
};

/**
 * Fetch user's positions/work experience
 */
export const fetchPositions = async (config) => {
  if (!config.ready) {
    return null;
  }

  try {
    const url = `${config.baseUrl}/me?projection=(id,firstName,lastName,positions)`;
    return fetchJson(url, { headers: buildHeaders(config) });
  } catch (error) {
    console.error("LinkedIn positions fetch failed:", error.message);
    return null;
  }
};

/**
 * Check if user is currently in school based on LinkedIn education data
 */
export const isCurrentlyInSchool = (educationData) => {
  if (!educationData || !educationData.educations) {
    return { inSchool: false, schoolName: null, degreeType: null };
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  for (const edu of educationData.educations) {
    const endDate = edu.endDate;
    // If no end date or end date is in the future, user is likely still in school
    if (!endDate || (endDate.year && endDate.year >= currentYear)) {
      return {
        inSchool: true,
        schoolName: edu.schoolName || null,
        degreeType: edu.degreeName || null,
        fieldOfStudy: edu.fieldOfStudy || null
      };
    }
  }

  return { inSchool: false, schoolName: null, degreeType: null };
};

/**
 * Detect education level from degree type
 */
export const detectEducationLevel = (degreeType) => {
  if (!degreeType) return null;

  const lower = degreeType.toLowerCase();

  if (lower.includes("phd") || lower.includes("doctorate") || lower.includes("doctoral")) {
    return "gradSchool";
  }
  if (lower.includes("master") || lower.includes("mba") || lower.includes("ms ") || lower.includes("ma ")) {
    return "gradSchool";
  }
  if (lower.includes("bachelor") || lower.includes("bs ") || lower.includes("ba ")) {
    return "college";
  }
  if (lower.includes("high school") || lower.includes("secondary")) {
    return "highSchool";
  }

  return "college"; // Default assumption
};

/**
 * Build LinkedIn profile summary for BACKBONE
 */
export const buildLinkedInProfile = async (config) => {
  if (!config.ready) {
    return null;
  }

  try {
    const [profile, education, positions] = await Promise.all([
      fetchProfile(config),
      fetchEducation(config),
      fetchPositions(config)
    ]);

    const educationStatus = isCurrentlyInSchool(education);
    const educationLevel = detectEducationLevel(educationStatus.degreeType);
    const fullName = [
      profile?.given_name || profile?.firstName?.localized?.en_US,
      profile?.family_name || profile?.lastName?.localized?.en_US
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      connected: true,
      verified: true,
      name: fullName || profile?.given_name || profile?.firstName?.localized?.en_US,
      lastName: profile?.family_name || profile?.lastName?.localized?.en_US,
      email: profile?.email,
      picture: profile?.picture,
      education: educationStatus,
      educationLevel,
      positions: positions?.positions || [],
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("LinkedIn profile build failed:", error.message);
    return { connected: false, verified: false, error: error.message };
  }
};

export const buildLinkedInProfileFromUrl = (profileUrl) => {
  return {
    connected: true,
    verified: false,
    profileUrl,
    lastUpdated: new Date().toISOString()
  };
};

export const fetchLinkedInMessages = async (config) => {
  if (!config.ready) {
    return [];
  }

  try {
    const url = `${config.baseUrl}/messages`; // Placeholder: requires approved LinkedIn Messaging API access
    const data = await fetchJson(url, { headers: buildHeaders(config) });
    return data?.elements || data?.messages || [];
  } catch (error) {
    console.error("LinkedIn messages fetch failed:", error.message);
    return [];
  }
};

export const buildLinkedInSyncPayload = (profile, messages) => ({
  profile,
  messages,
  lastSyncedAt: new Date().toISOString()
});
