"use client";

import Link from "next/link";
import { useState } from "react";
import { Pin } from "lucide-react";
import type { ProductRow } from "@/modules/portfolio/service";
import { FOCUSES, HEALTHS, LIFECYCLES, PRIORITIES, label } from "@/modules/portfolio/constants";
import { bulkUpdateAction, patchProductAction } from "@/modules/portfolio/actions";
import { cn, relativeTime } from "@/lib/format";
import { Avatar, Badge, HealthBadge, ProductMark } from "@/components/ui";
import { InlineSelect, useAction } from "./forms";

const opts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: label(v) }));

export function ProductTable({
  slug,
  rows,
  canEdit,
  groups,
  counts,
}: {
  slug: string;
  rows: ProductRow[];
  canEdit: boolean;
  groups: { id: string; name: string }[];
  counts: Record<string, { open: number; overdue: number }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { pending, exec } = useAction();
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const bulk = (field: string, value: string) => {
    if (!value) return;
    exec(async () => {
      const r = await bulkUpdateAction(slug, [...selected], { [field]: value });
      if (r.ok) setSelected(new Set());
      return r;
    });
  };

  return (
    <div className="panel overflow-hidden">
      {canEdit && selected.size > 0 && (
        <div className={cn("flex flex-wrap items-center gap-2 border-b border-line bg-cobalt-soft px-4 py-2", pending && "opacity-60")}>
          <span className="text-[13px] font-medium text-cobalt">{selected.size} selected</span>
          {[
            ["lifecycle", "Set stage", LIFECYCLES],
            ["priority", "Set priority", PRIORITIES],
            ["focus", "Set focus", FOCUSES],
          ].map(([field, l, xs]) => (
            <select key={field as string} className="input input-bare w-auto bg-surface" value="" onChange={(e) => bulk(field as string, e.target.value)} aria-label={l as string}>
              <option value="">{l as string}…</option>
              {opts(xs as readonly string[]).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
          {groups.length > 0 && (
            <select className="input input-bare w-auto bg-surface" value="" onChange={(e) => bulk("groupId", e.target.value === "__none" ? "" : e.target.value)} aria-label="Move to group">
              <option value="">Move to group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table min-w-[860px]">
          <thead>
            <tr>
              {canEdit && (
                <th className="w-8">
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />
                </th>
              )}
              <th>Project</th>
              <th>Stage</th>
              <th>Priority</th>
              <th>Health</th>
              <th>Work</th>
              <th>Owner</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const c = counts[p.id];
              return (
                <tr key={p.id} className={selected.has(p.id) ? "bg-cobalt-soft/50" : undefined}>
                  {canEdit && (
                    <td>
                      <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                  )}
                  <td>
                    <Link href={`/w/${slug}/products/${p.slug}`} className="flex items-center gap-3">
                      <ProductMark name={p.name} color={p.brandColor} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium text-ink hover:text-cobalt">
                          {p.name}
                          {p.pinned && <Pin className="size-3 text-cobalt" aria-label="Pinned" />}
                          {p.focus !== "none" && <Badge tone="cobalt" className="ml-1">{label(p.focus)}</Badge>}
                        </span>
                        <span className="block max-w-[320px] truncate text-[12.5px] text-muted">
                          {p.summary || label(p.type)}
                          {p.groupName ? ` · ${p.groupName}` : ""}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {canEdit ? (
                      <InlineSelect label="Stage" value={p.lifecycle} options={opts(LIFECYCLES)} onSave={(v) => patchProductAction(slug, p.id, "lifecycle", v)} />
                    ) : (
                      label(p.lifecycle)
                    )}
                  </td>
                  <td>
                    {canEdit ? (
                      <InlineSelect label="Priority" value={p.priority} options={opts(PRIORITIES)} onSave={(v) => patchProductAction(slug, p.id, "priority", v)} />
                    ) : (
                      label(p.priority)
                    )}
                  </td>
                  <td title={p.healthReason || undefined}>
                    {canEdit ? (
                      <InlineSelect label="Health" value={p.health} options={opts(HEALTHS)} onSave={(v) => patchProductAction(slug, p.id, "health", v)} />
                    ) : (
                      <HealthBadge health={p.health} />
                    )}
                  </td>
                  <td className="whitespace-nowrap text-[13px]">
                    {c?.open ? (
                      <Link href={`/w/${slug}/products/${p.slug}/work`} className="hover:text-cobalt">
                        {c.open} open{c.overdue ? <span className="text-bad"> · {c.overdue} late</span> : null}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="flex items-center gap-2 text-[13px]">
                      <Avatar name={p.ownerName} />
                      <span className="hidden truncate xl:inline">{p.ownerName ?? "Unassigned"}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[12.5px] text-muted">{relativeTime(p.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
