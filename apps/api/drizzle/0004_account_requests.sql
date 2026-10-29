CREATE TYPE "public"."account_request_status" AS ENUM('parsing', 'parse_failed', 'pending', 'approving', 'approved', 'partially_approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."account_request_item_outcome" AS ENUM('pending', 'created', 'tag_added', 'skipped', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."account_request_match_status" AS ENUM('new', 'exact', 'name_mismatch', 'blocked');--> statement-breakpoint
CREATE TABLE "account_request_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"full_name" text,
	"code" text,
	"email" text,
	"class_label" text,
	"date_of_birth" date,
	"gender" "gender",
	"match_status" "account_request_match_status" NOT NULL,
	"outcome" "account_request_item_outcome" DEFAULT 'pending' NOT NULL,
	"user_id" uuid,
	"outcome_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requested_by" uuid NOT NULL,
	"note" text,
	"original_filename" text NOT NULL,
	"upload_key" text,
	"status" "account_request_status" DEFAULT 'parsing' NOT NULL,
	"parse_error" text,
	"row_count" integer,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account_request_items" ADD CONSTRAINT "account_request_items_request_id_account_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."account_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_request_items" ADD CONSTRAINT "account_request_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_request_items_request_idx" ON "account_request_items" USING btree ("request_id","row_number");--> statement-breakpoint
CREATE INDEX "account_requests_requested_by_idx" ON "account_requests" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");