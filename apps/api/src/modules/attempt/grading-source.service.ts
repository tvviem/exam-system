import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { GradableAttempt, GradingExecutor, GradingSource } from '../../common/grading-source';
import { SESSION_ENTRY, type SessionEntry } from '../../common/session-entry';
import { type Database, DB } from '../../db/db.module';
import { attempts, responses } from './attempt.schema';

/** Cài đặt cổng `GRADING_SOURCE` (Q285): đưa bài làm đã nộp cho `grading` mà không để nó đọc bảng của `attempt`. */
@Injectable()
export class GradingSourceService implements GradingSource {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SESSION_ENTRY) private readonly entry: SessionEntry,
  ) {}

  async loadSubmitted(
    attemptIds: string[],
    executor: GradingExecutor = this.db,
    options: { lock?: boolean } = {},
  ): Promise<GradableAttempt[]> {
    if (attemptIds.length === 0) return [];
    const query = executor
      .select({
        id: attempts.id,
        sessionId: attempts.sessionId,
        userId: attempts.userId,
        attemptNo: attempts.attemptNo,
      })
      .from(attempts)
      .where(and(inArray(attempts.id, attemptIds), eq(attempts.status, 'submitted')))
      .orderBy(attempts.id);
    const rows = await (options.lock ? query.for('share') : query);
    if (rows.length === 0) return [];

    const saved = await executor
      .select({ attemptId: responses.attemptId, itemId: responses.itemId, value: responses.value })
      .from(responses)
      .where(
        inArray(
          responses.attemptId,
          rows.map((row) => row.id),
        ),
      );
    const valuesOf = new Map<string, Map<string, unknown>>();
    for (const row of saved) {
      const map = valuesOf.get(row.attemptId) ?? new Map<string, unknown>();
      map.set(row.itemId, row.value);
      valuesOf.set(row.attemptId, map);
    }

    // Bộ đề của Phiên thi: hỏi một lần cho mỗi Phiên thi (qua một người trong Danh sách của Phiên thi đó).
    const examOf = new Map<string, string | null>();
    for (const row of rows) {
      if (examOf.has(row.sessionId)) continue;
      const gate = await this.entry.gateFor(row.sessionId, row.userId, executor);
      examOf.set(row.sessionId, gate?.examId ?? null);
    }
    return rows.flatMap((row) => {
      const examId = examOf.get(row.sessionId);
      if (!examId) return [];
      return [
        {
          attemptId: row.id,
          sessionId: row.sessionId,
          examId,
          userId: row.userId,
          attemptNo: row.attemptNo,
          responses: valuesOf.get(row.id) ?? new Map<string, unknown>(),
        },
      ];
    });
  }

  async submittedSince(since: Date, limit: number, offset: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: attempts.id })
      .from(attempts)
      .where(and(eq(attempts.status, 'submitted'), gte(attempts.submittedAt, since)))
      .orderBy(desc(attempts.submittedAt), desc(attempts.id))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => row.id);
  }
}
