import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { invalid, notFound } from "../../lib/errors";
import { toMinor } from "../../lib/format";
import { recordAudit } from "../audit/service";
import { user } from "../identity/schema";
import { product } from "../portfolio/schema";
import { budget, goal, roadmapItem } from "./schema";

const optId = z.string().optional().nullable().transform((v) => v || null);
const optDate = z.string().optional().nullable().transform((v) => v || null).refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD.");

async function assertProduct(ctx: Ctx, id: string | null | undefined) {
  if (!id) return;
  const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, id), eq(product.workspaceId, ctx.workspaceId)));
  if (!p) throw invalid("Unknown product.");
}

/* ---------------- Roadmap ---------------- */

const itemInput = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(3000).default(""),
  horizon: z.enum(["now", "next", "later", "done"]).default("next"),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
  productId: optId,
  targetDate: optDate,
});

export async function listRoadmap(ctx: Ctx, productId?: string) {
  assertCan(ctx, "planning.view");
  const where = [eq(roadmapItem.workspaceId, ctx.workspaceId)];
  if (productId) where.push(eq(roadmapItem.productId, productId));
  return db.select({ r: roadmapItem, productName: product.name, productSlug: product.slug, productColor: product.brandColor })
    .from(roadmapItem).leftJoin(product, eq(product.id, roadmapItem.productId))
    .where(and(...where)).orderBy(asc(roadmapItem.sortOrder), asc(roadmapItem.createdAt))
    .then((rows) => rows.map((x) => ({ ...x.r, productName: x.productName, productSlug: x.productSlug, productColor: x.productColor })));
}

export async function createRoadmapItem(ctx: Ctx, raw: z.input<typeof itemInput>) {
  assertCan(ctx, "planning.edit");
  const i = itemInput.parse(raw);
  await assertProduct(ctx, i.productId);
  await db.transaction(async (tx) => {
    const [r] = await tx.insert(roadmapItem).values({ ...i, workspaceId: ctx.workspaceId, ownerId: ctx.userId }).returning();
    await recordAudit(tx, ctx, { action: "roadmap.item_created", targetType: "roadmap", targetId: r!.id, targetLabel: `${r!.title} (${r!.horizon})`, productId: r!.productId });
  });
}

export async function moveRoadmapItem(ctx: Ctx, id: string, horizon: "now" | "next" | "later" | "done") {
  assertCan(ctx, "planning.edit");
  await db.transaction(async (tx) => {
    const [r] = await tx.select().from(roadmapItem).where(and(eq(roadmapItem.id, id), eq(roadmapItem.workspaceId, ctx.workspaceId)));
    if (!r) throw notFound("Roadmap item");
    await tx.update(roadmapItem).set({ horizon, updatedAt: new Date() }).where(eq(roadmapItem.id, id));
    await recordAudit(tx, ctx, { action: "roadmap.item_moved", targetType: "roadmap", targetId: id, targetLabel: r.title, productId: r.productId, changes: { horizon: { from: r.horizon, to: horizon } } });
  });
}

export async function deleteRoadmapItem(ctx: Ctx, id: string) {
  assertCan(ctx, "planning.edit");
  await db.transaction(async (tx) => {
    const [r] = await tx.delete(roadmapItem).where(and(eq(roadmapItem.id, id), eq(roadmapItem.workspaceId, ctx.workspaceId))).returning();
    if (!r) throw notFound("Roadmap item");
    await recordAudit(tx, ctx, { action: "roadmap.item_deleted", targetType: "roadmap", targetId: id, targetLabel: r.title, productId: r.productId });
  });
}

/* ---------------- Goals ---------------- */

const num = z.union([z.string(), z.number()]).transform((v) => Number(v)).refine((n) => Number.isFinite(n), "Enter a number.");
const goalInput = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  metric: z.string().trim().min(1, "Metric is required.").max(100),
  unit: z.string().trim().max(20).default(""),
  startValue: num.default(0),
  targetValue: num,
  currentValue: num.default(0),
  dueDate: optDate,
  productId: optId,
});

export function goalProgress(g: { startValue: number; targetValue: number; currentValue: number }) {
  const span = g.targetValue - g.startValue;
  if (!span) return g.currentValue >= g.targetValue ? 1 : 0;
  return Math.max(0, Math.min(1, (g.currentValue - g.startValue) / span));
}

