import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";

export type ConnectionStatus = "active" | "needs_reauth" | "error" | "revoked";
export type SyncStatus = "running" | "succeeded" | "partial" | "failed";

/** One authorised account at a provider. Tokens are AES-GCM encrypted; never sent to the browser. */
export const integrationConnection = pgTable(
  "integration_connection",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accountLabel: text("account_label").notNull().default(""),
    scopes: text("scopes").array().notNull().default([]),
    status: text("status").$type<ConnectionStatus>().notNull().default("active"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    connectedBy: text("connected_by").references(() => user.id, { onDelete: "set null" }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("integration_connection_ws_idx").on(t.workspaceId, t.provider)],
);

/** An external resource discovered through a connection (e.g. a Search Console property), optionally mapped to a product. */
export const integrationResource = pgTable(
  "integration_resource",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").notNull().references(() => integrationConnection.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    syncEnabled: integer("sync_enabled").notNull().default(1),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    dataThrough: text("data_through"), // last date with data, YYYY-MM-DD
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("integration_resource_unique").on(t.connectionId, t.externalId),
    index("integration_resource_product_idx").on(t.workspaceId, t.productId),
  ],
);

export const syncRun = pgTable(
  "sync_run",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").notNull().references(() => integrationConnection.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").references(() => integrationResource.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<"manual" | "schedule" | "connect">().notNull(),
    status: text("status").$type<SyncStatus>().notNull().default("running"),
    recordsWritten: integer("records_written").notNull().default(0),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("sync_run_conn_idx").on(t.workspaceId, t.connectionId, t.startedAt)],
);

/** Short-lived OAuth state with the PKCE verifier. Consumed once. */
export const oauthState = pgTable("oauth_state", {
  id: text("id").primaryKey(), // the state value's hash
  workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
