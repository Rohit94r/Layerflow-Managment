import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, notInArray } from "drizzle-orm";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { decrypt, encrypt, sha256 } from "../../server/crypto";
import { conflict, invalid, notFound } from "../../lib/errors";
import { addDays, today } from "../../lib/format";
import { CATALOG, isConfigured } from "../../integrations/core/catalog";
import { ProviderError } from "../../integrations/core/http";
import * as gsc from "../../integrations/providers/google-search-console";
import * as ga4 from "../../integrations/providers/google-analytics";
import * as google from "../../integrations/providers/google-oauth";
import { recordAudit } from "../audit/service";
import { product } from "../portfolio/schema";
import { workspace } from "../identity/schema";
import { seoDaily, seoDimension, seoInsight } from "../seo/schema";
import { detectInsights } from "../seo/insights";
import { analyticsDaily, analyticsDimension } from "../analytics/schema";
import { integrationConnection, integrationResource, oauthState, syncRun } from "./schema";

type Resource = typeof integrationResource.$inferSelect;
type Trigger = "manual" | "schedule" | "connect";

/**
 * Provider registry. Every provider shares the Google OAuth + encrypted token lifecycle and differs in
 * the scope it needs, how it discovers resources, and how it syncs one mapped resource.
 */
const PROVIDERS: Record<string, {
  label: string;
  scopes: string[];
  hasScope: (granted: string[]) => boolean;
  missingScope: string;
  discover: (token: string) => Promise<{ kind: string; externalId: string; name: string; metadata: Record<string, unknown> }[]>;
  sync: (workspaceId: string, connectionId: string, r: Resource, trigger: Trigger) => Promise<boolean>;
}> = {
  google_search_console: {
    label: "Google Search Console",
    scopes: gsc.GSC_SCOPES,
    hasScope: (s) => s.some((x) => x.endsWith("webmasters.readonly") || x.endsWith("webmasters")),
    missingScope: "Search Console access wasn't granted. Tick the Search Console permission on Google's consent screen.",
    discover: async (token) => (await gsc.listSites(token)).map((s) => ({
      kind: "gsc_property", externalId: s.siteUrl, name: s.siteUrl.replace(/^sc-domain:/, "Domain: ").replace(/\/$/, ""), metadata: { permissionLevel: s.permissionLevel },
    })),
    sync: (ws, conn, r, trigger) => syncProperty(ws, conn, r, trigger),
  },
  google_analytics: {
    label: "Google Analytics 4",
    scopes: ga4.GA4_SCOPES,
    hasScope: (s) => s.some((x) => x.endsWith("analytics.readonly") || x.endsWith("/analytics")),
    missingScope: "Analytics access wasn't granted. Tick the Google Analytics permission on Google's consent screen.",
    discover: async (token) => (await ga4.listProperties(token)).map((p) => ({
      kind: "ga4_property", externalId: p.property, name: `${p.displayName} (${p.accountName})`, metadata: { account: p.account, propertyId: p.property.replace("properties/", "") },
    })),
    sync: (ws, conn, r, trigger) => syncGa4Property(ws, conn, r, trigger),
  },
};
const providerOf = (id: string) => {
  const p = PROVIDERS[id];
  if (!p) throw invalid("Unknown integration.");
  return p;
};
export const providerLabel = (id: string) => PROVIDERS[id]?.label ?? id;

/* ---------------- Catalog & listing ---------------- */

export function catalog() {
  return CATALOG.map((c) => ({ ...c, configured: isConfigured(c) }));
}

