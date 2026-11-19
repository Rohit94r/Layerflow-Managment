import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, makeOwner, makeUser } from "./setup-db";
import { db, schema } from "../server/db";
import * as identity from "../modules/identity/service";
import * as portfolio from "../modules/portfolio/service";
import * as content from "../modules/content/service";
import { analyzeContent } from "../modules/content/seo-score";
import { decideApproval, listApprovals } from "../modules/automation/inbox";
import * as auto from "../modules/automation/service";
import { analyticsOverview, listAnalyticsProperties, sumDaily } from "../modules/analytics/service";
import { nextActions, portfolioPulse } from "../modules/growth/service";
import { parseReport, ga4Date } from "../integrations/providers/google-analytics";
import { signWebhook, verifyWebhook, isValidIndexNowKey } from "../integrations/providers/publishing";
import { authorizeTool, toolByName } from "../ai/tools";
import { AGENT_CATALOG } from "../ai/catalog";
import { addDays, today } from "../lib/format";
import type { Role } from "../modules/identity/constants";

type Owner = Awaited<ReturnType<typeof makeOwner>>;

async function join(owner: Owner, name: string, role: Role) {
  const u = await makeUser(name);
  const token = await identity.createInvitation(owner.ctx, { email: u.email, role });
  await identity.acceptInvitation(u.id, u.email, token);
  return { user: u, ctx: (await identity.loadContext(u.id, owner.ws.slug))! };
}

const GOOD_BODY = [
  "Choosing a hackathon planner is easier than it looks. A good hackathon planner keeps deadlines, teams and submissions in one place, so you spend your weekend building.",
  "## Why a hackathon planner matters",
  "Most teams lose hours to scattered chats. Short sessions and clear owners help. Teams that plan ship more. It is that simple.",
  "## How to pick one",
  "Look for calendar sync, team invites and a submission checklist. Try it on a small event first. Read the [docs](https://example.com/docs) and the [pricing](https://example.com/pricing).",
  "## A simple checklist",
  ...Array.from({ length: 40 }, (_, i) => `Step ${i + 1} keeps the team moving with a clear goal and a short review at the end of the day.`),
].join("\n\n");

describe("content SEO score (pure)", () => {
  it("rewards a well-structured post and explains failures", () => {
    const good = analyzeContent({
      title: "Hackathon planner: how to pick one in 2026", slug: "hackathon-planner", body: GOOD_BODY, targetKeyword: "hackathon planner",
      metaDescription: "A practical guide to choosing a hackathon planner: the features that matter, a simple checklist, and how to try one on your next event.",
      excerpt: "What to look for in a hackathon planner, with a checklist.",
    });
    expect(good.score).toBeGreaterThanOrEqual(75);
    expect(good.checks.find((c) => c.id === "kw_title")!.status).toBe("pass");
    expect(good.checks.find((c) => c.id === "kw_intro")!.status).toBe("pass");

    const thin = analyzeContent({ title: "Hi", slug: "Hi There!", body: "Short.", targetKeyword: "" });
    expect(thin.score).toBeLessThan(30);
    expect(thin.checks.find((c) => c.id === "keyword")!.status).toBe("fail");
    expect(thin.checks.find((c) => c.id === "meta_desc")!.status).toBe("fail");
  });

  it("flags keyword stuffing", () => {
    const stuffed = analyzeContent({ title: "seo tool", slug: "seo-tool", targetKeyword: "seo tool", body: Array.from({ length: 200 }, () => "seo tool is great").join(". ") });
    expect(stuffed.checks.find((c) => c.id === "kw_density")!.status).toBe("fail");
  });
});

