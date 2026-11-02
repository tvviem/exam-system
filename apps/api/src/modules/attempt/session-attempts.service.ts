import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { CLOCK, type Clock } from '../../common/clock';
import { uniqueViolationOf } from '../../common/pg-error';
import type {
  ExamDeviceSummary,
  SessionAttempts,
  SubmitReason,
} from '../../common/session-attempts';
import type { UserDeactivationHooks } from '../../common/user-deactivation';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { attempts, sessionDevices } from './attempt.schema';
import { closeInProgress } from './attempt-close';

/** Lý do ghi khi thiết bị đang gắn bị thu hồi để nhường chỗ cho thiết bị được Cho vào lại (Q234). */
const PARDON_SWAP_REASON = 'pardon_swap';

/** Cài đặt cổng `SESSION_ATTEMPTS` (Q228) cho `session`. */
@Injectable()
export class SessionAttemptsService implements SessionAttempts, UserDeactivationHooks {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async hasAttempts(sessionId: string, executor: Pick<Database, 'select'> = this.db) {
    const [row] = await executor
      .select({ n: count() })
      .from(attempts)
      .where(eq(attempts.sessionId, sessionId));
    return (row?.n ?? 0) > 0;
  }

  async attemptCounts(sessionId: string) {
    const rows = await this.db
      .select({ userId: attempts.userId, n: count() })
      .from(attempts)
      .where(eq(attempts.sessionId, sessionId))
      .groupBy(attempts.userId);
    return new Map(rows.map((row) => [row.userId, row.n]));
  }

  async closeAll(tx: Transaction, sessionId: string, reason: SubmitReason) {
    return (await closeInProgress(tx, eq(attempts.sessionId, sessionId), reason, this.clock.now()))
      .length;
  }

  async closeForUser(tx: Transaction, userId: string, reason: SubmitReason) {
    return (await closeInProgress(tx, eq(attempts.userId, userId), reason, this.clock.now()))
      .length;
  }

  /** Khóa đăng nhập hoặc Xóa người dùng (Q218): nộp các Lượt đang làm của người đó. */
  async onDeactivated(tx: Transaction, userId: string) {
    await this.closeForUser(tx, userId, 'account_locked');
  }

  async devicesOf(sessionId: string) {
    const rows = await this.db
      .select()
      .from(sessionDevices)
      .where(eq(sessionDevices.sessionId, sessionId));
    const map = new Map<string, ExamDeviceSummary[]>();
    for (const row of rows) {
      const list = map.get(row.userId) ?? [];
      list.push({
        userId: row.userId,
        deviceId: row.id,
        status: row.status,
        ip: row.ip,
        userAgent: row.userAgent,
        boundAt: row.boundAt,
        revokedAt: row.revokedAt,
      });
      map.set(row.userId, list);
    }
    return map;
  }

  async revokeDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; by: string; reason: string | null; now: Date },
  ) {
    const rows = await tx
      .update(sessionDevices)
      .set({
        status: 'revoked',
        revokedAt: input.now,
        revokedBy: input.by,
        revokeReason: input.reason,
      })
      .where(
        and(
          eq(sessionDevices.sessionId, input.sessionId),
          eq(sessionDevices.userId, input.userId),
          eq(sessionDevices.status, 'active'),
        ),
      )
      .returning({ id: sessionDevices.id });
    return rows.length > 0;
  }

  async pardonDevice(
    tx: Transaction,
    input: { sessionId: string; userId: string; deviceId: string; by: string; now: Date },
  ) {
    const [target] = await tx
      .select({ id: sessionDevices.id })
      .from(sessionDevices)
      .where(
        and(
          eq(sessionDevices.id, input.deviceId),
          eq(sessionDevices.sessionId, input.sessionId),
          eq(sessionDevices.userId, input.userId),
          eq(sessionDevices.status, 'revoked'),
        ),
      )
      .for('update');
    if (!target) return false;
    // Thu hồi thiết bị mới (nếu có) trước để chỉ mục "một thiết bị đang gắn" không bị vi phạm, rồi kích hoạt lại thiết bị cũ.
    await tx
      .update(sessionDevices)
      .set({
        status: 'revoked',
        revokedAt: input.now,
        revokedBy: input.by,
        revokeReason: PARDON_SWAP_REASON,
      })
      .where(
        and(
          eq(sessionDevices.sessionId, input.sessionId),
          eq(sessionDevices.userId, input.userId),
          eq(sessionDevices.status, 'active'),
          sql`${sessionDevices.id} <> ${input.deviceId}`,
        ),
      );
    try {
      // Điểm lưu: thiết bị khác vừa nhập mã và chiếm chỗ "đang gắn" thì báo lỗi rõ ràng thay vì lỗi máy chủ.
      await tx.transaction(async (inner) => {
        await inner
          .update(sessionDevices)
          .set({ status: 'active', pardonedAt: input.now })
          .where(eq(sessionDevices.id, input.deviceId));
      });
    } catch (error) {
      if (uniqueViolationOf(error)) {
        throw new ApiError('INVALID_STATE', { reason: 'DEVICE_BOUND_ELSEWHERE' });
      }
      throw error;
    }
    return true;
  }
}
