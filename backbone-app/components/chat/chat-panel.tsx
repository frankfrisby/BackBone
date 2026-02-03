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
      <div className="px-4 py-3 border-b border-neutral-800">
        <h2 className="text-sm font-medium text-neutral-300">Chat</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-3" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-neutral-600 text-sm">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                viewTabId={msg.viewTabId}
                onViewClick={() => {
                  if (msg.viewTabId) {
                    const tab = state.tabs.find((t) => t.id === msg.viewTabId);
                    if (tab) {
                      setPanel("view");
                    }
                  }
                }}
              />
            ))}
            {isProcessing && (
              <div className="flex items-center gap-2 py-2 px-3">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
                  <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
                  <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
                </div>
                <span className="text-xs text-neutral-500">Thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
