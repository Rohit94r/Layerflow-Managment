import { index, integer, pgTable, text, uniqueIndex, date } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { workspace } from "../identity/schema";
import { integrationResource } from "../integrations/schema";

/**
 * Daily Google Analytics 4 totals for a property. Source: GA4 Data API runReport (dimension: date).
 * engagedSessions is stored (not engagement rate) so rates can be re-aggregated correctly over any window.
 */
export const analyticsDaily = pgTable(
  "analytics_daily",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => integrationResource.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    sessions: integer("sessions").notNull(),
    users: integer("users").notNull(),
    newUsers: integer("new_users").notNull(),
    pageViews: integer("page_views").notNull(),
    engagedSessions: integer("engaged_sessions").notNull(),
    keyEvents: integer("key_events").notNull(),
  },
  (t) => [uniqueIndex("analytics_daily_unique").on(t.resourceId, t.day), index("analytics_daily_ws_idx").on(t.workspaceId, t.resourceId, t.day)],
);

/** Channel / landing page / device breakdowns for the current and previous 28-day windows. Replaced on every sync. */
export const analyticsDimension = pgTable(
  "analytics_dimension",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => integrationResource.id, { onDelete: "cascade" }),
    dimension: text("dimension").$type<"channel" | "landing_page" | "device" | "source">().notNull(),
    window: text("window").$type<"current" | "previous">().notNull(),
    key: text("key").notNull(),
    sessions: integer("sessions").notNull(),
    users: integer("users").notNull(),
    engagedSessions: integer("engaged_sessions").notNull(),
    keyEvents: integer("key_events").notNull(),
  },
  (t) => [index("analytics_dimension_idx").on(t.resourceId, t.dimension, t.window)],
);
