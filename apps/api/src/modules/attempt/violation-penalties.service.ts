import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import {
  type PenaltyType,
  type ViolationExecutor,
  type ViolationPenalties,
  type ViolationRecord,
} from '../../common/violation-penalties';
import { type Database, DB } from '../../db/db.module';
import { violations } from './attempt.schema';

const toRecord = (row: typeof violations.$inferSelect): ViolationRecord => ({
  id: row.id,
  attemptId: row.attemptId,
  userId: row.userId,
  action: row.action,
  reason: row.reason,
  recordedAt: row.recordedAt,
  penaltyType: row.penaltyType,
  penaltyPercent: row.penaltyPercent === null ? null : Number(row.penaltyPercent),
  penaltyDecidedAt: row.penaltyDecidedAt,
});

/** Cài đặt cổng `VIOLATION_PENALTIES` (Q294): `grading` đặt Mức xử lý, chỉ ba cột hình phạt của `violations` đổi. */
@Injectable()
export class ViolationPenaltiesService implements ViolationPenalties {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(sessionId: string, executor: ViolationExecutor = this.db) {
    const rows = await executor
      .select()
      .from(violations)
      .where(eq(violations.sessionId, sessionId))
      .orderBy(asc(violations.recordedAt), asc(violations.id));
    return rows.map(toRecord);
  }

  async setPenalty(
    sessionId: string,
    violationId: string,
    penalty: { type: PenaltyType; percent?: number },
    now: Date,
    executor: ViolationExecutor = this.db,
  ) {
    const [row] = await executor
      .update(violations)
      .set({
        penaltyType: penalty.type,
        penaltyPercent: penalty.type === 'percent' ? (penalty.percent ?? 0).toFixed(2) : null,
        penaltyDecidedAt: now,
      })
      .where(and(eq(violations.id, violationId), eq(violations.sessionId, sessionId)))
      .returning();
    return row ? toRecord(row) : null;
  }
}
