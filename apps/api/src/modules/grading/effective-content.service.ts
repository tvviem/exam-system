import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import {
  type ContentExecutor,
  EXAM_CONTENT,
  type ExamContentData,
  type ExamContentProvider,
} from '../../common/exam-content';
import { type Database, DB } from '../../db/db.module';
import { withKey } from './effective-key';
import { keyCorrections } from './grading.schema';

/**
 * Nội dung Bộ đề với **đáp án hiệu lực** (Q302, Q320): bản chụp `exam_items.snapshot` bất biến, đáp án đúng của một câu là bản
 * đính chính mới nhất nếu có. Mọi nơi `grading` đọc đáp án đi qua đây, nên không chỗ nào còn dùng đáp án cũ.
 */
@Injectable()
export class EffectiveContentService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
  ) {}

  async contentOf(
    examId: string,
    executor: ContentExecutor = this.db,
  ): Promise<ExamContentData | null> {
    const base = await this.content.contentOf(examId, executor);
    if (!base) return null;
    const latest = await executor
      .selectDistinctOn([keyCorrections.itemId], {
        itemId: keyCorrections.itemId,
        newKey: keyCorrections.newKey,
      })
      .from(keyCorrections)
      .where(eq(keyCorrections.examId, examId))
      .orderBy(keyCorrections.itemId, desc(keyCorrections.correctedAt), desc(keyCorrections.id));
    if (latest.length === 0) return base;
    const keyOf = new Map(latest.map((row) => [row.itemId, row.newKey]));
    return {
      ...base,
      sections: base.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          const key = keyOf.get(item.itemId);
          return key ? withKey(item, key) : item;
        }),
      })),
    };
  }
}
