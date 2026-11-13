import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { invalid, notFound } from "../../lib/errors";
import { today } from "../../lib/format";
import { diff, recordAudit } from "../audit/service";
import { isMember } from "../identity/service";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";
import { OPEN_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, type TaskStatus, type TaskType } from "./constants";
import { task, taskComment } from "./schema";

const optionalId = z.string().trim().optional().nullable().transform((v) => v || null);
const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD.");

export const taskInput = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(10000).default(""),
  type: z.enum(TASK_TYPES).default("task"),
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(TASK_PRIORITIES).default("none"),
  productId: optionalId,
  assigneeId: optionalId,
  dueDate: optionalDate,
});
export const taskPatch = taskInput.partial();

async function assertRefs(ctx: Ctx, refs: { productId?: string | null; assigneeId?: string | null }) {
  if (refs.productId) {
    const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, refs.productId), eq(product.workspaceId, ctx.workspaceId)));
    if (!p) throw invalid("Unknown product.", { productId: "Unknown product." });
  }
  if (refs.assigneeId && !(await isMember(ctx.workspaceId, refs.assigneeId))) {
    throw invalid("Assignee must be a workspace member.", { assigneeId: "Not a member." });
  }
}

export type TaskFilters = {
  productId?: string;
  assigneeId?: string | "me" | "none";
  status?: TaskStatus | "open" | "all";
  type?: TaskType;
  q?: string;
  overdue?: boolean;
};

