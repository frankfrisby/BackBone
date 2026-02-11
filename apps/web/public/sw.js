/* eslint-env serviceworker */

const CACHE_NAME = "backbone-v5";
const APP_SHELL_URLS = [
  "/app/",
  "/app/index.html",
  "/app/globals.css",
  "/app/logo-dark.png",
  "/app/manifest.json",
];

// ── Install: Cache app shell ─────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_URLS).catch((err) => {
        console.log("[SW] Some app shell resources unavailable:", err.message);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: Clean old caches ───────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ── Fetch: Network-first for API, cache-first for static ────

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Don't cache API calls, SSE streams, or WebSocket upgrades
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/ws") ||
    event.request.headers.get("accept") === "text/event-stream"
  ) {
    return;
  }

  // Network-first for navigations and manifest to avoid stale HTML / PWA metadata.
  const accept = event.request.headers.get("accept") || "";
  if (
    event.request.mode === "navigate" ||
    accept.includes("text/html") ||
    url.pathname === "/app/manifest.json"
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match("/app/index.html")))
    );
    return;
  }

  // Never cache Next.js build assets to avoid stale bundles in dev
  if (url.pathname.startsWith("/app/_next/")) {
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses for static assets
        if (response.ok && url.pathname.startsWith("/app/")) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Offline fallback for HTML pages
        if (event.request.headers.get("accept")?.includes("text/html")) {
          return caches.match("/app/index.html");
        }
      });
    })
  );
});

// ── Push Notifications ───────────────────────────────────────

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data?.json();
  } catch {
    data = { title: "BACKBONE", body: event.data?.text() || "New notification" };
  }

  const { title, body, type, icon } = data;

  // Icon mapping by notification type
  const typeIcons = {
    trade: "chart",
    health: "heart",
    engine: "bolt",
    goal: "target",
    system: "gear",
  };

  event.waitUntil(
    self.registration.showNotification(title || "BACKBONE", {
      body: body || "Update available",
      icon: icon || "/app/icons/icon-192.png",
      badge: "/app/icons/icon-72.png",
      tag: type || "general",
      renotify: true,
      data: { url: data.url || "/app/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/app/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/app") && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Background Sync (future: queue offline actions) ──────────

self.addEventListener("sync", (event) => {
  if (event.tag === "backbone-sync") {
    // Future: sync queued actions when back online
    console.log("[SW] Background sync triggered");
  }
});
