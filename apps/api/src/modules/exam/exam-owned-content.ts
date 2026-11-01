import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { questions } from '../question-bank/question-bank.schema';
import { examItems, exams } from './exam.schema';

export interface OwnedExamCounts {
  /** Bộ đề đổi chủ. */
  exams: number;
  /** Câu bị gỡ khỏi các Bộ đề nháp đó vì không thuộc Chủ đề được chuyển (Q182). */
  detachedItems: number;
}

/**
 * Bộ đề đi cùng Chuyển giao Chủ đề và Xóa người dùng (Q182, Q183). Chạy SAU phần của ngân hàng câu hỏi trong cùng giao dịch:
 * khi đó Câu hỏi đã đổi chủ, nên "câu nào đã chuyển" đọc được từ `questions.owner_id`.
 */
@Injectable()
export class ExamOwnedContent {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** `topicIds` có nghĩa là chỉ các Chủ đề đó chuyển; không có là chuyển toàn bộ (Xóa người dùng). */
  async summaryOf(userId: string, topicIds?: string[]): Promise<OwnedExamCounts> {
    if (!topicIds) {
      const [row] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(exams)
        .where(eq(exams.ownerId, userId));
      return { exams: row?.n ?? 0, detachedItems: 0 };
    }
    if (topicIds.length === 0) return { exams: 0, detachedItems: 0 };
    const rows = await this.db
      .select({
        examId: examItems.examId,
        moving: sql<boolean>`${inArray(questions.topicId, topicIds)}`,
      })
      .from(examItems)
      .innerJoin(exams, eq(exams.id, examItems.examId))
      .innerJoin(questions, eq(questions.id, examItems.questionId))
      .where(and(eq(exams.ownerId, userId), eq(exams.status, 'draft')));
    const moving = new Set(rows.filter((r) => r.moving).map((r) => r.examId));
    return {
      exams: moving.size,
      detachedItems: rows.filter((r) => !r.moving && moving.has(r.examId)).length,
    };
  }

  async apply(
    tx: Transaction,
    { fromId, toId, all }: { fromId: string; toId: string; all: boolean },
  ): Promise<OwnedExamCounts> {
    if (all) {
      // Xóa người dùng: mọi Bộ đề (nháp, đã Phát hành, Lưu trữ) sang người nhận; trigger cho phép đổi `owner_id`.
      const moved = await tx
        .update(exams)
        .set({ ownerId: toId })
        .where(eq(exams.ownerId, fromId))
        .returning({ id: exams.id, status: exams.status });
      const drafts = moved.filter((e) => e.status === 'draft').map((e) => e.id);
      if (drafts.length > 0) {
        await tx
          .update(exams)
          .set({ version: sql`${exams.version} + 1` })
          .where(inArray(exams.id, drafts));
      }
      return { exams: moved.length, detachedItems: 0 };
    }

    // Chọn Chủ đề: Bộ đề nháp có ít nhất một câu vừa chuyển cho `toId` thì chuyển cả Bộ đề; các câu còn thuộc người cho bị gỡ.
    const candidates = await tx
      .selectDistinct({ id: exams.id })
      .from(exams)
      .innerJoin(examItems, eq(examItems.examId, exams.id))
      .innerJoin(questions, eq(questions.id, examItems.questionId))
      .where(
        and(eq(exams.ownerId, fromId), eq(exams.status, 'draft'), eq(questions.ownerId, toId)),
      );
    const ids = candidates.map((c) => c.id);
    if (ids.length === 0) return { exams: 0, detachedItems: 0 };
    await tx.select({ id: exams.id }).from(exams).where(inArray(exams.id, ids)).for('update');

    const staying = tx
      .select({ id: questions.id })
      .from(questions)
      .where(ne(questions.ownerId, toId));
    const detached = await tx
      .delete(examItems)
      .where(and(inArray(examItems.examId, ids), inArray(examItems.questionId, staying)))
      .returning({ id: examItems.id });
    // Tăng `version` để người cho đang mở trình soạn nhận CONFLICT thay vì ghi đè.
    await tx
      .update(exams)
      .set({ ownerId: toId, version: sql`${exams.version} + 1` })
      .where(inArray(exams.id, ids));
    return { exams: ids.length, detachedItems: detached.length };
  }
}
