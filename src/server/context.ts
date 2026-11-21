import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";
import { ensureDb } from "./db";
import { loadContext } from "../modules/identity/service";

export const getSession = cache(async () => {
  // Read the request headers first: it marks the page as dynamic, so `next build` never opens the database.
  const h = await headers();
  await ensureDb();
  return auth.api.getSession({ headers: h });
});

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}

/**
 * Resolves the signed-in user's membership of a workspace.
 * Non-members get a 404 so the workspace's existence is not revealed.
 */
export const getWorkspaceCtx = cache(async (slug: string) => {
  const user = await requireUser();
  const ctx = await loadContext(user.id, slug);
  if (!ctx) notFound();
  return { ...ctx, user };
});

/** For server actions: same as above but returns null instead of rendering. */
export async function actionCtx(slug: string) {
  const session = await getSession();
  if (!session) return null;
  const ctx = await loadContext(session.user.id, slug);
  return ctx ? { ...ctx, user: session.user } : null;
}
