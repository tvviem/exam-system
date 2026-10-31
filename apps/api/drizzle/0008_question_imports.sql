CREATE TYPE "public"."question_import_status" AS ENUM('parsing', 'parse_failed', 'ready', 'committing', 'committed');--> statement-breakpoint
CREATE TYPE "public"."question_import_outcome" AS ENUM('pending', 'created', 'skipped');--> statement-breakpoint
CREATE TABLE "question_import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"upload_key" text,
	"status" "question_import_status" NOT NULL,
	"parse_error" text,
	"row_count" integer,
	"created_count" integer,
	"created_at" timestamp with time zone NOT NULL,
	"commit_requested_at" timestamp with time zone,
	"committed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_import_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"payload" jsonb,
	"search_text" text,
	"error_code" text,
	"duplicate_of_question_id" uuid,
	"duplicate_of_row" integer,
	"selected" boolean DEFAULT false NOT NULL,
	"outcome" "question_import_outcome" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_import_batches" ADD CONSTRAINT "question_import_batches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_import_batches" ADD CONSTRAINT "question_import_batches_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_import_items" ADD CONSTRAINT "question_import_items_batch_id_question_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."question_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_import_batches_owner_created_idx" ON "question_import_batches" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "question_import_items_batch_row_unique" ON "question_import_items" USING btree ("batch_id","row_number");