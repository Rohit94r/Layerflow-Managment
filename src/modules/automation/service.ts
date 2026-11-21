import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { invalid, notFound } from "../../lib/errors";
import { recordAudit } from "../audit/service";
import { workspace, workspaceMember } from "../identity/schema";
import { product } from "../portfolio/schema";
import { createTask } from "../work/service";
import { createDoc } from "../knowledge/service";
import { automation, automationEffect, automationRun } from "./schema";
import { notify, requestApproval } from "./inbox";
import { TEMPLATES, templateByKey } from "./templates";

export function templates() {
  return TEMPLATES.map(({ evaluate: _e, ...t }) => t);
}

export async function listAutomations(ctx: Ctx) {
  assertCan(ctx, "automation.view");
  const rows = await db.select({ a: automation, productName: product.name }).from(automation).leftJoin(product, eq(product.id, automation.productId))
    .where(eq(automation.workspaceId, ctx.workspaceId)).orderBy(desc(automation.createdAt));
  const runs = await db.select().from(automationRun).where(eq(automationRun.workspaceId, ctx.workspaceId)).orderBy(desc(automationRun.startedAt)).limit(200);
  return rows.map(({ a, productName }) => ({ ...a, productName, runs: runs.filter((r) => r.automationId === a.id).slice(0, 10) }));
}
export type AutomationView = Awaited<ReturnType<typeof listAutomations>>[number];

const input = z.object({
  template: z.string(),
  name: z.string().trim().max(80).optional(),
  productId: z.string().optional().transform((v) => v || null),
  requiresApproval: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export async function createAutomation(ctx: Ctx, raw: z.input<typeof input>) {
  assertCan(ctx, "automation.manage");
  const i = input.parse(raw);
  const t = templateByKey(i.template);
  if (!t) throw invalid("Unknown template.");
  if (i.productId) {
    const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, i.productId), eq(product.workspaceId, ctx.workspaceId)));
    if (!p) throw invalid("Unknown project.");
  }
  // Only declared params are stored, coerced to their declared type.
  const params = Object.fromEntries(t.params.map((p) => {
    const v = i.params[p.key] ?? p.default;
    if (p.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 3650) throw invalid(`${p.label} must be a number between 0 and 3650.`);
      return [p.key, n];
    }
    if (p.options && !p.options.includes(String(v))) throw invalid(`Invalid ${p.label}.`);
    return [p.key, String(v)];
  }));
  return db.transaction(async (tx) => {
    const [a] = await tx.insert(automation).values({
      workspaceId: ctx.workspaceId, template: t.key, name: i.name || t.name, productId: i.productId, params,
      requiresApproval: t.canRequireApproval ? i.requiresApproval : false, ownerId: ctx.userId,
    }).returning();
    await recordAudit(tx, ctx, { action: "automation.created", targetType: "automation", targetId: a!.id, targetLabel: a!.name, productId: i.productId });
    return a!;
  });
}

async function owned(ctx: Ctx, id: string) {
  const [a] = await db.select().from(automation).where(and(eq(automation.id, id), eq(automation.workspaceId, ctx.workspaceId)));
  if (!a) throw notFound("Automation");
  return a;
}

export async function setAutomationStatus(ctx: Ctx, id: string, status: "active" | "paused") {
  assertCan(ctx, "automation.manage");
  const a = await owned(ctx, id);
  await db.transaction(async (tx) => {
    await tx.update(automation).set({ status, updatedAt: new Date(), version: a.version + 1 }).where(eq(automation.id, id));
    await recordAudit(tx, ctx, { action: `automation.${status === "active" ? "resumed" : "paused"}`, targetType: "automation", targetId: id, targetLabel: a.name });
  });
}

export async function deleteAutomation(ctx: Ctx, id: string) {
  assertCan(ctx, "automation.manage");
  const a = await owned(ctx, id);
  await db.transaction(async (tx) => {
    await tx.delete(automation).where(eq(automation.id, id));
    await recordAudit(tx, ctx, { action: "automation.deleted", targetType: "automation", targetId: id, targetLabel: a.name });
  });
}

