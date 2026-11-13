"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import { executeRun } from "../../ai/runtime";
import * as svc from "./service";
import { setKillSwitch } from "../automation/service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function installAgentAction(slug: string, key: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await withCtx(slug, async (ctx) => {
    const a = await svc.installAgent(ctx, key, formObject(fd) as never);
    id = a.id;
  });
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/agents/${id}`);
  }
  return res;
}

export async function updateAgentAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.updateAgent(ctx, id, formObject(fd) as never);
    return { ok: true, message: "Configuration saved (new version)." };
  });
  refresh(slug);
  return res;
}

export async function setAgentStatusAction(slug: string, id: string, status: "active" | "paused" | "disabled") {
  const res = await withCtx(slug, (ctx) => svc.setAgentStatus(ctx, id, status));
  refresh(slug);
  return res;
}

export async function uninstallAgentAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.uninstallAgent(ctx, id));
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/agents`);
  }
  return res;
}

/** Queues a run and executes it after the response is sent, so the UI returns immediately and shows live progress. */
export async function runAgentAction(slug: string, id: string) {
  let runId = "";
  const res = await withCtx(slug, async (ctx) => {
    const run = await svc.createRun(ctx, id, "manual");
    runId = run.id;
    after(() => executeRun(run.id, ctx));
  });
  refresh(slug);
  if (res.ok) redirect(`/w/${slug}/agents/runs/${runId}`);
  return res;
}

export async function cancelRunAction(slug: string, runId: string) {
  const res = await withCtx(slug, (ctx) => svc.cancelRun(ctx, runId));
  refresh(slug);
  return res;
}

export async function agentKillSwitchAction(slug: string, paused: boolean) {
  const res = await withCtx(slug, (ctx) => setKillSwitch(ctx, "agents", paused));
  refresh(slug);
  return res;
}
