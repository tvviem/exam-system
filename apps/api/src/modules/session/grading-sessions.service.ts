import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  GradingSessionExecutor,
  GradingSessionInfo,
  GradingSessions,
} from '../../common/grading-sessions';
import { escapeLike } from '../../common/sql-like';
import { type Database, DB } from '../../db/db.module';
import { sessionRoster, sessions } from './session.schema';

const toInfo = (row: typeof sessions.$inferSelect): GradingSessionInfo => ({
  sessionId: row.id,
  examId: row.examId,
  title: row.title,
  ownerId: row.ownerId,
  opensAt: row.opensAt,
  closesAt: row.closesAt,
  durationMinutes: row.durationMinutes,
  attemptScoring: row.attemptScoring,
  entryClosedAt: row.entryClosedAt,
  cancelledAt: row.cancelledAt,
  reviewAfterRelease: row.reviewAfterRelease,
});

/** Cài đặt cổng `GRADING_SESSIONS` (docs/plan/slice-5.md, PR 5b). */
@Injectable()
export class GradingSessionsService implements GradingSessions {
  constructor(@Inject(DB) private readonly db: Database) {}

  async info(sessionId: string, executor: GradingSessionExecutor = this.db) {
    const [row] = await executor.select().from(sessions).where(eq(sessions.id, sessionId));
    return row ? toInfo(row) : null;
  }

  async lock(sessionId: string, executor: GradingSessionExecutor) {
    const [row] = await executor
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      // NO KEY UPDATE vẫn loại trừ Hoàn tác, Hủy (FOR UPDATE) nhưng không chặn chèn dòng thiết lập chấm (khóa ngoại): tránh bế tắc.
      .for('no key update');
    return row ? toInfo(row) : null;
  }

  async setReviewAfterRelease(sessionId: string, value: boolean, executor: GradingSessionExecutor) {
    await executor
      .update(sessions)
      .set({ reviewAfterRelease: value, version: sql`${sessions.version} + 1` })
      .where(eq(sessions.id, sessionId));
  }

  async byExam(examId: string, executor: GradingSessionExecutor = this.db) {
    const rows = await executor
      .select()
      .from(sessions)
      .where(eq(sessions.examId, examId))
      .orderBy(desc(sessions.opensAt));
    return rows.map(toInfo);
  }

  async infoMany(sessionIds: string[]) {
    if (sessionIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(sessions)
      .where(inArray(sessions.id, sessionIds))
      .orderBy(desc(sessions.opensAt));
    return rows.map(toInfo);
  }

  async roster(sessionId: string, executor: GradingSessionExecutor = this.db) {
    return executor
      .select({ userId: sessionRoster.userId, classLabel: sessionRoster.classLabel })
      .from(sessionRoster)
      .where(eq(sessionRoster.sessionId, sessionId));
  }

  async isInRoster(sessionId: string, userId: string, executor: GradingSessionExecutor = this.db) {
    const [row] = await executor
      .select({ userId: sessionRoster.userId })
      .from(sessionRoster)
      .where(and(eq(sessionRoster.sessionId, sessionId), eq(sessionRoster.userId, userId)));
    return row !== undefined;
  }

  async search(q: string, limit: number) {
    const like = `%${escapeLike(q.trim().toLowerCase())}%`;
    const rows = await this.db
      .select()
      .from(sessions)
      .where(q.trim() ? sql`lower(${sessions.title}) LIKE ${like}` : undefined)
      .orderBy(desc(sessions.opensAt))
      .limit(limit);
    return rows.map(toInfo);
  }
}
