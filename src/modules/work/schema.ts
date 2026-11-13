import { date, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";
import type { TaskPriority, TaskStatus, TaskType } from "./constants";

export const task = pgTable(
  "task",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    type: text("type").$type<TaskType>().notNull().default("task"),
    status: text("status").$type<TaskStatus>().notNull().default("todo"),
    priority: text("priority").$type<TaskPriority>().notNull().default("none"),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("task_number_unique").on(t.workspaceId, t.number),
    index("task_workspace_status_idx").on(t.workspaceId, t.status),
    index("task_workspace_product_idx").on(t.workspaceId, t.productId),
    index("task_workspace_assignee_idx").on(t.workspaceId, t.assigneeId),
  ],
);

export const taskComment = pgTable(
  "task_comment",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("task_comment_task_idx").on(t.workspaceId, t.taskId)],
);
