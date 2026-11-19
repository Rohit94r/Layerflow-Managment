import { and, asc, eq } from "drizzle-orm";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { notFound } from "../../lib/errors";
import { addDays } from "../../lib/format";
import { integrationConnection, integrationResource } from "../integrations/schema";
import { product } from "../portfolio/schema";
import { analyticsDaily, analyticsDimension } from "./schema";

export type GaTotals = { sessions: number; users: number; newUsers: number; pageViews: number; engagedSessions: number; keyEvents: number; engagementRate: number };

/** Sums daily rows. Users are summed per day, so this is "daily users summed", labelled as such in the UI. */
export function sumDaily(rows: Omit<GaTotals, "engagementRate">[]): GaTotals {
  const t = rows.reduce(
    (s, r) => ({ sessions: s.sessions + r.sessions, users: s.users + r.users, newUsers: s.newUsers + r.newUsers, pageViews: s.pageViews + r.pageViews, engagedSessions: s.engagedSessions + r.engagedSessions, keyEvents: s.keyEvents + r.keyEvents }),
    { sessions: 0, users: 0, newUsers: 0, pageViews: 0, engagedSessions: 0, keyEvents: 0 },
  );
  return { ...t, engagementRate: t.sessions ? t.engagedSessions / t.sessions : 0 };
}

export async function listAnalyticsProperties(ctx: Ctx, productId?: string) {
  assertCan(ctx, "analytics.view");
  const where = [eq(integrationResource.workspaceId, ctx.workspaceId), eq(integrationResource.kind, "ga4_property")];
  if (productId) where.push(eq(integrationResource.productId, productId));
  return db
    .select({
      id: integrationResource.id, name: integrationResource.name, externalId: integrationResource.externalId, productId: integrationResource.productId,
      productName: product.name, productSlug: product.slug, lastSyncAt: integrationResource.lastSyncAt, dataThrough: integrationResource.dataThrough,
      connectionStatus: integrationConnection.status, connectionError: integrationConnection.lastError,
    })
    .from(integrationResource)
    .innerJoin(integrationConnection, eq(integrationConnection.id, integrationResource.connectionId))
    .leftJoin(product, eq(product.id, integrationResource.productId))
    .where(and(...where))
    .orderBy(asc(integrationResource.name));
}
export type AnalyticsPropertyView = Awaited<ReturnType<typeof listAnalyticsProperties>>[number];

/** Last 28 days of available data vs the 28 before, plus the daily series and breakdowns. */
export async function analyticsOverview(ctx: Ctx, resourceId: string) {
  assertCan(ctx, "analytics.view");
  const [res] = await db.select().from(integrationResource).where(and(eq(integrationResource.id, resourceId), eq(integrationResource.workspaceId, ctx.workspaceId)));
  if (!res) throw notFound("Property");
  const daily = await db.select({
    day: analyticsDaily.day, sessions: analyticsDaily.sessions, users: analyticsDaily.users, newUsers: analyticsDaily.newUsers,
    pageViews: analyticsDaily.pageViews, engagedSessions: analyticsDaily.engagedSessions, keyEvents: analyticsDaily.keyEvents,
  }).from(analyticsDaily).where(eq(analyticsDaily.resourceId, resourceId)).orderBy(asc(analyticsDaily.day));
  if (!daily.length) return { resource: res, daily, current: null, previous: null, channels: [], landingPages: [], devices: [], sources: [] };
  const end = daily.at(-1)!.day;
  const curStart = addDays(end, -27);
  const prevStart = addDays(curStart, -28);
  const cur = daily.filter((d) => d.day >= curStart);
  const prev = daily.filter((d) => d.day >= prevStart && d.day < curStart);
  const dims = await db.select().from(analyticsDimension).where(eq(analyticsDimension.resourceId, resourceId));
  const pick = (dim: string) => {
    const prevMap = new Map(dims.filter((d) => d.dimension === dim && d.window === "previous").map((d) => [d.key, d]));
    return dims.filter((d) => d.dimension === dim && d.window === "current").sort((a, b) => b.sessions - a.sessions)
      .map((d) => ({ key: d.key, sessions: d.sessions, users: d.users, keyEvents: d.keyEvents, engagementRate: d.sessions ? d.engagedSessions / d.sessions : 0, prevSessions: prevMap.get(d.key)?.sessions ?? null }));
  };
  return {
    resource: res,
    daily: daily.slice(-90),
    current: { ...sumDaily(cur), from: curStart, to: end, days: cur.length },
    previous: prev.length ? { ...sumDaily(prev), from: prevStart, to: addDays(curStart, -1), days: prev.length } : null,
    channels: pick("channel"),
    landingPages: pick("landing_page"),
    devices: pick("device"),
    sources: pick("source"),
  };
}
export type AnalyticsOverview = Awaited<ReturnType<typeof analyticsOverview>>;
