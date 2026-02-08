"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChange } from "@/lib/firebase";
import { AppShell } from "@/components/layout/app-shell";
import { User } from "firebase/auth";

function isLocalMode(): boolean {
  if (typeof window === "undefined") return false;
  const port = parseInt(window.location.port, 10);
  return port === 3000 || window.location.pathname.startsWith("/app");
}

// Default local user (overwritten by /api/user/profile fetch)
const DEFAULT_LOCAL_USER = {
  uid: "local",
  displayName: "User",
  email: "local@backbone",
  photoURL: null,
} as unknown as User;

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // In local mode, fetch real user profile from server (includes photoURL)
    if (isLocalMode()) {
      fetch("/api/user/profile")
        .then((r) => r.ok ? r.json() : null)
        .then((profile) => {
          setUser({
            uid: profile?.uid || "local",
            displayName: profile?.displayName || "User",
            email: profile?.email || "local@backbone",
            photoURL: profile?.photoURL || null,
          } as unknown as User);
          setLoading(false);
        })
        .catch(() => {
          setUser(DEFAULT_LOCAL_USER);
          setLoading(false);
        });
      return;
    }

    const unsubscribe = onAuthStateChange((u) => {
      setUser(u);
      setLoading(false);
      if (!u) {
        router.push("/auth/login");
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img
            src="/app/logo-dark.png"
            alt="BACKBONE"
            className="h-12 w-12 rounded-xl"
          />
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <AppShell user={user} />;
}
