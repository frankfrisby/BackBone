import fetch from "node-fetch";

/**
 * Email Integration Service for BACKBONE
 * Supports Gmail, Outlook, and other email providers
 */

export const getEmailConfig = () => {
  // Gmail OAuth
  const gmailClientId = process.env.GMAIL_CLIENT_ID;
  const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;

  // Outlook OAuth
  const outlookClientId = process.env.OUTLOOK_CLIENT_ID;
  const outlookClientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const outlookRefreshToken = process.env.OUTLOOK_REFRESH_TOKEN;

  // Generic IMAP
  const imapHost = process.env.EMAIL_IMAP_HOST;
  const imapUser = process.env.EMAIL_IMAP_USER;
  const imapPassword = process.env.EMAIL_IMAP_PASSWORD;

  const userEmail = process.env.USER_EMAIL;

  return {
    gmail: {
      clientId: gmailClientId,
      clientSecret: gmailClientSecret,
      refreshToken: gmailRefreshToken,
      ready: Boolean(gmailRefreshToken)
    },
    outlook: {
      clientId: outlookClientId,
      clientSecret: outlookClientSecret,
      refreshToken: outlookRefreshToken,
      ready: Boolean(outlookRefreshToken)
    },
    imap: {
      host: imapHost,
      user: imapUser,
      password: imapPassword,
      ready: Boolean(imapHost && imapUser && imapPassword)
    },
    userEmail,
    provider: gmailRefreshToken ? "gmail" : outlookRefreshToken ? "outlook" : imapHost ? "imap" : null,
    ready: Boolean(gmailRefreshToken || outlookRefreshToken || (imapHost && imapUser && imapPassword))
  };
};

/**
 * Detect email domain type
 */
export const detectEmailType = (email) => {
  if (!email) return null;

  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return null;

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "gmail";
  }
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") {
    return "outlook";
  }
  if (domain.endsWith(".edu")) {
    return "education";
  }
  if (domain.includes("yahoo")) {
    return "yahoo";
  }

  return "other";
};

/**
 * Get Gmail access token from refresh token
 */
const getGmailAccessToken = async (config) => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token"
    })
  });

  const data = await response.json();
  return data.access_token;
};

/**
 * Fetch recent Gmail messages
 */
export const fetchGmailMessages = async (config, maxResults = 10) => {
  if (!config.gmail.ready) return null;

  try {
    const accessToken = await getGmailAccessToken(config.gmail);

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error("Gmail fetch failed:", error.message);
    return null;
  }
};

/**
 * Get Outlook access token
 */
const getOutlookAccessToken = async (config) => {
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/Mail.Read"
    })
  });

  const data = await response.json();
  return data.access_token;
};

/**
 * Fetch recent Outlook messages
 */
export const fetchOutlookMessages = async (config, maxResults = 10) => {
  if (!config.outlook.ready) return null;

  try {
    const accessToken = await getOutlookAccessToken(config.outlook);

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$top=${maxResults}&$orderby=receivedDateTime desc`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error("Outlook fetch failed:", error.message);
    return null;
  }
};

/**
 * Build email summary for BACKBONE
 */
export const buildEmailSummary = async (config) => {
  if (!config.ready) {
    return {
      connected: false,
      provider: null,
      unreadCount: null,
      recentMessages: []
    };
  }

  try {
    let messages = [];

    if (config.gmail.ready) {
      messages = await fetchGmailMessages(config);
    } else if (config.outlook.ready) {
      messages = await fetchOutlookMessages(config);
    }

    return {
      connected: true,
      provider: config.provider,
      email: config.userEmail,
      messageCount: messages?.length || 0,
      recentMessages: messages?.slice(0, 5) || [],
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      connected: false,
      provider: config.provider,
      error: error.message
    };
  }
};

/**
 * Check if email is .edu (education)
 */
export const isEducationEmail = (email) => {
  if (!email) return false;
  const domain = email.toLowerCase().split("@")[1];
  return domain && domain.endsWith(".edu");
};