export async function listConnections(ctx: Ctx) {
  assertCan(ctx, "integration.view");
  const conns = await db
    .select({
      id: integrationConnection.id, provider: integrationConnection.provider, accountLabel: integrationConnection.accountLabel,
      scopes: integrationConnection.scopes, status: integrationConnection.status, lastSyncAt: integrationConnection.lastSyncAt,
      lastSuccessAt: integrationConnection.lastSuccessAt, lastError: integrationConnection.lastError, createdAt: integrationConnection.createdAt,
      connectedBy: integrationConnection.connectedBy,
    })
    .from(integrationConnection)
    .where(and(eq(integrationConnection.workspaceId, ctx.workspaceId), notInArray(integrationConnection.status, ["revoked"])))
    .orderBy(desc(integrationConnection.createdAt));
  if (!conns.length) return [];
  const ids = conns.map((c) => c.id);
  const [resources, runs] = await Promise.all([
    db.select({ r: integrationResource, productName: product.name, productSlug: product.slug })
      .from(integrationResource).leftJoin(product, eq(product.id, integrationResource.productId))
      .where(and(eq(integrationResource.workspaceId, ctx.workspaceId), inArray(integrationResource.connectionId, ids))),
    db.select().from(syncRun).where(and(eq(syncRun.workspaceId, ctx.workspaceId), inArray(syncRun.connectionId, ids))).orderBy(desc(syncRun.startedAt)).limit(30),
  ]);
  return conns.map((c) => ({
    ...c,
    resources: resources.filter((x) => x.r.connectionId === c.id).map((x) => ({ ...x.r, productName: x.productName, productSlug: x.productSlug })),
    runs: runs.filter((r) => r.connectionId === c.id).slice(0, 8),
  }));
}
export type ConnectionView = Awaited<ReturnType<typeof listConnections>>[number];

/* ---------------- OAuth ---------------- */

export async function startOAuth(ctx: Ctx, provider: string) {
  assertCan(ctx, "integration.manage");
  const entry = CATALOG.find((c) => c.id === provider);
  if (!entry || entry.state !== "available") throw invalid("This integration isn't available yet.");
  if (!isConfigured(entry)) throw invalid(`Set ${entry.envVars.join(" and ")} on the server to enable this integration.`);
  const def = providerOf(provider);
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = google.pkcePair();
  // Clean up stale states, then store this one (hashed) for 10 minutes.
  await db.delete(oauthState).where(lt(oauthState.expiresAt, new Date()));
  await db.insert(oauthState).values({
    id: sha256(state), workspaceId: ctx.workspaceId, userId: ctx.userId, provider, codeVerifier: encrypt(verifier),
    expiresAt: new Date(Date.now() + 10 * 60000),
  });
  return google.authorizationUrl(provider, def.scopes, state, challenge);
}

/** Completes the OAuth callback. The state binds the flow to the user and workspace that started it. */
export async function completeOAuth(userId: string, state: string, code: string) {
  const [st] = await db.delete(oauthState).where(eq(oauthState.id, sha256(state))).returning();
  if (!st || st.expiresAt < new Date()) throw invalid("This connection attempt expired. Start again.");
  if (st.userId !== userId) throw invalid("This connection was started by a different user.");
  const [ws] = await db.select({ slug: workspace.slug }).from(workspace).where(eq(workspace.id, st.workspaceId));
  if (!ws) throw notFound("Workspace");

  const PROVIDER = st.provider;
  const def = providerOf(PROVIDER);
  const t = await google.exchangeCode(PROVIDER, code, decrypt(st.codeVerifier));
  const scopes = t.scope.split(" ");
  if (!def.hasScope(scopes)) throw invalid(def.missingScope);

  const ctxLike = { workspaceId: st.workspaceId, userId };
  const connectionId = await db.transaction(async (tx) => {
    // Reconnecting the same Google account replaces the old connection's tokens instead of duplicating it.
    const [existing] = await tx.select().from(integrationConnection).where(and(
      eq(integrationConnection.workspaceId, st.workspaceId), eq(integrationConnection.provider, PROVIDER),
      eq(integrationConnection.accountLabel, t.email),
    ));
    const values = {
      scopes, status: "active" as const, accessTokenEnc: encrypt(t.access_token),
      refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : (existing?.refreshTokenEnc ?? null),
      tokenExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), lastError: null, updatedAt: new Date(),
    };
    let id: string;
    if (existing) {
      await tx.update(integrationConnection).set(values).where(eq(integrationConnection.id, existing.id));
      id = existing.id;
    } else {
      const [c] = await tx.insert(integrationConnection).values({ ...values, workspaceId: st.workspaceId, provider: PROVIDER, accountLabel: t.email, connectedBy: userId }).returning();
      id = c!.id;
    }
    await recordAudit(tx, ctxLike, { action: existing ? "integration.reconnected" : "integration.connected", targetType: "integration", targetId: id, targetLabel: `${def.label} (${t.email || "account"})`, actorType: "human" });
    return id;
  });
  await discoverResources(ctxLike, connectionId);
  return { slug: ws.slug, connectionId, workspaceId: st.workspaceId };
}

