import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { idColumn } from '../../db/columns';
import { users } from '../identity/identity.schema';

/** Sáu loại thư (Q382). */
export const mailKindEnum = pgEnum('mail_kind', [
  'activation',
  'invitation',
  'password_reset',
  'password_changed',
  'email_change',
  'email_changed_notice',
]);

/** `urgent`: dùng phần dự trữ 100/400; `bulk`: tối đa 300 (Q375). */
export const mailLaneEnum = pgEnum('mail_lane', ['urgent', 'bulk']);

/**
 * pending: chờ gửi (kể cả chờ thử lại); sending: worker đang gửi; sent: máy chủ thư đã nhận;
 * failed: hết lần thử; rejected: địa chỉ bị từ chối cứng; skipped: chưa cấu hình gửi thư.
 */
export const mailStatusEnum = pgEnum('mail_status', [
  'pending',
  'sending',
  'sent',
  'failed',
  'rejected',
  'skipped',
]);

/**
 * Hàng đợi thư bền (ADR-0009). KHÔNG BAO GIỜ lưu mã hay nội dung có mã (Q381): worker dựng thư lúc gửi.
 * `lastError` đã che bí mật trước khi ghi.
 */
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: idColumn(),
    kind: mailKindEnum('kind').notNull(),
    lane: mailLaneEnum('lane').notNull(),
    toEmail: text('to_email').notNull(),
    status: mailStatusEnum('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    lastError: text('last_error'),
    userId: uuid('user_id').references(() => users.id),
    requestedBy: uuid('requested_by').references(() => users.id),
    /** Dữ liệu không bí mật cho mẫu thư (giờ, trình duyệt, hệ điều hành của thư "mật khẩu đã đổi"); KHÔNG BAO GIỜ chứa mã. */
    context: jsonb('context').$type<Record<string, string>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('email_outbox_due_idx').on(t.status, t.nextAttemptAt),
    index('email_outbox_sent_idx').on(t.sentAt),
    // Tìm địa chỉ đã bị từ chối cứng và kiểm giới hạn gửi lại: so sánh không phân biệt chữ hoa thường.
    index('email_outbox_rejected_idx')
      .on(sql`lower(${t.toEmail})`)
      .where(sql`${t.status} = 'rejected'`),
    index('email_outbox_resend_idx').on(sql`lower(${t.toEmail})`, t.kind, t.createdAt),
  ],
);
