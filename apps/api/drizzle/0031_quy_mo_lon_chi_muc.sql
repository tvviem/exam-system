CREATE INDEX "exam_items_question_idx" ON "exam_items" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at","id") WHERE "users"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "users_code_lower_idx" ON "users" USING btree (lower("code")) WHERE "users"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "users_class_lower_idx" ON "users" USING btree (lower("class_label")) WHERE "users"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "questions_owner_recent_idx" ON "questions" USING btree ("owner_id","updated_at","id") WHERE "questions"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "questions_owner_archived_idx" ON "questions" USING btree ("owner_id","updated_at","id") WHERE "questions"."archived_at" IS NOT NULL;--> statement-breakpoint
-- Viết tay (Drizzle không khai báo được): thiếu thống kê trên biểu thức, PostgreSQL ước lượng hầu hết bảng khớp danh sách Mã định danh
-- và bỏ qua users_code_lower_idx (docs/plan/quy-mo-lon-thiet-ke.md mục 4.2).
CREATE STATISTICS "users_code_lower_stat" ON (lower("code")) FROM "users";--> statement-breakpoint
ANALYZE "users";
