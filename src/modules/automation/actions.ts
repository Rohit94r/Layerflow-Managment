"use server";

import { revalidatePath } from "next/cache";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import * as svc from "./service";
import { decideApproval, markInbox } from "./inbox";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function createAutomationAction(slug: string, template: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const obj = formObject(fd);
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (k.startsWith("param_") && typeof v === "string") params[k.slice(6)] = v;
  const res = await withCtx(slug, async (ctx) => {
    const a = await svc.createAutomation(ctx, { template, name: String(obj.name ?? ""), productId: String(obj.productId ?? ""), requiresApproval: obj.requiresApproval === "on", params });
    return { ok: true, message: `“${a.name}” is active.` };
  });
  refresh(slug);
  return res;
}

export async function setAutomationStatusAction(slug: string, id: string, status: "active" | "paused") {
  const res = await withCtx(slug, (ctx) => svc.setAutomationStatus(ctx, id, status));
  refresh(slug);
  return res;
}

export async function deleteAutomationAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deleteAutomation(ctx, id));
  refresh(slug);
  return res;
}

export async function runAutomationAction(slug: string, id: string, dryRun: boolean) {
  const res = await withCtx(slug, async (ctx) => {
    const r = await svc.runAutomationNow(ctx, id, dryRun);
    if (r.status === "failed") return { ok: false, error: "The run failed. See run history." };
    if (r.status === "skipped") return { ok: true, message: "Skipped: paused or kill switch on." };
    const n = r.taken?.length ?? 0;
    return { ok: true, message: dryRun ? `Dry run: ${n} action(s) would run. Nothing changed.` : `${n} action(s) taken.` };
  });
  refresh(slug);
  return res;
}

export async function automationKillSwitchAction(slug: string, paused: boolean) {
  const res = await withCtx(slug, (ctx) => svc.setKillSwitch(ctx, "automations", paused));
  refresh(slug);
  return res;
}

export async function decideApprovalAction(slug: string, id: string, approve: boolean) {
  const res = await withCtx(slug, async (ctx) => {
    const r = await decideApproval(ctx, id, approve);
    if (r.status === "failed") return { ok: false, error: `Approved, but execution failed: ${r.result}` };
    return { ok: true, message: approve ? r.result : "Rejected." };
  });
  refresh(slug);
  return res;
}

export async function markInboxAction(slug: string, ids: string[] | "all", what: "read" | "resolve") {
  const res = await withCtx(slug, (ctx) => markInbox(ctx, ids, what));
  refresh(slug);
  return res;
}
