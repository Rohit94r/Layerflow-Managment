import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
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
import * as vercel from "../../integrations/providers/vercel";
import { recordAudit } from "../audit/service";
import { product, productLink } from "../portfolio/schema";
import { deployment } from "../deploys/schema";
import { workspace } from "../identity/schema";
import { seoDaily, seoDimension, seoInsight } from "../seo/schema";
import { detectInsights } from "../seo/insights";
import { analyticsDaily, analyticsDimension } from "../analytics/schema";
import { integrationConnection, integrationResource, oauthState, syncRun } from "./schema";

type Resource = typeof integrationResource.$inferSelect;
type Trigger = "manual" | "schedule" | "connect" | "webhook" | "refresh";

/**
 * Provider registry. Every provider shares the encrypted token lifecycle and differs in how it is authorised
 * (Google OAuth, or a pasted access token for Vercel), the scope it needs, how it discovers resources,
 * and how it syncs one mapped resource.
 */
const PROVIDERS: Record<string, {
  label: string;
  auth: "google_oauth" | "token";
  resourceNoun: [string, string];
  scopes: string[];
  hasScope: (granted: string[]) => boolean;
  missingScope: string;
  discover: (token: string) => Promise<{ kind: string; externalId: string; name: string; metadata: Record<string, unknown> }[]>;
  sync: (workspaceId: string, connectionId: string, r: Resource, trigger: Trigger) => Promise<boolean>;
}> = {
  google_search_console: {
    label: "Google Search Console",
    auth: "google_oauth",
    resourceNoun: ["property", "properties"],
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
    auth: "google_oauth",
    resourceNoun: ["property", "properties"],
    scopes: ga4.GA4_SCOPES,
    hasScope: (s) => s.some((x) => x.endsWith("analytics.readonly") || x.endsWith("/analytics")),
    missingScope: "Analytics access wasn't granted. Tick the Google Analytics permission on Google's consent screen.",
    discover: async (token) => (await ga4.listProperties(token)).map((p) => ({
      kind: "ga4_property", externalId: p.property, name: `${p.displayName} (${p.accountName})`, metadata: { account: p.account, propertyId: p.property.replace("properties/", "") },
    })),
    sync: (ws, conn, r, trigger) => syncGa4Property(ws, conn, r, trigger),
  },
  vercel: {
    label: "Vercel",
    auth: "token",
    resourceNoun: ["Vercel project", "Vercel projects"],
    scopes: [],
    hasScope: () => true,
    missingScope: "",
    discover: async (token) => (await vercel.discoverProjects(token)).map((p) => ({
      kind: "vercel_project", externalId: p.id, name: p.teamId ? `${p.name} (${p.teamSlug})` : p.name,
      metadata: { projectName: p.name, teamId: p.teamId, teamSlug: p.teamSlug, framework: p.framework, repo: p.repo, repoUrl: p.repoUrl, productionBranch: p.productionBranch },
    })),
    sync: (ws, conn, r, trigger) => syncVercelProject(ws, conn, r, trigger),
  },
};
const providerOf = (id: string) => {
  const p = PROVIDERS[id];
  if (!p) throw invalid("Unknown integration.");
  return p;
};
export const providerLabel = (id: string) => PROVIDERS[id]?.label ?? id;
/** Singular and plural name of what a provider syncs ("property", "project"). */
export const resourceNoun = (id: string) => PROVIDERS[id]?.resourceNoun ?? ["property", "properties"];

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
      connectedBy: integrationConnection.connectedBy, webhookLastAt: integrationConnection.webhookLastAt,
      hasWebhook: sql<boolean>`${integrationConnection.webhookSecretEnc} is not null`,
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
  if (def.auth !== "google_oauth") throw invalid(`${def.label} connects with an access token: use Connect on the Integrations page.`);
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

/**
 * Connects a provider that authorises with a pasted access token (Vercel). The token is checked against the
 * provider before it is stored, encrypted. Connecting the same account again replaces its token.
 */
