"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";

export function Tabs({ items }: { items: { href: string; label: string; count?: number; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto overflow-y-hidden border-b border-line px-4 sm:mx-0 sm:px-0" aria-label="Sections">
      <ul className="flex min-w-max gap-1">
        {items.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px]",
                  active ? "border-cobalt font-medium text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.count ? <span className="rounded bg-sunken px-1 text-[11px] text-ink-2">{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
