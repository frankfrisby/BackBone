"use client";

import { useEffect, useRef, useState } from "react";
import { useBackbone } from "@/lib/backbone-context";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ChatInput } from "@/components/chat/chat-input";
import { ViewContainer } from "@/components/views/view-container";
import { TabPanel } from "@/components/tabs/tab-panel";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { NotificationBanner } from "@/components/pwa/notification-banner";
import {
  MessageSquare,
  TrendingUp,
  Activity,
  Target,
  BarChart3,
  WifiOff,
  SquarePen,
} from "lucide-react";
import { User } from "firebase/auth";

interface AppShellProps {
  user: User;
}

export function AppShell({ user }: AppShellProps) {
  const { state, sendMessage, setPanel, connectToBackbone, resetSession } = useBackbone();
  const { hasQueried, connectionStatus, transport } = state;
  const [isMobile, setIsMobile] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const prevActiveTabId = useRef<string | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    connectToBackbone(user.uid);
  }, [connectToBackbone, user.uid]);

  // Auto-close chat when a new view tab appears
  useEffect(() => {
    const newId = state.activeTab?.id || null;
    if (newId && newId !== prevActiveTabId.current && showChat) {
      setShowChat(false);
    }
    prevActiveTabId.current = newId;
  }, [state.activeTab?.id, showChat]);

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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX)) return;

    if (deltaX > 0) {
      if (showSidebar) setShowSidebar(false);
      else if (!showChat) setShowChat(true);
    } else {
      if (showChat) setShowChat(false);
      else if (!showSidebar) setShowSidebar(true);
    }
  };

  // ── Handlers ────────────────────────────────────────────────

  const handleSendWithChat = (msg: string) => {
    if (isMobile) setShowChat(true);
    sendMessage(msg);
  };

  const handleNew = () => {
    resetSession();
    setShowChat(false);
    setShowSidebar(false);
  };

  // ── Connection Badge ─────────────────────────────────────────

  const ConnectionBadge = ({ compact }: { compact?: boolean }) => {
    if (connectionStatus === "connected") {
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {!compact && (
            <span className="text-[11px] text-neutral-500 tabular-nums">
              {transport}
            </span>
          )}
        </div>
      );
    }
    if (connectionStatus === "connecting") {
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 pulse-dot" />
          {!compact && (
            <span className="text-[11px] text-yellow-500/70">connecting</span>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <WifiOff className="h-3 w-3 text-neutral-700" />
        {!compact && (
          <span className="text-[11px] text-neutral-600">offline</span>
        )}
      </div>
    );
  };

  // ── Sidebar Overlay (shared between welcome + main) ──────────

  const SidebarOverlay = () => (
    <>
      <div
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${
          showSidebar ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{ backdropFilter: showSidebar ? "blur(4px)" : "none" }}
        onClick={() => setShowSidebar(false)}
      />
      <div
        className={`fixed inset-y-0 right-0 w-[80%] bg-[#0a0a0a] border-l border-[#1a1a1a] z-50 transform transition-transform duration-300 ${
          showSidebar ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "var(--ease-spring)" }}
      >
        <TabPanel user={user} onClose={() => setShowSidebar(false)} />
      </div>
    </>
  );

  // ── Welcome Screen ───────────────────────────────────────────

  if (!hasQueried) {
    const suggestions = [
      { icon: TrendingUp, label: "Portfolio", query: "Show my portfolio" },
      { icon: Activity, label: "Health", query: "How did I sleep?" },
      { icon: Target, label: "Goals", query: "What are my goals?" },
      { icon: BarChart3, label: "Trading", query: "Show trading signals" },
    ];

    return (
      <div className="h-screen w-screen bg-black flex flex-col gradient-hero">
        {/* Top */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 pt-safe">
          <ConnectionBadge />
          <button
            onClick={() => setShowSidebar(true)}
            className="active:scale-95 transition-transform"
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-8 w-8 rounded-full ring-1 ring-[#222]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-[#111] border border-[#222] flex items-center justify-center text-xs text-neutral-400">
                {(user.displayName || "U")[0]}
              </div>
            )}
          </button>
        </div>

        {/* Center hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="relative mb-8">
            <img
              src="/app/logo-dark.png"
              alt="BACKBONE"
              className="h-[72px] w-[72px] rounded-[20px]"
            />
            <div className="absolute inset-0 rounded-[20px] ring-1 ring-white/[0.06]" />
          </div>

          <h1 className="text-[28px] font-bold text-white tracking-tight mb-2">
            BACKBONE
          </h1>
          <p className="text-[15px] text-neutral-500 mb-10 text-center max-w-xs leading-relaxed">
            Your life optimization engine
          </p>

          {/* Suggestion cards */}
          <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm mb-6">
            {suggestions.map((s) => (
              <button
                key={s.label}
                onClick={() => sendMessage(s.query)}
                className="card-interactive flex items-center gap-3 px-4 py-3.5 text-left active:scale-[0.98]"
              >
                <s.icon className="h-4 w-4 text-neutral-500 flex-shrink-0" />
                <span className="text-[13px] text-neutral-300">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom input */}
        <div className="px-4 pb-4 pb-safe">
          <ChatInput onSend={sendMessage} disabled={state.isProcessing} />
        </div>

        <InstallPrompt />
        <NotificationBanner />
        {isMobile && <SidebarOverlay />}
      </div>
    );
  }

  // ── Mobile Main Layout ───────────────────────────────────────

  if (isMobile) {
    return (
      <div
        className="h-screen w-screen bg-black flex flex-col overflow-hidden animate-fade-in"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Top bar — glass effect */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#1a1a1a] flex-shrink-0 glass">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowChat(true)}
              className="h-8 w-8 flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-300 hover:bg-[#1a1a1a] transition-all active:scale-90"
            >
              <MessageSquare className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={handleNew}
              className="h-8 w-8 flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-300 hover:bg-[#1a1a1a] transition-all active:scale-90"
            >
              <SquarePen className="h-[18px] w-[18px]" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <img
              src="/app/logo-dark.png"
              alt="BACKBONE"
              className="h-6 w-6 rounded-md"
            />
            <ConnectionBadge compact />
          </div>

          <button
            onClick={() => setShowSidebar(true)}
            className="active:scale-95 transition-transform"
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-7 w-7 rounded-full ring-1 ring-[#222]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-[#111] border border-[#1f1f1f] flex items-center justify-center text-[10px] text-neutral-400">
                {(user.displayName || "U")[0]}
              </div>
            )}
          </button>
        </div>

        {/* Main view */}
        <div className="flex-1 overflow-hidden">
          <ViewContainer />
        </div>

        {/* Bottom input */}
        <div className="px-3 py-2.5 pb-safe border-t border-[#1a1a1a] flex-shrink-0">
          <ChatInput onSend={handleSendWithChat} disabled={state.isProcessing} />
        </div>

        {/* ── Chat overlay from left ───────────────────────── */}
        <div
          className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${
            showChat ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{ backdropFilter: showChat ? "blur(4px)" : "none" }}
          onClick={() => setShowChat(false)}
        />
        <div
          className={`fixed inset-y-0 left-0 w-[85%] bg-[#0a0a0a] border-r border-[#1a1a1a] z-50 transform transition-transform duration-300 flex flex-col ${
            showChat ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{ transitionTimingFunction: "var(--ease-spring)" }}
        >
          <ChatPanel />
          <div className="px-3 py-2.5 border-t border-[#1a1a1a]">
            <ChatInput
              onSend={(msg) => {
                sendMessage(msg);
                setShowChat(false);
              }}
              disabled={state.isProcessing}
            />
          </div>
        </div>

        <InstallPrompt />
        <NotificationBanner />
        <SidebarOverlay />
      </div>
    );
  }

  // ── Desktop Layout ───────────────────────────────────────────

  return (
    <div className="h-screen w-screen bg-black flex flex-col animate-fade-in">
      {/* Top bar */}
      <div className="h-11 flex items-center justify-between px-5 border-b border-[#141414]">
        <div className="flex items-center gap-3">
          <img
            src="/app/logo-dark.png"
            alt="BACKBONE"
            className="h-6 w-6 rounded-md"
          />
          <span className="text-[13px] font-semibold text-neutral-200 tracking-tight">
            BACKBONE
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-[#1a1a1a] transition-all active:scale-95"
          >
            <SquarePen className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium">New</span>
          </button>
          <ConnectionBadge />
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — Chat */}
        <div className="w-80 border-r border-[#141414] flex flex-col bg-[#050505]">
          <div className="flex-1 overflow-hidden">
            <ChatPanel />
          </div>
        </div>

        {/* Center — View */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ViewContainer />
        </div>

        {/* Right — Profile + Tabs */}
        <div className="w-72 border-l border-[#141414] flex flex-col bg-[#050505]">
          <TabPanel user={user} />
        </div>
      </div>

      {/* Bottom input */}
      <div className="px-4 py-2.5 border-t border-[#141414]">
        <div className="max-w-2xl mx-auto">
          <ChatInput onSend={sendMessage} disabled={state.isProcessing} />
        </div>
      </div>
    </div>
  );
}
