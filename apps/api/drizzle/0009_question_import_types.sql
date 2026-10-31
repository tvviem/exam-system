-- Lô nhập có nhiều Loại câu hỏi, mỗi Loại một sheet (Q156): thêm loại vào từng dòng, số dòng chỉ duy nhất trong sheet.
DROP INDEX "question_import_items_batch_row_unique";--> statement-breakpoint
ALTER TABLE "question_import_items" ADD COLUMN "type" "question_type";--> statement-breakpoint
ALTER TABLE "question_import_items" ADD COLUMN "duplicate_of_type" "question_type";--> statement-breakpoint
-- Lô cũ chỉ có hai Loại; dòng lỗi không có nội dung nên không biết Loại, coi là Câu chọn một.
UPDATE "question_import_items" SET "type" = COALESCE(("payload" ->> 'type')::"question_type", 'single_choice');--> statement-breakpoint
UPDATE "question_import_items" AS i SET "duplicate_of_type" = j."type"
  FROM "question_import_items" AS j
  WHERE i."duplicate_of_row" IS NOT NULL AND j."batch_id" = i."batch_id" AND j."row_number" = i."duplicate_of_row";--> statement-breakpoint
ALTER TABLE "question_import_items" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "question_import_items_batch_row_unique" ON "question_import_items" USING btree ("batch_id","type","row_number");
