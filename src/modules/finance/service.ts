import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../server/db";
import { assertCan, type Ctx } from "../../server/permissions";
import { invalid, notFound } from "../../lib/errors";
import { addDays, toMinor, today } from "../../lib/format";
import { diff, recordAudit } from "../audit/service";
import { isMember } from "../identity/service";
import { product } from "../portfolio/schema";
import { EXPENSE_CATEGORIES, MONTHLY_FACTOR, RECURRENCES, REVENUE_KINDS } from "./constants";
import { expense, revenueEntry } from "./schema";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD.");
const optionalId = z.string().trim().optional().nullable().transform((v) => v || null);
const amount = z
  .union([z.string(), z.number()])
  .transform((v) => toMinor(v))
  .refine((n) => Number.isFinite(n) && n >= 0 && n < 1e13, "Enter a positive amount.");
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.");

export const expenseInput = z.object({
  vendor: z.string().trim().min(1, "Vendor is required.").max(80),
  description: z.string().trim().max(300).default(""),
  category: z.enum(EXPENSE_CATEGORIES).default("other"),
  amount,
  currency,
  recurrence: z.enum(RECURRENCES).default("monthly"),
  productId: optionalId,
  ownerId: optionalId,
  startDate: optionalDate,
  nextRenewalDate: optionalDate,
  isEstimate: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});

export const revenueInput = z.object({
  productId: optionalId,
  month: z.string().regex(/^\d{4}-\d{2}$/, "Pick a month."),
  kind: z.enum(REVENUE_KINDS).default("subscription"),
  amount,
  currency,
  note: z.string().trim().max(200).default(""),
});

async function assertRefs(ctx: Ctx, r: { productId?: string | null; ownerId?: string | null }) {
  if (r.productId) {
    const [p] = await db.select({ id: product.id }).from(product).where(and(eq(product.id, r.productId), eq(product.workspaceId, ctx.workspaceId)));
    if (!p) throw invalid("Unknown project.", { productId: "Unknown project." });
  }
  if (r.ownerId && !(await isMember(ctx.workspaceId, r.ownerId))) throw invalid("Owner must be a member.", { ownerId: "Not a member." });
}

export async function listExpenses(ctx: Ctx, f: { productId?: string; status?: "active" | "cancelled" | "all" } = {}) {
  assertCan(ctx, "finance.view");
  const where = [eq(expense.workspaceId, ctx.workspaceId)];
  if (f.productId) where.push(eq(expense.productId, f.productId));
  if (f.status !== "all") where.push(eq(expense.status, f.status ?? "active"));
  return db
    .select({ e: expense, productName: product.name, productSlug: product.slug })
    .from(expense)
    .leftJoin(product, eq(product.id, expense.productId))
    .where(and(...where))
    .orderBy(asc(expense.vendor))
    .limit(500)
    .then((rows) => rows.map((r) => ({ ...r.e, productName: r.productName, productSlug: r.productSlug })));
}
export type ExpenseRow = Awaited<ReturnType<typeof listExpenses>>[number];

export async function createExpense(ctx: Ctx, raw: z.input<typeof expenseInput>) {
  assertCan(ctx, "finance.edit");
  const { amount: amountMinor, ...input } = expenseInput.parse(raw);
  await assertRefs(ctx, input);
  if (input.recurrence !== "one_time" && !input.nextRenewalDate && input.startDate) {
    input.nextRenewalDate = nextRenewal(input.startDate, input.recurrence);
  }
  return db.transaction(async (tx) => {
    const [e] = await tx.insert(expense).values({ ...input, amountMinor, workspaceId: ctx.workspaceId, createdBy: ctx.userId }).returning();
    await recordAudit(tx, ctx, { action: "expense.created", targetType: "expense", targetId: e!.id, targetLabel: e!.vendor, productId: e!.productId });
    return e!;
  });
}

export async function updateExpense(ctx: Ctx, id: string, raw: z.input<typeof expenseInput>) {
  assertCan(ctx, "finance.edit");
  const [before] = await db.select().from(expense).where(and(eq(expense.id, id), eq(expense.workspaceId, ctx.workspaceId)));
  if (!before) throw notFound("Expense");
  const { amount: amountMinor, ...input } = expenseInput.parse(raw);
  await assertRefs(ctx, input);
  const values = { ...input, amountMinor };
  const changes = diff(before as Record<string, unknown>, values as Record<string, unknown>);
  await db.transaction(async (tx) => {
    await tx.update(expense).set({ ...values, updatedAt: new Date() }).where(eq(expense.id, id));
    await recordAudit(tx, ctx, { action: "expense.updated", targetType: "expense", targetId: id, targetLabel: input.vendor, productId: input.productId, changes });
  });
}

