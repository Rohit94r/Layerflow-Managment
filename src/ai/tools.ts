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
