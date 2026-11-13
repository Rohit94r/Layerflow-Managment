import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";

export type ActorType = "human" | "system" | "integration" | "agent";

/** Append-only record of every mutation. Powers the activity timeline. */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorType: text("actor_type").$type<ActorType>().notNull().default("human"),
    action: text("action").notNull(), // e.g. product.created
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    targetLabel: text("target_label").notNull().default(""),
    productId: text("product_id"),
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("audit_workspace_product_idx").on(t.workspaceId, t.productId, t.createdAt),
  ],
);