/* ---------------- Tokens ---------------- */

async function accessToken(connectionId: string) {
  const [c] = await db.select().from(integrationConnection).where(eq(integrationConnection.id, connectionId));
  if (!c || c.status === "revoked" || !c.accessTokenEnc) throw new ProviderError("auth", "Not connected.");
  if (c.tokenExpiresAt && c.tokenExpiresAt > new Date()) return decrypt(c.accessTokenEnc);
  if (!c.refreshTokenEnc) throw new ProviderError("auth", "No refresh token; reconnect to continue.");
  try {
    const t = await google.refreshAccessToken(decrypt(c.refreshTokenEnc));
    await db.update(integrationConnection).set({
      accessTokenEnc: encrypt(t.access_token), tokenExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), status: "active", updatedAt: new Date(),
    }).where(eq(integrationConnection.id, c.id));
    return t.access_token;
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "auth") {
      await db.update(integrationConnection).set({ status: "needs_reauth", lastError: e.message, updatedAt: new Date() }).where(eq(integrationConnection.id, c.id));
    }
    throw e;
  }
}

/* ---------------- Resources ---------------- */

export async function discoverResources(ctx: Pick<Ctx, "workspaceId" | "userId">, connectionId: string) {
  const [c] = await db.select({ provider: integrationConnection.provider }).from(integrationConnection).where(eq(integrationConnection.id, connectionId));
  const def = providerOf(c?.provider ?? "");
  const token = await accessToken(connectionId);
  const found = await def.discover(token);
  for (const f of found) {
    await db.insert(integrationResource).values({ workspaceId: ctx.workspaceId, connectionId, ...f })
      .onConflictDoUpdate({ target: [integrationResource.connectionId, integrationResource.externalId], set: { name: f.name, metadata: f.metadata } });
  }
  return found.length;
}

export async function refreshResources(ctx: Ctx, connectionId: string) {
  assertCan(ctx, "integration.manage");
  await ownedConnection(ctx, connectionId);
  return discoverResources(ctx, connectionId);
}

/** Explicit mapping prevents accidental attribution of data to the wrong product. */
export async function mapResource(ctx: Ctx, resourceId: string, productId: string | null) {
  assertCan(ctx, "integration.manage");
  const [r] = await db.select().from(integrationResource).where(and(eq(integrationResource.id, resourceId), eq(integrationResource.workspaceId, ctx.workspaceId)));
  if (!r) throw notFound("Resource");
  if (productId) {
    const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, productId), eq(product.workspaceId, ctx.workspaceId)));
    if (!p) throw invalid("Unknown product.");
  }
  await db.transaction(async (tx) => {
    await tx.update(integrationResource).set({ productId }).where(eq(integrationResource.id, resourceId));
    await tx.update(seoInsight).set({ productId }).where(and(eq(seoInsight.workspaceId, ctx.workspaceId), eq(seoInsight.resourceId, resourceId)));
    await recordAudit(tx, ctx, { action: "integration.resource_mapped", targetType: "integration", targetId: r.connectionId, targetLabel: r.name, productId, changes: { product: { from: r.productId, to: productId } } });
  });
}

async function ownedConnection(ctx: Pick<Ctx, "workspaceId">, id: string) {
  const [c] = await db.select().from(integrationConnection).where(and(eq(integrationConnection.id, id), eq(integrationConnection.workspaceId, ctx.workspaceId)));
  if (!c) throw notFound("Connection");
  return c;
}

/* ---------------- Sync ---------------- */

