"use server";

import { revalidatePath } from "next/cache";
import { withCtx } from "../../server/action";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function insightToTaskAction(slug: string, insightId: string) {
  const res = await withCtx(slug, async (ctx) => {
    const t = await svc.insightToTask(ctx, insightId);
    return { ok: true, message: `Created task #${t.number}.` };
  });
  refresh(slug);
  return res;
}

export async function dismissInsightAction(slug: string, insightId: string, reopen = false) {
  const res = await withCtx(slug, (ctx) => svc.setInsightStatus(ctx, insightId, reopen ? "open" : "dismissed"));
  refresh(slug);
  return res;
}

export async function runAuditAction(slug: string, productId: string) {
  const res = await withCtx(slug, async (ctx) => {
    await svc.runAudit(ctx, productId);
    return { ok: true, message: "Audit finished." };
  });
  refresh(slug);
  return res;
}

export async function runUptimeAction(slug: string, productId: string) {
  const res = await withCtx(slug, async (ctx) => {
    const r = await svc.runUptimeNow(ctx, productId);
    const down = r.filter((x) => !x.ok).length;
    return { ok: true, message: down ? `${down} of ${r.length} URL(s) failed the check.` : `All ${r.length} URL(s) are up.` };
  });
  refresh(slug);
  return res;
}
