"use client";

import { ExternalLink } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  viewTabId?: string;
  onViewClick?: () => void;
}

export function MessageBubble({
  role,
  content,
  timestamp,
  viewTabId,
  onViewClick,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex gap-2.5 animate-fade-up ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="flex-shrink-0 mt-1">
          <div className="h-7 w-7 rounded-full overflow-hidden">
            <img
              src="/app/logo-dark.png"
              alt="B"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      )}

      <div
        className={`max-w-[80%] ${isUser ? "items-end" : "items-start"}`}
      >
        {/* Bubble */}
        <div
          className={`px-3.5 py-2.5 text-[14px] leading-relaxed ${
            isUser
              ? "bg-orange-500 text-black rounded-2xl rounded-br-md"
              : "text-neutral-200 rounded-2xl rounded-bl-md"
          }`}
        >
          {content}
        </div>

        {/* View link */}
        {viewTabId && onViewClick && (
          <button
            onClick={onViewClick}
            className="mt-1.5 flex items-center gap-1.5 text-[11px] text-orange-500/80 hover:text-orange-500 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span>View generated</span>
          </button>
        )}

        {/* Timestamp */}
        <p
          className={`text-[10px] text-neutral-600 mt-1 tabular-nums ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
