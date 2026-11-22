CREATE TYPE "public"."session_draw_scope" AS ENUM('shared', 'per_candidate');--> statement-breakpoint
CREATE TABLE "session_variant_items" (
	"variant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	CONSTRAINT "session_variant_items_variant_id_item_id_pk" PRIMARY KEY("variant_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "session_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"label" text NOT NULL,
	"draw_seed" bigint NOT NULL,
	CONSTRAINT "session_variants_session_number_unique" UNIQUE("session_id","number"),
	CONSTRAINT "session_variants_number_check" CHECK ("session_variants"."number" BETWEEN 1 AND 10),
	CONSTRAINT "session_variants_label_check" CHECK (char_length("session_variants"."label") BETWEEN 1 AND 40)
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "session_roster" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "draw_scope" "session_draw_scope" DEFAULT 'per_candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_variant_items" ADD CONSTRAINT "session_variant_items_variant_id_session_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."session_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_variant_items" ADD CONSTRAINT "session_variant_items_item_id_exam_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."exam_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_variants" ADD CONSTRAINT "session_variants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_variant_id_session_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."session_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_roster" ADD CONSTRAINT "session_roster_variant_id_session_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."session_variants"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Mã đề của Phiên thi (docs/plan/ma-de-phien-thi-thiet-ke.md mục 4.2). Phiên thi đã có Lượt làm bài thì không thêm, sửa, xóa Mã đề
-- hay bộ câu của Mã đề (cùng tinh thần session_section_draws_guard); Phiên thi hủy hay xóa chưa có Lượt thì Mã đề đi theo ON DELETE CASCADE.
CREATE FUNCTION session_variants_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
BEGIN
	IF EXISTS (SELECT 1 FROM attempts WHERE session_id = target) THEN
		RAISE EXCEPTION 'Phien thi da co Luot lam bai, khong sua duoc Ma de' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'UPDATE' AND NEW.session_id IS DISTINCT FROM OLD.session_id THEN
		RAISE EXCEPTION 'Ma de khong doi sang Phien thi khac' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER session_variants_guard BEFORE INSERT OR UPDATE OR DELETE ON session_variants
	FOR EACH ROW EXECUTE FUNCTION session_variants_guard();
--> statement-breakpoint
-- Bộ câu của Mã đề: khóa như trên, và câu phải thuộc Bộ đề của Phiên thi.
CREATE FUNCTION session_variant_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	target_variant uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.variant_id ELSE NEW.variant_id END;
	target_session uuid;
BEGIN
	SELECT session_id INTO target_session FROM session_variants WHERE id = target_variant;
	-- Mã đề đang bị xóa cùng Phiên thi (CASCADE): không còn dòng cha để kiểm, cho đi tiếp.
	IF target_session IS NULL THEN
		IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
		RAISE EXCEPTION 'Ma de khong ton tai' USING ERRCODE = 'check_violation';
	END IF;
	IF EXISTS (SELECT 1 FROM attempts WHERE session_id = target_session) THEN
		RAISE EXCEPTION 'Phien thi da co Luot lam bai, khong sua duoc bo cau cua Ma de' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP <> 'DELETE' AND NOT EXISTS (
		SELECT 1 FROM sessions s JOIN exam_items ei ON ei.exam_id = s.exam_id
		WHERE s.id = target_session AND ei.id = NEW.item_id
	) THEN
		RAISE EXCEPTION 'Cau khong thuoc Bo de cua Phien thi' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER session_variant_items_guard BEFORE INSERT OR UPDATE OR DELETE ON session_variant_items
	FOR EACH ROW EXECUTE FUNCTION session_variant_items_guard();
--> statement-breakpoint
-- Mã đề đã chia cho một người (Danh sách dự thi) phải thuộc cùng Phiên thi; người đã có Lượt làm bài thì không đổi Mã đề (Q468).
CREATE FUNCTION session_roster_variant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM session_variants v WHERE v.id = NEW.variant_id AND v.session_id = NEW.session_id
	) THEN
		RAISE EXCEPTION 'Ma de khong thuoc Phien thi' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'UPDATE' AND NEW.variant_id IS DISTINCT FROM OLD.variant_id
		AND EXISTS (SELECT 1 FROM attempts WHERE session_id = OLD.session_id AND user_id = OLD.user_id) THEN
		RAISE EXCEPTION 'Nguoi da co Luot lam bai, khong doi Ma de' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER session_roster_variant_guard BEFORE INSERT OR UPDATE OF variant_id ON session_roster
	FOR EACH ROW EXECUTE FUNCTION session_roster_variant_guard();
--> statement-breakpoint
-- Lượt giữ Mã đề đã chụp lúc tạo (không đổi); thêm variant_id vào các cột bất biến của attempts_guard.
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
		OR NEW.layout IS DISTINCT FROM OLD.layout OR NEW.started_at IS DISTINCT FROM OLD.started_at
		OR NEW.variant_id IS DISTINCT FROM OLD.variant_id THEN
		RAISE EXCEPTION 'Noi dung Luot lam bai khong doi duoc sau khi tao' USING ERRCODE = 'check_violation';
	END IF;
	IF NEW.status = 'in_progress' AND NEW.deadline < OLD.deadline THEN
		RAISE EXCEPTION 'Han nop chi duoc keo dai, khong rut ngan' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
