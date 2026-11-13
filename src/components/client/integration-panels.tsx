"use client";

import { RefreshCw, Unplug } from "lucide-react";
import { disconnectAction, mapResourceAction, refreshResourcesAction, syncNowAction } from "@/modules/integrations/actions";
import { ActionButton, ConfirmButton, InlineSelect } from "./forms";

export function ConnectionActions({ slug, connectionId, canManage }: { slug: string; connectionId: string; canManage: boolean }) {
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton onClick={() => syncNowAction(slug, connectionId)} className="btn btn-primary btn-sm">
        <RefreshCw className="size-3.5" /> Sync now
      </ActionButton>
      <ActionButton onClick={() => refreshResourcesAction(slug, connectionId)}>Rediscover properties</ActionButton>
      <ConfirmButton onConfirm={() => disconnectAction(slug, connectionId, false)} confirmLabel="Revoke access, keep data?">
        <Unplug className="size-3.5" /> Disconnect
      </ConfirmButton>
      <ConfirmButton onConfirm={() => disconnectAction(slug, connectionId, true)} className="btn btn-danger btn-sm" confirmLabel="Delete all synced data?">
        Disconnect & delete data
      </ConfirmButton>
    </div>
  );
}

export function ResourceMapper({
  slug, resourceId, productId, products, canManage,
}: { slug: string; resourceId: string; productId: string | null; products: { id: string; name: string }[]; canManage: boolean }) {
  const options = [{ value: "", label: "Not mapped — not synced" }, ...products.map((p) => ({ value: p.id, label: p.name }))];
  if (!canManage) return <span className="text-[13px]">{options.find((o) => o.value === (productId ?? ""))?.label}</span>;
  return <InlineSelect label="Map to product" value={productId ?? ""} options={options} onSave={(v) => mapResourceAction(slug, resourceId, v)} />;
}