export async function setExpenseStatus(ctx: Ctx, id: string, status: "active" | "cancelled") {
  assertCan(ctx, "finance.edit");
  await db.transaction(async (tx) => {
    const [e] = await tx.update(expense).set({ status, updatedAt: new Date() }).where(and(eq(expense.id, id), eq(expense.workspaceId, ctx.workspaceId))).returning();
    if (!e) throw notFound("Expense");
    await recordAudit(tx, ctx, { action: status === "cancelled" ? "expense.cancelled" : "expense.reactivated", targetType: "expense", targetId: id, targetLabel: e.vendor, productId: e.productId });
  });
}

/** Rolls a renewal date forward after the user confirms it was renewed. */
export async function markRenewed(ctx: Ctx, id: string) {
  assertCan(ctx, "finance.edit");
  const [e] = await db.select().from(expense).where(and(eq(expense.id, id), eq(expense.workspaceId, ctx.workspaceId)));
  if (!e) throw notFound("Expense");
  if (!e.nextRenewalDate || e.recurrence === "one_time") throw invalid("This cost has no renewal date.");
  const next = nextRenewal(e.nextRenewalDate, e.recurrence);
  await db.transaction(async (tx) => {
    await tx.update(expense).set({ nextRenewalDate: next, updatedAt: new Date() }).where(eq(expense.id, id));
    await recordAudit(tx, ctx, { action: "expense.renewed", targetType: "expense", targetId: id, targetLabel: e.vendor, productId: e.productId, changes: { nextRenewalDate: { from: e.nextRenewalDate, to: next } } });
  });
}

export async function deleteExpense(ctx: Ctx, id: string) {
  assertCan(ctx, "finance.edit");
  await db.transaction(async (tx) => {
    const [e] = await tx.delete(expense).where(and(eq(expense.id, id), eq(expense.workspaceId, ctx.workspaceId))).returning();
    if (!e) throw notFound("Expense");
    await recordAudit(tx, ctx, { action: "expense.deleted", targetType: "expense", targetId: id, targetLabel: e.vendor, productId: e.productId });
  });
}

export function nextRenewal(from: string, recurrence: string) {
  const d = new Date(`${from}T00:00:00Z`);
  const months = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : recurrence === "yearly" ? 12 : 0;
  d.setUTCMonth(d.getUTCMonth() + months);
  let iso = d.toISOString().slice(0, 10);
  // If the start date is in the past, roll forward to the first future occurrence.
  let guard = 0;
  while (months && iso < today() && guard++ < 600) {
    d.setUTCMonth(d.getUTCMonth() + months);
    iso = d.toISOString().slice(0, 10);
  }
  return iso;
}

/* ---------------- Revenue (manual) ---------------- */

export async function listRevenue(ctx: Ctx, f: { productId?: string } = {}) {
  assertCan(ctx, "finance.view");
  const where = [eq(revenueEntry.workspaceId, ctx.workspaceId)];
  if (f.productId) where.push(eq(revenueEntry.productId, f.productId));
  return db
    .select({ r: revenueEntry, productName: product.name })
    .from(revenueEntry)
    .leftJoin(product, eq(product.id, revenueEntry.productId))
    .where(and(...where))
    .orderBy(desc(revenueEntry.month))
    .limit(500)
    .then((rows) => rows.map((x) => ({ ...x.r, productName: x.productName })));
}

export async function createRevenue(ctx: Ctx, raw: z.input<typeof revenueInput>) {
  assertCan(ctx, "finance.edit");
  const { amount: amountMinor, month, ...input } = revenueInput.parse(raw);
  await assertRefs(ctx, input);
  await db.transaction(async (tx) => {
    const [r] = await tx.insert(revenueEntry).values({ ...input, month: `${month}-01`, amountMinor, workspaceId: ctx.workspaceId, createdBy: ctx.userId }).returning();
    await recordAudit(tx, ctx, { action: "revenue.recorded", targetType: "revenue", targetId: r!.id, targetLabel: `${month} ${input.kind}`, productId: r!.productId });
  });
}

