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
import { pgErrorOf } from '../../common/pg-error';
import { type Database, DB } from '../../db/db.module';
import { attemptGrades, responseGrades } from './grading.schema';

const CHECK_VIOLATION = '23514';
/** Số Lượt chấm song song; nhỏ hơn kích thước nhóm kết nối để không chặn các request khác. */
const PARALLEL = 4;

/**
 * Chấm tự động (Q286, Q287–Q289): với mỗi Lượt đã nộp, ghi một dòng điểm cho MỌI câu của Bộ đề (kể cả câu bỏ trống) và đánh dấu
 * "đã chấm". Idempotent: chạy lại ra cùng kết quả, không ghi đè điểm không phải `auto`.
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

  /** Chấm các Lượt chưa chấm trong `attemptIds`; trả số Lượt vừa chấm. */
  async gradeAttempts(attemptIds: string[]): Promise<number> {
    const ids = [...new Set(attemptIds)];
    if (ids.length === 0) return 0;
    const done = await this.db
      .select({ id: attemptGrades.attemptId })
      .from(attemptGrades)
      .where(inArray(attemptGrades.attemptId, ids));
    const doneIds = new Set(done.map((row) => row.id));
    const todo = await this.source.loadSubmitted(ids.filter((id) => !doneIds.has(id)));
    if (todo.length === 0) return 0;

    const contents = new Map<string, ExamContentData | null>();
    for (const examId of new Set(todo.map((attempt) => attempt.examId))) {
      contents.set(examId, await this.content.contentOf(examId));
    }

    let graded = 0;
    for (let i = 0; i < todo.length; i += PARALLEL) {
      const chunk = todo.slice(i, i + PARALLEL);
      const results = await Promise.all(
        chunk.map((attempt) => this.gradeOne(attempt, contents.get(attempt.examId) ?? null)),
      );
      graded += results.filter(Boolean).length;
    }
    return graded;
  }

  private async gradeOne(
    attempt: GradableAttempt,
    content: ExamContentData | null,
  ): Promise<boolean> {
    if (!content) {
      this.logger.warn(
        `Không thấy nội dung Bộ đề ${attempt.examId} để chấm Lượt ${attempt.attemptId}`,
      );
      return false;
    }
    const rows = content.sections.flatMap((section) =>
      section.items.map((item) => {
        const scoring: ScoringItem = {
          type: item.snapshot.type,
          points: item.points,
          payload: item.snapshot.payload,
        };
        const { score } = scoreResponse(scoring, attempt.responses.get(item.itemId));
        return {
          attemptId: attempt.attemptId,
          itemId: item.itemId,
          score: score === null ? null : score.toFixed(2),
          source: 'auto' as const,
          gradedAt: this.clock.now(),
        };
      }),
    );
    try {
      await this.db.transaction(async (tx) => {
        if (rows.length > 0) {
          await tx
            .insert(responseGrades)
            .values(rows)
            .onConflictDoUpdate({
              target: [responseGrades.attemptId, responseGrades.itemId],
              set: { score: sql`excluded.score`, gradedAt: sql`excluded.graded_at` },
              setWhere: sql`${responseGrades.source} = 'auto'`,
            });
        }
        await tx
          .insert(attemptGrades)
          .values({ attemptId: attempt.attemptId, gradedAt: this.clock.now() })
          .onConflictDoNothing();
      });
      return true;
    } catch (error) {
      // Lượt vừa được mở lại (Hoàn tác Buộc nộp): trigger từ chối, không phải lỗi; nộp lại sẽ được chấm.
      if (pgErrorOf(error)?.code === CHECK_VIOLATION) return false;
      this.logger.error(`Chấm Lượt ${attempt.attemptId} lỗi: ${String(error)}`);
      return false;
    }
  }
}
