# BACKBONE App Integration Guide

This guide explains how to connect the Next.js app to the BACKBONE backend services.

## Architecture Overview

```
┌─────────────────────┐
│   Next.js App       │
│   (Port 3000)       │
└──────────┬──────────┘
           │
           │ HTTP/REST
           │
┌──────────▼──────────┐
│  BACKBONE Backend   │
│  - MCP Servers      │
│  - Trading Service  │
│  - Health Service   │
│  - Firebase Sync    │
└─────────────────────┘
```

## Integration Points

### 1. Chat Interface → BACKBONE AI

**Current State**: Mock responses
**Target**: Real-time AI chat via BACKBONE

#### Implementation

Update `app/api/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

const BACKBONE_API = process.env.BACKBONE_API || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    // Call BACKBONE chat endpoint
    const response = await fetch(`${BACKBONE_API}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) throw new Error("BACKBONE API error");

    const data = await response.json();

    return NextResponse.json({
      role: "assistant",
      content: data.response,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    );
  }
}
```

### 2. Portfolio View → Trading Service

**Current State**: Mock portfolio data
**Target**: Live data from Alpaca via BACKBONE

#### BACKBONE Backend Integration

Add to BACKBONE backend (`src/server.js` or create new route):

```javascript
// Portfolio endpoint
app.get("/api/portfolio", async (req, res) => {
  try {
    const portfolio = await backboneApi.getPortfolio();
    res.json({
      equity: parseFloat(portfolio.equity),
      buyingPower: parseFloat(portfolio.buying_power),
      dayPL: parseFloat(portfolio.day_pl),
      dayPLPercent: parseFloat(portfolio.day_pl_percent),
      totalPL: parseFloat(portfolio.total_pl),
      totalPLPercent: parseFloat(portfolio.total_pl_percent),
    });
  } catch (error) {
    console.error("Portfolio error:", error);
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

// Positions endpoint
app.get("/api/positions", async (req, res) => {
  try {
    const positions = await backboneApi.getPositions();
    const formatted = positions.map(p => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      avgEntryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price),
      marketValue: parseFloat(p.market_value),
      unrealizedPL: parseFloat(p.unrealized_pl),
      unrealizedPLPercent: parseFloat(p.unrealized_plpc) * 100,
      side: p.side,
    }));
    res.json(formatted);
  } catch (error) {
    console.error("Positions error:", error);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});
```

#### Next.js API Routes

Update `app/api/portfolio/route.ts`:

```typescript
import { NextResponse } from "next/server";

const BACKBONE_API = process.env.BACKBONE_API || "http://localhost:3001";

export async function GET() {
  try {
    const response = await fetch(`${BACKBONE_API}/api/portfolio`);
    if (!response.ok) throw new Error("BACKBONE API error");

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Portfolio API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}
```

Update `app/api/positions/route.ts`:

```typescript
import { NextResponse } from "next/server";

const BACKBONE_API = process.env.BACKBONE_API || "http://localhost:3001";

export async function GET() {
  try {
    const response = await fetch(`${BACKBONE_API}/api/positions`);
    if (!response.ok) throw new Error("BACKBONE API error");

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Positions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
```

### 3. Health View → Oura Integration

**Current State**: Mock health data
**Target**: Real Oura Ring data from BACKBONE

#### BACKBONE Backend

```javascript
app.get("/api/health/summary", async (req, res) => {
  try {
    const healthData = await getHealthSummary(); // From backbone-health MCP
    res.json({
      readinessScore: healthData.readiness_score,
      sleepScore: healthData.sleep_score,
      activityScore: healthData.activity_score,
      lastNightSleep: healthData.sleep_duration_hours,
      hrvAverage: healthData.hrv_average,
      restingHeartRate: healthData.resting_heart_rate,
    });
  } catch (error) {
    console.error("Health error:", error);
    res.status(500).json({ error: "Failed to fetch health data" });
  }
});
```

#### Next.js API Route

Create `app/api/health/route.ts`:

```typescript
import { NextResponse } from "next/server";

const BACKBONE_API = process.env.BACKBONE_API || "http://localhost:3001";

export async function GET() {
  try {
    const response = await fetch(`${BACKBONE_API}/api/health/summary`);
    if (!response.ok) throw new Error("BACKBONE API error");

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Health API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch health data" },
      { status: 500 }
    );
  }
}
```

Update `components/dynamic-views/health-view.tsx`:

```typescript
import { useQuery } from "@tanstack/react-query";

export function HealthView() {
  const { data: healthData, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("Failed to fetch health data");
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return <div className="h-full flex items-center justify-center">
      <div className="text-slate-400">Loading health data...</div>
    </div>;
  }

  // Render with real data
  return (
    // ... existing UI with healthData
  );
}
```

### 4. Trading Signals → Score Engine

**Current State**: Mock signals
**Target**: Real trading signals from BACKBONE score engine

#### BACKBONE Backend

```javascript
app.get("/api/signals", async (req, res) => {
  try {
    const signals = await getTradingSignals(); // From trading service
    res.json(signals);
  } catch (error) {
    console.error("Signals error:", error);
    res.status(500).json({ error: "Failed to fetch trading signals" });
  }
});
```

#### Next.js API Route

Update `app/api/signals/route.ts`:

```typescript
import { NextResponse } from "next/server";

const BACKBONE_API = process.env.BACKBONE_API || "http://localhost:3001";

export async function GET() {
  try {
    const response = await fetch(`${BACKBONE_API}/api/signals`);
    if (!response.ok) throw new Error("BACKBONE API error");

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Signals API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch trading signals" },
      { status: 500 }
    );
  }
}
```

### 5. Trade Execution → Alpaca API

**Current State**: Mock trade confirmation
**Target**: Real trade execution via BACKBONE

#### BACKBONE Backend

```javascript
app.post("/api/trade", async (req, res) => {
  try {
    const { symbol, action, quantity } = req.body;

    // Use BACKBONE trading service
    const result = await backboneTradingApi[action === "buy" ? "buyStock" : "sellStock"](
      symbol,
      quantity,
      "Web app trade"
    );

    res.json({
      success: true,
      message: `${action} order for ${quantity} shares of ${symbol} placed successfully`,
      orderId: result.id,
    });
  } catch (error) {
    console.error("Trade error:", error);
    res.status(500).json({ error: "Failed to execute trade" });
  }
});
```

#### Next.js API Route

Update `app/api/trade/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

const BACKBONE_API = process.env.BACKBONE_API || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const { symbol, action, quantity } = await request.json();

    const response = await fetch(`${BACKBONE_API}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, action, quantity }),
    });

    if (!response.ok) throw new Error("BACKBONE API error");

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Trade API error:", error);
    return NextResponse.json(
      { error: "Failed to execute trade" },
      { status: 500 }
    );
  }
}
```

## CORS Configuration

Add CORS headers to BACKBONE backend to allow Next.js app requests:

```javascript
// In BACKBONE backend (src/server.js or similar)
const cors = require("cors");

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
```

Or add CORS headers manually:

```javascript
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});
```

## Environment Configuration

### Next.js App (.env.local)

```env
NEXT_PUBLIC_BACKBONE_API=http://localhost:3001
```

### BACKBONE Backend (.env)

```env
FRONTEND_URL=http://localhost:3000
PORT=3001
```

## Testing Integration

1. **Start BACKBONE backend**:
   ```bash
   cd backbone
   npm start  # or backbone.bat
   ```

2. **Start Next.js app**:
   ```bash
   cd backbone-app
   npm run dev
   ```

3. **Test endpoints**:
   - Chat: Send a message in the app
   - Portfolio: View portfolio page
   - Health: View health page
   - Signals: Check trading signals

4. **Verify in browser console**:
   ```javascript
   // Open DevTools → Console
   fetch("http://localhost:3001/api/portfolio")
     .then(r => r.json())
     .then(console.log);
   ```

## Troubleshooting

### CORS Errors

**Error**: "Access to fetch at 'http://localhost:3001' has been blocked by CORS policy"

**Solution**: Add CORS middleware to BACKBONE backend (see above)

### Connection Refused

**Error**: "Failed to fetch"

**Solution**:
1. Check BACKBONE backend is running on correct port
2. Verify `NEXT_PUBLIC_BACKBONE_API` URL
3. Check firewall settings

### Authentication Issues

**Error**: "Unauthorized"

**Solution**:
1. Pass Firebase auth token in headers
2. Implement token validation in BACKBONE backend

## Production Deployment

### Separate Deployments

**BACKBONE Backend**: Deploy to dedicated server/VPS
**Next.js App**: Deploy to Vercel/Netlify

Update environment variables:
```env
NEXT_PUBLIC_BACKBONE_API=https://backbone-api.yourdom ain.com
```

### Same Server

Use reverse proxy (nginx):

```nginx
server {
  listen 80;
  server_name yourdomain.com;

  location /api/ {
    proxy_pass http://localhost:3001;
  }

  location / {
    proxy_pass http://localhost:3000;
  }
}
```

## Next Steps

1. Implement WebSocket for real-time updates
2. Add authentication middleware
3. Implement caching layer (Redis)
4. Add error tracking (Sentry)
5. Set up monitoring (Datadog, New Relic)

## Support

For integration issues, check the BACKBONE backend logs and Next.js app console.
