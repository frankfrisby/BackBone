"use client";

import { useEffect, useRef, useState } from "react";
import { useBackbone, type Panel } from "@/lib/backbone-context";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatInput } from "@/components/chat/chat-input";
import { ViewContainer } from "@/components/views/view-container";
import { TabPanel } from "@/components/tabs/tab-panel";
import { onAuthStateChange } from "@/lib/firebase";
import {
  MessageSquare,
  LayoutGrid,
  User as UserIcon,
  Wifi,
  WifiOff,
} from "lucide-react";

export function AppShell() {
  const { state, sendMessage, setPanel, connectToBackbone } = useBackbone();
  const { hasQueried, currentPanel, connectionStatus, transport } = state;
  const [isMobile, setIsMobile] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Connect to backbone when auth ready
  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      if (user) {
        connectToBackbone(user.uid);
      }
    });
    return () => unsubscribe();
  }, [connectToBackbone]);

  // Swipe handling for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) return;

    const panels: Panel[] = ["chat", "view", "tabs"];
    const currentIdx = panels.indexOf(currentPanel);

    if (deltaX > 0 && currentIdx > 0) {
      setPanel(panels[currentIdx - 1]);
    } else if (deltaX < 0 && currentIdx < panels.length - 1) {
      setPanel(panels[currentIdx + 1]);
    }
  };

  // ── Welcome Screen (before first query) ────────────────────

  if (!hasQueried) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col">
        {/* Connection indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2 text-xs text-neutral-500">
          {connectionStatus === "connected" ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Connected</span>
              <span className="text-neutral-600">via {transport}</span>
            </>
          ) : connectionStatus === "connecting" ? (
            <>
              <div className="h-3 w-3 rounded-full bg-yellow-500 pulse-dot" />
              <span className="text-yellow-500">Connecting...</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-neutral-600" />
              <span>Offline</span>
            </>
          )}
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Logo */}
          <div className="h-16 w-16 rounded-2xl bg-neutral-900 border border-neutral-700 flex items-center justify-center mb-6">
            <span className="text-2xl font-bold text-orange-500">B</span>
          </div>

          <h1 className="text-2xl font-semibold text-neutral-100 mb-2">
            BACKBONE
          </h1>
          <p className="text-neutral-500 text-sm mb-8 text-center max-w-md">
            Your life optimization engine. Ask about your portfolio, health,
            goals, or anything else.
          </p>

          {/* Suggestion pills */}
          <div className="flex flex-wrap gap-2 justify-center mb-8 max-w-lg">
            {[
              "Show my portfolio",
              "How did I sleep?",
              "What are my goals?",
              "Show trading signals",
              "Call BACKBONE",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => sendMessage(suggestion)}
                className="px-4 py-2 rounded-full bg-neutral-900 border border-neutral-700 text-neutral-300 text-sm hover:bg-neutral-800 hover:border-neutral-600 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Bottom input */}
        <div className="p-4 pb-safe">
          <ChatInput onSend={sendMessage} disabled={state.isProcessing} />
        </div>
      </div>
    );
  }

  // ── Main 3-Panel Layout ────────────────────────────────────

  if (isMobile) {
    return (
      <div
        className="h-screen w-screen bg-black flex flex-col overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Panel indicator */}
        <div className="flex items-center justify-center gap-4 pt-3 pb-1 px-4">
          {/* Connection */}
          <div className="absolute left-4 top-3">
            {connectionStatus === "connected" ? (
              <Wifi className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-neutral-600" />
            )}
          </div>

          {(["chat", "view", "tabs"] as Panel[]).map((panel) => (
            <button
              key={panel}
              onClick={() => setPanel(panel)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-colors ${
                currentPanel === panel
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500"
              }`}
            >
              {panel === "chat" && <MessageSquare className="h-3 w-3" />}
              {panel === "view" && <LayoutGrid className="h-3 w-3" />}
              {panel === "tabs" && <UserIcon className="h-3 w-3" />}
              <span className="capitalize">{panel === "tabs" ? "Tabs" : panel}</span>
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-hidden relative">
          <div
            className="flex h-full panel-transition"
            style={{
              transform: `translateX(${
                currentPanel === "chat"
                  ? "0"
                  : currentPanel === "view"
                  ? "-100%"
                  : "-200%"
              })`,
              width: "300%",
            }}
          >
            <div className="w-1/3 h-full overflow-hidden">
              <ChatPanel />
            </div>
            <div className="w-1/3 h-full overflow-hidden">
              <ViewContainer />
            </div>
            <div className="w-1/3 h-full overflow-hidden">
              <TabPanel />
            </div>
          </div>
        </div>

        {/* Bottom input - always visible */}
        <div className="p-3 pb-safe border-t border-neutral-800">
          <ChatInput onSend={sendMessage} disabled={state.isProcessing} />
        </div>
      </div>
    );
  }

  // ── Desktop Layout ─────────────────────────────────────────

  return (
    <div className="h-screen w-screen bg-black flex flex-col">
      {/* Top bar */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-orange-500">BACKBONE</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {connectionStatus === "connected" ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Connected</span>
              <span className="text-neutral-600">({transport})</span>
            </>
          ) : connectionStatus === "connecting" ? (
            <>
              <div className="h-2 w-2 rounded-full bg-yellow-500 pulse-dot" />
              <span className="text-yellow-500">Connecting...</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-neutral-600" />
              <span className="text-neutral-500">Offline</span>
            </>
          )}
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - Chat */}
        <div className="w-80 border-r border-neutral-800 flex flex-col bg-neutral-950">
          <div className="flex-1 overflow-hidden">
            <ChatPanel />
          </div>
        </div>

        {/* Center - Dynamic View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ViewContainer />
        </div>

        {/* Right - Profile + Tabs */}
        <div className="w-72 border-l border-neutral-800 flex flex-col bg-neutral-950">
          <TabPanel />
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