export async function connectWithToken(ctx: Ctx, provider: string, rawToken: string) {
  assertCan(ctx, "integration.manage");
  const def = providerOf(provider);
  if (def.auth !== "token") throw invalid(`${def.label} connects through Google sign-in.`);
  const token = rawToken.trim();
  if (token.length < 16 || token.length > 512 || /\s/.test(token)) throw invalid("Paste the whole access token (no spaces).", { token: "Paste the whole access token." });
  let user: vercel.VercelUser;
  try {
    user = await vercel.whoAmI(token);
  } catch (e) {
    if (e instanceof ProviderError && (e.kind === "auth" || e.kind === "forbidden")) {
      throw invalid("Vercel didn't accept this token. Check you copied all of it and that it hasn't expired.", { token: "Vercel didn't accept this token." });
    }
    throw invalid(`Couldn't reach Vercel (${e instanceof Error ? e.message : "network error"}). Try again.`);
  }
  const label = user.email || user.username;
  const connectionId = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(integrationConnection).where(and(
      eq(integrationConnection.workspaceId, ctx.workspaceId), eq(integrationConnection.provider, provider), eq(integrationConnection.accountLabel, label),
    ));
    const values = { scopes: [], status: "active" as const, accessTokenEnc: encrypt(token), refreshTokenEnc: null, tokenExpiresAt: null, lastError: null, updatedAt: new Date() };
    let id: string;
    if (existing) {
      await tx.update(integrationConnection).set(values).where(eq(integrationConnection.id, existing.id));
      id = existing.id;
    } else {
      const [c] = await tx.insert(integrationConnection).values({ ...values, workspaceId: ctx.workspaceId, provider, accountLabel: label, connectedBy: ctx.userId }).returning();
      id = c!.id;
    }
    await recordAudit(tx, ctx, { action: existing ? "integration.reconnected" : "integration.connected", targetType: "integration", targetId: id, targetLabel: `${def.label} (${label})` });
    return id;
  });
  const found = await discoverResources(ctx, connectionId);
  // A reconnect keeps existing mappings: refresh their data straight away.
  await syncConnection(ctx, connectionId, "connect").catch(() => null);
  return { connectionId, found };
}

/* ---------------- Tokens ---------------- */

async function accessToken(connectionId: string) {
  const [c] = await db.select().from(integrationConnection).where(eq(integrationConnection.id, connectionId));
  if (!c || c.status === "revoked" || !c.accessTokenEnc) throw new ProviderError("auth", "Not connected.");
  // Pasted access tokens (Vercel) have no expiry or refresh token here; the provider rejects them when they lapse.
  if (providerOf(c.provider).auth === "token") return decrypt(c.accessTokenEnc);
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
      // Merge so values learned during sync (such as a Vercel project's production domain) survive rediscovery.
      .onConflictDoUpdate({
        target: [integrationResource.connectionId, integrationResource.externalId],
        set: { name: f.name, metadata: sql`coalesce(${integrationResource.metadata}, '{}'::jsonb) || ${JSON.stringify(f.metadata)}::jsonb` },
      });
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
    if (!p) throw invalid("Unknown project.");
  }
  // Names, not ids, in the activity log.
  const ids = [r.productId, productId].filter((x): x is string => Boolean(x));
  const names = new Map((ids.length ? await db.select({ id: product.id, name: product.name }).from(product).where(inArray(product.id, ids)) : []).map((x) => [x.id, x.name]));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? id) : null);
  await db.transaction(async (tx) => {
    await tx.update(integrationResource).set({ productId }).where(eq(integrationResource.id, resourceId));
    await tx.update(seoInsight).set({ productId }).where(and(eq(seoInsight.workspaceId, ctx.workspaceId), eq(seoInsight.resourceId, resourceId)));
    await recordAudit(tx, ctx, { action: "integration.resource_mapped", targetType: "integration", targetId: r.connectionId, targetLabel: r.name, productId, changes: { product: { from: nameOf(r.productId), to: nameOf(productId) } } });
  });
  if (productId && r.kind === "vercel_project") return linkVercelProject(ctx, { ...r, productId });
  return null;
}

/**
 * After a Vercel project is mapped: pull its deployments now, and fill the product's Domain and Repository links
 * when the product has none (so uptime checks, the site audit and the blog's canonical URLs work without retyping).
 * Existing links are never changed.
 */
