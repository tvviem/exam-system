CREATE TABLE "exam_section_draws" (
	"section_id" uuid PRIMARY KEY NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	CONSTRAINT "exam_section_draws_percent_range" CHECK ("exam_section_draws"."percent" >= 0 AND "exam_section_draws"."percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "exam_section_draws" ADD CONSTRAINT "exam_section_draws_section_id_exam_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."exam_sections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Q439: tỷ lệ rút mặc định đóng băng khi Phát hành cùng Bộ đề (như Phần và câu, `exam_children_guard`), kể cả SQL ghi trực tiếp.
-- Không còn dòng Phần (đang xóa theo ON DELETE CASCADE của một Bộ đề hay Phần nháp) thì cho qua.
CREATE FUNCTION exam_section_draws_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	parent_status exam_status;
	target uuid;
BEGIN
	FOR target IN
		SELECT DISTINCT x FROM unnest(ARRAY[
			CASE WHEN TG_OP <> 'INSERT' THEN OLD.section_id END,
			CASE WHEN TG_OP <> 'DELETE' THEN NEW.section_id END
		]) AS x WHERE x IS NOT NULL
	LOOP
		SELECT e.status INTO parent_status
			FROM exam_sections s JOIN exams e ON e.id = s.exam_id WHERE s.id = target;
		IF parent_status IS NOT NULL AND parent_status <> 'draft' THEN
			RAISE EXCEPTION 'Bo de da phat hanh, khong sua duoc ty le rut' USING ERRCODE = 'check_violation';
		END IF;
	END LOOP;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER exam_section_draws_guard BEFORE INSERT OR UPDATE OR DELETE ON exam_section_draws
	FOR EACH ROW EXECUTE FUNCTION exam_section_draws_guard();
