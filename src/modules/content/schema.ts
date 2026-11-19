import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "../../lib/id";
import { user, workspace } from "../identity/schema";
import { product } from "../portfolio/schema";
import type { Destination, FunnelStage, PostStatus, PublishPolicy, SearchIntent } from "./constants";

/** A blog post / article for one product, moving through the editorial workflow. */
export const contentPost = pgTable(
  "content_post",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    status: text("status").$type<PostStatus>().notNull().default("draft"),
    targetKeyword: text("target_keyword").notNull().default(""),
    secondaryKeywords: text("secondary_keywords").array().notNull().default([]),
    searchIntent: text("search_intent").$type<SearchIntent>().notNull().default("informational"),
    funnelStage: text("funnel_stage").$type<FunnelStage>().notNull().default("awareness"),
    metaTitle: text("meta_title").notNull().default(""),
    metaDescription: text("meta_description").notNull().default(""),
    canonicalUrl: text("canonical_url"),
    coverImageUrl: text("cover_image_url"),
    authorName: text("author_name").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    /** Cached deterministic SEO score (0–100) of the latest saved version. */
    seoScore: integer("seo_score").notNull().default(0),
    wordCount: integer("word_count").notNull().default(0),
    source: text("source").$type<"human" | "agent">().notNull().default("human"),
    agentInstanceId: text("agent_instance_id"),
    agentRunId: text("agent_run_id"),
    sourceInsightId: text("source_insight_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** URL where the post is live, as confirmed by the destination (hosted blog or the webhook's response). */
    liveUrl: text("live_url"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("content_post_slug_unique").on(t.productId, t.slug),
    index("content_post_ws_idx").on(t.workspaceId, t.status, t.updatedAt),
    index("content_post_product_idx").on(t.workspaceId, t.productId, t.status),
    index("content_post_schedule_idx").on(t.status, t.scheduledAt),
  ],
);

/** Per-product publishing settings: where posts go and who may publish them. */
export const contentChannel = pgTable(
  "content_channel",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => product.id, { onDelete: "cascade" }),
    /** Hosted blog is publicly readable only while this is true. */
    hostedEnabled: boolean("hosted_enabled").notNull().default(false),
    blogTitle: text("blog_title").notNull().default(""),
    blogDescription: text("blog_description").notNull().default(""),
    destination: text("destination").$type<Destination>().notNull().default("hosted"),
    webhookUrl: text("webhook_url"),
    webhookSecretEnc: text("webhook_secret_enc"),
    /** Public base URL of the product's own blog (e.g. https://example.com/blog) used for canonical links with the webhook. */
    siteBlogUrl: text("site_blog_url"),
    publishPolicy: text("publish_policy").$type<PublishPolicy>().notNull().default("approval"),
    /** IndexNow key (Bing, Yandex, Seznam, Naver…). Not used by Google. */
    indexNowKey: text("index_now_key"),
    indexNowEnabled: boolean("index_now_enabled").notNull().default(false),
    /** Agent guardrail: maximum posts agents may publish per ISO week on this product. */
    weeklyAgentLimit: integer("weekly_agent_limit").notNull().default(3),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("content_channel_product_unique").on(t.productId), index("content_channel_ws_idx").on(t.workspaceId)],
);

/** Delivery log: every attempt to publish to a destination or notify a search engine, with the provider's answer. */
export const contentPublication = pgTable(
  "content_publication",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    workspaceId: text("workspace_id").notNull().references(() => workspace.id, { onDelete: "cascade" }),
    postId: text("post_id").notNull().references(() => contentPost.id, { onDelete: "cascade" }),
    target: text("target").$type<"hosted" | "webhook" | "indexnow">().notNull(),
    status: text("status").$type<"succeeded" | "failed" | "skipped">().notNull(),
    detail: text("detail").notNull().default(""),
    responseCode: integer("response_code"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    actorType: text("actor_type").$type<"human" | "agent" | "system">().notNull().default("human"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_publication_post_idx").on(t.workspaceId, t.postId, t.createdAt)],
);
