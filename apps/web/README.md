# BACKBONE App

A modern, dark-themed Next.js application for the BACKBONE life optimization engine. Features a swipeable chat interface, real-time portfolio tracking, health monitoring, and AI-powered insights.

## Features

- **Dark Theme UI**: Sleek, modern interface with glass-morphism effects
- **Swipeable Chat Interface**: Drag chat between bottom, left, and right positions
- **Dynamic Views**:
  - Portfolio View: Robinhood-inspired stock portfolio tracking
  - Health View: Oura Ring integration for sleep and activity data
  - Trading Signals: AI-powered buy/sell recommendations
  - Goals & Calendar (coming soon)
- **Firebase Authentication**: Secure Google Sign-In
- **Real-time Data**: Auto-refreshing portfolio and market data
- **Responsive Design**: Works on desktop, tablet, and mobile

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Animations**: Framer Motion
- **State Management**: TanStack Query (React Query)
- **Authentication**: Firebase Auth
- **APIs**: BACKBONE backend, Alpaca Trading API

## Prerequisites

- Node.js 18+ and npm
- Firebase project with Google Sign-In enabled
- BACKBONE backend running
- (Optional) Alpaca trading account for live data

## Installation

1. **Clone and navigate to the project**:
   ```bash
   cd backbone-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your credentials:
   - Firebase configuration (from Firebase Console)
   - BACKBONE API URL (default: http://localhost:3000)
   - Alpaca API keys (for trading features)

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open the app**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
backbone-app/
├── app/
│   ├── auth/login/           # Login page
│   ├── layout.tsx            # Root layout with providers
│   ├── page.tsx              # Main app page
│   ├── providers.tsx         # React Query provider
│   └── globals.css           # Global styles
├── components/
│   ├── ui/                   # shadcn/ui base components
│   ├── chat/                 # Chat interface components
│   │   ├── chat-interface.tsx
│   │   ├── chat-input.tsx
│   │   └── message-bubble.tsx
│   ├── dynamic-views/        # View components
│   │   ├── portfolio-view.tsx
│   │   ├── health-view.tsx
│   │   └── dynamic-renderer.tsx
│   └── layout/
│       └── app-shell.tsx     # Main app layout
├── lib/
│   ├── firebase.ts           # Firebase config and auth
│   ├── utils.ts              # Utility functions
│   └── api/
│       ├── backbone.ts       # BACKBONE API client
│       └── alpaca.ts         # Alpaca trading API client
└── hooks/
    └── use-swipe.ts          # Swipe gesture hook
```

## Features Overview

### Chat Interface

The chat interface is fully swipeable and can be positioned:
- **Bottom**: Default position, 40% of screen height
- **Left**: Docked to left side (400px wide)
- **Right**: Docked to right side (400px wide)
- **Minimized**: Small bubble in bottom-right corner

**Usage**:
- Drag the handle at the top to reposition
- Swipe left to dock right
- Swipe right to dock left
- Messages auto-scroll to bottom
- Real-time typing indicator

### Portfolio View

Robinhood-inspired portfolio tracking with:
- Total equity and P/L
- Day P/L and buying power
- Holdings list with current prices
- Unrealized gains/losses per position
- Buy/Sell buttons for each position
- Auto-refresh every 30 seconds

### Health View

Oura Ring data visualization:
- Readiness score
- Sleep score and duration
- Activity score
- HRV and resting heart rate
- Trend indicators

### Navigation

Sidebar navigation with icons:
- Portfolio (TrendingUp icon)
- Health (Activity icon)
- Trading (BarChart3 icon)
- Calendar (Calendar icon)
- Goals (Target icon)
- Sign Out (LogOut icon)

## API Integration

### BACKBONE API

The app expects the following endpoints on your BACKBONE backend:

```typescript
POST /api/chat
  Body: { message: string }
  Response: { role: "assistant", content: string, timestamp: number }

GET /api/portfolio
  Response: {
    equity: number,
    buyingPower: number,
    dayPL: number,
    dayPLPercent: number,
    totalPL: number,
    totalPLPercent: number
  }

GET /api/positions
  Response: Array<{
    symbol: string,
    qty: number,
    avgEntryPrice: number,
    currentPrice: number,
    marketValue: number,
    unrealizedPL: number,
    unrealizedPLPercent: number,
    side: "long" | "short"
  }>

GET /api/signals
  Response: Array<{
    symbol: string,
    action: "buy" | "sell" | "hold",
    score: number,
    reason: string
  }>

POST /api/trade
  Body: { symbol: string, action: "buy" | "sell", quantity: number }
```

### Alpaca API

Direct integration with Alpaca Markets for:
- Account information
- Position tracking
- Order placement
- Order management

## Customization

### Theme Colors

Edit `app/globals.css` to customize the dark theme:
- Primary background: `--background` (slate-950)
- Secondary background: `--card` (slate-900)
- Accent color: `--primary` (blue-500)
- Success: green-500
- Error: red-500

### Chat Position

Default chat position can be changed in `components/layout/app-shell.tsx`:
```typescript
const [chatPosition, setChatPosition] = useState<ChatPosition>("bottom");
```

### View Order

Customize navigation items in `app-shell.tsx`:
```typescript
const navItems = [
  { icon: TrendingUp, label: "Portfolio", view: "portfolio" as ViewType },
  // Add your custom views here
];
```

## Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

### Firebase Auth Not Working
- Check that Google Sign-In is enabled in Firebase Console
- Verify environment variables are set correctly
- Ensure `authDomain` matches your Firebase project

### API Connection Failed
- Verify BACKBONE backend is running
- Check `NEXT_PUBLIC_BACKBONE_API` URL in `.env.local`
- Look for CORS errors in browser console

### Chat Not Swipeable
- Framer Motion may need additional configuration
- Check browser compatibility (modern browsers only)
- Ensure touch events are enabled

## Development

### Adding a New View

1. Create view component in `components/dynamic-views/`:
   ```typescript
   export function MyCustomView() {
     return <div>My Custom View</div>;
   }
   ```

2. Add to `ViewType` in `dynamic-renderer.tsx`:
   ```typescript
   export type ViewType = "portfolio" | "health" | "mycustom";
   ```

3. Add to renderer switch:
   ```typescript
   case "mycustom":
     return <MyCustomView />;
   ```

4. Add navigation item in `app-shell.tsx`:
   ```typescript
   { icon: MyIcon, label: "Custom", view: "mycustom" as ViewType }
   ```

### Styling Components

Use Tailwind utility classes with the dark theme palette:
- `bg-slate-950` - Main background
- `bg-slate-900` - Card background
- `border-slate-700` - Borders
- `text-slate-100` - Primary text
- `text-slate-400` - Secondary text

## License

MIT

## Support

For issues and questions, please contact the BACKBONE development team.
