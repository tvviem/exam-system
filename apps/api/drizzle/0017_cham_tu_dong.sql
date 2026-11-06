CREATE TYPE "public"."response_grade_source" AS ENUM('auto', 'manual', 'appeal', 'correction');--> statement-breakpoint
CREATE TABLE "attempt_grades" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"graded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_grades" (
	"attempt_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"score" numeric(6, 2),
	"source" "response_grade_source" NOT NULL,
	"graded_by" uuid,
	"graded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feedback" text,
	CONSTRAINT "response_grades_attempt_id_item_id_pk" PRIMARY KEY("attempt_id","item_id"),
	CONSTRAINT "response_grades_manual_has_grader" CHECK ("response_grades"."source" = 'auto' OR "response_grades"."graded_by" IS NOT NULL),
	CONSTRAINT "response_grades_feedback_len" CHECK ("response_grades"."feedback" IS NULL OR char_length("response_grades"."feedback") <= 1000),
	CONSTRAINT "response_grades_score_range" CHECK ("response_grades"."score" IS NULL OR "response_grades"."score" >= 0)
);
--> statement-breakpoint
ALTER TABLE "attempt_grades" ADD CONSTRAINT "attempt_grades_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_grades" ADD CONSTRAINT "response_grades_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_grades" ADD CONSTRAINT "response_grades_item_id_exam_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."exam_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_grades" ADD CONSTRAINT "response_grades_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "response_grades_pending_idx" ON "response_grades" USING btree ("item_id") WHERE "response_grades"."score" IS NULL;--> statement-breakpoint
CREATE INDEX "attempts_submitted_idx" ON "attempts" USING btree ("submitted_at") WHERE "attempts"."status" = 'submitted';
--> statement-breakpoint
-- Điểm chỉ ghi cho Lượt đã nộp (Q285, ADR-0008): khóa dòng Lượt FOR SHARE nên Hoàn tác Buộc nộp (đổi dòng Lượt) xen vào thì
-- chờ rồi thấy kết quả của nhau; chấm xen sau Hoàn tác thấy Lượt đang làm và bị từ chối. Câu phải thuộc Bộ đề của Phiên thi,
-- điểm trong [0, điểm của câu].
CREATE FUNCTION response_grades_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	attempt_status attempt_status;
	item_points numeric;
BEGIN
	SELECT status INTO attempt_status FROM attempts WHERE id = NEW.attempt_id FOR SHARE;
	IF attempt_status IS DISTINCT FROM 'submitted' THEN
		RAISE EXCEPTION 'Luot lam bai chua nop, khong cham diem duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'UPDATE' AND (NEW.attempt_id <> OLD.attempt_id OR NEW.item_id <> OLD.item_id) THEN
		RAISE EXCEPTION 'Diem khong doi sang Luot hay cau khac' USING ERRCODE = 'check_violation';
	END IF;
	SELECT ei.points INTO item_points
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
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER response_grades_guard BEFORE INSERT OR UPDATE ON response_grades
	FOR EACH ROW EXECUTE FUNCTION response_grades_guard();
--> statement-breakpoint
CREATE FUNCTION attempt_grades_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	attempt_status attempt_status;
BEGIN
	SELECT status INTO attempt_status FROM attempts WHERE id = NEW.attempt_id FOR SHARE;
	IF attempt_status IS DISTINCT FROM 'submitted' THEN
		RAISE EXCEPTION 'Luot lam bai chua nop, khong danh dau da cham' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attempt_grades_guard BEFORE INSERT ON attempt_grades
	FOR EACH ROW EXECUTE FUNCTION attempt_grades_guard();
