CREATE TABLE "exam_item_illustrations" (
	"exam_item_id" uuid NOT NULL,
	"illustration_id" uuid NOT NULL,
	CONSTRAINT "exam_item_illustrations_exam_item_id_illustration_id_pk" PRIMARY KEY("exam_item_id","illustration_id")
);
--> statement-breakpoint
ALTER TABLE "exam_item_illustrations" ADD CONSTRAINT "exam_item_illustrations_exam_item_id_exam_items_id_fk" FOREIGN KEY ("exam_item_id") REFERENCES "public"."exam_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_item_illustrations" ADD CONSTRAINT "exam_item_illustrations_illustration_id_illustrations_id_fk" FOREIGN KEY ("illustration_id") REFERENCES "public"."illustrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Q172: Bộ đề không còn `draft` thì nội dung (Phần, câu, bản chụp) bất biến, kể cả với SQL ghi trực tiếp. Chấm điểm
-- chỉ tin `exam_items.snapshot`, nên đây là lớp bảo vệ thứ hai sau service. Không có đường quay lại `draft`.
CREATE FUNCTION exam_children_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	parent_status exam_status;
	parent_id uuid;
BEGIN
	-- UPDATE kiểm cả Bộ đề cũ lẫn mới: không được chuyển dòng ra khỏi một Bộ đề đã Phát hành.
	FOR parent_id IN
		SELECT DISTINCT x FROM unnest(ARRAY[
			CASE WHEN TG_OP <> 'INSERT' THEN OLD.exam_id END,
			CASE WHEN TG_OP <> 'DELETE' THEN NEW.exam_id END
		]) AS x WHERE x IS NOT NULL
	LOOP
		-- Không còn dòng Bộ đề (đang xóa theo ON DELETE CASCADE của một Bộ đề nháp) thì cho qua.
		SELECT status INTO parent_status FROM exams WHERE id = parent_id;
		IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
			RAISE EXCEPTION 'Bo de da phat hanh, khong sua duoc noi dung' USING ERRCODE = 'check_violation';
		END IF;
	END LOOP;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER exam_items_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_items
	FOR EACH ROW EXECUTE FUNCTION exam_children_guard();
--> statement-breakpoint
CREATE TRIGGER exam_sections_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_sections
	FOR EACH ROW EXECUTE FUNCTION exam_children_guard();
--> statement-breakpoint
CREATE FUNCTION exams_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		IF OLD.status <> 'draft' THEN
			RAISE EXCEPTION 'Bo de da phat hanh, khong xoa duoc' USING ERRCODE = 'check_violation';
		END IF;
		RETURN OLD;
	END IF;
	IF OLD.status = 'draft' THEN
		-- Rời nháp chỉ để Phát hành, và chỉ khi mọi câu đã có bản chụp (chấm điểm chỉ tin bản chụp).
		IF NEW.status <> 'draft' THEN
			IF NEW.status <> 'published' OR EXISTS (
				SELECT 1 FROM exam_items WHERE exam_id = NEW.id AND snapshot IS NULL
			) THEN
				RAISE EXCEPTION 'Bo de chua co ban chup, khong phat hanh duoc' USING ERRCODE = 'check_violation';
			END IF;
		END IF;
		RETURN NEW;
	END IF;
	-- Đã Phát hành hoặc Lưu trữ: chỉ được đổi trạng thái (published <-> archived), archived_at, owner_id, updated_at.
	IF NEW.status = 'draft'
		OR NEW.title IS DISTINCT FROM OLD.title
		OR NEW.instructions IS DISTINCT FROM OLD.instructions
		OR NEW.version IS DISTINCT FROM OLD.version
		OR NEW.published_at IS DISTINCT FROM OLD.published_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'Bo de da phat hanh, khong sua duoc noi dung' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER exams_guard BEFORE UPDATE OR DELETE ON exams
	FOR EACH ROW EXECUTE FUNCTION exams_guard();

--> statement-breakpoint
-- exam_item_illustrations quyết định ảnh nào không xóa được và ai xem được ảnh (Q176): cũng bất biến sau Phát hành.
CREATE FUNCTION exam_item_illustrations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	parent_status exam_status;
	item_id uuid;
BEGIN
	IF TG_OP = 'DELETE' THEN item_id := OLD.exam_item_id; ELSE item_id := NEW.exam_item_id; END IF;
	SELECT e.status INTO parent_status FROM exam_items i JOIN exams e ON e.id = i.exam_id WHERE i.id = item_id;
	IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
		RAISE EXCEPTION 'Bo de da phat hanh, khong sua duoc noi dung' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER exam_item_illustrations_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_item_illustrations
	FOR EACH ROW EXECUTE FUNCTION exam_item_illustrations_guard();
