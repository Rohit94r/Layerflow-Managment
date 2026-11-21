import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { freshDb, makeOwner, makeUser } from "./setup-db";
import { db, schema } from "../server/db";
import * as identity from "../modules/identity/service";
import * as portfolio from "../modules/portfolio/service";
import * as integrations from "../modules/integrations/service";
import * as auto from "../modules/automation/service";
import { listInbox } from "../modules/automation/inbox";
import { productDeployments } from "../modules/deploys/service";
import { normalizeState, signVercelWebhook, toDeployment, verifyVercelWebhook } from "../integrations/providers/vercel";
import type { Role } from "../modules/identity/constants";

/* ---------------- A fake Vercel REST API ---------------- */

const TOKEN = "vercel_test_token_0123456789";
const NOW = Date.now();
type FakeDeployment = { uid: string; createdAt: number; state: string; target: string | null; meta: Record<string, string>; projectId: string };

const api = {
  revoked: false,
  calls: 0,
  deployments: [] as FakeDeployment[],
};

function deploy(projectId: string, uid: string, minutesAgo: number, state: string, target: string | null, message: string, branch = "main"): FakeDeployment {
  return {
    uid, projectId, createdAt: NOW - minutesAgo * 60000, state, target,
    meta: { githubCommitMessage: `${message}\n\nLonger body`, githubCommitRef: branch, githubCommitSha: `sha-${uid}`, githubCommitAuthorLogin: "founder" },
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fakeVercel(url: string, init?: RequestInit) {
  api.calls++;
  const u = new URL(url);
  if (u.hostname !== "api.vercel.com") return json(404, { error: { code: "not_found", message: "unexpected host" } });
  const auth = new Headers(init?.headers).get("authorization");
  if (auth !== `Bearer ${TOKEN}` || api.revoked) return json(403, { error: { code: "forbidden", message: "Not authorized", invalidToken: true } });
  const team = u.searchParams.get("teamId");
  if (u.pathname === "/v2/user") return json(200, { user: { id: "u_1", email: "founder@example.com", name: "Founder", username: "founder" } });
  if (u.pathname === "/v2/teams") return json(200, { teams: [{ id: "team_1", slug: "acme", name: "Acme" }], pagination: { count: 1, next: null } });
  if (u.pathname === "/v10/projects") {
    if (!team) return json(200, [{ id: "prj_side", name: "side-project", framework: "nextjs", link: { type: "github", org: "founder", repo: "side-project", productionBranch: "main" } }]);
    if (team === "team_1") {
      return json(200, { projects: [{ id: "prj_app", name: "layerflow", framework: "nextjs", link: { type: "github", org: "acme", repo: "layerflow", productionBranch: "main" } }], pagination: { count: 1, next: null } });
    }
    return json(403, { error: { code: "forbidden", message: "Not authorized" } });
  }
  if (u.pathname === "/v9/projects/prj_app/domains") {
    return json(200, { domains: [
      { name: "layerflow.vercel.app", verified: true },
      { name: "www.layerflow.app", verified: true, redirect: "layerflow.app" },
      { name: "staging.layerflow.app", verified: true, gitBranch: "staging" },
      { name: "layerflow.app", verified: true },
    ] });
  }
  if (u.pathname === "/v9/projects/prj_side/domains") return json(200, { domains: [{ name: "side-project.vercel.app", verified: true }] });
  if (u.pathname === "/v7/deployments") {
    const projectId = u.searchParams.get("projectId");
    const target = u.searchParams.get("target");
    const limit = Number(u.searchParams.get("limit") ?? 20);
    const rows = api.deployments
      .filter((d) => d.projectId === projectId && (!target || d.target === target))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
      .map((d) => ({ uid: d.uid, url: `${d.uid}.vercel.app`, createdAt: d.createdAt, state: d.state, readyState: d.state, target: d.target, meta: d.meta, inspectorUrl: `https://vercel.com/acme/layerflow/${d.uid}` }));
    return json(200, { deployments: rows, pagination: { count: rows.length, next: null } });
  }
  return json(404, { error: { code: "not_found", message: `No route ${u.pathname}` } });
}

/* ---------------- Pure helpers ---------------- */

describe("Vercel API mapping (pure)", () => {
  it("normalises deployment states", () => {
    expect(normalizeState("READY")).toBe("ready");
    expect(normalizeState("ERROR")).toBe("error");
    expect(normalizeState("BUILDING")).toBe("building");
    expect(normalizeState("INITIALIZING")).toBe("queued");
    expect(normalizeState("QUEUED")).toBe("queued");
    expect(normalizeState("CANCELED")).toBe("canceled");
    expect(normalizeState("BLOCKED")).toBe("blocked");
  });

  it("reads git details from any provider and keeps the first commit line", () => {
    const d = toDeployment({ uid: "dpl_x", url: "x.vercel.app", createdAt: 1_700_000_000_000, readyState: "READY", target: null, meta: { gitlabCommitRef: "feat", gitlabCommitMessage: "Fix nav\n\ndetails", gitlabCommitAuthorName: "Sam" } });
    expect(d).toMatchObject({ id: "dpl_x", url: "https://x.vercel.app", target: "preview", state: "ready", branch: "feat", commitMessage: "Fix nav", author: "Sam" });
  });

  it("verifies webhook signatures (HMAC-SHA1 of the raw body)", () => {
    const body = JSON.stringify({ type: "deployment.created" });
    const sig = signVercelWebhook("secret-123", body);
    expect(verifyVercelWebhook("secret-123", body, sig)).toBe(true);
    expect(verifyVercelWebhook("secret-123", `${body} `, sig)).toBe(false);
    expect(verifyVercelWebhook("other-secret", body, sig)).toBe(false);
    expect(verifyVercelWebhook("secret-123", body, "short")).toBe(false);
  });
});

/* ---------------- End to end through the services ---------------- */

type Owner = Awaited<ReturnType<typeof makeOwner>>;

async function join(owner: Owner, name: string, role: Role) {
  const u = await makeUser(name);
  const token = await identity.createInvitation(owner.ctx, { email: u.email, role });
  await identity.acceptInvitation(u.id, u.email, token);
  return (await identity.loadContext(u.id, owner.ws.slug))!;
}

describe("Vercel integration", () => {
  let owner: Owner;
  let productId: string;
  let connectionId: string;
  let appResourceId: string;

  beforeAll(async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => fakeVercel(String(url), init)));
    await freshDb();
    owner = await makeOwner("Vee");
    productId = (await portfolio.createProduct(owner.ctx, { name: "LayerFlow" })).id;
    api.deployments = [
      deploy("prj_app", "dpl_3", 5, "ERROR", "production", "Break the build"),
      deploy("prj_app", "dpl_2", 30, "READY", null, "Preview tweak", "feature"),
      deploy("prj_app", "dpl_1", 60, "READY", "production", "Ship pricing page"),
    ];
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a token Vercel doesn't accept, and viewers can't connect", async () => {
    await expect(integrations.connectWithToken(owner.ctx, "vercel", "wrong_token_0123456789")).rejects.toThrow(/didn't accept/);
    await expect(integrations.connectWithToken(owner.ctx, "vercel", "short")).rejects.toThrow(/whole access token/);
    const viewer = await join(owner, "Viewer", "viewer");
    await expect(integrations.connectWithToken(viewer, "vercel", TOKEN)).rejects.toMatchObject({ code: "forbidden" });
    expect(await integrations.listConnections(owner.ctx)).toHaveLength(0);
  });

  it("connects, discovers personal and team projects, and stores the token encrypted", async () => {
    const r = await integrations.connectWithToken(owner.ctx, "vercel", TOKEN);
    expect(r.found).toBe(2);
    connectionId = r.connectionId;
    const [c] = await integrations.listConnections(owner.ctx);
    expect(c).toMatchObject({ provider: "vercel", accountLabel: "founder@example.com", status: "active" });
    expect(c!.resources.map((x) => x.name).sort()).toEqual(["layerflow (acme)", "side-project"]);
    appResourceId = c!.resources.find((x) => x.externalId === "prj_app")!.id;
    const [raw] = await db.select().from(schema.integrationConnection).where(eq(schema.integrationConnection.id, connectionId));
    expect(raw!.accessTokenEnc).toBeTruthy();
    expect(raw!.accessTokenEnc).not.toContain(TOKEN);

    // Connecting the same account again replaces its token instead of adding a second connection.
    await integrations.connectWithToken(owner.ctx, "vercel", TOKEN);
    expect(await integrations.listConnections(owner.ctx)).toHaveLength(1);
  });

  it("refuses the Google sign-in flow for Vercel", async () => {
    await expect(integrations.startOAuth(owner.ctx, "vercel")).rejects.toThrow(/access token/);
  });

  it("linking a project syncs deployments, fills missing links, flags the failed deploy and alerts once", async () => {
    await auto.createAutomation(owner.ctx, { template: "deploy_failed" });
    const r = await integrations.mapResource(owner.ctx, appResourceId, productId);
    expect(r).toEqual({ synced: true, linksAdded: ["domain", "repository"] });

    const links = await db.select().from(schema.productLink).where(eq(schema.productLink.productId, productId));
    expect(links.map((l) => [l.kind, l.url]).sort()).toEqual([["domain", "https://layerflow.app"], ["repository", "https://github.com/acme/layerflow"]]);

    const [p] = await productDeployments(owner.ctx, productId);
    expect(p).toMatchObject({ name: "layerflow", domain: "layerflow.app", team: "acme", repo: "acme/layerflow" });
    expect(p!.latestProduction).toMatchObject({ externalId: "dpl_3", state: "error", commitMessage: "Break the build", branch: "main", author: "founder" });
    expect(p!.live?.externalId).toBe("dpl_1");
    expect(p!.recent.map((d) => d.externalId)).toEqual(["dpl_3", "dpl_2", "dpl_1"]);

    const signals = (await portfolio.attentionSignals(owner.ctx)).get(productId) ?? [];
    expect(signals.some((s) => s.kind === "deploy" && s.severity === "high")).toBe(true);

    const alerts = (await listInbox(owner.ctx)).filter((i) => i.kind === "deploy_failed");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.title).toBe("LayerFlow: production deploy failed");
    expect(alerts[0]!.body).toContain("Build logs: https://vercel.com/acme/layerflow/dpl_3");

    // Syncing again doesn't alert again for the same failed deployment.
    await integrations.syncConnection(owner.ctx, connectionId, "manual");
    expect((await listInbox(owner.ctx)).filter((i) => i.kind === "deploy_failed")).toHaveLength(1);
  });

  it("never overwrites links the product already has", async () => {
    const p2 = await portfolio.createProduct(owner.ctx, { name: "Side Project" });
    await portfolio.addLink(owner.ctx, p2.id, { kind: "domain", url: "https://mine.example" });
    const side = (await integrations.listConnections(owner.ctx))[0]!.resources.find((x) => x.externalId === "prj_side")!;
    const r = await integrations.mapResource(owner.ctx, side.id, p2.id);
    expect(r?.linksAdded).toEqual(["repository"]);
    const links = await db.select().from(schema.productLink).where(and(eq(schema.productLink.productId, p2.id), eq(schema.productLink.kind, "domain")));
    expect(links.map((l) => l.url)).toEqual(["https://mine.example"]);
  });

  it("a successful production deploy clears the signal", async () => {
    api.deployments.push(deploy("prj_app", "dpl_4", 1, "READY", "production", "Fix the build"));
    const r = await integrations.syncConnection(owner.ctx, connectionId, "manual");
    expect(r).toMatchObject({ synced: 2, failed: 0 });
    const [p] = await productDeployments(owner.ctx, productId);
    expect(p!.latestProduction).toMatchObject({ externalId: "dpl_4", state: "ready" });
    expect(p!.live?.externalId).toBe("dpl_4");
    const signals = (await portfolio.attentionSignals(owner.ctx)).get(productId) ?? [];
    expect(signals.some((s) => s.kind === "deploy")).toBe(false);
  });

  it("webhooks: unknown connection 404, bad signature 403, a signed deployment event re-syncs the project", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "deployment.created", createdAt: NOW, payload: { project: { id: "prj_app" }, deployment: { id: "dpl_5" }, target: "production" } });
    expect((await integrations.handleVercelWebhook(connectionId, body, "x")).status).toBe(404); // no secret yet
    await integrations.setWebhookSecret(owner.ctx, connectionId, "whsec_test_secret_value");
    expect((await integrations.handleVercelWebhook("nope", body, "x")).status).toBe(404);
    expect((await integrations.handleVercelWebhook(connectionId, body, signVercelWebhook("wrong-secret", body))).status).toBe(403);

    api.deployments.push(deploy("prj_app", "dpl_5", 0, "BUILDING", "production", "Add changelog"));
    const ok = await integrations.handleVercelWebhook(connectionId, body, signVercelWebhook("whsec_test_secret_value", body));
    expect(ok).toEqual({ status: 200, result: "synced" });
    const [p] = await productDeployments(owner.ctx, productId);
    expect(p!.latestProduction).toMatchObject({ externalId: "dpl_5", state: "building" });
    expect(p!.live?.externalId).toBe("dpl_4");

    const other = JSON.stringify({ type: "project.created", payload: {} });
    expect(await integrations.handleVercelWebhook(connectionId, other, signVercelWebhook("whsec_test_secret_value", other))).toEqual({ status: 200, result: "ignored" });
  });

  it("opening a product refreshes stale deployments only", async () => {
    const before = api.calls;
    expect(await integrations.refreshProductDeployments(owner.ctx, productId)).toBe(0); // just synced
    expect(api.calls).toBe(before);
    expect(await integrations.refreshProductDeployments(owner.ctx, productId, 0)).toBe(1);
  });

  it("a revoked token asks for a new one; a new token restores it", async () => {
    api.revoked = true;
    const r = await integrations.syncConnection(owner.ctx, connectionId, "manual");
    expect(r.failed).toBeGreaterThan(0);
    let [c] = await integrations.listConnections(owner.ctx);
    expect(c!.status).toBe("needs_reauth");
    expect(c!.lastError).toMatch(/Paste a new token/);
    expect((await integrations.dueConnections()).map((x) => x.id)).not.toContain(connectionId);

    api.revoked = false;
    await integrations.connectWithToken(owner.ctx, "vercel", TOKEN);
    [c] = await integrations.listConnections(owner.ctx);
    expect(c!.status).toBe("active");
  });

  it("the scheduler syncs Vercel on every run and retries transient errors", async () => {
    expect((await integrations.dueConnections()).map((x) => x.id)).toContain(connectionId);
    await db.update(schema.integrationConnection).set({ status: "error", lastError: "Vercel was unavailable" }).where(eq(schema.integrationConnection.id, connectionId));
    expect((await integrations.dueConnections()).map((x) => x.id)).toContain(connectionId);
    await integrations.syncConnection(owner.ctx, connectionId, "schedule");
    const [c] = await integrations.listConnections(owner.ctx);
    expect(c).toMatchObject({ status: "active", lastError: null });
  });

  it("other workspaces can't see or map the project", async () => {
    const other = await makeOwner("Other");
    await expect(integrations.mapResource(other.ctx, appResourceId, null)).rejects.toMatchObject({ code: "not_found" });
    expect(await productDeployments(other.ctx, productId)).toEqual([]);
    expect(await integrations.listConnections(other.ctx)).toEqual([]);
  });

  it("disconnect & delete removes the token and every synced deployment", async () => {
    await integrations.disconnect(owner.ctx, connectionId, true);
    expect(await db.select().from(schema.deployment).where(eq(schema.deployment.workspaceId, owner.ws.id))).toEqual([]);
    expect(await integrations.listConnections(owner.ctx)).toEqual([]);
    expect(await productDeployments(owner.ctx, productId)).toEqual([]);
  });
});
