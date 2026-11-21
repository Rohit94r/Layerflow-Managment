import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderError, providerFetch } from "../core/http";

/**
 * Vercel REST API (https://vercel.com/docs/rest-api), authenticated with an Access Token the user creates at
 * vercel.com/account/settings/tokens. Flotilla only ever sends GET requests with it.
 * Team resources are requested with ?teamId=; personal-account resources without it.
 */
const API = "https://api.vercel.com";

type Query = Record<string, string | number | null | undefined>;

async function get<T>(token: string, path: string, query: Query = {}) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, String(v));
  try {
    return await providerFetch<T>(url.toString(), { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 15000 });
  } catch (e) {
    // Vercel answers 403 both for a bad token and for a team the token can't see; callers decide which it is.
    if (e instanceof ProviderError && (e.kind === "auth" || e.kind === "forbidden")) {
      throw new ProviderError(e.kind, "Vercel rejected the access token (expired, deleted, or no access to this team). Paste a new token.", e.status);
    }
    throw e;
  }
}

type Paged = { pagination?: { next?: number | string | null } };

/** Follows Vercel's pagination (timestamp `until` or continuation-token `from`), deduplicated by id. */
async function list<T extends { id: string }>(token: string, path: string, key: string, query: Query, maxPages = 10) {
  const seen = new Map<string, T>();
  let cursor: number | string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const q: Query = { ...query, ...(cursor === null ? {} : typeof cursor === "number" ? { until: cursor } : { from: cursor }) };
    const r = await get<(Paged & Record<string, unknown>) | T[]>(token, path, q);
    const items = (Array.isArray(r) ? r : ((r[key] as T[] | undefined) ?? [])).filter((x) => x && typeof x.id === "string");
    const before = seen.size;
    for (const x of items) seen.set(x.id, x);
    const next = Array.isArray(r) ? null : (r.pagination?.next ?? null);
    if (next === null || next === cursor || seen.size === before) break;
    cursor = next;
  }
  return [...seen.values()];
}

/* ---------------- Account ---------------- */

export type VercelUser = { id: string; email: string; name: string | null; username: string; defaultTeamId?: string | null };

export async function whoAmI(token: string) {
  const r = await get<{ user: VercelUser }>(token, "/v2/user");
  return r.user;
}

export type VercelScope = { teamId: string | null; slug: string; name: string };

/** The personal account plus every team the token can see. */
export async function listScopes(token: string, user: VercelUser): Promise<VercelScope[]> {
  const teams = await list<{ id: string; slug: string; name: string }>(token, "/v2/teams", "teams", { limit: 100 }).catch((e) => {
    if (e instanceof ProviderError && e.kind === "forbidden") return [];
    throw e;
  });
  return [{ teamId: null, slug: user.username, name: user.name || user.username }, ...teams.map((t) => ({ teamId: t.id, slug: t.slug, name: t.name || t.slug }))];
}

/* ---------------- Projects ---------------- */

type ApiProject = {
  id: string;
  name: string;
  framework?: string | null;
  link?: { type?: string; org?: string; repo?: string; productionBranch?: string; projectNamespace?: string; projectName?: string; owner?: string; slug?: string };
};

export type VercelProject = {
  id: string; name: string; framework: string | null; teamId: string | null; teamSlug: string;
  repo: string | null; repoUrl: string | null; productionBranch: string | null;
};

function repoOf(link: ApiProject["link"]) {
  if (!link?.type) return { repo: null, repoUrl: null };
  if (link.type === "github" && link.org && link.repo) return { repo: `${link.org}/${link.repo}`, repoUrl: `https://github.com/${link.org}/${link.repo}` };
  if (link.type === "gitlab" && link.projectNamespace && link.projectName) return { repo: `${link.projectNamespace}/${link.projectName}`, repoUrl: `https://gitlab.com/${link.projectNamespace}/${link.projectName}` };
  if (link.type === "bitbucket" && link.owner && link.slug) return { repo: `${link.owner}/${link.slug}`, repoUrl: `https://bitbucket.org/${link.owner}/${link.slug}` };
  return { repo: null, repoUrl: null };
}

export async function listProjects(token: string, scope: VercelScope): Promise<VercelProject[]> {
  const rows = await list<ApiProject>(token, "/v10/projects", "projects", { limit: 100, teamId: scope.teamId });
  return rows.map((p) => ({
    id: p.id, name: p.name, framework: p.framework ?? null, teamId: scope.teamId, teamSlug: scope.slug,
    ...repoOf(p.link), productionBranch: p.link?.productionBranch ?? null,
  }));
}

