import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { freshDb, makeOwner } from "./setup-db";
import { db, schema } from "../server/db";
import { decrypt, encrypt } from "../server/crypto";
import { assertPublicUrl } from "../server/safe-fetch";
import { detectInsights } from "../modules/seo/insights";
import { insightToTask, setInsightStatus } from "../modules/seo/service";
import * as auto from "../modules/automation/service";
import { decideApproval, listInbox, requestApproval } from "../modules/automation/inbox";
import * as planning from "../modules/planning/service";
import * as portfolio from "../modules/portfolio/service";
import * as finance from "../modules/finance/service";
import { listTasks } from "../modules/work/service";
import { authorizeTool, toolByName } from "../ai/tools";
import { addDays, today } from "../lib/format";

type Owner = Awaited<ReturnType<typeof makeOwner>>;

describe("SEO insight rules (pure)", () => {
  it("flags low CTR, striking distance and declines with evidence", () => {
    const out = detectInsights({
      period: "p",
      queries: [
        { key: "budget app", clicks: 5, impressions: 2000, ctr: 0.0025, position: 3.2 },
        { key: "free planner", clicks: 3, impressions: 400, ctr: 0.0075, position: 12 },
      ],
      prevQueries: [],
      pages: [{ key: "https://x.com/a", clicks: 10, impressions: 500, ctr: 0.02, position: 6 }],
      prevPages: [{ key: "https://x.com/a", clicks: 100, impressions: 900, ctr: 0.11, position: 4 }],
    });
    const kinds = out.map((i) => `${i.kind}:${i.key}`);
    expect(kinds).toContain("low_ctr:budget app");
    expect(kinds).toContain("striking_distance:free planner");
    expect(kinds).toContain("declining_page:https://x.com/a");
    const decline = out.find((i) => i.kind === "declining_page")!;
    expect(decline.evidence.change).toBe("-90%");
    expect(decline.confidence).toBe("high");
  });

  it("does not invent insights from thin data", () => {
    expect(detectInsights({ period: "p", queries: [{ key: "q", clicks: 0, impressions: 20, ctr: 0, position: 3 }], prevQueries: [], pages: [], prevPages: [] })).toHaveLength(0);
  });
});

describe("security helpers", () => {
  it("encrypts tokens with authenticated encryption", () => {
    const c = encrypt("secret-token");
    expect(c).not.toContain("secret-token");
    expect(decrypt(c)).toBe("secret-token");
    const tampered = c.slice(0, -2) + (c.endsWith("A") ? "B" : "A") + c.slice(-1);
    expect(() => decrypt(tampered)).toThrow();
  });

  it("blocks SSRF targets", async () => {
    for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "ftp://example.com", "http://example.com:8080/", "http://user:pw@example.com/"]) {
      await expect(assertPublicUrl(u), u).rejects.toThrow();
    }
  });
});

describe("automations, approvals and inbox", () => {
  let a: Owner;
  let b: Owner;
  beforeAll(async () => {
    await freshDb();
    a = await makeOwner("Ada");
    b = await makeOwner("Ben");
  });

  it("notifies once per renewal (idempotent) and dry runs change nothing", async () => {
    await finance.createExpense(a.ctx, { vendor: "Vercel", amount: "20", currency: "USD", nextRenewalDate: addDays(today(), 5) });
    const rule = await auto.createAutomation(a.ctx, { template: "renewal_reminder", params: { days: 14 } });

    const dry = await auto.runAutomationNow(a.ctx, rule.id, true);
    expect(dry.status).toBe("dry_run");
    expect(await listInbox(a.ctx)).toHaveLength(0);

    const first = await auto.runAutomationNow(a.ctx, rule.id, false);
    expect(first.status).toBe("succeeded");
    expect((await listInbox(a.ctx)).filter((i) => i.kind === "renewal_reminder")).toHaveLength(1);

    await auto.runAutomationNow(a.ctx, rule.id, false);
    expect((await listInbox(a.ctx)).filter((i) => i.kind === "renewal_reminder")).toHaveLength(1);
  });

  it("respects the workspace kill switch", async () => {
    const rule = await auto.createAutomation(a.ctx, { template: "review_due" });
    await auto.setKillSwitch(a.ctx, "automations", true);
    expect((await auto.runAutomationNow(a.ctx, rule.id, false)).status).toBe("skipped");
    await auto.setKillSwitch(a.ctx, "automations", false);
  });

  it("queues actions for approval and executes only on approve", async () => {
    const p = await portfolio.createProduct(a.ctx, { name: "Approval test" });
    const before = (await listTasks(a.ctx, { status: "all" })).length;
    const req = await requestApproval({
      workspaceId: a.ctx.workspaceId, requestedByType: "agent", requestedById: "x", requestedByName: "Test agent",
      action: "task.create", summary: "Create task: Fix it", payload: { title: "Fix it", productId: p.id },
    });
    expect((await listTasks(a.ctx, { status: "all" })).length).toBe(before);
    // Another workspace cannot decide it.
    await expect(decideApproval(b.ctx, req.id, true)).rejects.toMatchObject({ code: "not_found" });
    const r = await decideApproval(a.ctx, req.id, true);
    expect(r.status).toBe("approved");
    expect((await listTasks(a.ctx, { status: "all" })).length).toBe(before + 1);
    await expect(decideApproval(a.ctx, req.id, true)).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses unknown actions for approval", async () => {
    await expect(requestApproval({ workspaceId: a.ctx.workspaceId, requestedByType: "agent", requestedById: "x", requestedByName: "x", action: "workspace.delete", summary: "x", payload: {} }))
      .rejects.toMatchObject({ code: "invalid" });
  });
});

