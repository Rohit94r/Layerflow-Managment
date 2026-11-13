import { and, desc, eq, ilike, isNotNull, lte, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { invalid, notFound } from "../../lib/errors";
import { today } from "../../lib/format";
import { diff, recordAudit } from "../audit/service";
import { user } from "../identity/schema";
import { product } from "../portfolio/schema";
import { DOC_KINDS, DOC_STATUSES, DOC_TEMPLATES, type DocKind } from "./constants";
import { document } from "./schema";

export const docInput = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  body: z.string().max(200000).default(""),
  kind: z.enum(DOC_KINDS).default("doc"),
  status: z.enum(DOC_STATUSES).default("draft"),
  productId: z.string().trim().optional().nullable().transform((v) => v || null),
  revisitDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD."),
});
export const docPatch = docInput.partial();

async function assertProduct(ctx: Ctx, productId: string | null | undefined) {
  if (!productId) return;
  const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, productId), eq(product.workspaceId, ctx.workspaceId)));
  if (!p) throw invalid("Unknown product.", { productId: "Unknown product." });
}

const editor = alias(user, "editor");

export async function listDocs(ctx: Ctx, f: { productId?: string; kind?: DocKind; q?: string } = {}) {
  assertCan(ctx, "docs.view");
  const where = [eq(document.workspaceId, ctx.workspaceId)];
  if (f.productId) where.push(eq(document.productId, f.productId));
  if (f.kind) where.push(eq(document.kind, f.kind));
  if (f.q) where.push(or(ilike(document.title, `%${f.q}%`), ilike(document.body, `%${f.q}%`))!);
  return db
    .select({
      id: document.id, title: document.title, kind: document.kind, status: document.status, revisitDate: document.revisitDate,
      productName: product.name, productSlug: product.slug, updatedAt: document.updatedAt, editorName: editor.name,
    })
    .from(document)
    .leftJoin(product, eq(product.id, document.productId))
    .leftJoin(editor, eq(editor.id, document.updatedBy))
    .where(and(...where))
    .orderBy(desc(document.updatedAt))
    .limit(300);
}

export async function getDoc(ctx: Ctx, id: string) {
  assertCan(ctx, "docs.view");
  const [row] = await db
    .select({ d: document, productName: product.name, productSlug: product.slug, editorName: editor.name })
    .from(document)
    .leftJoin(product, eq(product.id, document.productId))
    .leftJoin(editor, eq(editor.id, document.updatedBy))
    .where(and(eq(document.id, id), eq(document.workspaceId, ctx.workspaceId)))
    .limit(1);
  return row ? { ...row.d, productName: row.productName, productSlug: row.productSlug, editorName: row.editorName } : null;
}

export async function createDoc(ctx: Ctx, raw: z.input<typeof docInput>) {
  assertCan(ctx, "docs.edit");
  const input = docInput.parse(raw);
  await assertProduct(ctx, input.productId);
  const body = input.body || DOC_TEMPLATES[input.kind];
  return db.transaction(async (tx) => {
    const [d] = await tx
      .insert(document)
      .values({ ...input, body, workspaceId: ctx.workspaceId, createdBy: ctx.userId, updatedBy: ctx.userId })
      .returning();
    await recordAudit(tx, ctx, { action: "doc.created", targetType: "document", targetId: d!.id, targetLabel: d!.title, productId: d!.productId });
    return d!;
  });
}

export async function updateDoc(ctx: Ctx, id: string, raw: z.input<typeof docPatch>) {
  assertCan(ctx, "docs.edit");
  const [before] = await db.select().from(document).where(and(eq(document.id, id), eq(document.workspaceId, ctx.workspaceId)));
  if (!before) throw notFound("Document");
  const patch = docPatch.parse(raw);
  await assertProduct(ctx, patch.productId);
  const changes = diff(before as Record<string, unknown>, patch as Record<string, unknown>);
  if (changes.body) changes.body = { from: "(previous text)", to: "(edited)" };
  if (!Object.keys(changes).length) return before;
  return db.transaction(async (tx) => {
    const [d] = await tx.update(document).set({ ...patch, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(document.id, id)).returning();
    await recordAudit(tx, ctx, { action: "doc.updated", targetType: "document", targetId: id, targetLabel: d!.title, productId: d!.productId, changes });
    return d!;
  });
}

export async function deleteDoc(ctx: Ctx, id: string) {
  assertCan(ctx, "docs.edit");
  await db.transaction(async (tx) => {
    const [d] = await tx.delete(document).where(and(eq(document.id, id), eq(document.workspaceId, ctx.workspaceId))).returning();
    if (!d) throw notFound("Document");
    await recordAudit(tx, ctx, { action: "doc.deleted", targetType: "document", targetId: id, targetLabel: d.title, productId: d.productId });
  });
}

/** Decisions whose revisit date has arrived. */
export async function decisionsToRevisit(ctx: Ctx) {
  assertCan(ctx, "docs.view");
  return db
    .select({ id: document.id, title: document.title, revisitDate: document.revisitDate, productName: product.name })
    .from(document)
    .leftJoin(product, eq(product.id, document.productId))
    .where(and(eq(document.workspaceId, ctx.workspaceId), isNotNull(document.revisitDate), lte(document.revisitDate, today()), eq(document.status, "active")))
    .limit(10);
}
