import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { idColumn } from '../../db/columns';

export const backupRunStatusEnum = pgEnum('backup_run_status', ['ok', 'failed']);

/**
 * Kết quả các lần sao lưu quan trọng (Q362, Q366), để Quản trị viên xem chỉ đọc và để job `backup.check` báo chuông.
 * Sổ GỐC là file `~/.local/state/exam-<stage>/backup-runs.jsonl` ở máy (Q359); bảng này chỉ là bản sao để hiển thị.
 * Do script `infra/scripts/exam-backup.sh` ghi bằng psql, KHÔNG phải ứng dụng; ứng dụng chỉ đọc (và dọn dòng quá 12 tháng).
 * Chỉ ghi: việc quan trọng thành công, mọi lỗi, và dòng "đã phục hồi" khi đẩy lại được sau một đợt lỗi (đẩy thành công
 * bình thường mỗi phút KHÔNG ghi). `detail` ngắn, KHÔNG chứa bí mật.
 */
export const backupRuns = pgTable(
  'backup_runs',
  {
    id: idColumn(),
    /** Mã duy nhất của lần chạy (giờ ghi sổ + loại việc) để script chèn bù mà không trùng. */
    runKey: text('run_key').notNull(),
    /** dump-nightly, dump-publish, basebackup, restore-test, nightly, secrets, catchup, push. Chuỗi tự do: script thêm loại mới không cần migration. */
    kind: text('kind').notNull(),
    status: backupRunStatusEnum('status').notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
    seconds: integer('seconds'),
    bytes: bigint('bytes', { mode: 'number' }),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('backup_runs_run_key_idx').on(t.runKey),
    index('backup_runs_finished_idx').on(t.finishedAt),
    index('backup_runs_kind_finished_idx').on(t.kind, t.finishedAt),
    check('backup_runs_detail_len', sql`char_length(${t.detail}) <= 200`),
  ],
);
