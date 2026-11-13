import { NextResponse } from "next/server";
import { actionCtx } from "@/server/context";
import { search } from "@/modules/search/service";

export async function GET(req: Request, { params }: RouteContext<"/api/w/[workspaceSlug]/search">) {
  const { workspaceSlug } = await params;
  const ctx = await actionCtx(workspaceSlug);
  if (!ctx) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ hits: await search(ctx, q) }, { headers: { "Cache-Control": "no-store" } });
}
