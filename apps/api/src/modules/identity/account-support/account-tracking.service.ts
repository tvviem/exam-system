import { Inject, Injectable } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';
import type { Actor } from '../../../common/actor';
import { ApiError } from '../../../common/api-error';
import { CLOCK, type Clock } from '../../../common/clock';
import {
  SUPPORT_ROSTER_SCOPE,
  type SupportRosterScope,
} from '../../../common/support-roster-scope';
import { type Database, DB } from '../../../db/db.module';
import { AuditService } from '../../audit/audit.service';
import { MailService } from '../../mail/mail.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SupportRateLimiter } from './support-rate-limiter';

/** Sáu trạng thái riêng của bảng theo dõi kích hoạt (docs/plan/slice-7d-thiet-ke-kiem-thu.md, D-29). */
export const TRACKING_STATES = [
  'not_sent',
  'sent',
  'mail_failed',
  'needs_check',
  'activated',
  'email_unverified',
] as const;
export type TrackingState = (typeof TRACKING_STATES)[number];

/** Nhóm "Chờ kích hoạt": mọi tài khoản chưa đặt mật khẩu, bất kể thư đang ở bước nào (quyết định A, 15/11/2026). */
export const AWAITING_STATES: readonly TrackingState[] = [
  'not_sent',
  'sent',
  'mail_failed',
  'needs_check',
];

/** Quá mốc này kể từ lần gửi thành công mà chưa kích hoạt: "Cần kiểm tra" (thư có thể đã vào rác hoặc bị trả lại). */
const NEEDS_CHECK_AFTER_HOURS = 48;

export interface TrackingOptions {
  state?: TrackingState;
  group?: 'awaiting';
  page: number;
  pageSize: number;
}

export interface TrackingRow {
  userId: string;
  fullName: string;
  code: string | null;
  email: string | null;
  state: TrackingState;
  /** Người xem được phép Gửi lại, Sửa email, Liên kết hỗ trợ cho dòng này (chỉ xem trạng thái nếu `false`). */
  actionable: boolean;
}

export interface TrackingPage {
  items: TrackingRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Số dòng theo từng trạng thái, tính trên toàn bộ Yêu cầu (không theo trang, không theo bộ lọc). */
  counts: Record<TrackingState, number>;
}

type RawRow = {
  user_id: string;
  full_name: string;
  code: string | null;
  email: string | null;
  state: TrackingState;
};

/**
 * Bảng theo dõi kích hoạt của một Yêu cầu cấp tài khoản (7d-2): mỗi tài khoản Người dự thi mà Yêu cầu đã tạo hoặc gắn nhãn,
 * kèm trạng thái tính từ `users` và thư kích hoạt gần nhất trong `email_outbox`; và "Gửi lại cho tất cả".
 */
