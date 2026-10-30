CREATE TYPE "public"."illustration_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "illustrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"status" "illustration_status" NOT NULL,
	"failure_reason" text,
	"width" integer,
	"height" integer,
	"variants" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_illustrations" (
	"question_id" uuid NOT NULL,
	"illustration_id" uuid NOT NULL,
	CONSTRAINT "question_illustrations_question_id_illustration_id_pk" PRIMARY KEY("question_id","illustration_id")
);
--> statement-breakpoint
ALTER TABLE "illustrations" ADD CONSTRAINT "illustrations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_illustrations" ADD CONSTRAINT "question_illustrations_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_illustrations" ADD CONSTRAINT "question_illustrations_illustration_id_illustrations_id_fk" FOREIGN KEY ("illustration_id") REFERENCES "public"."illustrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "illustrations_owner_sha256_unique" ON "illustrations" USING btree ("owner_id","sha256");--> statement-breakpoint
CREATE INDEX "illustrations_owner_created_idx" ON "illustrations" USING btree ("owner_id","created_at");