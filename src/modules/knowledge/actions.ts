"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function createDocAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await withCtx(slug, async (ctx) => {
    const d = await svc.createDoc(ctx, formObject(fd) as never);
    id = d.id;
  });
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/docs/${id}?edit=1`);
  }
  return res;
}

export async function updateDocAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.updateDoc(ctx, id, formObject(fd) as never);
  });
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/docs/${id}`);
  }
  return res;
}

export async function deleteDocAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteDoc(ctx, id));
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/docs`);
  }
  return res;
}
