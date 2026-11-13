import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, lte, gte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { conflict, invalid, notFound } from "../../lib/errors";
import { addDays, slugify, today } from "../../lib/format";
import { diff, recordAudit } from "../audit/service";
import { isMember } from "../identity/service";
import { user } from "../identity/schema";
import { task } from "../work/schema";
import { expense } from "../finance/schema";
import { OPEN_STATUSES } from "../work/constants";
import {
  FOCUSES, HEALTHS, LIFECYCLES, LINK_KINDS, PRIORITIES, PRODUCT_ROLES, PRODUCT_TYPES,
  type Focus, type Health, type Lifecycle, type Priority, type ProductRole,
} from "./constants";
import { product, productGroup, productLink } from "./schema";

/* ---------------- Validation ---------------- */

const optionalId = z.string().trim().optional().transform((v) => v || null);
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD.");
const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    const arr = Array.isArray(v) ? v : (v ?? "").split(",");
    return [...new Set(arr.map((s) => s.trim()).filter(Boolean))].slice(0, 30);
  });

export const productInput = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  slug: z.string().trim().optional(),
  summary: z.string().trim().max(200).default(""),
  description: z.string().trim().max(5000).default(""),
  type: z.enum(PRODUCT_TYPES).default("saas"),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1F3BD1.").default("#1F3BD1"),
  role: z.enum(PRODUCT_ROLES).default("secondary"),
  lifecycle: z.enum(LIFECYCLES).default("idea"),
  priority: z.enum(PRIORITIES).default("p2"),
  focus: z.enum(FOCUSES).default("none"),
  health: z.enum(HEALTHS).default("unknown"),
  healthReason: z.string().trim().max(500).default(""),
  ownerId: optionalId,
  groupId: optionalId,
  parentId: optionalId,
  businessModel: z.string().trim().max(200).default(""),
  targetAudience: z.string().trim().max(300).default(""),
  strategicObjective: z.string().trim().max(500).default(""),
  techStack: list,
  tags: list,
  launchDate: optionalDate,
  nextReviewDate: optionalDate,
});
export type ProductInput = z.input<typeof productInput>;

export const productPatch = productInput.partial();

/** Cross-tenant guard: every referenced id must belong to this workspace. */
async function assertRefs(ctx: Ctx, refs: { ownerId?: string | null; groupId?: string | null; parentId?: string | null }, selfId?: string) {
  if (refs.ownerId && !(await isMember(ctx.workspaceId, refs.ownerId))) throw invalid("Owner must be a workspace member.", { ownerId: "Not a member." });
  if (refs.groupId) {
    const [g] = await db.select({ id: productGroup.id }).from(productGroup).where(and(eq(productGroup.id, refs.groupId), eq(productGroup.workspaceId, ctx.workspaceId)));
    if (!g) throw invalid("Unknown group.", { groupId: "Unknown group." });
  }
  if (refs.parentId) {
    if (refs.parentId === selfId) throw invalid("A product can't be its own parent.", { parentId: "Pick another product." });
    const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, refs.parentId), eq(product.workspaceId, ctx.workspaceId)));
    if (!p) throw invalid("Unknown parent product.", { parentId: "Unknown product." });
  }
}

async function uniqueProductSlug(ctx: Ctx, base: string, excludeId?: string) {
  let candidate = base || "product";
  for (let i = 2; i < 200; i++) {
    const where = [eq(product.workspaceId, ctx.workspaceId), eq(product.slug, candidate)];
    if (excludeId) where.push(ne(product.id, excludeId));
    const [hit] = await db.select({ id: product.id }).from(product).where(and(...where)).limit(1);
    if (!hit) return candidate;
    candidate = `${base}-${i}`;
  }
  throw conflict("Could not find a free product address.");
}

/* ---------------- Queries ---------------- */

export type ProductFilters = {
  q?: string;
  lifecycle?: Lifecycle;
  role?: ProductRole;
  priority?: Priority;
  focus?: Focus;
  health?: Health;
  groupId?: string;
  archived?: boolean;
  sort?: "name" | "priority" | "updated" | "lifecycle";
};

