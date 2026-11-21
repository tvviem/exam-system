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
import {
  examItemIllustrations,
  examItems,
  examSectionDraws,
  examSections,
  exams,
} from './exam.schema';
import { ExamContentCache } from './exam-content-cache';

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

/** Số Bộ đề tối đa giữ trong bộ nhớ (mỗi Bộ đề 100 câu khoảng 70 KB bản chụp). */
const CONTENT_CACHE_EXAMS = 50;

/** Cài đặt cổng `EXAM_CONTENT` (Q228) cho `attempt`: chỉ đọc bản chụp của Bộ đề đã Phát hành (ADR-0005). */
@Injectable()
export class ExamContentService implements ExamContentProvider {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Nội dung Bộ đề đã Phát hành bất biến (ADR-0005), nên nhớ trong bộ nhớ thay vì đọc 3 truy vấn mỗi yêu cầu. */
  private readonly cache = new ExamContentCache(CONTENT_CACHE_EXAMS);

  contentOf(examId: string, executor: ContentExecutor = this.db): Promise<ExamContentData | null> {
    return this.cache.getOrLoad(examId, () => this.loadContent(examId, executor));
  }

  private async loadContent(
    examId: string,
    executor: ContentExecutor,
  ): Promise<ExamContentData | null> {
    const [exam] = await executor
      .select({ id: exams.id, title: exams.title, instructions: exams.instructions })
      .from(exams)
      .where(and(eq(exams.id, examId), ne(exams.status, 'draft')));
    if (!exam) return null;
    const [sections, items] = await Promise.all([
      executor
        .select({
          id: examSections.id,
          title: examSections.title,
          instructions: examSections.instructions,
          drawPercent: examSectionDraws.percent,
        })
        .from(examSections)
        .leftJoin(examSectionDraws, eq(examSectionDraws.sectionId, examSections.id))
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
        drawPercent: section.drawPercent === null ? 100 : Number(section.drawPercent),
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
    const wanted = new Set(itemIds);
    const content = await this.contentOf(examId, executor);
    return new Map(
      (content?.sections ?? [])
        .flatMap((section) => section.items)
        .filter((item) => wanted.has(item.itemId))
        .map((item) => [item.itemId, item]),
    );
  }

  async hasIllustration(
    examId: string,
    illustrationId: string,
    executor: ContentExecutor = this.db,
  ): Promise<boolean> {
    const [row] = await executor
      .select({ id: examItemIllustrations.illustrationId })
      .from(examItemIllustrations)
      .innerJoin(examItems, eq(examItems.id, examItemIllustrations.examItemId))
      .where(
        and(eq(examItems.examId, examId), eq(examItemIllustrations.illustrationId, illustrationId)),
      )
      .limit(1);
    return row !== undefined;
  }

  async ownerOf(examId: string, executor: ContentExecutor = this.db): Promise<string | null> {
    const [row] = await executor
      .select({ ownerId: exams.ownerId })
      .from(exams)
      .where(and(eq(exams.id, examId), ne(exams.status, 'draft')));
    return row?.ownerId ?? null;
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
