export interface AlpacaAccount {
  id: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  qty: string;
  side: "long" | "short";
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  avg_entry_price: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  symbol: string;
  qty: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  filled_qty: string;
  filled_avg_price: string | null;
  status: string;
}

const ALPACA_API_KEY = process.env.NEXT_PUBLIC_ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.NEXT_PUBLIC_ALPACA_SECRET_KEY;
const ALPACA_BASE_URL =
  process.env.NEXT_PUBLIC_ALPACA_BASE_URL || "https://paper-api.alpaca.markets";

const headers = {
  "APCA-API-KEY-ID": ALPACA_API_KEY || "",
  "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY || "",
  "Content-Type": "application/json",
};

export const alpacaApi = {
  async getAccount(): Promise<AlpacaAccount> {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/account`, { headers });
    if (!response.ok) throw new Error("Failed to fetch account");
    return response.json();
  },

  async getPositions(): Promise<AlpacaPosition[]> {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/positions`, { headers });
    if (!response.ok) throw new Error("Failed to fetch positions");
    return response.json();
  },

  async placeOrder(
    symbol: string,
    qty: number,
    side: "buy" | "sell",
    type: "market" | "limit" = "market",
    timeInForce: "day" | "gtc" = "day"
  ): Promise<AlpacaOrder> {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        symbol,
        qty: qty.toString(),
        side,
        type,
        time_in_force: timeInForce,
      }),
    });
    if (!response.ok) throw new Error("Failed to place order");
    return response.json();
  },

  async getOrders(status?: string): Promise<AlpacaOrder[]> {
    const url = new URL(`${ALPACA_BASE_URL}/v2/orders`);
    if (status) url.searchParams.set("status", status);
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) throw new Error("Failed to fetch orders");
    return response.json();
  },

  async cancelOrder(orderId: string): Promise<void> {
    const response = await fetch(`${ALPACA_BASE_URL}/v2/orders/${orderId}`, {
      method: "DELETE",
      headers,
    });
    if (!response.ok) throw new Error("Failed to cancel order");
  },
};
