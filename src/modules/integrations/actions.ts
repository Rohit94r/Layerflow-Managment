"use server";

import { revalidatePath } from "next/cache";
import { withCtx, formObject } from "../../server/action";
import { assertCan } from "../../server/permissions";
import type { ActionResult } from "../../server/action";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");
const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

export async function syncNowAction(slug: string, connectionId: string) {
  const res = await withCtx(slug, async (ctx) => {
    assertCan(ctx, "integration.manage");
    const noun = svc.resourceNoun(await svc.connectionProvider(ctx, connectionId));
    const r = await svc.syncConnection(ctx, connectionId, "manual");
    if (r.failed) return { ok: false, error: `Sync failed for ${plural(r.failed, noun)}: ${r.error ?? "see sync history"}` };
    if (!r.synced) return { ok: true, message: r.unmapped ? `Nothing synced: map a ${noun[0]} to a project first.` : `No ${noun[1]} to sync.` };
    return { ok: true, message: `Synced ${plural(r.synced, noun)}.` };
  });
  refresh(slug);
  return res;
}

export async function refreshResourcesAction(slug: string, connectionId: string) {
  const res = await withCtx(slug, async (ctx) => {
    const noun = svc.resourceNoun(await svc.connectionProvider(ctx, connectionId));
    const n = await svc.refreshResources(ctx, connectionId);
    return { ok: true, message: `Found ${plural(n, noun)}.` };
  });
  refresh(slug);
  return res;
}

export async function mapResourceAction(slug: string, resourceId: string, productId: string) {
  const res = await withCtx(slug, async (ctx): Promise<ActionResult> => {
    const r = await svc.mapResource(ctx, resourceId, productId || null);
    if (!r) return { ok: true };
    if (!r.synced) return { ok: true, message: "Linked. The first deployment sync failed; see the connection's last error." };
    const added = r.linksAdded.length ? ` Added the project's ${r.linksAdded.join(" and ")} link${r.linksAdded.length > 1 ? "s" : ""} from Vercel.` : "";
    return { ok: true, message: `Linked and synced deployments.${added}` };
  });
  refresh(slug);
  return res;
}

export async function disconnectAction(slug: string, connectionId: string, deleteData: boolean) {
  const res = await withCtx(slug, async (ctx) => {
    const provider = await svc.connectionProvider(ctx, connectionId);
    await svc.disconnect(ctx, connectionId, deleteData);
    if (provider === "vercel") {
      return { ok: true, message: `Disconnected; the token was deleted from Flotilla${deleteData ? " with all synced deployments" : ""}. Also delete the token in Vercel (Account Settings → Tokens).` };
    }
    return { ok: true, message: deleteData ? "Disconnected; synced data deleted." : "Disconnected; access revoked at Google. Synced data kept." };
  });
  refresh(slug);
  return res;
}

/** Connects (or reconnects with a new token) a Vercel account. */
export async function connectVercelAction(slug: string, _prev: ActionResult | null, fd: FormData) {
  const res = await withCtx(slug, async (ctx) => {
    const { token } = formObject(fd);
    const r = await svc.connectWithToken(ctx, "vercel", typeof token === "string" ? token : "");
    return { ok: true, message: `Connected to Vercel. Found ${plural(r.found, ["Vercel project", "Vercel projects"])}: link each one to its project below.` };
  });
  refresh(slug);
  return res;
}

export async function setWebhookSecretAction(slug: string, connectionId: string, _prev: ActionResult | null, fd: FormData) {
  const res = await withCtx(slug, async (ctx) => {
    const { secret } = formObject(fd);
    await svc.setWebhookSecret(ctx, connectionId, typeof secret === "string" ? secret : "");
    return { ok: true, message: "Webhook secret saved. Deployments now update as soon as Vercel sends an event." };
  });
  refresh(slug);
  return res;
}

export async function removeWebhookSecretAction(slug: string, connectionId: string) {
  const res = await withCtx(slug, async (ctx) => {
    await svc.setWebhookSecret(ctx, connectionId, null);
    return { ok: true, message: "Webhook removed. Delete it in Vercel too, or its deliveries will be rejected." };
  });
  refresh(slug);
  return res;
}

/** Refreshes a product's deployment data when it is stale. Quiet: no toast, and safe to call on page load. */
export async function refreshDeploymentsAction(slug: string, productId: string) {
  return withCtx(slug, async (ctx) => {
    const n = await svc.refreshProductDeployments(ctx, productId);
    return { ok: true, data: { synced: n } };
  });
}