/** Syncs every mapped property of a connection. Each property gets its own sync_run row. */
export async function syncConnection(ctx: Pick<Ctx, "workspaceId" | "userId">, connectionId: string, trigger: Trigger) {
  const c = await ownedConnection(ctx, connectionId);
  if (c.status === "revoked") throw conflict("This connection was disconnected.");
  const def = providerOf(c.provider);
  const resources = await db.select().from(integrationResource).where(and(
    eq(integrationResource.connectionId, connectionId), eq(integrationResource.syncEnabled, 1),
  ));
  const mapped = resources.filter((r) => r.productId);
  let ok = 0;
  let failed = 0;
  for (const r of mapped) {
    const res = await def.sync(ctx.workspaceId, c.id, r, trigger);
    if (res) ok++;
    else failed++;
  }
  const [after] = await db.select({ status: integrationConnection.status, lastError: integrationConnection.lastError }).from(integrationConnection).where(eq(integrationConnection.id, c.id));
  await db.update(integrationConnection).set({
    lastSyncAt: new Date(), ...(failed === 0 && mapped.length ? { lastSuccessAt: new Date(), lastError: null } : {}), updatedAt: new Date(),
  }).where(eq(integrationConnection.id, c.id));
  return { synced: ok, failed, unmapped: resources.length - mapped.length, status: after?.status, error: after?.lastError };
}

async function syncProperty(workspaceId: string, connectionId: string, r: Resource, trigger: Trigger) {
  const end = addDays(today(), -3); // Search Console data typically lands after 2–3 days.
  const dailyStart = addDays(end, -89);
  const curStart = addDays(end, -27);
  const prevEnd = addDays(curStart, -1);
  const prevStart = addDays(prevEnd, -27);
  const [run] = await db.insert(syncRun).values({ workspaceId, connectionId, resourceId: r.id, trigger, periodStart: dailyStart, periodEnd: end }).returning();
  try {
    const token = await accessToken(connectionId);
    const site = r.externalId;
    const [daily, q, p, pq, pp, country, device] = await Promise.all([
      gsc.searchAnalytics(token, site, { startDate: dailyStart, endDate: end, dimensions: ["date"], rowLimit: 1000 }),
      gsc.searchAnalytics(token, site, { startDate: curStart, endDate: end, dimensions: ["query"], rowLimit: 500 }),
      gsc.searchAnalytics(token, site, { startDate: curStart, endDate: end, dimensions: ["page"], rowLimit: 500 }),
      gsc.searchAnalytics(token, site, { startDate: prevStart, endDate: prevEnd, dimensions: ["query"], rowLimit: 500 }),
      gsc.searchAnalytics(token, site, { startDate: prevStart, endDate: prevEnd, dimensions: ["page"], rowLimit: 500 }),
      gsc.searchAnalytics(token, site, { startDate: curStart, endDate: end, dimensions: ["country"], rowLimit: 25 }),
      gsc.searchAnalytics(token, site, { startDate: curStart, endDate: end, dimensions: ["device"], rowLimit: 5 }),
    ]);
    const toRow = (x: gsc.GscRow) => ({ key: x.keys?.[0] ?? "", clicks: Math.round(x.clicks), impressions: Math.round(x.impressions), ctr: x.ctr, position: x.position });
    let written = 0;
    await db.transaction(async (tx) => {
      for (const d of daily) {
        const row = toRow(d);
        await tx.insert(seoDaily).values({ workspaceId, resourceId: r.id, day: row.key, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position })
          .onConflictDoUpdate({ target: [seoDaily.resourceId, seoDaily.day], set: { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position } });
        written++;
      }
      await tx.delete(seoDimension).where(eq(seoDimension.resourceId, r.id));
      const dims: [typeof seoDimension.$inferInsert["dimension"], typeof seoDimension.$inferInsert["window"], gsc.GscRow[]][] = [
        ["query", "current", q], ["page", "current", p], ["query", "previous", pq], ["page", "previous", pp], ["country", "current", country], ["device", "current", device],
      ];
      for (const [dimension, window, rows] of dims) {
        const values = rows.map((x) => ({ ...toRow(x), workspaceId, resourceId: r.id, dimension, window }));
        for (let i = 0; i < values.length; i += 200) await tx.insert(seoDimension).values(values.slice(i, i + 200));
        written += values.length;
      }
    });
    const dataThrough = daily.map((d) => d.keys?.[0] ?? "").sort().at(-1) ?? null;
    await db.update(integrationResource).set({ lastSyncAt: new Date(), dataThrough }).where(eq(integrationResource.id, r.id));
    await refreshInsights(workspaceId, r, { queries: q.map(toRow), pages: p.map(toRow), prevQueries: pq.map(toRow), prevPages: pp.map(toRow), period: `${curStart} → ${end} vs ${prevStart} → ${prevEnd}` });
    await db.update(syncRun).set({ status: "succeeded", recordsWritten: written, finishedAt: new Date() }).where(eq(syncRun.id, run!.id));
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await db.update(syncRun).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(syncRun.id, run!.id));
    await db.update(integrationConnection).set({
      lastError: msg, ...(e instanceof ProviderError && e.kind === "auth" ? { status: "needs_reauth" as const } : e instanceof ProviderError ? { status: "error" as const } : {}),
    }).where(eq(integrationConnection.id, connectionId));
    return false;
  }
}