export async function listProducts(ctx: Ctx, f: ProductFilters = {}) {
  assertCan(ctx, "product.view");
  const where = [eq(product.workspaceId, ctx.workspaceId), f.archived ? isNotNull(product.archivedAt) : isNull(product.archivedAt)];
  if (f.q) where.push(or(ilike(product.name, `%${f.q}%`), ilike(product.summary, `%${f.q}%`), sql`${f.q.toLowerCase()} = any(${product.tags})`)!);
  if (f.lifecycle) where.push(eq(product.lifecycle, f.lifecycle));
  if (f.role) where.push(eq(product.role, f.role));
  if (f.priority) where.push(eq(product.priority, f.priority));
  if (f.focus) where.push(eq(product.focus, f.focus));
  if (f.health) where.push(eq(product.health, f.health));
  if (f.groupId) where.push(eq(product.groupId, f.groupId));

  const order =
    f.sort === "name" ? [asc(product.name)]
    : f.sort === "updated" ? [desc(product.updatedAt)]
    : f.sort === "lifecycle" ? [asc(product.lifecycle), asc(product.name)]
    : [desc(product.pinned), asc(product.priority), asc(product.name)];

  return db
    .select({
      id: product.id, name: product.name, slug: product.slug, summary: product.summary, type: product.type,
      brandColor: product.brandColor, role: product.role, lifecycle: product.lifecycle, priority: product.priority,
      focus: product.focus, health: product.health, healthReason: product.healthReason, pinned: product.pinned,
      tags: product.tags, ownerId: product.ownerId, ownerName: user.name, groupId: product.groupId, groupName: productGroup.name,
      nextReviewDate: product.nextReviewDate, updatedAt: product.updatedAt, archivedAt: product.archivedAt,
    })
    .from(product)
    .leftJoin(user, eq(user.id, product.ownerId))
    .leftJoin(productGroup, eq(productGroup.id, product.groupId))
    .where(and(...where))
    .orderBy(...order)
    .limit(500);
}
export type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

export async function getProductBySlug(ctx: Ctx, slug: string) {
  assertCan(ctx, "product.view");
  const [row] = await db
    .select({ p: product, ownerName: user.name, groupName: productGroup.name })
    .from(product)
    .leftJoin(user, eq(user.id, product.ownerId))
    .leftJoin(productGroup, eq(productGroup.id, product.groupId))
    .where(and(eq(product.workspaceId, ctx.workspaceId), eq(product.slug, slug)))
    .limit(1);
  if (!row) return null;
  const [links, children, parent] = await Promise.all([
    db.select().from(productLink).where(and(eq(productLink.workspaceId, ctx.workspaceId), eq(productLink.productId, row.p.id))).orderBy(asc(productLink.createdAt)),
    db.select({ id: product.id, name: product.name, slug: product.slug, lifecycle: product.lifecycle }).from(product)
      .where(and(eq(product.workspaceId, ctx.workspaceId), eq(product.parentId, row.p.id))),
    row.p.parentId
      ? db.select({ name: product.name, slug: product.slug }).from(product).where(and(eq(product.workspaceId, ctx.workspaceId), eq(product.id, row.p.parentId))).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { ...row.p, ownerName: row.ownerName, groupName: row.groupName, links, children, parent };
}
export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

async function getOwned(ctx: Ctx, id: string) {
  const [p] = await db.select().from(product).where(and(eq(product.id, id), eq(product.workspaceId, ctx.workspaceId))).limit(1);
  if (!p) throw notFound("Product");
  return p;
}

/** Minimal list for pickers and the sidebar. */
export async function productOptions(ctx: Ctx) {
  return db
    .select({ id: product.id, name: product.name, slug: product.slug, brandColor: product.brandColor, pinned: product.pinned })
    .from(product)
    .where(and(eq(product.workspaceId, ctx.workspaceId), isNull(product.archivedAt)))
    .orderBy(desc(product.pinned), asc(product.name));
}

/* ---------------- Mutations ---------------- */

export async function createProduct(ctx: Ctx, raw: ProductInput) {
  assertCan(ctx, "product.create");
  const input = productInput.parse(raw);
  await assertRefs(ctx, input);
  const slug = await uniqueProductSlug(ctx, slugify(input.slug || input.name));
  return db.transaction(async (tx) => {
    const [p] = await tx
      .insert(product)
      .values({
        ...input,
        slug,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        ownerId: input.ownerId ?? ctx.userId,
        healthUpdatedAt: input.health !== "unknown" ? new Date() : null,
      })
      .returning();
    await recordAudit(tx, ctx, { action: "product.created", targetType: "product", targetId: p!.id, targetLabel: p!.name, productId: p!.id });
    return p!;
  });
}

export async function updateProduct(ctx: Ctx, id: string, raw: z.input<typeof productPatch>) {
  assertCan(ctx, "product.edit");
  const before = await getOwned(ctx, id);
  const patch = productPatch.parse(raw);
  await assertRefs(ctx, patch, id);
  const values: Partial<typeof product.$inferInsert> = { ...patch };
  delete values.slug;
  if (patch.slug !== undefined && slugify(patch.slug) && slugify(patch.slug) !== before.slug) {
    values.slug = await uniqueProductSlug(ctx, slugify(patch.slug), id);
  }
  if ((patch.health && patch.health !== before.health) || (patch.healthReason !== undefined && patch.healthReason !== before.healthReason)) {
    values.healthUpdatedAt = new Date();
  }
  const changes = diff(before as Record<string, unknown>, values as Record<string, unknown>);
  delete changes.healthUpdatedAt;
  if (!Object.keys(changes).length) return before;
  return db.transaction(async (tx) => {
    const [p] = await tx.update(product).set({ ...values, updatedAt: new Date() }).where(eq(product.id, id)).returning();
    await recordAudit(tx, ctx, { action: "product.updated", targetType: "product", targetId: id, targetLabel: p!.name, productId: id, changes });
    return p!;
  });
}

export async function setArchived(ctx: Ctx, id: string, archived: boolean) {
  assertCan(ctx, "product.archive");
  const p = await getOwned(ctx, id);
  await db.transaction(async (tx) => {
    await tx.update(product).set({ archivedAt: archived ? new Date() : null, pinned: archived ? false : p.pinned, updatedAt: new Date() }).where(eq(product.id, id));
    await recordAudit(tx, ctx, { action: archived ? "product.archived" : "product.restored", targetType: "product", targetId: id, targetLabel: p.name, productId: id });
  });
}

export async function togglePin(ctx: Ctx, id: string) {
  assertCan(ctx, "product.edit");
  const p = await getOwned(ctx, id);
  await db.update(product).set({ pinned: !p.pinned }).where(eq(product.id, id));
}

export async function deleteProduct(ctx: Ctx, id: string) {
  assertCan(ctx, "product.delete");
  const p = await getOwned(ctx, id);
  if (!p.archivedAt) throw invalid("Archive the product before deleting it.");
  await db.transaction(async (tx) => {
    await tx.delete(product).where(eq(product.id, id));
    await recordAudit(tx, ctx, { action: "product.deleted", targetType: "product", targetId: id, targetLabel: p.name });
  });
}

const bulkPatch = z.object({
  lifecycle: z.enum(LIFECYCLES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  focus: z.enum(FOCUSES).optional(),
  groupId: z.string().optional().transform((v) => (v === "" ? null : v)),
});

export async function bulkUpdate(ctx: Ctx, ids: string[], raw: z.input<typeof bulkPatch>) {
  assertCan(ctx, "product.edit");
  const patch = Object.fromEntries(Object.entries(bulkPatch.parse(raw)).filter(([, v]) => v !== undefined));
  if (!ids.length || !Object.keys(patch).length) return 0;
  await assertRefs(ctx, { groupId: (patch.groupId as string | null) ?? null });
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(product)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(product.workspaceId, ctx.workspaceId), inArray(product.id, ids.slice(0, 200))))
      .returning({ id: product.id, name: product.name });
    for (const r of rows) {
      await recordAudit(tx, ctx, { action: "product.updated", targetType: "product", targetId: r.id, targetLabel: r.name, productId: r.id, changes: Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, { from: "(bulk)", to: v }])) });
    }
    return rows.length;
  });
}

