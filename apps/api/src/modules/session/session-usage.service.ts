import { Inject, Injectable } from '@nestjs/common';
import { and, inArray, isNull, sql } from 'drizzle-orm';
import type { SessionUsage } from '../../common/session-usage';
import { type Database, DB } from '../../db/db.module';
import { sessions } from './session.schema';

/** Bản cài đặt cổng `SessionUsage` (Q204). */
@Injectable()
export class SessionUsageService implements SessionUsage {
  constructor(@Inject(DB) private readonly db: Database) {}

  async countByExam(examIds: string[]): Promise<Map<string, number>> {
    const counts = new Map(examIds.map((id) => [id, 0]));
    if (examIds.length === 0) return counts;
    const rows = await this.db
      .select({ examId: sessions.examId, total: sql<number>`count(*)::int` })
      .from(sessions)
      .where(and(inArray(sessions.examId, examIds), isNull(sessions.cancelledAt)))
      .groupBy(sessions.examId);
    for (const row of rows) counts.set(row.examId, row.total);
    return counts;
  }
}
