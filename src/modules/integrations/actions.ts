"use server";

import { revalidatePath } from "next/cache";
import { withCtx } from "../../server/action";
import { assertCan } from "../../server/permissions";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function syncNowAction(slug: string, connectionId: string) {
  const res = await withCtx(slug, async (ctx) => {
    assertCan(ctx, "integration.manage");
    const r = await svc.syncConnection(ctx, connectionId, "manual");
    if (r.failed) return { ok: false, error: `Sync failed for ${r.failed} propert${r.failed === 1 ? "y" : "ies"}: ${r.error ?? "see sync history"}` };
    if (!r.synced) return { ok: true, message: r.unmapped ? "Nothing synced: map a property to a product first." : "No properties to sync." };
    return { ok: true, message: `Synced ${r.synced} propert${r.synced === 1 ? "y" : "ies"}.` };
  });
  refresh(slug);
  return res;
}

export async function refreshResourcesAction(slug: string, connectionId: string) {
  const res = await withCtx(slug, async (ctx) => {
    const n = await svc.refreshResources(ctx, connectionId);
    return { ok: true, message: `Found ${n} propert${n === 1 ? "y" : "ies"}.` };
  });
  refresh(slug);
  return res;
}

export async function mapResourceAction(slug: string, resourceId: string, productId: string) {
  const res = await withCtx(slug, (ctx) => svc.mapResource(ctx, resourceId, productId || null));
  refresh(slug);
  return res;
}

export async function disconnectAction(slug: string, connectionId: string, deleteData: boolean) {
  const res = await withCtx(slug, async (ctx) => {
    await svc.disconnect(ctx, connectionId, deleteData);
    return { ok: true, message: deleteData ? "Disconnected; synced data deleted." : "Disconnected; access revoked at Google. Synced data kept." };
  });
  refresh(slug);
  return res;
}
