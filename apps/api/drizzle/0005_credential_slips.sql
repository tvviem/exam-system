CREATE TYPE "public"."credential_slip_status" AS ENUM('ready', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "credential_slips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"item_count" integer NOT NULL,
	"status" "credential_slip_status" NOT NULL,
	"pdf_key" text,
	"xlsx_key" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credential_slips" ADD CONSTRAINT "credential_slips_request_id_account_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."account_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_slips" ADD CONSTRAINT "credential_slips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credential_slips_request_idx" ON "credential_slips" USING btree ("request_id");