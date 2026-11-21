import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, can, roleCan, type Ctx } from "../../server/permissions";
import { decrypt, encrypt } from "../../server/crypto";
import { conflict, invalid, notFound } from "../../lib/errors";
import { slugify } from "../../lib/format";
import { publicOrigin } from "../../lib/origin";
import { deliverWebhook, isValidIndexNowKey, pingIndexNow } from "../../integrations/providers/publishing";
import { recordAudit } from "../audit/service";
import { workspace, workspaceMember } from "../identity/schema";
import type { Role } from "../identity/constants";
import { product } from "../portfolio/schema";
import { membersWithCapability, notify, requestApproval } from "../automation/inbox";
import { DESTINATIONS, FUNNEL_STAGES, POST_STATUSES, PUBLISH_POLICIES, SEARCH_INTENTS, TRANSITIONS, type PostStatus } from "./constants";
import { analyzeContent } from "./seo-score";
import { contentChannel, contentPost, contentPublication } from "./schema";

/* ---------------- Inputs ---------------- */

const list = z.union([z.string(), z.array(z.string())]).optional()
  .transform((v) => (Array.isArray(v) ? v : (v ?? "").split(",")).map((s) => s.trim()).filter(Boolean).slice(0, 20));
const optUrl = z.string().trim().max(2000).optional().nullable().transform((v) => v || null)
  .refine((v) => v === null || /^https:\/\/[^\s]+$/i.test(v), "Use a full https:// URL.");

export const postInput = z.object({
  productId: z.string().min(1, "Choose a project."),
  title: z.string().trim().min(1, "Title is required.").max(200),
  slug: z.string().trim().max(80).optional(),
  excerpt: z.string().trim().max(500).default(""),
  body: z.string().max(200000).default(""),
  status: z.enum(["idea", "draft"]).default("draft"),
  targetKeyword: z.string().trim().max(120).default(""),
  secondaryKeywords: list,
  searchIntent: z.enum(SEARCH_INTENTS).default("informational"),
  funnelStage: z.enum(FUNNEL_STAGES).default("awareness"),
  metaTitle: z.string().trim().max(120).default(""),
  metaDescription: z.string().trim().max(320).default(""),
  canonicalUrl: optUrl,
  coverImageUrl: optUrl,
  authorName: z.string().trim().max(120).default(""),
  tags: list,
});
export const postPatch = postInput.omit({ productId: true, status: true }).partial();

type Origin = { source: "human" | "agent"; agentInstanceId?: string; agentRunId?: string; sourceInsightId?: string | null };

/* ---------------- Helpers ---------------- */

async function assertProduct(ctx: Ctx, productId: string) {
  const [p] = await db.select({ id: product.id, name: product.name, slug: product.slug }).from(product)
    .where(and(eq(product.id, productId), eq(product.workspaceId, ctx.workspaceId)));
  if (!p) throw invalid("Unknown project.", { productId: "Unknown project." });
  return p;
}

async function ownedPost(ctx: Pick<Ctx, "workspaceId">, id: string) {
  const [p] = await db.select().from(contentPost).where(and(eq(contentPost.id, id), eq(contentPost.workspaceId, ctx.workspaceId)));
  if (!p) throw notFound("Post");
  return p;
}

