CREATE TABLE "attempt_reopenings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"reopened_by" uuid NOT NULL,
	"reopened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"previous_submitted_at" timestamp with time zone NOT NULL,
	"new_deadline" timestamp with time zone NOT NULL,
	CONSTRAINT "attempt_reopenings_once" UNIQUE("attempt_id","previous_submitted_at")
);
--> statement-breakpoint
ALTER TABLE "attempt_reopenings" ADD CONSTRAINT "attempt_reopenings_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_reopenings" ADD CONSTRAINT "attempt_reopenings_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER attempt_reopenings_append_only BEFORE UPDATE OR DELETE ON attempt_reopenings
	FOR EACH ROW EXECUTE FUNCTION append_only_guard();
--> statement-breakpoint
-- Hoàn tác Buộc nộp (Q273, Q275, Q280): Lượt đã nộp vẫn không sửa được, trừ đúng một đường mở lại. Lượt bị Buộc nộp (`examiner`)
-- chuyển về `in_progress` với `submitted_at` và `submit_reason` trống, hạn không rút ngắn, mọi cột khác giữ nguyên, và có dòng
-- `attempt_reopenings` khớp lần nộp (`previous_submitted_at`) và hạn mới (`new_deadline`). Mỗi lần nộp chỉ hoàn tác một lần
-- (ràng buộc duy nhất của bảng); chỉ mục một Lượt đang làm của người dùng chặn mở lại khi đã có Lượt mới.
CREATE OR REPLACE FUNCTION attempts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Luot lam bai khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.status = 'submitted' THEN
		IF to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
			RETURN NEW;
		END IF;
		IF OLD.submit_reason = 'examiner' AND NEW.status = 'in_progress'
			AND NEW.submitted_at IS NULL AND NEW.submit_reason IS NULL
			AND NEW.deadline >= OLD.deadline
			AND (to_jsonb(NEW) - 'status' - 'submitted_at' - 'submit_reason' - 'deadline' - 'updated_at')
				IS NOT DISTINCT FROM (to_jsonb(OLD) - 'status' - 'submitted_at' - 'submit_reason' - 'deadline' - 'updated_at')
			AND EXISTS (
				SELECT 1 FROM attempt_reopenings r
				WHERE r.attempt_id = OLD.id AND r.previous_submitted_at = OLD.submitted_at AND r.new_deadline = NEW.deadline
			) THEN
			RETURN NEW;
		END IF;
		RAISE EXCEPTION 'Luot lam bai da nop, khong sua duoc' USING ERRCODE = 'check_violation';
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
