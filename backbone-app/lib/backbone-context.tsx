"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { getBackboneConnection } from "./connection";

// ── Types ────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  viewTabId?: string;
}

export interface Tab {
  id: string;
  type: "view" | "chat" | "call";
  viewType?: string;
  title: string;
  data: any;
  createdAt: number;
  isLive: boolean;
}

export type Panel = "chat" | "view" | "tabs";

interface AppState {
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  transport: string | null;
  messages: Message[];
  isProcessing: boolean;
  activeTab: Tab | null;
  tabs: Tab[];
  currentPanel: Panel;
  hasQueried: boolean;
}

type Action =
  | { type: "SET_CONNECTION"; status: string; transport: string }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "SET_PROCESSING"; value: boolean }
  | { type: "SET_ACTIVE_TAB"; tab: Tab | null }
  | { type: "ADD_TAB"; tab: Tab }
  | { type: "REMOVE_TAB"; tabId: string }
  | { type: "SET_PANEL"; panel: Panel }
  | { type: "SET_HAS_QUERIED" }
  | { type: "LOAD_CACHED"; tabs: Tab[]; messages: Message[] };

// ── View Cache ───────────────────────────────────────────────

const CACHE_KEY = "backbone_view_cache";
const MSG_CACHE_KEY = "backbone_msg_cache";

function saveTabsToCache(tabs: Tab[]) {
  try {
    const serializable = tabs.map((t) => ({ ...t, data: null })); // Don't cache heavy data
    localStorage.setItem(CACHE_KEY, JSON.stringify(serializable));
  } catch { /* quota exceeded or SSR */ }
}

function saveMsgsToCache(messages: Message[]) {
  try {
    const recent = messages.slice(-50); // Keep last 50 messages
    localStorage.setItem(MSG_CACHE_KEY, JSON.stringify(recent));
  } catch { /* ignore */ }
}

function loadCache(): { tabs: Tab[]; messages: Message[] } {
  try {
    const tabs = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    const messages = JSON.parse(localStorage.getItem(MSG_CACHE_KEY) || "[]");
    return { tabs, messages };
  } catch {
    return { tabs: [], messages: [] };
  }
}

// ── Reducer ──────────────────────────────────────────────────

const initialState: AppState = {
  connectionStatus: "disconnected",
  transport: null,
  messages: [],
  isProcessing: false,
  activeTab: null,
  tabs: [],
  currentPanel: "view",
  hasQueried: false,
};

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_CONNECTION":
      return {
        ...state,
        connectionStatus: action.status as any,
        transport: action.transport,
      };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };
    case "SET_PROCESSING":
      return { ...state, isProcessing: action.value };
    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.tab };
    case "ADD_TAB": {
      const filtered = state.tabs.filter((t) => t.id !== action.tab.id);
      return {
        ...state,
        tabs: [action.tab, ...filtered],
        activeTab: action.tab,
      };
    }
    case "REMOVE_TAB": {
      const tabs = state.tabs.filter((t) => t.id !== action.tabId);
      const activeTab =
        state.activeTab?.id === action.tabId
          ? tabs[0] || null
          : state.activeTab;
      return { ...state, tabs, activeTab };
    }
    case "SET_PANEL":
      return { ...state, currentPanel: action.panel };
    case "SET_HAS_QUERIED":
      return { ...state, hasQueried: true };
    case "LOAD_CACHED":
      return {
        ...state,
        tabs: action.tabs,
        messages: action.messages,
        hasQueried: action.messages.length > 0,
        activeTab: action.tabs[0] || null,
      };
    default:
      return state;
  }
}

// ── View Classification ──────────────────────────────────────

function classifyQuery(query: string): {
  viewType: string | null;
  title: string;
} {
  const q = query.toLowerCase();

  if (
    q.includes("portfolio") ||
    q.includes("stocks") ||
    q.includes("positions") ||
    q.includes("holdings") ||
    q.includes("investments")
  ) {
    return { viewType: "portfolio", title: "Portfolio" };
  }
  if (
    q.includes("trade") ||
    q.includes("buy") ||
    q.includes("sell") ||
    q.includes("trading") ||
    q.includes("robinhood") ||
    q.includes("alpaca")
  ) {
    return { viewType: "trading", title: "Trading" };
  }
  if (
    q.includes("health") ||
    q.includes("sleep") ||
    q.includes("readiness") ||
    q.includes("oura") ||
    q.includes("hrv") ||
    q.includes("activity")
  ) {
    return { viewType: "health", title: "Health" };
  }
  if (
    q.includes("goal") ||
    q.includes("goals") ||
    q.includes("objective") ||
    q.includes("milestone")
  ) {
    return { viewType: "goals", title: "Goals" };
  }
  if (
    q.includes("calendar") ||
    q.includes("schedule") ||
    q.includes("event") ||
    q.includes("meeting")
  ) {
    return { viewType: "calendar", title: "Calendar" };
  }
  if (
    q.includes("finance") ||
    q.includes("budget") ||
    q.includes("spending") ||
    q.includes("net worth") ||
    q.includes("empower") ||
    q.includes("personal capital")
  ) {
    return { viewType: "financial", title: "Finances" };
  }
  if (
    q.includes("call") ||
    q.includes("phone") ||
    q.includes("vapi") ||
    q.includes("voice")
  ) {
    return { viewType: "call", title: "Voice Call" };
  }
  if (
    q.includes("ticket") ||
    q.includes("flight") ||
    q.includes("boarding pass") ||
    q.includes("plane")
  ) {
    return { viewType: "ticket", title: "Ticket" };
  }

  return { viewType: null, title: "Chat" };
}

