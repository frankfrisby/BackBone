"use client";

import { useState, useRef } from "react";
import { Send, Mic } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="flex-1 flex items-center bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2.5 focus-within:border-neutral-600 transition-colors">
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask BACKBONE anything..."
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
          autoComplete="off"
        />
      </div>

      {message.trim() ? (
        <button
          type="submit"
          disabled={disabled}
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-orange-500 text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-400 hover:bg-neutral-700 transition-colors"
          onClick={() => onSend("/call")}
        >
          <Mic className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