/* ---------------- Links ---------------- */

export const linkInput = z.object({
  kind: z.enum(LINK_KINDS),
  label: z.string().trim().max(60).default(""),
  url: z.url("Enter a full URL starting with https://").refine((u) => /^https?:\/\//i.test(u), "Only http(s) links."),
});

export async function addLink(ctx: Ctx, productId: string, raw: z.input<typeof linkInput>) {
  assertCan(ctx, "product.edit");
  const p = await getOwned(ctx, productId);
  const input = linkInput.parse(raw);
  await db.transaction(async (tx) => {
    await tx.insert(productLink).values({ ...input, productId, workspaceId: ctx.workspaceId });
    await recordAudit(tx, ctx, { action: "product.link_added", targetType: "product", targetId: productId, targetLabel: `${p.name}: ${input.url}`, productId });
  });
}

export async function removeLink(ctx: Ctx, linkId: string) {
  assertCan(ctx, "product.edit");
  await db.transaction(async (tx) => {
    const [l] = await tx.delete(productLink).where(and(eq(productLink.id, linkId), eq(productLink.workspaceId, ctx.workspaceId))).returning();
    if (!l) throw notFound("Link");
    await recordAudit(tx, ctx, { action: "product.link_removed", targetType: "product", targetId: l.productId, targetLabel: l.url, productId: l.productId });
  });
}

/* ---------------- Groups ---------------- */

export async function listGroups(ctx: Ctx) {
  return db
    .select({ id: productGroup.id, name: productGroup.name, products: count(product.id) })
    .from(productGroup)
    .leftJoin(product, and(eq(product.groupId, productGroup.id), isNull(product.archivedAt)))
    .where(eq(productGroup.workspaceId, ctx.workspaceId))
    .groupBy(productGroup.id)
    .orderBy(asc(productGroup.name));
}

export async function createGroup(ctx: Ctx, name: string) {
  assertCan(ctx, "product.edit");
  const clean = z.string().trim().min(1, "Group name is required.").max(40).parse(name);
  const [hit] = await db.select({ id: productGroup.id }).from(productGroup).where(and(eq(productGroup.workspaceId, ctx.workspaceId), eq(productGroup.name, clean)));
  if (hit) throw conflict("A group with that name exists.");
  await db.transaction(async (tx) => {
    const [g] = await tx.insert(productGroup).values({ workspaceId: ctx.workspaceId, name: clean }).returning();
    await recordAudit(tx, ctx, { action: "group.created", targetType: "group", targetId: g!.id, targetLabel: clean });
  });
}

export async function deleteGroup(ctx: Ctx, id: string) {
  assertCan(ctx, "product.edit");
  await db.transaction(async (tx) => {
    const [g] = await tx.delete(productGroup).where(and(eq(productGroup.id, id), eq(productGroup.workspaceId, ctx.workspaceId))).returning();
    if (!g) throw notFound("Group");
    await recordAudit(tx, ctx, { action: "group.deleted", targetType: "group", targetId: id, targetLabel: g.name });
  });
}

/* ---------------- Attention signals ---------------- */

export type Signal = { kind: string; label: string; severity: "high" | "medium" | "low" };

/**
 * Explainable, rule-based reasons a product needs attention. Each signal comes from a
 * record the user can open; nothing is inferred from missing data.
 */
export async function attentionSignals(ctx: Ctx) {
  const t = today();
  const soon = addDays(t, 14);
  const [products, overdue, urgentBugs, renewals] = await Promise.all([
    db.select({ id: product.id, ownerId: product.ownerId, health: product.health, healthReason: product.healthReason, lifecycle: product.lifecycle, nextReviewDate: product.nextReviewDate })
      .from(product).where(and(eq(product.workspaceId, ctx.workspaceId), isNull(product.archivedAt))),
    db.select({ productId: task.productId, n: count() }).from(task)
      .where(and(eq(task.workspaceId, ctx.workspaceId), inArray(task.status, OPEN_STATUSES), lt(task.dueDate, t), isNotNull(task.productId)))
      .groupBy(task.productId),
    db.select({ productId: task.productId, n: count() }).from(task)
      .where(and(eq(task.workspaceId, ctx.workspaceId), inArray(task.status, OPEN_STATUSES), eq(task.type, "bug"), inArray(task.priority, ["urgent", "high"]), isNotNull(task.productId)))
      .groupBy(task.productId),
    db.select({ productId: expense.productId, n: count() }).from(expense)
      .where(and(eq(expense.workspaceId, ctx.workspaceId), eq(expense.status, "active"), gte(expense.nextRenewalDate, t), lte(expense.nextRenewalDate, soon), isNotNull(expense.productId)))
      .groupBy(expense.productId),
  ]);

  const map = new Map<string, Signal[]>();
  const push = (id: string | null, s: Signal) => {
    if (!id) return;
    map.set(id, [...(map.get(id) ?? []), s]);
  };
  for (const p of products) {
    if (p.health === "critical") push(p.id, { kind: "health", label: `Marked critical${p.healthReason ? `: ${p.healthReason}` : ""}`, severity: "high" });
    else if (p.health === "at_risk") push(p.id, { kind: "health", label: `Marked at risk${p.healthReason ? `: ${p.healthReason}` : ""}`, severity: "medium" });
    if (!p.ownerId) push(p.id, { kind: "owner", label: "No owner assigned", severity: "medium" });
    if (p.nextReviewDate && p.nextReviewDate < t) push(p.id, { kind: "review", label: "Review date has passed", severity: "low" });
    if (p.health === "unknown" && ["live", "growth"].includes(p.lifecycle)) push(p.id, { kind: "health", label: "Live product with no health assessment", severity: "low" });
  }
  for (const r of overdue) push(r.productId, { kind: "overdue", label: `${r.n} overdue task${r.n === 1 ? "" : "s"}`, severity: "high" });
  for (const r of urgentBugs) push(r.productId, { kind: "bugs", label: `${r.n} open high-priority bug${r.n === 1 ? "" : "s"}`, severity: "high" });
  for (const r of renewals) push(r.productId, { kind: "renewal", label: `${r.n} renewal${r.n === 1 ? "" : "s"} in the next 14 days`, severity: "low" });
  return map;
}
