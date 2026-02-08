"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  isNotificationSupported,
  getNotificationPermission,
  wasPromptDismissed,
  dismissNotificationPrompt,
  requestNotificationPermission,
} from "@/lib/push-notifications";

const SHOW_DELAY_MS = 5000;

export function NotificationBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if not supported, already granted, denied, or recently dismissed
    if (!isNotificationSupported()) return;
    const permission = getNotificationPermission();
    if (permission === "granted" || permission === "denied") return;
    if (wasPromptDismissed()) return;

    const timer = setTimeout(() => setShow(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleEnable = async () => {
    setShow(false);
    await requestNotificationPermission();
  };

  const handleDismiss = () => {
    setShow(false);
    dismissNotificationPrompt();
  };

  if (!show) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 animate-fade-up">
      <div className="card-elevated p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#111] border border-[#1f1f1f] flex items-center justify-center flex-shrink-0">
          <Bell className="h-5 w-5 text-neutral-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white">
            Enable Notifications
          </p>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Get alerts for trades, goals, and health updates
          </p>
        </div>
        <button
          onClick={handleEnable}
          className="px-4 py-2 rounded-xl bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors active:scale-95 flex-shrink-0"
        >
          Enable
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 text-neutral-600 hover:text-neutral-400 transition-colors flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
