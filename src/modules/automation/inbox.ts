import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../server/db";
import { assertCan, roleCan, type Ctx } from "../../server/permissions";
import { notFound, invalid } from "../../lib/errors";
import { recordAudit } from "../audit/service";
import { workspaceMember } from "../identity/schema";
import type { Role } from "../identity/constants";
import { createTask } from "../work/service";
import { createDoc } from "../knowledge/service";
import { approval, inboxItem } from "./schema";

type NewItem = {
  kind: string;
  title: string;
  body?: string;
  href?: string;
  severity?: "info" | "warning" | "critical";
  sourceType: "automation" | "agent" | "system" | "integration" | "approval";
  sourceId?: string;
  dedupeKey?: string;
};

/** Delivers an inbox item to each recipient. A dedupe key prevents repeat notifications. */
export async function notify(workspaceId: string, userIds: string[], item: NewItem) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return 0;
  const rows = await db
    .insert(inboxItem)
    .values(unique.map((userId) => ({ ...item, workspaceId, userId })))
    .onConflictDoNothing()
    .returning({ id: inboxItem.id });
  return rows.length;
}

export async function membersWithCapability(workspaceId: string, cap: Parameters<typeof roleCan>[1]) {
  const rows = await db.select({ userId: workspaceMember.userId, role: workspaceMember.role }).from(workspaceMember).where(eq(workspaceMember.workspaceId, workspaceId));
  return rows.filter((r) => roleCan(r.role as Role, cap)).map((r) => r.userId);
}

export async function listInbox(ctx: Ctx, filter: "open" | "all" = "open") {
  const where = [eq(inboxItem.workspaceId, ctx.workspaceId), eq(inboxItem.userId, ctx.userId)];
  if (filter === "open") where.push(isNull(inboxItem.resolvedAt));
  return db.select().from(inboxItem).where(and(...where)).orderBy(desc(inboxItem.createdAt)).limit(200);
}

export async function unreadCount(ctx: Ctx) {
  const [r] = await db.select({ n: count() }).from(inboxItem)
    .where(and(eq(inboxItem.workspaceId, ctx.workspaceId), eq(inboxItem.userId, ctx.userId), isNull(inboxItem.readAt), isNull(inboxItem.resolvedAt)));
  return r?.n ?? 0;
}

export async function markInbox(ctx: Ctx, ids: string[] | "all", what: "read" | "resolve") {
  const where = [eq(inboxItem.workspaceId, ctx.workspaceId), eq(inboxItem.userId, ctx.userId)];
  if (ids !== "all") where.push(inArray(inboxItem.id, ids.slice(0, 200)));
  await db.update(inboxItem).set(what === "read" ? { readAt: new Date() } : { resolvedAt: new Date(), readAt: new Date() }).where(and(...where));
}

/* ---------------- Approvals ---------------- */

/** Actions that may be requested for approval, and how to execute them. Anything else is refused. */
const EXECUTORS: Record<string, (ctx: Ctx, payload: Record<string, unknown>) => Promise<string>> = {
  "task.create": async (ctx, p) => {
    const t = await createTask(ctx, p as never);
    return `Created task #${t.number}`;
  },
  "doc.create": async (ctx, p) => {
    const d = await createDoc(ctx, p as never);
    return `Created document “${d.title}”`;
  },
};

export async function requestApproval(input: {
  workspaceId: string; requestedByType: "automation" | "agent"; requestedById: string; requestedByName: string; runId?: string;
  action: string; summary: string; payload: Record<string, unknown>; risk?: "low" | "medium" | "high";
}) {
  if (!EXECUTORS[input.action]) throw invalid(`Action ${input.action} cannot be requested.`);
  const [a] = await db.insert(approval).values({ ...input, risk: input.risk ?? "low", expiresAt: new Date(Date.now() + 7 * 86400000) }).returning();
  const approvers = await membersWithCapability(input.workspaceId, "approval.decide");
  await notify(input.workspaceId, approvers, {
    kind: "approval", severity: input.risk === "high" ? "critical" : "warning", title: `Approval needed: ${input.summary}`,
    body: `Requested by ${input.requestedByType} “${input.requestedByName}”.`, href: undefined, sourceType: "approval", sourceId: a!.id, dedupeKey: `approval:${a!.id}`,
  });
  return a!;
}

export async function listApprovals(ctx: Ctx, status: "pending" | "all" = "pending") {
  assertCan(ctx, "automation.view");
  const where = [eq(approval.workspaceId, ctx.workspaceId)];
  if (status === "pending") where.push(eq(approval.status, "pending"));
  return db.select().from(approval).where(and(...where)).orderBy(desc(approval.createdAt)).limit(100);
}

/** A human decision. Approved actions execute with the approver's permissions, re-checked now. */
export async function decideApproval(ctx: Ctx, id: string, approve: boolean) {
  assertCan(ctx, "approval.decide");
  const [a] = await db.select().from(approval).where(and(eq(approval.id, id), eq(approval.workspaceId, ctx.workspaceId)));
  if (!a) throw notFound("Approval");
  if (a.status !== "pending") throw invalid(`Already ${a.status}.`);
  if (a.expiresAt < new Date()) {
    await db.update(approval).set({ status: "expired" }).where(eq(approval.id, id));
    throw invalid("This approval request expired.");
  }
  let status: "approved" | "rejected" | "failed" = approve ? "approved" : "rejected";
  let result = approve ? "" : "Rejected";
  if (approve) {
    try {
      result = await EXECUTORS[a.action]!({ ...ctx, actor: a.requestedByType === "agent" ? "agent" : "system" }, a.payload);
    } catch (e) {
      status = "failed";
      result = e instanceof Error ? e.message : "Execution failed";
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(approval).set({ status, decidedBy: ctx.userId, decidedAt: new Date(), result }).where(eq(approval.id, id));
    await recordAudit(tx, ctx, { action: `approval.${status}`, targetType: "approval", targetId: id, targetLabel: a.summary, changes: { result: { from: null, to: result } } });
    await tx.update(inboxItem).set({ resolvedAt: new Date() }).where(and(eq(inboxItem.workspaceId, ctx.workspaceId), eq(inboxItem.sourceId, id)));
  });
  return { status, result };
}
