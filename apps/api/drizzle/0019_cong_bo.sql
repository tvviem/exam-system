ALTER TABLE "session_gradings" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_gradings" ADD COLUMN "released_by" uuid;--> statement-breakpoint
ALTER TABLE "session_gradings" ADD COLUMN "appeal_period_hours" integer;--> statement-breakpoint
ALTER TABLE "session_gradings" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "review_after_release" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session_gradings" ADD CONSTRAINT "session_gradings_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_gradings" ADD CONSTRAINT "session_gradings_appeal_hours" CHECK ("session_gradings"."appeal_period_hours" IS NULL OR "session_gradings"."appeal_period_hours" = 0 OR "session_gradings"."appeal_period_hours" BETWEEN 24 AND 336);--> statement-breakpoint
ALTER TABLE "session_gradings" ADD CONSTRAINT "session_gradings_release_consistent" CHECK (("session_gradings"."released_at" IS NULL) = ("session_gradings"."appeal_period_hours" IS NULL) AND ("session_gradings"."finalized_at" IS NULL OR "session_gradings"."released_at" IS NOT NULL));
--> statement-breakpoint
-- Công bố và Chốt chỉ đặt một lần, không đổi, không xóa (Q298, Q301).
CREATE FUNCTION session_gradings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Thiet lap cham khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.released_at IS NOT NULL AND (
		NEW.released_at IS DISTINCT FROM OLD.released_at OR NEW.released_by IS DISTINCT FROM OLD.released_by
		OR NEW.appeal_period_hours IS DISTINCT FROM OLD.appeal_period_hours
	) THEN
		RAISE EXCEPTION 'Da cong bo, khong doi duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.finalized_at IS NOT NULL AND NEW.finalized_at IS DISTINCT FROM OLD.finalized_at THEN
		RAISE EXCEPTION 'Da chot, khong doi duoc' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER session_gradings_guard BEFORE UPDATE OR DELETE ON session_gradings
	FOR EACH ROW EXECUTE FUNCTION session_gradings_guard();
--> statement-breakpoint
-- Sau Công bố điểm chấm tay không đổi nữa (chỉ qua Phúc khảo hoặc Đính chính, Q299); sau Chốt không điểm nào đổi. Thay hàm của
-- migration 0018, giữ nguyên phần cũ. Ghi lại điểm tự động giữ nguyên giá trị (chấm bù idempotent) vẫn qua.
CREATE OR REPLACE FUNCTION response_grades_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	attempt_status attempt_status;
	item_points numeric;
	item_type text;
	released timestamptz;
	finalized timestamptz;
	changed boolean;
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
	SELECT sg.released_at, sg.finalized_at INTO released, finalized
	FROM attempts a JOIN session_gradings sg ON sg.session_id = a.session_id
	WHERE a.id = NEW.attempt_id;
	IF released IS NOT NULL THEN
		changed := TG_OP = 'INSERT' OR NEW.score IS DISTINCT FROM OLD.score
			OR NEW.feedback IS DISTINCT FROM OLD.feedback OR NEW.source IS DISTINCT FROM OLD.source;
		IF finalized IS NOT NULL AND changed THEN
			RAISE EXCEPTION 'Ket qua da chot, khong doi diem duoc' USING ERRCODE = 'check_violation';
		END IF;
		IF changed AND NEW.source IN ('auto', 'manual') THEN
			RAISE EXCEPTION 'Da cong bo, chi doi diem qua Phuc khao' USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	RETURN NEW;
END $$;
