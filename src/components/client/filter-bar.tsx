"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/format";

export type FilterField = { name: string; label: string; options: { value: string; label: string }[] };

/** URL-driven filters: every view is shareable and survives refresh. */
export function FilterBar({ fields, searchPlaceholder = "Search…", children }: { fields: FilterField[]; searchPlaceholder?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => set("q", q.trim()), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = fields.some((f) => params.get(f.name)) || params.get("q");

  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", pending && "opacity-70")}>
      <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="input pl-8" aria-label="Search" />
      </div>
      {fields.map((f) => (
        <select
          key={f.name}
          aria-label={f.label}
          className={cn("input w-auto", params.get(f.name) && "border-cobalt text-cobalt")}
          value={params.get(f.name) ?? ""}
          onChange={(e) => set(f.name, e.target.value)}
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {active && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setQ("");
            const next = new URLSearchParams();
            for (const keep of ["view", "layout"]) if (params.get(keep)) next.set(keep, params.get(keep)!);
            start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
          }}
        >
          <X className="size-3.5" /> Clear
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
