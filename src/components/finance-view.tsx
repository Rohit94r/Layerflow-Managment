import Link from "next/link";
import type { Ctx } from "@/server/permissions";
import { can } from "@/server/permissions";
import { financeSummary, listExpenses, listRevenue, type CurrencyTotals } from "@/modules/finance/service";
import { financeLabel } from "@/modules/finance/constants";
import { listPeople } from "@/modules/identity/service";
import { productOptions } from "@/modules/portfolio/service";
import { AddExpense, AddRevenue, DeleteRevenue, ExpenseActions } from "@/components/client/finance-forms";
import { BudgetForm } from "@/components/client/planning-forms";
import { DeleteBudget } from "@/components/client/ops-actions";
import { listBudgets } from "@/modules/planning/service";
import { Badge, EmptyState, Panel, SourceNote } from "@/components/ui";
import { daysUntil, formatDate, money } from "@/lib/format";

function Totals({ t, suffix = "" }: { t: CurrencyTotals | null; suffix?: string }) {
  if (!t || !Object.keys(t).length) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-col">
      {Object.entries(t).map(([cur, v]) => (
        <span key={cur} className="tabular-nums">{money(v, cur)}{suffix}</span>
      ))}
    </span>
  );
}

export async function FinanceView({ ctx, productId, currency }: { ctx: Ctx; productId?: string; currency: string }) {
  const [summary, expenses, cancelled, revenue, products, people, budgets] = await Promise.all([
    financeSummary(ctx, { productId }),
    listExpenses(ctx, { productId }),
    listExpenses(ctx, { productId, status: "cancelled" }),
    listRevenue(ctx, { productId }),
    productOptions(ctx),
    listPeople(ctx),
    productId ? Promise.resolve([]) : listBudgets(ctx),
  ]);
  const slug = ctx.workspaceSlug;
  const canEdit = can(ctx, "finance.edit");

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <AddRevenue slug={slug} products={products} currency={currency} defaultProductId={productId} />
          <AddExpense slug={slug} products={products} people={people} currency={currency} defaultProductId={productId} />
        </div>
      )}

      {(summary.mixedCurrencies || summary.estimates > 0) && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft/60 px-4 py-2.5 text-[13px] text-warn">
          {summary.mixedCurrencies && <p>Several currencies are in use. Totals are shown per currency and never converted silently.</p>}
          {summary.estimates > 0 && <p>{summary.estimates} cost{summary.estimates === 1 ? " is an estimate" : "s are estimates"}; run-rate may differ from invoices.</p>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel px-4 py-3.5">
          <div className="eyebrow">Monthly run-rate (costs)</div>
          <div className="mt-1.5 font-serif text-[1.6rem] leading-tight"><Totals t={summary.monthlyCost} /></div>
          <SourceNote>Recurring costs normalised to a month. One-time costs excluded.</SourceNote>
        </div>
        <div className="panel px-4 py-3.5">
          <div className="eyebrow">Revenue · {summary.lastMonthLabel}</div>
          <div className="mt-1.5 font-serif text-[1.6rem] leading-tight">
            {summary.hasRevenueData ? <Totals t={summary.revenueLastMonth} /> : <span className="text-muted">Not recorded</span>}
          </div>
          <SourceNote>Manual entries · last full month.</SourceNote>
        </div>
        <div className="panel px-4 py-3.5">
          <div className="eyebrow">Revenue · {summary.thisMonthLabel} so far</div>
          <div className="mt-1.5 font-serif text-[1.6rem] leading-tight">
            {summary.hasRevenueData ? <Totals t={summary.revenueThisMonth} /> : <span className="text-muted">Not recorded</span>}
          </div>
          <SourceNote>Manual entries · month in progress, incomplete.</SourceNote>
        </div>
      </div>

      {(summary.renewals.length > 0 || summary.overdueRenewals.length > 0) && (
        <Panel title="Renewals" action={<span className="text-[12px] text-muted">Next 30 days</span>}>
          <ul className="divide-y divide-line">
            {summary.overdueRenewals.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone="bad">Date passed</Badge>
                <span className="flex-1 font-medium">{e.vendor}</span>
                <span className="text-[12.5px] text-muted">was {formatDate(e.nextRenewalDate)} — mark renewed or cancel</span>
                {canEdit && <ExpenseActions slug={slug} e={e} products={products} people={people} />}
              </li>
            ))}
            {summary.renewals.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone={daysUntil(e.nextRenewalDate!) <= 7 ? "warn" : "neutral"}>
                  {daysUntil(e.nextRenewalDate!) === 0 ? "Today" : `${daysUntil(e.nextRenewalDate!)} days`}
                </Badge>
                <span className="flex-1 font-medium">{e.vendor}</span>
                <span className="text-[12.5px] text-muted">{e.productName ?? "Shared"}</span>
                <span className="tabular-nums">{money(e.amountMinor, e.currency)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!productId && (
        <Panel title="Budgets" action={<span className="text-[12px] text-muted">Monthly · compared with run-rate in the same currency</span>}>
          {budgets.length ? (
            <ul className="divide-y divide-line">
              {budgets.map((b) => {
                const spend = b.productId
                  ? (summary.byProduct.find((p) => p.name === b.productName)?.totals[b.currency] ?? 0)
                  : (summary.monthlyCost[b.currency] ?? 0);
                const share = spend / b.monthlyAmountMinor;
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="min-w-[140px] font-medium">{b.productName ?? "Whole workspace"}</span>
                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget used">
                      <div className={`h-full rounded-full ${share >= 1 ? "bg-bad" : share >= 0.9 ? "bg-warn" : "bg-chart"}`} style={{ width: `${Math.min(100, Math.round(share * 100))}%` }} />
                    </div>
                    <span className="text-[13px] tabular-nums text-ink-2">{money(Math.round(spend), b.currency)} of {money(b.monthlyAmountMinor, b.currency)} · {Math.round(share * 100)}%</span>
                    {canEdit && <span className="ml-auto"><DeleteBudget slug={slug} id={b.id} /></span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-4 text-[13px] text-muted">No budgets. Set a monthly budget and the “Budget threshold” automation can warn you before you exceed it.</p>
          )}
          {canEdit && <BudgetForm slug={slug} products={products} currency={currency} />}
        </Panel>
      )}

      {!productId && summary.byProduct.length > 0 && (
        <Panel title="Monthly cost by product">
          <table className="table">
            <tbody>
              {summary.byProduct
                .sort((a, b) => Object.values(b.totals)[0]! - Object.values(a.totals)[0]!)
                .map((r) => (
                  <tr key={r.name}>
                    <td>{r.slug ? <Link href={`/w/${slug}/products/${r.slug}/finance`} className="hover:text-cobalt">{r.name}</Link> : <span className="text-muted">{r.name}</span>}</td>
                    <td className="text-right"><Totals t={r.totals} suffix=" /mo" /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Costs" action={<span className="text-[12px] text-muted">{expenses.length} active</span>}>
        {expenses.length ? (
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Category</th>
                  {!productId && <th>Product</th>}
                  <th className="text-right">Amount</th>
                  <th>Billing</th>
                  <th>Renews</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="font-medium">{e.vendor}</div>
                      {e.description && <div className="max-w-[260px] truncate text-[12px] text-muted">{e.description}</div>}
                    </td>
                    <td className="text-[13px]">{financeLabel(e.category)}</td>
                    {!productId && <td className="text-[13px]">{e.productName ?? <span className="text-muted">Shared</span>}</td>}
                    <td className="text-right tabular-nums">
                      {money(e.amountMinor, e.currency)}
                      {e.isEstimate && <span className="ml-1 text-[11px] text-warn" title="Estimate">est.</span>}
                    </td>
                    <td className="text-[13px]">{financeLabel(e.recurrence)}</td>
                    <td className="text-[13px]">{e.recurrence === "one_time" ? "—" : formatDate(e.nextRenewalDate)}</td>
                    {canEdit && <td><ExpenseActions slug={slug} e={e} products={products} people={people} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title="No costs recorded">
            Log hosting, domains, APIs, AI tokens and tools. Renewals then appear on the command center before they charge.
          </EmptyState>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Revenue entries" action={<Badge tone="outline">Manual</Badge>}>
          {revenue.length ? (
            <ul className="divide-y divide-line">
              {revenue.slice(0, 24).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-20 text-[13px] text-muted">{r.month.slice(0, 7)}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {r.productName ?? "Unallocated"} · {financeLabel(r.kind)}
                    {r.note && <span className="text-muted"> · {r.note}</span>}
                  </span>
                  <span className="tabular-nums">{money(r.amountMinor, r.currency)}</span>
                  {canEdit && <DeleteRevenue slug={slug} id={r.id} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-[13px] text-muted">No revenue recorded. Revenue shows as &ldquo;Not recorded&rdquo; rather than zero until you add it.</p>
          )}
        </Panel>
        <Panel title="Cancelled">
          {cancelled.length ? (
            <ul className="divide-y divide-line">
              {cancelled.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1 text-[13px] text-muted line-through">{e.vendor}</span>
                  <span className="tabular-nums text-[13px] text-muted">{money(e.amountMinor, e.currency)}</span>
                  {canEdit && <ExpenseActions slug={slug} e={e} products={products} people={people} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-5 text-[13px] text-muted">Nothing cancelled.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
