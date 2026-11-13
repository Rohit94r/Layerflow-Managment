import type { Ctx } from "./permissions";
import { listTasks, type TaskFilters } from "../modules/work/service";
import { TASK_STATUSES, TASK_TYPES, type TaskStatus, type TaskType } from "../modules/work/constants";

type SP = Record<string, string | string[] | undefined>;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** Loads tasks for the board or list view from URL params. */
export async function loadWork(ctx: Ctx, sp: SP, fixedProductId?: string) {
  const layout = sp.layout === "list" ? "list" : "board";
  const status = str(sp.status);
  const type = str(sp.type);
  const filters: TaskFilters = {
    productId: fixedProductId ?? str(sp.product),
    assigneeId: str(sp.assignee),
    type: type && (TASK_TYPES as readonly string[]).includes(type) ? (type as TaskType) : undefined,
    q: str(sp.q),
    overdue: sp.overdue === "1",
  };
  if (layout === "board") {
    // Board shows every column; Done is limited to the most recent items to stay readable.
    const all = await listTasks(ctx, { ...filters, status: "all" });
    const done = all.filter((t) => t.status === "done").sort((a, b) => +b.updatedAt - +a.updatedAt).slice(0, 25);
    return { layout, tasks: [...all.filter((t) => t.status !== "done" && t.status !== "cancelled"), ...done], filters };
  }
  const s = status === "all" || status === "open" || (TASK_STATUSES as readonly string[]).includes(status ?? "") ? (status as TaskStatus | "open" | "all") : "open";
  return { layout, tasks: await listTasks(ctx, { ...filters, status: s }), filters };
}
