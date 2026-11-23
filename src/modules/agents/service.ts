import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { invalid, notFound } from "../../lib/errors";
import { recordAudit } from "../audit/service";
import { user, workspace, workspaceMember } from "../identity/schema";
import { product } from "../portfolio/schema";
import { AGENT_CATALOG, agentDef, agentsConfigured } from "../../ai/catalog";
import { TOOLS } from "../../ai/tools";
import { agentInstance, agentRun, agentRunStep } from "./schema";

export function catalog() {
  return AGENT_CATALOG.map((a) => ({
    ...a,
    tools: [...a.defaultTools, ...a.optionalTools]
      .map((n) => TOOLS.find((t) => t.name === n))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({ name: t.name, level: t.level, description: t.description })),
  }));
}

const configInput = z.object({
  name: z.string().trim().min(1).max(60),
  productId: z.string().optional().transform((v) => v || null),
  ownerId: z.string().optional().transform((v) => v || null),
  instructions: z.string().max(4000).default(""),
  schedule: z.enum(["manual", "daily", "weekly"]),
  monthlyBudgetDollars: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine((n) => Number.isFinite(n) && n >= 0 && n <= 1000, "Budget must be between $0 and $1000."),
  tools: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (Array.isArray(v) ? v : v ? [v] : [])),
});

async function validateRefs(ctx: Ctx, productId: string | null, ownerId: string | null) {
  if (productId) {
    const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, productId), eq(product.workspaceId, ctx.workspaceId)));
    if (!p) throw invalid("Unknown project.");
  }
  if (ownerId) {
    const [m] = await db.select({ id: workspaceMember.id }).from(workspaceMember).where(and(eq(workspaceMember.workspaceId, ctx.workspaceId), eq(workspaceMember.userId, ownerId)));
    if (!m) throw invalid("Owner must be a workspace member.");
  }
}

export async function installAgent(ctx: Ctx, key: string, raw: z.input<typeof configInput>) {
  assertCan(ctx, "agent.manage");
  const d = agentDef(key);
  if (!d) throw invalid("Unknown agent.");
  const c = configInput.parse(raw);
  await validateRefs(ctx, c.productId, c.ownerId);
  const allowed = [...new Set([...d.defaultTools, ...c.tools.filter((t) => d.optionalTools.includes(t))])];
  return db.transaction(async (tx) => {
    const [a] = await tx.insert(agentInstance).values({
      workspaceId: ctx.workspaceId, agentKey: d.key, agentVersion: d.version, name: c.name, productId: c.productId, ownerId: c.ownerId ?? ctx.userId,
      instructions: c.instructions, schedule: c.schedule, monthlyBudgetCents: Math.round(c.monthlyBudgetDollars * 100), allowedTools: allowed,
    }).returning();
    await recordAudit(tx, ctx, { action: "agent.installed", targetType: "agent", targetId: a!.id, targetLabel: `${a!.name} (${d.name} v${d.version})`, productId: c.productId });
    return a!;
  });
}

async function owned(ctx: Ctx, id: string) {
  const [a] = await db.select().from(agentInstance).where(and(eq(agentInstance.id, id), eq(agentInstance.workspaceId, ctx.workspaceId)));
  if (!a) throw notFound("Agent");
  return a;
}

export async function updateAgent(ctx: Ctx, id: string, raw: z.input<typeof configInput>) {
  assertCan(ctx, "agent.manage");
  const a = await owned(ctx, id);
  const d = agentDef(a.agentKey)!;
  const c = configInput.parse(raw);
  await validateRefs(ctx, c.productId, c.ownerId);
  const allowed = [...new Set([...d.defaultTools, ...c.tools.filter((t) => d.optionalTools.includes(t))])];
  await db.transaction(async (tx) => {
    await tx.update(agentInstance).set({
      name: c.name, productId: c.productId, ownerId: c.ownerId ?? a.ownerId, instructions: c.instructions, schedule: c.schedule,
      monthlyBudgetCents: Math.round(c.monthlyBudgetDollars * 100), allowedTools: allowed, configVersion: a.configVersion + 1, updatedAt: new Date(),
    }).where(eq(agentInstance.id, id));
    await recordAudit(tx, ctx, { action: "agent.configured", targetType: "agent", targetId: id, targetLabel: `${c.name} · config v${a.configVersion + 1}`, productId: c.productId });
  });
}

