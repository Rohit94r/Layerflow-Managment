import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../server/db";
import { can, type Ctx } from "../../server/permissions";
import { product } from "../portfolio/schema";
import { task } from "../work/schema";
import { document } from "../knowledge/schema";

export type SearchHit = { type: "product" | "task" | "doc"; id: string; title: string; subtitle: string; href: string };

/** Permission-aware search: each result type is included only if the caller can view it. */
export async function search(ctx: Ctx, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim().slice(0, 100);
  if (!q) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const base = `/w/${ctx.workspaceSlug}`;
  const n = Number(q.replace(/^#/, ""));

  const [products, tasks, docs] = await Promise.all([
    can(ctx, "product.view")
      ? db.select({ id: product.id, name: product.name, slug: product.slug, summary: product.summary }).from(product)
          .where(and(eq(product.workspaceId, ctx.workspaceId), or(ilike(product.name, like), ilike(product.summary, like))))
          .orderBy(desc(product.updatedAt)).limit(6)
      : [],
    can(ctx, "work.view")
      ? db.select({ id: task.id, number: task.number, title: task.title, status: task.status }).from(task)
          .where(and(eq(task.workspaceId, ctx.workspaceId), Number.isInteger(n) && n > 0 ? or(eq(task.number, n), ilike(task.title, like)) : ilike(task.title, like)))
          .orderBy(desc(task.updatedAt)).limit(8)
      : [],
    can(ctx, "docs.view")
      ? db.select({ id: document.id, title: document.title, kind: document.kind }).from(document)
          .where(and(eq(document.workspaceId, ctx.workspaceId), or(ilike(document.title, like), ilike(document.body, like))))
          .orderBy(desc(document.updatedAt)).limit(6)
      : [],
  ]);

  return [
    ...products.map((p) => ({ type: "product" as const, id: p.id, title: p.name, subtitle: p.summary || "Product", href: `${base}/products/${p.slug}` })),
    ...tasks.map((t) => ({ type: "task" as const, id: t.id, title: `#${t.number} ${t.title}`, subtitle: t.status.replace("_", " "), href: `${base}/work/${t.number}` })),
    ...docs.map((d) => ({ type: "doc" as const, id: d.id, title: d.title, subtitle: d.kind, href: `${base}/docs/${d.id}` })),
  ];
}
