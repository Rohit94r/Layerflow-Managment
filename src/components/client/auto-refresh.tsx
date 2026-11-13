"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Polls the server component while something is in progress (e.g. a live agent run). */
export function AutoRefresh({ active, everyMs = 2500 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs, router]);
  return null;
}
