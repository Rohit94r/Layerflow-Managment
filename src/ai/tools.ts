import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../server/db";
import { can, type Capability, type Ctx } from "../server/permissions";
import { product } from "../modules/portfolio/schema";
import { attentionSignals, getProductBySlug, listProducts } from "../modules/portfolio/service";
import { listTasks, taskCountsByProduct } from "../modules/work/service";
import { listActivity } from "../modules/audit/service";
import { financeSummary } from "../modules/finance/service";
import { listInsights, listProperties, propertyOverview } from "../modules/seo/service";
import { createDoc } from "../modules/knowledge/service";
import { requestApproval } from "../modules/automation/inbox";
import { analyticsOverview, listAnalyticsProperties } from "../modules/analytics/service";
import { createPost, getPost, listPosts, requestPublish, updatePost } from "../modules/content/service";
import { analyzeContent } from "../modules/content/seo-score";
import { FUNNEL_STAGES, SEARCH_INTENTS } from "../modules/content/constants";
import type { ToolLevel } from "./catalog";

export type ToolEnv = { ctx: Ctx; agent: { instanceId: string; name: string; productId: string | null }; runId: string };

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  level: ToolLevel;
  capability: Capability;
  schema: S;
  jsonSchema: Record<string, unknown>;
  run: (env: ToolEnv, input: z.infer<S>) => Promise<unknown>;
};

const def = <S extends z.ZodType>(d: ToolDef<S>) => d;

async function productId(env: ToolEnv, slug?: string) {
  if (!slug) return env.agent.productId ?? undefined;
  const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.workspaceId, env.ctx.workspaceId), eq(product.slug, slug)));
  if (!p) throw new Error(`No product with slug "${slug}".`);
  // A product-scoped agent may not read other products.
  if (env.agent.productId && p.id !== env.agent.productId) throw new Error("This agent is scoped to a different product.");
  return p.id;
}

const slugProp = { product_slug: { type: "string", description: "Product slug. Omit for the agent's scope." } };

