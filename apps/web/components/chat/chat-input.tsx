"use client";

import { useState, useRef } from "react";
import { ArrowUp, Mic } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  };

  const hasText = message.trim().length > 0;

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative bg-[#111111] border border-[#222222] rounded-2xl input-glow transition-all duration-200">
          <textarea
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Message BACKBONE..."
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent text-[15px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none resize-none py-3 pl-4 pr-12 leading-relaxed"
            style={{ maxHeight: 120 }}
          />

          {/* Send / Mic button inside the input */}
          <div className="absolute right-2 bottom-1.5">
            {hasText ? (
              <button
                type="submit"
                disabled={disabled}
                className="h-8 w-8 flex items-center justify-center rounded-xl bg-orange-500 text-black transition-all duration-200 hover:bg-orange-400 disabled:opacity-40 active:scale-90"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            ) : (
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center rounded-xl text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-all duration-200 active:scale-90"
                onClick={() => onSend("/call")}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