describe("providers (pure)", () => {
  it("parses GA4 runReport rows", () => {
    const rows = parseReport({
      metricHeaders: [{ name: "sessions", type: "TYPE_INTEGER" }, { name: "keyEvents", type: "TYPE_FLOAT" }],
      rows: [{ dimensionValues: [{ value: "20261101" }], metricValues: [{ value: "120" }, { value: "3.0" }] }],
    });
    expect(rows).toEqual([{ keys: ["20261101"], values: { sessions: 120, keyEvents: 3 } }]);
    expect(ga4Date("20261101")).toBe("2026-11-01");
    expect(parseReport({})).toEqual([]);
  });

  it("signs and verifies webhooks, rejecting tampering and replays", () => {
    const now = 1_800_000_000;
    const sig = signWebhook("whsec_test", now, '{"a":1}');
    expect(verifyWebhook("whsec_test", String(now), '{"a":1}', sig, now)).toBe(true);
    expect(verifyWebhook("whsec_test", String(now), '{"a":2}', sig, now)).toBe(false);
    expect(verifyWebhook("whsec_other", String(now), '{"a":1}', sig, now)).toBe(false);
    expect(verifyWebhook("whsec_test", String(now), '{"a":1}', sig, now + 600)).toBe(false);
  });

  it("validates IndexNow keys", () => {
    expect(isValidIndexNowKey("abcd1234")).toBe(true);
    expect(isValidIndexNowKey("short")).toBe(false);
    expect(isValidIndexNowKey("has spaces in it")).toBe(false);
  });
});

