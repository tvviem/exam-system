-- Tìm Người dùng nhanh ở quy mô lớn (docs/plan/quy-mo-lon-thiet-ke.md mục 4.3, Q488): một cột gộp các trường tìm được, đã bỏ dấu
-- và chữ thường, kèm chỉ mục trigram. Thứ tự viết tay: phần mở rộng, cột, trigger, điền dữ liệu cũ, rồi mới tạo chỉ mục.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Mỗi trường một dòng: từ khóa (không chứa xuống dòng) không thể khớp vắt qua hai trường. Tên có lược đồ để chạy đúng cả khi
-- `search_path` rỗng (khôi phục sao lưu).
CREATE FUNCTION "public"."users_search_text"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := lower(public.unaccent('public.unaccent', concat_ws(E'\n', NEW.full_name, NEW.username::text, NEW.email::text, NEW.code, NEW.class_label)));
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "users_search_text" BEFORE INSERT OR UPDATE OF "full_name", "username", "email", "code", "class_label", "search_text" ON "users"
FOR EACH ROW EXECUTE FUNCTION "public"."users_search_text"();--> statement-breakpoint
-- Điền cho Người dùng đã có (trigger tính lại giá trị); `updated_at` do ứng dụng đặt nên không đổi.
UPDATE "users" SET "search_text" = '';--> statement-breakpoint
CREATE INDEX "users_search_trgm_idx" ON "users" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
ANALYZE "users";
