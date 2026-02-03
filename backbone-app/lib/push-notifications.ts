/**
 * Push Notifications — FCM token registration + permission prompt
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";
const FCM_TOKEN_KEY = "backbone_fcm_token";
const NOTIFICATION_DISMISSED_KEY = "backbone_notification_dismissed";

let messaging: Messaging | null = null;

function getFirebaseMessaging(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (messaging) return messaging;

  try {
    const app = getApps().length > 0 ? getApp() : null;
    if (!app) return null;
    messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
}

/**
 * Check if notifications are supported in this browser
 */
export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/**
 * Get current permission state
 */
export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Check if the notification prompt was recently dismissed
 */
export function wasPromptDismissed(): boolean {
  try {
    const dismissed = localStorage.getItem(NOTIFICATION_DISMISSED_KEY);
    if (!dismissed) return false;
    const dismissedAt = parseInt(dismissed, 10);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - dismissedAt < sevenDays;
  } catch {
    return false;
  }
}

/**
 * Mark the notification prompt as dismissed
 */
export function dismissNotificationPrompt(): void {
  try {
    localStorage.setItem(NOTIFICATION_DISMISSED_KEY, Date.now().toString());
  } catch {
    // ignore
  }
}

/**
 * Request notification permission and register FCM token
 */
export async function requestNotificationPermission(): Promise<string | null> {
  if (!isNotificationSupported()) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const fcm = getFirebaseMessaging();
    if (!fcm) return null;

    // Get registration for the service worker
    const registration = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");

    const token = await getToken(fcm, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      // Store locally
      localStorage.setItem(FCM_TOKEN_KEY, token);

      // Register with server
      await registerTokenWithServer(token);

      return token;
    }

    return null;
  } catch (err) {
    console.error("Failed to get notification permission:", err);
    return null;
  }
}

/**
 * Register FCM token with the BACKBONE server
 */
async function registerTokenWithServer(token: string): Promise<void> {
  try {
    await fetch("http://localhost:3000/api/register-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Server may not be running — token is still stored locally
  }
}

/**
 * Listen for foreground messages
 */
export function onForegroundMessage(callback: (payload: any) => void): () => void {
  const fcm = getFirebaseMessaging();
  if (!fcm) return () => {};

  const unsubscribe = onMessage(fcm, (payload) => {
    callback(payload);
  });

  return unsubscribe;
}

/**
 * Get the stored FCM token
 */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(FCM_TOKEN_KEY);
  } catch {
    return null;
  }
}
