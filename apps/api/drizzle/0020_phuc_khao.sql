CREATE TYPE "public"."appeal_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."appeal_target" AS ENUM('response', 'penalty');--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"target" "appeal_target" NOT NULL,
	"item_id" uuid,
	"violation_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "appeal_status" DEFAULT 'open' NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"resolver_id" uuid,
	"response" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "appeals_target_match" CHECK (("appeals"."target" = 'response' AND "appeals"."item_id" IS NOT NULL AND "appeals"."violation_id" IS NULL) OR ("appeals"."target" = 'penalty' AND "appeals"."violation_id" IS NOT NULL AND "appeals"."item_id" IS NULL)),
	CONSTRAINT "appeals_reason_len" CHECK (char_length("appeals"."reason") BETWEEN 10 AND 1000),
	CONSTRAINT "appeals_response_len" CHECK ("appeals"."response" IS NULL OR char_length("appeals"."response") BETWEEN 1 AND 1000),
	CONSTRAINT "appeals_resolved_consistent" CHECK (("appeals"."status" = 'open' AND "appeals"."resolver_id" IS NULL AND "appeals"."response" IS NULL AND "appeals"."resolved_at" IS NULL AND "appeals"."previous_value" IS NULL AND "appeals"."new_value" IS NULL) OR ("appeals"."status" = 'resolved' AND "appeals"."resolver_id" IS NOT NULL AND "appeals"."response" IS NOT NULL AND "appeals"."resolved_at" IS NOT NULL AND "appeals"."previous_value" IS NOT NULL AND "appeals"."new_value" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "session_gradings" ADD COLUMN "appeal_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_item_id_exam_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."exam_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_violation_id_violations_id_fk" FOREIGN KEY ("violation_id") REFERENCES "public"."violations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_resolver_id_users_id_fk" FOREIGN KEY ("resolver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_attempt_item_key" ON "appeals" USING btree ("attempt_id","item_id") WHERE "appeals"."item_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_violation_key" ON "appeals" USING btree ("violation_id") WHERE "appeals"."violation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "appeals_session_status_idx" ON "appeals" USING btree ("session_id","status","created_at");--> statement-breakpoint
CREATE INDEX "appeals_session_user_idx" ON "appeals" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "session_gradings_finalize_idx" ON "session_gradings" USING btree ("released_at") WHERE "session_gradings"."released_at" IS NOT NULL AND "session_gradings"."finalized_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","type") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
-- Phúc khảo (Q300, Q309–Q317). Giờ hạn Phúc khảo do service kiểm bằng đồng hồ của ứng dụng (đồng hồ giả trong test); trigger chỉ
-- giữ những điều không đổi theo giờ: đã Công bố, chưa Chốt, khớp Lượt, mỗi đối tượng một lần, Phúc khảo đã xử lý bất biến.
CREATE FUNCTION appeals_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	released timestamptz;
	finalized timestamptz;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Phuc khao khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	-- Khóa chia sẻ dòng thiết lập chấm: job Chốt (khóa độc quyền) và gia hạn nối đuôi, không Phúc khảo nào lọt qua lúc Chốt.
	SELECT released_at, finalized_at INTO released, finalized
	FROM session_gradings WHERE session_id = NEW.session_id FOR SHARE;
	IF released IS NULL THEN
		RAISE EXCEPTION 'Chua cong bo, khong co Phuc khao' USING ERRCODE = 'check_violation';
	END IF;
	IF finalized IS NOT NULL THEN
		RAISE EXCEPTION 'Ket qua da chot, khong nhan hay xu ly Phuc khao' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'INSERT' THEN
		IF NEW.status <> 'open' THEN
			RAISE EXCEPTION 'Phuc khao moi phai dang cho xu ly' USING ERRCODE = 'check_violation';
		END IF;
		IF NOT EXISTS (
			SELECT 1 FROM attempts
			WHERE id = NEW.attempt_id AND session_id = NEW.session_id AND user_id = NEW.user_id AND status = 'submitted'
		) THEN
			RAISE EXCEPTION 'Phien thi hoac nguoi khong khop Luot lam bai' USING ERRCODE = 'check_violation';
		END IF;
		IF NEW.target = 'response' AND NOT EXISTS (
			SELECT 1 FROM sessions s JOIN exam_items ei ON ei.exam_id = s.exam_id
			WHERE s.id = NEW.session_id AND ei.id = NEW.item_id
		) THEN
			RAISE EXCEPTION 'Cau hoi khong thuoc Bo de cua Phien thi' USING ERRCODE = 'check_violation';
		END IF;
		IF NEW.target = 'penalty' AND NOT EXISTS (
			SELECT 1 FROM violations WHERE id = NEW.violation_id AND attempt_id = NEW.attempt_id
		) THEN
			RAISE EXCEPTION 'Vi pham khong thuoc Luot lam bai' USING ERRCODE = 'check_violation';
		END IF;
		RETURN NEW;
	END IF;
	IF OLD.status <> 'open' THEN
		RAISE EXCEPTION 'Phuc khao da xu ly, khong doi duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF (to_jsonb(NEW) - 'status' - 'previous_value' - 'new_value' - 'resolver_id' - 'response' - 'resolved_at')
		IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'previous_value' - 'new_value' - 'resolver_id' - 'response' - 'resolved_at') THEN
		RAISE EXCEPTION 'Phuc khao chi doi phan xu ly' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER appeals_guard BEFORE INSERT OR UPDATE OR DELETE ON appeals
	FOR EACH ROW EXECUTE FUNCTION appeals_guard();
