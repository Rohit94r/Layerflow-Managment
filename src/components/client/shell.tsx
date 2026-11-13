"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity, BookOpen, Bot, Check, ChevronsUpDown, CircleDollarSign, FileText, Home, Inbox, LayoutGrid, ListChecks, LogOut,
  Map as MapIcon, Menu, Moon, Plug, Plus, Search, Settings, Sun, SunMoon, TrendingUp, Workflow, X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/format";
import { Logo } from "@/components/ui";

type Nav = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean };

export type ShellProps = {
  slug: string;
  workspaceName: string;
  workspaces: { slug: string; name: string; role: string }[];
  products: { slug: string; name: string; brandColor: string; pinned: boolean }[];
  user: { name: string; email: string };
  caps: { finance: boolean; audit: boolean; seo: boolean; planning: boolean; automation: boolean; agents: boolean; integrations: boolean };
  inboxCount?: number;
  children: React.ReactNode;
};

export function Shell(props: ShellProps) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  // Close the mobile drawer after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawer(false);
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-bg lg:block">
        <Sidebar {...props} />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-4 backdrop-blur lg:hidden">
        <button className="btn btn-ghost -ml-2 px-2" aria-label="Open navigation" onClick={() => setDrawer(true)}>
          <Menu className="size-5" />
        </button>
        <Link href={`/w/${props.slug}`}>
          <Logo />
        </Link>
        <PaletteButton compact />
      </div>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-line bg-bg pt-8 shadow-float">
            <button className="btn btn-ghost absolute right-2 top-2 px-2" aria-label="Close navigation" onClick={() => setDrawer(false)}>
              <X className="size-5" />
            </button>
            <Sidebar {...props} />
          </div>
        </div>
      )}

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{props.children}</div>
      </main>
      <CommandPalette slug={props.slug} products={props.products} caps={props.caps} />
    </div>
  );
}

function Sidebar({ slug, workspaceName, workspaces, products, user, caps }: ShellProps) {
  const pathname = usePathname();
  const base = `/w/${slug}`;
  const nav: Nav[] = [
    { href: base, label: "Command center", icon: Home, exact: true },
    { href: `${base}/inbox`, label: "Inbox", icon: Inbox },
    { href: `${base}/products`, label: "Portfolio", icon: LayoutGrid },
    { href: `${base}/work`, label: "Work", icon: ListChecks },
    ...(caps.planning ? [{ href: `${base}/roadmap`, label: "Roadmap & goals", icon: MapIcon }] : []),
    { href: `${base}/docs`, label: "Docs & decisions", icon: BookOpen },
    ...(caps.seo ? [{ href: `${base}/seo`, label: "SEO", icon: TrendingUp }] : []),
    ...(caps.finance ? [{ href: `${base}/finance`, label: "Finance", icon: CircleDollarSign }] : []),
    ...(caps.automation ? [{ href: `${base}/automations`, label: "Automations", icon: Workflow }] : []),
    ...(caps.agents ? [{ href: `${base}/agents`, label: "Agents", icon: Bot }] : []),
    ...(caps.integrations ? [{ href: `${base}/integrations`, label: "Integrations", icon: Plug }] : []),
    ...(caps.audit ? [{ href: `${base}/activity`, label: "Activity", icon: Activity }] : []),
    { href: `${base}/settings`, label: "Settings", icon: Settings },
  ];
  const isActive = (n: Nav) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`));
  const shown = products.filter((p) => p.pinned).slice(0, 8);
  const list = shown.length ? shown : products.slice(0, 6);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-5">
        <Link href={base} className="mb-4 hidden lg:inline-flex">
          <Logo />
        </Link>
        <WorkspaceSwitcher slug={slug} name={workspaceName} workspaces={workspaces} />
      </div>
      <div className="px-3 pb-2">
        <PaletteButton />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        <ul className="space-y-0.5">
          {nav.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={isActive(n) ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
                  isActive(n) ? "bg-ink text-bg" : "text-ink-2 hover:bg-sunken hover:text-ink",
                )}
              >
                <n.icon className="size-4 shrink-0" />
                {n.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center justify-between px-2.5">
          <span className="eyebrow">{shown.length ? "Pinned" : "Products"}</span>
          <Link href={`${base}/products/new`} className="text-muted hover:text-cobalt" aria-label="New product" title="New product">
            <Plus className="size-3.5" />
          </Link>
        </div>
        <ul className="mt-1.5 space-y-0.5">
          {list.map((p) => {
            const href = `${base}/products/${p.slug}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={p.slug}>
                <Link
                  href={href}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px]",
                    active ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.brandColor }} />
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            );
          })}
          {!products.length && <li className="px-2.5 py-1 text-[12.5px] text-muted">No products yet.</li>}
        </ul>
      </nav>
      <UserMenu user={user} />
    </div>
  );
}

