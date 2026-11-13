"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { formObject, run, withCtx, type ActionResult } from "../../server/action";
import { getSession } from "../../server/context";
import type { Role } from "./constants";
import * as svc from "./service";

export async function createWorkspaceAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let slug = "";
  const res = await run(async () => {
    const session = await getSession();
    if (!session) return { ok: false, error: "Please sign in again." };
    const ws = await svc.createWorkspace(session.user.id, formObject(fd) as never);
    slug = ws.slug;
  });
  if (res.ok) redirect(`/w/${slug}`);
  return res;
}

export async function updateWorkspaceAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let newSlug = slug;
  const res = await withCtx(slug, async (ctx) => {
    const ws = await svc.updateWorkspace(ctx, formObject(fd) as never);
    newSlug = ws.slug;
    return { ok: true, message: "Workspace saved." };
  });
  if (res.ok && newSlug !== slug) redirect(`/w/${newSlug}/settings`);
  revalidatePath(`/w/${slug}`, "layout");
  return res;
}

export async function deleteWorkspaceAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, (ctx) => svc.deleteWorkspace(ctx, String(fd.get("confirm") ?? "")));
  if (res.ok) redirect("/onboarding");
  return res;
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return process.env.BETTER_AUTH_URL || (host ? `${proto}://${host}` : "");
}

export async function inviteAction(slug: string, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const res = await withCtx(slug, async (ctx) => {
    const token = await svc.createInvitation(ctx, formObject(fd) as never);
    return { ok: true, message: "Invitation created. Share this link — it works once and expires in 7 days.", data: { link: `${await origin()}/invite/${token}` } };
  });
  revalidatePath(`/w/${slug}/settings`);
  return res;
}

export async function revokeInviteAction(slug: string, id: string) {
  const res = await withCtx(slug, (ctx) => svc.revokeInvitation(ctx, id));
  revalidatePath(`/w/${slug}/settings`);
  return res;
}

export async function changeRoleAction(slug: string, memberId: string, role: Role) {
  const res = await withCtx(slug, (ctx) => svc.changeRole(ctx, memberId, role));
  revalidatePath(`/w/${slug}`, "layout");
  return res;
}

export async function removeMemberAction(slug: string, memberId: string, self: boolean) {
  const res = await withCtx(slug, (ctx) => svc.removeMember(ctx, memberId));
  if (res.ok && self) redirect("/");
  revalidatePath(`/w/${slug}/settings`);
  return res;
}

export async function acceptInviteAction(token: string, _prev: ActionResult | null): Promise<ActionResult> {
  let slug = "";
  const res = await run(async () => {
    const session = await getSession();
    if (!session) return { ok: false, error: "Please sign in first." };
    const ws = await svc.acceptInvitation(session.user.id, session.user.email, token);
    slug = ws.slug;
  });
  if (res.ok) redirect(`/w/${slug}`);
  return res;
}
