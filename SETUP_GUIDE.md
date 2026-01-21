# BACKBONE Setup Guide

Welcome to BACKBONE - your AI-powered life operating system. This guide will walk you through connecting all your integrations step by step.

## Quick Start

1. Copy `.env.example` to `.env`
2. Add your API keys (start with Claude for AI features)
3. Run `npm start` to launch BACKBONE

---

## 1. AI Models (Required - Pick at least one)

### Claude AI (Recommended)
Claude is the primary AI for complex reasoning and planning.

**How to get your API key:**
1. Go to https://console.anthropic.com
2. Sign up or log in
3. Navigate to "API Keys" in the sidebar
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-`)

**Add to .env:**
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### OpenAI GPT (Optional)
Used for lightweight tasks (GPT-4o-mini) and agentic reasoning (o3-mini).

**How to get your API key:**
1. Go to https://platform.openai.com
2. Sign up or log in
3. Go to "API Keys" section
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)

**Add to .env:**
```
OPENAI_API_KEY=sk-your-key-here
```

---

## 2. Stock/Portfolio Data

### Alpaca Markets (Trading Data)
Free API for stock market data and paper trading.

**How to set up:**
1. Go to https://alpaca.markets
2. Sign up for a free account
3. Go to "Paper Trading" section
4. Click "View API Keys"
5. Generate new keys

**Add to .env:**
```
ALPACA_KEY=your-api-key-id
ALPACA_SECRET=your-secret-key
ALPACA_URL=https://paper-api.alpaca.markets
ALPACA_DATA_URL=https://data.alpaca.markets
```

### Yahoo Finance (Free Stock Data)
No API key required! BACKBONE uses Yahoo Finance for real-time quotes.
Data refreshes every 3 minutes to avoid rate limiting.

---

## 3. Health & Wellness

### Oura Ring
Track sleep, readiness, and activity scores.

**How to set up:**
1. Go to https://cloud.ouraring.com
2. Log in with your Oura account
3. Go to "Personal Access Tokens"
4. Click "Create New Personal Access Token"
5. Give it a name like "BACKBONE"
6. Copy the token

**Add to .env:**
```
OURA_ACCESS_TOKEN=your-token-here
```

---

## 4. Social Media & Profile

### LinkedIn (Career & Education)
Connect LinkedIn to sync your career info and detect education status.

**How to set up:**
1. Go to https://www.linkedin.com/developers/apps
2. Click "Create App"
3. Fill in app details (name: BACKBONE, company: your company)
4. Once created, go to "Auth" tab
5. Add OAuth 2.0 scopes: `r_liteprofile`, `r_emailaddress`
6. Generate access token using OAuth flow
7. Note: You may need to use a tool like Postman to complete OAuth flow

**Add to .env:**
```
LINKEDIN_ACCESS_TOKEN=your-access-token
```

### GitHub (Code Backup)
Store your BACKBONE configuration in a private repo.

**How to set up:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a name: "BACKBONE"
4. Select scopes: `repo`, `user`
5. Generate and copy token

**Add to .env:**
```
GITHUB_ACCESS_TOKEN=ghp_your-token-here
GITHUB_USERNAME=your-username
GITHUB_REPO_NAME=backbone-private
```

---

## 5. Email Integration

### Gmail
Connect Gmail to track emails and detect .edu addresses.

**How to set up:**
1. Go to https://console.cloud.google.com
2. Create a new project
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Download credentials JSON
6. Use Google's OAuth playground or a script to get refresh token

**Add to .env:**
```
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
USER_EMAIL=your@email.com
```

### Outlook (Alternative)
1. Go to https://portal.azure.com
2. Register a new application
3. Add Mail.Read permission
4. Generate OAuth tokens

**Add to .env:**
```
OUTLOOK_CLIENT_ID=your-client-id
OUTLOOK_CLIENT_SECRET=your-secret
OUTLOOK_REFRESH_TOKEN=your-refresh-token
```

---

## 6. Wealth Management

### Plaid (Recommended - Aggregates All Accounts)
Plaid connects to most banks and brokerages.

**How to set up:**
1. Go to https://dashboard.plaid.com
2. Sign up for a free developer account
3. Get your client ID and secret
4. Use Plaid Link to connect your accounts and get access token

**Add to .env:**
```
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-secret
PLAID_ACCESS_TOKEN=your-access-token
```

### Robinhood (Direct Connection)
Note: Uses unofficial API - use at your own risk.

**Add to .env:**
```
ROBINHOOD_AUTH_TOKEN=your-auth-token
```

### Personal Capital / Empower
Note: Requires session token from browser.

**Add to .env:**
```
PERSONAL_CAPITAL_SESSION=your-session-token
```

---

## 7. Cloud Sync (Mobile Access)

### Firebase (Recommended)
Sync BACKBONE data to access from your phone.

**How to set up:**
1. Go to https://console.firebase.google.com
2. Create a new project
3. Go to Realtime Database
4. Create database in test mode
5. Go to Project Settings > Service Accounts
6. Generate new private key

**Add to .env:**
```
CLOUD_SYNC_PROVIDER=firebase
CLOUD_SYNC_API_KEY=your-database-secret
CLOUD_SYNC_PROJECT_ID=your-project-id
CLOUD_SYNC_USER_ID=your-user-id
```

---

## 8. Claude Code Integration (Advanced)

For background agentic work, install Claude Code CLI.

**How to set up:**
1. Install: `npm install -g @anthropic-ai/claude-code`
2. Authenticate: `claude auth login`
3. Enable in BACKBONE:

**Add to .env:**
```
CLAUDE_CODE_ENABLED=true
CLAUDE_CODE_WORKDIR=/path/to/your/workspace
```

---

## User Profile

Set your basic profile information:

```
USER_NAME=Your Name
USER_EMAIL=your@email.com
USER_ROLE=Your Job Title
USER_FOCUS=What you're focused on right now
USER_FOCUS_AREAS=startups,finance,health,education
```

---

## Complete .env Example

```env
# === AI Models (Required - pick at least one) ===
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# === User Profile ===
USER_NAME=Frank
USER_EMAIL=frank@university.edu
USER_ROLE=Founder
USER_FOCUS=Building the future

# === Stock Data ===
ALPACA_KEY=xxx
ALPACA_SECRET=xxx

# === Health ===
OURA_ACCESS_TOKEN=xxx

# === Social ===
LINKEDIN_ACCESS_TOKEN=xxx
GITHUB_ACCESS_TOKEN=ghp_xxx

# === Email ===
GMAIL_REFRESH_TOKEN=xxx

# === Wealth ===
PLAID_ACCESS_TOKEN=xxx

# === Cloud Sync ===
CLOUD_SYNC_PROVIDER=firebase
CLOUD_SYNC_PROJECT_ID=xxx
CLOUD_SYNC_API_KEY=xxx
```

---

## Troubleshooting

### "Missing keys" error
- Check that your API key is correctly copied (no extra spaces)
- Ensure the .env file is in the root directory
- Restart BACKBONE after changing .env

### "Offline" status
- Check your internet connection
- Verify the API key hasn't expired
- Check if the service has rate limits

### Data not updating
- Yahoo Finance updates every 3 minutes (rate limited)
- Alpaca updates every 1-5 seconds when connected
- Health data syncs hourly

---

## Getting Help

- Use `/help` in BACKBONE to see all commands
- Use `/connect` to see which integrations need setup
- Type any question to ask Claude for help

---

## Minimum Required Setup

To get started, you only need:
1. **Claude API key** - for AI features
2. **Your email** - for profile detection

Everything else is optional and can be added later!
