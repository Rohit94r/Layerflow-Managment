import { can, type Ctx } from "../../server/permissions";
import { daysUntil, today } from "../../lib/format";
import { attentionSignals, listProducts, type ProductRow } from "../portfolio/service";
import { listTasks, taskCountsByProduct } from "../work/service";
import { listInsights, seoSnapshot } from "../seo/service";
import { analyticsOverview, listAnalyticsProperties } from "../analytics/service";
import { contentStats, listPosts, type ProductContentStats } from "../content/service";
import { listApprovals } from "../automation/inbox";
import { listConnections } from "../integrations/service";
import { upcomingRenewals } from "../finance/service";

/**
 * Cross-module read models for the command center and the Growth dashboard.
 * Every number here comes from stored records; anything not connected is reported as null, never 0.
 */

type Window = { current: number; previous: number | null };
export type PulseRow = {
  product: Pick<ProductRow, "id" | "name" | "slug" | "brandColor" | "lifecycle" | "health" | "priority" | "focus" | "pinned">;
  openTasks: number;
  overdueTasks: number;
  signals: number;
  topSignal: string | null;
  search: (Window & { impressions: number; dataThrough: string }) | null;
  traffic: (Window & { keyEvents: number; prevKeyEvents: number | null; dataThrough: string }) | null;
  content: ProductContentStats | null;
  openSeoInsights: number;
};

export const change = (w: { current: number; previous: number | null } | null) =>
  w && w.previous !== null && w.previous > 0 ? (w.current - w.previous) / w.previous : null;

/** One row per active product: delivery, search, traffic and content side by side. */
export async function portfolioPulse(ctx: Ctx): Promise<PulseRow[]> {
  if (!can(ctx, "product.view")) return [];
  const [products, signals, counts, seo, gaProps, content, insights] = await Promise.all([
    listProducts(ctx),
    attentionSignals(ctx),
    can(ctx, "work.view") ? taskCountsByProduct(ctx) : Promise.resolve(new Map<string, { open: number; overdue: number }>()),
    can(ctx, "seo.view") ? seoSnapshot(ctx) : Promise.resolve(null),
    can(ctx, "analytics.view") ? listAnalyticsProperties(ctx) : Promise.resolve([]),
    contentStats(ctx),
    can(ctx, "seo.view") ? listInsights(ctx) : Promise.resolve([]),
  ]);
  const ga = await Promise.all(gaProps.filter((p) => p.productId && p.dataThrough).map(async (p) => ({ p, o: await analyticsOverview(ctx, p.id) })));

  return products.map((p) => {
    const sig = (signals.get(p.id) ?? []).sort((a, b) => (a.severity === "high" ? 0 : a.severity === "medium" ? 1 : 2) - (b.severity === "high" ? 0 : b.severity === "medium" ? 1 : 2));
    const searchRows = seo?.overviews.filter((o) => o.resource.productId === p.id && o.current) ?? [];
    const search = searchRows.length
      ? {
          current: searchRows.reduce((s, o) => s + o.current!.clicks, 0),
          previous: searchRows.every((o) => o.previous) ? searchRows.reduce((s, o) => s + o.previous!.clicks, 0) : null,
          impressions: searchRows.reduce((s, o) => s + o.current!.impressions, 0),
          dataThrough: searchRows.map((o) => o.current!.to).sort()[0]!,
        }
      : null;
    const gaRows = ga.filter((g) => g.p.productId === p.id && g.o.current);
    const traffic = gaRows.length
      ? {
          current: gaRows.reduce((s, g) => s + g.o.current!.sessions, 0),
          previous: gaRows.every((g) => g.o.previous) ? gaRows.reduce((s, g) => s + g.o.previous!.sessions, 0) : null,
          keyEvents: gaRows.reduce((s, g) => s + g.o.current!.keyEvents, 0),
          prevKeyEvents: gaRows.every((g) => g.o.previous) ? gaRows.reduce((s, g) => s + g.o.previous!.keyEvents, 0) : null,
          dataThrough: gaRows.map((g) => g.o.current!.to).sort()[0]!,
        }
      : null;
    return {
      product: { id: p.id, name: p.name, slug: p.slug, brandColor: p.brandColor, lifecycle: p.lifecycle, health: p.health, priority: p.priority, focus: p.focus, pinned: p.pinned },
      openTasks: counts.get(p.id)?.open ?? 0,
      overdueTasks: counts.get(p.id)?.overdue ?? 0,
      signals: sig.length,
      topSignal: sig[0]?.label ?? null,
      search,
      traffic,
      content: can(ctx, "content.view") ? (content.get(p.id) ?? { published30d: 0, published: 0, scheduled: 0, inReview: 0, drafts: 0, ideas: 0, lastPublishedAt: null }) : null,
      openSeoInsights: insights.filter((i) => i.productId === p.id && i.status === "open").length,
    };
  });
}

export type NextAction = {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "approval" | "work" | "content" | "growth" | "seo" | "integration" | "finance" | "product";
  title: string;
  detail: string;
  href: string;
  cta: string;
  product?: { name: string; brandColor: string } | null;
};

const RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

/**
 * "What should I do next?" Deterministic rules over stored records, ranked by severity.
 * Each item names the evidence and links to the exact place to act.
 */
