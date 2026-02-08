"use client";

import { useState, useEffect, useCallback } from "react";

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:3000";
  const port = parseInt(window.location.port, 10);
  if (port === 3000 || window.location.pathname.startsWith("/app")) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

/**
 * Fetch data from the local BACKBONE API with auto-refresh.
 * Accepts optional initialData for instant rendering from cache.
 */
export function useLocalData<T = any>(
  endpoint: string,
  refreshInterval: number = 30000,
  initialData?: T | null
) {
  const [data, setData] = useState<T | null>(initialData ?? null);
  const [loading, setLoading] = useState(initialData == null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const base = getApiBase();
      const resp = await fetch(`${base}${endpoint}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const result = await resp.json();
      setData(result);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData();
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return { data, loading, error, lastUpdated, refetch: fetchData };
}

/**
 * Fetch the consolidated dashboard cache for instant startup rendering.
 * Returns all key data in one request. Falls back gracefully if unavailable.
 */
export function useDashboardCache() {
  const [cache, setCache] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = getApiBase();
    fetch(`${base}/api/dashboard-cache`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setCache(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { cache, loading };
}

/**
 * Check if we're running in local mode (served from Express backend).
 */
export function useIsLocalMode(): boolean {
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const port = parseInt(window.location.port, 10);
    setIsLocal(port === 3000 || window.location.pathname.startsWith("/app"));
  }, []);

  return isLocal;
}
