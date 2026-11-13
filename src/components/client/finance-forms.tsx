"use client";

import { CalendarCheck, Pencil, Trash2, XCircle, RotateCcw } from "lucide-react";
import { EXPENSE_CATEGORIES, RECURRENCES, REVENUE_KINDS, financeLabel } from "@/modules/finance/constants";
import {
  createExpenseAction, createRevenueAction, deleteExpenseAction, deleteRevenueAction, markRenewedAction,
  setExpenseStatusAction, updateExpenseAction,
} from "@/modules/finance/actions";
import { ActionButton, ActionForm, ConfirmButton, Modal, SubmitButton } from "./forms";

type Option = { id: string; name: string };
type Expense = {
  id: string; vendor: string; description: string; category: string; amountMinor: number; currency: string;
  recurrence: string; productId: string | null; ownerId: string | null; startDate: string | null;
  nextRenewalDate: string | null; isEstimate: boolean; status: string;
};

function ExpenseFields({ e, products, people, currency }: { e?: Expense; products: Option[]; people: Option[]; currency: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="vendor">Vendor</label>
        <input id="vendor" name="vendor" className="input" defaultValue={e?.vendor} required maxLength={80} placeholder="Vercel, Namecheap, OpenAI…" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="category">Category</label>
        <select id="category" name="category" className="input" defaultValue={e?.category ?? "hosting"}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{financeLabel(c)}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <div>
          <label className="label" htmlFor="amount">Amount</label>
          <input id="amount" name="amount" inputMode="decimal" className="input tabular-nums" defaultValue={e ? (e.amountMinor / 100).toFixed(2) : ""} required placeholder="20.00" />
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <input id="currency" name="currency" className="input uppercase" defaultValue={e?.currency ?? currency} maxLength={3} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="recurrence">Billing</label>
        <select id="recurrence" name="recurrence" className="input" defaultValue={e?.recurrence ?? "monthly"}>
          {RECURRENCES.map((c) => <option key={c} value={c}>{financeLabel(c)}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="productId">Product</label>
        <select id="productId" name="productId" className="input" defaultValue={e?.productId ?? ""}>
          <option value="">Shared / unallocated</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="ownerId">Owner</label>
        <select id="ownerId" name="ownerId" className="input" defaultValue={e?.ownerId ?? ""}>
          <option value="">No owner</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="startDate">Started</label>
        <input id="startDate" name="startDate" type="date" className="input" defaultValue={e?.startDate ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="nextRenewalDate">Next renewal</label>
        <input id="nextRenewalDate" name="nextRenewalDate" type="date" className="input" defaultValue={e?.nextRenewalDate ?? ""} />
        <p className="hint">Left empty, it&apos;s calculated from the start date.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">Notes</label>
        <input id="description" name="description" className="input" defaultValue={e?.description} maxLength={300} placeholder="Plan, seats, what it's used for" />
      </div>
      <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
        <input type="checkbox" name="isEstimate" defaultChecked={e?.isEstimate} className="accent-[var(--cobalt)]" />
        This amount is an estimate (usage-based or not yet invoiced)
      </label>
    </div>
  );
}

export function AddExpense({ slug, products, people, currency, defaultProductId }: { slug: string; products: Option[]; people: Option[]; currency: string; defaultProductId?: string }) {
  return (
    <Modal title="Add a cost" trigger="Add cost" wide>
      {(close) => (
        <ActionForm action={createExpenseAction.bind(null, slug)} onSuccess={close} className="space-y-4">
          <ExpenseFields products={products} people={people} currency={currency} e={defaultProductId ? ({ productId: defaultProductId } as Expense) : undefined} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <SubmitButton>Add cost</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

export function ExpenseActions({ slug, e, products, people }: { slug: string; e: Expense; products: Option[]; people: Option[] }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {e.status === "active" && e.nextRenewalDate && e.recurrence !== "one_time" && (
        <ActionButton onClick={() => markRenewedAction(slug, e.id)} className="btn btn-ghost btn-sm" title="Mark renewed (moves the date forward)" successMessage="Renewal date moved forward.">
          <CalendarCheck className="size-3.5" />
        </ActionButton>
      )}
      <Modal title={`Edit ${e.vendor}`} trigger={<Pencil className="size-3.5" />} triggerClassName="btn btn-ghost btn-sm" wide>
        {(close) => (
          <ActionForm action={updateExpenseAction.bind(null, slug, e.id)} onSuccess={close} className="space-y-4">
            <ExpenseFields e={e} products={products} people={people} currency={e.currency} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Modal>
      {e.status === "active" ? (
        <ConfirmButton onConfirm={() => setExpenseStatusAction(slug, e.id, "cancelled")} className="btn btn-ghost btn-sm" confirmLabel="Cancelled?">
          <XCircle className="size-3.5" />
        </ConfirmButton>
      ) : (
        <ActionButton onClick={() => setExpenseStatusAction(slug, e.id, "active")} className="btn btn-ghost btn-sm" title="Reactivate">
          <RotateCcw className="size-3.5" />
        </ActionButton>
      )}
      <ConfirmButton onConfirm={() => deleteExpenseAction(slug, e.id)} className="btn btn-ghost btn-sm text-bad" confirmLabel="Delete?">
        <Trash2 className="size-3.5" />
      </ConfirmButton>
    </div>
  );
}

export function AddRevenue({ slug, products, currency, defaultProductId }: { slug: string; products: Option[]; currency: string; defaultProductId?: string }) {
  const month = new Date().toISOString().slice(0, 7);
  return (
    <Modal title="Record revenue" trigger="Record revenue" triggerClassName="btn btn-secondary">
      {(close) => (
        <ActionForm action={createRevenueAction.bind(null, slug)} onSuccess={close} className="space-y-4">
          <p className="text-[13px] text-muted">Manual entry. It&apos;s labelled as manual everywhere it appears. Payment-provider sync is planned for a later stage.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="month">Month</label>
              <input id="month" name="month" type="month" className="input" defaultValue={month} required />
            </div>
            <div>
              <label className="label" htmlFor="kind">Kind</label>
              <select id="kind" name="kind" className="input" defaultValue="subscription">
                {REVENUE_KINDS.map((k) => <option key={k} value={k}>{financeLabel(k)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div>
                <label className="label" htmlFor="amount">Amount</label>
                <input id="amount" name="amount" inputMode="decimal" className="input" required placeholder="0.00" />
              </div>
              <div>
                <label className="label" htmlFor="rcurrency">Currency</label>
                <input id="rcurrency" name="currency" className="input uppercase" defaultValue={currency} maxLength={3} required />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="rproduct">Product</label>
              <select id="rproduct" name="productId" className="input" defaultValue={defaultProductId ?? ""}>
                <option value="">Unallocated</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="note">Note</label>
              <input id="note" name="note" className="input" maxLength={200} placeholder="e.g. From Stripe dashboard, net of fees" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <SubmitButton>Record</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

export function DeleteRevenue({ slug, id }: { slug: string; id: string }) {
  return (
    <ConfirmButton onConfirm={() => deleteRevenueAction(slug, id)} className="btn btn-ghost btn-sm text-bad" confirmLabel="Delete?">
      <Trash2 className="size-3.5" />
    </ConfirmButton>
  );
}