export async function setKillSwitch(ctx: Ctx, kind: "automations" | "agents", paused: boolean) {
  assertCan(ctx, kind === "automations" ? "automation.manage" : "agent.manage");
  await db.transaction(async (tx) => {
    await tx.update(workspace).set(kind === "automations" ? { automationsPaused: paused } : { agentsPaused: paused }).where(eq(workspace.id, ctx.workspaceId));
    await recordAudit(tx, ctx, { action: `${kind}.${paused ? "kill_switch_on" : "kill_switch_off"}`, targetType: "workspace", targetId: ctx.workspaceId, targetLabel: paused ? `All ${kind} paused` : `${kind} resumed` });
  });
}

/** Runs the automation's owner's context, audited as "system". Falls back to a workspace owner. */
async function systemCtx(a: typeof automation.$inferSelect): Promise<Ctx> {
  const [ws] = await db.select().from(workspace).where(eq(workspace.id, a.workspaceId));
  const members = await db.select().from(workspaceMember).where(eq(workspaceMember.workspaceId, a.workspaceId));
  const m = members.find((x) => x.userId === a.ownerId) ?? members.find((x) => x.role === "owner");
  if (!ws || !m) throw new Error("Automation has no valid owner.");
  return { workspaceId: ws.id, workspaceSlug: ws.slug, userId: m.userId, role: m.role, actor: "system" };
}

/**
 * Trigger → conditions (template.evaluate) → dedupe → approval or execution → run record + audit.
 * Idempotent: each (automation, dedupeKey) acts once, guarded by a unique index.
 */
