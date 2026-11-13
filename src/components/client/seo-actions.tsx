"use client";

import { ListPlus, Play, X } from "lucide-react";
import { dismissInsightAction, insightToTaskAction, runAuditAction, runUptimeAction } from "@/modules/seo/actions";
import { ActionButton } from "./forms";

export function InsightActions({ slug, id, canTask, canRun }: { slug: string; id: string; canTask: boolean; canRun: boolean }) {
  return (
    <div className="flex gap-1.5">
      {canTask && (
        <ActionButton onClick={() => insightToTaskAction(slug, id)} className="btn btn-primary btn-sm">
          <ListPlus className="size-3.5" /> Create task
        </ActionButton>
      )}
      {canRun && (
        <ActionButton onClick={() => dismissInsightAction(slug, id)} className="btn btn-ghost btn-sm" title="Dismiss" successMessage="Dismissed.">
          <X className="size-3.5" />
        </ActionButton>
      )}
    </div>
  );
}

export function RunAuditButton({ slug, productId, label = "Run audit" }: { slug: string; productId: string; label?: string }) {
  return (
    <ActionButton onClick={() => runAuditAction(slug, productId)} className="btn btn-secondary btn-sm">
      <Play className="size-3.5" /> {label}
    </ActionButton>
  );
}

export function RunUptimeButton({ slug, productId }: { slug: string; productId: string }) {
  return (
    <ActionButton onClick={() => runUptimeAction(slug, productId)} className="btn btn-secondary btn-sm">
      <Play className="size-3.5" /> Check now
    </ActionButton>
  );
}
