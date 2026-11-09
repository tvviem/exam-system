CREATE TYPE "public"."backup_run_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" "backup_run_status" NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"seconds" integer,
	"bytes" bigint,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_runs_detail_len" CHECK (char_length("backup_runs"."detail") <= 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "backup_runs_run_key_idx" ON "backup_runs" USING btree ("run_key");--> statement-breakpoint
CREATE INDEX "backup_runs_finished_idx" ON "backup_runs" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "backup_runs_kind_finished_idx" ON "backup_runs" USING btree ("kind","finished_at");