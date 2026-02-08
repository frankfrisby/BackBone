export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  viewType?: string;
  viewData?: any;
}

export interface PortfolioData {
  equity: number;
  buyingPower: number;
  dayPL: number;
  dayPLPercent: number;
  totalPL: number;
  totalPLPercent: number;
}

export interface Position {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  side: "long" | "short";
}

export interface TradingSignal {
  symbol: string;
  action: "buy" | "sell" | "hold";
  score: number;
  reason: string;
}

const API_BASE = "http://localhost:3000";

async function safeFetch(url: string, options?: RequestInit) {
  try {
    const resp = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  } catch {
    return null;
  }
}

export const backboneApi = {
  async sendMessage(message: string): Promise<ChatMessage> {
    const result = await safeFetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return (
      result || {
        role: "assistant" as const,
        content: "Unable to connect to BACKBONE server.",
        timestamp: Date.now(),
      }
    );
  },

  async getPortfolio(): Promise<PortfolioData | null> {
    return safeFetch(`${API_BASE}/api/portfolio`);
  },

  async getPositions(): Promise<Position[] | null> {
    return safeFetch(`${API_BASE}/api/positions`);
  },

  async getTradingSignals(): Promise<TradingSignal[] | null> {
    return safeFetch(`${API_BASE}/api/signals`);
  },

  async getHealth(): Promise<any> {
    return safeFetch(`${API_BASE}/api/health`);
  },

  async getGoals(): Promise<any> {
    return safeFetch(`${API_BASE}/api/goals`);
  },

  async executeTrade(
    symbol: string,
    action: "buy" | "sell",
    quantity: number
  ): Promise<any> {
    return safeFetch(`${API_BASE}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, action, quantity }),
    });
  },
};
