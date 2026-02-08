"use client";

import { useState, useRef, useEffect } from "react";
import { motion, PanInfo } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatInput } from "./chat-input";
import { MessageBubble } from "./message-bubble";
import { backboneApi, ChatMessage } from "@/lib/api/backbone";
import { GripHorizontal } from "lucide-react";

type ChatPosition = "bottom" | "left" | "right" | "minimized";

interface ChatInterfaceProps {
  position: ChatPosition;
  onPositionChange: (position: ChatPosition) => void;
}

export function ChatInterface({ position, onPositionChange }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (content: string) => {
    const userMessage: ChatMessage = {
      role: "user",
      content,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await backboneApi.sendMessage(content);
      setMessages((prev) => [...prev, response]);
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 100;
    const { offset, velocity } = info;

    // Horizontal swipe
    if (Math.abs(offset.x) > Math.abs(offset.y)) {
      if (offset.x < -threshold || velocity.x < -500) {
        onPositionChange("right");
      } else if (offset.x > threshold || velocity.x > 500) {
        onPositionChange("left");
      }
    }
  };

  const getPositionStyles = () => {
    switch (position) {
      case "bottom":
        return {
          bottom: 0,
          left: 0,
          right: 0,
          height: "40vh",
          width: "100%",
        };
      case "left":
        return {
          top: 0,
          bottom: 0,
          left: 0,
          width: "400px",
          height: "100vh",
        };
      case "right":
        return {
          top: 0,
          bottom: 0,
          right: 0,
          width: "400px",
          height: "100vh",
        };
      case "minimized":
        return {
          bottom: 20,
          right: 20,
          width: "60px",
          height: "60px",
        };
    }
  };

  return (
    <motion.div
      drag={position === "bottom"}
      dragConstraints={{ left: 0, right: 0, top: -200, bottom: 0 }}
      dragElastic={0.1}
      onDragEnd={handleDragEnd}
      initial={getPositionStyles()}
      animate={getPositionStyles()}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed z-50 glass rounded-t-xl flex flex-col"
      style={{ maxHeight: "90vh" }}
    >
      {/* Drag Handle */}
      {position === "bottom" && (
        <div className="flex justify-center p-2 cursor-grab active:cursor-grabbing">
          <GripHorizontal className="h-5 w-5 text-slate-400" />
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4 py-2" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <p className="text-sm">Start a conversation with BACKBONE</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))
        )}
        {isLoading && (
          <div className="flex gap-2 items-center text-slate-400 text-sm">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>BACKBONE is typing...</span>
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </motion.div>
  );
}
