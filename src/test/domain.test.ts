import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeOwner } from "./setup-db";
import * as portfolio from "../modules/portfolio/service";
import * as work from "../modules/work/service";
import * as finance from "../modules/finance/service";
import { listActivity } from "../modules/audit/service";
import { addDays, today } from "../lib/format";

describe("portfolio, work and finance rules", () => {
  let o: Awaited<ReturnType<typeof makeOwner>>;
  beforeAll(async () => {
    await freshDb();
    o = await makeOwner("Pat");
  });

  it("generates unique product slugs and records field-level audit diffs", async () => {
    const p1 = await portfolio.createProduct(o.ctx, { name: "Hackathon Finder" });
    const p2 = await portfolio.createProduct(o.ctx, { name: "Hackathon Finder" });
    expect(p1.slug).toBe("hackathon-finder");
    expect(p2.slug).toBe("hackathon-finder-2");

    await portfolio.updateProduct(o.ctx, p1.id, { lifecycle: "live", health: "watch", healthReason: "Signups flat" });
    const { items } = await listActivity(o.ctx, { productId: p1.id });
    const upd = items.find((e) => e.action === "product.updated")!;
    expect(upd.changes?.lifecycle).toEqual({ from: "idea", to: "live" });
    expect(upd.changes?.health).toEqual({ from: "unknown", to: "watch" });
  });

  it("keeps classification dimensions independent and validated", async () => {
    await expect(portfolio.createProduct(o.ctx, { name: "x", lifecycle: "shipped" as never })).rejects.toBeDefined();
    const p = await portfolio.createProduct(o.ctx, { name: "Dojo", lifecycle: "paused", health: "healthy", priority: "p0", focus: "current_focus" });
    expect([p.lifecycle, p.health, p.priority, p.focus]).toEqual(["paused", "healthy", "p0", "current_focus"]);
  });

  it("requires archiving before delete", async () => {
    const p = await portfolio.createProduct(o.ctx, { name: "Temp" });
    await expect(portfolio.deleteProduct(o.ctx, p.id)).rejects.toMatchObject({ code: "invalid" });
    await portfolio.setArchived(o.ctx, p.id, true);
    await portfolio.deleteProduct(o.ctx, p.id);
    expect(await portfolio.getProductBySlug(o.ctx, p.slug)).toBeNull();
  });

  it("raises evidence-based attention signals", async () => {
    const p = await portfolio.createProduct(o.ctx, { name: "Signals", lifecycle: "live" });
    await work.createTask(o.ctx, { title: "Late", productId: p.id, dueDate: addDays(today(), -2) });
    await work.createTask(o.ctx, { title: "Crash", type: "bug", priority: "urgent", productId: p.id });
    const kinds = (await portfolio.attentionSignals(o.ctx)).get(p.id)!.map((s) => s.kind).sort();
    expect(kinds).toEqual(["bugs", "health", "overdue"]);
  });

  it("sets and clears completedAt with status", async () => {
    const t = await work.createTask(o.ctx, { title: "Ship it" });
    const done = await work.updateTask(o.ctx, t.id, { status: "done" });
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await work.updateTask(o.ctx, t.id, { status: "todo" });
    expect(reopened.completedAt).toBeNull();
  });

  it("computes run-rate per currency without mixing", async () => {
    await finance.createExpense(o.ctx, { vendor: "Vercel", amount: "20", currency: "USD", recurrence: "monthly" });
    await finance.createExpense(o.ctx, { vendor: "Domain", amount: "120", currency: "USD", recurrence: "yearly" });
    await finance.createExpense(o.ctx, { vendor: "Hetzner", amount: "9.50", currency: "EUR", recurrence: "monthly" });
    await finance.createExpense(o.ctx, { vendor: "Logo design", amount: "300", currency: "USD", recurrence: "one_time" });
    const s = await finance.financeSummary(o.ctx);
    expect(s.monthlyCost).toEqual({ USD: 3000, EUR: 950 });
    expect(s.mixedCurrencies).toBe(true);
    expect(s.hasRevenueData).toBe(false);
  });

  it("rolls renewal dates forward to the future", () => {
    expect(finance.nextRenewal("2026-01-15", "yearly") >= today()).toBe(true);
    expect(finance.nextRenewal(addDays(today(), 3), "monthly") > today()).toBe(true);
  });
});
