import { and, desc, eq, lt } from "drizzle-orm";
import { db, type Tx } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { user } from "../identity/schema";
import { auditEvent, type ActorType } from "./schema";

type AuditInput = {
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string;
  productId?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  actorType?: ActorType;
};

/** Writes an audit event inside the caller's transaction so it commits atomically with the change. */
export async function recordAudit(tx: Tx, ctx: Pick<Ctx, "workspaceId" | "userId">, e: AuditInput) {
  await tx.insert(auditEvent).values({
    workspaceId: ctx.workspaceId,
    actorId: ctx.userId,
    actorType: e.actorType ?? "human",
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId ?? null,
    targetLabel: e.targetLabel ?? "",
    productId: e.productId ?? null,
    changes: e.changes && Object.keys(e.changes).length ? e.changes : null,
  });
}

/** Field-level diff for the audit log. Only keys present in `patch` are compared. */
export function diff<T extends Record<string, unknown>>(before: T, patch: Partial<T>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const a = before[key];
    const b = patch[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[key as string] = { from: a ?? null, to: b ?? null };
  }
  return out;
}

export async function listActivity(
  ctx: Ctx,
  opts: { productId?: string; targetId?: string; limit?: number; before?: Date } = {},
) {
  assertCan(ctx, "audit.view");
  const limit = Math.min(opts.limit ?? 50, 200);
  const where = [eq(auditEvent.workspaceId, ctx.workspaceId)];
  if (opts.productId) where.push(eq(auditEvent.productId, opts.productId));
  if (opts.targetId) where.push(eq(auditEvent.targetId, opts.targetId));
  if (opts.before) where.push(lt(auditEvent.createdAt, opts.before));
  const rows = await db
    .select({
      id: auditEvent.id,
      action: auditEvent.action,
      actorType: auditEvent.actorType,
      actorName: user.name,
      targetType: auditEvent.targetType,
      targetId: auditEvent.targetId,
      targetLabel: auditEvent.targetLabel,
      productId: auditEvent.productId,
      changes: auditEvent.changes,
      createdAt: auditEvent.createdAt,
    })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorId))
    .where(and(...where))
    .orderBy(desc(auditEvent.createdAt))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type ActivityItem = Awaited<ReturnType<typeof listActivity>>["items"][number];
