import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { integrationConnection, integrationResource } from "../integrations/schema";
import { deployment } from "./schema";

/** Matches refreshProductDeployments' default window. */
const REFRESH_AFTER_MS = 2 * 60 * 1000;

type ProjectMeta = {
  projectName?: string; teamSlug?: string; framework?: string | null; repo?: string | null; repoUrl?: string | null;
  productionBranch?: string | null; productionDomain?: string | null;
};

/**
 * The Vercel projects linked to a product, each with its latest production deployment, the deployment that is
 * live (the newest production deployment that succeeded) and the most recent deployments of any kind.
 */
export async function productDeployments(ctx: Ctx, productId: string) {
  assertCan(ctx, "integration.view");
  const projects = await db
    .select({ r: integrationResource, status: integrationConnection.status, lastError: integrationConnection.lastError })
    .from(integrationResource)
    .innerJoin(integrationConnection, eq(integrationConnection.id, integrationResource.connectionId))
    .where(and(
      eq(integrationResource.workspaceId, ctx.workspaceId), eq(integrationResource.productId, productId),
      eq(integrationResource.kind, "vercel_project"), ne(integrationConnection.status, "revoked"),
    ));
  if (!projects.length) return [];
  const rows = await db.select().from(deployment)
    .where(and(eq(deployment.workspaceId, ctx.workspaceId), inArray(deployment.resourceId, projects.map((p) => p.r.id))))
    .orderBy(desc(deployment.createdAt));
  return projects.map(({ r, status, lastError }) => {
    const meta = (r.metadata ?? {}) as ProjectMeta;
    const all = rows.filter((d) => d.resourceId === r.id);
    const production = all.filter((d) => d.target === "production");
    const name = meta.projectName ?? r.name;
    return {
      id: r.id, name, team: meta.teamSlug ?? null, framework: meta.framework ?? null,
      repo: meta.repo ?? null, repoUrl: meta.repoUrl ?? null, productionBranch: meta.productionBranch ?? null, domain: meta.productionDomain ?? null,
      dashboardUrl: meta.teamSlug ? `https://vercel.com/${encodeURIComponent(meta.teamSlug)}/${encodeURIComponent(name)}` : null,
      connectionStatus: status, lastError, lastSyncAt: r.lastSyncAt,
      // Older than the refresh window (or never synced) while the connection works: the page asks for a refresh.
      stale: (status === "active" || status === "error") && (!r.lastSyncAt || Date.now() - r.lastSyncAt.getTime() > REFRESH_AFTER_MS),
      latestProduction: production[0] ?? null,
      live: production.find((d) => d.state === "ready") ?? null,
      recent: all.slice(0, 8),
    };
  });
}
export type ProjectDeployments = Awaited<ReturnType<typeof productDeployments>>[number];

/** Whether this workspace has a Vercel account connected (to offer linking a project on a product page). */
export async function hasVercelConnection(ctx: Ctx) {
  const [c] = await db.select({ id: integrationConnection.id }).from(integrationConnection)
    .where(and(eq(integrationConnection.workspaceId, ctx.workspaceId), eq(integrationConnection.provider, "vercel"), ne(integrationConnection.status, "revoked")))
    .limit(1);
  return Boolean(c);
}