/** Every project the token can see, across the personal account and teams. Scopes the token can't read are skipped. */
export async function discoverProjects(token: string) {
  const user = await whoAmI(token);
  const scopes = await listScopes(token, user);
  const out = new Map<string, VercelProject>();
  let readable = 0;
  for (const s of scopes) {
    try {
      for (const p of await listProjects(token, s)) if (!out.has(p.id)) out.set(p.id, p);
      readable++;
    } catch (e) {
      // A team-scoped token can't list the personal account (and vice versa); that's expected.
      if (!(e instanceof ProviderError && e.kind === "forbidden")) throw e;
    }
  }
  if (!readable) throw new ProviderError("forbidden", "This token can't read any Vercel projects. Create a token scoped to the team that owns them.");
  return [...out.values()];
}

/** The project's production domain: a verified custom domain that isn't a redirect, else its .vercel.app domain. */
export async function productionDomain(token: string, teamId: string | null, projectId: string) {
  const r = await get<{ domains?: { name: string; verified?: boolean; redirect?: string | null; gitBranch?: string | null }[] }>(
    token, `/v9/projects/${encodeURIComponent(projectId)}/domains`, { teamId, limit: 100 },
  );
  const live = (r.domains ?? []).filter((d) => d.verified !== false && !d.redirect && !d.gitBranch);
  return (live.find((d) => !d.name.endsWith(".vercel.app")) ?? live[0])?.name ?? null;
}

/* ---------------- Deployments ---------------- */

export type DeployState = "ready" | "error" | "building" | "queued" | "canceled" | "blocked";

type ApiDeployment = {
  uid: string; url?: string | null; created?: number; createdAt?: number; state?: string; readyState?: string;
  target?: string | null; meta?: Record<string, string | undefined>; inspectorUrl?: string | null; ready?: number;
  errorMessage?: string | null; creator?: { username?: string; githubLogin?: string };
};

export type VercelDeployment = {
  id: string; url: string | null; target: "production" | "preview"; state: DeployState; branch: string | null; commitSha: string | null;
  commitMessage: string | null; author: string | null; inspectorUrl: string | null; errorMessage: string | null; createdAt: Date; readyAt: Date | null;
};

export function normalizeState(s: string | undefined): DeployState {
  switch ((s ?? "").toUpperCase()) {
    case "READY": return "ready";
    case "ERROR": return "error";
    case "BUILDING": return "building";
    case "CANCELED":
    case "DELETED": return "canceled";
    case "BLOCKED": return "blocked";
    default: return "queued"; // QUEUED, INITIALIZING
  }
}

/** Git details are stored in `meta` with a provider prefix (githubCommitRef, gitlabCommitRef, bitbucketCommitRef, …). */
function gitMeta(meta: ApiDeployment["meta"] = {}) {
  const pick = (suffix: string) => {
    for (const p of ["github", "gitlab", "bitbucket"]) {
      const v = meta[`${p}${suffix}`];
      if (v) return v;
    }
    return null;
  };
  return { branch: pick("CommitRef"), commitSha: pick("CommitSha"), commitMessage: pick("CommitMessage"), author: pick("CommitAuthorLogin") ?? pick("CommitAuthorName") };
}

export function toDeployment(d: ApiDeployment): VercelDeployment {
  const created = d.createdAt ?? d.created ?? Date.now();
  const git = gitMeta(d.meta);
  return {
    id: d.uid,
    url: d.url ? `https://${d.url}` : null,
    target: d.target === "production" ? "production" : "preview",
    state: normalizeState(d.readyState ?? d.state),
    ...git,
    commitMessage: git.commitMessage ? git.commitMessage.split("\n")[0]!.slice(0, 300) : null,
    author: git.author ?? d.creator?.githubLogin ?? d.creator?.username ?? null,
    inspectorUrl: d.inspectorUrl ?? null,
    errorMessage: d.errorMessage ? d.errorMessage.slice(0, 500) : null,
    createdAt: new Date(created),
    readyAt: d.ready ? new Date(d.ready) : null,
  };
}

/** The most recent deployments of a project, plus the most recent production ones (so production is never crowded out by previews). */
export async function recentDeployments(token: string, teamId: string | null, projectId: string) {
  const [any, prod] = await Promise.all([
    get<{ deployments?: ApiDeployment[] }>(token, "/v7/deployments", { projectId, teamId, limit: 20 }),
    get<{ deployments?: ApiDeployment[] }>(token, "/v7/deployments", { projectId, teamId, limit: 5, target: "production" }),
  ]);
  const byId = new Map<string, VercelDeployment>();
  for (const d of [...(any.deployments ?? []), ...(prod.deployments ?? [])]) if (d?.uid) byId.set(d.uid, toDeployment(d));
  return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/* ---------------- Webhooks ---------------- */

/**
 * Vercel signs webhook deliveries with `x-vercel-signature`: hex HMAC-SHA1 of the raw body, keyed with the webhook's secret
 * (https://vercel.com/docs/webhooks/webhooks-api).
 */
export function signVercelWebhook(secret: string, rawBody: string) {
  return createHmac("sha1", secret).update(rawBody).digest("hex");
}

export function verifyVercelWebhook(secret: string, rawBody: string, signature: string) {
  const expected = Buffer.from(signVercelWebhook(secret, rawBody));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
