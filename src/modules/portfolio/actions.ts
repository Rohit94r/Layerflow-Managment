"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function createProductAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let productSlug = "";
  const res = await withCtx(slug, async (ctx) => {
    const p = await svc.createProduct(ctx, formObject(fd) as never);
    productSlug = p.slug;
  });
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/products/${productSlug}`);
  }
  return res;
}

export async function updateProductAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const obj = formObject(fd);
  // Checkbox-style multi selects arrive missing when empty.
  let newSlug: string | null = null;
  const res = await withCtx(slug, async (ctx) => {
    const before = obj.currentSlug;
    delete obj.currentSlug;
    const p = await svc.updateProduct(ctx, id, obj as never);
    if (p.slug !== before) newSlug = p.slug;
    return { ok: true, message: "Saved." };
  });
  refresh(slug);
  if (res.ok && newSlug) redirect(`/w/${slug}/products/${newSlug}/settings`);
  return res;
}

/** Inline single-field updates (classification pickers). */
export async function patchProductAction(slug: string, id: string, field: string, value: string) {
  const allowed = new Set(["lifecycle", "priority", "focus", "health", "role", "ownerId", "groupId"]);
  if (!allowed.has(field)) return { ok: false, error: "Field can't be edited inline." } as ActionResult;
  const res = await withCtx(slug, (ctx) => svc.updateProduct(ctx, id, { [field]: value } as never).then(() => undefined));
  refresh(slug);
  return res;
}

export async function setArchivedAction(slug: string, id: string, archived: boolean) {
  const res = await withCtx(slug, (ctx) => svc.setArchived(ctx, id, archived));
  refresh(slug);
  return res;
}

export async function togglePinAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.togglePin(ctx, id));
  refresh(slug);
  return res;
}

export async function deleteProductAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteProduct(ctx, id));
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/products?view=archived`);
  }
  return res;
}

export async function bulkUpdateAction(slug: string, ids: string[], patch: Record<string, string>) {
  const res = await withCtx(slug, async (ctx) => {
    const n = await svc.bulkUpdate(ctx, ids, patch);
    return { ok: true, message: `Updated ${n} project${n === 1 ? "" : "s"}.` };
  });
  refresh(slug);
  return res;
}

export async function addLinkAction(slug: string, productId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, (ctx) => svc.addLink(ctx, productId, formObject(fd) as never));
  refresh(slug);
  return res;
}

export async function removeLinkAction(slug: string, linkId: string) {
  const res = await withCtx(slug, (ctx) => svc.removeLink(ctx, linkId));
  refresh(slug);
  return res;
}

export async function createGroupAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, (ctx) => svc.createGroup(ctx, String(fd.get("name") ?? "")));
  refresh(slug);
  return res;
}

export async function deleteGroupAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteGroup(ctx, id));
  refresh(slug);
  return res;
}
