"use server";

import { revalidatePath } from "next/cache";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function createExpenseAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    const e = await svc.createExpense(ctx, formObject(fd) as never);
    return { ok: true, message: `Added ${e.vendor}.` };
  });
  refresh(slug);
  return res;
}

export async function updateExpenseAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.updateExpense(ctx, id, formObject(fd) as never);
    return { ok: true, message: "Saved." };
  });
  refresh(slug);
  return res;
}

export async function setExpenseStatusAction(slug: string, id: string, status: "active" | "cancelled") {
  const res = await withCtx(slug, (ctx) => svc.setExpenseStatus(ctx, id, status));
  refresh(slug);
  return res;
}

export async function markRenewedAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.markRenewed(ctx, id));
  refresh(slug);
  return res;
}

export async function deleteExpenseAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteExpense(ctx, id));
  refresh(slug);
  return res;
}

export async function createRevenueAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.createRevenue(ctx, formObject(fd) as never);
    return { ok: true, message: "Revenue recorded." };
  });
  refresh(slug);
  return res;
}

export async function deleteRevenueAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteRevenue(ctx, id));
  refresh(slug);
  return res;
}
