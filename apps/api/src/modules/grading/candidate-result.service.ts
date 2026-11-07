import { countableAttempts, fromCenti, type PenaltyInput, resultOf, toCenti } from '@exam/scoring';
import { type CandidateSource, candidateViewOf } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import {
  GRADING_SESSIONS,
  type GradingSessionInfo,
  type GradingSessions,
} from '../../common/grading-sessions';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { VIOLATION_PENALTIES, type ViolationPenalties } from '../../common/violation-penalties';
import { type Database, DB } from '../../db/db.module';
import { EffectiveContentService } from './effective-content.service';
import { responseGrades } from './grading.schema';
import { itemsOf } from './grading-layout';
import { GradingStatusService } from './grading-status.service';

/**
 * Kết quả của chính Người dự thi sau Công bố (docs/plan/slice-5.md, PR 5c; Q297): điểm, Mức xử lý, từng câu theo thứ tự họ đã
 * thấy. Mọi câu đi qua danh sách trường cho phép: không có Đáp án đúng, hướng dẫn chấm, bậc thang, dù bật xem lại đề.
 */
@Injectable()
export class CandidateResultService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GRADING_SESSIONS) private readonly sessions: GradingSessions,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    private readonly content: EffectiveContentService,
    @Inject(VIOLATION_PENALTIES) private readonly violations: ViolationPenalties,
    private readonly status: GradingStatusService,
  ) {}

  /**
   * Lượt được tính của một Người dự thi (Q292): cùng cách chọn với `result()`. Phúc khảo về câu gửi cho Lượt này (Q300). Chỉ đọc
   * tổng điểm của vài Lượt của người đó, không tải cả Phiên thi.
   */
  async countedAttempt(info: GradingSessionInfo, userId: string) {
    const mine = await this.source.attemptsOfUser(info.sessionId, userId);
    if (mine.length === 0) return null;
    const countable = countableAttempts(mine, info.attemptScoring);
    const totals = await this.db
      .select({
        attemptId: responseGrades.attemptId,
        total: sql<string>`coalesce(sum(${responseGrades.score}), 0)`,
      })
      .from(responseGrades)
      .where(
        inArray(
          responseGrades.attemptId,
          countable.map((attempt) => attempt.attemptId),
        ),
      )
      .groupBy(responseGrades.attemptId);
    const totalOf = new Map(totals.map((row) => [row.attemptId, Number(row.total)]));
    const result = resultOf({
      attempts: countable.map((attempt) => ({
        attemptId: attempt.attemptId,
        attemptNo: attempt.attemptNo,
        rawScore: totalOf.get(attempt.attemptId) ?? 0,
        maxScore: 1,
      })),
      attemptScoring: info.attemptScoring,
      penalties: [],
    });
    const counted = countable.find((attempt) => attempt.attemptId === result?.countedAttemptId);
    return counted ? { attemptId: counted.attemptId, attemptNo: counted.attemptNo } : null;
  }

  async result(userId: string, sessionId: string) {
    const info = await this.sessions.info(sessionId);
    if (!info || !(await this.sessions.isInRoster(sessionId, userId))) {
      throw new ApiError('NOT_FOUND');
    }
    const state = (await this.status.releaseStates([sessionId])).get(sessionId);
    if (!state) throw new ApiError('INVALID_STATE', { reason: 'NOT_RELEASED' });

    const mine = await this.source.attemptsOfUser(sessionId, userId);
    if (mine.length === 0) throw new ApiError('NOT_FOUND');
    const countable = countableAttempts(mine, info.attemptScoring);
    const [content, found, violations] = await Promise.all([
      this.content.contentOf(info.examId),
      this.db
        .select()
        .from(responseGrades)
        .where(
          inArray(
            responseGrades.attemptId,
            countable.map((attempt) => attempt.attemptId),
          ),
        ),
      this.violations.listForUser(sessionId, userId),
    ]);
    if (!content) throw new ApiError('NOT_FOUND');
    const items = itemsOf(content);
    const maxScore = fromCenti(items.reduce((sum, item) => sum + toCenti(item.points), 0));

    const rowsOf = new Map<string, typeof found>();
    for (const row of found) rowsOf.set(row.attemptId, [...(rowsOf.get(row.attemptId) ?? []), row]);
    const mineViolations = violations;
    const penalties: PenaltyInput[] = mineViolations.map((violation) => ({
      type: violation.penaltyType,
      percent: violation.penaltyPercent,
    }));
    const result = resultOf({
      attempts: countable.map((attempt) => ({
        attemptId: attempt.attemptId,
        attemptNo: attempt.attemptNo,
        rawScore: fromCenti(
          (rowsOf.get(attempt.attemptId) ?? []).reduce(
            (sum, row) => sum + (row.score === null ? 0 : toCenti(Number(row.score))),
            0,
          ),
        ),
        maxScore,
      })),
      attemptScoring: info.attemptScoring,
      penalties,
    });
    if (!result) throw new ApiError('NOT_FOUND');
    const counted = countable.find((attempt) => attempt.attemptId === result.countedAttemptId);
    const [attempt] = await this.source.loadSubmitted([result.countedAttemptId]);
    const seen = (await this.source.displayNumbers([result.countedAttemptId])).get(
      result.countedAttemptId,
    );
    const byItem = new Map(
      (rowsOf.get(result.countedAttemptId) ?? []).map((row) => [row.itemId, row]),
    );

    const rows = items
      .map((item) => {
        const row = byItem.get(item.itemId);
        const value = attempt?.responses.get(item.itemId);
        // Chỉ dựng khi Phiên thi bật xem lại đề.
        const view = info.reviewAfterRelease
          ? candidateViewOf(
              {
                type: item.type,
                stem: item.stem,
                payload: item.payload,
              } as unknown as CandidateSource,
              { showScoringRules: false },
            )
          : null;
        return {
          no: seen?.get(item.itemId) ?? item.no,
          type: item.type,
          points: item.points,
          score: row?.score === null || row === undefined ? null : Number(row.score),
          verdict: row?.verdict ?? 'blank',
          ...(item.type === 'true_false_cluster'
            ? { cluster: clusterCounts(item.payload, value) }
            : {}),
          ...(item.type === 'essay'
            ? {
                essay: {
                  answer: (value as { text?: string } | null | undefined)?.text ?? '',
                  feedback: row?.feedback ?? null,
                },
              }
            : {}),
          // Xem lại đề (Q297): nội dung câu và lựa chọn/đáp án CỦA CHÍNH HỌ; `view` đã bỏ key và rubric.
          ...(view
            ? { review: { stem: view.stem, payload: view.payload, answer: value ?? null } }
            : {}),
        };
      })
      .sort((a, b) => a.no - b.no);

    const percent =
      result.voided || maxScore === 0 ? 0 : Math.round((result.finalScore / maxScore) * 1000) / 10;
    return {
      session: {
        sessionId,
        title: info.title,
        opensAt: info.opensAt,
        durationMinutes: info.durationMinutes,
      },
      releasedAt: state.releasedAt,
      appealUntil: state.appealUntil,
      finalizedAt: state.finalizedAt,
      reviewAfterRelease: info.reviewAfterRelease,
      attemptCount: mine.length,
      countedAttemptNo: counted?.attemptNo ?? null,
      summary: {
        rawScore: result.rawScore,
        maxScore,
        finalScore: result.finalScore,
        scaledScore: result.scaledScore,
        percent,
        penaltyPercent: result.penaltyPercent,
        voided: result.voided,
      },
      penalties: mineViolations
        .filter(
          (violation) => violation.penaltyDecidedAt !== null && violation.penaltyType !== 'none',
        )
        .map((violation) => ({
          id: violation.id,
          action: violation.action,
          reason: violation.reason,
          type: violation.penaltyType,
          percent: violation.penaltyPercent,
        })),
      items: rows,
    };
  }
}

/** Số Mệnh đề nhận định đúng trên tổng số của một chùm đúng/sai: chỉ số đếm, không nói Mệnh đề nào sai (Q297). */
function clusterCounts(payload: Record<string, unknown>, value: unknown) {
  const statements = (payload.statements as { id: string; key: boolean }[] | undefined) ?? [];
  const answers =
    (value as { answers?: Record<string, unknown> } | null | undefined)?.answers ?? {};
  return {
    correct: statements.filter((statement) => answers[statement.id] === statement.key).length,
    total: statements.length,
  };
}
