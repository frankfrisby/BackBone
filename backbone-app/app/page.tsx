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
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setLoading(false);
      if (!user) {
        router.push("/auth/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center">
            <span className="text-lg font-bold text-orange-500">B</span>
          </div>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-500 rounded-full typing-dot" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <AppShell />;
}