async function uniqueSlug(productId: string, base: string, exceptId?: string) {
  const root = slugify(base) || "post";
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${root}-${i + 1}` : root;
    const [hit] = await db.select({ id: contentPost.id }).from(contentPost).where(and(eq(contentPost.productId, productId), eq(contentPost.slug, candidate)));
    if (!hit || hit.id === exceptId) return candidate;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

function scoreOf(p: { title: string; slug: string; body: string; metaTitle: string; metaDescription: string; targetKeyword: string; excerpt: string }) {
  const a = analyzeContent(p);
  return { seoScore: a.score, wordCount: a.wordCount };
}

/** Public origin used for hosted-blog URLs. */
export function appOrigin() {
  return publicOrigin();
}
export const hostedBlogPath = (wsSlug: string, productSlug: string) => `/blog/${wsSlug}/${productSlug}`;
export const hostedPostUrl = (wsSlug: string, productSlug: string, postSlug: string) => `${appOrigin()}${hostedBlogPath(wsSlug, productSlug)}/${postSlug}`;

/* ---------------- Reads ---------------- */

export async function listPosts(ctx: Ctx, f: { productId?: string; status?: PostStatus | "active"; q?: string; limit?: number } = {}) {
  assertCan(ctx, "content.view");
  const where = [eq(contentPost.workspaceId, ctx.workspaceId)];
  if (f.productId) where.push(eq(contentPost.productId, f.productId));
  if (f.status === "active") where.push(inArray(contentPost.status, ["idea", "draft", "in_review", "approved", "scheduled", "published"]));
  else if (f.status) where.push(eq(contentPost.status, f.status));
  if (f.q) where.push(or(ilike(contentPost.title, `%${f.q}%`), ilike(contentPost.targetKeyword, `%${f.q}%`))!);
  return db
    .select({
      id: contentPost.id, title: contentPost.title, slug: contentPost.slug, status: contentPost.status, targetKeyword: contentPost.targetKeyword,
      seoScore: contentPost.seoScore, wordCount: contentPost.wordCount, source: contentPost.source, scheduledAt: contentPost.scheduledAt,
      publishedAt: contentPost.publishedAt, liveUrl: contentPost.liveUrl, updatedAt: contentPost.updatedAt, excerpt: contentPost.excerpt,
      productId: contentPost.productId, productName: product.name, productSlug: product.slug, brandColor: product.brandColor,
    })
    .from(contentPost)
    .innerJoin(product, eq(product.id, contentPost.productId))
    .where(and(...where))
    .orderBy(desc(contentPost.updatedAt))
    .limit(Math.min(f.limit ?? 300, 500));
}
export type PostRow = Awaited<ReturnType<typeof listPosts>>[number];

export async function getPost(ctx: Ctx, id: string) {
  assertCan(ctx, "content.view");
  const [row] = await db.select({ p: contentPost, productName: product.name, productSlug: product.slug })
    .from(contentPost).innerJoin(product, eq(product.id, contentPost.productId))
    .where(and(eq(contentPost.id, id), eq(contentPost.workspaceId, ctx.workspaceId)));
  if (!row) return null;
  const publications = await db.select().from(contentPublication)
    .where(and(eq(contentPublication.workspaceId, ctx.workspaceId), eq(contentPublication.postId, id)))
    .orderBy(desc(contentPublication.createdAt)).limit(30);
  return { ...row.p, productName: row.productName, productSlug: row.productSlug, publications };
}
export type PostDetail = NonNullable<Awaited<ReturnType<typeof getPost>>>;

/** Pipeline counts per product for dashboards. */
export async function contentStats(ctx: Ctx) {
  if (!can(ctx, "content.view")) return new Map<string, ProductContentStats>();
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await db
    .select({
      productId: contentPost.productId, status: contentPost.status, n: count(),
      recent: sql<number>`count(*) filter (where ${contentPost.publishedAt} >= ${since.toISOString()})`.mapWith(Number),
      last: sql<string | null>`max(${contentPost.publishedAt})`,
    })
    .from(contentPost)
    .where(eq(contentPost.workspaceId, ctx.workspaceId))
    .groupBy(contentPost.productId, contentPost.status);
  const out = new Map<string, ProductContentStats>();
  for (const r of rows) {
    const s = out.get(r.productId) ?? { published30d: 0, published: 0, scheduled: 0, inReview: 0, drafts: 0, ideas: 0, lastPublishedAt: null };
    if (r.status === "published") {
      s.published += r.n;
      s.published30d += r.recent;
      if (r.last && (!s.lastPublishedAt || new Date(r.last) > s.lastPublishedAt)) s.lastPublishedAt = new Date(r.last);
    } else if (r.status === "scheduled") s.scheduled += r.n;
    else if (r.status === "in_review" || r.status === "approved") s.inReview += r.n;
    else if (r.status === "draft") s.drafts += r.n;
    else if (r.status === "idea") s.ideas += r.n;
    out.set(r.productId, s);
  }
  return out;
}
export type ProductContentStats = { published30d: number; published: number; scheduled: number; inReview: number; drafts: number; ideas: number; lastPublishedAt: Date | null };

/** Scheduled and published posts from `back` days ago to `ahead` days from now, for the calendar. */
export async function calendar(ctx: Ctx, productId?: string, back = 14, ahead = 28) {
  assertCan(ctx, "content.view");
  const from = new Date(Date.now() - back * 86400000);
  const to = new Date(Date.now() + ahead * 86400000);
  const where = [eq(contentPost.workspaceId, ctx.workspaceId), inArray(contentPost.status, ["scheduled", "published"])];
  if (productId) where.push(eq(contentPost.productId, productId));
  const rows = await db.select({
    id: contentPost.id, title: contentPost.title, status: contentPost.status, scheduledAt: contentPost.scheduledAt, publishedAt: contentPost.publishedAt,
    productName: product.name, brandColor: product.brandColor,
  }).from(contentPost).innerJoin(product, eq(product.id, contentPost.productId)).where(and(...where));
  return rows
    .map((r) => ({ ...r, at: (r.status === "published" ? r.publishedAt : r.scheduledAt) ?? null }))
    .filter((r) => r.at && r.at >= from && r.at <= to)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());
}

/* ---------------- Writes ---------------- */

export async function createPost(ctx: Ctx, raw: z.input<typeof postInput>, origin: Origin = { source: "human" }) {
  assertCan(ctx, "content.edit");
  const i = postInput.parse(raw);
  const p = await assertProduct(ctx, i.productId);
  const slug = await uniqueSlug(p.id, i.slug || i.title);
  const values = { ...i, slug, metaTitle: i.metaTitle || "", ...scoreOf({ ...i, slug }) };
  return db.transaction(async (tx) => {
    const [post] = await tx.insert(contentPost).values({
      ...values, workspaceId: ctx.workspaceId, source: origin.source, agentInstanceId: origin.agentInstanceId, agentRunId: origin.agentRunId,
      sourceInsightId: origin.sourceInsightId ?? null, createdBy: ctx.userId, updatedBy: ctx.userId,
    }).returning();
    await recordAudit(tx, ctx, { action: "content.created", targetType: "content", targetId: post!.id, targetLabel: post!.title, productId: p.id });
    return post!;
  });
}

export async function updatePost(ctx: Ctx, id: string, raw: z.input<typeof postPatch>) {
  assertCan(ctx, "content.edit");
  const before = await ownedPost(ctx, id);
  const patch = postPatch.parse(raw);
  // Editing an approved or scheduled post sends it back for review, so nothing unreviewed goes live.
  if ((before.status === "approved" || before.status === "scheduled") && !can(ctx, "content.publish")) {
    throw invalid("This post is approved for publishing. Ask a publisher to move it back to draft before editing.");
  }
  if (before.status === "published" && !can(ctx, "content.publish")) throw invalid("Only publishers can edit a live post.");
  const slug = patch.slug !== undefined && patch.slug !== before.slug ? await uniqueSlug(before.productId, patch.slug || patch.title || before.title, id) : before.slug;
  if (before.status === "published" && slug !== before.slug) throw conflict("Changing the URL of a live post breaks links. Unpublish first or keep the slug.");
  const next = { ...before, ...patch, slug };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
    if (k === "body") { if (patch.body !== before.body) changes.body = { from: `${before.wordCount} words`, to: "edited" }; continue; }
    if (JSON.stringify(before[k as keyof typeof before] ?? null) !== JSON.stringify(next[k as keyof typeof next] ?? null)) changes[k] = { from: before[k as keyof typeof before] ?? null, to: next[k as keyof typeof next] ?? null };
  }
  return db.transaction(async (tx) => {
    const [p] = await tx.update(contentPost).set({ ...patch, slug, ...scoreOf(next), updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(contentPost.id, id)).returning();
    if (Object.keys(changes).length) await recordAudit(tx, ctx, { action: "content.updated", targetType: "content", targetId: id, targetLabel: p!.title, productId: p!.productId, changes });
    return p!;
  });
}

/** Editorial transitions that don't publish. Approval needs content.publish. */
export async function setPostStatus(ctx: Ctx, id: string, to: PostStatus) {
  assertCan(ctx, "content.edit");
  if (!POST_STATUSES.includes(to)) throw invalid("Unknown status.");
  const p = await ownedPost(ctx, id);
  if (to === "published" || to === "scheduled") throw invalid("Use Publish or Schedule.");
  if (!TRANSITIONS[p.status].includes(to)) throw invalid(`A ${p.status.replace("_", " ")} post can't move to ${to.replace("_", " ")}.`);
  if ((to === "approved" || p.status === "published" || p.status === "scheduled") && !can(ctx, "content.publish")) throw invalid("Only publishers can do that.");
  if (p.status === "published") return unpublishPost(ctx, id, to === "archived" ? "archived" : "draft");
  await db.transaction(async (tx) => {
    await tx.update(contentPost).set({ status: to, scheduledAt: to === "approved" || to === "draft" ? null : p.scheduledAt, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(contentPost.id, id));
    await recordAudit(tx, ctx, { action: `content.${to}`, targetType: "content", targetId: id, targetLabel: p.title, productId: p.productId, changes: { status: { from: p.status, to } } });
  });
  if (to === "in_review") {
    const publishers = (await membersWithCapability(ctx.workspaceId, "content.publish")).filter((u) => u !== ctx.userId);
    await notify(ctx.workspaceId, publishers, {
      kind: "content_review", severity: "info", title: `Review requested: ${p.title}`, body: `${p.wordCount} words · SEO score ${p.seoScore}`,
      href: `/w/${ctx.workspaceSlug}/content/${id}`, sourceType: "system", sourceId: id, dedupeKey: `review:${id}:${Date.now()}`,
    });
  }
}

export async function schedulePost(ctx: Ctx, id: string, at: Date) {
  assertCan(ctx, "content.publish");
  const p = await ownedPost(ctx, id);
  if (!["draft", "in_review", "approved", "scheduled"].includes(p.status)) throw invalid(`A ${p.status} post can't be scheduled.`);
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw invalid("Pick a valid date and time.");
  if (at.getTime() < Date.now() - 60000) throw invalid("Pick a time in the future, or publish now.");
  if (!p.body.trim()) throw invalid("Write the post before scheduling it.");
  await db.transaction(async (tx) => {
    await tx.update(contentPost).set({ status: "scheduled", scheduledAt: at, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(contentPost.id, id));
    await recordAudit(tx, ctx, { action: "content.scheduled", targetType: "content", targetId: id, targetLabel: p.title, productId: p.productId, changes: { scheduledAt: { from: p.scheduledAt, to: at.toISOString() } } });
  });
}

export async function deletePost(ctx: Ctx, id: string) {
  assertCan(ctx, "content.edit");
  const p = await ownedPost(ctx, id);
  if (p.status === "published" || p.status === "scheduled") throw conflict("Unpublish or unschedule this post before deleting it.");
  await db.transaction(async (tx) => {
    await tx.delete(contentPost).where(eq(contentPost.id, id));
    await recordAudit(tx, ctx, { action: "content.deleted", targetType: "content", targetId: id, targetLabel: p.title, productId: p.productId });
  });
}

/* ---------------- Publishing ---------------- */

async function log(workspaceId: string, postId: string, v: Omit<typeof contentPublication.$inferInsert, "workspaceId" | "postId">) {
  await db.insert(contentPublication).values({ ...v, workspaceId, postId });
}

/**
 * Publishes a post to its product's destination. Marks it published only after the destination confirms:
 * - hosted: the public blog must be switched on;
 * - webhook: the site must answer 2xx.
 * Then pings IndexNow when enabled and a public URL is known.
 */
export async function publishPost(ctx: Ctx, id: string) {
  assertCan(ctx, "content.publish");
  const p = await ownedPost(ctx, id);
  if (p.status === "archived" || p.status === "idea") throw invalid(`An ${p.status} post can't be published.`);
  if (!p.body.trim() || !p.title.trim()) throw invalid("A post needs a title and body before publishing.");
  const [prod] = await db.select({ name: product.name, slug: product.slug }).from(product).where(eq(product.id, p.productId));
  const ch = await channelRow(ctx.workspaceId, p.productId);
  const actorType = ctx.actor === "agent" ? "agent" : ctx.actor === "system" ? "system" : "human";
  const publishedAt = p.publishedAt ?? new Date();
  let liveUrl: string | null = null;

  if (ch.destination === "hosted") {
    if (!ch.hostedEnabled) {
      await log(ctx.workspaceId, id, { target: "hosted", status: "failed", detail: "Hosted blog is switched off for this project.", actorType });
      throw invalid("Turn on the hosted blog (project → Content → Publishing) or choose a webhook destination first.");
    }
    liveUrl = p.canonicalUrl ?? hostedPostUrl(ctx.workspaceSlug, prod!.slug, p.slug);
    await log(ctx.workspaceId, id, { target: "hosted", status: "succeeded", detail: "Live on the hosted blog.", actorType, meta: { url: hostedPostUrl(ctx.workspaceSlug, prod!.slug, p.slug) } });
  } else {
    if (!ch.webhookUrl || !ch.webhookSecretEnc) throw invalid("Set the webhook URL in the project's publishing settings first.");
    const derived = ch.siteBlogUrl ? `${ch.siteBlogUrl.replace(/\/$/, "")}/${p.slug}` : null;
    const r = await deliverWebhook(ch.webhookUrl, decrypt(ch.webhookSecretEnc), "content.published", {
      id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, bodyMarkdown: p.body, metaTitle: p.metaTitle || p.title, metaDescription: p.metaDescription,
      canonicalUrl: p.canonicalUrl ?? derived, coverImageUrl: p.coverImageUrl, tags: p.tags, targetKeyword: p.targetKeyword, author: p.authorName,
      publishedAt: publishedAt.toISOString(), product: { name: prod!.name, slug: prod!.slug },
    }).catch((e: unknown) => ({ ok: false, status: 0, liveUrl: null, preview: e instanceof Error ? e.message : "Network error" }));
    await log(ctx.workspaceId, id, { target: "webhook", status: r.ok ? "succeeded" : "failed", responseCode: r.status || null, detail: r.ok ? "Your site accepted the post." : `Delivery failed${r.status ? ` (HTTP ${r.status})` : ""}: ${r.preview}`.slice(0, 500), actorType });
    if (!r.ok) throw invalid(`Your site didn't accept the post${r.status ? ` (HTTP ${r.status})` : ""}. Nothing was published; see the delivery log.`);
    liveUrl = r.liveUrl ?? p.canonicalUrl ?? derived;
  }

  await db.transaction(async (tx) => {
    await tx.update(contentPost).set({ status: "published", publishedAt, scheduledAt: null, liveUrl, updatedAt: new Date() }).where(eq(contentPost.id, id));
    await recordAudit(tx, ctx, { action: "content.published", targetType: "content", targetId: id, targetLabel: p.title, productId: p.productId, changes: { status: { from: p.status, to: "published" }, url: { from: p.liveUrl, to: liveUrl } } });
  });

  // Search engine notification is best effort and never blocks publishing.
  if (ch.indexNowEnabled && ch.indexNowKey && liveUrl && /^https:\/\//.test(liveUrl)) {
    const keyLocation = ch.destination === "hosted" && !p.canonicalUrl
      ? `${appOrigin()}${hostedBlogPath(ctx.workspaceSlug, prod!.slug)}/indexnow-key.txt`
      : `${new URL(liveUrl).origin}/${ch.indexNowKey}.txt`;
    const r = await pingIndexNow([liveUrl], ch.indexNowKey, keyLocation).catch((e: unknown) => ({ ok: false, status: 0, detail: e instanceof Error ? e.message : "failed" }));
    await log(ctx.workspaceId, id, { target: "indexnow", status: r.ok ? "succeeded" : "failed", responseCode: r.status || null, detail: `IndexNow (Bing, Yandex and others; not Google): ${r.detail}`, actorType });
  } else if (ch.indexNowEnabled) {
    await log(ctx.workspaceId, id, { target: "indexnow", status: "skipped", detail: "IndexNow skipped: the post's URL isn't a public https address (e.g. running on localhost).", actorType });
  }
  return { liveUrl };
}

export async function unpublishPost(ctx: Ctx, id: string, to: "draft" | "archived" = "draft") {
  assertCan(ctx, "content.publish");
  const p = await ownedPost(ctx, id);
  if (p.status !== "published") throw invalid("This post isn't published.");
  const ch = await channelRow(ctx.workspaceId, p.productId);
  if (ch.destination === "webhook" && ch.webhookUrl && ch.webhookSecretEnc) {
    const [prod] = await db.select({ name: product.name, slug: product.slug }).from(product).where(eq(product.id, p.productId));
    const r = await deliverWebhook(ch.webhookUrl, decrypt(ch.webhookSecretEnc), "content.unpublished", {
      id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, bodyMarkdown: "", metaTitle: p.metaTitle, metaDescription: p.metaDescription,
      canonicalUrl: p.canonicalUrl, coverImageUrl: p.coverImageUrl, tags: p.tags, targetKeyword: p.targetKeyword, author: p.authorName,
      publishedAt: (p.publishedAt ?? new Date()).toISOString(), product: { name: prod!.name, slug: prod!.slug },
    }).catch(() => ({ ok: false, status: 0, liveUrl: null, preview: "Network error" }));
    await log(ctx.workspaceId, id, { target: "webhook", status: r.ok ? "succeeded" : "failed", responseCode: r.status || null, detail: r.ok ? "Unpublish sent to your site." : "Your site didn't confirm the unpublish; remove the post there manually." });
  }
  await db.transaction(async (tx) => {
    await tx.update(contentPost).set({ status: to, liveUrl: null, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(contentPost.id, id));
    await recordAudit(tx, ctx, { action: "content.unpublished", targetType: "content", targetId: id, targetLabel: p.title, productId: p.productId, changes: { status: { from: "published", to } } });
  });
}

/**
 * An agent asks for a post to go live. The product's publish policy decides:
 * manual → stays a draft for a person; approval → approvals queue; auto → scheduled/published within the weekly limit.
 */
export async function requestPublish(ctx: Ctx, input: { postId: string; scheduledAt?: Date | null; agent: { instanceId: string; name: string }; runId?: string }) {
  assertCan(ctx, "content.edit");
  const p = await ownedPost(ctx, input.postId);
  if (p.status === "published") return { status: "already_published" as const };
  const ch = await channelRow(ctx.workspaceId, p.productId);
  const toReview = async () => {
    if (p.status !== "in_review") await db.update(contentPost).set({ status: "in_review", updatedAt: new Date() }).where(eq(contentPost.id, p.id));
  };
  if (ch.publishPolicy === "manual") {
    await toReview();
    const publishers = await membersWithCapability(ctx.workspaceId, "content.publish");
    await notify(ctx.workspaceId, publishers, { kind: "content_review", severity: "info", title: `Draft ready for review: ${p.title}`, body: `Written by agent “${input.agent.name}”. Publishing on this project is manual.`, href: `/w/${ctx.workspaceSlug}/content/${p.id}`, sourceType: "agent", sourceId: p.id, dedupeKey: `review:${p.id}` });
    return { status: "awaiting_human" as const, note: "This project's publishing is manual; the draft is waiting for a person." };
  }
  const canAuto = ch.publishPolicy === "auto" && can(ctx, "content.publish");
  if (canAuto) {
    const since = new Date(Date.now() - 7 * 86400000);
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(contentPost).where(and(
      eq(contentPost.productId, p.productId), eq(contentPost.source, "agent"), inArray(contentPost.status, ["published", "scheduled"]),
      or(gte(contentPost.publishedAt, since), gte(contentPost.scheduledAt, since)),
    ));
    if (n >= ch.weeklyAgentLimit) {
      await toReview();
      return { status: "limit_reached" as const, note: `Weekly agent publishing limit (${ch.weeklyAgentLimit}) reached; left in review.` };
    }
    if (input.scheduledAt && input.scheduledAt.getTime() > Date.now() + 60000) {
      await schedulePost(ctx, p.id, input.scheduledAt);
      return { status: "scheduled" as const, at: input.scheduledAt.toISOString() };
    }
    const r = await publishPost(ctx, p.id);
    return { status: "published" as const, url: r.liveUrl };
  }
  await toReview();
  const a = await requestApproval({
    workspaceId: ctx.workspaceId, requestedByType: "agent", requestedById: input.agent.instanceId, requestedByName: input.agent.name, runId: input.runId,
    action: "content.publish", summary: `Publish post: ${p.title}`, risk: "medium",
    payload: { postId: p.id, title: p.title, product: p.productId, scheduledAt: input.scheduledAt?.toISOString() ?? null, seoScore: p.seoScore, words: p.wordCount },
  });
  return { status: "pending_approval" as const, approvalId: a.id };
}

/** Approval executor for "content.publish". */
export async function executePublishApproval(ctx: Ctx, payload: Record<string, unknown>) {
  const postId = String(payload.postId ?? "");
  const at = typeof payload.scheduledAt === "string" ? new Date(payload.scheduledAt) : null;
  if (at && at.getTime() > Date.now() + 60000) {
    await schedulePost(ctx, postId, at);
    return `Scheduled for ${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
  const r = await publishPost(ctx, postId);
  return r.liveUrl ? `Published: ${r.liveUrl}` : "Published";
}

/** Scheduler: publishes posts whose time has come, as the person who scheduled them (re-checked now). */
export async function publishDuePosts() {
  const due = await db.select().from(contentPost).where(and(eq(contentPost.status, "scheduled"), lte(contentPost.scheduledAt, new Date()))).orderBy(asc(contentPost.scheduledAt)).limit(50);
  let published = 0;
  let failed = 0;
  for (const p of due) {
    const [ws] = await db.select().from(workspace).where(eq(workspace.id, p.workspaceId));
    const members = await db.select().from(workspaceMember).where(eq(workspaceMember.workspaceId, p.workspaceId));
    const m = members.find((x) => x.userId === p.updatedBy && roleCan(x.role as Role, "content.publish")) ?? members.find((x) => x.role === "owner");
    if (!ws || !m) continue;
    const ctx: Ctx = { workspaceId: ws.id, workspaceSlug: ws.slug, userId: m.userId, role: m.role as Role, actor: "system" };
    try {
      await publishPost(ctx, p.id);
      published++;
    } catch (e) {
      failed++;
      // Don't retry forever: move back to approved and tell the person who scheduled it.
      await db.update(contentPost).set({ status: "approved", updatedAt: new Date() }).where(eq(contentPost.id, p.id));
      await notify(ws.id, [m.userId], {
        kind: "content_failed", severity: "critical", title: `Scheduled post failed to publish: ${p.title}`, body: e instanceof Error ? e.message : "Publishing failed.",
        href: `/w/${ws.slug}/content/${p.id}`, sourceType: "system", sourceId: p.id, dedupeKey: `publish-failed:${p.id}:${p.scheduledAt?.toISOString()}`,
      });
    }
  }
  return { due: due.length, published, failed };
}

/* ---------------- Channel (publishing settings) ---------------- */

const DEFAULT_CHANNEL = {
  hostedEnabled: false, blogTitle: "", blogDescription: "", destination: "hosted" as const, webhookUrl: null, webhookSecretEnc: null, siteBlogUrl: null,
  publishPolicy: "approval" as const, indexNowKey: null, indexNowEnabled: false, weeklyAgentLimit: 3,
};

async function channelRow(workspaceId: string, productId: string) {
  const [c] = await db.select().from(contentChannel).where(and(eq(contentChannel.workspaceId, workspaceId), eq(contentChannel.productId, productId)));
  return c ?? { ...DEFAULT_CHANNEL, id: null, productId, workspaceId };
}

/** Settings as shown to a user. The webhook secret is only revealed to publishers. */
export async function getChannel(ctx: Ctx, productId: string) {
  assertCan(ctx, "content.view");
  await assertProduct(ctx, productId);
  const c = await channelRow(ctx.workspaceId, productId);
  const { webhookSecretEnc, ...rest } = c;
  return { ...rest, hasSecret: Boolean(webhookSecretEnc), webhookSecret: webhookSecretEnc && can(ctx, "content.publish") ? decrypt(webhookSecretEnc) : null };
}
export type ChannelView = Awaited<ReturnType<typeof getChannel>>;

export const channelInput = z.object({
  hostedEnabled: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  blogTitle: z.string().trim().max(120).default(""),
  blogDescription: z.string().trim().max(300).default(""),
  destination: z.enum(DESTINATIONS).default("hosted"),
  webhookUrl: optUrl,
  siteBlogUrl: optUrl,
  publishPolicy: z.enum(PUBLISH_POLICIES).default("approval"),
  indexNowEnabled: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  indexNowKey: z.string().trim().max(128).optional().nullable().transform((v) => v || null),
  weeklyAgentLimit: z.coerce.number().int().min(0).max(50).default(3),
});

export async function updateChannel(ctx: Ctx, productId: string, raw: z.input<typeof channelInput>) {
  assertCan(ctx, "content.publish");
  const prod = await assertProduct(ctx, productId);
  const i = channelInput.parse(raw);
  const before = await channelRow(ctx.workspaceId, productId);
  // Letting agents publish without per-post approval is a workspace-level decision.
  if (i.publishPolicy === "auto" && before.publishPolicy !== "auto" && !can(ctx, "workspace.manage")) {
    throw invalid("Only workspace owners and admins can let agents publish automatically.");
  }
  if (i.destination === "webhook" && !i.webhookUrl) throw invalid("Enter the https URL that should receive published posts.", { webhookUrl: "Required for webhook publishing." });
  let indexNowKey = i.indexNowKey ?? before.indexNowKey;
  if (i.indexNowEnabled && !indexNowKey) indexNowKey = randomBytes(16).toString("hex");
  if (indexNowKey && !isValidIndexNowKey(indexNowKey)) throw invalid("IndexNow keys are 8–128 letters, digits or dashes.", { indexNowKey: "Invalid key." });
  const webhookSecretEnc = i.destination === "webhook" ? (before.webhookSecretEnc ?? encrypt(`whsec_${randomBytes(24).toString("base64url")}`)) : before.webhookSecretEnc;
  const values = { ...i, indexNowKey, webhookSecretEnc, updatedBy: ctx.userId, updatedAt: new Date() };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["hostedEnabled", "destination", "webhookUrl", "publishPolicy", "indexNowEnabled", "weeklyAgentLimit"] as const) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(values[k] ?? null)) changes[k] = { from: before[k] ?? null, to: values[k] ?? null };
  }
  await db.transaction(async (tx) => {
    await tx.insert(contentChannel).values({ ...values, workspaceId: ctx.workspaceId, productId })
      .onConflictDoUpdate({ target: contentChannel.productId, set: values });
    await recordAudit(tx, ctx, { action: "content.channel_updated", targetType: "product", targetId: productId, targetLabel: `${prod.name} publishing`, productId, changes });
  });
}

export async function rotateWebhookSecret(ctx: Ctx, productId: string) {
  assertCan(ctx, "content.publish");
  const prod = await assertProduct(ctx, productId);
  const c = await channelRow(ctx.workspaceId, productId);
  if (!c.id) throw invalid("Save publishing settings first.");
  await db.transaction(async (tx) => {
    await tx.update(contentChannel).set({ webhookSecretEnc: encrypt(`whsec_${randomBytes(24).toString("base64url")}`), updatedAt: new Date() }).where(eq(contentChannel.id, c.id!));
    await recordAudit(tx, ctx, { action: "content.webhook_secret_rotated", targetType: "product", targetId: productId, targetLabel: `${prod.name} publishing`, productId });
  });
}

/* ---------------- Public (no session) ---------------- */

/** Public hosted blog: only for products whose owner switched it on, and only published posts. */
export async function publicBlog(wsSlug: string, productSlug: string, limit = 50) {
  const [row] = await db.select({ p: product, ch: contentChannel, wsId: workspace.id, wsName: workspace.name })
    .from(product)
    .innerJoin(workspace, eq(workspace.id, product.workspaceId))
    .innerJoin(contentChannel, eq(contentChannel.productId, product.id))
    .where(and(eq(workspace.slug, wsSlug), eq(product.slug, productSlug), eq(contentChannel.hostedEnabled, true), eq(contentChannel.destination, "hosted"), isNull(product.archivedAt)));
  if (!row) return null;
  const posts = await db.select({
    id: contentPost.id, title: contentPost.title, slug: contentPost.slug, excerpt: contentPost.excerpt, publishedAt: contentPost.publishedAt,
    updatedAt: contentPost.updatedAt, authorName: contentPost.authorName, tags: contentPost.tags, coverImageUrl: contentPost.coverImageUrl,
    metaDescription: contentPost.metaDescription, wordCount: contentPost.wordCount, canonicalUrl: contentPost.canonicalUrl,
  }).from(contentPost).where(and(eq(contentPost.productId, row.p.id), eq(contentPost.status, "published"))).orderBy(desc(contentPost.publishedAt)).limit(limit);
  return {
    product: { name: row.p.name, slug: row.p.slug, summary: row.p.summary, brandColor: row.p.brandColor },
    workspaceSlug: wsSlug,
    title: row.ch.blogTitle || `${row.p.name} blog`,
    description: row.ch.blogDescription || row.p.summary,
    indexNowKey: row.ch.indexNowEnabled ? row.ch.indexNowKey : null,
    posts,
  };
}
export type PublicBlog = NonNullable<Awaited<ReturnType<typeof publicBlog>>>;

export async function publicPost(wsSlug: string, productSlug: string, postSlug: string) {
  const blog = await publicBlog(wsSlug, productSlug, 6);
  if (!blog) return null;
  const [row] = await db.select({ post: contentPost }).from(contentPost)
    .innerJoin(product, eq(product.id, contentPost.productId))
    .innerJoin(workspace, eq(workspace.id, product.workspaceId))
    .where(and(eq(workspace.slug, wsSlug), eq(product.slug, productSlug), eq(contentPost.slug, postSlug), eq(contentPost.status, "published")));
  if (!row) return null;
  return { blog, post: row.post, related: blog.posts.filter((p) => p.slug !== postSlug).slice(0, 3) };
}