async function refreshInsights(workspaceId: string, r: typeof integrationResource.$inferSelect, input: Parameters<typeof detectInsights>[0]) {
  const drafts = detectInsights(input);
  const keys = new Set(drafts.map((d) => `${d.kind}|${d.key}`));
  await db.transaction(async (tx) => {
    for (const d of drafts) {
      await tx.insert(seoInsight).values({
        workspaceId, resourceId: r.id, productId: r.productId, kind: d.kind, key: d.key, title: d.title, evidence: d.evidence,
        confidence: d.confidence, nextAction: d.nextAction, periodLabel: input.period,
      }).onConflictDoUpdate({
        target: [seoInsight.workspaceId, seoInsight.kind, seoInsight.key, seoInsight.resourceId],
        set: { title: d.title, evidence: d.evidence, confidence: d.confidence, periodLabel: input.period, updatedAt: new Date() },
      });
    }
    // Open insights whose evidence disappeared are marked resolved (never silently deleted).
    const open = await tx.select({ id: seoInsight.id, kind: seoInsight.kind, key: seoInsight.key }).from(seoInsight)
      .where(and(eq(seoInsight.resourceId, r.id), eq(seoInsight.status, "open")));
    const gone = open.filter((o) => !keys.has(`${o.kind}|${o.key}`)).map((o) => o.id);
    if (gone.length) await tx.update(seoInsight).set({ status: "resolved", updatedAt: new Date() }).where(inArray(seoInsight.id, gone));
  });
}

/* ---------------- Google Analytics 4 sync ---------------- */

const GA_DIMS: [typeof analyticsDimension.$inferInsert["dimension"], string, number][] = [
  ["channel", "sessionDefaultChannelGroup", 25], ["landing_page", "landingPage", 200], ["device", "deviceCategory", 5], ["source", "sessionSource", 50],
];