describe("agent tool authorisation", () => {
  let a: Owner;
  beforeAll(async () => {
    await freshDb();
    a = await makeOwner("Cara");
  });

  it("denies tools that are not enabled or not permitted for the owner's role", () => {
    expect(authorizeTool(a.ctx, ["list_products"], "propose_task").ok).toBe(false);
    expect(authorizeTool(a.ctx, ["list_products"], "list_products").ok).toBe(true);
    expect(authorizeTool({ ...a.ctx, role: "guest" }, ["finance_summary"], "finance_summary").ok).toBe(false);
  });

  it("keeps product-scoped agents inside their product", async () => {
    const p1 = await portfolio.createProduct(a.ctx, { name: "One" });
    const p2 = await portfolio.createProduct(a.ctx, { name: "Two" });
    const env = { ctx: a.ctx, agent: { instanceId: "i", name: "t", productId: p1.id }, runId: "r" };
    const list = (await toolByName("list_products")!.run(env as never, {} as never)) as { slug: string }[];
    expect(list.map((x) => x.slug)).toEqual([p1.slug]);
    await expect(toolByName("get_product")!.run(env as never, { product_slug: p2.slug } as never)).rejects.toThrow(/different product/);
  });

  it("propose_task creates an approval, never a task", async () => {
    const env = { ctx: a.ctx, agent: { instanceId: "i", name: "t", productId: null }, runId: "r" };
    const before = (await listTasks(a.ctx, { status: "all" })).length;
    const out = (await toolByName("propose_task")!.run(env as never, { title: "Do X", description: "d", priority: "low", type: "task" } as never)) as { status: string };
    expect(out.status).toBe("pending_approval");
    expect((await listTasks(a.ctx, { status: "all" })).length).toBe(before);
  });
});

describe("planning and SEO cross-tenant", () => {
  let a: Owner;
  let b: Owner;
  beforeAll(async () => {
    await freshDb();
    a = await makeOwner("Dee");
    b = await makeOwner("Eli");
  });

  it("derives goal progress and keeps roadmap items tenant-scoped", async () => {
    expect(planning.goalProgress({ startValue: 0, targetValue: 100, currentValue: 25 })).toBe(0.25);
    expect(planning.goalProgress({ startValue: 10, targetValue: 0, currentValue: 5 })).toBe(0.5);
    await planning.createRoadmapItem(a.ctx, { title: "Launch v2", horizon: "now" });
    const [item] = await planning.listRoadmap(a.ctx);
    await expect(planning.moveRoadmapItem(b.ctx, item!.id, "done")).rejects.toMatchObject({ code: "not_found" });
    expect(await planning.listRoadmap(b.ctx)).toHaveLength(0);
  });

  it("insight-to-task works only inside the owning workspace", async () => {
    const [ins] = await db.insert(schema.seoInsight).values({
      workspaceId: a.ctx.workspaceId, kind: "low_ctr", key: "q", title: "Low CTR for q", evidence: { impressions: 900 }, nextAction: "Rewrite title", periodLabel: "p", confidence: "high",
    }).returning();
    await expect(insightToTask(b.ctx, ins!.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(setInsightStatus(b.ctx, ins!.id, "dismissed")).rejects.toMatchObject({ code: "not_found" });
    const t = await insightToTask(a.ctx, ins!.id);
    expect(t.description).toContain("Evidence");
    const [after] = await db.select().from(schema.seoInsight).where(and(eq(schema.seoInsight.id, ins!.id)));
    expect(after!.status).toBe("task_created");
  });
});
