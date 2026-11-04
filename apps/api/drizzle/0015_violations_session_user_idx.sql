DROP INDEX "violations_session_idx";--> statement-breakpoint
CREATE INDEX "violations_session_user_idx" ON "violations" USING btree ("session_id","user_id");