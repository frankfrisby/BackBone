# BACKBONE App - Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    BACKBONE APP                          │  │
│  │                   (Next.js 14)                           │  │
│  │                                                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────────────┐  │  │
│  │  │  Login     │  │  Portfolio │  │  Health Dashboard │  │  │
│  │  │  Page      │  │  View      │  │                   │  │  │
│  │  └────────────┘  └────────────┘  └───────────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │          Swipeable Chat Interface                │   │  │
│  │  │          (Bottom / Left / Right)                 │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                             ▲ │
                             │ │ HTTP/REST
                             │ ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS API ROUTES                           │
│                                                                 │
│  /api/chat        /api/portfolio      /api/positions           │
│  /api/signals     /api/trade          /api/health              │
└─────────────────────────────────────────────────────────────────┘
                             ▲ │
                             │ │
                             │ ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKBONE BACKEND                             │
│                    (Node.js Server)                             │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Trading      │  │ Health       │  │ AI Chat             │  │
│  │ Service      │  │ Service      │  │ (Claude MCP)        │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           │                │                      │
           ▼                ▼                      ▼
┌─────────────────┐ ┌─────────────────┐  ┌─────────────────┐
│  Alpaca API     │ │  Oura API       │  │  Anthropic API  │
│  (Trading)      │ │  (Health)       │  │  (AI)           │
└─────────────────┘ └─────────────────┘  └─────────────────┘

        ┌──────────────────────┐
        │  Firebase Auth       │
        │  (Google Sign-In)    │
        └──────────────────────┘
```

## Component Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        APP SHELL                              │
│  ┌─────────┐  ┌──────────────────────────────────────────┐   │
│  │ Sidebar │  │         Dynamic View Area                │   │
│  │         │  │                                          │   │
│  │ • Port  │  │  ┌────────────────────────────────────┐  │   │
│  │ • Health│  │  │                                    │  │   │
│  │ • Trade │  │  │     <DynamicRenderer />            │  │   │
│  │ • Cal   │  │  │                                    │  │   │
│  │ • Goals │  │  │  - PortfolioView                   │  │   │
│  │         │  │  │  - HealthView                      │  │   │
│  │ [Sign   │  │  │  - TradingView (coming soon)       │  │   │
│  │  Out]   │  │  │  - CalendarView (coming soon)      │  │   │
│  │         │  │  │  - GoalsView (coming soon)         │  │   │
│  └─────────┘  │  │                                    │  │   │
│               │  └────────────────────────────────────┘  │   │
│               └──────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            Chat Interface (Swipeable)                │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Messages (ScrollArea)                       │   │   │
│  │  │  • User message bubbles (right, blue)        │   │   │
│  │  │  • AI message bubbles (left, gray)           │   │   │
│  │  │  • Typing indicator                          │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  [Input field]              [Send button]    │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

## Data Flow

### User Message Flow

```
User types message
        │
        ▼
ChatInput component
        │
        ▼
ChatInterface.handleSend()
        │
        ▼
POST /api/chat
        │
        ▼
BACKBONE Backend
        │
        ▼
Claude AI (Anthropic)
        │
        ▼
Response flows back
        │
        ▼
ChatInterface updates state
        │
        ▼
MessageBubble renders response
```

### Portfolio Data Flow

```
PortfolioView loads
        │
        ▼
React Query hook
        │
        ▼
GET /api/portfolio
GET /api/positions
        │
        ▼
BACKBONE Backend
        │
        ▼
Alpaca Trading API
        │
        ▼
Data returns to frontend
        │
        ▼
React Query caches data
        │
        ▼
Auto-refresh every 30s
```

### Authentication Flow

```
User visits app
        │
        ▼
app/page.tsx checks auth
        │
        ├─ Not authenticated ──▶ Redirect to /auth/login
        │                              │
        │                              ▼
        │                        User clicks "Sign in with Google"
        │                              │
        │                              ▼
        │                        Firebase Auth popup
        │                              │
        │                              ▼
        │                        Google OAuth
        │                              │
        │                              ▼
        │                        Firebase returns token
        │                              │
        └─ Authenticated ──────────────┘
                    │
                    ▼
              App loads with user session
                    │
                    ▼
              AppShell renders
```

## State Management

```
┌──────────────────────────────────────────────────────────┐
│                    GLOBAL STATE                          │
│                                                          │
│  ┌─────────────────────┐     ┌─────────────────────┐   │
│  │  React Query Cache  │     │  Firebase Auth      │   │
│  │  • Portfolio data   │     │  • User object      │   │
│  │  • Positions        │     │  • Auth token       │   │
│  │  • Health data      │     │  • Sign-in state    │   │
│  │  • Trading signals  │     └─────────────────────┘   │
│  └─────────────────────┘                                │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │           LOCAL COMPONENT STATE                 │   │
│  │  • Chat messages (ChatInterface)                │   │
│  │  • Chat position (AppShell)                     │   │
│  │  • Current view (AppShell)                      │   │
│  │  • Input values (ChatInput)                     │   │
│  │  • Loading states (all components)              │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## File Organization Strategy

