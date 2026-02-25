---
name: Outlook / Live.com Navigation
description: Navigate Outlook.com (live.com) for Microsoft email, calendar, and OneDrive
triggers: [outlook, live.com, hotmail, microsoft email, outlook mail, microsoft account]
type: web-navigation
url: https://outlook.live.com/mail/0/
---

# Outlook / Live.com Navigation

## When to Use
- User asks to check Outlook, Hotmail, or Live.com email
- User references their Microsoft account email
- User wants to access OneDrive, Calendar via Microsoft

## Browser Navigation
User is already logged into Microsoft in their browser.

### Key URLs
- Mail: `https://outlook.live.com/mail/0/`
- Calendar: `https://outlook.live.com/calendar/0/`
- OneDrive: `https://onedrive.live.com`
- Account: `https://account.live.com`

### Login Flow (if needed)
1. Navigate to `https://login.live.com`
2. Email field: `input[name="loginfmt"]`
3. Click Next
4. Password field: `input[name="passwd"]`
5. Click "Sign in"
6. "Stay signed in?" — click Yes
7. May require Microsoft Authenticator 2FA

### Reading Email
1. Inbox loads with message list on left, reading pane on right
2. Click message to read in pane
3. Focused Inbox vs Other tab at top

### Composing Email
1. Click "New mail" button (top-left)
2. To field, Subject field, Body area
3. Click Send

### Searching
1. Search bar at top of mail
2. Type query, press Enter
3. Filters: From, To, Has attachments, Date range

### Calendar
1. Navigate to calendar URL or click calendar icon in sidebar
2. Day/Week/Month views available
3. Click time slot to create event
