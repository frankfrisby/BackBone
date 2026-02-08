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
      navigator.serviceWorker
        .register("/app/sw.js", { scope: "/app/" })
        .then((reg) => {
          console.log("[PWA] Service worker registered:", reg.scope);
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
