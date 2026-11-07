import { APPEAL_HOURS_PER_DAY } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import {
  type GradingStatusExecutor,
  type ReleaseState,
  type SessionGradingStatus,
} from '../../common/grading-status';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { sessionGradings } from './grading.schema';

const HOUR_MS = 3_600_000;

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
        appealUntil: hours > 0 ? new Date(row.releasedAt.getTime() + hours * HOUR_MS) : null,
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