@Injectable()
export class AccountTrackingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SUPPORT_ROSTER_SCOPE) private readonly roster: SupportRosterScope,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly limiter: SupportRateLimiter,
  ) {}

  async forRequest(
    user: AuthenticatedUser,
    requestId: string,
    options: TrackingOptions,
  ): Promise<TrackingPage> {
    await this.assertCanView(user, requestId);
    const rows = await this.rows(this.requestMembers(requestId));
    return this.page(rows, await this.actionableAmong(user, rows), options);
  }

  /** Bảng theo dõi của Danh sách dự thi một Phiên thi: Người ra đề chỉ Phiên thi của mình (404 nếu không), Quản trị viên mọi Phiên thi. */
  async forSession(
    user: AuthenticatedUser,
    sessionId: string,
    options: TrackingOptions,
  ): Promise<TrackingPage> {
    if (!user.isAdmin && !user.roleTags.includes('examiner')) throw new ApiError('FORBIDDEN');
    const ids = await this.roster.rosterUserIds(sessionId, user.isAdmin ? null : user.id);
    if (!ids) throw new ApiError('NOT_FOUND');
    const members =
      ids.length === 0
        ? sql`SELECT NULL::uuid WHERE FALSE`
        : sql`SELECT unnest(ARRAY[${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}])`;
    const rows = await this.rows(members);
    return this.page(rows, await this.actionableAmong(user, rows), options);
  }

  /**
   * Những dòng mình được thao tác (quyền từng người, như `canSupport`): Quản trị viên mọi dòng; Người ra đề chỉ tài khoản do Yêu cầu của
   * mình tạo hoặc khôi phục, hoặc đang trong Danh sách dự thi chưa kết thúc của mình. Dòng còn lại chỉ hiện trạng thái (P3).
   */
  private async actionableAmong(user: AuthenticatedUser, rows: RawRow[]): Promise<Set<string>> {
    const ids = rows.map((r) => r.user_id);
    if (user.isAdmin) return new Set(ids);
    if (ids.length === 0) return new Set();
    const made = await this.db.execute<{ user_id: string }>(sql`
      SELECT DISTINCT i.user_id FROM account_request_items i
        JOIN account_requests r ON r.id = i.request_id
       WHERE r.requested_by = ${user.id} AND i.outcome IN ('created', 'restored')
         AND i.user_id IN (${sql.join(
           ids.map((id) => sql`${id}::uuid`),
           sql`, `,
         )})`);
    const actionable = new Set(made.rows.map((r) => r.user_id));
    const rest = ids.filter((id) => !actionable.has(id));
    for (const id of await this.roster.inOpenRosterAmong(user.id, rest)) actionable.add(id);
    return actionable;
  }

  private page(all: RawRow[], actionable: Set<string>, options: TrackingOptions): TrackingPage {
    const counts = Object.fromEntries(TRACKING_STATES.map((s) => [s, 0])) as Record<
      TrackingState,
      number
    >;
    for (const r of all) counts[r.state]++;
    let filtered = all;
    if (options.group) filtered = all.filter((r) => AWAITING_STATES.includes(r.state));
    else if (options.state) filtered = all.filter((r) => r.state === options.state);
    const start = (options.page - 1) * options.pageSize;
    return {
      items: filtered.slice(start, start + options.pageSize).map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        code: r.code,
        email: r.email,
        state: r.state,
        actionable: actionable.has(r.user_id),
      })),
      total: filtered.length,
      page: options.page,
      pageSize: options.pageSize,
      counts,
    };
  }

  /**
   * "Gửi lại cho tất cả" (D-34 đến D-36): xếp thư kích hoạt cho mọi người còn Chờ kích hoạt của Yêu cầu và chưa được gửi lại trong
   * 24 giờ. Người ra đề: tối đa 1 lần mỗi 6 giờ; Quản trị viên không bị giới hạn này.
   */
  async resendAll(
    user: AuthenticatedUser,
    actor: Actor,
    requestId: string,
  ): Promise<{ queued: number; skipped: number }> {
    await this.assertCanView(user, requestId);
    if (!user.isAdmin) {
      const permit = await this.limiter.tryBulkResend(actor.id);
      if (!permit.allowed) {
        throw new ApiError('RATE_LIMITED', { allowedAt: permit.allowedAt.toISOString() });
      }
    }
    const all = await this.rows(this.requestMembers(requestId));
    const actionable = await this.actionableAmong(user, all);
    const queued: { userId: string; email: string }[] = [];
    for (const row of all) {
      if (!actionable.has(row.user_id) || !AWAITING_STATES.includes(row.state) || !row.email)
        continue;
      if ((await this.limiter.tryResend(row.user_id)).allowed) {
        queued.push({ userId: row.user_id, email: row.email });
      }
    }
    try {
      await this.mail.enqueueMany(
        queued.map((q) => ({
          kind: 'activation' as const,
          toEmail: q.email,
          lane: user.isAdmin ? ('urgent' as const) : ('bulk' as const),
          userId: q.userId,
          requestedBy: actor.id,
        })),
      );
    } catch (error) {
      for (const q of queued) await this.limiter.refundResend(q.userId);
      if (!user.isAdmin) await this.limiter.refundBulkResend(actor.id);
      throw error;
    }
    // Không ai đủ điều kiện thì không tốn lượt 6 giờ.
    if (queued.length === 0 && !user.isAdmin) await this.limiter.refundBulkResend(actor.id);
    const result = { queued: queued.length, skipped: all.length - queued.length };
    await this.audit.record({
      actor,
      action: 'account-support.resend-all',
      entityType: 'account_request',
      entityId: requestId,
      after: result,
    });
    return result;
  }

  /** Chỉ Quản trị viên hoặc Người ra đề đã tạo Yêu cầu. Người khác 404 (không cho dò), Người dự thi 403. */
  private async assertCanView(user: AuthenticatedUser, requestId: string): Promise<void> {
    if (!user.isAdmin && !user.roleTags.includes('examiner')) throw new ApiError('FORBIDDEN');
    const owner = await this.db.execute<{ requested_by: string }>(
      sql`SELECT requested_by FROM account_requests WHERE id = ${requestId}`,
    );
    const row = owner.rows[0];
    if (!row || (!user.isAdmin && row.requested_by !== user.id)) throw new ApiError('NOT_FOUND');
  }

  private requestMembers(requestId: string): SQL {
    return sql`SELECT user_id FROM account_request_items WHERE request_id = ${requestId} AND user_id IS NOT NULL`;
  }

  /** `members`: truy vấn trả về cột mã người dùng thuộc phạm vi (Yêu cầu hoặc Danh sách dự thi). */
  private async rows(members: SQL): Promise<RawRow[]> {
    const cutoff = new Date(this.clock.now().getTime() - NEEDS_CHECK_AFTER_HOURS * 3_600_000);
    const result = await this.db.execute<RawRow>(sql`
      SELECT u.id AS user_id, u.full_name, u.code, u.email,
        CASE
          WHEN u.password_hash IS NOT NULL AND u.email_verified_at IS NOT NULL THEN 'activated'
          WHEN u.password_hash IS NOT NULL THEN 'email_unverified'
          WHEN m.status IN ('rejected', 'failed') THEN 'mail_failed'
          WHEN m.status = 'sent' AND m.sent_at < ${cutoff.toISOString()}::timestamptz THEN 'needs_check'
          WHEN m.status = 'sent' THEN 'sent'
          ELSE 'not_sent'
        END AS state
        FROM users u
        LEFT JOIN LATERAL (
          SELECT o.status, o.sent_at FROM email_outbox o
           WHERE o.user_id = u.id AND o.kind = 'activation'
           ORDER BY o.created_at DESC LIMIT 1
        ) m ON TRUE
       WHERE u.removed_at IS NULL AND u.id IN (${members})
       ORDER BY u.full_name, u.id`);
    return result.rows;
  }
}
