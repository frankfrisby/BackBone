# API Integration Skill

Integrate with external APIs and services programmatically.

## Dependencies
```bash
npm install axios
```

## HTTP Client Setup

```javascript
import axios from 'axios';

// Create configured client
function createAPIClient(baseURL, options = {}) {
  const client = axios.create({
    baseURL,
    timeout: options.timeout || 30000,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  // Request interceptor
  client.interceptors.request.use(config => {
    if (options.authToken) {
      config.headers.Authorization = `Bearer ${options.authToken}`;
    }
    return config;
  });

  // Response interceptor
  client.interceptors.response.use(
    response => response.data,
    error => {
      const message = error.response?.data?.message || error.message;
      throw new Error(message);
    }
  );

  return client;
}
```

## REST Operations

```javascript
class RESTClient {
  constructor(baseURL, options = {}) {
    this.client = createAPIClient(baseURL, options);
  }

  async get(endpoint, params = {}) {
    return await this.client.get(endpoint, { params });
  }

  async post(endpoint, data) {
    return await this.client.post(endpoint, data);
  }

  async put(endpoint, data) {
    return await this.client.put(endpoint, data);
  }

  async patch(endpoint, data) {
    return await this.client.patch(endpoint, data);
  }

  async delete(endpoint) {
    return await this.client.delete(endpoint);
  }
}
```

## Authentication Helpers

```javascript
// OAuth2 token refresh
async function refreshOAuthToken(tokenURL, clientId, clientSecret, refreshToken) {
  const response = await axios.post(tokenURL, {
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });
  return response.data;
}

// API Key authentication
function createAPIKeyClient(baseURL, apiKey, keyHeader = 'X-API-Key') {
  return createAPIClient(baseURL, {
    headers: { [keyHeader]: apiKey }
  });
}

// Basic auth
function createBasicAuthClient(baseURL, username, password) {
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return createAPIClient(baseURL, {
    headers: { Authorization: `Basic ${token}` }
  });
}
```

## Pagination Handling

```javascript
async function fetchAllPages(client, endpoint, options = {}) {
  const allData = [];
  let page = options.startPage || 1;
  let hasMore = true;

  while (hasMore) {
    const response = await client.get(endpoint, {
      [options.pageParam || 'page']: page,
      [options.limitParam || 'limit']: options.pageSize || 100
    });

    const data = options.dataKey ? response[options.dataKey] : response;
    allData.push(...data);

    // Check if more pages exist
    if (options.totalKey) {
      hasMore = allData.length < response[options.totalKey];
    } else {
      hasMore = data.length === (options.pageSize || 100);
    }

    page++;

    // Rate limiting
    if (options.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }
  }

  return allData;
}
```

## Retry Logic

```javascript
async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const baseDelay = options.baseDelay || 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Rate-limited requests
class RateLimiter {
  constructor(requestsPerSecond) {
    this.minInterval = 1000 / requestsPerSecond;
    this.lastRequest = 0;
  }

  async throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;

    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }

    this.lastRequest = Date.now();
  }
}
```

## Webhook Handler

```javascript
import crypto from 'crypto';

function verifyWebhookSignature(payload, signature, secret, algorithm = 'sha256') {
  const expectedSignature = crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

class WebhookProcessor {
  constructor(secret) {
    this.secret = secret;
    this.handlers = new Map();
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  async process(payload, signature) {
    if (this.secret && !verifyWebhookSignature(JSON.stringify(payload), signature, this.secret)) {
      throw new Error('Invalid webhook signature');
    }

    const event = payload.event || payload.type;
    const handler = this.handlers.get(event);

    if (handler) {
      return await handler(payload);
    }

    return { processed: false, event };
  }
}
```

## Common API Integrations

```javascript
// Slack
async function sendSlackMessage(webhookURL, message) {
  return await axios.post(webhookURL, {
    text: message.text,
    blocks: message.blocks,
    channel: message.channel
  });
}

// Discord
async function sendDiscordMessage(webhookURL, content, options = {}) {
  return await axios.post(webhookURL, {
    content,
    username: options.username,
    embeds: options.embeds
  });
}

// Twilio SMS
async function sendSMS(accountSid, authToken, from, to, body) {
  const client = createBasicAuthClient(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`,
    accountSid,
    authToken
  );

  return await client.post('/Messages.json', new URLSearchParams({ From: from, To: to, Body: body }));
}

// SendGrid Email
async function sendGridEmail(apiKey, email) {
  const client = createAPIClient('https://api.sendgrid.com/v3', { authToken: apiKey });

  return await client.post('/mail/send', {
    personalizations: [{ to: email.to.map(e => ({ email: e })) }],
    from: { email: email.from },
    subject: email.subject,
    content: [{ type: 'text/html', value: email.html }]
  });
}
```

## GraphQL Client

```javascript
async function graphqlQuery(endpoint, query, variables = {}, headers = {}) {
  const response = await axios.post(endpoint, { query, variables }, { headers });

  if (response.data.errors) {
    throw new Error(response.data.errors.map(e => e.message).join(', '));
  }

  return response.data.data;
}

class GraphQLClient {
  constructor(endpoint, options = {}) {
    this.endpoint = endpoint;
    this.headers = options.headers || {};
  }

  async query(query, variables) {
    return await graphqlQuery(this.endpoint, query, variables, this.headers);
  }

  async mutation(mutation, variables) {
    return await this.query(mutation, variables);
  }
}
```

## Usage Examples

```javascript
// REST client
const api = new RESTClient('https://api.example.com', { authToken: 'token123' });
const users = await api.get('/users', { limit: 10 });
const newUser = await api.post('/users', { name: 'John', email: 'john@example.com' });

// Fetch all paginated data
const allItems = await fetchAllPages(api, '/items', {
  pageSize: 100,
  dataKey: 'items',
  totalKey: 'total'
});

// With retry
const data = await withRetry(() => api.get('/unreliable-endpoint'), { maxRetries: 5 });

// Rate limited
const limiter = new RateLimiter(2); // 2 requests per second
for (const item of items) {
  await limiter.throttle();
  await api.post('/process', item);
}

// Webhooks
const webhook = new WebhookProcessor('secret123');
webhook.on('order.created', async (payload) => {
  console.log('New order:', payload.order_id);
});

// Send notifications
await sendSlackMessage(SLACK_WEBHOOK, { text: 'Deployment complete!' });
await sendDiscordMessage(DISCORD_WEBHOOK, 'Build succeeded');

// GraphQL
const gql = new GraphQLClient('https://api.example.com/graphql', { headers: { Authorization: 'Bearer token' } });
const result = await gql.query(`query { user(id: "123") { name email } }`);
```
