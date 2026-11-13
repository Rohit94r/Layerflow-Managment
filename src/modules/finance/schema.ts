import { bigint, boolean, date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";
import type { ExpenseCategory, Recurrence, RevenueKind } from "./constants";

/** A cost: a subscription, a renewal, or a one-off expense. Amounts are in minor units (cents). */
export const expense = pgTable(
  "expense",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    vendor: text("vendor").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").$type<ExpenseCategory>().notNull().default("other"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    recurrence: text("recurrence").$type<Recurrence>().notNull().default("monthly"),
    startDate: date("start_date"),
    nextRenewalDate: date("next_renewal_date"),
    isEstimate: boolean("is_estimate").notNull().default(false),
    status: text("status").$type<"active" | "cancelled">().notNull().default("active"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expense_workspace_status_idx").on(t.workspaceId, t.status),
    index("expense_workspace_renewal_idx").on(t.workspaceId, t.nextRenewalDate),
  ],
);

/** Manually recorded revenue for a month. Always labelled "manual" in the UI. */
export const revenueEntry = pgTable(
  "revenue_entry",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    month: date("month").notNull(), // first day of the month
    kind: text("kind").$type<RevenueKind>().notNull().default("subscription"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("revenue_workspace_month_idx").on(t.workspaceId, t.month)],
);
