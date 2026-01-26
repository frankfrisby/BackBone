# Social Media Integration Skill

Integrate with social media platforms programmatically.

## Dependencies
```bash
npm install twitter-api-v2 instagram-private-api
```

## Twitter/X Integration

```javascript
import { TwitterApi } from 'twitter-api-v2';

class TwitterClient {
  constructor(credentials) {
    this.client = new TwitterApi({
      appKey: credentials.apiKey,
      appSecret: credentials.apiSecret,
      accessToken: credentials.accessToken,
      accessSecret: credentials.accessSecret
    });
    this.rwClient = this.client.readWrite;
  }

  // Post tweet
  async tweet(text, options = {}) {
    const params = { text };
    if (options.replyTo) params.reply = { in_reply_to_tweet_id: options.replyTo };
    return await this.rwClient.v2.tweet(params);
  }

  // Post with media
  async tweetWithMedia(text, mediaPath) {
    const mediaId = await this.client.v1.uploadMedia(mediaPath);
    return await this.rwClient.v2.tweet({
      text,
      media: { media_ids: [mediaId] }
    });
  }

  // Get user timeline
  async getUserTimeline(userId, maxResults = 10) {
    const tweets = await this.client.v2.userTimeline(userId, {
      max_results: maxResults,
      'tweet.fields': ['created_at', 'public_metrics']
    });
    return tweets.data.data;
  }

  // Search tweets
  async search(query, maxResults = 10) {
    const tweets = await this.client.v2.search(query, {
      max_results: maxResults,
      'tweet.fields': ['created_at', 'public_metrics', 'author_id']
    });
    return tweets.data.data;
  }

  // Get user info
  async getUser(username) {
    const user = await this.client.v2.userByUsername(username, {
      'user.fields': ['description', 'public_metrics', 'profile_image_url']
    });
    return user.data;
  }

  // Follow user
  async follow(userId, targetUserId) {
    return await this.rwClient.v2.follow(userId, targetUserId);
  }

  // Get followers
  async getFollowers(userId, maxResults = 100) {
    const followers = await this.client.v2.followers(userId, { max_results: maxResults });
    return followers.data;
  }

  // Like tweet
  async like(userId, tweetId) {
    return await this.rwClient.v2.like(userId, tweetId);
  }

  // Retweet
  async retweet(userId, tweetId) {
    return await this.rwClient.v2.retweet(userId, tweetId);
  }
}
```

## LinkedIn Integration (via API)

```javascript
class LinkedInClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.linkedin.com/v2';
  }

  async request(endpoint, method = 'GET', data = null) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: data ? JSON.stringify(data) : null
    });
    return await response.json();
  }

  // Get profile
  async getProfile() {
    return await this.request('/me');
  }

  // Share post
  async share(authorUrn, text, options = {}) {
    const post = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': options.visibility || 'PUBLIC'
      }
    };

    return await this.request('/ugcPosts', 'POST', post);
  }

  // Get connections
  async getConnections() {
    return await this.request('/connections?q=viewer&start=0&count=50');
  }
}
```

## Facebook/Meta Integration

```javascript
class FacebookClient {
  constructor(accessToken, pageId = null) {
    this.accessToken = accessToken;
    this.pageId = pageId;
    this.baseUrl = 'https://graph.facebook.com/v18.0';
  }

  async request(endpoint, method = 'GET', data = null) {
    let url = `${this.baseUrl}${endpoint}`;
    if (!url.includes('access_token')) {
      url += `${url.includes('?') ? '&' : '?'}access_token=${this.accessToken}`;
    }

    const options = { method };
    if (data && method !== 'GET') {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    return await response.json();
  }

  // Post to page
  async postToPage(message, options = {}) {
    return await this.request(`/${this.pageId}/feed`, 'POST', {
      message,
      link: options.link,
      published: options.published !== false
    });
  }

  // Post photo
  async postPhoto(photoUrl, caption) {
    return await this.request(`/${this.pageId}/photos`, 'POST', {
      url: photoUrl,
      caption
    });
  }

  // Get page insights
  async getPageInsights(metrics, period = 'day') {
    return await this.request(`/${this.pageId}/insights?metric=${metrics.join(',')}&period=${period}`);
  }

  // Get posts
  async getPosts(limit = 10) {
    return await this.request(`/${this.pageId}/posts?limit=${limit}&fields=message,created_time,likes.summary(true),comments.summary(true)`);
  }

  // Schedule post
  async schedulePost(message, publishTime) {
    return await this.request(`/${this.pageId}/feed`, 'POST', {
      message,
      published: false,
      scheduled_publish_time: Math.floor(publishTime.getTime() / 1000)
    });
  }
}
```

