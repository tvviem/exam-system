-- Nhật ký thao tác chỉ ghi thêm: chặn UPDATE và DELETE ở mức DB.
CREATE FUNCTION audit_logs_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs chỉ cho phép INSERT (% bị từ chối)', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_change();
--> statement-breakpoint
-- Tìm Người dùng không dấu (Q69).
CREATE EXTENSION IF NOT EXISTS unaccent;