export async function nextActions(ctx: Ctx, pulse?: PulseRow[]): Promise<NextAction[]> {
  const base = `/w/${ctx.workspaceSlug}`;
  const rows = pulse ?? (await portfolioPulse(ctx));
  const [approvals, overdue, review, connections, renewals] = await Promise.all([
    can(ctx, "approval.decide") ? listApprovals(ctx) : Promise.resolve([]),
    // Overdue work that is mine, or that nobody owns (on a solo team that is also mine).
    can(ctx, "work.view")
      ? Promise.all([listTasks(ctx, { assigneeId: "me", status: "open", overdue: true }), listTasks(ctx, { assigneeId: "none", status: "open", overdue: true })]).then(([a, b]) => [...a, ...b])
      : Promise.resolve([]),
    can(ctx, "content.publish") ? listPosts(ctx, { status: "in_review", limit: 20 }) : Promise.resolve([]),
    can(ctx, "integration.view") ? listConnections(ctx) : Promise.resolve([]),
    can(ctx, "finance.view") ? upcomingRenewals(ctx, 7) : Promise.resolve([]),
  ]);
  const out: NextAction[] = [];

  for (const a of approvals.slice(0, 5)) {
    out.push({ id: `approval:${a.id}`, severity: a.risk === "high" ? "critical" : "high", category: "approval", title: a.summary, detail: `Requested by ${a.requestedByType} “${a.requestedByName}”.`, href: `${base}/inbox#approvals`, cta: "Review" });
  }
  for (const c of connections.filter((c) => c.status === "needs_reauth" || c.status === "error")) {
    out.push({ id: `conn:${c.id}`, severity: "high", category: "integration", title: `${c.provider === "google_analytics" ? "Google Analytics" : "Search Console"} ${c.status === "needs_reauth" ? "needs reconnecting" : "sync is failing"}`, detail: "Data on dashboards is going stale until this is fixed.", href: `${base}/integrations`, cta: "Fix" });
  }
  for (const t of overdue.slice(0, 5)) {
    out.push({ id: `task:${t.id}`, severity: t.priority === "urgent" ? "critical" : t.priority === "high" ? "high" : "medium", category: "work", title: `#${t.number} ${t.title}`, detail: `Overdue by ${-daysUntil(t.dueDate!)} day(s)${t.productName ? ` · ${t.productName}` : ""}${t.assigneeId ? "" : " · no owner"}.`, href: `${base}/work/${t.number}`, cta: "Open" });
  }
  for (const p of review.slice(0, 5)) {
    out.push({ id: `review:${p.id}`, severity: "medium", category: "content", title: `Review “${p.title}”`, detail: `${p.source === "agent" ? "Agent draft" : "Draft"} · SEO score ${p.seoScore} · ${p.wordCount.toLocaleString("en-US")} words · ${p.productName}`, href: `${base}/content/${p.id}`, cta: "Review", product: { name: p.productName, brandColor: p.brandColor } });
  }
  for (const r of renewals) {
    out.push({ id: `renewal:${r.id}`, severity: "medium", category: "finance", title: `${r.vendor} renews ${daysUntil(r.nextRenewalDate!) === 0 ? "today" : `in ${daysUntil(r.nextRenewalDate!)}d`}`, detail: "Renew, downgrade or cancel before it charges.", href: `${base}/finance`, cta: "Decide" });
  }
  for (const r of rows) {
    const prod = { name: r.product.name, brandColor: r.product.brandColor };
    const t = change(r.traffic);
    if (t !== null && t <= -0.25 && (r.traffic!.previous ?? 0) >= 200) {
      out.push({ id: `traffic:${r.product.id}`, severity: t <= -0.5 ? "critical" : "high", category: "growth", title: `${r.product.name}: traffic down ${Math.round(-t * 100)}%`, detail: `${r.traffic!.current.toLocaleString("en-US")} sessions vs ${r.traffic!.previous!.toLocaleString("en-US")} in the previous 28 days (Google Analytics, through ${r.traffic!.dataThrough}).`, href: `${base}/products/${r.product.slug}/growth`, cta: "Investigate", product: prod });
    }
    const s = change(r.search);
    if (s !== null && s <= -0.25 && (r.search!.previous ?? 0) >= 50) {
      out.push({ id: `search:${r.product.id}`, severity: "high", category: "seo", title: `${r.product.name}: search clicks down ${Math.round(-s * 100)}%`, detail: `${r.search!.current.toLocaleString("en-US")} vs ${r.search!.previous!.toLocaleString("en-US")} clicks (Search Console, through ${r.search!.dataThrough}).`, href: `${base}/products/${r.product.slug}/seo`, cta: "Investigate", product: prod });
    }
    if (r.openSeoInsights >= 3) {
      out.push({ id: `seo:${r.product.id}`, severity: "low", category: "seo", title: `${r.product.name}: ${r.openSeoInsights} SEO opportunities open`, detail: "Evidence-backed from Search Console. Turn the best ones into tasks or posts.", href: `${base}/products/${r.product.slug}/seo`, cta: "Review", product: prod });
    }
    const live = ["live", "growth", "public_beta", "maintenance"].includes(r.product.lifecycle);
    if (r.content && live && r.content.published > 0 && r.content.scheduled === 0) {
      const since = r.content.lastPublishedAt ? Math.floor((Date.now() - r.content.lastPublishedAt.getTime()) / 86400000) : null;
      if (since !== null && since >= 21) {
        out.push({ id: `cadence:${r.product.id}`, severity: "low", category: "content", title: `${r.product.name}: no new post in ${since} days`, detail: "Nothing scheduled. Draft a post from an SEO opportunity or let the Content Writer agent propose one.", href: `${base}/content?product=${r.product.slug}`, cta: "Plan a post", product: prod });
      }
    }
    if (r.product.health === "critical" || r.product.health === "at_risk") {
      out.push({ id: `health:${r.product.id}`, severity: r.product.health === "critical" ? "critical" : "high", category: "product", title: `${r.product.name} is ${r.product.health.replace("_", " ")}`, detail: r.topSignal ?? "Review the project's health reason and set a recovery task.", href: `${base}/products/${r.product.slug}`, cta: "Open", product: prod });
    }
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, 12);
}

export const asOf = () => today();
