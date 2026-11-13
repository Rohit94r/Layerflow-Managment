"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { FOCUSES, HEALTHS, LIFECYCLES, LINK_KINDS, PRIORITIES, PRODUCT_ROLES, label } from "@/modules/portfolio/constants";
import { addLinkAction, patchProductAction, removeLinkAction } from "@/modules/portfolio/actions";
import { ActionForm, ConfirmButton, InlineSelect, SubmitButton } from "./forms";

const opts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: v === "none" ? "None" : label(v) }));

export function ClassificationEditor({
  slug,
  product,
  people,
  canEdit,
}: {
  slug: string;
  product: { id: string; lifecycle: string; health: string; priority: string; role: string; focus: string; ownerId: string | null };
  people: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const rows: [string, string, { value: string; label: string }[]][] = [
    ["lifecycle", "Stage", opts(LIFECYCLES)],
    ["health", "Health", opts(HEALTHS)],
    ["priority", "Priority", opts(PRIORITIES)],
    ["role", "Role", opts(PRODUCT_ROLES)],
    ["focus", "Focus", opts(FOCUSES)],
    ["ownerId", "Owner", [{ value: "", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))]],
  ];
  return (
    <dl className="divide-y divide-line">
      {rows.map(([field, l, options]) => {
        const value = String((product as Record<string, unknown>)[field] ?? "");
        return (
          <div key={field} className="flex items-center justify-between gap-3 px-4 py-1.5">
            <dt className="text-[13px] text-muted">{l}</dt>
            <dd>
              {canEdit ? (
                <InlineSelect label={l} value={value} options={options} onSave={(v) => patchProductAction(slug, product.id, field, v)} className="text-right" />
              ) : (
                <span className="text-[13px]">{options.find((o) => o.value === value)?.label ?? "—"}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function LinkManager({
  slug,
  productId,
  links,
  canEdit,
}: {
  slug: string;
  productId: string;
  links: { id: string; kind: string; label: string; url: string }[];
  canEdit: boolean;
}) {
  return (
    <div>
      {links.length ? (
        <ul className="divide-y divide-line">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-20 shrink-0 text-[12px] text-muted">{label(l.kind)}</span>
              <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="link flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13.5px]">
                <span className="truncate">{l.label || l.url.replace(/^https?:\/\//, "")}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
              {canEdit && (
                <ConfirmButton onConfirm={() => removeLinkAction(slug, l.id)} className="btn btn-ghost btn-sm text-muted" confirmLabel="Remove?">
                  <Trash2 className="size-3.5" />
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-[13px] text-muted">No links yet. Add the live site, repo, docs or analytics.</p>
      )}
      {canEdit && (
        <ActionForm action={addLinkAction.bind(null, slug, productId)} resetOnSuccess className="flex flex-wrap gap-2 border-t border-line p-3">
          <select name="kind" className="input w-auto" aria-label="Link type" defaultValue="domain">
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>{label(k)}</option>
            ))}
          </select>
          <input name="url" type="url" required placeholder="https://" className="input min-w-[160px] flex-1" aria-label="URL" />
          <SubmitButton className="btn-sm h-[2.125rem]">Add</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
