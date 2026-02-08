"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/firebase";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.push("/");
    } catch (err) {
      setError("Failed to sign in. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center p-6 gradient-hero">
      <div className="w-full max-w-sm animate-fade-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-12">
          <div className="relative mb-6">
            <img
              src="/app/logo-dark.png"
              alt="BACKBONE"
              className="h-[80px] w-[80px] rounded-[22px]"
            />
            <div className="absolute inset-0 rounded-[22px] ring-1 ring-white/[0.06]" />
          </div>
          <h1 className="text-[32px] font-bold text-white tracking-tight">
            BACKBONE
          </h1>
          <p className="text-[14px] text-neutral-500 mt-1.5">
            Life optimization engine
          </p>
        </div>

        {/* Login card */}
        <div className="card-elevated p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-900/30 text-red-400 text-[13px]">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-[#1a1a1a] border border-[#222] text-white hover:bg-[#222] hover:border-[#2a2a2a] transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            {isLoading ? (
              <div className="flex items-center gap-2.5">
                <div className="h-4 w-4 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[13px] text-neutral-400">
                  Signing in...
                </span>
              </div>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="text-[13px] font-semibold">
                  Sign in with Google
                </span>
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-neutral-700">
            Secure authentication via Firebase
          </p>
        </div>
      </div>
    </div>
  );
}
