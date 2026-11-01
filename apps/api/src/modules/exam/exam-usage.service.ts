import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { ExamUsage, QuestionUsage } from '../../common/exam-usage';
import { type Database, DB } from '../../db/db.module';
import { examItemIllustrations, examItems, exams } from './exam.schema';

/** Bản cài đặt cổng `ExamUsage` (Q166, Q174, Q176). */
@Injectable()
export class ExamUsageService implements ExamUsage {
  constructor(@Inject(DB) private readonly db: Database) {}

  async usageOf(ownerId: string, questionIds: string[]): Promise<Map<string, QuestionUsage>> {
    const usage = new Map<string, QuestionUsage>(
      questionIds.map((id) => [id, { draftExams: [], publishedCount: 0 }]),
    );
    if (questionIds.length === 0) return usage;
    const rows = await this.db
      .select({
        questionId: examItems.questionId,
        id: exams.id,
        title: exams.title,
        status: exams.status,
      })
      .from(examItems)
      .innerJoin(exams, eq(exams.id, examItems.examId))
      .where(and(eq(exams.ownerId, ownerId), inArray(examItems.questionId, questionIds)));
    for (const { questionId, status, ...exam } of rows) {
      const entry = usage.get(questionId);
      if (!entry) continue;
      if (status === 'draft') entry.draftExams.push(exam);
      else entry.publishedCount++;
    }
    return usage;
  }

  async usedIllustrations(illustrationIds: string[]): Promise<Set<string>> {
    if (illustrationIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ id: examItemIllustrations.illustrationId })
      .from(examItemIllustrations)
      .where(inArray(examItemIllustrations.illustrationId, illustrationIds));
    return new Set(rows.map((row) => row.id));
  }

  async canViewIllustration(userId: string, illustrationId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: examItemIllustrations.illustrationId })
      .from(examItemIllustrations)
      .innerJoin(examItems, eq(examItems.id, examItemIllustrations.examItemId))
      .innerJoin(exams, eq(exams.id, examItems.examId))
      .where(
        and(
          eq(examItemIllustrations.illustrationId, illustrationId),
          eq(exams.ownerId, userId),
          ne(exams.status, 'draft'),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