function WorkspaceSwitcher({ slug, name, workspaces }: { slug: string; name: string; workspaces: ShellProps["workspaces"] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  return (
    <details ref={ref} className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 hover:border-line-strong [&::-webkit-details-marker]:hidden">
        <span className="hatch grid size-6 shrink-0 place-items-center rounded border border-line-strong font-serif text-[12px]">{name[0]?.toUpperCase()}</span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{name}</span>
        <ChevronsUpDown className="size-3.5 text-muted" />
      </summary>
      <div className="absolute inset-x-0 top-11 z-40 rounded-lg border border-line-strong bg-surface p-1 shadow-float">
        <div className="eyebrow px-2 py-1.5">Workspaces</div>
        {workspaces.map((w) => (
          <Link key={w.slug} href={`/w/${w.slug}`} className="flex h-8 items-center gap-2 rounded-md px-2 text-[13.5px] hover:bg-sunken">
            <span className="min-w-0 flex-1 truncate">{w.name}</span>
            {w.slug === slug && <Check className="size-3.5 text-cobalt" />}
          </Link>
        ))}
        <div className="my-1 border-t border-line" />
        <Link href="/onboarding?new=1" className="flex h-8 items-center gap-2 rounded-md px-2 text-[13.5px] text-ink-2 hover:bg-sunken">
          <Plus className="size-3.5" /> New workspace
        </Link>
      </div>
    </details>
  );
}

function UserMenu({ user }: { user: { name: string; email: string } }) {
  const router = useRouter();
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-bg">
          {user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{user.name}</div>
          <div className="truncate text-[11.5px] text-muted">{user.email}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <ThemeToggle />
        <button
          className="btn btn-ghost btn-sm ml-auto"
          onClick={async () => {
            await authClient.signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
}

type Theme = "system" | "light" | "dark";
const THEME_EVENT = "app:theme";
function readTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
function subscribeTheme(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  const next = () => {
    const order = ["system", "light", "dark"] as const;
    const t = order[(order.indexOf(theme) + 1) % 3]!;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : SunMoon;
  return (
    <button className="btn btn-ghost btn-sm" onClick={next} aria-label={`Theme: ${theme}. Change theme`} title={`Theme: ${theme}`}>
      <Icon className="size-3.5" /> <span className="capitalize">{theme}</span>
    </button>
  );
}

/* ---------------- Command palette ---------------- */

const OPEN_EVENT = "app:palette";

function PaletteButton({ compact }: { compact?: boolean }) {
  const open = () => window.dispatchEvent(new Event(OPEN_EVENT));
  if (compact)
    return (
      <button className="btn btn-ghost -mr-2 px-2" onClick={open} aria-label="Search">
        <Search className="size-5" />
      </button>
    );
  return (
    <button
      onClick={open}
      className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[13px] text-muted hover:border-line-strong"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Search or jump to…</span>
      <kbd className="rounded border border-line px-1 font-mono text-[10.5px]">Ctrl K</kbd>
    </button>
  );
}

type Item = { id: string; label: string; hint?: string; href: string; icon: React.ComponentType<{ className?: string }> };

function CommandPalette({ slug, products, caps }: { slug: string; products: ShellProps["products"]; caps: ShellProps["caps"] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const base = `/w/${slug}`;

  const staticItems = useMemo<Item[]>(
    () => [
      { id: "new-product", label: "New product", href: `${base}/products/new`, icon: Plus },
      { id: "new-task", label: "New task", href: `${base}/work?new=1`, icon: Plus },
      { id: "new-doc", label: "New document or decision", href: `${base}/docs/new`, icon: Plus },
      { id: "home", label: "Command center", href: base, icon: Home },
      { id: "portfolio", label: "Portfolio", href: `${base}/products`, icon: LayoutGrid },
      { id: "work", label: "Work", href: `${base}/work`, icon: ListChecks },
      { id: "my-work", label: "My open tasks", href: `${base}/work?assignee=me`, icon: ListChecks },
      { id: "docs", label: "Docs & decisions", href: `${base}/docs`, icon: BookOpen },
      ...(caps.finance ? [{ id: "finance", label: "Finance", href: `${base}/finance`, icon: CircleDollarSign }] : []),
      ...(caps.audit ? [{ id: "activity", label: "Activity", href: `${base}/activity`, icon: Activity }] : []),
      { id: "settings", label: "Settings", href: `${base}/settings`, icon: Settings },
      ...products.map((p) => ({ id: `p-${p.slug}`, label: p.name, hint: "Product", href: `${base}/products/${p.slug}`, icon: LayoutGrid })),
    ],
    [base, products, caps],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const local = term ? staticItems.filter((i) => i.label.toLowerCase().includes(term)) : staticItems.slice(0, 11);
    const seen = new Set(local.map((i) => i.href));
    // Remote results only apply to queries long enough to have been searched.
    const hits = term.length >= 2 ? remote : [];
    return [...local, ...hits.filter((r) => !seen.has(r.href))];
  }, [q, staticItems, remote]);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setRemote([]);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/w/${slug}/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { hits: { id: string; title: string; subtitle: string; href: string; type: string }[] };
        setRemote(
          data.hits.map((h) => ({
            id: `${h.type}-${h.id}`,
            label: h.title,
            hint: h.type === "task" ? `Task · ${h.subtitle}` : h.type === "doc" ? `Doc · ${h.subtitle}` : "Product",
            href: h.href,
            icon: h.type === "task" ? ListChecks : h.type === "doc" ? FileText : LayoutGrid,
          })),
        );
      } catch {
        /* aborted or offline: keep local results */
      } finally {
        setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, slug]);

  if (!open) return null;
  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={close} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line-strong bg-surface shadow-float">
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <Search className="size-4 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") go(filtered[index]);
            }}
            placeholder="Search products, tasks (#12), docs… or type a command"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
            aria-label="Search"
          />
          {loading && <span className="text-[11.5px] text-muted">Searching…</span>}
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {filtered.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === index}>
              <button
                className={cn("flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13.5px]", i === index ? "bg-ink text-bg" : "text-ink-2")}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(item)}
              >
                <item.icon className="size-4 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="shrink-0 text-[11.5px] opacity-60">{item.hint}</span>}
              </button>
            </li>
          ))}
          {!filtered.length && <li className="px-3 py-6 text-center text-muted">{loading ? "Searching…" : "No matches."}</li>}
        </ul>
      </div>
    </div>
  );
}
