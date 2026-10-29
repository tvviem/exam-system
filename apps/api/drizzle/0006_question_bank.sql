CREATE TYPE "public"."question_type" AS ENUM('single_choice', 'multiple_choice', 'true_false_cluster', 'essay');--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" "question_type" NOT NULL,
	"stem" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"default_points" numeric(6, 2) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_text" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_owner_topic_idx" ON "questions" USING btree ("owner_id","topic_id","updated_at");--> statement-breakpoint
CREATE INDEX "questions_tags_idx" ON "questions" USING gin ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_owner_name_unique" ON "topics" USING btree ("owner_id","name_key") WHERE "topics"."archived_at" IS NULL;