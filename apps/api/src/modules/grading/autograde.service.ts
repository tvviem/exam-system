import { type ScoringItem, scoreResponse } from '@exam/scoring';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../common/clock';
import {
  EXAM_CONTENT,
  type ExamContentData,
  type ExamContentProvider,
} from '../../common/exam-content';
import {
  GRADING_SOURCE,
  type GradableAttempt,
  type GradingSource,
} from '../../common/grading-source';
import { type Database, DB, type Transaction } from '../../db/db.module';
import { attemptGrades, responseGrades } from './grading.schema';

/** Số Lượt chấm trong một giao dịch. */
const CHUNK = 50;

/**
 * Chấm tự động (Q286, Q287–Q289): với mỗi Lượt đã nộp, ghi một dòng điểm cho MỌI câu của Bộ đề (kể cả câu bỏ trống) và đánh dấu
 * "đã chấm". Idempotent: chạy lại ra cùng kết quả, không ghi đè điểm không phải `auto`.
 *
 * Mỗi lô đọc bài làm và ghi điểm trong CÙNG một giao dịch, các dòng Lượt khóa `FOR SHARE`: Hoàn tác Buộc nộp (đổi dòng Lượt)
 * phải chờ lô chấm xong, nên điểm của lần nộp cũ không thể đè lên bài đã mở lại rồi nộp lại.
 */
@Injectable()
export class AutogradeService {
  private readonly logger = new Logger(AutogradeService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
  ) {}

  /** Chấm các Lượt chưa chấm trong `attemptIds`; trả số Lượt vừa chấm. Một lô lỗi được ghi log, lần quét sau thử lại. */
  async gradeAttempts(attemptIds: string[]): Promise<number> {
    const ids = [...new Set(attemptIds)].sort();
    let graded = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      try {
        graded += await this.db.transaction((tx) => this.gradeChunk(tx, ids.slice(i, i + CHUNK)));
      } catch (error) {
        this.logger.error(`Chấm lô Lượt lỗi, job quét sẽ thử lại: ${String(error)}`);
      }
    }
    return graded;
  }

  private async gradeChunk(tx: Transaction, ids: string[]): Promise<number> {
    const done = await tx
      .select({ id: attemptGrades.attemptId })
      .from(attemptGrades)
      .where(inArray(attemptGrades.attemptId, ids));
    const doneIds = new Set(done.map((row) => row.id));
    const todo = await this.source.loadSubmitted(
      ids.filter((id) => !doneIds.has(id)),
      tx,
      { lock: true },
    );
    if (todo.length === 0) return 0;

    const contents = new Map<string, ExamContentData | null>();
    for (const examId of new Set(todo.map((attempt) => attempt.examId))) {
      contents.set(examId, await this.content.contentOf(examId, tx));
    }

    const rows: (typeof responseGrades.$inferInsert)[] = [];
    const gradedIds: string[] = [];
    for (const attempt of todo) {
      const scored = this.scoreAttempt(attempt, contents.get(attempt.examId) ?? null);
      if (!scored) continue;
      rows.push(...scored);
      gradedIds.push(attempt.attemptId);
    }
    if (rows.length > 0) {
      await tx
        .insert(responseGrades)
        .values(rows)
        .onConflictDoUpdate({
          target: [responseGrades.attemptId, responseGrades.itemId],
          set: {
            score: sql`excluded.score`,
            verdict: sql`excluded.verdict`,
            gradedAt: sql`excluded.graded_at`,
          },
          setWhere: sql`${responseGrades.source} = 'auto'`,
        });
    }
    if (gradedIds.length > 0) {
      const now = this.clock.now();
      await tx
        .insert(attemptGrades)
        .values(gradedIds.map((attemptId) => ({ attemptId, gradedAt: now })))
        .onConflictDoNothing();
    }
    return gradedIds.length;
  }

  /** Điểm mọi câu của một Lượt; `null` (kèm log) nếu Bộ đề thiếu hoặc bản chụp hỏng, để các Lượt khác vẫn được chấm. */
  private scoreAttempt(
    attempt: GradableAttempt,
    content: ExamContentData | null,
  ): (typeof responseGrades.$inferInsert)[] | null {
    if (!content) {
      this.logger.warn(
        `Không thấy nội dung Bộ đề ${attempt.examId} để chấm Lượt ${attempt.attemptId}`,
      );
      return null;
    }
    try {
      const gradedAt = this.clock.now();
      return content.sections.flatMap((section) =>
        section.items.map((item) => {
          const scoring: ScoringItem = {
            type: item.snapshot.type,
            points: item.points,
            payload: item.snapshot.payload,
          };
          const { score, verdict } = scoreResponse(scoring, attempt.responses.get(item.itemId));
          return {
            attemptId: attempt.attemptId,
            itemId: item.itemId,
            score: score === null ? null : score.toFixed(2),
            verdict,
            source: 'auto' as const,
            gradedAt,
          };
        }),
      );
    } catch (error) {
      this.logger.error(`Chấm Lượt ${attempt.attemptId} lỗi: ${String(error)}`);
      return null;
    }
  }
}
