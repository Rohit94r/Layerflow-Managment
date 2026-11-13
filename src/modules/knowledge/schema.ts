import { date, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";
import type { DocKind, DocStatus } from "./constants";

export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    kind: text("kind").$type<DocKind>().notNull().default("doc"),
    status: text("status").$type<DocStatus>().notNull().default("draft"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    revisitDate: date("revisit_date"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("document_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
    index("document_workspace_product_idx").on(t.workspaceId, t.productId),
  ],
);
