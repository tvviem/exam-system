CREATE TYPE "public"."key_correction_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "key_correction_effects" (
	"correction_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"old_score" numeric(6, 2),
	"new_score" numeric(6, 2),
	CONSTRAINT "key_correction_effects_correction_id_attempt_id_pk" PRIMARY KEY("correction_id","attempt_id")
);
--> statement-breakpoint
CREATE TABLE "key_corrections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"exam_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"old_key" jsonb NOT NULL,
	"new_key" jsonb NOT NULL,
	"reason" text NOT NULL,
	"corrected_by" uuid NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "key_correction_status" DEFAULT 'running' NOT NULL,
	"total_attempts" integer DEFAULT 0 NOT NULL,
	"processed_attempts" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "key_corrections_reason_len" CHECK (char_length("key_corrections"."reason") BETWEEN 10 AND 1000),
	CONSTRAINT "key_corrections_progress" CHECK ("key_corrections"."total_attempts" >= 0 AND "key_corrections"."processed_attempts" BETWEEN 0 AND "key_corrections"."total_attempts")
);
--> statement-breakpoint
ALTER TABLE "key_correction_effects" ADD CONSTRAINT "key_correction_effects_correction_id_key_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."key_corrections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_correction_effects" ADD CONSTRAINT "key_correction_effects_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_corrections" ADD CONSTRAINT "key_corrections_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_corrections" ADD CONSTRAINT "key_corrections_item_id_exam_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."exam_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_corrections" ADD CONSTRAINT "key_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "key_corrections_item_idx" ON "key_corrections" USING btree ("item_id","corrected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "key_corrections_exam_status_idx" ON "key_corrections" USING btree ("exam_id","status");--> statement-breakpoint
-- Đính chính đáp án (Q302, Q319–Q321): chỉ chèn; sau đó chỉ đổi trạng thái và tiến độ chấm lại; câu phải thuộc Bộ đề và không phải
-- tự luận (không có đáp án); không xóa.
CREATE FUNCTION key_corrections_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Dinh chinh khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'INSERT' THEN
		IF NOT EXISTS (
			SELECT 1 FROM exam_items
			WHERE id = NEW.item_id AND exam_id = NEW.exam_id AND snapshot->>'type' IS DISTINCT FROM 'essay'
		) THEN
			RAISE EXCEPTION 'Cau khong thuoc Bo de hoac khong co dap an de dinh chinh' USING ERRCODE = 'check_violation';
		END IF;
		IF NEW.status <> 'running' OR NEW.processed_attempts <> 0 THEN
			RAISE EXCEPTION 'Dinh chinh moi phai o trang thai dang cham lai' USING ERRCODE = 'check_violation';
		END IF;
		RETURN NEW;
	END IF;
	IF (to_jsonb(NEW) - 'status' - 'total_attempts' - 'processed_attempts' - 'finished_at')
		IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'total_attempts' - 'processed_attempts' - 'finished_at') THEN
		RAISE EXCEPTION 'Dinh chinh chi doi trang thai va tien do' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.status = 'done' AND NEW.status <> 'done' THEN
		RAISE EXCEPTION 'Dinh chinh da xong, khong mo lai duoc' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER key_corrections_guard BEFORE INSERT OR UPDATE OR DELETE ON key_corrections
	FOR EACH ROW EXECUTE FUNCTION key_corrections_guard();
--> statement-breakpoint
-- Điểm đổi do Đính chính chỉ ghi thêm (vết), không sửa, không xóa.
CREATE FUNCTION key_correction_effects_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Vet Dinh chinh chi ghi them' USING ERRCODE = 'check_violation';
END $$;
--> statement-breakpoint
CREATE TRIGGER key_correction_effects_guard BEFORE UPDATE OR DELETE ON key_correction_effects
	FOR EACH ROW EXECUTE FUNCTION key_correction_effects_guard();
--> statement-breakpoint
-- Điểm nguồn `correction` chỉ ghi được khi câu đó có Đính chính đang chấm lại. Thay hàm của migration 0020, giữ nguyên phần cũ.
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
	changed := TG_OP = 'INSERT' OR NEW.score IS DISTINCT FROM OLD.score
		OR NEW.feedback IS DISTINCT FROM OLD.feedback OR NEW.source IS DISTINCT FROM OLD.source;
	IF changed AND NEW.source = 'correction' AND NOT EXISTS (
		SELECT 1 FROM key_corrections kc WHERE kc.item_id = NEW.item_id AND kc.status = 'running'
	) THEN
		RAISE EXCEPTION 'Chi doi diem do Dinh chinh khi dang cham lai' USING ERRCODE = 'check_violation';
	END IF;
	SELECT sg.released_at, sg.finalized_at INTO released, finalized
	FROM attempts a JOIN session_gradings sg ON sg.session_id = a.session_id
	WHERE a.id = NEW.attempt_id;
	IF released IS NOT NULL THEN
		IF finalized IS NOT NULL AND changed THEN
			RAISE EXCEPTION 'Ket qua da chot, khong doi diem duoc' USING ERRCODE = 'check_violation';
		END IF;
		IF changed AND NEW.source IN ('auto', 'manual') THEN
			RAISE EXCEPTION 'Da cong bo, chi doi diem qua Phuc khao' USING ERRCODE = 'check_violation';
		END IF;
		IF changed AND NEW.source = 'appeal' AND NOT EXISTS (
			SELECT 1 FROM appeals ap
			WHERE ap.attempt_id = NEW.attempt_id AND ap.item_id = NEW.item_id AND ap.status = 'open'
		) THEN
			RAISE EXCEPTION 'Chi doi diem khi co Phuc khao dang mo' USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	RETURN NEW;
END $$;
