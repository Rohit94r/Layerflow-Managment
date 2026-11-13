import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";

export type AgentStatus = "active" | "paused" | "disabled";
export type AgentRunStatus = "queued" | "running" | "waiting_for_approval" | "succeeded" | "failed" | "cancelled" | "timed_out";

/** A configured agent in a workspace, installed from the first-party catalog. */
export const agentInstance = pgTable(
  "agent_instance",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    agentKey: text("agent_key").notNull(),
    agentVersion: text("agent_version").notNull(),
    name: text("name").notNull(),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    status: text("status").$type<AgentStatus>().notNull().default("active"),
    instructions: text("instructions").notNull().default(""),
    schedule: text("schedule").$type<"manual" | "daily" | "weekly">().notNull().default("manual"),
    monthlyBudgetCents: integer("monthly_budget_cents").notNull().default(500),
    allowedTools: text("allowed_tools").array().notNull().default([]),
    configVersion: integer("config_version").notNull().default(1),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_instance_ws_idx").on(t.workspaceId, t.status)],
);

export const agentRun = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull().references(() => agentInstance.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<"manual" | "schedule">().notNull(),
    status: text("status").$type<AgentRunStatus>().notNull().default("queued"),
    currentStep: text("current_step"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0), // USD × 1e6
    output: text("output"),
    error: text("error"),
    startedBy: text("started_by").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("agent_run_idx").on(t.workspaceId, t.instanceId, t.startedAt)],
);

/** Human-readable timeline of a run: model turns and structured tool calls (redacted). No hidden reasoning. */
export const agentRunStep = pgTable(
  "agent_run_step",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    runId: text("run_id").notNull().references(() => agentRun.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    kind: text("kind").$type<"model" | "tool_call" | "approval" | "output" | "error">().notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    input: jsonb("input").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    status: text("status").$type<"ok" | "denied" | "error" | "pending">().notNull().default("ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_step_run_idx").on(t.runId, t.seq)],
);
