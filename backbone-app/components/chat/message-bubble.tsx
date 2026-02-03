import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
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
      className={cn(
        "flex gap-2 py-1.5",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "h-6 w-6 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5",
          isUser
            ? "bg-neutral-700 text-neutral-300"
            : "bg-orange-500/20 text-orange-500"
        )}
      >
        {isUser ? "U" : "B"}
      </div>

      {/* Message */}
      <div
        className={cn(
          "flex flex-col gap-1 max-w-[85%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm",
            isUser
              ? "bg-neutral-800 text-neutral-100"
              : "bg-neutral-900 text-neutral-200"
          )}
        >
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>

          {/* View link */}
          {viewTabId && !isUser && (
            <button
              onClick={onViewClick}
              className="mt-2 flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-400 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View generated
            </button>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <span className="text-[10px] text-neutral-600 px-1">
            {new Date(timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
