import { bigint, date, index, integer, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";

export type Horizon = "now" | "next" | "later" | "done";
export type GoalStatus = "on_track" | "at_risk" | "off_track" | "achieved" | "missed";

/** Now / Next / Later roadmap item. */
export const roadmapItem = pgTable(
  "roadmap_item",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    horizon: text("horizon").$type<Horizon>().notNull().default("next"),
    confidence: text("confidence").$type<"high" | "medium" | "low">().notNull().default("medium"),
    targetDate: date("target_date"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("roadmap_ws_idx").on(t.workspaceId, t.productId, t.horizon)],
);

/** A measurable goal (OKR key result style) with explicit current value and check-ins. */
export const goal = pgTable(
  "goal",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    metric: text("metric").notNull(),
    unit: text("unit").notNull().default(""),
    startValue: real("start_value").notNull().default(0),
    targetValue: real("target_value").notNull(),
    currentValue: real("current_value").notNull().default(0),
    dueDate: date("due_date"),
    status: text("status").$type<GoalStatus>().notNull().default("on_track"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    lastCheckInAt: timestamp("last_check_in_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goal_ws_idx").on(t.workspaceId, t.productId)],
);

/** Monthly budget for a product (or the whole workspace when productId is null), per currency. */
export const budget = pgTable(
  "budget",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "cascade" }),
    monthlyAmountMinor: bigint("monthly_amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("budget_unique").on(t.workspaceId, t.productId, t.currency)],
);
