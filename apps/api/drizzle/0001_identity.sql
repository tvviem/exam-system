CREATE TYPE "public"."academic_degree" AS ENUM('bachelor', 'engineer', 'master', 'doctor', 'doctor_of_science');--> statement-breakpoint
CREATE TYPE "public"."academic_title" AS ENUM('associate_professor', 'professor');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."role_tag" AS ENUM('examiner', 'candidate');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'locked');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"device_label" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "examiner_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"academic_degree" "academic_degree",
	"academic_title" "academic_title",
	"unit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"identifier_tried" text NOT NULL,
	"success" boolean NOT NULL,
	"failure_reason" text,
	"ip" "inet",
	"user_agent" text,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_role_tags" (
	"user_id" uuid NOT NULL,
	"tag" "role_tag" NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_tags_user_id_tag_pk" PRIMARY KEY("user_id","tag")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" "citext",
	"email" "citext",
	"password_hash" text,
	"full_name" text NOT NULL,
	"code" text,
	"class_label" text,
	"date_of_birth" date,
	"gender" "gender",
	"is_admin" boolean DEFAULT false NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"locked_reason" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"password_expires_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"removed_at" timestamp with time zone,
	"removed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_or_email" CHECK ("users"."username" IS NOT NULL OR "users"."email" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examiner_profiles" ADD CONSTRAINT "examiner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "examiner_profiles" ADD CONSTRAINT "examiner_profiles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_tags" ADD CONSTRAINT "user_role_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_tags" ADD CONSTRAINT "user_role_tags_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_events_user_at_idx" ON "login_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "login_events_at_idx" ON "login_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "user_role_tags_tag_idx" ON "user_role_tags" USING btree ("tag","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_active_key" ON "users" USING btree ("username") WHERE "users"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_active_key" ON "users" USING btree ("email") WHERE "users"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_code_active_key" ON "users" USING btree ("code") WHERE "users"."removed_at" IS NULL AND "users"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "users_class_label_idx" ON "users" USING btree ("class_label") WHERE "users"."removed_at" IS NULL;