export async function setAgentStatus(ctx: Ctx, id: string, status: "active" | "paused" | "disabled") {
  assertCan(ctx, "agent.manage");
  const a = await owned(ctx, id);
  await db.transaction(async (tx) => {
    await tx.update(agentInstance).set({ status, updatedAt: new Date() }).where(eq(agentInstance.id, id));
    await recordAudit(tx, ctx, { action: `agent.${status}`, targetType: "agent", targetId: id, targetLabel: a.name, productId: a.productId });
  });
}

export async function uninstallAgent(ctx: Ctx, id: string) {
  assertCan(ctx, "agent.manage");
  const a = await owned(ctx, id);
  await db.transaction(async (tx) => {
    await tx.delete(agentInstance).where(eq(agentInstance.id, id));
    await recordAudit(tx, ctx, { action: "agent.uninstalled", targetType: "agent", targetId: id, targetLabel: a.name, productId: a.productId });
  });
}

export async function listAgents(ctx: Ctx, productId?: string) {
  assertCan(ctx, "agent.view");
  const where = [eq(agentInstance.workspaceId, ctx.workspaceId)];
  if (productId) where.push(eq(agentInstance.productId, productId));
  const rows = await db.select({ a: agentInstance, ownerName: user.name, productName: product.name, productSlug: product.slug })
    .from(agentInstance).leftJoin(user, eq(user.id, agentInstance.ownerId)).leftJoin(product, eq(product.id, agentInstance.productId))
    .where(and(...where)).orderBy(asc(agentInstance.name));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.a.id);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const stats = await db.select({
    instanceId: agentRun.instanceId,
    runs: sql<number>`count(*)`.mapWith(Number),
    succeeded: sql<number>`count(*) filter (where ${agentRun.status} = 'succeeded')`.mapWith(Number),
    failed: sql<number>`count(*) filter (where ${agentRun.status} in ('failed','timed_out'))`.mapWith(Number),
    monthCost: sql<number>`coalesce(sum(${agentRun.costMicros}) filter (where ${agentRun.startedAt} >= ${monthStart.toISOString()}),0)`.mapWith(Number),
    active: sql<number>`count(*) filter (where ${agentRun.status} in ('queued','running'))`.mapWith(Number),
  }).from(agentRun).where(inArray(agentRun.instanceId, ids)).groupBy(agentRun.instanceId);
  const last = await db.select().from(agentRun).where(inArray(agentRun.instanceId, ids)).orderBy(desc(agentRun.startedAt)).limit(200);
  return rows.map((r) => {
    const s = stats.find((x) => x.instanceId === r.a.id);
    return { ...r.a, ownerName: r.ownerName, productName: r.productName, productSlug: r.productSlug, definition: agentDef(r.a.agentKey), stats: s ?? { runs: 0, succeeded: 0, failed: 0, monthCost: 0, active: 0 }, lastRun: last.find((x) => x.instanceId === r.a.id) ?? null };
  });
}
export type AgentView = Awaited<ReturnType<typeof listAgents>>[number];

export async function getAgent(ctx: Ctx, id: string) {
  const all = await listAgents(ctx);
  const a = all.find((x) => x.id === id);
  if (!a) return null;
  const runs = await db.select({ r: agentRun, startedByName: user.name }).from(agentRun).leftJoin(user, eq(user.id, agentRun.startedBy))
    .where(and(eq(agentRun.workspaceId, ctx.workspaceId), eq(agentRun.instanceId, id))).orderBy(desc(agentRun.startedAt)).limit(50);
  return { ...a, runs: runs.map((x) => ({ ...x.r, startedByName: x.startedByName })) };
}

