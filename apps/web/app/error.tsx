"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App Error]", error);
  }, [error]);

  return (
    <div className="min-h-screen w-full bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-[#1a1a1a] bg-[#0b0b0b] p-6 space-y-4">
        <h1 className="text-xl font-semibold">App Error</h1>
        <p className="text-sm text-neutral-400">
          A client-side exception occurred. Details are shown below.
        </p>
        <div className="rounded-xl border border-[#1a1a1a] bg-black p-4 text-xs text-neutral-300 whitespace-pre-wrap">
          {error?.name}: {error?.message}
          {error?.digest ? `\nDigest: ${error.digest}` : ""}
          {error?.stack ? `\n\n${error.stack}` : ""}
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
