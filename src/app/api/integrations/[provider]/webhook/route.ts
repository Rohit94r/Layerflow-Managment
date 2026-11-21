import { NextResponse } from "next/server";
import { ensureDb } from "@/server/db";
import { handleVercelWebhook } from "@/modules/integrations/service";

export const maxDuration = 60;

/**
 * Provider webhooks. Only Vercel sends them: a team webhook (Vercel → Team Settings → Webhooks) pointed at
 * /api/integrations/vercel/webhook?connection=<id>, signed with x-vercel-signature. Vercel retries non-2xx
 * deliveries, so a project that isn't linked still answers 200.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/integrations/[provider]/webhook">) {
  const { provider } = await params;
  if (provider !== "vercel") return NextResponse.json({ error: "not found" }, { status: 404 });
  const connection = new URL(req.url).searchParams.get("connection") ?? "";
  const raw = await req.text();
  if (!connection || raw.length > 1_000_000) return NextResponse.json({ error: "bad request" }, { status: 400 });
  await ensureDb();
  const r = await handleVercelWebhook(connection, raw, req.headers.get("x-vercel-signature") ?? "");
  return NextResponse.json({ result: r.result }, { status: r.status });
}