--> statement-breakpoint
-- Gia hạn Thời hạn phúc khảo (Q314): chỉ tăng, chỉ khi chưa Chốt. Công bố vẫn đặt một lần. Thay hàm của migration 0019.
CREATE OR REPLACE FUNCTION session_gradings_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Thiet lap cham khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.released_at IS NOT NULL AND (
		NEW.released_at IS DISTINCT FROM OLD.released_at OR NEW.released_by IS DISTINCT FROM OLD.released_by
	) THEN
		RAISE EXCEPTION 'Da cong bo, khong doi duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.released_at IS NOT NULL AND NEW.appeal_period_hours IS DISTINCT FROM OLD.appeal_period_hours AND (
		OLD.finalized_at IS NOT NULL OR OLD.appeal_period_hours = 0 OR NEW.appeal_period_hours < OLD.appeal_period_hours
	) THEN
		RAISE EXCEPTION 'Chi duoc gia han Thoi han phuc khao khi chua chot' USING ERRCODE = 'check_violation';
	END IF;
	IF OLD.finalized_at IS NOT NULL AND NEW.finalized_at IS DISTINCT FROM OLD.finalized_at THEN
		RAISE EXCEPTION 'Da chot, khong doi duoc' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
-- Sau Công bố điểm chỉ đổi qua Phúc khảo đang mở (nguồn `appeal`) hoặc Đính chính (nguồn `correction`, 5d-3); sau Chốt không đổi.
-- Thay hàm của migration 0019, giữ nguyên phần cũ.
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
		IF changed AND NEW.source = 'appeal' AND NOT EXISTS (
			SELECT 1 FROM appeals ap
			WHERE ap.attempt_id = NEW.attempt_id AND ap.item_id = NEW.item_id AND ap.status = 'open'
		) THEN
			RAISE EXCEPTION 'Chi doi diem khi co Phuc khao dang mo' USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	RETURN NEW;
END $$;
--> statement-breakpoint
-- Mức xử lý Vi phạm: sau Công bố chỉ đổi khi có Phúc khảo đang mở về đúng Vi phạm đó, sau Chốt không đổi (Q299, Q300). Thay hàm
-- của migration 0014, giữ nguyên phần cũ.
CREATE OR REPLACE FUNCTION violations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	released timestamptz;
	finalized timestamptz;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'Vi pham khong xoa duoc' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'INSERT' THEN
		IF NOT EXISTS (
			SELECT 1 FROM attempts WHERE id = NEW.attempt_id AND session_id = NEW.session_id AND user_id = NEW.user_id
		) THEN
			RAISE EXCEPTION 'Phien thi hoac nguoi khong khop Luot lam bai' USING ERRCODE = 'check_violation';
		END IF;
		RETURN NEW;
	END IF;
	IF (to_jsonb(NEW) - 'penalty_type' - 'penalty_percent' - 'penalty_decided_at')
		IS DISTINCT FROM (to_jsonb(OLD) - 'penalty_type' - 'penalty_percent' - 'penalty_decided_at') THEN
		RAISE EXCEPTION 'Vi pham khong sua duoc, chi quyet hinh phat' USING ERRCODE = 'check_violation';
	END IF;
	IF NEW.penalty_type IS DISTINCT FROM OLD.penalty_type OR NEW.penalty_percent IS DISTINCT FROM OLD.penalty_percent
		OR NEW.penalty_decided_at IS DISTINCT FROM OLD.penalty_decided_at THEN
		SELECT released_at, finalized_at INTO released, finalized
		FROM session_gradings WHERE session_id = NEW.session_id;
		IF released IS NOT NULL THEN
			IF finalized IS NOT NULL THEN
				RAISE EXCEPTION 'Ket qua da chot, khong doi muc xu ly duoc' USING ERRCODE = 'check_violation';
			END IF;
			IF NOT EXISTS (SELECT 1 FROM appeals WHERE violation_id = NEW.id AND status = 'open') THEN
				RAISE EXCEPTION 'Da cong bo, chi doi muc xu ly qua Phuc khao' USING ERRCODE = 'check_violation';
			END IF;
		END IF;
	END IF;
	RETURN NEW;
END $$;
