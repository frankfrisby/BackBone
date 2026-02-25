---
name: Google Search & Services
description: Navigate Google Search, Google Drive, Google Calendar, YouTube
triggers: [google, search, google drive, google calendar, youtube, google docs, google sheets]
type: web-navigation
url: https://www.google.com
---

# Google Navigation

## When to Use
- User asks to search for something on Google
- User wants to access Google Drive, Docs, Sheets, Calendar
- User wants to watch or search YouTube

## Key URLs
- Search: `https://www.google.com`
- Drive: `https://drive.google.com`
- Docs: `https://docs.google.com`
- Sheets: `https://sheets.google.com`
- Calendar: `https://calendar.google.com`
- YouTube: `https://www.youtube.com`
- Maps: `https://www.google.com/maps`
- Photos: `https://photos.google.com`

## Google Search
1. Navigate to `https://www.google.com`
2. Search field: `input[name="q"]` or `textarea[name="q"]`
3. Type query and press Enter
4. Results page: organic results, featured snippets, knowledge panel
5. Click result to navigate

## Google Drive
1. Navigate to `https://drive.google.com`
2. "My Drive" shows all files
3. Search bar at top for finding files
4. Click file to open in Docs/Sheets/Slides viewer
5. "New" button to create new document

## Google Calendar
1. Navigate to `https://calendar.google.com`
2. Day/Week/Month views
3. Click time slot to create event
4. Existing events show in colored blocks

## YouTube
1. Navigate to `https://www.youtube.com`
2. Search bar at top
3. Click video to play
4. Subscriptions in left sidebar

## MCP Alternatives
- `backbone-google` → `get_today_events`, `get_upcoming_events`, `create_event`, `search_emails`
- `backbone-youtube` → `search_youtube`, `get_video_info`, `get_video_transcript`