async function syncGa4Property(workspaceId: string, connectionId: string, r: Resource, trigger: Trigger) {
  const end = addDays(today(), -1); // GA4 finalises recent days over 24–48h; the UI says so.
  const dailyStart = addDays(end, -89);
  const curStart = addDays(end, -27);
  const prevEnd = addDays(curStart, -1);
  const prevStart = addDays(prevEnd, -27);
  const [run] = await db.insert(syncRun).values({ workspaceId, connectionId, resourceId: r.id, trigger, periodStart: dailyStart, periodEnd: end }).returning();
  try {
    const token = await accessToken(connectionId);
    const dimMetrics = ["sessions", "totalUsers", "engagedSessions", "keyEvents"] as const;
    const [daily, ...dims] = await Promise.all([
      ga4.runReport(token, r.externalId, { startDate: dailyStart, endDate: end, dimensions: ["date"], metrics: ga4.GA4_METRICS, limit: 400 }),
      ...GA_DIMS.flatMap(([, name, limit]) => [
        ga4.runReport(token, r.externalId, { startDate: curStart, endDate: end, dimensions: [name], metrics: dimMetrics, limit, orderByMetric: "sessions" }),
        ga4.runReport(token, r.externalId, { startDate: prevStart, endDate: prevEnd, dimensions: [name], metrics: dimMetrics, limit, orderByMetric: "sessions" }),
      ]),
    ]);
    const n = (v: number | undefined) => Math.round(v ?? 0);
    let written = 0;
    await db.transaction(async (tx) => {
      for (const d of daily) {
        const day = ga4.ga4Date(d.keys[0] ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        const v = { sessions: n(d.values.sessions), users: n(d.values.totalUsers), newUsers: n(d.values.newUsers), pageViews: n(d.values.screenPageViews), engagedSessions: n(d.values.engagedSessions), keyEvents: n(d.values.keyEvents) };
        await tx.insert(analyticsDaily).values({ workspaceId, resourceId: r.id, day, ...v }).onConflictDoUpdate({ target: [analyticsDaily.resourceId, analyticsDaily.day], set: v });
        written++;
      }
      await tx.delete(analyticsDimension).where(eq(analyticsDimension.resourceId, r.id));
      for (let i = 0; i < GA_DIMS.length; i++) {
        for (const [w, rows] of [["current", dims[i * 2]!], ["previous", dims[i * 2 + 1]!]] as const) {
          const values = rows.map((x) => ({
            workspaceId, resourceId: r.id, dimension: GA_DIMS[i]![0], window: w, key: (x.keys[0] || "(not set)").slice(0, 500),
            sessions: n(x.values.sessions), users: n(x.values.totalUsers), engagedSessions: n(x.values.engagedSessions), keyEvents: n(x.values.keyEvents),
          }));
          for (let j = 0; j < values.length; j += 200) await tx.insert(analyticsDimension).values(values.slice(j, j + 200));
          written += values.length;
        }
      }
    });
    const dataThrough = daily.map((d) => ga4.ga4Date(d.keys[0] ?? "")).sort().at(-1) ?? null;
    await db.update(integrationResource).set({ lastSyncAt: new Date(), dataThrough }).where(eq(integrationResource.id, r.id));
    await db.update(syncRun).set({ status: "succeeded", recordsWritten: written, finishedAt: new Date() }).where(eq(syncRun.id, run!.id));
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    await db.update(syncRun).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(syncRun.id, run!.id));
    await db.update(integrationConnection).set({
      lastError: msg, ...(e instanceof ProviderError && e.kind === "auth" ? { status: "needs_reauth" as const } : e instanceof ProviderError ? { status: "error" as const } : {}),
    }).where(eq(integrationConnection.id, connectionId));
    return false;
  }
}

/* ---------------- Disconnect ---------------- */

export async function disconnect(ctx: Ctx, connectionId: string, deleteData: boolean) {
  assertCan(ctx, "integration.manage");
  const c = await ownedConnection(ctx, connectionId);
  // Revoke at Google first (best effort), then delete local tokens.
  if (c.refreshTokenEnc) await google.revokeToken(decrypt(c.refreshTokenEnc));
  else if (c.accessTokenEnc) await google.revokeToken(decrypt(c.accessTokenEnc));
  await db.transaction(async (tx) => {
    if (deleteData) {
      await tx.delete(integrationConnection).where(eq(integrationConnection.id, c.id)); // cascades to resources, SEO data, runs
    } else {
      await tx.update(integrationConnection).set({ status: "revoked", accessTokenEnc: null, refreshTokenEnc: null, updatedAt: new Date() }).where(eq(integrationConnection.id, c.id));
    }
    await recordAudit(tx, ctx, { action: "integration.disconnected", targetType: "integration", targetId: c.id, targetLabel: `${providerLabel(c.provider)} (${c.accountLabel})`, changes: { dataDeleted: { from: null, to: deleteData } } });
  });
}

/** Connections due for a scheduled sync (used by the cron endpoint). */
export async function dueConnections() {
  return db.select({ id: integrationConnection.id, workspaceId: integrationConnection.workspaceId, connectedBy: integrationConnection.connectedBy })
    .from(integrationConnection)
    .where(and(eq(integrationConnection.status, "active"), isNull(integrationConnection.lastSyncAt)))
    .union(
      db.select({ id: integrationConnection.id, workspaceId: integrationConnection.workspaceId, connectedBy: integrationConnection.connectedBy })
        .from(integrationConnection)
        .where(and(eq(integrationConnection.status, "active"), lt(integrationConnection.lastSyncAt, new Date(Date.now() - 20 * 3600 * 1000)))),
    );
}
