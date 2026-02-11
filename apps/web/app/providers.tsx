"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { BackboneProvider } from "@/lib/backbone-context";

function useServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only register SW when served from Express (local mode)
    const port = parseInt(window.location.port, 10);
    const isLocal = port === 3000 || window.location.pathname.startsWith("/app");

    if (isLocal) {
      // Bump this to force SW updates when users have stale/corrupted caches.
      const SW_VERSION = "5";
      navigator.serviceWorker
        .register(`/app/sw.js?v=${SW_VERSION}`, { scope: "/app/" })
        .then((reg) => {
          console.log("[PWA] Service worker registered:", reg.scope);
          // Best-effort: ask the browser to check for updates immediately.
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.log("[PWA] Service worker registration failed:", err.message);
        });

      // Request notification permission after a delay
      setTimeout(async () => {
        if ("Notification" in window && Notification.permission === "default") {
          const perm = await Notification.requestPermission();
          console.log("[PWA] Notification permission:", perm);
        }
      }, 5000);
    }
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useServiceWorker();

  return (
    <QueryClientProvider client={queryClient}>
      <BackboneProvider>{children}</BackboneProvider>
    </QueryClientProvider>
  );
}
