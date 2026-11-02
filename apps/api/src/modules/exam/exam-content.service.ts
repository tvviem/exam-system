import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type {
  ContentExecutor,
  ContentItem,
  ContentSnapshot,
  ExamContentData,
  ExamContentProvider,
} from '../../common/exam-content';
import { type Database, DB } from '../../db/db.module';
import { examItems, examSections, exams } from './exam.schema';

const toItem = (row: {
  itemId: string;
  sectionId: string;
  points: string;
  snapshot: Record<string, unknown> | null;
}): ContentItem => ({
  itemId: row.itemId,
  sectionId: row.sectionId,
  points: Number(row.points),
  snapshot: row.snapshot as unknown as ContentSnapshot,
});

/** Cài đặt cổng `EXAM_CONTENT` (Q228) cho `attempt`: chỉ đọc bản chụp của Bộ đề đã Phát hành (ADR-0005). */
@Injectable()
export class ExamContentService implements ExamContentProvider {
  constructor(@Inject(DB) private readonly db: Database) {}

  async contentOf(
    examId: string,
    executor: ContentExecutor = this.db,
  ): Promise<ExamContentData | null> {
    const [exam] = await executor
      .select({ id: exams.id, title: exams.title, instructions: exams.instructions })
      .from(exams)
      .where(and(eq(exams.id, examId), ne(exams.status, 'draft')));
    if (!exam) return null;
    const [sections, items] = await Promise.all([
      executor
        .select()
        .from(examSections)
        .where(eq(examSections.examId, examId))
        .orderBy(asc(examSections.sort)),
      executor
        .select({
          itemId: examItems.id,
          sectionId: examItems.sectionId,
          points: examItems.points,
          snapshot: examItems.snapshot,
        })
        .from(examItems)
        .where(and(eq(examItems.examId, examId), isNotNull(examItems.snapshot)))
        .orderBy(asc(examItems.sort)),
    ]);
    return {
      examId: exam.id,
      title: exam.title,
      instructions: exam.instructions,
      sections: sections.map((section) => ({
        id: section.id,
        title: section.title,
        instructions: section.instructions,
        items: items.filter((item) => item.sectionId === section.id).map(toItem),
      })),
    };
  }

  async itemsOf(
    examId: string,
    itemIds: string[],
    executor: ContentExecutor = this.db,
  ): Promise<Map<string, ContentItem>> {
    if (itemIds.length === 0) return new Map();
    const rows = await executor
      .select({
        itemId: examItems.id,
        sectionId: examItems.sectionId,
        points: examItems.points,
        snapshot: examItems.snapshot,
      })
      .from(examItems)
      .where(
        and(
          eq(examItems.examId, examId),
          inArray(examItems.id, itemIds),
          isNotNull(examItems.snapshot),
        ),
      );
    return new Map(rows.map((row) => [row.itemId, toItem(row)]));
  }

  async summariesOf(examIds: string[], executor: ContentExecutor = this.db) {
    if (examIds.length === 0) return new Map<string, { title: string; itemCount: number }>();
    const rows = await executor
      .select({
        id: exams.id,
        title: exams.title,
        itemCount: sql<number>`(select count(*)::int from exam_items where exam_items.exam_id = exams.id)`,
      })
      .from(exams)
      .where(inArray(exams.id, [...new Set(examIds)]));
    return new Map(rows.map((row) => [row.id, { title: row.title, itemCount: row.itemCount }]));
  }
}
