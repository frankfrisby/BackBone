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
        // Start duration timer
        const interval = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
        // Store interval for cleanup
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
    <div className="h-full flex flex-col">
      {/* Call UI */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Avatar / Visual */}
        <div className="relative mb-6">
          <div
            className={`h-24 w-24 rounded-full flex items-center justify-center ${
              callState === "active"
                ? "bg-green-500/10 border-2 border-green-500/30"
                : callState === "connecting"
                ? "bg-yellow-500/10 border-2 border-yellow-500/30"
                : "bg-neutral-800 border-2 border-neutral-700"
            }`}
          >
            <Phone
              className={`h-8 w-8 ${
                callState === "active"
                  ? "text-green-500"
                  : callState === "connecting"
                  ? "text-yellow-500 animate-pulse"
                  : "text-neutral-500"
              }`}
            />
          </div>

          {/* Ripple effect when active */}
          {callState === "active" && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-green-500/20 animate-ping" />
              <div
                className="absolute inset-0 rounded-full border border-green-500/10 animate-ping"
                style={{ animationDelay: "0.5s" }}
              />
            </>
          )}
        </div>

        <h2 className="text-lg font-semibold text-neutral-100 mb-1">
          {callState === "idle"
            ? "BACKBONE Voice"
            : callState === "connecting"
            ? "Connecting..."
            : callState === "active"
            ? "In Call"
            : "Call Ended"}
        </h2>

        {callState === "active" && (
          <p className="text-sm text-green-500 font-mono">
            {formatDuration(duration)}
          </p>
        )}

        {callState === "idle" && (
          <p className="text-xs text-neutral-500 text-center max-w-xs mt-1">
            Start a voice conversation with your BACKBONE assistant
          </p>
        )}
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <div className="mx-5 mb-4 bg-neutral-900 rounded-xl border border-neutral-800 max-h-48 overflow-y-auto p-3">
          {transcript.map((t, i) => (
            <div key={i} className="mb-2 last:mb-0">
              <span
                className={`text-xs font-medium ${
                  t.role === "user" ? "text-neutral-400" : "text-orange-500"
                }`}
              >
                {t.role === "user" ? "You" : "BACKBONE"}
              </span>
              <p className="text-xs text-neutral-300 mt-0.5">{t.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Call controls */}
      <div className="px-5 py-6 flex items-center justify-center gap-4">
        {callState === "idle" || callState === "ended" ? (
          <button
            onClick={startCall}
            className="h-14 w-14 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-400 transition-colors"
          >
            <Phone className="h-6 w-6 text-black" />
          </button>
        ) : (
          <>
            {/* Mute */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
                isMuted
                  ? "bg-red-500/20 text-red-500"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
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
              className="h-14 w-14 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-400 transition-colors"
            >
              <PhoneOff className="h-6 w-6 text-white" />
            </button>

            {/* Speaker */}
            <button
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
              className={`h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
                !isSpeakerOn
                  ? "bg-neutral-700 text-neutral-400"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
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
