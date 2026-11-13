"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/format";

type Toast = { id: number; message: string; tone: "info" | "error" };

export function toast(message: string, tone: Toast["tone"] = "info") {
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent<Omit<Toast, "id">>).detail;
      const id = Date.now() + Math.random();
      setItems((xs) => [...xs.slice(-3), { id, message, tone }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-[13.5px] shadow-float",
            t.tone === "error" ? "border-bad bg-bad-soft text-bad" : "border-line-strong bg-ink text-bg",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