export async function deleteRevenue(ctx: Ctx, id: string) {
  assertCan(ctx, "finance.edit");
  await db.transaction(async (tx) => {
    const [r] = await tx.delete(revenueEntry).where(and(eq(revenueEntry.id, id), eq(revenueEntry.workspaceId, ctx.workspaceId))).returning();
    if (!r) throw notFound("Revenue entry");
    await recordAudit(tx, ctx, { action: "revenue.deleted", targetType: "revenue", targetId: id, targetLabel: r.month, productId: r.productId });
  });
}

/* ---------------- Summary ---------------- */

export type CurrencyTotals = Record<string, number>;
const add = (t: CurrencyTotals, cur: string, v: number) => {
  t[cur] = (t[cur] ?? 0) + v;
};

/**
 * Run-rate and revenue grouped by currency. We never convert currencies silently;
 * mixed currencies are shown side by side with a warning.
 */
export async function financeSummary(ctx: Ctx, f: { productId?: string } = {}) {
  assertCan(ctx, "finance.view");
  const [expenses, revenue] = await Promise.all([listExpenses(ctx, { productId: f.productId }), listRevenue(ctx, { productId: f.productId })]);

  const monthlyCost: CurrencyTotals = {};
  const byProduct = new Map<string, { name: string; slug: string | null; totals: CurrencyTotals }>();
  const byCategory = new Map<string, CurrencyTotals>();
  let estimates = 0;
  for (const e of expenses) {
    const monthly = Math.round(e.amountMinor * MONTHLY_FACTOR[e.recurrence]);
    if (!monthly) continue;
    if (e.isEstimate) estimates++;
    add(monthlyCost, e.currency, monthly);
    const key = e.productId ?? "shared";
    const entry = byProduct.get(key) ?? { name: e.productName ?? "Shared / unallocated", slug: e.productSlug, totals: {} };
    add(entry.totals, e.currency, monthly);
    byProduct.set(key, entry);
    const cat = byCategory.get(e.category) ?? {};
    add(cat, e.currency, monthly);
    byCategory.set(e.category, cat);
  }

  const t = today();
  const renewals = expenses
    .filter((e) => e.nextRenewalDate && e.nextRenewalDate >= t && e.nextRenewalDate <= addDays(t, 30))
    .sort((a, b) => a.nextRenewalDate!.localeCompare(b.nextRenewalDate!));
  const overdueRenewals = expenses.filter((e) => e.nextRenewalDate && e.nextRenewalDate < t && e.recurrence !== "one_time");

  const lastMonth = (() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const thisMonth = t.slice(0, 7);
  const revenueByMonth = new Map<string, CurrencyTotals>();
  for (const r of revenue) {
    const m = r.month.slice(0, 7);
    const tot = revenueByMonth.get(m) ?? {};
    add(tot, r.currency, r.amountMinor);
    revenueByMonth.set(m, tot);
  }
  const currencies = new Set([...Object.keys(monthlyCost), ...revenue.map((r) => r.currency)]);

  return {
    monthlyCost,
    byProduct: [...byProduct.values()],
    byCategory: [...byCategory.entries()].map(([category, totals]) => ({ category, totals })),
    renewals,
    overdueRenewals,
    revenueThisMonth: revenueByMonth.get(thisMonth) ?? null,
    revenueLastMonth: revenueByMonth.get(lastMonth) ?? null,
    revenueMonths: [...revenueByMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12),
    hasRevenueData: revenue.length > 0,
    hasCostData: expenses.length > 0,
    estimates,
    mixedCurrencies: currencies.size > 1,
    lastMonthLabel: lastMonth,
    thisMonthLabel: thisMonth,
  };
}

export async function upcomingRenewals(ctx: Ctx, days = 30) {
  assertCan(ctx, "finance.view");
  const t = today();
  return db
    .select({ id: expense.id, vendor: expense.vendor, amountMinor: expense.amountMinor, currency: expense.currency, nextRenewalDate: expense.nextRenewalDate, productName: product.name })
    .from(expense)
    .leftJoin(product, eq(product.id, expense.productId))
    .where(and(eq(expense.workspaceId, ctx.workspaceId), eq(expense.status, "active"), gte(expense.nextRenewalDate, t), lte(expense.nextRenewalDate, addDays(t, days))))
    .orderBy(asc(expense.nextRenewalDate))
    .limit(10);
}
