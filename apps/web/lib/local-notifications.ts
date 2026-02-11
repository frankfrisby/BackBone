/**
 * Local Desktop Notifications — SSE-driven, no Firebase needed.
 * Works when the app is served from the same machine.
 */

const NOTIFICATION_TYPES: Record<string, { title: string; icon?: string }> = {
  trade_update: { title: "Trade Executed" },
  portfolio_update: { title: "Portfolio Update" },
  engine_update: { title: "Engine Status" },
  health_update: { title: "Health Data" },
  goals_update: { title: "Goals Update" },
  ticker_update: { title: "Ticker Scores" },
};

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the service worker and request notification permission.
 */
export async function initLocalNotifications(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return false;

  try {
    // Register our service worker
    swRegistration = await navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" });
    console.log("[Notifications] Service worker registered");

    // Request permission
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (err) {
    console.error("[Notifications] Failed to init:", err);
    return false;
  }
}

/**
 * Show a desktop notification. Falls back to Notification API if SW unavailable.
 */
export function showLocalNotification(
  type: string,
  body: string,
  data?: any
): void {
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;

  const config = NOTIFICATION_TYPES[type] || { title: "BACKBONE" };

  // Skip noisy updates unless they have meaningful content
  if (type === "ticker_update" && !data?.top5?.length) return;
  if (type === "portfolio_update" && !data?.dayPL) return;

  if (swRegistration) {
    const opts: NotificationOptions & Record<string, any> = {
      body,
      icon: "/app/icons/icon-192.png",
      badge: "/app/icons/icon-72.png",
      tag: type,
      silent: type === "ticker_update",
      data: { url: "/app/" },
    };
    swRegistration.showNotification(config.title, opts);
  } else {
    // Fallback to basic Notification API
    new Notification(config.title, {
      body,
      icon: "/app/icons/icon-192.png",
      tag: type,
      silent: type === "ticker_update",
    });
  }
}

/**
 * Check if local notifications are enabled.
 */
export function isLocalNotificationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window && Notification.permission === "granted";
}