/** Status is derived from progress vs elapsed time, so it is explainable. */
function deriveStatus(g: { startValue: number; targetValue: number; currentValue: number; dueDate: string | null; createdAt?: Date }) {
  const p = goalProgress(g);
  if (p >= 1) return "achieved" as const;
  if (!g.dueDate) return p > 0 ? ("on_track" as const) : ("at_risk" as const);
  const start = (g.createdAt ?? new Date()).getTime();
  const end = new Date(`${g.dueDate}T23:59:59Z`).getTime();
  if (Date.now() > end) return "missed" as const;
  const elapsed = Math.max(0, Math.min(1, (Date.now() - start) / Math.max(1, end - start)));
  if (p >= elapsed - 0.1) return "on_track" as const;
  return p >= elapsed - 0.3 ? ("at_risk" as const) : ("off_track" as const);
}

export async function listGoals(ctx: Ctx, productId?: string) {
  assertCan(ctx, "planning.view");
  const where = [eq(goal.workspaceId, ctx.workspaceId)];
  if (productId) where.push(eq(goal.productId, productId));
  return db.select({ g: goal, productName: product.name, productSlug: product.slug, ownerName: user.name })
    .from(goal).leftJoin(product, eq(product.id, goal.productId)).leftJoin(user, eq(user.id, goal.ownerId))
    .where(and(...where)).orderBy(asc(goal.dueDate))
    .then((rows) => rows.map((x) => ({ ...x.g, productName: x.productName, productSlug: x.productSlug, ownerName: x.ownerName, progress: goalProgress(x.g) })));
}

export async function createGoal(ctx: Ctx, raw: z.input<typeof goalInput>) {
  assertCan(ctx, "planning.edit");
  const i = goalInput.parse(raw);
  await assertProduct(ctx, i.productId);
  await db.transaction(async (tx) => {
    const [g] = await tx.insert(goal).values({ ...i, workspaceId: ctx.workspaceId, ownerId: ctx.userId, status: deriveStatus(i), lastCheckInAt: new Date() }).returning();
    await recordAudit(tx, ctx, { action: "goal.created", targetType: "goal", targetId: g!.id, targetLabel: g!.title, productId: g!.productId });
  });
}

export async function checkInGoal(ctx: Ctx, id: string, value: number) {
  assertCan(ctx, "planning.edit");
  if (!Number.isFinite(value)) throw invalid("Enter a number.");
  await db.transaction(async (tx) => {
    const [g] = await tx.select().from(goal).where(and(eq(goal.id, id), eq(goal.workspaceId, ctx.workspaceId)));
    if (!g) throw notFound("Goal");
    const status = deriveStatus({ ...g, currentValue: value });
    await tx.update(goal).set({ currentValue: value, status, lastCheckInAt: new Date(), updatedAt: new Date() }).where(eq(goal.id, id));
    await recordAudit(tx, ctx, { action: "goal.checked_in", targetType: "goal", targetId: id, targetLabel: g.title, productId: g.productId, changes: { current: { from: g.currentValue, to: value }, status: { from: g.status, to: status } } });
  });
}

export async function deleteGoal(ctx: Ctx, id: string) {
  assertCan(ctx, "planning.edit");
  await db.transaction(async (tx) => {
    const [g] = await tx.delete(goal).where(and(eq(goal.id, id), eq(goal.workspaceId, ctx.workspaceId))).returning();
    if (!g) throw notFound("Goal");
    await recordAudit(tx, ctx, { action: "goal.deleted", targetType: "goal", targetId: id, targetLabel: g.title, productId: g.productId });
  });
}

/* ---------------- Budgets ---------------- */

export async function listBudgets(ctx: Ctx) {
  assertCan(ctx, "finance.view");
  return db.select({ b: budget, productName: product.name }).from(budget).leftJoin(product, eq(product.id, budget.productId))
    .where(eq(budget.workspaceId, ctx.workspaceId)).then((r) => r.map((x) => ({ ...x.b, productName: x.productName })));
}

export async function setBudget(ctx: Ctx, raw: { productId?: string; amount: string; currency: string }) {
  assertCan(ctx, "finance.edit");
  const productId = raw.productId || null;
  await assertProduct(ctx, productId);
  const currency = raw.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw invalid("Use a 3-letter currency code.");
  const amount = toMinor(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw invalid("Enter a positive monthly amount.");
  await db.transaction(async (tx) => {
    await tx.delete(budget).where(and(eq(budget.workspaceId, ctx.workspaceId), productId ? eq(budget.productId, productId) : isNull(budget.productId), eq(budget.currency, currency)));
    await tx.insert(budget).values({ workspaceId: ctx.workspaceId, productId, monthlyAmountMinor: amount, currency });
    await recordAudit(tx, ctx, { action: "budget.set", targetType: "budget", targetLabel: `${currency} ${raw.amount}/mo`, productId });
  });
}

export async function deleteBudget(ctx: Ctx, id: string) {
  assertCan(ctx, "finance.edit");
  await db.delete(budget).where(and(eq(budget.id, id), eq(budget.workspaceId, ctx.workspaceId)));
}
