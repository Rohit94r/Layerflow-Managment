"use client";

import { Download } from "lucide-react";
import { installAgentAction, updateAgentAction } from "@/modules/agents/actions";
import { ActionForm, Modal, SubmitButton } from "./forms";

type Option = { id: string; name: string };
type ToolInfo = { name: string; level: string; description: string };
type Values = { name: string; productId: string | null; ownerId: string | null; instructions: string; schedule: string; monthlyBudgetCents: number; allowedTools: string[] };

const LEVEL: Record<string, string> = { read: "Read-only", create_internal: "Creates internal drafts", approval: "Requires human approval" };

function Fields({ v, products, people, tools, defaults }: { v: Values; products: Option[]; people: Option[]; tools: ToolInfo[]; defaults: string[] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" defaultValue={v.name} required maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="productId">Scope</label>
          <select id="productId" name="productId" className="input" defaultValue={v.productId ?? ""}>
            <option value="">Whole workspace</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} only</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ownerId">Accountable owner</label>
          <select id="ownerId" name="ownerId" className="input" defaultValue={v.ownerId ?? ""}>
            <option value="">Me</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="hint">The agent acts with this person&apos;s permissions, never more.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="schedule">Schedule</label>
            <select id="schedule" name="schedule" className="input" defaultValue={v.schedule}>
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="monthlyBudgetDollars">Budget $/mo</label>
            <input id="monthlyBudgetDollars" name="monthlyBudgetDollars" type="number" min={0} max={1000} step="0.5" className="input" defaultValue={(v.monthlyBudgetCents / 100).toFixed(2)} />
          </div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="instructions">Instructions</label>
        <textarea id="instructions" name="instructions" className="input" rows={3} defaultValue={v.instructions} maxLength={4000} />
      </div>
      <fieldset>
        <legend className="label">Tools &amp; permissions</legend>
        <ul className="divide-y divide-line rounded-md border border-line">
          {tools.map((t) => {
            const required = defaults.includes(t.name);
            return (
              <li key={t.name} className="flex items-start gap-3 px-3 py-2 text-[13px]">
                <input type="checkbox" name="tools" value={t.name} defaultChecked={required || v.allowedTools.includes(t.name)} disabled={required} className="mt-1 accent-[var(--cobalt)]" aria-label={t.name} />
                <span className="flex-1">
                  <code className="font-mono text-[12px]">{t.name}</code> <span className="text-muted">· {LEVEL[t.level]}</span>
                  <span className="block text-[12px] text-ink-2">{t.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="hint">Core tools are always on for this agent. Tools that change things outside a draft always create an approval request.</p>
      </fieldset>
    </div>
  );
}

export function InstallAgent({ slug, agentKey, name, products, people, tools, defaults, schedule }: { slug: string; agentKey: string; name: string; products: Option[]; people: Option[]; tools: ToolInfo[]; defaults: string[]; schedule: string }) {
  return (
    <Modal title={`Install ${name}`} trigger={<><Download className="size-3.5" /> Install</>} triggerClassName="btn btn-primary btn-sm" wide>
      {(close) => (
        <ActionForm action={installAgentAction.bind(null, slug, agentKey)} className="space-y-4">
          <Fields v={{ name, productId: null, ownerId: null, instructions: "", schedule, monthlyBudgetCents: 500, allowedTools: [] }} products={products} people={people} tools={tools} defaults={defaults} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
            <SubmitButton>Install agent</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

export function AgentConfigForm({ slug, id, v, products, people, tools, defaults, canEdit }: { slug: string; id: string; v: Values; products: Option[]; people: Option[]; tools: ToolInfo[]; defaults: string[]; canEdit: boolean }) {
  return (
    <ActionForm action={updateAgentAction.bind(null, slug, id)} className="space-y-4 p-4">
      <fieldset disabled={!canEdit} className="contents">
        <Fields v={v} products={products} people={people} tools={tools} defaults={defaults} />
        {canEdit && <div className="flex justify-end"><SubmitButton>Save configuration</SubmitButton></div>}
      </fieldset>
    </ActionForm>
  );
}
