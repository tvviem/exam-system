import { fromCenti, toCenti, verdictOfScore } from '@exam/scoring';
import type { ResolveAppealRequest } from '@exam/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import type { Actor } from '../../common/actor';
import { ApiError, validationFailed } from '../../common/api-error';
import { CANDIDATE_DIRECTORY, type CandidateDirectory } from '../../common/candidate-directory';
import { CLOCK, type Clock } from '../../common/clock';
import { GRADING_SOURCE, type GradingSource } from '../../common/grading-source';
import { REALTIME_NOTIFIER, type RealtimeNotifier } from '../../common/realtime-notifier';
import { VIOLATION_PENALTIES, type ViolationPenalties } from '../../common/violation-penalties';
import { type Database, DB } from '../../db/db.module';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppealFinalizeService } from './appeal-finalize.service';
import { EffectiveContentService } from './effective-content.service';
import { appeals, responseGrades } from './grading.schema';
import { GradingAccessService } from './grading-access.service';
import { itemsOf } from './grading-layout';
import { GradingStatusService } from './grading-status.service';

/** Danh sách trả tối đa chừng này Phúc khảo (hạn mức 10 % số câu × 500 người vẫn nhỏ hơn nhiều so với con số này). */
const LIST_LIMIT = 500;

/**
 * Người ra đề xem và xử lý Phúc khảo (docs/plan/slice-5.md, PR 5d-1; Q300, Q310, Q313): chủ Phiên thi hoặc người được Ủy quyền.
 * Mọi thao tác chỉ đọc đúng Lượt liên quan bằng khóa chính, không dùng `GradingContextService.load` (nạp điểm cả Phiên thi).
 */