// ── Context ──────────────────────────────────────────────────

interface BackboneContextType {
  state: AppState;
  sendMessage: (content: string) => Promise<void>;
  setPanel: (panel: Panel) => void;
  setActiveTab: (tab: Tab | null) => void;
  removeTab: (tabId: string) => void;
  connectToBackbone: (userId: string) => Promise<void>;
}

const BackboneContext = createContext<BackboneContextType | null>(null);

export function BackboneProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const connection = getBackboneConnection();

  // Load cached tabs and messages on mount
  useEffect(() => {
    const cached = loadCache();
    if (cached.tabs.length > 0 || cached.messages.length > 0) {
      dispatch({ type: "LOAD_CACHED", tabs: cached.tabs, messages: cached.messages });
    }
  }, []);

  // Persist tabs and messages on change
  useEffect(() => {
    if (state.tabs.length > 0) saveTabsToCache(state.tabs);
  }, [state.tabs]);

  useEffect(() => {
    if (state.messages.length > 0) saveMsgsToCache(state.messages);
  }, [state.messages]);

  useEffect(() => {
    const unsubscribe = connection.onStatusChange((status, transport) => {
      dispatch({ type: "SET_CONNECTION", status, transport });
    });
    return () => { unsubscribe(); };
  }, [connection]);

  const connectToBackbone = useCallback(
    async (userId: string) => {
      try {
        await connection.connect(userId);
      } catch (err) {
        console.error("Connection failed:", err);
      }
    },
    [connection]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: Date.now(),
      };
      dispatch({ type: "ADD_MESSAGE", message: userMsg });
      dispatch({ type: "SET_PROCESSING", value: true });

      if (!state.hasQueried) {
        dispatch({ type: "SET_HAS_QUERIED" });
      }

      // Classify query to determine if we should show a view
      const { viewType, title } = classifyQuery(content);

      try {
        // Send to server
        const response = await connection.send("chat", { message: content });

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            response?.content ||
            response?.message ||
            "I received your message.",
          timestamp: Date.now(),
        };

        // If this query should generate a view, create a tab
        if (viewType) {
          const tab: Tab = {
            id: crypto.randomUUID(),
            type: viewType === "call" ? "call" : "view",
            viewType,
            title,
            data: response?.data || null,
            createdAt: Date.now(),
            isLive:
              viewType === "portfolio" ||
              viewType === "trading" ||
              viewType === "health",
          };

          assistantMsg.viewTabId = tab.id;
          dispatch({ type: "ADD_TAB", tab });
          dispatch({ type: "SET_PANEL", panel: "view" });
        }

        dispatch({ type: "ADD_MESSAGE", message: assistantMsg });
      } catch (err: any) {
        // Even if server is unreachable, classify and show the view
        if (viewType) {
          const tab: Tab = {
            id: crypto.randomUUID(),
            type: viewType === "call" ? "call" : "view",
            viewType,
            title,
            data: null,
            createdAt: Date.now(),
            isLive: false,
          };
          dispatch({ type: "ADD_TAB", tab });
          dispatch({ type: "SET_PANEL", panel: "view" });
        }

        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            viewType
              ? `Loading ${title} view... I'll fetch the latest data.`
              : "I'm having trouble connecting. Make sure BACKBONE is running locally.",
          timestamp: Date.now(),
        };
        dispatch({ type: "ADD_MESSAGE", message: errorMsg });
      } finally {
        dispatch({ type: "SET_PROCESSING", value: false });
      }
    },
    [connection, state.hasQueried]
  );

  const setPanel = useCallback((panel: Panel) => {
    dispatch({ type: "SET_PANEL", panel });
  }, []);

  const setActiveTab = useCallback((tab: Tab | null) => {
    dispatch({ type: "SET_ACTIVE_TAB", tab });
  }, []);

  const removeTab = useCallback((tabId: string) => {
    dispatch({ type: "REMOVE_TAB", tabId });
  }, []);

  return (
    <BackboneContext.Provider
      value={{
        state,
        sendMessage,
        setPanel,
        setActiveTab,
        removeTab,
        connectToBackbone,
      }}
    >
      {children}
    </BackboneContext.Provider>
  );
}

export function useBackbone() {
  const ctx = useContext(BackboneContext);
  if (!ctx) throw new Error("useBackbone must be used within BackboneProvider");
  return ctx;
}
