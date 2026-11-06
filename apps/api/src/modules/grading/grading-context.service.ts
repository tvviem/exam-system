import { countableAttempts } from '@exam/scoring';
import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import { EXAM_CONTENT, type ExamContentProvider } from '../../common/exam-content';
import type { GradingSessionInfo } from '../../common/grading-sessions';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { type Database, DB } from '../../db/db.module';
import { AutogradeService } from './autograde.service';
import { attemptGrades, responseGrades } from './grading.schema';
import { type GradingItem, itemsOf } from './grading-layout';

export interface SubmittedAttempt {
  attemptId: string;
  userId: string;
  attemptNo: number;
  submittedAt: Date;
}

export interface GradeRow {
  attemptId: string;
  itemId: string;
  /** Điểm tính bằng đơn vị 0,01; `null` là chờ chấm. */
  scoreCenti: number | null;
  verdict: 'correct' | 'partial' | 'wrong' | 'blank' | 'pending';
  source: 'auto' | 'manual' | 'appeal' | 'correction';
  feedback: string | null;
}

export interface GradingContext {
  info: GradingSessionInfo;
  items: GradingItem[];
  maxScoreCenti: number;
  submitted: SubmittedAttempt[];
  /** Các Lượt có thể được tính vào Kết quả (Q292). */
  countable: SubmittedAttempt[];
  rows: Map<string, GradeRow[]>;
}

/**
 * Nạp những gì mọi màn chấm và Kết quả đều cần: nội dung Bộ đề, các Lượt đã nộp, điểm từng câu của các Lượt có thể được tính.
 * Lượt đã nộp mà chưa có dấu "đã chấm" (cũ hơn cửa sổ job quét, hoặc job bị mất) được chấm bù ngay tại đây.
 */
@Injectable()
export class GradingContextService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    @Inject(EXAM_CONTENT) private readonly content: ExamContentProvider,
    private readonly autograde: AutogradeService,
  ) {}

  async load(info: GradingSessionInfo): Promise<GradingContext> {
    const [content, submitted] = await Promise.all([
      this.content.contentOf(info.examId),
      this.source.attemptsOfSession(info.sessionId),
    ]);
    if (!content) throw new ApiError('NOT_FOUND');
    const items = itemsOf(content);
    await this.gradeMissing(submitted.map((attempt) => attempt.attemptId));
    const countable = countableAttempts(submitted, info.attemptScoring);
    const rows = new Map<string, GradeRow[]>();
    if (countable.length > 0) {
      const found = await this.db
        .select()
        .from(responseGrades)
        .where(
          inArray(
            responseGrades.attemptId,
            countable.map((attempt) => attempt.attemptId),
          ),
        );
      for (const row of found) {
        const list = rows.get(row.attemptId) ?? [];
        list.push({
          attemptId: row.attemptId,
          itemId: row.itemId,
          scoreCenti: row.score === null ? null : Math.round(Number(row.score) * 100),
          verdict: row.verdict,
          source: row.source,
          feedback: row.feedback,
        });
        rows.set(row.attemptId, list);
      }
    }
    return {
      info,
      items,
      maxScoreCenti: items.reduce((sum, item) => sum + Math.round(item.points * 100), 0),
      submitted,
      countable,
      rows,
    };
  }

  /** Chấm bù các Lượt chưa có dấu "đã chấm" (không làm gì nếu đã đủ). */
  private async gradeMissing(attemptIds: string[]) {
    if (attemptIds.length === 0) return;
    const done = await this.db
      .select({ id: attemptGrades.attemptId })
      .from(attemptGrades)
      .where(inArray(attemptGrades.attemptId, attemptIds));
    const doneIds = new Set(done.map((row) => row.id));
    const missing = attemptIds.filter((id) => !doneIds.has(id));
    if (missing.length > 0) await this.autograde.gradeAttempts(missing);
  }
}
