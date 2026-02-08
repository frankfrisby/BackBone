# BACKBONE App - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
cd backbone-app
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id

# BACKBONE API
NEXT_PUBLIC_BACKBONE_API=http://localhost:3000

# Alpaca Trading API (optional)
NEXT_PUBLIC_ALPACA_API_KEY=your_alpaca_api_key
NEXT_PUBLIC_ALPACA_SECRET_KEY=your_alpaca_secret_key
NEXT_PUBLIC_ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

### 3. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Enable Google Sign-In:
   - Go to Authentication → Sign-in method
   - Enable Google provider
   - Add your domain to authorized domains
4. Get your Firebase config:
   - Go to Project Settings → General
   - Scroll to "Your apps" → Web apps
   - Copy the config values to `.env.local`

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Sign In

Click "Sign in with Google" and use your Google account.

## Integration with BACKBONE Backend

The app expects API endpoints at `NEXT_PUBLIC_BACKBONE_API` (default: http://localhost:3000):

- `POST /api/chat` - Chat messages
- `GET /api/portfolio` - Portfolio summary
- `GET /api/positions` - Stock positions
- `GET /api/signals` - Trading signals
- `POST /api/trade` - Execute trades

**Currently using mock data.** To integrate with real BACKBONE backend:

1. Update API route handlers in `app/api/*/route.ts`
2. Connect to BACKBONE MCP server or REST API
3. Replace mock data with real data fetching

Example integration in `app/api/portfolio/route.ts`:

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Call BACKBONE backend
    const response = await fetch("http://localhost:3000/mcp/trading/portfolio");
    const data = await response.json();

    return NextResponse.json({
      equity: data.equity,
      buyingPower: data.buying_power,
      dayPL: data.day_pl,
      dayPLPercent: data.day_pl_percent,
      totalPL: data.total_pl,
      totalPLPercent: data.total_pl_percent,
    });
  } catch (error) {
    console.error("Portfolio API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}
```

## Optional: Alpaca Trading Integration

For live trading data:

1. Sign up at [Alpaca Markets](https://alpaca.markets/)
2. Get API keys (use Paper Trading for testing)
3. Add keys to `.env.local`
4. The app will use Alpaca API for real-time data

## Troubleshooting

### Firebase Auth Not Working

**Error**: "Firebase: Error (auth/unauthorized-domain)"

**Solution**: Add `localhost:3000` to authorized domains:
1. Firebase Console → Authentication → Settings
2. Scroll to "Authorized domains"
3. Add `localhost` or `localhost:3000`

### API Connection Failed

**Error**: "Failed to fetch portfolio"

**Solution**:
1. Check BACKBONE backend is running
2. Verify `NEXT_PUBLIC_BACKBONE_API` in `.env.local`
3. Check browser console for CORS errors
4. Add CORS headers to BACKBONE backend if needed

### Build Errors

**Error**: Module not found errors

**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors

**Error**: Type errors in components

**Solution**:
```bash
npm run build
# Fix reported type errors
```

## Production Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Docker

```bash
# Build
docker build -t backbone-app .

# Run
docker run -p 3000:3000 backbone-app
```

### Manual Build

```bash
npm run build
npm start
```

## Next Steps

1. **Customize Theme**: Edit `app/globals.css`
2. **Add Views**: Create new components in `components/dynamic-views/`
3. **Integrate APIs**: Update route handlers in `app/api/`
4. **Add Features**: Trading, calendar, goals, etc.

## Support

For issues, check the main README.md or contact the BACKBONE team.