async function linkVercelProject(ctx: Ctx, r: Resource & { productId: string }) {
  const ok = await syncVercelProject(ctx.workspaceId, r.connectionId, r, "connect");
  if (ok) {
    await db.update(integrationConnection).set({ lastSyncAt: new Date(), lastSuccessAt: new Date(), lastError: null, status: "active", updatedAt: new Date() })
      .where(and(eq(integrationConnection.id, r.connectionId), inArray(integrationConnection.status, ["active", "error"])));
    await afterVercelSync(ctx.workspaceId);
  }
  const [fresh] = await db.select({ metadata: integrationResource.metadata }).from(integrationResource).where(eq(integrationResource.id, r.id));
  const meta = (fresh?.metadata ?? {}) as { productionDomain?: string | null; repoUrl?: string | null };
  const links = await db.select({ kind: productLink.kind }).from(productLink).where(and(eq(productLink.workspaceId, ctx.workspaceId), eq(productLink.productId, r.productId)));
  const toAdd: { kind: "domain" | "repository"; url: string; label: string }[] = [];
  if (meta.productionDomain && !links.some((l) => l.kind === "domain" || l.kind === "app")) toAdd.push({ kind: "domain", url: `https://${meta.productionDomain}`, label: "" });
  if (meta.repoUrl && !links.some((l) => l.kind === "repository")) toAdd.push({ kind: "repository", url: meta.repoUrl, label: "" });
  if (toAdd.length) {
    await db.transaction(async (tx) => {
      for (const l of toAdd) {
        await tx.insert(productLink).values({ ...l, workspaceId: ctx.workspaceId, productId: r.productId });
        await recordAudit(tx, ctx, { action: "product.link_added", targetType: "product", targetId: r.productId, targetLabel: `${l.url} (from Vercel)`, productId: r.productId });
      }
    });
  }
  return { synced: ok, linksAdded: toAdd.map((l) => l.kind) };
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
    lastSyncAt: new Date(),
    // A fully successful sync clears an earlier transient failure, so the connection shows as fresh again.
    ...(failed === 0 && mapped.length ? { lastSuccessAt: new Date(), lastError: null, ...(after?.status === "error" ? { status: "active" as const } : {}) } : {}),
    updatedAt: new Date(),
  }).where(eq(integrationConnection.id, c.id));
  if (c.provider === "vercel" && ok) await afterVercelSync(ctx.workspaceId);
  return { synced: ok, failed, unmapped: resources.length - mapped.length, error: failed ? after?.lastError : null };
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

/* ---------------- Vercel sync ---------------- */

const KEEP_DEPLOYMENTS = 50;

async function syncVercelProject(workspaceId: string, connectionId: string, r: Resource, trigger: Trigger) {
  const [run] = await db.insert(syncRun).values({ workspaceId, connectionId, resourceId: r.id, trigger }).returning();
  try {
    const token = await accessToken(connectionId);
    const meta = (r.metadata ?? {}) as { teamId?: string | null };
    const teamId = meta.teamId ?? null;
    const [deploys, domain] = await Promise.all([
      vercel.recentDeployments(token, teamId, r.externalId),
      vercel.productionDomain(token, teamId, r.externalId).catch(() => undefined), // keep the last known domain on a hiccup
    ]);
    await db.transaction(async (tx) => {
      for (const d of deploys) {
        const v = {
          url: d.url, target: d.target, state: d.state, branch: d.branch, commitSha: d.commitSha, commitMessage: d.commitMessage, author: d.author,
          inspectorUrl: d.inspectorUrl, errorMessage: d.errorMessage, createdAt: d.createdAt, readyAt: d.readyAt, syncedAt: new Date(),
        };
        await tx.insert(deployment).values({ workspaceId, resourceId: r.id, externalId: d.id, ...v })
          .onConflictDoUpdate({ target: [deployment.resourceId, deployment.externalId], set: v });
      }
      // Keep the newest deployments only; Vercel remains the source of truth for older history.
      const keep = await tx.select({ id: deployment.id }).from(deployment).where(eq(deployment.resourceId, r.id)).orderBy(desc(deployment.createdAt)).limit(KEEP_DEPLOYMENTS);
      if (keep.length === KEEP_DEPLOYMENTS) await tx.delete(deployment).where(and(eq(deployment.resourceId, r.id), notInArray(deployment.id, keep.map((k) => k.id))));
    });
    const latest = deploys[0]?.createdAt.toISOString().slice(0, 10) ?? r.dataThrough;
    await db.update(integrationResource).set({
      lastSyncAt: new Date(), dataThrough: latest,
      ...(domain !== undefined ? { metadata: { ...(r.metadata ?? {}), productionDomain: domain } } : {}),
    }).where(eq(integrationResource.id, r.id));
    await db.update(syncRun).set({ status: "succeeded", recordsWritten: deploys.length, finishedAt: new Date() }).where(eq(syncRun.id, run!.id));
    return true;
  } catch (e) {
    const gone = e instanceof ProviderError && e.kind === "not_found";
    const msg = gone ? `Project "${r.name}" wasn't found at Vercel (deleted or moved). Rediscover projects.` : e instanceof Error ? e.message : "Sync failed";
    await db.update(syncRun).set({ status: "failed", error: msg, finishedAt: new Date() }).where(eq(syncRun.id, run!.id));
    const reauth = e instanceof ProviderError && (e.kind === "auth" || e.kind === "forbidden");
    await db.update(integrationConnection).set({
      lastError: msg, ...(reauth ? { status: "needs_reauth" as const } : e instanceof ProviderError ? { status: "error" as const } : {}),
    }).where(eq(integrationConnection.id, connectionId));
    return false;
  }
}

