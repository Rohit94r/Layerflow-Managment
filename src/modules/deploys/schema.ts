import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { workspace } from "../identity/schema";
import { integrationResource } from "../integrations/schema";
import type { DeployState } from "../../integrations/providers/vercel";

export type { DeployState };

/**
 * Recent deployments of a Vercel project (an integration_resource of kind "vercel_project").
 * The product comes from the resource's mapping, so remapping a project needs no data migration.
 * Kept to the latest 50 per project; Vercel stays the source of truth for older history.
 */
export const deployment = pgTable(
  "deployment",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => integrationResource.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    url: text("url"),
    target: text("target").$type<"production" | "preview">().notNull(),
    state: text("state").$type<DeployState>().notNull(),
    branch: text("branch"),
    commitSha: text("commit_sha"),
    commitMessage: text("commit_message"),
    author: text("author"),
    inspectorUrl: text("inspector_url"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("deployment_unique").on(t.resourceId, t.externalId),
    index("deployment_resource_idx").on(t.resourceId, t.createdAt),
    index("deployment_ws_idx").on(t.workspaceId, t.target, t.createdAt),
  ],
);
