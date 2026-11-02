CREATE TYPE "public"."attempt_status" AS ENUM('in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."attempt_submit_reason" AS ENUM('candidate', 'timeout', 'examiner', 'disqualified', 'account_locked', 'session_cancelled');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"seed" bigint NOT NULL,
	"layout" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"submit_reason" "attempt_submit_reason",
	"status" "attempt_status" DEFAULT 'in_progress' NOT NULL,
	CONSTRAINT "attempts_session_user_no_unique" UNIQUE("session_id","user_id","attempt_no"),
	CONSTRAINT "attempts_no_check" CHECK ("attempts"."attempt_no" >= 1),
	CONSTRAINT "attempts_deadline_check" CHECK ("attempts"."deadline" > "attempts"."started_at"),
	CONSTRAINT "attempts_submitted_check" CHECK (("attempts"."status" = 'submitted') = ("attempts"."submitted_at" IS NOT NULL AND "attempts"."submit_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"attempt_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"value" jsonb,
	"client_seq" integer NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "responses_attempt_id_item_id_pk" PRIMARY KEY("attempt_id","item_id"),
	CONSTRAINT "responses_seq_check" CHECK ("responses"."client_seq" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"status" "device_status" DEFAULT 'active' NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	"pardoned_at" timestamp with time zone,
	CONSTRAINT "session_devices_triple_unique" UNIQUE("session_id","user_id","device_hash")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_user_id_session_roster_session_id_user_id_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."session_roster"("session_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_item_id_exam_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."exam_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_devices" ADD CONSTRAINT "session_devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_devices" ADD CONSTRAINT "session_devices_session_id_user_id_session_roster_session_id_user_id_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."session_roster"("session_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_one_in_progress" ON "attempts" USING btree ("session_id","user_id") WHERE "attempts"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "attempts_sweep_idx" ON "attempts" USING btree ("status","deadline") WHERE "attempts"."status" = 'in_progress';--> statement-breakpoint
CREATE INDEX "attempts_user_idx" ON "attempts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_devices_one_active_per_user" ON "session_devices" USING btree ("session_id","user_id") WHERE "session_devices"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "session_devices_one_user_per_device" ON "session_devices" USING btree ("session_id","device_hash") WHERE "session_devices"."status" = 'active';--> statement-breakpoint
-- Lớp bảo vệ thứ hai sau service (Q217). Lượt làm bài: nội dung cố định sau khi tạo, chỉ in_progress → submitted, đã nộp
-- thì không sửa gì, hạn chỉ được kéo dài (Cộng giờ), không xóa.
CREATE FUNCTION attempts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Luot lam bai khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.status = 'submitted' THEN
		IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
			RAISE EXCEPTION 'Luot lam bai da nop, khong sua duoc' USING ERRCODE = 'check_violation';
		END IF;
		RETURN NEW;
	END IF;
	IF NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no OR NEW.seed IS DISTINCT FROM OLD.seed
		OR NEW.layout IS DISTINCT FROM OLD.layout OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
		RAISE EXCEPTION 'Noi dung Luot lam bai khong doi duoc sau khi tao' USING ERRCODE = 'check_violation';
	END IF;
	IF NEW.status = 'in_progress' AND NEW.deadline < OLD.deadline THEN
		RAISE EXCEPTION 'Han nop chi duoc keo dai, khong rut ngan' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attempts_guard BEFORE UPDATE OR DELETE ON attempts
	FOR EACH ROW EXECUTE FUNCTION attempts_guard();
--> statement-breakpoint
-- Câu trả lời: chỉ ghi khi Lượt đang làm (khóa dòng Lượt FOR SHARE nên Nộp bài xen vào thì chờ rồi thấy đã nộp), câu phải
-- thuộc Bộ đề của Phiên thi, và không đổi chủ.
CREATE FUNCTION responses_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	attempt_status attempt_status;
BEGIN
	SELECT status INTO attempt_status FROM attempts WHERE id = NEW.attempt_id FOR SHARE;
	IF attempt_status IS DISTINCT FROM 'in_progress' THEN
		RAISE EXCEPTION 'Luot lam bai da nop, khong ghi them Cau tra loi' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'UPDATE' AND (NEW.attempt_id <> OLD.attempt_id OR NEW.item_id <> OLD.item_id) THEN
		RAISE EXCEPTION 'Cau tra loi khong doi sang Luot hay cau khac' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'INSERT' AND NOT EXISTS (
		SELECT 1 FROM attempts a
		JOIN sessions s ON s.id = a.session_id
		JOIN exam_items ei ON ei.exam_id = s.exam_id
		WHERE a.id = NEW.attempt_id AND ei.id = NEW.item_id
	) THEN
		RAISE EXCEPTION 'Cau hoi khong thuoc Bo de cua Phien thi' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER responses_guard BEFORE INSERT OR UPDATE ON responses
	FOR EACH ROW EXECUTE FUNCTION responses_guard();
--> statement-breakpoint
-- Phiên thi đã có Lượt làm bài: không đổi Bộ đề và hai công tắc xáo trộn (Q217). Thay hàm của migration 0012, giữ nguyên
-- phần cũ và thêm kiểm này.
CREATE OR REPLACE FUNCTION sessions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
		IF (NEW.exam_id IS DISTINCT FROM OLD.exam_id OR NEW.shuffle_items IS DISTINCT FROM OLD.shuffle_items
			OR NEW.shuffle_options IS DISTINCT FROM OLD.shuffle_options)
			AND EXISTS (SELECT 1 FROM attempts WHERE session_id = NEW.id) THEN
			RAISE EXCEPTION 'Phien thi da co Luot lam bai, khong doi Bo de va xao tron' USING ERRCODE = 'check_violation';
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
