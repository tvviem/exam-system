CREATE TYPE "public"."attempt_scoring" AS ENUM('highest', 'latest');--> statement-breakpoint
CREATE TABLE "session_roster" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"class_label" text,
	"extra_minutes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "session_roster_session_id_user_id_pk" PRIMARY KEY("session_id","user_id"),
	CONSTRAINT "session_roster_extra_check" CHECK ("session_roster"."extra_minutes" BETWEEN 0 AND 600)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exam_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"hard_close" boolean DEFAULT false NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"attempt_scoring" "attempt_scoring" DEFAULT 'highest' NOT NULL,
	"shuffle_items" boolean DEFAULT false NOT NULL,
	"shuffle_options" boolean DEFAULT false NOT NULL,
	"show_scoring_rules" boolean DEFAULT false NOT NULL,
	"access_code" text NOT NULL,
	"entry_closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_window_check" CHECK ("sessions"."closes_at" > "sessions"."opens_at"),
	CONSTRAINT "sessions_duration_check" CHECK ("sessions"."duration_minutes" BETWEEN 1 AND 600),
	CONSTRAINT "sessions_attempts_check" CHECK ("sessions"."max_attempts" BETWEEN 1 AND 5),
	CONSTRAINT "sessions_access_code_check" CHECK ("sessions"."access_code" ~ '^[A-Z0-9]{4,12}$')
);
--> statement-breakpoint
ALTER TABLE "session_roster" ADD CONSTRAINT "session_roster_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_roster" ADD CONSTRAINT "session_roster_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_roster" ADD CONSTRAINT "session_roster_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_roster_user_idx" ON "session_roster" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_owner_opens_idx" ON "sessions" USING btree ("owner_id","opens_at");--> statement-breakpoint
CREATE INDEX "sessions_exam_idx" ON "sessions" USING btree ("exam_id");
--> statement-breakpoint
-- Q222: hai Phiên thi chưa hủy không dùng chung Mã vào thi khi Khung giờ chồng nhau. Khoảng đóng ở cả hai đầu vì giờ đóng
-- là giờ cuối cùng còn được bắt đầu. Thay cho "duy nhất khi chưa Chốt": Chốt chỉ có ở lát cắt 5 và sẽ giữ mã mãi.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_access_code_window_excl"
	EXCLUDE USING gist ("access_code" WITH =, tstzrange("opens_at", "closes_at", '[]') WITH &&)
	WHERE ("cancelled_at" IS NULL);
--> statement-breakpoint
-- Lớp bảo vệ thứ hai sau service (như Q172, Q217): Phiên thi chỉ tạo trên Bộ đề đã Phát hành, Hủy không hoàn tác và sau
-- khi Hủy chỉ còn đổi chủ (Xóa người dùng, Q205).
CREATE FUNCTION sessions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	exam_status exam_status;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		IF OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL THEN
			RAISE EXCEPTION 'Huy Phien thi khong hoan tac duoc' USING ERRCODE = 'check_violation';
		END IF;
		IF OLD.cancelled_at IS NOT NULL AND
			(to_jsonb(NEW) - 'owner_id' - 'updated_at' - 'version')
			IS DISTINCT FROM (to_jsonb(OLD) - 'owner_id' - 'updated_at' - 'version') THEN
			RAISE EXCEPTION 'Phien thi da huy, khong sua duoc' USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	IF TG_OP = 'INSERT' OR NEW.exam_id IS DISTINCT FROM OLD.exam_id THEN
		SELECT status INTO exam_status FROM exams WHERE id = NEW.exam_id;
		IF exam_status = 'draft' THEN
			RAISE EXCEPTION 'Bo de chua phat hanh, khong tao Phien thi duoc' USING ERRCODE = 'check_violation';
		ELSIF exam_status = 'archived' THEN
			RAISE EXCEPTION 'Bo de da luu tru, khong tao Phien thi duoc' USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER sessions_guard BEFORE INSERT OR UPDATE ON sessions
	FOR EACH ROW EXECUTE FUNCTION sessions_guard();
--> statement-breakpoint
-- Q144: Người ra đề không tự thêm mình vào Danh sách dự thi của chính Phiên thi mình tạo.
CREATE FUNCTION session_roster_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (SELECT 1 FROM sessions WHERE id = NEW.session_id AND owner_id = NEW.user_id) THEN
		RAISE EXCEPTION 'Nguoi ra de khong tu them minh vao Danh sach du thi' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER session_roster_guard BEFORE INSERT ON session_roster
	FOR EACH ROW EXECUTE FUNCTION session_roster_guard();
