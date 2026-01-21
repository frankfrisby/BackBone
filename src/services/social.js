/**
 * Social Media Connections Service
 * Aggregates various social media connections for BACKBONE
 */

/**
 * Get social media configuration from environment
 */
export const getSocialConfig = () => {
  return {
    linkedin: {
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
      ready: Boolean(process.env.LINKEDIN_ACCESS_TOKEN)
    },
    twitter: {
      bearerToken: process.env.TWITTER_BEARER_TOKEN,
      ready: Boolean(process.env.TWITTER_BEARER_TOKEN)
    },
    github: {
      accessToken: process.env.GITHUB_ACCESS_TOKEN,
      ready: Boolean(process.env.GITHUB_ACCESS_TOKEN)
    },
    instagram: {
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      ready: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN)
    }
  };
};

/**
 * Social platform definitions with connection URLs
 */
export const SOCIAL_PLATFORMS = {
  linkedin: {
    name: "LinkedIn",
    icon: "in",
    color: "#0077b5",
    connectUrl: "https://www.linkedin.com/developers/apps",
    description: "Professional network - education, career, connections"
  },
  twitter: {
    name: "Twitter/X",
    icon: "X",
    color: "#1da1f2",
    connectUrl: "https://developer.twitter.com/en/portal/dashboard",
    description: "Social posts, trends, network"
  },
  github: {
    name: "GitHub",
    icon: "gh",
    color: "#333333",
    connectUrl: "https://github.com/settings/tokens",
    description: "Code repositories, contributions, activity"
  },
  instagram: {
    name: "Instagram",
    icon: "ig",
    color: "#e4405f",
    connectUrl: "https://developers.facebook.com/apps",
    description: "Photos, stories, social connections"
  }
};

/**
 * Build social connections summary
 */
export const buildSocialConnectionsSummary = (config) => {
  const connections = [];

  Object.entries(SOCIAL_PLATFORMS).forEach(([key, platform]) => {
    const isConnected = config[key]?.ready || false;
    connections.push({
      id: key,
      name: platform.name,
      icon: platform.icon,
      color: platform.color,
      connected: isConnected,
      connectUrl: platform.connectUrl,
      description: platform.description
    });
  });

  return {
    connections,
    connectedCount: connections.filter((c) => c.connected).length,
    totalCount: connections.length
  };
};

/**
 * Get connection prompts for disconnected services
 */
export const getConnectionPrompts = (config) => {
  const prompts = [];

  if (!config.linkedin?.ready) {
    prompts.push({
      platform: "LinkedIn",
      envVar: "LINKEDIN_ACCESS_TOKEN",
      message: "Connect LinkedIn to sync education and career data",
      priority: 1
    });
  }

  if (!config.twitter?.ready) {
    prompts.push({
      platform: "Twitter/X",
      envVar: "TWITTER_BEARER_TOKEN",
      message: "Connect Twitter for social insights",
      priority: 3
    });
  }

  if (!config.github?.ready) {
    prompts.push({
      platform: "GitHub",
      envVar: "GITHUB_ACCESS_TOKEN",
      message: "Connect GitHub to track coding activity",
      priority: 2
    });
  }

  if (!config.instagram?.ready) {
    prompts.push({
      platform: "Instagram",
      envVar: "INSTAGRAM_ACCESS_TOKEN",
      message: "Connect Instagram for social connections",
      priority: 4
    });
  }

  return prompts.sort((a, b) => a.priority - b.priority);
};
