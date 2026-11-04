import { countSessionActivities, type SessionActivityCounts } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, exists, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import { SESSION_ATTEMPTS, type SessionAttempts } from '../../common/session-attempts';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { sessionRoster, sessions } from './session.schema';

export interface OwnedSessionSummary {
  sessions: SessionActivityCounts;
  /** Số Phiên thi mà người nhận đang có tên trong Danh sách dự thi (chỉ khi hỏi theo `recipientId`). */
  recipientInRoster?: number;
}

/**
 * Phiên thi đi cùng Xóa người dùng (Q263): mọi Phiên thi của Người ra đề, ở mọi trạng thái kể cả đã Hủy, sang người nhận.
 * Danh sách dự thi, Lượt và Câu trả lời giữ nguyên vì chúng gắn với Phiên thi, không gắn với chủ. Chạy SAU Bộ đề và Câu
 * hỏi trong cùng giao dịch (Q265). Chuyển giao Chủ đề không gọi tới đây.
 */
@Injectable()
export class SessionOwnedContent {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SESSION_ATTEMPTS) private readonly attempts: SessionAttempts,
  ) {}

  async summaryOf(userId: string, recipientId?: string): Promise<OwnedSessionSummary> {
    const rows = await this.db
      .select({
        id: sessions.id,
        opensAt: sessions.opensAt,
        closesAt: sessions.closesAt,
        entryClosedAt: sessions.entryClosedAt,
        cancelledAt: sessions.cancelledAt,
      })
      .from(sessions)
      .where(eq(sessions.ownerId, userId));
    const running = await this.attempts.inProgressCounts(rows.map((row) => row.id));
    const summary: OwnedSessionSummary = {
      sessions: countSessionActivities(
        rows.map((row) => ({ ...row, hasInProgress: (running.get(row.id) ?? 0) > 0 })),
        this.clock.now(),
      ),
    };
    if (recipientId) {
      const [overlap] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(sessions)
        .where(
          and(
            eq(sessions.ownerId, userId),
            exists(
              this.db
                .select({ one: sql`1` })
                .from(sessionRoster)
                .where(
                  and(
                    eq(sessionRoster.sessionId, sessions.id),
                    eq(sessionRoster.userId, recipientId),
                  ),
                ),
            ),
          ),
        );
      summary.recipientInRoster = overlap?.n ?? 0;
    }
    return summary;
  }

  /**
   * Khóa mọi Phiên thi của người cho theo thứ tự `id` (Q265). `FOR NO KEY UPDATE` để Bắt đầu Lượt (giữ `FOR SHARE` trên
   * Phiên thi) chỉ chờ đúng lúc đổi chủ chứ không bị chặn lâu, và để không xung đột với khóa khóa ngoại của Lượt.
   */
  async lock(tx: Transaction, fromId: string): Promise<void> {
    await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.ownerId, fromId))
      .orderBy(sessions.id)
      .for('no key update');
  }

  /** Đổi chủ mọi Phiên thi; tăng `version` để chủ cũ đang mở form sửa nhận CONFLICT thay vì ghi đè. */
  async apply(
    tx: Transaction,
    { fromId, toId }: { fromId: string; toId: string },
  ): Promise<number> {
    const moved = await tx
      .update(sessions)
      .set({ ownerId: toId, version: sql`${sessions.version} + 1` })
      .where(eq(sessions.ownerId, fromId))
      .returning({ id: sessions.id });
    return moved.length;
  }
}
