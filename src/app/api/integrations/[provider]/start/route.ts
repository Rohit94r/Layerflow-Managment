import { NextResponse } from "next/server";
import { actionCtx } from "@/server/context";
import { startOAuth } from "@/modules/integrations/service";
import { AppError } from "@/lib/errors";

/** Starts the provider OAuth flow for a workspace. GET so it can be a plain link; state is bound to user + workspace. */
export async function GET(req: Request, { params }: RouteContext<"/api/integrations/[provider]/start">) {
  const { provider } = await params;
  const slug = new URL(req.url).searchParams.get("workspace") ?? "";
  const ctx = await actionCtx(slug);
  const back = (msg: string) => NextResponse.redirect(new URL(`/w/${slug}/integrations?error=${encodeURIComponent(msg)}`, req.url));
  if (!ctx) return NextResponse.redirect(new URL("/sign-in", req.url));
  try {
    return NextResponse.redirect(await startOAuth(ctx, provider));
  } catch (e) {
    return back(e instanceof AppError ? e.message : "Could not start the connection.");
  }
}
