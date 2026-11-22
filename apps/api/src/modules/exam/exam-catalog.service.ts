import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { CatalogDrawSection, CatalogExamStatus, ExamCatalog } from '../../common/exam-catalog';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { examItems, examSectionDraws, examSections, exams } from './exam.schema';

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

  async drawSectionsOf(
    examId: string,
    executor: Database | Transaction = this.db,
  ): Promise<CatalogDrawSection[]> {
    const sections = await executor
      .select({
        id: examSections.id,
        title: examSections.title,
        percent: examSectionDraws.percent,
      })
      .from(examSections)
      .leftJoin(examSectionDraws, eq(examSectionDraws.sectionId, examSections.id))
      .where(eq(examSections.examId, examId))
      .orderBy(asc(examSections.sort));
    if (sections.length === 0) return [];
    const items = await executor
      .select({ id: examItems.id, sectionId: examItems.sectionId, points: examItems.points })
      .from(examItems)
      .where(eq(examItems.examId, examId))
      .orderBy(asc(examItems.sort));
    return sections.map((section) => ({
      id: section.id,
      title: section.title,
      defaultPercent: section.percent === null ? 100 : Number(section.percent),
      points: items
        .filter((item) => item.sectionId === section.id)
        .map((item) => Number(item.points)),
      itemIds: items.filter((item) => item.sectionId === section.id).map((item) => item.id),
    }));
  }
}
