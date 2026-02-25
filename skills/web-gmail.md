---
name: Gmail Navigation
description: Navigate Gmail to read, search, compose, and manage email
triggers: [gmail, email, inbox, compose email, check email, google mail]
type: web-navigation
url: https://mail.google.com
---

# Gmail Navigation

## When to Use
- User asks to check email, read messages, send email
- User asks about specific emails or senders
- User wants to compose or reply to messages

## Preferred Method
Use MCP tools first:
- `backbone-google` → `get_recent_emails`, `search_emails`, `get_email_body`, `draft_email`

## Browser Navigation (fallback)
User is already logged into Google in Chrome — no credentials needed.

### Key URLs
- Inbox: `https://mail.google.com/mail/u/0/#inbox`
- Compose: `https://mail.google.com/mail/u/0/#inbox?compose=new`
- Sent: `https://mail.google.com/mail/u/0/#sent`
- Search: Use the search bar at top of inbox

### Navigation Flow
1. Navigate to `https://mail.google.com`
2. If logged in: inbox loads directly
3. If not: Google login page — email field → password field → 2FA if enabled

### Reading Email
1. Inbox shows sender, subject, snippet, date
2. Click a row to open the email
3. Full email body loads in reading pane or full view
4. Use back arrow or inbox link to return

### Composing Email
1. Click "Compose" button (bottom-left, red/blue button)
2. To field: type recipient email
3. Subject field: type subject
4. Body: large text area below subject
5. Send: click "Send" button (bottom of compose window)

### Searching
1. Search bar at top: `input[aria-label="Search mail"]`
2. Type query and press Enter
3. Advanced: `from:person@email.com`, `subject:keyword`, `has:attachment`, `after:2026/01/01`

### Key Elements
- Compose button: `div[gh="cm"]` or text "Compose"
- Inbox count: shown in tab title "Inbox (5)"
- Star: click star icon on email row
- Archive: select email → click archive icon
- Delete: select email → click trash icon