@Injectable()
export class AppealsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GRADING_SOURCE) private readonly source: GradingSource,
    private readonly content: EffectiveContentService,
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
    @Inject(VIOLATION_PENALTIES) private readonly violations: ViolationPenalties,
    @Inject(REALTIME_NOTIFIER) private readonly realtime: RealtimeNotifier,
    private readonly access: GradingAccessService,
    private readonly status: GradingStatusService,
    private readonly finalize: AppealFinalizeService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Danh sách Phúc khảo: chờ xử lý lên đầu (cũ trước), kèm số chờ và số đã xử lý. */
  async list(
    userId: string,
    sessionId: string,
    filter: { status?: 'open' | 'resolved'; no?: number } = {},
  ) {
    const { info } = await this.access.require(userId, sessionId);
    const content = await this.content.contentOf(info.examId);
    if (!content) throw new ApiError('NOT_FOUND');
    const items = itemsOf(content);
    const noOf = new Map(items.map((item) => [item.itemId, item.no]));
    const wantedItem = filter.no === undefined ? null : items.find((item) => item.no === filter.no);
    if (filter.no !== undefined && !wantedItem) return emptyList();

    const where = and(
      eq(appeals.sessionId, sessionId),
      filter.status ? eq(appeals.status, filter.status) : undefined,
      wantedItem ? eq(appeals.itemId, wantedItem.itemId) : undefined,
    );
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(appeals)
        .where(where)
        // `open` đứng trước `resolved` theo thứ tự của kiểu liệt kê.
        .orderBy(asc(appeals.status), asc(appeals.createdAt), asc(appeals.id))
        .limit(LIST_LIMIT),
      this.db
        .select({ status: appeals.status, total: count() })
        .from(appeals)
        .where(eq(appeals.sessionId, sessionId))
        .groupBy(appeals.status),
    ]);
    const numbers = await this.source.displayNumbers([
      ...new Set(rows.map((row) => row.attemptId)),
    ]);
    const people = rows.length
      ? await this.directory.page([...new Set(rows.map((row) => row.userId))], {
          limit: rows.length,
          offset: 0,
        })
      : { items: [] };
    const profile = new Map(people.items.map((p) => [p.id, p]));
    return {
      open: totals.find((t) => t.status === 'open')?.total ?? 0,
      resolved: totals.find((t) => t.status === 'resolved')?.total ?? 0,
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        target: row.target,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
        user: {
          id: row.userId,
          code: profile.get(row.userId)?.code ?? null,
          fullName: profile.get(row.userId)?.fullName ?? '',
        },
        /** Số câu theo thứ tự đề của Người ra đề, và số Người dự thi đã thấy (ghi chú đối chiếu, Q313). */
        no: row.itemId ? (noOf.get(row.itemId) ?? null) : null,
        seenAs: row.itemId ? (numbers.get(row.attemptId)?.get(row.itemId) ?? null) : null,
        reason: row.reason,
      })),
    };
  }

  /** Một Phúc khảo đầy đủ để xử lý: lý do, nội dung câu (có đáp án, vì đây là Người ra đề), bài làm và điểm hiện tại. */
  async detail(userId: string, sessionId: string, appealId: string) {
    const { info } = await this.access.require(userId, sessionId);
    const [row] = await this.db
      .select()
      .from(appeals)
      .where(and(eq(appeals.id, appealId), eq(appeals.sessionId, sessionId)));
    if (!row) throw new ApiError('NOT_FOUND');
    const [content, people] = await Promise.all([
      this.content.contentOf(info.examId),
      this.directory.page([row.userId], { limit: 1, offset: 0 }),
    ]);
    if (!content) throw new ApiError('NOT_FOUND');
    const person = people.items[0];
    const base = {
      id: row.id,
      status: row.status,
      target: row.target,
      reason: row.reason,
      createdAt: row.createdAt,
      user: { id: row.userId, code: person?.code ?? null, fullName: person?.fullName ?? '' },
      response: row.response,
      previousValue: row.previousValue,
      newValue: row.newValue,
      resolvedAt: row.resolvedAt,
    };

    if (row.target === 'penalty') {
      const violation = (await this.violations.listForUser(sessionId, row.userId)).find(
        (v) => v.id === row.violationId,
      );
      if (!violation) throw new ApiError('NOT_FOUND');
      return {
        ...base,
        violation: {
          id: violation.id,
          action: violation.action,
          reason: violation.reason,
          recordedAt: violation.recordedAt,
          penaltyType: violation.penaltyType,
          penaltyPercent: violation.penaltyPercent,
        },
      };
    }

    const items = itemsOf(content);
    const item = items.find((entry) => entry.itemId === row.itemId);
    if (!item) throw new ApiError('NOT_FOUND');
    const [[grade], [attempt], numbers] = await Promise.all([
      this.db
        .select()
        .from(responseGrades)
        .where(
          and(eq(responseGrades.attemptId, row.attemptId), eq(responseGrades.itemId, item.itemId)),
        ),
      this.source.loadSubmitted([row.attemptId]),
      this.source.displayNumbers([row.attemptId]),
    ]);
    return {
      ...base,
      item: {
        no: item.no,
        seenAs: numbers.get(row.attemptId)?.get(item.itemId) ?? null,
        type: item.type,
        points: item.points,
        stem: item.stem,
        payload: item.payload,
      },
      answer: attempt?.responses.get(item.itemId) ?? null,
      grade: grade
        ? {
            score: grade.score === null ? null : Number(grade.score),
            verdict: grade.verdict,
            source: grade.source,
            feedback: grade.feedback,
          }
        : null,
    };
  }

  /** Xử lý một Phúc khảo: trả lời bắt buộc, kèm điểm mới của câu hoặc Mức xử lý mới (giữ nguyên thì gửi lại giá trị cũ). */
  async resolve(actor: Actor, sessionId: string, appealId: string, request: ResolveAppealRequest) {
    const { info } = await this.access.require(actor.id, sessionId);
    const [pre] = await this.db
      .select()
      .from(appeals)
      .where(and(eq(appeals.id, appealId), eq(appeals.sessionId, sessionId)));
    if (!pre) throw new ApiError('NOT_FOUND');

    // Đúng loại yêu cầu cho đối tượng: câu cần điểm, Mức xử lý cần mức mới.
    if (pre.target === 'response' ? !('score' in request) : !('penalty' in request)) {
      throw validationFailed(pre.target === 'response' ? 'score' : 'penalty', 'required');
    }
    let points = 0;
    if (pre.target === 'response') {
      const content = await this.content.contentOf(info.examId);
      const item = content ? itemsOf(content).find((entry) => entry.itemId === pre.itemId) : null;
      if (!item) throw new ApiError('NOT_FOUND');
      points = item.points;
      if ('score' in request && toCenti(request.score) > toCenti(points)) {
        throw validationFailed('score', 'score_above_max');
      }
    }

    const resolved = await this.db.transaction(async (tx) => {
      // Phúc khảo nối đuôi với job Chốt và gia hạn; 409 nếu đã Chốt.
      await this.status.lockForAppeal(tx, sessionId);
      const [row] = await tx
        .select()
        .from(appeals)
        .where(and(eq(appeals.id, appealId), eq(appeals.sessionId, sessionId)))
        .for('update');
      if (!row) throw new ApiError('NOT_FOUND');
      if (row.status !== 'open')
        throw new ApiError('INVALID_STATE', { reason: 'ALREADY_RESOLVED' });
      const now = this.clock.now();

      let previous: Record<string, unknown>;
      let next: Record<string, unknown>;
      if (row.target === 'response' && 'score' in request && row.itemId) {
        const [before] = await tx
          .select()
          .from(responseGrades)
          .where(
            and(eq(responseGrades.attemptId, row.attemptId), eq(responseGrades.itemId, row.itemId)),
          )
          .for('update');
        if (!before) throw new ApiError('INVALID_STATE', { reason: 'NOT_GRADED_YET' });
        const score = fromCenti(toCenti(request.score));
        // Câu bỏ trống giữ nhãn "bỏ trống" khi vẫn 0 điểm; còn lại suy ra từ điểm như chấm tay.
        const verdict =
          before.verdict === 'blank' && score === 0 ? 'blank' : verdictOfScore(score, points);
        await tx
          .update(responseGrades)
          .set({
            score: score.toFixed(2),
            verdict,
            source: 'appeal',
            gradedBy: actor.id,
            gradedAt: now,
          })
          .where(
            and(eq(responseGrades.attemptId, row.attemptId), eq(responseGrades.itemId, row.itemId)),
          );
        previous = {
          score: before.score === null ? null : Number(before.score),
          verdict: before.verdict,
        };
        next = { score, verdict };
      } else if (row.target === 'penalty' && 'penalty' in request && row.violationId) {
        const [before] = (await this.violations.listForUser(sessionId, row.userId, tx)).filter(
          (v) => v.id === row.violationId,
        );
        if (!before) throw new ApiError('NOT_FOUND');
        const after = await this.violations.setPenalty(
          sessionId,
          before.id,
          request.penalty.type === 'percent'
            ? { type: 'percent', percent: request.penalty.percent }
            : { type: request.penalty.type },
          now,
          tx,
        );
        if (!after) throw new ApiError('NOT_FOUND');
        previous = { type: before.penaltyType, percent: before.penaltyPercent };
        next = { type: after.penaltyType, percent: after.penaltyPercent };
      } else {
        throw new ApiError('VALIDATION_FAILED');
      }

      const [updated] = await tx
        .update(appeals)
        .set({
          status: 'resolved',
          previousValue: previous,
          newValue: next,
          resolverId: actor.id,
          response: request.response,
          resolvedAt: now,
        })
        .where(eq(appeals.id, appealId))
        .returning();
      if (!updated) throw new ApiError('NOT_FOUND');
      await this.audit.record(
        {
          actor,
          action: 'appeal.resolved',
          entityType: 'session',
          entityId: sessionId,
          before: { appealId, ...previous },
          after: { appealId, ...next },
        },
        tx,
      );
      await this.notifications.notify(
        {
          userIds: [row.userId],
          type: 'appeal.resolved',
          data: { sessionId, title: info.title, appealId, target: row.target },
        },
        tx,
      );
      // Hết Phúc khảo chờ: xóa dấu "có Phúc khảo mới" (và nhắc quá hạn) trên chuông của Người ra đề.
      const [open] = await tx
        .select({ total: count() })
        .from(appeals)
        .where(and(eq(appeals.sessionId, sessionId), eq(appeals.status, 'open')));
      if ((open?.total ?? 0) === 0) {
        const staff = await this.access.staffIds(info);
        for (const type of ['appeal.new', 'appeal.overdue']) {
          await this.notifications.clearUnread({ userIds: staff, type, sessionId }, tx);
        }
      }
      return updated;
    });

    // Phúc khảo cuối cùng sau hạn: Chốt ngay, không chờ lượt quét kế tiếp (Q301).
    await this.finalize.tryFinalize(sessionId);
    this.realtime.sessionChanged(sessionId);
    return {
      id: resolved.id,
      status: resolved.status,
      response: resolved.response,
      previousValue: resolved.previousValue,
      newValue: resolved.newValue,
      resolvedAt: resolved.resolvedAt,
    };
  }
}

const emptyList = () => ({ open: 0, resolved: 0, items: [] as never[] });
