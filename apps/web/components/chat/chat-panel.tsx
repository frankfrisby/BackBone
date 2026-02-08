"use client";

import { useEffect, useRef } from "react";
import { useBackbone } from "@/lib/backbone-context";
import { MessageBubble } from "./message-bubble";

export function ChatPanel() {
  const { state, setPanel } = useBackbone();
  const { messages, isProcessing } = state;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#1a1a1a]">
        <h2 className="text-[13px] font-semibold text-neutral-300 tracking-wide uppercase">
          Messages
        </h2>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto no-scrollbar px-4 py-4"
        ref={scrollRef}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="h-10 w-10 rounded-full bg-[#111] border border-[#1f1f1f] flex items-center justify-center mx-auto mb-3">
                <img
                  src="/app/logo-dark.png"
                  alt="B"
                  className="h-5 w-5 rounded"
                />
              </div>
              <p className="text-neutral-600 text-[13px]">
                Start a conversation
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                viewTabId={msg.viewTabId}
                onViewClick={() => {
                  if (msg.viewTabId) {
                    const tab = state.tabs.find(
                      (t) => t.id === msg.viewTabId
                    );
                    if (tab) {
                      setPanel("view");
                    }
                  }
                }}
              />
            ))}
            {isProcessing && (
              <div className="flex items-center gap-2.5 py-2 px-1">
                <div className="h-7 w-7 rounded-full overflow-hidden flex-shrink-0">
                  <img
                    src="/app/logo-dark.png"
                    alt="B"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex gap-1.5 px-3 py-2">
                  <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
                  <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
                  <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
