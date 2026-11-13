import { date, index, pgTable, text, timestamp, uniqueIndex, boolean, type AnyPgColumn } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import type { Focus, Health, Lifecycle, LinkKind, Priority, ProductRole, ProductType } from "./constants";

export const productGroup = pgTable(
  "product_group",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_group_name_unique").on(t.workspaceId, t.name)],
);

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    type: text("type").$type<ProductType>().notNull().default("saas"),
    brandColor: text("brand_color").notNull().default("#1F3BD1"),

    // Five independent classification dimensions (master prompt §4.2).
    role: text("role").$type<ProductRole>().notNull().default("secondary"),
    lifecycle: text("lifecycle").$type<Lifecycle>().notNull().default("idea"),
    priority: text("priority").$type<Priority>().notNull().default("p2"),
    focus: text("focus").$type<Focus>().notNull().default("none"),
    health: text("health").$type<Health>().notNull().default("unknown"),
    healthReason: text("health_reason").notNull().default(""),
    healthUpdatedAt: timestamp("health_updated_at", { withTimezone: true }),

    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    groupId: text("group_id").references(() => productGroup.id, { onDelete: "set null" }),
    parentId: text("parent_id").references((): AnyPgColumn => product.id, { onDelete: "set null" }),

    businessModel: text("business_model").notNull().default(""),
    targetAudience: text("target_audience").notNull().default(""),
    techStack: text("tech_stack").array().notNull().default([]),
    tags: text("tags").array().notNull().default([]),
    strategicObjective: text("strategic_objective").notNull().default(""),
    launchDate: date("launch_date"),
    nextReviewDate: date("next_review_date"),
    pinned: boolean("pinned").notNull().default(false),

    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_slug_unique").on(t.workspaceId, t.slug),
    index("product_workspace_lifecycle_idx").on(t.workspaceId, t.lifecycle),
    index("product_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
  ],
);

export const productLink = pgTable(
  "product_link",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    kind: text("kind").$type<LinkKind>().notNull(),
    label: text("label").notNull().default(""),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_link_product_idx").on(t.workspaceId, t.productId)],
);
