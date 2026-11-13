import { NextResponse } from "next/server";
import { getSession } from "@/server/context";
import { completeOAuth, syncConnection } from "@/modules/integrations/service";
import { AppError } from "@/lib/errors";
import { ProviderError } from "@/integrations/core/http";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/sign-in", req.url));
  const fail = (msg: string) => NextResponse.redirect(new URL(`/onboarding?integration_error=${encodeURIComponent(msg)}`, req.url));
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "Access was not granted." : "Google returned an error.");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return fail("Missing authorisation code.");
  try {
    const { slug, connectionId, workspaceId } = await completeOAuth(session.user.id, state, code);
    // First sync of any already-mapped properties; unmapped ones wait for the user to map them.
    await syncConnection({ workspaceId, userId: session.user.id }, connectionId, "connect").catch(() => null);
    return NextResponse.redirect(new URL(`/w/${slug}/integrations?connected=1`, req.url));
  } catch (e) {
    return fail(e instanceof AppError || e instanceof ProviderError ? e.message : "Could not complete the connection.");
  }
}
