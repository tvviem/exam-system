CREATE TYPE "public"."mail_kind" AS ENUM('activation', 'invitation', 'password_reset', 'password_changed', 'email_change', 'email_changed_notice');--> statement-breakpoint
CREATE TYPE "public"."mail_lane" AS ENUM('urgent', 'bulk');--> statement-breakpoint
CREATE TYPE "public"."mail_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'rejected', 'skipped');--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "mail_kind" NOT NULL,
	"lane" "mail_lane" NOT NULL,
	"to_email" text NOT NULL,
	"status" "mail_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"user_id" uuid,
	"requested_by" uuid,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_outbox_sent_idx" ON "email_outbox" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "email_outbox_rejected_idx" ON "email_outbox" USING btree (lower("to_email")) WHERE "email_outbox"."status" = 'rejected';--> statement-breakpoint
CREATE INDEX "email_outbox_resend_idx" ON "email_outbox" USING btree (lower("to_email"),"kind","created_at");