export async function executeAutomation(a: typeof automation.$inferSelect, trigger: "manual" | "schedule" | "dry_run") {
  const t = templateByKey(a.template);
  const [run] = await db.insert(automationRun).values({ workspaceId: a.workspaceId, automationId: a.id, trigger, status: "skipped" }).returning();
  const finish = (v: Partial<typeof automationRun.$inferInsert>) =>
    db.update(automationRun).set({ ...v, finishedAt: new Date() }).where(eq(automationRun.id, run!.id));
  try {
    if (!t) throw new Error("Template no longer exists.");
    const ctx = await systemCtx(a);
    const [ws] = await db.select({ paused: workspace.automationsPaused }).from(workspace).where(eq(workspace.id, a.workspaceId));
    if (trigger !== "dry_run" && (ws?.paused || a.status !== "active")) {
      await finish({ status: "skipped", summary: ws?.paused ? "Workspace kill switch is on." : "Automation is paused." });
      return { status: "skipped" as const };
    }
    const effects = await t.evaluate(a.workspaceId, ctx.workspaceSlug, a.params, a.productId);
    const done = new Set((await db.select({ k: automationEffect.dedupeKey }).from(automationEffect).where(eq(automationEffect.automationId, a.id))).map((r) => r.k));
    const pending = effects.filter((e) => !done.has(e.dedupeKey));
    const taken: { action: string; target: string; result: string }[] = [];

    if (trigger === "dry_run") {
      for (const e of pending) taken.push({ action: e.kind, target: e.target, result: a.requiresApproval && e.kind !== "notify" ? "would request approval" : "would run" });
      await finish({ status: "dry_run", matched: effects.length, actionsTaken: taken, summary: `${pending.length} new of ${effects.length} matching (dry run, nothing changed).` });
      return { status: "dry_run" as const, taken };
    }

    for (const e of pending) {
      // Claim the dedupe key first; a concurrent run that lost the race skips.
      const claimed = await db.insert(automationEffect).values({ workspaceId: a.workspaceId, automationId: a.id, dedupeKey: e.dedupeKey }).onConflictDoNothing().returning();
      if (!claimed.length) continue;
      try {
        if (e.kind === "notify") {
          const n = await notify(a.workspaceId, e.recipients, { kind: a.template, title: e.title, body: e.body, href: e.href, severity: e.severity, sourceType: "automation", sourceId: a.id, dedupeKey: `${a.id}:${e.dedupeKey}` });
          taken.push({ action: "notify", target: e.target, result: `${n} recipient(s)` });
        } else if (a.requiresApproval) {
          await requestApproval({ workspaceId: a.workspaceId, requestedByType: "automation", requestedById: a.id, requestedByName: a.name, runId: run!.id, action: e.kind, summary: `${e.kind === "task.create" ? "Create task" : "Create doc"}: ${String(e.payload.title)}`, payload: e.payload, risk: "low" });
          taken.push({ action: e.kind, target: e.target, result: "approval requested" });
        } else if (e.kind === "task.create") {
          const created = await createTask(ctx, e.payload as never);
          await e.after?.(created.id);
          taken.push({ action: "task.create", target: e.target, result: `#${created.number}` });
        } else {
          const d = await createDoc(ctx, e.payload as never);
          await notify(a.workspaceId, e.notify, { kind: a.template, title: d.title, body: "A new report is ready.", href: `/w/${ctx.workspaceSlug}/docs/${d.id}`, sourceType: "automation", sourceId: a.id, dedupeKey: `${a.id}:${e.dedupeKey}` });
          taken.push({ action: "doc.create", target: e.target, result: "report created" });
        }
      } catch (err) {
        // Release the claim so a later run can retry this effect.
        await db.delete(automationEffect).where(and(eq(automationEffect.automationId, a.id), eq(automationEffect.dedupeKey, e.dedupeKey)));
        taken.push({ action: e.kind, target: e.target, result: `failed: ${err instanceof Error ? err.message : "error"}` });
      }
    }
    const failed = taken.filter((x) => x.result.startsWith("failed")).length;
    await finish({ status: failed ? "failed" : "succeeded", matched: effects.length, actionsTaken: taken, summary: `${taken.length} action(s), ${effects.length - pending.length} already handled.`, error: failed ? `${failed} action(s) failed` : null });
    await db.update(automation).set({ lastRunAt: new Date() }).where(eq(automation.id, a.id));
    if (taken.length) await db.transaction((tx) => recordAudit(tx, ctx, { action: "automation.ran", targetType: "automation", targetId: a.id, targetLabel: `${a.name}: ${taken.length} action(s)`, actorType: "system" }));
    return { status: failed ? ("failed" as const) : ("succeeded" as const), taken };
  } catch (e) {
    await finish({ status: "failed", error: e instanceof Error ? e.message : "Run failed" });
    return { status: "failed" as const };
  }
}

export async function runAutomationNow(ctx: Ctx, id: string, dryRun: boolean) {
  assertCan(ctx, dryRun ? "automation.view" : "automation.manage");
  const a = await owned(ctx, id);
  return executeAutomation(a, dryRun ? "dry_run" : "manual");
}

/** Scheduler entry: all active automations in workspaces without the kill switch on. */
export async function runScheduledAutomations() {
  const rows = await db.select({ a: automation }).from(automation).innerJoin(workspace, eq(workspace.id, automation.workspaceId))
    .where(and(eq(automation.status, "active"), eq(workspace.automationsPaused, false)));
  let ran = 0;
  for (const { a } of rows) {
    await executeAutomation(a, "schedule");
    ran++;
  }
  return ran;
}

/**
 * Event entry: runs one workspace's active automations of a template right after new data arrives
 * (for example deploy-failure alerts after a Vercel sync). Dedupe keys keep it from acting twice.
 */
export async function runTemplateAutomations(workspaceId: string, templateKey: string) {
  const rows = await db.select({ a: automation }).from(automation).innerJoin(workspace, eq(workspace.id, automation.workspaceId))
    .where(and(eq(automation.workspaceId, workspaceId), eq(automation.template, templateKey), eq(automation.status, "active"), eq(workspace.automationsPaused, false)));
  for (const { a } of rows) await executeAutomation(a, "schedule");
  return rows.length;
}
