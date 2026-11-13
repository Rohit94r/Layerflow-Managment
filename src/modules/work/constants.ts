export const TASK_TYPES = ["task", "bug", "feature", "chore"] as const;
export const TASK_STATUSES = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const;
export const TASK_PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const OPEN_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review"];
export const BOARD_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review", "done"];

export const TASK_LABELS: Record<string, string> = {
  task: "Task", bug: "Bug", feature: "Feature", chore: "Chore",
  backlog: "Backlog", todo: "To do", in_progress: "In progress", in_review: "In review",
  done: "Done", cancelled: "Cancelled",
  urgent: "Urgent", high: "High", medium: "Medium", low: "Low", none: "No priority",
};
export const taskLabel = (v: string) => TASK_LABELS[v] ?? v;
