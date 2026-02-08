"use client";

import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from "firebase/firestore";
import {
  LayoutGrid,
  Heart,
  Target,
  BarChart3,
  TrendingUp,
  Activity,
  Sparkles,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────

export interface WidgetConfig {
  sourceId: string;
  enabled: boolean;
  size: "half" | "full";
}

export interface DashboardConfig {
  widgets: WidgetConfig[];
  updatedAt: string;
}

export interface DashboardSnapshot<T = any> {
  data: T;
  updatedAt: string;
}

export interface ConnectedSources {
  alpaca: boolean;
  oura: boolean;
  goals: boolean;
  linkedin: boolean;
  updatedAt: string;
}

// ── Widget Metadata ─────────────────────────────────────────────

export const WIDGET_META: Record<
  string,
  { label: string; icon: typeof LayoutGrid; description: string; color: string }
> = {
  portfolio: {
    label: "Portfolio",
    icon: BarChart3,
    description: "Equity, P&L, and top positions",
    color: "#22c55e",
  },
  health: {
    label: "Health",
    icon: Heart,
    description: "Sleep, readiness, and activity scores",
    color: "#8b5cf6",
  },
  goals: {
    label: "Goals",
    icon: Target,
    description: "Active goals and progress",
    color: "#3b82f6",
  },
  tickers: {
    label: "Tickers",
    icon: TrendingUp,
    description: "Top scored tickers and signals",
    color: "#f59e0b",
  },
  trading: {
    label: "Trading",
    icon: Activity,
    description: "Auto-trading status and recent trades",
    color: "#ef4444",
  },
  lifeScores: {
    label: "Life Scores",
    icon: LayoutGrid,
    description: "Overall and category life scores",
    color: "#06b6d4",
  },
  brief: {
    label: "Daily Brief",
    icon: Sparkles,
    description: "Your personalized daily briefing",
    color: "#f97316",
  },
};

const DEFAULT_CONFIG: DashboardConfig = {
  widgets: [
    { sourceId: "portfolio", enabled: true, size: "half" },
    { sourceId: "health", enabled: true, size: "half" },
    { sourceId: "goals", enabled: true, size: "half" },
    { sourceId: "tickers", enabled: true, size: "half" },
    { sourceId: "trading", enabled: false, size: "half" },
    { sourceId: "lifeScores", enabled: false, size: "half" },
    { sourceId: "brief", enabled: true, size: "full" },
  ],
  updatedAt: new Date().toISOString(),
};

// ── Hooks ───────────────────────────────────────────────────────

/**
 * Real-time listener on the dashboard config doc.
 * Creates defaults if the doc doesn't exist.
 */
export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth?.currentUser;
    if (!user || !db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid, "dashboard", "config");

    const unsub: Unsubscribe = onSnapshot(
      ref,
      async (snap) => {
        if (snap.exists()) {
          setConfig(snap.data() as DashboardConfig);
        } else {
          // Write defaults
          await setDoc(ref, DEFAULT_CONFIG);
          setConfig(DEFAULT_CONFIG);
        }
        setLoading(false);
      },
      (error) => {
        console.error("[Dashboard] Config listener error:", error);
        setConfig(DEFAULT_CONFIG);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [auth?.currentUser?.uid]);

  const updateConfig = async (newConfig: DashboardConfig) => {
    const user = auth?.currentUser;
    if (!user || !db) return;

    const ref = doc(db, "users", user.uid, "dashboard", "config");
    await setDoc(ref, { ...newConfig, updatedAt: new Date().toISOString() });
  };

  return { config, loading, updateConfig };
}

/**
 * Real-time listener on a dashboard data snapshot doc.
 */
export function useDashboardData<T = any>(sourceId: string) {
  const [data, setData] = useState<T | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth?.currentUser;
    if (!user || !db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid, "dashboard", sourceId);

    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const doc = snap.data() as DashboardSnapshot<T>;
          setData(doc.data);
          setUpdatedAt(doc.updatedAt);
        } else {
          setData(null);
          setUpdatedAt(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error(`[Dashboard] ${sourceId} listener error:`, error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [sourceId, auth?.currentUser?.uid]);

  return { data, updatedAt, loading };
}

/**
 * Real-time listener on the connected sources doc.
 */
export function useConnectedSources() {
  const [sources, setSources] = useState<ConnectedSources | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth?.currentUser;
    if (!user || !db) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "users", user.uid, "dashboard", "connectedSources");

    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setSources(snap.data() as ConnectedSources);
        }
        setLoading(false);
      },
      (error) => {
        console.error("[Dashboard] Connected sources listener error:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [auth?.currentUser?.uid]);

  return { sources, loading };
}

/**
 * Format a timestamp into a relative freshness string.
 */
export function formatFreshness(updatedAt: string | null): string {
  if (!updatedAt) return "No data";
  const diff = Date.now() - new Date(updatedAt).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
