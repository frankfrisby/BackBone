# BACKBONE App - Quick Reference

## Essential Commands

```bash
# Development
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Build for production
npm start            # Run production server
npm run lint         # Run ESLint

# Docker
docker-compose up    # Start with Docker
docker-compose down  # Stop Docker containers
```

## File Structure (Key Files)

```
backbone-app/
├── app/
│   ├── page.tsx                      # Main app (redirects to login if not authenticated)
│   ├── auth/login/page.tsx           # Login page
│   ├── layout.tsx                    # Root layout
│   ├── providers.tsx                 # React Query setup
│   └── api/                          # API routes (currently mock data)
├── components/
│   ├── chat/chat-interface.tsx       # Swipeable chat panel
│   ├── layout/app-shell.tsx          # Main layout with sidebar
│   └── dynamic-views/
│       ├── portfolio-view.tsx        # Stock portfolio UI
│       └── health-view.tsx           # Health metrics UI
├── lib/
│   ├── firebase.ts                   # Auth config
│   └── api/
│       ├── backbone.ts               # Backend API client
│       └── alpaca.ts                 # Trading API client
└── .env.local                        # Your environment variables (not in git)
```

## Environment Variables

Create `.env.local`:

```env
# Firebase (required for login)
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# BACKBONE Backend (required for data)
NEXT_PUBLIC_BACKBONE_API=http://localhost:3001
```

## Quick Customization

### Change Theme Colors

Edit `app/globals.css` - look for the `:root` section:

```css
:root {
  --primary: 217.2 91.2% 59.8%;    /* Blue accent */
  --background: 222.2 84% 4.9%;    /* Dark background */
  /* ... etc */
}
```

### Add a New View

1. Create `components/dynamic-views/my-view.tsx`:
   ```tsx
   export function MyView() {
     return <div>My Custom View</div>;
   }
   ```

2. Update `components/dynamic-views/dynamic-renderer.tsx`:
   ```tsx
   export type ViewType = "portfolio" | "health" | "myview";

   // In switch statement:
   case "myview":
     return <MyView />;
   ```

3. Add to sidebar in `components/layout/app-shell.tsx`:
   ```tsx
   { icon: MyIcon, label: "My View", view: "myview" as ViewType }
   ```

### Change Chat Position Default

Edit `components/layout/app-shell.tsx`:

```tsx
const [chatPosition, setChatPosition] = useState<ChatPosition>("left"); // or "right"
```

## API Integration Checklist

1. **Start BACKBONE backend** on port 3001
2. **Set env variable**: `NEXT_PUBLIC_BACKBONE_API=http://localhost:3001`
3. **Update API routes** in `app/api/*/route.ts`:
   ```tsx
   const response = await fetch(`${process.env.BACKBONE_API}/api/endpoint`);
   ```
4. **Test**: Open app and check browser console for errors

## Common Issues

### Login doesn't work
- Check Firebase config in `.env.local`
- Verify Google Sign-In is enabled in Firebase Console
- Add `localhost` to authorized domains in Firebase

### API calls fail
- Check BACKBONE backend is running
- Verify `NEXT_PUBLIC_BACKBONE_API` URL
- Look for CORS errors in browser console

### Build fails
```bash
rm -rf node_modules .next
npm install
npm run build
```

### TypeScript errors
```bash
npm run build  # Shows all type errors
# Fix reported errors
```

## Component Props Reference

### ChatInterface
```tsx
<ChatInterface
  position="bottom" | "left" | "right" | "minimized"
  onPositionChange={(pos) => setPosition(pos)}
/>
```

### DynamicRenderer
```tsx
<DynamicRenderer viewType="portfolio" | "health" | "trading" | "calendar" | "goals" />
```

### Button (shadcn)
```tsx
<Button
  variant="default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size="default" | "sm" | "lg" | "icon"
>
  Click me
</Button>
```

## Styling Quick Reference

```tsx
// Backgrounds
bg-slate-950    // Main background
bg-slate-900    // Card background
bg-slate-800    // Input background

// Borders
border-slate-700

// Text
text-slate-100  // Primary
text-slate-400  // Secondary

// Colors
text-blue-500   // Accent
text-green-500  // Success
text-red-500    // Error

// Utility
glass           // Glass morphism effect
```

## Data Flow

```
User Action (UI)
    ↓
React Query (hooks)
    ↓
API Route (/app/api/*)
    ↓
BACKBONE Backend
    ↓
External APIs (Alpaca, Oura, etc.)
```

## Useful Snippets

### Fetch with React Query
```tsx
const { data, isLoading } = useQuery({
  queryKey: ["mydata"],
  queryFn: async () => {
    const res = await fetch("/api/myendpoint");
    return res.json();
  },
  refetchInterval: 30000, // Auto-refresh every 30s
});
```

### API Route Handler
```tsx
// app/api/myendpoint/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  const data = await fetchDataFromBackbone();
  return NextResponse.json(data);
}
```

### Protected Component
```tsx
"use client";
import { useEffect, useState } from "react";
import { onAuthStateChange } from "@/lib/firebase";

export default function MyPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    return onAuthStateChange(setUser);
  }, []);

  if (!user) return <div>Please log in</div>;

  return <div>Welcome {user.displayName}</div>;
}
```

## Production Checklist

- [ ] Set all environment variables in production
- [ ] Enable CORS on BACKBONE backend
- [ ] Update `NEXT_PUBLIC_BACKBONE_API` to production URL
- [ ] Test login flow
- [ ] Test all API endpoints
- [ ] Run `npm run build` to check for errors
- [ ] Set up error tracking (Sentry)
- [ ] Configure CDN for static assets
- [ ] Enable Firebase production mode
- [ ] Add monitoring (analytics, logs)

## Helpful Links

- **Next.js Docs**: https://nextjs.org/docs
- **TanStack Query**: https://tanstack.com/query
- **shadcn/ui**: https://ui.shadcn.com
- **Tailwind CSS**: https://tailwindcss.com
- **Framer Motion**: https://www.framer.com/motion
- **Firebase**: https://firebase.google.com/docs

## Support

Need help? Check:
1. README.md - Overview and features
2. SETUP.md - Detailed setup instructions
3. INTEGRATION.md - Backend integration guide
4. PROJECT_SUMMARY.md - Project architecture

---

**Pro Tip**: Keep this file bookmarked for quick reference during development!
