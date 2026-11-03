CREATE TYPE "public"."session_event_type" AS ENUM('tab_hidden', 'tab_visible', 'went_offline', 'back_online', 'device_rejected');--> statement-breakpoint
CREATE TYPE "public"."time_extension_scope" AS ENUM('one', 'group', 'all');--> statement-breakpoint
CREATE TYPE "public"."violation_action" AS ENUM('warning', 'disqualify');--> statement-breakpoint
CREATE TYPE "public"."violation_penalty_type" AS ENUM('none', 'percent', 'void');--> statement-breakpoint
CREATE TABLE "attempt_time_extensions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"scope" time_extension_scope NOT NULL,
	"reason" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"extended_by" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_time_extensions_batch_unique" UNIQUE("attempt_id","batch_id"),
	CONSTRAINT "attempt_time_extensions_minutes_check" CHECK ("attempt_time_extensions"."minutes" BETWEEN 1 AND 180),
	CONSTRAINT "attempt_time_extensions_reason_check" CHECK (char_length("attempt_time_extensions"."reason") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_id" uuid,
	"type" "session_event_type" NOT NULL,
	"data" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "violations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" "violation_action" NOT NULL,
	"reason" text NOT NULL,
	"penalty_type" "violation_penalty_type" DEFAULT 'none' NOT NULL,
	"penalty_percent" numeric(5, 2),
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"penalty_decided_at" timestamp with time zone,
	CONSTRAINT "violations_reason_check" CHECK (char_length("violations"."reason") BETWEEN 1 AND 500),
	CONSTRAINT "violations_penalty_check" CHECK (("violations"."penalty_type" = 'percent') = ("violations"."penalty_percent" IS NOT NULL) AND ("violations"."penalty_percent" IS NULL OR "violations"."penalty_percent" BETWEEN 0 AND 100))
);
--> statement-breakpoint
ALTER TABLE "attempt_time_extensions" ADD CONSTRAINT "attempt_time_extensions_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_time_extensions" ADD CONSTRAINT "attempt_time_extensions_extended_by_users_id_fk" FOREIGN KEY ("extended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_events_attempt_idx" ON "session_events" USING btree ("attempt_id","type");--> statement-breakpoint
CREATE INDEX "session_events_session_idx" ON "session_events" USING btree ("session_id","at");--> statement-breakpoint
CREATE INDEX "violations_attempt_idx" ON "violations" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "violations_session_idx" ON "violations" USING btree ("session_id");--> statement-breakpoint
-- Lớp bảo vệ thứ hai sau service (Q172, Q198, Q256, Q259). Nhật ký sự kiện và nhật ký Cộng giờ chỉ ghi thêm.
CREATE FUNCTION append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Nhat ky chi ghi them, khong sua duoc, khong xoa duoc' USING ERRCODE = 'check_violation';
END $$;
--> statement-breakpoint
CREATE TRIGGER session_events_guard BEFORE UPDATE OR DELETE ON session_events
	FOR EACH ROW EXECUTE FUNCTION append_only_guard();
--> statement-breakpoint
CREATE TRIGGER attempt_time_extensions_append_only BEFORE UPDATE OR DELETE ON attempt_time_extensions
	FOR EACH ROW EXECUTE FUNCTION append_only_guard();
--> statement-breakpoint
-- Cộng giờ chỉ cho Lượt đang làm và tổng phần cộng thêm của một Lượt không quá 600 phút (Q256). Khóa dòng Lượt FOR UPDATE
-- nên hai lần Cộng giờ xen nhau, hoặc Cộng giờ xen Nộp bài, phải nối đuôi và thấy kết quả của nhau.
CREATE FUNCTION attempt_time_extensions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	attempt_state attempt_status;
	already integer;
BEGIN
	SELECT status INTO attempt_state FROM attempts WHERE id = NEW.attempt_id FOR UPDATE;
	IF attempt_state IS DISTINCT FROM 'in_progress' THEN
		RAISE EXCEPTION 'Luot lam bai da nop, khong Cong gio duoc' USING ERRCODE = 'check_violation';
	END IF;
	SELECT COALESCE(SUM(minutes), 0) INTO already FROM attempt_time_extensions WHERE attempt_id = NEW.attempt_id;
	IF already + NEW.minutes > 600 THEN
		RAISE EXCEPTION 'Tong gio cong them vuot tran Cong gio (600 phut)' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attempt_time_extensions_guard BEFORE INSERT ON attempt_time_extensions
	FOR EACH ROW EXECUTE FUNCTION attempt_time_extensions_guard();
--> statement-breakpoint
-- Vi phạm: Phiên thi và người phải khớp với Lượt; sau khi ghi chỉ cột hình phạt được quyết (lát cắt 5); không xóa (Q259).
CREATE FUNCTION violations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Vi pham khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'INSERT' THEN
		IF NOT EXISTS (
			SELECT 1 FROM attempts WHERE id = NEW.attempt_id AND session_id = NEW.session_id AND user_id = NEW.user_id
		) THEN
			RAISE EXCEPTION 'Phien thi hoac nguoi khong khop Luot lam bai' USING ERRCODE = 'check_violation';
		END IF;
		RETURN NEW;
	END IF;
	IF (to_jsonb(NEW) - 'penalty_type' - 'penalty_percent' - 'penalty_decided_at')
		IS DISTINCT FROM (to_jsonb(OLD) - 'penalty_type' - 'penalty_percent' - 'penalty_decided_at') THEN
		RAISE EXCEPTION 'Vi pham khong sua duoc, chi quyet hinh phat' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER violations_guard BEFORE INSERT OR UPDATE OR DELETE ON violations
	FOR EACH ROW EXECUTE FUNCTION violations_guard();
