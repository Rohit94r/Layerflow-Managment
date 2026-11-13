import Link from "next/link";
import { cn, initials } from "@/lib/format";
import { label } from "@/modules/portfolio/constants";

export function Logo({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <svg viewBox="0 0 32 32" className="size-6 shrink-0" aria-hidden>
        <path d="M16 4 28 10.5 16 17 4 10.5Z" fill="var(--cobalt)" />
        <path d="M4 15.5 16 22 28 15.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M4 21 16 27.5 28 21" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      {withName && <span className="font-serif text-[1.3rem] leading-none tracking-tight">LayerFlow</span>}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="truncate text-[1.85rem] leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel", className)}>
      {(title || action) && (
        <div className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  children,
  action,
  compact,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14")}>
      <div className="hatch mb-4 size-12 rounded-full border border-line-strong" aria-hidden />
      <h3 className="text-lg">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const TONES = {
  neutral: "bg-sunken text-ink-2 border-line",
  cobalt: "bg-cobalt-soft text-cobalt border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  outline: "bg-transparent text-ink-2 border-line-strong",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[1.35rem] items-center gap-1 whitespace-nowrap rounded-[5px] border px-1.5 text-[11.5px] font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

export const HEALTH_TONE: Record<string, Tone> = { healthy: "good", watch: "warn", at_risk: "warn", critical: "bad", unknown: "outline" };
export const PRIORITY_TONE: Record<string, Tone> = { p0: "bad", p1: "warn", p2: "neutral", p3: "outline" };

export function HealthBadge({ health }: { health: string }) {
  return (
    <Badge tone={HEALTH_TONE[health] ?? "neutral"}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label(health)}
    </Badge>
  );
}

export function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  const tone: Tone = ["live", "growth"].includes(lifecycle)
    ? "cobalt"
    : ["paused", "sunset", "sunset_planned", "archived"].includes(lifecycle)
      ? "outline"
      : "neutral";
  return <Badge tone={tone}>{label(lifecycle)}</Badge>;
}

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className={cn("inline-grid size-6 place-items-center rounded-full border border-dashed border-line-strong text-[10px] text-muted", className)}>—</span>;
  return (
    <span
      title={name}
      className={cn("inline-grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-semibold text-bg", className)}
    >
      {initials(name)}
    </span>
  );
}

export function ProductMark({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn("inline-grid size-7 shrink-0 place-items-center rounded-md font-serif text-[13px] text-white", className)}
      style={{ background: color }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Stat({ label: l, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="eyebrow">{l}</div>
      <div className="mt-1.5 font-serif text-[1.9rem] leading-none tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1.5 text-[12.5px] text-muted">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="panel block px-4 py-3.5 transition-colors hover:border-cobalt">
      {body}
    </Link>
  ) : (
    <div className="panel px-4 py-3.5">{body}</div>
  );
}

export function Field({
  label: l,
  name,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  name?: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={name}>
        {l}
      </label>
      {children}
      {error ? <p className="mt-1 text-[12px] text-bad">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function NoAccess({ what = "this page" }: { what?: string }) {
  return (
    <div className="panel">
      <EmptyState title="You don't have access">
        Your role in this workspace can&apos;t view {what}. Ask a workspace owner or admin if you need it.
      </EmptyState>
    </div>
  );
}

/** Labelled data provenance, per the "every metric shows its source" rule. */
export function SourceNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-2 text-[11.5px] text-muted", className)}>{children}</p>;
}
