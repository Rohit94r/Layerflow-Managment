"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bug, Columns3, List, Plus } from "lucide-react";
import type { TaskRow } from "@/modules/work/service";
import { BOARD_STATUSES, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, taskLabel } from "@/modules/work/constants";
import { createTaskAction, patchTaskAction } from "@/modules/work/actions";
import { cn, daysUntil, formatDate, today } from "@/lib/format";
import { Avatar, Badge, EmptyState } from "@/components/ui";
import { ActionForm, InlineSelect, Modal, SubmitButton, useAction } from "./forms";

type Option = { id: string; name: string };
const PRIORITY_DOT: Record<string, string> = { urgent: "bg-bad", high: "bg-warn", medium: "bg-cobalt", low: "bg-muted", none: "bg-line-strong" };

export function NewTaskButton({
  slug,
  products,
  people,
  defaultProductId,
  autoOpen,
}: {
  slug: string;
  products: Option[];
  people: Option[];
  defaultProductId?: string;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (autoOpen) {
      const btn = document.getElementById("new-task-trigger")?.querySelector("button");
      btn?.click();
      router.replace(pathname, { scroll: false });
    }
  }, [autoOpen, pathname, router]);
  return (
    <span id="new-task-trigger">
      <Modal title="New task" trigger={<><Plus className="size-4" /> New task</>} wide>
        {(close) => (
          <ActionForm action={createTaskAction.bind(null, slug)} onSuccess={() => close()} className="space-y-4">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" name="title" className="input" required maxLength={200} autoFocus placeholder="What needs to happen?" />
            </div>
            <div>
              <label className="label" htmlFor="description">Details</label>
              <textarea id="description" name="description" className="input" rows={4} placeholder="Context, steps to reproduce, acceptance criteria…" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="type">Type</label>
                <select id="type" name="type" className="input" defaultValue="task">
                  {TASK_TYPES.map((t) => <option key={t} value={t}>{taskLabel(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="status">Status</label>
                <select id="status" name="status" className="input" defaultValue="todo">
                  {TASK_STATUSES.filter((s) => s !== "cancelled").map((s) => <option key={s} value={s}>{taskLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="priority">Priority</label>
                <select id="priority" name="priority" className="input" defaultValue="medium">
                  {TASK_PRIORITIES.map((s) => <option key={s} value={s}>{taskLabel(s)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="productId">Project</label>
                <select id="productId" name="productId" className="input" defaultValue={defaultProductId ?? ""}>
                  <option value="">No project</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="assigneeId">Assignee</label>
                <select id="assigneeId" name="assigneeId" className="input" defaultValue="">
                  <option value="">Unassigned</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="dueDate">Due</label>
                <input id="dueDate" name="dueDate" type="date" className="input" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
              <SubmitButton>Create task</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Modal>
    </span>
  );
}

function Due({ date, status }: { date: string | null; status: string }) {
  if (!date) return null;
  const late = date < today() && status !== "done" && status !== "cancelled";
  const d = daysUntil(date);
  return (
    <span className={cn("whitespace-nowrap text-[12px]", late ? "font-medium text-bad" : d <= 2 && status !== "done" ? "text-warn" : "text-muted")}>
      {late ? `${-d}d late` : d === 0 ? "Due today" : formatDate(date, { month: "short", day: "numeric" })}
    </span>
  );
}

export function WorkView({
  slug,
  tasks,
  people,
  canEdit,
  showProduct = true,
}: {
  slug: string;
  tasks: TaskRow[];
  people: Option[];
  canEdit: boolean;
  showProduct?: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const layout = params.get("layout") === "list" ? "list" : "board";
  const setLayout = (l: string) => {
    const next = new URLSearchParams(params.toString());
    if (l === "board") next.delete("layout");
    else next.set("layout", l);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const toggle = (
    <div className="flex rounded-md border border-line-strong bg-surface p-0.5">
      <button onClick={() => setLayout("board")} aria-label="Board view" className={cn("rounded p-1.5", layout === "board" ? "bg-ink text-bg" : "text-muted")}>
        <Columns3 className="size-4" />
      </button>
      <button onClick={() => setLayout("list")} aria-label="List view" className={cn("rounded p-1.5", layout === "list" ? "bg-ink text-bg" : "text-muted")}>
        <List className="size-4" />
      </button>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex justify-end">{toggle}</div>
      {layout === "board" ? (
        <Board slug={slug} tasks={tasks} canEdit={canEdit} showProduct={showProduct} />
      ) : (
        <TaskList slug={slug} tasks={tasks} people={people} canEdit={canEdit} showProduct={showProduct} />
      )}
    </div>
  );
}

function Board({ slug, tasks, canEdit, showProduct }: { slug: string; tasks: TaskRow[]; canEdit: boolean; showProduct: boolean }) {
  const { exec } = useAction();
  const [local, setLocal] = useState(tasks);
  const [over, setOver] = useState<string | null>(null);
  // Replace optimistic moves with fresh server data when it arrives.
  const [synced, setSynced] = useState(tasks);
  if (synced !== tasks) {
    setSynced(tasks);
    setLocal(tasks);
  }

  const move = (id: string, status: string) => {
    const t = local.find((x) => x.id === id);
    if (!t || t.status === status) return;
    setLocal((xs) => xs.map((x) => (x.id === id ? { ...x, status: status as TaskRow["status"] } : x)));
    exec(() => patchTaskAction(slug, id, "status", status));
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1000px] grid-cols-5 gap-3">
        {BOARD_STATUSES.map((status) => {
          const col = local.filter((t) => t.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData("text/task"), status);
              }}
              className={cn("flex min-h-[320px] flex-col rounded-lg border bg-sunken/50 p-2", over === status ? "border-cobalt bg-cobalt-soft/40" : "border-line")}
            >
              <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
                <span className="eyebrow">{taskLabel(status)}</span>
                <span className="text-[12px] text-muted">{col.length}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {col.map((t) => (
                  <li
                    key={t.id}
                    draggable={canEdit}
                    onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                    className={cn("rounded-md border border-line bg-surface shadow-[0_1px_0_rgba(11,21,87,0.04)] hover:border-line-strong", canEdit && "cursor-grab active:cursor-grabbing")}
                  >
                    <Link href={`/w/${slug}/work/${t.number}`} className="block p-2.5" draggable={false}>
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} title={taskLabel(t.priority)} />
                        <span className="text-[13.5px] leading-snug text-ink">{t.title}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted">#{t.number}</span>
                        {t.type === "bug" && <Bug className="size-3 text-bad" aria-label="Bug" />}
                        {showProduct && t.productName && (
                          <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-muted">
                            <span className="size-2 shrink-0 rounded-sm" style={{ background: t.productColor ?? undefined }} />
                            <span className="truncate">{t.productName}</span>
                          </span>
                        )}
                        <span className="ml-auto flex items-center gap-1.5">
                          <Due date={t.dueDate} status={t.status} />
                          {t.assigneeName && <Avatar name={t.assigneeName} className="size-5 text-[9px]" />}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {canEdit && <p className="mt-2 text-[12px] text-muted">Drag cards between columns to change status.</p>}
    </div>
  );
}

function TaskList({ slug, tasks, people, canEdit, showProduct }: { slug: string; tasks: TaskRow[]; people: Option[]; canEdit: boolean; showProduct: boolean }) {
  if (!tasks.length) return <div className="panel"><EmptyState compact title="No tasks match" /></div>;
  const statusOpts = TASK_STATUSES.map((s) => ({ value: s, label: taskLabel(s) }));
  const priorityOpts = TASK_PRIORITIES.map((s) => ({ value: s, label: taskLabel(s) }));
  const peopleOpts = [{ value: "", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))];
  return (
    <div className="panel overflow-x-auto">
      <table className="table min-w-[820px]">
        <thead>
          <tr>
            <th className="w-16">#</th>
            <th>Title</th>
            {showProduct && <th>Project</th>}
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className="font-mono text-[12px] text-muted">{t.number}</td>
              <td>
                <Link href={`/w/${slug}/work/${t.number}`} className="flex items-center gap-2 hover:text-cobalt">
                  {t.type === "bug" && <Badge tone="bad">Bug</Badge>}
                  {t.type === "feature" && <Badge tone="cobalt">Feature</Badge>}
                  <span className="line-clamp-1">{t.title}</span>
                </Link>
              </td>
              {showProduct && (
                <td className="text-[13px]">
                  {t.productSlug ? (
                    <Link href={`/w/${slug}/products/${t.productSlug}`} className="flex items-center gap-1.5 hover:text-cobalt">
                      <span className="size-2 rounded-sm" style={{ background: t.productColor ?? undefined }} />
                      {t.productName}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              )}
              <td>{canEdit ? <InlineSelect label="Status" value={t.status} options={statusOpts} onSave={(v) => patchTaskAction(slug, t.id, "status", v)} /> : taskLabel(t.status)}</td>
              <td>{canEdit ? <InlineSelect label="Priority" value={t.priority} options={priorityOpts} onSave={(v) => patchTaskAction(slug, t.id, "priority", v)} /> : taskLabel(t.priority)}</td>
              <td>{canEdit ? <InlineSelect label="Assignee" value={t.assigneeId ?? ""} options={peopleOpts} onSave={(v) => patchTaskAction(slug, t.id, "assigneeId", v)} /> : (t.assigneeName ?? "—")}</td>
              <td><Due date={t.dueDate} status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
