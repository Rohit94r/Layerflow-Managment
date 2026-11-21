"use client";

import { Plus } from "lucide-react";
import { createAutomationAction } from "@/modules/automation/actions";
import { ActionForm, Modal, SubmitButton } from "./forms";

type Tpl = { key: string; name: string; description: string; trigger: string; actionLabel: string; canRequireApproval: boolean; params: { key: string; label: string; type: "number" | "select"; default: number | string; options?: string[] }[] };

export function AddAutomation({ slug, t, products }: { slug: string; t: Tpl; products: { id: string; name: string }[] }) {
  return (
    <Modal title={t.name} trigger={<><Plus className="size-3.5" /> Add</>} triggerClassName="btn btn-secondary btn-sm">
      {(close) => (
        <ActionForm action={createAutomationAction.bind(null, slug, t.key)} onSuccess={close} className="space-y-4">
          <p className="text-[13px] text-ink-2">{t.description}</p>
          <dl className="grid grid-cols-[90px_1fr] gap-1 text-[12.5px]">
            <dt className="text-muted">Trigger</dt><dd>{t.trigger}</dd>
            <dt className="text-muted">Action</dt><dd>{t.actionLabel}</dd>
          </dl>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" className="input" defaultValue={t.name} maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="productId">Scope</label>
            <select id="productId" name="productId" className="input" defaultValue="">
              <option value="">All projects</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {t.params.map((p) => (
            <div key={p.key}>
              <label className="label" htmlFor={`param_${p.key}`}>{p.label}</label>
              {p.type === "select" ? (
                <select id={`param_${p.key}`} name={`param_${p.key}`} className="input" defaultValue={String(p.default)}>
                  {p.options!.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input id={`param_${p.key}`} name={`param_${p.key}`} type="number" min={0} className="input" defaultValue={String(p.default)} />
              )}
            </div>
          ))}
          {t.canRequireApproval && (
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" name="requiresApproval" defaultChecked className="mt-1 accent-[var(--cobalt)]" />
              <span>Require approval before acting <span className="block text-[12px] text-muted">Recommended. Each proposed action waits in the approvals queue.</span></span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <SubmitButton>Activate</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}