```
app/
├── Layout & Routing        (Next.js App Router)
│   ├── page.tsx            Main entry point
│   ├── layout.tsx          Root layout
│   └── auth/               Auth pages
│
└── API Routes              (Backend endpoints)
    └── api/                REST API handlers

components/
├── ui/                     Reusable UI primitives (shadcn)
├── chat/                   Chat feature components
├── dynamic-views/          Content view components
└── layout/                 Layout components

lib/
├── Utilities               Pure functions
├── API Clients             External API wrappers
└── Configuration           Firebase, etc.

hooks/
└── Custom Hooks            Reusable React hooks
```

## Technology Layers

```
┌──────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                      │
│  • React Components                                      │
│  • Tailwind CSS styling                                 │
│  • Framer Motion animations                             │
│  • Responsive design                                     │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  STATE MANAGEMENT LAYER                                  │
│  • React Query (server state)                            │
│  • React Hooks (local state)                             │
│  • Firebase Auth (auth state)                            │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  API LAYER                                               │
│  • Next.js API routes                                    │
│  • API clients (backbone, alpaca)                        │
│  • Type-safe interfaces                                  │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                       │
│  • BACKBONE Backend                                      │
│  • Firebase Auth                                         │
│  • Alpaca Trading API                                    │
│  • Oura Health API                                       │
│  • Anthropic AI API                                      │
└──────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌──────────────────────────────────────────────────────────┐
│  AUTHENTICATION                                          │
│  • Firebase Auth with Google OAuth                       │
│  • JWT tokens                                            │
│  • Protected routes (auth check in page.tsx)             │
│  • Session management                                    │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  API SECURITY                                            │
│  • HTTPS only (production)                               │
│  • CORS configuration                                    │
│  • Rate limiting (future)                                │
│  • Input validation (future)                             │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│  DATA SECURITY                                           │
│  • Environment variables (.env.local)                    │
│  • API keys not in client code                           │
│  • Secure cookie handling                                │
│  • No sensitive data in localStorage                     │
└──────────────────────────────────────────────────────────┘
```

## Deployment Architecture

### Development

```
┌──────────────┐
│  localhost   │
│  :3000       │  Next.js Dev Server
└──────────────┘
       │
       ▼
┌──────────────┐
│  localhost   │
│  :3001       │  BACKBONE Backend
└──────────────┘
```

### Production (Recommended)

```
┌──────────────────┐
│  Vercel          │
│  (Next.js)       │  ← Frontend hosting
└──────────────────┘
         │
         │ HTTPS
         ▼
┌──────────────────┐
│  VPS/Cloud       │
│  (BACKBONE)      │  ← Backend server
└──────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  External APIs                       │
│  • Alpaca                            │
│  • Oura                              │
│  • Anthropic                         │
└──────────────────────────────────────┘

┌──────────────────┐
│  Firebase        │  ← Authentication
└──────────────────┘
```

## Performance Optimizations

```
┌──────────────────────────────────────────────────────────┐
│  CACHING STRATEGIES                                      │
│  • React Query cache (60s stale time)                    │
│  • Next.js static generation (build time)                │
│  • CDN caching (Vercel Edge Network)                     │
│  • Browser caching (static assets)                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  CODE SPLITTING                                          │
│  • Dynamic imports (next/dynamic)                        │
│  • Route-based splitting (App Router)                    │
│  • Component-level splitting (lazy loading)              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  OPTIMIZATION TECHNIQUES                                 │
│  • Image optimization (next/image)                       │
│  • Font optimization (next/font)                         │
│  • Tree shaking (unused code removal)                    │
│  • Minification (production build)                       │
└──────────────────────────────────────────────────────────┘
```

## Scalability Considerations

```
Current Design:
  Single Next.js server → BACKBONE Backend → External APIs

Future Scalability:

  ┌─────────────────┐
  │  Load Balancer  │
  └─────────────────┘
           │
     ┌─────┴─────┬─────────┐
     ▼           ▼         ▼
  ┌─────┐    ┌─────┐   ┌─────┐
  │ App │    │ App │   │ App │  ← Multiple Next.js instances
  │  1  │    │  2  │   │  3  │
  └─────┘    └─────┘   └─────┘
     │           │         │
     └─────┬─────┴─────────┘
           ▼
  ┌─────────────────┐
  │  Redis Cache    │  ← Shared cache layer
  └─────────────────┘
           │
           ▼
  ┌─────────────────┐
  │  BACKBONE       │
  │  Backend Cluster│  ← Horizontal scaling
  └─────────────────┘
```

## Error Handling Flow

```
Error occurs in component
        │
        ▼
Component catches error
        │
        ├─ Display user-friendly message
        │
        ├─ Log to console (dev)
        │
        └─ Send to error tracking service (prod)
              │
              ▼
        ┌──────────────┐
        │  Sentry      │  (future)
        │  Datadog     │
        │  etc.        │
        └──────────────┘
```

## Future Architecture Enhancements

1. **WebSocket Integration**
   - Real-time updates for portfolio
   - Live chat notifications
   - Instant trade confirmations

2. **Service Worker**
   - Offline support
   - Push notifications
   - Background sync

3. **Edge Functions**
   - Faster API responses
   - Global distribution
   - Reduced latency

4. **Database Layer**
   - User preferences storage
   - Chat history persistence
   - Analytics data

---

**Architecture Version**: 1.0
**Last Updated**: 2026-02-02
