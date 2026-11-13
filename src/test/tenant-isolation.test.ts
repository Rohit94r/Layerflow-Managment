import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeOwner } from "./setup-db";
import { loadContext } from "../modules/identity/service";
import * as portfolio from "../modules/portfolio/service";
import * as work from "../modules/work/service";
import * as knowledge from "../modules/knowledge/service";
import * as finance from "../modules/finance/service";
import { listActivity } from "../modules/audit/service";
import { search } from "../modules/search/service";

type Owner = Awaited<ReturnType<typeof makeOwner>>;

/**
 * Every test here acts as workspace B against records owned by workspace A.
 * Nothing from A may be read, changed, referenced or deleted.
 */
describe("tenant isolation", () => {
  let a: Owner;
  let b: Owner;
  let productA: Awaited<ReturnType<typeof portfolio.createProduct>>;
  let taskA: Awaited<ReturnType<typeof work.createTask>>;
  let docA: Awaited<ReturnType<typeof knowledge.createDoc>>;
  let expenseA: Awaited<ReturnType<typeof finance.createExpense>>;

  beforeAll(async () => {
    await freshDb();
    a = await makeOwner("Alice");
    b = await makeOwner("Bob");
    productA = await portfolio.createProduct(a.ctx, { name: "Secret Product", summary: "alpha-only" });
    taskA = await work.createTask(a.ctx, { title: "Secret task", productId: productA.id });
    docA = await knowledge.createDoc(a.ctx, { title: "Secret doc", body: "classified" });
    expenseA = await finance.createExpense(a.ctx, { vendor: "SecretVendor", amount: "10", currency: "USD" });
    await portfolio.addLink(a.ctx, productA.id, { kind: "domain", url: "https://secret.example.com" });
  });

  it("non-members get no context", async () => {
    expect(await loadContext(b.user.id, a.ws.slug)).toBeNull();
  });

  it("cannot read another workspace's records", async () => {
    expect(await portfolio.getProductBySlug(b.ctx, productA.slug)).toBeNull();
    expect(await portfolio.listProducts(b.ctx)).toHaveLength(0);
    expect(await work.getTask(b.ctx, taskA.number)).toBeNull();
    expect(await work.listTasks(b.ctx, { status: "all" })).toHaveLength(0);
    expect(await knowledge.getDoc(b.ctx, docA.id)).toBeNull();
    expect(await knowledge.listDocs(b.ctx)).toHaveLength(0);
    expect(await finance.listExpenses(b.ctx, { status: "all" })).toHaveLength(0);
    expect((await listActivity(b.ctx)).items.every((e) => e.targetLabel !== "Secret Product")).toBe(true);
    expect(await search(b.ctx, "Secret")).toHaveLength(0);
  });

  it("cannot modify or delete another workspace's records", async () => {
    await expect(portfolio.updateProduct(b.ctx, productA.id, { name: "pwned" })).rejects.toMatchObject({ code: "not_found" });
    await expect(portfolio.setArchived(b.ctx, productA.id, true)).rejects.toMatchObject({ code: "not_found" });
    await expect(portfolio.bulkUpdate(b.ctx, [productA.id], { priority: "p0" })).resolves.toBe(0);
    await expect(work.updateTask(b.ctx, taskA.id, { title: "pwned" })).rejects.toMatchObject({ code: "not_found" });
    await expect(work.deleteTask(b.ctx, taskA.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(work.addComment(b.ctx, taskA.id, "hi")).rejects.toMatchObject({ code: "not_found" });
    await expect(knowledge.updateDoc(b.ctx, docA.id, { title: "pwned" })).rejects.toMatchObject({ code: "not_found" });
    await expect(knowledge.deleteDoc(b.ctx, docA.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(finance.deleteExpense(b.ctx, expenseA.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(finance.markRenewed(b.ctx, expenseA.id)).rejects.toMatchObject({ code: "not_found" });

    const still = await portfolio.getProductBySlug(a.ctx, productA.slug);
    expect(still?.name).toBe("Secret Product");
    expect(still?.priority).toBe("p2");
    expect(still?.archivedAt).toBeNull();
    const link = still!.links[0]!;
    await expect(portfolio.removeLink(b.ctx, link.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("cannot reference another workspace's records or people", async () => {
    await expect(work.createTask(b.ctx, { title: "x", productId: productA.id })).rejects.toMatchObject({ code: "invalid" });
    await expect(work.createTask(b.ctx, { title: "x", assigneeId: a.user.id })).rejects.toMatchObject({ code: "invalid" });
    await expect(portfolio.createProduct(b.ctx, { name: "x", ownerId: a.user.id })).rejects.toMatchObject({ code: "invalid" });
    await expect(portfolio.createProduct(b.ctx, { name: "x", parentId: productA.id })).rejects.toMatchObject({ code: "invalid" });
    await expect(knowledge.createDoc(b.ctx, { title: "x", productId: productA.id })).rejects.toMatchObject({ code: "invalid" });
    await expect(finance.createExpense(b.ctx, { vendor: "x", amount: "1", currency: "USD", productId: productA.id })).rejects.toMatchObject({ code: "invalid" });
  });

  it("task numbers are per workspace", async () => {
    const t = await work.createTask(b.ctx, { title: "B's first" });
    expect(t.number).toBe(1);
    const t2 = await work.createTask(a.ctx, { title: "A's second" });
    expect(t2.number).toBe(2);
  });
});
