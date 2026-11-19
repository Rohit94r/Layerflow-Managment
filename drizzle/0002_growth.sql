CREATE TABLE "content_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"product_id" text NOT NULL,
	"hosted_enabled" boolean DEFAULT false NOT NULL,
	"blog_title" text DEFAULT '' NOT NULL,
	"blog_description" text DEFAULT '' NOT NULL,
	"destination" text DEFAULT 'hosted' NOT NULL,
	"webhook_url" text,
	"webhook_secret_enc" text,
	"site_blog_url" text,
	"publish_policy" text DEFAULT 'approval' NOT NULL,
	"index_now_key" text,
	"index_now_enabled" boolean DEFAULT false NOT NULL,
	"weekly_agent_limit" integer DEFAULT 3 NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_post" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"product_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_keyword" text DEFAULT '' NOT NULL,
	"secondary_keywords" text[] DEFAULT '{}' NOT NULL,
	"search_intent" text DEFAULT 'informational' NOT NULL,
	"funnel_stage" text DEFAULT 'awareness' NOT NULL,
	"meta_title" text DEFAULT '' NOT NULL,
	"meta_description" text DEFAULT '' NOT NULL,
	"canonical_url" text,
	"cover_image_url" text,
	"author_name" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"seo_score" integer DEFAULT 0 NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'human' NOT NULL,
	"agent_instance_id" text,
	"agent_run_id" text,
	"source_insight_id" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"live_url" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_publication" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"post_id" text NOT NULL,
	"target" text NOT NULL,
	"status" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"response_code" integer,
	"meta" jsonb,
	"actor_type" text DEFAULT 'human' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"day" date NOT NULL,
	"sessions" integer NOT NULL,
	"users" integer NOT NULL,
	"new_users" integer NOT NULL,
	"page_views" integer NOT NULL,
	"engaged_sessions" integer NOT NULL,
	"key_events" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_dimension" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"dimension" text NOT NULL,
	"window" text NOT NULL,
	"key" text NOT NULL,
	"sessions" integer NOT NULL,
	"users" integer NOT NULL,
	"engaged_sessions" integer NOT NULL,
	"key_events" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_channel" ADD CONSTRAINT "content_channel_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_channel" ADD CONSTRAINT "content_channel_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_channel" ADD CONSTRAINT "content_channel_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_post" ADD CONSTRAINT "content_post_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publication" ADD CONSTRAINT "content_publication_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_publication" ADD CONSTRAINT "content_publication_post_id_content_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."content_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_resource_id_integration_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."integration_resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_dimension" ADD CONSTRAINT "analytics_dimension_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_dimension" ADD CONSTRAINT "analytics_dimension_resource_id_integration_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."integration_resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_channel_product_unique" ON "content_channel" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "content_channel_ws_idx" ON "content_channel" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_post_slug_unique" ON "content_post" USING btree ("product_id","slug");--> statement-breakpoint
CREATE INDEX "content_post_ws_idx" ON "content_post" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "content_post_product_idx" ON "content_post" USING btree ("workspace_id","product_id","status");--> statement-breakpoint
CREATE INDEX "content_post_schedule_idx" ON "content_post" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "content_publication_post_idx" ON "content_publication" USING btree ("workspace_id","post_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_unique" ON "analytics_daily" USING btree ("resource_id","day");--> statement-breakpoint
CREATE INDEX "analytics_daily_ws_idx" ON "analytics_daily" USING btree ("workspace_id","resource_id","day");--> statement-breakpoint
CREATE INDEX "analytics_dimension_idx" ON "analytics_dimension" USING btree ("resource_id","dimension","window");