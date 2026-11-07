import { APPEAL_HOURS_PER_DAY } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import {
  type GradingStatusExecutor,
  type ReleaseState,
  type SessionGradingStatus,
} from '../../common/grading-status';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { appeals, sessionGradings } from './grading.schema';

const HOUR_MS = 3_600_000;

/** Hết hạn lúc nào: `null` khi không nhận Phúc khảo (0 giờ). */
export const appealDeadlineOf = (releasedAt: Date, hours: number): Date | null =>
  hours > 0 ? new Date(releasedAt.getTime() + hours * HOUR_MS) : null;

/**
 * Trạng thái Công bố của Phiên thi (docs/plan/slice-5.md, PR 5c) và cổng ghi: mọi thao tác đổi điểm hay thiết lập chấm lấy khóa
 * dòng `session_gradings` ở chế độ chia sẻ, Công bố lấy khóa độc quyền, nên Công bố và chấm tay nối đuôi nhau (không điểm nào lọt
 * qua giữa chừng).
 */
@Injectable()
export class GradingStatusService implements SessionGradingStatus {
  constructor(@Inject(DB) private readonly db: Database) {}

  async releaseStates(sessionIds: string[], executor: GradingStatusExecutor = this.db) {
    const states = new Map<string, ReleaseState>();
    if (sessionIds.length === 0) return states;
    const rows = await executor
      .select()
      .from(sessionGradings)
      .where(
        and(inArray(sessionGradings.sessionId, sessionIds), isNotNull(sessionGradings.releasedAt)),
      );
    for (const row of rows) {
      if (!row.releasedAt) continue;
      const hours = row.appealPeriodHours ?? 0;
      states.set(row.sessionId, {
        releasedAt: row.releasedAt,
        appealUntil: appealDeadlineOf(row.releasedAt, hours),
        finalizedAt: row.finalizedAt,
      });
    }
    return states;
  }

  /** Bảo đảm có dòng thiết lập chấm của Phiên thi (mặc định bật Chấm ẩn tên). */
  async ensureRow(tx: Transaction, sessionId: string) {
    await tx.insert(sessionGradings).values({ sessionId }).onConflictDoNothing();
  }

  /** Cổng ghi điểm/thiết lập: khóa `FOR SHARE`, và `409 ALREADY_RELEASED` nếu đã Công bố (Q299). */
  async lockForWrite(tx: Transaction, sessionId: string) {
    await this.ensureRow(tx, sessionId);
    const [row] = await tx
      .select({ releasedAt: sessionGradings.releasedAt })
      .from(sessionGradings)
      .where(eq(sessionGradings.sessionId, sessionId))
      .for('share');
    if (row?.releasedAt) throw new ApiError('INVALID_STATE', { reason: 'ALREADY_RELEASED' });
  }

  /**
   * Cổng gửi và xử lý Phúc khảo (Q300, Q301): khóa `FOR SHARE` dòng thiết lập chấm nên Phúc khảo nối đuôi với job Chốt và gia hạn
   * (khóa độc quyền) mà không chặn nhau. `409 NOT_RELEASED` nếu chưa Công bố, `409 ALREADY_FINALIZED` nếu đã Chốt.
   */
  async lockForAppeal(tx: Transaction, sessionId: string) {
    const [row] = await tx
      .select()
      .from(sessionGradings)
      .where(eq(sessionGradings.sessionId, sessionId))
      .for('share');
    if (!row?.releasedAt) throw new ApiError('INVALID_STATE', { reason: 'NOT_RELEASED' });
    if (row.finalizedAt) throw new ApiError('INVALID_STATE', { reason: 'ALREADY_FINALIZED' });
    const hours = row.appealPeriodHours ?? 0;
    return {
      releasedAt: row.releasedAt,
      appealPeriodHours: hours,
      appealUntil: appealDeadlineOf(row.releasedAt, hours),
    };
  }

  /** Số Phúc khảo chờ xử lý và đã xử lý của Phiên thi (hiện ở màn Kết quả và thanh bước của Người ra đề). */
  async appealCounts(sessionId: string, executor: GradingStatusExecutor = this.db) {
    const rows = await executor
      .select({ status: appeals.status, total: count() })
      .from(appeals)
      .where(eq(appeals.sessionId, sessionId))
      .groupBy(appeals.status);
    return {
      open: rows.find((row) => row.status === 'open')?.total ?? 0,
      resolved: rows.find((row) => row.status === 'resolved')?.total ?? 0,
    };
  }

  /** Gia hạn Thời hạn phúc khảo (Q314): đặt tổng số giờ mới và cho phép nhắc lại từ đầu. Trigger chỉ cho tăng, chỉ khi chưa Chốt. */
  async extend(tx: Transaction, sessionId: string, hours: number, now: Date) {
    await tx
      .update(sessionGradings)
      .set({ appealPeriodHours: hours, appealRemindedAt: null, updatedAt: now })
      .where(eq(sessionGradings.sessionId, sessionId));
  }

  /** Khóa độc quyền dòng thiết lập chấm để Công bố. */
  async lockForRelease(tx: Transaction, sessionId: string) {
    await this.ensureRow(tx, sessionId);
    const [row] = await tx
      .select()
      .from(sessionGradings)
      .where(eq(sessionGradings.sessionId, sessionId))
      .for('update');
    return row;
  }

  async release(
    tx: Transaction,
    sessionId: string,
    input: { releasedBy: string; releasedAt: Date; appealPeriodDays: number },
  ) {
    const hours = input.appealPeriodDays * APPEAL_HOURS_PER_DAY;
    await tx
      .update(sessionGradings)
      .set({
        releasedAt: input.releasedAt,
        releasedBy: input.releasedBy,
        appealPeriodHours: hours,
        // Không nhận Phúc khảo thì Chốt ngay (Q301).
        finalizedAt: hours === 0 ? input.releasedAt : null,
        updatedAt: input.releasedAt,
      })
      .where(eq(sessionGradings.sessionId, sessionId));
  }
}
