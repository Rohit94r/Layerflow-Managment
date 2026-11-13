import { boolean, date, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";
import { integrationResource } from "../integrations/schema";
import { task } from "../work/schema";

/** Daily Search Console totals for a property. Source: Search Console API, searchAnalytics.query (dimension: date). */
export const seoDaily = pgTable(
  "seo_daily",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => integrationResource.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: real("ctr").notNull(),
    position: real("position").notNull(),
  },
  (t) => [uniqueIndex("seo_daily_unique").on(t.resourceId, t.day), index("seo_daily_ws_idx").on(t.workspaceId, t.resourceId, t.day)],
);

/** Query / page breakdowns for the current and previous 28-day windows. Replaced on every sync. */
export const seoDimension = pgTable(
  "seo_dimension",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").notNull().references(() => integrationResource.id, { onDelete: "cascade" }),
    dimension: text("dimension").$type<"query" | "page" | "country" | "device">().notNull(),
    window: text("window").$type<"current" | "previous">().notNull(),
    key: text("key").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    ctr: real("ctr").notNull(),
    position: real("position").notNull(),
  },
  (t) => [index("seo_dimension_idx").on(t.resourceId, t.dimension, t.window)],
);

export type InsightKind = "low_ctr" | "striking_distance" | "declining_page" | "declining_query" | "technical";

/** A deterministic, evidence-backed opportunity or problem. */
export const seoInsight = pgTable(
  "seo_insight",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    resourceId: text("resource_id").references(() => integrationResource.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    kind: text("kind").$type<InsightKind>().notNull(),
    key: text("key").notNull(),
    title: text("title").notNull(),
    evidence: jsonb("evidence").$type<Record<string, string | number>>().notNull(),
    confidence: text("confidence").$type<"high" | "medium" | "low">().notNull().default("medium"),
    nextAction: text("next_action").notNull(),
    status: text("status").$type<"open" | "task_created" | "dismissed" | "resolved">().notNull().default("open"),
    taskId: text("task_id").references(() => task.id, { onDelete: "set null" }),
    periodLabel: text("period_label").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("seo_insight_unique").on(t.workspaceId, t.kind, t.key, t.resourceId),
    index("seo_insight_ws_idx").on(t.workspaceId, t.status, t.productId),
  ],
);

export type AuditIssue = { severity: "error" | "warning" | "notice"; code: string; message: string; url: string };
export type AuditPage = {
  url: string; status: number | null; ms: number | null; redirectedTo?: string; title?: string; description?: string;
  canonical?: string; h1Count?: number; noindex?: boolean; lang?: string; hasOg?: boolean; hasStructuredData?: boolean;
  imagesMissingAlt?: number; bytes?: number; error?: string;
};

/** A technical crawl of a product's site. Crawler observations, not Google indexing facts. */
export const seoAudit = pgTable(
  "seo_audit",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "cascade" }),
    startUrl: text("start_url").notNull(),
    status: text("status").$type<"running" | "completed" | "failed">().notNull().default("running"),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    pages: jsonb("pages").$type<AuditPage[]>().notNull().default([]),
    issues: jsonb("issues").$type<AuditIssue[]>().notNull().default([]),
    site: jsonb("site").$type<{ robotsTxt: boolean; sitemap: string | null; https: boolean; hsts: boolean }>(),
    error: text("error"),
    startedBy: text("started_by").references(() => user.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("seo_audit_product_idx").on(t.workspaceId, t.productId, t.startedAt)],
);

/** An HTTP availability check actually performed by this server. */
export const uptimeCheck = pgTable(
  "uptime_check",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    ok: boolean("ok").notNull(),
    statusCode: integer("status_code"),
    responseMs: integer("response_ms"),
    sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
    error: text("error"),
    trigger: text("trigger").$type<"manual" | "schedule">().notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uptime_product_idx").on(t.workspaceId, t.productId, t.checkedAt)],
);
