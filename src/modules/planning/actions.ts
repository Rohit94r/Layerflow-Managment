"use server";

import { revalidatePath } from "next/cache";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function createRoadmapItemAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.createRoadmapItem(ctx, formObject(fd) as never);
    return { ok: true, message: "Added to roadmap." };
  });
  refresh(slug);
  return res;
}

export async function moveRoadmapItemAction(slug: string, id: string, horizon: string) {
  const res = await withCtx(slug, (ctx) => svc.moveRoadmapItem(ctx, id, horizon as "now"));
  refresh(slug);
  return res;
}

export async function deleteRoadmapItemAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteRoadmapItem(ctx, id));
  refresh(slug);
  return res;
}

export async function createGoalAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.createGoal(ctx, formObject(fd) as never);
    return { ok: true, message: "Goal created." };
  });
  refresh(slug);
  return res;
}

export async function checkInGoalAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.checkInGoal(ctx, id, Number(fd.get("value")));
    return { ok: true, message: "Checked in." };
  });
  refresh(slug);
  return res;
}

export async function deleteGoalAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteGoal(ctx, id));
  refresh(slug);
  return res;
}

export async function setBudgetAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.setBudget(ctx, { productId: String(fd.get("productId") ?? ""), amount: String(fd.get("amount") ?? ""), currency: String(fd.get("currency") ?? "") });
    return { ok: true, message: "Budget saved." };
  });
  refresh(slug);
  return res;
}

export async function deleteBudgetAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteBudget(ctx, id));
  refresh(slug);
  return res;
}
