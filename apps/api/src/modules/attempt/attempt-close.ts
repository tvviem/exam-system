import { type SQL, sql } from 'drizzle-orm';
import type { SubmitReason } from '../../common/session-attempts';
import type { Database, Transaction } from '../../db/db.module';

/**
 * Nộp mọi Lượt đang làm thỏa `where` (điều kiện trên bảng `attempts`) với `reason` (Q233). Chỗ duy nhất đổi Lượt sang đã nộp
 * theo điều kiện; chạy lại không làm gì với Lượt đã nộp. Khóa các dòng theo thứ tự `id` để nhiều giao dịch đóng Lượt cùng
 * lúc (Hủy hai Phiên thi, Khóa người dùng) không khóa chéo nhau. Trả id các Lượt vừa đóng. Job quét có câu SQL riêng vì cần
 * giới hạn lô và `SKIP LOCKED`.
 */
export async function closeInProgress(
  executor: Database | Transaction,
  where: SQL,
  reason: SubmitReason,
  now: Date,
): Promise<string[]> {
  const result = await executor.execute<{ id: string }>(sql`
    update attempts
    set status = 'submitted', submitted_at = ${now}, submit_reason = ${reason}::attempt_submit_reason
    where id in (
      select id from attempts where ${where} and status = 'in_progress' order by id for update
    )
    returning id`);
  return result.rows.map((row) => row.id);
}
