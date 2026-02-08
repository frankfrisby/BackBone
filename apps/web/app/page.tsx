"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChange } from "@/lib/firebase";
import { AppShell } from "@/components/layout/app-shell";
import { User } from "firebase/auth";

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
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
            src="/logo-dark.png"
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