export async function getRun(ctx: Ctx, runId: string) {
  assertCan(ctx, "agent.view");
  const [r] = await db.select().from(agentRun).where(and(eq(agentRun.id, runId), eq(agentRun.workspaceId, ctx.workspaceId)));
  if (!r) return null;
  const steps = await db.select().from(agentRunStep).where(eq(agentRunStep.runId, runId)).orderBy(asc(agentRunStep.seq));
  return { ...r, steps };
}

/**
 * A serverless invocation can be terminated mid-run, leaving a run stuck in
 * `queued`/`running` and blocking that agent forever. Recover those runs before
 * starting another one.
 */
export async function reapStaleRuns(maxAgeMs = 15 * 60 * 1000) {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await db.select({ id: agentRun.id }).from(agentRun)
    .where(and(inArray(agentRun.status, ["queued", "running"]), lt(agentRun.startedAt, cutoff)));
  if (!stale.length) return 0;
  await db.update(agentRun)
    .set({ status: "failed", error: "Run was interrupted by the host and recovered.", currentStep: null, finishedAt: new Date() })
    .where(inArray(agentRun.id, stale.map((r) => r.id)));
  return stale.length;
}

/** Creates a queued run. The caller schedules execution (after the response) via `executeRun`. */
export async function createRun(ctx: Ctx, instanceId: string, trigger: "manual" | "schedule") {
  if (trigger === "manual") assertCan(ctx, "agent.run");
  const a = await owned(ctx, instanceId);
  if (!agentsConfigured()) throw invalid("Agents are not configured on the server. Set ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or a proxy via AGENT_BASE_URL (plus AGENT_API_KEY / AGENT_NO_AUTH).");
  await reapStaleRuns();
  if (a.status !== "active") throw invalid(`This agent is ${a.status}. Resume it first.`);
  const [ws] = await db.select({ paused: workspace.agentsPaused }).from(workspace).where(eq(workspace.id, ctx.workspaceId));
  if (ws?.paused) throw invalid("The workspace agent kill switch is on.");
  const [busy] = await db.select({ id: agentRun.id }).from(agentRun).where(and(eq(agentRun.instanceId, instanceId), inArray(agentRun.status, ["queued", "running"])));
  if (busy) throw invalid("This agent already has a run in progress.");
  const [run] = await db.insert(agentRun).values({ workspaceId: ctx.workspaceId, instanceId, trigger, startedBy: trigger === "manual" ? ctx.userId : null }).returning();
  return run!;
}

export async function cancelRun(ctx: Ctx, runId: string) {
  assertCan(ctx, "agent.run");
  const [r] = await db.update(agentRun).set({ status: "cancelled", currentStep: null, finishedAt: new Date(), error: "Cancelled by a user." })
    .where(and(eq(agentRun.id, runId), eq(agentRun.workspaceId, ctx.workspaceId), inArray(agentRun.status, ["queued", "running"]))).returning();
  if (!r) throw invalid("This run is not in progress.");
}

/** Scheduler: active agents whose schedule is due, in workspaces without the kill switch. */
export async function dueAgents() {
  const rows = await db.select({ a: agentInstance }).from(agentInstance).innerJoin(workspace, eq(workspace.id, agentInstance.workspaceId))
    .where(and(eq(agentInstance.status, "active"), eq(workspace.agentsPaused, false), inArray(agentInstance.schedule, ["daily", "weekly"])));
  const now = Date.now();
  return rows.map((r) => r.a).filter((a) => !a.lastRunAt || now - a.lastRunAt.getTime() > (a.schedule === "daily" ? 22 : 166) * 3600 * 1000);
}