export const TOOLS = [
  def({
    name: "list_products",
    description: "List active products with stage, priority, health, focus, open/overdue task counts and rule-based attention signals.",
    level: "read", capability: "product.view",
    schema: z.object({}),
    jsonSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(env) {
      const [rows, signals, counts] = await Promise.all([listProducts(env.ctx), attentionSignals(env.ctx), taskCountsByProduct(env.ctx)]);
      return rows.filter((p) => !env.agent.productId || p.id === env.agent.productId).map((p) => ({
        slug: p.slug, name: p.name, summary: p.summary, type: p.type, stage: p.lifecycle, priority: p.priority, health: p.health,
        healthReason: p.healthReason, focus: p.focus, owner: p.ownerName, openTasks: counts.get(p.id)?.open ?? 0, overdueTasks: counts.get(p.id)?.overdue ?? 0,
        signals: (signals.get(p.id) ?? []).map((s) => s.label),
      }));
    },
  }),
  def({
    name: "get_product",
    description: "Full details of one product: strategy fields, links, tech stack, review dates.",
    level: "read", capability: "product.view",
    schema: z.object({ product_slug: z.string() }),
    jsonSchema: { type: "object", properties: { product_slug: { type: "string" } }, required: ["product_slug"], additionalProperties: false },
    async run(env, i) {
      await productId(env, i.product_slug);
      const p = await getProductBySlug(env.ctx, i.product_slug);
      if (!p) throw new Error("Not found.");
      return {
        name: p.name, summary: p.summary, description: p.description, type: p.type, stage: p.lifecycle, priority: p.priority, health: p.health,
        healthReason: p.healthReason, focus: p.focus, role: p.role, objective: p.strategicObjective, audience: p.targetAudience,
        businessModel: p.businessModel, techStack: p.techStack, launchDate: p.launchDate, nextReviewDate: p.nextReviewDate,
        links: p.links.map((l) => ({ kind: l.kind, url: l.url })),
      };
    },
  }),
  def({
    name: "list_tasks",
    description: "List tasks and bugs. Filter by product and status (open, done or all).",
    level: "read", capability: "work.view",
    schema: z.object({ product_slug: z.string().optional(), status: z.enum(["open", "done", "all"]).optional(), limit: z.number().int().min(1).max(100).optional() }),
    jsonSchema: { type: "object", properties: { ...slugProp, status: { type: "string", enum: ["open", "done", "all"] }, limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
    async run(env, i) {
      const rows = await listTasks(env.ctx, { productId: await productId(env, i.product_slug), status: i.status ?? "open" });
      return rows.slice(0, i.limit ?? 50).map((t) => ({ number: t.number, title: t.title, type: t.type, status: t.status, priority: t.priority, due: t.dueDate, product: t.productName, assignee: t.assigneeName }));
    },
  }),
  def({
    name: "list_activity",
    description: "Recent changes in the workspace (who did what), newest first.",
    level: "read", capability: "audit.view",
    schema: z.object({ product_slug: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }),
    jsonSchema: { type: "object", properties: { ...slugProp, limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
    async run(env, i) {
      const r = await listActivity(env.ctx, { productId: await productId(env, i.product_slug), limit: i.limit ?? 40 });
      return r.items.map((e) => ({ at: e.createdAt.toISOString(), actor: e.actorName ?? e.actorType, action: e.action, target: e.targetLabel }));
    },
  }),
  def({
    name: "finance_summary",
    description: "Monthly cost run-rate per currency, cost by product and category, renewals in 30 days, recorded (manual) revenue.",
    level: "read", capability: "finance.view",
    schema: z.object({ product_slug: z.string().optional() }),
    jsonSchema: { type: "object", properties: slugProp, additionalProperties: false },
    async run(env, i) {
      const s = await financeSummary(env.ctx, { productId: await productId(env, i.product_slug) });
      return {
        monthlyCostMinorUnitsByCurrency: s.monthlyCost, byProduct: s.byProduct.map((b) => ({ product: b.name, monthlyMinorUnits: b.totals })),
        renewalsNext30Days: s.renewals.map((e) => ({ vendor: e.vendor, amountMinor: e.amountMinor, currency: e.currency, date: e.nextRenewalDate, product: e.productName })),
        revenueRecorded: s.hasRevenueData, revenueByMonthMinorUnits: s.revenueMonths, estimatesIncluded: s.estimates, mixedCurrencies: s.mixedCurrencies,
        note: "Amounts are in minor units (cents). Revenue is manually recorded; missing months mean not recorded, not zero.",
      };
    },
  }),
  def({
    name: "seo_overview",
    description: "Google Search Console performance per mapped property: last 28 days vs previous 28 days, top queries and pages.",
    level: "read", capability: "seo.view",
    schema: z.object({ product_slug: z.string().optional() }),
    jsonSchema: { type: "object", properties: slugProp, additionalProperties: false },
    async run(env, i) {
      const props = await listProperties(env.ctx, await productId(env, i.product_slug));
      if (!props.length) return { connected: false, note: "Search Console is not connected or no property is mapped to this product." };
      const out = [];
      for (const p of props) {
        const o = await propertyOverview(env.ctx, p.id);
        out.push({
          product: p.productName, property: p.siteUrl, dataThrough: p.dataThrough, current: o.current, previous: o.previous,
          topQueries: o.queries.slice(0, 15), topPages: o.pages.slice(0, 15),
        });
      }
      return { source: "Google Search Console (web)", properties: out };
    },
  }),
  def({
    name: "list_seo_insights",
    description: "Open rule-based SEO opportunities with their evidence, confidence and suggested next action.",
    level: "read", capability: "seo.view",
    schema: z.object({ product_slug: z.string().optional() }),
    jsonSchema: { type: "object", properties: slugProp, additionalProperties: false },
    async run(env, i) {
      const rows = await listInsights(env.ctx, { productId: await productId(env, i.product_slug) });
      return rows.slice(0, 40).map((r) => ({ kind: r.kind, title: r.title, evidence: r.evidence, confidence: r.confidence, nextAction: r.nextAction, product: r.productName }));
    },
  }),
  def({
    name: "write_report",
    description: "Save a Markdown report as a DRAFT document in the workspace for people to review. Use once, at the end.",
    level: "create_internal", capability: "docs.edit",
    schema: z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(60000), product_slug: z.string().optional() }),
    jsonSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string", description: "Markdown" }, ...slugProp }, required: ["title", "body"], additionalProperties: false },
    async run(env, i) {
      const d = await createDoc(env.ctx, {
        title: i.title, kind: "report", status: "draft", productId: (await productId(env, i.product_slug)) ?? null,
        body: `${i.body}\n\n---\n_Draft written by agent “${env.agent.name}” (run ${env.runId.slice(-8)}). Review before acting on it._`,
      });
      return { saved: true, documentId: d.id };
    },
  }),
  def({
    name: "propose_task",
    description: "Propose a new task. It is NOT created until a human approves it in the approvals queue.",
    level: "approval", capability: "work.edit",
    schema: z.object({
      title: z.string().min(1).max(200), description: z.string().max(5000), product_slug: z.string().optional(),
      priority: z.enum(["urgent", "high", "medium", "low"]), type: z.enum(["task", "bug", "feature", "chore"]),
    }),
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" }, ...slugProp, priority: { type: "string", enum: ["urgent", "high", "medium", "low"] }, type: { type: "string", enum: ["task", "bug", "feature", "chore"] } },
      required: ["title", "description", "priority", "type"], additionalProperties: false,
    },
    async run(env, i) {
      const pid = (await productId(env, i.product_slug)) ?? null;
      const a = await requestApproval({
        workspaceId: env.ctx.workspaceId, requestedByType: "agent", requestedById: env.agent.instanceId, requestedByName: env.agent.name, runId: env.runId,
        action: "task.create", summary: `Create task: ${i.title}`, risk: i.priority === "urgent" ? "medium" : "low",
        payload: { title: i.title, description: `${i.description}\n\n_Proposed by agent “${env.agent.name}”._`, priority: i.priority, type: i.type, productId: pid },
      });
      return { status: "pending_approval", approvalId: a.id };
    },
  }),
  def({
    name: "get_analytics",
    description: "Google Analytics 4 per mapped property: sessions, users, page views, engagement rate and key events for the last 28 days vs the previous 28, plus top channels and landing pages.",
    level: "read", capability: "analytics.view",
    schema: z.object({ product_slug: z.string().optional() }),
    jsonSchema: { type: "object", properties: slugProp, additionalProperties: false },
    async run(env, i) {
      const props = (await listAnalyticsProperties(env.ctx, await productId(env, i.product_slug))).filter((p) => p.productId);
      if (!props.length) return { connected: false, note: "Google Analytics is not connected or no property is mapped to this product. Do not guess traffic numbers." };
      const out = [];
      for (const p of props) {
        const o = await analyticsOverview(env.ctx, p.id);
        out.push({
          product: p.productName, property: p.name, dataThrough: p.dataThrough, current: o.current, previous: o.previous,
          channels: o.channels.slice(0, 10), landingPages: o.landingPages.slice(0, 20), devices: o.devices,
          note: "users are daily users summed over the window; the latest 1–2 days may still be processing at Google.",
        });
      }
      return { source: "Google Analytics 4 (Data API)", properties: out };
    },
  }),
  def({
    name: "list_content",
    description: "List blog posts (title, status, target keyword, SEO score, publish date, live URL). Use it to avoid duplicating topics and to find gaps.",
    level: "read", capability: "content.view",
    schema: z.object({ product_slug: z.string().optional(), status: z.enum(["idea", "draft", "in_review", "approved", "scheduled", "published", "archived"]).optional() }),
    jsonSchema: { type: "object", properties: { ...slugProp, status: { type: "string", enum: ["idea", "draft", "in_review", "approved", "scheduled", "published", "archived"] } }, additionalProperties: false },
    async run(env, i) {
      const rows = await listPosts(env.ctx, { productId: await productId(env, i.product_slug), status: i.status, limit: 100 });
      return rows.map((p) => ({ id: p.id, title: p.title, slug: p.slug, status: p.status, keyword: p.targetKeyword, seoScore: p.seoScore, words: p.wordCount, product: p.productSlug, publishedAt: p.publishedAt?.toISOString() ?? null, url: p.liveUrl }));
    },
  }),
  def({
    name: "draft_blog_post",
    description: "Save a new blog post as a DRAFT for one product. Returns the deterministic SEO score and the checks that did not pass so you can improve it with update_blog_post. Nothing is published.",
    level: "create_internal", capability: "content.edit",
    schema: z.object({
      product_slug: z.string().optional(), title: z.string().min(5).max(200), target_keyword: z.string().min(2).max(120), body: z.string().min(200).max(60000),
      excerpt: z.string().max(500), meta_title: z.string().max(120), meta_description: z.string().max(320),
      secondary_keywords: z.array(z.string().max(80)).max(10).optional(), search_intent: z.enum(SEARCH_INTENTS).optional(), funnel_stage: z.enum(FUNNEL_STAGES).optional(),
      tags: z.array(z.string().max(40)).max(8).optional(), slug: z.string().max(80).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        ...slugProp, title: { type: "string" }, target_keyword: { type: "string" }, body: { type: "string", description: "Markdown. Use ## for sections; the title is the H1." },
        excerpt: { type: "string" }, meta_title: { type: "string", description: "30–60 characters" }, meta_description: { type: "string", description: "120–160 characters" },
        secondary_keywords: { type: "array", items: { type: "string" } }, search_intent: { type: "string", enum: [...SEARCH_INTENTS] }, funnel_stage: { type: "string", enum: [...FUNNEL_STAGES] },
        tags: { type: "array", items: { type: "string" } }, slug: { type: "string" },
      },
      required: ["title", "target_keyword", "body", "excerpt", "meta_title", "meta_description"], additionalProperties: false,
    },
    async run(env, i) {
      const pid = await productId(env, i.product_slug);
      if (!pid) throw new Error("Pass product_slug: a post belongs to one product.");
      const post = await createPost(env.ctx, {
        productId: pid, title: i.title, slug: i.slug, body: i.body, excerpt: i.excerpt, metaTitle: i.meta_title, metaDescription: i.meta_description,
        targetKeyword: i.target_keyword, secondaryKeywords: i.secondary_keywords, searchIntent: i.search_intent, funnelStage: i.funnel_stage, tags: i.tags,
        authorName: env.agent.name,
      }, { source: "agent", agentInstanceId: env.agent.instanceId, agentRunId: env.runId });
      const a = analyzeContent(post);
      return { saved: true, postId: post.id, slug: post.slug, seoScore: a.score, words: a.wordCount, toImprove: a.checks.filter((c) => c.status !== "pass").map((c) => `${c.label}: ${c.detail}`) };
    },
  }),
  def({
    name: "update_blog_post",
    description: "Revise a draft post this agent wrote (title, body, meta fields). Only drafts written by this agent can be changed.",
    level: "create_internal", capability: "content.edit",
    schema: z.object({
      post_id: z.string(), title: z.string().min(5).max(200).optional(), body: z.string().min(200).max(60000).optional(), excerpt: z.string().max(500).optional(),
      meta_title: z.string().max(120).optional(), meta_description: z.string().max(320).optional(), target_keyword: z.string().max(120).optional(),
    }),
    jsonSchema: {
      type: "object",
      properties: { post_id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, excerpt: { type: "string" }, meta_title: { type: "string" }, meta_description: { type: "string" }, target_keyword: { type: "string" } },
      required: ["post_id"], additionalProperties: false,
    },
    async run(env, i) {
      const p = await getPost(env.ctx, i.post_id);
      if (!p) throw new Error("Post not found.");
      if (p.agentInstanceId !== env.agent.instanceId || p.status !== "draft") throw new Error("Only this agent's own drafts can be revised.");
      if (env.agent.productId && p.productId !== env.agent.productId) throw new Error("This agent is scoped to a different product.");
      const patch = Object.fromEntries(Object.entries({ title: i.title, body: i.body, excerpt: i.excerpt, metaTitle: i.meta_title, metaDescription: i.meta_description, targetKeyword: i.target_keyword }).filter(([, v]) => v !== undefined));
      const u = await updatePost(env.ctx, p.id, patch);
      const a = analyzeContent(u);
      return { saved: true, seoScore: a.score, words: a.wordCount, toImprove: a.checks.filter((c) => c.status !== "pass").map((c) => `${c.label}: ${c.detail}`) };
    },
  }),
  def({
    name: "request_publish",
    description: "Ask for one of this agent's drafts to be published (optionally at a future ISO time). The product's publishing policy decides: a person reviews it, it goes to the approvals queue, or (only if the owner enabled automatic publishing) it is scheduled/published within the weekly limit.",
    level: "approval", capability: "content.edit",
    schema: z.object({ post_id: z.string(), publish_at: z.string().datetime({ offset: true }).optional() }),
    jsonSchema: { type: "object", properties: { post_id: { type: "string" }, publish_at: { type: "string", description: "ISO 8601 date-time, e.g. 2026-11-24T09:00:00Z" } }, required: ["post_id"], additionalProperties: false },
    async run(env, i) {
      const p = await getPost(env.ctx, i.post_id);
      if (!p) throw new Error("Post not found.");
      if (p.agentInstanceId !== env.agent.instanceId) throw new Error("Agents can only request publishing for their own drafts.");
      if (env.agent.productId && p.productId !== env.agent.productId) throw new Error("This agent is scoped to a different product.");
      return requestPublish(env.ctx, { postId: p.id, scheduledAt: i.publish_at ? new Date(i.publish_at) : null, agent: { instanceId: env.agent.instanceId, name: env.agent.name }, runId: env.runId });
    },
  }),
];

export type AgentTool = (typeof TOOLS)[number];
export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);

/** Authorisation at execution time: tool allowed for this agent AND the owner's role still permits it. */
export function authorizeTool(ctx: Ctx, allowed: string[], name: string) {
  const t = toolByName(name);
  if (!t) return { ok: false as const, reason: `Unknown tool ${name}.` };
  if (!allowed.includes(name)) return { ok: false as const, reason: `Tool ${name} is not enabled for this agent.` };
  if (!can(ctx, t.capability)) return { ok: false as const, reason: `The agent's owner lacks ${t.capability}.` };
  return { ok: true as const, tool: t };
}
