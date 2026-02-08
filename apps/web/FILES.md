# BACKBONE App - File Reference

Complete listing of all files in the project with descriptions.

## Configuration Files

| File | Description |
|------|-------------|
| `package.json` | NPM dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `next.config.mjs` | Next.js configuration (standalone build enabled) |
| `tailwind.config.ts` | Tailwind CSS configuration with dark theme |
| `postcss.config.mjs` | PostCSS configuration for Tailwind |
| `.eslintrc.json` | ESLint configuration |
| `.gitignore` | Git ignore patterns |
| `.dockerignore` | Docker ignore patterns |
| `.env.example` | Environment variable template |

## Application Code

### App Directory (`app/`)

| File | Description |
|------|-------------|
| `app/page.tsx` | Main app page - handles auth redirect |
| `app/layout.tsx` | Root layout with React Query provider |
| `app/providers.tsx` | React Query client setup |
| `app/globals.css` | Global styles with dark theme CSS variables |
| `app/favicon.ico` | Favicon placeholder |

### Authentication (`app/auth/`)

| File | Description |
|------|-------------|
| `app/auth/login/page.tsx` | Login page with Google Sign-In |

### API Routes (`app/api/`)

| File | Description |
|------|-------------|
| `app/api/chat/route.ts` | Chat message endpoint (currently mock) |
| `app/api/portfolio/route.ts` | Portfolio summary endpoint (mock) |
| `app/api/positions/route.ts` | Stock positions endpoint (mock) |
| `app/api/signals/route.ts` | Trading signals endpoint (mock) |
| `app/api/trade/route.ts` | Trade execution endpoint (mock) |

### Components

#### UI Components (`components/ui/`)

| File | Description |
|------|-------------|
| `components/ui/button.tsx` | shadcn button component |
| `components/ui/input.tsx` | shadcn input component |
| `components/ui/card.tsx` | shadcn card component |
| `components/ui/scroll-area.tsx` | shadcn scroll area component |
| `components/ui/avatar.tsx` | shadcn avatar component |

#### Chat Components (`components/chat/`)

| File | Description |
|------|-------------|
| `components/chat/chat-interface.tsx` | Main swipeable chat panel with Framer Motion |
| `components/chat/chat-input.tsx` | Message input field with send button |
| `components/chat/message-bubble.tsx` | Message display component |

#### Views (`components/dynamic-views/`)

| File | Description |
|------|-------------|
| `components/dynamic-views/dynamic-renderer.tsx` | View router - switches between different views |
| `components/dynamic-views/portfolio-view.tsx` | Robinhood-style portfolio view with React Query |
| `components/dynamic-views/health-view.tsx` | Health metrics view (Oura data) |

#### Layout (`components/layout/`)

| File | Description |
|------|-------------|
| `components/layout/app-shell.tsx` | Main app layout with sidebar navigation |

### Library Code (`lib/`)

| File | Description |
|------|-------------|
| `lib/utils.ts` | Utility functions (cn, formatCurrency, etc.) |
| `lib/firebase.ts` | Firebase auth configuration and functions |
| `lib/api/backbone.ts` | BACKBONE API client with TypeScript types |
| `lib/api/alpaca.ts` | Alpaca trading API client |

### Hooks (`hooks/`)

| File | Description |
|------|-------------|
| `hooks/use-swipe.ts` | Custom hook for swipe gesture detection |

## Documentation

| File | Description |
|------|-------------|
| `README.md` | Main project documentation with features and setup |
| `SETUP.md` | Detailed setup instructions |
| `INTEGRATION.md` | Backend integration guide with code examples |
| `PROJECT_SUMMARY.md` | Project overview and architecture |
| `QUICK_REFERENCE.md` | Quick reference for common tasks |
| `CHECKLIST.md` | Implementation checklist |
| `FILES.md` | This file - complete file reference |

## Deployment

| File | Description |
|------|-------------|
| `Dockerfile` | Docker image configuration |
| `docker-compose.yml` | Docker Compose configuration |
| `start-dev.bat` | Windows development server script |
| `start-dev.sh` | Unix development server script |

## Total Files

- **Application Code**: 29 files
- **Documentation**: 7 files
- **Configuration**: 9 files
- **Scripts**: 2 files

