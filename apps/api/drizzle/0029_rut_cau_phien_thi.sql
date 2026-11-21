CREATE TABLE "session_section_draws" (
	"session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"percent" numeric(5, 2) NOT NULL,
	CONSTRAINT "session_section_draws_session_id_section_id_pk" PRIMARY KEY("session_id","section_id"),
	CONSTRAINT "session_section_draws_percent_range" CHECK ("session_section_draws"."percent" >= 0 AND "session_section_draws"."percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "session_section_draws" ADD CONSTRAINT "session_section_draws_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_section_draws" ADD CONSTRAINT "session_section_draws_section_id_exam_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."exam_sections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Ghi đè tỷ lệ rút ở Phiên thi (Q438): Phần phải thuộc Bộ đề của Phiên thi; Phiên thi đã có Lượt làm bài thì không thêm,
-- sửa, xóa dòng nào (cùng tinh thần sessions_guard, Q161). Xóa Phiên thi chưa có Lượt thì dòng đi theo ON DELETE CASCADE.
CREATE FUNCTION session_section_draws_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
BEGIN
	IF EXISTS (SELECT 1 FROM attempts WHERE session_id = target) THEN
		RAISE EXCEPTION 'Phien thi da co Luot lam bai, khong sua duoc ty le rut' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP <> 'DELETE' AND NOT EXISTS (
		SELECT 1 FROM sessions s JOIN exam_sections es ON es.exam_id = s.exam_id
		WHERE s.id = NEW.session_id AND es.id = NEW.section_id
	) THEN
		RAISE EXCEPTION 'Phan khong thuoc Bo de cua Phien thi' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER session_section_draws_guard BEFORE INSERT OR UPDATE OR DELETE ON session_section_draws
	FOR EACH ROW EXECUTE FUNCTION session_section_draws_guard();
