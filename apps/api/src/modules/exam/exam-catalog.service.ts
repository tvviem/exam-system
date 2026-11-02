import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { CatalogExamStatus, ExamCatalog } from '../../common/exam-catalog';
import { type Database, DB } from '../../db/db.module';
import { exams } from './exam.schema';

/** Cài đặt cổng `EXAM_CATALOG` (Q223) cho `session`. */
@Injectable()
export class ExamCatalogService implements ExamCatalog {
  constructor(@Inject(DB) private readonly db: Database) {}

  async statusOwnedBy(ownerId: string, examId: string): Promise<CatalogExamStatus | null> {
    const [row] = await this.db
      .select({ status: exams.status })
      .from(exams)
      .where(and(eq(exams.id, examId), eq(exams.ownerId, ownerId)));
    return row?.status ?? null;
  }

  async titlesOf(examIds: string[]): Promise<Map<string, string>> {
    if (examIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: exams.id, title: exams.title })
      .from(exams)
      .where(inArray(exams.id, [...new Set(examIds)]));
    return new Map(rows.map((row) => [row.id, row.title]));
  }
}