export async function listTasks(ctx: Ctx, f: TaskFilters = {}) {
  assertCan(ctx, "work.view");
  const where = [eq(task.workspaceId, ctx.workspaceId)];
  if (f.productId) where.push(eq(task.productId, f.productId));
  if (f.assigneeId === "me") where.push(eq(task.assigneeId, ctx.userId));
  else if (f.assigneeId === "none") where.push(isNull(task.assigneeId));
  else if (f.assigneeId) where.push(eq(task.assigneeId, f.assigneeId));
  if (!f.status || f.status === "open") where.push(inArray(task.status, OPEN_STATUSES));
  else if (f.status !== "all") where.push(eq(task.status, f.status));
  if (f.type) where.push(eq(task.type, f.type));
  if (f.overdue) where.push(lt(task.dueDate, today()));
  if (f.q) {
    const n = Number(f.q.replace(/^#/, ""));
    where.push(Number.isInteger(n) && n > 0 ? or(eq(task.number, n), ilike(task.title, `%${f.q}%`))! : ilike(task.title, `%${f.q}%`));
  }
  return db
    .select({
      id: task.id, number: task.number, title: task.title, type: task.type, status: task.status, priority: task.priority,
      dueDate: task.dueDate, assigneeId: task.assigneeId, assigneeName: user.name, productId: task.productId,
      productName: product.name, productSlug: product.slug, productColor: product.brandColor, updatedAt: task.updatedAt,
    })
    .from(task)
    .leftJoin(user, eq(user.id, task.assigneeId))
    .leftJoin(product, eq(product.id, task.productId))
    .where(and(...where))
    .orderBy(
      sql`case ${task.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`,
      sql`${task.dueDate} asc nulls last`,
      desc(task.number),
    )
    .limit(500);
}
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function getTask(ctx: Ctx, number: number) {
  assertCan(ctx, "work.view");
  const [row] = await db
    .select({ t: task, assigneeName: user.name, productName: product.name, productSlug: product.slug })
    .from(task)
    .leftJoin(user, eq(user.id, task.assigneeId))
    .leftJoin(product, eq(product.id, task.productId))
    .where(and(eq(task.workspaceId, ctx.workspaceId), eq(task.number, number)))
    .limit(1);
  if (!row) return null;
  const comments = await db
    .select({ id: taskComment.id, body: taskComment.body, createdAt: taskComment.createdAt, authorName: user.name, authorId: taskComment.authorId })
    .from(taskComment)
    .leftJoin(user, eq(user.id, taskComment.authorId))
    .where(and(eq(taskComment.workspaceId, ctx.workspaceId), eq(taskComment.taskId, row.t.id)))
    .orderBy(asc(taskComment.createdAt));
  return { ...row.t, assigneeName: row.assigneeName, productName: row.productName, productSlug: row.productSlug, comments };
}

async function getOwned(ctx: Ctx, id: string) {
  const [t] = await db.select().from(task).where(and(eq(task.id, id), eq(task.workspaceId, ctx.workspaceId))).limit(1);
  if (!t) throw notFound("Task");
  return t;
}

export async function createTask(ctx: Ctx, raw: z.input<typeof taskInput>) {
  assertCan(ctx, "work.edit");
  const input = taskInput.parse(raw);
  await assertRefs(ctx, input);
  return db.transaction(async (tx) => {
    // Per-workspace sequential numbers (#1, #2, …), allocated atomically.
    const [ws] = await tx
      .update(workspace)
      .set({ taskCounter: sql`${workspace.taskCounter} + 1` })
      .where(eq(workspace.id, ctx.workspaceId))
      .returning({ n: workspace.taskCounter });
    const [t] = await tx
      .insert(task)
      .values({
        ...input,
        number: ws!.n,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        completedAt: input.status === "done" ? new Date() : null,
      })
      .returning();
    await recordAudit(tx, ctx, { action: "task.created", targetType: "task", targetId: t!.id, targetLabel: `#${t!.number} ${t!.title}`, productId: t!.productId });
    return t!;
  });
}

export async function updateTask(ctx: Ctx, id: string, raw: z.input<typeof taskPatch>) {
  assertCan(ctx, "work.edit");
  const before = await getOwned(ctx, id);
  const patch = taskPatch.parse(raw);
  await assertRefs(ctx, patch);
  const values: Partial<typeof task.$inferInsert> = { ...patch };
  if (patch.status && patch.status !== before.status) {
    values.completedAt = patch.status === "done" ? new Date() : null;
  }
  const changes = diff(before as Record<string, unknown>, patch as Record<string, unknown>);
  if (!Object.keys(changes).length) return before;
  return db.transaction(async (tx) => {
    const [t] = await tx.update(task).set({ ...values, updatedAt: new Date() }).where(eq(task.id, id)).returning();
    await recordAudit(tx, ctx, {
      action: patch.status && patch.status !== before.status ? "task.status_changed" : "task.updated",
      targetType: "task", targetId: id, targetLabel: `#${t!.number} ${t!.title}`, productId: t!.productId, changes,
    });
    return t!;
  });
}

export async function deleteTask(ctx: Ctx, id: string) {
  assertCan(ctx, "work.edit");
  const t = await getOwned(ctx, id);
  await db.transaction(async (tx) => {
    await tx.delete(task).where(eq(task.id, id));
    await recordAudit(tx, ctx, { action: "task.deleted", targetType: "task", targetId: id, targetLabel: `#${t.number} ${t.title}`, productId: t.productId });
  });
}

export async function addComment(ctx: Ctx, taskId: string, body: string) {
  assertCan(ctx, "work.edit");
  const t = await getOwned(ctx, taskId);
  const clean = z.string().trim().min(1, "Write a comment first.").max(5000).parse(body);
  await db.transaction(async (tx) => {
    await tx.insert(taskComment).values({ workspaceId: ctx.workspaceId, taskId, authorId: ctx.userId, body: clean });
    await tx.update(task).set({ updatedAt: new Date() }).where(eq(task.id, taskId));
    await recordAudit(tx, ctx, { action: "task.commented", targetType: "task", targetId: taskId, targetLabel: `#${t.number} ${t.title}`, productId: t.productId });
  });
}

/** Counts used by product cards and the command center. */
export async function taskCountsByProduct(ctx: Ctx) {
  const rows = await db
    .select({
      productId: task.productId,
      open: sql<number>`count(*) filter (where ${task.status} in ('backlog','todo','in_progress','in_review'))`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${task.status} in ('backlog','todo','in_progress','in_review') and ${task.dueDate} < ${today()})`.mapWith(Number),
    })
    .from(task)
    .where(eq(task.workspaceId, ctx.workspaceId))
    .groupBy(task.productId);
  return new Map(rows.map((r) => [r.productId, r]));
}
