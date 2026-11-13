import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { ensureDb } from "@/server/db";
import { dueConnections, syncConnection } from "@/modules/integrations/service";
import { checkUptime, productsWithSites } from "@/modules/seo/service";
import { runScheduledAutomations } from "@/modules/automation/service";
import { createRun, dueAgents } from "@/modules/agents/service";
import { executeRun } from "@/ai/runtime";
import { workspace, workspaceMember } from "@/modules/identity/schema";

export const maxDuration = 300;

/**
 * Scheduler entry point (Vercel Cron or any external cron hitting it with the secret).
 * Order: provider sync → uptime → automations → scheduled agents. Each step is isolated.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureDb();
  const report: Record<string, unknown> = {};

  try {
    const conns = await dueConnections();
    let ok = 0;
    for (const c of conns) {
      const r = await syncConnection({ workspaceId: c.workspaceId, userId: c.connectedBy ?? "" }, c.id, "schedule").catch(() => null);
      if (r && !r.failed) ok++;
    }
    report.sync = { due: conns.length, ok };
  } catch (e) {
    report.sync = { error: e instanceof Error ? e.message : "failed" };
  }

  try {
    const sites = await productsWithSites();
    for (const s of sites) await checkUptime({ workspaceId: s.workspaceId }, s.productId, "schedule").catch(() => null);
    report.uptime = { products: sites.length };
  } catch (e) {
    report.uptime = { error: e instanceof Error ? e.message : "failed" };
  }

  try {
    report.automations = { ran: await runScheduledAutomations() };
  } catch (e) {
    report.automations = { error: e instanceof Error ? e.message : "failed" };
  }

  try {
    const agents = await dueAgents();
    let started = 0;
    for (const a of agents) {
      const [ws] = await db.select().from(workspace).where(eq(workspace.id, a.workspaceId));
      const [m] = await db.select().from(workspaceMember).where(and(eq(workspaceMember.workspaceId, a.workspaceId), eq(workspaceMember.userId, a.ownerId ?? "")));
      if (!ws || !m) continue;
      const ctx = { workspaceId: ws.id, workspaceSlug: ws.slug, userId: m.userId, role: m.role };
      const run = await createRun(ctx, a.id, "schedule").catch(() => null);
      if (run) {
        await executeRun(run.id, ctx);
        started++;
      }
    }
    report.agents = { due: agents.length, ran: started };
  } catch (e) {
    report.agents = { error: e instanceof Error ? e.message : "failed" };
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...report });
}