## Social Media Scheduler

```javascript
class SocialMediaScheduler {
  constructor(clients) {
    this.clients = clients; // { twitter, facebook, linkedin }
    this.queue = [];
  }

  addPost(platforms, content, scheduledTime) {
    const post = {
      id: Date.now().toString(),
      platforms,
      content,
      scheduledTime: new Date(scheduledTime),
      status: 'scheduled'
    };
    this.queue.push(post);
    return post;
  }

  async publishNow(platforms, content) {
    const results = {};

    for (const platform of platforms) {
      try {
        switch (platform) {
          case 'twitter':
            results.twitter = await this.clients.twitter.tweet(content.text);
            break;
          case 'facebook':
            results.facebook = await this.clients.facebook.postToPage(content.text);
            break;
          case 'linkedin':
            results.linkedin = await this.clients.linkedin.share(content.authorUrn, content.text);
            break;
        }
      } catch (error) {
        results[platform] = { error: error.message };
      }
    }

    return results;
  }

  async processQueue() {
    const now = new Date();
    const dueItems = this.queue.filter(p => p.status === 'scheduled' && p.scheduledTime <= now);

    for (const post of dueItems) {
      post.results = await this.publishNow(post.platforms, post.content);
      post.status = 'published';
      post.publishedAt = now;
    }

    return dueItems;
  }

  getScheduled() {
    return this.queue.filter(p => p.status === 'scheduled');
  }

  cancel(postId) {
    const index = this.queue.findIndex(p => p.id === postId);
    if (index >= 0) {
      this.queue[index].status = 'cancelled';
      return true;
    }
    return false;
  }
}
```

## Analytics Helper

```javascript
class SocialAnalytics {
  static calculateEngagementRate(metrics) {
    const { likes = 0, comments = 0, shares = 0, impressions = 1 } = metrics;
    return ((likes + comments + shares) / impressions * 100).toFixed(2);
  }

  static aggregateMetrics(posts) {
    return posts.reduce((acc, post) => ({
      totalLikes: acc.totalLikes + (post.likes || 0),
      totalComments: acc.totalComments + (post.comments || 0),
      totalShares: acc.totalShares + (post.shares || 0),
      totalImpressions: acc.totalImpressions + (post.impressions || 0),
      postCount: acc.postCount + 1
    }), { totalLikes: 0, totalComments: 0, totalShares: 0, totalImpressions: 0, postCount: 0 });
  }

  static getBestPostingTimes(posts) {
    const hourlyEngagement = {};

    posts.forEach(post => {
      const hour = new Date(post.created_at).getHours();
      if (!hourlyEngagement[hour]) {
        hourlyEngagement[hour] = { total: 0, count: 0 };
      }
      hourlyEngagement[hour].total += (post.likes || 0) + (post.comments || 0);
      hourlyEngagement[hour].count++;
    });

    return Object.entries(hourlyEngagement)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        avgEngagement: data.total / data.count
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }
}
```

## Usage Examples

```javascript
// Twitter
const twitter = new TwitterClient(credentials);
await twitter.tweet('Hello Twitter!');
await twitter.tweetWithMedia('Check this out!', './image.jpg');
const user = await twitter.getUser('elonmusk');
const tweets = await twitter.search('AI news', 20);

// Facebook
const fb = new FacebookClient(accessToken, pageId);
await fb.postToPage('Hello from our page!');
await fb.schedulePost('Coming soon!', new Date('2024-02-01T10:00:00'));
const insights = await fb.getPageInsights(['page_impressions', 'page_engaged_users']);

// LinkedIn
const linkedin = new LinkedInClient(accessToken);
const profile = await linkedin.getProfile();
await linkedin.share(profile.id, 'Excited to share this update!');

// Scheduler
const scheduler = new SocialMediaScheduler({ twitter, facebook, linkedin });
scheduler.addPost(['twitter', 'facebook'], { text: 'Big announcement!' }, '2024-02-01T09:00:00');

// Run every minute to check for due posts
setInterval(() => scheduler.processQueue(), 60000);

// Analytics
const posts = await twitter.getUserTimeline(userId, 100);
const metrics = SocialAnalytics.aggregateMetrics(posts);
const bestTimes = SocialAnalytics.getBestPostingTimes(posts);
```
