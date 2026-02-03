"use client";

import { useEffect, useRef, useState } from "react";
import { useBackbone } from "@/lib/backbone-context";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatInput } from "@/components/chat/chat-input";
import { ViewContainer } from "@/components/views/view-container";
import { TabPanel } from "@/components/tabs/tab-panel";
import {
  MessageSquare,
  Wifi,
  WifiOff,
} from "lucide-react";
import { User } from "firebase/auth";

interface AppShellProps {
  user: User;
}

export function AppShell({ user }: AppShellProps) {
  const { state, sendMessage, setPanel, connectToBackbone } = useBackbone();
  const { hasQueried, connectionStatus, transport } = state;
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Connect to backbone when mounted
  useEffect(() => {
    connectToBackbone(user.uid);
  }, [connectToBackbone, user.uid]);

  // Close overlays on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowChat(false);
        setShowSidebar(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Swipe handling for mobile overlays
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) return;

    if (deltaX > 0) {
      // Swipe right → show chat or close sidebar
      if (showSidebar) {
        setShowSidebar(false);
      } else if (!showChat) {
        setShowChat(true);
      }
    } else {
      // Swipe left → show sidebar or close chat
      if (showChat) {
        setShowChat(false);
      } else if (!showSidebar) {
        setShowSidebar(true);
      }
    }
  };

  // Connection badge
  const ConnectionBadge = () => (
    <div className="flex items-center gap-1.5 text-xs">
      {connectionStatus === "connected" ? (
        <>
          <Wifi className="h-3 w-3 text-green-500" />
          <span className="text-green-500 hidden sm:inline">Connected</span>
          <span className="text-neutral-600 hidden sm:inline">({transport})</span>
        </>
      ) : connectionStatus === "connecting" ? (
        <>
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-500 pulse-dot" />
          <span className="text-yellow-500 hidden sm:inline">Connecting...</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3 text-neutral-600" />
          <span className="text-neutral-500 hidden sm:inline">Offline</span>
        </>
      )}
    </div>
  );

  // ── Welcome Screen (before first query) ─────────────────────

  if (!hasQueried) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <ConnectionBadge />
          {isMobile && (
            <button onClick={() => setShowSidebar(true)}>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="h-7 w-7 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700" />
              )}
            </button>
          )}
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <img
            src="/logo-dark.png"
            alt="BACKBONE"
            className="h-20 w-20 rounded-2xl mb-6"
          />
          <h1 className="text-2xl font-semibold text-neutral-100 mb-2">
            BACKBONE
          </h1>
          <p className="text-neutral-500 text-sm mb-8 text-center max-w-md">
            Your life optimization engine
          </p>

          {/* Suggestion pills */}
          <div className="flex flex-wrap gap-2 justify-center mb-8 max-w-lg">
            {[
              "Show my portfolio",
              "How did I sleep?",
              "What are my goals?",
              "Show trading signals",
            ].map((s) => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="px-4 py-2 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 hover:border-neutral-600 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom input */}
        <div className="p-4 pb-safe">
          <ChatInput onSend={sendMessage} disabled={state.isProcessing} />
        </div>

        {/* Right sidebar overlay on welcome screen (mobile) */}
        {isMobile && (
          <>
            <div
              className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
                showSidebar
                  ? "opacity-100"
                  : "opacity-0 pointer-events-none"
              }`}
              onClick={() => setShowSidebar(false)}
            />
            <div
              className={`fixed inset-y-0 right-0 w-[80%] bg-neutral-950 border-l border-neutral-800 z-50 transform transition-transform duration-300 ease-out ${
                showSidebar ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <TabPanel
                user={user}
                onClose={() => setShowSidebar(false)}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Mobile Layout (after first query) ───────────────────────

  if (isMobile) {
    return (
      <div
        className="h-screen w-screen bg-black flex flex-col overflow-hidden animate-fade-in"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Top bar */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-neutral-800 flex-shrink-0">
          <button
            onClick={() => setShowChat(true)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 transition-colors"
          >
            <MessageSquare className="h-4 w-4" />
          </button>

          <img
            src="/logo-dark.png"
            alt="BACKBONE"
            className="h-7 w-7 rounded-md"
          />

          <button onClick={() => setShowSidebar(true)}>
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-7 w-7 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-neutral-800 border border-neutral-700" />
            )}
          </button>
        </div>

        {/* Main view */}
        <div className="flex-1 overflow-hidden">
          <ViewContainer />
        </div>

        {/* Bottom input */}
        <div className="p-3 pb-safe border-t border-neutral-800 flex-shrink-0">
          <ChatInput onSend={sendMessage} disabled={state.isProcessing} />
        </div>

        {/* ── Chat overlay from left ─────────────────────────── */}
        <div
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
            showChat ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setShowChat(false)}
        />
        <div
          className={`fixed inset-y-0 left-0 w-[85%] bg-neutral-950 border-r border-neutral-800 z-50 transform transition-transform duration-300 ease-out flex flex-col ${
            showChat ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ChatPanel />
          <div className="p-3 border-t border-neutral-800">
            <ChatInput
              onSend={(msg) => {
                sendMessage(msg);
                setShowChat(false);
              }}
              disabled={state.isProcessing}
            />
          </div>
        </div>

        {/* ── Right sidebar overlay (80%) ────────────────────── */}
        <div
          className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${
            showSidebar ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => setShowSidebar(false)}
        />
        <div
          className={`fixed inset-y-0 right-0 w-[80%] bg-neutral-950 border-l border-neutral-800 z-50 transform transition-transform duration-300 ease-out ${
            showSidebar ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <TabPanel
            user={user}
            onClose={() => setShowSidebar(false)}
          />
        </div>
      </div>
    );
  }

  // ── Desktop Layout ──────────────────────────────────────────

  return (
    <div className="h-screen w-screen bg-black flex flex-col animate-fade-in">
      {/* Top bar */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <img
            src="/logo-dark.png"
            alt="BACKBONE"
            className="h-6 w-6 rounded"
          />
          <span className="text-sm font-semibold text-neutral-100">
            BACKBONE
          </span>
        </div>
        <ConnectionBadge />
      </div>

      {/* 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — Chat */}
        <div className="w-80 border-r border-neutral-800 flex flex-col bg-neutral-950">
          <div className="flex-1 overflow-hidden">
            <ChatPanel />
          </div>
        </div>

        {/* Center — Dynamic View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ViewContainer />
        </div>

        {/* Right — Profile + Tabs */}
        <div className="w-72 border-l border-neutral-800 flex flex-col bg-neutral-950">
          <TabPanel user={user} />
        </div>
      </div>

      {/* Bottom input */}
      <div className="p-3 border-t border-neutral-800">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={sendMessage} disabled={state.isProcessing} />
        </div>
      </div>
    </div>
  );
}