describe("content workflow", () => {
  let a: Owner;
  let b: Owner;
  let productId: string;
  let productSlug: string;

  beforeAll(async () => {
    await freshDb();
    a = await makeOwner("Ada");
    b = await makeOwner("Ben");
    const p = await portfolio.createProduct(a.ctx, { name: "Hackathon Finder" });
    productId = p.id;
    productSlug = p.slug;
  });

  it("creates drafts with unique slugs and a cached SEO score", async () => {
    const one = await content.createPost(a.ctx, { productId, title: "Hackathon planner guide", body: GOOD_BODY, targetKeyword: "hackathon planner" });
    const two = await content.createPost(a.ctx, { productId, title: "Hackathon planner guide" });
    expect(one.slug).toBe("hackathon-planner-guide");
    expect(two.slug).toBe("hackathon-planner-guide-2");
    expect(one.seoScore).toBeGreaterThan(two.seoScore);
    expect(one.status).toBe("draft");
  });

  it("refuses to publish to a hosted blog that is switched off, and records why", async () => {
    const post = await content.createPost(a.ctx, { productId, title: "Off blog", body: GOOD_BODY });
    await expect(content.publishPost(a.ctx, post.id)).rejects.toMatchObject({ code: "invalid" });
    const detail = await content.getPost(a.ctx, post.id);
    expect(detail!.status).toBe("draft");
    expect(detail!.publications[0]).toMatchObject({ target: "hosted", status: "failed" });
  });

  it("publishes to the hosted blog; the public blog shows only published posts of enabled products", async () => {
    await content.updateChannel(a.ctx, productId, { hostedEnabled: true, destination: "hosted", publishPolicy: "approval" });
    const live = await content.createPost(a.ctx, { productId, title: "Live post", body: GOOD_BODY });
    await content.createPost(a.ctx, { productId, title: "Still a draft", body: GOOD_BODY });
    const r = await content.publishPost(a.ctx, live.id);
    expect(r.liveUrl).toContain(`/blog/${a.ws.slug}/${productSlug}/live-post`);

    const blog = await content.publicBlog(a.ws.slug, productSlug);
    expect(blog!.posts.map((p) => p.slug)).toEqual(["live-post"]);
    expect(await content.publicPost(a.ws.slug, productSlug, "still-a-draft")).toBeNull();
    expect((await content.publicPost(a.ws.slug, productSlug, "live-post"))!.post.title).toBe("Live post");

    // Switching the blog off hides it immediately.
    await content.updateChannel(a.ctx, productId, { hostedEnabled: false, destination: "hosted", publishPolicy: "approval" });
    expect(await content.publicBlog(a.ws.slug, productSlug)).toBeNull();
    await content.updateChannel(a.ctx, productId, { hostedEnabled: true, destination: "hosted", publishPolicy: "approval" });
  });

  it("schedules, then the scheduler publishes due posts", async () => {
    const post = await content.createPost(a.ctx, { productId, title: "Scheduled post", body: GOOD_BODY });
    await expect(content.schedulePost(a.ctx, post.id, new Date(Date.now() - 3600_000))).rejects.toMatchObject({ code: "invalid" });
    await content.schedulePost(a.ctx, post.id, new Date(Date.now() + 3600_000));
    expect((await content.getPost(a.ctx, post.id))!.status).toBe("scheduled");
    // Pretend the time has come.
    await db.update(schema.contentPost).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(schema.contentPost.id, post.id));
    const res = await content.publishDuePosts();
    expect(res.published).toBeGreaterThanOrEqual(1);
    expect((await content.getPost(a.ctx, post.id))!.status).toBe("published");
  });

  it("members can write and request review but cannot approve or publish", async () => {
    const m = await join(a, "Mia", "member");
    const post = await content.createPost(m.ctx, { productId, title: "Member post", body: GOOD_BODY });
    await content.setPostStatus(m.ctx, post.id, "in_review");
    await expect(content.setPostStatus(m.ctx, post.id, "approved")).rejects.toMatchObject({ code: "invalid" });
    await expect(content.publishPost(m.ctx, post.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(content.updateChannel(m.ctx, productId, { publishPolicy: "auto" })).rejects.toMatchObject({ code: "forbidden" });
    const v = await join(a, "Vic", "viewer");
    await expect(content.createPost(v.ctx, { productId, title: "Nope" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(content.listPosts(v.ctx)).resolves.toBeDefined();
  });

  it("never leaks posts or channels across workspaces", async () => {
    const [post] = await content.listPosts(a.ctx);
    expect(await content.getPost(b.ctx, post!.id)).toBeNull();
    await expect(content.updatePost(b.ctx, post!.id, { title: "pwned" })).rejects.toMatchObject({ code: "not_found" });
    await expect(content.publishPost(b.ctx, post!.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(content.deletePost(b.ctx, post!.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(content.getChannel(b.ctx, productId)).rejects.toMatchObject({ code: "invalid" });
    await expect(content.createPost(b.ctx, { productId, title: "Into A" })).rejects.toMatchObject({ code: "invalid" });
    expect(await content.listPosts(b.ctx)).toHaveLength(0);
    // Public blog lookups are bound to the workspace slug.
    expect(await content.publicBlog(b.ws.slug, productSlug)).toBeNull();
  });

  it("will not change the URL of a live post or delete it without unpublishing", async () => {
    const [live] = await content.listPosts(a.ctx, { status: "published" });
    await expect(content.updatePost(a.ctx, live!.id, { slug: "new-url" })).rejects.toMatchObject({ code: "conflict" });
    await expect(content.deletePost(a.ctx, live!.id)).rejects.toMatchObject({ code: "conflict" });
    await content.unpublishPost(a.ctx, live!.id);
    expect((await content.getPost(a.ctx, live!.id))!.status).toBe("draft");
    expect((await content.publicPost(a.ws.slug, productSlug, live!.slug))).toBeNull();
  });
});

describe("agent publishing policies", () => {
  let a: Owner;
  let productId: string;
  let productSlug: string;
  const env = (ctx: Owner["ctx"], pid: string | null) => ({ ctx: { ...ctx, actor: "agent" as const }, agent: { instanceId: "agent-1", name: "Content Writer", productId: pid }, runId: "run-1" });

  beforeAll(async () => {
    await freshDb();
    a = await makeOwner("Cara");
    const p = await portfolio.createProduct(a.ctx, { name: "LayerFlow" });
    productId = p.id;
    productSlug = p.slug;
    await content.updateChannel(a.ctx, productId, { hostedEnabled: true, destination: "hosted", publishPolicy: "approval", weeklyAgentLimit: 1 });
  });

  async function agentDraft(title: string) {
    const out = (await toolByName("draft_blog_post")!.run(env(a.ctx, productId) as never, {
      title, target_keyword: "portfolio dashboard", body: GOOD_BODY.replaceAll("hackathon planner", "portfolio dashboard"),
      excerpt: "How to run many products from one dashboard.", meta_title: "Portfolio dashboard for founders",
      meta_description: "A practical guide to running a portfolio dashboard for founders with many products: what to track, how to review it weekly and what to skip.",
    } as never)) as { postId: string; seoScore: number; toImprove: string[] };
    return out;
  }

  it("agent drafts carry their source and score; nothing is published", async () => {
    const d = await agentDraft("Portfolio dashboard for founders");
    const post = await content.getPost(a.ctx, d.postId);
    expect(post!.source).toBe("agent");
    expect(post!.status).toBe("draft");
    expect(d.seoScore).toBeGreaterThan(50);
    expect(Array.isArray(d.toImprove)).toBe(true);
  });

  it("approval policy: request → approvals queue → publish only on approve", async () => {
    const d = await agentDraft("Approval flow post");
    const out = (await toolByName("request_publish")!.run(env(a.ctx, productId) as never, { post_id: d.postId } as never)) as { status: string; approvalId: string };
    expect(out.status).toBe("pending_approval");
    expect((await content.getPost(a.ctx, d.postId))!.status).toBe("in_review");
    const [ap] = (await listApprovals(a.ctx)).filter((x) => x.id === out.approvalId);
    expect(ap!.action).toBe("content.publish");
    const r = await decideApproval(a.ctx, out.approvalId, true);
    expect(r.status).toBe("approved");
    expect((await content.getPost(a.ctx, d.postId))!.status).toBe("published");
  });

  it("manual policy: the agent can only leave the draft for a person", async () => {
    await content.updateChannel(a.ctx, productId, { hostedEnabled: true, destination: "hosted", publishPolicy: "manual" });
    const d = await agentDraft("Manual flow post");
    const out = (await toolByName("request_publish")!.run(env(a.ctx, productId) as never, { post_id: d.postId } as never)) as { status: string };
    expect(out.status).toBe("awaiting_human");
    expect((await content.getPost(a.ctx, d.postId))!.status).toBe("in_review");
  });

  it("auto policy: owner opt-in publishes directly, within the weekly limit", async () => {
    await content.updateChannel(a.ctx, productId, { hostedEnabled: true, destination: "hosted", publishPolicy: "auto", weeklyAgentLimit: 2 });
    const first = await agentDraft("Auto post one");
    const r1 = (await toolByName("request_publish")!.run(env(a.ctx, productId) as never, { post_id: first.postId } as never)) as { status: string };
    // One agent post was already published this week via approval, so this is #2 of 2.
    expect(r1.status).toBe("published");
    const second = await agentDraft("Auto post two");
    const r2 = (await toolByName("request_publish")!.run(env(a.ctx, productId) as never, { post_id: second.postId } as never)) as { status: string };
    expect(r2.status).toBe("limit_reached");
    expect((await content.getPost(a.ctx, second.postId))!.status).toBe("in_review");
  });

  it("only owners/admins can switch on automatic publishing", async () => {
    const m = await join(a, "Max", "manager");
    await content.updateChannel(a.ctx, productId, { hostedEnabled: true, destination: "hosted", publishPolicy: "approval" });
    await expect(content.updateChannel(m.ctx, productId, { hostedEnabled: true, publishPolicy: "auto" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("agents cannot touch other agents' posts or other products", async () => {
    const human = await content.createPost(a.ctx, { productId, title: "Human post", body: GOOD_BODY });
    await expect(toolByName("request_publish")!.run(env(a.ctx, productId) as never, { post_id: human.id } as never)).rejects.toThrow(/own drafts/);
    await expect(toolByName("update_blog_post")!.run(env(a.ctx, productId) as never, { post_id: human.id, title: "Hijacked title" } as never)).rejects.toThrow(/own drafts/);
    const other = await portfolio.createProduct(a.ctx, { name: "Other product" });
    await expect(toolByName("draft_blog_post")!.run(env(a.ctx, productId) as never, {
      product_slug: other.slug, title: "Wrong product", target_keyword: "x y", body: GOOD_BODY, excerpt: "", meta_title: "", meta_description: "",
    } as never)).rejects.toThrow(/different product/);
    expect(productSlug).toBeTruthy();
  });

  it("content tools respect role capabilities", () => {
    expect(authorizeTool({ ...a.ctx, role: "viewer" }, ["draft_blog_post"], "draft_blog_post").ok).toBe(false);
    expect(authorizeTool({ ...a.ctx, role: "member" }, ["draft_blog_post"], "draft_blog_post").ok).toBe(true);
    expect(authorizeTool({ ...a.ctx, role: "billing" }, ["get_analytics"], "get_analytics").ok).toBe(false);
  });

  it("every catalog agent only references tools that exist", () => {
    for (const d of AGENT_CATALOG) for (const t of [...d.defaultTools, ...d.optionalTools]) expect(toolByName(t), `${d.key}:${t}`).toBeDefined();
  });
});

describe("analytics and growth read models", () => {
  let a: Owner;
  let b: Owner;
  let productId: string;
  let resourceId: string;

  beforeAll(async () => {
    await freshDb();
    a = await makeOwner("Dee");
    b = await makeOwner("Eli");
    const p = await portfolio.createProduct(a.ctx, { name: "Plot", lifecycle: "live" });
    productId = p.id;
    const [conn] = await db.insert(schema.integrationConnection).values({ workspaceId: a.ctx.workspaceId, provider: "google_analytics", accountLabel: "a@example.com" }).returning();
    const [res] = await db.insert(schema.integrationResource).values({ workspaceId: a.ctx.workspaceId, connectionId: conn!.id, kind: "ga4_property", externalId: "properties/1", name: "Plot (Acct)", productId, dataThrough: addDays(today(), -1) }).returning();
    resourceId = res!.id;
    // 56 days: the earlier 28 at 100 sessions/day, the last 28 at 40/day → a 60% drop.
    const rows = Array.from({ length: 56 }, (_, i) => ({
      workspaceId: a.ctx.workspaceId, resourceId, day: addDays(today(), -56 + i), sessions: i < 28 ? 100 : 40, users: 80, newUsers: 20, pageViews: 200, engagedSessions: i < 28 ? 60 : 20, keyEvents: 2,
    }));
    await db.insert(schema.analyticsDaily).values(rows);
  });

  it("aggregates engagement from engaged sessions, not averaged rates", () => {
    const t = sumDaily([{ sessions: 100, users: 1, newUsers: 1, pageViews: 1, engagedSessions: 50, keyEvents: 0 }, { sessions: 300, users: 1, newUsers: 1, pageViews: 1, engagedSessions: 60, keyEvents: 0 }]);
    expect(t.engagementRate).toBeCloseTo(110 / 400);
  });

  it("computes 28-day windows and flags the traffic drop as a next action", async () => {
    const o = await analyticsOverview(a.ctx, resourceId);
    expect(o.current!.sessions).toBe(28 * 40);
    expect(o.previous!.sessions).toBe(28 * 100);
    const pulse = await portfolioPulse(a.ctx);
    const row = pulse.find((r) => r.product.id === productId)!;
    expect(row.traffic).toMatchObject({ current: 1120, previous: 2800 });
    expect(row.search).toBeNull(); // not connected ≠ zero
    const actions = await nextActions(a.ctx, pulse);
    expect(actions.find((x) => x.id === `traffic:${productId}`)).toMatchObject({ severity: "critical", category: "growth" });
  });

  it("keeps analytics tenant-scoped", async () => {
    await expect(analyticsOverview(b.ctx, resourceId)).rejects.toMatchObject({ code: "not_found" });
    expect(await listAnalyticsProperties(b.ctx)).toHaveLength(0);
    expect((await portfolioPulse(b.ctx)).length).toBe(0);
  });

  it("traffic-drop automation notifies once per week of data", async () => {
    // Make the most recent 7 days drop to 10/day vs 40/day the week before (−75%).
    const { gte } = await import("drizzle-orm");
    await db.update(schema.analyticsDaily).set({ sessions: 10 }).where(gte(schema.analyticsDaily.day, addDays(today(), -7)));
    const rule = await auto.createAutomation(a.ctx, { template: "traffic_drop", params: { percent: 30, minSessions: 100 } });
    const r1 = await auto.runAutomationNow(a.ctx, rule.id, false);
    expect(r1.status).toBe("succeeded");
    expect(r1.taken?.length).toBe(1);
    const r2 = await auto.runAutomationNow(a.ctx, rule.id, false);
    expect(r2.taken?.length).toBe(0);
  });
});
