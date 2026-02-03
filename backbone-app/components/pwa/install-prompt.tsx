"use client";

import { useEffect, useState, useRef } from "react";
import { Download, X, Share } from "lucide-react";

const INSTALL_DISMISSED_KEY = "backbone_install_dismissed";
const SHOW_DELAY_MS = 3000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function wasDismissedRecently(): boolean {
  try {
    const dismissed = localStorage.getItem(INSTALL_DISMISSED_KEY);
    if (!dismissed) return false;
    const dismissedAt = parseInt(dismissed, 10);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - dismissedAt < sevenDays;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [showIOS, setShowIOS] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed or recently dismissed
    if (isStandalone() || wasDismissedRecently()) return;

    // iOS detection
    if (isIOS()) {
      const timer = setTimeout(() => setShowIOS(true), SHOW_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // Chrome/Android: capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setTimeout(() => setShow(true), SHOW_DELAY_MS);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "accepted") {
      setShow(false);
    }
    deferredPrompt.current = null;
  };

  const handleDismiss = () => {
    setShow(false);
    setShowIOS(false);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  };

  // Chrome/Android install banner
  if (show) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 animate-fade-up">
        <div className="card-elevated p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#111] border border-[#1f1f1f] flex items-center justify-center flex-shrink-0">
            <Download className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-white">Install BACKBONE</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Add to your home screen for the full experience
            </p>
          </div>
          <button
            onClick={handleInstall}
            className="px-4 py-2 rounded-xl bg-white text-black text-[12px] font-semibold hover:bg-neutral-200 transition-colors active:scale-95 flex-shrink-0"
          >
            Install
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

  // iOS install instructions
  if (showIOS) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 animate-fade-up">
        <div className="card-elevated p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#111] border border-[#1f1f1f] flex items-center justify-center flex-shrink-0">
                <Download className="h-5 w-5 text-neutral-400" />
              </div>
              <p className="text-[13px] font-semibold text-white">Install BACKBONE</p>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1.5 text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 ml-[52px]">
            <div className="flex items-center gap-2">
              <Share className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
              <p className="text-[12px] text-neutral-400">
                Tap <span className="text-white font-medium">Share</span> in your browser
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-3.5 flex items-center justify-center text-blue-400 flex-shrink-0 text-[10px] font-bold">+</div>
              <p className="text-[12px] text-neutral-400">
                Then <span className="text-white font-medium">Add to Home Screen</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
