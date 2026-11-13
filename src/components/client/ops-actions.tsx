"use client";

import { Check, Pause, Play, Power, Trash2, X, FlaskConical, CheckCheck } from "lucide-react";
import {
  automationKillSwitchAction, decideApprovalAction, deleteAutomationAction, markInboxAction, runAutomationAction, setAutomationStatusAction,
} from "@/modules/automation/actions";
import { agentKillSwitchAction, cancelRunAction, runAgentAction, setAgentStatusAction, uninstallAgentAction } from "@/modules/agents/actions";
import { deleteGoalAction, deleteRoadmapItemAction, moveRoadmapItemAction, deleteBudgetAction } from "@/modules/planning/actions";
import { ActionButton, ConfirmButton, InlineSelect } from "./forms";

export function ApprovalButtons({ slug, id }: { slug: string; id: string }) {
  return (
    <div className="flex gap-1.5">
      <ActionButton onClick={() => decideApprovalAction(slug, id, true)} className="btn btn-primary btn-sm"><Check className="size-3.5" /> Approve</ActionButton>
      <ActionButton onClick={() => decideApprovalAction(slug, id, false)} className="btn btn-secondary btn-sm"><X className="size-3.5" /> Reject</ActionButton>
    </div>
  );
}

export function InboxButtons({ slug, id }: { slug: string; id: string }) {
  return (
    <ActionButton onClick={() => markInboxAction(slug, [id], "resolve")} className="btn btn-ghost btn-sm" title="Mark done">
      <Check className="size-3.5" />
    </ActionButton>
  );
}

export function InboxBulk({ slug }: { slug: string }) {
  return (
    <div className="flex gap-2">
      <ActionButton onClick={() => markInboxAction(slug, "all", "read")}>Mark all read</ActionButton>
      <ConfirmButton onConfirm={() => markInboxAction(slug, "all", "resolve")} className="btn btn-secondary btn-sm" confirmLabel="Clear everything?"><CheckCheck className="size-3.5" /> Clear all</ConfirmButton>
    </div>
  );
}

export function KillSwitch({ slug, kind, paused }: { slug: string; kind: "automations" | "agents"; paused: boolean }) {
  const fn = kind === "automations" ? automationKillSwitchAction : agentKillSwitchAction;
  return paused ? (
    <ActionButton onClick={() => fn(slug, false)} className="btn btn-primary btn-sm"><Power className="size-3.5" /> Resume all {kind}</ActionButton>
  ) : (
    <ConfirmButton onConfirm={() => fn(slug, true)} className="btn btn-danger-outline btn-sm" confirmLabel={`Stop all ${kind}?`}><Power className="size-3.5" /> Kill switch</ConfirmButton>
  );
}

export function AutomationButtons({ slug, id, status, canManage }: { slug: string; id: string; status: string; canManage: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <ActionButton onClick={() => runAutomationAction(slug, id, true)} title="Dry run: show what would happen without changing anything"><FlaskConical className="size-3.5" /> Dry run</ActionButton>
      {canManage && (
        <>
          <ActionButton onClick={() => runAutomationAction(slug, id, false)} className="btn btn-primary btn-sm"><Play className="size-3.5" /> Run now</ActionButton>
          {status === "active" ? (
            <ActionButton onClick={() => setAutomationStatusAction(slug, id, "paused")}><Pause className="size-3.5" /> Pause</ActionButton>
          ) : (
            <ActionButton onClick={() => setAutomationStatusAction(slug, id, "active")}><Play className="size-3.5" /> Resume</ActionButton>
          )}
          <ConfirmButton onConfirm={() => deleteAutomationAction(slug, id)} className="btn btn-ghost btn-sm text-bad" confirmLabel="Delete?"><Trash2 className="size-3.5" /></ConfirmButton>
        </>
      )}
    </div>
  );
}

export function AgentButtons({ slug, id, status, canManage, canRun, runnable }: { slug: string; id: string; status: string; canManage: boolean; canRun: boolean; runnable: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {canRun && status === "active" && (
        <ActionButton onClick={() => runAgentAction(slug, id)} className="btn btn-primary btn-sm" title={runnable ? undefined : "Set ANTHROPIC_API_KEY on the server"}>
          <Play className="size-3.5" /> Run now
        </ActionButton>
      )}
      {canManage && (status === "active" ? (
        <ActionButton onClick={() => setAgentStatusAction(slug, id, "paused")}><Pause className="size-3.5" /> Pause</ActionButton>
      ) : (
        <ActionButton onClick={() => setAgentStatusAction(slug, id, "active")}><Play className="size-3.5" /> Resume</ActionButton>
      ))}
      {canManage && <ConfirmButton onConfirm={() => uninstallAgentAction(slug, id)} confirmLabel="Uninstall agent?"><Trash2 className="size-3.5" /> Uninstall</ConfirmButton>}
    </div>
  );
}

export function CancelRunButton({ slug, runId }: { slug: string; runId: string }) {
  return <ConfirmButton onConfirm={() => cancelRunAction(slug, runId)} confirmLabel="Stop this run?"><X className="size-3.5" /> Stop run</ConfirmButton>;
}

export function RoadmapItemControls({ slug, id, horizon, canEdit }: { slug: string; id: string; horizon: string; canEdit: boolean }) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-1">
      <InlineSelect label="Move" value={horizon} options={[{ value: "now", label: "Now" }, { value: "next", label: "Next" }, { value: "later", label: "Later" }, { value: "done", label: "Done" }]} onSave={(v) => moveRoadmapItemAction(slug, id, v)} className="text-[12px]" />
      <ConfirmButton onConfirm={() => deleteRoadmapItemAction(slug, id)} className="btn btn-ghost btn-sm text-muted" confirmLabel="Delete?"><Trash2 className="size-3" /></ConfirmButton>
    </div>
  );
}

export function DeleteGoal({ slug, id }: { slug: string; id: string }) {
  return <ConfirmButton onConfirm={() => deleteGoalAction(slug, id)} className="btn btn-ghost btn-sm text-muted" confirmLabel="Delete?"><Trash2 className="size-3" /></ConfirmButton>;
}

export function DeleteBudget({ slug, id }: { slug: string; id: string }) {
  return <ConfirmButton onConfirm={() => deleteBudgetAction(slug, id)} className="btn btn-ghost btn-sm text-muted" confirmLabel="Remove?"><Trash2 className="size-3" /></ConfirmButton>;
}