/** Deploy-failure automations react as soon as new deployment data arrives (each failure alerts once). */
async function afterVercelSync(workspaceId: string) {
  // Lazy import: the automation module reads integration tables.
  await (await import("../automation/service")).runTemplateAutomations(workspaceId, "deploy_failed").catch((e) => console.error("[vercel] deploy alerts failed", e));
}

/**
 * Re-syncs a product's Vercel projects when their data is older than `maxAgeMs`. Called when someone opens the
 * product, so deployment status is current without waiting for the scheduler. Only refreshes cached data.
 */
export async function refreshProductDeployments(ctx: Ctx, productId: string, maxAgeMs = 2 * 60 * 1000) {
  assertCan(ctx, "integration.view");
  const rows = await db.select({ r: integrationResource, status: integrationConnection.status })
    .from(integrationResource).innerJoin(integrationConnection, eq(integrationConnection.id, integrationResource.connectionId))
    .where(and(eq(integrationResource.workspaceId, ctx.workspaceId), eq(integrationResource.productId, productId), eq(integrationResource.kind, "vercel_project")));
  let synced = 0;
  for (const { r, status } of rows) {
    if (status !== "active" && status !== "error") continue;
    if (r.lastSyncAt && Date.now() - r.lastSyncAt.getTime() < maxAgeMs) continue;
    if (await syncVercelProject(ctx.workspaceId, r.connectionId, r, "refresh")) {
      synced++;
      await db.update(integrationConnection).set({ lastSyncAt: new Date(), lastSuccessAt: new Date(), lastError: null, status: "active", updatedAt: new Date() })
        .where(and(eq(integrationConnection.id, r.connectionId), inArray(integrationConnection.status, ["active", "error"])));
    }
  }
  if (synced) await afterVercelSync(ctx.workspaceId);
  return synced;
}

/* ---------------- Vercel webhooks ---------------- */

export async function setWebhookSecret(ctx: Ctx, connectionId: string, secret: string | null) {
  assertCan(ctx, "integration.manage");
  const c = await ownedConnection(ctx, connectionId);
  if (c.provider !== "vercel") throw invalid("Webhooks are only used for Vercel.");
  const value = secret?.trim() ?? "";
  if (secret !== null && (value.length < 8 || value.length > 512 || /\s/.test(value))) {
    throw invalid("Paste the webhook secret Vercel showed when you created the webhook.", { secret: "Paste the full secret." });
  }
  await db.transaction(async (tx) => {
    await tx.update(integrationConnection).set({ webhookSecretEnc: secret === null ? null : encrypt(value), webhookLastAt: null, updatedAt: new Date() }).where(eq(integrationConnection.id, c.id));
    await recordAudit(tx, ctx, { action: secret === null ? "integration.webhook_removed" : "integration.webhook_set", targetType: "integration", targetId: c.id, targetLabel: `${providerLabel(c.provider)} (${c.accountLabel})` });
  });
}

/**
 * Handles one Vercel webhook delivery addressed to a connection. The signature is checked against that
 * connection's secret. A deployment event re-syncs the mapped project from the Vercel API: the payload is only
 * used to find the project, so a replayed body can't write anything that Vercel doesn't confirm.
 */
