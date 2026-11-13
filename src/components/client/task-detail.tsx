"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, taskLabel } from "@/modules/work/constants";
import { commentAction, deleteTaskAction, patchTaskAction, updateTaskAction } from "@/modules/work/actions";
import { formatDate, relativeTime } from "@/lib/format";
import { Avatar } from "@/components/ui";
import { ActionForm, ConfirmButton, InlineSelect, SubmitButton } from "./forms";
import { Markdown } from "../markdown";

type Option = { id: string; name: string };
type Task = {
  id: string; number: number; title: string; description: string; type: string; status: string; priority: string;
  productId: string | null; assigneeId: string | null; dueDate: string | null; createdAt: string; updatedAt: string;
  completedAt: string | null; comments: { id: string; body: string; createdAt: string; authorName: string | null }[];
};

export function TaskDetail({
  slug, task, people, products, history, canEdit,
}: {
  slug: string;
  task: Task;
  people: Option[];
  products: Option[];
  history: { id: string; actorName: string | null; action: string; changes: Record<string, { from: unknown; to: unknown }> | null; createdAt: string }[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const field = (name: "status" | "priority" | "type" | "assigneeId" | "productId", l: string, value: string, options: { value: string; label: string }[]) => (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-[13px] text-muted">{l}</span>
      {canEdit ? (
        <InlineSelect label={l} value={value} options={options} onSave={(v) => patchTaskAction(slug, task.id, name, v)} className="max-w-[60%] text-right" />
      ) : (
        <span className="text-[13px]">{options.find((o) => o.value === value)?.label ?? "—"}</span>
      )}
    </div>
  );

  const timeline = [
    ...task.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
    ...history.filter((h) => h.action !== "task.commented").map((h) => ({ kind: "event" as const, at: h.createdAt, h })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {editing ? (
          <ActionForm action={updateTaskAction.bind(null, slug, task.id)} onSuccess={() => setEditing(false)} className="panel space-y-4 p-5">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" name="title" className="input text-[15px]" defaultValue={task.title} required maxLength={200} />
            </div>
            <div>
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" name="description" className="input font-mono text-[13px]" rows={12} defaultValue={task.description} />
              <p className="hint">Markdown supported: **bold**, lists, `code`, links.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <div>
            <div className="flex items-start gap-3">
              <h1 className="flex-1 text-[1.75rem] leading-tight">{task.title}</h1>
              {canEdit && (
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" /> Edit
                </button>
              )}
            </div>
            <div className="panel mt-4 p-5">
              {task.description ? <Markdown source={task.description} /> : <p className="text-muted">No description.</p>}
            </div>
          </div>
        )}

        <h2 className="mb-3 mt-8 text-lg">Discussion</h2>
        <ol className="space-y-3">
          {timeline.map((item) =>
            item.kind === "comment" ? (
              <li key={item.c.id} className="panel p-4">
                <div className="mb-2 flex items-center gap-2 text-[12.5px]">
                  <Avatar name={item.c.authorName} className="size-5 text-[9px]" />
                  <span className="font-medium">{item.c.authorName ?? "Former member"}</span>
                  <span className="text-muted">{relativeTime(item.c.createdAt)}</span>
                </div>
                <Markdown source={item.c.body} />
              </li>
            ) : (
              <li key={item.h.id} className="flex items-center gap-2 px-1 text-[12.5px] text-muted">
                <span className="size-1.5 rounded-full bg-line-strong" />
                <span>
                  <span className="text-ink-2">{item.h.actorName ?? "Someone"}</span>{" "}
                  {item.h.action === "task.created"
                    ? "created this task"
                    : item.h.changes?.status
                      ? `moved to ${taskLabel(String(item.h.changes.status.to))}`
                      : `updated ${Object.keys(item.h.changes ?? {}).map((k) => k.replace(/Id$/, "")).join(", ") || "the task"}`}
                </span>
                <span>· {relativeTime(item.h.createdAt)}</span>
              </li>
            ),
          )}
        </ol>
        {canEdit && (
          <ActionForm action={commentAction.bind(null, slug, task.id)} resetOnSuccess toastOnSuccess={false} className="mt-4">
            <textarea name="body" className="input" rows={3} placeholder="Add a comment… (Markdown supported)" required aria-label="Comment" />
            <div className="mt-2 flex justify-end">
              <SubmitButton>Comment</SubmitButton>
            </div>
          </ActionForm>
        )}
      </div>

      <aside className="space-y-4">
        <div className="panel px-4 py-2">
          {field("status", "Status", task.status, TASK_STATUSES.map((s) => ({ value: s, label: taskLabel(s) })))}
          {field("priority", "Priority", task.priority, TASK_PRIORITIES.map((s) => ({ value: s, label: taskLabel(s) })))}
          {field("type", "Type", task.type, TASK_TYPES.map((s) => ({ value: s, label: taskLabel(s) })))}
          {field("assigneeId", "Assignee", task.assigneeId ?? "", [{ value: "", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))])}
          {field("productId", "Product", task.productId ?? "", [{ value: "", label: "No product" }, ...products.map((p) => ({ value: p.id, label: p.name }))])}
          <div className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-[13px] text-muted">Due</span>
            {canEdit ? (
              <input
                type="date"
                aria-label="Due date"
                className="input input-bare w-auto"
                defaultValue={task.dueDate ?? ""}
                onChange={(e) => patchTaskAction(slug, task.id, "dueDate", e.target.value)}
              />
            ) : (
              <span className="text-[13px]">{formatDate(task.dueDate)}</span>
            )}
          </div>
        </div>
        <div className="px-1 text-[12px] leading-relaxed text-muted">
          Created {formatDate(task.createdAt)} · updated {relativeTime(task.updatedAt)}
          {task.completedAt && <> · completed {formatDate(task.completedAt)}</>}
        </div>
        {canEdit && (
          <ConfirmButton onConfirm={() => deleteTaskAction(slug, task.id)} confirmLabel="Delete this task?">
            <Trash2 className="size-3.5" /> Delete task
          </ConfirmButton>
        )}
      </aside>
    </div>
  );
}
