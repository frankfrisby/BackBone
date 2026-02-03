"use client";

import { useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";

export function VapiCallView() {
  const [callState, setCallState] = useState<
    "idle" | "connecting" | "active" | "ended"
  >("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [transcript, setTranscript] = useState<
    { role: string; text: string }[]
  >([]);
  const [duration, setDuration] = useState(0);

  const startCall = async () => {
    setCallState("connecting");
    try {
      const resp = await fetch("http://localhost:3000/api/vapi/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (resp.ok) {
        setCallState("active");
        const interval = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
        (window as any).__vapiInterval = interval;
      } else {
        setCallState("idle");
      }
    } catch {
      setCallState("idle");
    }
  };

  const endCall = async () => {
    if ((window as any).__vapiInterval) {
      clearInterval((window as any).__vapiInterval);
    }
    try {
      await fetch("http://localhost:3000/api/vapi/end", {
        method: "POST",
      });
    } catch {
      // ignore
    }
    setCallState("ended");
    setDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-full flex flex-col gradient-hero">
      {/* Call UI */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Avatar / Visual */}
        <div className="relative mb-8">
          <div
            className={`h-28 w-28 rounded-full flex items-center justify-center transition-all duration-500 ${
              callState === "active"
                ? "bg-green-500/10 border-2 border-green-500/30"
                : callState === "connecting"
                ? "bg-yellow-500/10 border-2 border-yellow-500/30"
                : "bg-[#111] border-2 border-[#1f1f1f]"
            }`}
          >
            <img
              src="/logo-dark.png"
              alt="B"
              className={`h-12 w-12 rounded-xl ${
                callState === "connecting" ? "animate-pulse" : ""
              }`}
            />
          </div>

          {/* Ripple effect when active */}
          {callState === "active" && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-green-500/20 pulse-ring" />
              <div
                className="absolute inset-0 rounded-full border border-green-500/10 pulse-ring"
                style={{ animationDelay: "0.7s" }}
              />
            </>
          )}
        </div>

        <h2 className="text-[18px] font-semibold text-white tracking-tight mb-1">
          {callState === "idle"
            ? "BACKBONE Voice"
            : callState === "connecting"
            ? "Connecting..."
            : callState === "active"
            ? "In Call"
            : "Call Ended"}
        </h2>

        {callState === "active" && (
          <p className="text-[15px] text-green-400 font-mono tabular-nums">
            {formatDuration(duration)}
          </p>
        )}

        {callState === "idle" && (
          <p className="text-[13px] text-neutral-500 text-center max-w-[240px] mt-1 leading-relaxed">
            Start a voice conversation with your BACKBONE assistant
          </p>
        )}

        {callState === "ended" && (
          <p className="text-[13px] text-neutral-600 mt-1">
            Tap to call again
          </p>
        )}
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <div className="mx-5 mb-4 card-surface max-h-48 overflow-y-auto no-scrollbar p-4">
          {transcript.map((t, i) => (
            <div key={i} className="mb-2.5 last:mb-0">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  t.role === "user" ? "text-neutral-500" : "text-orange-500"
                }`}
              >
                {t.role === "user" ? "You" : "BACKBONE"}
              </span>
              <p className="text-[12px] text-neutral-300 mt-0.5 leading-relaxed">
                {t.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Call controls */}
      <div className="px-5 py-8 flex items-center justify-center gap-5">
        {callState === "idle" || callState === "ended" ? (
          <button
            onClick={startCall}
            className="h-16 w-16 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-400 transition-all active:scale-90 shadow-lg shadow-green-500/20"
          >
            <Phone className="h-7 w-7 text-black" />
          </button>
        ) : (
          <>
            {/* Mute */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                isMuted
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-[#111] text-neutral-300 border border-[#1f1f1f] hover:bg-[#1a1a1a]"
              }`}
            >
              {isMuted ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>

            {/* End call */}
            <button
              onClick={endCall}
              className="h-16 w-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-400 transition-all active:scale-90 shadow-lg shadow-red-500/20"
            >
              <PhoneOff className="h-7 w-7 text-white" />
            </button>

            {/* Speaker */}
            <button
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              className={`h-14 w-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                !isSpeakerOn
                  ? "bg-[#1a1a1a] text-neutral-500 border border-[#222]"
                  : "bg-[#111] text-neutral-300 border border-[#1f1f1f] hover:bg-[#1a1a1a]"
              }`}
            >
              {isSpeakerOn ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
