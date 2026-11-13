"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function createTaskAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    const t = await svc.createTask(ctx, formObject(fd) as never);
    return { ok: true, message: `Created #${t.number}.`, data: { number: t.number } };
  });
  refresh(slug);
  return res;
}

export async function updateTaskAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.updateTask(ctx, id, formObject(fd) as never);
    return { ok: true, message: "Saved." };
  });
  refresh(slug);
  return res;
}

export async function patchTaskAction(slug: string, id: string, field: "status" | "priority" | "assigneeId" | "productId" | "dueDate" | "type", value: string) {
  const res = await withCtx(slug, (ctx) => svc.updateTask(ctx, id, { [field]: value } as never).then(() => undefined));
  refresh(slug);
  return res;
}

export async function deleteTaskAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteTask(ctx, id));
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/work`);
  }
  return res;
}

export async function commentAction(slug: string, taskId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, (ctx) => svc.addComment(ctx, taskId, String(fd.get("body") ?? "")));
  refresh(slug);
  return res;
}
