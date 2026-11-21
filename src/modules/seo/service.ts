import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { certificateExpiry, safeGet } from "../../server/safe-fetch";
import { invalid, notFound } from "../../lib/errors";
import { addDays, today } from "../../lib/format";
import { recordAudit } from "../audit/service";
import { integrationConnection, integrationResource } from "../integrations/schema";
import { product, productLink } from "../portfolio/schema";
import { createTask } from "../work/service";
import { crawl } from "./audit";
import { seoAudit, seoDaily, seoDimension, seoInsight, uptimeCheck } from "./schema";

/* ---------------- Search Console data ---------------- */

type Totals = { clicks: number; impressions: number; ctr: number; position: number };
function totals(rows: { clicks: number; impressions: number; position: number }[]): Totals {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  // Impression-weighted average position, matching how Search Console aggregates.
  const position = impressions ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

/** Properties visible to this workspace with freshness and connection state. */
export async function listProperties(ctx: Ctx, productId?: string) {
  assertCan(ctx, "seo.view");
  const where = [eq(integrationResource.workspaceId, ctx.workspaceId), eq(integrationResource.kind, "gsc_property")];
  if (productId) where.push(eq(integrationResource.productId, productId));
  return db
    .select({
      id: integrationResource.id, name: integrationResource.name, siteUrl: integrationResource.externalId, productId: integrationResource.productId,
      productName: product.name, productSlug: product.slug, lastSyncAt: integrationResource.lastSyncAt, dataThrough: integrationResource.dataThrough,
      connectionId: integrationResource.connectionId, connectionStatus: integrationConnection.status, connectionError: integrationConnection.lastError,
      account: integrationConnection.accountLabel,
    })
    .from(integrationResource)
    .innerJoin(integrationConnection, eq(integrationConnection.id, integrationResource.connectionId))
    .leftJoin(product, eq(product.id, integrationResource.productId))
    .where(and(...where))
    .orderBy(asc(integrationResource.name));
}
export type PropertyView = Awaited<ReturnType<typeof listProperties>>[number];

/** KPI totals for the last 28 days of available data vs the 28 days before, plus the daily series. */
export async function propertyOverview(ctx: Ctx, resourceId: string) {
  assertCan(ctx, "seo.view");
  const [res] = await db.select().from(integrationResource).where(and(eq(integrationResource.id, resourceId), eq(integrationResource.workspaceId, ctx.workspaceId)));
  if (!res) throw notFound("Property");
  const daily = await db.select({ day: seoDaily.day, clicks: seoDaily.clicks, impressions: seoDaily.impressions, ctr: seoDaily.ctr, position: seoDaily.position })
    .from(seoDaily).where(eq(seoDaily.resourceId, resourceId)).orderBy(asc(seoDaily.day));
  if (!daily.length) return { resource: res, daily, current: null, previous: null, queries: [], pages: [], countries: [], devices: [] };
  const end = daily.at(-1)!.day;
  const curStart = addDays(end, -27);
  const prevStart = addDays(curStart, -28);
  const cur = daily.filter((d) => d.day >= curStart);
  const prev = daily.filter((d) => d.day >= prevStart && d.day < curStart);
  const dims = await db.select().from(seoDimension).where(eq(seoDimension.resourceId, resourceId));
  const prevMap = (dim: string) => new Map(dims.filter((d) => d.dimension === dim && d.window === "previous").map((d) => [d.key, d]));
  const pq = prevMap("query");
  const pp = prevMap("page");
  const pick = (dim: string, prevM?: Map<string, (typeof dims)[number]>) =>
    dims.filter((d) => d.dimension === dim && d.window === "current").sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .map((d) => ({ key: d.key, clicks: d.clicks, impressions: d.impressions, ctr: d.ctr, position: d.position, prevClicks: prevM?.get(d.key)?.clicks ?? null }));
  return {
    resource: res,
    daily: daily.slice(-90),
    current: { ...totals(cur), from: curStart, to: end, days: cur.length },
    previous: prev.length ? { ...totals(prev), from: prevStart, to: addDays(curStart, -1), days: prev.length } : null,
    queries: pick("query", pq),
    pages: pick("page", pp),
    countries: pick("country"),
    devices: pick("device"),
  };
}

export async function listInsights(ctx: Ctx, f: { productId?: string; status?: "open" | "all" } = {}) {
  assertCan(ctx, "seo.view");
  const where = [eq(seoInsight.workspaceId, ctx.workspaceId)];
  if (f.productId) where.push(eq(seoInsight.productId, f.productId));
  if (f.status !== "all") where.push(eq(seoInsight.status, "open"));
  return db.select({ i: seoInsight, productName: product.name, productSlug: product.slug })
    .from(seoInsight).leftJoin(product, eq(product.id, seoInsight.productId))
    .where(and(...where))
    .orderBy(sql`case ${seoInsight.confidence} when 'high' then 0 when 'medium' then 1 else 2 end`, desc(seoInsight.detectedAt))
    .limit(200)
    .then((rows) => rows.map((r) => ({ ...r.i, productName: r.productName, productSlug: r.productSlug })));
}
export type InsightView = Awaited<ReturnType<typeof listInsights>>[number];

/** Insight → task: the evidence travels with the task so the work stays traceable. */
export async function insightToTask(ctx: Ctx, insightId: string) {
  assertCan(ctx, "work.edit");
  const [ins] = await db.select().from(seoInsight).where(and(eq(seoInsight.id, insightId), eq(seoInsight.workspaceId, ctx.workspaceId)));
  if (!ins) throw notFound("Insight");
  if (ins.taskId) throw invalid("A task already exists for this insight.");
  const evidence = Object.entries(ins.evidence).map(([k, v]) => `- **${k.replace(/([A-Z])/g, " $1").toLowerCase()}:** ${v}`).join("\n");
  const t = await createTask(ctx, {
    title: ins.title.slice(0, 200),
    description: `${ins.nextAction}\n\n### Evidence (Google Search Console)\n${evidence}\n\nConfidence: ${ins.confidence}. Created from an SEO insight.`,
    type: ins.kind.startsWith("declining") ? "bug" : "feature",
    priority: ins.confidence === "high" ? "high" : "medium",
    productId: ins.productId,
  });
  await db.update(seoInsight).set({ status: "task_created", taskId: t.id, updatedAt: new Date() }).where(eq(seoInsight.id, ins.id));
  return t;
}

export async function setInsightStatus(ctx: Ctx, insightId: string, status: "dismissed" | "open") {
  assertCan(ctx, "seo.run");
  const [ins] = await db.update(seoInsight).set({ status, updatedAt: new Date() })
    .where(and(eq(seoInsight.id, insightId), eq(seoInsight.workspaceId, ctx.workspaceId))).returning();
  if (!ins) throw notFound("Insight");
}

/* ---------------- Technical audit ---------------- */

async function productSite(ctx: Ctx, productId: string) {
  const [p] = await db.select({ id: product.id, name: product.name }).from(product).where(and(eq(product.id, productId), eq(product.workspaceId, ctx.workspaceId)));
  if (!p) throw notFound("Product");
  const links = await db.select({ kind: productLink.kind, url: productLink.url }).from(productLink)
    .where(and(eq(productLink.workspaceId, ctx.workspaceId), eq(productLink.productId, productId)));
  const site = links.find((l) => l.kind === "domain") ?? links.find((l) => l.kind === "app");
  return { product: p, url: site?.url ?? null, links };
}

export async function runAudit(ctx: Ctx, productId: string, maxPages = 25) {
  assertCan(ctx, "seo.run");
  const { product: p, url } = await productSite(ctx, productId);
  if (!url) throw invalid("Add a Domain or App link to this project first (Overview → Links).");
  const [running] = await db.select({ id: seoAudit.id }).from(seoAudit)
    .where(and(eq(seoAudit.workspaceId, ctx.workspaceId), eq(seoAudit.productId, productId), eq(seoAudit.status, "running"), gte(seoAudit.startedAt, new Date(Date.now() - 10 * 60000))));
  if (running) throw invalid("An audit is already running for this project.");
  const [a] = await db.insert(seoAudit).values({ workspaceId: ctx.workspaceId, productId, startUrl: url, startedBy: ctx.userId }).returning();
  try {
    const r = await crawl(url, Math.min(maxPages, 50));
    await db.update(seoAudit).set({ status: "completed", pages: r.pages, issues: r.issues, site: r.site, pagesCrawled: r.pages.length, finishedAt: new Date() }).where(eq(seoAudit.id, a!.id));
    await db.transaction((tx) => recordAudit(tx, ctx, { action: "seo.audit_completed", targetType: "product", targetId: productId, targetLabel: `${p.name}: ${r.pages.length} pages, ${r.issues.filter((i) => i.severity === "error").length} errors`, productId }));
  } catch (e) {
    await db.update(seoAudit).set({ status: "failed", error: e instanceof Error ? e.message : "Audit failed", finishedAt: new Date() }).where(eq(seoAudit.id, a!.id));
  }
  return a!.id;
}

export async function latestAudit(ctx: Ctx, productId: string) {
  assertCan(ctx, "seo.view");
  const [a] = await db.select().from(seoAudit).where(and(eq(seoAudit.workspaceId, ctx.workspaceId), eq(seoAudit.productId, productId))).orderBy(desc(seoAudit.startedAt)).limit(1);
  return a ?? null;
}

/* ---------------- Uptime ---------------- */

export async function checkUptime(ctx: Pick<Ctx, "workspaceId">, productId: string, trigger: "manual" | "schedule") {
  const links = await db.select({ kind: productLink.kind, url: productLink.url }).from(productLink)
    .where(and(eq(productLink.workspaceId, ctx.workspaceId), eq(productLink.productId, productId), inArray(productLink.kind, ["domain", "app"])));
  const results = [];
  for (const l of links) {
    let row: typeof uptimeCheck.$inferInsert;
    try {
      const r = await safeGet(l.url, { timeoutMs: 15000, maxBytes: 200_000 });
      const ssl = await certificateExpiry(r.url).catch(() => null);
      row = { workspaceId: ctx.workspaceId, productId, url: l.url, ok: r.status < 400, statusCode: r.status, responseMs: r.ms, sslExpiresAt: ssl, trigger };
    } catch (e) {
      row = { workspaceId: ctx.workspaceId, productId, url: l.url, ok: false, error: e instanceof Error ? (e.name === "AbortError" ? "Timed out" : e.message) : "Failed", trigger };
    }
    const [saved] = await db.insert(uptimeCheck).values(row).returning();
    results.push(saved!);
  }
  return results;
}

export async function runUptimeNow(ctx: Ctx, productId: string) {
  assertCan(ctx, "seo.run");
  const { url } = await productSite(ctx, productId);
  if (!url) throw invalid("Add a Domain or App link to this project first (Overview → Links).");
  return checkUptime(ctx, productId, "manual");
}

export async function uptimeSummary(ctx: Ctx, productId: string) {
  assertCan(ctx, "seo.view");
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await db.select().from(uptimeCheck)
    .where(and(eq(uptimeCheck.workspaceId, ctx.workspaceId), eq(uptimeCheck.productId, productId), gte(uptimeCheck.checkedAt, since)))
    .orderBy(desc(uptimeCheck.checkedAt)).limit(500);
  const byUrl = new Map<string, typeof rows>();
  for (const r of rows) byUrl.set(r.url, [...(byUrl.get(r.url) ?? []), r]);
  return [...byUrl.entries()].map(([url, checks]) => {
    const ok = checks.filter((c) => c.ok).length;
    const times = checks.filter((c) => c.responseMs).map((c) => c.responseMs!).sort((a, b) => a - b);
    return {
      url, checks: checks.length, availability: checks.length ? ok / checks.length : null,
      latest: checks[0]!, p50: times.length ? times[Math.floor(times.length / 2)]! : null,
      sslExpiresAt: checks.find((c) => c.sslExpiresAt)?.sslExpiresAt ?? null,
      recent: checks.slice(0, 30).reverse().map((c) => ({ ok: c.ok, at: c.checkedAt })),
    };
  });
}

/** Products with a domain/app link, for the scheduled uptime run. */
export async function productsWithSites() {
  return db.selectDistinct({ productId: productLink.productId, workspaceId: productLink.workspaceId })
    .from(productLink).innerJoin(product, eq(product.id, productLink.productId))
    .where(and(inArray(productLink.kind, ["domain", "app"]), sql`${product.archivedAt} is null`));
}

/** Portfolio SEO roll-up for the command center. */
export async function seoSnapshot(ctx: Ctx) {
  const props = await listProperties(ctx);
  const synced = props.filter((p) => p.dataThrough);
  const overviews = await Promise.all(synced.map((p) => propertyOverview(ctx, p.id)));
  const open = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(seoInsight)
    .where(and(eq(seoInsight.workspaceId, ctx.workspaceId), eq(seoInsight.status, "open"), isNotNull(seoInsight.productId)));
  return { properties: props.length, synced: synced.length, overviews, openInsights: open[0]?.n ?? 0, asOf: today() };
}
