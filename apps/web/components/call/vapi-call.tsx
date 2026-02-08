"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  AlertCircle,
} from "lucide-react";

const API_BASE = "http://localhost:3000";

export function VapiCallView() {
  const [callState, setCallState] = useState<
    "idle" | "connecting" | "active" | "ended" | "error"
  >("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [transcript, setTranscript] = useState<
    { role: string; text: string }[]
  >([]);
  const [duration, setDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [callId, setCallId] = useState<string | null>(null);

  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Poll call status for transcript updates
  const pollStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/vapi/status`);
      if (!resp.ok) return;
      const status = await resp.json();

      // Update transcript if we have new entries
      if (status.transcript && status.transcript.length > 0) {
        setTranscript(status.transcript);
      }

      // Detect call ended from server side
      if (!status.active && callState === "active") {
        setCallState("ended");
        cleanup();
      }
    } catch {
      // Silent fail — polling continues
    }
  }, [callState]);

  const cleanup = useCallback(() => {
    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const startCall = async () => {
    setCallState("connecting");
    setErrorMsg("");
    setTranscript([]);
    setDuration(0);

    try {
      const resp = await fetch(`${API_BASE}/api/vapi/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await resp.json();

      if (resp.ok && data.success) {
        setCallState("active");
        setCallId(data.callId || null);

        // Start duration counter
        durationRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);

        // Start polling for transcript updates (every 2 seconds)
        pollRef.current = setInterval(pollStatus, 2000);
      } else {
        setErrorMsg(data.error || "Failed to start call");
        setCallState("error");
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message === "Failed to fetch"
          ? "Cannot reach BACKBONE server. Make sure the engine is running."
          : err?.message || "Connection failed"
      );
      setCallState("error");
    }
  };

  const endCall = async () => {
    cleanup();
    try {
      await fetch(`${API_BASE}/api/vapi/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });
    } catch {
      // Best effort
    }
    setCallState("ended");
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
          <img
            src="/app/logo-dark.png"
            alt="B"
            className={`h-20 w-20 rounded-2xl ${
              callState === "connecting" ? "animate-pulse" : ""
            }`}
          />

          {/* Ripple effect when active */}
          {callState === "active" && (
            <>
              <div className="absolute -inset-4 rounded-full border-2 border-white/10 pulse-ring" />
              <div
                className="absolute -inset-4 rounded-full border border-white/5 pulse-ring"
                style={{ animationDelay: "0.7s" }}
              />
            </>
          )}
        </div>

        <h2 className="text-[18px] font-semibold text-white tracking-tight mb-1">
          {callState === "idle"
            ? "BACKBONE Voice"
            : callState === "connecting"
            ? "Calling your phone..."
            : callState === "active"
            ? "Cole — In Call"
            : callState === "error"
            ? "Connection Failed"
            : "Call Ended"}
        </h2>

        {callState === "active" && (
          <p className="text-[15px] text-neutral-400 font-mono tabular-nums">
            {formatDuration(duration)}
          </p>
        )}

        {callState === "idle" && (
          <p className="text-[13px] text-neutral-500 text-center max-w-[280px] mt-1 leading-relaxed">
            Start a voice conversation with Cole, your BACKBONE assistant. He'll
            call your phone.
          </p>
        )}

        {callState === "error" && (
          <div className="flex items-center gap-2 mt-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <p className="text-[12px] text-red-400 max-w-[280px]">
              {errorMsg}
            </p>
          </div>
        )}

        {callState === "ended" && (
          <p className="text-[13px] text-neutral-600 mt-1">
            {transcript.length > 0
              ? `${transcript.length} messages — tap to call again`
              : "Tap to call again"}
          </p>
        )}
      </div>

      {/* Transcript */}
      {transcript.length > 0 && (
        <div className="mx-5 mb-4 card-surface max-h-56 overflow-y-auto no-scrollbar p-4">
          {transcript.map((t, i) => (
            <div key={i} className="mb-2.5 last:mb-0">
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  t.role === "user" ? "text-neutral-500" : "text-orange-500"
                }`}
              >
                {t.role === "user" ? "You" : "Cole"}
              </span>
              <p className="text-[12px] text-neutral-300 mt-0.5 leading-relaxed">
                {t.text}
              </p>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* Connecting hint */}
      {callState === "connecting" && (
        <div className="mx-5 mb-4 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
            Cole is preparing context and calling your phone. Answer to start
            the conversation.
          </p>
        </div>
      )}

      {/* Call controls */}
      <div className="px-5 py-8 flex items-center justify-center gap-5">
        {callState === "idle" || callState === "ended" || callState === "error" ? (
          <button
            onClick={startCall}
            className="h-16 w-16 rounded-full bg-white flex items-center justify-center hover:bg-neutral-200 transition-all active:scale-90 shadow-lg shadow-white/10"
          >
            <Phone className="h-7 w-7 text-black" />
          </button>
        ) : callState === "connecting" ? (
          <button
            onClick={() => { cleanup(); setCallState("idle"); }}
            className="h-16 w-16 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-all active:scale-90"
          >
            <PhoneOff className="h-7 w-7 text-neutral-300" />
          </button>
        ) : (
          <>
            {/* Mute */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="transition-all active:scale-90"
            >
              {isMuted ? (
                <MicOff className="h-6 w-6 text-red-400" />
              ) : (
                <Mic className="h-6 w-6 text-white" />
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
              className="transition-all active:scale-90"
            >
              {isSpeakerOn ? (
                <Volume2 className="h-6 w-6 text-white" />
              ) : (
                <VolumeX className="h-6 w-6 text-neutral-600" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
