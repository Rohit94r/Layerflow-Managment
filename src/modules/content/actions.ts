"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formObject, withCtx, type ActionResult } from "../../server/action";
import type { PostStatus } from "./constants";
import * as svc from "./service";

const refresh = (slug: string) => revalidatePath(`/w/${slug}`, "layout");

export async function createPostAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await withCtx(slug, async (ctx) => {
    const p = await svc.createPost(ctx, formObject(fd) as never);
    id = p.id;
  });
  if (res.ok && id) {
    refresh(slug);
    redirect(`/w/${slug}/content/${id}`);
  }
  return res;
}

export async function savePostAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    const p = await svc.updatePost(ctx, id, formObject(fd) as never);
    return { ok: true, message: `Saved · SEO score ${p.seoScore}` };
  });
  refresh(slug);
  return res;
}

export async function setPostStatusAction(slug: string, id: string, to: PostStatus) {
  const res = await withCtx(slug, (ctx) => svc.setPostStatus(ctx, id, to));
  refresh(slug);
  return res;
}

export async function publishPostAction(slug: string, id: string) {
  const res = await withCtx(slug, async (ctx) => {
    const r = await svc.publishPost(ctx, id);
    return { ok: true, message: r.liveUrl ? "Published. It's live." : "Published." };
  });
  refresh(slug);
  return res;
}

export async function unpublishPostAction(slug: string, id: string) {
  const res = await withCtx(slug, async (ctx) => {
    await svc.unpublishPost(ctx, id);
    return { ok: true, message: "Unpublished; moved back to draft." };
  });
  refresh(slug);
  return res;
}

export async function schedulePostAction(slug: string, id: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    // The browser sends local time plus its UTC offset so the stored instant is exact.
    const local = String(fd.get("at") ?? "");
    const offset = Number(fd.get("tz") ?? 0);
    const at = new Date(`${local}:00Z`);
    at.setUTCMinutes(at.getUTCMinutes() + offset);
    await svc.schedulePost(ctx, id, at);
    return { ok: true, message: "Scheduled." };
  });
  refresh(slug);
  return res;
}

export async function deletePostAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.deletePost(ctx, id));
  if (res.ok) {
    refresh(slug);
    redirect(`/w/${slug}/content`);
  }
  return res;
}

export async function saveChannelAction(slug: string, productId: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    await svc.updateChannel(ctx, productId, formObject(fd) as never);
    return { ok: true, message: "Publishing settings saved." };
  });
  refresh(slug);
  return res;
}

export async function rotateSecretAction(slug: string, productId: string) {
  const res = await withCtx(slug, async (ctx) => {
    await svc.rotateWebhookSecret(ctx, productId);
    return { ok: true, message: "New signing secret created. Update it on your site." };
  });
  refresh(slug);
  return res;
}
