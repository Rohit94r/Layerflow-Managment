CREATE TABLE "deployment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"target" text NOT NULL,
	"state" text NOT NULL,
	"branch" text,
	"commit_sha" text,
	"commit_message" text,
	"author" text,
	"inspector_url" text,
	"error_message" text,
	"created_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_connection" ADD COLUMN "webhook_secret_enc" text;--> statement-breakpoint
ALTER TABLE "integration_connection" ADD COLUMN "webhook_last_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_resource_id_integration_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."integration_resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_unique" ON "deployment" USING btree ("resource_id","external_id");--> statement-breakpoint
CREATE INDEX "deployment_resource_idx" ON "deployment" USING btree ("resource_id","created_at");--> statement-breakpoint
CREATE INDEX "deployment_ws_idx" ON "deployment" USING btree ("workspace_id","target","created_at");