import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";

export type AutomationStatus = "active" | "paused" | "draft";
export type RunStatus = "succeeded" | "failed" | "skipped" | "dry_run";

/** A configured automation built from a template: Trigger → Conditions → Actions → (Approval) → Audit. */
export const automation = pgTable(
  "automation",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    template: text("template").notNull(),
    name: text("name").notNull(),
    status: text("status").$type<AutomationStatus>().notNull().default("active"),
    params: jsonb("params").$type<Record<string, number | string | boolean>>().notNull().default({}),
    productId: text("product_id").references(() => product.id, { onDelete: "cascade" }),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(1),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_ws_idx").on(t.workspaceId, t.status)],
);

export const automationRun = pgTable(
  "automation_run",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    automationId: text("automation_id").notNull().references(() => automation.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<"manual" | "schedule" | "dry_run">().notNull(),
    status: text("status").$type<RunStatus>().notNull(),
    matched: integer("matched").notNull().default(0),
    actionsTaken: jsonb("actions_taken").$type<{ action: string; target: string; result: string }[]>().notNull().default([]),
    summary: text("summary").notNull().default(""),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("automation_run_idx").on(t.workspaceId, t.automationId, t.startedAt)],
);

/** Idempotency ledger: an automation acts on a given subject at most once per dedupe key. */
export const automationEffect = pgTable(
  "automation_effect",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    automationId: text("automation_id").notNull().references(() => automation.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("automation_effect_unique").on(t.automationId, t.dedupeKey)],
);

/** Unified inbox: one row per recipient. */
export const inboxItem = pgTable(
  "inbox_item",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    severity: text("severity").$type<"info" | "warning" | "critical">().notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    sourceType: text("source_type").$type<"automation" | "agent" | "system" | "integration" | "approval">().notNull(),
    sourceId: text("source_id"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inbox_user_idx").on(t.workspaceId, t.userId, t.resolvedAt, t.createdAt),
    uniqueIndex("inbox_dedupe_unique").on(t.userId, t.dedupeKey),
  ],
);

/** A consequential action waiting for a human decision. Payload is shown exactly as it will execute. */
export const approval = pgTable(
  "approval",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    requestedByType: text("requested_by_type").$type<"automation" | "agent">().notNull(),
    requestedById: text("requested_by_id").notNull(),
    requestedByName: text("requested_by_name").notNull(),
    runId: text("run_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    risk: text("risk").$type<"low" | "medium" | "high">().notNull().default("low"),
    status: text("status").$type<"pending" | "approved" | "rejected" | "expired" | "failed">().notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    result: text("result"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("approval_ws_idx").on(t.workspaceId, t.status, t.createdAt)],
);
