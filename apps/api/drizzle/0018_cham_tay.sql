CREATE TYPE "public"."response_verdict" AS ENUM('correct', 'partial', 'wrong', 'blank', 'pending');--> statement-breakpoint
CREATE TABLE "session_grading_delegates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_gradings" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"blind" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "response_grades" ADD COLUMN "verdict" "response_verdict";--> statement-breakpoint
-- Điền bù cho điểm đã chấm ở PR 5a (docs/plan/slice-5.md, PR 5b mục 2): trống điểm = chờ chấm; đủ điểm = đúng; giữa = một phần;
-- bằng 0 = bỏ trống nếu Lượt không có giá trị Câu trả lời cho câu đó (hoặc giá trị rỗng), ngược lại sai.
UPDATE response_grades g SET verdict = CASE
	WHEN g.score IS NULL THEN 'pending'::response_verdict
	WHEN g.score >= ei.points THEN 'correct'::response_verdict
	WHEN g.score > 0 THEN 'partial'::response_verdict
	WHEN NOT EXISTS (
		SELECT 1 FROM responses r
		WHERE r.attempt_id = g.attempt_id AND r.item_id = g.item_id AND r.value IS NOT NULL
			AND r.value NOT IN ('null'::jsonb, '{"optionIds": []}'::jsonb, '{"answers": {}}'::jsonb, '{"text": ""}'::jsonb)
	) THEN 'blank'::response_verdict
	ELSE 'wrong'::response_verdict
END
FROM exam_items ei WHERE ei.id = g.item_id;--> statement-breakpoint
ALTER TABLE "response_grades" ALTER COLUMN "verdict" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_grading_delegates" ADD CONSTRAINT "session_grading_delegates_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_grading_delegates" ADD CONSTRAINT "session_grading_delegates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_grading_delegates" ADD CONSTRAINT "session_grading_delegates_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_gradings" ADD CONSTRAINT "session_gradings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_grading_delegates_active_idx" ON "session_grading_delegates" USING btree ("session_id") WHERE "session_grading_delegates"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "session_grading_delegates_user_idx" ON "session_grading_delegates" USING btree ("user_id");
--> statement-breakpoint
-- Chấm tay (source = 'manual') chỉ cho câu tự luận: không ghi đè điểm trắc nghiệm. Thay hàm của migration 0017, giữ nguyên phần cũ.
CREATE OR REPLACE FUNCTION response_grades_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	attempt_status attempt_status;
	item_points numeric;
	item_type text;
BEGIN
	SELECT status INTO attempt_status FROM attempts WHERE id = NEW.attempt_id FOR SHARE;
	IF attempt_status IS DISTINCT FROM 'submitted' THEN
		RAISE EXCEPTION 'Luot lam bai chua nop, khong cham diem duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'UPDATE' AND (NEW.attempt_id <> OLD.attempt_id OR NEW.item_id <> OLD.item_id) THEN
		RAISE EXCEPTION 'Diem khong doi sang Luot hay cau khac' USING ERRCODE = 'check_violation';
	END IF;
	SELECT ei.points, ei.snapshot->>'type' INTO item_points, item_type
	FROM attempts a
	JOIN sessions s ON s.id = a.session_id
	JOIN exam_items ei ON ei.exam_id = s.exam_id
	WHERE a.id = NEW.attempt_id AND ei.id = NEW.item_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Cau hoi khong thuoc Bo de cua Phien thi' USING ERRCODE = 'check_violation';
	END IF;
	IF NEW.score IS NOT NULL AND NEW.score > item_points THEN
		RAISE EXCEPTION 'Diem vuot diem toi da cua cau' USING ERRCODE = 'check_violation';
	END IF;
	IF NEW.source = 'manual' AND item_type IS DISTINCT FROM 'essay' THEN
		RAISE EXCEPTION 'Cham tay chi cho cau tu luan' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
-- Ủy quyền chấm (Q307): chỉ ghi thêm; thu hồi là đặt `revoked_at` đúng một lần; không xóa, không sửa cột khác.
CREATE FUNCTION session_grading_delegates_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Uy quyen cham khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
		OR (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at') THEN
		RAISE EXCEPTION 'Uy quyen cham chi duoc thu hoi mot lan' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER session_grading_delegates_guard BEFORE UPDATE OR DELETE ON session_grading_delegates
	FOR EACH ROW EXECUTE FUNCTION session_grading_delegates_guard();