export async function handleVercelWebhook(connectionId: string, rawBody: string, signature: string) {
  const [c] = await db.select().from(integrationConnection).where(and(eq(integrationConnection.id, connectionId), eq(integrationConnection.provider, "vercel")));
  if (!c || !c.webhookSecretEnc || c.status === "revoked") return { status: 404, result: "unknown connection" };
  if (!signature || !vercel.verifyVercelWebhook(decrypt(c.webhookSecretEnc), rawBody, signature)) return { status: 403, result: "bad signature" };
  await db.update(integrationConnection).set({ webhookLastAt: new Date() }).where(eq(integrationConnection.id, c.id));
  let event: { type?: string; payload?: { project?: { id?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, result: "invalid json" };
  }
  if (typeof event.type !== "string" || !event.type.startsWith("deployment.")) return { status: 200, result: "ignored" };
  const projectId = event.payload?.project?.id;
  if (!projectId) return { status: 200, result: "no project" };
  const [r] = await db.select().from(integrationResource).where(and(eq(integrationResource.connectionId, c.id), eq(integrationResource.externalId, projectId)));
  if (!r?.productId) return { status: 200, result: "Vercel project not linked" };
  if (c.status === "needs_reauth") return { status: 200, result: "token needs replacing" };
  const ok = await syncVercelProject(c.workspaceId, c.id, r, "webhook");
  if (ok) {
    await db.update(integrationConnection).set({ lastSyncAt: new Date(), lastSuccessAt: new Date(), lastError: null, status: "active", updatedAt: new Date() })
      .where(and(eq(integrationConnection.id, c.id), inArray(integrationConnection.status, ["active", "error"])));
    await afterVercelSync(c.workspaceId);
  }
  return { status: 200, result: ok ? "synced" : "sync failed" };
}

/* ---------------- Disconnect ---------------- */

export async function disconnect(ctx: Ctx, connectionId: string, deleteData: boolean) {
  assertCan(ctx, "integration.manage");
  const c = await ownedConnection(ctx, connectionId);
  // Revoke at Google first (best effort), then delete local tokens. A pasted Vercel token is deleted here;
  // the person deletes the token itself in Vercel, since it may be used elsewhere.
  if (providerOf(c.provider).auth === "google_oauth") {
    if (c.refreshTokenEnc) await google.revokeToken(decrypt(c.refreshTokenEnc));
    else if (c.accessTokenEnc) await google.revokeToken(decrypt(c.accessTokenEnc));
  }
  await db.transaction(async (tx) => {
    if (deleteData) {
      await tx.delete(integrationConnection).where(eq(integrationConnection.id, c.id)); // cascades to resources, SEO data, runs
    } else {
      await tx.update(integrationConnection).set({ status: "revoked", accessTokenEnc: null, refreshTokenEnc: null, webhookSecretEnc: null, updatedAt: new Date() }).where(eq(integrationConnection.id, c.id));
    }
    await recordAudit(tx, ctx, { action: "integration.disconnected", targetType: "integration", targetId: c.id, targetLabel: `${providerLabel(c.provider)} (${c.accountLabel})`, changes: { dataDeleted: { from: null, to: deleteData } } });
  });
}

/**
 * Connections due for a scheduled sync (used by the cron endpoint). Connections in "error" (a transient provider
 * failure) are retried too; only "needs_reauth" and "revoked" wait for a person. Vercel is synced on every run,
 * since deployments change many times a day; Google data changes daily.
 */
export async function dueConnections() {
  return db.select({ id: integrationConnection.id, workspaceId: integrationConnection.workspaceId, connectedBy: integrationConnection.connectedBy })
    .from(integrationConnection)
    .where(and(
      inArray(integrationConnection.status, ["active", "error"]),
      or(
        isNull(integrationConnection.lastSyncAt),
        eq(integrationConnection.provider, "vercel"),
        lt(integrationConnection.lastSyncAt, new Date(Date.now() - 20 * 3600 * 1000)),
      ),
    ));
}

/** The provider of a connection in this workspace (for wording such as "property" vs "project"). */
export async function connectionProvider(ctx: Pick<Ctx, "workspaceId">, connectionId: string) {
  return (await ownedConnection(ctx, connectionId)).provider;
}
