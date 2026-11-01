import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { ExamRef, ExamUsage } from '../../common/exam-usage';
import { type Database, DB } from '../../db/db.module';
import { examItems, exams } from './exam.schema';

/** Bản cài đặt cổng `ExamUsage` (Q166). */
@Injectable()
export class ExamUsageService implements ExamUsage {
  constructor(@Inject(DB) private readonly db: Database) {}

  async draftExamsOf(ownerId: string, questionIds: string[]): Promise<Map<string, ExamRef[]>> {
    const used = new Map<string, ExamRef[]>();
    if (questionIds.length === 0) return used;
    const rows = await this.db
      .select({ questionId: examItems.questionId, id: exams.id, title: exams.title })
      .from(examItems)
      .innerJoin(exams, eq(exams.id, examItems.examId))
      .where(
        and(
          eq(exams.ownerId, ownerId),
          eq(exams.status, 'draft'),
          inArray(examItems.questionId, questionIds),
        ),
      );
    for (const { questionId, ...exam } of rows) {
      used.set(questionId, [...(used.get(questionId) ?? []), exam]);
    }
    return used;
  }
}
