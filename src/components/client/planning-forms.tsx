"use client";

import { Plus } from "lucide-react";
import { checkInGoalAction, createGoalAction, createRoadmapItemAction, setBudgetAction } from "@/modules/planning/actions";
import { ActionForm, Modal, SubmitButton } from "./forms";

type Option = { id: string; name: string };

function ProductSelect({ products, defaultId }: { products: Option[]; defaultId?: string }) {
  if (defaultId) return <input type="hidden" name="productId" value={defaultId} />;
  return (
    <div>
      <label className="label" htmlFor="productId">Product</label>
      <select id="productId" name="productId" className="input" defaultValue="">
        <option value="">Portfolio-wide</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

export function AddRoadmapItem({ slug, products, productId }: { slug: string; products: Option[]; productId?: string }) {
  return (
    <Modal title="Add to roadmap" trigger={<><Plus className="size-4" /> Roadmap item</>} triggerClassName="btn btn-secondary">
      {(close) => (
        <ActionForm action={createRoadmapItemAction.bind(null, slug)} onSuccess={close} className="space-y-4">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="input" required maxLength={200} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="description">Why it matters</label>
            <textarea id="description" name="description" className="input" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="horizon">Horizon</label>
              <select id="horizon" name="horizon" className="input" defaultValue="next">
                <option value="now">Now</option><option value="next">Next</option><option value="later">Later</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="confidence">Confidence</label>
              <select id="confidence" name="confidence" className="input" defaultValue="medium">
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="targetDate">Target date</label>
              <input id="targetDate" name="targetDate" type="date" className="input" />
            </div>
            <ProductSelect products={products} defaultId={productId} />
          </div>
          <div className="flex justify-end"><SubmitButton>Add</SubmitButton></div>
        </ActionForm>
      )}
    </Modal>
  );
}

export function AddGoal({ slug, products, productId }: { slug: string; products: Option[]; productId?: string }) {
  return (
    <Modal title="New goal" trigger={<><Plus className="size-4" /> Goal</>} triggerClassName="btn btn-primary">
      {(close) => (
        <ActionForm action={createGoalAction.bind(null, slug)} onSuccess={close} className="space-y-4">
          <div>
            <label className="label" htmlFor="gtitle">Goal</label>
            <input id="gtitle" name="title" className="input" required maxLength={200} placeholder="e.g. Reach 100 paying customers" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="metric">Metric</label>
              <input id="metric" name="metric" className="input" required placeholder="Paying customers" />
            </div>
            <div>
              <label className="label" htmlFor="unit">Unit</label>
              <input id="unit" name="unit" className="input" placeholder="customers, $, %" />
            </div>
            <div>
              <label className="label" htmlFor="startValue">Start</label>
              <input id="startValue" name="startValue" type="number" step="any" className="input" defaultValue={0} />
            </div>
            <div>
              <label className="label" htmlFor="targetValue">Target</label>
              <input id="targetValue" name="targetValue" type="number" step="any" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="currentValue">Current</label>
              <input id="currentValue" name="currentValue" type="number" step="any" className="input" defaultValue={0} />
            </div>
            <div>
              <label className="label" htmlFor="dueDate">Due</label>
              <input id="dueDate" name="dueDate" type="date" className="input" />
            </div>
          </div>
          <ProductSelect products={products} defaultId={productId} />
          <div className="flex justify-end"><SubmitButton>Create goal</SubmitButton></div>
        </ActionForm>
      )}
    </Modal>
  );
}

export function CheckIn({ slug, id, current }: { slug: string; id: string; current: number }) {
  return (
    <ActionForm action={checkInGoalAction.bind(null, slug, id)} className="flex gap-1.5">
      <input name="value" type="number" step="any" defaultValue={current} className="input h-7 w-24 text-[12.5px]" aria-label="New value" />
      <SubmitButton className="btn-sm">Check in</SubmitButton>
    </ActionForm>
  );
}

export function BudgetForm({ slug, products, currency }: { slug: string; products: Option[]; currency: string }) {
  return (
    <ActionForm action={setBudgetAction.bind(null, slug)} resetOnSuccess className="flex flex-wrap items-end gap-2 border-t border-line p-3">
      <select name="productId" className="input w-auto" aria-label="Budget scope" defaultValue="">
        <option value="">Whole workspace</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="amount" inputMode="decimal" className="input w-28" placeholder="Monthly" aria-label="Monthly amount" required />
      <input name="currency" className="input w-20 uppercase" defaultValue={currency} maxLength={3} aria-label="Currency" />
      <SubmitButton className="btn-sm h-[2.125rem]">Set budget</SubmitButton>
    </ActionForm>
  );
}