**Total: 47 files**

## File Size Summary

```
Small files (<1KB):   Configuration files
Medium files (1-5KB): Most components
Large files (>5KB):   Documentation files, main components
```

## Dependencies (package.json)

### Production Dependencies
- `next@14.2.18` - React framework
- `react@18.3.1` - UI library
- `react-dom@18.3.1` - React DOM
- `firebase@10.13.2` - Authentication
- `framer-motion@11.11.11` - Animations
- `lucide-react@0.454.0` - Icons
- `@tanstack/react-query@5.59.20` - Data fetching
- `class-variance-authority@0.7.1` - Component variants
- `clsx@2.1.1` - Class names utility
- `tailwind-merge@2.5.5` - Tailwind class merging

### Development Dependencies
- `typescript@5.6.3` - Type checking
- `tailwindcss@3.4.15` - CSS framework
- `tailwindcss-animate@1.0.7` - Tailwind animations
- `postcss@8.4.49` - CSS processing
- `autoprefixer@10.4.20` - CSS prefixing
- `eslint@8.57.1` - Code linting
- `eslint-config-next@14.2.18` - Next.js ESLint config
- `@types/*` - TypeScript type definitions

## Directory Structure

```
backbone-app/
├── app/                    # Next.js app directory
│   ├── api/                # API routes
│   │   ├── chat/
│   │   ├── portfolio/
│   │   ├── positions/
│   │   ├── signals/
│   │   └── trade/
│   ├── auth/               # Authentication pages
│   │   └── login/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── providers.tsx
│   ├── globals.css
│   └── favicon.ico
├── components/             # React components
│   ├── ui/                 # shadcn/ui components
│   ├── chat/               # Chat interface
│   ├── dynamic-views/      # Content views
│   └── layout/             # Layout components
├── lib/                    # Utility libraries
│   ├── api/                # API clients
│   ├── firebase.ts
│   └── utils.ts
├── hooks/                  # Custom React hooks
│   └── use-swipe.ts
├── public/                 # Static assets (empty)
├── Documentation files     # 7 markdown files
├── Configuration files     # 9 config files
└── Scripts                 # 2 start scripts
```

## Generated Directories (Not in Git)

- `node_modules/` - NPM packages (install with `npm install`)
- `.next/` - Next.js build output (generate with `npm run build`)
- `out/` - Static export (if using `next export`)

## Environment Files (Not in Git)

- `.env.local` - Local environment variables (create from `.env.example`)
- `.env.production` - Production environment variables (optional)

## Key Features by File

### Authentication Flow
1. `app/page.tsx` - Checks auth state
2. `lib/firebase.ts` - Provides auth functions
3. `app/auth/login/page.tsx` - Login UI
4. Firebase backend - Handles OAuth

### Chat Feature
1. `components/chat/chat-interface.tsx` - Main container with swipe
2. `components/chat/chat-input.tsx` - Input field
3. `components/chat/message-bubble.tsx` - Message display
4. `app/api/chat/route.ts` - Backend endpoint
5. `hooks/use-swipe.ts` - Gesture detection

### Portfolio Feature
1. `components/dynamic-views/portfolio-view.tsx` - UI
2. `app/api/portfolio/route.ts` - Portfolio data
3. `app/api/positions/route.ts` - Positions data
4. `lib/api/backbone.ts` - API client
5. React Query - Data fetching

### Health Feature
1. `components/dynamic-views/health-view.tsx` - UI
2. Future: `app/api/health/route.ts` - Health data
3. `lib/api/backbone.ts` - API client

### Navigation & Layout
1. `components/layout/app-shell.tsx` - Main layout
2. `components/dynamic-views/dynamic-renderer.tsx` - View router
3. `app/layout.tsx` - Root layout
4. `app/providers.tsx` - Global providers

## Quick Find

**Need to...**

- Change theme colors? → `app/globals.css`
- Add a new view? → `components/dynamic-views/`
- Modify API? → `app/api/*/route.ts`
- Update auth? → `lib/firebase.ts`
- Change chat position? → `components/layout/app-shell.tsx`
- Add dependencies? → `package.json`
- Configure TypeScript? → `tsconfig.json`
- Style components? → `tailwind.config.ts`

---

**Last Updated**: 2026-02-02
